import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
const source = 'src/assets/metropocket.png',
  res = 'android/app/src/main/res';
if (!existsSync(res)) throw new Error('Run npm run android:add first.');
if (!existsSync(source))
  throw new Error(
    `Canonical artwork is not available at ${source}. Add approved MetroPocket artwork before generating Android assets.`,
  );
let command = 'magick';
try {
  execFileSync(command, ['-version'], { stdio: 'ignore' });
} catch {
  command = 'convert';
  execFileSync(command, ['-version'], { stdio: 'ignore' });
}
const convert = (size, art, out, bg = 'none') =>
  execFileSync(command, [
    source,
    '-background',
    bg,
    '-resize',
    `${art}x${art}`,
    '-gravity',
    'center',
    '-extent',
    `${size}x${size}`,
    out,
  ]);
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const folder = `${res}/mipmap-${density}`;
  mkdirSync(folder, { recursive: true });
  convert(size, Math.round(size * 0.7), `${folder}/ic_launcher.png`);
  copyFileSync(`${folder}/ic_launcher.png`, `${folder}/ic_launcher_round.png`);
  convert(Math.round((size * 108) / 48), Math.round((size * 60) / 48), `${folder}/ic_launcher_foreground.png`);
}
mkdirSync(`${res}/mipmap-anydpi-v26`, { recursive: true });
const adaptive =
  '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/metropocket_icon_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>';
['ic_launcher.xml', 'ic_launcher_round.xml'].forEach(file =>
  writeFileSync(`${res}/mipmap-anydpi-v26/${file}`, adaptive),
);
mkdirSync(`${res}/values`, { recursive: true });
writeFileSync(
  `${res}/values/metropocket_colors.xml`,
  '<resources><color name="metropocket_icon_background">#f4faf7</color></resources>',
);
mkdirSync(`${res}/drawable-nodpi`, { recursive: true });
mkdirSync('releases', { recursive: true });
convert(512, 288, `${res}/drawable-nodpi/metropocket_splash_logo.png`);
convert(512, 420, 'releases/playstore-icon.png', '#f4faf7');
