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

---
