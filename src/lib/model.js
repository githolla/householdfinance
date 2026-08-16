/* ==================================================================
   the computation layer

   model(state, plan, month) is where every derived number in the app is
   computed. Views render what comes off `m`; they never calculate.
   If you need a new number, add it here.
   ================================================================== */

import {
  money, monthKey, monthLabel, shiftMonth, monthsBetween,
  todayDay, ordinal, daysInMonth, C,
} from "./format.js";
import { debtPlan, simulateDebts, taxReserve, waterfall, affordability } from "./engines.js";
import { merchantKey } from "./receipt.js";

export function model(state, plan, month) {
  const [pA, pB] = state.household.partners;
  const income = pA.income + pB.income;

  const spentBy = {};
  plan.entries.forEach((t) => { spentBy[t.envId] = (spentBy[t.envId] || 0) + t.amount; });
  const spentByWho = { a: 0, b: 0, joint: 0 };
  plan.entries.forEach((t) => { spentByWho[t.who] = (spentByWho[t.who] || 0) + t.amount; });

  const planned = plan.envelopes.reduce((n, e) => n + e.planned, 0);
  const spent = plan.entries.reduce((n, t) => n + t.amount, 0);
  const goalMonthly = state.goals.reduce((n, g) => n + g.monthly, 0);
  const debts = state.accounts.filter((a) => a.type === "debt");
  const assets = state.accounts.filter((a) => a.type !== "debt");
  const debtMin = debts.reduce((n, d) => n + (d.minPayment || 0), 0);
  const allocated = planned + goalMonthly;
  const unallocated = income - allocated;
  const leftToSpend = planned - spent;
  const savingsRate = income > 0 ? (goalMonthly / income) * 100 : 0;
  const assetTotal = assets.reduce((n, a) => n + a.balance, 0);
  const debtTotal = debts.reduce((n, a) => n + a.balance, 0);
  const netWorth = assetTotal - debtTotal;

  const byGroup = {};
  plan.envelopes.forEach((e) => {
    const g = e.group || "Other";
    if (!byGroup[g]) byGroup[g] = { planned: 0, spent: 0, items: [] };
    byGroup[g].planned += e.planned;
    byGroup[g].spent += spentBy[e.id] || 0;
    byGroup[g].items.push(e);
  });

  const goalStatus = (g) => {
    const remaining = Math.max(0, g.target - g.saved);
    const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    const monthsNeeded = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
    const eta = monthsNeeded !== null ? shiftMonth(month, monthsNeeded) : null;
    let due = null, late = false, needed = null;
    if (g.due) {
      due = monthsBetween(month, g.due);
      needed = due > 0 ? remaining / due : remaining;
      late = remaining > 0 && (monthsNeeded === null || monthsNeeded > due);
    }
    return { remaining, pct, monthsNeeded, eta, due, late, needed, done: remaining === 0 && g.target > 0 };
  };

  const history = [];
  for (let i = 5; i >= 0; i--) {
    const k = shiftMonth(month, -i);
    const mm = state.months[k];
    const s = mm ? mm.entries.reduce((n, t) => n + t.amount, 0) : 0;
    history.push({ key: k, label: monthLabel(k, true), spent: s, income, saved: goalMonthly });
  }

  const live = month === monthKey(new Date());
  const bills = state.bills
    .map((b) => {
      const paid = (plan.paid || []).includes(b.id);
      const overdue = !paid && live && b.day < todayDay();
      const dueSoon = !paid && live && !overdue && b.day - todayDay() <= 7;
      return { ...b, paid, overdue, dueSoon };
    })
    .sort((x, y) => x.day - y.day);
  const billsTotal = bills.reduce((n, b) => n + b.amount, 0);
  const billsLeft = bills.filter((b) => !b.paid).reduce((n, b) => n + b.amount, 0);
  const dueSoonList = bills.filter((b) => !b.paid && (b.overdue || b.day - todayDay() <= 10)).slice(0, 3);

  /* ---- pace: am I ahead of myself this month? ---- */
  const dim = daysInMonth(month);
  const dayOfMonth = live ? Math.min(todayDay(), dim) : dim;
  const daysLeft = Math.max(0, dim - dayOfMonth);
  const pacePct = (dayOfMonth / dim) * 100;
  const expectedSpend = planned * (dayOfMonth / dim);
  const paceDelta = spent - expectedSpend;

  const envRemaining = {};
  plan.envelopes.forEach((e) => { envRemaining[e.id] = e.planned - (spentBy[e.id] || 0); });
  /* The quick-log targets: tightest envelopes that still have money moving.
     A rent envelope sitting at exactly $0 left is finished, not tight — it
     would waste one of the three slots on something nobody logs against. */
  const tightest = plan.envelopes
    .filter((e) => e.planned > 0 && Math.abs(envRemaining[e.id]) > 0.005)
    .sort((a, b) => envRemaining[a.id] - envRemaining[b.id])
    .slice(0, 3);

  const entryCount = {};
  plan.entries.forEach((t) => { entryCount[t.envId] = (entryCount[t.envId] || 0) + 1; });
  const recentEnvIds = Object.keys(entryCount).sort((a, b) => entryCount[b] - entryCount[a]).slice(0, 3);

  /* Most expenses: this month's biggest envelopes, with the change against last
     month. Matched by name — envelope ids are per-month. */
  const prevMM = state.months[shiftMonth(month, -1)];
  const prevByName = {};
  if (prevMM) {
    const prevSpent = {};
    (prevMM.entries || []).forEach((t) => { prevSpent[t.envId] = (prevSpent[t.envId] || 0) + t.amount; });
    (prevMM.envelopes || []).forEach((e) => { prevByName[e.name] = (prevByName[e.name] || 0) + (prevSpent[e.id] || 0); });
  }
  const topSpend = plan.envelopes
    .map((e) => ({ id: e.id, name: e.name, group: e.group, owner: e.owner, amount: spentBy[e.id] || 0 }))
    .filter((x) => x.amount > 0)
    .sort((x, y) => y.amount - x.amount)
    .slice(0, 6)
    .map((x) => {
      const prev = prevByName[x.name] || 0;
      return {
        ...x,
        pct: spent > 0 ? (x.amount / spent) * 100 : 0,
        deltaPct: prev > 0 ? ((x.amount - prev) / prev) * 100 : null,
      };
    });

  const envByName = (name) => plan.envelopes.find((e) => e.name === name);

  /* ---- what "normal" looks like: the prior three months ---- */
  const priorMonths = [];
  for (let i = 1; i <= 3; i++) {
    const k = shiftMonth(month, -i);
    const mm = state.months[k];
    if (mm && (mm.entries || []).length) priorMonths.push(mm);
  }
  const avgByName = {};
  const toDateByName = {};
  let threeMoAvgTotal = null;
  let threeMoAvgToDate = null;
  if (priorMonths.length) {
    let total = 0, totalToDate = 0;
    priorMonths.forEach((mm) => {
      const byId = {}, byIdToDate = {};
      mm.entries.forEach((t) => {
        byId[t.envId] = (byId[t.envId] || 0) + t.amount; total += t.amount;
        if ((t.day || 1) <= dayOfMonth) {
          byIdToDate[t.envId] = (byIdToDate[t.envId] || 0) + t.amount; totalToDate += t.amount;
        }
      });
      mm.envelopes.forEach((e) => {
        avgByName[e.name] = (avgByName[e.name] || 0) + (byId[e.id] || 0);
        toDateByName[e.name] = (toDateByName[e.name] || 0) + (byIdToDate[e.id] || 0);
      });
    });
    Object.keys(avgByName).forEach((k) => { avgByName[k] /= priorMonths.length; });
    Object.keys(toDateByName).forEach((k) => { toDateByName[k] /= priorMonths.length; });
    threeMoAvgTotal = total / priorMonths.length;
    threeMoAvgToDate = totalToDate / priorMonths.length;
  }

  /* ---- "why are we spending so much?" — pace against your own normal.
     Normal is what the prior months had spent BY THIS SAME DAY, not an
     even fraction of their total — rent going out on the 1st is not
     "ahead of pace", it's what always happens. ---- */
  let paceDiag = null;
  if (threeMoAvgToDate !== null) {
    const expectedNormal = threeMoAvgToDate;
    const rows = plan.envelopes.map((e) => {
      const normal = toDateByName[e.name] || 0;
      return { name: e.name, spent: spentBy[e.id] || 0, normal, delta: (spentBy[e.id] || 0) - normal };
    });
    paceDiag = {
      delta: spent - expectedNormal,
      expectedNormal,
      over: rows.filter((r) => r.delta > 10).sort((a, b) => b.delta - a.delta).slice(0, 3),
      under: rows.filter((r) => r.delta < -10).sort((a, b) => a.delta - b.delta).slice(0, 2),
    };
  }

  /* ---- engines ---- */
  const tax = taxReserve({ tax: state.tax, month });

  const shareA = income > 0 ? (state.household.splitRule === "even" ? 0.5 : pA.income / income) : 0.5;
  const partial = { income, shareA, goalMonthly, billsTotal, pA, pB };
  const flow = waterfall({ state, plan, m: partial, cfg: state.waterfall, tax });

  /* The payoff date has to be built on the extra payment the plan can actually
     fund, not the one that was asked for — otherwise it's a fantasy. */
  const debtExtraRow = flow.rows.find((r) => r.key === "debtExtra");
  const fundedExtra = debtExtraRow ? debtExtraRow.funded : 0;
  const debt = debtPlan({ debts, extra: fundedExtra, startMonth: month });
  const payoff = (extra, strategy) => simulateDebts({ debts, extra, strategy, rollover: true, startMonth: month });

  /* ---- month outlook: what's actually going to be left, and where to
     point it. Deterministic — the planner only phrases it. ---- */
  const projectedRest = threeMoAvgTotal !== null
    ? Math.max(billsLeft, threeMoAvgTotal - spent)     // finish near your normal, never less than bills still due
    : Math.max(billsLeft, leftToSpend);                // no history yet: assume the plan is spent
  const available = income - spent - projectedRest;
  const efGoalRef = flow.efGoal;
  const efUnderTarget = !!efGoalRef && flow.efTarget > 0 && efGoalRef.saved < flow.efTarget;
  const hasLiveDebt = debts.some((d) => d.balance > 0);
  const round10 = (v) => Math.max(0, Math.round(v / 10) * 10);
  let rec = [];
  if (available >= 20) {
    /* A behind-pace tax reserve gets first claim — recommending the
       emergency fund while the app's own top action is an IRS payment
       would be two voices disagreeing on one screen. */
    let pool = available;
    if (!tax.incomplete && tax.reserveDelta < -1) {
      const t = round10(Math.min(pool, tax.catchUpPerMonth));
      if (t > 0) { rec.push({ label: "to the tax reserve", amount: t }); pool -= t; }
    }
    const debtName = debt.avalanche.order[0] || "debt";
    const w = efUnderTarget && hasLiveDebt ? [0.5, 0.3]
      : efUnderTarget ? [0.7, 0] : hasLiveDebt ? [0, 0.6] : [0.4, 0];
    const sav = round10(pool * w[0]);
    const dbt = round10(pool * w[1]);
    const cush = Math.max(0, Math.round(pool - sav - dbt));
    if (sav > 0) rec.push({ label: efGoalRef ? `to ${efGoalRef.name.toLowerCase()}` : "to savings", amount: sav });
    if (dbt > 0) rec.push({ label: `toward ${debtName}`, amount: dbt });
    if (cush > 0) rec.push({ label: "as cushion", amount: cush });
  }
  /* A drift worth mentioning scales with the household — $200 of noise on
     an $8,000 month is not "running hot". */
  const paceHot = !!paceDiag && paceDiag.delta > Math.max(150, (threeMoAvgTotal || 0) * 0.04);
  let outlookSentence;
  if (income <= 0) outlookSentence = "";
  else if (paceHot)
    outlookSentence = `You're running ${money(paceDiag.delta)} ahead of your normal pace — ${paceDiag.over[0] ? `most of it is ${paceDiag.over[0].name.toLowerCase()} (+${money(paceDiag.over[0].delta)})` : "spread across a few envelopes"}.`;
  else if (available < 50)
    outlookSentence = "After the bills still due and normal spending, this month finishes tight — nothing extra to assign.";
  else
    outlookSentence = `On track. After the bills still due and normal spending, about ${money(available)} should be left — ` +
      rec.map((r) => `${money(r.amount)} ${r.label}`).join(", ") + ".";
  const monthOutlook = { available, projectedRest, rec, sentence: outlookSentence, onTrack: !paceHot };

  /* ---- the week, for the Sunday money meeting ---- */
  const now = new Date();
  const dayMs = 86400000;
  const dated = [];
  for (let i = 0; i <= 1; i++) {
    const k = shiftMonth(month, -i);
    const mm = state.months[k];
    if (!mm) continue;
    const [yy, mo] = k.split("-").map(Number);
    const nameOf = {}, metaOf = {};
    (mm.envelopes || []).forEach((e) => { nameOf[e.id] = e.name; metaOf[e.id] = e; });
    (mm.entries || []).forEach((t) => {
      if (!t.day) return;
      const env = metaOf[t.envId];
      dated.push({
        amount: t.amount, name: nameOf[t.envId] || "Spending", d: new Date(yy, mo - 1, t.day),
        giving: !!env && (env.group === "Giving" || env.role === "tithe"),
        flex: !!env && !env.essential && env.role !== "tax",
      });
    });
  }
  const inLast = (days, e) => now - e.d >= 0 && now - e.d < days * dayMs;
  const spent7 = dated.filter((e) => inLast(7, e)).reduce((n, e) => n + e.amount, 0);
  const giving7 = dated.filter((e) => inLast(7, e) && e.giving).reduce((n, e) => n + e.amount, 0);
  const spent28 = dated.filter((e) => inLast(28, e)).reduce((n, e) => n + e.amount, 0);
  const weekByName = {};
  dated.filter((e) => inLast(7, e)).forEach((e) => { weekByName[e.name] = (weekByName[e.name] || 0) + e.amount; });
  const weekRows = Object.entries(weekByName).map(([name, amt]) => ({
    name, spent: amt,
    normal: avgByName[name] !== undefined ? avgByName[name] / 4.33 : null,
  }));
  const upcoming14 = bills
    .map((b) => {
      const dueThis = new Date(now.getFullYear(), now.getMonth(), Math.min(b.day, dim));
      const due = (b.day >= todayDay() && !b.paid) ? dueThis
        : new Date(now.getFullYear(), now.getMonth() + 1, b.day);
      return { ...b, dueIn: Math.ceil((due - now) / dayMs), dueDate: due };
    })
    .filter((b) => b.dueIn >= 0 && b.dueIn <= 14)
    .sort((x, y) => x.dueIn - y.dueIn)
    .slice(0, 4);
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const weekKey = `${now.getFullYear()}-W${Math.ceil(((now - jan1) / dayMs + jan1.getDay() + 1) / 7)}`;
  const week = live ? {
    key: weekKey,
    spent: spent7,
    giving: giving7,
    weeklyAvg: spent28 / 4,
    delta: spent28 > 0 ? spent7 - spent28 / 4 : null,
    rows: weekRows.sort((a, b) => b.spent - a.spent).slice(0, 5),
    upcoming: upcoming14,
    decision: round10(Math.max(0, available)),
  } : null;

  /* ---- the month laid out on a calendar ------------------------------
     One row per day: what was logged, what's due, and any tax deadline.
     Bills that repeat land on their day whether or not they're paid yet;
     the view decides how loudly to say so. ---- */
  const [cy, cmo] = month.split("-").map(Number);
  const calFirstDow = new Date(cy, cmo - 1, 1).getDay();
  const calEnvName = {};
  plan.envelopes.forEach((e) => { calEnvName[e.id] = e.name; });
  const calEntries = {};
  plan.entries.forEach((t) => {
    const d = Math.min(Math.max(1, t.day || 1), dim);
    (calEntries[d] = calEntries[d] || []).push({
      id: t.id, amount: t.amount, who: t.who,
      name: t.note || calEnvName[t.envId] || "Spending",
    });
  });
  const calTax = !tax.incomplete
    ? tax.quarters.filter((q) => q.dueDate.slice(0, 7) === month && q.amount > 0)
    : [];
  const calDays = [];
  for (let d = 1; d <= dim; d++) {
    const dayBills = bills.filter((b) => Math.min(b.day, dim) === d);
    const dayEntries = calEntries[d] || [];
    const dayTax = calTax.filter((q) => Number(q.dueDate.slice(8, 10)) === d);
    calDays.push({
      day: d,
      today: live && d === todayDay(),
      entries: dayEntries,
      spent: dayEntries.reduce((n, e) => n + e.amount, 0),
      bills: dayBills,
      tax: dayTax,
      busy: dayEntries.length > 0 || dayBills.length > 0 || dayTax.length > 0,
    });
  }
  const calendar = { firstDow: calFirstDow, days: calDays };

  /* ---- today and this week: the daily read -------------------------
     Flexible money only — envelopes that aren't essential and aren't
     the tax set-aside. Rent and groceries are already spoken for; this
     is the "can we get takeout tonight?" number. An even split of
     what's left across the days that remain, today included. ---- */
  const flexEnvs = plan.envelopes.filter((e) => !e.essential && e.role !== "tax");
  const flexPlanned = flexEnvs.reduce((n, e) => n + e.planned, 0);
  const flexSpentTotal = flexEnvs.reduce((n, e) => n + (spentBy[e.id] || 0), 0);
  const flexLeft = flexPlanned - flexSpentTotal;
  const daysRemaining = daysLeft + 1;
  const flexIds = new Set(flexEnvs.map((e) => e.id));
  const spentTodayFlex = live
    ? plan.entries.filter((t) => t.day === dayOfMonth && flexIds.has(t.envId)).reduce((n, t) => n + t.amount, 0)
    : 0;
  const weekFlexSpent = dated.filter((e) => inLast(7, e) && e.flex).reduce((n, e) => n + e.amount, 0);
  const todayAllowance = Math.max(0, flexLeft) / daysRemaining;
  const today = {
    known: live && flexPlanned > 0,
    allowance: todayAllowance,
    spentToday: spentTodayFlex,
    weekBudget: todayAllowance * Math.min(7, daysRemaining),
    weekSpent: weekFlexSpent,
    flexLeft,
    daysRemaining,
  };

  /* ---- a light 12-month look ahead, for "what if" questions ---- */
  const goalSavedNow = state.goals.reduce((n, g) => n + g.saved, 0);
  const forecast12 = [];
  for (let i = 1; i <= 12; i++) {
    const row = debt.avalanche.schedule[i - 1];
    forecast12.push({
      month: shiftMonth(month, i),
      debt: debt.avalanche.never ? null : row ? row.closing : 0,
      goalsSaved: goalSavedNow + goalMonthly * i,
      cushion: Math.max(0, flow.leftover) * i,
    });
  }

  /* ---- cash coverage: how far the money on hand carries the bills ----
     Walks unpaid bills in due order (this month, then next) against cash
     accounts, and names the first one that wouldn't clear. ---- */
  const cashOnHand = assets.filter((a) => a.type === "cash").reduce((n, a) => n + a.balance, 0);
  let covered = cashOnHand;
  let shortBill = null;
  const upcomingSeq = [
    ...bills.filter((b) => !b.paid).map((b) => ({ ...b, m: month })),
    ...bills.map((b) => ({ ...b, m: shiftMonth(month, 1) })),
  ];
  for (const b of upcomingSeq) {
    covered -= b.amount;
    if (covered < 0) { shortBill = b; break; }
  }
  /* "September 30", never "Sep 26 30" — the short month label carries a year. */
  const calDate = (k, d) => {
    const [yy, mo] = k.split("-").map(Number);
    return new Date(yy, mo - 1, Math.min(d, daysInMonth(k)))
      .toLocaleDateString(undefined, { month: "long", day: "numeric" });
  };
  const billsCovered = {
    cash: cashOnHand,
    /* "Covered" is only a claim when there's data to base it on — no
       bills or no cash accounts means unknown, never reassurance. */
    known: bills.length > 0 && assets.some((a) => a.type === "cash"),
    ok: !shortBill,
    throughLabel: shortBill
      ? calDate(shortBill.m, shortBill.day)
      : calDate(shiftMonth(month, 1), daysInMonth(shiftMonth(month, 1))),
    shortBill: shortBill ? { name: shortBill.name, amount: shortBill.amount } : null,
  };

  /* ---- one real thing worth naming out loud this week ----
     Deterministic — if nothing genuinely positive exists, it's null and
     the meeting says "steady is enough" instead of inventing praise. ---- */
  let celebrate = null;
  const goalNearly = state.goals
    .map((g) => ({ g, st: goalStatus(g) }))
    .find((x) => x.g.target > 0 && !x.st.done && x.st.pct >= 75);
  const goalDone = state.goals.map((g) => ({ g, st: goalStatus(g) })).find((x) => x.st.done);
  if (paceDiag && paceDiag.delta < -50)
    celebrate = `You're ${money(-paceDiag.delta)} under your own normal pace this month — quiet discipline, adding up.`;
  else if (goalDone)
    celebrate = `${goalDone.g.name} is fully funded. That happened because you kept choosing it.`;
  else if (goalNearly)
    celebrate = `${goalNearly.g.name} is ${Math.round(goalNearly.st.pct)}% funded — the last stretch is in sight.`;
  else if (bills.length > 0 && !bills.some((b) => b.overdue))
    celebrate = "Every bill so far this month was handled on time. That's not nothing.";
  else if (!tax.incomplete && tax.reserveDelta > -1)
    celebrate = "The tax reserve is on pace — the quarter won't sneak up on you.";

  /* ---- insights: patterns named in words, charts as evidence ---- */
  let insights = null;
  if (paceDiag) {
    insights = [];
    const topOver = paceDiag.over[0];
    if (topOver && avgByName[topOver.name] > 0)
      insights.push({
        title: `${topOver.name} is trending higher`,
        body: `${money(topOver.spent)} so far this month against ${money(topOver.normal)} by this point in a normal month — a three-month average of ${money(avgByName[topOver.name])}/mo.`,
        tone: "warn",
      });
    const topUnder = paceDiag.under[0];
    if (topUnder && avgByName[topUnder.name] > 0)
      insights.push({
        title: `${topUnder.name} is running lighter`,
        body: `${money(-topUnder.delta)} under its usual pace for this point in the month.`,
        tone: "ok",
      });
    if (threeMoAvgTotal !== null && Math.abs(paceDiag.delta) > 25)
      insights.push({
        title: paceDiag.delta > 0 ? "The month is running warm" : "The month is running cool",
        body: `${money(spent)} spent so far, against ${money(paceDiag.expectedNormal)} by this day in your last three months.`,
        tone: paceDiag.delta > 0 ? "warn" : "ok",
      });
    if (income > 0)
      insights.push({
        title: `Saving ${Math.round(savingsRate)}% of what comes in`,
        body: savingsRate >= 15
          ? `${money(goalMonthly)} a month heads to goals — a pace most plans call comfortable.`
          : `${money(goalMonthly)} a month heads to goals. Many plans target 15–20%; yours is a choice, not a rule.`,
        tone: savingsRate >= 15 ? "ok" : "",
      });
  }

  /* ---- the stewardship read: the whole picture in seven buckets ------
     Provision, needs, giving, obligations, saving, enjoyment, future.
     Buckets are assigned from what the household already declared —
     essential flags, groups, roles — never inferred from spending. ---- */
  const bucketOf = (e) => {
    if (e.group === "Giving" || e.role === "tithe") return "giving";
    if (e.role === "tax" || e.name === "Debt payments") return "obligations";
    if (e.role === "spending" || e.group === "Lifestyle") return "enjoyment";
    if (e.essential) return "needs";
    return "needs";
  };
  const bSum = { giving: [0, 0], obligations: [0, 0], enjoyment: [0, 0], needs: [0, 0] };
  plan.envelopes.forEach((e) => {
    const b = bSum[bucketOf(e)];
    b[0] += e.planned; b[1] += spentBy[e.id] || 0;
  });
  /* The giving commitment can live as envelopes (Giving group), as the
     waterfall's off-the-top stage, or both describing the same dollars —
     take the larger, so Our Plan and Stewardship can never disagree. */
  const titheFunded = (flow.rows.find((r) => r.key === "tithe") || { funded: 0 }).funded;
  const givingPlanned = Math.max(bSum.giving[0], titheFunded);
  const givingPct = income > 0 ? (givingPlanned / income) * 100 : 0;
  const invested = assets.filter((a) => a.type === "invest").reduce((n, a) => n + a.balance, 0);
  const stewardship = [
    {
      key: "provision", label: "Provision", figure: income, foot: "comes in each month",
      sentence: income > 0
        ? `${money(pA.income)} from ${pA.name}'s work, ${money(pB.income)} from ${pB.name}'s — all of it arrives with a job to do.`
        : "Add what you each bring home in Settings.",
      tone: income > 0 ? "" : "warn",
    },
    {
      key: "needs", label: "Needs", figure: bSum.needs[0], foot: `planned · ${money(bSum.needs[1])} spent`,
      sentence: bSum.needs[1] > bSum.needs[0] && bSum.needs[0] > 0
        ? `Housing, food, and the rest of the essentials are ${money(bSum.needs[1] - bSum.needs[0])} over plan this month.`
        : "Housing, food, transport, health — covered before anything else is.",
      tone: bSum.needs[1] > bSum.needs[0] && bSum.needs[0] > 0 ? "warn" : "ok",
    },
    {
      key: "giving", label: "Giving", figure: givingPlanned, foot: `planned · ${money(bSum.giving[1])} given so far`,
      sentence: givingPlanned > 0
        ? `${Math.round(givingPct)}% of what comes in is committed to giving, off the top — not from what's left over.`
        : "Nothing set apart for giving yet — choose a number in Our Plan, or add a Giving envelope. Yours to decide.",
      tone: givingPlanned > 0 ? "ok" : "",
    },
    {
      key: "obligations", label: "Obligations", figure: debtMin + fundedExtra, foot: `a month · ${money(debtTotal)} still owed`,
      sentence: debtTotal <= 0 ? "Nothing owed to anyone."
        : debt.avalanche.never ? "At these payments the debt never clears — the minimums have to rise first."
          : `Debt and the tax set-aside, honoured on time — debt-free ${monthLabel(debt.avalanche.payoffMonth)} at this pace.`,
      tone: debt.avalanche.never ? "warn" : "ok",
    },
    {
      key: "saving", label: "Saving", figure: goalMonthly, foot: "a month toward what's ahead",
      sentence: flow.efTarget > 0
        ? `The emergency fund holds ${money(efGoalRef ? efGoalRef.saved : 0)} of its ${money(flow.efTarget)} target — margin for the months you can't see yet.`
        : "Set an emergency fund target in The plan to give saving a floor.",
      tone: efGoalRef && flow.efTarget > 0 && efGoalRef.saved >= flow.efTarget ? "ok" : "",
    },
    {
      key: "enjoyment", label: "Enjoyment", figure: bSum.enjoyment[0], foot: `planned · ${money(bSum.enjoyment[1])} spent`,
      sentence: bSum.enjoyment[1] > bSum.enjoyment[0] && bSum.enjoyment[0] > 0
        ? `Meals out, spending money, the fun — ${money(bSum.enjoyment[1] - bSum.enjoyment[0])} past what was agreed.`
        : "Meals out, hobbies, each of you with money that's nobody's business — agreed, and enjoyed without guilt.",
      tone: bSum.enjoyment[1] > bSum.enjoyment[0] && bSum.enjoyment[0] > 0 ? "warn" : "ok",
    },
    {
      key: "future", label: "Future", figure: invested, foot: `invested · saving ${Math.round(savingsRate)}% of income`,
      sentence: savingsRate >= 15
        ? "Retirement and what comes after are getting their share now, while it's cheap."
        : `${Math.round(savingsRate)}% of income is heading to the future — most plans get comfortable at 15%.`,
      tone: savingsRate >= 15 ? "ok" : "",
    },
  ];

  /* ---- decisions set aside (pray on it / sleep on it) ----------------
     A deferred decision is left alone until its date. The planner is told
     not to advocate for it; the app resurfaces it once, gently. ---- */
  const todayISO = new Date().toISOString().slice(0, 10);
  const decisions = (state.decisions || []).map((d) => ({
    ...d,
    due: d.until <= todayISO,
    daysLeft: Math.max(0, Math.ceil((new Date(d.until + "T12:00:00") - now) / dayMs)),
  }));
  const decisionsDue = decisions.filter((d) => d.due);

  /* ---- can we afford it? --------------------------------------------
     The verdict is pure arithmetic. When the answer is yes, one quiet
     line shows what the same money would do pointed at their own goals —
     space between wanting and buying, not a lecture. ---- */
  const affordLite = { assets, billsLeft, flow, monthOutlook };
  const afford = (cost) => {
    const r = affordability({ cost, m: affordLite });
    if (r && (r.verdict === "yes" || r.verdict === "tradeoff") && cost >= 100) {
      const goal = state.goals
        .filter((g) => g.monthly > 0 && g.saved < g.target)
        .sort((a, b) => b.monthly - a.monthly)[0];
      if (goal) {
        const mo = cost / goal.monthly;
        r.reasons.push(`Set aside instead, ${money(cost)} is about ${mo < 10 ? mo.toFixed(1) : Math.round(mo)} months of ${goal.name}.`);
      }
    }
    return r;
  };

  /* ---- merchant memory ---- */
  const merchantMap = state.merchantMap || {};

  const merchantFavourites = () =>
    Object.values(merchantMap)
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .map((v) => v.env)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 3);

  /**
   * Memory first, model second, last-used third, and always confirmable.
   * `why` drives one line of provenance so a wrong guess is legible.
   */
  const matchEnvelope = (merchant, suggested) => {
    const fallback = plan.envelopes[0] ? plan.envelopes[0].id : "";
    const key = merchantKey(merchant);

    const remembered = key && merchantMap[key];
    if (remembered) {
      const e = envByName(remembered.env);
      if (e) return { envId: e.id, who: remembered.who || state.ui.defaultWho || "joint", why: "learned" };
    }

    if (suggested) {
      const exact = envByName(suggested);
      const loose = exact || plan.envelopes.find((e) => e.name.toLowerCase() === String(suggested).toLowerCase());
      if (loose) return { envId: loose.id, who: state.ui.defaultWho || "joint", why: "photo" };
    }

    if (key) {
      const recent = plan.entries.find((t) => merchantKey(t.merchant || t.note) === key);
      if (recent && plan.envelopes.some((e) => e.id === recent.envId))
        return { envId: recent.envId, who: recent.who, why: "recent" };
    }

    return { envId: fallback, who: state.ui.defaultWho || "joint", why: "guess" };
  };

  /* ---- notes: what needs attention, worst first ---- */
  const notes = [];
  if (income === 0) notes.push(["joint", "Add what you each take home in Settings — everything else builds from that."]);

  Object.values(debt.avalanche.perDebt).forEach((d) => {
    if (d.underwater)
      notes.push(["warn", `The minimum on ${d.name} doesn't cover its interest — the balance grows every month.`]);
  });
  if (debt.avalanche.never && debt.avalanche.neverReason === "budget-below-interest")
    notes.push(["warn", "At these payments your debt never clears. The minimums have to rise before a payoff date means anything."]);

  if (!tax.incomplete) {
    const overdueQ = tax.quarters.find((q) => q.past && !q.paid && q.amount > 0);
    if (overdueQ) notes.push(["warn", `${overdueQ.label} estimated tax of ${money(overdueQ.amount)} was due ${overdueQ.dueDate} and isn't marked paid.`]);
    else if (tax.reserveDelta < -1) notes.push(["warn", `You're ${money(-tax.reserveDelta)} behind on tax reserve — about ${money(tax.catchUpPerMonth)} a month to catch up.`]);
  }

  if (flow.totalShortfall > 1)
    notes.push(["warn", `Your plan runs out at ${flow.rows.find((r) => r.underfunded).label.toLowerCase()} — ${money(flow.totalShortfall)} short.`]);
  if (unallocated > 1) notes.push(["joint", `${money(unallocated)} a month is unassigned. Park it in a goal or an envelope.`]);
  if (unallocated < -1) notes.push(["warn", `Your plan outruns income by ${money(-unallocated)} a month.`]);

  /* Personal spending money is agreed, no questions asked — the app watches
     the household total, never announces what one person spent. */
  plan.envelopes.forEach((e) => {
    if (e.role === "spending") return;
    const s = spentBy[e.id] || 0;
    if (e.planned > 0 && s > e.planned) notes.push(["warn", `${e.name} is ${money(s - e.planned)} over plan.`]);
  });
  const discEnvs = plan.envelopes.filter((e) => e.role === "spending");
  const discPlanned = discEnvs.reduce((n, e) => n + e.planned, 0);
  const discSpent = discEnvs.reduce((n, e) => n + (spentBy[e.id] || 0), 0);
  if (discPlanned > 0) {
    const discLeft = discPlanned - discSpent;
    if (discLeft < 0)
      notes.push(["warn", `Household spending money is ${money(-discLeft)} past the agreed amount this month.`]);
    else if (discLeft < discPlanned * 0.2)
      notes.push(["joint", `Household spending money is close to its limit — ${money(discLeft)} left through ${monthLabel(month)}.`]);
  }
  bills.filter((b) => b.overdue).forEach((b) => notes.push(["warn", `${b.name} was due the ${ordinal(b.day)} and isn't marked paid.`]));
  bills.filter((b) => b.dueSoon).forEach((b) => notes.push(["joint", `${b.name} (${money(b.amount)}) is due the ${ordinal(b.day)}.`]));

  decisionsDue.forEach((d) => {
    notes.push(["joint", `You set ${d.what || money(d.cost)} aside to sit with. The time you agreed on has come — worth deciding together.`]);
  });

  state.goals.forEach((g) => {
    const st = goalStatus(g);
    if (st.late) notes.push(["warn", `${g.name} misses ${monthLabel(g.due)} at ${money(g.monthly)}/mo — it needs ${money(st.needed)}.`]);
    else if (st.done) notes.push(["a", `${g.name} is fully funded. Redirect ${money(g.monthly)}.`]);
  });
  if (flow.efFunded) notes.push(["a", `Your emergency fund is at ${money(flow.efTarget)} — ${state.waterfall.emergencyMonths} months of essentials. Redirect what was going in.`]);

  if (debtTotal > 0 && income > 0) {
    const ratio = (debtMin / income) * 100;
    if (ratio > 36) notes.push(["warn", `Debt payments take ${Math.round(ratio)}% of income. Past roughly 36%, everything else gets squeezed.`]);
  }
  if (income > 0 && savingsRate < 10) notes.push(["joint", `You're saving ${Math.round(savingsRate)}% of income. Most plans get comfortable at 15–20%.`]);
  if (!notes.length) notes.push(["a", "Nothing needs your attention. Log spending as it happens."]);

  const jointCost = plan.envelopes.filter((e) => e.owner === "joint").reduce((n, e) => n + e.planned, 0) + goalMonthly;

  /* ---- the money steps ladder --------------------------------------
     The order financial planners walk clients through, adapted for a
     1099 household: essentials, then the tax set-aside (nobody withholds
     for you), then a starter emergency fund, then expensive debt, then
     the full fund, then saving for what's next. The current step is the
     first one that isn't done — everything on this ladder is computed
     from their real numbers, never asserted.
     ------------------------------------------------------------------ */
  const efGoal = flow.efGoal;
  const efSaved = efGoal ? efGoal.saved : 0;
  const stageOk = (key) => {
    const r = flow.rows.find((x) => x.key === key);
    return r ? r.shortfall < 1 : true;
  };
  const HIGH_APR = 8;
  const highDebts = debts.filter((d) => (d.apr || 0) >= HIGH_APR && d.balance > 0);
  const worstDebt = [...highDebts].sort((x, y) => (y.apr || 0) - (x.apr || 0))[0];
  const worstPayoff = worstDebt && debt.avalanche.perDebt[worstDebt.id]
    ? debt.avalanche.perDebt[worstDebt.id].payoffMonth : null;

  const stepDefs = [
    {
      key: "essentials", label: "Cover the essentials",
      ok: income > 0 && stageOk("fixedBills") && stageOk("essentials"),
      detail: income <= 0 ? "Start with what you each bring home."
        : stageOk("fixedBills") && stageOk("essentials")
          ? "Bills and essentials are covered by what comes in."
          : `The plan runs out before essentials are covered — ${money(flow.totalShortfall)} short.`,
    },
    {
      key: "tax", label: "Set aside for taxes",
      ok: !tax.incomplete && tax.reserveDelta > -1,
      detail: tax.incomplete ? "Add what you each bill and the app sizes it."
        : tax.reserveDelta > -1
          ? `On pace — ${money(tax.monthlyReserve)} a month.`
          : `${money(-tax.reserveDelta)} behind — about ${money(tax.catchUpPerMonth)} a month catches up.`,
    },
    {
      key: "starter", label: "Save the first $1,000",
      ok: efSaved >= 1000,
      detail: !efGoal ? "Add an emergency fund goal to start."
        : efSaved >= 1000 ? `${money(efSaved)} in ${efGoal.name}.`
          : `${money(efSaved)} saved — this is what keeps a flat tire off the credit card.`,
    },
    {
      key: "highDebt", label: "Clear the expensive debt",
      ok: highDebts.length === 0,
      detail: highDebts.length === 0 ? `Nothing left above ${HIGH_APR}%.`
        : `${worstDebt.name} at ${worstDebt.apr}% costs more than saving earns${worstPayoff ? ` — clears ${monthLabel(worstPayoff)} at the current pace` : ""}.`,
    },
    {
      key: "fullFund", label: `Build the full emergency fund`,
      ok: !!efGoal && efSaved >= flow.efTarget && flow.efTarget > 0,
      detail: !efGoal ? "Add an emergency fund goal to start."
        : efSaved >= flow.efTarget && flow.efTarget > 0
          ? `${money(efSaved)} — ${state.waterfall.emergencyMonths} months of essentials.`
          : `${money(efSaved)} of ${money(flow.efTarget)} — ${state.waterfall.emergencyMonths} months of keeping the lights on.`,
    },
    {
      key: "save15", label: "Put 15% toward what's next",
      ok: savingsRate >= 15,
      detail: savingsRate >= 15
        ? `Saving ${Math.round(savingsRate)}% of income.`
        : `Saving ${Math.round(savingsRate)}% now — most plans get comfortable at 15–20%.`,
    },
  ];
  let currentIdx = stepDefs.findIndex((s) => !s.ok);
  if (currentIdx === -1) currentIdx = stepDefs.length;
  const steps = stepDefs.map((s, i) => ({
    ...s, n: i + 1,
    state: s.ok ? "done" : i === currentIdx ? "current" : "later",
  }));
  const currentStep = steps[Math.min(currentIdx, steps.length - 1)];

  /* ---- "enough" ------------------------------------------------------
     The ladder doubles as the household's definition of enough: taxes on
     pace, the fund full, nothing expensive owed, 15% moving forward.
     Money past that line isn't a score to run up — it opens a different
     conversation (give / save / enjoy / invest / help family), and the
     app never picks for them. ---- */
  const enoughThresholds = [
    { key: "tax", label: "Taxes always set aside", done: stepDefs[1].ok },
    { key: "debt", label: `Nothing owed above ${HIGH_APR}%`, done: stepDefs[3].ok },
    { key: "ef", label: "Emergency fund at its target", done: stepDefs[4].ok },
    { key: "save", label: "15% moving toward what's next", done: stepDefs[5].ok },
  ];
  const enoughMet = enoughThresholds.every((t) => t.done);
  const enoughSurplus = enoughMet ? Math.max(0, monthOutlook.available) : 0;
  const enough = {
    note: (state.enough && state.enough.note) || "",
    thresholds: enoughThresholds,
    met: enoughMet,
    surplus: enoughSurplus,
    sentence: enoughMet
      ? (enoughSurplus >= 50
        ? `Everything you called enough is in place. About ${money(enoughSurplus)} this month sits beyond your planned needs — that's not a problem to optimise, it's a decision to make together.`
        : "Everything you called enough is in place, and this month closes without much beyond it.")
      : `Not there yet — ${enoughThresholds.filter((t) => !t.done).length} of ${enoughThresholds.length} thresholds still ahead of you.`,
  };

  /* ---- the one thing to do next ------------------------------------
     A planner leads with a single action, not a pile of warnings.
     Severity order matches the ladder; ties break toward whatever is
     costing money right now.
     ------------------------------------------------------------------ */
  const overdueQ = !tax.incomplete && tax.quarters.find((q) => q.past && !q.paid && q.amount > 0);
  const firstOverdueBill = bills.find((b) => b.overdue);
  const overEnv = plan.envelopes.find((e) => e.planned > 0 && (spentBy[e.id] || 0) > e.planned);
  const lateGoal = state.goals.map((g) => ({ g, st: goalStatus(g) })).find((x) => x.st.late);

  let nextAction;
  if (income === 0)
    nextAction = { title: "Add what you each bring home", why: "The budget, the tax set-aside, and the payoff date all build from that one number.", view: "settings", cta: "Open settings" };
  else if (firstOverdueBill)
    nextAction = { title: `Pay ${firstOverdueBill.name}`, why: `It was due the ${ordinal(firstOverdueBill.day)} — ${money(firstOverdueBill.amount)}.`, view: "bills", cta: "Open bills" };
  else if (overdueQ)
    nextAction = { title: `Send the ${overdueQ.label} tax payment`, why: `${money(overdueQ.amount)} was due ${overdueQ.dueDate}. Late payments accrue penalties monthly.`, view: "taxes", cta: "Open taxes" };
  else if (debt.avalanche.never && debt.avalanche.neverReason === "budget-below-interest")
    nextAction = { title: "Raise the minimums on your debt", why: "At these payments the balances grow faster than you pay them down — no payoff date exists yet.", view: "worth", cta: "Open debts" };
  else if (!tax.incomplete && tax.reserveDelta < -1)
    nextAction = { title: `Move ${money(Math.min(-tax.reserveDelta, tax.catchUpPerMonth))} to the tax reserve`, why: `You're ${money(-tax.reserveDelta)} behind on setting tax money aside.`, view: "taxes", cta: "Open taxes" };
  else if (flow.totalShortfall > 1)
    nextAction = { title: "Rebalance the plan", why: flow.sentence, view: "plan", cta: "Open the plan" };
  else if (overEnv)
    nextAction = { title: `Cover ${overEnv.name}`, why: `It's ${money((spentBy[overEnv.id] || 0) - overEnv.planned)} over — move that from a lighter envelope.`, view: "budget", cta: "Open envelopes" };
  else if (unallocated > 1)
    nextAction = { title: `Give ${money(unallocated)} a job`, why: "Unassigned money gets spent by accident. An envelope, a goal, or a payment against what you owe.", view: "plan", cta: "Open the plan" };
  else if (lateGoal)
    nextAction = { title: `${lateGoal.g.name} needs ${money(lateGoal.st.needed)}/mo`, why: `At ${money(lateGoal.g.monthly)} a month it misses ${monthLabel(lateGoal.g.due)}.`, view: "goals", cta: "Open goals" };
  else if (currentStep && currentStep.state === "current")
    nextAction = { title: currentStep.label, why: currentStep.detail, view: "plan", cta: "See the steps" };
  else
    nextAction = { title: "Nothing needs you today", why: "Log spending as it happens and the plan keeps itself honest.", view: "txn", cta: "Open transactions" };
  nextAction.step = `Step ${Math.min(currentIdx + 1, steps.length)} of ${steps.length}`;

  /* ---- getting-started checklist (shown while the household is thin) ---- */
  const anyEntry = Object.values(state.months).some((mm) => (mm.entries || []).length > 0);
  const setupSteps = [
    { key: "income", label: "Add what you each bring home", done: income > 0, view: "settings" },
    { key: "bills", label: "List the bills that repeat", done: state.bills.length > 0, view: "bills" },
    { key: "tax", label: "Add your 1099 income", done: !tax.incomplete, view: "taxes" },
    { key: "accounts", label: "Add accounts and debts", done: state.accounts.length > 0, view: "worth" },
    { key: "goal", label: "Give a goal a target", done: state.goals.some((g) => g.target > 0), view: "goals" },
    { key: "first", label: "Log your first expense", done: anyEntry, view: "txn" },
  ];
  const setupDone = setupSteps.every((s) => s.done);

  /* ---- the headline sentence ---- */
  let thesis;
  if (income === 0) thesis = ["Start with what you each bring home.", "The plan, the goals, and the read on your month all build from that one number."];
  else if (flow.totalShortfall > 1) thesis = [flow.sentence, "Something above it has to come down, or something below it goes unfunded."];
  else if (unallocated < -1) thesis = [`You've planned ${money(-unallocated)} more than you earn.`, "Something has to come down before the month starts spending itself."];
  else {
    const over = plan.envelopes.filter((e) => e.planned > 0 && (spentBy[e.id] || 0) > e.planned);
    if (over.length) thesis = [`${over[0].name} is over by ${money((spentBy[over[0].id] || 0) - over[0].planned)}.`, "Everything else is holding — move money from a lighter envelope to cover it."];
    else if (unallocated > 1) thesis = [`${money(unallocated)} still has no job.`, "Give it one — an envelope, a goal, or a payment against what you owe."];
    else thesis = ["Every dollar has a job this month.", `${money(leftToSpend)} left to spend, ${money(goalMonthly)} heading toward what's next.`];
  }

  /* The phone's above-the-fold read: one figure, one sentence. */
  const overdueBill = bills.find((b) => b.overdue);
  let stateLine;
  if (income === 0) stateLine = ["—", "Left to spend", "Add what you each take home in Settings.", ""];
  else if (overdueBill)
    stateLine = [money(leftToSpend), "Left to spend",
      `${overdueBill.name} was due the ${ordinal(overdueBill.day)} and isn't marked paid.`,
      `${money(billsLeft)} of bills still to go.`];
  else stateLine = [money(leftToSpend), "Left to spend", thesis[0], thesis[1]];

  return {
    pA, pB, income, spentBy, spentByWho, planned, spent, goalMonthly, allocated, unallocated,
    leftToSpend, savingsRate, assets, debts, assetTotal, debtTotal, netWorth, debtMin, byGroup,
    goalStatus, history, bills, billsTotal, billsLeft, dueSoonList, payoff, notes, thesis, shareA, jointCost,
    tax, flow, debt, fundedExtra,
    dayOfMonth, daysLeft, daysInMonth: dim, pacePct, expectedSpend, paceDelta,
    envRemaining, tightest, recentEnvIds, topSpend, stateLine, live,
    steps, currentStep, nextAction, setupSteps, setupDone,
    avgByName, threeMoAvgTotal, paceDiag, monthOutlook, week, weekKey, forecast12, afford, calendar,
    stewardship, decisions, decisionsDue, enough,
    cashOnHand, billsCovered, celebrate, insights, taxOverdue: !!overdueQ, today,
    envByName, matchEnvelope, merchantFavourites,
    merchantCount: Object.keys(merchantMap).length,
    ownerColor: (o) => (o === "a" ? C.a : o === "b" ? C.b : C.joint),
    ownerName: (o) => (o === "a" ? pA.name : o === "b" ? pB.name : "Both"),
  };
}
