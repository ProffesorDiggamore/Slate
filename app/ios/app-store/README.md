# Putting Slate on the App Store

The App Store app is the same Slate as the website, bundled inside a native app. There's no server: notes live
on the device and, if the person turns on sync, in their own private GitHub repo. One build covers iPhone, iPad
and Apple-silicon Macs (Macs run it as the iPad app).

- Bundle ID: `io.github.proffesordiggamore.slate`. You can change it in `app/capacitor.config.ts` **and**
  Xcode → App target → Signing & Capabilities, but only before the first upload. After that it's permanent.
- Version 1.0 (build 1). Raise **Build** in Xcode → App target → General for every upload, and raise
  **Version** for every release.
- Minimum: iOS / iPadOS 17.
- App icon: `app/ios/App/App/AppIcon.icon`, an Icon Composer file (open it in Xcode → Open Developer Tool →
  Icon Composer). The three slabs are a Liquid Glass layer on a soft white background, with a near-black
  background in dark mode. Xcode 26 or later builds it into the Liquid Glass icon on iOS 26+ and flat
  light / dark / tinted images for iOS 17–18 — no PNGs to keep up to date.

## 1. Build it

```bash
cd app
npm install
npm run build:ios     # builds the app copy (no service worker, no Google sign-in) and copies it into ios/
npm run open:ios      # opens Xcode
```

Run `npm run build:ios` again after any change to the app code, before archiving.

## 2. Sign it (first time only)

In Xcode, click **App** (blue icon, top of the left sidebar) → **App** target → **Signing & Capabilities**:

1. Tick **Automatically manage signing**.
2. **Team**: pick your Apple Developer team. If it's not listed, use Xcode → Settings → Accounts → **+** to sign in.

## 3. Create the app in App Store Connect (first time only)

<https://appstoreconnect.apple.com> → **Apps** → **+** → **New App**:

