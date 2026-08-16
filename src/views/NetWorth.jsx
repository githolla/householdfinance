/* ==================================================================
   net worth + debt — what you own, what you owe, and how fast the
   second one disappears
   ================================================================== */

import { useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell,
} from "recharts";
import { money, num, uid, compact, monthLabel, C, PIE } from "../lib/format.js";
import { Head, Kpi, Tip, axis } from "../components.jsx";

export default function NetWorth({ ctx }) {
  const { m, state, patch } = ctx;
  const [strategy, setStrategy] = useState(state.waterfall.debtStrategy || "avalanche");
  const set = (i, f, v) => patch((s) => { s.accounts[i][f] = v; return s; });

  const extra = state.waterfall.debtExtra || 0;
  const run = strategy === "snowball" ? m.debt.snowball : m.debt.avalanche;
  const baseline = m.debt.baseline;
  const mix = m.assets.map((a) => ({ name: a.name, value: a.balance })).filter((d) => d.value > 0);

  const curve = run.schedule.map((r) => ({ label: monthLabel(r.month, true), Balance: r.closing }));
  const perDebt = Object.values(run.perDebt);
  const funded = m.fundedExtra;
  const requestedButUnfunded = extra > funded + 0.5;

  return (
    <>
      <Head title="Net worth" sub="What you're building, what you owe, and how fast the second one disappears. A direction, not a score." />

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Kpi label="Net worth" value={money(m.netWorth)} tone={m.netWorth < 0 ? "down" : "up"} />
        <Kpi label="Assets" value={money(m.assetTotal)} foot={`${m.assets.length} accounts`} />
        <Kpi label="Debt" value={money(m.debtTotal)} foot={`${money(m.debtMin)}/mo in minimums`} tone={m.debtTotal > 0 ? "down" : ""} />
      </div>

      <div className="grid g23" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead"><h3>Accounts</h3><span className="meta">balances you update when you check them</span></div>
          {state.accounts.length === 0 && <p className="empty">Add checking, savings, retirement, the car loan — whatever moves the number.</p>}
          {state.accounts.map((a, i) => (
            <div className="row wide" key={a.id}>
              <div className="rowname">
                <i className="dot" style={{ background: a.type === "debt" ? C.warn : m.ownerColor(a.owner) }} />
                <input value={a.name} onChange={(e) => set(i, "name", e.target.value)} aria-label="Account name" />
                <select className="tag" value={a.type} onChange={(e) => set(i, "type", e.target.value)} aria-label="Type">
                  <option value="cash">Cash</option>
                  <option value="invest">Investment</option>
                  <option value="property">Property</option>
                  <option value="debt">Debt</option>
                </select>
                <button className="tag hideS" onClick={() => {
                  const order = ["joint", "a", "b"];
                  set(i, "owner", order[(order.indexOf(a.owner) + 1) % 3]);
                }}>{m.ownerName(a.owner)}</button>
                <button className="kill" onClick={() => patch((s) => { s.accounts.splice(i, 1); return s; })} aria-label="Remove">×</button>
              </div>
              <div className="amt hideS" style={{ textAlign: "left" }}>
                {a.type === "debt" && (
                  <>
                    <span className="muted">APR </span>
                    <input className="num" style={{ width: 44, textAlign: "left" }} inputMode="decimal" value={a.apr || ""} placeholder="0"
                      onChange={(e) => set(i, "apr", num(e.target.value))} aria-label="APR" />
                    <span className="muted">%</span>
                  </>
                )}
              </div>
              <div className="amt hideS">
                {a.type === "debt" && <input className="num" inputMode="decimal" value={a.minPayment || ""} placeholder="min"
                  onChange={(e) => set(i, "minPayment", num(e.target.value))} aria-label="Minimum payment" />}
              </div>
              <div className="amt">
                <input className="num" inputMode="decimal" value={a.balance || ""} placeholder="0" onChange={(e) => set(i, "balance", num(e.target.value))} aria-label="Balance" />
              </div>
            </div>
          ))}
          <button className="btn ghost tiny" style={{ marginTop: 14 }} onClick={() => patch((s) => {
            s.accounts.push({ id: uid(), name: "New account", type: "cash", balance: 0, owner: "joint", apr: 0, minPayment: 0 });
            return s;
          })}>Add an account</button>
        </div>

        <div className="card">
          <div className="chead"><h3>What holds it up</h3></div>
          {mix.length === 0 ? <p className="empty">Add an asset to see the split.</p> : (
            <div className="chartbox short">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={mix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={76} paddingAngle={2} stroke="none">
                    {mix.map((d, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="railkey">
            {mix.map((d, i) => <span key={i}><i className="dot" style={{ background: PIE[i % PIE.length] }} />{d.name}</span>)}
          </div>
        </div>
      </div>

      {m.debts.length > 0 && (
        <div className="card">
          <div className="chead">
            <h3>Getting out</h3>
            <span className="meta">simulated month by month at today's balances, with each cleared payment rolling into the next</span>
          </div>

          <p className="empty" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>{m.debt.sentence}</p>

          <div className="toolbar">
            <div className="chips" style={{ marginBottom: 0 }}>
              <button className={"chip " + (strategy === "avalanche" ? "on" : "")} onClick={() => setStrategy("avalanche")}>Highest rate first</button>
              <button className={"chip " + (strategy === "snowball" ? "on" : "")} onClick={() => setStrategy("snowball")}>Smallest balance first</button>
            </div>
            <span className="muted">Extra per month</span>
            <input className="field num" style={{ width: 110 }} inputMode="decimal" placeholder="$0" value={extra || ""}
              onChange={(e) => patch((s) => { s.waterfall.debtExtra = num(e.target.value); return s; })} aria-label="Extra payment" />
          </div>

          {requestedButUnfunded && (
            <p className="empty warnText">
              Your plan only frees {money(funded)} of that {money(extra)} — the payoff date below is built on what you
              can actually fund, not what you asked for.
            </p>
          )}

          <div className="grid g3" style={{ marginBottom: 16 }}>
            <Kpi label="Debt-free in" value={run.never ? "—" : `${run.months} mo`}
              tone={run.never ? "down" : ""}
              foot={run.never
                ? (run.neverReason === "no-capacity" ? "no payments are going out" : "payments don't cover the interest")
                : monthLabel(run.payoffMonth)} />
            <Kpi label="Interest paid" value={run.never ? "—" : money(run.totalInterest)}
              tone={m.debt.saved.interest > 0 ? "up" : ""}
              foot={run.never ? "no payoff to price"
                : m.debt.saved.interest > 0
                  ? `${money(m.debt.saved.interest)} less than minimums alone`
                  : "at minimum payments"} />
            <Kpi label="Attack first" value={run.order[0] || "—"} foot={run.order.slice(1).join(" → ") || "then you're done"} />
          </div>

          {!run.never && m.debt.plus100.monthsSaved > 0 && (
            <p className="empty" style={{ marginBottom: 12 }}>
              Another {money(m.debt.plus100.step)} a month would take <b>{m.debt.plus100.monthsSaved} months</b> off it
              and save <b className="num">{money(m.debt.plus100.interestSaved)}</b> in interest.
            </p>
          )}

          <div className="grouphead"><span>Each debt</span><span>at {money(run.budget)}/mo</span></div>
          {perDebt.map((d) => (
            <div className="row wide" key={d.id}>
              <div className="rowname">
                <i className="dot" style={{ background: d.underwater ? C.warn : C.joint }} />
                <span>{d.name}</span>
                {d.underwater && <span className="tag" style={{ borderColor: C.warn, color: C.warn }}>minimum &lt; interest</span>}
              </div>
              <div className="amt muted hideS" style={{ textAlign: "left" }}>{d.apr.toFixed(1)}% APR</div>
              <div className="amt num muted hideS">{money(d.startBalance)}</div>
              <div className="amt num">{d.payoffMonth ? monthLabel(d.payoffMonth, true) : "—"}</div>
            </div>
          ))}

          {curve.length > 2 && (
            <div className="chartbox" style={{ marginTop: 16 }}>
              <ResponsiveContainer>
                <AreaChart data={curve} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.warn} stopOpacity={0.24} />
                      <stop offset="100%" stopColor={C.warn} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  {/* a 40-month payoff is 40 labels — thin them or they overlap into a smear */}
                  <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={44} />
                  <YAxis {...axis} tickFormatter={compact} width={46} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="Balance" stroke={C.warn} fill="url(#gD)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {!baseline.never && !run.never && (
            <p className="empty">
              At minimum payments with nothing rolling over, this takes {baseline.months} months
              and {money(baseline.totalInterest)} in interest.
            </p>
          )}
        </div>
      )}
    </>
  );
}
