/**
 * The first lodge (docs/SEASON.md): the oath, the meeting night, the weekly meeting with its
 * reports, matters and errands, and what members cost in their own hours.
 */
import { Rng } from '../base/rng';
import { fullName } from '../core';
import { T } from '../constants';
import type { Person } from '../types';
import { blockAt, routineOf } from './routine';
import { hallReady, passageOpen, rubbleCleared } from './cellar';
import { describe, dayName, partOfDay, placeName, pron } from './people';
import { CAST, PASSAGE_HOURS, RUBBLE_HOURS } from '../../content/suburb';
import { G } from './story';
import type { Season } from './season';
import { earn, expose, learn, relOf, type Errand, type ErrandKind, type Member } from './state';

export const MEETING_AT = 20 * 60;
export const MEETING_END = 22 * 60;
export const MAX_CELL = 4;
export const ERRANDS: Record<ErrandKind, { label: string; evenings: number; needs: 'person' | 'any' | 'none'; does: string }> = {
  watch: { label: 'Watch', evenings: 2, needs: 'any', does: 'Their routine for the week, seen by the member' },
  ask: { label: 'Ask around about', evenings: 2, needs: 'person', does: 'Rumours and stories, heard; a little exposure' },
  carry: { label: 'Carry a gift to', evenings: 1, needs: 'person', does: 'A friendly word on your behalf' },
  work: { label: 'Work in the cellar', evenings: 2, needs: 'none', does: 'Their free evenings as labour' },
  earn: { label: 'Earn', evenings: 2, needs: 'none', does: 'Coin from extra work in their trade' },
};

const wdOf = (s: Season, day = s.city.day) => ((day - (s.city.play?.since ?? 0)) % 7 + 7) % 7;
const person = (s: Season, id: number) => s.city.people.get(id);
const nm = (s: Season, id: number) => { const p = person(s, id); return p ? fullName(s.city, p) : 'someone'; };

export const invited = (s: Season) => Object.entries(s.hand.rels).filter(([id, r]) => r.stage === 'invited' && s.city.people.has(+id)).map(([id]) => +id);

/** Can the oath happen now: an invited person, a finished meeting room, the evening, the founder home. */
export function oathReady(s: Season): string {
  if (!invited(s).length) return 'Nobody is waiting to swear.';
  if (!hallReady(s)) return 'The hall needs a table, two benches and a candle stand first.';
  if (s.hand.members.length >= MAX_CELL) return 'The cell is full: four besides you.';
  if (s.minute < 19 * 60) return 'They will come after dark, from 19:00.';
  if (s.inside !== s.house && !s.below) return 'Be at home.';
  return '';
}

export function swear(s: Season, pid: number): string[] {
  const c = s.city, h = s.hand;
  const rel = relOf(h, pid);
  rel.stage = 'sworn';
  rel.trust = Math.max(rel.trust, 30);
  const m: Member = { pid, sworn: c.day, bond: rel.bond ?? 'conviction', errands: [], skipped: 0 };
  h.members.push(m);
  const out = [`${nm(s, pid)} comes down the cellar stair after dark, puts a hand on the old minute book and swears the oath of the Hand.`];
  if (!h.lodge) {
    h.lodge = { founded: c.day, night: -1, meetings: 0, lastMeeting: -1, moved: -99 };
    out.push('With two of you under the house, the cellar is a lodge again: the Lodge of the Hand. Choose the night it meets.');
    learn(h, c.day, { about: -1, place: s.house, kind: 'old-lodge', text: `The Lodge of the Hand was founded again under your house, with ${nm(s, pid)} sworn.`, source: 'proved', via: -1, key: 'lodge:founded' }, true);
  }
  // a night visitor is seen
  expose(h, (0.03 - 0.01 * h.repaired.length) * (passageOpen(s) ? 0.4 : 1), -2, 0.01);
  h.today.events.push(`${nm(s, pid)} swore the oath.`);
  h.minutes.push({ day: c.day, lines: [`${nm(s, pid)} was sworn (${m.bond === 'fear' ? 'under threat' : m.bond === 'gain' ? 'for gain' : 'from conviction'}).`] });
  s.minute = Math.max(s.minute + 60, s.minute);
  return out;
}

/** Evenings in a week a member has free (no work, tavern, meeting or Mass between 19:00 and 22:00). */
export function freeEvenings(s: Season, p: Person): number[] {
  const bl = routineOf(s.city, p);
  const out: number[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const busy = [19 * 60 + 30, 20 * 60 + 30, 21 * 60 + 30].some((m) => { const b = blockAt(bl, wd, m); return b && b.act !== 'home' && b.act !== 'play'; });
    if (!busy) out.push(wd);
  }
  return out;
}

