# CLAUDE.md

Read this before touching anything. Keep it current — if you change the architecture, change this file in the same commit.

## What this is

A shared-finances app for a couple: budget, spending, bills, goals, net worth, reports, and an AI planner panel that answers with the household's own numbers. It was prototyped as a single Claude artifact and lifted into Vite. Everything works today; nothing is mocked except the data source.

## Stack

Vite + React 18 (JSX, not TS yet) · recharts · plain CSS in a template literal · localStorage via a shim · xlsx (SheetJS) and mammoth extract spreadsheet/Word text client-side in the Files view.
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
api/anthropic/v1/messages.js  the same proxy as a Vercel serverless function (needs ANTHROPIC_API_KEY env var in Vercel)
docs/            data model + roadmap
```

`App.jsx` is organised in labelled sections, top to bottom: helpers → demo-data generator → CSS → `App` (shell, nav, persistence) → `model()` → shared components (including `Concierge`, the AI omnibar mounted atop Overview, Budget, and Spending with per-page suggestion chips — one sentence logs spending, sets up a bill or income, runs `find …` local search, or falls through to a planner-brain answer shown inline and appended to the Assistant chat; local regex fallback when the AI route is unreachable; pasting a multi-line "Name — $Amount" list opens a bulk review. `buildSnapshot`/`buildPlannerSystem`/`searchEverything` are the shared brain between the omnibar and `PlannerPage`) → nine view components → `Setup`. `FilesSection` — the household's searchable paper drawer — renders inside the Bills view (`state.docs`, capped at 100k chars per doc): uploads are extracted to text on-device — SheetJS for spreadsheets/CSV, mammoth for .docx, plain read for everything else — and each doc can be sent to the AI for a stored "planner's read" (`doc.analysis`).

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
- Colours live in the `C` object and the CSS variables. The theme is light, warm, and editorial — printed-ledger paper, not a SaaS dashboard: paper ground `#EAE5D8`, cream cards `#F7F4EC` with 1.5px `#D8D1BF` borders (row separators stay 1px), ink `#16201D`, deep drop shadow cut low (`--shadow`). No accent colour — focus rings, links, and active states are ink; active nav is an ink pill with paper text. Deep teal `#0F6B60` is partner A, burnt amber `#B0670A` partner B, indigo `#3D4A8F` shared/goals, `#B93318` the only alarm, `#4C7A34` the good green (giving, celebrations, "up"). `GROUP_COLORS` runs the mockup families — teals for essentials (Home/Daily/Health), ambers for discretionary (Lifestyle/Other), green for Giving — and paints the allocation rail, which clusters segments by group with in-segment `%` labels and a red-striped unassigned tail.
- Type: Instrument Sans (body), Bricolage Grotesque 800 (h1–h3/`.serif`, thesis, tight `-.02em`), IBM Plex Mono for every figure (`.num`, KPI values, `bignum`), all eyebrows/labels (mono 9.5–10px, 600, `.12–.16em` tracking, uppercase), and all buttons (`.btn` is mono uppercase 11px on ink). Loaded via `@import` in the CSS string.
- The shell is a cream left sidebar on desktop (grouped nav with inline SVG icons from `IC`, an unpaid-bills badge, household avatar, and the compact Daily bread card at the bottom) and a fixed bottom icon bar on mobile (≤900px). Page heads sit on a 1.5px ink rule. The Overview opens with the `Concierge` bar (ink-bordered), then the available-to-spend hero card carrying the thesis sentence and the allocation rail. Setup keeps a paper-gradient `.hero` band.
- No `<form>` elements — click handlers and Enter keydowns only. Carried over from the artifact; harmless to keep.

## The stewardship layer

Optional biblical layer, on by default, toggled off via `state.faith.enabled` (absent = on; read it through `m.faithOn`, never directly). What it is:

- **Guidance banners front and center**: every view opens with a `Guidance` banner under its page head — a verse themed to that view (planning on Budget, contentment on Spending, debt on Bills, diligence on Goals, provision on Net worth, together on Reports/Settings, giving on Planner) plus one line tying it to the live numbers. The Overview banner and the sidebar's compact Daily bread card use the day's main verse, deterministic by calendar date (`verseForDay` in `src/scripture.js`) so both partners see the same verse. `model()` picks the verse's *theme* from the shape of the month — over plan → contentment, over-planned → planning, heavy debt ratio → debt, no giving set aside → giving — otherwise it rotates. The `verseLine` under it ties the verse to their real numbers.
- **Giving numbers** (`m.giving`) come from envelopes in the existing `Giving` group — that group is the hook; don't invent a parallel structure. The Overview's Giving card measures the month against `state.faith.givingTarget` (% of income, default 10, set in Settings) and shows year-to-date; `m.giving` carries `target/targetPct/ytd/lastMonth/metTarget`.
- **Milestones** (`m.celebrations`): a debt account reaching zero, the giving target met, or giving beating last month surface a celebration card on the Overview — plain warm copy, real numbers, a fitting verse; "Mark the moment" stores it in `state.milestones`/`milestoneLog` (shown in the Giving card, fed to the planner). Celebrations are the one sanctioned warmth — still no confetti, badges, or streaks.
- **Planner/Assistant** gets today's verse + giving stats in the snapshot and may frame advice as stewardship when it fits; its prompt forbids preaching, guilt, and using scripture to settle a disagreement. The Assistant view (`PlannerPage`) is also the app's chat-upload-search surface: files dropped into the chat are extracted, filed to `state.docs`, and read aloud in-conversation; "find …" messages run an instant local search across docs, bills, entries, goals, and incomes; mic input and a read-replies-aloud toggle round it out.

Verses are WEB (public domain). Add verses to `scripture.js` with a theme tag; never quote copyrighted translations (NIV, ESV, etc.). The voice rule below applies doubly here: the app observes, it never sermonises.

## Voice

The app talks like a planner who knows them, not a dashboard: one plain sentence about the state of the month, specific numbers, no exclamation marks, no gamification, no "You've got this!". The headline sentence and planner notes are generated in `model()` — match that register when you add copy.

## Known gaps (in rough priority order)

1. **Single-browser storage.** Both partners can't use it. This is the big one — see `docs/roadmap.md`.
2. **Manual transaction entry.** No bank feed.
3. **AI on other hosts.** `api/anthropic/v1/messages.js` covers Vercel (set `ANTHROPIC_API_KEY` in project env vars); the app path `/api/anthropic/v1/messages` is served by the Vite proxy in dev. Any other host needs its own equivalent route. The route is public — keep the model allowlist and token cap in it.
4. **No tests.** No test runner installed.
5. `App.jsx` is one file. Split it when it starts hurting, not before — and split by view, keeping `model()` and the shared components together.
6. Net worth is a live snapshot, not a tracked series. There's no history to chart yet.

## Non-goals

Investment advice or projections, tax logic, credit scores, multi-currency, more than two partners.
