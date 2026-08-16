/* ==================================================================
   stewardship — one story, top to bottom

   What came into our hands → how we're stewarding it → what remains.
   Three relationships frame the page: money and God, money and the
   marriage, money and the future. Every figure comes off m.stewardship
   and m.enough — deterministic, like everything else. The app never
   speaks for God and never picks for them.
   ================================================================== */

import { useState } from "react";
import { money, C } from "../lib/format.js";
import { buildSnapshot, buildSystem, callPlanner } from "../lib/planner.js";
import { Head, SChip } from "../components.jsx";

const GLYPH = {
  needs: "🏠", giving: "💛", obligations: "🧾",
  saving: "🛟", enjoyment: "🍜", future: "🌱",
};
const FLOW_LABEL = {
  giving: "Giving", needs: "Care for our household", obligations: "Obligations",
  saving: "Preparing", enjoyment: "Enjoyment", future: "The long run",
};

const ENOUGH_QS = [
  ["lifestyle", "What kind of life are we actually trying to maintain?"],
  ["experiences", "What experiences matter enough to spend generously on?"],
  ["margin", "How much margin makes us feel prepared instead of anxious?"],
  ["generosity", "What does generosity look like in our household?"],
];

const SURPLUS_ASKS = [
  ["Give", "If we gave part of this month's surplus, what could we give without touching our commitments, and what would it change?"],
  ["Save", "If we saved this month's surplus, where does it do the most good against our goals?"],
  ["Enjoy", "If we spent this month's surplus on something we'd enjoy together, what's a wise amount that doesn't touch our commitments?"],
  ["Invest", "If we invested this month's surplus for the long term, what does that look like over the next twelve months? Keep it general — we know you're not a licensed advisor."],
  ["Help family", "If we used this month's surplus to help family, how much could we offer without weakening our own foundation?"],
];

