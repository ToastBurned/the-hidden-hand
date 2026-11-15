// Turn dist-art/art.html (built by `npx vite build --config vite.art.config.ts`) into a
// standalone page that loads React from cdnjs: art-page.html in the given folder.
//   node tools/artpage.mjs [outDir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'dist-art';
const src = readFileSync('dist-art/art.html', 'utf8');
const pick = (re) => { const m = src.match(re); if (!m) throw new Error(`missing ${re}`); return m[1]; };
const title = pick(/<title>([\s\S]*?)<\/title>/);
const style = pick(/<style[^>]*>([\s\S]*?)<\/style>/);
const script = pick(/<script type="module" crossorigin>([\s\S]*?)<\/script>/);
const page = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&display=swap">
<style>${style}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${script.replace(/<\/script/gi, '<\\/script')}</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/art-page.html`, page);
console.log(`${out}/art-page.html`, page.length, 'bytes');
