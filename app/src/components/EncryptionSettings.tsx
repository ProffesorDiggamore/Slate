import { Lock, LockOpen } from 'lucide-react'
import { lockNow, useLock } from '../lib/crypto'
import { useLockedPaths } from '../lib/hooks'
import { ensureUnlocked } from './EncryptedNote'

// Settings → Data → Encrypted pages.

export function EncryptionSettings() {
  const count = useLockedPaths().size
  const unlocked = useLock((s) => !!s.keyring)
  return (
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
  )
}
