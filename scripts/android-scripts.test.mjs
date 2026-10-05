import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const script = path.resolve('scripts/bump-android-version.js');
test('Android version increments and semantic bumps are valid', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'metropocket-test-'));
  try {
    writeFileSync(path.join(root, 'android-version.json'), JSON.stringify({ versionCode: 3, versionName: '1.2.3' }));
    execFileSync(process.execPath, [script, '--minor'], { cwd: root });
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'android-version.json'), 'utf8')), {
      versionCode: 4,
      versionName: '1.3.0',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('Android workflow uses guarded build and Android identity', () => {
  const workflow = readFileSync('.github/workflows/android-build.yml', 'utf8');
  const patch = readFileSync('scripts/patch-android.mjs', 'utf8');
  assert.match(workflow, /node scripts\/build-android\.mjs/);
  assert.match(workflow, /main-android/);
  assert.match(workflow, /-unsigned\.apk/);
  assert.match(workflow, /\.candidate/);
  assert.match(workflow, /trap 'rm -f/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /Play Store icon:/);
  assert.match(patch, /com\.actionanand\.metropocket\.app/);
  assert.doesNotMatch(patch, /USE_BIOMETRIC|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/);
});
