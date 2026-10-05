import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const android = path.join(root, 'android');
if (!existsSync(android)) throw new Error('android/ is missing. Run npm run android:add first.');
const config = await readFile(path.join(root, 'capacitor.config.ts'), 'utf8');
const appId = config.match(/appId:\s*'([^']+)'/)?.[1];
if (appId !== 'com.actionanand.metropocket.app') throw new Error('MetroPocket app ID is missing or invalid.');
const manifestFile = path.join(android, 'app/src/main/AndroidManifest.xml');
let manifest = await readFile(manifestFile, 'utf8');
manifest = manifest.replace(
  /\sandroid:(allowBackup|fullBackupContent|dataExtractionRules|usesCleartextTraffic)="[^"]*"/g,
  '',
);
manifest = manifest.replace(
  '<application',
  '<application android:allowBackup="false" android:fullBackupContent="@xml/backup_rules" android:dataExtractionRules="@xml/data_extraction_rules" android:usesCleartextTraffic="false"',
);
await writeFile(manifestFile, manifest);
const res = path.join(android, 'app/src/main/res');
const write = async (file, text) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
};
const domains = [
  'root',
  'file',
  'database',
  'sharedpref',
  'external',
  'device_root',
  'device_file',
  'device_database',
  'device_sharedpref',
];
const excludes = domains.map(domain => `<exclude domain="${domain}" path="."/>`).join('');
await write(path.join(res, 'xml/backup_rules.xml'), `<full-backup-content>${excludes}</full-backup-content>`);
await write(
  path.join(res, 'xml/data_extraction_rules.xml'),
  `<data-extraction-rules><cloud-backup>${excludes}</cloud-backup><device-transfer>${excludes}</device-transfer></data-extraction-rules>`,
);
const gradleFile = path.join(android, 'app/build.gradle');
let gradle = await readFile(gradleFile, 'utf8');
const version = JSON.parse(await readFile(path.join(root, 'android-version.json'), 'utf8'));
gradle = gradle
  .replace(
    /versionCode .*/,
    `versionCode project.hasProperty("versionCode") ? project.versionCode.toInteger() : ${version.versionCode}`,
  )
  .replace(
    /versionName .*/,
    `versionName project.hasProperty("versionName") ? project.versionName : "${version.versionName}"`,
  )
  .replace(/minifyEnabled\s+false/, 'minifyEnabled true');
if (!gradle.includes('shrinkResources true'))
  gradle = gradle.replace('minifyEnabled true', 'minifyEnabled true\n            shrinkResources true');
await writeFile(gradleFile, gradle);
const rulesFile = path.join(android, 'app/proguard-rules.pro');
const rules = await readFile(rulesFile, 'utf8');
if (!rules.includes('METROPOCKET_CAPACITOR'))
  await writeFile(
    rulesFile,
    `${rules}\n# METROPOCKET_CAPACITOR\n-keep class com.getcapacitor.** { *; }\n-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }\n-keepclassmembers class * { @com.getcapacitor.PluginMethod <methods>; }\n`,
  );
console.log('Applied MetroPocket Android privacy, version and R8 configuration.');
