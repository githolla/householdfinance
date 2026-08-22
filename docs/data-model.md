# Data model

One JSON object, persisted whole under `twocolumn:v2`.

```jsonc
{
  "demo": true,                       // present only for the sample household
  "household": {
    "name": "The Kitchen Table Fund",
    "splitRule": "proportional",      // "proportional" | "even"
    "partners": [
      { "id": "a", "name": "Alex", "income": 4200 },   // flat monthly take-home (fallback)
      { "id": "b", "name": "Sam",  "income": 3800 }
      // If a partner has paycheck items in `incomes` (pay: true) for the
      // month, their take-home is the SUM of those instead of `income`.
    ]
  },

  "months": {
    "2026-08": {
      "envelopes": [
        { "id": "k3f9a1x", "name": "Groceries", "group": "Daily", "planned": 780, "owner": "joint" }
      ],
      "entries": [
        { "id": "p1q2r3s", "envId": "k3f9a1x", "amount": 62, "who": "a",
          "note": "Weekly shop", "date": "Aug 14", "day": 14 }
      ],
      "paid": ["billId"],             // bills marked paid this month
      "paidMeta": { "b1": { "date": "2026-08-14", "conf": "4X8-2210" } },
                                      // per-bill receipt: date auto-stamped on mark-paid
                                      // (editable), confirmation # optional; cleared on un-pay
      "received": ["incomeId"],       // expected incomes marked received this month
      "billAmounts": { "b1": 162 }    // this month's actual bill amounts, when they differ
    }                                 // from bills[].amount (the usual). Paid entries carry
  },                                  // billId, so bill history reads entries first, then these.

  "incomes": [
    { "id": "p1", "pay": true, "name": "Alex's paycheck", "amount": 2100,
      "day": 15, "who": "a", "recurring": true, "month": "", "date": "" },
    { "id": "i1", "name": "Freelance invoice", "amount": 600, "day": 25,
      "who": "a", "recurring": false, "month": "2026-08", "date": "2026-08-25" }
    // pay: true marks a paycheck — these SET the partner's take-home
    // (summed) instead of adding on top of it. Everything else adds.
    // recurring: true applies every month on `day` (month/date are "").
    // One-time incomes carry a real `date`; month and day stay in sync
    // with it. A date in a later month shows on Budget as "on the
    // horizon" and counts when that month comes. Received is tracked per
    // month in months[].received by income id.
  ],

  "goals": [
    { "id": "g1", "name": "Emergency fund", "target": 15000, "saved": 6800,
      "monthly": 900, "due": "2027-03", "owner": "joint" }   // due is "" or "YYYY-MM"
  ],

  "accounts": [
    { "id": "a1", "name": "Car loan", "type": "debt", "balance": 12400,
      "owner": "joint", "apr": 5.9, "minPayment": 385 }      // type: cash|invest|property|debt
  ],

  "bills": [
    { "id": "b1", "name": "Electric", "company": "PPL", "amount": 145, "day": 12,
      "envId": "k3f9a1x", "owner": "joint",                  // envId points at the CURRENT month
      "payMethod": "auto",                                   // "auto" | "online" | "check" | "" (unset)
      "payUrl": "ppl.com/pay" }                              // optional; rendered with https:// prefixed
  ],

  "chat": [{ "role": "user", "content": "..." }],            // planner history

  "docs": [
    { "id": "d1", "name": "Car insurance renewal.txt", "folder": "Insurance",
      "added": "Aug 22, 2026", "text": "...",                // folder is one of FOLDERS; text capped at 100k chars
      "analysis": "..." }                                    // optional stored AI read of the doc
  ],

  "faith": { "enabled": true, "givingTarget": 10 },  // scripture layer (absent = on) + giving % target (default 10)

  "milestones": ["debt:a1", "tithe:2026-08"],        // celebration ids already marked
  "milestoneLog": [{ "id": "debt:a1", "text": "Car loan is paid off.", "when": "2026-08" }]
}
```

## Notes

- `group` is one of `GROUPS` (Home, Daily, Lifestyle, Health, Giving, Other) and only drives grouping and the reports chart.
- `date` on an entry is a display string; `day` is the sortable integer. Demo data sets both; the live logger sets `date` only and defaults to today — if you need real date filtering, add a proper ISO field and migrate.
- `bills[].envId` references an envelope in whatever month it was set in. Because ids are per-month, marking a bill paid in a later month may not find its envelope. Matching bills by envelope *name* is the fix when someone gets to it.
- Migration from the `twocolumn:v1` artifact schema is handled by `upgrade()` in App.jsx. Add a `v3` path there rather than mutating in place.
