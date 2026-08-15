/* ==================================================================
   the plan — where every dollar goes, in order

   Income falls through the stages top to bottom. Each one takes what it
   needs; spending money is what's left at the bottom.
   ================================================================== */

import { money, num, C } from "../lib/format.js";
import { Head, Kpi } from "../components.jsx";

export default function Plan({ ctx }) {
  const { m, state, patch, setView } = ctx;
  const f = m.flow;
  const cfg = state.waterfall;

  const move = (key, dir) => patch((s) => {
    const order = s.waterfall.order.filter((k) => k !== "spending");
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return s;
    [order[i], order[j]] = [order[j], order[i]];
    s.waterfall.order = [...order, "spending"];
    return s;
  });

  return (
    <>
      <Head title="The plan" sub="Where every dollar goes, in the order you want it to go there." />

      <p className="thesis">{f.sentence}</p>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Coming in" value={money(f.pool)} foot={`${m.pA.name} and ${m.pB.name} together`} />
        <Kpi label="Spending money" value={money(f.spending.total)}
          foot={`${money(f.spending.a)} ${m.pA.name} · ${money(f.spending.b)} ${m.pB.name}`}
          tone={f.spending.total > 0 ? "up" : "mid"} />
        <Kpi label={f.totalShortfall > 1 ? "Short by" : "Unspent"}
          value={money(f.totalShortfall > 1 ? f.totalShortfall : f.leftover)}
          tone={f.totalShortfall > 1 ? "down" : "up"}
          foot={f.totalShortfall > 1 ? "across the stages below" : "lands in spending money"} />
        <Kpi label="Tithe" value={money(f.rows.find((r) => r.key === "tithe").funded)}
          foot={`${cfg.tithePct}% of ${cfg.titheBase === "gross" ? "what comes in" : "what's left after tax"}`} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead">
          <h3>The waterfall</h3>
          <span className="meta">each stage takes what it needs before the next one sees a dollar</span>
        </div>

        {f.rows.map((r, i) => {
          const pct = r.need > 0 ? Math.min(100, (r.funded / r.need) * 100) : 100;
          const last = i === f.rows.length - 1;
          return (
            <div className="stage" key={r.key}>
              <div className="rowname">
                {!last && (
                  <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <button className="kill" style={{ fontSize: 11, lineHeight: 1 }} onClick={() => move(r.key, -1)} aria-label={`Move ${r.label} up`}>▲</button>
                    <button className="kill" style={{ fontSize: 11, lineHeight: 1 }} onClick={() => move(r.key, 1)} aria-label={`Move ${r.label} down`}>▼</button>
                  </span>
                )}
                <span>{r.label}</span>
                {r.underfunded && <span className="tag" style={{ borderColor: C.warn, color: C.warn }}>short {money(r.shortfall)}</span>}
                {last && <span className="muted">— whatever's left</span>}
              </div>
              <div className="amt num muted hideS">{last ? "—" : money(r.need)}</div>
              <div className={"amt num " + (r.underfunded ? "over" : "")}>{money(r.funded)}</div>
              <div className="sbar"><i className={r.underfunded ? "short" : ""} style={{ width: pct + "%" }} /></div>
            </div>
          );
        })}

        <p className="empty" style={{ marginTop: 12 }}>
          {f.totalShortfall > 1
            ? "Move a stage up to protect it, or bring the ones above it down."
            : "Reorder with the arrows. Spending money always sits last — it's the remainder, not a stage."}
        </p>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="chead"><h3>How it's set up</h3></div>
          <div className="pair">
            <div>
              <label className="lbl">Tithe</label>
              <input className="field num" inputMode="decimal" value={cfg.tithePct}
                onChange={(e) => patch((s) => { s.waterfall.tithePct = Math.min(100, Math.max(0, num(e.target.value))); return s; })}
                aria-label="Tithe percent" />
            </div>
            <div>
              <label className="lbl">Emergency fund</label>
              <input className="field num" inputMode="numeric" value={cfg.emergencyMonths}
                onChange={(e) => patch((s) => { s.waterfall.emergencyMonths = Math.max(0, num(e.target.value)); return s; })}
                aria-label="Months of essentials" />
            </div>
          </div>
          <label className="lbl">Tithe is taken from</label>
          <div className="chips">
            <button className={"chip " + (cfg.titheBase === "gross" ? "on" : "")}
              onClick={() => patch((s) => { s.waterfall.titheBase = "gross"; return s; })}>Everything that comes in</button>
            <button className={"chip " + (cfg.titheBase === "afterTax" ? "on" : "")}
              onClick={() => patch((s) => { s.waterfall.titheBase = "afterTax"; return s; })}>What's left after tax</button>
          </div>
          <label className="lbl" style={{ marginTop: 8 }}>Extra toward debt</label>
          <input className="field num" inputMode="decimal" value={cfg.debtExtra || ""} placeholder="0"
            onChange={(e) => patch((s) => { s.waterfall.debtExtra = num(e.target.value); return s; })}
            aria-label="Extra toward debt" />
          <p className="empty">
            {m.fundedExtra < (cfg.debtExtra || 0) - 0.5
              ? `The plan can only free ${money(m.fundedExtra)} of that right now.`
              : "This is the number the payoff date on Net worth is built on."}
          </p>
        </div>

        <div className="card">
          <div className="chead"><h3>What each stage covers</h3></div>
          <div className="note"><span className="muted">Tithe</span></div>
          <p className="empty">Off the top, before anything else has a claim on it.</p>
          <div className="note"><span className="muted">Tax reserve</span>
            <button className="btn ghost tiny" style={{ marginLeft: "auto" }} onClick={() => setView("taxes")}>Open</button>
          </div>
          <p className="empty">
            {m.tax.incomplete ? "Add what you each billed this year and this fills itself in."
              : `${money(m.tax.monthlyReserve)} a month — about ${Math.round(m.tax.setAsidePct)}% of what you bill.`}
          </p>
          <div className="note"><span className="muted">Fixed bills and essentials</span></div>
          <p className="empty">
            Bills that repeat, then the envelopes marked essential in Budget. A bill pointing at an envelope is only
            counted once — {money(f.billsTotal)} of bills, {money(f.monthlyEssentialSpend)} to keep the lights on.
          </p>
          <div className="note"><span className="muted">Emergency fund, debt, goals</span></div>
          <p className="empty">In whatever order you put them. Everything left over is yours to spend.</p>
        </div>
      </div>
    </>
  );
}
