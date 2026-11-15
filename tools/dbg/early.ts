import { Simulation } from '../../src/engine/sim';
import { OCC_NAMES, G_FOOD } from '../../src/engine/constants';
const sim = Simulation.create({ seed: 1 });
const w = sim.w;
for (let m = 0; m < 30; m++) {
  sim.step();
  const s = [...w.settlements.values()].filter(s=>s.alive).sort((a,b)=>b.pop-a.pop)[0];
  let food = 0; for (const hid of s.households) food += w.households.get(hid)!.goods[G_FOOD];
  const occ = s.workers.map((n,i)=>n?`${OCC_NAMES[i].slice(0,4)}:${n}`:'').filter(Boolean).join(' ');
  const t = w.tiles; let g=0,gc=0; for (const i of s.territory){g+=t.game[i];gc+=t.gameCap[i];}
  console.log(`m${w.tick} totalpop ${w.persons.size} | ${s.name} pop ${s.pop} food ${food.toFixed(0)} gran ${s.granary.toFixed(0)} ratio ${s.foodRatio.toFixed(2)} price ${s.market.price.map(x=>x.toFixed(2)).join('/')} yld ${s.yieldRaw.map(x=>x.toFixed(2)).join(',')} game ${g.toFixed(0)}/${gc.toFixed(0)} terr ${s.territory.length} | ${occ}`);
}
