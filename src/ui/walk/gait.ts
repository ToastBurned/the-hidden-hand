/**
 * Walking people from the kit's turnaround sheets.
 *
 * The kit's people sheets (3x3 cells of 32x40) are turnarounds, not walk cycles: eight standing
 * poses, one per direction. Sheet cells: row 0 south-east, south, south-west; row 1 east, (empty),
 * west; row 2 north-east, north, north-west. Until real walk cycles are generated, a step is made
 * from each pose: facing the viewer or away, one foot lifts and then the other; in profile the
 * legs open into a stride. Four frames per direction: stand, step, stand, other step.
 */
import type { Kit } from './assets';

/** Eight ways to face, in the order of DIRS below. */
export type Dir8 = 'south' | 'southwest' | 'west' | 'northwest' | 'north' | 'northeast' | 'east' | 'southeast';
export const DIRS: Dir8[] = ['south', 'southwest', 'west', 'northwest', 'north', 'northeast', 'east', 'southeast'];
/** Sheet cell (column, row) of each direction's standing pose. */
const CELL: Record<Dir8, [number, number]> = {
  south: [1, 0], southwest: [2, 0], west: [2, 1], northwest: [2, 2],
  north: [1, 2], northeast: [0, 2], east: [0, 1], southeast: [0, 0],
};
export const FRAMES = 4;

/** The direction of a movement (dx, dy) in screen space, y down. */
export function dirOf(dx: number, dy: number): Dir8 {
  const a = Math.atan2(dx, dy); // 0 = south, +90deg = east
  const k = Math.round((a / (Math.PI * 2)) * 8);
  return (['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest'] as Dir8[])[((k % 8) + 8) % 8];
}

const sheets = new Map<string, HTMLCanvasElement>();

/** A canvas of FRAMES columns by eight rows (DIRS order) for one person sprite, made once. */
export function gaitSheet(kit: Kit, id: string): HTMLCanvasElement | null {
  const done = sheets.get(id);
  if (done) return done;
  const im = kit.img(id);
  if (!im.complete || !im.naturalWidth) return null;
  const [fw, fh] = kit.get(id).frame ?? [32, 40];
  const src = document.createElement('canvas');
  src.width = im.naturalWidth; src.height = im.naturalHeight;
  const sg = src.getContext('2d')!;
  sg.drawImage(im, 0, 0);
  const out = document.createElement('canvas');
  out.width = fw * FRAMES; out.height = fh * DIRS.length;
  const og = out.getContext('2d')!;
  DIRS.forEach((d, row) => {
    const [cx, cy] = CELL[d];
    const pose = sg.getImageData(cx * fw, cy * fh, fw, fh);
    const profile = d === 'east' || d === 'west';
    for (let f = 0; f < FRAMES; f++) {
      const img = f % 2 === 0 ? pose : step(pose, fw, fh, profile, f === 1 ? -1 : 1);
      og.putImageData(img, f * fw, row * fh);
    }
  });
  sheets.set(id, out);
  return out;
}

/** One step from a standing pose. side -1 moves the left leg, +1 the right. */
function step(pose: ImageData, w: number, h: number, profile: boolean, side: number): ImageData {
  const a = pose.data;
  let top = h, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 0) {
    top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
  }
  const out = new ImageData(w, h);
  if (bottom < 0) return out;
  const L = Math.max(4, Math.round((bottom - top + 1) * 0.27)); // the legs
  const legTop = bottom - L + 1;
  // the middle of the legs: average of opaque columns in the leg rows
  let sx = 0, n = 0;
  for (let y = legTop; y <= bottom; y++) for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 0) { sx += x; n++; }
  const mid = n ? sx / n : (left + right) / 2;
  const put = (x: number, y: number, from: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    if (a[from + 3] === 0) return;
    out.data[o] = a[from]; out.data[o + 1] = a[from + 1]; out.data[o + 2] = a[from + 2]; out.data[o + 3] = a[from + 3];
  };
  for (let y = 0; y < legTop; y++) for (let x = 0; x < w; x++) put(x, y, (y * w + x) * 4);
  for (let y = legTop; y <= bottom; y++) {
    const t = (y - legTop + 1) / L; // 0 at the hip, 1 at the feet
    for (let x = 0; x < w; x++) {
      const from = (y * w + x) * 4;
      const leftLeg = x < mid;
      if (profile) {
        // stride: the legs part, more towards the feet
        const o = Math.round(t * 2.4);
        put(x + (leftLeg ? -o : o), y, from);
      } else {
        // one foot lifts
        const lifted = side < 0 ? leftLeg : !leftLeg;
        put(x, y - (lifted ? Math.round(t * 2) : 0), from);
      }
    }
  }
  return out;
}
