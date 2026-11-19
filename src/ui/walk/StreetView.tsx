/**
 * The first season on foot: the founder walks the live town, front-on, at 16 px tiles, with the
 * day clock running (docs/WALK.md, docs/SEASON.md).
 *
 * WASD or the arrow keys walk; a click walks there along the streets. E goes through a door,
 * talks to the nearest person, or uses the furniture you stand at. Inside a building the room is
 * drawn instead of the street; walk out through the door at the bottom. B opens the Book of the
 * Hand. P or Esc pauses. The clock stops while any screen is open. Sleep is in your own bed from
 * 18:00; Wait passes time where you stand.
 */
import { useEffect, useRef, useState } from 'react';
import { dateLabel, seasonAt } from '../../city/core';
import { B, BUILDING_NAMES, DAY_NAMES } from '../../city/constants';
import { BED_FROM, DAY_END, GAME_MIN_PER_REAL_S, GATES_OPEN, GATES_SHUT, WALK_TILES_PER_S, clockLabel } from '../../city/hand/clock';
import { sighted } from '../../city/hand/day';
import { oddJob } from '../../city/hand/house';
import { MEETING_AT, invited, meetingDue, oathReady } from '../../city/hand/lodge';
import { dig, goBelow, passageOpen } from '../../city/hand/cellar';
import { CAST_BY_KEY, G, checkGoals, say as sayLine } from '../../city/hand/story';
import { GOALS, LOCKS, SEARCHES } from '../../content/suburb';
import { canSleep, openAt, pass, seasonDay, sleep, standAtDoor, suburbCrossing, waitUntil, weekdayOf, type Facing, type Season } from '../../city/hand/season';
import type { Building } from '../../city/types';
import { doorCell, TILES_PER_CELL, walkPath } from '../../city/walk';
import { audio, playCue, wireAudio } from '../audio';
import { setAudioSettings, useAudioSettings } from '../audio/settings';
import { dirOf } from './gait';
import { Townsfolk, walkerAt, type Walker } from './people';
import { loadKit } from './assets';
import { GroundCache, drawLight, drawWorld, type Figure } from './draw';
import { TILE, blockedAt, buildScene, type Scene } from './scene';
import { G_DEEP, G_WATER, U_LOT } from '../../city/types';
import { cellarRoom, drawRoom, freeIn, presentIn, roomOf, spriteOfPerson, type Furn, type Room } from './interior';
import { Book, unreadIn, type Section } from './Book';
import { ChestPanel, EndPanel, InventoryPanel, MeetingPanel, MorningPage, NightPanel, NotePanel, OathPanel, PlacedPanel, RepairsPanel, TalkPanel } from './panels';

interface WalkStat { tiles: number; gameMin: number; realS: number }

interface Props { s: Season; onSave: () => Promise<void>; onQuit: () => void }

type Panel =
  | { kind: 'talk'; pid: number }
  | { kind: 'book'; start: Section }
  | { kind: 'things' }
  | { kind: 'chest'; chest: number }
  | { kind: 'placed'; id: number }
  | { kind: 'note'; title: string; lines: string[] }
  | { kind: 'oath' }
  | { kind: 'meeting' }
  | { kind: 'night' }
  | { kind: 'repairs' }
  | { kind: 'morning' }
  | { kind: 'end' };

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};

const seasonName = (i: number) => (['spring', 'summer', 'autumn', 'winter'] as const)[((i % 4) + 4) % 4];

/** The goal the HUD names: the first open main goal. */
function goal(s: Season): string {
  if (s.hand.ended) return 'The spring is over. Read the Order’s letter.';
  const g = GOALS.find((x) => !x.side && s.hand.goals[x.key] && s.hand.goals[x.key].done < 0);
  return g ? `${g.title} · ${sayLine(new G(s), g.hint)}` : 'Walk the suburb. Talk to people.';
}

