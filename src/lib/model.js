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
import { debtPlan, simulateDebts, taxReserve, waterfall } from "./engines.js";
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

  plan.envelopes.forEach((e) => {
    const s = spentBy[e.id] || 0;
    if (e.planned > 0 && s > e.planned) notes.push(["warn", `${e.name} is ${money(s - e.planned)} over plan.`]);
  });
  bills.filter((b) => b.overdue).forEach((b) => notes.push(["warn", `${b.name} was due the ${ordinal(b.day)} and isn't marked paid.`]));
  bills.filter((b) => b.dueSoon).forEach((b) => notes.push(["joint", `${b.name} (${money(b.amount)}) is due the ${ordinal(b.day)}.`]));

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
    envByName, matchEnvelope, merchantFavourites,
    merchantCount: Object.keys(merchantMap).length,
    ownerColor: (o) => (o === "a" ? C.a : o === "b" ? C.b : C.joint),
    ownerName: (o) => (o === "a" ? pA.name : o === "b" ? pB.name : "Both"),
  };
}