- Platforms: **iOS**
- Name: **Slate** (if it's taken, try **Slate Notes** or **Slate — Markdown Notes**)
- Primary language: English (U.S.)
- Bundle ID: `io.github.proffesordiggamore.slate` (Xcode registers it on the first archive, or add it under
  Certificates, Identifiers & Profiles → Identifiers)
- SKU: `slate-ios`
- User access: Full Access

## 4. Upload

In Xcode: set the run destination to **Any iOS Device (arm64)** → **Product → Archive**. When the Organizer opens:
**Distribute App → App Store Connect → Distribute**. The build shows up in App Store Connect after 10–30 minutes.

## 5. Fill in the listing

Paste from below. Screenshots are in `screenshots/` (6.9" iPhone and 13" iPad sizes, which App Store Connect
scales down for the smaller sizes). They must match the build you submit (guideline 2.3.3), so retake them from
that build whenever the design changes, on the 6.9" iPhone and 13" iPad simulators. Include one of the AI
assistant answering a question, since the description promotes it.

| Field | Value |
| --- | --- |
| Subtitle | Notion-style notes you own |
| Category | Productivity (secondary: Utilities) |
| Price | Free |
| Privacy Policy URL | https://slatenotes.netlify.app/privacy.html |
| Support URL | https://github.com/ProffesorDiggamore/Slate/issues |
| Marketing URL | https://slatenotes.netlify.app |
| Copyright | 2026 Landon Upchurch |
| Age rating | Not "No" to everything: the AI assistant shows whatever the person's chosen model writes, from any service or their own server, and Slate doesn't filter it. Answer the lowest level above None (Infrequent / Mild) for profanity or crude humour, mature or suggestive themes, and sexual content or nudity; "No" to the rest. That gives 13+ or higher; use whatever App Store Connect works out. A 4+ rating on an open AI chat gets flagged under guideline 2.3.6. |
| Keywords | notes,markdown,notion,obsidian,github,journal,todo,tasks,wiki,outliner,private,encrypted |

**Promotional text**

> Free, private notes with a Notion-style editor. Every page is a plain Markdown file, synced through your own GitHub.

**Description**

> Slate is a calm place for your notes. It feels like Notion — type / for headings, to-dos, toggles, callouts, tables and code; drag blocks around; select text to format it — but every page is a plain Markdown file you own, just like Obsidian.
>
> NO ACCOUNT, NO SERVER, NO TRACKING
> Slate has no sign-up and no analytics. Your notes stay on your device. If you want them on all your devices, Slate syncs with a free private GitHub repository that you own — nobody else can see them, including us.
>
> EVERYTHING YOU NEED
> • A Notion-style block editor with slash commands and drag handles
> • Tasks from every page in one list: Overdue, Today, Upcoming
> • Templates, properties, and any folder as a table
> • [[Links]] between pages, backlinks, and a graph of how your notes connect
> • Encrypted pages, unlocked with Face ID or Touch ID
> • Version history when sync is on
> • Your own icons: emoji, or make one from shapes, colours and pixel art
> • Light and dark themes, six palettes, any accent colour, four fonts
> • An optional AI assistant: bring your own key for ChatGPT, Claude, Gemini and more, and ask about your notes or have it tidy up your writing
>
> YOURS FOR GOOD
> Every page is a normal Markdown file, so your notes also open in Obsidian or any text editor. Slate is free and open source under the MIT license.

**App Privacy** (App Store Connect → App Privacy): choose **"Data Not Collected"**. Slate never sends anything to
you; GitHub sync goes straight from the device to the person's own repo with a token they create.

The AI assistant doesn't change that answer. It's off until the person adds their own API key, and then each
message goes straight from the device to the AI service they picked (OpenAI, Anthropic, Google, OpenRouter,
Groq, Mistral, DeepSeek, xAI, or a model on their own computer), under their own account with that service.
There is no Slate server in between, no Slate account with any AI service, and you can't see any of it — the
same as GitHub sync. The key is kept in the iOS Keychain on that device only. If Apple ever asks you to declare it
anyway, the honest extra answer is **User Content → Other User Content**: not linked to identity, not used for
tracking, purpose **App Functionality**.

**AI rules** (guideline 5.1.2(i)): before the first message to each AI service the app asks for permission, names
the service, and says what will be sent (the message and anything attached). Nothing goes to an AI service in the
background, and encrypted pages are never sent. The privacy policy has an "AI assistant" section.

**Export compliance**: already answered in the app (`ITSAppUsesNonExemptEncryption = NO`) — encrypted pages use
standard encryption built into iOS, which is exempt. App Store Connect won't ask.

**App Review → Notes** (App Store Connect → the version → **App Review Information → Notes**; paste this so the
reviewer doesn't get stuck on GitHub or the AI).

Apple has to be able to try every feature with what you give them (guideline 2.1), and a reviewer won't bring
their own AI key. So give them a test key:

1. Make a key just for App Review with a hard spending limit: an **OpenRouter** key with a credit limit of a few
   dollars (openrouter.ai/keys → Create key → set a credit limit), or a free-tier **Groq** key
   (console.groq.com/keys), which can't run up a bill.
2. Put the key **only** in App Store Connect → App Review Information → Notes, in place of `TEST-KEY` below.
   Never put it in this README or anywhere else in the repo: the repo is public. If you made a Groq key, change
   "choose OpenRouter" to "choose Other, then Groq".
3. Keep the key working until the build is approved, then delete it. Make a fresh one for each submission.

> No sign-in is needed. On the first screen tap "Start on this device". Every feature except the optional AI assistant works offline with no account and no key. GitHub sync is optional: it needs the person's own free GitHub account and a personal access token, which the app explains how to create in Settings → Sync. Encrypted pages: on iPhone tap Pages in the tab bar at the bottom (on iPad, use the sidebar), tap ••• next to a page → "Encrypt page…", and set a passphrase; the app then offers Face ID unlock.
>
> The AI assistant is optional and the rest of the app works fully without it. It uses the person's own API key from an AI service they choose (OpenAI, Anthropic, Google Gemini, OpenRouter and others), entered in Settings → AI; Slate doesn't sell or provide AI access and has no server. Requests go directly from the device to that service, only when the person sends a message, and only after they've allowed it in a permission prompt that names the service. Replies come from the model the person picked and aren't filtered by Slate, which is why the app isn't rated 4+.
>
> To try it with our test key: open Settings (in the tab bar on iPhone, in the sidebar on iPad) → AI, choose OpenRouter, paste this key: TEST-KEY and tap Save key. Then tap the orb in the middle of the tab bar (iPhone) or the "Ask Slate" card on Home (iPad), ask something, and tap Allow when it asks to send to the service. The key has a small spending limit and is only for this review.

Leave **Sign-in required** unticked.

## 6. Mac

In App Store Connect → **Pricing and Availability** → **iPhone and iPad Apps on Apple Silicon Macs**: keep
**Make this app available** ticked. Nothing else to build.

## 7. Submit

Pick the uploaded build under **Build**, then **Add for Review → Submit**. First reviews usually take 1–3 days.

## Good to know

- Google Calendar isn't in the app version: Google's browser sign-in needs a web address to return to, which an
  app doesn't have. The website still has it.
- Without sync, notes live only in the app's storage on that device, like any app. Deleting the app deletes them.
- The app's copy of the page carries its own privacy lock (a Content-Security-Policy tag added by `vite.config.ts`
  when building with `--mode native`): only the app's own scripts can run. Unlike the website, it lets the AI
  talk to any address, so a custom AI server works in the app. Plain-http AI on the same Mac (Ollama, LM Studio
  at `localhost`) is allowed by `NSAllowsLocalNetworking` in `Info.plist`; everything else must be https.
- Updates go out through the App Store: change code → `npm run build:ios` → raise Build → Archive → Distribute.
