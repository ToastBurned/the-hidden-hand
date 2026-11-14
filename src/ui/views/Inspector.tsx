import type { Selection } from '../App';
import { useQuery, fmtNum, fmtCount, fmtPct } from '../hooks';
import type {
  settlementDetail, polityDetail, personDetail, eventDetail, tileDetail, cultureDetail, religionDetail, warSummary,
} from '../../engine/query';
import { Axis, Empty, EventRow, KV, Link, Meter, Section, eventLabel } from '../components/common';
import { Bars, LineChart } from '../components/LineChart';
import { VALUE_POLES } from '../../engine/constants';
import { hueCss, SERIES } from '../colors';
import type { HistEvent } from '../../engine/types';
import type { Look } from '../../engine/query';
import { Portrait } from '../art/Portrait';
import { TownThumb } from '../city/TownThumb';
import { toggleFollowFamily, toggleFollowPerson, usePrefs } from '../prefs';
import { ERA_LABELS } from '../era';
import { ERAS as TECH_ERAS } from '../../engine/techtree/schema';

type Open = (s: Selection) => void;
type SD = NonNullable<ReturnType<typeof settlementDetail>>;
type PD = NonNullable<ReturnType<typeof polityDetail>>;
type PeD = NonNullable<ReturnType<typeof personDetail>>;
type ED = NonNullable<ReturnType<typeof eventDetail>>;
type TD = NonNullable<ReturnType<typeof tileDetail>>;
type CD = NonNullable<ReturnType<typeof cultureDetail>>;
type RD = NonNullable<ReturnType<typeof religionDetail>>;
type WD = NonNullable<ReturnType<typeof warSummary>>;
type PRef = { id: number; name: string; alive: boolean; title: string; age: number; look?: Look | null } | null | undefined;
type Extra = { onCity: (id: number) => void; onFamily: (id: number) => void; onLocate: (x: number, y: number) => void };

const yr = (t: number) => Math.floor(t / 12);
const KIND_LABEL: Record<Selection['kind'], string> = {
  settlement: 'Settlement', polity: 'Polity', person: 'Person', event: 'Event', culture: 'Culture', religion: 'Religion', tile: 'Land', war: 'War',
};

export function Inspector(props: { sel: Selection; onOpen: Open; onBack?: () => void; onClose: () => void } & Extra) {
  const { sel, onOpen } = props;
  return (
    <div className="insp">
      <div className="insp-head">
        {props.onBack && <button className="icon" onClick={props.onBack} title="Back (Esc)">←</button>}
        <span className="muted small">{KIND_LABEL[sel.kind]}</span>
        <span className="grow" />
        <button className="icon" onClick={props.onClose} title="Close">×</button>
      </div>
      <div className="insp-body">
        {sel.kind === 'settlement' && <SettlementPanel id={sel.id} onOpen={onOpen} x={props} />}
        {sel.kind === 'polity' && <PolityPanel id={sel.id} onOpen={onOpen} />}
        {sel.kind === 'person' && <PersonPanel id={sel.id} onOpen={onOpen} x={props} />}
        {sel.kind === 'event' && <EventPanel id={sel.id} onOpen={onOpen} />}
        {sel.kind === 'tile' && <TilePanel id={sel.id} onOpen={onOpen} />}
        {sel.kind === 'culture' && <CulturePanel id={sel.id} onOpen={onOpen} />}
        {sel.kind === 'religion' && <ReligionPanel id={sel.id} onOpen={onOpen} />}
        {sel.kind === 'war' && <WarPanel id={sel.id} onOpen={onOpen} />}
      </div>
    </div>
  );
}

