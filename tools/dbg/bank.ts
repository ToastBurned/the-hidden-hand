import { Simulation } from '../../src/engine/sim';
const sim = Simulation.create({ seed: 2 });
sim.runYears(280, (s) => {
  if (s.year % 20 === 0) for (const x of s.w.settlements.values()) if (x.bank) console.log(s.year, x.name, 'pop', x.pop, 'res', x.bank.reserves.toFixed(0), 'dep', x.bank.deposits.toFixed(0), 'loans', x.bank.loans.toFixed(0), 'state', x.bank.stateLoans.toFixed(0), 'fail', x.bank.failures, 'debtShare', (x.ctx.debtShare ?? 0).toFixed(2));
});
for (const e of sim.w.events.filter((e) => e.type === 'bank_failure' || e.type === 'debt_crisis' || e.type === 'loan').slice(0, 10)) console.log(Math.floor(e.t / 12), e.text, '|', e.why);
