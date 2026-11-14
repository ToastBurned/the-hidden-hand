/**
 * The encyclopaedia: every rule of the game, searchable and cross-linked, over any screen.
 *
 * `CodexProvider` wraps the game and owns the window; anything inside can open it at an
 * entry with `useCodex().open(id)`, or with `<CodexLink id>` / `<HelpMark id>`. F1 or ?
 * opens it from anywhere. Entries come from the worker (`codex` query), built from the
 * game's own data, and say nothing about the world being played, so the Veil holds.
 */
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { sim } from '../../client';
import type { CodexCat, CodexEntry } from '../../../engine/game/codex/types';
import { CODEX_CATS } from '../../../engine/game/codex/types';
import { Icon } from '../Icons';
import './codex.css';

// ---------------------------------------------------------------- data

let loading: Promise<CodexEntry[]> | null = null;
function loadCodex(): Promise<CodexEntry[]> {
  if (!loading) loading = sim.query<CodexEntry[]>('codex').then((x) => { if (!x?.length) { loading = null; throw new Error('empty'); } return x; });
  return loading;
}

interface Index {
  all: CodexEntry[];
  byId: Map<string, CodexEntry>;
  byCat: Map<CodexCat, CodexEntry[]>;
  backlinks: Map<string, string[]>;
  hay: Map<string, { title: string; meta: string; body: string }>;
}
const LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const plain = (s: string) => s.replace(LINK, (_m, id: string, label?: string) => label ?? id).replace(/\*\*|##|^- /g, '');
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function buildIndex(all: CodexEntry[]): Index {
  const byId = new Map(all.map((e) => [e.id, e]));
  const byCat = new Map<CodexCat, CodexEntry[]>();
  const backlinks = new Map<string, string[]>();
  const hay = new Map<string, { title: string; meta: string; body: string }>();
  for (const e of all) {
    if (!byCat.has(e.cat)) byCat.set(e.cat, []);
    byCat.get(e.cat)!.push(e);
    const out = new Set<string>();
    const scan = (s: string) => { for (const m of s.matchAll(LINK)) out.add(m[1]); };
    e.body.forEach(scan); e.facts?.forEach(([, v]) => scan(v));
    for (const t of out) if (t !== e.id) { if (!backlinks.has(t)) backlinks.set(t, []); backlinks.get(t)!.push(e.id); }
    hay.set(e.id, { title: norm(e.title), meta: norm([e.sub ?? '', ...(e.tags ?? []), e.group ?? ''].join(' ')), body: norm(e.body.map(plain).join(' ') + ' ' + (e.facts ?? []).map(([k, v]) => `${k} ${plain(v)}`).join(' ')) });
  }
  return { all, byId, byCat, backlinks, hay };
}

const CAT_ORDER = new Map(CODEX_CATS.map((c, i) => [c.id, i]));
function search(ix: Index, q: string): CodexEntry[] {
  const query = norm(q.trim());
  if (!query) return [];
  const toks = query.split(/\s+/).filter(Boolean);
  const scored: [number, CodexEntry][] = [];
  for (const e of ix.all) {
    const h = ix.hay.get(e.id)!;
    let s = 0;
    if (h.title === query) s += 100; else if (h.title.startsWith(query)) s += 60; else if (h.title.includes(query)) s += 35;
    let ok = true;
    for (const t of toks) {
      const inTitle = h.title.includes(t), inMeta = h.meta.includes(t), inBody = h.body.includes(t);
      if (!inTitle && !inMeta && !inBody) { ok = false; break; }
      s += (inTitle ? 14 : 0) + (inMeta ? 7 : 0) + (inBody ? 2 : 0);
    }
    if (!ok) continue;
    if (e.cat !== 'techs') s += 4; // rules before inventions when both match
    scored.push([s, e]);
  }
  scored.sort((a, b) => b[0] - a[0] || (CAT_ORDER.get(a[1].cat)! - CAT_ORDER.get(b[1].cat)!) || a[1].title.localeCompare(b[1].title));
  return scored.slice(0, 80).map((x) => x[1]);
}

// ---------------------------------------------------------------- opening it from anywhere

interface CodexApi { open: (id?: string) => void }
const CodexCtx = createContext<CodexApi>({ open: () => {} });
export const useCodex = () => useContext(CodexCtx);

export function CodexProvider({ children }: { children: ReactNode }) {
  const [at, setAt] = useState<{ id: string | null; n: number } | null>(null);
  const open = useCallback((id?: string) => setAt((a) => ({ id: id ?? null, n: (a?.n ?? 0) + 1 })), []);
  const api = useMemo(() => ({ open }), [open]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
      if (e.key === 'F1' || (e.key === '?' && !typing)) { e.preventDefault(); setAt((a) => a ?? { id: null, n: 1 }); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  // warm the data so the first opening is instant
  useEffect(() => { const t = setTimeout(() => { loadCodex().catch(() => {}); }, 2500); return () => clearTimeout(t); }, []);
  return (
    <CodexCtx.Provider value={api}>
      {children}
      {at && <Encyclopaedia key={at.n} start={at.id} onClose={() => setAt(null)} />}
    </CodexCtx.Provider>
  );
}

/** Inline text that opens an entry. */
export function CodexLink({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { open } = useCodex();
  return <button type="button" className={`link codex-inline ${className ?? ''}`} onClick={(e) => { e.stopPropagation(); open(id); }}>{children}</button>;
}

/** A small book mark beside a heading: "read about this in the encyclopaedia". */
export function HelpMark({ id, label }: { id: string; label?: string }) {
  const { open } = useCodex();
  return (
    <button type="button" className="ghost codex-mark" onClick={(e) => { e.stopPropagation(); open(id); }} title={`${label ?? 'Read about this'} in the encyclopaedia`} aria-label={label ?? 'Read about this in the encyclopaedia'}>
      <Icon name="book" size={14} />
    </button>
  );
}

// ---------------------------------------------------------------- the window

function Encyclopaedia({ start, onClose }: { start: string | null; onClose: () => void }) {
  const [ix, setIx] = useState<Index | null>(null);
  const [failed, setFailed] = useState(false);
  const [hist, setHist] = useState<{ stack: (string | null)[]; i: number }>({ stack: [start], i: 0 });
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CodexCat | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const current = hist.stack[hist.i];

  useEffect(() => { loadCodex().then((all) => setIx(buildIndex(all))).catch(() => setFailed(true)); }, []);

  const go = useCallback((id: string | null) => {
    setHist((h) => (h.stack[h.i] === id ? h : { stack: [...h.stack.slice(0, h.i + 1), id], i: h.i + 1 }));
  }, []);
  const back = useCallback(() => setHist((h) => (h.i > 0 ? { ...h, i: h.i - 1 } : h)), []);
  const fwd = useCallback(() => setHist((h) => (h.i < h.stack.length - 1 ? { ...h, i: h.i + 1 } : h)), []);

  const entry = current && ix ? ix.byId.get(current) ?? null : null;
  // follow the open entry in the side list
  useEffect(() => {
    if (!entry) return;
    setCat(entry.cat);
    if (entry.group) setOpenGroups((s) => (s.has(`${entry.cat}/${entry.group}`) ? s : new Set(s).add(`${entry.cat}/${entry.group}`)));
    articleRef.current?.scrollTo({ top: 0 });
  }, [entry]);
  useEffect(() => { document.querySelector('.codex-nav .codex-item.on')?.scrollIntoView({ block: 'nearest' }); }, [entry, cat, openGroups]);

  // The encyclopaedia takes the keyboard while it is open, so the game underneath does not react.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (typing && q) setQ(''); else onClose(); return; }
      if (typing) return;
      e.stopPropagation();
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) { e.preventDefault(); back(); }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); fwd(); }
      else if (e.key === 'F1') e.preventDefault();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [q, onClose, back, fwd]);

  const results = useMemo(() => (ix && q.trim() ? search(ix, q) : null), [ix, q]);
  const title = (id: string) => ix?.byId.get(id)?.title ?? id;

  return (
    <div className="hh-modal-back codex-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="codex panel" role="dialog" aria-modal="true" aria-label="Encyclopaedia">
        <header className="codex-head">
          <Icon name="book" size={20} />
          <h2 className="grow">The Encyclopaedia</h2>
          <button className="ghost codex-backbtn" onClick={back} disabled={hist.i === 0} title="Back (Backspace)" aria-label="Back"><Icon name="back" size={16} /></button>
          <button className="ghost codex-fwd" onClick={fwd} disabled={hist.i >= hist.stack.length - 1} title="Forward" aria-label="Forward"><Icon name="next" size={16} /></button>
          <button className="ghost" onClick={() => { go(null); setQ(''); }} title="Contents" aria-label="Contents"><Icon name="scroll" size={16} /></button>
          <button className="ghost" onClick={onClose} title="Close (Esc)" aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="codex-cols">
          <aside className="codex-side">
            <div className="codex-search">
              <Icon name="search" size={14} />
              <input ref={searchRef} className="codex-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the encyclopaedia" aria-label="Search the encyclopaedia" autoFocus={!start}
                onKeyDown={(e) => { if (e.key === 'Enter' && results?.[0]) { go(results[0].id); } }} />
            </div>
            <nav className="codex-nav" aria-label="Contents">
              {!ix && !failed && <p className="dim italic small codex-pad">Opening the books…</p>}
              {failed && <p className="dim italic small codex-pad">The encyclopaedia could not be opened.</p>}
              {ix && results && (
                <>
                  <div className="label codex-pad">{results.length ? `${results.length >= 80 ? 'First 80' : results.length} found` : 'Nothing found'}</div>
                  {results.map((e) => (
                    <button key={e.id} className={`codex-item ${e.id === current ? 'on' : ''}`} onClick={() => go(e.id)}>
                      <span className="t">{e.title}</span><span className="c">{CODEX_CATS.find((c) => c.id === e.cat)?.label}</span>
                    </button>
                  ))}
                </>
              )}
              {ix && !results && CODEX_CATS.map((c) => {
                const items = ix.byCat.get(c.id) ?? [];
                if (!items.length) return null;
                const isOpen = cat === c.id;
                return (
                  <div key={c.id} className="codex-cat">
                    <button className={`codex-cat-btn ${isOpen ? 'on' : ''}`} onClick={() => setCat(isOpen ? null : c.id)} aria-expanded={isOpen}>
                      <span className="grow">{c.label}</span><span className="tiny faint">{items.length}</span>
                    </button>
                    {isOpen && <CatList items={items} current={current} go={go} cat={c.id} openGroups={openGroups} setOpenGroups={setOpenGroups} />}
                  </div>
                );
              })}
            </nav>
          </aside>
          <div className="codex-article" ref={articleRef}>
            {ix && !current && <Contents ix={ix} go={go} onCat={setCat} />}
            {ix && current && !entry && <p className="dim italic">There is no entry by that name.</p>}
            {ix && entry && <Article e={entry} ix={ix} go={go} title={title} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function CatList({ items, current, go, cat, openGroups, setOpenGroups }: { items: CodexEntry[]; current: string | null; go: (id: string) => void; cat: CodexCat; openGroups: Set<string>; setOpenGroups: (f: (s: Set<string>) => Set<string>) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, CodexEntry[]>();
    for (const e of items) { const g = e.group ?? ''; if (!m.has(g)) m.set(g, []); m.get(g)!.push(e); }
    return [...m.entries()];
  }, [items]);
  // long categories fold their groups; short ones show everything
  const fold = items.length > 40;
  const anyOpen = [...openGroups].some((k) => k.startsWith(`${cat}/`)); // a mark at all means the player has chosen
  return (
    <div className="codex-list">
      {groups.map(([g, es], i) => {
        const key = `${cat}/${g}`;
        const shown = !g || !fold || openGroups.has(key) || (!anyOpen && i === 0);
        return (
          <Fragment key={key}>
            {g && (fold
              ? <button className="codex-group fold" aria-expanded={shown} onClick={() => setOpenGroups((s) => { const n = new Set(s); if (shown) { n.delete(key); if (!anyOpen) n.add(`${cat}/`); } else n.add(key); return n; })}><span className="grow">{g}</span><span className="tiny faint">{es.length} {shown ? '▾' : '▸'}</span></button>
              : <div className="codex-group">{g}</div>)}
            {shown && es.map((e) => <button key={e.id} className={`codex-item ${e.id === current ? 'on' : ''}`} onClick={() => go(e.id)}><span className="t">{e.title}</span></button>)}
          </Fragment>
        );
      })}
    </div>
  );
}

function Contents({ ix, go, onCat }: { ix: Index; go: (id: string) => void; onCat: (c: CodexCat) => void }) {
  const first = (c: CodexCat) => ix.byCat.get(c)?.[0];
  return (
    <div className="codex-contents">
      <p className="italic dim">Everything the Order has learned about the rules of its world. Nothing here tells of the world you are playing: what lies behind the Veil stays there.</p>
      <div className="codex-start">
        <button className="seal" onClick={() => go('guide:welcome')}>Start here: your seat</button>
        <button onClick={() => go('guide:first-steps')}>First steps</button>
        <button onClick={() => go('guide:keys')}>Keys</button>
      </div>
      <div className="codex-cards">
        {CODEX_CATS.map((c) => {
          const n = ix.byCat.get(c.id)?.length ?? 0;
          if (!n) return null;
          return (
            <button key={c.id} className="codex-card panel" onClick={() => { onCat(c.id); const f = first(c.id); if (f) go(f.id); }}>
              <div className="row"><b className="grow">{c.label}</b><span className="tiny faint">{n}</span></div>
              <div className="small dim">{c.blurb}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Article({ e, ix, go, title }: { e: CodexEntry; ix: Index; go: (id: string) => void; title: (id: string) => string }) {
  const catLabel = CODEX_CATS.find((c) => c.id === e.cat)?.label ?? '';
  const own = new Set<string>(e.see ?? []);
  for (const s of [...e.body, ...(e.facts ?? []).map((f) => f[1])]) for (const m of s.matchAll(LINK)) own.add(m[1]);
  const back = (ix.backlinks.get(e.id) ?? []).filter((id) => !own.has(id));
  const blocks: ReactNode[] = [];
  let ul: ReactNode[] = [];
  const flush = () => { if (ul.length) { blocks.push(<ul key={`ul${blocks.length}`}>{ul}</ul>); ul = []; } };
  e.body.forEach((p, i) => {
    if (p.startsWith('- ')) { ul.push(<li key={i}><Rich text={p.slice(2)} ix={ix} go={go} /></li>); return; }
    flush();
    if (p.startsWith('## ')) blocks.push(<h4 key={i}>{p.slice(3)}</h4>);
    else blocks.push(<p key={i}><Rich text={p} ix={ix} go={go} /></p>);
  });
  flush();
  return (
    <article className="codex-entry">
      <div className="label">{catLabel}{e.group ? ` · ${e.group}` : ''}</div>
      <h1>{e.title}</h1>
      {e.sub && e.sub !== e.body[0] && <p className="codex-sub italic">{e.sub}</p>}
      {e.facts && e.facts.length > 0 && (
        <dl className="codex-facts">
          {e.facts.map(([k, v], i) => <Fragment key={i}><dt>{k}</dt><dd><Rich text={v} ix={ix} go={go} /></dd></Fragment>)}
        </dl>
      )}
      <div className="codex-body">{blocks}</div>
      {(e.see?.length ?? 0) > 0 && (
        <div className="codex-see"><span className="label">See also</span>{e.see!.filter((id) => ix.byId.has(id)).map((id) => <button key={id} className="chip" onClick={() => go(id)}>{title(id)}</button>)}</div>
      )}
      {back.length > 0 && (
        <div className="codex-see"><span className="label">Mentioned in</span>{back.slice(0, 24).map((id) => <button key={id} className="chip" onClick={() => go(id)}>{title(id)}</button>)}{back.length > 24 && <span className="tiny faint">and {back.length - 24} more</span>}</div>
      )}
    </article>
  );
}

/** Entry text: `[[id]]` and `[[id|label]]` links, **bold** and *italic*. */
function Rich({ text, ix, go }: { text: string; ix: Index; go: (id: string) => void }) {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  const emph = (s: string) => s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={k++}>{part.slice(2, -2)}</b>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <i key={k++}>{part.slice(1, -1)}</i>;
    return <Fragment key={k++}>{part}</Fragment>;
  });
  for (const m of text.matchAll(LINK)) {
    out.push(...emph(text.slice(last, m.index)));
    const target = ix.byId.get(m[1]);
    const label = m[2] ?? target?.title ?? m[1];
    out.push(target ? <button key={k++} className="link codex-link" onClick={() => go(m[1])} title={target.sub}>{label}</button> : <Fragment key={k++}>{label}</Fragment>);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(...emph(text.slice(last)));
  return <>{out}</>;
}