function PersonLink({ p, onOpen, face }: { p: PRef; onOpen: Open; face?: boolean }) {
  if (!p) return <span className="muted">—</span>;
  if (face) return <span className="face-link"><Portrait look={p.look} size={26} framed={false} /><Link to={{ kind: 'person', id: p.id }} onOpen={onOpen} className={p.alive ? '' : 'dead'}>{p.title ? `${p.title} ` : ''}{p.name}{p.alive ? '' : ' †'}</Link></span>;
  return <Link to={{ kind: 'person', id: p.id }} onOpen={onOpen} className={p.alive ? '' : 'dead'}>{p.title ? `${p.title} ` : ''}{p.name}{p.alive ? '' : ' †'}</Link>;
}

function Events({ events, onOpen, empty }: { events: HistEvent[]; onOpen: Open; empty?: string }) {
  if (!events.length) return <Empty>{empty ?? 'Nothing recorded yet.'}</Empty>;
  return <div className="event-list">{events.map((e) => <EventRow key={e.id} e={e} onOpen={onOpen} />)}</div>;
}

// ------------------------------------------------------------------ settlement

function SettlementPanel({ id, onOpen, x }: { id: number; onOpen: Open; x: Extra }) {
  const { data: d } = useQuery<SD | null>('settlement', id, 2);
  if (!d) return <Empty>Loading…</Empty>;
  const hist = d.history;
  return (
    <>
      {d.alive && <button className="town-hero" onClick={() => x.onCity(d.id)} title="Walk its streets">
        <TownThumb d={d} />
        <span className="town-hero-cta">Walk its streets →</span>
        <span className="town-hero-era">{ERA_LABELS[d.era]}</span>
      </button>}
      <h2>{d.name}</h2>
      <div className="sub">
        {d.alive ? (d.nomadic ? 'Nomadic band' : d.pop > 3000 ? 'City' : d.pop > 500 ? 'Town' : d.pop > 120 ? 'Village' : 'Hamlet') : `Abandoned in ${yr(d.abandoned)}`}
        {' · '}founded {yr(d.founded)}
        {d.polity && <> · <Link to={{ kind: 'polity', id: d.polity.id }} onOpen={onOpen}>{d.polity.name}</Link>{d.polity.capital ? ' (capital)' : ''}</>}
      </div>
      <div className="stat-row">
        <div><b>{fmtCount(d.pop)}</b><span>people</span></div>
        <div><b>{fmtCount(d.households)}</b><span>households</span></div>
        <div title="Food available relative to need"><b className={d.foodRatio < 0.85 ? 'bad' : ''}>{fmtPct(d.foodRatio)}</b><span>food</span></div>
        <div title="Probability-weighted unrest"><b className={d.unrest > 0.5 ? 'bad' : ''}>{fmtPct(d.unrest)}</b><span>unrest</span></div>
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 4 }}>
        {d.alive && <button onClick={() => x.onCity(d.id)}>View town</button>}
        <button onClick={() => x.onLocate(d.x, d.y)}>Show on map</button>
      </div>
      {hist.length > 2 && (
        <LineChart height={130} x={hist.map((h) => h.y)} series={[{ name: 'Population', values: hist.map((h) => h.pop) }]} title="Population" />
      )}
      <Section title="Society">
        <KV rows={[
          ['Culture', <Link to={{ kind: 'culture', id: d.cultureId }} onOpen={onOpen}>{d.culture}</Link>],
          ['Religion', d.religionId >= 0 ? <Link to={{ kind: 'religion', id: d.religionId }} onOpen={onOpen}>{d.religion}</Link> : '—'],
          ['Founder', d.founder ? <PersonLink p={d.founder} onOpen={onOpen} /> : null],
          ['Cohesion', <Meter value={d.cohesion} />, 'Social cohesion: shared culture and faith, low inequality'],
          ['Prosperity', <Meter value={d.prosperity} />],
          ['Hungry households', fmtPct(d.hungerShare)],
        ]} />
        {d.cultures.length > 1 && <><div className="mini-h">Cultures</div><Bars items={d.cultures.slice(0, 5).map((c, i) => ({ label: c.name, value: c.n, color: SERIES[i] }))} /></>}
        {d.religions.length > 1 && <><div className="mini-h">Faiths</div><Bars items={d.religions.slice(0, 5).map((c, i) => ({ label: c.name, value: c.n, color: SERIES[i] }))} /></>}
      </Section>
      <Section title="Livelihoods">
        <Bars items={d.occupations.filter((o) => o.name !== 'Dependent').sort((a, b) => b.n - a.n).map((o) => ({ label: o.name, value: o.n }))} />
        <div className="mini-h">Age structure (decades)</div>
        <Bars items={d.ages.map((n, i) => ({ label: `${i * 10}–${i * 10 + 9}`, value: n }))} />
      </Section>
      <Section title="Economy">
        <KV rows={[
          ['Granary', `${fmtNum(d.granary)} food`],
          ['Household food', fmtNum(d.food)],
          ['Money held', fmtNum(d.money)],
          ['Territory', `${d.territory} tiles`],
          ['Farmland', `${fmtNum(d.farmland)} tiles`],
          ['Forest', fmtNum(d.forest), 'Total forest biomass in territory'],
          ['Wild game', fmtPct(d.gameShare), 'Game stock relative to capacity'],
          ['Soil fertility', fmtPct(d.soil), 'Farmland fertility relative to its natural level'],
        ]} />
        <table className="grid-table small">
          <thead><tr><th>Good</th><th>Price</th><th>Supply</th><th>Demand</th><th>Traded</th></tr></thead>
          <tbody>{d.prices.map((p) => <tr key={p.good}><td>{p.good}</td><td>{p.price.toFixed(2)}</td><td>{fmtNum(p.supply)}</td><td>{fmtNum(p.demand)}</td><td>{fmtNum(p.volume)}</td></tr>)}</tbody>
        </table>
      </Section>
      <Section title="Buildings & knowledge" open={false}>
        <KV rows={d.buildings.map((b) => [b.name, b.level.toFixed(1)] as [string, string])} />
        {d.project && <div className="small">Building: {d.project.name} ({fmtPct(d.project.progress)})</div>}
        <div className="mini-h">Known ({d.techs.length})</div>
        {d.techsByEra.map((g, i) => (
          <details key={g.era} className="known-era" open={i === 0}>
            <summary>{TECH_ERAS[g.era]} ({g.names.length})</summary>
            <div className="chips">{g.names.map((t) => <span key={t} className="chip">{t}</span>)}</div>
          </details>
        ))}
        {d.research.length > 0 && <><div className="mini-h">Close to discovering</div><Bars items={d.research.map((r) => ({ label: r.name, value: r.p }))} fmt={fmtPct} max={1} /></>}
      </Section>
      <Section title="Connections" open={false}>
        {d.contacts.length ? d.contacts.map((c) => (
          <div key={c.id} className="row"><Link to={{ kind: 'settlement', id: c.id }} onOpen={onOpen}>{c.name}</Link><span className="grow" /><Meter value={c.k} hi={3} title={`Contact strength ${c.k.toFixed(2)}`} /></div>
        )) : <Empty>No regular contacts.</Empty>}
      </Section>
      <Section title="Notable residents" open={false}>
        {d.notable.length ? d.notable.map((p) => <div key={p.id} className="row"><PersonLink p={p} onOpen={onOpen} face /><span className="grow" /><span className="muted small">{p.age}</span></div>) : <Empty>No notable residents.</Empty>}
      </Section>
      <Section title="History"><Events events={d.events} onOpen={onOpen} /></Section>
    </>
  );
}

