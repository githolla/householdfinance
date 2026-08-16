/* ==================================================================
   seed data, the sample household, and schema normalisation

   Months are lazy: state.months[key] may not exist. blankMonth() is what
   the `plan` memo falls back to. Envelope ids are per-month — the same
   envelope in March and April has different ids, so anything reasoning
   across months matches by `name`.
   ================================================================== */

import { uid, monthKey, shiftMonth, num } from "./format.js";
import { DEFAULT_TAX, DEFAULT_WATERFALL } from "./engines.js";

/* ---- the envelopes a 1099 household starts with ---- */

export const seedEnvelopes = (aName = "Partner A", bName = "Partner B") => [
  { id: uid(), name: "Rent / mortgage", group: "Home", planned: 0, owner: "joint", essential: true },
  { id: uid(), name: "Utilities", group: "Home", planned: 0, owner: "joint", essential: true },
  { id: uid(), name: "Groceries", group: "Daily", planned: 0, owner: "joint", essential: true },
  { id: uid(), name: "Transport", group: "Daily", planned: 0, owner: "joint", essential: true },
  { id: uid(), name: "Health", group: "Health", planned: 0, owner: "joint", essential: true },
  { id: uid(), name: "Tithe", group: "Giving", planned: 0, owner: "joint", essential: true, role: "tithe" },
  { id: uid(), name: "Taxes (1099)", group: "Other", planned: 0, owner: "joint", essential: true, role: "tax" },
  { id: uid(), name: "Eating out", group: "Lifestyle", planned: 0, owner: "joint" },
  { id: uid(), name: "Subscriptions", group: "Lifestyle", planned: 0, owner: "joint" },
  { id: uid(), name: `${aName}'s spending`, group: "Other", planned: 0, owner: "a", role: "spending" },
  { id: uid(), name: `${bName}'s spending`, group: "Other", planned: 0, owner: "b", role: "spending" },
  { id: uid(), name: "Everything else", group: "Other", planned: 0, owner: "joint" },
];

export const blankMonth = (prev, aName, bName) => ({
  envelopes: prev ? prev.envelopes.map((e) => ({ ...e, id: uid() })) : seedEnvelopes(aName, bName),
  entries: [],
  paid: [],
});

/* ---- fresh household ---- */

export function newState({ name, aName, bName, aIncome, bIncome, aGross, bGross }) {
  const cur = monthKey(new Date());
  const emergencyId = uid();
  return {
    v: 3,
    household: {
      name: name || `${aName} & ${bName}`,
      splitRule: "proportional",
      partners: [
        { id: "a", name: aName, income: num(aIncome) },
        { id: "b", name: bName, income: num(bIncome) },
      ],
    },
    tax: {
      ...DEFAULT_TAX,
      partners: {
        a: { ...DEFAULT_TAX.partners.a, gross1099: num(aGross) },
        b: { ...DEFAULT_TAX.partners.b, gross1099: num(bGross) },
      },
    },
    waterfall: { ...DEFAULT_WATERFALL, emergencyGoalId: emergencyId },
    ui: { defaultWho: "joint" },
    months: { [cur]: blankMonth(null, aName, bName) },
    goals: [
      { id: emergencyId, name: "Emergency fund", target: 0, saved: 0, monthly: 0, due: "", owner: "joint", role: "emergency" },
      { id: uid(), name: "Travel", target: 0, saved: 0, monthly: 0, due: "", owner: "joint", role: "travel" },
    ],
    accounts: [],
    bills: [],
    merchantMap: {},
    rules: [],
    meeting: { key: "", briefing: "", votes: { a: null, b: null } },
    faith: { enabled: true },
    decisions: [],
    enough: { note: "" },
    chat: [],
  };
}

/* ---- sample household, for clicking through without setting anything up ---- */

