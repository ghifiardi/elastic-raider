# Elastic Raider — Phase 4a (Android Packaging: Web Readiness + Capacitor Config) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game mobile-display-correct (landscape letterbox, no distortion) and package-ready — add Capacitor config, a zero-dependency `www/` assembly script, build-layer deps, and a complete Play Store runbook — without generating `android/` or building an AAB (those are Phase 4b, on the user's machine/CI).

**Architecture:** Part A is a small web fix: `resize()` keeps the 960×540 bitmap but sizes the canvas element to a fitted 16:9 box, and `index.html` flex-centers it so non-16:9 screens letterbox instead of stretching. Part B adds `capacitor.config.json`, `scripts/assemble-web.mjs` (curates `www/` from `index.html`+`src/`), `package.json` Capacitor devDeps + `sync`/`assemble:web` scripts, `.gitignore` for `www/`, and `docs/PLAY_STORE.md` (the 4b handoff, including the CI workflow YAML).

**Tech Stack:** Vanilla JS + Canvas (runtime, zero deps). Capacitor (`@capacitor/*`) as **build-layer devDependencies only**. Node `node:fs` for the assemble script. `node --test` for the existing suite.

**Branch:** `feat/android-packaging` (Phases 1/2/3a + visual pass on `main`; 82 tests pass).

**Spec:** `docs/superpowers/specs/2026-06-08-elastic-raider-android-packaging-design.md`

**Scope guard (4a):** NO `android/` generation, NO committed CI workflow file (its YAML lives in the runbook for 4b), NO AAB build/sign, NO on-device test — this environment has no Android SDK/Gradle/JDK/device. The game **runtime stays zero-dependency**; Capacitor is build-layer only. Do NOT run `npm install` or `npm run sync` in 4a (the assemble script is zero-dep and run directly; `cap sync` needs the not-yet-existent `android/`).

---

## File Structure

```
MOD  src/main.js              resize(): add letterbox CSS sizing (bitmap unchanged)
MOD  index.html               flex-center the canvas; drop the 100vw/100vh stretch
NEW  capacitor.config.json    appId/appName/webDir/backgroundColor
NEW  scripts/assemble-web.mjs zero-dep www/ assembler (build output)
MOD  package.json             + Capacitor devDeps + assemble:web/sync scripts
MOD  .gitignore               + www/
NEW  docs/PLAY_STORE.md        4b runbook incl. the full CI workflow YAML
```

No game-logic files change. `node --test` stays 82/82 throughout.

---

## Task 1: Canvas letterbox fit (mobile display fix)

**Files:**
- Modify: `src/main.js` (the `resize()` function)
- Modify: `index.html` (the `<style>` + viewport meta)

- [ ] **Step 1: Update `resize()` in `src/main.js`.** Replace the existing `resize` function with:
```js
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = VIEW.W * dpr;
  canvas.height = VIEW.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Fit the 16:9 playfield into the viewport without distortion (letterbox).
  const fit = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
  canvas.style.width = `${VIEW.W * fit}px`;
  canvas.style.height = `${VIEW.H * fit}px`;
}
```
(The bitmap stays `VIEW.W·dpr × VIEW.H·dpr` — logical 960×540 and crisp DPR are unchanged; only the CSS display size becomes aspect-correct.)

- [ ] **Step 2: Update `index.html`.** Replace the viewport meta and `<style>` block with:
```html
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover" />
  <title>Elastic Raider</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b1020; overflow: hidden;
      touch-action: none; font-family: system-ui, sans-serif; }
    body { display: flex; align-items: center; justify-content: center; }
    #game { display: block; }
  </style>
```
(The dark `body` background now shows as letterbox bars around the centered canvas.)

- [ ] **Step 3: Verify (no logic touched)**

Run: `cd ~/elastic-raider && node --check src/main.js && node --test`
Expected: parses; **82/82** pass (no game logic changed).

- [ ] **Step 4: Commit**

```bash
cd ~/elastic-raider
git add src/main.js index.html
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: letterbox the canvas to 16:9 (fix mobile aspect distortion)"
```

> **CONTROLLER CHECKPOINT (after Task 1):** preview the game; `preview_resize` to a landscape phone (e.g. 844×390) and an odd aspect (e.g. 500×900) — confirm the 16:9 canvas stays centered with letterbox bars and never stretches/distorts; menu + a run render; no console errors.

