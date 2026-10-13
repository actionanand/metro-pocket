import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Reproducible Capacitor plugin installation, independent of generated files. */
export async function patchTrainBackup(android, appId) {
  const directory = path.join(android, 'app/src/main/java', ...appId.split('.'));
  await mkdir(directory, { recursive: true });
  await copyFile(
    fileURLToPath(new URL('./android/TrainBackupPlugin.java', import.meta.url)),
    path.join(directory, 'TrainBackupPlugin.java'),
  );
  const activityFile = path.join(directory, 'MainActivity.java');
  let activity = existsSync(activityFile)
    ? await readFile(activityFile, 'utf8')
    : `package ${appId};\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {}\n`;
  if (!activity.includes('registerPlugin(TrainBackupPlugin.class)')) {
    if (/super\.onCreate\([^)]*\);/.test(activity)) {
      activity = activity.replace(
        /super\.onCreate\([^)]*\);/,
        match => `registerPlugin(TrainBackupPlugin.class);\n    ${match}`,
      );
    } else {
      const header = /public class MainActivity extends BridgeActivity\s*\{/;
      if (!header.test(activity))
        throw new Error('Cannot register TrainBackup: MainActivity is not a supported Capacitor activity.');
      activity = activity.replace(
        header,
        match =>
          `${match}\n  @Override public void onCreate(android.os.Bundle savedInstanceState) {\n    registerPlugin(TrainBackupPlugin.class);\n    super.onCreate(savedInstanceState);\n  }\n`,
      );
    }
    await writeFile(activityFile, activity);
  }
}
