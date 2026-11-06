// The App Store build has no service worker: the app ships inside itself and
// updates through the App Store, so registering one is a no-op there.
export function registerSW(_options?: unknown): (reload?: boolean) => Promise<void> {
  return async () => {}
}
