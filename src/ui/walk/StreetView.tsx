/**
 * The first season on foot: the founder walks the live town, front-on, at 16 px tiles, with the
 * day clock running (docs/WALK.md, docs/SEASON.md).
 *
 * WASD or the arrow keys walk; a click walks there along the streets. E (or walking into it) goes
 * through a door you can use. P or Space pauses. The clock stops while a menu is open. Sleep is in
 * your own house from 18:00; Wait passes time where you stand.
 */
import { useEffect, useRef, useState } from 'react';
import { dateLabel, seasonAt } from '../../city/core';
import { B, BUILDING_NAMES, DAY_NAMES } from '../../city/constants';
import { BED_FROM, DAY_END, GAME_MIN_PER_REAL_S, GATES_OPEN, GATES_SHUT, WALK_TILES_PER_S, clockLabel } from '../../city/hand/clock';
import { canSleep, openAt, pass, sleep, standAtDoor, suburbCrossing, waitUntil, weekdayOf, type Facing, type Season } from '../../city/hand/season';
import type { Building } from '../../city/types';
import { doorCell, TILES_PER_CELL, walkPath } from '../../city/walk';
import { loadKit } from './assets';
import { GroundCache, drawLight, drawWorld, type Figure } from './draw';
import { Townsfolk } from './people';
import { TILE, buildScene, type Scene } from './scene';

interface WalkStat { tiles: number; gameMin: number; realS: number }

interface Props { s: Season; onSave: () => Promise<void>; onQuit: () => void }

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};

