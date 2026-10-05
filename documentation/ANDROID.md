# Android

Android is generated from Capacitor configuration; do not commit the generated `android/` directory. The package identity is `com.actionanand.metropocket.app`, name is MetroPocket, `webDir` is `www`, HTTPS is used in WebView, minimum SDK is 24 and CI targets SDK 36 using Java 21.

Install the required Android adapter once (the project keeps Capacitor 8.5.0):

```bash
npm install
npm run android:add
npm run android:sync
npm run android:open
```

`android-version.json` is the only Android version source. Run `npm run android:version`, `android:version:patch`, `android:version:minor`, or `android:version:major`. Local `npm run android:release` creates explicitly unsigned APK/AAB plus the R8 mapping in `releases/`. CI on `main-android` builds explicit `MetroPocket-<version>-unsigned.apk` and `.aab` first. Only after both signatures verify are they promoted to `MetroPocket-<version>.apk` and `.aab`; signing failure leaves only the clearly named unsigned fallback.

The canonical final artwork should be added as `src/assets/metropocket.png`. Asset tooling deliberately refuses to invent branding. After it is added, `npm run android:assets` generates adaptive/round launcher assets, bounded splash art and `releases/playstore-icon.png` without modifying the source asset.

Required GitHub Actions secret names are `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD`. Generate a PKCS12 keystore once on a trusted machine:

```bash
npm run generate-keystore -- --password 'YOUR_PASSWORD'
test -s release-keystore.jks
base64 -w 0 release-keystore.jks > keystore.b64.txt
npm run keystore:type
```

Set `KEY_ALIAS=metropocket`; for PKCS12, `KEY_PASSWORD` normally equals `KEYSTORE_PASSWORD`. Never commit any key, encoded keystore or password.
