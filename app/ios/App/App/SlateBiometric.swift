import Capacitor
import LocalAuthentication
import Security
import UIKit

/// The app's web view, with Slate's own native bits registered.
class SlateViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SlateBiometricPlugin())
        bridge?.registerPluginInstance(SlateSecretsPlugin())
    }
}

/// Face ID / Touch ID unlock for encrypted pages (src/lib/biometric.ts).
///
/// The passphrase is kept in the Keychain behind the device's own lock: it only
/// comes out after Face ID, Touch ID or the passcode, it stays on this device
/// (never in backups or iCloud Keychain), and it's wiped if the passcode is removed.
@objc(SlateBiometricPlugin)
public class SlateBiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SlateBiometricPlugin"
    public let jsName = "SlateBiometric"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private let service = "Slate encrypted pages"
    private let account = "passphrase"

    @objc func available(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let ok = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        var kind = "none"
        if ok {
            switch context.biometryType {
            case .faceID: kind = "faceID"
            case .touchID: kind = "touchID"
            case .opticID: kind = "opticID"
            default: kind = "passcode"
            }
        }
        call.resolve(["available": ok, "kind": kind])
    }

    @objc func save(_ call: CAPPluginCall) {
        guard let secret = call.getString("secret"), let data = secret.data(using: .utf8) else {
            call.reject("Nothing to save.")
            return
        }
        guard let access = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, nil
        ) else {
            call.reject("This device needs a passcode before it can unlock with Face ID.")
            return
        }
        SecItemDelete(baseQuery() as CFDictionary)
        var query = baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessControl as String] = access
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Couldn’t save to the Keychain (\(status)). Set a device passcode and try again.")
        }
    }

    @objc func load(_ call: CAPPluginCall) {
        let context = LAContext()
        context.localizedReason = call.getString("reason") ?? "Unlock your encrypted pages"
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecUseAuthenticationContext as String] = context
        // The Keychain read waits on the Face ID prompt, so keep it off the main thread.
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            var item: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &item)
            switch status {
            case errSecSuccess:
                if let data = item as? Data, let secret = String(data: data, encoding: .utf8) {
                    call.resolve(["secret": secret])
                } else {
                    call.reject("The saved passphrase couldn’t be read. Turn Face ID unlock off and on again.")
                }
            case errSecUserCanceled:
                call.reject("Cancelled.", "CANCELLED")
            case errSecItemNotFound:
                call.reject("Face ID unlock needs setting up again — use your passphrase this time.")
            default:
                call.reject("Couldn’t unlock (\(status)). Use your passphrase this time.")
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        SecItemDelete(baseQuery() as CFDictionary)
        call.resolve()
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
