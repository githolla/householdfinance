/* ==================================================================
   budget — plan the month before it happens
   ================================================================== */

import { money, num, uid, shiftMonth, GROUPS, C } from "../lib/format.js";
import { Head, MonthNav, Kpi, Rail } from "../components.jsx";

export default function Budget({ ctx }) {
  const { m, plan, writeMonth, month, setMonth, state } = ctx;
  const set = (i, field, val) => writeMonth((mm) => { mm.envelopes[i][field] = val; return mm; });

  return (
    <>
      <Head title="Budget" sub="Plan the month before it happens. Tap any number to change it."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Income" value={money(m.income)} />
        <Kpi label="Planned out" value={money(m.planned)} foot={`${Math.round(m.income ? (m.planned / m.income) * 100 : 0)}% of income`} />
        <Kpi label="Toward goals" value={money(m.goalMonthly)} />
        <Kpi label="Unassigned" value={money(m.unallocated)} tone={m.unallocated < -1 ? "down" : m.unallocated > 1 ? "mid" : "up"} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}><Rail m={m} plan={plan} /></div>

      <div className="card">
        {GROUPS.filter((g) => m.byGroup[g]).map((g) => {
          const grp = m.byGroup[g];
          return (
            <div key={g}>
              <div className="grouphead">
                <span>{g}</span>
                <span className="num">{money(grp.spent)} of {money(grp.planned)}</span>
              </div>
              {grp.items.map((e) => {
                const i = plan.envelopes.findIndex((x) => x.id === e.id);
                const s = m.spentBy[e.id] || 0;
                const over = e.planned > 0 && s > e.planned;
                const pct = e.planned > 0 ? Math.min(100, (s / e.planned) * 100) : s > 0 ? 100 : 0;
                return (
                  <div className="row" key={e.id}>
                    <div className="rowname">
                      <input value={e.name} onChange={(ev) => set(i, "name", ev.target.value)} aria-label="Envelope name" />
                      <select className="tag hideS" value={e.group || "Other"} onChange={(ev) => set(i, "group", ev.target.value)} aria-label="Group">
                        {GROUPS.map((x) => <option key={x}>{x}</option>)}
                      </select>
                      <button className="tag" title="Essential envelopes get funded before goals and spending money"
                        style={e.essential ? { borderColor: C.a, color: C.a } : undefined}
                        onClick={() => set(i, "essential", !e.essential)}>
                        {e.essential ? "Essential" : "Flexible"}
                      </button>
                      <button className="tag" onClick={() => {
                        const order = ["joint", "a", "b"];
                        set(i, "owner", order[(order.indexOf(e.owner) + 1) % 3]);
                      }} title="Who covers this">{m.ownerName(e.owner)}</button>
                      <button className="kill" onClick={() => writeMonth((mm) => { mm.envelopes.splice(i, 1); return mm; })} aria-label={`Remove ${e.name}`}>×</button>
                    </div>
                    <div className="amt">
                      <input className="num" inputMode="decimal" value={e.planned || ""} placeholder="0"
                        onChange={(ev) => set(i, "planned", num(ev.target.value))} aria-label={`${e.name} planned`} />
                    </div>
                    <div className={"amt num " + (over ? "over" : "muted")}>{money(s)}</div>
                    <div className="bar"><i style={{ width: pct + "%", background: over ? C.warn : m.ownerColor(e.owner) }} /></div>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn ghost tiny" onClick={() => writeMonth((mm) => {
            mm.envelopes.push({ id: uid(), name: "New envelope", group: "Other", planned: 0, owner: "joint" });
            return mm;
          })}>Add an envelope</button>
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
      </div>
    </>
  );
}
