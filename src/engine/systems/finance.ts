/**
 * Credit and debt. Once a town has coinage, a market and merchants, moneylenders start taking
 * deposits and making loans: a bank. Households with spare money deposit it and earn interest;
 * households short of food or tools borrow. The state borrows in wartime. Debts that cannot be
 * serviced are defaulted on, which can break the bank and cost depositors their savings.
 *
 * Bank reserves are real money and are counted in the money supply. Deposits and debts are
 * claims: they are created and extinguished without creating or destroying money.
 */
import { BLD_MARKET, G_FOOD, O_MERCHANT } from '../constants';
import { clamp, type Ctx } from '../context';
import { householdSize } from '../entities';
import { logEvent } from '../history';
import type { Bank, Household, Polity, Settlement } from '../types';

/** Annual interest on loans under a polity's law. */
export function loanRate(pol: Polity | undefined): number {
  return pol?.laws?.debt === 'limits' ? 0.1 : 0.22;
}

/** Under debt bondage defaulters work off what they owe, so lenders lose less and lend more readily. */
function bondage(pol: Polity | undefined): boolean {
  return pol?.laws?.debt === 'harsh';
}

/** Cash a bank may still lend: it keeps a third of its deposits in hand and lends at most 60% of them. */
function lendable(b: Bank): number {
  return Math.max(0, Math.min(b.reserves - 0.35 * b.deposits, 0.6 * b.deposits - b.loans - b.stateLoans));
}

function recount(c: Ctx, s: Settlement, b: Bank): Household[] {
  const hhs: Household[] = [];
  let dep = 0;
  let loans = 0;
  for (const hid of s.households) {
    const h = c.w.households.get(hid);
    if (!h) continue;
    hhs.push(h);
    dep += h.deposit ?? 0;
    loans += h.debt ?? 0;
  }
  b.deposits = dep;
  b.loans = loans;
  return hhs;
}

/** Yearly: banks are founded where trade is busy enough to need them. */
export function bankingYear(c: Ctx, s: Settlement): void {
  const w = c.w;
  if (!s.alive || s.bank) return;
  if (!c.fx(s.id).currency || s.buildings[BLD_MARKET] < 0.5 || s.pop < 400 || s.workers[O_MERCHANT] < 3) return;
  if (s.ctx.bankClosedAt !== undefined && w.tick - s.ctx.bankClosedAt < 12 * 25) return; // trust takes a generation to return
  if (!c.rng.chance(0.08 + Math.min(0.2, s.tradeVol / 4000))) return;
  s.bank = { founded: w.tick, reserves: 0, deposits: 0, loans: 0, stateLoans: 0, failures: 0 };
  s.ctx.bank = logEvent(w, {
    type: 'bank', imp: 3, text: `Moneylenders in ${s.name} began to take deposits and lend at interest.`, x: s.x, y: s.y, settlements: [s.id], polities: [s.polity],
    causes: [s.ctx.currency ?? -1],
    why: `${s.name} had coinage, a market and ${Math.round(s.workers[O_MERCHANT])} merchants whose trade needed credit.`,
  });
}

