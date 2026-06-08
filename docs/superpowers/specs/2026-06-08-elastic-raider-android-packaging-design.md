# Elastic Raider — Phase 4a Design Spec: Android Packaging (Web Readiness + Capacitor Config)

**Date:** 2026-06-08
**Status:** Approved 2026-06-08 — ready for implementation planning
**Builds on:** Phases 1, 2, 3a + the visual pass (all merged to `main`)
**Type:** Mobile packaging — Part A (web readiness) + Part B config/runbook

> Phase 4 packages the game for Android via Capacitor (`appId com.ghifiardi.elasticraider`). It is **split** to keep every PR green:
> - **Phase 4a (this spec):** web mobile-readiness fixes + Capacitor config + the `www/` assembly script + a complete handoff runbook. Fully authored and verified here.
> - **Phase 4b (later, user-driven):** the user runs `npx cap add android` locally (needs the Android SDK, absent here), commits the generated `android/` project, and adds the CI workflow — then builds/signs/tests the AAB. 4a's runbook documents 4b end to end.
>
> **No CI workflow file and no `android/` project are committed in 4a** — a workflow referencing a non-existent `android/` would be dead/red, so its YAML lives in the runbook ready to drop in during 4b.

## 1. Summary

Make the game mobile-ready and package-ready without leaving this environment's limits. **Part A** fixes the one real mobile bug (the canvas currently stretches to the viewport and distorts on non-16:9 screens) with an aspect-preserving letterbox fit, and audits touch/audio/pause/persistence in the preview at phone dimensions. **Part B (config)** adds the Capacitor config, a zero-dependency `www/` assembly script, `package.json` build-layer deps/scripts, and `.gitignore` entries — plus `docs/PLAY_STORE.md`, a runbook covering `android/` generation, the landscape manifest lock, keystore/secrets, the CI workflow YAML, and the on-device checklist. The **game runtime stays zero-dependency**; Capacitor is strictly a build-layer concern.

## 2. Goals, non-goals, and the verification boundary

**Goals**
- Fix mobile canvas display (landscape lock + letterbox); confirm touch/audio/pause/persistence work.
- Provide committed, structurally-valid Capacitor config + `www/` assembly + build-layer deps.
- Provide a precise runbook so the user can generate `android/`, build/sign the AAB, and ship to Play.
- Preserve the zero-runtime-dependency game design.

**Non-goals (4a)**
- No `android/` project generation, no AAB build, no signing, no on-device test — these need the Android SDK/Gradle/JDK/device and are **Phase 4b**, done by the user.
- No committed CI workflow file (its YAML is in the runbook, added in 4b).
- No app icons/splash art polish (future).

**Verification boundary**
- **Verified here:** letterbox fit at phone/odd viewports; touch/audio/pause/persistence in preview; `node --test` 82/82; valid `capacitor.config.json` (parses); `scripts/assemble-web.mjs` actually produces a correct `www/`.
- **NOT runnable here (runbook → user/CI):** `npx cap add android`, AAB build + signing, on-device playtest.

## 3. Part A — Web mobile-readiness (verified in the preview here)

### 3.1 Canvas letterbox fit (the distortion fix)
Today `main.js` `resize()` sets the canvas bitmap to `VIEW.W·dpr × VIEW.H·dpr` while `index.html` CSS stretches `#game` to `100vw×100vh` — so on any non-16:9 screen the game distorts. Fix:
- **`main.js` `resize()`** keeps the bitmap at `VIEW.W·dpr × VIEW.H·dpr` (logical 960×540 + crisp DPR) and sets the canvas **CSS** size to a fitted 16:9 box:
  ```js
  const fit = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
  canvas.style.width = `${VIEW.W * fit}px`;
  canvas.style.height = `${VIEW.H * fit}px`;
  ```
- **`index.html` CSS** centers the canvas (`body { display:flex; align-items:center; justify-content:center; }`) and drops the `#game { width:100vw; height:100vh }` stretch (→ `#game { display:block; }`). The dark `body` background becomes the letterbox bars. Keep the existing `touch-action:none`, `overflow:hidden`, `user-scalable=no`.
- This is the **only** `main.js`/`index.html` change in 4a; no game logic is touched, so `node --test` stays 82/82.

### 3.2 Mobile-readiness audit (preview, landscape-phone viewport)
Most of this is already implemented in Phases 1–2; Part A verifies it at phone size and fixes anything that fails:
- **Letterbox:** at a landscape phone size and an odd aspect, the 16:9 canvas is centered with bars and never distorts.
- **Touch controls:** tap = jump (start), swipe-down = slide, swipe-forward = dash (already in `engine/input.js`).
- **Audio unlock:** the Web Audio context resumes on the first touch gesture (already gated via `audio.unlock()` on first start) — no autoplay error.
- **Background pause:** the loop pauses on `visibilitychange → hidden` and resumes on visible (already in `engine/loop.js`) — the web proxy for Android app background.
- **Persistence:** wallet/high-score survive a reload (localStorage via `meta/storage.js`) — the web proxy for app restart.

