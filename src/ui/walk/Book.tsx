/**
 * The Book of the Hand (docs/STORY.md): everything the founder knows, in eight sections. Goals
 * comes first, with what to do next (Ed, 17 Nov). People are grouped by household, with hearts for
 * trust and a bar for how much you know of them. Mysteries keeps the clues to each question and
 * who gave them; Council the twelve seats and who named each. Every fact says how it was learned
 * and from whom; facts learned today are written in overnight and are bold until you look.
 */
import { useEffect, useMemo, useState } from 'react';
import { fullName } from '../../city/core';
import { DAY_NAMES } from '../../city/constants';
import { SECTION_OF } from '../../city/hand/day';
import { ERRANDS, MAX_CELL } from '../../city/hand/lodge';
import type { Season } from '../../city/hand/season';
import { exposureWord, relOf, stageWord, type Fact, type LedgerCat } from '../../city/hand/state';
import { CAST_BY_KEY, G, checkGoals, councilOf, knownPeople, mysteriesOf, say } from '../../city/hand/story';
import { CAST, FACTS, GOALS, ITEMS } from '../../content/suburb';
import { PersonFace } from '../hand/common';
import { playCue } from '../audio';
import { BookMap } from './BookMap';
import { Hearts } from './panels';

export const SECTIONS = ['Goals', 'People', 'Mysteries', 'Council', 'Lodge', 'Map', 'Ledger', 'Letters'] as const;
export type Section = (typeof SECTIONS)[number];

const playDay = (s: Season, d: number) => d - (s.city.play?.since ?? 0) + 1;

function how(s: Season, f: Fact): string {
  const via = f.via >= 0 ? s.city.people.get(f.via) : undefined;
  const who = via ? fullName(s.city, via) : s.city.dead.get(f.via)?.first;
  const day = `day ${playDay(s, f.day)}`;
  if (f.source === 'told') return `told by ${who ?? 'them'}, ${day}`;
  if (f.source === 'heard') return `heard from ${who ?? 'someone'}, ${day}`;
  if (f.source === 'seen') return `seen yourself, ${day}`;
  return `found yourself, ${day}`;
}

function FactLine({ s, f, bold }: { s: Season; f: Fact; bold: boolean }) {
  return (
    <li className={`fact ${f.source}${bold ? ' unread' : ''}`}>
      <span className={`src ${f.source}`} title={how(s, f)}>{f.source === 'proved' ? 'found' : f.source}</span> {f.text} <small className="muted">({how(s, f)})</small>
    </li>
  );
}

