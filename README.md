# Couple Finance

Shared money for two people on 1099 income: budget, spending, bills, goals, debt payoff, a tax
set-aside, net worth, reports, and an AI planner that answers with the household's own numbers.

```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY for the planner and receipt reading
npm run dev
```

Open http://localhost:5173 and choose **Click through a sample household** to load six months of
generated history, or set up a real one. Data persists in localStorage; **Start clean** wipes it.

## What it does

- **Log spending in about five taps.** A quick-add button on every screen, or snap a receipt and
  Claude reads the merchant, total, date and line items — then you confirm. Correcting the envelope
  teaches it that shop for next time. The photo is only ever a prefill; you can always just type.
- **Where every dollar goes.** Income falls through a waterfall you order yourself — tithe, tax
  reserve, bills, essentials, emergency fund, extra on debt, goals — and whatever's left is
  spending money, split between you.
- **Get out of debt on purpose.** A real month-by-month simulation with each cleared payment
  rolling into the next, highest-rate against smallest-balance compared in plain language, and an
  honest answer when the minimums don't cover the interest.
- **Hold back the right amount for taxes.** Self-employment tax, federal brackets, QBI, an optional
  state rate, the four quarterly dates, and whether you're ahead or behind right now.
- **Pay a bill from the app.** Each bill can carry the link you actually pay it on.

Built for the phone first — bottom tab bar, thumb-reachable quick-add, safe-area aware — and it
still opens as a full dashboard on a desktop.

## Deploying

The Anthropic key is held server-side in two places: `vite.config.js` for `npm run dev`,
and `api/anthropic/[...path].js` for the deployed site. Vite's proxy does not survive a
build, so the serverless function is what makes receipt reading and the planner work in
production.

On Vercel, set **`ANTHROPIC_API_KEY`** in Project → Settings → Environment Variables, then
redeploy so the function picks it up. Without it the app still runs — budget, bills, debt,
taxes and the waterfall are all local arithmetic — and only the two AI features report that
they can't reach the reader.

Do **not** name it `VITE_ANTHROPIC_API_KEY`. Anything prefixed `VITE_` is compiled into the
browser bundle and is readable by anyone who opens devtools.

The route is unauthenticated — it only forwards `v1/messages`, but anyone with the URL can
spend your tokens. Fine for a two-person app on an unadvertised URL; put auth in front of it
before it goes anywhere public.

## Not what it does

Investment advice, credit monitoring, more than two people, and **tax filing or tax advice**. The
tax numbers estimate what to hold back from a 1099 cheque. They are not a return, and anything
unusual belongs with someone licensed.

Working on this with Claude Code? Start with `CLAUDE.md`.
