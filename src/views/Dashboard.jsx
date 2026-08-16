/* ==================================================================
   home — the state of the month, and the fastest way to log spending

   Two jobs, in order: answer "are we okay?" in numbers at the top, and
   put scan / upload / type-it-in one tap away. Everything else lives on
   its own view — Home stays scannable.
   ================================================================== */

import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { money, compact, monthLabel, ordinal, C } from "../lib/format.js";
import { buildSnapshot, buildSystem, callPlanner } from "../lib/planner.js";
import { STEW_VERSES, LIFE, PRAYERS, versesOn, prayersOn } from "../lib/verses.js";
import { voiceSupported, listenOnce, parseSpokenExpense } from "../lib/voice.js";
import { blankDraft } from "../lib/draft.js";
import { Head, MonthNav, Tip, Ring, SChip, axis } from "../components.jsx";

/* Quick what-ifs: question for the Planner, amount for the offline
   fallback — if the API is unreachable the arithmetic still answers. */
const WHATIFS = [
  ["A $100 meal we didn't plan", 100, "What if we spend $100 tonight on a meal we didn't plan? What does it do to today, the week, and the month?"],
  ["A $300 surprise repair", 300, "What if a $300 repair hits us tomorrow? Where does it come from, and what does it push back?"],
  ["Skip eating out this week", null, "What happens if we skip eating out entirely this week — where does that money do the most good?"],
];

