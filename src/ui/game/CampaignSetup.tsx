/**
 * Starting a campaign: make a world, watch its history pass, choose a founding story,
 * settle the creed and the Order's name, then the First Oath.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { sim } from '../client';
import { useQuery, useSim } from '../hooks';
import { Portrait } from '../art/Portrait';
import { TownThumb } from '../city/TownThumb';
import type { settlementDetail } from '../../engine/query';
import type { Creed, FoundingStory, WorldSetup } from '../../game/view';
import { VOWS } from '../../game/view';
import { AXIS_POLES, CREED_QUESTIONS, creedFromAnswers, oathText } from '../../game/founding';
import { Icon, Mark } from './Icons';
import { useSettings } from './settings';
import { FirstOath } from './FirstOath';

type SD = NonNullable<ReturnType<typeof settlementDetail>>;
export interface CampaignStart { story: FoundingStory; creed: Creed; name: string; meaning: string }

const SIZES: { id: WorldSetup['size']; label: string; desc: string; w: number; h: number }[] = [
  { id: 'small', label: 'A corner of the world', desc: 'A few peoples on a small map. Quickest to make, and every city matters.', w: 64, h: 40 },
  { id: 'medium', label: 'A region', desc: 'Several realms and faiths. History takes a little longer to make.', w: 96, h: 60 },
  { id: 'large', label: 'A continent', desc: 'Many peoples and empires. Slow to make and slow to play.', w: 128, h: 80 },
];
const TEMPERS: { id: WorldSetup['temperament']; label: string; desc: string; cfg: Record<string, number> }[] = [
  { id: 'gentle', label: 'Gentle', desc: 'Kind weather, rare plagues, slow tempers.', cfg: { disasters: 0.5, climateVolatility: 0.6, diseaseVirulence: 0.7, aggression: -0.3, fertility: 1.15 } },
  { id: 'temperate', label: 'Temperate', desc: 'The world as it comes.', cfg: {} },
  { id: 'harsh', label: 'Harsh', desc: 'Hard winters, hungry years, quick swords.', cfg: { disasters: 1.6, climateVolatility: 1.5, diseaseVirulence: 1.3, aggression: 0.35, fertility: 0.9 } },
];
const WORDS = ['Amber', 'Ashen', 'Hollow', 'Silver', 'Drowned', 'Golden', 'Quiet', 'Northern', 'Scattered', 'Twin', 'Salt', 'Lantern'];
const NOUNS = ['Reach', 'Shore', 'Lands', 'Isles', 'Vale', 'Steppe', 'Basin', 'Coast', 'Marches', 'Realm'];
const worldName = (seed: number) => `The ${WORDS[seed % WORDS.length]} ${NOUNS[Math.floor(seed / 7) % NOUNS.length]}`;

type Step = 'world' | 'ages' | 'story' | 'creed' | 'name' | 'oath';
const STEP_LABELS: [Step, string][] = [['world', 'The world'], ['ages', 'Its history'], ['story', 'The founder'], ['creed', 'The creed'], ['name', 'The name'], ['oath', 'The First Oath']];

export function CampaignSetup(props: { onBegin: (c: CampaignStart) => void; onBack: () => void; /** Fixed world for the tutorial. */ fixed?: { setup: WorldSetup; name: string } }) {
  const settings = useSettings();
  const [step, setStep] = useState<Step>(props.fixed ? 'ages' : 'world');
  const [setup, setSetup] = useState<WorldSetup>(props.fixed?.setup ?? { size: 'small', temperament: 'temperate', seed: Math.floor(Math.random() * 1e6), years: settings.historyYears });
  const [story, setStory] = useState<FoundingStory | null>(null);
  const [creed, setCreed] = useState<Creed | null>(null);
  const [name, setName] = useState<{ name: string; meaning: string } | null>(null);
  const started = useRef(false);

  const startWorld = (s: WorldSetup) => {
    const size = SIZES.find((x) => x.id === s.size)!;
    const t = TEMPERS.find((x) => x.id === s.temperament)!;
    sim.create({ name: props.fixed?.name ?? worldName(s.seed), seed: s.seed, width: size.w, height: size.h, agentBudget: s.size === 'small' ? 3000 : s.size === 'medium' ? 4500 : 6000, ...t.cfg });
    started.current = false;
    setStep('ages');
  };
  const madeFixed = useRef(false);
  useEffect(() => { if (props.fixed && !madeFixed.current) { madeFixed.current = true; startWorld(props.fixed.setup); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = STEP_LABELS.findIndex(([s]) => s === step);
  if (step === 'oath' && story && creed && name) {
    return <FirstOath story={story} creed={creed} name={name.name} onDone={() => props.onBegin({ story, creed, name: name.name, meaning: name.meaning })} />;
  }
  return (
    <div className="setup">
      <header className="setup-head">
        <button className="ghost" onClick={() => { sim.cancelGenerate(); props.onBack(); }} aria-label="Back to the start screen"><Icon name="back" /></button>
        <span className="gold"><Mark size={28} /></span>
        <div className="col" style={{ gap: 2 }}>
          <span className="label">{props.fixed ? 'Tutorial' : 'New campaign'}</span>
          <nav className="steps" aria-label="Steps">
            {STEP_LABELS.map(([s, l], i) => <span key={s} className="row" style={{ gap: 6 }}><span className={i === idx ? 'on' : i < idx ? '' : 'faint'}>{l}</span>{i < STEP_LABELS.length - 1 && <span className="sep">·</span>}</span>)}
          </nav>
        </div>
      </header>
      <main className="setup-body">
        {step === 'world' && <WorldStep setup={setup} onChange={setSetup} onGo={() => startWorld(setup)} />}
        {step === 'ages' && <AgesStep years={setup.years} started={started} onDone={() => setStep('story')} />}
        {step === 'story' && <StoryStep chosen={story} onChoose={(s) => { setStory(s); setCreed(s.creed); setName(s.names[0]); }} onNext={() => setStep('creed')} onBack={props.fixed ? undefined : () => setStep('world')} />}
        {step === 'creed' && story && creed && <CreedStep story={story} creed={creed} onChange={setCreed} onNext={() => setStep('name')} onBack={() => setStep('story')} />}
        {step === 'name' && story && creed && <NameStep story={story} creed={creed} chosen={name} onChoose={setName} onNext={() => setStep('oath')} onBack={() => setStep('creed')} />}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ world

function WorldStep({ setup, onChange, onGo }: { setup: WorldSetup; onChange: (s: WorldSetup) => void; onGo: () => void }) {
  return (
    <div className="col" style={{ gap: 26, maxWidth: 860 }}>
      <div>
        <h1>A world to work in</h1>
        <p className="dim italic">The world is made first and lives for centuries on its own. Your Order begins inside a history that is already there.</p>
      </div>
      <section className="col">
        <span className="label">Size</span>
        <div className="choice-grid">
          {SIZES.map((s) => <button key={s.id} className={`choice ${setup.size === s.id ? 'on' : ''}`} onClick={() => onChange({ ...setup, size: s.id })} aria-pressed={setup.size === s.id}><span className="t">{s.label}</span><span className="d">{s.desc}</span></button>)}
        </div>
      </section>
      <section className="col">
        <span className="label">Temperament</span>
        <div className="choice-grid">
          {TEMPERS.map((s) => <button key={s.id} className={`choice ${setup.temperament === s.id ? 'on' : ''}`} onClick={() => onChange({ ...setup, temperament: s.id })} aria-pressed={setup.temperament === s.id}><span className="t">{s.label}</span><span className="d">{s.desc}</span></button>)}
        </div>
      </section>
      <section className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
        <label className="row"><span className="label">History</span>
          <select value={setup.years} onChange={(e) => onChange({ ...setup, years: +e.target.value })}>{[120, 200, 300].map((y) => <option key={y} value={y}>{y} years</option>)}</select>
        </label>
        <label className="row"><span className="label">Seed</span>
          <input type="number" value={setup.seed} onChange={(e) => onChange({ ...setup, seed: Math.max(0, Math.floor(+e.target.value)) })} style={{ width: 120 }} />
        </label>
        <button className="ghost" onClick={() => onChange({ ...setup, seed: Math.floor(Math.random() * 1e6) })}><Icon name="dice" size={16} /> Another world</button>
        <span className="small faint italic">The same seed and choices always make the same world.</span>
      </section>
      <div className="row"><span className="grow" /><button className="seal" onClick={onGo}>Make the world</button></div>
    </div>
  );
}

// ------------------------------------------------------------------ the ages passing

function AgesStep({ years, started, onDone }: { years: number; started: React.MutableRefObject<boolean>; onDone: () => void }) {
  const st = useSim();
  useEffect(() => {
    if (st.ready && !started.current && st.frame) { started.current = true; sim.generate(years); }
  }, [st.ready, st.frame]); // eslint-disable-line react-hooks/exhaustive-deps
  const g = st.gen;
  useEffect(() => { if (g?.finished) { const t = setTimeout(onDone, 1400); return () => clearTimeout(t); } }, [g?.finished]); // eslint-disable-line react-hooks/exhaustive-deps
  const frac = g ? g.done / Math.max(1, g.total) : 0;
  const hs = g?.highlights.slice(-7) ?? [];
  const age = !g ? 'The land is shaped' : frac < 0.15 ? 'The first bands wander' : frac < 0.4 ? 'Villages take root' : frac < 0.7 ? 'Towns, rulers and gods' : frac < 0.95 ? 'Realms rise and fall' : 'The present day';
  return (
    <div className="ages" style={{ position: 'relative', minHeight: 'calc(100vh - 120px)' }}>
      <div className="ages-inner">
        <div className="label">Year</div>
        <div className="ages-year" aria-live="polite">{g ? g.year : 0}</div>
        <div className="ages-era">{age}{g && g.pop > 0 ? ` · ${g.pop.toLocaleString('en-US')} people` : ''}</div>
        <div className="ages-bar" role="progressbar" aria-valuenow={Math.round(frac * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${frac * 100}%` }} /></div>
        <div className="ages-feed">
          {hs.map((h, i) => <div key={`${h.year}-${h.text}`} className={`h ${i < hs.length - 3 ? 'old' : ''}`}><b>{h.year}</b>{h.text}</div>)}
          {!hs.length && <div className="h dim italic">The chronicle is still blank.</div>}
        </div>
        {g?.finished && <p className="gold italic">The world is ready. Somewhere in it, someone has had enough.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ founding stories

function StoryStep({ chosen, onChoose, onNext, onBack }: { chosen: FoundingStory | null; onChoose: (s: FoundingStory) => void; onNext: () => void; onBack?: () => void }) {
  const [roll, setRoll] = useState(0);
  const [stories, setStories] = useState<FoundingStory[] | null>(null);
  const [browse, setBrowse] = useState(false);
  useEffect(() => {
    let live = true;
    setStories(null);
    sim.query<FoundingStory[]>('foundings', roll).then((s) => { if (!live) return; setStories(s); if (s.length && (!chosen || roll > 0)) onChoose(s[0]); });
    return () => { live = false; };
  }, [roll]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="grow">
          <h1>Who begins it</h1>
          <p className="dim italic" style={{ maxWidth: '64ch' }}>Three people in this world have reason to want things different. Each is real, and so is what happened to them. Where you begin is how hard it will be.</p>
        </div>
        <button className="ghost" onClick={() => setRoll((r) => r + 1)}><Icon name="dice" size={16} /> Three others</button>
        <button className="ghost" onClick={() => setBrowse(true)}><Icon name="search" size={16} /> Choose anyone</button>
      </div>
      {!stories && <p className="dim italic">Reading the chronicle…</p>}
      {stories && !stories.length && <p className="dim">No one in this world fits yet. Choose someone yourself.</p>}
      <div className="stories">
        {stories?.map((s) => <StoryCard key={s.id} s={s} on={chosen?.id === s.id && chosen.founder.id === s.founder.id} onClick={() => onChoose(s)} />)}
      </div>
      {chosen && stories && !stories.some((s) => s.founder.id === chosen.founder.id) && (
        <div><span className="label">Your own choice</span><div className="stories" style={{ marginTop: 8 }}><StoryCard s={chosen} on onClick={() => {}} /></div></div>
      )}
      <div className="row">
        {onBack && <button className="ghost" onClick={onBack}><Icon name="back" size={16} /> A different world</button>}
        <span className="grow" />
        <button className="seal" disabled={!chosen} onClick={onNext}>Begin with {chosen?.founder.name.split(' ')[0] ?? '…'}</button>
      </div>
      {browse && <PersonPicker onClose={() => setBrowse(false)} onPick={(s) => { onChoose(s); setBrowse(false); }} />}
    </div>
  );
}

function StoryCard({ s, on, onClick }: { s: FoundingStory; on: boolean; onClick: () => void }) {
  const { data } = useQuery<SD | null>('settlement', s.settlement, 0);
  return (
    <button className={`story-card panel ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>
      <div className="art">
        {data ? <TownThumb d={data} /> : <div style={{ height: '100%', background: 'var(--ink-2)' }} />}
        <div className="faces">
          <Portrait look={s.founder.look} size={62} />
          <Portrait look={s.companion.look} size={44} />
        </div>
      </div>
      <div className="body">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="t grow">{s.title}</div>
          <span className={`diff ${s.difficulty}`} title={s.difficultyWhy}>{s.difficulty}</span>
        </div>
        <div className="small dim">{s.founder.name}, {s.founder.age} · {s.settlementName}, {s.polityName}</div>
        <div className="ev">{s.event}</div>
        <div className="small">{s.summary}</div>
        <div className="small dim" style={{ marginTop: 'auto' }}><span className="label">Why</span> {s.difficultyWhy}</div>
      </div>
    </button>
  );
}

function PersonPicker({ onClose, onPick }: { onClose: () => void; onPick: (s: FoundingStory) => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<{ id: number; name: string; age: number; settlement?: string; occ?: string; title: string }[]>([]);
  useEffect(() => {
    const t = setTimeout(() => sim.query<typeof rows>('people', { text, notable: false, dead: false }).then((r) => setRows(r.filter((x) => x.age >= 18).slice(0, 60))), 200);
    return () => clearTimeout(t);
  }, [text]);
  const pick = async (id: number) => { const s = await sim.query<FoundingStory | null>('story-for', id); if (s) onPick(s); };
  return (
    <div className="hh-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hh-modal panel" role="dialog" aria-label="Choose a founder">
        <div className="hh-modal-head"><h2>Choose anyone</h2><span className="grow" /><button className="ghost" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <div className="hh-modal-body col">
          <input autoFocus placeholder="Search by name" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search by name" />
          <div className="col" style={{ gap: 2, maxHeight: 380, overflow: 'auto' }}>
            {rows.map((r) => <button key={r.id} className="ghost" style={{ textAlign: 'left' }} onClick={() => pick(r.id)}>{r.name}<span className="small dim">, {r.age}, {r.occ?.toLowerCase()} in {r.settlement}{r.title ? ` · ${r.title}` : ''}</span></button>)}
            {!rows.length && <span className="dim italic small">No one by that name.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ creed

type CreedRoute = 'founder' | 'questions' | 'write';
function CreedStep({ story, creed, onChange, onNext, onBack }: { story: FoundingStory; creed: Creed; onChange: (c: Creed) => void; onNext: () => void; onBack: () => void }) {
  const [route, setRoute] = useState<CreedRoute>('founder');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const first = story.founder.name.split(' ')[0];
  useEffect(() => { if (route === 'founder') onChange(story.creed); }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (route === 'questions' && Object.keys(answers).length) onChange(creedFromAnswers(story.creed, answers)); }, [answers]); // eslint-disable-line react-hooks/exhaustive-deps
  const setAxis = (i: number, v: number) => { const d = [...creed.direction]; d[i] = v; onChange({ ...creed, direction: d }); };
  const toggleVow = (id: string) => {
    let vows = creed.vows.includes(id) ? creed.vows.filter((v) => v !== id) : [...creed.vows, id];
    if (vows.length > 3) vows = vows.slice(1);
    onChange({ ...creed, vows, oath: oathText(vows) });
  };
  const toggleFocus = (i: number) => {
    const f = creed.focus.includes(i) ? creed.focus : ([creed.focus[1], i] as [number, number]);
    onChange({ ...creed, focus: f });
  };
  const answered = CREED_QUESTIONS.every((q) => answers[q.id]);
  return (
    <div className="col" style={{ gap: 20 }}>
      <div>
        <h1>What the Order believes</h1>
        <p className="dim italic" style={{ maxWidth: '66ch' }}>The creed decides who will join, how loyal they stay, and what the Order will spend centuries trying to bring about. It will change as the Order acts.</p>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }} role="tablist" aria-label="How to set the creed">
        <button role="tab" aria-selected={route === 'founder'} className={`chip ${route === 'founder' ? 'on' : ''}`} onClick={() => setRoute('founder')}>Take {first}'s</button>
        <button role="tab" aria-selected={route === 'questions'} className={`chip ${route === 'questions' ? 'on' : ''}`} onClick={() => setRoute('questions')}>Answer five questions</button>
        <button role="tab" aria-selected={route === 'write'} className={`chip ${route === 'write' ? 'on' : ''}`} onClick={() => setRoute('write')}>Write it yourself</button>
      </div>
      <div className="creed-wrap">
        <div className="panel" style={{ padding: 18 }}>
          {route === 'founder' && <>
            <h3>{first}'s creed</h3>
            <p className="small dim">Drawn from {first}'s own values and from what moved {story.founder.name.split(' ')[0]} to act. Accept it as it stands, or change it with the other two routes.</p>
            <CreedAxes creed={creed} />
            <VowList creed={creed} />
          </>}
          {route === 'questions' && <div className="col" style={{ gap: 16 }}>
            {CREED_QUESTIONS.map((q, i) => (
              <fieldset key={q.id} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="small"><span className="gold">{['I', 'II', 'III', 'IV', 'V'][i]}.</span> <i>{q.text}</i></legend>
                <div className="row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
                  {q.answers.map((a) => <button key={a.id} className={`chip ${answers[q.id] === a.id ? 'on' : ''}`} aria-pressed={answers[q.id] === a.id} onClick={() => setAnswers((x) => ({ ...x, [q.id]: a.id }))}>{a.label}</button>)}
                </div>
              </fieldset>
            ))}
            {!answered && <span className="small faint italic">{CREED_QUESTIONS.filter((q) => answers[q.id]).length} of 5 answered. The creed on the right follows your answers.</span>}
          </div>}
          {route === 'write' && <div className="col" style={{ gap: 14 }}>
            <span className="label">Direction · click a name to make it one of the two that matter most</span>
            {AXIS_POLES.map(([neg, pos], i) => (
              <div key={i} className={`hh-axis ${creed.focus.includes(i) ? 'focus' : ''}`}>
                <button className="link neg small" onClick={() => toggleFocus(i)}>{neg}</button>
                <div className="hh-axis-track"><div className="pin" style={{ left: `${(creed.direction[i] + 1) * 50}%` }} /><input type="range" min={-1} max={1} step={0.05} value={creed.direction[i]} onChange={(e) => setAxis(i, +e.target.value)} aria-label={`${neg} to ${pos}`} /></div>
                <button className="link pos small" onClick={() => toggleFocus(i)}>{pos}</button>
              </div>
            ))}
            <span className="label" style={{ marginTop: 8 }}>Three vows</span>
            <div className="col" style={{ gap: 6 }}>
              {VOWS.map((v) => <label key={v.id} className={`vow ${creed.vows.includes(v.id) ? 'on' : ''}`}><input type="checkbox" checked={creed.vows.includes(v.id)} onChange={() => toggleVow(v.id)} />{v.text}</label>)}
            </div>
            <span className="label" style={{ marginTop: 8 }}>The words of the oath</span>
            <textarea rows={3} value={creed.oath} onChange={(e) => onChange({ ...creed, oath: e.target.value })} aria-label="Oath" />
          </div>}
        </div>
        <aside className="col" style={{ gap: 14 }}>
          <div className="vellum oath-text">{creed.oath}</div>
          {route !== 'founder' && <div className="panel" style={{ padding: 16 }}><CreedAxes creed={creed} /><VowList creed={creed} /></div>}
          <div className="panel" style={{ padding: 16 }}>
            <span className="label">The Great Work</span>
            <h3 style={{ marginTop: 6 }}>{story.greatWork.title}</h3>
            <p className="small">{story.greatWork.text}</p>
            <p className="small dim italic" style={{ margin: 0 }}>Achieve it and hold it to win. The work follows the first vow; it can be changed later at a conclave, at a price.</p>
          </div>
        </aside>
      </div>
      <div className="row">
        <button className="ghost" onClick={onBack}><Icon name="back" size={16} /> The founder</button>
        <span className="grow" />
        <button className="seal" onClick={onNext} disabled={creed.vows.length < 1 || (route === 'questions' && !answered)}>This is what we believe</button>
      </div>
    </div>
  );
}

function CreedAxes({ creed }: { creed: Creed }) {
  return (
    <div className="col" style={{ gap: 6, margin: '8px 0 12px' }}>
      {AXIS_POLES.map(([neg, pos], i) => (
        <div key={i} className={`hh-axis ${creed.focus.includes(i) ? 'focus' : ''}`}>
          <span className="neg small">{neg}</span>
          <div className="hh-axis-track"><div className="pin" style={{ left: `${(creed.direction[i] + 1) * 50}%` }} /></div>
          <span className="pos small">{pos}</span>
        </div>
      ))}
    </div>
  );
}
function VowList({ creed }: { creed: Creed }) {
  return (
    <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
      {creed.vows.map((v) => <li key={v}>{VOWS.find((x) => x.id === v)?.text}</li>)}
    </ol>
  );
}

// ------------------------------------------------------------------ name

function NameStep({ story, creed, chosen, onChoose, onNext, onBack }: { story: FoundingStory; creed: Creed; chosen: { name: string; meaning: string } | null; onChoose: (n: { name: string; meaning: string }) => void; onNext: () => void; onBack: () => void }) {
  const [salt, setSalt] = useState(0);
  const [names, setNames] = useState(story.names);
  const [own, setOwn] = useState('');
  useEffect(() => {
    let live = true;
    sim.query<{ name: string; meaning: string }[]>('names', { story, creed, salt }).then((n) => { if (live && n) { setNames(n); if (!own) onChoose(n[0]); } });
    return () => { live = false; };
  }, [salt]); // eslint-disable-line react-hooks/exhaustive-deps
  const tongue = useMemo(() => story.polityName, [story]);
  return (
    <div className="col" style={{ gap: 20, maxWidth: 860 }}>
      <div>
        <h1>What it is called</h1>
        <p className="dim italic">Names in {story.founder.name.split(' ')[0]}'s own tongue, the speech of {tongue === 'no realm' ? 'these lands' : tongue}. Outsiders will never hear it, if you are careful.</p>
      </div>
      <div className="names">
        {names.map((n) => <button key={n.name} className={`name-card panel ${chosen?.name === n.name ? 'on' : ''}`} aria-pressed={chosen?.name === n.name} onClick={() => { setOwn(''); onChoose(n); }}><div className="n">{n.name}</div><div className="m">“{n.meaning}”</div></button>)}
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="ghost" onClick={() => setSalt((s) => s + 1)}><Icon name="dice" size={16} /> Other names</button>
        <span className="grow" />
        <label className="row"><span className="label">Or your own</span><input value={own} placeholder="The …" onChange={(e) => { setOwn(e.target.value); if (e.target.value.trim()) onChoose({ name: e.target.value.trim(), meaning: '' }); }} /></label>
      </div>
      <div className="row">
        <button className="ghost" onClick={onBack}><Icon name="back" size={16} /> The creed</button>
        <span className="grow" />
        <button className="seal" disabled={!chosen?.name} onClick={onNext}>Swear the oath</button>
      </div>
    </div>
  );
}