export function StreetView({ s, onSave, onQuit }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState<'wait' | 'quit' | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hint, setHint] = useState<string>('');
  const [dev, setDev] = useState(() => { try { return new URLSearchParams(location.search).has('dev') || localStorage.getItem('hiddenhand.dev') === '1'; } catch { return false; } });
  const [walk, setWalk] = useState<WalkStat | null>(null);
  const live = useRef({ paused: false, menu: false, endSeen: false, reminded: -1, oathAsked: -1, panelKind: '' as string });
  const api = useRef<{ use: () => void; exit: () => void } | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sound = useAudioSettings();
  live.current.paused = paused;
  live.current.menu = menu !== null || panel !== null;
  live.current.panelKind = panel?.kind ?? '';
  const c = s.city;
  const kit = loadKit();

  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast((x) => (x === t ? null : x)), 4000); };

  useEffect(() => { wireAudio(); audio.setScene('play'); return () => audio.setScene('title'); }, []);

  useEffect(() => {
    let raf = 0, last = performance.now(), alive = true;
    const keys = new Set<string>();
    let scene: Scene | null = null;
    const ground = new GroundCache(c, kit);
    const folk = new Townsfolk(c, s.founder);
    let route: { x: number; y: number }[] = [];
    let t = 0;
    let figs: Figure[] = [];
    let folkNow: Walker[] = [];
    let atDoor = -1, atPerson = -1;
    let figsAt = -1;
    let seenBuildings = c.buildings.size;
    // inside: the room, the founder's place in it (tiles), who is there and where they stand
    let room: Room | null = null, roomId = -1, roomKey = '';
    let ix = 0, iy = 0;
    let present: { pid: number; x: number; y: number }[] = [];
    let presentAt = -1;
    let target: { x: number; y: number; then?: () => void } | null = null;
    let origin = { ox: 0, oy: 0 };
    let w: { tiles: number; min0: number; real0: number; still: number } | null = null;
    void kit.ready.then(() => {
      scene = buildScene(c, kit, s.house);
      sceneRef.current = scene;
      const d = scene.doors.get(s.house);
      if (d && s.inside < 0 && Math.hypot(s.x * TILE - d.x, s.y * TILE - d.y) < 90 && openAt(c, d.x / TILE, d.y / TILE + 0.6)) { s.x = d.x / TILE; s.y = d.y / TILE + 0.6; }
    });

    const cellarKey = () => { const cl = s.hand.cellar; return `${cl.chest}|${cl.rubble.join(',')}|${cl.passage}|${cl.furniture.map((f) => `${f.id}:${f.x}:${f.y}`).join(';')}`; };
    const below = (down: boolean) => {
      playCue('door');
      goBelow(s, down);
      present = []; presentAt = -1; target = null; keys.clear();
      if (down) { room = cellarRoom(s); roomId = -2; roomKey = cellarKey(); ix = s.bx; iy = s.by; }
      else { const b = c.buildings.get(s.house)!; room = roomOf(s, b); roomId = b.id; roomKey = ''; const td = room.furn.find((f) => f.use === 'cellar'); ix = td ? td.x : room.door.x; iy = td ? td.y + 1 : room.door.y - 1; }
      setTick((n) => n + 1);
    };
    const enter = (bid: number) => {
      const b = c.buildings.get(bid)!;
      s.inside = bid;
      playCue('door');
      room = roomOf(s, b); roomId = bid;
      ix = room.door.x; iy = room.door.y - 0.5;
      s.facing = 'north';
      present = []; presentAt = -1; target = null;
      if (!s.hand.visited.includes(bid)) s.hand.visited.push(bid);
      keys.clear(); route = [];
      setTick((n) => n + 1);
    };
    const exit = () => {
      const b = c.buildings.get(s.inside);
      if (!b) { s.inside = -1; return; }
      const d = scene?.doors.get(b.id);
      playCue('door');
      standAtDoor(s, b);
      if (d && openAt(c, d.x / TILE, d.y / TILE + 0.6)) { s.x = d.x / TILE; s.y = d.y / TILE + 0.6; }
      s.facing = 'south';
      room = null; roomId = -1; present = []; target = null;
      keys.clear();
      setTick((n) => n + 1);
    };

    /** Is this door open to the founder now? Their own house always; others by day; the tavern until midnight. */
    const doorWhy = (b: Building): string => {
      if (b.id === s.house) return '';
      const lock = b.made ? LOCKS[b.made] : undefined;
      if (lock) return s.hand.inv[lock.item] ? '' : lock.shut;
      if (b.made === 'T' && new G(s).flag('rufus-gone')) return 'The Bell is shut and its shutters barred.';
      if (b.kind === B.tavern) return s.minute < 5 * 60 ? 'The tavern is shut.' : '';
      const night = s.minute >= 21 * 60 || s.minute < 6 * 60;
      if (night) return 'The door is barred for the night.';
      return '';
    };

    function tryDoor(explicit: boolean): boolean {
      if (!scene || s.inside >= 0) return false;
      const px = s.x * TILE, py = s.y * TILE;
      let best = -1, bd = Infinity;
      for (const [bid, d] of scene.doors) {
        const dx = Math.abs(d.x - px), dy = py - d.y;
        if (dx > 48 || dy < -14 || dy > 40) continue;
        const dist = dx + Math.abs(dy);
        if (dist < bd) { bd = dist; best = bid; }
      }
      if (best < 0) return false;
      const b = c.buildings.get(best)!;
      const why = scene.doors.get(best)!.open ? doorWhy(b) : 'The door stays shut.';
      if (why) { if (explicit) say(why); return explicit; }
      enter(best);
      return true;
    }

    /** The nearest person on the street within reach, or -1. */
    const nearWalker = (reach: number) => {
      let best = -1, bd = reach;
      for (const p of folkNow) {
        if (!walkerAt(p, s.minute)) continue;
        const d = Math.hypot(p.x * TILES_PER_CELL - s.x, p.y * TILES_PER_CELL - s.y);
        if (d < bd) { bd = d; best = p.pid; }
      }
      return best;
    };
    const talk = (pid: number) => { keys.clear(); route = []; setPanel({ kind: 'talk', pid }); };

    /** Use what you stand at inside: a piece of furniture, or the nearest person. */
    const useInside = (f: Furn) => {
      const b = c.buildings.get(roomId)!;
      switch (f.use) {
        case 'bed':
          if (!canSleep(s)) { say(s.minute < BED_FROM ? 'Too early to sleep. You can go to bed from 18:00.' : 'Sleep in your own bed.'); return; }
          doSleepNow(); return;
        case 'desk': setPanel({ kind: 'book', start: 'Letters' }); return;
        case 'cellar': below(true); return;
        case 'up': below(false); return;
        case 'chest': setPanel({ kind: 'chest', chest: -1 }); return;
        case 'placed': setPanel({ kind: 'placed', id: Number(f.arg) }); return;
        case 'dig': {
          if (f.arg === 'arch' && passageOpen(s)) { say('The old way runs under the garden to the lane behind the chapel. Your people can come and go by it unseen.'); return; }
          const out = dig(s, f.arg === 'arch' ? { kind: 'arch' } : { kind: 'rubble', i: Number(f.arg) });
          if (s.hand.inv.shovel) playCue('dig');
          for (const l of checkGoals(s)) out.push(l);
          setPanel({ kind: 'note', title: f.arg === 'arch' ? 'The bricked arch' : 'The fallen end', lines: out });
          return;
        }
        case 'search': {
          const [letter, id] = String(f.arg).split(':');
          const sp = SEARCHES[letter]?.find((x) => x.id === id);
          const fk = `searched:${letter}:${id}`;
          if (!sp) return;
          if (s.hand.flags[fk]) { say('You have searched there already.'); return; }
          const g = new G(s); s.hand.flags[fk] = 1; sp.do(g); pass(s, 20); playCue('page');
          const lines = [...sp.say.map((l) => sayLine(g, l)), ...g.notes, ...checkGoals(s)];
          setPanel({ kind: 'note', title: f.label ?? 'Searching', lines });
          return;
        }
        case 'hearth': setPanel({ kind: 'repairs' }); return;
        case 'shop': {
          const g = new G(s);
          const keeper = present.find((x) => { const ch = CAST_BY_KEY[c.people.get(x.pid)?.authored ?? '']; return ch?.talk.shop && (!ch.talk.shop.when || ch.talk.shop.when(g)); });
          if (keeper) talk(keeper.pid); else say(b.kind === B.smithy ? 'Thorne is not at the forge just now.' : 'Nobody is serving just now.');
          return;
        }
        case 'job': { const m = oddJob(s); say(m); setTick((n) => n + 1); return; }
        case 'pray': pass(s, 20); say(b.kind === B.chapel ? 'You kneel a while in the candle smoke. Nobody speaks to you.' : 'A quiet moment.'); return;
      }
    };
    const nearInside = (): { pid: number; furn?: undefined } | { furn: Furn; pid?: undefined } | null => {
      if (!room) return null;
      let bestF: Furn | null = null, bf = 1.7;
      for (const f of room.furn) { if (!f.use) continue; const d = Math.hypot(f.x - ix, f.y - 0.3 - iy); if (d < bf) { bf = d; bestF = f; } }
      let bestP = -1, bp = 1.5;
      for (const p of present) { const d = Math.hypot(p.x - ix, p.y - iy); if (d < bp) { bp = d; bestP = p.pid; } }
      if (bestP >= 0 && (!bestF || bp < bf)) return { pid: bestP };
      return bestF ? { furn: bestF } : null;
    };
    const use = () => {
      if (live.current.menu) return;
      if (s.inside >= 0) {
        const n = nearInside();
        if (!n) { say('Walk up to someone, or to something you can use, and press E.'); return; }
        if (n.pid !== undefined) talk(n.pid); else useInside(n.furn);
        return;
      }
      if (tryDoor(true)) return;
      const pid = nearWalker(2.2);
      if (pid >= 0) talk(pid); else say('Nothing here. Stand at a door or by someone and press E.');
    };
    api.current = { use, exit };

    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Escape' && live.current.menu) {
        const k = live.current.panelKind;
        if (k === 'talk') closeTalkRef.current?.();
        else if (k !== 'meeting' && k !== 'night' && k !== 'end') { if (k === 'morning') s.hand.morning = null; setPanel(null); }
        setMenu(null); e.preventDefault(); return;
      }
      if (live.current.menu) return;
      if (KEYS[e.code]) { keys.add(e.code); route = []; target = null; atDoor = -1; atPerson = -1; e.preventDefault(); }
      if (e.code === 'KeyP' || e.code === 'Escape') { setPaused((p) => !p); e.preventDefault(); }
      if (e.code === 'KeyE') use();
      if (e.code === 'KeyB') setPanel({ kind: 'book', start: 'Goals' });
      if (e.code === 'KeyI') setPanel({ kind: 'things' });
      if (e.code === 'Backquote') setDev((d) => { const n = !d; try { localStorage.setItem('hiddenhand.dev', n ? '1' : '0'); } catch { /* fine */ } return n; });
    };
    const up = (e: KeyboardEvent) => { keys.delete(e.code); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const blur = () => keys.clear();
    window.addEventListener('blur', blur);

    const cellAt = (tx: number, ty: number) => Math.floor(ty / TILES_PER_CELL) * c.map.w + Math.floor(tx / TILES_PER_CELL);

    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const running = !live.current.paused && !live.current.menu;
      if (s.below) {
        // the cellar: rebuilt when something in it changes
        const ck = cellarKey();
        if (roomKey !== ck) { const fresh = roomId !== -2; room = cellarRoom(s); roomId = -2; roomKey = ck; if (fresh) { ix = s.bx; iy = s.by; } }
        s.bx = ix; s.by = iy;
      } else if (s.inside >= 0 && roomId !== s.inside) {
        // inside without a room: a load, or sleep put us at home
        const b = c.buildings.get(s.inside);
        if (b) { room = roomOf(s, b); roomId = b.id; roomKey = ''; ix = room.door.x; iy = room.door.y - 1.2; } else s.inside = -1;
      }
      if (s.inside < 0 && !s.below && room) { room = null; roomId = -1; }
      let moving = false;
      if (running) {
        t += dt;
        if (pass(s, dt * GAME_MIN_PER_REAL_S) === 'midnight') { say('Past midnight. You stumble home and sleep late.'); route = []; ground.invalidate(); }
        let dx = 0, dy = 0;
        for (const k of keys) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
        if ((s.inside >= 0 || s.below) && room) {
          // walking inside the room
          if (!dx && !dy && target) {
            const nx = target.x - ix, ny = target.y - iy, d = Math.hypot(nx, ny);
            if (d < 0.2) { const then = target.then; target = null; then?.(); } else { dx = nx / d; dy = ny / d; }
          }
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            dx /= len; dy /= len;
            const step = WALK_TILES_PER_S * 0.6 * dt;
            const ox = ix, oy = iy;
            if (freeIn(room, ix + dx * step, iy)) ix += dx * step;
            if (freeIn(room, ix, iy + dy * step)) iy += dy * step;
            if (Math.hypot(ix - ox, iy - oy) < step * 0.2 && target) target = null;
            s.facing = dirOf(dx, dy) as Facing;
            moving = true;
            // out through the door at the front
            if (!s.below && dy > 0.5 && iy > room.h - 0.3 && Math.abs(ix - room.door.x) < 1.2) exit();
          }
        } else if (s.inside < 0) {
          if (!dx && !dy && route.length) {
            const nx = route[0].x - s.x, ny = route[0].y - s.y;
            const d = Math.hypot(nx, ny);
            if (d < 0.25) {
              route.shift();
              if (!route.length && atDoor >= 0) { atDoor = -1; tryDoor(true); }
              if (!route.length && atPerson >= 0) { const pid = atPerson; atPerson = -1; if (nearWalker(4) === pid || nearWalker(4) >= 0) talk(nearWalker(4)); }
            } else { dx = nx / d; dy = ny / d; }
          }
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            dx /= len; dy /= len;
            const step = WALK_TILES_PER_S * dt;
            const ox = s.x, oy = s.y;
            const tx = s.x + dx * step, ty = s.y + dy * step;
            // lot cells are open ground except under a building's drawn walls
            const pt = (x: number, y: number) => {
              const cx = Math.floor(x / TILES_PER_CELL), cy = Math.floor(y / TILES_PER_CELL);
              if (cx < 0 || cy < 0 || cx >= c.map.w || cy >= c.map.h) return false;
              const i = cy * c.map.w + cx;
              if (c.map.use[i] === U_LOT && c.map.ground[i] !== G_DEEP && c.map.ground[i] !== G_WATER) return !scene || !blockedAt(scene, i, x * TILE, y * TILE);
              return openAt(c, x, y) && !(scene && blockedAt(scene, i, x * TILE, y * TILE));
            };
            const free = (x: number, y: number) => pt(x - 0.3, y) && pt(x + 0.3, y) && pt(x - 0.3, y - 0.25) && pt(x + 0.3, y - 0.25);
            if (free(tx, s.y)) s.x = tx;
            if (free(s.x, ty)) s.y = ty;
            const moved = Math.hypot(s.x - ox, s.y - oy);
            s.facing = dirOf(dx, dy) as Facing;
            moving = true;
            if (moved < step * 0.2 && dy < -0.5) tryDoor(false);
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
      const cv = canvas.current;
      if (cv && scene) {
        const box = cv.parentElement!.getBoundingClientRect();
        const zoom = Math.max(1, Math.round(Math.min(box.width / (26 * TILE), box.height / (15 * TILE))));
        const vw = Math.ceil(box.width / zoom), vh = Math.ceil(box.height / zoom);
        if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; cv.style.width = `${vw * zoom}px`; cv.style.height = `${vh * zoom}px`; }
        const g = cv.getContext('2d')!;
        g.imageSmoothingEnabled = false;
        if ((s.inside >= 0 || s.below) && room) {
          // who is here: worked out once a game-quarter-hour, placed on the room's standing spots
          const q = Math.floor(s.minute / 15) + c.day * 200;
          if (q !== presentAt && !s.below) {
            presentAt = q;
            const b = c.buildings.get(roomId)!;
            const ids = presentIn(s, b);
            // each person gets their own spot: their usual one, or the next free one
            const used = new Set<number>();
            const n = room.spots.length;
            present = [];
            for (const pid of ids) {
              if (used.size >= n) break;
              let k = (pid * 7) % n;
              while (used.has(k)) k = (k + 1) % n;
              used.add(k);
              present.push({ pid, x: room.spots[k].x, y: room.spots[k].y });
            }
            for (const p of present) sighted(s, p.pid, roomId);
          }
          const tmp: Figure[] = present.map((p) => ({ x: 0, y: 0, sprite: spriteOfPerson(c, p.pid), facing: 'south', moving: false, t: 0, _p: p } as Figure & { _p: typeof p }));
          origin = { ox: Math.round((vw - room.w * TILE) / 2), oy: Math.round((vh - room.h * TILE) / 2) };
          origin = { ox: Math.round((vw - room.w * TILE) / 2), oy: Math.round((vh - room.h * TILE) / 2) };
          const ifigs: Figure[] = tmp.map((f) => { const p = (f as Figure & { _p: { x: number; y: number; pid: number } })._p; return { ...f, x: origin.ox + p.x * TILE, y: origin.oy + p.y * TILE, _pid: p.pid } as Figure; });
          ifigs.push({ x: origin.ox + ix * TILE, y: origin.oy + iy * TILE, sprite: 'people/player-walk', facing: s.facing, moving: running && moving, t });
          origin = drawRoom(g, kit, room, ifigs, vw, vh, s.minute, s.below, passageOpen(s));
          for (const f of ifigs.slice(0, -1)) nameTag(g, c, (f as Figure & { _pid?: number })._pid ?? -1, f.x, f.y);
          // a label over what you can use, and the way out
          const n = nearInside();
          const label = n ? (n.pid !== undefined ? `E: talk to ${c.people.get(n.pid)?.first ?? ''}` : `E: ${n.furn.label}`) : '';
          if (label !== hintRef.current) { hintRef.current = label; setHint(label); }
        } else {
          const cam = { x: s.x * TILE, y: s.y * TILE };
          if (now - figsAt > 250) {
            figsAt = now;
            const cx = s.x / TILES_PER_CELL, cy = s.y / TILES_PER_CELL;
            folkNow = folk.visible(weekdayOf(s), s.minute, cx, cy, 16);
            // the Book's map reveals what you have walked near (3 x 3 cell chunks)
            const CW = Math.ceil(c.map.w / 3);
            for (let ddy = -2; ddy <= 2; ddy++) for (let ddx = -3; ddx <= 3; ddx++) { const kx = Math.floor(cx / 3) + ddx, ky = Math.floor(cy / 3) + ddy; if (kx >= 0 && ky >= 0) s.hand.explored[ky * CW + kx] = 1; }
            for (const p of folkNow) if (Math.hypot(p.x * TILES_PER_CELL - s.x, p.y * TILES_PER_CELL - s.y) < 10 && walkerAt(p, s.minute)) sighted(s, p.pid, -1);
            const near = nearWalker(2.2);
            const label = near >= 0 ? `E: talk to ${c.people.get(near)?.first ?? ''}` : '';
            if (label !== hintRef.current) { hintRef.current = label; setHint(label); }
          }
          figs = [];
          for (const p of folkNow) {
            if (!walkerAt(p, s.minute)) continue;
            figs.push({ x: p.x * TILES_PER_CELL * TILE, y: p.y * TILES_PER_CELL * TILE, sprite: spriteOfPerson(c, p.pid), facing: p.facing, moving: !!p.route && running, t: t + p.pid * 0.37, _pid: p.pid } as Figure);
          }
          if (c.buildings.size !== seenBuildings) { seenBuildings = c.buildings.size; scene = buildScene(c, kit, s.house); sceneRef.current = scene; ground.invalidate(); }
          g.fillStyle = '#0f0d0c'; g.fillRect(0, 0, vw, vh);
          const me: Figure = { x: cam.x, y: cam.y, sprite: 'people/player-walk', facing: s.facing, moving: running && moving, t };
          const doorsShown = [...scene.doors.values()].filter((d) => d.open);
          drawWorld(g, kit, ground, scene, [...figs, me], cam.x, cam.y, vw, vh, doorsShown);
          drawLight(g, s.minute, seasonAt(c, c.day), scene.lamps, cam.x, cam.y, vw, vh);
          for (const f of figs) nameTag(g, c, (f as Figure & { _pid?: number })._pid ?? -1, Math.round(f.x - cam.x + vw / 2), Math.round(f.y - cam.y + vh / 2));
        }
      }
      if (Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) setTick((n) => n + 1);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const click = (e: MouseEvent) => {
      const cv = canvas.current;
      if (!cv || live.current.menu) return;
      const r = cv.getBoundingClientRect();
      const zoom = r.width / cv.width;
      const sx = (e.clientX - r.left) / zoom, sy = (e.clientY - r.top) / zoom;
      if ((s.inside >= 0 || s.below) && room) {
        // a click inside: on a person or a piece of furniture walks there and uses it
        const tx = (sx - origin.ox) / TILE, ty = (sy - origin.oy) / TILE;
        const p = present.find((q) => Math.abs(q.x - tx) < 0.7 && ty < q.y + 0.2 && ty > q.y - 2.4);
        if (p) { target = { x: p.x, y: Math.min(room.h - 0.3, p.y + 0.9), then: () => talk(p.pid) }; return; }
        const f = room.furn.find((q) => q.use && Math.abs(q.x - tx) < 1.1 && ty < q.y + 0.3 && ty > q.y - 2.2);
        if (f) { target = { x: f.x, y: Math.min(room.h - 0.3, f.y + 0.8), then: () => useInside(f) }; return; }
        if (!s.below && ty > room.h - 0.6 && Math.abs(tx - room.door.x) < 1.2) { target = { x: room.door.x, y: room.h - 0.2, then: exit }; return; }
        target = { x: tx, y: ty };
        return;
      }
      const wx = s.x * TILE + (sx - cv.width / 2);
      const wy = s.y * TILE + (sy - cv.height / 2);
      atDoor = -1; atPerson = -1;
      // a click on someone walks up to them and talks
      for (const p of folkNow) {
        if (!walkerAt(p, s.minute)) continue;
        const px = p.x * TILES_PER_CELL * TILE, py = p.y * TILES_PER_CELL * TILE;
        if (Math.abs(wx - px) < 10 && wy < py + 4 && wy > py - 36) {
          if (Math.hypot(p.x * TILES_PER_CELL - s.x, p.y * TILES_PER_CELL - s.y) < 3) { talk(p.pid); return; }
          atPerson = p.pid;
          const path = walkPath(c.map, cellAt(s.x, s.y), Math.floor(p.y) * c.map.w + Math.floor(p.x));
          route = path.slice(1).map((i) => ({ x: (i % c.map.w + 0.5) * TILES_PER_CELL, y: (Math.floor(i / c.map.w) + 0.5) * TILES_PER_CELL }));
          route.push({ x: p.x * TILES_PER_CELL, y: p.y * TILES_PER_CELL + 1 });
          return;
        }
      }
      let gx = wx, gy = wy;
      if (scene) {
        for (const sp of scene.sprites) {
          if (sp.building === undefined) continue;
          const a = kit.get(sp.id);
          const [x0, y0, x1, y1] = a.bbox ?? [0, 0, a.w, a.h];
          const left = sp.x - a.w / 2, top = sp.y - (a.base ?? a.h);
          if (wx < left + x0 || wx > left + x1 || wy < top + y0 || wy > top + y1) continue;
          const d = scene.doors.get(sp.building);
          if (d) { gx = d.x; gy = d.y + 4; atDoor = sp.building; }
          break;
        }
      }
      const tgt = Math.floor(gy / TILE / TILES_PER_CELL) * c.map.w + Math.floor(gx / TILE / TILES_PER_CELL);
      const path = walkPath(c.map, cellAt(s.x, s.y), tgt);
      if (path.length < 2) { if (atDoor >= 0 && Math.hypot(gx / TILE - s.x, gy / TILE - s.y) < 4) { route = [{ x: gx / TILE, y: gy / TILE }]; return; } say('There is no way there on foot.'); return; }
      route = path.slice(1).map((i) => ({ x: (i % c.map.w + 0.5) * TILES_PER_CELL, y: (Math.floor(i / c.map.w) + 0.5) * TILES_PER_CELL }));
      route[route.length - 1] = { x: gx / TILE, y: gy / TILE };
    };
    canvas.current?.addEventListener('click', click);

    // a handle for playtests and the browser tests
    (window as unknown as { hiddenHandSeason?: unknown }).hiddenHandSeason = {
      s,
      scene: () => scene,
      crossing: () => {
        const w0 = suburbCrossing(c);
        const at = (id: number) => { const dc = doorCell(c.map, c.buildings.get(id)!); return { cell: dc, x: (dc % c.map.w + 0.5) * TILES_PER_CELL, y: (Math.floor(dc / c.map.w) + 0.5) * TILES_PER_CELL }; };
        const a = at(w0.from), b = at(w0.to);
        const path = walkPath(c.map, a.cell, b.cell).map((i) => ({ x: (i % c.map.w + 0.5) * TILES_PER_CELL, y: (Math.floor(i / c.map.w) + 0.5) * TILES_PER_CELL }));
        return { cells: w0.cells, from: a, to: b, path };
      },
      teleport: (x: number, y: number) => { s.x = x; s.y = y; s.inside = -1; route = []; },
      enter: (bid: number) => enter(bid),
      exit,
      inside: () => ({ room, ix, iy, present }),
      standAt: (x: number, y: number) => { ix = x; iy = y; if (s.below) { s.bx = x; s.by = y; } },
      below: (down: boolean) => below(down),
      use,
      talk: (pid: number) => talk(pid),
      folk: () => folkNow,
    };
    const cv0 = canvas.current;
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); cv0?.removeEventListener('click', click); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const hintRef = useRef('');
  const closeTalkRef = useRef<(() => void) | null>(null);

  const doSleepNow = () => {
    sleep(s); setMenu(null); setPanel(null); setTick((n) => n + 1); void onSave();
    if (s.hand.morning) setPanel({ kind: 'morning' });
  };

  // things that open by themselves: the morning page, choosing the lodge night, the meeting, the season's end
  useEffect(() => {
    if (panel || menu) return;
    const h = s.hand;
    if (h.morning) { setPanel({ kind: 'morning' }); return; }
    if (h.lodge && h.lodge.night < 0 && h.members.length) { setPanel({ kind: 'night' }); return; }
    if (h.ended && !live.current.endSeen) { live.current.endSeen = true; setPanel({ kind: 'end' }); return; }
    if (meetingDue(s) && (s.inside === s.house || s.below)) { playCue('conclave'); setPanel({ kind: 'meeting' }); return; }
    if (invited(s).length && oathReady(s) === '' && live.current.oathAsked !== c.day && !meetingDue(s)) { live.current.oathAsked = c.day; playCue('notice'); setPanel({ kind: 'oath' }); return; }
    if (h.lodge && h.lodge.night === weekdayOf(s) && s.minute >= MEETING_AT - 60 && s.minute < MEETING_AT && live.current.reminded !== c.day && s.inside !== s.house && h.lodge.lastMeeting !== c.day) {
      live.current.reminded = c.day; say('The lodge meets at 20:00 tonight, under your house.');
    }
  });
  // the soundtrack follows the season and the danger
  useEffect(() => {
    const e = s.hand.exposure;
    audio.setMood({ tension: Math.min(1, Math.max(e.suburb, e.house, e.you) * 1.4), season: seasonName(seasonAt(c, c.day)), paused: paused || panel?.kind === 'book', track: s.below ? 'cellar' : s.minute >= 20 * 60 || s.minute < 6 * 60 ? 'night' : 'day' });
  });

  const inside = s.inside >= 0 && !s.below ? c.buildings.get(s.inside) : undefined;
  const here = c.map.district[Math.floor(s.y / TILES_PER_CELL) * c.map.w + Math.floor(s.x / TILES_PER_CELL)];
  const district = c.districts.find((d) => d.id === here);
  const shut = s.minute >= GATES_SHUT || s.minute < GATES_OPEN;
  const lodge = s.hand.lodge;
  const lodgeTonight = !!lodge && lodge.night === weekdayOf(s) && lodge.lastMeeting !== c.day && s.minute < MEETING_AT;
  const waits: [string, number][] = [['An hour', Math.min(DAY_END - 1, s.minute + 60)], ['Until noon', 12 * 60], ['Until 18:00', 18 * 60], ['Until 19:00', 19 * 60], ['Until 21:00', 21 * 60]];
  if (lodgeTonight) waits.push(['Until the lodge meets', MEETING_AT]);
  const unread = unreadIn(s);
  const unreadLetters = unread.Letters;
  const unreadFacts = Object.entries(unread).filter(([k]) => k !== 'Letters').reduce((a, [, n]) => a + n, 0);
  const close = () => setPanel(null);

  return (
    <div className="street">
      <div className="street-canvas"><canvas ref={canvas} /></div>
      <header className="street-hud">
        <div>
          <b>{dateLabel(c)}</b> · {DAY_NAMES[weekdayOf(s)]} · <span className="clock">{clockLabel(s.minute)}</span> · {s.hand.ended ? "the spring is over" : `day ${seasonDay(s) + 1} of 28`}
          {paused && <span className="paused"> · paused</span>}
        </div>
        <div className="muted small">{s.below ? 'Under your house: the old lodge hall' : inside ? `Inside: ${buildingTitle(inside, s.house)}` : district ? district.name : 'Open country'}{shut ? ' · the gates are shut' : ''} · {Math.round(s.hand.coin)} ducats{unreadLetters ? ` · ${unreadLetters} unread ${unreadLetters === 1 ? 'letter' : 'letters'}` : ''}</div>
        <div className="goal small">{goal(s)}</div>
      </header>
      {hint && !panel && <div className="street-hint">{hint}</div>}
      <nav className="street-bar">
        <button type="button" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" onClick={() => setMenu(menu === 'wait' ? null : 'wait')}>Wait</button>
        <button type="button" disabled={!canSleep(s)} title={s.minute < BED_FROM ? 'You can go to bed from 18:00' : s.inside !== s.house ? 'Sleep in your own house' : ''} onClick={doSleepNow}>Sleep</button>
        <button type="button" onClick={() => setPanel({ kind: 'things' })} title="Your things (I)">Things</button>
        <button type="button" onClick={() => setPanel({ kind: 'book', start: 'Goals' })} title="The Book of the Hand (B)">Book{unreadFacts + unreadLetters > 0 && <i className="badge">{unreadFacts + unreadLetters}</i>}</button>
        {inside && <button type="button" onClick={() => api.current?.exit()}>Go out</button>}
        {s.below && <button type="button" onClick={() => (window as unknown as { hiddenHandSeason: { below: (d: boolean) => void } }).hiddenHandSeason.below(false)}>Go up</button>}
        <button type="button" onClick={() => void onSave().then(() => say('Saved.'))}>Save</button>
        <button type="button" onClick={() => setMenu('quit')}>Menu</button>
      </nav>
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
          <h3>Menu</h3>
          <div className="sound">
            {(['music', 'effects'] as const).map((k) => (
              <label key={k}>{k[0].toUpperCase() + k.slice(1)} <input type="range" min={0} max={1} step={0.05} value={sound[k]} onChange={(e) => { setAudioSettings((x) => ({ ...x, [k]: Number(e.target.value) })); audio.setSettings({ ...sound, [k]: Number(e.target.value) }); }} /></label>
            ))}
            <label><input type="checkbox" checked={sound.muted} onChange={() => { setAudioSettings((x) => ({ ...x, muted: !x.muted })); audio.setSettings({ ...sound, muted: !sound.muted }); }} /> Mute</label>
          </div>
          <p className="small muted">Keys: WASD or arrows walk · E use, talk, go in · B the Book · I your things · Esc pause or close · click to walk</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void onSave().then(onQuit)}>Save and leave</button>
            <button type="button" onClick={() => setMenu(null)}>Back to the game</button>
          </div>
        </section>
      )}
      {panel?.kind === 'talk' && <TalkPanelHost s={s} pid={panel.pid} dev={dev} closeRef={closeTalkRef} onClose={(n) => { setPanel(null); if (n) pass(s, n); for (const l of checkGoals(s)) say(l); setTick((x) => x + 1); }} />}
      {panel?.kind === 'things' && <InventoryPanel s={s} onClose={close} onChange={() => setTick((n) => n + 1)} />}
      {panel?.kind === 'chest' && <ChestPanel s={s} chest={panel.chest} onClose={close} onChange={() => setTick((n) => n + 1)} />}
      {panel?.kind === 'placed' && <PlacedPanel s={s} id={panel.id} onClose={close} onChange={() => setTick((n) => n + 1)} onOpen={(id) => setPanel({ kind: 'chest', chest: id })} />}
      {panel?.kind === 'note' && <NotePanel title={panel.title} lines={panel.lines} onClose={close} />}
      {panel?.kind === 'oath' && <OathPanel s={s} onClose={close} onSworn={() => setTick((n) => n + 1)} />}
      {panel?.kind === 'book' && <Book s={s} start={panel.start} onClose={close} />}
      {panel?.kind === 'meeting' && <MeetingPanel s={s} onClose={() => { close(); void onSave(); }} />}
      {panel?.kind === 'night' && <NightPanel s={s} onClose={close} />}
      {panel?.kind === 'repairs' && <RepairsPanel s={s} onClose={close} />}
      {panel?.kind === 'morning' && <MorningPage s={s} onClose={() => { s.hand.morning = null; close(); }} />}
      {panel?.kind === 'end' && <EndPanel s={s} onKeep={close} onLeave={() => void onSave().then(onQuit)} />}
      {toast && <div className="street-toast">{toast}</div>}
      {dev && (
        <aside className="street-dev">
          <div>Dev · {s.x.toFixed(1)}, {s.y.toFixed(1)} tiles · seed {c.config.seed}</div>
          <div>Last walk: {walk ? `${walk.tiles.toFixed(0)} tiles, ${walk.gameMin.toFixed(1)} game min, ${walk.realS.toFixed(1)} s` : 'none yet'}</div>
          <div>Exposure: suburb {s.hand.exposure.suburb.toFixed(2)}, house {s.hand.exposure.house.toFixed(2)}, you {s.hand.exposure.you.toFixed(2)}</div>
          <div>Goals done {Object.values(s.hand.goals).filter((x) => x.done >= 0).length} · facts {s.hand.facts.length} · clues {s.hand.facts.filter((f) => f.case === 'betrayal').length}</div>
        </aside>
      )}
    </div>
  );
}

