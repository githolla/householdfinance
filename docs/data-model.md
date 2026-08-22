# Data model

One JSON object, persisted whole under `twocolumn:v2`.

```jsonc
{
  "demo": true,                       // present only for the sample household
  "household": {
    "name": "The Kitchen Table Fund",
    "splitRule": "proportional",      // "proportional" | "even"
    "partners": [
      { "id": "a", "name": "Alex", "income": 4200, "paydays": [1, 15] },  // monthly take-home; optional paydays
      { "id": "b", "name": "Sam",  "income": 3800, "paydays": [15] }
      // paydays split the take-home into dated paycheck chunks in model()
      // (ids "pay:<partner>:<n>", received per month via months[].received)
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
      "received": ["incomeId"]        // expected incomes marked landed this month
    }
  },

  "incomes": [
    { "id": "i1", "name": "Freelance invoice", "amount": 600, "day": 25,
      "who": "a", "recurring": false, "month": "2026-08", "date": "2026-08-25" }
    // recurring: true applies every month on `day` (month/date are "").
    // One-time incomes carry a real `date`; month and day are kept in sync
    // with it so month-keyed computations work. A date in a later month
    // shows on Budget as "on the horizon" and counts when that month comes.
    // model() adds the month's incomes to take-home for every derived number.
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
    { "id": "b1", "name": "Electric", "amount": 145, "day": 12,
      "envId": "k3f9a1x", "owner": "joint" }                 // envId points at the CURRENT month
  ],

  "chat": [{ "role": "user", "content": "..." }],            // planner history

  "docs": [
    { "id": "d1", "name": "Car insurance renewal.txt", "folder": "Insurance",
      "added": "Aug 22, 2026", "text": "...",                // folder is one of FOLDERS; text capped at 100k chars
      "analysis": "..." }                                    // optional stored AI read of the doc
  ],

  "faith": { "enabled": true }        // daily-scripture layer; absent means enabled
}
```

## Notes

- `group` is one of `GROUPS` (Home, Daily, Lifestyle, Health, Giving, Other) and only drives grouping and the reports chart.
- `date` on an entry is a display string; `day` is the sortable integer. Demo data sets both; the live logger sets `date` only and defaults to today — if you need real date filtering, add a proper ISO field and migrate.
- `bills[].envId` references an envelope in whatever month it was set in. Because ids are per-month, marking a bill paid in a later month may not find its envelope. Matching bills by envelope *name* is the fix when someone gets to it.
- Migration from the `twocolumn:v1` artifact schema is handled by `upgrade()` in App.jsx. Add a `v3` path there rather than mutating in place.