export default function Dashboard({ ctx, onQuickAdd, receipt }) {
  const { m, plan, month, setMonth, state, setView, writeMonth, patch } = ctx;

  /* ---- the quick what-if chat -------------------------------------
     Same brain and same history as Ask the Planner (state.chat) — Home
     just shows the tail of the conversation. When the API is out of
     reach and the what-if carries an amount, the arithmetic answers. */
  const [wq, setWq] = useState("");
  const [wBusy, setWBusy] = useState(false);
  const [wFallback, setWFallback] = useState("");
  const chat = state.chat || [];
  const chatTail = chat.slice(-4);
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [chat.length, wBusy]);

  const offlineWhatIf = (amount) => {
    const t = m.today;
    if (!t.known) return `Spending ${money(amount)} unplanned leaves about ${money(Math.max(0, m.monthOutlook.available - amount))} expected by month end instead of ${money(Math.max(0, m.monthOutlook.available))}.`;
    const newAllowance = Math.max(0, t.flexLeft - amount) / t.daysRemaining;
    return `The arithmetic while the Planner is unreachable: ${money(amount)} out of the flexible money drops ` +
      `today's number from ${money(t.allowance)} to ${money(newAllowance)} a day for the rest of the month, ` +
      `and the month's expected leftover from ${money(Math.max(0, m.monthOutlook.available))} to ${money(Math.max(0, m.monthOutlook.available - amount))}. ` +
      `Nothing committed is touched — it comes out of the flexible pool.`;
  };

  const askWhatIf = async (text, amount = null) => {
    const question = (text === undefined ? wq : text).trim();
    if (!question || wBusy) return;
    const parsed = amount !== null ? amount
      : (question.match(/\$\s?([\d,]+(?:\.\d+)?)/) ? Number(question.match(/\$\s?([\d,]+(?:\.\d+)?)/)[1].replace(/,/g, "")) : null);
    const next = [...chat, { role: "user", content: question }];
    patch((s) => { s.chat = next; return s; });
    setWq(""); setWFallback(""); setWBusy(true);
    try {
      const snapshot = buildSnapshot({ m, state, plan, month });
      const reply = await callPlanner(buildSystem({ m, state, snapshot }),
        next.map((x) => ({ role: x.role, content: x.content })), 4000);
      patch((s) => { s.chat = [...next, { role: "assistant", content: reply || "No answer came back — try again." }]; return s; });
    } catch (e) {
      setWFallback(parsed !== null && parsed > 0
        ? offlineWhatIf(parsed)
        : "Couldn't reach the Planner just now — try again in a moment, or open Ask the Planner.");
    }
    setWBusy(false);
  };

  /* ---- since you were last here ------------------------------------
     The previous visit's date is captured once on mount, then stamped
     forward. Events are read off the plan — never invented. */
  const lastSeenRef = useRef(state.ui.lastSeen || "");
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (state.ui.lastSeen !== today) patch((s) => { s.ui.lastSeen = today; return s; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastSeen = lastSeenRef.current;
  const sinceDay = lastSeen && lastSeen.slice(0, 7) === month ? Number(lastSeen.slice(8, 10)) : 0;
  const newEntries = m.live && lastSeen ? plan.entries.filter((t) => (t.day || 0) > sinceDay) : [];
  const sinceEvents = [];
  if (newEntries.length)
    sinceEvents.push(`${newEntries.length} ${newEntries.length === 1 ? "expense" : "expenses"} logged — ${money(newEntries.reduce((n, t) => n + t.amount, 0))}.`);
  m.bills.filter((b) => b.overdue).forEach((b) => sinceEvents.push(`${b.name} went past due on the ${ordinal(b.day)}.`));
  m.decisionsDue.forEach((d) => sinceEvents.push(`${d.what} came off the shelf — the time you agreed on has come.`));
  const showSince = lastSeen && lastSeen !== new Date().toISOString().slice(0, 10) && sinceEvents.length > 0;

  /* ---- one thing to decide together, when one honestly exists ---- */
  let decide = null;
  if (m.unallocated > 1)
    decide = `${money(m.unallocated)} a month has no job yet. An envelope, a goal, or a payment against what you owe — which?`;
  else if (m.enough.met && m.enough.surplus >= 50)
    decide = `About ${money(m.enough.surplus)} this month sits beyond what you've called enough. Give, save, enjoy, invest — or help someone?`;
  else if (m.week && m.week.decision >= 50)
    decide = `About ${money(m.week.decision)} extra is available this month. Where should it go?`;

  /* ---- say it: voice note -> prefilled entry sheet -----------------
     The browser transcribes on its own (nothing reaches our server);
     the transcript is parsed deterministically and, like a photo, it's
     a prefill — the sheet opens and the person confirms. */
  const [listening, setListening] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const sayIt = async () => {
    if (listening) return;
    setVoiceErr(""); setListening(true);
    try {
      const { transcript } = await listenOnce();
      const p = parseSpokenExpense(transcript, plan.envelopes.map((e) => e.name));
      const draft = { ...blankDraft(m, undefined, state.ui.defaultWho), amount: p.amount, note: p.note, merchant: p.merchant };
      if (p.envelope || p.merchant) {
        const match = m.matchEnvelope(p.merchant, p.envelope);
        draft.envId = match.envId;
        draft.who = match.who;
      }
      receipt.openBlank(draft);
    } catch (e) {
      setVoiceErr(e.message);
    }
    setListening(false);
  };

  const billsFoot = m.billsCovered.known
    ? `covered through ${m.billsCovered.throughLabel}`
    : `${m.bills.filter((b) => !b.paid && b.amount > 0).length} unpaid this month`;

  /* The stewardship strip: the household's biblical framework (provision →
     giving, needs, obligations, enjoyment, future) as one quiet row under
     the numbers. Faith layer only; every chip opens Stewardship. */
  const faith = !!(state.faith && state.faith.enabled);
  const STEW_GLYPH = { provision: "🌾", needs: "🏠", giving: "💛", obligations: "🧾", saving: "🛟", enjoyment: "🍜", future: "🌱" };
  /* One thread of the way-of-life a day — the basis of the whole app,
     one piece at a time. Visible, not hidden behind a hover. */
  const dayThread = versesOn(state) ? LIFE[new Date().getDate() % LIFE.length] : null;

  const catData = plan.envelopes
    .map((e) => ({ name: e.name, spent: m.spentBy[e.id] || 0, planned: e.planned }))
    .filter((d) => d.spent > 0 || d.planned > 0)
    .sort((a, b) => b.spent - a.spent).slice(0, 7);

  const spentPct = m.planned > 0 ? Math.min(100, (m.spent / m.planned) * 100) : 0;
  const overPlan = m.planned > 0 && m.spent > m.planned;

  const togglePaid = (b) => writeMonth((mm) => {
    mm.paid = mm.paid || [];
    if (mm.paid.includes(b.id)) {
      mm.paid = mm.paid.filter((x) => x !== b.id);
      const i2 = mm.entries.findIndex((t) => t.note === b.name + " (bill)" && t.amount === b.amount);
      if (i2 >= 0) mm.entries.splice(i2, 1);
    } else {
      mm.paid.push(b.id);
      if (b.envId && mm.envelopes.some((e) => e.id === b.envId))
        mm.entries.unshift({
          id: Math.random().toString(36).slice(2, 9), envId: b.envId, amount: b.amount,
          who: b.owner, note: b.name + " (bill)", day: b.day,
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
    }
    return mm;
  });

  return (
    <>
      <Head
        title="Home"
        sub={`${monthLabel(month)} · ${plan.entries.length} transactions logged`}
        right={<MonthNav month={month} setMonth={setMonth} />}
      />

      {/* the household snapshot: just the numbers, each one a door */}
      <div className="hero">
        <div className="herofigs">
          {(m.today.known
            ? [
              ["Available today", m.today.allowance, m.today.spentToday > 0 ? `already counting today's ${money(m.today.spentToday)}` : "flexible money, split over the days left", "txn"],
              ["This week", m.today.weekBudget, `${money(m.today.weekSpent)} spent in the last 7 days`, "cal"],
              ["Budget left", m.leftToSpend, `of ${money(m.planned)} planned`, "budget"],
              ["Bills still due", m.billsLeft, billsFoot, "bills"],
              ["Expected left over", Math.max(0, m.monthOutlook.available), "after bills and normal spending", "plan"],
            ]
            : [
              ["Available", Math.max(0, m.monthOutlook.available), "after bills and normal spending", "plan"],
              ["Spent so far", m.spent, `${plan.entries.length} transactions`, "txn"],
              ["Budget left", m.leftToSpend, `of ${money(m.planned)} planned`, "budget"],
              ["Bills still due", m.billsLeft, billsFoot, "bills"],
            ]
          ).map(([k, v, f, view]) => (
            <button className="herofig" key={k} onClick={() => setView(view)}>
              <span className="lbl">{k}</span>
              <span className={"v" + (k === "Budget left" && v < 0 ? " down" : "")}>{money(v)}</span>
              <span className="herofoot">{f}</span>
            </button>
          ))}
        </div>
        {faith && (
          <div className="stewrow">
            {m.stewardship.map((b) => {
              const v = versesOn(state) ? STEW_VERSES[b.key] : null;
              return (
                <button className="stewchip" key={b.key} onClick={() => setView("stew")}
                  title={v ? `"${v.text}" — ${v.ref}` : undefined}
                  aria-label={`${b.label} — open Stewardship`}>
                  <span>{STEW_GLYPH[b.key]}</span> {b.label} <span className="num">{money(b.figure)}</span>
                </button>
              );
            })}
          </div>
        )}
        {dayThread && (
          <button className="daythread" onClick={() => setView("stew")}
            aria-label={`${dayThread.title} — open Stewardship`}>
            <span className="lifeglyph">{dayThread.glyph}</span>
            <span style={{ minWidth: 0 }}>
              <span className="lifenum">Today's thread · {dayThread.title}</span>
              <span className="dtverse">"{dayThread.refs[0].text}" <b>— {dayThread.refs[0].ref}</b></span>
            </span>
            <span className="muted" style={{ marginLeft: "auto", flex: "none" }}>›</span>
          </button>
        )}
      </div>

      {/* log it and ask it, side by side */}
      <div className="grid g2" style={{ marginBottom: 16, alignItems: "stretch" }}>
      <div className="card logcard">
        <div className="chead" style={{ marginBottom: 10 }}>
          <h3>Log spending</h3>
          <span className="meta">a photo just fills the form in — you can always type it</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="btn">
            📷 Snap a receipt
            <input type="file" accept="image/*" capture="environment" className="hiddenfile"
              onChange={(e) => { receipt.capture(e.target.files && e.target.files[0]); e.target.value = ""; }} />
          </label>
          {voiceSupported() && (
            <button className={"btn ghost" + (listening ? " listening" : "")} onClick={sayIt} aria-pressed={listening}>
              {listening ? "🔴 Listening…" : "🎤 Say it"}
            </button>
          )}
          <label className="btn ghost">
            Upload a photo
            <input type="file" accept="image/*" className="hiddenfile"
              onChange={(e) => { receipt.capture(e.target.files && e.target.files[0]); e.target.value = ""; }} />
          </label>
          <button className="btn ghost" onClick={() => onQuickAdd()}>Type it in</button>
        </div>
        {voiceErr && <p className="empty" style={{ marginTop: 6, color: C.warn }}>{voiceErr}</p>}
        {listening && <p className="empty" style={{ marginTop: 6 }}>Try: "23.50 at Trader Joe's for groceries" — it stops when you pause.</p>}
        {m.tightest.length > 0 && (
          <div className="chips" style={{ marginTop: 10 }}>
            {m.tightest.map((e) => {
              const left = m.envRemaining[e.id];
              return (
                <button className="chip" key={e.id} onClick={() => onQuickAdd(e.id)}>
                  {e.name} · {left < 0 ? `${money(-left)} over` : `${money(left)} left`}
                </button>
              );
            })}
          </div>
        )}
        {plan.entries.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {plan.entries.slice(0, 4).map((t) => {
              const env = plan.envelopes.find((e) => e.id === t.envId);
              return (
                <div className="note" key={t.id} style={{ justifyContent: "space-between" }}>
                  <span style={{ display: "flex", gap: 9, alignItems: "center", minWidth: 0 }}>
                    <i className="dot" style={{ background: m.ownerColor(t.who) }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.note || (env ? env.name : "Spending")}
                    </span>
                  </span>
                  <span className="num">{money(t.amount)}</span>
                </div>
              );
            })}
            <button className="btn ghost tiny" style={{ marginTop: 8 }} onClick={() => setView("txn")}>See all transactions</button>
          </div>
        )}
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column" }}>
        <div className="chead" style={{ marginBottom: 8 }}>
          <h3>Quick what-if</h3>
          <span className="meta">the Planner answers with your numbers</span>
        </div>
        <div className="chatlog" ref={logRef} style={{ flex: 1, maxHeight: 190, minHeight: 60 }}>
          {chatTail.length === 0 && !wBusy && (
            <p className="empty">"What if we spend $100 on a meal we didn't plan?" — ask before it happens, not after.</p>
          )}
          {chatTail.map((x, i) => <div key={i} className={"msg " + (x.role === "user" ? "me" : "them")}>{x.content}</div>)}
          {wBusy && <div className="msg them muted">Running your numbers…</div>}
          {wFallback && <div className="msg them">{wFallback}</div>}
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {WHATIFS.map(([label, amount, q]) => (
            <button key={label} className="chip" disabled={wBusy} onClick={() => askWhatIf(q, amount)}>{label}</button>
          ))}
        </div>
        <div className="askrow" style={{ marginTop: 8 }}>
          <input className="field" placeholder="What if we…" value={wq} onChange={(e) => setWq(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askWhatIf()} aria-label="Ask a what-if" />
          <button className="btn" onClick={() => askWhatIf()} disabled={wBusy || !wq.trim()}>Ask</button>
        </div>
        {chat.length > 4 && (
          <button className="btn ghost tiny" style={{ marginTop: 8, alignSelf: "flex-start" }}
            onClick={() => setView("planner")}>Full conversation on Ask the Planner</button>
        )}
      </div>
      </div>

      {/* getting-started checklist, only while the household is thin */}
      {!m.setupDone && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="chead">
            <h3>Set the table</h3>
            <span className="meta">{m.setupSteps.filter((s) => s.done).length} of {m.setupSteps.length} done</span>
          </div>
          {m.setupSteps.map((s) => (
            <button className={"check" + (s.done ? " done" : "")} key={s.key}
              onClick={() => setView(s.view)}>
              <span className="box">✓</span>
              <span className="t">{s.label}</span>
              <span className={"go " + (s.done ? "muted" : "btn ghost tiny")}>{s.done ? "›" : "Go"}</span>
            </button>
          ))}
        </div>
      )}

      {showSince && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="chead"><h3>Since you were last here</h3><span className="meta">{lastSeen}</span></div>
          {sinceEvents.slice(0, 4).map((e, i) => (
            <div className="note" key={i}><span className="tick" style={{ background: C.joint }} /><span>{e}</span></div>
          ))}
        </div>
      )}

      {decide && (
        <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${C.joint}` }}>
          <div className="chead"><h3>One thing to decide together</h3></div>
          <p className="empty" style={{ fontSize: 14.5, color: "var(--ink)", fontWeight: 600 }}>{decide}</p>
          {prayersOn(state) && (
            <p className="prayer"><span className="plead">If it's your practice</span>
              <span className="ptext">"{PRAYERS.decision}"</span></p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn tiny" onClick={() => setView("meeting")}>Take it to the meeting</button>
            <button className="btn ghost tiny" onClick={() => {
              patch((s) => { s.ui.plannerSeed = decide + " Lay out the options with our numbers, and leave the decision with us."; return s; });
              setView("planner");
            }}>Ask the Planner</button>
          </div>
        </div>
      )}

      {/* the numbers, at a glance */}
      <div className="grid g3 chartsrow" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead"><h3>Monthly budget</h3>
            {m.planned > 0 && (overPlan
              ? <SChip tone="over">over plan</SChip>
              : <SChip tone="ok">on track</SChip>)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Ring pct={spentPct} size={116} stroke={13} color={overPlan ? C.warn : C.brand}
              track={overPlan ? "#FBE7EA" : C.brandSoft}>
              <div>
                <div className="num" style={{ fontSize: 17, fontWeight: 600 }}>{money(m.spent)}</div>
                <div style={{ fontSize: 10, color: C.soft, fontWeight: 600 }}>spent</div>
              </div>
            </Ring>
            <div>
              <div className="lbl">{m.leftToSpend < 0 ? "Over by" : "Left to spend"}</div>
              <div className={"num" + (m.leftToSpend < 0 ? " down" : "")} style={{ fontSize: 23, letterSpacing: "-.02em" }}>
                {money(Math.abs(m.leftToSpend))}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 3, fontWeight: 500 }}>
                of {money(m.planned)} · {m.daysLeft} days to go
              </div>
              <button className="btn ghost tiny" style={{ marginTop: 8 }} onClick={() => setView("planner")}>
                Can we afford it?
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="chead"><h3>Where the month went</h3><span className="meta num">{money(m.spent)} spent</span></div>
          {catData.length === 0 ? <p className="empty">Nothing logged yet this month.</p> : (
            <div style={{ height: 24 * catData.length + 20 }}>
              <ResponsiveContainer>
                <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap={5}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={92} {...axis} />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(108,114,96,.07)" }} />
                  <Bar dataKey="planned" name="Planned" fill="rgba(108,114,96,.16)" radius={3} />
                  <Bar dataKey="spent" name="Spent" fill={C.a} radius={3} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <div className="chead"><h3>Six months of cash flow</h3><span className="meta">vs. income</span></div>
          {m.history.every((h) => h.spent === 0) ? (
            <p className="empty">
              Nothing to chart yet — log spending as it happens and six months from now this shows
              the shape of your year.
            </p>
          ) : (
            <div className="chartbox short">
              <ResponsiveContainer>
                <AreaChart data={m.history} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.a} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.a} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} tickFormatter={compact} width={44} />
                  <Tooltip content={<Tip />} cursor={{ stroke: C.line }} />
                  <Area type="monotone" dataKey="spent" name="Spent" stroke={C.a} fill="url(#gS)" strokeWidth={2} />
                  <Line type="monotone" dataKey="income" name="Income" stroke={C.ink} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* what needs attention next */}
      <div className="grid g2">
        <div className="card nextcard">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="nlab">Do this next</span>
            <span className="nstep">{m.nextAction.step}</span>
          </div>
          <div className="ntitle">{m.nextAction.title}</div>
          <div className="nwhy">{m.nextAction.why}</div>
          <button className="btn tiny" onClick={() => setView(m.nextAction.view)}>{m.nextAction.cta}</button>
        </div>

        <div className="card">
          <div className="chead"><h3>Coming due</h3><span className="meta num">{money(m.billsLeft)} left</span></div>
          {m.dueSoonList.length === 0 ? <p className="empty">Nothing due in the next ten days.</p> :
            m.dueSoonList.map((b) => (
              <div className="note" key={b.id} style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <span className="tick" style={{ background: b.overdue ? C.warn : C.joint, minHeight: 15 }} />
                  <span>{b.name}<span className="muted"> · {ordinal(b.day)}</span></span>
                </span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="num">{money(b.amount)}</span>
                  <button className="btn ghost tiny" onClick={() => togglePaid(b)}>Paid</button>
                </span>
              </div>
            ))}
          <button className="btn ghost tiny" style={{ marginTop: 8 }} onClick={() => setView("bills")}>All bills</button>
        </div>
      </div>
    </>
  );
}
