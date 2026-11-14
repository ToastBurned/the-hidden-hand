/**
 * Conclaves: where the Order's large decisions are made. They come on an adaptive rhythm
 * (yearly at the founding, every five years for an established Order, every ten for an old
 * one), and the elders call one themselves when one of the inner circle dies. Only a few
 * items come up at each, because their interest lies in their consequences.
 */
import { V_MILIT } from '../constants';
import { clamp, type Ctx } from '../context';
import { oathText } from './creed';
import { removeMember } from './order';
import type { GameState } from './state';
import { fullName, game, notice } from './util';
import type { ConclaveItem } from './view';

export function conclaveInterval(c: Ctx, g: GameState): number {
  const age = (c.w.tick - g.order.founded) / 12;
  if (age < 5) return 12;
  if (age < 40 || g.members.size < 10) return 60;
  return 120;
}

export function openConclave(c: Ctx, reason: string): void {
  const w = c.w;
  const g = game(w);
  const items: ConclaveItem[] = [];
  const ms = [...g.members.values()];
  const elders = ms.filter((m) => m.standing === 'elder').length;
  const ready = ms.filter((m) => m.standing === 'adept' && m.zeal > 0.5 && w.tick - m.joined >= 60 && m.imprisoned < 0).sort((a, b) => b.zeal - a.zeal);
  if (ready.length && elders < Math.max(1, Math.ceil(ms.length / 4))) {
    const m = ready[0];
    items.push({ id: `promote-${m.pid}`, kind: 'promotion', title: `Raise ${fullName(w, m.pid)} to elder?`, text: 'An elder knows the elders of every cell and can lead a lodge. If taken, an elder can name many.', by: null, options: [{ id: 'yes', label: 'Raise them', effect: 'They become an elder.' }, { id: 'no', label: 'Not yet', effect: 'Nothing changes.' }] });
  }
  if (g.creed.gap > 0.35 && !g.creed.vows.includes('ends')) {
    const by = ms.filter((m) => m.standing === 'elder').sort((a, b) => b.dark - a.dark)[0];
    items.push({ id: 'amend-ends', kind: 'amendment', title: 'Amend the creed: "the end justifies the means"?', text: 'Our deeds have strayed from our words. Some elders would change the words to match.', by: by?.pid ?? null, options: [{ id: 'accept', label: 'Amend the creed', effect: 'The gap closes; the gentle lose heart and the hard rise.' }, { id: 'refuse', label: 'Hold to the creed', effect: 'Cohesion suffers while the deeds go on.' }] });
  }
  const waver = ms.find((m) => m.wavering && m.imprisoned < 0);
  if (waver) items.push({ id: `expel-${waver.pid}`, kind: 'expel', title: `Expel ${fullName(w, waver.pid)}?`, text: 'They waver. Expelled, they may keep quiet or may talk; kept, they may yet return to us, or betray us.', by: null, options: [{ id: 'expel', label: 'Expel them', effect: 'They leave the Order and forget the names of those they did not know.' }, { id: 'keep', label: 'Keep them close', effect: 'They stay.' }] });
  items.push({ id: 'posture', kind: 'posture', title: 'The posture of the Order', text: 'Cautious keeps us safe and slow; bold acts fast and leaves traces.', by: null, options: [{ id: 'cautious', label: 'Cautious', effect: 'Smaller traces, weaker operations.' }, { id: 'measured', label: 'Measured', effect: 'The middle way.' }, { id: 'bold', label: 'Bold', effect: 'Stronger operations, bigger traces.' }] });
  g.conclave = { reason, tick: w.tick, items };
  notice(w, 'conclave', 3, 'The conclave sits', reason, []);
}

export function decide(c: Ctx, item: string, option: string): string | null {
  const w = c.w;
  const g = game(w);
  if (!g.conclave) return 'no conclave is sitting';
  const it = g.conclave.items.find((x) => x.id === item);
  if (!it) return 'no such item';
  if (it.kind === 'promotion' && option === 'yes') {
    const m = g.members.get(Number(item.split('-')[1]));
    if (m) {
      m.standing = 'elder';
      // elders know the elders of the other cells
      for (const o of g.members.values()) if (o.standing === 'elder' && o !== m) { if (!m.knows.includes(o.pid)) m.knows.push(o.pid); if (!o.knows.includes(m.pid)) o.knows.push(m.pid); }
    }
  } else if (it.kind === 'amendment') {
    if (option === 'accept') {
      g.creed.vows = g.creed.vows.filter((v) => v !== 'peace');
      g.creed.vows.push('ends');
      g.creed.direction[V_MILIT] = clamp((g.creed.direction[V_MILIT] ?? 0) + 0.3, -1, 1);
      g.practice.dark *= 0.3;
      g.creed.oath = oathText(g.creed) + ' Whatever must be done, we will do.';
      for (const m of g.members.values()) { const p = w.persons.get(m.pid); if (p) m.zeal = clamp(m.zeal + (p.agree > 0.55 ? -0.15 : 0.05)); }
      g.order.cohesion = clamp(g.order.cohesion - 0.05);
    } else g.order.cohesion = clamp(g.order.cohesion - 0.08);
  } else if (it.kind === 'expel' && option === 'expel') {
    const m = g.members.get(Number(item.split('-')[1]));
    if (m) removeMember(c, m, 'expelled by the conclave');
  } else if (it.kind === 'posture' && (option === 'cautious' || option === 'measured' || option === 'bold')) {
    g.order.posture = option;
  }
  g.conclave.items = g.conclave.items.filter((x) => x.id !== item);
  return null;
}

export function closeConclave(c: Ctx): void {
  const g = game(c.w);
  g.conclave = null;
  g.nextConclave = c.w.tick + conclaveInterval(c, g);
}
