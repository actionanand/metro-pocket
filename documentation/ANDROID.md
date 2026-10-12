# MetroPocket Android release guide

GitHub Actions is the primary Android build route. Normal web development and release preparation do not require a local Android SDK or Android Studio. The web source is the application source; Capacitor creates and syncs the ignored `android/` platform in CI.

## Identity and build baseline

| Setting                | Value                             |
| ---------------------- | --------------------------------- |
| Application            | MetroPocket                       |
| Package                | `com.actionanand.metropocket.app` |
| Web output             | `www`                             |
| WebView scheme         | HTTPS                             |
| Minimum / target SDK   | 24 / 36                           |
| Build tools            | 36.0.0                            |
| Java                   | 21                                |
| Node                   | 24.16.0                           |
| Android release branch | `main-android`                    |
| Web deployment branch  | `main-github`                     |

## Release workflow

Push or merge the desired release commit into `main-android` to trigger `.github/workflows/android-build.yml`. Manual dispatch also works, but only for that branch. Branch concurrency serializes Android runs.

CI installs locked dependencies with `npm ci`, runs lint, typecheck, unit tests and Node Android script tests, then increments the Android version code. It commits that change with `[skip ci]`, pulls/rebases and pushes back to `main-android`. The production Angular build is synced into a freshly generated Capacitor Android project. The idempotent patch applies version settings, disables backups and cleartext traffic, and enables R8/resource shrinking. SDK levels are applied before generating branded assets and building unsigned APK/AAB outputs.

Signing is optional. Required secrets are checked before decoding the keystore. APK and AAB are signed to temporary `.candidate` files and verified before receiving normal filenames. Signing failure removes partial signed-looking files and retains explicitly unsigned artifacts. The summary identifies signing status, both versions, APK, AAB, mapping and Play Store icon. The decoded keystore is removed with `if: always()`.

Final APK/AAB, mapping and Play Store icon files are committed under `releases/` on `main-android` with `[skip ci]`, and uploaded as a 30-day GitHub Actions artifact. Find downloads in the completed workflow run's **Artifacts** section. CI does not publish to Google Play or create a GitHub Release. Repository Actions permissions and branch protection must permit the bot's version/release commits.

## Versioning and filenames

`android-version.json` is the single Android version source:

```json
{ "versionCode": 1, "versionName": "1.0.0" }
```

These examples describe the structure; the checked-in values control each build. Every actual CI Android build increments `versionCode`, while normal CI preserves `versionName`. A failed build may consume a code, which is safe. Prepare a visible version change manually:

```bash
npm run android:version        # increment code only
npm run android:version:patch  # increment code and 1.0.0 -> 1.0.1
npm run android:version:minor  # increment code and 1.0.0 -> 1.1.0
npm run android:version:major  # increment code and 1.0.0 -> 2.0.0
```

For `versionName=1.0.0`, `versionCode=2`, final verified outputs are:

```text
releases/MetroPocket-1-0-0-2.apk
releases/MetroPocket-1-0-0-2.aab
releases/MetroPocket-1-0-0-2-mapping.txt
releases/playstore-icon.png
```

Missing/invalid signing secrets or signing failure instead produce `MetroPocket-1-0-0-2-unsigned.apk` and `MetroPocket-1-0-0-2-unsigned.aab`. Unsigned artifacts are not install-ready/store-ready. Retain the matching R8 mapping for Play Console deobfuscation.

## Approved artwork

The canonical source is `src/assets/icon/metro-pocket.png`, also displayed alongside the Home app name. `scripts/generate-android-assets.mjs` derives launcher density images, round icons, adaptive foreground/background resources, safely padded splash artwork and the 512×512 Play Store icon. The original artwork is never modified. The native patch references the generated splash logo and preserves its padding when reapplied before Gradle.

The supplied `favicon.ico` and `favicon (1).png` remain unchanged. The current `favicon.ico` contains PNG-encoded image data, so `index.html` references it with `image/png` type. Angular's existing asset rule copies all supplied files.

## Keystore and GitHub secrets

Use the existing scripts on a trusted machine with OpenSSL. Generate a signing identity once; the generator refuses to overwrite an existing keystore.

```bash
npm run generate-keystore -- --password 'YOUR_PASSWORD'
test -s release-keystore.jks
base64 -w 0 release-keystore.jks > keystore.b64.txt
npm run keystore:type
```

The generator also accepts `KEYSTORE_PASSWORD` or `ANDROID_KEYSTORE_PASSWORD` from the environment, or prompts when no password is supplied. Prefer environment input to avoid shell-history exposure. Format inspection uses Java `keytool` but does not require the Android SDK.

Configure repository **Settings → Secrets and variables → Actions**:

| Secret              | Meaning                                                         |
| ------------------- | --------------------------------------------------------------- |
| `KEYSTORE_BASE64`   | Full contents of `keystore.b64.txt`                             |
| `KEYSTORE_PASSWORD` | Keystore password                                               |
| `KEY_ALIAS`         | `metropocket` for the supplied generator                        |
| `KEY_PASSWORD`      | Private-key password; normally the keystore password for PKCS12 |

CI detects PKCS12 and uses `KEYSTORE_PASSWORD` for its key password. For other formats it uses `KEY_PASSWORD`, falling back to the store password if blank. Passwords are passed through environment/file options and are never printed. Never commit `release-keystore.jks`, `keystore.b64.txt`, passwords, PEM files or `.env` secrets. Preserve a secure offline backup of your signing identity.

## Development and troubleshooting

Use `npm run develop` for normal development. `npm run test:android-scripts` needs only Node and uses temporary fixtures; it does not run Gradle. Local Android commands remain available for developers who explicitly choose to set up native debugging, but release production normally runs in Actions.

- **Unsigned fallback:** check the workflow summary and all four secrets, alias and password format.
- **No workflow build:** check the selected branch is `main-android` and the commit is not marked `[skip ci]`.
- **Bot cannot push:** review Actions contents-write permission and branch protection.
- **Missing mapping/artwork:** inspect the patch, asset and build steps; CI fails if required output is absent.
- **Version conflict in Play Console:** use a higher version code before the next upload.

MetroPocket adds no biometric, notification or external-storage permissions for branding or builds. Downloaded data stays app-private, backups/device transfers are excluded, and the native WebView uses HTTPS.
