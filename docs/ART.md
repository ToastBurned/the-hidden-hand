# Pixel art for the one-city game (`src/ui/pixel`)

Phase 4 of the one-city rebuild: the city and the lodge drawn top-down in pixel art,
straight from the city engine's data (`src/city`, see `docs/CITY.md`). Every pixel is
procedural: there are no image files, so any seed gives a fully drawn city.

```
npm run art                    # the prototype page (vite dev, opens /art.html)
npm run build:art              # one self-contained page: dist-art/art.html, and art-page.html (React from a CDN)
npx tsx tools/artshots.ts 1 shots            # PNGs of the city in each style, no browser
LODGE=1 npx tsx tools/artshots.ts 1 shots    # PNG sheets of the lodge's four stages
```

The prototype page lives outside the game (`art.html`, `src/art/main.tsx`), so the 0.2.0
game is untouched.

## Files

| File | What it does |
|---|---|
| `px.ts` | A pixel buffer (`Px`, packed RGBA in a `Uint32Array`), hue-shifted colour ramps, hash and value noise, ordered dither. No DOM, so it runs in node too. |
| `styles.ts` | The three styles. A style is a scale (`cell` px per map cell, `tile` px per interior tile), a view (three-quarter or straight down), a texture amount, an outline mode and 5-step ramps for each material. |
| `city.ts` | `renderCity(city, style, { season, time })`: ground per pixel (warped so coasts are not blocky), streets, walls, quays, bridges, fields, gardens, graves, trees, ships at the quays, then every building back to front (roofs by kind and grandeur, facades in the three-quarter view, chimneys, towers, the cathedral's cross plan, mills, wharves), then dusk or night light with lit windows and lanterns. |
| `rooms.ts` | `renderFloor(interior, floor, style, opts)`: one floor of any building (`interiorOf` from `src/city/interior.ts`): floors by room kind, walls with faces, doors, windows, stairs, trapdoors and concealed doors, furniture by room kind, and people drawn from their `looks`. `visitor` hides what only the Order knows; `candle` lights it by candle and hearth. |
| `lodge.ts` | `lodgeDemo(city)`: picks a host house and writes its interior at four stages (back room, cellar, rooms below, hidden house) as real `Interior` data with lodge room kinds, `hidden` flags and the game's room names as tags. The Order layer can take this over for its real lodge. |
| `ArtLab.tsx`, `artlab.css` | The prototype page: style, season and light switches, a pannable, zoomable city, a building's floors on click, and the lodge screen. |

## The styles (none chosen yet)

- **Hearth**: 16 px a cell, three-quarter view (roof plus the street wall of every house), warm colour, outlines in each material's own dark.
- **Plan**: 16 px a cell, straight down, flat colour, one ink outline, little texture. Readability first.
- **Ledger**: 8 px a cell, straight down, dense and earthy; the whole city fits on one screen.

Rendering a whole 6,000-person city takes about 1.5 s at 16 px and 0.4 s at 8 px in node.

Added after Ed's first look (he liked Ledger's density and palette and Hearth's house fronts):

- **Ledger + fronts**: Ledger's palette and texture with the three-quarter view, at 10 px a cell (and a 12 px variant); interior tiles 12 px.
