# Data model

One JSON object, persisted whole under `twocolumn:v2`.

`withDefaults()` in `src/lib/seed.js` runs on every load and deep-merges any missing keys, so
`model()` can assume everything below exists. Add new keys there rather than defending against
`undefined` at thirty call sites.

```jsonc
{
  "v": 3,
  "demo": true,                       // present only for the sample household

  "household": {
    "name": "The Kitchen Table Fund",
    "splitRule": "proportional",      // "proportional" | "even"
    "partners": [
      { "id": "a", "name": "Yvette", "income": 5400 },   // monthly take-home
      { "id": "b", "name": "Josh",   "income": 4800 }
    ]
  },

  "ui": {
    "defaultWho": "joint",            // who a new entry is filed under before you touch anything;
                                      // per-device in spirit, though it rides in the shared blob
    "lastSeen": "2026-08-16",         // stamped on Home mount; drives "since you were last here"
    "agreedRec": "2026-08",           // month whose Planner split was marked "use this plan" —
                                      // a recorded agreement, it moves no money
    "plannerSeed": "…"                // one-shot question handed to Ask the Planner; consumed on
                                      // mount into the input box, never auto-sent
  },

  "months": {
    "2026-08": {
      "envelopes": [
        { "id": "k3f9a1x", "name": "Groceries", "group": "Daily", "planned": 780,
          "owner": "joint",
          "essential": true,          // funded before goals and spending money
          "role": "tithe" }           // optional: "tithe" | "tax" | "spending"
      ],
      "entries": [
        { "id": "p1q2r3s", "envId": "k3f9a1x", "amount": 62, "who": "a",
          "note": "Weekly shop", "date": "Aug 14", "day": 14,
          "merchant": "Safeway",                          // optional, set by receipt capture
          "items": [{ "name": "Milk", "amount": 4.29 }] }  // optional, display-only
      ],
      "paid": ["billId"]              // bills marked paid this month
    }
  },

  "goals": [
    { "id": "g1", "name": "Emergency fund", "target": 21000, "saved": 6800,
      "monthly": 900, "due": "", "owner": "joint",
      "role": "emergency" }           // optional: "emergency" | "travel"
  ],

  "accounts": [
    { "id": "a1", "name": "Car loan", "type": "debt", "balance": 12400,
      "owner": "joint", "apr": 5.9, "minPayment": 385 }    // type: cash|invest|property|debt
  ],

  "bills": [
    { "id": "b1", "name": "Electric", "amount": 145, "day": 12,
      "envId": "k3f9a1x", "owner": "joint",
      "payUrl": "https://secure.example.com/pay" }         // "" or an http(s) URL
  ],

  "merchantMap": {                    // top-level, not per-month — where a shop gets filed
    "safeway": { "env": "Groceries", "who": "joint", "count": 4, "updated": "2026-08" }
  },

  "tax": {
    "year": 2026,
    "filingStatus": "mfj",            // "mfj" | "single"
    "stateRatePct": 0,
    "stateBase": "agi",               // "agi" | "gross"
    "stateStandardDeduction": 0,
    "qbiEnabled": true,
    "w2WithholdingAnnual": 0,
    "creditsEstimate": 0,
    "priorYearTax": 0,
    "priorYearAgi": 0,
    "partners": {
      "a": { "gross1099": 62000, "businessExpenses": 4200,
             "w2Wages": 0, "retirement": 0, "healthIns": 0 },
      "b": { "gross1099": 55000, "businessExpenses": 3000,
             "w2Wages": 0, "retirement": 0, "healthIns": 0 }
    },
    "payments": [
      { "id": "x1", "date": "2026-04-14", "amount": 4600,
        "kind": "paid", "quarter": "Q1", "note": "EFTPS" }  // kind: "paid" | "reserve"
    ],
    "constants": {}                   // sparse overrides merged over TAX_TABLES[year]
  },

  "waterfall": {
    "tithePct": 10,
    "titheBase": "gross",             // "gross" | "afterTax"
    "order": ["tithe","taxReserve","fixedBills","essentials",
              "emergencyFund","debtExtra","goals","spending"],
    "essentialGroups": ["Home","Daily","Health"],
    "emergencyMonths": 3,
    "debtExtra": 200,
    "emergencyGoalId": "g1"           // explicit; avoids fragile name matching
  },

  "rules": [                          // house rules — agreements the planner holds advice against
    { "id": "r1", "text": "Keep checking above $2,000" }
  ],

  "meeting": {                        // the weekly Money Meeting, one week at a time
    "key": "2026-W33",                // ISO-ish week key from model(); a new key resets the rest
    "briefing": "",                   // legacy AI briefing slot (the meeting is guided now)
    "votes": { "a": "savings", "b": null },  // each partner's one-decision vote, or null
    "gratitude": { "a": "…", "b": "" }       // optional per-partner answers from step one
  },

  "faith": {
    "enabled": true,                // the stewardship layer: Stewardship view, gratitude-first
                                    // meeting, "pray on it", a Planner that may offer biblical
                                    // principles — and never speaks for God
    "scripture": "relevant"         // "off" | "relevant" | "more" — how often it may surface
  },

  "decisions": [                    // decisions deliberately set aside (pray / sleep on it)
    { "id": "d1", "what": "A newer truck", "cost": 42000,
      "until": "2026-08-23",        // resurfaced once as a note on this day
      "created": "2026-08-16" }
  ],

  "enough": {
    "note": "…",                    // the household's own definition of enough, free text —
                                    // read by the Planner, never parsed
    "answers": { "lifestyle": "…" },// what they told the Enough builder, kept for revisiting
    "approved": true                // set when they save a statement as theirs
  },

  "chat": [{ "role": "user", "content": "..." }]            // planner history
}
```

