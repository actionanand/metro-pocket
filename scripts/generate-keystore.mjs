import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import readline from 'node:readline/promises';
const output = 'release-keystore.jks',
  key = 'metropocket-key.pem',
  cert = 'metropocket-cert.pem';
async function password() {
  const index = process.argv.indexOf('--password');
  if (index >= 0) {
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('--password requires a non-empty value.');
    return value;
  }
  if (process.env.KEYSTORE_PASSWORD || process.env.ANDROID_KEYSTORE_PASSWORD)
    return process.env.KEYSTORE_PASSWORD || process.env.ANDROID_KEYSTORE_PASSWORD;
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  const value = await input.question('Enter keystore password: ');
  input.close();
  if (!value) throw new Error('Password cannot be empty.');
  return value;
}
const clean = () =>
  [key, cert].forEach(file => {
    if (existsSync(file)) rmSync(file);
  });
const run = (command, args, env = {}) =>
  execFileSync(command, args, { env: { ...process.env, ...env }, stdio: 'pipe' });
if (existsSync(output)) throw new Error('Keystore already exists. Refusing to overwrite your signing identity.');
try {
  run('openssl', ['version']);
  const value = await password();
  run('openssl', ['genrsa', '-out', key, '2048']);
  run('openssl', [
    'req',
    '-new',
    '-x509',
    '-key',
    key,
    '-out',
    cert,
    '-days',
    '36500',
    '-subj',
    '/CN=MetroPocket/OU=Mobile/O=MetroPocket/C=IN',
  ]);
  run(
    'openssl',
    [
      'pkcs12',
      '-export',
      '-in',
      cert,
      '-inkey',
      key,
      '-out',
      output,
      '-name',
      'metropocket',
      '-passout',
      'env:OPENSSL_PASS',
    ],
    { OPENSSL_PASS: value },
  );
  clean();
  console.log(`Created ${output}\nAlias: metropocket\nFormat: PKCS12`);
} catch (cause) {
  clean();
  throw cause;
}
