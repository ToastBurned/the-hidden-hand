// Turn a page built by the art or play Vite config into a standalone page that loads React
// from cdnjs.
//   node tools/artpage.mjs [outDir] [source html] [output name]
// Defaults: dist-art, dist-art/art.html, art-page.html.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'dist-art';
const src = readFileSync(process.argv[3] ?? 'dist-art/art.html', 'utf8');
const outName = process.argv[4] ?? 'art-page.html';
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
writeFileSync(`${out}/${outName}`, page);
console.log(`${out}/${outName}`, page.length, 'bytes');
