/* ==================================================================
   the math engines — debt payoff, 1099 tax reserve, allocation waterfall

   Pure functions. No state access, no React. model() calls them and
   hangs the results off `m`; views render what comes back.

   Money is handled in integer cents inside every simulation. Float
   dollars accumulate dust across 600 iterations and leave balances at
   0.0000000001, which reads as "still owing" and burns extra months.
   ================================================================== */

import { shiftMonth, monthsBetween, money, monthLabel } from "./format.js";

const cents = (d) => Math.round((Number(d) || 0) * 100);
const dollars = (c) => c / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* ==================================================================
   1. debt payoff
   ================================================================== */

const HORIZON = 600;

/**
 * Month-by-month amortization with a rollover cascade.
 *
 * The trick that makes rollover free: hold `budget` constant for the whole
 * run. Each month the minimums are paid, and whatever the budget didn't
 * spend on minimums becomes the attack pool. A retired debt contributes a
 * minimum of zero, so the pool grows by exactly its old payment — forever,
 * automatically. A final partial minimum frees its remainder the same month.
 */
export function simulateDebts({
  debts, extra = 0, strategy = "avalanche", rollover = true,
  startMonth, horizon = HORIZON,
}) {
  const live = (debts || [])
    .filter((d) => (Number(d.balance) || 0) > 0)
    .map((d) => ({
      id: d.id,
      name: d.name || "Debt",
      bal: cents(d.balance),
      start: cents(d.balance),
      r: Math.max(0, Number(d.apr) || 0) / 100 / 12,
      min: Math.max(0, cents(d.minPayment)),
      interest: 0,
      months: null,
      payoffMonth: null,
    }));

  const blank = {
    never: false, neverReason: null, months: 0, payoffMonth: null,
    totalInterest: 0, totalPaid: 0, budget: 0, order: [], schedule: [], perDebt: {},
    firstPayoffMonths: null, hasDebt: false,
  };
  if (!live.length) return blank;

  const extraC = Math.max(0, cents(extra));
  const budget = live.reduce((n, d) => n + d.min, 0) + extraC;

  const order = [...live].sort((x, y) =>
    strategy === "snowball"
      ? x.bal - y.bal || y.r - x.r || x.name.localeCompare(y.name)
      : y.r - x.r || x.bal - y.bal || x.name.localeCompare(y.name)
  );

  live.forEach((d) => {
    d.underwater = d.min <= Math.round(d.bal * d.r);
  });

  const bail = (reason) => ({
    ...blank,
    hasDebt: true,
    never: true,
    neverReason: reason,
    months: null,
    totalInterest: null,
    totalPaid: null,
    budget: dollars(budget),
    order: order.map((d) => d.name),
    perDebt: perDebtOut(live, startMonth),
  });

  if (budget <= 0) return bail("no-capacity");

  /* If the whole budget can't clear one month of interest, no principal is
     ever retired and next month's interest is strictly larger. Divergence is
     proven — don't burn 600 iterations to discover it. */
  if (rollover) {
    const month1 = live.reduce((n, d) => n + Math.round(d.bal * d.r), 0);
    if (budget <= month1) return bail("budget-below-interest");
  }

  let totalInterest = 0, totalPaid = 0, t = 0;
  const schedule = [];
  let lastYearBal = live.reduce((n, d) => n + d.bal, 0);
  let growingYears = 0;

  while (live.some((d) => d.bal > 0) && t < horizon) {
    t++;
    const opening = live.reduce((n, d) => n + d.bal, 0);
    let monthInterest = 0, minPaid = 0;
    const perDebt = {};

    // 1. accrue on the pre-payment balance
    live.forEach((d) => {
      if (d.bal <= 0) return;
      const i = Math.round(d.bal * d.r);
      d.bal += i;
      d.interest += i;
      monthInterest += i;
      perDebt[d.id] = { opening: dollars(d.bal - i), interest: dollars(i), paid: 0 };
    });

    // 2. minimums
    live.forEach((d) => {
      if (d.bal <= 0) return;
      const pay = Math.min(d.bal, d.min);
      d.bal -= pay;
      minPaid += pay;
      if (perDebt[d.id]) perDebt[d.id].paid += dollars(pay);
    });

    // 3. whatever the budget didn't spend on minimums — this is the cascade
    let pool = rollover ? budget - minPaid : extraC;

    // 4. attack, in strategy order
    for (const d of order) {
      if (pool <= 0) break;
      if (d.bal <= 0) continue;
      const pay = Math.min(d.bal, pool);
      d.bal -= pay;
      pool -= pay;
      if (perDebt[d.id]) perDebt[d.id].paid += dollars(pay);
    }

    live.forEach((d) => {
      if (perDebt[d.id]) {
        perDebt[d.id].closing = dollars(d.bal);
        perDebt[d.id].closed = d.bal <= 0;
      }
      if (d.bal <= 0 && d.months === null) {
        d.months = t;
        d.payoffMonth = startMonth ? shiftMonth(startMonth, t) : null;
      }
    });

    const closing = live.reduce((n, d) => n + d.bal, 0);
    const paid = opening + monthInterest - closing;
    totalInterest += monthInterest;
    totalPaid += paid;

    if (schedule.length < 360) {
      schedule.push({
        t,
        month: startMonth ? shiftMonth(startMonth, t) : null,
        opening: dollars(opening),
        interest: dollars(monthInterest),
        principal: dollars(paid - monthInterest),
        paid: dollars(paid),
        closing: dollars(closing),
        perDebt,
      });
    }

    // cheap divergence guard for the cases the static check can't prove
    if (t % 12 === 0) {
      if (closing >= lastYearBal) growingYears++; else growingYears = 0;
      lastYearBal = closing;
      if (growingYears >= 2) return bail("diverging");
    }
  }

  const cleared = live.every((d) => d.bal <= 0);
  if (!cleared) return bail("horizon-exceeded");

  const finished = live.filter((d) => d.months !== null).map((d) => d.months);

  return {
    hasDebt: true,
    never: false,
    neverReason: null,
    months: t,
    payoffMonth: startMonth ? shiftMonth(startMonth, t) : null,
    totalInterest: dollars(totalInterest),
    totalPaid: dollars(totalPaid),
    budget: dollars(budget),
    // open debts only — never name a cleared debt as "attack first"
    order: order.filter((d) => d.start > 0).map((d) => d.name),
    schedule,
    perDebt: perDebtOut(live, startMonth),
    firstPayoffMonths: finished.length ? Math.min(...finished) : null,
  };
}

