/* ==================================================================
   the planner — it answers with their numbers, not general advice

   Three jobs: the "can we afford it?" verdict (deterministic engine,
   AI phrasing), the weekly money meeting (briefing + one decision each
   partner votes on), and open questions against the full snapshot.

   House rules the code enforces, not just the prompt: the planner talks
   about household money, never about what one person spent — and when
   the faith layer is on, it offers biblical principles but never claims
   to speak for God. The decision is always theirs, made together.
   ================================================================== */

import { useState, useRef, useEffect } from "react";
import { money, monthLabel, num, C } from "../lib/format.js";
import { API_URL } from "../lib/receipt.js";
import { Head, Notes, SChip } from "../components.jsx";

export default function Planner({ ctx }) {
  const { m, state, patch, plan, month } = ctx;
  const faith = !!(state.faith && state.faith.enabled);
  const VOTE_LABELS = faith
    ? { savings: "Save it", give: "Give some", debt: "Debt", cushion: "Keep it available" }
    : { savings: "Savings", debt: "Debt", cushion: "Keep it available" };
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /* A question handed over from another view (the Stewardship surplus
     chips) lands in the box, never auto-sent — a person presses Ask. */
  useEffect(() => {
    const seed = state.ui && state.ui.plannerSeed;
    if (seed) {
      setQ(seed);
      patch((s) => { delete s.ui.plannerSeed; return s; });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const SYSTEM =
    `You are the household financial planner for ${m.pA.name} and ${m.pB.name}, a couple who share money and are both self-employed on 1099 income. ` +
    `Speak plainly and warmly, like a planner who knows them. Be specific: use their real numbers and their own category names. ` +
    `Lead with one clear recommendation rather than a menu of options, then the reasoning. Keep it under 180 words unless asked for more. ` +
    `Never invent numbers that aren't in the snapshot — if something is missing, name what they should fill in. For "what if" questions, reason from the twelve-month look-ahead and the three-month averages, and present it as an approximation. ` +
    `Stay neutral between the two of them; never take a side in a disagreement about money. ` +
    `Their house rules are in the snapshot — hold every answer against them, and say so when an idea would break one. ` +
    `Personal spending money is agreed and private: never report, total, or comment on what one person spent theirs on. Talk about household discretionary money as a whole. ` +
    `The tax figures are a set-aside estimate, not a filing — say so if you quote them. ` +
    `You are not a licensed advisor: for tax, legal, insurance, or investment-product decisions, say so in one line and point them to a professional. ` +
    `Decisions listed as set aside in the snapshot are deliberately resting: do not advocate for or against them unless asked about one directly.\n\n` +
    (faith
      ? `This household practices Christian stewardship, and asked for money to be held that way. Frame things, where it fits naturally, around three relationships: money and God (stewardship and generosity), money and their marriage (unity, one household, decisions made together), and money and the future (wisdom, preparation, legacy). You may explain why the household handles money this way — giving off the top, patience before big purchases, contentment over comparison — rather than presenting rules as arbitrary. ` +
      `Scripture: offer it only when a question genuinely touches worry, contentment, generosity, disagreement, or a weighty decision — at most one short passage, reference plus a phrase, introduced as a biblical principle that may be relevant. Never as decoration, never to shame. ` +
      `The line you never cross: you do not speak for God. Never say or imply that God wants, approves of, or disapproves of a specific choice. Offer principles; then the decision is theirs, made together — say so when the decision is big. ` +
      `Purchases they can afford: say so plainly, then stop. No cheering consumption, no guilt over enjoying what they have. If they want to go deeper, walk through it with them: can we afford it, is the debt wise, why do we want it, does it crowd out what we've committed to, is this contentment or comparison. ` +
      `Their definition of enough is in the snapshot. When the numbers pass it, the conversation is give, save, enjoy, invest, or help family — never simply "maximise returns".\n\n`
      : ``) +
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
          `In 60 words or less: confirm or soften that verdict in your own voice and check it against the house rules by name if any apply. ` +
          `If the answer is yes, state it plainly and stop — no cheering the purchase, no guilt. No headings.`,
      }], 3000);
      setVerdictAi(ai);
    } catch (e) { /* deterministic verdict already on screen */ }
    setBusyAfford(false);
  };

  /* ---- the weekly money meeting ----
     Two formats for one meeting: the stewardship version opens with
     gratitude and closes with a question to discuss, the neutral version
     sticks to the numbers. Both are the same five minutes. */
  const runMeeting = async () => {
    if (!m.week) return;
    setBusyMeeting(true);
    const prompt = faith
      ? `Write this week's stewardship meeting briefing for us. Use exactly these short sections, in this order, no headings other than the bold words: ` +
        `**Gratitude** — open with what's held, from the snapshot only: whether the bills are current, where the emergency fund stands, and that ${money(m.week.spent)} of provision was put to use this week. Plain thankfulness, no preaching. ` +
        `**Giving** — ${money(m.week.giving)} went to giving this week; one factual line. ` +
        `**Stewardship** — what we spent against our weekly average (${money(m.week.weeklyAvg)}), and the envelope that drove the difference. ` +
        `**Coming up** — bills due in the next two weeks from the snapshot. ` +
        `**One decision** — about ${money(m.week.decision)} is available this month beyond plan; lay out saving it, giving some, putting it toward debt, or keeping it available in one sentence each using our numbers, and close that section with "the two of you decide." ` +
        `**To talk about** — one gentle question for us to discuss together, in the spirit of "what's one thing you're grateful came through this month?" ` +
        `Under 170 words total. No exclamation marks. Never claim to know what God wants.`
      : `Write this week's five-minute money briefing for us. Use exactly these short sections, in this order, no headings other than the bold words: ` +
        `**This week** — what we spent (${money(m.week.spent)}) against our weekly average (${money(m.week.weeklyAvg)}), and the one or two envelopes that drove it. ` +
        `**Coming up** — bills due in the next two weeks from the snapshot. ` +
        `**Goals** — one line on the emergency fund and the next goal. ` +
        `**One decision** — we have about ${money(m.week.decision)} more available this month than planned; lay out savings vs debt vs keeping it available in one sentence each, using our numbers. ` +
        `Under 150 words total. No exclamation marks.`;
    try {
      const briefing = await callPlanner([{ role: "user", content: prompt }], 4000);
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

  /* ---- setting a decision aside --------------------------------------
     "Pray on it" (or "sleep on it") parks the decision for a week. The
     planner is told not to push it; the app brings it back once, on the
     agreed day, as a note — patience by design. */
  const setAside = () => {
    if (!verdict) return;
    const until = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    patch((s) => {
      s.decisions.push({
        id: Math.random().toString(36).slice(2, 9),
        what: verdict.what || "a purchase", cost: verdict.cost, until,
        created: new Date().toISOString().slice(0, 10),
      });
      return s;
    });
    setVerdict(null); setVerdictAi(""); setWhat(""); setCost("");
  };

  const talkItThrough = () => {
    if (!verdict) return;
    ask(
      `We're deciding together about spending ${money(verdict.cost)}${verdict.what ? ` on ${verdict.what}` : ""}. ` +
      `Help us talk it through — whether we can afford it, whether any debt or tradeoff is wise, why we want it, ` +
      `and whether it crowds out anything we've committed to. Stay neutral between us and end with the reminder that the decision is ours.`
    );
  };

  const dropDecision = (id) => patch((s) => {
    s.decisions = s.decisions.filter((d) => d.id !== id);
    return s;
  });

  const chips = [
    "Can we afford $600 for a trip next month?",
    "Why are we spending so much this month?",
    "Where should the extra go this month?",
    "What happens if we buy a $35,000 car in October?",
    "Are we holding back enough for taxes?",
    "Pay down the credit card or build the emergency fund?",
    ...(faith ? ["We're feeling anxious about money — where do we actually stand?"] : []),
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
              <div className="chips" style={{ marginTop: 10 }}>
                <button className="chip" onClick={() => { setVerdict(null); setVerdictAi(""); setWhat(""); setCost(""); }}>
                  We agree
                </button>
                <button className="chip" onClick={talkItThrough} disabled={busy}>Talk about it</button>
                <button className="chip" onClick={setAside}>{faith ? "Pray on it" : "Sleep on it"}</button>
              </div>
              <p className="empty" style={{ marginTop: 6, fontSize: 12 }}>
                {faith
                  ? "Pray on it sets this aside for a week. It won't come up again until then — patience is part of the plan."
                  : "Sleep on it sets this aside for a week before it comes back up."}
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="chead">
            <h3>{faith ? "This week's stewardship meeting" : "This week's money meeting"}</h3>
            <span className="meta">{faith ? "five minutes, once a week — gratitude first" : "five minutes, once a week, nobody is the budget cop"}</span>
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
          {m.decisions.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="chead"><h3>{faith ? "Set aside to pray on" : "Set aside for now"}</h3></div>
              {m.decisions.map((d) => (
                <div className="note" key={d.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontWeight: 600 }}>{d.what}</span>
                    <span className="num">{money(d.cost)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {d.due ? "the agreed time has come" : `quiet for ${d.daysLeft} more ${d.daysLeft === 1 ? "day" : "days"}`}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button className="btn ghost tiny" disabled={busy}
                        onClick={() => { dropDecision(d.id); ask(`We set aside a decision about spending ${money(d.cost)} on ${d.what}, and we're ready to talk about it now. Walk us through it fresh — afford, wisdom, why we want it — and leave the decision with us.`); }}>
                        Revisit
                      </button>
                      <button className="btn ghost tiny" onClick={() => dropDecision(d.id)}>Let it go</button>
                    </span>
                  </div>
                </div>
              ))}
              <p className="empty" style={{ fontSize: 12 }}>It won't bring these up on its own until the day comes.</p>
            </div>
          )}
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
