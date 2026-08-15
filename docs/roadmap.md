# Roadmap

## Phase 1 — Make it two-person (the blocker)

Right now the data lives in one browser profile, which defeats the premise. Supabase:

- `households` (id, name, split_rule)
- `household_members` (household_id, user_id, partner_slot 'a'|'b', display_name, monthly_income)
- `months` (household_id, month_key) with `envelopes` and `entries` as child tables, not JSON —
  the current blob shape is a prototype artefact, and per-month envelope ids should become
  stable envelope ids with per-month planned amounts
- `goals`, `accounts`, `bills`, `tax_config`, `tax_payments`, `merchant_map`, `planner_messages`

RLS on every table: a row is visible if `auth.uid()` is a member of its household. Realtime
subscription on the month tables so one partner's logged spending appears on the other's screen.

Keep `window.storage` as the seam — write a Supabase-backed implementation of the same four
methods first to get multi-device working, then normalise the schema properly. Don't do both at once.

`ui.defaultWho` should become genuinely per-device at that point rather than riding in the shared blob.

## Phase 2 — A real backend route for the AI calls

The dev proxy now has two consumers: the planner, and receipt reading, which posts ~300KB images.
Both need a server route that holds the key. Do this before Phase 3 and before anyone deploys.

While you're there: receipt reading is the one call where latency is felt. Streaming won't help
(the response is a small JSON object), but moving the image resize to a worker would.

## Phase 3 — Stop typing in transactions

Plaid Link for account connection, transaction sync, and balance refresh (which also gives net
worth a real history to chart). Auto-categorisation maps merchant → envelope; `merchantMap` is
already the right shape to seed it. Every match stays editable, and a wrong guess must be one tap to fix.

## Phase 4 — Planner as a real service

Give the planner tool access rather than a JSON blob in the system prompt, so it can pull a
specific month, recompute a scenario, or propose a budget change the user can accept with one tap.
Persist conversations per household.

## Phase 5 — The things that make people keep using it

- Net worth history and a monthly close ritual ("here's how last month actually went")
- Shared-cost settle-up: who owes whom this month under the split rule
- Sinking funds for irregular bills (insurance, car registration)
- A tax-constants refresh each January, ideally prompted rather than remembered
- ~~Mobile layout pass~~ — done: bottom tab bar, quick-add sheet, safe-area handling,
  16px input floor, 44px targets, a phone-first dashboard ordered by what's actionable

## Tests

`engines.js` is pure and its expected values are exact — month-one interest, the per-person
Social Security wage base, bill/envelope de-dup, negative-amortization detection. Install Vitest
and port the sanity script; this is the code where being quietly wrong costs real money.

## Deliberately not doing

Investment recommendations, credit monitoring, budgeting for more than two people, and
**tax filing or tax advice**.

The tax engine sits deliberately on the near side of that last line. It answers "how much of this
cheque isn't mine" — cash-flow planning for people whose income arrives without withholding. It
does not compute what you owe on a return, does not file anything, and says so on the card, in
Settings, and in the planner's system prompt. If you extend it, keep it on that side.
