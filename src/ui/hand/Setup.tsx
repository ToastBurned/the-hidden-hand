/**
 * A new game, creed first (playtest F4): the city, the creed, then the founders whose lives
 * led them to that creed, the Order's name, and the First Oath.
 *
 * The game opens with the vertical slice (docs/SLICE.md): five years in one city, the creed
 * set by the five questions alone (with the council question narrowed to "many" or "us"),
 * founders drawn from the slice's three districts, and the city lived in for three years first
 * so that it has a history when the Order is founded.
 */
import { useEffect, useMemo, useState } from 'react';
import { VALUE_POLES } from '../../city/constants';
import { calendarYear } from '../../city/core';
import { createCity } from '../../city/create';
import { runYears } from '../../city/sim';
import {
  CREED_QUESTIONS, GREAT_WORKS, VOWS, creedFromAnswers, founderOffers, foundOrder, normaliseCreed, suggestCreeds, workPreview,
  type Campaign, type Creed, type FounderOffer,
} from '../../city/order';
import type { City } from '../../city/types';
import { renderCity } from '../pixel/city';
import { PxView } from '../pixel/kit';
import type { Px } from '../pixel/px';
import { Meter, PersonFace, ST, cap } from './common';

type Step = 'city' | 'creed' | 'founder' | 'oath';
type Way = 'suggested' | 'questions' | 'free';
const STEPS: [Step, string][] = [['city', 'The city'], ['creed', 'The creed'], ['founder', 'The founder'], ['oath', 'The First Oath']];
const FOUNDING_VOWS = VOWS.filter((v) => v.id !== 'ends');
/** The opening is the vertical slice. */
const SLICE = true;
const WARM_YEARS = 3;
/** The slice's council question offers only an open council or a hidden one. */
const QUESTIONS = SLICE ? CREED_QUESTIONS.map((q) => (q.id === 'council' ? { ...q, answers: q.answers.filter((a) => a.id === 'many' || a.id === 'us') } : q)) : CREED_QUESTIONS;

