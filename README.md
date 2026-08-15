# Couple Finance

Shared money for two people: budget, spending, bills, goals, net worth, reports, and an AI planner
that answers with the household's own numbers.

```bash
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY to enable the planner panel
npm run dev
```

Open http://localhost:5173 and choose **Click through a sample household** to load six months of
generated history, or set up a real one. Data persists in localStorage; **Start clean** in the
sidebar wipes it.

Working on this with Claude Code? Start with `CLAUDE.md`.
