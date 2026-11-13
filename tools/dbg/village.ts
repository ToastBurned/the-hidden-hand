import { Simulation } from '../../src/engine/sim';
import { OCC_NAMES, G_FOOD, BLD_NAMES } from '../../src/engine/constants';
import { TECHS } from '../../src/engine/techs';
const sim = Simulation.create({ seed: Number(process.argv[3] ?? 1) });
const w = sim.w;
const Y = Number(process.argv[2] ?? 200);
sim.runYears(Y);
const t = w.tiles;
for (const s of [...w.settlements.values()].filter(s => s.alive).sort((a, b) => b.pop - a.pop).slice(0, 6)) {
  let food = 0, money = 0; for (const hid of s.households) { const h = w.households.get(hid)!; food += h.goods[G_FOOD]; money += h.money; }
  let fl = 0, fert = 0, fb = 0, irr = 0; for (const i of s.territory) if (t.farmland[i] > 0) { fl += t.farmland[i]; fert += t.fert[i] * t.farmland[i]; fb += t.fertBase[i] * t.farmland[i]; irr += t.irrigated[i]; }
  const fx = sim.fx(s.id);
  console.log(`${s.name} pop ${s.pop} nomad ${s.nomadic} ratio ${s.foodRatio.toFixed(2)} hunger ${s.hungerShare.toFixed(2)} food ${food.toFixed(0)} gran ${s.granary.toFixed(0)} money ${money.toFixed(0)} terr ${s.territory.length} r${s.radius}`);
  console.log(`   farmland ${fl.toFixed(2)} fert ${(fert / Math.max(1e-6, fl)).toFixed(2)}/${(fb / Math.max(1e-6, fl)).toFixed(2)} irr ${irr} farmArea ${fx.farmArea.toFixed(2)} yield ${fx.farmYield.toFixed(2)} foodProd/mo ${s.foodProd.toFixed(0)} prices ${s.market.price.map(x => x.toFixed(2)).join('/')}`);
  console.log(`   workers ${s.workers.map((n, i) => n ? OCC_NAMES[i].slice(0, 4) + ':' + n : '').filter(Boolean).join(' ')} yld ${s.yieldRaw.map(x => x.toFixed(2)).join(',')}`);
  console.log(`   bld ${s.buildings.map((b, i) => b > 0.05 ? BLD_NAMES[i] + ':' + b.toFixed(1) : '').filter(Boolean).join(' ')} unrest ${s.unrest.toFixed(2)} techs ${s.techs.map((v, i) => v ? TECHS[i].key : '').filter(Boolean).join(',')}`);
}
