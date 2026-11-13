/** Colour helpers. Entity colours come from hues stored in the engine. */
export const BIOME_COLORS: [number, number, number][] = [
  [22, 46, 78], // deep
  [36, 74, 112], // sea
  [52, 96, 138], // lake
  [228, 236, 240], // ice
  [160, 162, 140], // tundra
  [74, 104, 78], // taiga
  [166, 176, 98], // grassland
  [88, 130, 70], // temperate forest
  [214, 192, 140], // desert
  [186, 170, 92], // savanna
  [52, 112, 60], // jungle
  [92, 118, 96], // marsh
  [128, 118, 108], // mountains
  [140, 142, 98], // hills
];

const cache = new Map<number, [number, number, number]>();
export function hueColor(hue: number): [number, number, number] {
  const k = Math.round(hue) % 360;
  let c = cache.get(k);
  if (c) return c;
  c = hslToRgb(k / 360, 0.62, 0.52);
  cache.set(k, c);
  return c;
}
export const hueCss = (hue: number, l = 52) => `hsl(${Math.round(hue)}, 62%, ${l}%)`;

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function ramp(stops: [number, number, number][], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return [lerp(stops[i][0], stops[i + 1][0], f), lerp(stops[i][1], stops[i + 1][1], f), lerp(stops[i][2], stops[i + 1][2], f)] as [number, number, number];
}
const RAMPS: Record<string, [number, number, number][]> = {
  forest: [[236, 226, 196], [150, 180, 110], [40, 100, 50], [16, 60, 30]],
  game: [[240, 226, 200], [214, 160, 90], [150, 80, 40]],
  soil: [[230, 90, 60], [236, 210, 140], [120, 90, 50]],
  rain: [[220, 190, 130], [150, 200, 160], [50, 110, 190]],
  temp: [[70, 110, 210], [200, 220, 230], [240, 190, 90], [200, 60, 40]],
};
export function rampColor(t: number, kind: string): [number, number, number] {
  return ramp(RAMPS[kind] ?? RAMPS.forest, t);
}

/** Categorical series palette (validated order; dark-surface steps). */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
