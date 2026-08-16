/* ==================================================================
   the Planner's eyes and voice, shared by every surface that talks to it

   buildSnapshot() is everything the Planner can see — all of it read off
   m and state, none of it computed here. buildSystem() is the voice and
   the guardrails. callPlanner() is the one network path.

   Two rules live in the prompt and must survive any edit:
   - the no-surveillance rule (household money, never one person's), and
   - the Planner never speaks for God. Principles, not verdicts; the
     couple decides.
   ================================================================== */

import { money, monthLabel } from "./format.js";
import { API_URL } from "./receipt.js";

export function buildSnapshot({ m, state, plan, month }) {
  return {
    month: monthLabel(month),
    partners: [m.pA, m.pB].map((p) => ({ name: p.name, monthlyTakeHome: p.income })),
    splitRule: state.household.splitRule,
    monthlyIncome: m.income,
    monthOutlook: {
      spentSoFar: m.spent,
      projectedRestOfMonth: m.monthOutlook.projectedRest,
      expectedLeftOver: m.monthOutlook.available,
      recommendedSplit: m.monthOutlook.rec,
      onTrack: m.monthOutlook.onTrack,
    },
    spendingVsNormal: m.paceDiag ? {
      aboveNormalPaceBy: Math.round(m.paceDiag.delta),
      biggestIncreases: m.paceDiag.over.map((r) => ({ envelope: r.name, above: Math.round(r.delta) })),
      biggestDecreases: m.paceDiag.under.map((r) => ({ envelope: r.name, below: Math.round(-r.delta) })),
    } : null,
    threeMonthAverageByEnvelope: m.avgByName,
    houseRules: (state.rules || []).map((r) => r.text),
    envelopes: plan.envelopes.map((e) => ({
      name: e.name, group: e.group, planned: e.planned,
      spentSoFar: m.spentBy[e.id] || 0, coveredBy: m.ownerName(e.owner),
      essential: !!e.essential, personalSpendingMoney: e.role === "spending",
    })),
    recurringBills: m.bills.map((b) => ({ name: b.name, amount: b.amount, dueDay: b.day, paidThisMonth: b.paid })),
    goals: state.goals.map((g) => {
      const st = m.goalStatus(g);
      return {
        name: g.name, kind: g.role || "general", target: g.target, saved: g.saved, monthly: g.monthly,
        wantItBy: g.due || null, projectedFinish: st.eta ? monthLabel(st.eta) : null, behindSchedule: st.late,
      };
    }),
    accounts: state.accounts.map((a) => ({
      name: a.name, type: a.type, balance: a.balance, apr: a.apr || null, minPayment: a.minPayment || null,
    })),
    allocation: {
      order: m.flow.rows.map((r) => ({ stage: r.label, needs: r.need, funded: r.funded, short: r.shortfall })),
      spendingMoney: m.flow.spending,
      leftOver: m.flow.leftover,
      shortfall: m.flow.totalShortfall,
      emergencyFundTarget: m.flow.efTarget,
      monthlyCostToKeepLightsOn: m.flow.monthlyEssentialSpend,
    },
    debtPayoff: m.debt.avalanche.hasDebt ? {
      strategy: "highest rate first",
      neverClears: m.debt.avalanche.never,
      monthsToDebtFree: m.debt.avalanche.months,
      debtFreeBy: m.debt.avalanche.payoffMonth ? monthLabel(m.debt.avalanche.payoffMonth) : null,
      totalInterest: m.debt.avalanche.totalInterest,
      monthlyOutlay: m.debt.avalanche.budget,
      attackOrder: m.debt.avalanche.order,
      whatAnotherHundredBuys: m.debt.plus100,
      perDebt: Object.values(m.debt.avalanche.perDebt).map((d) => ({
        name: d.name, apr: d.apr, balance: d.startBalance,
        paidOffBy: d.payoffMonth ? monthLabel(d.payoffMonth) : null,
        minimumDoesNotCoverInterest: d.underwater,
      })),
    } : null,
    taxReserveEstimate: m.tax.incomplete ? null : {
      disclaimer: "An estimate for setting money aside. Not tax advice, and not a filing. Do not present these as filed or owed figures.",
      estimatedTotalTax: m.tax.totalTax,
      estimatedMonthlyReserve: m.tax.monthlyReserve,
      reservedSoFar: m.tax.reservedToDate + m.tax.paidToDate,
      aheadOrBehind: m.tax.reserveDelta,
      quarters: m.tax.quarters.map((qq) => ({ quarter: qq.label, due: qq.dueDate, amount: qq.amount, markedPaid: qq.paid })),
    },
    twelveMonthLookAhead: m.forecast12.map((f) => ({
      month: monthLabel(f.month, true),
      projectedDebtBalance: f.debt === null ? "never clears at current payments" : Math.round(f.debt),
      projectedGoalSavings: Math.round(f.goalsSaved),
      accumulatedCushion: Math.round(f.cushion),
    })),
    netWorth: m.netWorth,
    totalDebt: m.debtTotal,
    unassignedEachMonth: m.unallocated,
    savingsRatePct: Math.round(m.savingsRate),
    lastSixMonths: m.history.map((h) => ({ month: h.label, spent: h.spent })),
    thisWeek: m.week ? {
      spent: m.week.spent, weeklyAverage: Math.round(m.week.weeklyAvg),
      vsAverage: m.week.delta === null ? null : Math.round(m.week.delta),
      givenThisWeek: m.week.giving,
      upcomingBills: m.week.upcoming.map((b) => ({ name: b.name, amount: b.amount, dueInDays: b.dueIn })),
      extraAvailableThisMonth: m.week.decision,
    } : null,
    decisionsSetAside: m.decisions.map((d) => ({
      what: d.what, cost: d.cost, revisitOn: d.until, readyToRevisit: d.due,
    })),
    stewardship: m.stewardship.map((b) => ({ bucket: b.label, monthlyFigure: Math.round(b.figure), state: b.sentence })),
    enough: {
      householdsOwnDefinition: m.enough.note || null,
      thresholds: m.enough.thresholds.map((t) => ({ threshold: t.label, met: t.done })),
      allThresholdsMet: m.enough.met,
      surplusBeyondEnoughThisMonth: Math.round(m.enough.surplus),
    },
  };
}

