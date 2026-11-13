import { useMemo, useState } from 'react';
import { useQuery } from '../hooks';
import type { YearStats } from '../../engine/types';
import { LineChart } from '../components/LineChart';
import { DEATH_NAMES, OCC_NAMES } from '../../engine/constants';
import { downloadText } from '../saves';
import { METRICS } from '../../engine/systems/stats';
import { useSim } from '../hooks';

const GROUPS: { title: string; charts: { title: string; keys: (keyof YearStats)[]; labels?: string[]; pct?: boolean }[] }[] = [
  { title: 'Population', charts: [
    { title: 'Population', keys: ['pop'] },
    { title: 'Births and deaths per year', keys: ['births', 'deaths'], labels: ['Births', 'Deaths'] },
    { title: 'Total fertility rate', keys: ['tfr'] },
    { title: 'Mean age at death', keys: ['lifeExp'] },
    { title: 'Settlements and polities', keys: ['settlements', 'polities'], labels: ['Settlements', 'Polities'] },
    { title: 'Largest settlement', keys: ['largest'] },
  ] },
  { title: 'Economy', charts: [
    { title: 'Food produced per person per month', keys: ['foodPerCap'] },
    { title: 'Share of people hungry', keys: ['hungerShare'], pct: true },
    { title: 'Wealth inequality (Gini)', keys: ['gini'] },
    { title: 'Wealth per person', keys: ['wealth'] },
    { title: 'Trade volume', keys: ['tradeVolume'] },
    { title: 'Money supply', keys: ['moneySupply'] },
  ] },
  { title: 'Society', charts: [
    { title: 'Technologies known', keys: ['techs'] },
    { title: 'Literacy', keys: ['literacy'], pct: true },
    { title: 'Cultures and religions', keys: ['cultures', 'religions'], labels: ['Cultures', 'Religions'] },
    { title: 'Unrest and wellbeing', keys: ['unrest', 'happiness'], labels: ['Unrest', 'Wellbeing'], pct: true },
    { title: 'Active wars', keys: ['wars'] },
    { title: 'War deaths per year', keys: ['warDeaths'] },
  ] },
  { title: 'Environment', charts: [
    { title: 'Forest cover (share of capacity)', keys: ['forest'], pct: true },
    { title: 'Wild game and fish stocks', keys: ['game', 'fish'], labels: ['Game', 'Fish'], pct: true },
    { title: 'Farm soil fertility (vs natural)', keys: ['soil'], pct: true },
    { title: 'Farmland (tiles)', keys: ['farmland'] },
    { title: 'Temperature anomaly (°C)', keys: ['temp'] },
    { title: 'Infected people', keys: ['infected'] },
  ] },
];

export function StatsView() {
  const st = useSim();
  const { data } = useQuery<YearStats[]>('stats', null, 12);
  const [smooth, setSmooth] = useState(1);
  const rows = data ?? [];
  const x = rows.map((r) => r.y);
  const sm = (v: number[]) => {
    if (smooth <= 1) return v;
    const out: number[] = [];
    for (let i = 0; i < v.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - smooth + 1); j <= i; j++) { s += v[j]; n++; } out.push(s / n); }
    return out;
  };
  const deathKeys = useMemo(() => {
    const ks = new Set<number>();
    for (const r of rows) for (const k in r.deathsBy) ks.add(+k);
    return [...ks].sort((a, b) => a - b);
  }, [rows]);
  // deaths by cause, as share per decade
  const decades = useMemo(() => {
    const out: { y: number; by: Record<number, number> }[] = [];
    for (const r of rows) {
      const d = Math.floor(r.y / 10) * 10;
      let o = out[out.length - 1];
      if (!o || o.y !== d) { o = { y: d, by: {} }; out.push(o); }
      for (const k in r.deathsBy) o.by[+k] = (o.by[+k] ?? 0) + r.deathsBy[+k];
    }
    return out;
  }, [rows]);
  const exportCsv = () => {
    const keys = METRICS.map((m) => m.key);
    const lines = ['year,' + keys.join(',') + ',' + OCC_NAMES.map((o) => `occ_${o}`).join(',')];
    for (const r of rows) lines.push([r.y, ...METRICS.map((m) => m.get(r)), ...r.occ].join(','));
    downloadText(`${st.frame?.name ?? 'world'}-statistics.csv`, lines.join('\n'), 'text/csv');
  };
  if (rows.length < 2) return <div className="page"><h1>Statistics</h1><p className="muted">Statistics are recorded at the end of each simulated year. Run the world for a couple of years.</p></div>;
  return (
    <div className="page stats">
      <div className="page-head row">
        <h1>Statistics</h1>
        <span className="grow" />
        <label className="small">Smoothing <select value={smooth} onChange={(e) => setSmooth(+e.target.value)}><option value={1}>None</option><option value={5}>5 years</option><option value={10}>10 years</option><option value={25}>25 years</option></select></label>
        <button onClick={exportCsv}>Export CSV</button>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          <div className="chart-grid">
            {g.charts.map((c) => (
              <div key={c.title} className="card">
                <LineChart title={c.title} x={x} pct={c.pct} series={c.keys.map((k, i) => ({ name: c.labels?.[i] ?? c.title, values: sm(rows.map((r) => r[k] as number)) }))} />
              </div>
            ))}
          </div>
        </section>
      ))}
      <section>
        <h3>Livelihoods and causes of death</h3>
        <div className="chart-grid two">
          <div className="card">
            <LineChart title="Occupations" x={x} series={OCC_NAMES.map((o, i) => ({ name: o, values: sm(rows.map((r) => r.occ[i] ?? 0)) })).filter((s, i) => i > 0 && Math.max(...s.values) > 3).slice(0, 8)} />
          </div>
          <div className="card">
            <div className="chart-title">Deaths by cause, per decade</div>
            <StackBars decades={decades} keys={deathKeys} />
          </div>
        </div>
      </section>
    </div>
  );
}

const DEATH_COLORS: Record<number, string> = { 1: '#8a8f98', 2: '#c98500', 3: '#d95926', 4: '#9085e9', 5: '#e66767', 6: '#d55181', 7: '#199e70', 8: '#3987e5', 9: '#5b6a7a' };
function StackBars({ decades, keys }: { decades: { y: number; by: Record<number, number> }[]; keys: number[] }) {
  return (
    <div className="stackbars">
      <div className="chart-legend">{keys.map((k) => <span key={k}><i style={{ background: DEATH_COLORS[k] }} />{DEATH_NAMES[k]}</span>)}</div>
      <div className="stack-wrap">
        {decades.map((d) => {
          const total = keys.reduce((a, k) => a + (d.by[k] ?? 0), 0) || 1;
          return (
            <div key={d.y} className="stack-col" title={`${d.y}s: ${keys.filter((k) => d.by[k]).map((k) => `${DEATH_NAMES[k]} ${Math.round(((d.by[k] ?? 0) / total) * 100)}%`).join(', ')}`}>
              {keys.map((k) => <span key={k} style={{ height: `${((d.by[k] ?? 0) / total) * 100}%`, background: DEATH_COLORS[k] }} />)}
            </div>
          );
        })}
      </div>
      <div className="stack-axis small muted"><span>{decades[0]?.y}</span><span>{decades[decades.length - 1]?.y}</span></div>
    </div>
  );
}
