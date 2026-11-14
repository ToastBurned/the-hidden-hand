import { useState, useSyncExternalStore } from 'react';
import { pool, type ExpState } from '../expPool';
import { PRESETS } from '../../engine/analysis/presets';
import type { Condition, ExperimentSpec } from '../../engine/analysis/experiment';
import { FEATURE_LABELS, OUTCOME_LABELS } from '../../engine/analysis/experiment';
import { renderReport } from '../../engine/analysis/report';
import { INTERVENTION_KINDS, PARAMS, type Intervention, type InterventionKind, type WorldConfig } from '../../engine/config';
import { METRICS } from '../../engine/systems/stats';
import { TechPicker } from '../components/TechPicker';
import { LineChart } from '../components/LineChart';
import { SERIES } from '../colors';
import { downloadText } from '../saves';
import { sim } from '../client';
import { useSim } from '../hooks';

const usePool = () => { useSyncExternalStore(pool.subscribe, pool.getVersion); return pool; };
const draft: { spec: ExperimentSpec; nSeeds: number; seed0: number; design: 'fresh' | 'branch' } = { spec: PRESETS[1].make(), nSeeds: 12, seed0: 1, design: 'fresh' };
const seedsFrom = (start: number, n: number) => Array.from({ length: n }, (_, i) => start + i);

