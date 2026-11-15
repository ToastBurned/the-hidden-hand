/**
 * The vertical slice, played by a fixed script, for balance: `npx tsx tools/slice.ts <seeds e.g. 1-8> [bot|approve|idle]`.
 * - approve: approves every proposed order, puts the motion when it can, buys votes with spare coin.
 * - bot: the same, and also sows discord at the table and hides the wanted.
 * - idle: founds the Order and does nothing.
 * The brief's test: a fixed script should not win the slice reliably (target: under a third of seeds).
 */
import { createCity } from '../src/city/create';
import { runYears } from '../src/city/sim';
import { electability, eligibleFreeman } from '../src/city/systems/civic';
import { CLASS_WEALTHY } from '../src/city/constants';
import { CREED_QUESTIONS, applyCommand, creedFromAnswers, founderOffers, foundOrder, orderView, proposeOrders, stepCampaign, type Campaign } from '../src/city/order';

const [range = '1-4', mode = 'approve'] = process.argv.slice(2);
const [a, b] = range.split('-').map(Number);
const seeds = Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
const VERBOSE = !!process.env.VERBOSE;

export function newSlice(seed: number, answers?: Record<string, string>): Campaign {
  const c = createCity({ seed });
  runYears(c, 3);
  const ans = answers ?? Object.fromEntries(CREED_QUESTIONS.map((q) => [q.id, q.id === 'council' ? 'many' : q.answers[seed % q.answers.length].id]));
  const creed = creedFromAnswers(ans);
  const offers = founderOffers(c, creed, 0, true);
  if (!offers.length) throw new Error(`seed ${seed}: no founders`);
  return foundOrder(c, { creed, founder: offers[0].id, slice: true });
}

