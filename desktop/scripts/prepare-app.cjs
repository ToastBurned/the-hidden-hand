'use strict';
// Builds the web app (the same single file as app\HiddenHand.html) and copies it into desktop/app/,
// which is what the desktop window loads. Set HIDDENHAND_SKIP_BUILD=1 to reuse the last build.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });

if (!process.env.HIDDENHAND_SKIP_BUILD) {
  if (!fs.existsSync(path.join(root, 'node_modules'))) {
    console.log('Installing the web app\'s dependencies (first run only)...');
    run('npm ci --no-audit --no-fund');
  }
  console.log('Building the web app...');
  run('npm run build');
}
const src = [path.join(root, 'dist', 'index.html'), path.join(root, 'app', 'HiddenHand.html')].find((f) => fs.existsSync(f));
if (!src) throw new Error('No built app found. Run "npm run build" in the repository root first.');
const dest = path.join(__dirname, '..', 'app', 'index.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied ${path.relative(root, src)} -> desktop/app/index.html (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