function perDebtOut(live, startMonth) {
  const out = {};
  live.forEach((d) => {
    out[d.id] = {
      id: d.id,
      name: d.name,
      months: d.months,
      payoffMonth: d.payoffMonth,
      totalInterest: dollars(d.interest),
      underwater: !!d.underwater,
      apr: d.r * 1200,
      startBalance: dollars(d.start),
    };
  });
  return out;
}

/* model() runs on every render and this is five simulations deep, so cache on
   a signature of the inputs. Without it, typing in the extra-payment field
   re-runs the lot on every keystroke. */
const planCache = new Map();
const CACHE_MAX = 32;

/** Avalanche vs. snowball vs. minimums-only, plus what one more $100 buys. */
export function debtPlan({ debts, extra = 0, startMonth, plusStep = 100 }) {
  const sig = `${extra}|${startMonth}|${plusStep}|` +
    (debts || []).map((d) => `${d.id}:${d.balance}:${d.apr}:${d.minPayment}`).join(",");
  if (planCache.has(sig)) return planCache.get(sig);

  const avalanche = simulateDebts({ debts, extra, strategy: "avalanche", rollover: true, startMonth });
  const snowball = simulateDebts({ debts, extra, strategy: "snowball", rollover: true, startMonth });
  /* The honest counterfactual: each debt pays its own minimum, nothing cascades.
     Comparing against a rollover baseline would hide the strategy's own value. */
  const baseline = simulateDebts({ debts, extra: 0, strategy: "avalanche", rollover: false, startMonth });
  const plus = simulateDebts({
    debts, extra: (Number(extra) || 0) + plusStep, strategy: "avalanche", rollover: true, startMonth,
  });

  const both = !avalanche.never && !snowball.never;
  const diff = {
    interest: both ? snowball.totalInterest - avalanche.totalInterest : null,
    months: both ? snowball.months - avalanche.months : null,
    materiallyDifferent: both && (snowball.totalInterest - avalanche.totalInterest > 50 || snowball.months - avalanche.months >= 1),
  };

  let recommended = "either";
  if (both && diff.materiallyDifferent && diff.interest >= 200) recommended = "avalanche";

  const saved = (!avalanche.never && !baseline.never)
    ? { interest: baseline.totalInterest - avalanche.totalInterest, months: baseline.months - avalanche.months }
    : { interest: null, months: null };

  const plus100 = (!avalanche.never && !plus.never)
    ? { monthsSaved: avalanche.months - plus.months, interestSaved: avalanche.totalInterest - plus.totalInterest, step: plusStep }
    : { monthsSaved: null, interestSaved: null, step: plusStep };

  const out = {
    avalanche, snowball, baseline, plus100, recommended, diff, saved,
    sentence: debtSentence({ avalanche, snowball, diff, recommended, plus100 }),
  };

  if (planCache.size >= CACHE_MAX) planCache.delete(planCache.keys().next().value);
  planCache.set(sig, out);
  return out;
}

