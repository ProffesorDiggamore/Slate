import { Lock, LockOpen, ScanFace } from 'lucide-react'
import { useEffect, useState } from 'react'
import { faceIdAvailable, faceIdEnrolled, faceIdName, forgetFaceId } from '../lib/biometric'
import { lockNow, useLock } from '../lib/crypto'
import { useLockedPaths } from '../lib/hooks'
import { ensureUnlocked, turnOnFaceId } from './EncryptedNote'

// Settings → Data → Encrypted pages.

export function EncryptionSettings() {
  const count = useLockedPaths().size
  const unlocked = useLock((s) => !!s.keyring)
  const [canFace, setCanFace] = useState(false)
  const [faceOn, setFaceOn] = useState(faceIdEnrolled)
  useEffect(() => {
    void faceIdAvailable().then(setCanFace)
  }, [])
  return (
    <>
      <div className="danger-zone encryption-zone">
        <div>
          <strong>
            <Lock size={14} /> Encrypted pages
          </strong>
          <p className="muted small">
            {count
              ? `${count} encrypted page${count === 1 ? '' : 's'}. `
              : 'Encrypt a page from its ••• menu, or a whole folder from the folder’s menu. '}
            Their text is sealed with your passphrase before it’s saved or synced, so GitHub only ever stores ciphertext. Titles stay visible, and
            versions from before you encrypted stay in your GitHub history. A forgotten passphrase can’t be recovered.
          </p>
        </div>
        {unlocked ? (
          <button type="button" className="btn" onClick={lockNow}>
            <Lock size={15} /> Lock now
          </button>
        ) : (
          count > 0 && (
            <button type="button" className="btn" onClick={() => void ensureUnlocked('Unlock to read and edit your encrypted pages.')}>
              <LockOpen size={15} /> Unlock
            </button>
          )
        )}
      </div>
      {canFace && count > 0 && (
        <div className="danger-zone encryption-zone">
          <div>
            <strong>
              <ScanFace size={14} /> {faceIdName()} unlock
            </strong>
            <p className="muted small">
              {faceOn
                ? `On for this device. Your passphrase is kept sealed by a passkey that only opens with ${faceIdName()} or your device passcode.`
                : `Open encrypted pages with ${faceIdName()} or your device passcode instead of typing the passphrase. Set up once per device.`}
            </p>
          </div>
          {faceOn ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                forgetFaceId()
                setFaceOn(false)
              }}
            >
              Turn off
            </button>
          ) : unlocked ? (
            <button type="button" className="btn" onClick={() => void turnOnFaceId().then(setFaceOn)}>
              <ScanFace size={15} /> Turn on
            </button>
          ) : (
            <span className="muted small">Unlock first</span>
          )}
        </div>
      )}
    </>
  )
}
