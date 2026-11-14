import { useMemo, useState } from 'react';
import { TECHS } from '../../engine/techs';
import { ERAS } from '../../engine/techtree/schema';

const search = (q: string) => {
  const s = q.trim().toLowerCase();
  return TECHS.filter((t) => !s || t.name.toLowerCase().includes(s) || t.domain.includes(s) || ERAS[t.era].toLowerCase().includes(s));
};

/** Choose one technology from the full tree: a search box over a list grouped by era. */
export function TechPicker({ value, onChange, label = 'Technology' }: { value: string; onChange: (key: string) => void; label?: string }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const hit = search(q);
    const cur = TECHS.find((t) => t.key === value);
    if (cur && !hit.includes(cur)) hit.unshift(cur); // keep the chosen one selectable until a match replaces it
    return ERAS.map((name, era) => ({ name, items: hit.filter((t) => t.era === era).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length);
  }, [q, value]);
  const n = groups.reduce((a, g) => a + g.items.length, 0);
  return (
    <span className="tech-picker">
      <input type="search" placeholder={`Search ${TECHS.length} technologies…`} value={q} onChange={(e) => {
        setQ(e.target.value);
        // pick the exact match, or the first match if the current choice no longer fits
        const s = e.target.value.trim().toLowerCase();
        const hit = search(s);
        const exact = s && hit.find((t) => t.name.toLowerCase() === s);
        if (exact) onChange(exact.key);
        else if (s && hit.length && !hit.some((t) => t.key === value)) onChange(hit.slice().sort((a, b) => a.era - b.era || a.name.localeCompare(b.name))[0].key);
      }} aria-label={`Search ${label.toLowerCase()}`} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {groups.map((g) => <optgroup key={g.name} label={`${g.name} (${g.items.length})`}>{g.items.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</optgroup>)}
      </select>
      {q && <span className="small muted">{n === 0 ? 'no match' : `${n} match${n === 1 ? '' : 'es'}`}</span>}
    </span>
  );
}