---

## Task 2: Capacitor config + `www/` assembly + package.json + .gitignore

**Files:**
- Create: `capacitor.config.json`
- Create: `scripts/assemble-web.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `capacitor.config.json`:**
```json
{
  "appId": "com.ghifiardi.elasticraider",
  "appName": "Elastic Raider",
  "webDir": "www",
  "backgroundColor": "#0b1020"
}
```

- [ ] **Step 2: Create `scripts/assemble-web.mjs`** (zero-dependency; uses only `node:fs`):
```js
// Assembles the Capacitor web root (www/) from the curated game files only,
// so docs/, tests/, node_modules/ never ship inside the app.
// www/ is BUILD OUTPUT — never edit it by hand; edit index.html / src/ and re-run.
import { rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
cpSync('index.html', 'www/index.html');
cpSync('src', 'www/src', { recursive: true });
writeFileSync(
  'www/DO_NOT_EDIT.txt',
  'Build output of scripts/assemble-web.mjs. Do not edit by hand; edit index.html / src/ instead.\n',
);
console.log('Assembled www/ from index.html + src/ (build output — do not edit by hand).');
```

- [ ] **Step 3: Replace `package.json`** with (adds Capacitor build-layer devDeps + the assemble/sync scripts; runtime stays zero-dep):
```json
{
  "name": "elastic-raider",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "serve": "node --version >/dev/null && python3 -m http.server 8080",
    "assemble:web": "node scripts/assemble-web.mjs",
    "sync": "node scripts/assemble-web.mjs && cap sync android"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.0.0",
    "@capacitor/core": "^6.0.0",
    "@capacitor/android": "^6.0.0"
  }
}
```

- [ ] **Step 4: Add `www/` to `.gitignore`.** The file currently contains `node_modules/`, `.DS_Store`, `*.log`. Append:
```
www/
```
(Leave `android/` tracked — it is committed in 4b. `node_modules/` is already ignored.)

- [ ] **Step 5: Verify the assemble script + config (do NOT `npm install` or `npm run sync`)**

```bash
cd ~/elastic-raider
node scripts/assemble-web.mjs
ls www www/src www/DO_NOT_EDIT.txt >/dev/null && echo "www assembled"
test ! -e www/docs && test ! -e www/tests && test ! -e www/node_modules && echo "no docs/tests/node_modules in www"
node -e "JSON.parse(require('fs').readFileSync('capacitor.config.json','utf8')); console.log('capacitor.config.json OK')"
node -e "const p=require('./package.json'); if(!p.scripts.sync||!p.devDependencies['@capacitor/cli']) throw new Error('package.json missing'); console.log('package.json OK')"
node --check scripts/assemble-web.mjs && echo "assemble script parses"
node --test 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `www assembled`, `no docs/tests/node_modules in www`, `capacitor.config.json OK`, `package.json OK`, `assemble script parses`, and `# pass 82 / # fail 0`.

- [ ] **Step 6: Commit** (do NOT commit `www/` — it is gitignored)

```bash
git add capacitor.config.json scripts/assemble-web.mjs package.json .gitignore
git status --porcelain   # confirm www/ is NOT staged
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "feat: Capacitor config + zero-dep www assembler + build-layer deps"
```

---

## Task 3: Play Store runbook (`docs/PLAY_STORE.md`) — the 4b handoff

**Files:**
- Create: `docs/PLAY_STORE.md`

- [ ] **Step 1: Create `docs/PLAY_STORE.md`** with exactly this content:

````markdown
# Elastic Raider — Android / Play Store Runbook (Phase 4b)

Phase 4a shipped the web mobile-readiness fix and the Capacitor config. This runbook
covers the steps that need the Android SDK / Gradle / a device — run them on your
machine and in CI. After step 4 you commit the generated `android/` project; after
step 6 the CI workflow can build a signed AAB.

> `www/` is **build output** (`npm run assemble:web` / `npm run sync`). Never edit it
> by hand — edit `index.html` / `src/` and re-run.

## 1. Install build dependencies
```bash
npm install   # pulls @capacitor/cli, @capacitor/core, @capacitor/android (devDeps)
```

