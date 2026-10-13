import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const script = path.resolve('scripts/bump-android-version.js');
const { patchTrainBackup } = await import('./patch-train-backup.mjs');
test('Android version increments and semantic bumps are valid', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'metropocket-test-'));
  try {
    for (const [mode, versionName] of [
      ['', '1.2.3'],
      ['--patch', '1.2.4'],
      ['--minor', '1.3.0'],
      ['--major', '2.0.0'],
    ]) {
      writeFileSync(path.join(root, 'android-version.json'), JSON.stringify({ versionCode: 3, versionName: '1.2.3' }));
      execFileSync(process.execPath, [script, ...(mode ? [mode] : [])], { cwd: root });
      assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'android-version.json'), 'utf8')), {
        versionCode: 4,
        versionName,
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('Android workflow uses guarded build and Android identity', () => {
  const workflow = readFileSync('.github/workflows/android-build.yml', 'utf8');
  const patch = readFileSync('scripts/patch-android.mjs', 'utf8');
  assert.match(workflow, /node scripts\/build-android\.mjs/);
  assert.match(workflow, /main-android/);
  assert.match(workflow, /RELEASE_BASENAME: MetroPocket/);
  assert.match(workflow, /^\s+npm run android:version\s*$/m);
  assert.match(workflow, /android-version\.json/);
  assert.match(workflow, /git add android-version\.json/);
  assert.match(workflow, /\[skip ci\]/);
  assert.ok(workflow.includes('${VERSION_NAME//./-}-${VERSION_CODE}'));
  assert.match(workflow, /git add releases\//);
  assert.match(workflow, /-unsigned\.apk/);
  assert.match(workflow, /-unsigned\.aab/);
  assert.match(workflow, /\.candidate/);
  assert.match(
    workflow,
    /if \[\[ "\$APK_FILE" == \*-unsigned\.apk \]\]; then\n\s+LABEL="⚠️ Unsigned fallback"\n\s+else\n\s+LABEL="✅ Signed and verified"\n\s+fi/,
  );
  assert.ok(workflow.indexOf('apksigner" verify') < workflow.indexOf('mv "$TEMP_APK"'));
  assert.ok(workflow.indexOf("grep -q 'jar verified") < workflow.indexOf('mv "$TEMP_AAB"'));
  assert.match(workflow, /trap 'rm -f/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /rm -f android\/app\/release-keystore\.jks/);
  assert.match(workflow, /Play Store icon:/);
  assert.match(workflow, /grep -q 'jar verified/);
  assert.match(workflow, /PKCS12/);
  for (const secret of ['KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'])
    assert.ok(workflow.includes(`secrets.${secret}`));
  const assets = readFileSync('scripts/generate-android-assets.mjs', 'utf8');
  const build = readFileSync('scripts/build-android.mjs', 'utf8');
  assert.match(assets, /src\/assets\/icon\/metro-pocket\.png/);
  assert.match(assets, /playstore-icon\.png/);
  assert.ok(build.includes("${version.versionName.replaceAll('.', '-')}-${version.versionCode}"));
  assert.match(readFileSync('.gitignore', 'utf8'), /\/android\//);
  assert.doesNotMatch(workflow + assets + patch, /Qurio|qurio/);
  assert.match(patch, /com\.actionanand\.metropocket\.app/);
  assert.doesNotMatch(patch, /USE_BIOMETRIC|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/);
});
test('Android branding patch is idempotent and retains padded artwork and privacy', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'metropocket-patch-test-'));
  const write = (relative, contents) => {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  try {
    write('capacitor.config.ts', "export default { appId: 'com.actionanand.metropocket.app' };");
    write('android-version.json', JSON.stringify({ versionName: '1.0.0', versionCode: 2 }));
    mkdirSync(path.join(root, 'src/assets/icon'), { recursive: true });
    copyFileSync('src/assets/icon/metro-pocket.png', path.join(root, 'src/assets/icon/metro-pocket.png'));
    write(
      'android/app/src/main/AndroidManifest.xml',
      '<manifest><application android:allowBackup="true"></application></manifest>',
    );
    write(
      'android/app/build.gradle',
      'android { defaultConfig {\nversionCode 1\nversionName "1.0"\n}\nbuildTypes { release { minifyEnabled false } } }',
    );
    write('android/app/proguard-rules.pro', '# fixture');
    const run = () => execFileSync(process.execPath, [path.resolve('scripts/patch-android.mjs')], { cwd: root });
    run();
    write('android/app/src/main/res/drawable-nodpi/metropocket_splash_logo.png', 'padded fixture');
    const files = [
      'android/app/src/main/AndroidManifest.xml',
      'android/app/build.gradle',
      'android/app/proguard-rules.pro',
      'android/app/src/main/res/values/styles.xml',
      'android/app/src/main/res/values-night/styles.xml',
      'android/app/src/main/java/com/actionanand/metropocket/app/MainActivity.java',
      'android/app/src/main/java/com/actionanand/metropocket/app/TrainBackupPlugin.java',
    ];
    const before = files.map(file => readFileSync(path.join(root, file), 'utf8'));
    run();
    assert.deepEqual(
      files.map(file => readFileSync(path.join(root, file), 'utf8')),
      before,
    );
    assert.equal(
      readFileSync(path.join(root, 'android/app/src/main/res/drawable-nodpi/metropocket_splash_logo.png'), 'utf8'),
      'padded fixture',
    );
    assert.match(before[0], /allowBackup="false"/);
    assert.match(before[0], /usesCleartextTraffic="false"/);
    assert.match(before[3], /metropocket_splash_icon/);
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
});
test('Train backup patch registers a native document plugin reproducibly and preserves existing activity code', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'metropocket-train-native-test-'));
  const activityFile = path.join(root, 'app/src/main/java/com/actionanand/metropocket/app/MainActivity.java');
  mkdirSync(path.dirname(activityFile), { recursive: true });
  const activity = `package com.actionanand.metropocket.app;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(android.os.Bundle state) {
    super.onCreate(state);
    String preserved = "Existing activity setup";
  }
}`;
  try {
    writeFileSync(activityFile, activity);
    await patchTrainBackup(root, 'com.actionanand.metropocket.app');
    const patched = readFileSync(activityFile, 'utf8');
    assert.ok(patched.includes('Existing activity setup'));
    assert.ok(patched.indexOf('registerPlugin(TrainBackupPlugin.class)') < patched.indexOf('super.onCreate'));
    await patchTrainBackup(root, 'com.actionanand.metropocket.app');
    assert.equal(readFileSync(activityFile, 'utf8'), patched);
    const plugin = readFileSync(path.join(path.dirname(activityFile), 'TrainBackupPlugin.java'), 'utf8');
    assert.match(plugin, /ACTION_CREATE_DOCUMENT/);
    assert.match(plugin, /ACTION_OPEN_DOCUMENT/);
    assert.match(plugin, /@ActivityCallback/);
    assert.match(plugin, /MAX_BYTES = 20 \* 1024 \* 1024/);
    assert.match(plugin, /cancelled/);
    assert.match(plugin, /application\/x-sqlite3/);
    assert.doesNotMatch(plugin, /WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|HttpClient|password|Cipher/);
    assert.match(readFileSync('capacitor.config.ts', 'utf8'), /loggingBehavior:\s*'none'/);
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
});
