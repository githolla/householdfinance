/* ==================================================================
   the shell — persistence, navigation, and the quick-add flow

   Desktop keeps the sidebar it always had. The phone gets a bottom tab
   bar with the four things people open daily, everything else behind
   More, and a quick-add button that is the only write path.

   Both nav layouts are emitted from one NAV array and toggled with CSS,
   so display:none takes the hidden one out of the accessibility tree too
   and there are never two sets of buttons exposed at once.
   ================================================================== */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { CSS } from "./css.js";
import { monthKey, shiftMonth, money, C } from "./lib/format.js";
import { blankMonth, withDefaults, upgradeV1 } from "./lib/seed.js";
import { model } from "./lib/model.js";
import { useReceipt } from "./lib/useReceipt.js";
import { blankDraft } from "./lib/draft.js";
import { Sheet } from "./components.jsx";

import Dashboard from "./views/Dashboard.jsx";
import Plan from "./views/Plan.jsx";
import Budget from "./views/Budget.jsx";
import Spending from "./views/Spending.jsx";
import Bills from "./views/Bills.jsx";
import Calendar from "./views/Calendar.jsx";
import MoneyMeeting from "./views/MoneyMeeting.jsx";
import Goals from "./views/Goals.jsx";
import NetWorth from "./views/NetWorth.jsx";
import Taxes from "./views/Taxes.jsx";
import Reports from "./views/Reports.jsx";
import Stewardship from "./views/Stewardship.jsx";
import Planner from "./views/Planner.jsx";
import Settings from "./views/Settings.jsx";
import Setup from "./views/Setup.jsx";
import EntrySheet from "./views/EntrySheet.jsx";

const KEY = "twocolumn:v2";
const KEY_V1 = "twocolumn:v1";

const NAV = [
  ["dash", "Home", "Home"],
  ["txn", "Transactions", "Activity"],
  ["bills", "Bills", "Bills"],
  ["plan", "Our Plan"],
  ["budget", "Envelopes"],
  ["goals", "Goals"],
  ["worth", "Net worth"],
  ["stew", "Stewardship"],
  ["meeting", "Money Meeting"],
  ["planner", "Ask the Planner", "Planner"],
  ["cal", "Calendar"],
  ["taxes", "Taxes"],
  ["reports", "Insights"],
  ["settings", "Settings"],
];
const PRIMARY = ["dash", "txn", "bills", "planner"];
/* Grouped around the couple's mental model: today's loop, the money
   itself, the things they do together, and everything else. Envelopes
   stays routed (Plan links to it) but out of the sidebar — Plan is the
   user-facing way in. */
const SECTIONS = [
  ["Today", ["dash", "txn", "bills"]],
  ["Our money", ["plan", "goals", "worth"]],
  ["Together", ["stew", "meeting", "planner"]],
  ["More", ["cal", "taxes", "reports", "settings"]],
];

const ICON = {
  dash: <svg viewBox="0 0 24 24"><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /></svg>,
  txn: <svg viewBox="0 0 24 24"><path d="M6 3v18l2-1.5L10 21l2-1.5L14 21l2-1.5L18 21V3z" /><path d="M9 8h6M9 12h6" /></svg>,
  budget: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 8l9 5 9-5" /></svg>,
  bills: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  cal: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M7.5 14h3M13.5 14h3M7.5 17.5h3" /></svg>,
  plan: <svg viewBox="0 0 24 24"><path d="M4 5h16M7 12h10M10 19h4" /></svg>,
  goals: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></svg>,
  worth: <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12h5M7 6V4.5A1.5 1.5 0 0 1 8.5 3H17" /></svg>,
  taxes: <svg viewBox="0 0 24 24"><path d="M5 19L19 5" /><circle cx="7.5" cy="7.5" r="2.4" /><circle cx="16.5" cy="16.5" r="2.4" /></svg>,
  reports: <svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-6" /></svg>,
  stew: <svg viewBox="0 0 24 24"><path d="M12 21V11" /><path d="M12 11C12 6.5 9 4 4.5 4c0 4.5 3 7 7.5 7z" /><path d="M12 14c0-3.5 2.5-5.5 6.5-5.5 0 3.5-2.5 5.5-6.5 5.5z" /></svg>,
  meeting: <svg viewBox="0 0 24 24"><path d="M3 11a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5h-3l-4 3v-3H8a5 5 0 0 1-5-5z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></svg>,
  planner: <svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" /></svg>,
  settings: <svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2.2" /><circle cx="7" cy="17" r="2.2" /></svg>,
  more: <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>,
};

