import { useEffect, useState, useSyncExternalStore } from 'react';
import { sim, type SimState } from './client';
import type { QueryKind } from '../worker/protocol';

export function useSim(): SimState {
  return useSyncExternalStore(sim.subscribe, sim.getState);
}

/** Query the worker, re-running when deps change and (optionally) whenever the simulation advances by `refreshMonths`. */
export function useQuery<T>(kind: QueryKind, arg: unknown, refreshMonths = 3): { data: T | null; loading: boolean } {
  const st = useSim();
  const tick = st.frame?.tick ?? 0;
  const bucket = refreshMonths > 0 ? Math.floor(tick / refreshMonths) : 0;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(arg);
  useEffect(() => {
    let live = true;
    setLoading(true);
    sim.query<T>(kind, arg).then((d) => { if (live) { setData(d); setLoading(false); } });
    return () => { live = false; };
  }, [kind, key, bucket, st.version]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading };
}

export const fmtNum = (v: number, d = 1) => {
  if (v === undefined || v === null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(d);
  return v.toFixed(Math.max(d, 2));
};
export const fmtPct = (v: number) => (isFinite(v) ? `${(v * 100).toFixed(0)}%` : '—');
export const yearOf = (t: number) => Math.floor(t / 12);