/** Monthly banking in one settlement: deposits, withdrawals, loans, interest, defaults. */
export function bankMonth(c: Ctx, s: Settlement): void {
  const w = c.w;
  const b = s.bank;
  if (!b) return;
  const pol = w.polities.get(s.polity);
  const hhs = recount(c, s, b);
  const pf = s.market.price[G_FOOD];
  const rate = loanRate(pol) / 12;
  let interestIn = 0;
  let wanted = 0;
  let refused = 0;
  let indebted = 0;
  let heads = 0;
  let defaults = 0;
  let defaulted = 0;
  for (const h of hhs) {
    const size = householdSize(w, h);
    if (size <= 0) continue;
    heads += size;
    const monthly = size * pf; // a month's food at current prices
    h.deposit = h.deposit ?? 0;
    h.debt = h.debt ?? 0;
    // --- service existing debt
    if (h.debt > 0) {
      const interest = h.debt * rate;
      const due = interest + h.debt * 0.03;
      const pay = Math.min(due, Math.max(0, h.money - monthly * 0.5) * 0.5, h.debt + interest);
      h.money -= pay;
      b.reserves += pay;
      interestIn += Math.min(pay, interest);
      h.debt += interest - pay;
      if (h.debt < 0.01) h.debt = 0;
      if (h.debt > monthly * 6) indebted += size;
      // hopeless debts are defaulted on
      if (h.debt > monthly * 12 && h.money < monthly) {
        if (bondage(pol)) {
          // bonded debtors keep paying from their labour: half the debt is recovered over time, at great cost in misery
          const recovered = Math.min(h.debt * 0.5, Math.max(0, h.money) + h.goods[G_FOOD] * pf * 0.5);
          const fromFood = Math.max(0, recovered - Math.max(0, h.money));
          h.money -= recovered - fromFood;
          h.goods[G_FOOD] -= fromFood / pf;
          b.reserves += recovered;
          s.ctx.bonded = (s.ctx.bonded ?? 0) + size;
          for (const id of h.members) { const p = w.persons.get(id); if (p) p.happiness = Math.max(0, p.happiness - 0.25); }
        }
        defaults += h.debt;
        defaulted += size;
        h.debt = 0;
      }
    }
    // --- deposits and withdrawals
    const comfortable = monthly * 4;
    if (h.debt <= 0 && h.money > comfortable && h.deposit < monthly * 24) {
      const d = Math.min((h.money - comfortable) * 0.06, monthly * 24 - h.deposit);
      h.money -= d;
      h.deposit += d;
      b.reserves += d;
    } else if (h.deposit > 0 && h.money < monthly * 1.5) {
      const want = Math.min(h.deposit, monthly * 2 - h.money);
      const got = Math.min(want, b.reserves);
      wanted += want;
      refused += want - got;
      h.deposit -= got;
      h.money += got;
      b.reserves -= got;
    }
    // --- borrowing: to eat through a bad season, against land or a working income as security
    const security = h.land * 40 * pf + h.income * 6;
    if (h.deposit <= 0 && h.money < monthly && (h.hunger > 0.08 || h.goods[G_FOOD] < size * 0.8) && h.debt < Math.min(monthly * 5, security * 0.5)) {
      const want = Math.min(monthly * 2, security * 0.5 - h.debt);
      const got = Math.min(want, lendable(b));
      if (got > 0.01) {
        b.reserves -= got;
        h.money += got;
        h.debt += got;
      }
    }
  }
  // interest earned is shared with depositors
  recount(c, s, b);
  if (interestIn > 0 && b.deposits > 0) {
    const k = 1 + (interestIn * 0.7) / b.deposits;
    for (const h of hhs) if (h.deposit) h.deposit *= k;
    b.deposits *= k;
  }
  s.ctx.debtShare = heads ? indebted / heads : 0;
  if (defaults > 0) {
    s.ctx.defaultsAt = w.tick;
    if (defaulted > heads * 0.1 && (s.ctx.defaultWaveAt ?? -999) < w.tick - 60) {
      s.ctx.defaultWaveAt = w.tick;
      s.ctx.defaultWave = logEvent(w, {
        type: 'debt_crisis', imp: 3, text: `A wave of debtors in ${s.name} could not repay what they owed.`, x: s.x, y: s.y, settlements: [s.id], polities: [s.polity],
        causes: [s.ctx.famine ?? -1, s.ctx.blockade ?? -1, s.ctx.sacked ?? -1],
        why: `Households of ${Math.round(defaulted)} people defaulted on ${defaults.toFixed(0)} in loans after hunger and falling incomes left them unable to pay interest of ${Math.round(loanRate(pol) * 100)}% a year.`,
      });
    }
  }
  // --- solvency: a run (withdrawals refused) or losses beyond the bank's cushion break it
  const assets = b.reserves + b.loans + b.stateLoans;
  const run = wanted > 0 && refused > wanted * 0.4 && refused > b.deposits * 0.02;
  if (b.deposits > 1 && (assets < b.deposits * 0.85 || run)) failBank(c, s, b, hhs, run ? 'depositors found it could not pay them out' : 'its losses on bad loans exceeded what it held');
}

/** A failed bank pays its depositors what cash it has; the rest of their savings is gone. */
export function failBank(c: Ctx, s: Settlement, b: Bank, hhs: Household[], reason: string, cause = -1): void {
  const w = c.w;
  const pol = w.polities.get(s.polity);
  const deposits = b.deposits;
  if (deposits <= 0) return;
  const pay = Math.min(b.reserves, deposits);
  const frac = pay / deposits;
  let hit = 0;
  for (const h of hhs) {
    const d = h.deposit ?? 0;
    if (d <= 0) continue;
    h.money += d * frac;
    h.deposit = 0;
    hit += householdSize(w, h);
  }
  b.reserves -= pay;
  b.deposits = 0;
  b.failures++;
  // the bank closes: what it still held goes to its owners in the town, and its loan book dies with it
  let owed = 0;
  for (const h of hhs) { owed += h.debt ?? 0; h.debt = 0; }
  if (b.reserves > 0 && hhs.length) { for (const h of hhs) h.money += b.reserves / hhs.length; b.reserves = 0; }
  if (pol && (pol.debt ?? 0) > 0 && pol.ctx.creditor === s.id) pol.debt = 0;
  s.bank = undefined;
  s.ctx.bankClosedAt = w.tick;
  const ev = logEvent(w, {
    type: 'bank_failure', imp: 4, text: `The bank of ${s.name} failed; depositors recovered ${Math.round(frac * 100)}% of their savings.`, x: s.x, y: s.y,
    settlements: [s.id], polities: [s.polity], causes: [cause, s.ctx.defaultWave ?? -1, pol?.ctx.default ?? -1, s.ctx.sacked ?? -1],
    why: `${reason[0].toUpperCase() + reason.slice(1)}. Savings of households of ${Math.round(hit)} people were ${frac > 0.95 ? 'repaid' : 'partly lost'}; ${owed.toFixed(0)} in loans owed to it were never collected.`,
  });
  s.ctx.bankFailure = ev;
  s.ctx.bankFailureAt = w.tick;
  s.unrest = clamp(s.unrest + 0.25 * (1 - frac));
  if (pol) pol.legitimacy = clamp(pol.legitimacy - 0.08 * (1 - frac));
}

