/* ==================================================================
   dashboard — the state of the month, above the fold

   The JSX is written in desktop order so the two-column grid works by
   auto-placement; the phone reorders with `order` in CSS. Never wrap a
   chart in display:none — ResponsiveContainer measures 0 and collapses.
   ================================================================== */

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { money, compact, monthLabel, ordinal, C } from "../lib/format.js";
import { Head, MonthNav, Kpi, Tip, Rail, Notes, axis } from "../components.jsx";

export default function Dashboard({ ctx, onQuickAdd }) {
  const { m, plan, month, setMonth, state, setView, writeMonth } = ctx;

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
    if (mm.paid.includes(b.id)) mm.paid = mm.paid.filter((x) => x !== b.id);
    else {
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
        title="Dashboard"
        sub={`${monthLabel(month)} · ${plan.entries.length} transactions logged`}
        right={<MonthNav month={month} setMonth={setMonth} />}
      />
      <p className="thesis">{m.thesis[0]} <span>{m.thesis[1]}</span></p>

      <div className="dashflow">
        {/* the phone's above-the-fold read */}
        <div className="stateline phone-only wideblock d-state">
          <div className="lbl">{m.stateLine[1]}</div>
          <div className={"fig " + (m.leftToSpend < 0 ? "down" : "")}>{m.stateLine[0]}</div>
          <div className="say">{m.stateLine[2]} <span>{m.stateLine[3]}</span></div>
        </div>

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
          {m.tightest.length === 0 ? <p className="empty">Set a few envelope amounts in Budget.</p> :
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

        <div className="grid g4 wideblock d-kpis">
          <Kpi label="Net worth" value={money(m.netWorth)} foot={`${money(m.assetTotal)} assets · ${money(m.debtTotal)} owed`} tone={m.netWorth < 0 ? "down" : ""} />
          <Kpi label="Left to spend" value={money(m.leftToSpend)} foot={`of ${money(m.planned)} planned`} tone={m.leftToSpend < 0 ? "down" : "up"} />
          <Kpi label="Tax reserve" value={m.tax.incomplete ? "—" : money(m.tax.monthlyReserve)}
            foot={m.tax.incomplete ? "add your 1099 income" : `${Math.round(m.tax.setAsidePct)}% of what you bill`}
            tone={m.tax.reserveDelta < -1 ? "down" : "up"} />
          <Kpi label="Debt-free" value={m.debt.avalanche.never ? "—" : monthLabel(m.debt.avalanche.payoffMonth, true)}
            foot={m.debt.avalanche.never ? "payments don't cover interest" : `${m.debt.avalanche.months} months at ${money(m.debt.avalanche.budget)}/mo`}
            tone={m.debt.avalanche.never ? "down" : ""} />
        </div>

        <div className="card wideblock d-rail desk-only">
          <div className="chead">
            <h3>Every dollar, given a job</h3>
            <span className="meta num">{money(m.income)} in · {money(m.allocated)} assigned</span>
          </div>
          <Rail m={m} plan={plan} />
        </div>

        <div className="card d-flow">
          <div className="chead"><h3>Six months of cash flow</h3><span className="meta">income vs. what you actually spent</span></div>
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
        </div>

        <div className="card d-notes">
          <div className="chead"><h3>Planner notes</h3><button className="btn ghost tiny" onClick={() => setView("planner")}>Ask why</button></div>
          <Notes notes={m.notes} limit={6} />
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

        <div className="card d-goals">
          <div className="chead"><h3>Goals</h3><button className="btn ghost tiny" onClick={() => setView("goals")}>Manage</button></div>
          {state.goals.length === 0 ? <p className="empty">No goals yet — the part of the plan that's actually fun.</p> :
            state.goals.slice(0, 4).map((g) => {
              const st = m.goalStatus(g);
              return (
                <div key={g.id} style={{ marginBottom: 13 }}>
                  <div className="metaline" style={{ justifyContent: "space-between" }}>
                    <b style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 15 }}>{g.name}</b>
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
    </>
  );
}
