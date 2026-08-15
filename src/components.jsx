/* ==================================================================
   shared components

   These render; they don't calculate. Every number they display comes
   off `m` from model().
   ================================================================== */

import { useEffect } from "react";
import { money, monthLabel, shiftMonth, C } from "./lib/format.js";

export const Head = ({ title, sub, right }) => (
  <div className="phead">
    <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
    {right}
  </div>
);

export const MonthNav = ({ month, setMonth }) => (
  <div className="monthnav">
    <button className="arrow" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
    <span className="m num">{monthLabel(month)}</span>
    <button className="arrow" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
  </div>
);

export const Kpi = ({ label, value, foot, tone }) => (
  <div className="card kpi">
    <div className="lab">{label}</div>
    <div className={"val " + (tone || "")}>{value}</div>
    {foot && <div className="foot">{foot}</div>}
  </div>
);

export const Tip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="tip">
      <div className="k">{label}</div>
      {payload.map((p, i) => (
        <div key={i}>{p.name}: <span className="num">{money(p.value)}</span></div>
      ))}
    </div>
  );
};

export const axis = { stroke: C.soft, fontSize: 11, tickLine: false, axisLine: false };

/** Donut progress ring. Children render centred inside it. */
export function Ring({ pct, size = 84, stroke = 10, color = C.brand, track = C.brandSoft, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="ringbox" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {p > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${(p / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <div className="ringlabel">{children}</div>
    </div>
  );
}

/** The money-steps ladder. Every state pairs a mark with words — never colour alone. */
export function Stepper({ steps }) {
  return (
    <div>
      {steps.map((s) => (
        <div className={"step " + s.state} key={s.key}>
          <span className="stepdot">{s.state === "done" ? "✓" : s.n}</span>
          <span style={{ minWidth: 0 }}>
            <span className="steplabel">{s.label}
              {s.state === "current" && <span className="schip warn" style={{ marginLeft: 8 }}>! you are here</span>}
            </span>
            <span className="stepdetail">{s.detail}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Status chip. Always a symbol plus a word — colour never carries state alone. */
export function SChip({ tone, children }) {
  const mark = tone === "ok" || tone === "done" ? "✓" : "!";
  return <span className={"schip " + tone}>{mark} {children}</span>;
}

export function Rail({ m, plan }) {
  const base = Math.max(m.income, m.allocated, 1);
  const segs = plan.envelopes.filter((e) => e.planned > 0)
    .map((e) => ({ k: e.id, w: (e.planned / base) * 100, c: m.ownerColor(e.owner), t: `${e.name} · ${money(e.planned)}` }));
  if (m.goalMonthly > 0) segs.push({ k: "g", w: (m.goalMonthly / base) * 100, c: C.joint, t: `Goals · ${money(m.goalMonthly)}` });
  return (
    <div>
      <div className="rail">
        {segs.map((s) => <div key={s.k} className="seg" style={{ width: s.w + "%", background: s.c }} title={s.t} />)}
        {m.unallocated > 1 && <div className="seg gap" style={{ width: (m.unallocated / base) * 100 + "%" }} title={`Unassigned · ${money(m.unallocated)}`} />}
        {!segs.length && <div className="seg gap" style={{ width: "100%" }} title="Nothing assigned yet" />}
      </div>
      <div className="railkey">
        <span><i className="dot" style={{ background: C.a }} />{m.pA.name}</span>
        <span><i className="dot" style={{ background: C.b }} />{m.pB.name}</span>
        <span><i className="dot" style={{ background: C.joint }} />shared &amp; goals</span>
        <span><i className="dot" style={{ border: "1px dashed " + C.soft }} />unassigned</span>
      </div>
    </div>
  );
}

export const Notes = ({ notes, limit }) => (
  <div>
    {(limit ? notes.slice(0, limit) : notes).map((n, i) => (
      <div className="note" key={i}>
        <span className="tick" style={{ background: n[0] === "warn" ? C.warn : n[0] === "joint" ? C.joint : C.a }} />
        <span>{n[1]}</span>
      </div>
    ))}
  </div>
);

/** Bottom sheet. Thumb-reachable on a phone, a centred card on a desktop. */
export function Sheet({ open, onClose, title, children, foot }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheethead">
          <span className="grab" />
          <h3>{title}</h3>
          <button className="kill" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="sheetbody">{children}</div>
        {foot && <div className="sheetfoot">{foot}</div>}
      </div>
    </div>
  );
}
