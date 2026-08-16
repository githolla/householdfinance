/* ==================================================================
   dashboard — the state of the month, above the fold

   The JSX is written in desktop order so the two-column grid works by
   auto-placement; the phone reorders with `order` in CSS. Never wrap a
   chart in display:none — ResponsiveContainer measures 0 and collapses.
   ================================================================== */

import { useEffect, useRef } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { money, compact, monthLabel, ordinal, C } from "../lib/format.js";
import { Head, MonthNav, Tip, Rail, Notes, Ring, SChip, Stepper, axis } from "../components.jsx";

const GROUP_GLYPH = {
  Home: "🏠", Daily: "🛒", Lifestyle: "🍜", Health: "💊", Giving: "💛", Other: "📦",
};

export default function Dashboard({ ctx, onQuickAdd }) {
  const { m, plan, month, setMonth, state, setView, writeMonth, patch } = ctx;

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

  /* ---- the hero's read on the month ---- */
  const overdueHero = m.bills.find((b) => b.overdue);
  const trouble = m.flow.totalShortfall > 1 || m.taxOverdue
    || (m.planned > 0 && m.spent > m.planned) || m.unallocated < -1;
  const headline = overdueHero
    ? `${overdueHero.name} needs you — it was due the ${ordinal(overdueHero.day)}.`
    : m.taxOverdue ? "An estimated tax payment is past due."
      : trouble ? m.thesis[0]
        : m.monthOutlook.onTrack ? "You're in good shape this month."
          : "You're running a little warm this month.";
  const rec = m.monthOutlook.rec;
  const agreedRec = state.ui.agreedRec === month;

  const catData = plan.envelopes
    .map((e) => ({ name: e.name, spent: m.spentBy[e.id] || 0, planned: e.planned }))
    .filter((d) => d.spent > 0 || d.planned > 0)
    .sort((a, b) => b.spent - a.spent).slice(0, 7);

  const spentPct = m.planned > 0 ? Math.min(100, (m.spent / m.planned) * 100) : 0;
  const aheadOfPace = m.paceDelta > 0;
  // Rust is the alarm colour and means over plan — not merely ahead of an even
  // pace, which is normal in a month where rent and tithe go out on the 1st.
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

      {/* the household status hero: are we okay, what changed, what next */}
      <div className="hero">
        <div className="hline">{headline}</div>
        <div className="hsub">
          {!m.billsCovered.known
            ? "Add your bills and cash accounts and this line will tell you how far you're covered."
            : m.billsCovered.ok || !m.billsCovered.shortBill
              ? `Bills are covered through ${m.billsCovered.throughLabel}.`
              : `Heads up — ${m.billsCovered.shortBill.name} (${money(m.billsCovered.shortBill.amount)}) is past what's in the cash accounts.`}
          {" "}{!m.tax.incomplete && m.tax.reserveDelta < -1 ? "The tax reserve is behind pace. " : ""}
          {overdueHero
            ? `${money(overdueHero.amount)} — mark it paid in Bills and it logs itself into the right envelope.`
            : headline === m.thesis[0] ? m.thesis[1] : ""}
        </div>
        <div className="herofigs">
          {[["Came in", m.income], ["Committed", m.allocated], ["Available", Math.max(0, m.monthOutlook.available)]].map(([k, v]) => (
            <div key={k}>
              <span className="lbl">{k}</span>
              <span className="v">{money(v)}</span>
            </div>
          ))}
        </div>
        {m.live && rec.length > 0 && (
          <div className="recrow">
            <span className="lbl" style={{ marginBottom: 0 }}>Planner recommendation</span>
            {rec.map((r) => (
              <span className="recitem" key={r.label}><span className="num">{money(r.amount)}</span> {r.label}</span>
            ))}
            <span style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
              {agreedRec
                ? <SChip tone="ok">agreed</SChip>
                : <button className="btn tiny" onClick={() => patch((s) => { s.ui.agreedRec = month; return s; })}>Use this plan</button>}
              <button className="btn ghost tiny" onClick={() => setView("plan")}>Adjust</button>
              <button className="btn ghost tiny" onClick={() => {
                patch((s) => { s.ui.plannerSeed = "Walk us through this month's recommended split — why these amounts, and what would change it?"; return s; });
                setView("planner");
              }}>Why?</button>
            </span>
          </div>
        )}
      </div>

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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn tiny" onClick={() => setView("meeting")}>Take it to the meeting</button>
            <button className="btn ghost tiny" onClick={() => {
              patch((s) => { s.ui.plannerSeed = decide + " Lay out the options with our numbers, and leave the decision with us."; return s; });
              setView("planner");
            }}>Ask the Planner</button>
          </div>
        </div>
      )}

      <div className="dashflow">
        {/* getting-started checklist, only while the household is thin */}
        {!m.setupDone && (
          <div className="card wideblock d-setup">
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

        <div className="card phone-only wideblock d-pace">
          <div className="chead"><h3>Pace</h3><span className="meta">{m.daysLeft} days to go</span></div>
          <div className="pacewrap">
            <div className="pace">
              <i className={overPlan ? "over" : ""} style={{ width: spentPct + "%" }} />
              <span className="pacemark" style={{ left: m.pacePct + "%" }} />
            </div>
            <div className="paceline">
              <span className="num">{money(m.spent)}</span> of <span className="num">{money(m.planned)}</span>
              {m.planned > 0 && (aheadOfPace
                ? ` · ${money(m.paceDelta)} ahead of an even pace`
                : ` · ${money(-m.paceDelta)} under an even pace`)}
            </div>
          </div>
        </div>

        <div className="card phone-only wideblock d-envs">
          <div className="chead"><h3>What's left</h3><span className="meta">tap to log against one</span></div>
          {m.tightest.length === 0 ? <p className="empty">Set a few envelope amounts in Envelopes — Our Plan links to it.</p> :
            m.tightest.map((e) => {
              const left = m.envRemaining[e.id];
              return (
                <button className="envrow" key={e.id} onClick={() => onQuickAdd(e.id)}>
                  <span>{e.name}</span>
                  <span className={"v" + (left < 0 ? " over" : "")}>
                    {left < 0 ? `${money(-left)} over` : `${money(left)} left`}
                  </span>
                </button>
              );
            })}
        </div>

        <div className="card phone-only wideblock d-due">
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
        </div>

        <div className="card wideblock d-rail desk-only">
          <div className="chead">
            <h3>Every dollar, given a job</h3>
            <span className="meta num">{money(m.income)} in · {money(m.allocated)} assigned</span>
          </div>
          <Rail m={m} plan={plan} />
        </div>

        <div className="colmain">
        <div className="card d-flow">
          <div className="chead"><h3>Six months of cash flow</h3><span className="meta">income vs. what you actually spent</span></div>
          {m.history.every((h) => h.spent === 0) ? (
            <p className="empty">
              Nothing to chart yet — log spending as it happens and six months from now this shows
              the shape of your year.
            </p>
          ) : (
          <div className="chartbox">
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
                <YAxis {...axis} tickFormatter={compact} width={46} />
                <Tooltip content={<Tip />} cursor={{ stroke: C.line }} />
                <Area type="monotone" dataKey="spent" name="Spent" stroke={C.a} fill="url(#gS)" strokeWidth={2} />
                <Line type="monotone" dataKey="income" name="Income" stroke={C.ink} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        <div className="card d-cats">
          <div className="chead"><h3>Where the month went</h3><span className="meta num">{money(m.spent)} spent</span></div>
          {catData.length === 0 ? <p className="empty">Nothing logged yet this month.</p> : (
            <div style={{ height: 26 * catData.length + 24 }}>
              <ResponsiveContainer>
                <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }} barCategoryGap={6}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={96} {...axis} />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(92,104,100,.07)" }} />
                  <Bar dataKey="planned" name="Planned" fill="rgba(92,104,100,.16)" radius={3} />
                  <Bar dataKey="spent" name="Spent" fill={C.a} radius={3} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card d-recent">
          <div className="chead"><h3>Recent spending</h3><button className="btn ghost tiny" onClick={() => setView("txn")}>See all</button></div>
          {plan.entries.length === 0 ? <p className="empty">Nothing logged yet this month.</p> :
            plan.entries.slice(0, 7).map((t) => {
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
        </div>
        </div>

        <div className="colside">
        <div className="card nextcard d-next">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="nlab">Do this next</span>
            <span className="nstep">{m.nextAction.step}</span>
          </div>
          <div className="ntitle">{m.nextAction.title}</div>
          <div className="nwhy">{m.nextAction.why}</div>
          <button className="btn tiny" onClick={() => setView(m.nextAction.view)}>{m.nextAction.cta}</button>
        </div>

        <div className="card d-budget">
          <div className="chead"><h3>Monthly budget</h3>
            {m.planned > 0 && (m.spent > m.planned
              ? <SChip tone="over">over plan</SChip>
              : <SChip tone="ok">on track</SChip>)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <Ring pct={spentPct} size={132} stroke={14} color={overPlan ? C.warn : C.brand}
              track={overPlan ? "#FBE7EA" : C.brandSoft}>
              <div>
                <div className="num" style={{ fontSize: 19, fontWeight: 600 }}>{money(m.spent)}</div>
                <div style={{ fontSize: 10.5, color: C.soft, fontWeight: 600 }}>spent</div>
              </div>
            </Ring>
            <div>
              <div className="lbl">{m.leftToSpend < 0 ? "Over by" : "Left to spend"}</div>
              <div className={"num" + (m.leftToSpend < 0 ? " down" : "")} style={{ fontSize: 26, letterSpacing: "-.02em" }}>
                {money(Math.abs(m.leftToSpend))}
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4, fontWeight: 500 }}>
                of {money(m.planned)} planned · {m.daysLeft} days to go
              </div>
              <button className="btn ghost tiny" style={{ marginTop: 10 }} onClick={() => setView("planner")}>
                Can we afford it?
              </button>
            </div>
          </div>
        </div>

        <div className="card d-most">
          <div className="chead"><h3>Most expenses</h3><span className="meta">vs last month</span></div>
          {m.topSpend.length === 0 ? <p className="empty">Nothing logged yet this month.</p> :
            m.topSpend.map((x) => (
              <div className="note" key={x.id} style={{ alignItems: "center", gap: 11 }}>
                <span className="rankicon">{GROUP_GLYPH[x.group] || GROUP_GLYPH.Other}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>{Math.round(x.pct)}% of the month</span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <span className="num" style={{ display: "block" }}>{money(x.amount)}</span>
                  {x.deltaPct !== null && Math.abs(x.deltaPct) >= 1 && (
                    <span className={"trend " + (x.deltaPct > 0 ? "up" : "down")}>
                      {x.deltaPct > 0 ? "↑" : "↓"} {Math.abs(Math.round(x.deltaPct))}%
                    </span>
                  )}
                </span>
              </div>
            ))}
        </div>

        <div className="card d-steps">
          <div className="chead">
            <h3>Your money steps</h3>
            <button className="btn ghost tiny" onClick={() => setView("plan")}>The plan</button>
          </div>
          <Stepper steps={m.steps} />
        </div>

        <div className="card d-notes">
          <div className="chead"><h3>Planner notes</h3><button className="btn ghost tiny" onClick={() => setView("planner")}>Ask why</button></div>
          <Notes notes={m.notes} limit={6} />
        </div>

        <div className="card d-goals">
          <div className="chead"><h3>Goals</h3><button className="btn ghost tiny" onClick={() => setView("goals")}>Manage</button></div>
          {state.goals.length === 0 ? <p className="empty">No goals yet — the part of the plan that's actually fun.</p> :
            state.goals.slice(0, 4).map((g) => {
              const st = m.goalStatus(g);
              return (
                <div key={g.id} style={{ marginBottom: 13 }}>
                  <div className="metaline" style={{ justifyContent: "space-between" }}>
                    <b style={{ fontWeight: 700, fontSize: 14.5 }}>{g.name}</b>
                    <span className="num">{money(g.saved)} / {money(g.target)}</span>
                  </div>
                  <div className="track"><i style={{ width: st.pct + "%", background: st.late ? C.warn : C.joint }} /></div>
                  <div className="metaline">
                    {st.done ? <span className="flag ok">Funded</span> : st.eta ? <span>lands <b>{monthLabel(st.eta)}</b></span> : <span>set a monthly amount</span>}
                    {st.late && <span className="flag late">needs {money(st.needed)}/mo</span>}
                  </div>
                </div>
              );
            })}
        </div>

        </div>
      </div>
    </>
  );
}