export interface NightOption { wd: number; free: number[]; skip: { pid: number; what: string }[] }
export function nightOptions(s: Season): NightOption[] {
  const out: NightOption[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const free: number[] = [], skip: NightOption['skip'] = [];
    for (const m of s.hand.members) {
      const p = person(s, m.pid);
      if (!p) continue;
      const b = blockAt(routineOf(s.city, p), wd, MEETING_AT + 30);
      if (!b || b.act === 'home' || b.act === 'play') free.push(m.pid); else skip.push({ pid: m.pid, what: b.act === 'tavern' ? 'their tavern night' : b.act === 'meeting' ? 'their congregation' : b.act === 'work' ? 'work' : b.act });
    }
    out.push({ wd, free, skip });
  }
  return out;
}

export function setNight(s: Season, wd: number): string {
  const h = s.hand;
  if (!h.lodge) return 'There is no lodge yet.';
  if (h.lodge.night >= 0) {
    if (s.city.day - h.lodge.moved < 7) return 'You moved the night less than a week ago.';
    for (const m of h.members) { const r = relOf(h, m.pid); r.trust -= 3; }
    h.lodge.moved = s.city.day;
  }
  h.lodge.night = wd;
  return `The lodge meets on ${dayName(wd)} nights at 20:00.`;
}

export const meetingDue = (s: Season) => !!s.hand.lodge && s.hand.lodge.night === wdOf(s) && s.minute >= MEETING_AT && s.minute < MEETING_END && s.hand.lodge.lastMeeting !== s.city.day && s.hand.members.length > 0;

export interface Report { pid: number; lines: string[] }

/** Open the meeting: members report on last week's errands, and anyone invited can swear. */
export function openMeeting(s: Season): { reports: Report[]; present: number[]; absent: { pid: number; why: string }[]; swearable: number[] } {
  const c = s.city, h = s.hand;
  const present: number[] = [], absent: { pid: number; why: string }[] = [];
  for (const m of h.members) {
    const p = person(s, m.pid);
    if (!p) { absent.push({ pid: m.pid, why: 'dead' }); continue; }
    const b = blockAt(routineOf(c, p), wdOf(s), MEETING_AT + 30);
    const r = relOf(h, m.pid);
    const comes = !b || b.act === 'home' || b.act === 'play' || r.trust > 25;
    if (comes) {
      present.push(m.pid);
      if (b && b.act !== 'home' && b.act !== 'play') { expose(h, 0.03, m.pid); h.today.events.push(`${nm(s, m.pid)} skipped ${b.act === 'work' ? 'work' : b.act} to come to the lodge.`); }
    } else absent.push({ pid: m.pid, why: b?.act === 'tavern' ? 'at the tavern instead' : 'kept away' });
  }
  const reports = h.members.filter((m) => present.includes(m.pid)).map((m) => ({ pid: m.pid, lines: resolveErrands(s, m) }));
  const swearable = hallReady(s) ? invited(s).slice(0, MAX_CELL - h.members.length) : [];
  return { reports, present, absent, swearable };
}

/** A member's errands from last week come back, well or badly. */
function resolveErrands(s: Season, m: Member): string[] {
  const c = s.city, h = s.hand;
  const p = person(s, m.pid)!;
  const rel = relOf(h, m.pid);
  const out: string[] = [];
  const r = new Rng(c.config.seed * 31 + m.pid * 7 + c.day);
  if (!m.errands.length) return [`${p.first} has nothing to report.`];
  const free = freeEvenings(s, p).length - 1;
  const need = m.errands.reduce((a, e) => a + ERRANDS[e.kind].evenings, 0);
  if (need > free) {
    m.skipped = need - free;
    expose(h, 0.04 * m.skipped, m.pid);
    rel.trust -= 3 * m.skipped;
    out.push(`${p.first} had to skip ${m.skipped === 1 ? 'an evening' : `${m.skipped} evenings`} of ${pron.his(p)} own life to do it all, and lost wages.`);
  } else m.skipped = 0;
  const reliable = 0.55 + rel.trust / 200 + (m.bond === 'fear' ? -0.15 : 0);
  for (const e of m.errands) {
    if (e.kind === 'work') { out.push(`${p.first} put in ${pron.his(p)} evenings in the cellar.`); continue; }
    const ok = r.next() < reliable;
    const t = e.target >= 0 ? person(s, e.target) : undefined;
    if (e.kind === 'earn') {
      const amt = ok ? 2 : 1;
      earn(h, c.day, amt, `${p.first}'s extra work`, 'lodge');
      out.push(`${p.first} brings ${amt} ${amt === 1 ? 'ducat' : 'ducats'} from extra work.`);
      continue;
    }
    if (!t) { out.push(`${p.first} could not find the one you asked about.`); continue; }
    if (!ok) { out.push(`${p.first} ${e.kind === 'watch' ? 'lost track of' : e.kind === 'ask' ? 'learned nothing worth telling about' : 'never got to'} ${fullName(c, t)}.`); continue; }
    if (e.kind === 'watch') {
      const bl = routineOf(c, t);
      const seen = bl.filter((b) => b.act !== 'home').slice(0, 4);
      for (const b of seen) {
        const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => b.days & (1 << d));
        const when = days.length >= 6 ? 'most days' : days.map((d) => dayName(d)).join(' and ');
        const place = 'b' in b.place ? placeName(c, c.buildings.get(b.place.b), s.house) : 'the market cross';
        const text = `${fullName(c, t)}: ${b.act === 'work' ? 'at work' : b.act} at ${place}, ${when}, ${partOfDay(b.from)} (${Math.floor(b.from / 60)}:${String(b.from % 60).padStart(2, '0')} to ${Math.floor(b.to / 60)}:${String(b.to % 60).padStart(2, '0')}).`;
        learn(h, c.day, { about: t.id, place: -1, kind: 'routine', text, source: 'seen', via: m.pid, key: `routine:${t.id}:${b.act}:${b.from}` }, true);
      }
      out.push(`${p.first} watched ${fullName(c, t)} for a week and wrote down where ${pron.he(t)} goes.`);
    } else if (e.kind === 'ask') {
      expose(h, 0.04, m.pid, 0.02);
      const g = new G(s);
      const key = t.authored ?? '';
      const heard = CAST.map((x) => x.talk.about[key]).find((a) => a?.fact && !g.knows(a.fact));
      if (heard?.fact) {
        g.learn(heard.fact, p.authored ?? '', 'heard');
        out.push(`${p.first} asked around about ${fullName(c, t)}, and has something for the Book.`);
      } else out.push(`${p.first} asked around about ${fullName(c, t)}, and heard nothing new.`);
    } else if (e.kind === 'carry') {
      const rt = relOf(h, t.id);
      rt.trust = Math.min(100, rt.trust + 6);
      if (rt.stage === 'stranger') rt.stage = 'acquaintance';
      out.push(`${p.first} took your gift to ${fullName(c, t)}, who was pleased.`);
    }
  }
  if (rel.trust > 0) rel.trust = Math.min(100, rel.trust + 2);
  m.errands = [];
  return out;
}

