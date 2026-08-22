# CLAUDE.md

Read this before touching anything. Keep it current — if you change the architecture, change this file in the same commit.

## What this is

A shared-finances app for a couple: budget, spending, bills, goals, net worth, reports, and an AI planner panel that answers with the household's own numbers. It was prototyped as a single Claude artifact and lifted into Vite. Everything works today; nothing is mocked except the data source.

## Stack

Vite + React 18 (JSX, not TS yet) · recharts · plain CSS in a template literal · localStorage via a shim.
No Tailwind, no component library, no router. Don't add any without being asked.

```
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY for the planner panel
npm run dev               # localhost:5173
```

## File map

```
src/App.jsx      the entire app — ~1,900 lines, default export
src/main.jsx     mounts App, imports the storage shim first
src/storage.js   window.storage backed by localStorage (see contract in the file)
src/scripture.js verse list (World English Bible, public domain) + deterministic daily pick
vite.config.js   dev proxy that attaches the Anthropic key server-side
docs/            data model + roadmap
```

`App.jsx` is organised in labelled sections, top to bottom: helpers → demo-data generator → CSS → `App` (shell, nav, persistence) → `model()` → shared components → nine view components → `Setup`.

## The one thing that matters architecturally

**`model(state, plan, month)` is the whole computation layer.** Every derived number in the app — totals, per-envelope spend, goal projections, debt payoff simulation, planner notes, the headline sentence, the fair-split read — is computed there and passed down as `m`. View components render; they don't calculate.

Keep it that way. If you need a new number, add it to `model()` and read it off `m`. Do not compute totals inside a view.

## State shape

Single object, persisted as one JSON blob under `twocolumn:v2`, debounced 450ms. See `docs/data-model.md`.

Two rules that will bite you:
- **Months are lazy.** `state.months[month]` may not exist. The `plan` memo falls back to cloning last month's envelopes with fresh ids. It only gets written when the user edits. Always mutate months through `writeMonth()`, never `patch()` directly.
- **Envelope ids are per-month.** The same envelope in March and April has different ids. Cross-month matching is by `name` (see "Match last month's actuals"). Any feature that reasons across months has to account for this.

`patch(fn)` deep-clones state, applies `fn`, sets. Fine at this data size; revisit if a household ever has thousands of transactions.

## Conventions

- Money is stored as plain numbers, formatted at the edge with `money()`. Never format for storage.
- Month keys are `"YYYY-MM"` strings. Use `shiftMonth`, `monthsBetween`, `monthLabel` — never do date math inline.
- `owner` is `"a" | "b" | "joint"` everywhere (envelopes, entries, bills, accounts). Resolve with `m.ownerName()` / `m.ownerColor()`.
- All user input goes through `num()`, which strips currency formatting and never returns NaN.
- Colours live in the `C` object and the CSS variables — pine `#2E6F63` is partner A, iris `#6B5CA5` is partner B, brass `#B9862B` is shared/goals, rust `#A93E2F` is the only alarm colour. Don't introduce new hues.
- Type: Fraunces (headings, numbers-as-statements), Karla (UI), IBM Plex Mono (all figures, tabular). Loaded via `@import` in the CSS string.
- No `<form>` elements — click handlers and Enter keydowns only. Carried over from the artifact; harmless to keep.

## The stewardship layer

Optional biblical layer, on by default, toggled off via `state.faith.enabled` (absent = on; read it through `m.faithOn`, never directly). What it is:

- **Daily bread card** on the dashboard: one verse a day, deterministic by calendar date (`verseForDay` in `src/scripture.js`) so both partners see the same verse. `model()` picks the verse's *theme* from the shape of the month — over plan → contentment, over-planned → planning, heavy debt ratio → debt, no giving set aside → giving — otherwise it rotates. The `verseLine` under it ties the verse to their real numbers.
- **Giving numbers** (`m.giving`) come from envelopes in the existing `Giving` group — that group is the hook; don't invent a parallel structure.
- **Planner** gets today's verse + giving stats in the snapshot and may frame advice as stewardship when it fits; its prompt forbids preaching, guilt, and using scripture to settle a disagreement.

Verses are WEB (public domain). Add verses to `scripture.js` with a theme tag; never quote copyrighted translations (NIV, ESV, etc.). The voice rule below applies doubly here: the app observes, it never sermonises.

## Voice

The app talks like a planner who knows them, not a dashboard: one plain sentence about the state of the month, specific numbers, no exclamation marks, no gamification, no "You've got this!". The headline sentence and planner notes are generated in `model()` — match that register when you add copy.

## Known gaps (in rough priority order)

1. **Single-browser storage.** Both partners can't use it. This is the big one — see `docs/roadmap.md`.
2. **Manual transaction entry.** No bank feed.
3. **API key exposure.** The dev proxy is dev-only. The planner needs a real backend route before this is deployed anywhere.
4. **No tests.** No test runner installed.
5. `App.jsx` is one file. Split it when it starts hurting, not before — and split by view, keeping `model()` and the shared components together.
6. Net worth is a live snapshot, not a tracked series. There's no history to chart yet.

## Non-goals

Investment advice or projections, tax logic, credit scores, multi-currency, more than two partners.
