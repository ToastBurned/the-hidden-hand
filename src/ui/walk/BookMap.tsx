/**
 * The Book's map: Cornhaven and Northgate End drawn as an engraving on parchment (Ed's reference,
 * 17 Nov: ink outlines, hatched water and fields, a cartouche and a compass), revealed only where
 * the founder has walked. Wheel or the buttons zoom; drag pans; pointing at a building names it and
 * whoever you know lives there.
 */
import { useEffect, useRef, useState } from 'react';
import type { Season } from '../../city/hand/season';
import { buildingLabel, residentsKnown } from '../../city/hand/story';
import { G_DEEP, G_WATER, U_FIELD, U_GARDEN, U_GATE, U_GRAVES, U_LOT, U_MAIN, U_ROAD, U_SQUARE, U_STREET, U_WALL } from '../../city/types';
import { SUBURB_NAME, TOWN_NAME } from '../../content/suburb';

const PX = 8; // engraving pixels per map cell
const INK = '#2b1f14';
const PARCH = '#e7d4a4';

/** Draw the whole town once, as an engraving. */
function engrave(s: Season): HTMLCanvasElement {
  const c = s.city, m = c.map;
  const cv = document.createElement('canvas');
  cv.width = m.w * PX; cv.height = m.h * PX;
  const g = cv.getContext('2d')!;
  g.fillStyle = PARCH; g.fillRect(0, 0, cv.width, cv.height);
  // foxing and grain
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < cv.width * cv.height / 60; i++) { g.fillStyle = `rgba(120,90,50,${rnd() * 0.08})`; g.fillRect(rnd() * cv.width, rnd() * cv.height, 1 + rnd() * 2, 1); }
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x, u = m.use[i], gr = m.ground[i];
    const X = x * PX, Y = y * PX;
    if (gr === G_WATER || gr === G_DEEP) {
      g.fillStyle = 'rgba(160,150,120,0.35)'; g.fillRect(X, Y, PX, PX);
      g.strokeStyle = 'rgba(43,31,20,0.45)'; g.lineWidth = 0.7;
      for (let k = 1; k < PX; k += 3) { g.beginPath(); g.moveTo(X, Y + k); g.quadraticCurveTo(X + PX / 2, Y + k + (x % 2 ? 1 : -1), X + PX, Y + k); g.stroke(); }
      continue;
    }
    if (u === U_FIELD) {
      g.strokeStyle = 'rgba(43,31,20,0.28)'; g.lineWidth = 0.6;
      const dir = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
      for (let k = 0; k < PX; k += 2) { g.beginPath(); if (dir) { g.moveTo(X + k, Y); g.lineTo(X + k, Y + PX); } else { g.moveTo(X, Y + k); g.lineTo(X + PX, Y + k); } g.stroke(); }
    } else if (u === U_GARDEN) {
      g.fillStyle = 'rgba(43,31,20,0.35)';
      for (let k = 0; k < 3; k++) g.fillRect(X + 1 + ((k * 3 + x) % PX), Y + 2 + k * 2, 1, 1);
    } else if (u === U_GRAVES) {
      g.fillStyle = INK; g.fillRect(X + 3, Y + 2, 1, 4); g.fillRect(X + 2, Y + 3, 3, 1);
    } else if (u === U_STREET || u === U_MAIN || u === U_SQUARE || u === U_ROAD) {
      g.fillStyle = 'rgba(245,232,200,0.7)'; g.fillRect(X, Y, PX, PX);
    }
  }
  // buildings: a pale roof, an inked outline, a ridge line
  for (const b of c.buildings.values()) {
    if (b.gone !== undefined) continue;
    const X = b.x * PX + 1, Y = b.y * PX + 1, W = b.w * PX - 2, H = b.h * PX - 2;
    g.fillStyle = b.made ? '#d8bd86' : '#dcc795'; g.fillRect(X, Y, W, H);
    g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1);
    g.strokeStyle = 'rgba(43,31,20,0.6)'; g.beginPath();
    if (W >= H) { g.moveTo(X + 2, Y + H / 2); g.lineTo(X + W - 2, Y + H / 2); } else { g.moveTo(X + W / 2, Y + 2); g.lineTo(X + W / 2, Y + H - 2); }
    g.stroke();
    // hatched shade on the south side
    g.strokeStyle = 'rgba(43,31,20,0.35)';
    for (let k = 2; k < W - 1; k += 2) { g.beginPath(); g.moveTo(X + k, Y + H - 3); g.lineTo(X + k - 2, Y + H - 1); g.stroke(); }
  }
  // the wall and its gates: a thick ink band with towers
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const u = m.use[y * m.w + x];
    if (u !== U_WALL && u !== U_GATE) continue;
    g.fillStyle = u === U_GATE ? '#4a3726' : INK; g.fillRect(x * PX + 1, y * PX + 1, PX - 2, PX - 2);
    if ((x * 7 + y * 13) % 11 === 0 || u === U_GATE) { g.beginPath(); g.arc(x * PX + PX / 2, y * PX + PX / 2, PX * 0.7, 0, Math.PI * 2); g.fillStyle = '#d8c08e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(); }
  }
  return cv;
}

