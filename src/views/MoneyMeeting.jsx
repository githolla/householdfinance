/* ==================================================================
   the money meeting — five minutes, once a week, together

   A guided walk, not a generated report: gratitude → where we stand →
   celebrate → one conversation → decide → close. Every number is off
   `m`; the only AI involvement is the optional hand-off to the Planner
   when the two votes differ. Nothing here fabricates praise — if there
   is nothing to celebrate, steady is enough.
   ================================================================== */

import { useState } from "react";
import { money, monthLabel } from "../lib/format.js";
import { Head, SChip } from "../components.jsx";

const STEPS = ["Gratitude", "Where we stand", "Celebrate", "One conversation", "Decide", "Close"];

export default function MoneyMeeting({ ctx }) {
  const { m, state, patch, setView } = ctx;
  const faith = !!(state.faith && state.faith.enabled);
  const scripture = faith ? (state.faith.scripture || "relevant") : "off";
  const [step, setStep] = useState(0);

  const meeting = state.meeting || {};
  const fresh = meeting.key === m.weekKey;
  const votes = fresh ? (meeting.votes || {}) : {};
  const gratitude = fresh ? (meeting.gratitude || {}) : {};

  const start = () => {
    patch((s) => {
      s.meeting = { key: m.weekKey, briefing: "", votes: { a: null, b: null }, gratitude: { a: "", b: "" } };
      return s;
    });
    setStep(0);
  };

  const saveGratitude = (slot, text) => patch((s) => {
    s.meeting.gratitude = { ...(s.meeting.gratitude || {}), [slot]: text };
    return s;
  });
  const vote = (slot, choice) => patch((s) => {
    s.meeting.votes = { ...(s.meeting.votes || {}), [slot]: choice };
    return s;
  });

  const VOTE_LABELS = faith
    ? { savings: "Save it", give: "Give some", debt: "Toward debt", cushion: "Keep it available" }
    : { savings: "Save it", debt: "Toward debt", cushion: "Keep it available" };

  const D = m.week ? m.week.decision : 0;
  const efGoal = m.flow.efGoal;
  const topDebt = m.debts.filter((d) => d.balance > 0).sort((x, y) => (y.apr || 0) - (x.apr || 0))[0];

  /* What each choice actually does — arithmetic, stated once, no side taken. */
  const impact = {
    savings: efGoal && efGoal.monthly > 0
      ? `Moves ${efGoal.name.toLowerCase()} ${money(D)} closer — about ${Math.round(D / (efGoal.monthly / 4.33))} weeks ahead of schedule.`
      : `${money(D)} straight into savings.`,
    give: `${money(D)} given without touching a single commitment — it's already beyond the plan.`,
    debt: topDebt
      ? `Knocks ${money(D)} off ${topDebt.name} now — at ${topDebt.apr}%, that's about ${money((D * (topDebt.apr || 0)) / 100 / 12)} a month in interest that stops accruing.`
      : `${money(D)} against what you owe.`,
    cushion: `Stays in checking — the floor under the month rises by ${money(D)}.`,
  };

  const bothVoted = votes.a && votes.b;
  const agree = bothVoted && votes.a === votes.b;

  const dots = (
    <div className="meetdots" role="progressbar" aria-valuenow={step + 1} aria-valuemax={STEPS.length}>
      {STEPS.map((s, i) => <i key={s} className={i <= step ? "done" : ""} title={s} />)}
    </div>
  );
  const nav = (canNext = true) => (
    <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
      {step > 0 && <button className="btn ghost tiny" onClick={() => setStep(step - 1)}>Back</button>}
      {step < STEPS.length - 1 && (
        <button className="btn tiny" onClick={() => setStep(step + 1)} disabled={!canNext}>Continue</button>
      )}
    </div>
  );

  if (!m.week) {
    return (
      <>
        <Head title="Money Meeting" sub="Five minutes, once a week, together." />
        <div className="card"><p className="empty">The meeting runs on the current month — flip back to it to hold one.</p></div>
      </>
    );
  }

  if (!fresh) {
    return (
      <>
        <Head title="Money Meeting" sub={faith
          ? "Five minutes, once a week — gratitude first, one decision, together."
          : "Five minutes, once a week — where you stand and one decision, together."} />
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="meetbig">Ready when you both are.</div>
          <p className="empty">
            Six short steps: {faith ? "gratitude, " : ""}where you stand, something worth naming,
            one conversation, a decision, and a close. Nobody is the budget cop — the numbers are
            already on the table.
          </p>
          <button className="btn" style={{ marginTop: 12 }} onClick={start}>Start this week's meeting</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Head title="Money Meeting" sub={`Week ${m.weekKey.split("-W")[1]} of ${m.weekKey.slice(0, 4)} · step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`} />
      {dots}

      {step === 0 && (
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="meetbig">Gratitude</div>
          <p className="empty">
            {money(m.week.spent)} of provision was put to use this week
            {m.bills.some((b) => b.overdue) ? "" : ", and every bill so far is current"}.
            {faith && m.week.giving > 0 ? ` ${money(m.week.giving)} of it went to giving.` : ""}
          </p>
          <label className="lbl" style={{ marginTop: 10 }}>What's one thing you're grateful for this week? <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
          {[["a", m.pA.name], ["b", m.pB.name]].map(([slot, name]) => (
            <div key={slot} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ minWidth: 64, fontWeight: 700, fontSize: 13, color: m.ownerColor(slot) }}>{name}</span>
              <input className="field" value={gratitude[slot] || ""} placeholder="…"
                onChange={(e) => saveGratitude(slot, e.target.value)} />
            </div>
          ))}
          {nav()}
        </div>
      )}

      {step === 1 && (
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="meetbig">Where we stand</div>
          {[
            ["Spent this week", `${money(m.week.spent)} against a ${money(m.week.weeklyAvg)} weekly average`],
            ...(faith ? [["Given this week", money(m.week.giving)]] : []),
            ["Cash on hand", `${money(m.cashOnHand)} — bills covered through ${m.billsCovered.throughLabel}`],
            ["Coming up", m.week.upcoming.length
              ? m.week.upcoming.map((b) => `${b.name} ${money(b.amount)} in ${b.dueIn}d`).join(" · ")
              : "nothing due in the next two weeks"],
            ...(efGoal ? [["Emergency fund", `${money(efGoal.saved)} of ${money(m.flow.efTarget)}`]] : []),
            ...(m.debtTotal > 0 ? [["Debt", m.debt.avalanche.never
              ? `${money(m.debtTotal)} — payments don't cover interest yet`
              : `${money(m.debtTotal)} — clear ${monthLabel(m.debt.avalanche.payoffMonth)}`]] : []),
          ].map(([k, v]) => (
            <div className="note" key={k} style={{ justifyContent: "space-between", gap: 14 }}>
              <span className="muted" style={{ flex: "none" }}>{k}</span>
              <span style={{ textAlign: "right", fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          {nav()}
        </div>
      )}

      {step === 2 && (
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="meetbig">Worth naming</div>
          {m.celebrate
            ? <p className="empty" style={{ fontSize: 15, color: "var(--ink)", fontWeight: 600 }}>{m.celebrate}</p>
            : <p className="empty">Nothing to celebrate loudly this week — and that's fine. Steady is enough.</p>}
          {nav()}
        </div>
      )}

      {step === 3 && (
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="meetbig">One conversation</div>
          {D >= 20 ? (
            <>
              <p className="empty">
                About {money(D)} is available this month beyond the plan. Where should it go?
                Answer separately — then compare.
              </p>
              {[["a", m.pA.name], ["b", m.pB.name]].map(([slot, name]) => (
                <div key={slot} style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
                  <span style={{ minWidth: 64, fontWeight: 700, fontSize: 13, color: m.ownerColor(slot) }}>{name}</span>
                  {Object.entries(VOTE_LABELS).map(([k, label]) => (
                    <button key={k} className={"chip" + (votes[slot] === k ? " on" : "")}
                      onClick={() => vote(slot, k)}>{label}</button>
                  ))}
                </div>
              ))}
              {nav(!!bothVoted)}
            </>
          ) : (
            <>
              <p className="empty">
                No extra money is waiting on a decision this week — the plan is spoken for.
                {m.nextAction && ` If you want something to talk about: ${m.nextAction.title.toLowerCase()} — ${m.nextAction.why}`}
              </p>
              {nav()}
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="meetbig">Decide</div>
          {D < 20 ? (
            <p className="empty">Nothing to decide this week. On to the close.</p>
          ) : agree ? (
            <>
              <SChip tone="ok">agreed</SChip>
              <p className="empty" style={{ marginTop: 8 }}>
                You both chose <b>{VOTE_LABELS[votes.a].toLowerCase()}</b>. {impact[votes.a]}
              </p>
              <p className="empty">Make it real in The Plan and it sticks.</p>
              <button className="btn ghost tiny" onClick={() => setView("plan")}>Open the plan</button>
            </>
          ) : bothVoted ? (
            <>
              <p className="empty">You chose differently — here's what each does. Neither of you is wrong.</p>
              {[["a", m.pA.name], ["b", m.pB.name]].map(([slot, name]) => (
                <div className="note" key={slot} style={{ flexDirection: "column", alignItems: "stretch", gap: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: m.ownerColor(slot) }}>
                    {name} — {VOTE_LABELS[votes[slot]]}
                  </span>
                  <span className="muted" style={{ fontSize: 13 }}>{impact[votes[slot]]}</span>
                </div>
              ))}
              <p className="empty" style={{ marginTop: 8 }}>
                A middle path: {money(Math.round(D / 2 / 10) * 10)} each way covers both.
              </p>
              <button className="chip" onClick={() => {
                patch((s) => { s.ui.plannerSeed = `In this week's meeting, ${m.pA.name} voted to put the extra ${money(D)} toward ${VOTE_LABELS[votes.a].toLowerCase()} and ${m.pB.name} voted for ${VOTE_LABELS[votes.b].toLowerCase()}. Compare what each choice does to our twelve-month picture, then suggest a fair split. Stay neutral between us.`; return s; });
                setView("planner");
              }}>
                Ask the Planner to compare them
              </button>
            </>
          ) : (
            <p className="empty">Go back one step — you haven't both answered yet.</p>
          )}
          {nav()}
        </div>
      )}

      {step === 5 && (
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="meetbig">Close</div>
          <p className="empty">
            That's the meeting. {gratitude.a || gratitude.b
              ? `You said you were grateful for: ${[gratitude.a, gratitude.b].filter(Boolean).join(" — and — ")}.`
              : ""}
          </p>
          {scripture !== "off" && (
            <p className="empty">
              If it's your practice, close with a short prayer of thanks for what came in this week —
              and for the patience to steward it together.
            </p>
          )}
          <p className="empty" style={{ color: "var(--soft)" }}>See you next week. Same table.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn tiny" onClick={() => setView("dash")}>Done</button>
            <button className="btn ghost tiny" onClick={() => setStep(0)}>Run it again</button>
          </div>
        </div>
      )}
    </>
  );
}
