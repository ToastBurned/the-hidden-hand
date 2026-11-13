import { useEffect, useRef } from 'react';
import { useSim } from '../hooks';
import type { settlementDetail } from '../../engine/query';
import { drawCity, planCity, siteOf, type CityInput } from '../art/city';

type SD = NonNullable<ReturnType<typeof settlementDetail>>;
const NAMES = ['Housing', 'Granary', 'Walls', 'Temple', 'School', 'Market', 'Workshops', 'Harbour', 'Irrigation', 'Roads', 'Aqueduct'];

export function cityInputFrom(d: SD, site: CityInput['site']): CityInput {
  const bld = new Array(11).fill(0);
  for (const b of d.buildings) { const i = NAMES.indexOf(b.name); if (i >= 0) bld[i] = b.level; }
  return { id: d.id, pop: d.pop, nomadic: d.nomadic, era: d.era, bld, dmg: d.warDamage, sieged: d.sieged, food: d.foodRatio, hue: d.hue, month: d.month, capital: !!d.polity?.capital, site };
}

/** A still picture of a settlement for the inspector. */
export function TownThumb({ d }: { d: SD }) {
  const { map } = useSim();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !map) return;
    const W = c.clientWidth || 360, H = c.clientHeight || 150;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d')!;
    const inp = cityInputFrom(d, siteOf(map, d.x, d.y));
    const plan = planCity(inp);
    const R = Math.max(plan.radius, inp.bld[2] >= 0.5 ? plan.wallR : 0) + 12;
    const z = Math.min(W / (R * 1.6), H / (R * 1.25)) * 1.15;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(W / 2, H / 2);
    g.scale(z, z);
    drawCity(g, plan, inp, { t: 0, scale: z, detail: Math.min(1, z / 2), animate: false });
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vg = g.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0.55, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }, [d.id, d.pop, d.era, d.buildings.length, d.warDamage, d.sieged, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="town-thumb" />;
}