function debtSentence({ avalanche, snowball, diff, recommended, plus100 }) {
  if (!avalanche.hasDebt) return "Nothing owed. The whole payment stays yours.";
  if (avalanche.never) {
    if (avalanche.neverReason === "no-capacity")
      return "No payments are going out, so nothing is coming down. Add the minimums on your debts.";
    return "At these payments the balances grow faster than you're paying them down. The minimums need to rise before a payoff date means anything.";
  }
  const head = `Paying highest rate first clears everything by ${monthLabel(avalanche.payoffMonth)}`;
  if (recommended === "either")
    return `${head}. The two orders finish within a month of each other — pick whichever you'll actually stick to.`;
  const first = snowball.firstPayoffMonths !== null && avalanche.firstPayoffMonths !== null
    ? snowball.firstPayoffMonths - avalanche.firstPayoffMonths : 0;
  const tail = first < 0
    ? ` Smallest balance first clears your first debt ${Math.abs(first)} months sooner but costs ${money(diff.interest)} more overall.`
    : ` It saves ${money(diff.interest)} against paying the smallest balance first.`;
  const more = plus100.monthsSaved > 0
    ? ` Another ${money(plus100.step)} a month takes ${plus100.monthsSaved} months off it.`
    : "";
  return head + "." + tail + more;
}

/* ==================================================================
   2. 1099 tax reserve

   An estimate for setting money aside. Not tax advice, and not a filing.
   Constants are the published 2026 figures and need checking each January —
   state.tax.constants is a sparse override merged over these.
   ================================================================== */

export const TAX_TABLES = {
  2026: {
    seBaseFactor: 0.9235,
    ssRate: 0.124,
    medRate: 0.029,
    addlMedRate: 0.009,
    seFilingFloor: 400,
    ssWageBase: 184500, // per person
    addlMedThreshold: { mfj: 250000, single: 200000 }, // per return
    standardDeduction: { mfj: 32200, single: 16100 },
    qbiRate: 0.2,
    qbiMinDeduction: 400,
    qbiMinIncome: 1000,
    qbiThreshold: { mfj: 403550, single: 201775 },
    brackets: {
      mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24],
            [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
      single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24],
               [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
    },
  },
};