export function Experiments() {
  const p = usePool();
  const [mode, setMode] = useState<'design' | 'results'>(p.current ? 'results' : 'design');
  return (
    <div className="page experiments">
      <div className="page-head row">
        <h1>Experiments</h1>
        <span className="grow" />
        <div className="seg">
          <button className={mode === 'design' ? 'on' : ''} onClick={() => setMode('design')}>Design</button>
          <button className={mode === 'results' ? 'on' : ''} onClick={() => setMode('results')} disabled={!p.current}>Results{p.current?.status === 'running' ? ' (running)' : ''}</button>
        </div>
        {p.history.length > 1 && (
          <select onChange={(e) => { p.show(e.target.value); setMode('results'); }} value={p.current?.id ?? ''} title="Earlier experiments from this session">
            {p.history.map((h) => <option key={h.id} value={h.id}>{h.spec.name} ({new Date(h.started).toLocaleTimeString()})</option>)}
          </select>
        )}
      </div>
      {mode === 'design' ? <Designer onStarted={() => setMode('results')} /> : p.current ? <Results e={p.current} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ designer

function Designer({ onStarted }: { onStarted: () => void }) {
  const st = useSim();
  // the draft survives switching tabs
  const [spec, setSpec0] = useState<ExperimentSpec>(() => draft.spec);
  const [nSeeds, setNSeeds0] = useState(draft.nSeeds);
  const [seed0, setSeed00] = useState(draft.seed0);
  const [design, setDesign0] = useState<'fresh' | 'branch'>(draft.design);
  const setSpec = (s: ExperimentSpec) => { draft.spec = s; setSpec0(s); };
  const setNSeeds = (n: number) => { draft.nSeeds = n; setNSeeds0(n); };
  const setSeed0 = (n: number) => { draft.seed0 = n; setSeed00(n); };
  const setDesign = (d: 'fresh' | 'branch') => { draft.design = d; setDesign0(d); };
  const [threads, setThreads] = useState(pool.threads);
  const [busy, setBusy] = useState(false);
  const usePreset = (id: string) => { const s = PRESETS.find((x) => x.id === id)!.make(); setSpec(s); setNSeeds(s.seeds.length); };
  const setCond = (i: number, c: Condition) => setSpec({ ...spec, conditions: spec.conditions.map((x, j) => (j === i ? c : x)) });
  const runs = spec.conditions.length * nSeeds;
  const estYearMs = 140; // typical ms per simulated year for a default world on one core
  const estSec = (runs * spec.years * estYearMs) / 1000 / Math.max(1, threads);
  const start = async () => {
    setBusy(true);
    const full: ExperimentSpec = { ...spec, seeds: seedsFrom(seed0, nSeeds) };
    if (design === 'branch') { const s = await sim.save(); full.snapshot = s.data; full.name = `${spec.name} (branched from ${s.name}, year ${Math.floor(s.tick / 12)})`; }
    pool.threads = threads;
    pool.start(full);
    setBusy(false);
    onStarted();
  };
  return (
    <div className="designer">
      <div className="card">
        <h3>Start from a question</h3>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button key={p.id} className={`preset ${spec.name === p.make().name ? 'on' : ''}`} onClick={() => usePreset(p.id)}>
              <b>{p.name}</b><span className="small muted">{p.question}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>Design</h3>
        <div className="form-row">
          <label>Name <input value={spec.name} onChange={(e) => setSpec({ ...spec, name: e.target.value })} /></label>
          <label>Years per run <input type="number" min={10} max={2000} value={spec.years} onChange={(e) => setSpec({ ...spec, years: Math.max(10, +e.target.value) })} style={{ width: 80 }} /></label>
          <label>Seeds per condition <input type="number" min={2} max={200} value={nSeeds} onChange={(e) => setNSeeds(Math.max(2, +e.target.value))} style={{ width: 70 }} /></label>
          <label>First seed <input type="number" value={seed0} onChange={(e) => setSeed0(+e.target.value)} style={{ width: 80 }} /></label>
          <label>Sample every <input type="number" min={1} max={50} value={spec.sampleEvery} onChange={(e) => setSpec({ ...spec, sampleEvery: Math.max(1, +e.target.value) })} style={{ width: 60 }} /> years</label>
        </div>
        <div className="form-row">
          <label><input type="radio" checked={design === 'fresh'} onChange={() => setDesign('fresh')} /> Fresh worlds: each seed generates a new world; the same seeds are used in every condition</label>
        </div>
        <div className="form-row">
          <label><input type="radio" checked={design === 'branch'} onChange={() => setDesign('branch')} disabled={!st.ready} /> Branch from the current world (year {Math.floor((st.frame?.tick ?? 0) / 12)}): every run continues the world you are watching with a different random future. Intervention years count from now. Geography parameters have no effect when branching.</label>
        </div>
      </div>
      {spec.conditions.map((c, i) => (
        <ConditionEditor key={i} index={i} c={c} onChange={(x) => setCond(i, x)} onRemove={spec.conditions.length > 1 ? () => setSpec({ ...spec, conditions: spec.conditions.filter((_, j) => j !== i) }) : undefined} />
      ))}
      <div className="row">
        <button onClick={() => setSpec({ ...spec, conditions: [...spec.conditions, { name: `Condition ${spec.conditions.length + 1}`, over: {}, interventions: [] }] })}>+ Add condition</button>
        <span className="small muted">The first condition is the control that the others are compared with.</span>
      </div>
      <div className="card run-card">
        <div className="row">
          <div>
            <b>{runs} runs</b> × {spec.years} years on <select value={threads} onChange={(e) => setThreads(+e.target.value)}>{Array.from({ length: Math.max(1, (navigator.hardwareConcurrency || 4)) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select> background threads
            <div className="small muted">Rough estimate: {estSec < 90 ? `${Math.ceil(estSec)} seconds` : `${Math.ceil(estSec / 60)} minutes`} (depends on your computer and how large the worlds grow). You can keep using the app meanwhile. Fewer than 8 seeds per condition will only detect large effects.</div>
          </div>
          <span className="grow" />
          <button className="primary big" onClick={start} disabled={busy || (design === 'branch' && !st.ready)}>Run experiment</button>
        </div>
      </div>
    </div>
  );
}

function ConditionEditor({ index, c, onChange, onRemove }: { index: number; c: Condition; onChange: (c: Condition) => void; onRemove?: () => void }) {
  const keys = Object.keys(c.over) as (keyof WorldConfig)[];
  const unused = PARAMS.filter((p) => !keys.includes(p.key));
  const setOver = (k: keyof WorldConfig, v: number | undefined) => { const o = { ...c.over } as Record<string, unknown>; if (v === undefined) delete o[k]; else o[k] = v; onChange({ ...c, over: o as Partial<WorldConfig> }); };
  const setIv = (i: number, iv: Intervention | null) => onChange({ ...c, interventions: iv ? c.interventions.map((x, j) => (j === i ? iv : x)) : c.interventions.filter((_, j) => j !== i) });
  return (
    <div className="card condition">
      <div className="row">
        <i className="swatch" style={{ background: SERIES[index % SERIES.length] }} />
        <input className="cond-name" value={c.name} onChange={(e) => onChange({ ...c, name: e.target.value })} />
        {index === 0 && <span className="pill">control</span>}
        <span className="grow" />
        {onRemove && <button onClick={onRemove}>Remove</button>}
      </div>
      <div className="cond-grid">
        <div>
          <div className="mini-h">Parameters (different from default)</div>
          {keys.map((k) => {
            const p = PARAMS.find((x) => x.key === k);
            if (!p) return null;
            return (
              <div key={k} className="row param-inline" title={p.desc}>
                <span className="small">{p.label}</span>
                <input type="range" min={p.min} max={p.max} step={p.step} value={Number(c.over[k])} onChange={(e) => setOver(k, +e.target.value)} />
                <b className="small">{Number(c.over[k]).toFixed(p.integer ? 0 : 2)}</b>
                <button className="icon" onClick={() => setOver(k, undefined)} title="Remove">×</button>
              </div>
            );
          })}
          <select value="" onChange={(e) => { const p = PARAMS.find((x) => x.key === e.target.value); if (p) setOver(p.key, (p.min + p.max) / 2); }}>
            <option value="">+ Vary a parameter…</option>
            {unused.map((p) => <option key={p.key} value={p.key}>{p.group}: {p.label}</option>)}
          </select>
        </div>
        <div>
          <div className="mini-h">Interventions (year counted from the start of the run)</div>
          {c.interventions.map((iv, i) => (
            <div key={i} className="iv-row">
              <select value={iv.kind} onChange={(e) => setIv(i, { ...iv, kind: e.target.value as InterventionKind, label: INTERVENTION_KINDS.find((k) => k.kind === e.target.value)?.label })}>
                {INTERVENTION_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
              <label className="small">year <input type="number" value={iv.year} onChange={(e) => setIv(i, { ...iv, year: +e.target.value })} style={{ width: 60 }} /></label>
              <label className="small">magnitude <input type="number" step={0.1} value={iv.magnitude} onChange={(e) => setIv(i, { ...iv, magnitude: +e.target.value })} style={{ width: 60 }} /></label>
              <label className="small">years <input type="number" value={iv.duration ?? 3} onChange={(e) => setIv(i, { ...iv, duration: +e.target.value })} style={{ width: 50 }} /></label>
              <select value={String(iv.target ?? 'all')} onChange={(e) => setIv(i, { ...iv, target: e.target.value as 'all' })}>
                <option value="all">everywhere</option><option value="largest">largest settlement</option><option value="smallest">smallest settlement</option>
              </select>
              {iv.kind === 'grant_tech' && <TechPicker value={iv.tech ?? 'agriculture'} onChange={(k) => setIv(i, { ...iv, tech: k })} />}
              <button className="icon" onClick={() => setIv(i, null)} title="Remove">×</button>
            </div>
          ))}
          <button onClick={() => onChange({ ...c, interventions: [...c.interventions, { year: 50, kind: 'drought', magnitude: 0.6, duration: 5, target: 'all', label: 'Mega-drought' }] })}>+ Add intervention</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ results

const VERDICT_TEXT = { systematic: 'Systematic', suggestive: 'Suggestive', noise: 'Noise' } as const;
const pv = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3));
const f = (v: number) => (!isFinite(v) ? '—' : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

function Results({ e }: { e: ExpState }) {
  const [metric, setMetric] = useState('pop');
  const { spec, analysis: an } = e;
  const done = e.results.filter(Boolean).length;
  const elapsed = ((e.finished || Date.now()) - e.started) / 1000;
  const totalProg = e.progress.reduce((a, b) => a + b, 0) / Math.max(1, e.runs.length);
  const eta = totalProg > 0.02 && e.status === 'running' ? (elapsed / totalProg) * (1 - totalProg) : 0;
  const results = e.results.filter((r): r is NonNullable<typeof r> => !!r);
  const openRun = (cond: number, seed: number) => {
    const c = spec.conditions[cond];
    sim.create({ ...spec.base, ...c.over, seed, name: `${spec.name}: ${c.name}, seed ${seed}`, interventions: [...(spec.base.interventions ?? []), ...c.interventions] });
  };
  return (
    <div className="results">
      <div className="card">
        <div className="row">
          <h3>{spec.name}</h3>
          <span className="grow" />
          {e.status === 'running' && <button onClick={() => pool.cancel()}>Stop</button>}
          {an && <button onClick={() => downloadText(`${spec.name.replace(/\W+/g, '-')}-report.md`, renderReport(spec, an, results), 'text/markdown')}>Export report</button>}
          {an && <button onClick={() => downloadText(`${spec.name.replace(/\W+/g, '-')}-results.json`, JSON.stringify({ spec: { ...spec, snapshot: undefined }, results }))}>Export data</button>}
        </div>
        <div className="small muted">
          {e.status === 'running' ? `Running: ${done} of ${e.runs.length} runs finished · ${Math.round(elapsed)} s elapsed${eta ? ` · about ${eta < 90 ? `${Math.ceil(eta)} s` : `${Math.ceil(eta / 60)} min`} left` : ''}` :
            e.status === 'done' ? `Finished ${e.runs.length} runs in ${Math.round(elapsed)} s.` : `Stopped after ${done} runs; analysis uses the finished runs only.`}
          {e.errors.length > 0 && <span className="bad"> · {e.errors.length} run(s) failed: {e.errors[0]}</span>}
        </div>
        <div className="run-dots">
          {e.runs.map((r, i) => (
            <span key={i} className="run-dot" title={`${spec.conditions[r.condition].name}, seed ${r.seed}`} style={{ borderColor: SERIES[r.condition % SERIES.length] }}>
              <span style={{ height: `${e.progress[i] * 100}%`, background: SERIES[r.condition % SERIES.length] }} />
            </span>
          ))}
        </div>
      </div>
      {!an && e.status === 'running' && <div className="muted">Analysis appears when every run has finished.</div>}
      {an && (
        <>
          <div className="card findings">
            <h3>Findings</h3>
            <ul>{an.headline.map((h, i) => <li key={i}>{h}</li>)}</ul>
            {an.extinctions.some((x) => x > 0) && <div className="small bad">Extinctions: {an.extinctions.map((x, i) => `${spec.conditions[i].name} ${x}/${spec.seeds.length}`).join(', ')}</div>}
          </div>
          <div className="card">
            <div className="row">
              <h3>Trajectories</h3>
              <span className="grow" />
              <select value={metric} onChange={(ev) => setMetric(ev.target.value)}>{METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
            </div>
            <div className="small muted">Line: mean across seeds. Band: 10th to 90th percentile of runs, which shows the spread of possible histories.</div>
            {an.bands[metric] && (
              <LineChart height={260} x={an.bands[metric][0]?.years ?? []} xLabel="Year of run"
                pct={METRICS.find((m) => m.key === metric)?.fmt === 'pct'}
                series={an.bands[metric].map((b, i) => ({ name: spec.conditions[i].name, values: b.mean, lo: b.lo, hi: b.hi, color: SERIES[i % SERIES.length] }))} />
            )}
          </div>
          <div className="card">
            <h3>Outcomes at the end of the runs</h3>
            <div className="table-scroll">
              <table className="grid-table small">
                <thead>
                  <tr><th>Outcome</th>{spec.conditions.map((c, i) => <th key={i}><i className="swatch" style={{ background: SERIES[i % SERIES.length] }} />{c.name}<div className="muted">mean [95% CI]</div></th>)}
                    {spec.conditions.slice(1).map((c, i) => <th key={`v${i}`}>{c.name} vs control<div className="muted">d · p (adjusted) · verdict</div></th>)}
                    {spec.conditions.length === 1 && <th>Run-to-run variation</th>}</tr>
                </thead>
                <tbody>{an.metrics.map((m) => (
                  <tr key={m.key} className={m.key === metric ? 'sel' : ''} onClick={() => METRICS.some((x) => x.key === m.key) && setMetric(m.key)}>
                    <td>{m.label}</td>
                    {m.byCondition.map((s, i) => <td key={i}>{f(s.mean)} <span className="muted">[{f(s.ci[0])}, {f(s.ci[1])}]</span></td>)}
                    {m.vsControl.slice(1).map((v, i) => (
                      <td key={`v${i}`} title={`Difference ${f(v.diff)} (95% CI ${f(v.ciDiff[0])} to ${f(v.ciDiff[1])}). Welch t=${f(v.t)}, p=${pv(v.p)}. Mann–Whitney p=${pv(v.pU)}; probability a treated run exceeds a control run: ${(v.probSuperiority * 100).toFixed(0)}%. Runs per condition needed to detect this effect reliably: ${isFinite(m.runsNeeded[i + 1]) ? m.runsNeeded[i + 1] : '∞'}.`}>
                        {f(v.d)} · {pv(v.pAdj)} · <span className={`verdict ${v.verdict}`}>{VERDICT_TEXT[v.verdict]}</span>
                      </td>
                    ))}
                    {spec.conditions.length === 1 && <td>±{(m.cv * 100).toFixed(0)}%</td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="small muted">“Systematic”: the difference survives a Benjamini–Hochberg false-discovery correction across all outcomes (adjusted p &lt; 0.05) and is at least a medium effect (|Cohen's d| ≥ 0.5). “Suggestive”: unadjusted p &lt; 0.05 only. “Noise”: indistinguishable from run-to-run variation with this many seeds. Hover a cell for the confidence interval, the rank test and how many runs would be needed.</div>
          </div>
          {spec.conditions.length > 1 && an.divergence.some((d) => d.year !== null) && (
            <div className="card">
              <h3>When the histories diverge</h3>
              <ul className="small">{an.divergence.filter((d) => d.year !== null).map((d, i) => <li key={i}>{spec.conditions[d.condition].name}: {OUTCOME_LABELS[d.metric] ?? d.metric} differs from control from about year {d.year} of the run onward (p &lt; 0.05 at every later sample).</li>)}</ul>
            </div>
          )}
          <div className="card">
            <h3>What explains the differences between runs</h3>
            <div className="small muted">Spearman rank correlations across runs, within condition. Geography predictors are fixed when a world is generated; early predictors are measured at 20% of the run. Many pairs are tested, so a few weak correlations are expected by chance.</div>
            <table className="grid-table small">
              <thead><tr><th>Outcome</th><th>Predictor</th><th>ρ</th><th>p</th></tr></thead>
              <tbody>{an.predictors.filter((p) => p.p < 0.1).slice(0, 20).map((p, i) => (
                <tr key={i}><td>{OUTCOME_LABELS[p.outcome] ?? p.outcome}</td><td>{p.source === 'geography' ? FEATURE_LABELS[p.feature] ?? p.feature : `Early ${(OUTCOME_LABELS[p.feature] ?? p.feature).toLowerCase()}`}</td>
                  <td className={p.rho > 0 ? 'good' : 'bad'}>{p.rho.toFixed(2)}</td><td>{pv(p.p)}</td></tr>
              ))}</tbody>
            </table>
            {an.predictors.filter((p) => p.p < 0.1).length === 0 && <div className="muted small">No predictor reaches p &lt; 0.1. Run more seeds to look for weaker relationships.</div>}
          </div>
          <div className="card">
            <h3>Individual runs</h3>
            <div className="table-scroll">
              <table className="grid-table small">
                <thead><tr><th>Condition</th><th>Seed</th><th>Population</th><th>Peak</th><th>Settlements</th><th>Polities</th><th>Techs</th><th>Gini</th><th>Farming from</th><th>Time</th><th /></tr></thead>
                <tbody>{results.map((r, i) => (
                  <tr key={i}>
                    <td><i className="swatch" style={{ background: SERIES[r.condition % SERIES.length] }} />{spec.conditions[r.condition].name}</td>
                    <td>{r.seed}</td><td>{r.extinct ? <span className="bad">extinct (yr {r.extinctYear})</span> : r.final.pop}</td><td>{r.peakPop}</td><td>{r.final.settlements}</td><td>{r.final.polities}</td>
                    <td>{r.final.techs}</td><td>{f(r.final.gini)}</td><td>{r.firstFarming >= 0 ? `year ${r.firstFarming}` : 'never'}</td><td>{(r.wallMs / 1000).toFixed(0)} s</td>
                    <td>{!spec.snapshot && <button onClick={() => openRun(r.condition, r.seed)} title="Recreate this exact run as the world you are watching">Open as world</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
