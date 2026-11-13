import { useMemo, useRef, useState } from 'react';
import { SERIES } from '../colors';

export interface Series { name: string; values: number[]; color?: string; lo?: number[]; hi?: number[]; dashed?: boolean }

const niceTicks = (lo: number, hi: number, n = 4) => {
  if (!(hi > lo)) return [lo];
  const step0 = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
};
const fmtAxis = (v: number, pct?: boolean) => {
  if (pct) return `${Math.round(v * 100)}%`;
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  if (a >= 10 || v === 0) return v.toFixed(0);
  return v.toFixed(a >= 1 ? 1 : 2);
};

/** Multi-series line chart with optional uncertainty bands, crosshair and tooltip. */
export function LineChart(props: {
  x: number[]; series: Series[]; height?: number; title?: string; pct?: boolean; xLabel?: string; zeroBased?: boolean;
  markers?: { x: number; label: string }[]; onClickX?: (x: number) => void;
}) {
  const { x, series } = props;
  const H = props.height ?? 180;
  const [W, setW] = useState(520);
  const ref = useRef<HTMLDivElement | null>(null);
  const [hi, setHi] = useState<number | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const setRef = (el: HTMLDivElement | null) => {
    ref.current = el;
    ro.current?.disconnect();
    if (el) { ro.current = new ResizeObserver(() => setW(el.clientWidth)); ro.current.observe(el); setW(el.clientWidth); }
  };
  const M = { l: 44, r: 12, t: 8, b: 22 };
  const { ylo, yhi, xlo, xhi } = useMemo(() => {
    let lo = Infinity, hiV = -Infinity;
    for (const s of series) for (let i = 0; i < s.values.length; i++) {
      const vals = [s.values[i], s.lo?.[i], s.hi?.[i]];
      for (const v of vals) if (v !== undefined && isFinite(v)) { lo = Math.min(lo, v); hiV = Math.max(hiV, v); }
    }
    if (!isFinite(lo)) { lo = 0; hiV = 1; }
    if (props.zeroBased !== false && lo > 0) lo = 0;
    if (hiV === lo) hiV = lo + 1;
    const pad = (hiV - lo) * 0.06;
    return { ylo: lo, yhi: hiV + pad, xlo: x[0] ?? 0, xhi: x[x.length - 1] ?? 1 };
  }, [series, x, props.zeroBased]);
  const pw = Math.max(10, W - M.l - M.r);
  const ph = H - M.t - M.b;
  const sx = (v: number) => M.l + (xhi > xlo ? ((v - xlo) / (xhi - xlo)) * pw : pw / 2);
  const sy = (v: number) => M.t + ph - ((v - ylo) / (yhi - ylo)) * ph;
  const path = (vals: number[]) => {
    let d = '';
    let pen = false;
    for (let i = 0; i < vals.length && i < x.length; i++) {
      const v = vals[i];
      if (!isFinite(v)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const band = (lo: number[], hiA: number[]) => {
    const pts: string[] = [];
    for (let i = 0; i < x.length; i++) if (isFinite(hiA[i])) pts.push(`${sx(x[i]).toFixed(1)},${sy(hiA[i]).toFixed(1)}`);
    for (let i = x.length - 1; i >= 0; i--) if (isFinite(lo[i])) pts.push(`${sx(x[i]).toFixed(1)},${sy(lo[i]).toFixed(1)}`);
    return pts.length ? `M${pts.join('L')}Z` : '';
  };
  const yt = niceTicks(ylo, yhi);
  const xt = niceTicks(xlo, xhi, Math.max(2, Math.floor(pw / 90)));
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0, bd = Infinity;
    for (let i = 0; i < x.length; i++) { const d = Math.abs(sx(x[i]) - px); if (d < bd) { bd = d; best = i; } }
    setHi(x.length ? best : null);
  };
  const color = (s: Series, i: number) => s.color ?? SERIES[i % SERIES.length];
  const legend = series.length > 1;
  return (
    <div className="chart" ref={setRef}>
      {props.title && <div className="chart-title">{props.title}</div>}
      {legend && (
        <div className="chart-legend">
          {series.map((s, i) => <span key={s.name}><i style={{ background: color(s, i) }} />{s.name}</span>)}
        </div>
      )}
      <svg width={W} height={H} onPointerMove={onMove} onPointerLeave={() => setHi(null)} onClick={() => hi !== null && props.onClickX?.(x[hi])} role="img" aria-label={props.title}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={M.l + pw} y1={sy(v)} y2={sy(v)} className="grid" />
            <text x={M.l - 6} y={sy(v) + 4} textAnchor="end" className="axis">{fmtAxis(v, props.pct)}</text>
          </g>
        ))}
        {xt.map((v) => <text key={v} x={sx(v)} y={H - 6} textAnchor="middle" className="axis">{fmtAxis(v)}</text>)}
        {props.markers?.map((m, i) => (
          <g key={i}>
            <line x1={sx(m.x)} x2={sx(m.x)} y1={M.t} y2={M.t + ph} className="marker" />
            <text x={sx(m.x) + 3} y={M.t + 10} className="axis">{m.label}</text>
          </g>
        ))}
        {series.map((s, i) => s.lo && s.hi ? <path key={`b${i}`} d={band(s.lo, s.hi)} fill={color(s, i)} opacity={0.16} /> : null)}
        {series.map((s, i) => <path key={i} d={path(s.values)} fill="none" stroke={color(s, i)} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} strokeLinejoin="round" />)}
        {hi !== null && x[hi] !== undefined && (
          <g>
            <line x1={sx(x[hi])} x2={sx(x[hi])} y1={M.t} y2={M.t + ph} className="crosshair" />
            {series.map((s, i) => isFinite(s.values[hi]) ? <circle key={i} cx={sx(x[hi])} cy={sy(s.values[hi])} r={4} fill={color(s, i)} stroke="var(--bg-1)" strokeWidth={2} /> : null)}
          </g>
        )}
      </svg>
      {hi !== null && x[hi] !== undefined && (
        <div className="chart-tip" style={{ left: Math.min(sx(x[hi]) + 10, W - 170) }}>
          <div className="muted">{props.xLabel ?? 'Year'} {x[hi]}</div>
          {series.map((s, i) => (
            <div key={i}><i style={{ background: color(s, i) }} />{series.length > 1 ? `${s.name}: ` : ''}<b>{fmtAxis(s.values[hi], props.pct)}</b>
              {s.lo && s.hi && isFinite(s.lo[hi]) ? <span className="muted"> ({fmtAxis(s.lo[hi], props.pct)}–{fmtAxis(s.hi[hi], props.pct)})</span> : null}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for a small categorical breakdown. */
export function Bars(props: { items: { label: string; value: number; color?: string }[]; fmt?: (v: number) => string; max?: number }) {
  const max = props.max ?? Math.max(1e-9, ...props.items.map((i) => i.value));
  return (
    <div className="bars">
      {props.items.map((it, i) => (
        <div key={it.label + i} className="bar-row" title={`${it.label}: ${props.fmt ? props.fmt(it.value) : it.value}`}>
          <span className="bar-label">{it.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(0, (it.value / max) * 100)}%`, background: it.color ?? 'var(--accent)' }} /></span>
          <span className="bar-val">{props.fmt ? props.fmt(it.value) : it.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Tiny sparkline. */
export function Spark(props: { values: number[]; w?: number; h?: number; color?: string }) {
  const w = props.w ?? 80, h = props.h ?? 22;
  const v = props.values.filter(isFinite);
  if (v.length < 2) return <svg width={w} height={h} />;
  const lo = Math.min(...v), hiV = Math.max(...v);
  const d = v.map((y, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((y - lo) / (hiV - lo || 1)) * (h - 4)).toFixed(1)}`).join('');
  return <svg width={w} height={h}><path d={d} fill="none" stroke={props.color ?? 'var(--accent)'} strokeWidth={1.5} /></svg>;
}