## Notes

- `group` is one of `GROUPS` (Home, Daily, Lifestyle, Health, Giving, Other) and only drives grouping and the reports chart. `essential` is what the waterfall actually reads; it defaults from `group` on first load but is independently editable in Budget.
- `date` on an entry is a display string; `day` is the sortable integer. Receipt capture and the demo set both; older hand-logged entries may have `date` only. If you need real date filtering, add a proper ISO field and migrate.
- **`bills[].envId` references an envelope in whatever month it was set in.** Because ids are per-month, it won't resolve in a later month. `resolveBillEnvelope()` in `engines.js` handles this: try the id in the current month, else find the month where it *does* resolve, take that envelope's **name**, and match by name. This is what stops the waterfall double-counting a $2,150 rent bill against a $2,150 rent envelope.
- `merchantMap` is keyed by `merchantKey()` — lowercased, store numbers and `inc/llc/ltd/co/corp` stripped — so "SAFEWAY #1423" and "Safeway Inc" collapse to one entry. Values store the envelope **name**, never an id, for the same per-month reason.
- **No image data is ever persisted.** Receipt base64 lives in a `useRef` for the life of one review sheet. One photo would consume a large fraction of the 5MB localStorage budget and take the household's whole blob down with it.
- `waterfall.order` must contain `spending` exactly once, and it is forced last regardless of position — it's the terminal stage that absorbs the remainder. A stage placed after it would silently receive nothing.
- `tax.constants` is a **sparse override** merged over `TAX_TABLES[year]` in `engines.js`. Shipping the tables as code means a new household isn't staring at a $0 tax bill; the override means January's figures don't need a deploy.
- `rules` are free text on purpose — they're read by the planner's system prompt, not parsed. `meeting` holds exactly one week; a new `key` from `model()` invalidates the stored briefing and votes.
- Migration from the `twocolumn:v1` artifact schema is handled by `upgradeV1()` in `seed.js`, which finishes by calling `withDefaults()`. v2 blobs need no migration step — the added keys are all optional and `withDefaults()` fills them.
