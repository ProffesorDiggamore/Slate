# Slate

A note-taking app that feels like Notion and stores everything like Obsidian: every page is a plain
Markdown file in this GitHub repo. It runs on your Mac and your iPhone as an installed app, works offline,
and syncs automatically. It's free.

- **Notion-style editor:** type `/` for blocks (headings, to-dos, toggle lists, toggle headings, callouts,
  tables, code…), drag blocks with the handle, select text for the formatting toolbar.
- **Toggles:** a *Toggle list* hides text under an arrow; every heading has an arrow too, so a whole section
  folds away under its heading (⌘. folds the heading you're on, ⌘⌥T folds or opens them all).
- **Page icons:** pick an emoji, or make your own in *Make your own* — a symbol, letters, an emoji or a
  pixel drawing on a coloured shape — or upload a small picture.
- **Calendar:** the Calendar button shows your daily notes by month and the times written in them. Connect
  Google Calendar to see your events there too and add or delete them without leaving Slate — or skip it and
  use Google's event page or an .ics file for Apple Calendar.
- **Today on Home:** your Google events, the times in today's daily note and the to-dos due today, in one list.
  Click an event to open its **meeting note**, made from your Meeting template and linked to that event.
- **Tasks:** every `- [ ]` from every page on one page, grouped into Overdue, Today, Upcoming and No date. Give a
  to-do a date with `📅 2026-10-20` (Obsidian Tasks style), `/Due date`, or the date button; to-dos in a daily note
  are due that day. Check them off from Tasks or Home.
- **Templates:** pages in the `Templates` folder, with `{{date}}`, `{{time}}`, `{{title}}` and
  `{{date:dddd, MMMM D}}`. Insert one with `/Template`, make a new page from one, or start every daily note from one.
- **Properties and tables:** edit a page's frontmatter as properties (text, list, date, number, checkbox) under its
  title, or open any folder **as a table** — one row per page, one column per property, editable and sortable.
- **Version history:** every synced version of a page comes from your GitHub history; see what changed since and
  restore one.
- **Encrypted pages:** seal a page (or a whole folder) with a passphrase. GitHub and this device's storage only ever
  hold ciphertext (AES-256-GCM, PBKDF2-SHA256 600k). The passphrase is never stored and can't be recovered.
  Turn on **Face ID / Touch ID unlock** per device (iOS / macOS 18+): a passkey seals the passphrase so it only
  opens with your face, finger or device passcode.
- **Folder icons:** the same icon maker as pages, from a folder's menu (saved on each device).
- **Little clocks:** times you type, like `Math 1-3` or `2:30pm`, get a tiny clock; click it to put that line
  on your calendar.
- **Screenshots:** paste a screenshot (⌘⇧⌃4) or drop a picture straight into a page.
- **Themes:** six colour palettes in light and dark, any accent colour, four fonts, text size, spacing and
  page width.
- **Obsidian-style vault:** `[[wikilinks]]` with autocomplete, backlinks, a graph view, folders,
  `> [!note]` callouts, `==highlights==`, tags, daily notes. The files stay normal Markdown you can open
  in Obsidian or any editor.
- **Automatic sync:** notes save on the device instantly, then sync with this repo a few seconds after you
  stop typing, when you open the app, and every 30 seconds. Edits made on two devices are merged line by
  line. If the same line was changed on both, your copy is kept as a separate "(conflict …)" page so
  nothing is lost.

The app's code lives in this `app/` folder. **Keep your notes in a separate private repo** (for example
`slate-notes`) — not in this one. That way app updates and notes never mix, and nothing private can end up
in the website build. Slate ignores `app/` (and anything starting with `.`) when it reads notes, so an
old setup that synced into this repo still works, but see *Moving your notes out of this repo* below.

## Privacy

Slate has no server, no accounts and no analytics. Each person's notes live in their own browser and their own
GitHub repo, so many people can use the same Slate website and nobody — including whoever hosts it — can see
anyone else's notes. `netlify.toml` sets a Content-Security-Policy that lets the page talk only to GitHub's API and,
for people who connect it, Google's Calendar API; the browser blocks everything else. Google Calendar data goes
straight from Google to the browser and is only kept in memory. The full policy is [`public/privacy.html`](public/privacy.html)
(served at `/privacy.html`).

---

## Put it online (one time, about 5 minutes, free)

Your phone needs a web address to install the app from. Netlify hosts it free, straight from your GitHub copy
of this repo. Your notes are never part of the website: the site is only the app, and it reads your notes from
GitHub with a token that stays on each of your devices.

1. Make sure this repo's latest code is on `main` (it is, unless you're testing a branch).
2. **Make a free Netlify account** at <https://app.netlify.com/signup> and choose **Sign up with GitHub**.
   No credit card needed.
3. Click **Add new project → Import an existing project → GitHub**, allow access, and pick your copy of the
   **Slate** repo (fork it first if it isn't yours).
4. Netlify reads the settings from `netlify.toml` in the repo, so you'll see *Base directory* `app`,
   *Build command* `npm run build` and *Publish directory* `app/dist` already filled in. Don't change
   anything; just click **Deploy**.
5. After about a minute you get a link like `https://wonderful-pebble-123.netlify.app`. That's your app.
   To pick a nicer name, open **Project configuration → Change project name** (for example
   `my-slate` → `https://my-slate.netlify.app`).

`netlify.toml` tells Netlify to skip the build when a commit doesn't change anything in `app/`, so an old
setup that still syncs notes into this repo never uses up your free plan.

## Turn on Google Calendar (optional, once, for whoever hosts the site)

Google needs to know which website is asking. You make a free *client ID* once; everyone who uses your site then
connects their own Google account with one click. The ID isn't a secret — it only works from your site's address.

1. Open <https://console.cloud.google.com/>, create a project (e.g. `Slate`).
2. **APIs & Services → Library →** search **Google Calendar API → Enable**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform): app name `Slate`, your support email,
   **Audience: External**. Under **Data access** add the scopes
   `.../auth/calendar.calendarlist.readonly` and `.../auth/calendar.events`. Under **Branding** set the home page
   to your site and the privacy policy to `https://YOUR-SITE.netlify.app/privacy.html`.
