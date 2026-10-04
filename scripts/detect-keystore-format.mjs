import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const file = process.argv[2];
if (!file || !existsSync(file)) throw new Error('Usage: node scripts/detect-keystore-format.mjs <keystore>');
const output = execFileSync('keytool', ['-list', '-keystore', file], {
  encoding: 'utf8',
  stdio: ['inherit', 'pipe', 'pipe'],
});
console.log(`Keystore type: ${output.match(/Keystore type:\s*(\S+)/i)?.[1] ?? 'unknown'}`);
