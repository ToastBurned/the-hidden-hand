/**
 * Conclaves meet only when there is a real decision to make (playtest item F11): an elder
 * is gone, a member wavers, a seat opens or an election is near, an inquiry closes in on
 * someone, the deeds and the creed drift apart, or too few elders lead too many members. There is no yearly
 * sitting, and posture is a standing setting on the Order screen, not a conclave item.
 */
import { CAL, DAYS_PER_WEEK, V_MILIT } from '../constants';
import { weekOfYear } from '../core';
import { eligibleFor } from '../systems/civic';
import { oathText } from './creed';
import { mastery } from './crafts';
import { removeMember } from './order';
import type { Campaign, ConclaveItem, Member } from './types';
import { clamp, members, name, notice, seatsOf } from './util';

const URGENT = new Set(['leader', 'seat', 'hunted']);

function free(k: Campaign): Member[] { return members(k.order).filter((m) => m.imprisoned < 0 && k.city.people.has(m.pid)); }

function promotionItems(k: Campaign, max: number): ConclaveItem[] {
  const o = k.order;
  const c = k.city;
  const ms = free(k);
  const elders = ms.filter((m) => m.standing === 'elder').length;
  const quota = Math.max(1, Math.ceil(members(o).length / 4));
  if (elders >= quota) return [];
  const ready = ms.filter((m) => m.standing === 'adept' && m.zeal > 0.5 && c.day - m.joined >= 3 * 364).sort((a, b) => b.zeal - a.zeal || a.pid - b.pid);
  return ready.slice(0, Math.min(max, quota - elders)).map((m) => ({
    id: `promote-${m.pid}`, kind: 'promotion', title: `Raise ${name(c, m.pid)} to elder?`,
    text: 'An elder knows the elders of every cell and can lead the Order. If taken, an elder can name many.', by: null,
    options: [{ id: 'yes', label: 'Raise them', effect: 'They become an elder.' }, { id: 'no', label: 'Not yet', effect: 'Nothing changes.' }],
  }));
}