export function StreetView({ s, onSave, onQuit }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState<'wait' | 'quit' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dev, setDev] = useState(() => { try { return new URLSearchParams(location.search).has('dev') || localStorage.getItem('hiddenhand.dev') === '1'; } catch { return false; } });
  const [walk, setWalk] = useState<WalkStat | null>(null);
  const live = useRef({ paused: false, menu: false, inside: s.inside });
  live.current.paused = paused;
  live.current.menu = menu !== null;
  const c = s.city;
  const kit = loadKit();

  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? null : x)), 3500); };

  useEffect(() => {
    let raf = 0, last = performance.now(), alive = true;
    const keys = new Set<string>();
    let scene: Scene | null = null;
    const ground = new GroundCache(c, kit);
    const folk = new Townsfolk(c, s.founder);
    let route: { x: number; y: number }[] = [];
    let t = 0;
    let figs: Figure[] = [];
    let figsAt = -1;
    let seenBuildings = c.buildings.size;
    // the walk measurer: from first step to standing still for half a second
    let w: { tiles: number; min0: number; real0: number; still: number } | null = null;
    void kit.ready.then(() => { scene = buildScene(c, kit, s.house); });

    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (KEYS[e.code]) { keys.add(e.code); route = []; e.preventDefault(); }
      if (e.code === 'KeyP' || e.code === 'Space') { setPaused((p) => !p); e.preventDefault(); }
      if (e.code === 'KeyE') tryDoor(true);
      if (e.code === 'Backquote') setDev((d) => { const n = !d; try { localStorage.setItem('hiddenhand.dev', n ? '1' : '0'); } catch { /* fine */ } return n; });
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.code); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const blur = () => keys.clear();
    window.addEventListener('blur', blur);

    const cellAt = (tx: number, ty: number) => Math.floor(ty / TILES_PER_CELL) * c.map.w + Math.floor(tx / TILES_PER_CELL);

    /** Go through a door if the founder stands at one of the doors they can use. */
    function tryDoor(explicit: boolean, blockedCell = -1): boolean {
      if (!scene || s.inside >= 0) return false;
      const here = cellAt(s.x, s.y);
      for (const [bid, dc] of scene.doors) {
        if (dc !== here) continue;
        const b = c.buildings.get(bid)!;
        if (blockedCell >= 0 && c.map.building[blockedCell] !== bid) continue;
        s.inside = bid; live.current.inside = bid;
        setTick((n) => n + 1);
        return true;
      }
      if (explicit || blockedCell >= 0) {
        const bid = blockedCell >= 0 ? c.map.building[blockedCell] : -1;
        const b = bid >= 0 ? c.buildings.get(bid) : undefined;
        if (b && doorCell(c.map, b) === here) say(c.districts.find((d) => d.id === b.district)?.kind === 'suburb' ? 'The door stays shut. Nobody here knows you yet.' : 'The door stays shut to a stranger.');
      }
      return false;
    }

    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const running = !live.current.paused && !live.current.menu;
      if (running) {
        t += dt;
        const before = s.minute;
        if (pass(s, dt * GAME_MIN_PER_REAL_S) === 'midnight') { say('Past midnight. You stumble home and sleep late.'); route = []; ground.invalidate(); }
        void before;
        // walking
        if (s.inside < 0) {
          let dx = 0, dy = 0;
          for (const k of keys) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
          if (!dx && !dy && route.length) {
            const nx = route[0].x - s.x, ny = route[0].y - s.y;
            const d = Math.hypot(nx, ny);
            if (d < 0.25) route.shift(); else { dx = nx / d; dy = ny / d; }
          }
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            dx /= len; dy /= len;
            const step = WALK_TILES_PER_S * dt;
            const ox = s.x, oy = s.y;
            const tx = s.x + dx * step, ty = s.y + dy * step;
            const free = (x: number, y: number) => openAt(c, x - 0.3, y) && openAt(c, x + 0.3, y) && openAt(c, x - 0.3, y - 0.25) && openAt(c, x + 0.3, y - 0.25);
            if (free(tx, s.y)) s.x = tx;
            if (free(s.x, ty)) s.y = ty;
            const moved = Math.hypot(s.x - ox, s.y - oy);
            if (Math.abs(dx) > Math.abs(dy)) s.facing = dx > 0 ? 'east' : 'west'; else s.facing = (dy > 0 ? 'south' : 'north') as Facing;
            if (moved < step * 0.2) {
              // walked into something: a door you can use opens
              const probe = cellAt(s.x + dx * 0.8, s.y + dy * 0.8);
              if (c.map.building[probe] >= 0) tryDoor(false, probe);
            }
            if (!w) w = { tiles: 0, min0: s.minute, real0: now, still: 0 };
            w.tiles += moved; w.still = 0;
          } else if (w) {
            w.still += dt;
            if (w.still > 0.5) {
              const stat = { tiles: w.tiles, gameMin: s.minute - w.min0 - w.still * GAME_MIN_PER_REAL_S, realS: (now - w.real0) / 1000 - w.still };
              if (stat.tiles > 2) { setWalk(stat); (window as unknown as { hiddenHandLastWalk?: WalkStat }).hiddenHandLastWalk = stat; }
              w = null;
            }
          }
        }
      }
      // townsfolk: worked out a few times a second
      const cam = { x: s.x * TILE, y: s.y * TILE };
      if (now - figsAt > 120) {
        figsAt = now;
        const cx = s.x / TILES_PER_CELL, cy = s.y / TILES_PER_CELL;
        figs = folk.visible(weekdayOf(s), s.minute, cx, cy, 16).map((p) => ({ x: p.x * TILES_PER_CELL * TILE, y: p.y * TILES_PER_CELL * TILE, sprite: p.sprite, facing: p.facing, moving: p.moving, t: t + p.pid }));
      }
      if (c.buildings.size !== seenBuildings && scene) { seenBuildings = c.buildings.size; scene = buildScene(c, kit, s.house); ground.invalidate(); }
      // draw
      const cv = canvas.current;
      if (cv && scene) {
        const box = cv.parentElement!.getBoundingClientRect();
        const zoom = Math.max(1, Math.round(Math.min(box.width / (26 * TILE), box.height / (15 * TILE))));
        const vw = Math.ceil(box.width / zoom), vh = Math.ceil(box.height / zoom);
        if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; cv.style.width = `${vw * zoom}px`; cv.style.height = `${vh * zoom}px`; }
        const g = cv.getContext('2d')!;
        g.imageSmoothingEnabled = false;
        g.fillStyle = '#0f0d0c'; g.fillRect(0, 0, vw, vh);
        const me: Figure = { x: cam.x, y: cam.y, sprite: 'people/player-walk', facing: s.facing, moving: running && (keys.size > 0 || route.length > 0), t };
        // mark each usable door on the edge of its doorstep that touches the building
        const doorsShown = [...scene.doors.entries()].map(([bid, dc]) => {
          const b = c.buildings.get(bid)!;
          const dx = dc % c.map.w, dy = Math.floor(dc / c.map.w);
          const cs = TILES_PER_CELL * TILE;
          if (dy === b.y + b.h) return { x: (dx + 0.5) * cs, y: dy * cs + 3 };
          if (dy === b.y - 1) return { x: (dx + 0.5) * cs, y: (dy + 1) * cs - 2 };
          if (dx === b.x + b.w) return { x: dx * cs + 10, y: (dy + 0.5) * cs };
          return { x: (dx + 1) * cs - 10, y: (dy + 0.5) * cs };
        });
        drawWorld(g, kit, ground, scene, s.inside >= 0 ? figs : [...figs, me], cam.x, cam.y, vw, vh, doorsShown);
        drawLight(g, s.minute, seasonAt(c, c.day), scene.lamps, cam.x, cam.y, vw, vh);
      }
      if (Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) setTick((n) => n + 1);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const click = (e: MouseEvent) => {
      const cv = canvas.current;
      if (!cv || s.inside >= 0) return;
      const r = cv.getBoundingClientRect();
      const zoom = r.width / cv.width;
      const wx = s.x * TILE + ((e.clientX - r.left) / zoom - cv.width / 2);
      const wy = s.y * TILE + ((e.clientY - r.top) / zoom - cv.height / 2);
      const target = Math.floor(wy / TILE / TILES_PER_CELL) * c.map.w + Math.floor(wx / TILE / TILES_PER_CELL);
      const path = walkPath(c.map, cellAt(s.x, s.y), target);
      if (path.length < 2) { say('There is no way there on foot.'); return; }
      route = path.slice(1).map((i) => ({ x: (i % c.map.w + 0.5) * TILES_PER_CELL, y: (Math.floor(i / c.map.w) + 0.5) * TILES_PER_CELL }));
      route[route.length - 1] = { x: wx / TILE, y: wy / TILE };
    };
    canvas.current?.addEventListener('click', click);

    // a handle for playtests and the browser walk test
    (window as unknown as { hiddenHandSeason?: unknown }).hiddenHandSeason = {
      s,
      crossing: () => {
        const w0 = suburbCrossing(c);
        const at = (id: number) => { const dc = doorCell(c.map, c.buildings.get(id)!); return { cell: dc, x: (dc % c.map.w + 0.5) * TILES_PER_CELL, y: (Math.floor(dc / c.map.w) + 0.5) * TILES_PER_CELL }; };
        const a = at(w0.from), b = at(w0.to);
        const path = walkPath(c.map, a.cell, b.cell).map((i) => ({ x: (i % c.map.w + 0.5) * TILES_PER_CELL, y: (Math.floor(i / c.map.w) + 0.5) * TILES_PER_CELL }));
        return { cells: w0.cells, from: a, to: b, path };
      },
      teleport: (x: number, y: number) => { s.x = x; s.y = y; s.inside = -1; route = []; },
    };
    const cv0 = canvas.current;
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); cv0?.removeEventListener('click', click); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const inside = s.inside >= 0 ? c.buildings.get(s.inside) : undefined;
  const here = c.map.district[Math.floor(s.y / TILES_PER_CELL) * c.map.w + Math.floor(s.x / TILES_PER_CELL)];
  const district = c.districts.find((d) => d.id === here);
  const shut = s.minute >= GATES_SHUT || s.minute < GATES_OPEN;
  const doSleep = () => { sleep(s); setMenu(null); setTick((n) => n + 1); void onSave(); say(`${dateLabel(c)}. You wake in the damp house.`); };
  const waits: [string, number][] = [['An hour', Math.min(DAY_END - 1, s.minute + 60)], ['Until noon', 12 * 60], ['Until 18:00', 18 * 60], ['Until 21:00', 21 * 60]];

  return (
    <div className="street">
      <div className="street-canvas"><canvas ref={canvas} /></div>
      <header className="street-hud">
        <div>
          <b>{dateLabel(c)}</b> · {DAY_NAMES[weekdayOf(s)]} · <span className="clock">{clockLabel(s.minute)}</span>
          {paused && <span className="paused"> · paused</span>}
        </div>
        <div className="muted small">{inside ? `Inside: ${buildingTitle(inside, s.house)}` : district ? district.name : 'Open country'}{shut ? ' · the gates are shut' : ''}</div>
      </header>
      <nav className="street-bar">
        <button type="button" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" onClick={() => setMenu(menu === 'wait' ? null : 'wait')}>Wait</button>
        <button type="button" disabled={!canSleep(s)} title={s.minute < BED_FROM ? 'You can go to bed from 18:00' : s.inside !== s.house ? 'Sleep in your own house' : ''} onClick={doSleep}>Sleep</button>
        <button type="button" disabled title="The Book of the Hand comes in the next milestone">Book</button>
        <button type="button" onClick={() => void onSave().then(() => say('Saved.'))}>Save</button>
        <button type="button" onClick={() => setMenu('quit')}>Menu</button>
      </nav>
      {inside && (
        <section className="street-inside">
          <h2>{buildingTitle(inside, s.house)}</h2>
          <p>{insideText(inside, s.house)}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => { standAtDoor(s, inside); setTick((n) => n + 1); }}>Go out</button>
            {inside.id === s.house && <button type="button" disabled={!canSleep(s)} onClick={doSleep}>Sleep{s.minute < BED_FROM ? ' (from 18:00)' : ''}</button>}
          </div>
        </section>
      )}
      {menu === 'wait' && (
        <section className="street-menu">
          <h3>Wait here</h3>
          <div className="actions">
            {waits.filter(([, m]) => m > s.minute).map(([label, m]) => <button key={label} type="button" onClick={() => { waitUntil(s, m); setMenu(null); setTick((n) => n + 1); }}>{label}</button>)}
            <button type="button" onClick={() => setMenu(null)}>Never mind</button>
          </div>
        </section>
      )}
      {menu === 'quit' && (
        <section className="street-menu">
          <h3>Leave the game?</h3>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void onSave().then(onQuit)}>Save and leave</button>
            <button type="button" onClick={() => setMenu(null)}>Stay</button>
          </div>
        </section>
      )}
      {toast && <div className="street-toast">{toast}</div>}
      {dev && (
        <aside className="street-dev">
          <div>Dev · {s.x.toFixed(1)}, {s.y.toFixed(1)} tiles</div>
          <div>Last walk: {walk ? `${walk.tiles.toFixed(0)} tiles, ${walk.gameMin.toFixed(1)} game min, ${walk.realS.toFixed(1)} s` : 'none yet'}</div>
          <div>Suburb crossing target: 25 to 35 game min</div>
        </aside>
      )}
    </div>
  );
}

function buildingTitle(b: Building, house: number): string {
  if (b.id === house) return 'Your house';
  return b.name || BUILDING_NAMES[b.kind] || 'A building';
}

function insideText(b: Building, house: number): string {
  if (b.id === house) return 'Damp walls, a cold hearth, and the lodgers moving about upstairs. In the kitchen floor, under rubble, is a door bricked shut. (Clearing the house and the cellar come in milestone 3.)';
  if (b.kind === B.tavern) return 'Low beams, smoke and talk that stops when a stranger comes in. (Talking to people comes in milestone 2.)';
  if (b.kind === B.chapel) return 'Cold stone and candle smoke. The suburb comes here on Sunday mornings.';
  if (b.kind === B.smithy) return 'The forge is hot and the smith is busy. He will sell you a pry bar, once you can talk to him.';
  return '';
}
