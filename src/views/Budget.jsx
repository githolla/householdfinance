/* ==================================================================
   budget — plan the month before it happens

   One card per envelope: a spent-ring, what's left against the plan,
   and a status chip. Tap any number to change it.
   ================================================================== */

import { useState } from "react";
import { money, num, uid, shiftMonth, GROUPS, C } from "../lib/format.js";
import { Head, MonthNav, Kpi, Rail, Ring, SChip } from "../components.jsx";

export default function Budget({ ctx }) {
  const { m, plan, writeMonth, month, setMonth, state } = ctx;
  const set = (i, field, val) => writeMonth((mm) => { mm.envelopes[i][field] = val; return mm; });
  /* The default card is category, remaining, planned, status. Owner /
     essential / group live behind the ⋯ — metadata, not the story. */
  const [detail, setDetail] = useState("");

  /* stable order: grouped, then by name — the grid stays put as amounts change */
  const ordered = [...plan.envelopes].sort((a, b) =>
    GROUPS.indexOf(a.group || "Other") - GROUPS.indexOf(b.group || "Other") || a.name.localeCompare(b.name));

  return (
    <>
      <Head title="Envelopes" sub="Plan the month before it happens. Tap any number to change it."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Income" value={money(m.income)} />
        <Kpi label="Planned out" value={money(m.planned)} foot={`${Math.round(m.income ? (m.planned / m.income) * 100 : 0)}% of income`} />
        <Kpi label="Toward goals" value={money(m.goalMonthly)} />
        <Kpi label="Unassigned" value={money(m.unallocated)} tone={m.unallocated < -1 ? "down" : m.unallocated > 1 ? "mid" : "up"} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}><Rail m={m} plan={plan} /></div>

      <div className="cardgrid">
        {ordered.map((e) => {
          const i = plan.envelopes.findIndex((x) => x.id === e.id);
          const s = m.spentBy[e.id] || 0;
          const left = e.planned - s;
          const over = e.planned > 0 && s > e.planned;
          const pct = e.planned > 0 ? Math.min(100, (s / e.planned) * 100) : s > 0 ? 100 : 0;
          /* Rent paid in full on the 1st is done, not "running hot" — hot means
             ahead of the month's pace with money still left to burn through. */
          const spentUp = e.planned > 0 && Math.abs(left) < 0.005;
          const attention = !over && !spentUp && e.planned > 0 && (s / e.planned) * 100 > m.pacePct + 10;
          return (
            <div className="card envcard" key={e.id}>
              <div className="toprow">
                <input value={e.name} onChange={(ev) => set(i, "name", ev.target.value)} aria-label="Envelope name" />
                <button className="kill" onClick={() => writeMonth((mm) => { mm.envelopes.splice(i, 1); return mm; })} aria-label={`Remove ${e.name}`}>×</button>
              </div>
              <div className="midrow">
                <Ring pct={pct} size={86} stroke={11}
                  color={over ? C.warn : m.ownerColor(e.owner)}
                  track={over ? "#FBE7EA" : C.brandSoft}>
                  <div>
                    <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>{Math.round(pct)}%</div>
                    <div style={{ fontSize: 9.5, color: C.soft, fontWeight: 600 }}>spent</div>
                  </div>
                </Ring>
                <div style={{ minWidth: 0 }}>
                  <div className="leftlab">{over ? "Over by" : "Left"}</div>
                  <div className={"leftfig" + (over ? " over" : "")}>
                    {money(Math.abs(left), true)}
                  </div>
                  <div className="of" style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
                    <span className="muted" style={{ fontSize: 12 }}>of</span>
                    <input className="num" inputMode="decimal" value={e.planned || ""} placeholder="0"
                      onChange={(ev) => set(i, "planned", num(ev.target.value))} aria-label={`${e.name} planned`} />
                  </div>
                </div>
              </div>
              <div className="foot">
                {over ? <SChip tone="over">over plan</SChip>
                  : spentUp ? <SChip tone="done">fully spent</SChip>
                    : attention ? <SChip tone="warn">running hot</SChip>
                      : <SChip tone="ok">on track</SChip>}
                <span className="muted" style={{ fontSize: 11.5 }}>{money(s)} spent</span>
                <button className="tag" style={{ marginLeft: "auto" }} aria-expanded={detail === e.id}
                  onClick={() => setDetail(detail === e.id ? "" : e.id)} aria-label={`Details for ${e.name}`}>⋯</button>
              </div>
              {detail === e.id && (
                <div className="foot" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--surface2)" }}>
                  <button className="tag" onClick={() => {
                    const order = ["joint", "a", "b"];
                    set(i, "owner", order[(order.indexOf(e.owner) + 1) % 3]);
                  }} title="Who covers this">{m.ownerName(e.owner)}</button>
                  <button className="tag" title="Essential envelopes get funded before goals and spending money"
                    style={e.essential ? { background: C.brandSoft, color: C.brand } : undefined}
                    onClick={() => set(i, "essential", !e.essential)}>
                    {e.essential ? "Essential" : "Flexible"}
                  </button>
                  <select className="tag" value={e.group || "Other"} onChange={(ev) => set(i, "group", ev.target.value)} aria-label="Group">
                    {GROUPS.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn tiny" onClick={() => writeMonth((mm) => {
          mm.envelopes.push({ id: uid(), name: "New envelope", group: "Other", planned: 0, owner: "joint" });
          return mm;
        })}>+ Add an envelope</button>
        <button className="btn ghost tiny" onClick={() => writeMonth((mm) => {
          const prev = state.months[shiftMonth(month, -1)];
          if (!prev) return mm;
          mm.envelopes.forEach((e) => {
            const match = prev.envelopes.find((x) => x.name === e.name);
            if (!match) return;
            const s = prev.entries.filter((t) => t.envId === match.id).reduce((n, t) => n + t.amount, 0);
            if (s > 0) e.planned = Math.round(s);
          });
          return mm;
        })}>Match last month's actuals</button>
      </div>
    </>
  );
}
