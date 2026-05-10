# Desktop app — handoff plan

**Status:** Paused. Awaiting trigger from the user.
**Created:** 2026-05-09 (during a planning session with Claude)
**Decided:** Wrap Plixiele as a **Tauri** desktop app (Windows + Mac), distributed via a **download landing page** on the existing site.

---

## Trigger phrase

The user will say something like **"start the desktop app"** / **"do the Tauri thing"** / **"wrap Plixiele for desktop"**. When you see that, read this whole file before acting and follow the phases below in order.

If they just say "what's left to ship" again, mention this is paused — don't auto-start it.

---

## Decisions already made (do NOT re-litigate)

- **Framework: Tauri** (not Electron). Reason: 3D app, smaller installer (~10MB vs 150MB) and lower memory matter. User accepted the Rust-toolchain tradeoff.
- **Distribution: direct download from a launcher page.** No app stores. The user wants a landing/launcher page on the existing site (Firebase Hosting) with OS-detected Download buttons that fetch the installer. Not a separate website, not stores.
- **Auth path is safe.** Codebase uses email/password Firebase Auth with verification (see `src/lib/firebaseAuth.js`). No `signInWithPopup` / `GoogleAuthProvider` anywhere — verified 2026-05-09. So Tauri's webview will not have OAuth-popup issues.
- **AI calls already go through Cloud Functions over HTTPS** — same code path works in the desktop wrapper without changes.
- **Mac builds deferred** if user is Windows-only. Don't try to cross-compile macOS from Windows; either skip Mac for v1 or set up GitHub Actions with a Mac runner later.

---

## Prereqs the user must install first

Run these checks before doing any Tauri work. If either is missing, stop and tell the user to install before continuing — don't try to scaffold around missing tooling.

```sh
rustc --version    # must succeed
cargo --version    # must succeed
where cl.exe       # Windows: must point to a real MSVC cl.exe (not git's link.exe)
```

If missing:

1. **Microsoft C++ Build Tools** — https://visualstudio.microsoft.com/visual-cpp-build-tools/ — workload: "Desktop development with C++". ~6 GB.
2. **Rust via rustup** — https://rustup.rs/ — installs `rustc` and `cargo`. ~5 min after C++ tools are done.

WebView2 is built into Windows 11, so no separate install needed there.

---

## Phase A — Scaffold (me, ~30 min)

Run from project root (`C:\Users\TheSa\GameDev\Plixiele`):

```sh
npm install --save-dev @tauri-apps/cli
npx tauri init
```

Answer the `tauri init` prompts:
- App name: `Plixiele`
- Window title: `Plixiele`
- Web assets location: `../dist` (Vite's default build output)
- Dev server URL: `http://localhost:5173` (Vite default)
- Frontend dev command: `npm run dev`
- Frontend build command: `npm run build`

After scaffold, `src-tauri/` will exist. Edit `src-tauri/tauri.conf.json`:
- `productName`: `Plixiele`
- `identifier`: `com.plixiele.desktop`
- `windows[0].width: 1280, height: 800, minWidth: 900, minHeight: 600, title: "Plixiele"`
- Allow remote URLs the app already calls: Firebase Hosting `*.web.app`, `*.firebaseapp.com`, Cloud Functions `*.cloudfunctions.net`, Stripe checkout, Anthropic, Gemini. Set CSP in `tauri.conf.json` accordingly.

Add scripts to root `package.json`:
```json
"tauri:dev": "tauri dev",
"tauri:build": "tauri build"
```

Update `.gitignore` to ignore `src-tauri/target/` and `src-tauri/gen/`.

## Phase B — Smoke test (user + me, ~15 min)

```sh
npm run tauri:dev
```

Verify in the Tauri window:
1. App loads, sidebar renders.
2. Sign in with email/password works.
3. Generate a 3D model — confirms AI proxy calls work over HTTPS.
4. Open Pricing → confirm Firestore subscription/products read works.
5. Sign out and back in to confirm `setPersistence(browserLocalPersistence)` survives an app restart (Tauri webview has its own storage — should be fine but verify).

Common things to fix if step 2 or 3 fails:
- CSP too tight in `tauri.conf.json` — loosen `connect-src` to allow the actual hosts.
- CORS — Cloud Functions `ALLOWED_ORIGINS` (in `functions/index.js:35`) currently allows `localhost:5173-5175` and `*.web.app`. Tauri dev mode loads from `http://localhost:5173` (dev) or `tauri://localhost` (prod). For prod, add `tauri://localhost` to `ALLOWED_ORIGINS` and redeploy functions.

## Phase C — Polish (me, ~1 hour)

- Generate icon set from a source PNG (Tauri has `tauri icon path/to/source.png`). User to provide source if they have one; otherwise use the existing favicon as a placeholder.
- Window config: title bar style, default size, minimum size, theme (match dark theme of the web app).
- Disable devtools in release build.
- Build: `npm run tauri:build` produces `.msi` and `.exe` in `src-tauri/target/release/bundle/`.

## Phase D — Landing page (me, ~30 min)

Add a `/download` route to the existing React app (or a new tab in `App.jsx`'s overlay system, similar to `PricingPage`/`LegalPage`). Page contents:
- OS detection from `navigator.userAgent` / `navigator.platform`.
- Big primary button for the detected OS, smaller secondary button for the other.
- Buttons link to installer URLs (TBD — initially can be hosted in Firebase Storage or a static path under `public/`).
- Note about unsigned warnings until code signing is set up.

Add a sidebar entry "Get the desktop app" that opens the new overlay.

## Phase E — Deferred (do not start without explicit user request)

- Apple Developer account ($99/yr) + macOS code signing + notarization.
- Windows code signing cert (~$0–500/yr, EV cert recommended for instant SmartScreen pass).
- Auto-updater via Tauri's built-in updater plugin — requires hosting `latest.json` somewhere stable.
- GitHub Actions for cross-platform builds.

---

## Things to NOT do

- Don't pivot to Electron without checking with the user — the Tauri decision was deliberate.
- Don't start phases C–E before Phase B passes — there's no point polishing a build that doesn't work.
- Don't add the desktop wrapper as a blocker on the web app's launch. The web app and Stripe should ship first; the desktop app is a follow-up distribution channel.
- Don't try to ship without code signing if the user is pointing real (paying) customers at the download page. SmartScreen warnings will gut conversion.

---

## What was already changed in the conversation that paused this work

Nothing — Phase A scaffold was not started. The repo is unchanged with respect to desktop work. Earlier in the same session, Stripe-related code was added (PricingPage portal button, `PRICE_TO_PLAN` placeholders in `functions/index.js`); those are unrelated and shouldn't be touched here.