/** Yearly state finance: war loans, interest, repayment and default. */
export function stateDebtYear(c: Ctx, pol: Polity): void {
  const w = c.w;
  if (!pol.alive) return;
  pol.debt = pol.debt ?? 0;
  // the realm borrows from the richest bank it controls
  let cap = w.settlements.get(pol.capital);
  for (const sid of pol.settlements) {
    const s = w.settlements.get(sid);
    if (s?.bank && (!cap?.bank || s.bank.reserves > cap.bank.reserves)) cap = s;
  }
  if (pol.debt > 0 && pol.ctx.creditor !== undefined) { const cr = w.settlements.get(pol.ctx.creditor); if (cr?.bank && cr.polity === pol.id) cap = cr; }
  const b = cap?.bank;
  const revenue = Math.max(1, pol.lastRevenue ?? pol.revenue ?? 1);
  if (pol.debt > 0) {
    if (!b || !cap) { pol.debt = 0; return; } // the creditor is gone
    const interest = pol.debt * 0.12;
    const due = interest + pol.debt * 0.1;
    const pay = Math.min(due, Math.max(0, pol.treasury) * 0.6);
    pol.treasury -= pay;
    pol.spending += pay;
    b.reserves += pay;
    pol.debt += interest - pay;
    b.stateLoans = pol.debt;
    pol.ctx.debtArrears = pay < interest * 0.5 ? (pol.ctx.debtArrears ?? 0) + 1 : 0;
    if (pol.debt > revenue * 4 || (pol.ctx.debtArrears ?? 0) >= 4) {
      const owed = pol.debt;
      pol.debt = 0;
      b.stateLoans = 0;
      pol.ctx.debtArrears = 0;
      pol.ctx.defaultAt = w.tick;
      pol.ctx.default = logEvent(w, {
        type: 'default', imp: 4, text: `${pol.name} repudiated its debts.`, x: cap.x, y: cap.y, polities: [pol.id], settlements: [cap.id],
        causes: [pol.ctx.lastDefeat ?? -1, pol.ctx.warLoan ?? -1],
        why: `It owed ${owed.toFixed(0)} to the bank of ${cap.name}, about ${(owed / revenue).toFixed(1)} years of revenue, and could no longer pay the interest.`,
      });
      pol.legitimacy = clamp(pol.legitimacy - 0.12);
      const hhs = recount(c, cap, b);
      if (b.reserves + b.loans < b.deposits * 0.85) failBank(c, cap, b, hhs, `${pol.name} defaulted on what it had borrowed`, pol.ctx.default);
    }
    return;
  }
  // borrow for war when the treasury cannot pay the army
  const atWar = Object.values(pol.relations).some((r) => r.war >= 0);
  if (!atWar || !b || !cap) return;
  if (pol.ctx.defaultAt !== undefined && w.tick - pol.ctx.defaultAt < 12 * 25) return; // no one lends to a recent defaulter
  if (pol.treasury > revenue * 0.25) return;
  const loan = Math.min(lendable(b) * 0.6, revenue * 1.5);
  if (loan < 5) return;
  b.reserves -= loan;
  b.stateLoans += loan;
  pol.treasury += loan;
  pol.debt = loan;
  pol.ctx.creditor = cap.id;
  pol.ctx.warLoan = logEvent(w, {
    type: 'loan', imp: 2, text: `${pol.name} borrowed from the bank of ${cap.name} to pay for its war.`, x: cap.x, y: cap.y, polities: [pol.id], settlements: [cap.id],
    why: `Its treasury held ${pol.treasury - loan < 1 ? 'almost nothing' : (pol.treasury - loan).toFixed(0)} against a yearly revenue of ${revenue.toFixed(0)}; it borrowed ${loan.toFixed(0)}.`,
  });
}

/** Cancel household debts across a polity (a jubilee). Banks bear the loss. */
export function cancelDebts(c: Ctx, pol: Polity, cause: number): number {
  const w = c.w;
  let total = 0;
  for (const sid of pol.settlements) {
    const s = w.settlements.get(sid);
    const b = s?.bank;
    if (!s || !b) continue;
    const hhs = recount(c, s, b);
    for (const h of hhs) { total += h.debt ?? 0; h.debt = 0; }
    b.loans = 0;
    s.ctx.debtShare = 0;
    if (b.deposits > 1 && b.reserves + b.stateLoans < b.deposits * 0.85) failBank(c, s, b, hhs, 'the debts owed to it were cancelled by decree', cause);
  }
  return total;
}

/** All bank reserves in the world (money held by banks). */
export function bankReserves(w: { settlements: Map<number, Settlement> }): number {
  let m = 0;
  for (const s of w.settlements.values()) if (s.bank) m += s.bank.reserves;
  return m;
}