// ------------------------------------------------------------------ polity

const GOV_FIELDS: [keyof PD['gov'], string, string][] = [
  ['centralization', 'Centralisation', 'How much power sits with the centre rather than local communities'],
  ['participation', 'Participation', 'Share of people with a say in decisions'],
  ['heredity', 'Hereditary legitimacy', 'Weight of birth and lineage in who rules'],
  ['sacral', 'Sacred legitimacy', 'Weight of religious sanction'],
  ['merit', 'Merit', 'Weight of competence'],
  ['consent', 'Consent', 'Weight of popular support'],
  ['force', 'Force', 'Weight of military power'],
  ['tolerance', 'Tolerance', 'Tolerance of other faiths and cultures'],
  ['taxRate', 'Tax rate', 'Share of market sales taken as tax'],
];
const INST_LABEL: Record<string, string> = {
  council: 'Council', hereditary: 'Hereditary rule', priesthood: 'Priesthood', writtenLaw: 'Written law', conscription: 'Conscription',
  publicGranary: 'Public granary', schools: 'Schools', bureaucracy: 'Bureaucracy', privateProperty: 'Private property', primogeniture: 'Primogeniture', stateReligion: 'State religion',
};

function PolityPanel({ id, onOpen }: { id: number; onOpen: Open }) {
  const { data: d } = useQuery<PD | null>('polity', id, 3);
  if (!d) return <Empty>Loading…</Empty>;
  const h = d.history;
  return (
    <>
      <h2><i className="swatch" style={{ background: hueCss(d.hue) }} />{d.name}</h2>
      <div className="sub">{d.label} · {d.alive ? `since ${yr(d.founded)}` : `${yr(d.founded)}–${yr(d.ended)}`}</div>
      <div className="stat-row">
        <div><b>{fmtCount(d.pop)}</b><span>people</span></div>
        <div><b>{d.settlements.length}</b><span>settlements</span></div>
        <div><b>{fmtNum(d.treasury)}</b><span>treasury</span></div>
        <div title="Legitimacy of the ruler"><b className={d.legitimacy < 0.3 ? 'bad' : ''}>{fmtPct(d.legitimacy)}</b><span>legitimacy</span></div>
      </div>
      {h.length > 2 && <LineChart height={130} x={h.map((x) => x.y)} series={[{ name: 'Population', values: h.map((x) => x.pop) }, { name: 'Army', values: h.map((x) => x.army) }]} />}
      <KV rows={[
        ['Ruler', d.leader ? <PersonLink p={d.leader} onOpen={onOpen} face /> : '—'],
        ['Dynasty', d.dynasty || '—'],
        ['Capital', <Link to={{ kind: 'settlement', id: d.capital.id }} onOpen={onOpen}>{d.capital.name}</Link>],
        ['Culture', d.culture], ['State faith', d.religion], ['Revenue last year', fmtNum(d.revenue), 'Taxes collected, in shells'], ['Spending last year', fmtNum(d.spending), 'Wages, welfare and payments to the elite'], ['War weariness', <Meter value={d.warWeariness} />],
      ]} />
      <Section title="How it is governed">
        <p className="small muted">Government is a set of continuous traits that drift with the values of the people, crises and the ruler. The label is a description of the current mix, not a stage.</p>
        {GOV_FIELDS.map(([k, label, tip]) => <div key={k} className="row" title={tip}><span className="small">{label}</span><span className="grow" /><Meter value={d.gov[k]} /></div>)}
        <div className="mini-h">Institutions</div>
        <div className="chips">{Object.entries(d.inst).filter(([, v]) => v).map(([k]) => <span key={k} className="chip">{INST_LABEL[k] ?? k}</span>)}</div>
        <div className="mini-h">Spending</div>
        <Bars items={[['Military', d.gov.spendMilitary], ['Welfare', d.gov.spendWelfare], ['Building', d.gov.spendBuild], ['Learning', d.gov.spendLearning], ['Religion', d.gov.spendReligion]].map(([l, v]) => ({ label: l as string, value: v as number }))} fmt={fmtPct} />
      </Section>
      <Section title="Settlements" open={false}>
        {d.settlements.map((s) => <div key={s.id} className="row"><Link to={{ kind: 'settlement', id: s.id }} onOpen={onOpen}>{s.name}</Link><span className="grow" /><span className="small muted">{s.pop}</span></div>)}
      </Section>
      <Section title="Relations">
        {d.relations.length ? (
          <table className="grid-table small">
            <thead><tr><th>Polity</th><th title="Opinion of them">Opinion</th><th title="Accumulated grievance">Grievance</th><th>Status</th></tr></thead>
            <tbody>{d.relations.slice(0, 14).map((r) => (
              <tr key={r.id}><td><Link to={{ kind: 'polity', id: r.id }} onOpen={onOpen}>{r.name}</Link></td>
                <td className={r.opinion < -0.3 ? 'bad' : r.opinion > 0.3 ? 'good' : ''}>{r.opinion.toFixed(2)}</td>
                <td>{r.grievance.toFixed(1)}</td>
                <td>{r.war >= 0 ? <Link to={{ kind: 'war', id: r.war }} onOpen={onOpen} className="bad">at war</Link> : r.treaty !== 'none' ? r.treaty : ''}</td></tr>
            ))}</tbody>
          </table>
        ) : <Empty>No known neighbours.</Empty>}
      </Section>
      <Section title="Rulers" open={false}>
        {d.leaders.map((l, i) => <div key={i} className="row"><Link to={{ kind: 'person', id: l.id }} onOpen={onOpen}>{l.name}</Link><span className="grow" /><span className="small muted">{yr(l.from)}–{l.to >= 0 ? yr(l.to) : ''}</span></div>)}
      </Section>
      {d.wars.length > 0 && (
        <Section title="Wars" open={false}>
          {d.wars.map((w) => w && <div key={w.id} className="row"><Link to={{ kind: 'war', id: w.id }} onOpen={onOpen}>{w.name}</Link><span className="grow" /><span className="small muted">{yr(w.started)}{w.active ? "–" : `–${yr(w.ended)}`}</span></div>)}
        </Section>
      )}
      <Section title="History"><Events events={d.events} onOpen={onOpen} /></Section>
    </>
  );
}