const NOTE_POOL = {
  "Rent": ["Rent"],
  "Utilities": ["Electric", "Internet", "Gas", "Water"],
  "Groceries": ["Weekly shop", "Farmers market", "Warehouse run", "Corner store", "Produce"],
  "Transport": ["Gas", "Transit pass", "Parking", "Oil change", "Car wash"],
  "Eating out": ["Thai place", "Coffee", "Brunch", "Pizza night", "Date night", "Takeout"],
  "Subscriptions": ["Streaming", "Music", "Cloud storage", "News"],
  "Health": ["Pharmacy", "Copay", "Dentist", "Contacts"],
  "Tithe": ["Church", "Monthly giving"],
  "Taxes (1099)": ["Quarterly set-aside"],
  "Debt payments": ["Car loan", "Credit card"],
  "Everything else": ["Household", "Gift", "Repairs", "Pet supplies", "Haircut"],
};
const PERSONAL_NOTES = ["Books", "Hobby stuff", "Clothes", "Coffee", "Concert", "Gear"];

export function demoState() {
  const A = "Yvette", B = "Josh";
  const defs = [
    { name: "Rent", group: "Home", planned: 2150, owner: "joint", n: 1, essential: true },
    { name: "Utilities", group: "Home", planned: 265, owner: "joint", n: 3, essential: true },
    { name: "Groceries", group: "Daily", planned: 780, owner: "joint", n: 6, essential: true },
    { name: "Transport", group: "Daily", planned: 420, owner: "joint", n: 4, essential: true },
    { name: "Health", group: "Health", planned: 220, owner: "joint", n: 2, essential: true },
    { name: "Tithe", group: "Giving", planned: 800, owner: "joint", n: 1, essential: true, role: "tithe" },
    { name: "Taxes (1099)", group: "Other", planned: 1750, owner: "joint", n: 1, essential: true, role: "tax" },
    { name: "Debt payments", group: "Home", planned: 505, owner: "joint", n: 2, essential: true },
    { name: "Eating out", group: "Lifestyle", planned: 340, owner: "joint", n: 6 },
    { name: "Subscriptions", group: "Lifestyle", planned: 120, owner: "joint", n: 3 },
    { name: `${A}'s spending`, group: "Other", planned: 250, owner: "a", n: 4, role: "spending" },
    { name: `${B}'s spending`, group: "Other", planned: 250, owner: "b", n: 4, role: "spending" },
    { name: "Everything else", group: "Other", planned: 240, owner: "joint", n: 3 },
  ];

  const today = new Date();
  const cur = monthKey(today);
  const dayNow = today.getDate();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  /* The fixed outflows land on their real days, not random ones — the
     calendar and the versus-normal pace read both depend on that. */
  const FIXED_DAY = { Rent: 1, Tithe: 3, "Taxes (1099)": 5, "Debt payments": 15 };
  const months = {};

  for (let i = 5; i >= 0; i--) {
    const k = shiftMonth(cur, -i);
    const [yy, mm] = k.split("-").map(Number);
    const lastDay = i === 0 ? Math.max(dayNow, 3) : new Date(yy, mm, 0).getDate();
    const envelopes = defs.map((d) => ({
      id: uid(), name: d.name, group: d.group, planned: d.planned, owner: d.owner,
      ...(d.essential ? { essential: true } : {}), ...(d.role ? { role: d.role } : {}),
    }));
    const entries = [];

    envelopes.forEach((e, idx) => {
      const def = defs[idx];
      const progress = i === 0 ? Math.min(1, dayNow / 30) : 1;
      let target = e.planned * progress * (0.86 + Math.random() * 0.26);
      if (e.name === "Eating out") target *= i === 0 ? 1.4 : 1.05;
      if (FIXED_DAY[e.name] !== undefined)
        target = e.planned * (i === 0 && dayNow < FIXED_DAY[e.name] ? 0 : 1);
      if (target < 5) return;
      const count = Math.max(1, Math.round(def.n * progress));
      let left = target;
      for (let c = 0; c < count; c++) {
        const amt = c === count - 1 ? left : Math.round((left / (count - c)) * (0.6 + Math.random() * 0.8));
        if (amt <= 0) continue;
        left -= amt;
        const d = FIXED_DAY[e.name] !== undefined
          ? Math.min(FIXED_DAY[e.name], lastDay)
          : Math.max(1, Math.min(lastDay, Math.ceil(Math.random() * lastDay)));
        const note = def.owner === "joint"
          ? pick(NOTE_POOL[e.name] || ["Spending"])
          : pick(PERSONAL_NOTES);
        entries.push({
          id: uid(), envId: e.id, amount: Math.round(amt),
          who: def.owner === "joint" ? pick(["joint", "joint", "a", "b"]) : def.owner,
          note, day: d,
          date: new Date(yy, mm - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
      }
    });

    entries.sort((x, y) => y.day - x.day);
    months[k] = { envelopes, entries, paid: [] };
  }

  const bills = [
    { id: uid(), name: "Rent", amount: 2150, day: 1, envId: "", owner: "joint", payUrl: "" },
    { id: uid(), name: "Internet", amount: 80, day: 8, envId: "", owner: "joint", payUrl: "https://www.xfinity.com/bill" },
    { id: uid(), name: "Electric", amount: 145, day: 12, envId: "", owner: "joint", payUrl: "" },
    { id: uid(), name: "Car loan", amount: 385, day: 15, envId: "", owner: "joint", payUrl: "" },
    { id: uid(), name: "Phone plan", amount: 110, day: 20, envId: "", owner: "joint", payUrl: "" },
    { id: uid(), name: "Streaming bundle", amount: 62, day: 24, envId: "", owner: "joint", payUrl: "" },
  ];
  const envIdFor = (name) => {
    const e = months[cur].envelopes.find((x) => x.name === name);
    return e ? e.id : "";
  };
  const billEnv = {
    "Rent": "Rent", "Internet": "Utilities", "Electric": "Utilities",
    "Car loan": "Debt payments", "Phone plan": "Utilities", "Streaming bundle": "Subscriptions",
  };
  bills.forEach((b) => { b.envId = envIdFor(billEnv[b.name]); });
  months[cur].paid = bills.filter((b) => b.day < dayNow - 1).map((b) => b.id);

  const emergencyId = uid();
  const year = today.getFullYear();

  return {
    v: 3,
    demo: true,
    household: {
      name: "The Kitchen Table Fund",
      splitRule: "proportional",
      /* 1099 take-home is the gross billing — nobody withholds for them — so
         these line up with the $117k of billings in the tax block below. */
      partners: [{ id: "a", name: A, income: 5400 }, { id: "b", name: B, income: 4800 }],
    },
    tax: {
      ...DEFAULT_TAX,
      year,
      partners: {
        a: { ...DEFAULT_TAX.partners.a, gross1099: 62000, businessExpenses: 4200 },
        b: { ...DEFAULT_TAX.partners.b, gross1099: 55000, businessExpenses: 3000 },
      },
      priorYearTax: 19800,
      priorYearAgi: 104000,
      payments: [
        { id: uid(), date: `${year}-04-14`, amount: 4600, kind: "paid", quarter: "Q1", note: "EFTPS" },
        { id: uid(), date: `${year}-06-13`, amount: 4600, kind: "paid", quarter: "Q2", note: "EFTPS" },
      ],
    },
    waterfall: { ...DEFAULT_WATERFALL, emergencyGoalId: emergencyId, debtExtra: 200 },
    ui: { defaultWho: "joint" },
    months,
    goals: [
      { id: emergencyId, name: "Emergency fund", target: 21000, saved: 6800, monthly: 900, due: "", owner: "joint", role: "emergency" },
      { id: uid(), name: "Japan, next spring", target: 6000, saved: 2150, monthly: 500, due: shiftMonth(cur, 7), owner: "joint", role: "travel" },
      { id: uid(), name: "Replace the car", target: 9000, saved: 1200, monthly: 350, due: shiftMonth(cur, 14), owner: "joint" },
    ],
    accounts: [
      { id: uid(), name: "Joint checking", type: "cash", balance: 4820, owner: "joint", apr: 0, minPayment: 0 },
      { id: uid(), name: "Emergency savings", type: "cash", balance: 6800, owner: "joint", apr: 0, minPayment: 0 },
      { id: uid(), name: "Tax reserve", type: "cash", balance: 9200, owner: "joint", apr: 0, minPayment: 0 },
      { id: uid(), name: `${A}'s SEP IRA`, type: "invest", balance: 41200, owner: "a", apr: 0, minPayment: 0 },
      { id: uid(), name: `${B}'s Roth IRA`, type: "invest", balance: 18400, owner: "b", apr: 0, minPayment: 0 },
      { id: uid(), name: "Car loan", type: "debt", balance: 12400, owner: "joint", apr: 5.9, minPayment: 385 },
      { id: uid(), name: "Credit card", type: "debt", balance: 3850, owner: "joint", apr: 22.9, minPayment: 120 },
    ],
    bills,
    merchantMap: {},
    rules: [
      { id: uid(), text: "Each of us gets our spending money, no questions asked" },
      { id: uid(), text: "Pay the credit card down every month, never just the minimum" },
      { id: uid(), text: "Keep checking above $2,000" },
      { id: uid(), text: "Flag it if eating out passes $350 in a month" },
    ],
    meeting: { key: "", briefing: "", votes: { a: null, b: null } },
    faith: { enabled: true },
    decisions: [],
    enough: {
      note: "Enough for us: the emergency fund full, taxes always set aside, and 15% going somewhere that matters. Past that, money is for giving and living, not stacking.",
    },
    chat: [],
  };
}

/* ---- normalisation ------------------------------------------------
   Applied once at load, and to anything Setup or the demo produces, so
   model() can assume the keys exist. Deep-merges — never overwrites a
   value the household already set.
   ------------------------------------------------------------------ */

const ESSENTIAL_WORDS = ["rent", "mortgage", "utilities", "groceries", "transport", "health", "tithe", "tax", "debt", "insurance"];

const roleFor = (name) => {
  const n = (name || "").toLowerCase();
  if (n.includes("tithe")) return "tithe";
  if (n.includes("tax")) return "tax";
  if (n.includes("spending")) return "spending";
  return undefined;
};

export function withDefaults(s) {
  if (!s) return s;
  const goals = (s.goals || []).map((g) => ({
    ...g,
    role: g.role || ((g.name || "").toLowerCase().includes("emergency") ? "emergency"
      : (g.name || "").toLowerCase().includes("travel") ? "travel" : undefined),
  }));
  const emergency = goals.find((g) => g.role === "emergency");

  return {
    ...s,
    v: 3,
    household: { splitRule: "proportional", ...s.household },
    tax: {
      ...DEFAULT_TAX,
      ...(s.tax || {}),
      partners: {
        a: { ...DEFAULT_TAX.partners.a, ...((s.tax && s.tax.partners && s.tax.partners.a) || {}) },
        b: { ...DEFAULT_TAX.partners.b, ...((s.tax && s.tax.partners && s.tax.partners.b) || {}) },
      },
      payments: (s.tax && s.tax.payments) || [],
      constants: (s.tax && s.tax.constants) || {},
    },
    waterfall: {
      ...DEFAULT_WATERFALL,
      emergencyGoalId: emergency ? emergency.id : "",
      ...(s.waterfall || {}),
    },
    ui: { defaultWho: "joint", ...(s.ui || {}) },
    months: Object.fromEntries(
      Object.entries(s.months || {}).map(([k, mm]) => [
        k,
        {
          ...mm,
          envelopes: (mm.envelopes || []).map((e) => ({
            ...e,
            role: e.role || roleFor(e.name),
            essential: e.essential !== undefined
              ? e.essential
              : ESSENTIAL_WORDS.some((w) => (e.name || "").toLowerCase().includes(w)),
          })),
          entries: mm.entries || [],
          paid: mm.paid || [],
        },
      ])
    ),
    goals,
    accounts: s.accounts || [],
    bills: (s.bills || []).map((b) => ({ ...b, payUrl: b.payUrl || "" })),
    merchantMap: s.merchantMap || {},
    rules: Array.isArray(s.rules) ? s.rules : [],
    meeting: { key: "", briefing: "", votes: { a: null, b: null }, ...(s.meeting || {}) },
    faith: { enabled: true, ...(s.faith || {}) },
    decisions: Array.isArray(s.decisions) ? s.decisions : [],
    enough: { note: "", ...(s.enough || {}) },
    chat: s.chat || [],
  };
}

/** The v1 artefact schema, brought forward. */
export function upgradeV1(v1) {
  return withDefaults({
    household: { ...v1.household, splitRule: "proportional" },
    months: Object.fromEntries(
      Object.entries(v1.months || {}).map(([k, v]) => [
        k,
        {
          envelopes: (v.envelopes || []).map((e) => ({ ...e, group: e.group || "Other" })),
          entries: v.entries || [],
          paid: [],
        },
      ])
    ),
    goals: (v1.goals || []).map((g) => ({ ...g, owner: "joint" })),
    accounts: [],
    bills: [],
    chat: v1.chat || [],
  });
}