export const DEFAULT_TAX = {
  year: 2026,
  filingStatus: "mfj",
  stateRatePct: 0,
  stateBase: "agi",
  stateStandardDeduction: 0,
  qbiEnabled: true,
  w2WithholdingAnnual: 0,
  creditsEstimate: 0,
  priorYearTax: 0,
  priorYearAgi: 0,
  partners: {
    a: { gross1099: 0, businessExpenses: 0, w2Wages: 0, retirement: 0, healthIns: 0 },
    b: { gross1099: 0, businessExpenses: 0, w2Wages: 0, retirement: 0, healthIns: 0 },
  },
  payments: [],
  constants: {},
};

export const DEFAULT_WATERFALL = {
  tithePct: 10,
  titheBase: "gross",
  order: ["tithe", "taxReserve", "fixedBills", "essentials", "emergencyFund", "debtExtra", "goals", "spending"],
  essentialGroups: ["Home", "Daily", "Health"],
  emergencyMonths: 3,
  debtExtra: 0,
  emergencyGoalId: "",
};

const tables = (tax) => {
  const base = TAX_TABLES[tax.year] || TAX_TABLES[2026];
  return { ...base, ...(tax.constants || {}) };
};

function progressive(taxable, brackets) {
  let owed = 0, prev = 0;
  for (const [upTo, rate] of brackets) {
    const slice = Math.min(taxable, upTo) - prev;
    if (slice > 0) owed += slice * rate;
    prev = upTo;
    if (taxable <= upTo) break;
  }
  return owed;
}

function marginal(taxable, brackets) {
  for (const [upTo, rate] of brackets) if (taxable <= upTo) return rate * 100;
  return brackets[brackets.length - 1][1] * 100;
}

