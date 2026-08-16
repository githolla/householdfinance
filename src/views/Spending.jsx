/* ==================================================================
   spending — everything logged this month, and who spent it
   ================================================================== */

import { useState } from "react";
import { money, C } from "../lib/format.js";
import { Head, MonthNav, Kpi } from "../components.jsx";

export default function Spending({ ctx, receipt }) {
  const { m, plan, writeMonth, month, setMonth } = ctx;
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const [env, setEnv] = useState("all");

  const rows = plan.entries.filter((t) => {
    if (who !== "all" && t.who !== who) return false;
    if (env !== "all" && t.envId !== env) return false;
    if (q && !`${t.note || ""} ${t.merchant || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const total = rows.reduce((n, t) => n + t.amount, 0);

  return (
    <>
      <Head title="Transactions" sub="Everything logged this month, and who spent it."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <div className="logger">
        <button className="btn" onClick={() => receipt.openBlank()}>Log spending</button>
        <label className="btn ghost">
          Snap a receipt
          <input type="file" accept="image/*" capture="environment" className="hiddenfile"
            onChange={(e) => { receipt.capture(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        </label>
        <span className="muted" style={{ alignSelf: "center" }}>
          A photo just fills the form in — you can always type it instead.
        </span>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Spent this month" value={money(m.spent)} foot={`${plan.entries.length} transactions`} />
        <Kpi label={m.pA.name} value={money(m.spentByWho.a || 0)} />
        <Kpi label={m.pB.name} value={money(m.spentByWho.b || 0)} />
        <Kpi label="Shared" value={money(m.spentByWho.joint || 0)} />
      </div>

      <div className="toolbar">
        <input className="field" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 170 }} aria-label="Search notes" />
        <select className="field" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
          <option value="all">Anyone</option>
          <option value="a">{m.pA.name}</option>
          <option value="b">{m.pB.name}</option>
          <option value="joint">Shared</option>
        </select>
        <select className="field" value={env} onChange={(e) => setEnv(e.target.value)} aria-label="Filter by envelope">
          <option value="all">All envelopes</option>
          {plan.envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="muted num" style={{ marginLeft: "auto" }}>{rows.length} shown · {money(total)}</span>
      </div>

      <div className="card">
        {rows.length === 0 ? <p className="empty">Nothing matches. Clear the filters, or log something above.</p> :
          rows.map((t) => {
            const e = plan.envelopes.find((x) => x.id === t.envId);
            const idx = plan.entries.indexOf(t);
            return (
              <div className="row wide" key={t.id}>
                <div className="rowname">
                  <i className="dot" style={{ background: m.ownerColor(t.who) }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.note || "Spending"}
                    {t.items && t.items.length > 0 && <span className="muted"> · {t.items.length} items</span>}
                  </span>
                  <span className="tag">{e ? e.name : "unfiled"}</span>
                </div>
                <div className="amt muted hideS" style={{ textAlign: "left" }}>{m.ownerName(t.who)}</div>
                <div className="amt muted hideS">{t.date}</div>
                <div className="amt num">
                  {money(t.amount, true)}
                  <button className="kill" onClick={() => writeMonth((mm) => { mm.entries.splice(idx, 1); return mm; })} aria-label="Remove">×</button>
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