## 2. Generate the Android project (needs Android Studio / SDK)
```bash
npx cap add android
npm run sync          # assembles www/ then `cap sync android`
```

## 3. Lock landscape orientation
Edit `android/app/src/main/AndroidManifest.xml` and add to the main `<activity>` tag:
```xml
android:screenOrientation="sensorLandscape"
```
No orientation plugin is needed — the web canvas already letterboxes to fit.

## 4. Commit the generated project
```bash
git add android
git commit -m "chore: add generated Android (Capacitor) project + landscape lock"
```
Committing `android/` means CI only runs `cap sync` (not `cap add`), matching the workflow below.

## 5. Signing key + GitHub secrets
Generate an upload keystore and register four repository secrets
(Settings → Secrets and variables → Actions):
```bash
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias upload
base64 -i upload-keystore.jks | pbcopy   # paste into the KEYSTORE_BASE64 secret
```
Secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

In `android/app/build.gradle`, configure the `release` `signingConfig` to read these from
environment variables (`KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)
so the workflow below can sign without committing secrets.

## 6. CI workflow
Add this as `.github/workflows/android-release.yml` (it is intentionally NOT committed in
Phase 4a, because it would fail until `android/` exists). Trigger it from the Actions tab
or by pushing a tag like `v1.0.0`.

```yaml
name: Build Android App Bundle

on:
  workflow_dispatch:
    inputs:
      versionName:
        description: "Version name (e.g. 1.0.1). Leave blank to keep build.gradle value."
        required: false
        default: ""
      versionCode:
        description: "Version code (integer, must increase each upload). Leave blank to keep build.gradle value."
        required: false
        default: ""
  push:
    tags:
      - "v*"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Set up Node
        uses: actions/setup-node@v6
        with:
          node-version: "22"
          cache: "npm"

      - name: Set up JDK 21
        uses: actions/setup-java@v5
        with:
          distribution: "temurin"
          java-version: "21"

      - name: Set up Android SDK
        uses: android-actions/setup-android@v4

      - name: Install dependencies
        run: npm ci

      - name: Assemble web assets and sync Capacitor
        run: npm run sync

      - name: Apply version overrides
        if: ${{ github.event_name == 'workflow_dispatch' && (inputs.versionName != '' || inputs.versionCode != '') }}
        run: |
          GRADLE=android/app/build.gradle
          if [ -n "${{ inputs.versionName }}" ]; then
            sed -i "s/versionName \"[^\"]*\"/versionName \"${{ inputs.versionName }}\"/" "$GRADLE"
          fi
          if [ -n "${{ inputs.versionCode }}" ]; then
            sed -i "s/versionCode [0-9]*/versionCode ${{ inputs.versionCode }}/" "$GRADLE"
          fi
          grep -E "versionName|versionCode" "$GRADLE"

      - name: Decode keystore
        env:
          KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
        run: |
          if [ -z "$KEYSTORE_BASE64" ]; then
            echo "::error::KEYSTORE_BASE64 secret is not set."
            exit 1
          fi
          echo "$KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/upload-keystore.jks"

      - name: Build release bundle
        working-directory: android
        env:
          KEYSTORE_FILE: ${{ runner.temp }}/upload-keystore.jks
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew bundleRelease --no-daemon

      - name: Upload App Bundle artifact
        uses: actions/upload-artifact@v7
        with:
          name: elastic-raider-release-aab
          path: android/app/build/outputs/bundle/release/app-release.aab
          if-no-files-found: error

      - name: Also build APK (for sideloading / quick testing)
        working-directory: android
        env:
          KEYSTORE_FILE: ${{ runner.temp }}/upload-keystore.jks
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew assembleRelease --no-daemon

      - name: Upload APK artifact
        uses: actions/upload-artifact@v7
        with:
          name: elastic-raider-release-apk
          path: android/app/build/outputs/apk/release/app-release.apk
          if-no-files-found: error
```

## 7. Local build (alternative to CI)
```bash
npm run sync
cd android && ./gradlew bundleRelease   # AAB at app/build/outputs/bundle/release/
```

## 8. On-device test checklist
- App opens locked to **landscape**; the 16:9 playfield letterboxes, no distortion.
- **Touch:** tap = jump/start, swipe-down = slide, swipe-forward = dash.
- **Audio** starts on the first touch (no autoplay block).
- **Backgrounding** the app pauses the game; returning resumes cleanly (no time skip / instant death).
- **Persistence:** wallet + high score survive a full app close-and-reopen.
- Smooth frame rate during a run.
````

- [ ] **Step 2: Verify the runbook**

Run: `cd ~/elastic-raider && test -f docs/PLAY_STORE.md && grep -q "com.ghifiardi.elasticraider\|sensorLandscape\|KEYSTORE_BASE64\|bundleRelease" docs/PLAY_STORE.md && echo "runbook present with key steps"`
Expected: `runbook present with key steps`.

- [ ] **Step 3: Commit**

```bash
git add docs/PLAY_STORE.md
git -c user.name="ghifiardi" -c user.email="raditio.ghifiardi@gmail.com" commit -m "docs: Play Store runbook (4b handoff + CI workflow YAML)"
```

---

## Task 4: Acceptance pass

**Files:** none (verification only — controller-driven)

- [ ] **Step 1: Full suite + parse**

Run: `cd ~/elastic-raider && node --test 2>&1 | grep -E "^# (tests|pass|fail)" && node --check src/main.js scripts/assemble-web.mjs && echo "parse OK"`
Expected: **82/82**, 0 failures; parse OK.

- [ ] **Step 2: Re-confirm `www/` assembly is correct and excludes non-game files**

Run: `cd ~/elastic-raider && node scripts/assemble-web.mjs && find www -maxdepth 2 | sort && echo "--- forbidden (expect empty) ---" && ls www/docs www/tests www/node_modules 2>/dev/null || echo "none"`
Expected: `www/index.html`, `www/src/...`, `www/DO_NOT_EDIT.txt` present; no `docs/tests/node_modules`.

- [ ] **Step 3: Confirm scope guards held** — `android/` not present, no `.github/workflows/` committed:

Run: `cd ~/elastic-raider && test ! -d android && echo "no android/ (correct for 4a)" && test ! -e .github/workflows/android-release.yml && echo "no committed workflow (correct for 4a)" && git status --porcelain www | grep -q . && echo "WWW STAGED (bad)" || echo "www not tracked (correct)"`
Expected: `no android/ (correct for 4a)`, `no committed workflow (correct for 4a)`, `www not tracked (correct)`.

- [ ] **Step 4: Controller preview verification** — `preview_start`, then:
- [ ] `preview_resize` to a landscape phone (844×390): the 16:9 canvas is centered, letterboxed, undistorted; the bandana hero/backdrop render proportionally.
- [ ] `preview_resize` to an odd portrait aspect (500×900): canvas letterboxes (bars top/bottom or sides), no stretch.
- [ ] Start a run via a touch/tap (dispatched touch event) — confirms touch input + audio unlock path; raider runs.
- [ ] Reload the page — wallet/high score persist.
- [ ] `preview_console_logs` level=error → empty.

---

## Spec coverage check (self-review)

- Canvas letterbox fit (landscape display, no distortion) → Task 1. ✓
- Mobile-readiness audit (touch/audio/pause/persistence) → Task 1 + Task 4 controller checks (already-implemented behaviors verified at phone size). ✓
- `capacitor.config.json` (appId/appName/webDir/backgroundColor) → Task 2. ✓
- `scripts/assemble-web.mjs` zero-dep curated `www/` + DO_NOT_EDIT marker → Task 2. ✓
- `package.json` Capacitor devDeps + `assemble:web`/`sync` → Task 2. ✓
- `.gitignore` `www/` (android/ NOT ignored; node_modules already) → Task 2. ✓
- `docs/PLAY_STORE.md` runbook incl. android/ gen, manifest landscape lock, keystore+4 secrets, full CI workflow YAML, local build, on-device checklist → Task 3. ✓
- Verification boundary: structural checks + preview here; build/sign/device = runbook → Tasks 2/4 + Task 3. ✓
- Scope guards: no `android/`, no committed workflow, `www/` untracked, runtime zero-dep → Task 4 step 3. ✓
- Out of scope (android/ gen, AAB build/sign, device test, icons/splash) → no task does them. ✓
```
