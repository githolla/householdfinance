/* ==================================================================
   ask the Planner — tools first, conversation underneath

   Three tools sit above the chat: the affordability check (deterministic
   verdict, Planner adds judgement), "what should we do next?" (renders
   m.nextAction — arithmetic, not vibes), and scenario modelling (the
   Planner reasons from the look-ahead and never touches the plan).

   Rules the code enforces, not just the prompt: household money, never
   one person's spending — and the Planner never speaks for God.
   ================================================================== */

import { useState, useRef, useEffect } from "react";
import { money, monthLabel, num, C } from "../lib/format.js";
import { buildSnapshot, buildSystem, callPlanner } from "../lib/planner.js";
import { PRAYERS, prayersOn } from "../lib/verses.js";
import { Head, Notes, SChip } from "../components.jsx";

const SCENARIOS = [
  ["One income for a season", "What would living on one income for six months look like for us? Which commitments hold, which have to bend?"],
  ["A raise", "If our monthly income rose by $1,000, what would you recommend we change — and what should deliberately stay the same?"],
  ["A bonus lands", "If a $5,000 bonus landed next month, walk us through giving, saving, debt, and enjoying it — using our own goals and rules."],
  ["A newer vehicle", "What does buying a $25,000 vehicle do to our twelve-month picture, at typical loan terms versus paying cash we'd save first?"],
  ["A new baby", "If a baby arrived a year from now, what would you start changing today?"],
  ["Giving more", "What would raising our giving by $200 a month change, and where would it come from?"],
  ["A major repair", "If a $4,000 repair hit next month, how would we absorb it, and what does it push back?"],
];

