/**
 * The Book of the Hand (docs/SEASON.md): everything the founder knows, in seven sections. Each
 * fact says how it was learned (told, heard, seen, proved) and from whom; facts not yet read are
 * bold until the section is opened. Pinned people sit at the top of Names. A search box looks
 * through every section. Facts learned today are written in overnight, so they appear tomorrow.
 */
import { useEffect, useMemo, useState } from 'react';
import { fullName } from '../../city/core';
import { DAY_NAMES } from '../../city/constants';
import { SECTION_OF } from '../../city/hand/day';
import { ERRANDS } from '../../city/hand/lodge';
import { MOTIVE_WORDS, describe } from '../../city/hand/people';
import type { Season } from '../../city/hand/season';
import { exposureWord, relOf, stageWord, trustWord, type Fact } from '../../city/hand/state';
import { knownPeople } from '../../city/hand/talk';
import { PersonFace } from '../hand/common';
import { playCue } from '../audio';

export const SECTIONS = ['Names', 'Houses', 'Town', 'Almanac', 'Ledger', 'Order', 'Letters'] as const;
export type Section = (typeof SECTIONS)[number];

const SOURCE: Record<Fact['source'], string> = { told: 'told', heard: 'heard', seen: 'seen', proved: 'proved' };

function how(s: Season, f: Fact): string {
  const via = f.via >= 0 ? s.city.people.get(f.via) : undefined;
  const who = via ? fullName(s.city, via) : s.city.dead.get(f.via)?.first;
  const day = `day ${f.day - (s.city.play?.since ?? 0) + 1}`;
  if (f.source === 'told') return `told by ${who ?? 'them'}, ${day}`;
  if (f.source === 'heard') return `heard from ${who ?? 'someone'}, ${day}`;
  if (f.source === 'seen') return `seen yourself, ${day}`;
  return `proved, ${day}`;
}

function FactLine({ s, f, bold }: { s: Season; f: Fact; bold: boolean }) {
  return (
    <li className={`fact ${f.source}${bold ? ' unread' : ''}`}>
      <span className={`src ${f.source}`} title={how(s, f)}>{SOURCE[f.source]}</span> {f.text} <small className="muted">({how(s, f)})</small>
    </li>
  );
}

export function unreadIn(s: Season): Record<Section, number> {
  const out = Object.fromEntries(SECTIONS.map((x) => [x, 0])) as Record<Section, number>;
  for (const f of s.hand.facts) if (!f.pending && !f.read) out[SECTION_OF[f.kind] as Section]++;
  out.Letters = s.hand.letters.filter((l) => !l.read).length;
  return out;
}

