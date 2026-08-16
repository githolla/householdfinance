/* ==================================================================
   the planner — it answers with their numbers, not general advice

   Three jobs: the "can we afford it?" verdict (deterministic engine,
   AI phrasing), the weekly money meeting (briefing + one decision each
   partner votes on), and open questions against the full snapshot.

   House rule the code enforces, not just the prompt: the planner talks
   about household money, never about what one person spent.
   ================================================================== */

import { useState, useRef, useEffect } from "react";
import { money, monthLabel, num, C } from "../lib/format.js";
import { API_URL } from "../lib/receipt.js";
import { Head, Notes, SChip } from "../components.jsx";

const VOTE_LABELS = { savings: "Savings", debt: "Debt", cushion: "Keep it available" };

export default function Planner({ ctx }) {
  const { m, state, patch, plan, month } = ctx;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // can we afford it?
  const [what, setWhat] = useState("");
  const [cost, setCost] = useState("");
  const [verdict, setVerdict] = useState(null);
  const [verdictAi, setVerdictAi] = useState("");
  const [busyAfford, setBusyAfford] = useState(false);

  // money meeting
  const [busyMeeting, setBusyMeeting] = useState(false);
  const meeting = state.meeting || { key: "", briefing: "", votes: { a: null, b: null } };
  const meetingFresh = meeting.key === m.weekKey && meeting.briefing;

  const logRef = useRef(null);
  const chat = state.chat || [];
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [chat, busy]);

  /* ---- everything the planner can see ---- */
  const snapshot = {
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
      upcomingBills: m.week.upcoming.map((b) => ({ name: b.name, amount: b.amount, dueInDays: b.dueIn })),
      extraAvailableThisMonth: m.week.decision,
    } : null,
  };

  const SYSTEM =
    `You are the household financial planner for ${m.pA.name} and ${m.pB.name}, a couple who share money and are both self-employed on 1099 income. ` +
    `Speak plainly and warmly, like a planner who knows them. Be specific: use their real numbers and their own category names. ` +
    `Lead with one clear recommendation rather than a menu of options, then the reasoning. Keep it under 180 words unless asked for more. ` +
    `Never invent numbers that aren't in the snapshot — if something is missing, name what they should fill in. For "what if" questions, reason from the twelve-month look-ahead and the three-month averages, and present it as an approximation. ` +
    `Stay neutral between the two of them; never take a side in a disagreement about money. ` +
    `Their house rules are in the snapshot — hold every answer against them, and say so when an idea would break one. ` +
    `Personal spending money is agreed and private: never report, total, or comment on what one person spent theirs on. Talk about household discretionary money as a whole. ` +
    `The tax figures are a set-aside estimate, not a filing — say so if you quote them. ` +
    `You are not a licensed advisor: for tax, legal, insurance, or investment-product decisions, say so in one line and point them to a professional.\n\n` +
    `Snapshot (monthly amounts unless noted):\n${JSON.stringify(snapshot, null, 2)}`;

  const callPlanner = async (messages, maxTokens = 8000) => {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-5",
        // thinking is on by default and max_tokens caps thinking + output together
        max_tokens: maxTokens,
        output_config: { effort: "medium" },
        system: SYSTEM,
        messages,
      }),
    });
    const data = await res.json();
    if (data.stop_reason === "refusal") throw new Error("refused");
    return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  };

  const ask = async (text) => {
    const question = (text === undefined ? q : text).trim();
    if (!question || busy) return;
    const next = [...chat, { role: "user", content: question }];
    patch((s) => { s.chat = next; return s; });
    setQ(""); setErr(""); setBusy(true);
    try {
      const reply = await callPlanner(next.map((x) => ({ role: x.role, content: x.content })));
      patch((s) => { s.chat = [...next, { role: "assistant", content: reply || "No answer came back — try asking again." }]; return s; });
    } catch (e) {
      setErr("Couldn't reach your planner just now. Try again in a moment.");
    }
    setBusy(false);
  };

  /* ---- can we afford it? ---- */
  const checkAfford = async () => {
    const r = m.afford(num(cost));
    if (!r) return;
    setVerdict({ ...r, what: what.trim() });
    setVerdictAi("");
    setBusyAfford(true);
    try {
      const ai = await callPlanner([{
        role: "user",
        content:
          `We're deciding whether to spend ${money(r.cost)}${what.trim() ? ` on ${what.trim()}` : ""} this month. ` +
          `The deterministic verdict is "${r.label}" for these reasons: ${r.reasons.join(" ")} ` +
          `In 60 words or less: confirm or soften that verdict in your own voice, check it against the house rules by name if any apply, and give one practical suggestion. No headings.`,
      }], 3000);
      setVerdictAi(ai);
    } catch (e) { /* deterministic verdict already on screen */ }
    setBusyAfford(false);
  };

  /* ---- the weekly money meeting ---- */
  const runMeeting = async () => {
    if (!m.week) return;
    setBusyMeeting(true);
    try {
      const briefing = await callPlanner([{
        role: "user",
        content:
          `Write this week's five-minute money briefing for us. Use exactly these short sections, in this order, no headings other than the bold words: ` +
          `**This week** — what we spent (${money(m.week.spent)}) against our weekly average (${money(m.week.weeklyAvg)}), and the one or two envelopes that drove it. ` +
          `**Coming up** — bills due in the next two weeks from the snapshot. ` +
          `**Goals** — one line on the emergency fund and the next goal. ` +
          `**One decision** — we have about ${money(m.week.decision)} more available this month than planned; lay out savings vs debt vs keeping it available in one sentence each, using our numbers. ` +
          `Under 150 words total. No exclamation marks.`,
      }], 4000);
      patch((s) => {
        s.meeting = { key: m.weekKey, briefing, votes: { a: null, b: null } };
        return s;
      });
    } catch (e) {
      setErr("Couldn't reach your planner just now. Try again in a moment.");
    }
    setBusyMeeting(false);
  };

  const vote = (slot, choice) => patch((s) => {
    s.meeting.votes[slot] = choice;
    return s;
  });
  const votes = meeting.votes || { a: null, b: null };
  const bothVoted = votes.a && votes.b;
  const agree = bothVoted && votes.a === votes.b;

  const chips = [
    "Can we afford $600 for a trip next month?",
    "Why are we spending so much this month?",
    "Where should the extra go this month?",
    "What happens if we buy a $35,000 car in October?",
    "Are we holding back enough for taxes?",
    "Pay down the credit card or build the emergency fund?",
  ];

  const toneFor = (v) => (v === "yes" ? "ok" : v === "no" ? "over" : "warn");

  return (
    <>
      <Head title="Ask the planner" sub="It sees your income, envelopes, bills, goals, debt payoff, tax reserve, house rules, and the next twelve months." />

      <div className="grid g2" style={{ marginBottom: 16, alignItems: "start" }}>
        <div className="card">
          <div className="chead"><h3>Can we afford it?</h3><span className="meta">the verdict is arithmetic — the planner adds judgement</span></div>
          <div className="pair" style={{ marginBottom: 10 }}>
            <div>
              <label className="lbl">What is it</label>
              <input className="field" placeholder="New couch" value={what}
                onChange={(e) => setWhat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkAfford()} />
            </div>
            <div>
              <label className="lbl">Cost</label>
              <input className="field num" inputMode="decimal" placeholder="$2,400" value={cost}
                onChange={(e) => setCost(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkAfford()} />
            </div>
          </div>
          <button className="btn" onClick={checkAfford} disabled={num(cost) <= 0 || busyAfford}>
            {busyAfford ? "Checking…" : "Check it"}
          </button>
          {verdict && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <SChip tone={toneFor(verdict.verdict)}>{verdict.label}</SChip>
                {verdict.what && <span className="muted" style={{ fontSize: 12.5 }}>{verdict.what} · {money(verdict.cost)}</span>}
              </div>
              {verdict.reasons.map((r, i) => (
                <p className="empty" key={i} style={{ padding: "3px 0" }}>{r}</p>
              ))}
              {verdictAi && <div className="msg them" style={{ marginTop: 8 }}>{verdictAi}</div>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="chead">
            <h3>This week's money meeting</h3>
            <span className="meta">five minutes, once a week, nobody is the budget cop</span>
          </div>
          {!m.week ? (
            <p className="empty">The meeting runs on the current month — flip back to it to hold one.</p>
          ) : !meetingFresh ? (
            <>
              <p className="empty">
                A short briefing on the week: what you spent against your average, what's due,
                where the goals stand, and one decision to make together.
              </p>
              <button className="btn" onClick={runMeeting} disabled={busyMeeting}>
                {busyMeeting ? "Writing it…" : "Run this week's meeting"}
              </button>
            </>
          ) : (
            <>
              <div className="msg them" style={{ marginBottom: 12 }}>{meeting.briefing}</div>
              <label className="lbl">The decision — where does the extra {money(m.week.decision)} go?</label>
              {[["a", m.pA.name], ["b", m.pB.name]].map(([slot, name]) => (
                <div key={slot} style={{ display: "flex", alignItems: "center", gap: 6, margin: "7px 0", flexWrap: "wrap" }}>
                  <span style={{ minWidth: 64, fontWeight: 700, fontSize: 13, color: m.ownerColor(slot) }}>{name}</span>
                  {Object.entries(VOTE_LABELS).map(([k, label]) => (
                    <button key={k} className={"chip" + (votes[slot] === k ? " on" : "")}
                      onClick={() => vote(slot, k)}>{label}</button>
                  ))}
                </div>
              ))}
              {agree && (
                <p className="empty">You both chose <b>{VOTE_LABELS[votes.a].toLowerCase()}</b> — adjust it in The plan and it sticks.</p>
              )}
              {bothVoted && !agree && (
                <button className="chip" style={{ marginTop: 8 }} disabled={busy}
                  onClick={() => ask(`In this week's meeting, ${m.pA.name} voted to put the extra ${money(m.week.decision)} toward ${VOTE_LABELS[votes.a].toLowerCase()} and ${m.pB.name} voted for ${VOTE_LABELS[votes.b].toLowerCase()}. Compare what each choice does to our twelve-month picture, then suggest a fair split. Stay neutral between us.`)}>
                  You chose differently — show what each option does
                </button>
              )}
              <button className="btn ghost tiny" style={{ marginTop: 10 }} onClick={runMeeting} disabled={busyMeeting}>
                {busyMeeting ? "Writing it…" : "Re-run"}
              </button>
            </>
          )}
        </div>
      </div>

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
            <div className="chead"><h3>House rules it holds you to</h3></div>
            {(state.rules || []).length === 0
              ? <p className="empty">No rules yet — set them in Settings. Things like "keep checking above $2,000" or "each of us gets our spending money, no questions asked."</p>
              : (state.rules || []).map((r) => (
                <div className="note" key={r.id}><span className="tick" style={{ background: C.a }} /><span>{r.text}</span></div>
              ))}
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="chead"><h3>What it's looking at</h3></div>
            {[
              ["Income", m.income],
              ["Spent so far", m.spent],
              ["Bills still due", m.billsLeft],
              ["Expected left over", m.monthOutlook.available],
              ["Tax reserve", m.tax.incomplete ? 0 : m.tax.monthlyReserve],
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
