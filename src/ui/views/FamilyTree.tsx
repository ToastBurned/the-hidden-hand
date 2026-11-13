import { useEffect, useRef } from 'react';
import { Modal } from '../components/Modal';
import { useQuery } from '../hooks';
import type { familyTree, TreeNode } from '../../engine/query';
import { Portrait } from '../art/Portrait';
import { toggleFollowFamily, usePrefs } from '../prefs';
import type { Selection } from '../App';

type FT = NonNullable<ReturnType<typeof familyTree>>;
const U = 132; // horizontal slot
const RH = 168; // row height
const yr = (t: number) => Math.floor(t / 12);

/** Three generations up and down from one person, with faces. */
export function FamilyTreeDialog({ id, onClose, onOpen }: { id: number; onClose: () => void; onOpen: (s: Selection) => void }) {
  const { data } = useQuery<FT | null>('family', id, 24);
  const prefs = usePrefs();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.querySelector('.tcard.focus')?.scrollIntoView({ block: 'center', inline: 'center' }); }, [data?.focus, !!data]);
  if (!data) return <Modal title="Family tree" onClose={onClose} wide><div className="muted">Loading…</div></Modal>;
  const N = data.nodes;
  type Pos = { id: number; x: number; row: number; small?: boolean };
  const pos: Pos[] = [];
  const links: [number, number, number, number, string][] = [];
  // descendants: tidy layout by leaf counts
  const width = (nid: number, depth: number): number => {
    const n = N[nid];
    if (!n || depth >= 3) return 1;
    const kids = n.children.filter((c) => N[c]);
    return Math.max(1, kids.reduce((a, c) => a + width(c, depth + 1), 0));
  };
  const placeDown = (nid: number, left: number, depth: number): number => {
    const n = N[nid];
    const w = width(nid, depth);
    const x = left + (w * U) / 2;
    pos.push({ id: nid, x, row: depth });
    if (n && depth < 3) {
      let l = left;
      for (const c of n.children.filter((k) => N[k])) {
        const cw = width(c, depth + 1);
        const cx = placeDown(c, l, depth + 1);
        links.push([x, depth, cx, depth + 1, 'down']);
        l += cw * U;
      }
    }
    return x;
  };
  const totalW = width(data.focus, 0) * U;
  const anc = 2 ** 3 * U;
  const sibW = data.siblings.length * U * 0.8;
  const W = Math.max(totalW, anc, 600) + sibW + 40;
  const fx = placeDown(data.focus, sibW + (Math.max(totalW, anc, 600) - totalW) / 2 + 20, 0);
  // ancestors: binary slots above
  const placeUp = (nid: number, x: number, row: number, spread: number) => {
    const n = N[nid];
    if (!n || row <= -3) return;
    [n.mother, n.father].forEach((p, k) => {
      if (!N[p]) return;
      const px = x + (k ? 1 : -1) * spread / 2;
      pos.push({ id: p, x: px, row: row - 1 });
      links.push([px, row - 1, x, row, 'up']);
      placeUp(p, px, row - 1, spread / 2);
    });
  };
  placeUp(data.focus, fx, 0, anc / 2);
  data.siblings.forEach((s, i) => { const x = sibW - i * U * 0.8 - U * 0.4 + 10; pos.push({ id: s, x, row: 0, small: true }); });
  const minRow = Math.min(0, ...pos.map((p) => p.row));
  const maxRow = Math.max(0, ...pos.map((p) => p.row));
  const top = (row: number) => (row - minRow) * RH + 10;
  const H = (maxRow - minRow + 1) * RH + 20;
  const focus = N[data.focus];
  const following = prefs.follow.families.includes(data.family);
  return (
    <Modal title={`The ${data.family} family`} onClose={onClose} wide>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="muted small">Three generations around {focus.name}. Click anyone to open them. People who died long ago without leaving a mark may have been forgotten.</span>
        <span className="grow" />
        <button className={following ? 'on' : ''} onClick={() => toggleFollowFamily(data.family)}>{following ? '★ Following this dynasty' : '☆ Follow this dynasty'}</button>
      </div>
      <div className="ftree-scroll" ref={scroller}>
        <div className="ftree" style={{ width: W, height: H }}>
          <svg width={W} height={H} className="ftree-links">
            {links.map(([x1, r1, x2, r2, k], i) => {
              const y1 = top(r1) + (k === 'down' ? 132 : 132), y2 = top(r2) + (k === 'down' ? 0 : 0);
              const ya = k === 'down' ? top(r1) + 132 : top(r1) + 132;
              const yb = top(r2);
              const my = (ya + yb) / 2;
              return <path key={i} d={`M${x1},${k === 'down' ? y1 : ya} V${my} H${x2} V${k === 'down' ? y2 : yb}`} />;
            })}
          </svg>
          {pos.map((p) => <TreeCard key={`${p.id}-${p.row}`} n={N[p.id]} x={p.x} y={top(p.row)} focus={p.id === data.focus} small={p.small} spouse={N[N[p.id]?.spouse ?? -1]} onOpen={onOpen} onClose={onClose} />)}
        </div>
      </div>
    </Modal>
  );
}

function TreeCard({ n, x, y, focus, small, spouse, onOpen, onClose }: { n: TreeNode; x: number; y: number; focus: boolean; small?: boolean; spouse?: TreeNode; onOpen: (s: Selection) => void; onClose: () => void }) {
  if (!n) return null;
  const s = small ? 0.8 : 1;
  return (
    <button className={`tcard ${focus ? 'focus' : ''} ${n.alive ? '' : 'dead'}`} style={{ left: x - 58 * s, top: y, width: 116 * s }} onClick={() => { onOpen({ kind: 'person', id: n.id }); onClose(); }} title={n.title ? `${n.title} ${n.name}` : n.name}>
      <Portrait look={n.look} size={56 * s} />
      <span className="tname">{n.title ? <em>{n.title} </em> : null}{n.name}</span>
      <span className="tyears">{yr(n.born)}–{n.alive ? '' : yr(n.died)}</span>
      {spouse && !small && <span className="tspouse">∞ {spouse.name.split(' ')[0]}</span>}
    </button>
  );
}
