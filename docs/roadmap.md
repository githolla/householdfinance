# Roadmap

## Phase 1 — Make it two-person (the blocker)

Right now the data lives in one browser profile, which defeats the premise. Supabase:

- `households` (id, name, split_rule)
- `household_members` (household_id, user_id, partner_slot 'a'|'b', display_name, monthly_income)
- `months` (household_id, month_key) with `envelopes` and `entries` as child tables, not JSON —
  the current blob shape is a prototype artefact, and per-month envelope ids should become
  stable envelope ids with per-month planned amounts
- `goals`, `accounts`, `bills`, `planner_messages`

RLS on every table: a row is visible if `auth.uid()` is a member of its household. Realtime
subscription on the month tables so one partner's logged spending appears on the other's screen.

Keep `window.storage` as the seam — write a Supabase-backed implementation of the same four
methods first to get multi-device working, then normalise the schema properly. Don't do both at once.

## Phase 2 — Stop typing in transactions

Plaid Link for account connection, transaction sync, and balance refresh (which also gives net
worth a real history to chart). Auto-categorisation maps merchant → envelope; every match stays
editable, and a wrong guess must be one tap to fix.

## Phase 3 — Planner as a real service

Move the Anthropic call to a backend route. Give the planner tool access rather than a JSON blob
in the system prompt, so it can pull a specific month, recompute a scenario, or propose a budget
change the user can accept with one tap. Persist conversations per household.

## Phase 4 — The things that make people keep using it

- Net worth history and a monthly close ritual ("here's how last month actually went")
- Shared-cost settle-up: who owes whom this month under the split rule
- Sinking funds for irregular bills (insurance, car registration)
- Mobile layout pass — it's responsive, but it isn't designed for the phone yet

## Deliberately not doing

Investment recommendations, tax filing, credit monitoring, budgeting for more than two people.
