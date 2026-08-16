/* ==================================================================
   setup — the one screen before the ledger opens
   ================================================================== */

import { useState } from "react";
import { num } from "../lib/format.js";
import { newState, demoState } from "../lib/seed.js";

export default function Setup({ onDone, Frame }) {
  const [name, setName] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [ai, setAi] = useState("");
  const [bi, setBi] = useState("");
  const [ag, setAg] = useState("");
  const [bg, setBg] = useState("");
  const [faith, setFaith] = useState(true);
  const [givePct, setGivePct] = useState("");
  const [quartersPaid, setQuartersPaid] = useState(true);
  const ready = a.trim() && b.trim();
  const has1099 = num(ag) > 0 || num(bg) > 0;

  const start = () => {
    if (!ready) return;
    onDone(newState({
      name: name.trim(), aName: a.trim(), bName: b.trim(),
      aIncome: ai, bIncome: bi, aGross: ag, bGross: bg,
      faithOn: faith, givePct: num(givePct), quartersPaid: has1099 ? quartersPaid : false,
    }));
  };

  return (
    <Frame>
      <div className="setup">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: "var(--brand)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18 }}>M</span>
          <span>
            <span style={{ display: "block", fontWeight: 800, fontSize: 15.5, letterSpacing: "-.01em" }}>Marching Forth</span>
            <span style={{ display: "block", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--soft)", fontWeight: 600 }}>Financial Planner</span>
          </span>
        </div>
        <h1>Two people,<br />one month at a time.</h1>
        <p className="sub">
          Tell it who's in the household and what you each bring home. The budget, the bills, the goals, the debt payoff,
          the tax set-aside and the read on how you're doing all build from there.
        </p>
        <div style={{ marginBottom: 13 }}>
          <label className="lbl">Household name (optional)</label>
          <input className="field" placeholder="The Kitchen Table Fund" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="pair">
          <div><label className="lbl">First name</label>
            <input className="field" placeholder="Yvette" value={a} onChange={(e) => setA(e.target.value)} /></div>
          <div><label className="lbl">Monthly take-home</label>
            <input className="field num" inputMode="decimal" placeholder="4,200" value={ai} onChange={(e) => setAi(e.target.value)} /></div>
        </div>
        <div className="pair">
          <div><label className="lbl">Second name</label>
            <input className="field" placeholder="Josh" value={b} onChange={(e) => setB(e.target.value)} /></div>
          <div><label className="lbl">Monthly take-home</label>
            <input className="field num" inputMode="decimal" placeholder="3,800" value={bi} onChange={(e) => setBi(e.target.value)} /></div>
        </div>

        <p className="sub" style={{ margin: "22px 0 12px", fontSize: 14 }}>
          If you're on 1099 income, add what you each expect to bill this year and the app will work out what to hold
          back for taxes. You can leave these blank and fill them in later.
        </p>
        <div className="pair">
          <div><label className="lbl">{a.trim() || "First"}'s 1099 income</label>
            <input className="field num" inputMode="decimal" placeholder="0" value={ag} onChange={(e) => setAg(e.target.value)} /></div>
          <div><label className="lbl">{b.trim() || "Second"}'s 1099 income</label>
            <input className="field num" inputMode="decimal" placeholder="0" value={bg} onChange={(e) => setBg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()} /></div>
        </div>
        {has1099 && (
          <div style={{ marginTop: 12 }}>
            <label className="lbl">Estimated payments due earlier this year — already sent?</label>
            <div className="chips">
              <button className={"chip " + (quartersPaid ? "on" : "")} onClick={() => setQuartersPaid(true)}>Yes, we're current</button>
              <button className={"chip " + (!quartersPaid ? "on" : "")} onClick={() => setQuartersPaid(false)}>No, or not sure</button>
            </div>
            <p className="empty" style={{ fontSize: 12 }}>
              "Yes" marks past quarters handled so the app doesn't open by accusing you of missing the IRS.
              You can correct the record any time on Taxes.
            </p>
          </div>
        )}

        <p className="sub" style={{ margin: "22px 0 12px", fontSize: 14 }}>
          One more thing, and it's yours to decide: this app can hold money as stewardship — giving off the top,
          a weekly meeting that opens with gratitude, patience before big purchases.
        </p>
        <div className="chips">
          <button className={"chip " + (faith ? "on" : "")} onClick={() => setFaith(true)}>Include the stewardship framing</button>
          <button className={"chip " + (!faith ? "on" : "")} onClick={() => setFaith(false)}>Keep it neutral</button>
        </div>
        {faith && (
          <div style={{ marginTop: 10, maxWidth: 300 }}>
            <label className="lbl">Give off the top (% of income, optional)</label>
            <input className="field num" inputMode="decimal" placeholder="0" value={givePct}
              onChange={(e) => setGivePct(e.target.value)} />
            <p className="empty" style={{ fontSize: 12 }}>
              Your number, not a rule — leave it blank to decide later. Nothing is committed until you choose.
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={start} disabled={!ready}>Open the ledger</button>
          <button className="btn ghost" onClick={() => onDone(demoState())}>Click through a sample household</button>
        </div>
        <p className="empty" style={{ marginTop: 14 }}>
          The sample is a two-income 1099 household with six months of history, bills, goals, debt and a half-funded tax
          reserve already in it — every screen is live, and you can wipe it and start clean whenever you want.
        </p>
      </div>
    </Frame>
  );
}