export function BookMap({ s }: { s: Season }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const art = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState(() => {
    const sub = s.city.districts.find((d) => d.kind === 'suburb');
    return { z: 5, cx: (sub?.cx ?? s.city.map.w / 2) * PX, cy: (sub?.cy ?? s.city.map.h / 2) * PX };
  });
  const [hover, setHover] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const c = s.city, m = c.map;
  const CW = Math.ceil(m.w / 3);
  const seen = (x: number, y: number) => !!s.hand.explored[Math.floor(y / 3) * CW + Math.floor(x / 3)];
  const keyed = [...c.buildings.values()].filter((b) => b.gone === undefined && buildingLabel(s, b.id) && (seen(b.x, b.y) || b.id === s.house))
    .sort((a, b) => a.y - b.y || a.x - b.x).map((b) => ({ b, label: buildingLabel(s, b.id) }));

  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    if (!art.current) art.current = engrave(s);
    const box = el.parentElement!.getBoundingClientRect();
    const W = Math.floor(box.width), H = Math.floor(box.height);
    el.width = W; el.height = H;
    const g = el.getContext('2d')!;
    g.fillStyle = PARCH; g.fillRect(0, 0, W, H);
    const k = view.z / 2; // screen px per engraving px
    const ox = W / 2 - view.cx * k, oy = H / 2 - view.cy * k;
    g.imageSmoothingEnabled = true;
    g.drawImage(art.current, ox, oy, art.current.width * k, art.current.height * k);
    // fog: parchment over every unwalked chunk, softened
    const fog = document.createElement('canvas');
    fog.width = W; fog.height = H;
    const f = fog.getContext('2d')!;
    f.fillStyle = PARCH;
    const cs = 3 * PX * k;
    for (let cy = 0; cy < Math.ceil(m.h / 3); cy++) for (let cx = 0; cx < CW; cx++) {
      if (s.hand.explored[cy * CW + cx]) continue;
      f.fillRect(Math.floor(ox + cx * cs) - 1, Math.floor(oy + cy * cs) - 1, Math.ceil(cs) + 2, Math.ceil(cs) + 2);
    }
    g.save(); g.filter = `blur(${Math.max(3, cs / 3)}px)`; g.drawImage(fog, 0, 0); g.restore();
    g.drawImage(fog, 0, 0);
    // labels: districts you have seen into, and buildings you know
    g.textAlign = 'center';
    for (const d of c.districts) {
      if (!seen(Math.round(d.cx), Math.round(d.cy))) continue;
      g.font = `italic ${Math.round(11 + view.z * 2)}px Georgia, serif`;
      g.fillStyle = 'rgba(43,31,20,0.75)';
      g.fillText(d.kind === 'suburb' ? SUBURB_NAME.toUpperCase() : d.name.toUpperCase(), ox + d.cx * PX * k, oy + (d.cy * PX - (d.kind === 'suburb' ? 46 : 0)) * k);
    }
    // known buildings carry a number, keyed in the legend beside the map (as engraved town plans do)
    g.font = `bold ${Math.round(8 + view.z)}px Georgia, serif`;
    keyed.forEach(({ b }, i) => {
      const x = ox + (b.x + b.w / 2) * PX * k, y = oy + (b.y + b.h / 2) * PX * k;
      const r = 5 + view.z;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = b.id === s.house ? '#8a2c22' : 'rgba(245,236,215,0.95)'; g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      g.fillStyle = b.id === s.house ? '#f5ecd7' : INK; g.fillText(String(i + 1), x, y + 3 + view.z * 0.4);
    });
    // where you stand
    const mx = ox + (s.x / 5) * PX * k, my = oy + (s.y / 5) * PX * k;
    g.strokeStyle = '#8a2c22'; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, 5 + view.z, 0, Math.PI * 2); g.stroke();
    // the cartouche and the compass, fixed on the page
    g.textAlign = 'center';
    const tw = 260;
    g.fillStyle = 'rgba(231,212,164,0.95)'; g.fillRect(W / 2 - tw / 2, 10, tw, 46);
    g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(W / 2 - tw / 2 + 0.5, 10.5, tw, 46); g.strokeRect(W / 2 - tw / 2 + 4, 14, tw - 8, 39);
    g.fillStyle = INK; g.font = 'italic 11px Georgia, serif'; g.fillText(`MAP OF THE TOWN OF`, W / 2, 28);
    g.font = 'bold 18px Georgia, serif'; g.fillText(TOWN_NAME.toUpperCase(), W / 2, 48);
    const rx = W - 46, ry = H - 52;
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 1;
    g.beginPath(); g.arc(rx, ry, 22, 0, Math.PI * 2); g.stroke();
    for (const [a, len] of [[0, 30], [Math.PI / 2, 20], [Math.PI, 20], [-Math.PI / 2, 20]] as const) {
      g.beginPath(); g.moveTo(rx + Math.sin(a) * len, ry - Math.cos(a) * len); g.lineTo(rx + Math.cos(a) * 4, ry + Math.sin(a) * 4); g.lineTo(rx - Math.cos(a) * 4, ry - Math.sin(a) * 4); g.closePath(); g.fill();
    }
    g.font = 'bold 10px Georgia, serif'; g.fillText('N', rx, ry - 34);
    // the frame
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(4, 4, W - 8, H - 8); g.lineWidth = 0.8; g.strokeRect(8, 8, W - 16, H - 16);
    g.textAlign = 'start';
  }, [s, view, c, m, CW, keyed]);

  const toCell = (e: React.MouseEvent) => {
    const el = cv.current!;
    const r = el.getBoundingClientRect();
    const k = view.z / 2;
    const px = (e.clientX - r.left - el.width / 2) / k + view.cx, py = (e.clientY - r.top - el.height / 2) / k + view.cy;
    return { x: Math.floor(px / PX), y: Math.floor(py / PX), sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const zoom = (dz: number) => setView((v) => ({ ...v, z: Math.max(1, Math.min(10, v.z + dz)) }));
  return (
    <div className="book-map">
      <canvas ref={cv}
        onWheel={(e) => zoom(e.deltaY < 0 ? 0.5 : -0.5)}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; }}
        onMouseUp={() => { drag.current = null; }}
        onMouseLeave={() => { drag.current = null; setHover(null); }}
        onMouseMove={(e) => {
          const d = drag.current;
          if (d) { const k = view.z / 2; setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) / k, cy: d.cy - (e.clientY - d.y) / k })); setHover(null); return; }
          const { x, y, sx, sy } = toCell(e);
          if (x < 0 || y < 0 || x >= m.w || y >= m.h || !seen(x, y)) { setHover(null); return; }
          const bid = m.use[y * m.w + x] === U_LOT ? m.building[y * m.w + x] : -1;
          const title = bid >= 0 ? buildingLabel(s, bid) : '';
          if (!title) { setHover(null); return; }
          setHover({ x: sx, y: sy, title, lines: residentsKnown(s, bid) });
        }} />
      {keyed.length > 0 && <ol className="map-key">{keyed.map(({ b, label }) => <li key={b.id} className={b.id === s.house ? 'home' : ''}>{label}</li>)}</ol>}
      <div className="map-zoom"><button type="button" onClick={() => zoom(0.5)} aria-label="Zoom in">+</button><button type="button" onClick={() => zoom(-0.5)} aria-label="Zoom out">−</button></div>
      {hover && (
        <div className="map-tip" style={{ left: hover.x + 12, top: hover.y + 8 }}>
          <b>{hover.title}</b>
          {hover.lines.length ? hover.lines.map((l, i) => <div key={i} className="small">{l}</div>) : <div className="small muted">You know nobody who lives here.</div>}
        </div>
      )}
      <p className="small muted map-note">Only what you have walked is drawn. Point at a house to see who you know there.</p>
    </div>
  );
}
