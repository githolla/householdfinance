# CLAUDE.md

Read this before touching anything. Keep it current — if you change the architecture, change this file in the same commit.

## What this is

A shared-finances app for a couple: budget, spending, bills, goals, debt payoff, a 1099 tax set-aside, net worth, reports, and an AI planner panel that answers with the household's own numbers. It was prototyped as a single Claude artifact and lifted into Vite. Everything works today; nothing is mocked except the data source.

## Stack

Vite + React 18 (JSX, not TS yet) · recharts · plain CSS in a template literal · localStorage via a shim.
No Tailwind, no component library, no router. Don't add any without being asked.

```
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY for the planner and receipt reading
npm run dev               # localhost:5173
```

## File map

```
src/App.jsx           shell: persistence, nav (sidebar + tab bar), quick-add wiring
src/components.jsx    shared bits — Head, MonthNav, Kpi, Tip, Rail, Notes, Sheet
src/css.js            the entire stylesheet, one template literal
src/main.jsx          mounts App, imports the storage shim first
src/storage.js        window.storage backed by localStorage (see contract in the file)

src/lib/format.js     money, month math, num(), safeUrl(), the C palette
src/lib/engines.js    debt payoff · 1099 tax reserve · allocation waterfall (pure)
src/lib/model.js      model() — the computation layer
src/lib/seed.js       seed envelopes, the sample household, withDefaults()
src/lib/receipt.js    image shrink, the Claude vision call, merchant key
src/lib/useReceipt.js the capture → read → review flow as a hook
src/lib/draft.js      the draft shape EntrySheet is seeded with

src/views/*.jsx       one file per view, plus EntrySheet (the only write path)
vite.config.js        DEV proxy that attaches the Anthropic key server-side
api/anthropic/        the same thing for production, as a serverless function
docs/                 data model + roadmap
```

**The Anthropic key has two server-side homes and they must agree.** `vite.config.js`
covers `npm run dev`; `api/anthropic/[...path].js` covers the deployed site, because
`server.proxy` does not exist in a built bundle. Change one, change the other — otherwise
the app works locally and 404s in production. Never move the key to a `VITE_` variable:
anything with that prefix is inlined into the client bundle and is public.

It was one 1,700-line file until the engines landed; splitting by view is what the previous
version of this note asked for. `model()` and the shared components stayed together.

## The one thing that matters architecturally

**`model(state, plan, month)` is the whole computation layer.** Every derived number in the app — totals, per-envelope spend, goal projections, the debt simulation, the tax reserve, the allocation waterfall, planner notes, the headline sentence, the fair-split read — is computed there and passed down as `m`. View components render; they don't calculate.

Keep it that way. If you need a new number, add it to `model()` and read it off `m`. Do not compute totals inside a view.

`src/lib/engines.js` holds the three simulations as **pure functions** — no state access, no React. `model()` calls them and hangs the results on `m.debt`, `m.tax`, `m.flow`. They're pure so they can be tested without a browser (see "Tests" below).

Order matters inside `model()`: **tax → waterfall → debt**. The payoff date is built on the extra payment the plan can actually *fund* (`m.fundedExtra`), not the one that was requested — otherwise the date is a fantasy.

## State shape

Single object, persisted as one JSON blob under `twocolumn:v2`, debounced 450ms. See `docs/data-model.md`.

Three rules that will bite you:
- **Months are lazy.** `state.months[month]` may not exist. The `plan` memo falls back to cloning last month's envelopes with fresh ids. It only gets written when the user edits. Always mutate months through `writeMonth()`, never `patch()` directly.
- **Envelope ids are per-month.** The same envelope in March and April has different ids. Cross-month matching is by `name` (see `resolveBillEnvelope()` in engines.js, and "Match last month's actuals"). Anything reasoning across months has to account for this.
- **`withDefaults()` runs on every load.** New top-level keys get merged in there, deep, never overwriting a value the household already set. That's why `model()` can assume `state.tax` and `state.waterfall` exist.

`patch(fn)` deep-clones state, applies `fn`, sets. Fine at this data size; revisit if a household ever has thousands of transactions.

## Money math

All three engines work in **integer cents internally** and convert at the boundary. Float dollars accumulate dust across 600 iterations and leave balances at `0.0000000001`, which reads as "still owing" and burns extra months.

When a simulation can't terminate — minimums below interest — it returns `never: true` with `months: null` and `totalInterest: null`. **Never let a view format a fabricated figure as money.** The old `payoff()` returned `months: 600` and rendered it as a real payoff date.

## Conventions

