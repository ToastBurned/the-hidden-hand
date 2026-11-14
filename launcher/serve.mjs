// Serves the built app on http://localhost:5179 and opens it in the default browser.
// Only needed if your browser refuses to run HiddenHand.html directly from disk.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [join(root, 'dist', 'index.html'), join(root, 'app', 'HiddenHand.html')];
const file = candidates.find((f) => existsSync(f));
if (!file) {
  console.error('No built app found. Run "npm run build" first.');
  process.exit(1);
}
const port = Number(process.env.PORT ?? 5179);
createServer(async (req, res) => {
  if (req.url === '/' || req.url?.startsWith('/index.html') || req.url?.startsWith('/?') || req.url?.startsWith('/#')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}/`;
  console.log(`The Hidden Hand is running at ${url}  (close this window to stop it)`);
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
});