// ------------------------------------------------------------------ person

function PersonPanel({ id, onOpen, x }: { id: number; onOpen: Open; x: Extra }) {
  const { data: d } = useQuery<PeD | null>('person', id, 6);
  const prefs = usePrefs();
  if (!d) return <Empty>Loading… (people who died long ago and left no mark are eventually forgotten)</Empty>;
  const followP = prefs.follow.persons.some((p) => p.id === d.id);
  const followF = prefs.follow.families.includes(d.family);
  return (
    <>
      <div className="person-head">
        <Portrait look={d.look} size={104} title={`${d.name} ${d.family}`} />
        <div className="person-id">
          <h2>{d.title ? `${d.title} ` : ''}{d.name} {d.family}{d.alive ? '' : ' †'}</h2>
          <div className="sub">
            {d.sex === 0 ? 'Woman' : 'Man'}, {d.age} · {d.occupation}
            {d.settlement && <> · <Link to={{ kind: 'settlement', id: d.settlement.id }} onOpen={onOpen}>{d.settlement.name}</Link></>}
          </div>
          <div className="sub small">Born {yr(d.born)}{d.alive ? '' : `, died ${yr(d.died)} (${d.cause})`} · {d.culture} · {d.religion}</div>
          {d.represents > 1 && <div className="pill represents" title="Ordinary people are simulated in groups: this person stands for others like them">Represents {fmtNum(d.represents)} people</div>}
        </div>
      </div>
      <div className="row person-actions">
        <button onClick={() => x.onFamily(d.id)}>Family tree</button>
        <button className={followP ? 'on' : ''} onClick={() => toggleFollowPerson(d.id, `${d.name} ${d.family}`)} title="Get an alert when they make history">{followP ? '★ Following' : '☆ Follow'}</button>
        <button className={followF ? 'on' : ''} onClick={() => toggleFollowFamily(d.family)} title="Get an alert when anyone of this family makes history">{followF ? `★ House ${d.family}` : `☆ Follow House ${d.family}`}</button>
      </div>
      {d.condition && (
        <div className="stat-row">
          <div><Meter value={d.condition.health} color={d.condition.health < 0.4 ? 'var(--bad)' : undefined} /><span>health</span></div>
          <div><Meter value={d.condition.nutrition} /><span>nutrition</span></div>
          <div><Meter value={d.condition.happiness} /><span>wellbeing</span></div>
          <div><Meter value={d.condition.status} /><span>status</span></div>
        </div>
      )}
      {d.condition?.infected && <div className="pill bad">Ill with {d.condition.infected}</div>}
      <Section title="Family">
        <KV rows={[
          ['Mother', <PersonLink p={d.mother} onOpen={onOpen} face />], ['Father', <PersonLink p={d.father} onOpen={onOpen} face />],
          ['Spouse', <PersonLink p={d.spouse} onOpen={onOpen} face />],
        ]} />
        {d.children.length > 0 && <><div className="mini-h">Children ({d.children.length})</div>{d.children.map((c) => c && <div key={c.id} className="row"><PersonLink p={c} onOpen={onOpen} face /><span className="grow" /><span className="small muted">{c.age}</span></div>)}</>}
        {d.household && <KV rows={[['Household', `${d.household.members} people`], ['Money', fmtNum(d.household.money)], ['Food', fmtNum(d.household.food)], ['Land', `${d.household.land.toFixed(2)} tiles`], ['Tools', fmtNum(d.household.tools)]]} />}
      </Section>
      {d.traits && (
        <Section title="Character">
          {Object.entries(d.traits).map(([k, v]) => <div key={k} className="row"><span className="small">{k[0].toUpperCase() + k.slice(1)}</span><span className="grow" /><Meter value={v} /></div>)}
          {d.skills.length > 0 && <><div className="mini-h">Skills</div><Bars items={d.skills.map((s) => ({ label: s.name, value: s.v }))} max={1} fmt={(v) => v.toFixed(2)} /></>}
        </Section>
      )}
      <Section title="Beliefs & values">
        {d.values.map((v, i) => <Axis key={v.name} value={v.v} left={VALUE_POLES[i][0]} right={VALUE_POLES[i][1]} />)}
      </Section>
      {(d.friends.length > 0 || d.rivals.length > 0) && (
        <Section title="Relationships" open={false}>
          {d.friends.map((f) => <div key={f.id} className="row"><Link to={{ kind: 'person', id: f.id! }} onOpen={onOpen}>{f.name}</Link><span className="grow" /><span className="good small">friend</span></div>)}
          {d.rivals.map((f) => <div key={f.id} className="row"><Link to={{ kind: 'person', id: f.id! }} onOpen={onOpen}>{f.name}</Link><span className="grow" /><span className="bad small">rival</span></div>)}
        </Section>
      )}
      <Section title="Memories">
        <p className="small muted">Formative experiences. They shape this person's values, grievances and loyalties.</p>
        {d.memories.length ? d.memories.slice().reverse().map((m, i) => <div key={i} className="row small"><span className="muted ev-year">{yr(m.t)}</span><span>{m.kind}</span></div>) : <Empty>No strong memories.</Empty>}
      </Section>
      {d.deeds.length > 0 && <Section title="Deeds"><Events events={d.deeds} onOpen={onOpen} /></Section>}
    </>
  );
}

