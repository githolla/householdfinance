/* ==================================================================
   taxes — what to hold back when nobody withholds it for you

   An estimate for setting money aside. Not tax advice, and not a filing.
   The disclaimer belongs on the card, in Settings, and in the planner
   snapshot — all three, always visible, never dismissible.
   ================================================================== */

import { money, num, uid, C } from "../lib/format.js";
import { Head, Kpi } from "../components.jsx";

export default function Taxes({ ctx }) {
  const { m, state, patch } = ctx;
  const t = m.tax;
  const cfg = state.tax;

  const setTax = (f, v) => patch((s) => { s.tax[f] = v; return s; });
  const setPartner = (slot, f, v) => patch((s) => { s.tax.partners[slot][f] = v; return s; });

  const logPayment = (quarter, amount, kind) => patch((s) => {
    s.tax.payments.push({
      id: uid(),
      date: new Date().toISOString().slice(0, 10),
      amount, kind, quarter,
    });
    return s;
  });

  return (
    <>
      <Head title="Taxes" sub="What to hold back when nobody withholds it for you." />

      <p className="thesis">{t.sentence}</p>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Hold back monthly" value={t.incomplete ? "—" : money(t.monthlyReserve)}
          foot={t.incomplete ? "add your 1099 income below" : `${Math.round(t.setAsidePct)}% of what you bill`} />
        <Kpi label="Owed for the year" value={t.incomplete ? "—" : money(t.netOwed)}
          foot={t.incomplete ? "" : `${money(t.seTax)} self-employment · ${money(t.federalTax)} federal${t.stateTax > 0 ? ` · ${money(t.stateTax)} state` : ""}`} />
        <Kpi label="Set aside so far" value={money(t.reservedToDate + t.paidToDate)}
          tone={t.reserveDelta < -1 ? "down" : "up"}
          foot={t.incomplete ? "" : t.reserveDelta < -1
            ? `${money(-t.reserveDelta)} behind`
            : `${money(t.reserveDelta)} ahead`} />
        <Kpi label="Effective rate" value={t.incomplete ? "—" : `${t.effectiveRatePct.toFixed(1)}%`}
          foot={t.incomplete ? "" : `${t.marginalRatePct}% on the next dollar`} />
      </div>

      <div className="grid g23" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead">
            <h3>The four payments</h3>
            <span className="meta">an estimate for setting money aside — not tax advice, and not a filing</span>
          </div>
          {t.incomplete ? (
            <p className="empty">Once you add what each of you billed, the quarterly amounts and due dates land here.</p>
          ) : t.quarters.map((q) => (
            <div className="row wide" key={q.label}>
              <div className="rowname">
                <span style={{ width: 4, height: 16, borderRadius: 3, flex: "none", background: q.paid ? C.a : q.past ? C.warn : C.joint }} />
                <span>{q.label}<span className="muted"> · {q.covers}</span></span>
              </div>
              <div className="amt muted hideS" style={{ textAlign: "left" }}>due {q.dueDate}</div>
              <div className="amt num">{money(q.amount)}</div>
              <div className="amt">
                <button className={"btn tiny " + (q.paid ? "" : "ghost")}
                  onClick={() => logPayment(q.label, q.amount, "paid")} disabled={q.paid}>
                  {q.paid ? "Paid" : "Mark paid"}
                </button>
              </div>
            </div>
          ))}
          {!t.incomplete && (
            <p className="empty" style={{ marginTop: 12 }}>
              {t.firstYear
                ? `First year self-employed, so there's no prior return to fall back on — plan on ${money(t.requiredAnnual)} to stay clear of a penalty, ${money(t.netOwed)} to owe nothing in April.`
                : `You need ${money(t.requiredAnnual)} across the four to avoid a penalty, ${money(t.netOwed)} to owe nothing in April.`}
            </p>
          )}
        </div>

        <div className="card">
          <div className="chead"><h3>How it breaks down</h3></div>
          {t.incomplete ? <p className="empty">Nothing to break down yet.</p> : (
            <>
              {[
                ["Self-employment tax", t.seTax],
                ["  Social Security", t.ssTaxTotal],
                ["  Medicare", t.medTaxTotal],
                ...(t.addlMedTax > 0 ? [["  Additional Medicare", t.addlMedTax]] : []),
                ["Federal income tax", t.federalTax],
                ...(t.stateTax > 0 ? [["State", t.stateTax]] : []),
                ["Total", t.totalTax],
              ].map(([k, v]) => (
                <div className="note" key={k} style={{ justifyContent: "space-between" }}>
                  <span className={k.startsWith("  ") ? "muted" : ""}>{k.trim()}</span>
                  <span className="num">{money(v)}</span>
                </div>
              ))}
              <div className="grouphead"><span>Getting to taxable income</span></div>
              {[
                ["Net earnings", t.gross1099Total - (t.perPartner.a.businessExpenses + t.perPartner.b.businessExpenses)],
                ["Half of SE tax, deducted", -t.halfSeDeduction],
                ["Standard deduction", -t.stdDeduction],
                ...(t.qbiDeduction > 0 ? [["Qualified business income", -t.qbiDeduction]] : []),
                ["Taxable income", t.taxableIncome],
              ].map(([k, v]) => (
                <div className="note" key={k} style={{ justifyContent: "space-between" }}>
                  <span className="muted">{k}</span><span className="num">{money(v)}</span>
                </div>
              ))}
              {t.qbiPhaseIn && (
                <p className="empty warnText">
                  Your taxable income is past where the qualified-business-income deduction starts phasing out. The
                  rules there depend on your line of work and what you pay in wages — this leaves it out rather than
                  guess. Worth an hour with an accountant.
                </p>
              )}
              {(t.perPartner.a.ssCapped || t.perPartner.b.ssCapped) && (
                <p className="empty">
                  One of you has passed the Social Security wage base of {money(t.assumptions.wageBase)} — earnings above
                  it stop being taxed for Social Security, though Medicare keeps going.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        {["a", "b"].map((slot) => {
          const p = cfg.partners[slot];
          const name = slot === "a" ? m.pA.name : m.pB.name;
          return (
            <div className="card" key={slot}>
              <div className="chead">
                <h3>{name}</h3>
                <span className="meta">{t.perPartner[slot].netEarnings > 0 ? money(t.perPartner[slot].netEarnings) + " net" : "not set up yet"}</span>
              </div>
              <div className="pair">
                <div><label className="lbl">1099 income this year</label>
                  <input className="field num" inputMode="decimal" value={p.gross1099 || ""} placeholder="0"
                    onChange={(e) => setPartner(slot, "gross1099", num(e.target.value))} /></div>
                <div><label className="lbl">Business expenses</label>
                  <input className="field num" inputMode="decimal" value={p.businessExpenses || ""} placeholder="0"
                    onChange={(e) => setPartner(slot, "businessExpenses", num(e.target.value))} /></div>
              </div>
              <div className="pair">
                <div><label className="lbl">W-2 wages (if any)</label>
                  <input className="field num" inputMode="decimal" value={p.w2Wages || ""} placeholder="0"
                    onChange={(e) => setPartner(slot, "w2Wages", num(e.target.value))} /></div>
                <div><label className="lbl">Retirement contributions</label>
                  <input className="field num" inputMode="decimal" value={p.retirement || ""} placeholder="0"
                    onChange={(e) => setPartner(slot, "retirement", num(e.target.value))} /></div>
              </div>
              <div><label className="lbl">Self-employed health insurance</label>
                <input className="field num" inputMode="decimal" value={p.healthIns || ""} placeholder="0"
                  onChange={(e) => setPartner(slot, "healthIns", num(e.target.value))} /></div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="chead">
          <h3>Assumptions</h3>
          <span className="meta">the {cfg.year} published figures — worth checking each January</span>
        </div>
        <div className="fourup" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
          <div>
            <label className="lbl">Tax year</label>
            <input className="field num" inputMode="numeric" value={cfg.year}
              onChange={(e) => setTax("year", num(e.target.value) || new Date().getFullYear())} />
          </div>
          <div>
            <label className="lbl">Filing as</label>
            <select className="field" value={cfg.filingStatus} onChange={(e) => setTax("filingStatus", e.target.value)}>
              <option value="mfj">Married, jointly</option>
              <option value="single">Single</option>
            </select>
          </div>
          <div>
            <label className="lbl">State rate %</label>
            <input className="field num" inputMode="decimal" value={cfg.stateRatePct || ""} placeholder="0"
              onChange={(e) => setTax("stateRatePct", num(e.target.value))} />
          </div>
          <div>
            <label className="lbl">Last year's tax</label>
            <input className="field num" inputMode="decimal" value={cfg.priorYearTax || ""} placeholder="0"
              onChange={(e) => setTax("priorYearTax", num(e.target.value))} />
          </div>
        </div>
        <div className="chips" style={{ marginTop: 14 }}>
          <button className={"chip " + (cfg.qbiEnabled ? "on" : "")} onClick={() => setTax("qbiEnabled", !cfg.qbiEnabled)}>
            Qualified business income deduction {cfg.qbiEnabled ? "on" : "off"}
          </button>
        </div>
        <p className="empty">
          This is an estimate for setting money aside, not tax advice and not a filing. It uses the published{" "}
          {cfg.year} figures — a {money(t.assumptions.wageBase)} Social Security wage base and a{" "}
          {money(t.assumptions.standardDeduction)} standard deduction. Those change every year, so check them each
          January, and take anything unusual to someone licensed.
        </p>
        {cfg.year !== new Date().getFullYear() && (
          <p className="empty warnText">
            You're working in tax year {cfg.year} but it's {new Date().getFullYear()}. The rates below are {cfg.year}'s.
          </p>
        )}
      </div>
    </>
  );
}