/** Close the meeting: errands for the week, an optional tithe; the evening passes. */
export function closeMeeting(s: Season, errands: Record<number, Errand[]>, tithe: boolean, sworn: string[]): string[] {
  const c = s.city, h = s.hand;
  const lines: string[] = [...sworn];
  for (const m of h.members) {
    const p = person(s, m.pid);
    if (!p) continue;
    m.errands = (errands[m.pid] ?? []).slice(0, 2).map((e) => ({ ...e, left: e.kind === 'work' ? 2 : undefined }));
    for (const e of m.errands) {
      if (e.kind === 'carry' && h.coin >= 1) { h.coin -= 1; h.ledger.push({ day: c.day, amount: -1, what: `A gift sent by ${p.first}`, cat: 'lodge' }); }
      lines.push(`${p.first}: ${ERRANDS[e.kind].label.toLowerCase()}${e.target >= 0 ? ` ${e.target === s.house ? 'your house' : nm(s, e.target)}` : ''}.`);
    }
    if (tithe) {
      earn(h, c.day, 1, `Tithe from ${p.first}`, 'lodge');
      relOf(h, m.pid).trust -= m.bond === 'conviction' ? 5 : m.bond === 'gain' ? 2 : 3;
    }
    // each meeting at the house is seen a little; the same night every week is a pattern
    expose(h, 0.015 + (h.lodge?.meetings ?? 0) * 0.004, m.pid);
  }
  if (tithe) lines.push('A tithe of a ducat each was asked, and paid.');
  expose(h, (0.02 + h.members.length * 0.012 - 0.006 * h.repaired.length) * (passageOpen(s) ? 0.5 : 1), -2, 0.012 * h.members.length);
  if (h.lodge) { h.lodge.meetings++; h.lodge.lastMeeting = c.day; }
  h.minutes.push({ day: c.day, lines });
  s.minute = Math.max(s.minute, MEETING_END);
  return lines;
}

/** Overnight: members working in the cellar give an evening each. */
export function memberLabour(s: Season): string[] {
  const h = s.hand, out: string[] = [];
  for (const m of h.members) {
    const p = person(s, m.pid);
    if (!p) continue;
    for (const e of m.errands) {
      if (e.kind !== 'work' || !e.left) continue;
      if (passageOpen(s)) break;
      const fast = p.trade === T.mason || p.trade === T.carpenter || p.trade === T.labourer || p.trade === T.smith;
      let hours = fast ? 4 : 2;
      const cel = h.cellar;
      let what = '';
      for (let i = 0; i < cel.rubble.length && hours > 0; i++) { const add = Math.min(hours, RUBBLE_HOURS - cel.rubble[i]); if (add > 0) { cel.rubble[i] += add; hours -= add; what = 'the rubble'; } }
      if (hours > 0 && rubbleCleared(s)) { cel.passage = Math.min(PASSAGE_HOURS, cel.passage + hours); what = what ? 'the rubble and the old arch' : 'the old arch'; }
      e.left--;
      out.push(`${p.first} worked an evening in the cellar on ${what || 'odd jobs'}${passageOpen(s) ? ', and broke through to the old way' : ''}.`);
      expose(h, 0.01, m.pid);
    }
  }
  return out;
}

export function memberLine(s: Season, m: Member): string {
  const p = person(s, m.pid);
  return p ? describe(s.city, p) : 'gone';
}
