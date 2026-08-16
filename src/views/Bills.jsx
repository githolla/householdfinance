/* ==================================================================
   bills — the fixed stuff, with a link straight to the payment page
   ================================================================== */

import { useState } from "react";
import { money, num, uid, ordinal, safeUrl, hostOf, C } from "../lib/format.js";
import { Head, MonthNav, Kpi } from "../components.jsx";

export default function Bills({ ctx }) {
  const { m, state, patch, plan, writeMonth, month, setMonth } = ctx;
  const [editing, setEditing] = useState("");
  const set = (i, f, v) => patch((s) => { s.bills[i][f] = v; return s; });

  const togglePaid = (b) => writeMonth((mm) => {
    mm.paid = mm.paid || [];
    if (mm.paid.includes(b.id)) {
      mm.paid = mm.paid.filter((x) => x !== b.id);
      // un-marking removes the entry the mark logged — one, not all
      const i2 = mm.entries.findIndex((t) => t.note === b.name + " (bill)" && t.amount === b.amount);
      if (i2 >= 0) mm.entries.splice(i2, 1);
    } else {
      mm.paid.push(b.id);
      if (b.envId && mm.envelopes.some((e) => e.id === b.envId))
        mm.entries.unshift({
          id: uid(), envId: b.envId, amount: b.amount, who: b.owner,
          note: b.name + " (bill)", day: b.day,
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
    }
    return mm;
  });

  const withLinks = state.bills.filter((b) => safeUrl(b.payUrl)).length;

  return (
    <>
      <Head title="Bills" sub="Mark one paid and it logs itself into the right envelope. Add the link you actually pay it on."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      {/* the read that matters: does the cash cover what's coming? */}
      <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${!m.billsCovered.known ? "var(--line)" : m.billsCovered.ok ? C.ok : C.warn}` }}>
        {!m.billsCovered.known ? (
          <p className="empty" style={{ fontWeight: 600, color: "var(--ink)" }}>
            {state.bills.length === 0
              ? "List the bills that repeat and this line will tell you how far your cash covers them."
              : "Add your cash accounts on Net worth and this line will tell you how far they cover these bills."}
          </p>
        ) : m.billsCovered.ok || !m.billsCovered.shortBill ? (
          <p className="empty" style={{ fontWeight: 600, color: "var(--ink)" }}>
            ✓ You're covered through {m.billsCovered.throughLabel} — {money(m.billsCovered.cash)} on hand
            against everything due between now and then.
          </p>
        ) : (
          <p className="empty" style={{ fontWeight: 600, color: "var(--ink)" }}>
            ! Heads up — by the time {m.billsCovered.shortBill.name} ({money(m.billsCovered.shortBill.amount)})
            comes due, the cash accounts run short. Something needs to land first.
          </p>
        )}
      </div>

      {m.bills.some((b) => !b.paid) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="chead"><h3>Coming up</h3><span className="meta num">{money(m.billsLeft)} still to go this month</span></div>
          {m.bills.filter((b) => !b.paid).map((b) => (
            <div className="note" key={b.id} style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", gap: 9, alignItems: "center", minWidth: 0 }}>
                <span className="tick" style={{ background: b.overdue ? C.warn : C.joint, minHeight: 15 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>{b.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {b.overdue ? `was due the ${ordinal(b.day)}` : `the ${ordinal(b.day)}`}
                  </span>
                </span>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="num" style={{ fontSize: 15 }}>{money(b.amount)}</span>
                {safeUrl(b.payUrl) && <a className="btn ghost tiny" href={safeUrl(b.payUrl)} target="_blank" rel="noopener noreferrer">Pay ↗</a>}
                <button className="btn ghost tiny" onClick={() => togglePaid(b)}>Paid</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Kpi label="Monthly bills" value={money(m.billsTotal)} foot={`${state.bills.length} recurring · ${withLinks} with pay links`} />
        <Kpi label="Still unpaid" value={money(m.billsLeft)} tone={m.billsLeft > 0 ? "mid" : "up"} />
        <Kpi label="Share of income" value={m.income ? Math.round((m.billsTotal / m.income) * 100) + "%" : "—"} />
      </div>

      <div className="card">
        <div className="chead"><h3>All bills</h3><span className="meta">edit anything in place</span></div>
        {state.bills.length === 0 && <p className="empty">Add the bills that repeat every month — rent, insurance, the streaming stack you forgot about.</p>}
        {m.bills.map((b) => {
          const i = state.bills.findIndex((x) => x.id === b.id);
          const url = safeUrl(b.payUrl);
          const host = hostOf(b.payUrl);
          const open = editing === b.id;
          return (
            <div key={b.id}>
              <div className="row wide bill">
                <div className="rowname">
                  <span style={{ width: 4, height: 16, borderRadius: 3, flex: "none", background: b.paid ? C.a : b.overdue ? C.warn : C.joint }} />
                  <input value={b.name} onChange={(e) => set(i, "name", e.target.value)} aria-label="Bill name" />
                  <select className="tag" value={b.envId || ""} onChange={(e) => set(i, "envId", e.target.value)} aria-label="Envelope">
                    <option value="">no envelope</option>
                    {plan.envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <button className="tag" onClick={() => {
                    const order = ["joint", "a", "b"];
                    set(i, "owner", order[(order.indexOf(b.owner) + 1) % 3]);
                  }}>{m.ownerName(b.owner)}</button>
                  <button className="tag" style={url ? { borderColor: C.a, color: C.a } : undefined}
                    onClick={() => setEditing(open ? "" : b.id)}>
                    {url ? "Link ✓" : "Add link"}
                  </button>
                  <button className="kill" onClick={() => patch((s) => { s.bills.splice(i, 1); return s; })} aria-label="Remove">×</button>
                </div>
                <div className="amt hideS" style={{ textAlign: "left" }}>
                  <span className="muted">due </span>
                  <input className="num" style={{ width: 40, textAlign: "left" }} inputMode="numeric" value={b.day}
                    onChange={(e) => set(i, "day", Math.min(31, Math.max(1, num(e.target.value) || 1)))} aria-label="Due day" />
                </div>
                <div className="amt">
                  <input className="num" inputMode="decimal" value={b.amount || ""} placeholder="0"
                    onChange={(e) => set(i, "amount", num(e.target.value))} aria-label="Amount" />
                </div>
                <div className="amt" style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {url && (
                    <a className="btn ghost tiny" href={url} target="_blank" rel="noopener noreferrer"
                      title={`Pay ${b.name} at ${host}`}>Pay ↗</a>
                  )}
                  <button className={"btn tiny " + (b.paid ? "" : "ghost")} onClick={() => togglePaid(b)}>
                    {b.paid ? "Paid" : "Mark paid"}
                  </button>
                </div>
              </div>
              {open && (
                <div style={{ padding: "4px 0 12px" }}>
                  <label className="lbl">Where you pay {b.name}</label>
                  <input className="field" type="url" inputMode="url" placeholder="chase.com/pay"
                    value={b.payUrl || ""} onChange={(e) => set(i, "payUrl", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setEditing("")} aria-label="Pay link" />
                  <p className="empty">
                    {b.payUrl && !url
                      ? "That doesn't look like a web address — it needs to start with http or https."
                      : url
                        ? `Opens ${host} in a new tab. Due the ${ordinal(b.day)}.`
                        : "Paste the page you land on to pay this. It opens in a new tab — nothing is stored but the address."}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        <button className="btn ghost tiny" style={{ marginTop: 14 }} onClick={() => patch((s) => {
          s.bills.push({ id: uid(), name: "New bill", amount: 0, day: 1, envId: "", owner: "joint", payUrl: "" });
          return s;
        })}>Add a bill</button>
      </div>
    </>
  );
}
