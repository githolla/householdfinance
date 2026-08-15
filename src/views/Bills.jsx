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
    if (mm.paid.includes(b.id)) mm.paid = mm.paid.filter((x) => x !== b.id);
    else {
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

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Kpi label="Monthly bills" value={money(m.billsTotal)} foot={`${state.bills.length} recurring · ${withLinks} with pay links`} />
        <Kpi label="Still unpaid" value={money(m.billsLeft)} tone={m.billsLeft > 0 ? "mid" : "up"} />
        <Kpi label="Share of income" value={m.income ? Math.round((m.billsTotal / m.income) * 100) + "%" : "—"} />
      </div>

      <div className="card">
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
                  <select className="tag hideS" value={b.envId || ""} onChange={(e) => set(i, "envId", e.target.value)} aria-label="Envelope">
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