export function Setup({ onBegin, onBack }: { onBegin: (k: Campaign) => void; onBack: () => void }) {
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 9999));
  const [city, setCity] = useState<City | null>(null);
  const [step, setStep] = useState<Step>('city');
  const [creed, setCreed] = useState<Creed | null>(null);
  const [offer, setOffer] = useState<FounderOffer | null>(null);

  const [loading, setLoading] = useState('Laying out the streets of a new city…');
  useEffect(() => {
    setCity(null);
    setLoading('Laying out the streets of a new city…');
    let live = true;
    let t = 0;
    t = window.setTimeout(() => {
      const c = createCity({ seed });
      // the city lives a few years before the Order is founded, a year at a time so the page can breathe
      let y = 0;
      const year = () => {
        if (!live) return;
        if (!SLICE || y >= WARM_YEARS) { setCity(c); return; }
        setLoading(`${c.name} lives its ${['first', 'second', 'third', 'fourth'][y] ?? 'next'} year before you arrive…`);
        t = window.setTimeout(() => { runYears(c, 1); y++; year(); }, 30);
      };
      year();
    }, 40);
    return () => { live = false; clearTimeout(t); };
  }, [seed]);

  const at = STEPS.findIndex(([s]) => s === step);
  return (
    <div className="setup">
      <header className="setup-head">
        <button type="button" onClick={onBack}>Back to the title</button>
        <ol className="steps" aria-label="Founding steps">
          {STEPS.map(([s, label], i) => (
            <li key={s} className={i === at ? 'on' : i < at ? 'past' : ''}>
              <button type="button" className={i === at ? 'on' : ''} aria-current={i === at ? 'step' : undefined} disabled={i > at} onClick={() => setStep(s)}><b>{i + 1}</b> {label}</button>
            </li>
          ))}
        </ol>
      </header>
      {!city ? <div className="loading">{loading}</div>
        : step === 'city' ? <CityStep city={city} onReroll={() => setSeed(1 + Math.floor(Math.random() * 9999))} onNext={() => setStep('creed')} />
          : step === 'creed' ? <CreedStep city={city} creed={creed} onCreed={setCreed} onNext={() => { setOffer(null); setStep('founder'); }} />
            : step === 'founder' && creed ? <FounderStep city={city} creed={creed} offer={offer} onOffer={setOffer} onNext={() => setStep('oath')} />
              : creed && offer ? <OathStep city={city} creed={creed} offer={offer} onBegin={onBegin} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- 1. the city

function CityStep({ city, onReroll, onNext }: { city: City; onReroll: () => void; onNext: () => void }) {
  const [px, setPx] = useState<Px | null>(null);
  useEffect(() => {
    setPx(null);
    const t = setTimeout(() => setPx(renderCity(city, ST, { season: 1, time: 'day' })), 40);
    return () => clearTimeout(t);
  }, [city]);
  const troubles = useMemo(() => suggestCreeds(city), [city]);
  const inside = city.districts.filter((d) => d.inside);
  return (
    <section className="step citystep">
      <div className="frame-art">
        {px ? <div className="cityfit"><PxView px={px} scale={0.5} label={`Map of ${city.name}`} /></div> : <div className="loading">Drawing {city.name}…</div>}
      </div>
      <div className="steptext">
        <p className="kicker">{calendarYear(city)}</p>
        <h1>{city.name}, {city.epithet}</h1>
        <p>A port of {city.people.size.toLocaleString()} souls in {inside.length} wards within the walls and {city.districts.length - inside.length} without, under {city.region.crown.title} of {city.region.crown.realm}. Its council of twelve sits in the town hall; its bishop in the cathedral; its guilds keep their own halls.</p>
        <h3>What troubles the city</h3>
        <ul className="troubles">{troubles.map((t) => <li key={t.id}>{t.why}</li>)}</ul>
        <p className="muted">{SLICE ? 'You will lead a secret society here for its first five years: grow it in three quarters of the city, read your people\'s letters, and try to open the council to the guilds against the great families who hold it.' : 'You will lead a secret society here for two or three generations.'} You choose what it believes first; the city then shows you who already believes it.</p>
        <div className="actions">
          <button type="button" onClick={onReroll}>Another city</button>
          <button type="button" className="primary" onClick={onNext}>Set the creed</button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 2. the creed

function CreedStep({ city, creed, onCreed, onNext }: { city: City; creed: Creed | null; onCreed: (c: Creed) => void; onNext: () => void }) {
  const [way, setWay] = useState<Way>(SLICE ? 'questions' : creed?.how ?? 'suggested');
  const sug = useMemo(() => suggestCreeds(city), [city]);
  const [pick, setPick] = useState<string | null>(creed?.how === 'suggested' ? sug.find((s) => s.creed.oath === creed.oath)?.id ?? null : null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dir, setDir] = useState<number[]>(creed?.direction ?? [0, 0, 0, 0, 0]);
  const [vows, setVows] = useState<string[]>(creed?.vows ?? ['unseen', 'endure', 'knowledge']);

  // the creed as it stands from the way chosen
  useEffect(() => {
    if (way === 'suggested') { const s = sug.find((x) => x.id === pick); if (s) onCreed(s.creed); }
    else if (way === 'questions') { if (CREED_QUESTIONS.every((q) => answers[q.id])) onCreed(creedFromAnswers(answers)); }
    else onCreed(normaliseCreed({ direction: dir, vows }, 'free'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [way, pick, answers, dir, vows]);

  // when switching to the free editor, start from the creed in hand
  const toFree = () => { if (creed) { setDir(creed.direction.map((v) => Math.round(v * 20) / 20)); setVows(creed.vows.filter((v) => v !== 'ends')); } setWay('free'); };
  const ready = way === 'suggested' ? !!pick : way === 'questions' ? CREED_QUESTIONS.every((q) => answers[q.id]) : true;
  const preview = creed && ready ? workPreview(creed) : null;
  return (
    <section className="step creedstep">
      <div className="creedways">
        {SLICE && <p className="lede">Five questions about {city.name} as it is. How the Order answers them is its creed.</p>}
        {!SLICE && <div className="tabs" role="tablist" aria-label="How to set the creed">
          <button type="button" role="tab" aria-selected={way === 'suggested'} className={way === 'suggested' ? 'on' : ''} onClick={() => setWay('suggested')}>What the city needs</button>
          <button type="button" role="tab" aria-selected={way === 'questions'} className={way === 'questions' ? 'on' : ''} onClick={() => setWay('questions')}>Five questions</button>
          <button type="button" role="tab" aria-selected={way === 'free'} className={way === 'free' ? 'on' : ''} onClick={toFree}>Write it yourself</button>
        </div>}
        {way === 'suggested' && (
          <div className="cards three">
            {sug.map((s) => (
              <button type="button" key={s.id} className={`card ${pick === s.id ? 'on' : ''}`} onClick={() => setPick(s.id)}>
                <b>{s.title}</b>
                <span>{s.why}</span>
                <small>Great Work: {GREAT_WORKS[s.work].title}</small>
              </button>
            ))}
          </div>
        )}
        {way === 'questions' && (
          <ol className="questions">
            {QUESTIONS.map((q) => (
              <li key={q.id}>
                <p>{q.text}</p>
                <div className="answers">
                  {q.answers.map((a) => <button type="button" key={a.id} className={answers[q.id] === a.id ? 'on' : ''} aria-pressed={answers[q.id] === a.id} onClick={() => setAnswers({ ...answers, [q.id]: a.id })}>{a.label}</button>)}
                </div>
              </li>
            ))}
          </ol>
        )}
        {way === 'free' && (
          <div className="free">
            <h3>What the Order wants the city to become</h3>
            {VALUE_POLES.map(([lo, hi], i) => (
              <label key={i} className="axis">
                <span className="lo">{lo}</span>
                <input type="range" min={-1} max={1} step={0.05} value={dir[i]} aria-label={`${lo} or ${hi}`} onChange={(e) => { const d = dir.slice(); d[i] = Number(e.target.value); setDir(d); }} />
                <span className="hi">{hi}</span>
              </label>
            ))}
            <h3>Its three vows, the first counts most</h3>
            <div className="vows">
              {FOUNDING_VOWS.map((v) => {
                const n = vows.indexOf(v.id);
                return (
                  <button type="button" key={v.id} className={n >= 0 ? 'on' : ''} aria-pressed={n >= 0} onClick={() => setVows(n >= 0 ? vows.filter((x) => x !== v.id) : [...vows, v.id].slice(-3))}>
                    {n >= 0 && <b>{n + 1}</b>} {v.text}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <aside className="creedpanel">
        <h3>The oath</h3>
        <p className="oath">{creed && ready ? creed.oath : 'Choose a creed to hear its oath.'}</p>
        {SLICE ? <>
          <h3>The first aim</h3>
          <p><b>Open the council</b></p>
          <p>Whatever the creed, the Order's first five years turn on the council of twelve: win it for the guilds, against the great families who hold it, and keep it.</p>
          <p className="muted">The Great Work the creed points to ({preview ? GREAT_WORKS[preview.kind].title : 'it follows from the whole creed'}) lies far beyond these first years.</p>
        </> : <><h3>The Great Work</h3>
        {preview ? <>
          <p><b>{GREAT_WORKS[preview.kind].title}</b></p>
          <p>{GREAT_WORKS[preview.kind].text}</p>
          <p className="muted">{preview.reason}</p>
        </> : <p className="muted">The Great Work follows from the whole creed, and changes as you change it.</p>}</>}
        <button type="button" className="primary" disabled={!ready} onClick={onNext}>Find the founders</button>
      </aside>
    </section>
  );
}

// ---------------------------------------------------------------- 3. the founder

function FounderStep({ city, creed, offer, onOffer, onNext }: { city: City; creed: Creed; offer: FounderOffer | null; onOffer: (o: FounderOffer) => void; onNext: () => void }) {
  const [reroll, setReroll] = useState(0);
  const offers = useMemo(() => founderOffers(city, creed, reroll, SLICE), [city, creed, reroll]);
  return (
    <section className="step founderstep">
      <p className="lede">Three people in {city.name} have come by their own roads to what the creed says. Each already trusts one other.</p>
      {!offers.length && <p>No one in the city believes this yet. Go back and change the creed.</p>}
      <div className="cards three">
        {offers.map((f) => (
          <button type="button" key={f.id} className={`card founder ${offer?.id === f.id ? 'on' : ''}`} onClick={() => onOffer(f)}>
            <span className="pair">
              <PersonFace c={city} id={f.founder.id} scale={2} label={f.founder.name} />
              <PersonFace c={city} id={f.companion.id} scale={1} label={f.companion.name} />
            </span>
            <b>{f.founder.name}</b>
            <small>{f.founder.trade}, {f.founder.age}, {f.founder.district}</small>
            <em>{f.title}</em>
            <span>{f.summary}</span>
            {f.event && <span className="muted">{f.event}</span>}
            <span className="row"><small>Belief</small><Meter v={f.belief} label="How near their beliefs are to the creed" /></span>
            <span className={`difficulty ${f.difficulty}`}><b>{cap(f.difficulty)}</b> {f.difficultyWhy}</span>
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" onClick={() => setReroll(reroll + 1)}>Others</button>
        <button type="button" className="primary" disabled={!offer} onClick={onNext}>Name the Order</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 4. the oath

function OathStep({ city, creed, offer, onBegin }: { city: City; creed: Creed; offer: FounderOffer; onBegin: (k: Campaign) => void }) {
  const [nm, setNm] = useState(offer.names[0] ?? { name: 'The Order', meaning: '' });
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const work = workPreview(creed);
  const swear = () => {
    setBusy(true);
    setTimeout(() => {
      const name = own.trim() || nm.name;
      onBegin(foundOrder(city, { creed, founder: offer.id, name, meaning: own.trim() ? '' : nm.meaning, slice: SLICE }));
    }, 30);
  };
  return (
    <section className="step oathstep">
      <div className="oathcard">
        <span className="pair">
          <PersonFace c={city} id={offer.founder.id} scale={3} robe label={offer.founder.name} />
          <PersonFace c={city} id={offer.companion.id} scale={3} robe label={offer.companion.name} />
        </span>
        <p className="muted">{offer.founder.name} and {offer.companion.name}, their {offer.companion.relation}, meet in secret in {offer.founder.district}.</p>
        <h3>The name</h3>
        <div className="names">
          {offer.names.map((n) => (
            <button type="button" key={n.name} className={!own && nm.name === n.name ? 'on' : ''} onClick={() => { setNm(n); setOwn(''); }}>
              <b>{n.name}</b> <small>{n.meaning}</small>
            </button>
          ))}
          <label className="ownname">Or your own <input value={own} maxLength={40} onChange={(e) => setOwn(e.target.value)} placeholder="The Order of…" /></label>
        </div>
        <h3>They swear</h3>
        <p className="oath">{creed.oath}</p>
        {SLICE ? <p>Their first aim: <b>open the council</b> of {city.name} to the guilds, within five years, and keep it open.</p>
          : <p>Their Great Work: <b>{GREAT_WORKS[work.kind].title}</b>. {GREAT_WORKS[work.kind].text}</p>}
        <button type="button" className="primary big" disabled={busy} onClick={swear}>{busy ? 'They swear…' : 'Swear the First Oath'}</button>
      </div>
    </section>
  );
}
