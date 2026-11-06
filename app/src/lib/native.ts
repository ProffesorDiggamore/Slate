import { Capacitor } from '@capacitor/core'

/** True inside the App Store app (iPhone, iPad, or an iPad app on a Mac) rather than a browser. */
export const isNativeApp = Capacitor.isNativePlatform()

/** The privacy page. The app has no web server of its own to open it from, so it links to the website's copy. */
export const PRIVACY_URL = isNativeApp ? 'https://slatenotes.netlify.app/privacy.html' : '/privacy.html'

/**
 * The AI services the website is allowed to talk to. The website's privacy lock
 * (Content-Security-Policy in netlify.toml) makes the browser refuse every other
 * address, so a custom AI address outside this list only works in the App Store
 * app. Keep this list and netlify.toml's connect-src in step.
 *
 * Remote hosts are https only. localhost and 127.0.0.1 (Ollama, LM Studio on
 * this computer) are allowed over http on any port.
 */
export const WEB_ALLOWED_AI_HOSTS: string[] = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.groq.com',
  'api.mistral.ai',
  'api.deepseek.com',
  'api.x.ai',
  'localhost',
  '127.0.0.1',
]
