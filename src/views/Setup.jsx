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
  const ready = a.trim() && b.trim();

  const start = () => {
    if (!ready) return;
    onDone(newState({
      name: name.trim(), aName: a.trim(), bName: b.trim(),
      aIncome: ai, bIncome: bi, aGross: ag, bGross: bg,
    }));
  };

  return (
    <Frame>
      <div className="setup">
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

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
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