export default function Planner({ ctx }) {
  const { m, state, patch, plan, month } = ctx;
  const faith = !!(state.faith && state.faith.enabled);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /* A question handed over from another view lands in the box, never
     auto-sent — a person presses Ask. */
  useEffect(() => {
    const seed = state.ui && state.ui.plannerSeed;
    if (seed) {
      setQ(seed);
      patch((s) => { delete s.ui.plannerSeed; return s; });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // can we afford it?
  const [what, setWhat] = useState("");
  const [cost, setCost] = useState("");
  const [verdict, setVerdict] = useState(null);
  const [verdictAi, setVerdictAi] = useState("");
  const [busyAfford, setBusyAfford] = useState(false);

  const logRef = useRef(null);
  const chat = state.chat || [];
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [chat, busy]);

  const snapshot = buildSnapshot({ m, state, plan, month });
  const SYSTEM = buildSystem({ m, state, snapshot });

  const ask = async (text) => {
    const question = (text === undefined ? q : text).trim();
    if (!question || busy) return;
    const next = [...chat, { role: "user", content: question }];
    patch((s) => { s.chat = next; return s; });
    setQ(""); setErr(""); setBusy(true);
    try {
      const reply = await callPlanner(SYSTEM, next.map((x) => ({ role: x.role, content: x.content })));
      patch((s) => { s.chat = [...next, { role: "assistant", content: reply || "No answer came back — try asking again." }]; return s; });
    } catch (e) {
      setErr("Couldn't reach your Planner just now. Try again in a moment.");
    }
    setBusy(false);
  };

  /* ---- can we afford it? ---- */
  const checkAfford = async () => {
    const r = m.afford(num(cost));
    if (!r) return;
    setVerdict({ ...r, what: what.trim() });
    setVerdictAi("");
    setBusyAfford(true);
    try {
      const ai = await callPlanner(SYSTEM, [{
        role: "user",
        content:
          `We're deciding whether to spend ${money(r.cost)}${what.trim() ? ` on ${what.trim()}` : ""} this month. ` +
          `The deterministic verdict is "${r.label}" for these reasons: ${r.reasons.join(" ")} ` +
          `In 60 words or less: confirm or soften that verdict in your own voice and check it against the house rules by name if any apply. ` +
          `If the answer is yes, state it plainly and stop — no cheering the purchase, no guilt. No headings.`,
      }], 3000);
      setVerdictAi(ai);
    } catch (e) { /* deterministic verdict already on screen */ }
    setBusyAfford(false);
  };

  const setAside = () => {
    if (!verdict) return;
    const until = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    patch((s) => {
      s.decisions.push({
        id: Math.random().toString(36).slice(2, 9),
        what: verdict.what || "a purchase", cost: verdict.cost, until,
        created: new Date().toISOString().slice(0, 10),
      });
      return s;
    });
    setVerdict(null); setVerdictAi(""); setWhat(""); setCost("");
  };

  const talkItThrough = () => {
    if (!verdict) return;
    ask(
      `We're deciding together about spending ${money(verdict.cost)}${verdict.what ? ` on ${verdict.what}` : ""}. ` +
      `Help us talk it through — whether we can afford it, whether any debt or tradeoff is wise, why we want it, ` +
      `and whether it crowds out anything we've committed to. Stay neutral between us and end with the reminder that the decision is ours.`
    );
  };

  const dropDecision = (id) => patch((s) => {
    s.decisions = s.decisions.filter((d) => d.id !== id);
    return s;
  });

  const chips = [
    "Why are we spending so much this month?",
    "Where should the extra go this month?",
    "Are we holding back enough for taxes?",
    "Pay down the credit card or build the emergency fund?",
    ...(faith ? ["Can we give $500 to someone who needs help right now?",
      "We're feeling anxious about money — where do we actually stand?"] : []),
  ];

  const toneFor = (v) => (v === "yes" ? "ok" : v === "no" ? "over" : "warn");

  /* Deterministic impact rows under the verdict — what the purchase
     touches, before the Planner says a word. */
  const impactRows = (r) => [
    ["Cash on hand today", money(r.cash)],
    ["After bills still due and this purchase", money(r.afterCash)],
    ["Expected left this month, after it", money(Math.max(0, r.available - r.cost))],
    ...(r.efDelayWeeks ? [["Emergency fund pushed back", `about ${r.efDelayWeeks} weeks`]] : []),
  ];

  return (
    <>
      <Head title="Ask the Planner"
        sub="It sees your income, envelopes, bills, goals, debt payoff, tax reserve, house rules, and the next twelve months. It recommends; you two decide." />

      <div className="grid g2" style={{ marginBottom: 16, alignItems: "start" }}>
        <div className="card">
          <div className="chead"><h3>Can we afford it?</h3><span className="meta">the verdict is arithmetic — the Planner adds judgement</span></div>
          <div className="pair" style={{ marginBottom: 10 }}>
            <div>
              <label className="lbl">What is it</label>
              <input className="field" placeholder="New couch" value={what}
                onChange={(e) => setWhat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkAfford()} />
            </div>
            <div>
              <label className="lbl">Cost</label>
              <input className="field num" inputMode="decimal" placeholder="$2,400" value={cost}
                onChange={(e) => setCost(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkAfford()} />
            </div>
          </div>
          <button className="btn" onClick={checkAfford} disabled={num(cost) <= 0 || busyAfford}>
            {busyAfford ? "Checking…" : "Check it"}
          </button>
          {verdict && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <SChip tone={toneFor(verdict.verdict)}>{verdict.label}</SChip>
                {verdict.what && <span className="muted" style={{ fontSize: 12.5 }}>{verdict.what} · {money(verdict.cost)}</span>}
              </div>
              {impactRows(verdict).map(([k, v]) => (
                <div className="note" key={k} style={{ justifyContent: "space-between", padding: "6px 0" }}>
                  <span className="muted">{k}</span><span className="num">{v}</span>
                </div>
              ))}
              {verdict.reasons.map((r, i) => (
                <p className="empty" key={i} style={{ padding: "3px 0" }}>{r}</p>
              ))}
              {verdictAi && <div className="msg them" style={{ marginTop: 8 }}>{verdictAi}</div>}
              <div className="chips" style={{ marginTop: 10 }}>
                <button className="chip" onClick={() => { setVerdict(null); setVerdictAi(""); setWhat(""); setCost(""); }}>
                  We agree
                </button>
                <button className="chip" onClick={talkItThrough} disabled={busy}>Talk about it</button>
                <button className="chip" onClick={setAside}>{faith ? "Pray on it" : "Sleep on it"}</button>
              </div>
              {prayersOn(state) && (
                <p className="prayer"><span className="plead">If it's your practice, before you decide</span>
                  <span className="ptext">"{PRAYERS.decision}"</span></p>
              )}
              <p className="empty" style={{ marginTop: 6, fontSize: 12 }}>
                {faith
                  ? "Pray on it sets this aside for a week. It won't come up again until then — patience is part of the plan."
                  : "Sleep on it sets this aside for a week before it comes back up."}
              </p>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="chead"><h3>What should we do next?</h3><span className="meta">{m.nextAction.step}</span></div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-.01em" }}>{m.nextAction.title}</div>
            <p className="empty" style={{ margin: "6px 0 10px" }}>{m.nextAction.why}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn tiny" onClick={() => ctx.setView(m.nextAction.view)}>{m.nextAction.cta}</button>
              <button className="btn ghost tiny" disabled={busy}
                onClick={() => ask(`The app says our next best move is "${m.nextAction.title}" — ${m.nextAction.why} Walk us through why this comes before everything else, and what doing it actually looks like this week.`)}>
                Why this first?
              </button>
            </div>
          </div>

          <div className="card">
            <div className="chead"><h3>Run a scenario</h3><span className="meta">modelled from your look-ahead — nothing changes unless you change it</span></div>
            <div className="chips">
              {SCENARIOS.map(([label, question]) => (
                <button key={label} className="chip" disabled={busy} onClick={() => ask(question)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid g23">
        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 470 }}>
          <div className="chatlog" ref={logRef} style={{ flex: 1, maxHeight: 460 }}>
            {chat.length === 0 && <p className="empty">Ask anything about your money. The Planner answers with your numbers, not general advice.</p>}
            {chat.map((x, i) => <div key={i} className={"msg " + (x.role === "user" ? "me" : "them")}>{x.content}</div>)}
            {busy && <div className="msg them muted">Reading your numbers…</div>}
          </div>
          {err && <p className="empty" style={{ color: C.warn }}>{err}</p>}
          <div className="chips">{chips.map((c) => <button key={c} className="chip" onClick={() => ask(c)} disabled={busy}>{c}</button>)}</div>
          <div className="askrow">
            <input className="field" placeholder="Ask a question" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()} aria-label="Ask your Planner" />
            <button className="btn" onClick={() => ask()} disabled={busy || !q.trim()}>Ask</button>
          </div>
          {chat.length > 0 && (
            <button className="btn ghost tiny" style={{ marginTop: 10, alignSelf: "flex-start" }}
              onClick={() => patch((s) => { s.chat = []; return s; })}>Clear conversation</button>
          )}
        </div>
        <div>
          {m.decisions.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="chead"><h3>{faith ? "Set aside to pray on" : "Set aside for now"}</h3></div>
              {m.decisions.map((d) => (
                <div className="note" key={d.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontWeight: 600 }}>{d.what}</span>
                    <span className="num">{money(d.cost)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {d.due ? "the agreed time has come" : `quiet for ${d.daysLeft} more ${d.daysLeft === 1 ? "day" : "days"}`}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button className="btn ghost tiny" disabled={busy}
                        onClick={() => { dropDecision(d.id); ask(`We set aside a decision about spending ${money(d.cost)} on ${d.what}, and we're ready to talk about it now. Walk us through it fresh — afford, wisdom, why we want it — and leave the decision with us.`); }}>
                        Revisit
                      </button>
                      <button className="btn ghost tiny" onClick={() => dropDecision(d.id)}>Let it go</button>
                    </span>
                  </div>
                </div>
              ))}
              <p className="empty" style={{ fontSize: 12 }}>The Planner won't bring these up on its own until the day comes.</p>
            </div>
          )}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="chead"><h3>House rules it holds you to</h3></div>
            {(state.rules || []).length === 0
              ? <p className="empty">No rules yet — set them in Settings. Things like "keep checking above $2,000" or "purchases over $500 get discussed together."</p>
              : (state.rules || []).map((r) => (
                <div className="note" key={r.id}><span className="tick" style={{ background: C.a }} /><span>{r.text}</span></div>
              ))}
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="chead"><h3>What it's looking at</h3></div>
            {[
              ["Income", m.income],
              ["Spent so far", m.spent],
              ["Bills still due", m.billsLeft],
              ["Expected left over", m.monthOutlook.available],
              ["Tax reserve", m.tax.incomplete ? 0 : m.tax.monthlyReserve],
              ["Net worth", m.netWorth],
            ].map(([k, v]) => (
              <div className="note" key={k} style={{ justifyContent: "space-between" }}>
                <span className="muted">{k}</span><span className="num">{money(v)}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="chead"><h3>Planner notes</h3></div>
            <Notes notes={m.notes} />
          </div>
        </div>
      </div>
    </>
  );
}
