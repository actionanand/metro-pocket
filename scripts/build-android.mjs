import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync('android-version.json', 'utf8'));
mkdirSync('releases', { recursive: true });
for (const file of readdirSync('releases'))
  if (/\.(apk|aab)$/i.test(file) || /-mapping\.txt$/i.test(file)) rmSync(`releases/${file}`);
execFileSync(process.execPath, ['scripts/patch-android.mjs'], { stdio: 'inherit' });
execFileSync(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  ['assembleRelease', 'bundleRelease', `-PversionCode=${version.versionCode}`, `-PversionName=${version.versionName}`],
  { cwd: 'android', stdio: 'inherit' },
);
const name = `MetroPocket-${version.versionName.replaceAll('.', '-')}`;
copyFileSync('android/app/build/outputs/apk/release/app-release-unsigned.apk', `releases/${name}-unsigned.apk`);
copyFileSync('android/app/build/outputs/bundle/release/app-release.aab', `releases/${name}-unsigned.aab`);
if (existsSync('android/app/build/outputs/mapping/release/mapping.txt'))
  copyFileSync('android/app/build/outputs/mapping/release/mapping.txt', `releases/${name}-mapping.txt`);
