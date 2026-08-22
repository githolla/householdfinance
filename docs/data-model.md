# Data model

One JSON object, persisted whole under `twocolumn:v2`.

```jsonc
{
  "demo": true,                       // present only for the sample household
  "household": {
    "name": "The Kitchen Table Fund",
    "splitRule": "proportional",      // "proportional" | "even"
    "partners": [
      { "id": "a", "name": "Alex", "income": 4200 },   // monthly take-home
      { "id": "b", "name": "Sam",  "income": 3800 }
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
      "paid": ["billId"]              // bills marked paid this month
    }
  },

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

  "faith": { "enabled": true }        // daily-scripture layer; absent means enabled
}
```

## Notes

- `group` is one of `GROUPS` (Home, Daily, Lifestyle, Health, Giving, Other) and only drives grouping and the reports chart.
- `date` on an entry is a display string; `day` is the sortable integer. Demo data sets both; the live logger sets `date` only and defaults to today — if you need real date filtering, add a proper ISO field and migrate.
- `bills[].envId` references an envelope in whatever month it was set in. Because ids are per-month, marking a bill paid in a later month may not find its envelope. Matching bills by envelope *name* is the fix when someone gets to it.
- Migration from the `twocolumn:v1` artifact schema is handled by `upgrade()` in App.jsx. Add a `v3` path there rather than mutating in place.