/** The talk panel, with Esc wired to "take your leave" (so the time the talk took is still spent). */
function TalkPanelHost({ s, pid, dev, closeRef, onClose }: { s: Season; pid: number; dev: boolean; closeRef: React.MutableRefObject<(() => void) | null>; onClose: (n: number) => void }) {
  const n = useRef(0);
  useEffect(() => { closeRef.current = () => onClose(n.current); return () => { closeRef.current = null; }; });
  return <TalkPanel s={s} pid={pid} dev={dev} onClose={onClose} onMinutes={(k) => { n.current = k; }} />;
}

function buildingTitle(b: Building, house: number): string {
  if (b.id === house) return 'Your house';
  return b.name || BUILDING_NAMES[b.kind] || 'A building';
}

/** A name over someone you have met. */
function nameTag(g: CanvasRenderingContext2D, c: Season['city'], pid: number, x: number, y: number) {
  const p = c.people.get(pid);
  if (!p?.authored) return;
  const hs = (window as unknown as { hiddenHandSeason?: { s: Season } }).hiddenHandSeason?.s;
  if (!hs || (hs.hand.rels[pid]?.met ?? -1) < 0) return;
  g.font = '8px "Press Start 2P", monospace';
  g.textAlign = 'center';
  const w = g.measureText(p.first).width;
  g.fillStyle = 'rgba(15,13,12,0.7)'; g.fillRect(Math.round(x - w / 2 - 2), Math.round(y - 44), Math.round(w + 4), 10);
  g.fillStyle = hs.hand.rels[pid]?.stage === 'sworn' ? '#e8c36a' : '#e8dcc0';
  g.fillText(p.first, Math.round(x), Math.round(y - 36));
  g.textAlign = 'start';
}