export default function Stewardship({ ctx }) {
  const { m, state, patch, plan, month, setView } = ctx;
  const provision = m.stewardship.find((b) => b.key === "provision");
  const buckets = m.stewardship.filter((b) => b.key !== "provision");
  const [building, setBuilding] = useState(false);
  const [answers, setAnswers] = useState((state.enough && state.enough.answers) || {});
  const [draft, setDraft] = useState(m.enough.note);
  const [busyDraft, setBusyDraft] = useState(false);
  const [draftErr, setDraftErr] = useState("");

  const askPlanner = (question) => {
    patch((s) => { s.ui.plannerSeed = question; return s; });
    setView("planner");
  };

  const draftStatement = async () => {
    setBusyDraft(true); setDraftErr("");
    const answered = ENOUGH_QS.filter(([k]) => (answers[k] || "").trim());
    try {
      const snapshot = buildSnapshot({ m, state, plan, month });
      const text = await callPlanner(buildSystem({ m, state, snapshot }), [{
        role: "user",
        content:
          `Help us write our "enough" statement — two to four plain sentences in our own voice, first person plural, no preaching, no exclamation marks. ` +
          `It should say what we're keeping, what we're protecting, and what money past that line is for. ` +
          (answered.length
            ? `Here's what we told you: ` + answered.map(([k, q]) => `${q} — "${answers[k].trim()}"`).join(" ")
            : `We haven't answered the prompts — draft something from our goals, rules, and giving in the snapshot, and we'll edit it.`) +
          ` Return only the statement itself.`,
      }], 2500);
      setDraft(text);
    } catch (e) {
      setDraftErr("Couldn't reach the Planner — write it in your own words below, that works just as well.");
    }
    setBusyDraft(false);
  };

  const saveStatement = () => {
    patch((s) => {
      s.enough.note = draft.trim();
      s.enough.answers = answers;
      s.enough.approved = true;
      return s;
    });
    setBuilding(false);
  };

  return (
    <>
      <Head title="Stewardship" sub="Money and God · money and your marriage · money and the future. None of it is only math." />

      <div className="flowspine" style={{ alignItems: "stretch", maxWidth: 900, margin: "0 auto" }}>
        <div className="flowlabel">What came into our hands</div>
        <div className="card" style={{ textAlign: "center", padding: "24px 20px" }}>
          <div className="num" style={{ fontSize: 34, letterSpacing: "-.02em" }}>{money(provision.figure)}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4, fontWeight: 500 }}>{provision.foot}</div>
          <p className="empty" style={{ maxWidth: 520, margin: "8px auto 0" }}>{provision.sentence}</p>
        </div>

        <div className="flowarrow" style={{ textAlign: "center" }}>↓</div>
        <div className="flowlabel">How we're stewarding it</div>
        <div className="grid g3">
          {buckets.map((b) => (
            <div className="card" key={b.key}>
              <div className="chead" style={{ marginBottom: 8 }}>
                <h3 style={{ fontSize: 13.5 }}><span style={{ marginRight: 6 }}>{GLYPH[b.key]}</span>{FLOW_LABEL[b.key] || b.label}</h3>
                {b.tone === "ok" && <SChip tone="ok">held</SChip>}
                {b.tone === "warn" && <SChip tone="over">needs you</SChip>}
              </div>
              <div className="num" style={{ fontSize: 21, letterSpacing: "-.02em" }}>{money(b.figure)}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2, fontWeight: 500 }}>{b.foot}</div>
              <p className="empty" style={{ marginTop: 7, fontSize: 12.5 }}>{b.sentence}</p>
            </div>
          ))}
        </div>

        <div className="flowarrow" style={{ textAlign: "center" }}>↓</div>
        <div className="flowlabel">What remains</div>
        <div className="card" style={{ textAlign: "center", padding: "22px 20px" }}>
          <div className="num" style={{ fontSize: 28, letterSpacing: "-.02em" }}>
            {money(Math.max(0, m.monthOutlook.available))}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4, fontWeight: 500 }}>
            expected to remain this month, after bills still due and normal spending
          </div>
          <p className="empty" style={{ maxWidth: 560, margin: "8px auto 0" }}>
            Not a scoreboard — a decision the two of you get to make on purpose.
          </p>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 18, alignItems: "start" }}>
        <div className="card" style={{ background: "var(--surface2)", boxShadow: "none", border: "none" }}>
          <div className="chead"><h3>Why it's laid out this way</h3></div>
          <p className="empty">
            Provision first, because everything is received before it's managed. Needs and giving
            before comfort. Obligations honoured on time. Saving as wisdom, not fear — and enjoyment
            on purpose, because none of this is meant to be grim.
          </p>
          <p className="empty">
            The Planner can walk through any of it, offering principles where they're relevant.
            It will never tell you what God wants — the two of you decide.
          </p>
        </div>

        <div className="card">
          <div className="chead">
            <h3>Enough</h3>
            <span className="meta">wealth past this line is a decision, not a score</span>
          </div>
          {!building && m.enough.note && (
            <p className="empty" style={{ fontStyle: "italic", marginBottom: 10 }}>
              "{m.enough.note}" <button className="btn ghost tiny" style={{ marginLeft: 6 }}
                onClick={() => { setDraft(m.enough.note); setBuilding(true); }}>Revisit</button>
            </p>
          )}
          {!building && !m.enough.note && (
            <>
              <p className="empty" style={{ marginBottom: 10 }}>
                You haven't written what enough looks like for you yet. A few honest sentences change
                how every raise, bonus, and big purchase gets weighed.
              </p>
              <button className="btn tiny" onClick={() => setBuilding(true)}>Write it together</button>
            </>
          )}
          {building && (
            <>
              <p className="empty">Talk these over first — answer in a few words, or skip any of them.</p>
              {ENOUGH_QS.map(([k, q]) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <label className="lbl" style={{ textTransform: "none", letterSpacing: 0, fontSize: 12 }}>{q}</label>
                  <input className="field" value={answers[k] || ""}
                    onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
                <button className="btn ghost tiny" onClick={draftStatement} disabled={busyDraft}>
                  {busyDraft ? "Drafting…" : "Ask the Planner to draft it"}
                </button>
              </div>
              {draftErr && <p className="empty" style={{ color: C.warn }}>{draftErr}</p>}
              <label className="lbl">Our enough statement</label>
              <textarea className="field" rows={4} value={draft}
                placeholder="We want a comfortable home, strong reserves, and the freedom to help the people around us…"
                onChange={(e) => setDraft(e.target.value)} />
              <p className="empty" style={{ fontSize: 12 }}>
                Edit until it sounds like the two of you. Once you approve it, the Planner holds
                raises, bonuses, and big purchases against it — never to shame, only to remember.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn tiny" onClick={saveStatement} disabled={!draft.trim()}>This is us — save it</button>
                <button className="btn ghost tiny" onClick={() => setBuilding(false)}>Not now</button>
              </div>
            </>
          )}

          {!building && (
            <>
              <div className="grid g2" style={{ margin: "12px 0", gap: 8 }}>
                {m.enough.thresholds.map((t) => (
                  <div className="note" key={t.key} style={{ border: "none", gap: 8, alignItems: "center", padding: "5px 0" }}>
                    <span className="tick" style={{ background: t.done ? C.ok : "var(--line)", minHeight: 15 }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{t.label}</span>
                  </div>
                ))}
              </div>
              <p className="empty" style={{ fontWeight: 600, color: "var(--ink)" }}>{m.enough.sentence}</p>
              {m.enough.met && m.enough.surplus >= 50 && (
                <div className="chips" style={{ marginTop: 10 }}>
                  {SURPLUS_ASKS.map(([label, q]) => (
                    <button key={label} className="chip"
                      onClick={() => askPlanner(`${q} We have about ${money(m.enough.surplus)} this month beyond the thresholds we set.`)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