export function Book({ s, start = 'Names', onClose }: { s: Season; start?: Section; onClose: () => void }) {
  const [sec, setSec] = useState<Section>(start);
  const [q, setQ] = useState('');
  const [who, setWho] = useState<number>(-1);
  const [letter, setLetter] = useState<number>(-1);
  const [, re] = useState(0);
  const c = s.city, h = s.hand;
  const facts = h.facts.filter((f) => !f.pending);
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
  const people = useMemo(() => {
    const ids = knownPeople(s);
    const pinned = (id: number) => (h.rels[id]?.pinned ? 0 : 1);
    return ids.sort((a, b) => pinned(a) - pinned(b) || fullName(c, c.people.get(a)!).localeCompare(fullName(c, c.people.get(b)!)));
  }, [s, h.rels, c]);

  const body = () => {
    if (ql) {
      const hits = facts.filter((f) => f.text.toLowerCase().includes(ql) || (f.about >= 0 && fullName(c, c.people.get(f.about) ?? { first: '', family: -1 }).toLowerCase().includes(ql)));
      return (
        <>
          <h3>{hits.length} found for “{q}”</h3>
          <ul className="facts">{hits.map((f) => <FactLine key={f.id} s={s} f={f} bold={false} />)}</ul>
        </>
      );
    }
    switch (sec) {
      case 'Names': {
        if (who >= 0 && c.people.has(who)) {
          const p = c.people.get(who)!, rel = relOf(h, who);
          const mine = facts.filter((f) => f.about === who && SECTION_OF[f.kind] !== 'Almanac');
          const seen = facts.filter((f) => f.about === who && f.kind === 'routine');
          return (
            <>
              <button type="button" className="small" onClick={() => setWho(-1)}>← All names</button>
              <div className="person-head">
                <PersonFace c={c} id={who} scale={2} />
                <div>
                  <h3>{fullName(c, p)}</h3>
                  <p className="small">{describe(c, p)}</p>
                  <p className="small">{rel.met >= 0 ? stageWord(rel.stage) : 'Not met'} · {trustWord(rel.trust)}</p>
                  {rel.motives.length > 0 && <p className="small">Wants: {rel.motives.map((m) => MOTIVE_WORDS[m]).join('; ')}</p>}
                  <label className="small"><input type="checkbox" checked={rel.pinned} onChange={() => { rel.pinned = !rel.pinned; re((n) => n + 1); }} /> Pinned</label>
                </div>
              </div>
              <ul className="facts">{mine.map((f) => <FactLine key={f.id} s={s} f={f} bold={bold.has(f.id)} />)}</ul>
              {seen.length > 0 && <><h4>Where you have seen them</h4><ul className="facts">{seen.map((f) => <FactLine key={f.id} s={s} f={f} bold={false} />)}</ul></>}
            </>
          );
        }
        return (
          <>
            <p className="small muted">Everyone you have met or heard of. Pin people to keep them at the top.</p>
            {people.length === 0 && <p>No names yet. Talk to people in the suburb.</p>}
            <ul className="names">
              {people.map((id) => {
                const p = c.people.get(id)!, rel = h.rels[id];
                const n = facts.filter((f) => f.about === id).length;
                const nb = facts.filter((f) => f.about === id && bold.has(f.id)).length;
                return (
                  <li key={id}>
                    <button type="button" className={nb ? 'unread' : ''} onClick={() => setWho(id)}>
                      <PersonFace c={c} id={id} />
                      <span><b>{rel?.pinned ? '📌 ' : ''}{fullName(c, p)}</b><small>{rel && rel.met >= 0 ? `${stageWord(rel.stage)} · ${trustWord(rel.trust)}` : 'heard of'} · {n} {n === 1 ? 'fact' : 'facts'}</small></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        );
      }
      case 'Houses': {
        const council = facts.filter((f) => f.kind === 'council');
        const fams = new Map<number, number[]>();
        for (const id of people) { const p = c.people.get(id)!; if (p.family >= 0) fams.set(p.family, [...(fams.get(p.family) ?? []), id]); }
        return (
          <>
            <h3>The council ({council.length} of 12 known)</h3>
            {council.length === 0 && <p className="small muted">Ask people about the town to learn who sits on the council.</p>}
            <ul className="facts">{council.map((f) => <FactLine key={f.id} s={s} f={f} bold={bold.has(f.id)} />)}</ul>
            <h3>Families you know of</h3>
            <ul className="small">
              {[...fams].sort((a, b) => b[1].length - a[1].length).map(([fid, ids]) => (
                <li key={fid}><b>{c.families.get(fid)?.name}</b>: {ids.map((id) => c.people.get(id)!.first).join(', ')}</li>
              ))}
            </ul>
          </>
        );
      }
      case 'Town': {
        const t = facts.filter((f) => f.kind === 'town');
        return (<><p className="small muted">News, rumour and what the town says.</p>{t.length === 0 && <p>Nothing yet.</p>}<ul className="facts">{t.map((f) => <FactLine key={f.id} s={s} f={f} bold={bold.has(f.id)} />)}</ul></>);
      }
      case 'Almanac': {
        const r = facts.filter((f) => f.kind === 'routine');
        const by = new Map<number, Fact[]>();
        for (const f of r) by.set(f.about, [...(by.get(f.about) ?? []), f]);
        return (
          <>
            <p className="small muted">Where people are, and when: what you have seen, and what members watched for you.</p>
            {r.length === 0 && <p>Nothing yet. People you know are noted when you see them about.</p>}
            {[...by].map(([pid, fs]) => (
              <div key={pid} className="almanac-person">
                <h4>{c.people.get(pid) ? fullName(c, c.people.get(pid)!) : 'Someone'}</h4>
                <ul className="facts">{fs.map((f) => <FactLine key={f.id} s={s} f={f} bold={bold.has(f.id)} />)}</ul>
              </div>
            ))}
          </>
        );
      }
      case 'Ledger': {
        const lines = [...h.ledger].reverse();
        return (
          <>
            <h3>{Math.round(h.coin)} ducats</h3>
            <p className="small muted">Rent from the lodgers on Moondays (+3), your keep on Sundays (−1).</p>
            <table className="ledger"><tbody>{lines.map((l, i) => <tr key={i}><td>Day {l.day - (c.play?.since ?? 0) + 1}</td><td>{l.what}</td><td className={l.amount < 0 ? 'neg' : 'pos'}>{l.amount >= 0 ? '+' : ''}{l.amount}</td></tr>)}</tbody></table>
          </>
        );
      }
      case 'Order': {
        const old = facts.filter((f) => f.kind === 'old-lodge');
        return (
          <>
            <h3>The Lodge of the Hand</h3>
            {h.lodge ? <p>Founded again on day {h.lodge.founded - (c.play?.since ?? 0) + 1}. Meets on {h.lodge.night >= 0 ? `${DAY_NAMES[h.lodge.night]} nights at 20:00` : 'a night not yet chosen'}. {h.lodge.meetings} meetings held.</p> : <p className="muted">No lodge yet. Swear someone in your cellar.</p>}
            {h.members.length > 0 && (
              <ul className="names">
                {h.members.map((m) => (
                  <li key={m.pid}><span className="member"><PersonFace c={c} id={m.pid} /><span><b>{c.people.get(m.pid) ? fullName(c, c.people.get(m.pid)!) : '?'}</b><small>sworn day {m.sworn - (c.play?.since ?? 0) + 1}, {m.bond === 'fear' ? 'under threat' : m.bond === 'gain' ? 'for gain' : 'from conviction'} · {trustWord(relOf(h, m.pid).trust)} · {exposureWord(h.exposure.people[m.pid] ?? 0)}{m.errands.length ? ` · errands: ${m.errands.map((e) => ERRANDS[e.kind].label.toLowerCase()).join(', ')}` : ''}</small></span></span></li>
                ))}
              </ul>
            )}
            <h3>Who is watching</h3>
            <ul className="small"><li>The suburb: {exposureWord(h.exposure.suburb)}</li><li>Your house: {exposureWord(h.exposure.house)}</li><li>You: {exposureWord(h.exposure.you)}</li></ul>
            <h3>The old lodge</h3>
            {old.length === 0 && <p className="small muted">The cellar is still bricked up.</p>}
            <ul className="facts">{old.map((f) => <FactLine key={f.id} s={s} f={f} bold={bold.has(f.id)} />)}</ul>
            {h.minutes.length > 0 && (
              <>
                <h3>Minutes</h3>
                {[...h.minutes].reverse().map((m, i) => <div key={i} className="minutes"><b>Day {m.day - (c.play?.since ?? 0) + 1}</b><ul className="small">{m.lines.map((l, k) => <li key={k}>{l}</li>)}</ul></div>)}
              </>
            )}
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
              <div className="letter"><p className="muted small">{open.from} · day {open.day - (c.play?.since ?? 0) + 1}</p><h3>{open.title}</h3>{open.body.map((p, i) => <p key={i}>{p}</p>)}</div>
            </>
          );
        }
        return (
          <>
            <p className="small muted">The in-tray. Unread letters are in bold.</p>
            <ul className="letters">{ls.map((l) => <li key={l.id}><button type="button" className={l.read ? '' : 'unread'} onClick={() => { l.read = true; playCue('page'); setLetter(l.id); }}><b>{l.title}</b><small>day {l.day - (c.play?.since ?? 0) + 1}</small></button></li>)}</ul>
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
      <div className="page">{body()}</div>
    </section>
  );
}