/** A thin bar, 0..1. */
const Bar = ({ v, label, tone = '' }: { v: number; label?: string; tone?: string }) => (
  <span className={`bar ${tone}`} title={label}><i style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%` }} /></span>
);

export function unreadIn(s: Season): Record<Section, number> {
  const out = Object.fromEntries(SECTIONS.map((x) => [x, 0])) as Record<Section, number>;
  for (const f of s.hand.facts) if (!f.pending && !f.read) out[SECTION_OF[f.kind] as Section]++;
  out.Letters = s.hand.letters.filter((l) => !l.read).length;
  return out;
}

/** How much of what can be learned about someone you know (written facts about them). */
function knownShare(s: Season, key: string): number {
  const all = Object.entries(FACTS).filter(([, f]) => f.about === key).map(([id]) => id);
  if (!all.length) return 0;
  const have = all.filter((id) => s.hand.facts.some((f) => f.key === id && !f.pending)).length;
  return have / all.length;
}

const CATS: Record<LedgerCat, string> = { rent: 'Rent', keep: 'Keep', gifts: 'Gifts', shops: 'Shops', lodge: 'Lodge', order: 'The Order', work: 'Work', other: 'Other' };

export function Book({ s, start = 'Goals', onClose }: { s: Season; start?: Section; onClose: () => void }) {
  const [sec, setSec] = useState<Section>(start);
  const [q, setQ] = useState('');
  const [who, setWho] = useState<number>(-1);
  const [letter, setLetter] = useState<number>(-1);
  const [, re] = useState(0);
  const c = s.city, h = s.hand;
  const facts = h.facts.filter((f) => !f.pending);
  const g = useMemo(() => new G(s), [s]);
  // what was unread when the section opened stays bold while you look at it
  const [bold, setBold] = useState<Set<number>>(new Set());
  useEffect(() => {
    playCue('page');
    const now = new Set<number>();
    for (const f of facts) if (!f.read && SECTION_OF[f.kind] === sec) { now.add(f.id); f.read = true; }
    setBold(now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec]);
  const unread = unreadIn(s);
  const ql = q.trim().toLowerCase();
  const people = knownPeople(s);

  const body = () => {
    if (ql) {
      const hits = facts.filter((f) => f.text.toLowerCase().includes(ql) || (f.about >= 0 && fullName(c, c.people.get(f.about) ?? { first: '', family: -1 }).toLowerCase().includes(ql)));
      return (<><h3>{hits.length} found for “{q}”</h3><ul className="facts">{hits.map((f) => <FactLine key={f.id} s={s} f={f} bold={false} />)}</ul></>);
    }
    switch (sec) {
      case 'Goals': {
        const open = GOALS.filter((x) => h.goals[x.key] && h.goals[x.key].done < 0);
        const done = GOALS.filter((x) => h.goals[x.key] && h.goals[x.key].done >= 0).sort((a, b) => h.goals[b.key].done - h.goals[a.key].done);
        const main = open.filter((x) => !x.side), side = open.filter((x) => x.side);
        return (
          <>
            <p className="small muted">What the Order asks of you, and what you have taken on yourself. Day {Math.min(28, playDay(s, c.day))} of 28 this spring.</p>
            <h3>Now</h3>
            {!main.length && <p className="small">{h.ended ? 'The spring is over.' : 'Nothing pressing. Walk the suburb and talk to people.'}</p>}
            <ul className="goals">{main.map((x) => <li key={x.key} className="open"><b>{x.title}</b><span>{say(g, x.hint)}</span></li>)}</ul>
            {side.length > 0 && <><h3>Errands of your own</h3><ul className="goals">{side.map((x) => <li key={x.key} className="open errand-goal"><b>{x.title}</b><span>{say(g, x.hint)}</span></li>)}</ul></>}
            {done.length > 0 && <><h3>Done</h3><ul className="goals">{done.map((x) => <li key={x.key} className="done"><b>{x.title}</b><small>day {h.goals[x.key].done + 1}</small></li>)}</ul></>}
            <h3>How trust is won</h3>
            <p className="small">Talk to people every day: the first talk of a day counts. Give them what they like (one gift a day; the Book notes what pleased them). Do what they need: a want is written in the Book when you learn it. Hearts open new things to say.</p>
          </>
        );
      }
      case 'People': {
        if (who >= 0 && c.people.has(who)) {
          const p = c.people.get(who)!, rel = relOf(h, who);
          const ch = p.authored ? CAST_BY_KEY[p.authored] : undefined;
          const mine = facts.filter((f) => f.about === who && f.kind !== 'routine');
          const seen = facts.filter((f) => f.about === who && f.kind === 'routine');
          const gifts = ch ? Object.keys(h.flags).filter((k) => k.startsWith(`gave:${ch.key}:`)).map((k) => k.split(':')[2]) : [];
          const taste = (i: string) => (ch!.tastes.loved.includes(i) ? 'loved' : ch!.tastes.liked.includes(i) ? 'liked' : ch!.tastes.disliked.includes(i) ? 'disliked' : 'took politely');
          const office = facts.find((f) => f.kind === 'council' && ch && f.key === `council:${ch.key === 'lionel' ? 'ashby' : '-'}`);
          return (
            <>
              <button type="button" className="small" onClick={() => setWho(-1)}>← Everyone</button>
              <div className="person-head">
                <PersonFace c={c} id={who} scale={2} />
                <div>
                  <h3>{fullName(c, p)}</h3>
                  {ch && <p className="small">{rel.met >= 0 ? ch.job : 'You have not met them'}{rel.met >= 0 ? `, ${Math.floor((c.day - p.born) / 364)}` : ''}</p>}
                  {office && <p className="small office">{office.text.split('.')[0]} <small className="muted">({how(s, office)})</small></p>}
                  <p className="small"><Hearts trust={rel.trust} /> {rel.met >= 0 ? stageWord(rel.stage) : 'heard of'}</p>
                  {ch && <p className="small">Known <Bar v={knownShare(s, ch.key)} /></p>}
                  <label className="small"><input type="checkbox" checked={rel.pinned} onChange={() => { rel.pinned = !rel.pinned; re((n) => n + 1); }} /> Pinned</label>
                </div>
              </div>
              <ul className="facts">{mine.map((f) => <FactLine key={f.id} s={s} f={f} bold={bold.has(f.id)} />)}</ul>
              {gifts.length > 0 && <><h4>Gifts</h4><ul className="small">{gifts.map((i) => <li key={i}>{ITEMS[i]?.name}: {taste(i)}</li>)}</ul></>}
              {seen.length > 0 && <><h4>Where they are</h4><ul className="facts">{seen.map((f) => <FactLine key={f.id} s={s} f={f} bold={false} />)}</ul></>}
            </>
          );
        }
        // households you know anyone of
        const groups = new Map<string, number[]>();
        const others: number[] = [];
        for (const id of people) {
          const k = c.people.get(id)?.authored;
          if (!k) { others.push(id); continue; }
          const hh = CAST_BY_KEY[k].household;
          groups.set(hh, [...(groups.get(hh) ?? []), id]);
        }
        const pinned = people.filter((id) => h.rels[id]?.pinned);
        const order = [...groups.keys()].sort((a, b) => CAST.findIndex((x) => x.household === a) - CAST.findIndex((x) => x.household === b));
        const card = (id: number) => {
          const p = c.people.get(id)!, rel = h.rels[id] ?? relOf(h, id);
          const ch = p.authored ? CAST_BY_KEY[p.authored] : undefined;
          const nb = facts.filter((f) => f.about === id && bold.has(f.id)).length;
          return (
            <li key={id}>
              <button type="button" className={nb ? 'unread' : ''} onClick={() => setWho(id)}>
                <PersonFace c={c} id={id} />
                <span>
                  <b>{rel.pinned ? '📌 ' : ''}{p.first}</b>
                  <small>{rel.met >= 0 ? (ch?.job ?? '') : 'heard of'}{rel.stage === 'sworn' ? ' · sworn' : rel.stage === 'invited' ? ' · invited' : ''}</small>
                  <Hearts trust={rel.trust} />
                  {ch && <Bar v={knownShare(s, ch.key)} label="How much you know of them" tone="known" />}
                </span>
              </button>
            </li>
          );
        };
        return (
          <>
            <p className="small muted">Everyone you have met or heard of, by household. Hearts are trust; the thin bar is how much you know of them.</p>
            {people.length === 0 && <p>No names yet. Talk to people in the suburb.</p>}
            {pinned.length > 0 && <><h3>Pinned</h3><ul className="names">{pinned.map(card)}</ul></>}
            {order.map((hh) => {
              const ids = groups.get(hh)!;
              const ch = CAST_BY_KEY[c.people.get(ids[0])!.authored!];
              const fams = [...new Set(CAST.filter((x) => x.household === hh).map((x) => x.family))];
              const place = ch.home === 'H' ? 'upstairs in your house' : ch.home === 'T' ? 'at the Bell and Candle' : ch.home === 'S' ? 'at the smithy' : '';
              return (
                <div key={hh} className="household">
                  <h4>{fams.length > 1 ? fams.join(' and ') : `The ${fams[0]}${fams[0].endsWith('s') ? 'es' : 's'}`}{place && <small className="muted"> · {place}</small>}</h4>
                  <ul className="names">{ids.map(card)}</ul>
                </div>
              );
            })}
            {others.length > 0 && <><h4>Others</h4><ul className="names">{others.map(card)}</ul></>}
          </>
        );
      }
      case 'Mysteries': {
        const ms = mysteriesOf(s);
        return (
          <>
            {!ms.length && <p className="small muted">No questions yet. Your mother’s chest may hold some.</p>}
            {ms.map(({ m, solved, answer, clues }) => (
              <div key={m.key} className={`mystery${solved ? ' solved' : ''}`}>
                <h3>{m.title}</h3>
                <p className="small">{m.question}</p>
                <p className="small"><b>{clues.length}</b> {clues.length === 1 ? 'clue' : 'clues'} <Bar v={Math.min(1, clues.length / 6)} tone="clue" /></p>
                <ul className="facts">{clues.map((f) => <FactLine key={f.id} s={s} f={f} bold={bold.has(f.id)} />)}</ul>
                {solved && <p className="answer">{answer}</p>}
              </div>
            ))}
          </>
        );
      }
      case 'Council': {
        const list = councilOf(s);
        const n = list.filter((x) => x.fact).length;
        return (
          <>
            <p className="small muted">The twelve who rule {c.name}. Every year they choose a mayor from among themselves. {n} of 12 known.</p>
            <div className="council">
              {list.map(({ x, fact }) => (
                <div key={x.key} className={`seat${fact ? ' known' : ''}`}>
                  <small className="muted">{x.seat}</small>
                  {fact ? <><b>{x.name}</b><small>{x.note}</small><small className="muted">{how(s, fact)}</small></> : <b className="muted">Not yet known</b>}
                </div>
              ))}
            </div>
          </>
        );
      }
      case 'Lodge': {
        const old = facts.filter((f) => f.kind === 'old-lodge' || f.kind === 'town');
        const ex = h.exposure;
        return (
          <>
            <h3>The Lodge of the Hand</h3>
            {h.lodge ? <p>Founded again on day {playDay(s, h.lodge.founded)}. Meets on {h.lodge.night >= 0 ? `${DAY_NAMES[h.lodge.night]} nights at 20:00` : 'a night not yet chosen'}. {h.lodge.meetings} {h.lodge.meetings === 1 ? 'meeting' : 'meetings'} held. {h.members.length} of {MAX_CELL} sworn.</p> : <p className="muted">No lodge yet. Swear someone in your cellar.</p>}
            {h.members.length > 0 && (
              <ul className="names">
                {h.members.map((m) => (
                  <li key={m.pid}><span className="member"><PersonFace c={c} id={m.pid} /><span><b>{c.people.get(m.pid) ? fullName(c, c.people.get(m.pid)!) : '?'}</b><small>sworn day {playDay(s, m.sworn)}, {m.bond === 'fear' ? 'under threat' : m.bond === 'gain' ? 'for gain' : 'from conviction'}{m.errands.length ? ` · ${m.errands.map((e) => ERRANDS[e.kind].label.toLowerCase()).join(', ')}` : ''}</small><Hearts trust={relOf(h, m.pid).trust} /></span></span></li>
                ))}
              </ul>
            )}
            <h3>Who is watching</h3>
            <ul className="watch">
              {([['The suburb', ex.suburb], ['Your house', ex.house], ['You', ex.you]] as const).map(([w, v]) => <li key={w}><span>{w}</span><Bar v={v} tone="danger" /><small>{exposureWord(v)}</small></li>)}
            </ul>
            <h3>What happened here</h3>
            {old.length === 0 && <p className="small muted">Ask the suburb about your mother.</p>}
            <ul className="facts">{old.map((f) => <FactLine key={f.id} s={s} f={f} bold={bold.has(f.id)} />)}</ul>
            {h.minutes.length > 0 && <><h3>Minutes</h3>{[...h.minutes].reverse().map((m, i) => <div key={i} className="minutes"><b>Day {playDay(s, m.day)}</b><ul className="small">{m.lines.map((l, k) => <li key={k}>{l}</li>)}</ul></div>)}</>}
          </>
        );
      }
      case 'Map':
        return <BookMap s={s} />;
      case 'Ledger': {
        const since = c.play?.since ?? 0;
        const days = Math.max(1, Math.min(28, c.day - since + 1));
        const per = Array.from({ length: days }, () => ({ in: 0, out: 0 }));
        const cats: Partial<Record<LedgerCat, { in: number; out: number }>> = {};
        for (const l of h.ledger) {
          const d = l.day - since;
          if (d >= 0 && d < days) { if (l.amount >= 0) per[d].in += l.amount; else per[d].out -= l.amount; }
          const k = l.cat ?? 'other';
          const e = (cats[k] ??= { in: 0, out: 0 });
          if (l.amount >= 0) e.in += l.amount; else e.out -= l.amount;
        }
        const top = Math.max(4, ...per.map((x) => Math.max(x.in, x.out)));
        const catMax = Math.max(1, ...Object.values(cats).map((x) => Math.max(x!.in, x!.out)));
        const totIn = h.ledger.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0), totOut = -h.ledger.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
        return (
          <>
            <div className="purse"><span className="coins">{Math.round(h.coin)}</span><span>ducats in hand<small className="muted">{totIn} in, {totOut} out this spring · rent +3 on Moondays, keep −1 on Sundays</small></span></div>
            <h3>Day by day</h3>
            <div className="days-chart">
              {per.map((x, i) => (
                <div key={i} className="day" title={`Day ${i + 1}: +${x.in} / −${x.out}`}>
                  <i className="in" style={{ height: `${(x.in / top) * 50}px` }} />
                  <i className="out" style={{ height: `${(x.out / top) * 50}px` }} />
                  <small>{i % 7 === 0 ? i + 1 : ''}</small>
                </div>
              ))}
            </div>
            <h3>Where it goes</h3>
            <ul className="cats">
              {(Object.keys(cats) as LedgerCat[]).map((k) => (
                <li key={k}><span>{CATS[k]}</span><span className="pair">{cats[k]!.in > 0 && <i className="in" style={{ width: `${(cats[k]!.in / catMax) * 100}%` }}>+{cats[k]!.in}</i>}{cats[k]!.out > 0 && <i className="out" style={{ width: `${(cats[k]!.out / catMax) * 100}%` }}>−{cats[k]!.out}</i>}</span></li>
              ))}
            </ul>
            <h3>Lately</h3>
            <table className="ledger"><tbody>{[...h.ledger].reverse().slice(0, 14).map((l, i) => <tr key={i}><td>Day {playDay(s, l.day)}</td><td>{l.what}</td><td className={l.amount < 0 ? 'neg' : 'pos'}>{l.amount >= 0 ? '+' : ''}{l.amount}</td></tr>)}</tbody></table>
          </>
        );
      }
      case 'Letters': {
        const ls = [...h.letters].reverse();
        const open = ls.find((l) => l.id === letter);
        if (open) {
          return (
            <>
              <button type="button" className="small" onClick={() => setLetter(-1)}>← All letters</button>
              <div className="letter"><p className="muted small">{open.from} · day {playDay(s, open.day)}</p><h3>{open.title}</h3>{open.body.map((p, i) => <p key={i}>{p}</p>)}</div>
            </>
          );
        }
        return (
          <>
            <p className="small muted">The in-tray. Unread letters are in bold.</p>
            <ul className="letters">{ls.map((l) => <li key={l.id}><button type="button" className={l.read ? '' : 'unread'} onClick={() => { l.read = true; playCue('page'); checkGoals(s); setLetter(l.id); }}><b>{l.title}</b><small>day {playDay(s, l.day)}</small></button></li>)}</ul>
          </>
        );
      }
    }
  };

  return (
    <section className="book" role="dialog" aria-label="The Book of the Hand">
      <header>
        <h2>The Book of the Hand</h2>
        <input type="search" placeholder="Search the Book" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="x" onClick={onClose} aria-label="Close the Book">×</button>
      </header>
      <nav className="ribbons">
        {SECTIONS.map((x) => <button key={x} type="button" className={`${x === sec && !ql ? 'on' : ''}${unread[x] ? ' has' : ''}`} onClick={() => { setSec(x); setQ(''); setWho(-1); setLetter(-1); }}>{x}{unread[x] > 0 && <i>{unread[x]}</i>}</button>)}
      </nav>
      <div className={`page${sec === 'Map' && !ql ? ' map' : ''}`}>{body()}</div>
    </section>
  );
}