// ------------------------------------------------------------------ event with causal chain

interface CauseNode { event: HistEvent; causes: CauseNode[] }
function CauseTree({ nodes, onOpen, depth = 0 }: { nodes: CauseNode[]; onOpen: Open; depth?: number }) {
  return (
    <div className={`cause-tree d${depth}`}>
      {nodes.map((n) => (
        <div key={n.event.id} className="cause-node">
          <EventRow e={n.event} onOpen={onOpen} showWhy />
          {n.causes.length > 0 && <CauseTree nodes={n.causes} onOpen={onOpen} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

function EventPanel({ id, onOpen }: { id: number; onOpen: Open }) {
  const { data: d } = useQuery<ED | null>('event', id, 0);
  if (!d) return <Empty>This event has been pruned from the record (minor events are forgotten after a few decades).</Empty>;
  const e = d.event;
  return (
    <>
      <div className="sub"><span className={`ev-type t-${e.type}`}>{eventLabel(e.type)}</span> · {d.date} · importance {e.imp}/5</div>
      <h2 className="event-title">{e.text}</h2>
      {e.why && <div className="why"><b>Why: </b>{e.why}</div>}
      <Section title="Caused by">
        {d.causes.length ? <CauseTree nodes={d.causes as CauseNode[]} onOpen={onOpen} /> : <Empty>No earlier recorded event is linked as a cause. The explanation above comes from the state of the world at the time.</Empty>}
      </Section>
      <Section title="Led to">
        <Events events={d.consequences} onOpen={onOpen} empty="No later recorded event cites this one (yet)." />
      </Section>
      <Section title="Involved">
        {d.persons.map((p) => p && <div key={p.id} className="row"><PersonLink p={p} onOpen={onOpen} face /></div>)}
        {d.settlements.map((s) => <div key={s.id} className="row"><Link to={{ kind: 'settlement', id: s.id }} onOpen={onOpen}>{s.name}</Link></div>)}
        {d.polities.map((s) => <div key={s.id} className="row"><Link to={{ kind: 'polity', id: s.id }} onOpen={onOpen}>{s.name}</Link></div>)}
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ tile, culture, religion, war

function TilePanel({ id, onOpen }: { id: number; onOpen: Open }) {
  const { data: d } = useQuery<TD | null>('tile', id, 6);
  if (!d) return <Empty>Loading…</Empty>;
  return (
    <>
      <h2>{d.biome}</h2>
      <div className="sub">Tile {d.x}, {d.y}{d.owner && <> · claimed by <Link to={{ kind: 'settlement', id: d.owner.id }} onOpen={onOpen}>{d.owner.name}</Link></>}</div>
      {!d.water && <KV rows={[
        ['Elevation', d.elevation.toFixed(2)], ['Temperature', `${d.temperature.toFixed(1)} °C`], ['Moisture', fmtPct(d.rainfall)],
        ['River', d.river ? `class ${d.river}` : 'none'],
        ['Soil fertility', `${d.fertility.toFixed(2)} of ${d.fertilityBase.toFixed(2)} natural`],
        ['Forest', `${d.forest.toFixed(2)} of ${d.forestCap.toFixed(2)}`],
        ['Wild game', `${d.game.toFixed(1)} of ${d.gameCap.toFixed(1)}`],
        ['Stone', d.stone.toFixed(2)], ['Ore', d.oreKind !== 'None' ? `${d.oreKind} (${d.ore.toFixed(0)} left)` : 'none'],
        ['Farmland', fmtPct(d.farmland)], ['Irrigated', d.irrigated ? 'yes' : 'no'], ['Salinity', d.salinity > 0.01 ? fmtPct(d.salinity) : 'none'],
      ]} />}
      {d.water && <KV rows={[['Fish', d.fish.toFixed(1)]]} />}
    </>
  );
}

function CulturePanel({ id, onOpen }: { id: number; onOpen: Open }) {
  const { data: d } = useQuery<CD | null>('culture', id, 12);
  if (!d) return <Empty>Loading…</Empty>;
  return (
    <>
      <h2><i className="swatch" style={{ background: hueCss(d.hue) }} />{d.name}</h2>
      <div className="sub">{d.alive ? `${d.members} people` : 'Extinct'} · emerged {yr(d.founded)}{d.parentName && d.parent >= 0 && <> from <Link to={{ kind: 'culture', id: d.parent }} onOpen={onOpen}>{d.parentName}</Link></>}</div>
      <Section title="Shared values">{d.values.map((v, i) => <Axis key={v.name} value={v.v} left={VALUE_POLES[i][0]} right={VALUE_POLES[i][1]} />)}</Section>
      <Section title="Settlements">{d.settlements.length ? d.settlements.map((s) => <div key={s.id} className="row"><Link to={{ kind: 'settlement', id: s.id }} onOpen={onOpen}>{s.name}</Link><span className="grow" /><span className="small muted">{s.pop}</span></div>) : <Empty>None where it is dominant.</Empty>}</Section>
      {d.daughters.length > 0 && <Section title="Daughter cultures">{d.daughters.map((x) => <div key={x.id} className="row"><Link to={{ kind: 'culture', id: x.id }} onOpen={onOpen}>{x.name}</Link></div>)}</Section>}
    </>
  );
}

function ReligionPanel({ id, onOpen }: { id: number; onOpen: Open }) {
  const { data: d } = useQuery<RD | null>('religion', id, 12);
  if (!d) return <Empty>Loading…</Empty>;
  return (
    <>
      <h2><i className="swatch" style={{ background: hueCss(d.hue) }} />{d.name}</h2>
      <div className="sub">{d.alive ? `${d.members} faithful` : 'Extinct'} · founded {yr(d.founded)}{d.founderRef && <> by <PersonLink p={d.founderRef} onOpen={onOpen} /></>}
        {d.parentName && d.parent >= 0 && <> · from <Link to={{ kind: 'religion', id: d.parent }} onOpen={onOpen}>{d.parentName}</Link></>}</div>
      <KV rows={[['Proselytism', <Meter value={d.proselytism} />], ['Deity', d.deity || null], ['Tolerance', <Meter value={d.tolerance} />], ['Holy war', <Meter value={d.holyWar} />]]} />
      <Section title="Doctrine emphasis">{d.doctrineV.map((v, i) => <Axis key={v.name} value={v.v} left={VALUE_POLES[i][0]} right={VALUE_POLES[i][1]} />)}</Section>
      <Section title="Where it prevails">{d.settlements.length ? d.settlements.map((s) => <div key={s.id} className="row"><Link to={{ kind: 'settlement', id: s.id }} onOpen={onOpen}>{s.name}</Link><span className="grow" /><span className="small muted">{s.pop}</span></div>) : <Empty>Not dominant anywhere.</Empty>}</Section>
    </>
  );
}

function WarPanel({ id, onOpen }: { id: number; onOpen: Open }) {
  const { data: d } = useQuery<WD | null>('war', id, 3);
  if (!d) return <Empty>Loading…</Empty>;
  const polList = (ps: { id: number; name: string }[]) => <>{ps.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<Link to={{ kind: 'polity', id: p.id }} onOpen={onOpen}>{p.name}</Link></span>)}</>;
  return (
    <>
      <h2>{d.name}</h2>
      <div className="sub">{yr(d.started)}{d.active ? ' – ongoing' : `–${yr(d.ended)}`} · aim: {d.goal} · target <Link to={{ kind: 'settlement', id: d.target }} onOpen={onOpen}>{d.targetName}</Link></div>
      <div className="why"><b>Casus belli: </b>{d.casusBelli}</div>
      <KV rows={[
        ['Attackers', polList(d.attackersN)],
        ['Defenders', polList(d.defendersN)],
        ['Battles', d.battles],
        ['Dead', `${d.casualties[0]} attackers, ${d.casualties[1]} defenders`],
        ['Balance', d.active ? (d.score > 0.1 ? 'attackers winning' : d.score < -0.1 ? 'defenders winning' : 'stalemate') : null],
        ['Outcome', d.outcome || null],
      ]} />
      {d.causes.length > 0 && <Section title="Causes">{d.causes.map((c) => <div key={c} className="row"><Link to={{ kind: 'event', id: c }} onOpen={onOpen}>Open cause #{c} →</Link></div>)}</Section>}
    </>
  );
}