4. **Clients → Create client → Web application.**
   - Authorized JavaScript origins: `https://YOUR-SITE.netlify.app` (and `http://localhost:5173` for development)
   - Authorized redirect URIs: `https://YOUR-SITE.netlify.app/oauth-google.html`
     (and `http://localhost:5173/oauth-google.html`)
5. Copy the client ID (`…apps.googleusercontent.com`). In Netlify: **Project configuration → Environment
   variables → Add** `VITE_GOOGLE_CLIENT_ID` = that ID, then **Deploys → Trigger deploy**.
6. While the app is in **Testing**, only people you add under **Audience → Test users** (up to 100) can connect.
   To open it to everyone, press **Publish app**. Until Google verifies it (free; they review the privacy page and
   a short screen recording of the Calendar feature), people see an "unverified app" warning and the app is
   capped at 100 users.

Without a client ID the Calendar still works the old way: Google's event page or an .ics file.

## Install it on your devices

**Mac (Safari):** open your link, then in the menu bar choose **File → Add to Dock…** → **Add**. Slate now
opens in its own window from the Dock, Launchpad and Spotlight, like a normal app. Safari bakes web-app icons
onto a white square, which sticks out in a dark, clear or tinted Dock. On macOS 26 or later, double-click
[`mac/apply-dock-icon.command`](../mac/apply-dock-icon.command): it swaps in a see-through layered icon that
takes on your Dock's style (no Xcode needed; re-run it if you ever re-add Slate to the Dock).
*(Chrome or Edge also work: click the install icon at the right end of the address bar.)*

**iPhone (Safari):** open your link, tap **Share** (on newer iOS it's inside the **•••** menu), choose
**Add to Home Screen**, keep **Open as Web App** on, and tap **Add**.

Apple charges $99/year to put apps in the App Store, and free developer installs expire every 7 days.
Installing from Safari like this costs nothing and never expires.

## Turn on sync (once per device)

1. **Make a notes repo (once).** Go to <https://github.com/new>, name it `slate-notes` (any name works), choose **Private**,
   and click **Create repository**. This repo holds only your notes — never use the app repo for them.
2. Create a token at <https://github.com/settings/personal-access-tokens/new>:
   - Name: `Slate`, any expiration (paste a new one when it runs out)
   - **Repository access → Only select repositories →** `your-name/slate-notes`
   - **Permissions → Repository permissions → Contents → Read and write**
3. In Slate open **Settings → Sync**, enter `your-name/slate-notes`, leave the branch and folder
   empty, paste the token and press **Connect**.

The token is stored only on that device. It's sent to GitHub and nowhere else. Slate warns you before
connecting to a **public** repo or to a repo that contains app code.

**Want notes inside a bigger repo anyway?** Fill in *Folder in the repo* (for example `notes`) and Slate
reads and writes only that folder.

## Moving your notes out of this repo

If you first set Slate up to sync into this app repo:

1. Create the private `slate-notes` repo and a token for it (steps 1–2 above).
2. On one device that has all your notes, open **Settings → Sync → Change repo or token**, enter
   `your-name/slate-notes` and press **Save**. Slate copies every note on that device into the new
   repo.
3. On your other devices, do the same — they'll pull the notes from the new repo.
4. Check the new repo on GitHub, then delete the old `.md` files from this repo yourself (GitHub keeps them
   in history, so treat anything sensitive that was ever here — like passwords — as seen, and change it).

---

## For developers

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # markdown, sync engine and vault tests
npm run typecheck
npm run build      # production build in dist/ (with offline service worker)
```

To try Google Calendar locally, put `VITE_GOOGLE_CLIENT_ID=…` in `app/.env.local` (see `.env.example`).

Stack: React 19, TipTap 3 (ProseMirror), Vite 8, vite-plugin-pwa, zustand, IndexedDB.

| Path | What it does |
| --- | --- |
| `src/lib/markdown/` | Markdown ⇄ editor document conversion (Obsidian flavour), round-trip tested |
| `src/lib/sync/` | GitHub sync over the Git Data API: one commit per sync, 3-way line merge, conflict copies |
| `src/lib/vault.ts` | Notes in memory + IndexedDB: create, rename (rewrites `[[links]]`), move, trash |
| `src/lib/tasks.ts`, `taskIndex.ts` | Tasks across the vault: parsing, due dates, in-place edits |
| `src/lib/templates.ts` | Template placeholders and date formats |
| `src/lib/properties.ts` | Frontmatter properties, edited one key at a time |
| `src/lib/crypto.ts` | Encrypted pages (WebCrypto) |
| `src/lib/google/` | Google Calendar: sign-in without a server (`auth.ts`, `/oauth-google.html`), Calendar API, in-memory events |
| `src/editor/` | The editor: slash menu, `[[` autocomplete, toolbars, drag handle, callouts, code blocks |
| `src/components/` | App shell: sidebar, pages, search palette, graph, settings, onboarding |
