import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './native'

// Small secrets (AI API keys) kept on this device only — never in settings,
// never synced to GitHub, never logged.
//
// In the App Store app they go in the iOS Keychain (ios/App/App/SlateSecrets.swift):
// stays on this device, left out of backups and iCloud Keychain. iOS keeps Keychain
// items after the app is deleted, so the plugin clears them itself on the first
// launch after an install, and removeAllSecrets() reaches keys whose names this
// page no longer knows.
// On the website the browser has no keychain a page can use, so they live in
// this site's localStorage on this device.

const PREFIX = 'slate.secret.'

interface NativeSecrets {
  get(o: { key: string }): Promise<{ value: string | null }>
  set(o: { key: string; value: string }): Promise<void>
  remove(o: { key: string }): Promise<void>
  removeAll(): Promise<void>
}
const native = isNativeApp ? registerPlugin<NativeSecrets>('SlateSecrets') : null

// The Keychain plugin checks the same limit; checking here too gives the same error everywhere.
function checkKey(key: string) {
  if (!key || key.length > 128) throw new Error('A secret needs a short name.')
}

/** The saved secret, or null when there isn't one (or it can't be read). */
export async function getSecret(key: string): Promise<string | null> {
  try {
    checkKey(key)
    if (native) return (await native.get({ key })).value ?? null
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

/** Saves a secret on this device. Throws when it can't, so the caller can say so. */
export async function setSecret(key: string, value: string): Promise<void> {
  checkKey(key)
  if (native) return native.set({ key, value })
  localStorage.setItem(PREFIX + key, value)
}

export async function removeSecret(key: string): Promise<void> {
  try {
    checkKey(key)
    if (native) await native.remove({ key })
    else localStorage.removeItem(PREFIX + key)
  } catch {
    /* already gone, or nothing to remove */
  }
}

/** Forgets every secret Slate saved on this device (Reset this device, Remove all keys). */
export async function removeAllSecrets(): Promise<void> {
  try {
    if (native) {
      await native.removeAll()
      return
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k)
    }
  } catch {
    /* nothing to remove, or storage is blocked */
  }
}