function play(k: Campaign, mode: string) {
  const o = k.order;
  let approved = 0;
  while (o.phase === 'play') {
    stepCampaign(k, 7);
    if (o.conclave) { for (const it of o.conclave.items) applyCommand(k, { type: 'conclave-decide', item: it.id, option: it.options[0].id }); applyCommand(k, { type: 'conclave-close' }); }
    if (mode === 'idle') continue;
    const plan = mode === 'plan' || mode === 'smart';
    const okKinds = mode === 'smart' ? ['recruit', 'favour', 'befriend', 'found-lodge', 'hide', 'win-seat'] : ['recruit', 'favour', 'befriend', 'found-lodge', 'hide'];
    for (const p of proposeOrders(k)) if ((!plan || okKinds.includes(p.cmd.kind)) && applyCommand(k, p.cmd).ok) approved++;
    const v = orderView(k).slice!;
    const ready = !plan || (o.slice!.guild >= 3 && o.order.wealth >= 100) || k.city.day > o.slice!.endsAt - (mode === 'smart' ? 3.5 : 2) * 364;
    if (v.scheme.stage === 'sponsor' && v.scheme.sponsors.length && ready) applyCommand(k, { type: 'scheme-put', sponsor: v.scheme.sponsors[0].id });
    if ((v.scheme.stage === 'votes' || v.scheme.stage === 'passed') && v.scheme.daysToSitting < 120) {
      const agent = Object.keys(o.members).map(Number)[0];
      for (const r of v.scheme.board) if (r.believed <= 0 && !r.ours && !r.rival && o.order.wealth > 30) applyCommand(k, { type: 'scheme-buy', councillor: r.id, agent });
    }
    if (process.env.ELECT && v.scheme.stage === 'passed' && (k.city.day % 364) < 7 * 6 && (k.city.day % 364) >= 7 * 5) {
      const c = k.city;
      const plain = [...c.people.values()].filter((p) => eligibleFreeman(c, p) && p.guildRank >= 1 && c.households.get(p.hh)?.cls !== CLASS_WEALTHY && !c.families.get(p.family)?.great);
      const sc = plain.map((p) => ({ id: p.id, s: electability(c, p), ours: p.id in o.members ? 'M' : o.allies.some((a) => a.pid === p.id && a.strength >= 0.3) ? 'F' : '' })).sort((a, b) => b.s - a.s);
      console.log(`  ELECT y${(c.day / 364).toFixed(1)} plain ${plain.length}: top ${sc.slice(0, 5).map((x) => x.s.toFixed(2) + x.ours).join(' ')} | ours ${sc.map((x, i) => (x.ours ? `#${i} ${x.s.toFixed(2)}${x.ours}` : '')).filter(Boolean).slice(0, 6).join(' ')}`);
    }
    if (mode === 'smart' && (v.scheme.stage === 'passed' || v.scheme.stage === 'votes')) {
      // what a thoughtful player does: befriend the plain guild men on the council, with whoever is free
      const busy = new Set(Object.values(o.ops).filter((x) => x.status === 'running').map((x) => x.agent));
      for (const r of v.scheme.board) {
        if (r.ours || r.great || r.wealthy || !r.guild) continue;
        const free = Object.values(o.members).filter((m) => m.imprisoned < 0 && !busy.has(m.pid) && m.influence >= 1).sort((a, b) => b.influence - a.influence)[0];
        if (free && applyCommand(k, { type: 'operation', kind: 'befriend', agent: free.pid, target: { kind: 'person', id: r.id }, approach: 'with gifts' }).ok) busy.add(free.pid);
      }
    }
    if (mode === 'bot') {
      const t = v.rival.members.find((m) => m.feud);
      const free = Object.values(o.members).find((m) => m.influence >= 1.5 && !Object.values(o.ops).some((x) => x.status === 'running' && x.agent === m.pid));
      if (t && free && !v.rival.split) applyCommand(k, { type: 'operation', kind: 'sow-discord', agent: free.pid, target: { kind: 'person', id: t.id }, approach: 'with a slight remembered' });
    }
  }
  return approved;
}

const t0 = Date.now();
let wins = 0;
for (const seed of seeds) {
  const k = newSlice(seed);
  const approved = play(k, mode);
  const o = k.order;
  const s = o.slice!;
  const ops = Object.values(o.ops);
  const delivered = s.claims.filter((c) => c.delivered);
  const q = (x: string) => delivered.filter((c) => c.quality === x).length;
  if (o.ending?.kind === 'won') wins++;
  console.log(`seed ${seed} ${k.city.name}: ${o.ending?.kind} (${o.ending?.title}) members ${Object.keys(o.members).length} fallen ${o.fallen.length} arrests ${o.log.arrests} lodges ${Object.values(o.lodges).filter((l) => l.found < 0).length}/${Object.keys(o.lodges).length} coin ${o.order.wealth.toFixed(0)} coh ${o.order.cohesion.toFixed(2)}`);
  console.log(`  scheme ${s.scheme.stage} tries ${s.scheme.tries} sittings ${s.scheme.sittings.map((x) => `${x.motion} ${x.ayes}-${x.noes}`).join(', ') || '-'} milestones ${s.scheme.milestones.map((m) => `${m.id}@${(m.done / 364).toFixed(1)}`).join(',')} passed@${s.scheme.passedAt >= 0 ? (s.scheme.passedAt / 364).toFixed(1) : '-'} end@${(s.endsAt / 364).toFixed(1)}`);
  console.log(`  rival ${s.rival.name} attention ${s.rival.attention.toFixed(2)} goal ${s.rival.goal} done [${s.rival.goalsDone}] moves ${s.rival.moves.map((m) => m.kind).reverse().join(',')} bought ${s.rival.bought.length}`);
  console.log(`  ops ${ops.length} (approved ${approved}) letters ${delivered.length}: true ${q('true')} partial ${q('partial')} false ${q('false')} planted ${q('planted')}; inquiries ${o.investigations.length}`);
  const agg = new Map<string, number>();
  for (const l of s.ledger) if (l.what === 'attention') for (const f of l.parts) agg.set(f.label.replace(/ of .*| by .*| in .*|[A-Z][a-z]+ [A-Z][a-z]+ /g, ''), (agg.get(f.label.replace(/ of .*| by .*| in .*|[A-Z][a-z]+ [A-Z][a-z]+ /g, '')) ?? 0) + f.value);
  console.log(`  attention: ${[...agg.entries()].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 6).map(([l, v]) => `${l} ${v.toFixed(2)}`).join('; ')}`);
  const fk = new Map<string, number>(); for (const f of s.facts) fk.set(f.kind, (fk.get(f.kind) ?? 0) + 1);
  console.log(`  facts ${s.facts.length}: ${[...fk.entries()].map(([x, n]) => `${x} ${n}`).join(', ')}; claims ${s.claims.length}`);
  if (VERBOSE) for (const n of o.notices.slice(0, 12)) console.log(`    · ${n.title}: ${n.text.slice(0, 160)}`);
}
console.log(`${mode}: ${wins}/${seeds.length} won, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
