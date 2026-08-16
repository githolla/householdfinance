/* ==================================================================
   calendar — the month laid out day by day

   Everything shown comes off m.calendar. Hover gets a popover on
   pointer devices; tapping a day opens the same detail in the panel
   beside the grid, which is the whole interaction on touch.
   ================================================================== */

import { useState, useEffect } from "react";
import { money, ordinal, monthLabel, safeUrl, C } from "../lib/format.js";
import { Head, MonthNav, SChip } from "../components.jsx";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar({ ctx, onQuickAdd }) {
  const { m, month, setMonth, setView, writeMonth } = ctx;
  const todayDay = m.calendar.days.find((d) => d.today);
  const [sel, setSel] = useState(todayDay ? todayDay.day : null);

  /* Changing months keeps a day number that may not exist there. */
  useEffect(() => {
    const t = m.calendar.days.find((d) => d.today);
    setSel(t ? t.day : null);
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const [cy, cmo] = month.split("-").map(Number);
  const dayInfo = sel ? m.calendar.days[sel - 1] : null;
  const dayLabel = sel
    ? new Date(cy, cmo - 1, sel).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : "";

  const togglePaid = (b) => writeMonth((mm) => {
    mm.paid = mm.paid || [];
    if (mm.paid.includes(b.id)) mm.paid = mm.paid.filter((x) => x !== b.id);
    else {
      mm.paid.push(b.id);
      if (b.envId && mm.envelopes.some((e) => e.id === b.envId))
        mm.entries.unshift({
          id: Math.random().toString(36).slice(2, 9), envId: b.envId, amount: b.amount,
          who: b.owner, note: b.name + " (bill)", day: b.day,
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
    }
    return mm;
  });

  const billChip = (b) =>
    b.paid ? <SChip tone="ok">paid</SChip>
      : b.overdue ? <SChip tone="over">overdue</SChip>
        : <span className="muted" style={{ fontSize: 12 }}>due the {ordinal(b.day)}</span>;

  return (
    <>
      <Head title="Calendar" sub="The month laid out — spending, bills, and tax deadlines, day by day."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <div className="grid g23">
        <div className="card">
          <div className="chead"><h3>{monthLabel(month)}</h3>
            <span className="meta num">{money(m.spent)} spent · {money(m.billsLeft)} of bills to go</span>
          </div>
          <div className="calhead">
            {DOW.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="calgrid">
            {Array.from({ length: m.calendar.firstDow }, (_, i) => <span className="calblank" key={"b" + i} />)}
            {m.calendar.days.map((d) => {
              const col = (m.calendar.firstDow + d.day - 1) % 7;
              const row = Math.floor((m.calendar.firstDow + d.day - 1) / 7);
              return (
                <button key={d.day}
                  className={"calcell" + (d.today ? " today" : "") + (sel === d.day ? " sel" : "")}
                  onClick={() => setSel(d.day)}
                  aria-label={`${monthLabel(month)} ${d.day}`}>
                  <span className="caldaynum">{d.day}</span>
                  {d.spent > 0 && <span className="calspent num">{money(d.spent)}</span>}
                  {(d.bills.length > 0 || d.tax.length > 0) && (
                    <span className="calmarks">
                      {d.bills.map((b) => (
                        <i key={b.id} className={"calbill" + (b.paid ? " paid" : b.overdue ? " late" : "")} />
                      ))}
                      {d.tax.map((q) => <em key={q.label} className="caltaxmark">tax</em>)}
                    </span>
                  )}
                  {d.busy && (
                    <span className={"calpop" + (col >= 5 ? " flip" : "") + (row >= 4 ? " up" : "")}>
                      {d.bills.map((b) => (
                        <span className="calpoprow" key={b.id}>
                          <span>{b.name} <em className="muted">{b.paid ? "· paid" : b.overdue ? "· overdue" : "· due"}</em></span>
                          <span className="num">{money(b.amount)}</span>
                        </span>
                      ))}
                      {d.tax.map((q) => (
                        <span className="calpoprow" key={q.label}>
                          <span>{q.label} estimated tax</span><span className="num">{money(q.amount)}</span>
                        </span>
                      ))}
                      {d.entries.slice(0, 4).map((e) => (
                        <span className="calpoprow" key={e.id}>
                          <span><i className="dot" style={{ background: m.ownerColor(e.who) }} /> {e.name}</span>
                          <span className="num">{money(e.amount)}</span>
                        </span>
                      ))}
                      {d.entries.length > 4 && (
                        <span className="calpoprow muted">{d.entries.length - 4} more — tap the day</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="railkey" style={{ marginTop: 12 }}>
            <span><i className="dot" style={{ background: C.brand }} />bill due</span>
            <span><i className="dot" style={{ background: C.ok }} />bill paid</span>
            <span><i className="dot" style={{ background: C.warn }} />overdue</span>
            <span><i className="dot" style={{ background: C.joint }} />tax deadline</span>
          </div>
        </div>

        <div className="card">
          <div className="chead"><h3>{sel ? dayLabel : "Pick a day"}</h3>
            {dayInfo && dayInfo.spent > 0 && <span className="meta num">{money(dayInfo.spent)} spent</span>}
          </div>
          {!dayInfo && <p className="empty">Tap a day to see what happened and what's due.</p>}
          {dayInfo && !dayInfo.busy && <p className="empty">Nothing logged and nothing due on the {ordinal(sel)}.</p>}

          {dayInfo && dayInfo.tax.map((q) => (
            <div className="note" key={q.label} style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span>{q.label} estimated tax <span className="muted">· {q.covers}</span></span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="num">{money(q.amount)}</span>
                <button className="btn ghost tiny" onClick={() => setView("taxes")}>Open taxes</button>
              </span>
            </div>
          ))}

          {dayInfo && dayInfo.bills.map((b) => {
            const url = safeUrl(b.payUrl);
            return (
              <div className="note" key={b.id} style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>{b.name}</span>
                  {billChip(b)}
                </span>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <span className="num">{money(b.amount)}</span>
                  {url && !b.paid && <a className="btn ghost tiny" href={url} target="_blank" rel="noreferrer">Pay</a>}
                  <button className="btn ghost tiny" onClick={() => togglePaid(b)}>{b.paid ? "Unpay" : "Paid"}</button>
                </span>
              </div>
            );
          })}

          {dayInfo && dayInfo.entries.map((e) => (
            <button className="envrow" key={e.id} onClick={() => setView("txn")}>
              <span style={{ display: "flex", gap: 9, alignItems: "center", minWidth: 0 }}>
                <i className="dot" style={{ background: m.ownerColor(e.who) }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.name} <span className="muted">· {m.ownerName(e.who)}</span>
                </span>
              </span>
              <span className="v">{money(e.amount)}</span>
            </button>
          ))}

          {dayInfo && (
            <button className="btn ghost tiny" style={{ marginTop: 12 }}
              onClick={() => onQuickAdd(undefined, `${month}-${String(sel).padStart(2, "0")}`)}>
              Log spending on the {ordinal(sel)}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
