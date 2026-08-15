/* ==================================================================
   the one place spending gets logged

   Opened three ways: the quick-add button, the desktop logger, or a
   receipt photo. A photo only ever pre-fills it — the sheet is not the
   success case, it's the only case.
   ================================================================== */

import { useState, useEffect, useRef } from "react";
import { money, num, uid, monthLabel, C } from "../lib/format.js";
import { merchantKey } from "../lib/receipt.js";
import { BLANK } from "../lib/draft.js";
import { Sheet } from "../components.jsx";

export default function EntrySheet({ ctx, open, seed, busy, error, onClose, onLogged }) {
  const { m, plan, writeMonth, patch, month, setMonth, state } = ctx;
  const [d, setD] = useState(BLANK);
  const [showItems, setShowItems] = useState(false);
  const [touchedAmount, setTouchedAmount] = useState(false);
  const amountRef = useRef(null);

  /* Seed on open. Once the person starts typing an amount we stop letting a
     late-arriving model answer overwrite it — they beat the model, they win. */
  useEffect(() => {
    if (!open) return;
    setD((prev) => {
      const base = seed || BLANK;
      const next = { ...BLANK, ...base };
      if (touchedAmount) next.amount = prev.amount;
      if (prev.note && !base.note) next.note = prev.note;
      return next;
    });
  }, [open, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) { setShowItems(false); setTouchedAmount(false); }
  }, [open]);

  useEffect(() => {
    if (open && !busy && amountRef.current) amountRef.current.focus();
  }, [open, busy]);

  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  /* Envelope chips: the match first, then whatever they reach for most, then the rest. */
  const matchedFirst = [];
  const seen = new Set();
  const push = (e) => { if (e && !seen.has(e.id)) { seen.add(e.id); matchedFirst.push(e); } };
  push(plan.envelopes.find((e) => e.id === d.envId));
  m.merchantFavourites().forEach((name) => push(m.envByName(name)));
  plan.envelopes.forEach(push);

  const receiptMonth = d.dateISO ? d.dateISO.slice(0, 7) : "";
  const wrongMonth = receiptMonth && receiptMonth !== month;

  const why = {
    learned: "you filed this here before",
    photo: "read from the photo",
    recent: "same as last time",
    guess: "pick an envelope",
  }[d.why];

  const amt = num(d.amount);
  const canLog = amt > 0 && !!d.envId;

  /* The phone keypad. No OS keyboard to summon, no zoom, 56px keys —
     this is what makes logging faster than typing. */
  const press = (k) => {
    setTouchedAmount(true);
    setD((x) => {
      let a = String(x.amount || "");
      if (k === "back") a = a.slice(0, -1);
      else if (k === ".") { if (!a.includes(".")) a = (a || "0") + "."; }
      else {
        if (/\.\d\d$/.test(a)) return x;              // two decimal places max
        if (a.replace(/\D/g, "").length >= 7) return x; // nobody logs eight figures
        a = a === "0" ? k : a + k;
      }
      return { ...x, amount: a };
    });
  };

  const commit = () => {
    if (!canLog) return;
    const env = plan.envelopes.find((e) => e.id === d.envId);
    const day = d.dateISO ? Number(d.dateISO.slice(8, 10)) : new Date().getDate();
    const label = d.dateISO
      ? new Date(d.dateISO + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });

    const entryId = uid();
    writeMonth((mm) => {
      mm.entries.unshift({
        id: entryId,
        envId: d.envId,
        amount: amt,
        who: d.who,
        note: d.note.trim() || d.merchant || (env ? env.name : "Spending"),
        date: label,
        day,
        ...(d.merchant ? { merchant: d.merchant } : {}),
        ...(d.items.length ? { items: d.items } : {}),
      });
      return mm;
    });

    /* Correcting a chip teaches the memory — same code path, no extra tap. */
    const key = merchantKey(d.merchant);
    if (key && env) {
      patch((s) => {
        if (!s.merchantMap) s.merchantMap = {};
        const prev = s.merchantMap[key];
        s.merchantMap[key] = {
          env: env.name,
          who: d.who,
          count: (prev && prev.count ? prev.count : 0) + 1,
          updated: month,
        };
        return s;
      });
    }
    if (onLogged) onLogged({ id: entryId, amount: amt, envName: env ? env.name : "" });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log spending"
      foot={
        <button className="btn wide" onClick={commit} disabled={!canLog}>
          {canLog ? `Log ${money(amt, true)}` : "Enter an amount"}
        </button>
      }
    >
      {(d.thumb || busy || error) && (
        <div className="readout">
          {d.thumb && <img className="thumb" src={d.thumb} alt="Receipt" />}
          <span className={error ? "warnText" : "muted"}>
            {error || (busy ? "Reading the receipt…" : why || "")}
          </span>
        </div>
      )}

      <label className="lbl">Amount</label>
      <input
        ref={amountRef}
        className={"amtbig num" + (busy && !d.amount ? " shimmer" : "")}
        inputMode="decimal"
        placeholder="$0.00"
        value={d.amount}
        onChange={(e) => { setTouchedAmount(true); set("amount", e.target.value); }}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-label="Amount"
      />
      {/* phone: a display plus a keypad instead of the OS keyboard */}
      <div className={"amtdisplay num" + (busy && !d.amount ? " shimmer" : "")} aria-live="polite">
        {d.amount ? `$${d.amount}` : <span className="ph">$0</span>}
      </div>
      <div className="padgrid" aria-label="Amount keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((k) => (
          <button key={k} className="padkey" onClick={() => press(k)}
            aria-label={k === "back" ? "Delete" : k}>
            {k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>

      <label className="lbl" style={{ marginTop: 14 }}>Envelope {why && <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>· {why}</span>}</label>
      <div className="chiprow">
        {matchedFirst.map((e) => (
          <button
            key={e.id}
            className={"chip" + (e.id === d.envId ? " on" : "")}
            onClick={() => set("envId", e.id)}
          >
            {e.name}
          </button>
        ))}
      </div>

      <label className="lbl" style={{ marginTop: 14 }}>Who spent it</label>
      <div className="whorow">
        {["joint", "a", "b"].map((o) => (
          <button
            key={o}
            className={"whobtn" + (d.who === o ? " on" : "")}
            style={d.who === o ? { borderColor: m.ownerColor(o), color: m.ownerColor(o) } : undefined}
            onClick={() => set("who", o)}
          >
            {o === "joint" ? "Both of us" : m.ownerName(o)}
          </button>
        ))}
      </div>

      <label className="lbl" style={{ marginTop: 14 }}>What was it for? <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>· optional</span></label>
      <input
        className="field"
        placeholder={d.merchant || "Weekly shop"}
        value={d.note}
        onChange={(e) => set("note", e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-label="Note"
      />

      {wrongMonth && (
        <button className="chip" style={{ marginTop: 14, borderColor: C.joint, color: C.joint }}
          onClick={() => setMonth(receiptMonth)}>
          This is a {monthLabel(receiptMonth)} receipt — switch
        </button>
      )}

      {d.items.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="btn ghost tiny" onClick={() => setShowItems((s) => !s)}>
            {showItems ? "Hide" : `${d.items.length} items`}
          </button>
          {showItems && (
            <div style={{ marginTop: 8 }}>
              {d.items.map((it, i) => (
                <div className="note" key={i} style={{ justifyContent: "space-between" }}>
                  <span className="muted">{it.name}</span>
                  <span className="num">{money(it.amount, true)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

