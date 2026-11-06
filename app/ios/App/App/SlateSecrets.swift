import Capacitor
import Security

/// Small secrets kept in the iOS Keychain (src/lib/secrets.ts) — the AI API keys
/// people paste into Settings → AI.
///
/// Unlike the encrypted-page passphrase, these don't wait on Face ID: the AI
/// needs its key every time you ask something. They're readable once the device
/// has been unlocked after a restart and stay on this device (never in backups or
/// iCloud Keychain).
///
/// iOS does NOT delete Keychain items when the app is deleted, so a key would
/// outlive Slate and quietly come back on a reinstall. The plugin clears its own
/// items on the first launch after an install (see `load()`), and `removeAll`
/// lets Reset this device wipe every key, including ones the page no longer
/// knows the name of.
@objc(SlateSecretsPlugin)
public class SlateSecretsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SlateSecretsPlugin"
    public let jsName = "SlateSecrets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeAll", returnType: CAPPluginReturnPromise),
    ]

    // One Keychain "service" for all of them; each secret's name is the account.
    private let service = "Slate secrets"
    // Generous for an API key, small enough that the page can't fill the Keychain.
    private let maxNameLength = 128
    private let maxValueBytes = 16 * 1024
    // Set once the Keychain has been cleared for this install. It lives in
    // UserDefaults, which iOS deletes with the app, so it's missing again after a
    // reinstall even though the Keychain items aren't.
    private let installedFlag = "SlateSecrets.clearedForThisInstall"

    /// Runs when the plugin is registered, before the page loads, so the page can
    /// never read a key left behind by a copy of Slate that was deleted.
    ///
    /// This is the first build that keeps anything under this service, so nobody
    /// updating from an older build loses a key they saved.
    override public func load() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: installedFlag) else { return }
        // The Face ID passphrase (SlateBiometric.swift) outlives a deletion the same
        // way, and its "turned on" flag in the page's storage doesn't, so clear it too.
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "Slate encrypted pages",
        ] as CFDictionary)
        let status = deleteAll()
        // Only remember it worked; otherwise try again next launch.
        if status == errSecSuccess || status == errSecItemNotFound {
            defaults.set(true, forKey: installedFlag)
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let name = secretName(call) else { return }
        var query = baseQuery(name)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            if let data = item as? Data, let value = String(data: data, encoding: .utf8) {
                call.resolve(["value": value])
            } else {
                call.resolve(["value": NSNull()])
            }
        case errSecItemNotFound:
            call.resolve(["value": NSNull()])
        default:
            call.reject("Couldn’t read the Keychain (\(status)).")
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let name = secretName(call) else { return }
        guard let value = call.getString("value"), let data = value.data(using: .utf8) else {
            call.reject("Nothing to save.")
            return
        }
        guard data.count <= maxValueBytes else {
            call.reject("That’s too long to keep in the Keychain.")
            return
        }
        // Update in place when it's already there, so a failed save never loses the old key.
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(baseQuery(name) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var query = baseQuery(name)
            query.merge(attributes) { _, new in new }
            status = SecItemAdd(query as CFDictionary, nil)
        }
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Couldn’t save to the Keychain (\(status)).")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let name = secretName(call) else { return }
        let status = SecItemDelete(baseQuery(name) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("Couldn’t remove it from the Keychain (\(status)).")
        }
    }

    /// Forgets every secret Slate saved, whatever its name (Reset this device).
    @objc func removeAll(_ call: CAPPluginCall) {
        let status = deleteAll()
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("Couldn’t clear the Keychain (\(status)).")
        }
    }

    /// Deletes every item under Slate's service. Leaving out the account matches all
    /// of them, and on iOS SecItemDelete removes every match, not just the first.
    private func deleteAll() -> OSStatus {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        return SecItemDelete(query as CFDictionary)
    }

    /// The secret's name from the page, checked before it goes anywhere near the Keychain.
    private func secretName(_ call: CAPPluginCall) -> String? {
        guard let key = call.getString("key"), !key.isEmpty, key.count <= maxNameLength else {
            call.reject("That secret needs a name.")
            return nil
        }
        return key
    }

    private func baseQuery(_ name: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: name,
        ]
    }
}
