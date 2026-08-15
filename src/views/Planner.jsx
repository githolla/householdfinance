/* ==================================================================
   planner — it answers with their numbers, not general advice
   ================================================================== */

import { useState, useRef, useEffect } from "react";
import { money, monthLabel, C } from "../lib/format.js";
import { API_URL } from "../lib/receipt.js";
import { Head, Notes } from "../components.jsx";

export default function Planner({ ctx }) {
  const { m, state, patch, plan, month } = ctx;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const logRef = useRef(null);
  const chat = state.chat || [];

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [chat, busy]);

  const snapshot = {
    month: monthLabel(month),
    partners: [m.pA, m.pB].map((p) => ({ name: p.name, monthlyTakeHome: p.income })),
    splitRule: state.household.splitRule,
    monthlyIncome: m.income,
    envelopes: plan.envelopes.map((e) => ({
      name: e.name, group: e.group, planned: e.planned,
      spentSoFar: m.spentBy[e.id] || 0, coveredBy: m.ownerName(e.owner),
      essential: !!e.essential,
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
      interestSavedVsSmallestFirst: m.debt.diff.interest,
      whatAnotherHundredBuys: m.debt.plus100,
      perDebt: Object.values(m.debt.avalanche.perDebt).map((d) => ({
        name: d.name, apr: d.apr, balance: d.startBalance,
        paidOffBy: d.payoffMonth ? monthLabel(d.payoffMonth) : null,
        minimumDoesNotCoverInterest: d.underwater,
      })),
    } : null,
    taxReserveEstimate: m.tax.incomplete ? null : {
      disclaimer: "An estimate for setting money aside. Not tax advice, and not a filing. Do not present these as filed or owed figures.",
      taxYear: m.tax.assumptions.year,
      filingStatus: m.tax.assumptions.filingStatus,
      grossSelfEmploymentIncome: m.tax.gross1099Total,
      estimatedTotalTax: m.tax.totalTax,
      estimatedMonthlyReserve: m.tax.monthlyReserve,
      setAsidePctOfBillings: Math.round(m.tax.setAsidePct),
      reservedSoFar: m.tax.reservedToDate + m.tax.paidToDate,
      aheadOrBehind: m.tax.reserveDelta,
      quarters: m.tax.quarters.map((qq) => ({ quarter: qq.label, due: qq.dueDate, amount: qq.amount, markedPaid: qq.paid })),
    },
    netWorth: m.netWorth,
    totalDebt: m.debtTotal,
    unassignedEachMonth: m.unallocated,
    savingsRatePct: Math.round(m.savingsRate),
    lastSixMonths: m.history.map((h) => ({ month: h.label, spent: h.spent })),
  };

  const ask = async (text) => {
    const question = (text === undefined ? q : text).trim();
    if (!question || busy) return;
    const next = [...chat, { role: "user", content: question }];
    patch((s) => { s.chat = next; return s; });
    setQ(""); setErr(""); setBusy(true);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-opus-5",
          // Thinking is on by default on this model and max_tokens caps thinking
          // plus output together — a 1,000-token cap would truncate mid-answer.
          max_tokens: 8000,
          output_config: { effort: "medium" },
          system:
            `You are the household financial planner for ${m.pA.name} and ${m.pB.name}, a couple who share money and are both self-employed on 1099 income. ` +
            `Speak plainly and warmly, like a planner who knows them. Be specific: use their real numbers and their own category names. ` +
            `Lead with one clear recommendation rather than a menu of options, then the reasoning. Keep it under 180 words unless asked for more. ` +
            `Never invent numbers that aren't in the snapshot — if something is missing, name what they should fill in. ` +
            `Stay neutral between the two of them; never take a side in a disagreement about money. ` +
            `The tax figures are a set-aside estimate, not a filing — say so if you quote them. ` +
            `You are not a licensed advisor: for tax, legal, insurance, or investment-product decisions, say so in one line and point them to a professional.\n\n` +
            `Snapshot (monthly amounts unless noted):\n${JSON.stringify(snapshot, null, 2)}`,
          messages: next.map((x) => ({ role: x.role, content: x.content })),
        }),
      });
      const data = await res.json();
      if (data.stop_reason === "refusal") throw new Error("refused");
      const reply = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      patch((s) => { s.chat = [...next, { role: "assistant", content: reply || "No answer came back — try asking again." }]; return s; });
    } catch (e) {
      setErr("Couldn't reach your planner just now. Try again in a moment.");
    }
    setBusy(false);
  };

  const chips = [
    "Where should the extra go this month?",
    "Are we holding back enough for taxes?",
    "Pay down the credit card or build the emergency fund?",
    "What should we cut first?",
    "How should we split shared costs fairly?",
    "Is our tithe sustainable at this income?",
  ];

  return (
    <>
      <Head title="Planner" sub="It can see your income, envelopes, bills, goals, debt payoff, and tax reserve." />
      <div className="grid g23">
        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 470 }}>
          <div className="chatlog" ref={logRef} style={{ flex: 1, maxHeight: 460 }}>
            {chat.length === 0 && <p className="empty">Ask anything about your money. It answers with your numbers, not general advice.</p>}
            {chat.map((x, i) => <div key={i} className={"msg " + (x.role === "user" ? "me" : "them")}>{x.content}</div>)}
            {busy && <div className="msg them muted">Reading your numbers…</div>}
          </div>
          {err && <p className="empty" style={{ color: C.warn }}>{err}</p>}
          <div className="chips">{chips.map((c) => <button key={c} className="chip" onClick={() => ask(c)} disabled={busy}>{c}</button>)}</div>
          <div className="askrow">
            <input className="field" placeholder="Ask a question" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()} aria-label="Ask your planner" />
            <button className="btn" onClick={() => ask()} disabled={busy || !q.trim()}>Ask</button>
          </div>
          {chat.length > 0 && (
            <button className="btn ghost tiny" style={{ marginTop: 10, alignSelf: "flex-start" }}
              onClick={() => patch((s) => { s.chat = []; return s; })}>Clear conversation</button>
          )}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="chead"><h3>What it's looking at</h3></div>
            {[
              ["Income", m.income],
              ["Planned out", m.planned],
              ["Bills", m.billsTotal],
              ["Goals", m.goalMonthly],
              ["Tax reserve", m.tax.incomplete ? 0 : m.tax.monthlyReserve],
              ["Spending money", m.flow.spending.total],
              ["Net worth", m.netWorth],
            ].map(([k, v]) => (
              <div className="note" key={k} style={{ justifyContent: "space-between" }}>
                <span className="muted">{k}</span><span className="num">{money(v)}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="chead"><h3>Planner notes</h3></div>
            <Notes notes={m.notes} />
          </div>
        </div>
      </div>
    </>
  );
}