/** The decisions waiting for the Order now, each with the key that stops it being asked twice. */
export function pendingItems(k: Campaign): { key: string; item: ConclaveItem }[] {
  const o = k.order;
  const c = k.city;
  const out: { key: string; item: ConclaveItem }[] = [];
  const asked = (key: string, within = Infinity) => key in o.asked && o.asked[key] >= 0 && c.day - o.asked[key] < within;
  const ms = free(k);
  if (!ms.length) return out;
  // an elder is gone, or none is left: who leads now?
  const elders = ms.filter((m) => m.standing === 'elder');
  const lost = Object.entries(o.asked).filter(([key, v]) => key.startsWith('elder-lost-') && v < 0).map(([key]) => key);
  if (!elders.length) {
    const cands = ms.filter((m) => m.standing !== 'elder').sort((a, b) => (b.standing === 'adept' ? 1 : 0) - (a.standing === 'adept' ? 1 : 0) || b.zeal - a.zeal || a.pid - b.pid).slice(0, 3);
    if (cands.length) out.push({ key: lost[0] ?? `leader-${c.day}`, item: {
      id: 'leader', kind: 'leader', title: 'Who will lead the Order?', text: 'No elder is left free. The Order needs a leader, or it will break apart.', by: null,
      options: cands.map((m) => ({ id: String(m.pid), label: name(c, m.pid), effect: `${name(c, m.pid)} becomes an elder${m.standing === 'initiate' ? ', young in the Order as they are' : ''}.` })),
    } });
    for (const key of lost.slice(1)) o.asked[key] = c.day;
  } else if (lost.length) {
    const items = promotionItems(k, 2);
    if (items.length) for (const it of items) out.push({ key: lost[0], item: it });
    for (const key of lost) if (!items.length) o.asked[key] = c.day;
  }
  // a member wavers
  for (const m of ms) if (m.wavering && !asked(`expel-${m.pid}`, 2 * 364)) out.push({ key: `expel-${m.pid}`, item: {
    id: `expel-${m.pid}`, kind: 'expel', title: `Expel ${name(c, m.pid)}?`, text: 'They waver. Expelled, they may keep quiet or may talk; kept, they may yet return to us, or betray us.', by: null,
    options: [{ id: 'expel', label: 'Expel them', effect: `They leave the Order. They know ${m.knows.length} of us by name.` }, { id: 'keep', label: 'Keep them close', effect: 'They stay, for now.' }],
  } });
  // an inquiry closes in on someone
  for (const m of ms) if (m.wanted && m.hiddenUntil <= c.day && !asked(`hunted-${m.pid}`, 182)) out.push({ key: `hunted-${m.pid}`, item: {
    id: `hunted-${m.pid}`, kind: 'hunted', title: `${name(c, m.pid)} is hunted`, text: 'An inquiry is close to them. What do we do?', by: null,
    options: [
      { id: 'hide', label: 'Hide them', effect: 'They lie low for half a year (1 influence, 6 ducats). The trail cools.' },
      { id: 'quiet', label: 'The whole Order goes quiet', effect: 'No levers for half a year; every inquiry slows.' },
      { id: 'cut', label: 'Cut them loose', effect: `They are no longer one of us. They know ${m.knows.length} of us by name, and may talk if taken.` },
      { id: 'nothing', label: 'Do nothing', effect: 'Trust to luck.' },
    ],
  } });
  // a seat falls vacant that a member could fill
  for (const off of c.offices.values()) {
    if (off.holder >= 0 || off.kind === 'councillor' || off.kind === 'mayor' || off.kind === 'priest') continue;
    const vac = c.ctx[`vacant${off.id}`] ?? -1;
    const key = `seat-${off.id}-${vac}`;
    if (asked(key)) continue;
    const cands = ms.filter((m) => { const p = c.people.get(m.pid)!; return eligibleFor(c, off, p) && seatsOf(c, p.id).length < 2 && m.influence >= 1; }).sort((a, b) => b.influence - a.influence || a.pid - b.pid).slice(0, 3);
    if (!cands.length) continue;
    out.push({ key, item: {
      id: `seat-${off.id}`, kind: 'seat', title: `${off.title} is vacant`, text: `The office falls to be filled within the month. One of ours could stand for it.`, by: null,
      options: [...cands.map((m) => ({ id: String(m.pid), label: `Put forward ${name(c, m.pid)}`, effect: 'Our patrons back them at the appointment (1 influence).' })), { id: 'pass', label: 'Let it pass', effect: 'We stay out of it.' }],
    } });
  }
  // the council election is two weeks away: who stands for us?
  const week = weekOfYear(c.day);
  if (week >= CAL.councilElection - 3 && week < CAL.councilElection) {
    const key = `election-${Math.floor(c.day / 364)}`;
    const standing = ms.some((m) => (c.mods[`p${m.pid}:candidacy`] ?? 0) > 0.2);
    const cands = ms.filter((m) => { const p = c.people.get(m.pid)!; return !seatsOf(c, p.id).some((s) => s.kind === 'councillor') && eligibleFor(c, [...c.offices.values()].find((x) => x.kind === 'councillor')!, p) && m.influence >= 1.5; }).sort((a, b) => b.influence - a.influence || a.pid - b.pid).slice(0, 3);
    if (!asked(key) && !standing && cands.length) out.push({ key, item: {
      id: 'election', kind: 'seat', title: 'The council election is near', text: 'A third of the council\'s seats will be filled in two weeks. Should one of ours stand?', by: null,
      options: [...cands.map((m) => ({ id: String(m.pid), label: `${name(c, m.pid)} stands`, effect: 'Our patrons work the freemen for them (1.5 influence).' })), { id: 'pass', label: 'No one stands', effect: 'We stay out of it this year.' }],
    } });
  }
  // word and deed drift apart
  if (o.creed.gap > 0.35 && !o.creed.amended && !asked('drift', 3 * 364)) {
    const by = ms.filter((m) => m.standing === 'elder').sort((a, b) => b.dark - a.dark)[0];
    out.push({ key: 'drift', item: {
      id: 'drift', kind: 'amendment', title: 'Amend the creed: "whatever must be done"?', text: 'Our deeds have strayed from our words. Some elders would change the words to match.', by: by?.pid ?? null,
      options: [
        { id: 'accept', label: 'Amend the creed', effect: 'The gap closes; the gentle lose heart and the hard rise. The ending will remember it.' },
        { id: 'refuse', label: 'Hold to the creed', effect: 'Cohesion suffers while the deeds go on.' },
        { id: 'abandon', label: 'Renounce the creed', effect: 'The Order gives up what it swore. The campaign ends.' },
      ],
    } });
  }
  // too few elders for the Order's size
  if (elders.length && !lost.length && !asked('promote', 2 * 364)) for (const it of promotionItems(k, 1)) out.push({ key: 'promote', item: it });
  return out;
}

/** Weekly: call a conclave when a decision is waiting. Urgent ones at once; others at most once a season. */
export function conclaveWeek(k: Campaign, force = false): boolean {
  const o = k.order;
  const c = k.city;
  if (o.conclave || o.phase !== 'play') return false;
  const pend = pendingItems(k);
  if (!pend.length) return false;
  const urgent = pend.some((x) => URGENT.has(x.item.kind));
  if (!force && !urgent && c.day - o.lastConclave < 13 * DAYS_PER_WEEK) return false;
  const items: ConclaveItem[] = [];
  for (const x of pend) { if (!items.some((i) => i.id === x.item.id)) items.push(x.item); o.asked[x.key] = c.day; }
  const reason = reasonOf(k, items);
  o.conclave = { reason, day: c.day, items };
  o.lastConclave = c.day;
  o.log.conclaves++;
  notice(k, 'conclave', 3, 'The conclave sits', reason);
  return true;
}