- Money is stored as plain numbers, formatted at the edge with `money()`. Never format for storage.
- Month keys are `"YYYY-MM"` strings. Use `shiftMonth`, `monthsBetween`, `monthLabel`, `daysInMonth` — never do date math inline.
- `owner` is `"a" | "b" | "joint"` everywhere (envelopes, entries, bills, accounts). Resolve with `m.ownerName()` / `m.ownerColor()`.
- All user input goes through `num()`, which strips currency formatting and never returns NaN. Pasted URLs go through `safeUrl()`, which only lets `http(s)` through.
- Colours live in the `C` object and the CSS variables. Violet `#6C4CF1` is partner A **and** the brand; teal `#0E9888` is partner B; amber `#E09112` is shared/goals; red `#D93A4C` is the only alarm colour; green `#17A24A` means confirmed-good. The set was validated as a categorical palette (CVD + normal-vision separation, all pairs, on the white card surface) — if you change a hue, re-validate, don't eyeball.
- **Red means something is wrong**, not merely notable. Over plan, overdue, a shortfall, a minimum that doesn't cover interest. Being ahead of an even pace is not an alarm, and an envelope spent to exactly its plan is *done* ("fully spent", neutral), not hot.
- Status chips (`SChip`) always pair a symbol with a word — colour never carries state alone. Same rule for series colours: every colored mark sits beside its name.
- Surfaces: lavender page `--page`, white cards with the `--shadow` token, radius 16–18px, pill buttons. New tints come from the existing tokens (`--surface2`, `--brand-soft`), not new hues.
- Type: Plus Jakarta Sans everywhere, IBM Plex Mono for all figures (tabular). Loaded via `@import` in the CSS string.
- No `<form>` elements — click handlers and Enter keydowns only. Carried over from the artifact; harmless to keep.
- Watch class-name collisions in the one-file stylesheet: `.mid` is the amber KPI *tone*; layout classes need their own names (`.midrow`). Same trap as the `.side nav` scoping.

## Layout

Breakpoint ladder, desktop-first. Keep it monotonic — the old file had six overlapping breakpoints.

| Query | What changes |
|---|---|
| `max-width:980px` | three- and four-up grids collapse to two |
| `max-width:899px` | touch layout: sidebar off, tab bar and quick-add on, 16px inputs, 44px targets |
| `max-width:599px` | phone: single column, tighter padding |

New phone chrome goes in the `≤899` block. New figures go in `model()`.

Two things that silently break the phone layout:
- `index.html` needs `viewport-fit=cover` or every `env(safe-area-inset-*)` evaluates to 0 and the tab bar sits under the home indicator.
- Inputs below 16px make iOS zoom on focus. The `≤899` block sets the floor; don't override it downward.
- **Never wrap a chart in `display:none`** — `ResponsiveContainer` measures 0 and collapses. The dashboard reflows with `order`, not visibility, for exactly this reason.
- `.tabbar` is a `<nav>`. Sidebar nav rules are scoped `.side nav button` on purpose; unscoped, they paint the active tab as a filled black block.

## The AI bits

Two calls, both through the dev proxy in `vite.config.js`, both on `claude-opus-5`:

- **Receipt reading** (`src/lib/receipt.js`) — photo shrunk to 2000px/JPEG in the browser, sent as a base64 image block with `output_config.format` as a JSON schema so the response is structured. `effort: "low"` is the latency lever. Thinking is on by default on this model and `max_tokens` caps thinking *plus* output, hence 4000, not 512.
- **Planner** (`src/views/Planner.jsx`) — same model at `effort: "medium"`, `max_tokens: 8000`.

The photo is a **prefill and nothing more**. Every failure path — no key, offline, unreadable, refusal, garbage JSON — ends with the review sheet open and the amount focused. Base64 lives in a `useRef` and never enters persisted state; one photo would eat a fifth of the localStorage budget.

The entry sheet has two amount inputs on purpose: a real `<input>` on desktop, and a display + custom keypad at `≤899px`. The keypad is why phone logging needs no OS keyboard (and can't trigger iOS zoom); both bind to the same draft state, and a late-arriving receipt read never overwrites an amount the person has started typing.

Correcting the envelope in the review sheet is what teaches `state.merchantMap`. Same code path, no extra tap.

## Tests

There's no runner installed, but the engines are pure and exact. Before changing any of them, run the sanity script against known values — month-one interest, the per-person Social Security wage base, the bill/envelope de-dup, the negative-amortization flag. Money math with no verification is the failure mode.

## Known gaps (in rough priority order)

1. **Single-browser storage.** Both partners can't use it. This is the big one — see `docs/roadmap.md`.
2. **Manual transaction entry.** A receipt photo fills the form in; there's still no bank feed.
3. **The API route is unauthenticated.** `api/anthropic/[...path].js` keeps the key off the client, and only forwards `v1/messages` so it isn't a general-purpose passthrough — but anyone who finds the deployed URL can spend your tokens. It needs a rate limit and a session check once Phase 1 puts real accounts behind it.
4. **No test runner.** The engines deserve Vitest; the sanity script is a stopgap.
5. Net worth is a live snapshot, not a tracked series. There's no history to chart yet.
6. Tax constants are the published 2026 figures in `TAX_TABLES`, overridable per household via `state.tax.constants`. They change every January and nothing reminds you but a note in the UI.

## Non-goals

Investment advice or projections, **tax filing or tax advice**, credit scores, multi-currency, more than two partners.

The tax engine is deliberately on the near side of that line: it estimates **what to hold back from a 1099 cheque**, which is cash-flow planning. It does not compute what you owe on a return, and it says so on the card, in Settings, and in the planner snapshot. Keep that distinction if you extend it.

## Voice

The app talks like a planner who knows them, not a dashboard: one plain sentence about the state of the month, specific numbers, no exclamation marks, no gamification, no "You've got this!". The headline sentence, the planner notes, and each engine's `sentence` are generated in `model()` and `engines.js` — match that register when you add copy.