## 4. Part B (config authored & verified here)

### 4.1 `package.json`
- Add **devDependencies** (build-layer only): `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (recent major, e.g. `^6`). The game's runtime stays zero-dependency; these are only for packaging.
- Add **scripts**:
  - `"assemble:web": "node scripts/assemble-web.mjs"`
  - `"sync": "node scripts/assemble-web.mjs && cap sync android"`  (the step CI calls)
- Keep `test` and `serve` as-is.

### 4.2 `capacitor.config.json`
```json
{
  "appId": "com.ghifiardi.elasticraider",
  "appName": "Elastic Raider",
  "webDir": "www",
  "backgroundColor": "#0b1020"
}
```

### 4.3 `scripts/assemble-web.mjs` (zero-dep, `node:fs`)
Clean-copies the curated web root into `www/` so `docs/`, `tests/`, `node_modules/`, and specs never ship in the app:
```js
import { rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
cpSync('index.html', 'www/index.html');
cpSync('src', 'www/src', { recursive: true });
writeFileSync('www/DO_NOT_EDIT.txt', 'Build output of scripts/assemble-web.mjs. Do not edit by hand; edit index.html / src/ instead.\n');
console.log('Assembled www/ from index.html + src/ (build output — do not edit by hand).');
```
> **`www/` is build output. Never edit it by hand** — edit `index.html`/`src/` and re-run `npm run sync`. `www/` is gitignored; the in-folder `DO_NOT_EDIT.txt` marker reinforces this for anyone browsing a built tree.

### 4.4 `.gitignore`
Add `www/` and `node_modules/` (both are generated). The `android/` project is **not** ignored — it will be committed in 4b once generated.

## 5. `docs/PLAY_STORE.md` runbook (the 4b handoff)

A precise, ordered guide for the user (cannot be executed here):
1. **Install build deps:** `npm install` (pulls the Capacitor devDeps).
2. **Generate the Android project:** `npx cap add android` (requires Android Studio / SDK). Then `npm run sync` to assemble `www/` and copy web assets in.
3. **Lock landscape:** in `android/app/src/main/AndroidManifest.xml`, set `android:screenOrientation="sensorLandscape"` on the main activity (no orientation plugin needed). The web letterbox handles fit.
4. **Commit `android/`** to the repo (so CI only needs `cap sync`, matching plumber-quest).
5. **Signing:** generate an upload keystore (`keytool`), base64-encode it, and set four GitHub Actions secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
6. **CI workflow:** add `.github/workflows/android-release.yml` (full YAML included verbatim in this runbook, adapted from plumber-quest: Node 22 / JDK 21 / Android SDK, `npm ci` → `npm run sync` → signed AAB, `workflow_dispatch` + `v*` tag triggers, optional version overrides). Trigger by pushing a `v1.0.0` tag or running it from the Actions tab.
7. **Local build alternative:** `cd android && ./gradlew bundleRelease`.
8. **On-device checklist:** landscape lock holds; tap/swipe controls; audio starts on first touch; backgrounding the app pauses and resumes cleanly; wallet/high-score persist across a full app restart; smooth frame rate.

## 6. Why the 4a/4b split

A CI workflow that runs `cap sync`/Gradle against a non-existent `android/` would fail, and `android/` can't be generated here (no SDK). Committing either in 4a would make the branch red or carry dead code. So 4a ships only green, verifiable artifacts; 4b adds the generated `android/` + the workflow together, once the user has run `cap add android`. The runbook makes this dependency explicit.

## 7. Testing & acceptance (4a)

- `node --test` → **82/82** (only `resize()`/CSS change; no logic touched).
- `node --check src/main.js scripts/assemble-web.mjs` → clean.
- `capacitor.config.json` parses as JSON; `package.json` parses and lists the three Capacitor devDeps + `sync`/`assemble:web` scripts.
- Running `node scripts/assemble-web.mjs` produces `www/index.html` + `www/src/...` (and the marker), and `www/` contains **no** `docs/`/`tests/`/`node_modules/`.
- Preview: letterbox correct at a landscape-phone viewport and an odd aspect (no distortion); touch start/slide/dash fire; no console errors; persistence across reload.

## 8. Ethos

Game **runtime** stays zero-dependency — `www/` is just the copied static game. Capacitor (`@capacitor/*`) is a **build/packaging** devDependency only, the same tradeoff plumber-quest accepted to ship to Play.

## 9. Open questions / deferred

- **Phase 4b (user):** `npx cap add android`, commit `android/`, add the workflow file, generate keystore + set secrets, build/sign the AAB, on-device test.
- App icon + splash screen art — deferred (future polish).
- Capacitor major version pin — confirm the latest stable major at implementation time.