/** Due dates slide to the next weekday when they land on a Saturday or Sunday. */
function weekday(y, m, d) {
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  if (day === 6) date.setDate(d + 2);
  if (day === 0) date.setDate(d + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function taxReserve({ tax, today = new Date() }) {
  const cfg = { ...DEFAULT_TAX, ...(tax || {}) };
  const T = tables(cfg);
  const status = T.brackets[cfg.filingStatus] ? cfg.filingStatus : "mfj";
  const brackets = T.brackets[status];
  const partners = { ...DEFAULT_TAX.partners, ...(cfg.partners || {}) };

  /* Per partner: each gets their own Social Security wage base. Computing SE
     tax on combined household earnings against a single cap overtaxes any
     couple earning more than the base between them. */
  const perPartner = {};
  let seBaseTotal = 0, netEarningsTotal = 0, ssTaxTotal = 0, medTaxTotal = 0;
  let w2Total = 0, gross1099Total = 0, retirementTotal = 0, healthTotal = 0;

  ["a", "b"].forEach((slot) => {
    const p = { ...DEFAULT_TAX.partners.a, ...(partners[slot] || {}) };
    const gross = Math.max(0, Number(p.gross1099) || 0);
    const net = Math.max(0, gross - Math.max(0, Number(p.businessExpenses) || 0));
    const seBase = net * T.seBaseFactor;
    const w2 = Math.max(0, Number(p.w2Wages) || 0);
    const belowFloor = seBase < T.seFilingFloor;
    const ssRoom = Math.max(0, T.ssWageBase - w2);
    const ssTaxable = belowFloor ? 0 : clamp(seBase, 0, ssRoom);
    const ssTax = ssTaxable * T.ssRate;
    const medTax = belowFloor ? 0 : seBase * T.medRate;

    perPartner[slot] = {
      gross1099: gross, businessExpenses: Math.max(0, Number(p.businessExpenses) || 0),
      netEarnings: net, seBase, ssTax, medTax, w2Wages: w2,
      ssCapped: ssTaxable < seBase, belowFloor,
    };
    seBaseTotal += seBase;
    netEarningsTotal += net;
    ssTaxTotal += ssTax;
    medTaxTotal += medTax;
    w2Total += w2;
    gross1099Total += gross;
    retirementTotal += Math.max(0, Number(p.retirement) || 0);
    healthTotal += Math.max(0, Number(p.healthIns) || 0);
  });

  /* The 0.9% additional Medicare threshold is per return, not per person. */
  const addlThreshold = T.addlMedThreshold[status] || T.addlMedThreshold.mfj;
  const addlMedTax = Math.max(0, seBaseTotal + w2Total - addlThreshold) * T.addlMedRate;

  /* The above-the-line deduction is half of Schedule SE tax only —
     the additional Medicare tax is not part of it. */
  const halfSeDeduction = 0.5 * (ssTaxTotal + medTaxTotal);
  const seTax = ssTaxTotal + medTaxTotal + addlMedTax;

  const agi = netEarningsTotal + w2Total - halfSeDeduction - retirementTotal - healthTotal;
  const stdDeduction = T.standardDeduction[status] || T.standardDeduction.mfj;
  const taxableBeforeQbi = Math.max(0, agi - stdDeduction);
  const qbiBase = Math.max(0, netEarningsTotal - halfSeDeduction - retirementTotal - healthTotal);

  /* Above the threshold the SSTB and W-2-wage limitations kick in. Getting
     those silently wrong is worse than declining to compute them. */
  const qbiThreshold = T.qbiThreshold[status] || T.qbiThreshold.mfj;
  const qbiPhaseIn = taxableBeforeQbi > qbiThreshold;
  const qbiDeduction = cfg.qbiEnabled && !qbiPhaseIn
    ? Math.max(
        Math.min(T.qbiRate * qbiBase, T.qbiRate * taxableBeforeQbi),
        qbiBase >= T.qbiMinIncome ? T.qbiMinDeduction : 0
      )
    : 0;

  const taxableIncome = Math.max(0, taxableBeforeQbi - qbiDeduction);
  const federalTax = progressive(taxableIncome, brackets);

  const stateBase = cfg.stateBase === "gross"
    ? netEarningsTotal
    : Math.max(0, agi - (Number(cfg.stateStandardDeduction) || 0));
  const stateTax = Math.max(0, stateBase) * (Math.max(0, Number(cfg.stateRatePct) || 0) / 100);

  const totalTax = seTax + federalTax + stateTax;
  const netOwed = Math.max(0, totalTax - (Number(cfg.w2WithholdingAnnual) || 0) - (Number(cfg.creditsEstimate) || 0));
  const grossAll = gross1099Total + w2Total;

  const setAsidePct = gross1099Total > 0 ? (netOwed / gross1099Total) * 100 : 0;
  const monthlyReserve = netOwed / 12;

  /* Safe harbour is often far cheaper than 90% of a growing current year. */
  const safeHarborPct = (Number(cfg.priorYearAgi) || 0) > (status === "mfs" ? 75000 : 150000) ? 1.1 : 1.0;
  const safeHarborTotal = (Number(cfg.priorYearTax) || 0) * safeHarborPct;
  const firstYear = !(Number(cfg.priorYearTax) > 0);
  const requiredAnnual = firstYear ? totalTax * 0.9 : Math.min(totalTax * 0.9, safeHarborTotal);

  const y = cfg.year;
  const quarterDefs = [
    ["Q1", weekday(y, 4, 15), "January – March", 3],
    ["Q2", weekday(y, 6, 15), "April – May", 2],
    ["Q3", weekday(y, 9, 15), "June – August", 3],
    ["Q4", weekday(y + 1, 1, 15), "September – December", 4],
  ];
  const payments = Array.isArray(cfg.payments) ? cfg.payments : [];
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const quarters = quarterDefs.map(([label, dueDate, covers, months]) => ({
    label, dueDate, covers, months,
    amount: netOwed / 4,
    past: dueDate <= todayISO,
    paid: payments.some((p) => p.kind === "paid" && p.quarter === label),
  }));

  /* Two different clocks. The savings clock is smooth; the IRS clock is lumpy.
     Different problems, different sentences. */
  const monthsElapsed = today.getFullYear() === y ? today.getMonth() + 1 : (today.getFullYear() > y ? 12 : 0);
  const monthsLeft = Math.max(0, 12 - monthsElapsed);
  const reservedToDate = payments.filter((p) => p.kind === "reserve").reduce((n, p) => n + (Number(p.amount) || 0), 0);
  const paidToDate = payments.filter((p) => p.kind === "paid").reduce((n, p) => n + (Number(p.amount) || 0), 0);
  const shouldHaveReservedByNow = monthlyReserve * monthsElapsed;
  const shouldHavePaidByNow = quarters.filter((q) => q.past).reduce((n, q) => n + q.amount, 0);
  const reserveDelta = reservedToDate + paidToDate - shouldHaveReservedByNow;
  const paymentDelta = paidToDate - shouldHavePaidByNow;
  const catchUpPerMonth = Math.max(0, -reserveDelta) / Math.max(1, monthsLeft);

  const incomplete = gross1099Total <= 0;
  const overdue = quarters.find((q) => q.past && !q.paid && q.amount > 0);

  let sentence;
  if (incomplete) sentence = "Add what each of you billed this year and the app can tell you what to hold back.";
  else if (overdue && paymentDelta < -1)
    sentence = `Your ${overdue.label} payment of ${money(overdue.amount)} was due ${overdue.dueDate} and isn't marked paid.`;
  else if (reserveDelta < -1)
    sentence = `You're ${money(-reserveDelta)} behind on tax reserve — about ${money(catchUpPerMonth)} a month for the rest of the year.`;
  else if (reserveDelta > 1)
    sentence = `You're ${money(reserveDelta)} ahead on tax. Hold about ${money(monthlyReserve)} a month to stay there.`;
  else sentence = `Hold back ${money(monthlyReserve)} a month — roughly ${Math.round(setAsidePct)}% of what you bill.`;

  return {
    incomplete, perPartner,
    seTax, ssTaxTotal, medTaxTotal, addlMedTax, halfSeDeduction,
    agi, qbiBase, qbiDeduction, qbiPhaseIn, taxableIncome, stdDeduction,
    federalTax, stateTax, totalTax, netOwed,
    gross1099Total, w2Total, grossAll,
    effectiveRatePct: grossAll > 0 ? (totalTax / grossAll) * 100 : 0,
    marginalRatePct: marginal(taxableIncome, brackets),
    setAsidePct, monthlyReserve,
    quarters, requiredAnnual, safeHarborTotal, safeHarborPct, firstYear,
    shouldHaveReservedByNow, shouldHavePaidByNow,
    reservedToDate, paidToDate, reserveDelta, paymentDelta, catchUpPerMonth,
    monthsElapsed, monthsLeft,
    sentence,
    disclaimer: "An estimate for setting money aside — not tax advice, and not a filing.",
    assumptions: {
      year: cfg.year, filingStatus: status, wageBase: T.ssWageBase,
      standardDeduction: stdDeduction, stateRatePct: cfg.stateRatePct, qbiEnabled: cfg.qbiEnabled,
    },
  };
}

/* ==================================================================
   2½. can we afford it?

   The verdict is deterministic — the AI only phrases it and checks the
   house rules. Order of severity: can't cover the bills still due →
   dips below a month of essentials → fits in the cushion → tradeoff.
   ================================================================== */

export function affordability({ cost, m }) {
  const c = Math.max(0, Number(cost) || 0);
  const cash = m.assets.filter((a) => a.type === "cash").reduce((n, a) => n + a.balance, 0);
  const billsDue = m.billsLeft;
  const essentials = m.flow.monthlyEssentialSpend;
  const available = Math.max(0, m.monthOutlook ? m.monthOutlook.available : 0);
  const efGoal = m.flow.efGoal;

  if (c <= 0) return null;

  const afterCash = cash - billsDue - c;
  const efDelayWeeks = efGoal && efGoal.monthly > 0 ? Math.round((c / efGoal.monthly) * 4.33) : null;

  let verdict, label, reasons = [];
  if (cash - billsDue < c) {
    verdict = "no";
    label = "No — not right now";
    reasons.push(`Cash on hand is ${money(cash)} and ${money(billsDue)} of bills are still due this month — the purchase would leave those short.`);
  } else if (afterCash < essentials) {
    verdict = "wait";
    label = "Wait";
    reasons.push(`It fits, but it would take cash below one month of essentials (${money(essentials)}). After bills and this purchase you'd hold ${money(afterCash)}.`);
    if (available > 0) reasons.push(`About ${money(available)} frees up by month end — waiting shrinks the dent.`);
  } else if (c <= available) {
    verdict = "yes";
    label = "Yes — comfortably";
    reasons.push(`It fits inside this month's expected cushion of about ${money(available)}, without touching goals or the emergency fund.`);
  } else {
    verdict = "tradeoff";
    label = "Yes — but there's a tradeoff";
    reasons.push(`It's ${money(c - available)} more than this month's expected cushion, so the difference comes out of goal money.`);
    if (efDelayWeeks) reasons.push(`That pushes the emergency fund back roughly ${efDelayWeeks} week${efDelayWeeks === 1 ? "" : "s"}.`);
  }
  if (verdict !== "no" && afterCash >= essentials)
    reasons.push(`Cash after bills and the purchase: ${money(afterCash)}.`);

  return { verdict, label, reasons, cost: c, cash, billsDue, afterCash, available, efDelayWeeks };
}

/* ==================================================================
   3. allocation waterfall
   ================================================================== */

/**
 * Find the envelope a bill belongs to in the given month.
 *
 * Envelope ids are per-month, so a bill's stored envId only resolves in
 * whatever month it was set. Fall back to matching by name — the fix
 * docs/data-model.md has been asking for.
 */
export function resolveBillEnvelope(bill, state, plan) {
  if (!bill.envId) return null;
  const direct = plan.envelopes.find((e) => e.id === bill.envId);
  if (direct) return direct;
  for (const mm of Object.values(state.months || {})) {
    const hit = (mm.envelopes || []).find((e) => e.id === bill.envId);
    if (hit) return plan.envelopes.find((e) => e.name === hit.name) || null;
  }
  return null;
}

const STAGE_LABELS = {
  tithe: "Tithe",
  taxReserve: "Tax reserve",
  fixedBills: "Fixed bills",
  essentials: "Essentials",
  emergencyFund: "Emergency fund",
  debtExtra: "Extra on debt",
  goals: "Goals",
  spending: "Spending money",
};

const EPS = 0.005; // half a cent — float residue shouldn't flag a funded stage as short

function allocate(pool, stages) {
  let remaining = pool, cumulative = 0;
  const rows = stages.map((st) => {
    const need = Math.max(0, st.need);
    const funded = st.terminal ? Math.max(0, remaining) : Math.min(Math.max(0, remaining), need);
    const shortfall = st.terminal ? 0 : need - funded;
    remaining -= funded;
    cumulative += funded;
    return {
      ...st, need, funded, shortfall,
      underfunded: shortfall > EPS,
      pctOfIncome: pool > 0 ? (funded / pool) * 100 : 0,
      cumulative, remainingAfter: Math.max(0, remaining),
    };
  });
  return { rows, leftover: Math.max(0, remaining), totalShortfall: rows.reduce((n, r) => n + r.shortfall, 0) };
}

/**
 * Where every dollar goes, in order.
 * `m` is the partial model — it needs shareA, goalMonthly, and the envelope list.
 */
export function waterfall({ state, plan, m, cfg, tax }) {
  const c = { ...DEFAULT_WATERFALL, ...(cfg || {}) };
  const pool = m.income;

  /* Bills and envelopes overlap: a $2,150 rent bill usually points at a
     $2,150 rent envelope. Summing both stages would demand $4,300. */
  const bills = state.bills || [];
  const matched = new Map(); // envelope id -> bills total already counted
  let unmatchedBills = 0;
  bills.forEach((b) => {
    const env = resolveBillEnvelope(b, state, plan);
    const amt = Number(b.amount) || 0;
    if (env) matched.set(env.id, (matched.get(env.id) || 0) + amt);
    else unmatchedBills += amt;
  });
  const billsTotal = bills.reduce((n, b) => n + (Number(b.amount) || 0), 0);

  const isEssential = (e) =>
    e.essential !== undefined ? !!e.essential : c.essentialGroups.includes(e.group || "Other");

  const essentialNeed = plan.envelopes
    .filter((e) => isEssential(e) && e.role !== "tithe" && e.role !== "tax")
    .reduce((n, e) => n + Math.max(0, e.planned - (matched.get(e.id) || 0)), 0);

  const discretionaryNeed = plan.envelopes
    .filter((e) => !isEssential(e) && e.role !== "spending")
    .reduce((n, e) => n + Math.max(0, e.planned - (matched.get(e.id) || 0)), 0);

  /* The emergency-fund target is what it costs to keep the lights on —
     essentials and fixed bills, not total planned spending. */
  const monthlyEssentialSpend = essentialNeed + billsTotal;
  const goals = state.goals || [];
  const efGoal = goals.find((g) => g.id === c.emergencyGoalId) || goals.find((g) => g.role === "emergency");
  const efTarget = efGoal && efGoal.target > 0
    ? efGoal.target
    : c.emergencyMonths * monthlyEssentialSpend;
  const efNeed = efGoal
    ? Math.min(Math.max(0, efGoal.monthly), Math.max(0, efTarget - efGoal.saved))
    : 0;
  // a $0 target is "not set up yet", never "funded"
  const efFunded = efGoal ? efTarget > 0 && efGoal.saved >= efTarget : false;

  // goalMonthly already counts the emergency fund — don't fund it twice
  const otherGoals = goals.filter((g) => !efGoal || g.id !== efGoal.id)
    .reduce((n, g) => n + Math.max(0, Number(g.monthly) || 0), 0);

  const titheBase = c.titheBase === "afterTax" ? Math.max(0, pool - (tax ? tax.monthlyReserve : 0)) : pool;
  const titheNeed = titheBase * (clamp(Number(c.tithePct) || 0, 0, 100) / 100);

  const needs = {
    tithe: titheNeed,
    taxReserve: tax && !tax.incomplete ? tax.monthlyReserve : 0,
    fixedBills: billsTotal,
    essentials: essentialNeed + discretionaryNeed,
    emergencyFund: efNeed,
    debtExtra: Math.max(0, Number(c.debtExtra) || 0),
    goals: otherGoals,
    spending: 0,
  };

  /* Spending is terminal — it absorbs whatever is left. If a reorder buried
     it mid-list, everything after it would silently get nothing. */
  const order = [...new Set(c.order.filter((k) => needs[k] !== undefined))];
  const stages = order.filter((k) => k !== "spending").map((k) => ({
    key: k, label: STAGE_LABELS[k], need: needs[k], terminal: false,
  }));
  stages.push({ key: "spending", label: STAGE_LABELS.spending, need: 0, terminal: true });

  const { rows, leftover, totalShortfall } = allocate(pool, stages);
  const first = rows.find((r) => r.underfunded);
  const spendTotal = rows[rows.length - 1].funded;
  const spending = { a: spendTotal * m.shareA, b: spendTotal * (1 - m.shareA), total: spendTotal };
  const balanced = leftover < 1 && totalShortfall < 1;

  let sentence;
  if (pool <= 0) sentence = "Start with what you each bring home — everything below builds from that.";
  else if (totalShortfall > 1)
    sentence = `Your plan runs out at ${first.label.toLowerCase()} — ${money(totalShortfall)} short of covering everything below it.`;
  else if (leftover > 1)
    sentence = `${money(leftover)} lands in spending money — ${money(spending.a)} for ${m.pA.name}, ${money(spending.b)} for ${m.pB.name}.`;
  else sentence = "Every dollar has a job.";

  return {
    pool, rows, leftover, totalShortfall,
    firstUnderfunded: first ? first.key : null,
    spending, balanced, sentence,
    efTarget, efFunded, efGoal: efGoal || null, monthlyEssentialSpend,
    unmatchedBills, billsTotal,
  };
}