function reasonOf(k: Campaign, items: ConclaveItem[]): string {
  const first = items[0];
  switch (first.kind) {
    case 'leader': return 'The last free elder is gone. The Order must choose who leads it.';
    case 'promotion': return first.title.startsWith('Raise') && Object.keys(k.order.asked).some((x) => x.startsWith('elder-lost-') && k.order.asked[x] === k.city.day) ? 'An elder is gone, and the elders must make up their number.' : 'The Order has grown, and the elders are too few.';
    case 'seat': return first.id === 'election' ? 'The council election is near.' : `${first.title}.`;
    case 'hunted': return `${first.title}: an inquiry is closing in.`;
    case 'expel': return 'A member wavers.';
    case 'amendment': return 'Our deeds have strayed from our creed.';
    default: return 'The elders meet.';
  }
}

/** Apply one decision. Returns an error, or null. */
export function decide(k: Campaign, itemId: string, option: string): string | null {
  const o = k.order;
  const c = k.city;
  if (!o.conclave) return 'no conclave is sitting';
  const it = o.conclave.items.find((x) => x.id === itemId);
  if (!it) return 'no such item';
  if (!it.options.some((x) => x.id === option)) return 'no such option';
  const raise = (m: Member) => {
    m.standing = 'elder'; m.elderSince = c.day;
    for (const x of members(o)) if (x.standing === 'elder' && x !== m) { if (!m.knows.includes(x.pid)) m.knows.push(x.pid); if (!x.knows.includes(m.pid)) x.knows.push(m.pid); }
    if (o.generation.n >= 2 && !o.generation.leaders.includes(m.pid)) o.generation.leaders.push(m.pid);
  };
  switch (it.kind) {
    case 'promotion': if (option === 'yes') { const m = o.members[Number(itemId.split('-')[1])]; if (m) raise(m); } break;
    case 'leader': { const m = o.members[Number(option)]; if (m) { raise(m); m.zeal = clamp(m.zeal + 0.05); } break; }
    case 'expel': if (option === 'expel') { const m = o.members[Number(itemId.split('-')[1])]; if (m) removeMember(k, m, 'expelled by the conclave'); } break;
    case 'hunted': {
      const m = o.members[Number(itemId.split('-')[1])];
      if (!m) break;
      if (option === 'hide') {
        if (o.order.wealth < 6 || m.influence < 1) return 'not enough coin or influence to hide them';
        o.order.wealth -= 6; c.treasury.money += 6; m.influence -= 1;
        m.hiddenUntil = c.day + 182; m.wanted = false;
        for (const inv of o.investigations) if (inv.trail[m.pid]) inv.trail[m.pid] *= 0.5;
        for (const op of Object.values(o.ops)) if (op.status === 'running' && op.agent === m.pid) { op.status = 'abandoned'; op.outcome = 'Called off: the agent went to ground.'; op.resolved = c.day; m.task = null; }
      } else if (option === 'quiet') o.order.quietUntil = c.day + 182;
      else if (option === 'cut') {
        for (const x of members(o)) if (x !== m) x.knows = x.knows.filter((id) => id !== m.pid);
        removeMember(k, m, 'cut loose by the conclave');
      }
      break;
    }
    case 'seat': {
      if (option === 'pass') break;
      const m = o.members[Number(option)];
      if (!m) break;
      if (itemId === 'election') {
        if (m.influence < 1.5) return 'they lack the influence';
        m.influence -= 1.5;
        o.boosts.push({ key: `p${m.pid}:candidacy`, amount: 0.45, until: c.day + 5 * DAYS_PER_WEEK });
      } else {
        const off = c.offices.get(Number(itemId.split('-')[1]));
        if (!off || m.influence < 1) return 'they lack the influence';
        m.influence -= 1;
        o.boosts.push({ key: `p${m.pid}:${off.kind}`, amount: 0.5, until: c.day + 8 * DAYS_PER_WEEK });
      }
      break;
    }
    case 'amendment': {
      if (option === 'accept') {
        o.creed.vows = o.creed.vows.filter((v) => v !== 'peace');
        if (!o.creed.vows.includes('ends')) o.creed.vows.push('ends');
        o.creed.direction[V_MILIT] = clamp((o.creed.direction[V_MILIT] ?? 0) + 0.3, -1, 1);
        o.creed.amended = c.day;
        o.practice.dark *= 0.3;
        o.creed.oath = oathText(o.creed) + ' Whatever must be done, we will do.';
        for (const m of members(o)) { const p = c.people.get(m.pid); if (p) m.zeal = clamp(m.zeal + (p.agree > 0.55 ? -0.15 : 0.05)); }
        o.order.cohesion = clamp(o.order.cohesion - 0.05);
      } else if (option === 'refuse') o.order.cohesion = clamp(o.order.cohesion - 0.08);
      else if (option === 'abandon') o.asked['abandoned'] = c.day;
      break;
    }
  }
  o.conclave.items = o.conclave.items.filter((x) => x.id !== itemId);
  void mastery;
  return null;
}

export function closeConclave(k: Campaign): void {
  k.order.conclave = null;
}
