/* ==================================================================
   reports — patterns you can't see one month at a time
   ================================================================== */

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import { money, compact, C } from "../lib/format.js";
import { Head, MonthNav, Kpi, Tip, axis } from "../components.jsx";

export default function Reports({ ctx }) {
  const { m, plan, month, setMonth, state } = ctx;

  const byGroup = Object.entries(m.byGroup).map(([k, v]) => ({ name: k, Spent: v.spent, Planned: v.planned }))
    .filter((d) => d.Spent > 0 || d.Planned > 0);
  const byWho = [
    { name: m.pA.name, value: m.spentByWho.a || 0 },
    { name: m.pB.name, value: m.spentByWho.b || 0 },
    { name: "Shared", value: m.spentByWho.joint || 0 },
  ].filter((d) => d.value > 0);
  const trend = m.history.map((h) => ({ label: h.label, Spent: h.spent, "Toward goals": h.saved }));
  const biggest = [...plan.entries].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const personal = m.planned - m.jointCost + m.goalMonthly;

  return (
    <>
      <Head title="Insights" sub="The Planner names the patterns; the charts are the evidence."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      {m.insights === null ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="empty" style={{ fontWeight: 600, color: "var(--ink)" }}>No patterns yet.</p>
          <p className="empty">
            Give the Planner a little more history — a few months of logged spending — and this page
            starts naming what's changing and what deserves attention: categories trending up, bills
            that ran unusually high, savings picking up speed.
          </p>
        </div>
      ) : (
        <div className="grid g2" style={{ marginBottom: 16 }}>
          {m.insights.map((ins) => (
            <div className="card" key={ins.title}
              style={{ borderLeft: `4px solid ${ins.tone === "warn" ? C.joint : ins.tone === "ok" ? C.ok : "var(--line)"}` }}>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-.01em" }}>{ins.title}</div>
              <p className="empty" style={{ marginTop: 5 }}>{ins.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead"><h3>Planned vs. actual</h3><span className="meta num">{money(m.spent)} of {money(m.planned)}</span></div>
          {byGroup.length === 0 ? <p className="empty">Nothing to chart yet.</p> : (
            <div style={{ height: 230 }}>
              <ResponsiveContainer>
                <BarChart data={byGroup} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} tickFormatter={compact} width={46} />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(92,104,100,.07)" }} />
                  <Bar dataKey="Planned" fill="rgba(92,104,100,.2)" radius={3} />
                  <Bar dataKey="Spent" fill={C.a} radius={3} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="card">
          <div className="chead"><h3>Who spent it</h3><span className="meta">this month</span></div>
          {byWho.length === 0 ? <p className="empty">Nothing logged yet.</p> : (
            <>
              <div style={{ height: 185 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byWho} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={2} stroke="none">
                      {byWho.map((d, i) => <Cell key={i} fill={[C.a, C.b, C.joint][i % 3]} />)}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="railkey" style={{ justifyContent: "center" }}>
                {byWho.map((d, i) => <span key={i}><i className="dot" style={{ background: [C.a, C.b, C.joint][i % 3] }} />{d.name}</span>)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid g23" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead"><h3>Six-month trend</h3><span className="meta">the dashed line is your income</span></div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={trend} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} tickFormatter={compact} width={46} />
                <Tooltip content={<Tip />} cursor={{ fill: "rgba(92,104,100,.07)" }} />
                <Bar dataKey="Spent" stackId="s" fill={C.a} radius={[0, 0, 3, 3]} />
                <Bar dataKey="Toward goals" stackId="s" fill={C.joint} radius={[3, 3, 0, 0]} />
                <ReferenceLine y={m.income} stroke={C.ink} strokeDasharray="4 3" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="chead"><h3>Biggest five</h3><span className="meta">this month</span></div>
          {biggest.length === 0 ? <p className="empty">Nothing logged yet.</p> : biggest.map((t) => {
            const e = plan.envelopes.find((x) => x.id === t.envId);
            return (
              <div className="note" key={t.id} style={{ justifyContent: "space-between" }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.note || (e ? e.name : "Spending")} <span className="muted">· {m.ownerName(t.who)}</span>
                </span>
                <span className="num">{money(t.amount)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
          <div className="chead"><h3>Versus normal</h3><span className="meta">your last three months, paced to today</span></div>
          {!m.paceDiag ? (
            <p className="empty">Needs a few months of logged spending before "normal" means anything.</p>
          ) : (
            <>
              <p className="empty" style={{ fontWeight: 600, color: "var(--ink)" }}>
                {m.paceDiag.delta > 25
                  ? `You're ${money(m.paceDiag.delta)} above your normal pace for this point in the month.`
                  : m.paceDiag.delta < -25
                    ? `You're ${money(-m.paceDiag.delta)} under your normal pace for this point in the month.`
                    : "Right on your normal pace for this point in the month."}
              </p>
              {m.paceDiag.over.map((r) => (
                <div className="note" key={r.name} style={{ justifyContent: "space-between" }}>
                  <span>{r.name}</span>
                  <span className="num" style={{ color: C.warn }}>+{money(r.delta)}</span>
                </div>
              ))}
              {m.paceDiag.under.map((r) => (
                <div className="note" key={r.name} style={{ justifyContent: "space-between" }}>
                  <span>{r.name}</span>
                  <span className="num" style={{ color: C.ok }}>−{money(-r.delta)}</span>
                </div>
              ))}
              {m.paceDiag.over.length === 0 && m.paceDiag.under.length === 0 && (
                <p className="empty">No envelope is far from its usual pace.</p>
              )}
            </>
          )}
      </div>

      <div className="card">
        <div className="chead">
          <h3>The fair-split read</h3>
          <span className="meta">{state.household.splitRule === "even" ? "split down the middle" : "split by income"}</span>
        </div>
        <div className="grid g3">
          <Kpi label={`${m.pA.name}'s share of shared costs`} value={money(m.jointCost * m.shareA)} foot={`${Math.round(m.shareA * 100)}% of ${money(m.jointCost)}`} />
          <Kpi label={`${m.pB.name}'s share`} value={money(m.jointCost * (1 - m.shareA))} foot={`${Math.round((1 - m.shareA) * 100)}% of ${money(m.jointCost)}`} />
          <Kpi label="Outside the shared pot" value={money(personal)} foot="personal envelopes, spending money, and anything unassigned" />
        </div>
      </div>
    </>
  );
}
