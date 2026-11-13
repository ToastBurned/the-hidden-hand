import type { Analysis, ExperimentSpec, RunResult } from './experiment';
import { FEATURE_LABELS, OUTCOME_LABELS } from './experiment';

const f = (v: number, d = 2) => (!isFinite(v) ? '—' : Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(d));
const pv = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3));

/** A Markdown report of an experiment, for the CLI and for export from the UI. */
export function renderReport(spec: ExperimentSpec, an: Analysis, results: RunResult[]): string {
  const L: string[] = [];
  L.push(`# Experiment: ${spec.name}`, '');
  L.push(`${spec.conditions.length} condition(s) × ${spec.seeds.length} seeds = ${results.length} runs, ${spec.years} simulated years each${spec.snapshot ? ', all branched from the same saved world' : ', seeds paired across conditions'}.`, '');
  L.push('## Conditions', '');
  spec.conditions.forEach((c, i) => {
    const over = Object.entries(c.over).map(([k, v]) => `${k}=${v}`).join(', ');
    const ivs = c.interventions.map((iv) => `${iv.label ?? iv.kind} (year ${iv.year}, magnitude ${iv.magnitude})`).join('; ');
    L.push(`${i + 1}. **${c.name}**${over ? ` — ${over}` : ''}${ivs ? ` — interventions: ${ivs}` : ''}${an.extinctions[i] ? ` — ${an.extinctions[i]} run(s) went extinct` : ''}`);
  });
  L.push('', '## Findings', '');
  for (const h of an.headline) L.push(`- ${h}`);
  L.push('', '## Outcomes at the end of the run', '');
  const head = ['Outcome', ...spec.conditions.map((c) => `${c.name} mean [95% CI]`)];
  if (spec.conditions.length > 1) head.push(...spec.conditions.slice(1).map((c) => `${c.name}: d, p(adj), verdict`));
  L.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`);
  for (const m of an.metrics) {
    const row = [m.label, ...m.byCondition.map((s) => `${f(s.mean)} [${f(s.ci[0])}, ${f(s.ci[1])}]`)];
    for (let c = 1; c < m.vsControl.length; c++) { const v = m.vsControl[c]; row.push(`${f(v.d)}, ${pv(v.pAdj)}, ${v.verdict}`); }
    L.push(`| ${row.join(' | ')} |`);
  }
  L.push('', 'Verdicts: *systematic* means the Benjamini–Hochberg-adjusted Welch p < 0.05 and |Cohen\'s d| ≥ 0.5; *suggestive* means an unadjusted p < 0.05; *noise* otherwise. With few seeds, small real effects will read as noise: the analysis gives the number of runs that would be needed.', '');
  if (spec.conditions.length > 1) {
    L.push('## When conditions diverge', '');
    for (const d of an.divergence) if (d.year !== null) L.push(`- ${spec.conditions[d.condition].name}: ${OUTCOME_LABELS[d.metric] ?? d.metric} differs from control from about year ${d.year} of the run onwards.`);
    L.push('');
  }
  L.push('## What explains differences between runs', '');
  L.push('Spearman rank correlations, computed within condition (values centred by condition mean), between end-state outcomes and either the world\'s initial geography or the state of the world at 20% of the run.', '');
  L.push('| Outcome | Predictor | Source | ρ | p | n |', '| --- | --- | --- | --- | --- | --- |');
  for (const p of an.predictors.slice(0, 25)) {
    L.push(`| ${OUTCOME_LABELS[p.outcome] ?? p.outcome} | ${p.source === 'geography' ? FEATURE_LABELS[p.feature] ?? p.feature : `Early ${OUTCOME_LABELS[p.feature] ?? p.feature}`} | ${p.source} | ${f(p.rho)} | ${pv(p.p)} | ${p.n} |`);
  }
  L.push('', 'These are correlations across a modest number of runs. Many pairs are tested, so expect about one in twenty to reach p < 0.05 by chance.', '');
  L.push('## Individual runs', '', '| Condition | Seed | Pop | Peak | Settlements | Polities | Techs | Gini | War deaths/yr | Extinct |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    L.push(`| ${spec.conditions[r.condition].name} | ${r.seed} | ${r.final.pop} | ${r.peakPop} | ${r.final.settlements} | ${r.final.polities} | ${r.final.techs} | ${f(r.final.gini)} | ${f(r.final.warDeaths)} | ${r.extinct ? `year ${r.extinctYear}` : 'no'} |`);
  }
  return L.join('\n') + '\n';
}
