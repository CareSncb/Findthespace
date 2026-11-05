// Turns src/game.html into a complete offline page in www/ for the native app.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');
rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, 'fonts'), { recursive: true });

let src = readFileSync(join(root, 'src', 'game.html'), 'utf8');

// The title and metadata move into a real <head>. Fonts ship with the app, so it works offline.
const titleMatch = src.match(/<title>.*?<\/title>/);
if (!titleMatch) throw new Error('src/game.html has no <title>');
src = src.replace(titleMatch[0], '');
src = src.replace(/<meta name="claude:viewport-fit-sides"[^>]*>\s*/, '');
src = src.replace(/<link rel="preconnect"[^>]*>\s*/, '');
src = src.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/, '');
if (src.includes('fonts.googleapis.com')) throw new Error('A remote font link is still present');

// The 3D libraries ship inside the app.
for (const f of ['three.min.js', 'three-post.js']) copyFileSync(join(root, 'assets', f), join(www, f));

const fonts = [
  ['Barlow Condensed', 800, '@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff2', 'italic'],
  ['Andika', 400, '@fontsource/andika/files/andika-latin-400-normal.woff2'],
  ['Andika', 700, '@fontsource/andika/files/andika-latin-700-normal.woff2'],
];
let faces = '';
for (const [family, weight, rel, style = 'normal'] of fonts) {
  const from = join(root, 'node_modules', rel);
  if (!existsSync(from)) {
    console.warn(`Font not installed, falling back to system font: ${rel}`);
    continue;
  }
  const file = rel.split('/').pop();
  copyFileSync(from, join(www, 'fonts', file));
  faces += `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};font-display:swap;src:url("fonts/${file}") format("woff2")}\n`;
}

const native = `body{padding-top:max(10px,env(safe-area-inset-top,0px));padding-bottom:max(10px,env(safe-area-inset-bottom,0px));-webkit-text-size-adjust:100%;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;overscroll-behavior:none}
input{-webkit-user-select:text;user-select:text}
`;
src = src.replace('<style>\n', `<style>\n${faces}`).replace('</style>', `${native}</style>`);

const end = src.indexOf('</style>') + '</style>'.length;
const page = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#091327">
${titleMatch[0]}
${src.slice(0, end)}
</head>
<body>
${src.slice(end)}
</body>
</html>
`;
writeFileSync(join(www, 'index.html'), page);
console.log(`www/index.html written, ${Math.round(page.length / 1024)} KB, ${faces ? faces.trim().split('\n').length : 0} fonts`);