export function buildSystem({ m, state, snapshot }) {
  const faith = !!(state.faith && state.faith.enabled);
  /* off | relevant | more — how often biblical perspective may surface */
  const scripture = faith ? ((state.faith && state.faith.scripture) || "relevant") : "off";
  return (
    `You are the household financial Planner for ${m.pA.name} and ${m.pB.name}, a couple who share money and are both self-employed on 1099 income. ` +
    `Speak plainly and warmly, like a planner who knows them. Be specific: use their real numbers and their own category names. ` +
    `Lead with one clear recommendation rather than a menu of options, then the reasoning. Keep it under 180 words unless asked for more. ` +
    `Never invent numbers that aren't in the snapshot — if something is missing, name what they should fill in. For "what if" questions, reason from the twelve-month look-ahead and the three-month averages, and present it as an approximation. Scenario answers describe what would happen; they never change the plan itself — changing the plan is theirs to do in the app. ` +
    `Stay neutral between the two of them; never take a side in a disagreement about money. ` +
    `Their house rules are in the snapshot — hold every answer against them, and when a rule shapes your recommendation, name the rule in one line ("You both set a $2,000 checking floor"). ` +
    `Personal spending money is agreed and private: never report, total, or comment on what one person spent theirs on. Talk about household discretionary money as a whole. ` +
    `The tax figures are a set-aside estimate, not a filing — say so if you quote them. ` +
    `You are not a licensed advisor: for tax, legal, insurance, or investment-product decisions, say so in one line and point them to a professional. ` +
    `Decisions listed as set aside in the snapshot are deliberately resting: do not advocate for or against them unless asked about one directly.\n\n` +
    (faith
      ? `This household practices Christian stewardship, and asked for money to be held that way. Frame things, where it fits naturally, around three relationships: money and God (stewardship and generosity), money and their marriage (unity, one household, decisions made together), and money and the future (wisdom, preparation, legacy). You may explain why the household handles money this way — giving off the top, patience before big purchases, contentment over comparison — rather than presenting rules as arbitrary. ` +
        (scripture === "off"
          ? `They have turned Scripture references off: hold the stewardship framing, but do not quote or cite Scripture.`
          : scripture === "more"
            ? `They welcome biblical perspective: you may offer a short relevant passage (reference plus a phrase) when a question touches money's meaning, not just its math — still at most one per answer, and only where it genuinely fits.`
            : `Scripture: offer it only when a question genuinely touches worry, contentment, generosity, disagreement, or a weighty decision — at most one short passage, reference plus a phrase, introduced as a biblical principle that may be relevant. Never as decoration, never to shame.`) +
        ` The line you never cross: you do not speak for God. Never say or imply that God wants, approves of, or disapproves of a specific choice. Offer principles; then the decision is theirs, made together — say so when the decision is big. ` +
        `Purchases they can afford: say so plainly, then stop. No cheering consumption, no guilt over enjoying what they have. If they want to go deeper, walk through it with them: can we afford it, is the debt wise, why do we want it, does it crowd out what we've committed to, is this contentment or comparison. ` +
        `Their definition of enough is in the snapshot. When the numbers pass it, the conversation is give, save, enjoy, invest, or help family — never simply "maximise returns".\n\n`
      : ``) +
    `Snapshot (monthly amounts unless noted):\n${JSON.stringify(snapshot, null, 2)}`
  );
}

export async function callPlanner(system, messages, maxTokens = 8000) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-5",
      // thinking is on by default and max_tokens caps thinking + output together
      max_tokens: maxTokens,
      output_config: { effort: "medium" },
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error("planner http " + res.status);
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("refused");
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
}
