import type { CapacitorConfig } from '@capacitor/cli'

// The App Store build: the same app as the website, bundled inside a native
// iPhone / iPad app (which also runs on Apple-silicon Macs). There's no server —
// the app loads from inside itself and only ever talks to GitHub.
const config: CapacitorConfig = {
  // Permanent once the first build is uploaded to App Store Connect.
  appId: 'io.github.proffesordiggamore.slate',
  appName: 'Slate',
  webDir: 'dist',
  ios: {
    // The page handles the notch and Home indicator itself (viewport-fit=cover + safe-area insets).
    contentInset: 'never',
    // No backgroundColor: Capacitor then uses the system background, which
    // follows dark mode. A fixed white flashed at launch and showed as a white
    // band at the keyboard's edge in dark mode.
    // Long-press link previews would open GitHub inside the app's own window.
    allowsLinkPreview: false,
    // The page scrolls its own panes; without this the whole app slides around under the keyboard.
    scrollEnabled: false,
  },
  plugins: {
    // Shrink the app above the keyboard, like the website's `interactive-widget=resizes-content`.
    Keyboard: { resize: 'native', resizeOnFullScreen: true },
  },
}

export default config
