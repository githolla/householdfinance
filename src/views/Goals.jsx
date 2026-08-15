/* ==================================================================
   goals — anything you'd rather fund on purpose than pay for by surprise
   ================================================================== */

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { money, num, uid, compact, monthLabel, shiftMonth, C } from "../lib/format.js";
import { Head, Kpi, Tip, axis } from "../components.jsx";

const ROLES = [
  ["", "General"],
  ["emergency", "Emergency fund"],
  ["travel", "Travel"],
];

export default function Goals({ ctx }) {
  const { m, state, patch, month } = ctx;
  const totalTarget = state.goals.reduce((n, g) => n + g.target, 0);
  const totalSaved = state.goals.reduce((n, g) => n + g.saved, 0);

  return (
    <>
      <Head title="Goals" sub="Anything you'd rather fund on purpose than pay for by surprise." />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Saved so far" value={money(totalSaved)} foot={`of ${money(totalTarget)} across ${state.goals.length}`} />
        <Kpi label="Going in monthly" value={money(m.goalMonthly)} />
        <Kpi label="Savings rate" value={Math.round(m.savingsRate) + "%"} tone={m.savingsRate >= 15 ? "up" : "mid"} />
        <Kpi label="On track" value={`${state.goals.filter((g) => !m.goalStatus(g).late).length} / ${state.goals.length}`} />
      </div>

      {m.flow.efGoal && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="chead">
            <h3>How big the emergency fund should be</h3>
            <span className="meta">{state.waterfall.emergencyMonths} months of essentials</span>
          </div>
          <p className="empty">
            Keeping the lights on costs {money(m.flow.monthlyEssentialSpend)} a month — essentials and fixed bills, not
            travel or eating out. {state.waterfall.emergencyMonths} months of that is <b className="num">{money(m.flow.efTarget)}</b>.
            {m.flow.efFunded
              ? " You're there. Redirect what was going in."
              : ` You're ${money(Math.max(0, m.flow.efTarget - m.flow.efGoal.saved))} short.`}
          </p>
        </div>
      )}

      {state.goals.length === 0 && <div className="card"><p className="empty">No goals yet. Start with the one you'd both name first if someone asked.</p></div>}

      {state.goals.map((g, i) => {
        const st = m.goalStatus(g);
        const set = (f, v) => patch((s) => { s.goals[i][f] = v; return s; });
        const proj = [];
        if (g.monthly > 0 && st.remaining > 0) {
          const steps = Math.min(st.monthsNeeded, 24);
          for (let k = 0; k <= steps; k++)
            proj.push({ label: monthLabel(shiftMonth(month, k), true), Projected: Math.min(g.target, g.saved + g.monthly * k) });
        }
        return (
          <div className="card" key={g.id} style={{ marginBottom: 14 }}>
            <div className="chead">
              <input className="field" style={{ border: "none", background: "none", fontFamily: "Fraunces, Georgia, serif", fontSize: 19, padding: 0 }}
                value={g.name} onChange={(e) => set("name", e.target.value)} aria-label="Goal name" />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select className="tag" value={g.role || ""} onChange={(e) => {
                  const role = e.target.value;
                  patch((s) => {
                    s.goals[i].role = role || undefined;
                    if (role === "emergency") s.waterfall.emergencyGoalId = s.goals[i].id;
                    else if (s.waterfall.emergencyGoalId === s.goals[i].id) s.waterfall.emergencyGoalId = "";
                    return s;
                  });
                }} aria-label="Goal kind">
                  {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="kill" onClick={() => patch((s) => { s.goals.splice(i, 1); return s; })} aria-label="Remove">×</button>
              </div>
            </div>
            <div className="track"><i style={{ width: st.pct + "%", background: st.late ? C.warn : C.joint }} /></div>
            <div className="metaline">
              <span className="num"><b>{money(g.saved)}</b> of {money(g.target)} · {Math.round(st.pct)}%</span>
              {st.done ? <span className="flag ok">Funded</span>
                : st.eta ? <span>lands <b>{monthLabel(st.eta)}</b>{g.due ? ` · wanted by ${monthLabel(g.due)}` : ""}</span>
                  : <span>add a monthly amount to see when it lands</span>}
              {st.late && <span className="flag late">needs {money(st.needed)}/mo</span>}
              {!st.late && g.due && !st.done && <span className="flag ok">on pace</span>}
              <button className="btn ghost tiny" onClick={() => set("saved", g.saved + g.monthly)}>
                Add this month's {money(g.monthly)}
              </button>
            </div>
            {proj.length > 2 && (
              <div className="chartbox mini" style={{ marginTop: 14 }}>
                <ResponsiveContainer>
                  <LineChart data={proj} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={C.line} vertical={false} />
                    <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={36} />
                    <YAxis {...axis} tickFormatter={compact} width={46} />
                    <Tooltip content={<Tip />} />
                    <ReferenceLine y={g.target} stroke={C.joint} strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="Projected" stroke={C.a} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="fourup">
              <div><label className="lbl">Target</label><input className="field num" inputMode="decimal" value={g.target || ""} placeholder="0" onChange={(e) => set("target", num(e.target.value))} /></div>
              <div><label className="lbl">Saved</label><input className="field num" inputMode="decimal" value={g.saved || ""} placeholder="0" onChange={(e) => set("saved", num(e.target.value))} /></div>
              <div><label className="lbl">Monthly</label><input className="field num" inputMode="decimal" value={g.monthly || ""} placeholder="0" onChange={(e) => set("monthly", num(e.target.value))} /></div>
              <div><label className="lbl">Want it by</label><input className="field num" type="month" value={g.due || ""} onChange={(e) => set("due", e.target.value)} /></div>
            </div>
          </div>
        );
      })}
      <button className="btn ghost tiny" onClick={() => patch((s) => {
        s.goals.push({ id: uid(), name: "New goal", target: 0, saved: 0, monthly: 0, due: "", owner: "joint" });
        return s;
      })}>Add a goal</button>
    </>
  );
}
