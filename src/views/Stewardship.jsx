/* ==================================================================
   stewardship — the whole picture, held the way this household holds it

   Three relationships frame the page: money and God, money and the
   marriage, money and the future. Every figure comes off m.stewardship
   and m.enough — deterministic, like everything else. The app never
   speaks for God and never picks for them; it lays the picture out
   and the two of them decide.
   ================================================================== */

import { money, C } from "../lib/format.js";
import { Head, SChip } from "../components.jsx";

const GLYPH = {
  provision: "🌾", needs: "🏠", giving: "💛", obligations: "🧾",
  saving: "🛟", enjoyment: "🍜", future: "🌱",
};

const SURPLUS_ASKS = [
  ["Give", "If we gave part of this month's surplus, what could we give without touching our commitments, and what would it change?"],
  ["Save", "If we saved this month's surplus, where does it do the most good against our goals?"],
  ["Enjoy", "If we spent this month's surplus on something we'd enjoy together, what's a wise amount that doesn't touch our commitments?"],
  ["Invest", "If we invested this month's surplus for the long term, what does that look like over the next twelve months? Keep it general — we know you're not a licensed advisor."],
  ["Help family", "If we used this month's surplus to help family, how much could we offer without weakening our own foundation?"],
];

export default function Stewardship({ ctx }) {
  const { m, state, patch, setView } = ctx;

  const askPlanner = (question) => {
    patch((s) => { s.ui.plannerSeed = question; return s; });
    setView("planner");
  };

  return (
    <>
      <Head title="Stewardship" sub="Money and God · money and your marriage · money and the future. None of it is only math." />

      <div className="grid g3" style={{ marginBottom: 16 }}>
        {m.stewardship.map((b) => (
          <div className="card" key={b.key}>
            <div className="chead">
              <h3><span style={{ marginRight: 7 }}>{GLYPH[b.key]}</span>{b.label}</h3>
              {b.tone === "ok" && <SChip tone="ok">held</SChip>}
              {b.tone === "warn" && <SChip tone="over">needs you</SChip>}
            </div>
            <div className="num" style={{ fontSize: 24, letterSpacing: "-.02em" }}>{money(b.figure)}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2, fontWeight: 500 }}>{b.foot}</div>
            <p className="empty" style={{ marginTop: 8 }}>{b.sentence}</p>
          </div>
        ))}

        <div className="card" style={{ background: "var(--surface2)", boxShadow: "none" }}>
          <div className="chead"><h3>Why it's laid out this way</h3></div>
          <p className="empty">
            Provision first, because everything is received before it's managed. Needs and giving
            before comfort. Obligations honoured on time. Saving as wisdom, not fear — and enjoyment
            on purpose, because none of this is meant to be grim.
          </p>
          <p className="empty">
            The planner can walk through any of it, offering principles where they're relevant.
            It will never tell you what God wants — the two of you decide.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="chead">
          <h3>Enough</h3>
          <span className="meta">wealth past this line is a decision, not a score</span>
        </div>
        {m.enough.note && (
          <p className="empty" style={{ fontStyle: "italic", marginBottom: 10 }}>
            "{m.enough.note}" <button className="btn ghost tiny" style={{ marginLeft: 6 }}
              onClick={() => setView("settings")}>Edit</button>
          </p>
        )}
        {!m.enough.note && (
          <p className="empty" style={{ marginBottom: 10 }}>
            You haven't written what enough looks like for you yet — a sentence in Settings is all it
            takes. Until then, the ladder below stands in.
          </p>
        )}
        <div className="grid g4" style={{ marginBottom: 12 }}>
          {m.enough.thresholds.map((t) => (
            <div className="note" key={t.key} style={{ border: "none", gap: 8, alignItems: "center" }}>
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
      </div>
    </>
  );
}