const Frame = ({ children }) => (
  <div className="tc"><style>{CSS}</style>{children}</div>
);

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dash");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [more, setMore] = useState(false);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    (async () => {
      let loaded = null;
      try {
        const r = await window.storage.get(KEY);
        if (r && r.value) loaded = withDefaults(JSON.parse(r.value));
      } catch (e) { /* nothing saved yet */ }
      if (!loaded) {
        try {
          const r1 = await window.storage.get(KEY_V1);
          if (r1 && r1.value) loaded = upgradeV1(JSON.parse(r1.value));
        } catch (e) { /* no earlier version */ }
      }
      if (loaded) setState(loaded);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!state) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      window.storage.set(KEY, JSON.stringify(state), false).catch(() => {});
    }, 450);
  }, [state]);

  const patch = useCallback((fn) => setState((s) => fn(structuredClone(s))), []);

  const plan = useMemo(() => {
    if (!state) return null;
    const [pa, pb] = state.household.partners;
    return state.months[month] || blankMonth(state.months[shiftMonth(month, -1)], pa.name, pb.name);
  }, [state, month]);

  /* The first write into a lazy month must materialise EXACTLY the month
     the UI has been rendering — same envelope ids, no cloned entries.
     Cloning last month here instead (the old bug) duplicated its entries
     and filed the new one against envelope ids that didn't exist. */
  const writeMonth = useCallback((fn) =>
    patch((s) => {
      const base = s.months[month] || structuredClone(plan);
      if (!base.paid) base.paid = [];
      base.entries = base.entries || [];
      s.months[month] = fn(base);
      return s;
    }), [patch, month, plan]);

  const m = state && plan ? model(state, plan, month) : null;
  const envelopeNames = useMemo(() => (plan ? plan.envelopes.map((e) => e.name) : []), [plan]);
  const receipt = useReceipt(m, envelopeNames);

  /* Any sheet open locks the page behind it — otherwise the body scrolls
     under the sheet on iOS and rubber-bands the background into view. */
  const sheetOpen = more || receipt.open;
  useEffect(() => {
    document.body.classList.toggle("lockscroll", sheetOpen);
    return () => document.body.classList.remove("lockscroll");
  }, [sheetOpen]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* Turning the faith layer off while parked on its view would leave a
     blank page — fall back home. */
  useEffect(() => {
    if (view === "stew" && state && !(state.faith && state.faith.enabled)) setView("dash");
  }, [view, state]);

  /* Every navigation starts at the top of the new view — otherwise a
     scrolled phone lands mid-page and the first-glance read is lost. */
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  const onLogged = useCallback(({ id, amount, envName }) => {
    clearTimeout(toastTimer.current);
    setToast({ id, amount, envName, month });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, [month]);

  const undo = () => {
    if (!toast) return;
    patch((s) => {
      const mm = s.months[toast.month];
      if (mm) mm.entries = mm.entries.filter((t) => t.id !== toast.id);
      return s;
    });
    setToast(null);
  };

  if (loading)
    return <Frame><div className="empty" style={{ padding: 30 }}>Opening your ledger…</div></Frame>;
  if (!state) return <Setup onDone={(s) => { setState(withDefaults(s)); window.scrollTo(0, 0); }} Frame={Frame} />;

  const ctx = { state, patch, plan, writeMonth, month, setMonth, m, setView };
  /* The stewardship view only exists for households that keep the faith
     layer on — the toggle lives in Settings. */
  const navVisible = (k) => k !== "stew" || (state.faith && state.faith.enabled);
  const quickAdd = (envId, dateISO) =>
    receipt.openBlank({ ...blankDraft(m, envId, state.ui.defaultWho), ...(dateISO ? { dateISO } : {}) });
  const go = (k) => { setView(k); setMore(false); };

  const collapsed = !!state.ui.sideCollapsed;
  const toggleSide = () => patch((s) => { s.ui.sideCollapsed = !s.ui.sideCollapsed; return s; });

  return (
    <Frame>
      <div className={"shell" + (collapsed ? " collapsed" : "")}>
        <aside className="side">
          <div className="sidetop">
            <div className="mark">
              <span className="logo">{(state.household.name || "H").trim().charAt(0).toUpperCase()}</span>
              <span className="markname">
                <span className="nm">{state.household.name}</span>
                <span className="who">{m.pA.name} &amp; {m.pB.name}</span>
              </span>
            </div>
            <button className="hamb" onClick={toggleSide} aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"} title={collapsed ? "Expand menu" : "Collapse menu"}>
              <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
          <nav>
            {SECTIONS.map(([sec, keys]) => (
              <div key={sec || "misc"} style={{ display: "contents" }}>
                {sec && <div className="navsec">{sec}</div>}
                {keys.filter(navVisible).map((k) => {
                  const item = NAV.find((n) => n[0] === k);
                  return (
                    <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}
                      title={collapsed ? item[1] : undefined} aria-label={item[1]}>
                      {ICON[k]}<span>{item[1]}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidefoot">
            {state.demo && (
              <div style={{ marginBottom: 12 }}>
                <span className="tag" style={{ borderColor: C.joint, color: C.joint }}>Sample data</span>
                <button className="btn ghost tiny" style={{ marginTop: 8, display: "block" }}
                  onClick={async () => {
                    try { await window.storage.delete(KEY); } catch (e) { /* nothing stored */ }
                    setState(null);
                  }}>Start clean</button>
              </div>
            )}
            <div className="num" style={{ fontSize: 15, color: C.ink }}>{money(m.netWorth)}</div>
            net worth today
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--surface2)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>
              Marching Forth <span style={{ fontWeight: 500 }}>Financial Planner</span>
            </div>
          </div>
        </aside>

        <main className="main">
          {view === "dash" && <Dashboard ctx={ctx} onQuickAdd={quickAdd} receipt={receipt} />}
          {view === "plan" && <Plan ctx={ctx} />}
          {view === "budget" && <Budget ctx={ctx} />}
          {view === "txn" && <Spending ctx={ctx} receipt={receipt} />}
          {view === "bills" && <Bills ctx={ctx} />}
          {view === "cal" && <Calendar ctx={ctx} onQuickAdd={quickAdd} />}
          {view === "goals" && <Goals ctx={ctx} />}
          {view === "worth" && <NetWorth ctx={ctx} />}
          {view === "taxes" && <Taxes ctx={ctx} />}
          {view === "reports" && <Reports ctx={ctx} />}
          {view === "stew" && navVisible("stew") && <Stewardship ctx={ctx} />}
          {view === "meeting" && <MoneyMeeting ctx={ctx} />}
          {view === "planner" && <Planner ctx={ctx} />}
          {view === "settings" && <Settings ctx={ctx} setState={setState} />}
        </main>
      </div>

      <nav className="tabbar">
        {PRIMARY.map((k) => {
          const item = NAV.find((n) => n[0] === k);
          return (
            <button key={k} className={"tab" + (view === k ? " on" : "")} onClick={() => setView(k)}
              aria-current={view === k ? "page" : undefined}>
              {ICON[k]}<span>{item[2]}</span>
            </button>
          );
        })}
        <button className={"tab" + (more ? " on" : "")} onClick={() => setMore(true)} aria-label="More">
          {ICON.more}<span>More</span>
        </button>
      </nav>

      <button className="fab" onClick={() => quickAdd()} aria-label="Log spending">
        <span className="fabplus">+</span><span className="fablabel">Add expense</span>
      </button>

      <Sheet open={more} onClose={() => setMore(false)} title={state.household.name}>
        <div style={{ marginBottom: 14 }}>
          <div className="lbl">Net worth today</div>
          <div className="num" style={{ fontSize: 26, letterSpacing: "-.02em" }}>{money(m.netWorth)}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{m.pA.name} &amp; {m.pB.name}</div>
        </div>
        {state.demo && (
          <div style={{ marginBottom: 14 }}>
            <span className="tag" style={{ borderColor: C.joint, color: C.joint }}>Sample data</span>
            <button className="btn ghost tiny" style={{ marginTop: 8, display: "block" }}
              onClick={async () => {
                try { await window.storage.delete(KEY); } catch (e) { /* nothing stored */ }
                setMore(false);
                setState(null);
              }}>Start clean</button>
          </div>
        )}
        <div className="morelist">
          {SECTIONS.map(([sec, keys]) => {
            const items = keys.filter((k) => !PRIMARY.includes(k) && navVisible(k));
            if (!items.length) return null;
            return (
              <div key={sec || "misc"}>
                {sec && <div className="lbl" style={{ marginTop: 12 }}>{sec}</div>}
                {items.map((k) => {
                  const item = NAV.find((n) => n[0] === k);
                  return (
                    <button key={k} onClick={() => go(k)}>
                      <span>{item[1]}</span>
                      <span className="muted">›</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Sheet>

      <EntrySheet
        ctx={ctx}
        open={receipt.open}
        seed={receipt.seed}
        busy={receipt.busy}
        error={receipt.error}
        onClose={receipt.close}
        onLogged={onLogged}
      />

      {toast && !sheetOpen && (
        <div className="toast" role="status">
          <span>{money(toast.amount, true)}{toast.envName ? ` in ${toast.envName}` : ""}.</span>
          <button onClick={undo}>Undo</button>
        </div>
      )}
    </Frame>
  );
}
