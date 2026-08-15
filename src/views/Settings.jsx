/* ==================================================================
   settings — who's in the household, what comes in, how you split it
   ================================================================== */

import { useState } from "react";
import { money, num } from "../lib/format.js";
import { Head } from "../components.jsx";

const KEY = "twocolumn:v2";

export default function Settings({ ctx, setState }) {
  const { state, patch, m } = ctx;
  const [wipe, setWipe] = useState(false);
  const [forget, setForget] = useState(false);
  const [copied, setCopied] = useState(false);

  const exportJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      setCopied(true); setTimeout(() => setCopied(false), 2200);
    } catch (e) { setCopied(false); }
  };

  return (
    <>
      <Head title="Settings" sub="Who's in the household, what comes in, and how you split it." />
      <div className="grid g2">
        <div className="card">
          <div className="chead"><h3>Household</h3></div>
          <label className="lbl">Name</label>
          <input className="field" style={{ marginBottom: 14 }} value={state.household.name}
            onChange={(e) => patch((s) => { s.household.name = e.target.value; return s; })} />
          {[0, 1].map((i) => (
            <div className="pair" key={i}>
              <div>
                <label className="lbl">{i === 0 ? "First name" : "Second name"}</label>
                <input className="field" value={state.household.partners[i].name}
                  onChange={(e) => patch((s) => { s.household.partners[i].name = e.target.value; return s; })} />
              </div>
              <div>
                <label className="lbl">Monthly take-home</label>
                <input className="field num" inputMode="decimal" value={state.household.partners[i].income || ""} placeholder="0"
                  onChange={(e) => patch((s) => { s.household.partners[i].income = num(e.target.value); return s; })} />
              </div>
            </div>
          ))}
          <label className="lbl" style={{ marginTop: 8 }}>How you split shared costs</label>
          <div className="chips">
            <button className={"chip " + (state.household.splitRule === "proportional" ? "on" : "")}
              onClick={() => patch((s) => { s.household.splitRule = "proportional"; return s; })}>By income</button>
            <button className={"chip " + (state.household.splitRule === "even" ? "on" : "")}
              onClick={() => patch((s) => { s.household.splitRule = "even"; return s; })}>Down the middle</button>
          </div>
          <p className="empty">
            {state.household.splitRule === "even"
              ? `Shared costs split evenly: ${money(m.jointCost / 2)} each.`
              : `${m.pA.name} covers ${Math.round(m.shareA * 100)}% of shared costs — ${money(m.jointCost * m.shareA)} — matching their share of what comes in.`}
          </p>
        </div>

        <div className="card">
          <div className="chead"><h3>This phone</h3></div>
          <label className="lbl">Spending logged here is usually</label>
          <div className="chips">
            {["joint", "a", "b"].map((o) => (
              <button key={o} className={"chip " + (state.ui.defaultWho === o ? "on" : "")}
                onClick={() => patch((s) => { s.ui.defaultWho = o; return s; })}>
                {o === "joint" ? "Both of us" : m.ownerName(o)}
              </button>
            ))}
          </div>
          <p className="empty">
            Sets who a new entry is filed under before you touch anything. Each of you can set this differently on your
            own phone — it isn't shared.
          </p>

          <div className="chead" style={{ marginTop: 24 }}><h3>What it's learned</h3></div>
          <p className="empty">
            {m.merchantCount === 0
              ? "Nothing yet. Snap a receipt, correct the envelope if it guessed wrong, and it remembers that shop next time."
              : `${m.merchantCount} ${m.merchantCount === 1 ? "place" : "places"} remembered — where each one gets filed and who usually pays.`}
          </p>
          {m.merchantCount > 0 && (
            <button className="btn ghost tiny" onClick={() => {
              if (!forget) { setForget(true); return; }
              patch((s) => { s.merchantMap = {}; return s; });
              setForget(false);
            }}>{forget ? "Tap again to forget all of it" : "Forget what it's learned"}</button>
          )}
        </div>

        <div className="card">
          <div className="chead"><h3>Your data</h3></div>
          <p className="empty">
            Everything lives in this browser profile, not on a server. One of you holds the master copy — copy it out
            when you want a backup, or to hand it over.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button className="btn ghost tiny" onClick={exportJson}>{copied ? "Copied to clipboard" : "Copy all data"}</button>
            <button className="btn ghost tiny" onClick={async () => {
              if (!wipe) { setWipe(true); return; }
              try { await window.storage.delete(KEY); } catch (e) { /* already gone */ }
              setWipe(false); setState(null);
            }}>{wipe ? "Tap again to erase everything" : "Start over"}</button>
          </div>
          <div className="chead" style={{ marginTop: 24 }}><h3>What's stored</h3></div>
          {[
            ["Months planned", Object.keys(state.months).length],
            ["Transactions", Object.values(state.months).reduce((n, x) => n + x.entries.length, 0)],
            ["Goals", state.goals.length],
            ["Accounts", state.accounts.length],
            ["Bills", state.bills.length],
            ["Places remembered", m.merchantCount],
          ].map(([k, v]) => (
            <div className="note" key={k} style={{ justifyContent: "space-between" }}>
              <span className="muted">{k}</span><span className="num">{v}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="chead"><h3>Taxes and the plan</h3></div>
          <p className="empty">
            The tax figures throughout the app are an estimate for setting money aside — not tax advice, and not a
            filing. They use the published {state.tax.year} rates, which change every January. Check them then, and take
            anything unusual to someone licensed.
          </p>
          <p className="empty">
            Receipt reading and the planner both send data to Anthropic's API through the dev proxy. Photos are shrunk in
            the browser, sent once, and never saved — but the key is only safe in local development. This needs a real
            backend route before it goes anywhere public.
          </p>
        </div>
      </div>
    </>
  );
}
