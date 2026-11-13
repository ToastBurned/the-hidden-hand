# Experiments

## Designing an experiment

An experiment asks whether something changes how worlds turn out. It has:

- **Conditions.** The first is the *control*. Each condition can change any world parameter (the same ones as the
  New World dialog) and schedule interventions at given years.
- **Seeds.** Each seed is one independent world. With fresh worlds, the same seeds are used in every condition, so
  each condition sees the same set of geographies.
- **Years** per run and how often to **sample** the trajectories.

Use at least 8 seeds per condition. With 4 seeds only very large effects can be detected; with 16 to 30, moderate
ones. The results table says, for every outcome, how many runs would be needed to detect the observed effect.

**Branching** continues the world you are watching instead of generating new ones. Every run starts from the same
moment with a different random future, so the spread of outcomes shows how contingent history is from that point.
Intervention years then count from the branch point, and geography parameters have no effect.

## Reading the results

- **Mean [95% CI]**: the average outcome across seeds and the confidence interval of that average (t distribution).
- **d**: Cohen's d, the difference between the condition and the control in units of their pooled standard
  deviation. 0.2 is small, 0.5 medium, 0.8 large.
- **p (adjusted)**: Welch's t-test (which does not assume equal variances), adjusted with the Benjamini–Hochberg
  procedure across every outcome and condition tested. Testing 22 outcomes at once would otherwise produce about
  one false positive per experiment by chance.
- **Verdict**: *systematic* when the adjusted p < 0.05 and |d| ≥ 0.5; *suggestive* when only the unadjusted p < 0.05
  (worth more seeds); *noise* otherwise. Hover a cell for the Mann–Whitney U test (rank-based, robust to outliers and
  skew), the probability that a treated world beats a control world, and the confidence interval of the difference.
- **Trajectories**: the line is the mean across seeds, the band the 10th to 90th percentile of individual runs. Wide
  bands mean history is contingent; bands that separate mean the condition dominates chance.
- **When histories diverge**: the first sampled year after which the condition differs from control (p < 0.05) at
  every later sample.
- **What explains the differences**: Spearman rank correlations between outcomes and (a) each world's geography
  (land area, arable share, fertility, forests, game, ore, rivers, coasts, landmass fragmentation, spacing of founding
  bands) and (b) the world's state at 20% of the run. Correlations are computed within condition, so they describe
  run-to-run variation rather than the treatment. They are associations: geography is fixed before history starts,
  so geography correlations are plausibly causal; early-state correlations show path dependence.
- **Run-to-run variation**: the coefficient of variation of each outcome within the control. It is the noise floor
  against which any effect must be judged.

The validation battery (`npm run validate`) checks this machinery: an A/A test comparing two independent groups of
worlds under identical settings must call every outcome noise, and a severe drought must be detected as a
systematic fall in population that begins when the drought does.

## Command line and experiment files

```bat
npm run experiment -- --preset aggression --seeds 16 --years 250 --threads 6
npm run experiment -- --spec experiments\my-question.json
```

Results go to `tools/out/exp-<name>/` (`report.md` and `results.json`). An experiment file looks like this:

```json
{
  "name": "Irrigation granted early",
  "years": 200,
  "seeds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  "sampleEvery": 10,
  "base": { "aridity": 1.4 },
  "conditions": [
    { "name": "Control", "over": {}, "interventions": [] },
    { "name": "Irrigation at year 40", "over": {},
      "interventions": [{ "year": 40, "kind": "grant_tech", "tech": "irrigation", "magnitude": 1, "target": "all" }] }
  ]
}
```

Intervention kinds: `drought`, `plague`, `volcanic_winter`, `climate_shift`, `grant_tech`, `bounty`,
`migration_wave`, `cultural_shock`. Each takes `year`, `magnitude`, optional `duration` (years), `target`
(`"all"`, `"largest"`, `"smallest"` or a settlement id), and for some kinds `tech` or `axis` (0 innovation,
1 individualism, 2 piety, 3 militarism, 4 hierarchy). Parameters are listed in `src/engine/config.ts` with their
ranges and meanings.
