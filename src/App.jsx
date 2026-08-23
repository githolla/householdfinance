import { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import * as XLSX from "xlsx";
import mammoth from "mammoth/mammoth.browser";
import { verseForDay, VERSES, studyForDay } from "./scripture.js";

/* ================================================================== */
/*  data + helpers                                                     */
/* ================================================================== */

const API_URL = import.meta.env.VITE_ANTHROPIC_URL || "/api/anthropic/v1/messages";

const KEY = "twocolumn:v2";
const KEY_V1 = "twocolumn:v1";

// Bump on every push — shown in the sidebar so a stale build is obvious.
const APP_VERSION = "v45";

const money = (n, cents) => {
  const v = Number(n) || 0;
  // Cents show whenever they exist ($2,780.56), not only when asked for.
  const dec = cents || Math.abs(v % 1) > 0.004;
  const s = Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: dec ? 2 : 0,
    maximumFractionDigits: dec ? 2 : 0,
  });
  return (v < 0 ? "-$" : "$") + s;
};
const compact = (n) => {
  const v = Math.abs(n);
  if (v >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (v >= 10000) return Math.round(n / 1000) + "k";
  if (v >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(n));
};
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (k, short) => {
  if (!k) return "";
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: short ? "short" : "long",
    year: short ? "2-digit" : "numeric",
  });
};
const shiftMonth = (k, d) => {
  const [y, m] = k.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + d, 1));
};
const monthsBetween = (a, b) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};
const uid = () => Math.random().toString(36).slice(2, 9);
const num = (v) => {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const todayDay = () => new Date().getDate();
const ordinal = (d) => {
  const s = ["th", "st", "nd", "rd"], v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
};

const GROUPS = ["Home", "Daily", "Lifestyle", "Health", "Giving", "Other"];
const GROUP_COLORS = {
  Home: "#0F6B60", Daily: "#2E8579", Lifestyle: "#B0670A",
  Health: "#63ADA3", Giving: "#4C7A34", Other: "#D6A45C",
};

const seedEnvelopes = () => [
  { id: uid(), name: "Rent / mortgage", group: "Home", planned: 0, owner: "joint" },
  { id: uid(), name: "Utilities", group: "Home", planned: 0, owner: "joint" },
  { id: uid(), name: "Groceries", group: "Daily", planned: 0, owner: "joint" },
  { id: uid(), name: "Transport", group: "Daily", planned: 0, owner: "joint" },
  { id: uid(), name: "Eating out", group: "Lifestyle", planned: 0, owner: "joint" },
  { id: uid(), name: "Subscriptions", group: "Lifestyle", planned: 0, owner: "joint" },
  { id: uid(), name: "Health", group: "Health", planned: 0, owner: "joint" },
  { id: uid(), name: "Insurance", group: "Home", planned: 0, owner: "joint" },
  { id: uid(), name: "Credit card", group: "Other", planned: 0, owner: "joint" },
  { id: uid(), name: "Work", group: "Other", planned: 0, owner: "joint" },
  { id: uid(), name: "Giving", group: "Giving", planned: 0, owner: "joint" },
  { id: uid(), name: "Everything else", group: "Other", planned: 0, owner: "joint" },
];

const blankMonth = (prev) => ({
  envelopes: prev ? prev.envelopes.map((e) => ({ ...e, id: uid() })) : seedEnvelopes(),
  entries: [],
  paid: [],
  received: [],
  billAmounts: {},
  paidMeta: {},
});

/* ---- sample household, for clicking through without setting anything up ---- */

const NOTE_POOL = {
  "Rent": ["Rent"],
  "Utilities": ["Electric", "Internet", "Gas", "Water"],
  "Groceries": ["Weekly shop", "Farmers market", "Warehouse run", "Corner store", "Produce"],
  "Transport": ["Gas", "Transit pass", "Parking", "Oil change", "Car wash"],
  "Eating out": ["Thai place", "Coffee", "Brunch", "Pizza night", "Date night", "Takeout"],
  "Subscriptions": ["Streaming", "Music", "Cloud storage", "News"],
  "Health": ["Pharmacy", "Copay", "Dentist", "Contacts"],
  "Giving": ["Tithe", "Local food bank", "Sponsor child", "Church"],
  "Debt payments": ["Car loan", "Credit card"],
  "Everything else": ["Household", "Gift", "Repairs", "Pet supplies", "Haircut"],
};
const PERSONAL_NOTES = ["Books", "Hobby stuff", "Clothes", "Coffee", "Concert", "Gear"];

function demoState() {
  const A = "Alex", B = "Sam";
  const defs = [
    { name: "Rent", group: "Home", planned: 2150, owner: "joint", n: 1 },
    { name: "Utilities", group: "Home", planned: 265, owner: "joint", n: 3 },
    { name: "Groceries", group: "Daily", planned: 780, owner: "joint", n: 6 },
    { name: "Transport", group: "Daily", planned: 420, owner: "joint", n: 4 },
    { name: "Debt payments", group: "Home", planned: 900, owner: "joint", n: 2 },
    { name: "Eating out", group: "Lifestyle", planned: 340, owner: "joint", n: 6 },
    { name: "Subscriptions", group: "Lifestyle", planned: 120, owner: "joint", n: 3 },
    { name: "Health", group: "Health", planned: 220, owner: "joint", n: 2 },
    { name: "Giving", group: "Giving", planned: 400, owner: "joint", n: 2 },
    { name: `${A}'s spending`, group: "Other", planned: 250, owner: "a", n: 4 },
    { name: `${B}'s spending`, group: "Other", planned: 250, owner: "b", n: 4 },
    { name: "Everything else", group: "Other", planned: 155, owner: "joint", n: 3 },
  ];

  const today = new Date();
  const cur = monthKey(today);
  const dayNow = today.getDate();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const months = {};

  for (let i = 5; i >= 0; i--) {
    const k = shiftMonth(cur, -i);
    const [yy, mm] = k.split("-").map(Number);
    const lastDay = i === 0 ? Math.max(dayNow, 3) : new Date(yy, mm, 0).getDate();
    const envelopes = defs.map((d) => ({ id: uid(), name: d.name, group: d.group, planned: d.planned, owner: d.owner }));
    const entries = [];

    envelopes.forEach((e, idx) => {
      const def = defs[idx];
      const progress = i === 0 ? Math.min(1, dayNow / 30) : 1;
      let target = e.planned * progress * (0.86 + Math.random() * 0.26);
      if (e.name === "Eating out") target *= i === 0 ? 1.4 : 1.05;
      if (e.name === "Rent" || e.name === "Debt payments") target = e.planned * (i === 0 && dayNow < 3 ? 0 : 1);
      if (target < 5) return;
      const count = Math.max(1, Math.round(def.n * progress));
      let left = target;
      for (let c = 0; c < count; c++) {
        const amt = c === count - 1 ? left : Math.round((left / (count - c)) * (0.6 + Math.random() * 0.8));
        if (amt <= 0) continue;
        left -= amt;
        const d = Math.max(1, Math.min(lastDay, Math.ceil(Math.random() * lastDay)));
        const note = def.owner === "joint"
          ? pick(NOTE_POOL[e.name] || ["Spending"])
          : pick(PERSONAL_NOTES);
        entries.push({
          id: uid(), envId: e.id, amount: Math.round(amt), who: def.owner === "joint" ? pick(["joint", "joint", "a", "b"]) : def.owner,
          note, day: d,
          date: new Date(yy, mm - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
      }
    });

    entries.sort((x, y) => y.day - x.day);
    months[k] = { envelopes, entries, paid: [], received: [] };
  }

  const bills = [
    { id: uid(), name: "Rent", amount: 2150, day: 1, envId: "", owner: "joint" },
    { id: uid(), name: "Internet", amount: 80, day: 8, envId: "", owner: "joint" },
    { id: uid(), name: "Electric", amount: 145, day: 12, envId: "", owner: "joint" },
    { id: uid(), name: "Car loan", amount: 385, day: 15, envId: "", owner: "joint" },
    { id: uid(), name: "Phone plan", amount: 110, day: 20, envId: "", owner: "joint" },
    { id: uid(), name: "Streaming bundle", amount: 62, day: 24, envId: "", owner: "joint" },
  ];
  const envIdFor = (name) => {
    const e = months[cur].envelopes.find((x) => x.name === name);
    return e ? e.id : "";
  };
  const billEnv = { "Rent": "Rent", "Internet": "Utilities", "Electric": "Utilities", "Car loan": "Debt payments", "Phone plan": "Utilities", "Streaming bundle": "Subscriptions" };
  bills.forEach((b) => { b.envId = envIdFor(billEnv[b.name]); });
  const electric = bills.find((b) => b.name === "Electric");
  Object.keys(months).forEach((k) => {
    months[k].billAmounts = electric
      ? { [electric.id]: Math.round(145 * (0.82 + Math.random() * 0.45)) }
      : {};
  });
  months[cur].paid = bills.filter((b) => b.day < dayNow - 1).map((b) => b.id);
  if (dayNow > 1) months[cur].received.push("payA1");
  if (dayNow > 15) months[cur].received.push("payA2", "payB1");

  return {
    demo: true,
    household: {
      name: "The Kitchen Table Fund",
      splitRule: "proportional",
      partners: [{ id: "a", name: A, income: 4200 }, { id: "b", name: B, income: 3800 }],
    },
    months,
    goals: [
      { id: uid(), name: "Emergency fund", target: 15000, saved: 6800, monthly: 900, due: "", owner: "joint" },
      { id: uid(), name: "Japan, next spring", target: 6000, saved: 2150, monthly: 500, due: shiftMonth(cur, 7), owner: "joint" },
      { id: uid(), name: "Replace the car", target: 9000, saved: 1200, monthly: 350, due: shiftMonth(cur, 14), owner: "joint" },
    ],
    accounts: [
      { id: uid(), name: "Joint checking", type: "cash", balance: 4820, owner: "joint", apr: 0, minPayment: 0 },
      { id: uid(), name: "Emergency savings", type: "cash", balance: 6800, owner: "joint", apr: 0, minPayment: 0 },
      { id: uid(), name: `${A}'s 401(k)`, type: "invest", balance: 41200, owner: "a", apr: 0, minPayment: 0 },
      { id: uid(), name: `${B}'s Roth IRA`, type: "invest", balance: 18400, owner: "b", apr: 0, minPayment: 0 },
      { id: uid(), name: "Car loan", type: "debt", balance: 12400, owner: "joint", apr: 5.9, minPayment: 385 },
      { id: uid(), name: "Credit card", type: "debt", balance: 0, owner: "joint", apr: 22.9, minPayment: 120 },
    ],
    bills,
    incomes: [
      { id: "payA1", pay: true, name: `${A}'s paycheck`, amount: 2100, day: 1, who: "a", recurring: true, month: "", date: "" },
      { id: "payA2", pay: true, name: `${A}'s paycheck`, amount: 2100, day: 15, who: "a", recurring: true, month: "", date: "" },
      { id: "payB1", pay: true, name: `${B}'s paycheck`, amount: 3800, day: 15, who: "b", recurring: true, month: "", date: "" },
      { id: uid(), name: `${A}'s freelance invoice`, amount: 600, day: 25, who: "a", recurring: false, month: cur, date: `${cur}-25` },
    ],
    docs: [
      {
        id: uid(), name: "Car insurance renewal.txt", folder: "Insurance",
        added: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
        text: "Policy 84-7723-A renews Oct 1.\nPremium $1,284/yr ($107/mo) — up $9 from last year.\nDeductible $500 comprehensive / $1,000 collision.\nAgent: Marisol Vega, (555) 014-2210.",
      },
    ],
    chat: [],
  };
}

const NAV_SECTIONS = [
  ["Money", [
    ["dash", "Overview"],
    ["budget", "Budget"],
    ["txn", "Spending"],
    ["bills", "Bills & files"],
    ["goals", "Pots"],
    ["calendar", "Calendar"],
  ]],
  ["Longer view", [
    ["insights", "Insights"],
    ["plan", "Plan ahead"],
    ["worth", "Net worth"],
    ["reports", "Reports"],
    ["planner", "Assistant"],
    ["settings", "Settings"],
  ]],
];
const ALL_NAV = NAV_SECTIONS.flatMap(([, items]) => items);

const IC = {
  dash: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></>,
  budget: <><rect x="2" y="5" width="20" height="15" rx="3" /><path d="M2 10h20" /></>,
  txn: <path d="M4 6h16M4 12h16M4 18h10" />,
  bills: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h4" /></>,
  goals: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /></>,
  plan: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  insights: <><path d="M3 3v18h18" /><path d="M7 14l3-4 3 2 4-6" /><circle cx="20" cy="6" r="1.4" fill="currentColor" stroke="none" /></>,
  upload: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  worth: <path d="M3 20h18M6 16l4-6 4 3 5-8" />,
  reports: <path d="M5 20v-8M12 20V5M19 20v-5" />,
  planner: <path d="M4 5h16v11H9l-5 4z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
};
const Icon = ({ k, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IC[k]}</svg>
);

const C = {
  a: "#0F6B60", b: "#B0670A", joint: "#3D4A8F", warn: "#B93318",
  soft: "#5F6B66", ink: "#16201D", line: "#D8D1BF", good: "#4C7A34",
};
// Darker companions for text at small sizes — the C hues pass as fills
// and borders but fail contrast as 10-11px type on the paper ground.
const CT = { a: "#0C574E", b: "#8F5308", joint: "#333E78" };
const PIE = ["#0F6B60", "#B0670A", "#3D4A8F", "#2E8579", "#D6A45C", "#63ADA3", "#B93318", "#5F6B66"];

/* ================================================================== */
/*  styles                                                             */
/* ================================================================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

body{margin:0;background:#F5F1EA;}
.tc{--paper:#F5F1EA;--surface:#FFFFFF;--ink:#1B2420;--soft:#6B7370;--line:#ECE7DD;
 --a:#0F6B60;--b:#B0670A;--joint:#3D4A8F;--warn:#C0392B;--good:#3F8A3B;--r:16px;
 --acc:#0F6B60;--accsoft:#EAF3F1;--track:#EDE8DE;
 --sidebg:#18211E;--sidetext:rgba(255,255,255,.62);--sideactive:#F5F1EA;
 --goldline:rgba(176,103,10,.4);--goldsoft:rgba(176,103,10,.08);--hair:rgba(27,36,32,.08);
 --shadow:0 1px 2px rgba(27,36,32,.04), 0 10px 30px -24px rgba(27,36,32,.45);
 background:var(--paper);color:var(--ink);font-family:'Instrument Sans',ui-sans-serif,system-ui,sans-serif;
 min-height:100vh;box-sizing:border-box;-webkit-font-smoothing:antialiased;font-size:14px;font-weight:400;}
.tc *,.tc *::before,.tc *::after{box-sizing:border-box;}
.tc .num{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:500;}
.tc h1,.tc h2,.tc h3,.tc .serif{font-family:'Bricolage Grotesque',ui-sans-serif,sans-serif;font-weight:800;letter-spacing:-.02em;margin:0;}
.tc button{font-family:inherit;cursor:pointer;}
.tc :focus-visible{outline:2.5px solid var(--ink);outline-offset:2px;border-radius:4px;}
.tc .gem{display:flex;align-items:center;justify-content:center;font-size:0;line-height:0;}
.tc .gem::before{content:"";height:2px;width:28px;border-radius:2px;background:var(--ink);}
.tc .gem::after{content:none;}

/* shell — sidebar on desktop, bottom icon bar on mobile */
.tc .shell{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100vh;}
.tc .side{background:var(--sidebg);padding:22px 14px;border-radius:0 22px 22px 0;
 position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:16px;overflow-y:auto;}
.tc .mark{display:flex;align-items:center;gap:10px;line-height:1.25;padding:4px 8px 6px;}
.tc .avatar{width:34px;height:34px;border-radius:9px;background:var(--a);color:#fff;flex:none;
 display:grid;place-items:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:15px;}
.tc .mark .nm{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:16px;letter-spacing:-.01em;display:block;color:#fff;}
.tc .mark .who{font-size:11.5px;color:var(--sidetext);}
.tc .navlab{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;
 color:rgba(255,255,255,.38);margin:8px 10px 6px;}
.tc nav{display:flex;flex-direction:column;gap:3px;}
.tc nav button{display:flex;align-items:center;gap:12px;background:none;border:none;border-radius:11px;
 padding:11px 14px;font-size:14px;font-weight:500;color:var(--sidetext);text-align:left;width:100%;
 border-left:3px solid transparent;transition:background .12s,color .12s;}
.tc nav button:hover{background:rgba(255,255,255,.07);color:#fff;}
.tc nav button.on{background:var(--sideactive);color:var(--ink);border-left:3px solid var(--a);font-weight:600;}
.tc nav button svg{flex:none;opacity:.85;}
.tc nav button.on svg{opacity:1;}
.tc .badge{margin-left:auto;background:var(--warn);color:#fff;font-size:10px;font-weight:600;
 font-family:'IBM Plex Mono',monospace;border-radius:999px;padding:1px 6px;line-height:1.5;}
.tc .sidefoot{margin-top:auto;display:flex;flex-direction:column;gap:10px;}
.tc .sideverse{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:13px;}
.tc .sideverse .vt{font-size:12.5px;line-height:1.55;font-style:italic;color:rgba(255,255,255,.8);margin:6px 0 8px;
 display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;}
.tc .sideverse .vr{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#7FC9A9;}
.tc .side .navlab-foot,.tc .side .muted{color:rgba(255,255,255,.45)!important;}
.tc .side .btn.ghost{color:rgba(255,255,255,.82);border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.04);}
.tc .side .btn.ghost:hover{color:#fff;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.09);}
.tc .side .sidefoot .num{color:#fff;}
.tc .main{padding:20px 32px 90px;min-width:0;}
.tc .bottom{display:none;}

/* top app bar */
.tc .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
 padding:6px 0 18px;margin-bottom:6px;border-bottom:1px solid var(--line);}
.tc .tb-hi .tb-lab{font-size:12.5px;color:var(--soft);}
.tc .tb-hi .tb-name{font-family:'Bricolage Grotesque',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-top:1px;}
.tc .tb-actions{display:flex;align-items:center;gap:10px;}
.tc .tb-btn{display:inline-flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);
 border-radius:11px;padding:9px 14px;font-size:13px;font-weight:500;color:var(--ink);box-shadow:var(--shadow);}
.tc .tb-btn:hover{border-color:var(--a);color:var(--a);}
.tc .tb-btn.accent{background:var(--a);border-color:var(--a);color:#fff;}
.tc .tb-btn.accent:hover{background:#0C5A50;color:#fff;}
.tc .tb-avs{display:flex;}
.tc .tb-av{width:36px;height:36px;border-radius:99px;display:grid;place-items:center;color:#fff;font-weight:600;font-size:14px;
 border:2.5px solid var(--paper);}
.tc .tb-av + .tb-av{margin-left:-12px;}
@media(max-width:700px){.tc .tb-btn-t{display:none;}.tc .tb-btn{padding:9px;} .tc .topbar{padding-bottom:14px;}}
@media(max-width:900px){
 .tc .shell{grid-template-columns:1fr;}
 .tc .side{display:none;}
 .tc .main{padding:16px 14px 88px;}
 .tc .bottom{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:30;
  background:rgba(247,244,236,.96);backdrop-filter:blur(12px);border-top:1.5px solid var(--line);
  overflow-x:auto;gap:2px;padding:6px 8px calc(6px + env(safe-area-inset-bottom));}
 .tc .bottom button{flex:1 0 22%;display:flex;flex-direction:column;align-items:center;gap:3px;
  background:none;border:none;font-size:10px;font-weight:500;color:var(--soft);padding:5px 2px;
  border-radius:10px;position:relative;white-space:nowrap;}
 .tc input,.tc select,.tc textarea{font-size:16px;}
 .tc .bottom button.on{color:var(--ink);font-weight:600;}
 .tc .bottom .badge{position:absolute;top:0;right:8px;margin:0;padding:0 5px;font-size:9.5px;}
}

/* modal */
.tc .modal-back{position:fixed;inset:0;z-index:60;background:rgba(27,36,32,.45);backdrop-filter:blur(2px);
 display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px 16px;overflow-y:auto;}
.tc .modal{background:var(--surface);border-radius:18px;box-shadow:0 24px 60px -20px rgba(27,36,32,.5);
 width:100%;max-width:460px;padding:22px 22px 24px;}
.tc .modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;}
.tc .modal-head h3{font-size:20px;font-weight:800;letter-spacing:-.02em;}
.tc .modal-sub{font-size:13px;color:var(--soft);margin:4px 0 0;}
.tc .modal-body{display:flex;flex-direction:column;gap:14px;}
.tc .mfield{display:flex;flex-direction:column;gap:6px;}
.tc .mfield-l{font-size:12.5px;font-weight:600;color:var(--ink);}
.tc .mfield .field{width:100%;}
.tc .mrow{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.tc .modal .btn{width:100%;justify-content:center;padding:12px;font-size:12px;}
.tc .addbtn{display:inline-flex;align-items:center;gap:7px;background:var(--a);color:#fff;border:none;
 border-radius:11px;padding:10px 16px;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;
 letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;box-shadow:var(--shadow);}
.tc .addbtn:hover{background:#0C5A50;}
.tc .addbtn svg{width:15px;height:15px;}
.tc .headactions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}

/* page head */
.tc .phead{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;
 padding-bottom:4px;margin-bottom:20px;}
.tc .phead h1{font-size:28px;letter-spacing:-.02em;font-weight:800;line-height:1.1;}
.tc .phead .sub{font-size:13px;color:var(--soft);margin-top:4px;}
.tc .monthnav{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);
 border-radius:12px;padding:4px 6px;box-shadow:var(--shadow);}
.tc .monthnav .m{font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:.1em;
 text-transform:uppercase;min-width:120px;text-align:center;}
.tc .arrow{background:none;border:none;border-radius:8px;width:28px;height:28px;
 color:var(--ink);font-size:14px;display:grid;place-items:center;line-height:1;}
.tc .arrow:hover{background:var(--accsoft);color:var(--a);}

/* hero + thesis — a paper band */
.tc .hero{position:relative;border-radius:var(--r);overflow:hidden;text-align:center;color:var(--ink);
 padding:38px 28px 34px;margin-bottom:24px;border:1.5px solid var(--line);
 background:linear-gradient(180deg,#F7F4EC,#EFEADF);}
.tc .hero .gem{margin-bottom:16px;}
.tc .thesis{font-family:'Bricolage Grotesque',ui-sans-serif,sans-serif;font-size:clamp(22px,3vw,34px);line-height:1.2;
 letter-spacing:-.02em;max-width:1080px;margin:0 auto;font-weight:800;}
.tc .thesis span{display:block;font-family:'Instrument Sans',sans-serif;font-size:clamp(14px,1.5vw,16px);color:var(--soft);font-weight:400;
 letter-spacing:0;margin-top:10px;}

/* grid + cards */
.tc .grid{display:grid;gap:16px;}
.tc .g2{grid-template-columns:repeat(2,minmax(0,1fr));}
.tc .g3{grid-template-columns:repeat(3,minmax(0,1fr));}
.tc .g4{grid-template-columns:repeat(4,minmax(0,1fr));}
.tc .g23{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);}
@media(max-width:980px){.tc .g23,.tc .g3,.tc .g4{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:620px){.tc .grid{grid-template-columns:minmax(0,1fr)!important;}}
.tc .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:22px;
 box-shadow:var(--shadow);}
.tc .card h3{font-size:16px;letter-spacing:-.01em;font-weight:800;}
.tc .chead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px;}
.tc .chead .meta{font-size:12.5px;color:var(--soft);font-weight:400;}
.tc .chead .seelink{font-size:12.5px;color:var(--soft);font-weight:500;background:none;border:none;
 display:inline-flex;align-items:center;gap:5px;}
.tc .chead .seelink:hover{color:var(--a);}

/* kpi + hero card */
.tc .kpi{padding:20px;}
.tc .kpi .lab,.tc .biglab{font-size:12.5px;letter-spacing:0;text-transform:none;font-weight:500;color:var(--soft);}
.tc .kpi .val{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-weight:600;
 font-size:26px;letter-spacing:-.02em;margin-top:10px;line-height:1.05;word-break:break-word;}
.tc .kpi .foot{font-size:11.5px;color:var(--soft);margin-top:7px;line-height:1.4;}
.tc .kpi.dark{background:var(--ink);border-color:var(--ink);color:#fff;}
.tc .kpi.dark .lab,.tc .kpi.dark .foot{color:rgba(255,255,255,.66);}
.tc .kpi.click{cursor:pointer;text-align:left;width:100%;font-family:inherit;font-size:inherit;color:inherit;
 transition:box-shadow .15s ease,transform .1s ease;position:relative;padding-right:34px;}
.tc .kpi.click::after{content:"→";position:absolute;top:18px;right:18px;font-family:'IBM Plex Mono',monospace;
 font-size:13px;font-weight:600;color:var(--soft);opacity:.45;transition:opacity .12s;}
.tc .kpi.click:hover{box-shadow:0 4px 8px rgba(27,36,32,.06),0 16px 34px -20px rgba(27,36,32,.5);}
.tc .kpi.click:hover::after{opacity:1;color:var(--a);}
.tc .kpi.dark.click:hover::after{color:#7FC9A9;}
.tc .kpi.click.on{box-shadow:0 0 0 2px var(--a);}
.tc .kpi.click.on::after{content:"↓";opacity:1;color:var(--a);}
.tc .herocard{padding:22px 24px;margin-bottom:16px;}
.tc button.herocard{width:100%;text-align:left;font-family:inherit;font-size:inherit;color:inherit;
 cursor:pointer;position:relative;transition:border-color .15s ease;}
.tc button.herocard:hover{border-color:var(--ink);}
.tc .heromore{position:absolute;top:16px;right:18px;font-family:'IBM Plex Mono',monospace;font-size:10px;
 font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);}
.tc button.herocard:hover .heromore{color:var(--ink);}
.tc .bignum{font-family:'IBM Plex Mono',monospace;font-size:clamp(26px,3.2vw,34px);font-weight:600;letter-spacing:-.02em;line-height:1.05;
 font-variant-numeric:tabular-nums;margin-top:6px;}
.tc .ofinc{font-family:'Instrument Sans',sans-serif;font-size:14px;color:var(--soft);font-weight:400;letter-spacing:0;}
.tc .herosub{font-size:13.5px;color:#3A453F;line-height:1.55;margin:8px 0 16px;max-width:760px;}
.tc .quickbill{display:grid;grid-template-columns:minmax(130px,1fr) minmax(120px,.9fr) 92px 140px 150px auto;gap:8px;align-items:center;}
@media(max-width:760px){.tc .quickbill{grid-template-columns:1fr 1fr;}}
.tc .up{color:var(--good);}.tc .down{color:var(--warn);}.tc .mid{color:var(--b);}

/* rail — the mockup's allocation bar */
.tc .rail{display:flex;height:44px;width:100%;border:1.5px solid var(--ink);border-radius:var(--r);
 overflow:hidden;background:var(--surface);}
.tc .seg{position:relative;min-width:2px;display:grid;place-items:center;}
.tc .seg + .seg{border-left:1px solid rgba(247,244,236,.55);}
.tc .seg .segpct{font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;color:#F7F4EC;}
.tc .seg.gap{background:repeating-linear-gradient(-45deg,#F0E3DE 0 7px,#F7F4EC 7px 14px);
 border-left:1.5px solid var(--warn);}
.tc .seg.gap .segpct{color:var(--warn);}
.tc .railkey{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:12px;color:var(--soft);}
.tc .railkey span{display:flex;align-items:center;gap:6px;}
.tc .dot{width:9px;height:9px;border-radius:3px;display:inline-block;flex:none;}
@media(max-width:900px){.tc .rail{height:36px;}.tc .seg .segpct{font-size:9.5px;}}

/* rows */
.tc .row{display:grid;grid-template-columns:1fr 92px 92px;gap:10px;align-items:center;padding:8px 0;
 border-bottom:1px solid var(--hair);}
.tc .row:last-child{border-bottom:none;}
.tc .row.wide{grid-template-columns:1fr 130px 92px 96px;}
@media(max-width:700px){.tc .row.wide{grid-template-columns:1fr 96px;}
 .tc .hideS{display:none;}
 .tc .rowname{flex-wrap:wrap;}}
.tc .rowname{display:flex;align-items:center;gap:8px;min-width:0;}
.tc .rowname input{border:none;background:none;font-size:14px;color:var(--ink);padding:2px 0;
 width:100%;min-width:0;font-family:inherit;}
.tc .rowname input:hover{border-bottom:1px dotted var(--line);}
.tc .amt{text-align:right;font-size:13.5px;}
.tc .amt input{width:100%;text-align:right;border:none;background:none;font-size:13.5px;color:var(--ink);
 font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;padding:3px 0;}
.tc .amt input:hover{border-bottom:1px solid var(--line);}
.tc .amt input:focus{outline:none;border-bottom:2px solid var(--ink);}
.tc .muted{color:var(--soft);}
.tc .over{color:var(--warn);font-weight:500;}
.tc .bar{grid-column:1/-1;height:5px;background:var(--track);border-radius:99px;overflow:hidden;}
.tc .bar i{display:block;height:100%;border-radius:3px;}
.tc .kill{background:none;border:none;color:var(--soft);font-size:16px;padding:10px;margin:-8px -6px;line-height:1;}
.tc .kill:hover{color:var(--warn);}
.tc .tag{border:1.5px solid var(--line);background:none;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:10px;
 font-weight:600;letter-spacing:.09em;text-transform:uppercase;padding:4px 9px;color:var(--soft);white-space:nowrap;
 max-width:130px;}
.tc .grouphead{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--soft);
 padding:16px 0 4px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;}

/* bill rows — a ledger line: due badge · name+meta · amount+status · action */
.tc .billrow{display:grid;grid-template-columns:50px minmax(0,1fr) auto 132px;gap:16px;align-items:center;
 padding:11px 10px;border-bottom:1px solid var(--hair);cursor:pointer;border-radius:9px;transition:background .12s;}
.tc .billrow:last-child{border-bottom:none;}
.tc .billrow:hover{background:var(--accsoft);}
.tc .billrow.isPaid{opacity:.72;}
.tc .billrow.isPaid:hover{opacity:1;}
.tc .due{border:1.5px solid var(--line);border-radius:8px;background:var(--paper);text-align:center;
 padding:3px 0 4px;line-height:1;flex:none;}
.tc .due.od{border-color:var(--warn);background:rgba(185,51,24,.06);}
.tc .due.dn{border-color:var(--a);}
.tc .due .d-l{font-family:'IBM Plex Mono',monospace;font-size:8px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);display:block;margin-bottom:1px;}
.tc .due.od .d-l{color:var(--warn);}
.tc .due .d-n{font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:600;color:var(--ink);}
.tc .due.od .d-n{color:var(--warn);}
.tc .bill-main{min-width:0;}
.tc .bill-name{font-size:14.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tc .bill-name .co{color:var(--soft);font-weight:400;}
.tc .bill-meta{display:flex;align-items:center;gap:7px;margin-top:3px;flex-wrap:wrap;}
.tc .bill-meta .mtag{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.08em;
 text-transform:uppercase;color:var(--soft);}
.tc .bill-meta .mtag.env::before{content:"";width:7px;height:7px;border-radius:2px;display:inline-block;margin-right:5px;vertical-align:middle;background:var(--dotc,var(--joint));}
.tc .bill-meta .sep{color:var(--line);}
.tc .bill-amt{text-align:right;flex:none;}
.tc .bill-amt .a-n{font-family:'IBM Plex Mono',monospace;font-size:15.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink);}
.tc .bill-amt .a-s{font-size:10.5px;color:var(--soft);margin-top:3px;white-space:nowrap;}
.tc .bill-amt .a-s.od{color:var(--warn);font-weight:500;}
.tc .bill-amt .a-s.gd{color:var(--good);}
.tc .bill-act{display:flex;justify-content:flex-end;align-items:center;gap:6px;flex:none;}
.tc .paylink{border:1.5px solid var(--a);color:var(--a);border-radius:7px;padding:6px 7px;display:grid;place-items:center;
 background:none;line-height:0;flex:none;}
.tc .paylink:hover{background:var(--a);color:var(--paper);}
@media(max-width:640px){
 .tc .billrow{grid-template-columns:44px minmax(0,1fr) auto;gap:11px;}
 .tc .bill-act{grid-column:2/-1;justify-content:flex-start;margin-top:2px;}
 .tc .bill-amt .a-s{white-space:normal;}
}

/* controls */
.tc .field{border:1.5px solid var(--line);background:#FCFAF4;border-radius:8px;padding:8px 11px;
 font-size:13.5px;color:var(--ink);font-family:inherit;width:100%;}
.tc .field::placeholder{color:#98A29C;}
.tc .field:focus{border-color:var(--ink);outline:none;box-shadow:0 0 0 3px rgba(22,32,29,.08);}
.tc select.field option{background:#FCFAF4;color:var(--ink);}
.tc .btn{border:1.5px solid var(--ink);background:var(--ink);color:var(--paper);border-radius:9px;
 padding:9px 15px;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;}
.tc .btn:hover{opacity:.86;}
.tc .btn[disabled]{opacity:.4;cursor:default;}
.tc .btn.ghost{background:transparent;color:var(--ink);border-color:var(--line);}
.tc .btn.ghost:hover{background:var(--accsoft);border-color:var(--ink);opacity:1;}
.tc .btn.tiny{padding:5px 10px;font-size:10px;letter-spacing:.08em;}
.tc .toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;}
.tc .toolbar .field{width:auto;min-width:120px;}
.tc .srt{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--soft);}
.tc .srt span{white-space:nowrap;}
.tc .srt .field{min-width:110px;}
.tc .pager{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line);flex-wrap:wrap;}
.tc .pgnums{display:flex;gap:5px;flex-wrap:wrap;}
.tc .pgbtn{border:1px solid var(--line);background:var(--surface);border-radius:9px;padding:7px 13px;font-size:12.5px;font-weight:500;color:var(--ink);}
.tc .pgbtn:hover:not([disabled]){border-color:var(--a);color:var(--a);}
.tc .pgbtn[disabled]{opacity:.4;cursor:default;}
.tc .pgnum{width:34px;height:34px;border:1px solid var(--line);background:var(--surface);border-radius:9px;font-size:13px;font-weight:500;color:var(--ink);font-family:'IBM Plex Mono',monospace;}
.tc .pgnum:hover{border-color:var(--a);color:var(--a);}
.tc .pgnum.on{background:var(--a);border-color:var(--a);color:#fff;}
.tc .pgdots{width:20px;text-align:center;color:var(--soft);align-self:center;}
.tc .logger{display:grid;grid-template-columns:100px 1fr 130px 145px 1.3fr auto;gap:8px;background:var(--surface);
 border:1px solid var(--line);border-radius:var(--r);padding:10px;margin-bottom:16px;}
@media(max-width:760px){.tc .logger{grid-template-columns:1fr 1fr;}.tc .logger .wide{grid-column:1/-1;}}

/* goals */
.tc .track{height:8px;background:var(--track);border-radius:99px;margin:11px 0 9px;overflow:hidden;}
.tc .track i{display:block;height:100%;background:var(--joint);border-radius:99px;transition:width .4s ease;}
.tc .flag{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:7px;
 border:1.5px solid currentColor;white-space:nowrap;}
.tc .flag.ok{color:var(--joint);}.tc .flag.late{color:var(--warn);}
.tc .metaline{display:flex;flex-wrap:wrap;gap:13px;font-size:12.5px;color:var(--soft);align-items:center;}
.tc .metaline b{color:var(--ink);font-weight:500;}
.tc .fourup{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px;padding-top:12px;
 border-top:1px solid var(--line);}
@media(max-width:640px){.tc .fourup{grid-template-columns:repeat(2,1fr);}}
.tc .lbl{display:block;font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--soft);margin-bottom:5px;}
.tc .brk{margin-top:12px;padding-top:12px;border-top:1px solid var(--line);}
.tc .brk-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;}
.tc .brk-item{margin-bottom:6px;}
.tc .brk-row{display:grid;grid-template-columns:1fr 120px auto auto;gap:8px;align-items:center;}
.tc .calcbtn{background:none;border:1px solid var(--line);border-radius:8px;color:var(--soft);padding:7px;display:grid;place-items:center;}
.tc .calcbtn:hover{border-color:var(--a);color:var(--a);}
.tc .calcbtn.on{background:var(--accsoft);border-color:var(--a);color:var(--a);}
.tc .calcpanel{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px;margin:6px 0 4px;}
.tc .calc-title{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);margin-bottom:9px;}
.tc .calc-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:9px;}
.tc .calc-f{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--soft);}
.tc .calc-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:11px;flex-wrap:wrap;}
.tc .calc-res{font-size:13px;color:#3A453F;}
.tc .planread{margin-top:12px;border-radius:12px;padding:14px 16px;border:1px solid var(--line);background:var(--paper);}
.tc .planread.ok{border-left:4px solid var(--good);}
.tc .planread.short{border-left:4px solid var(--warn);background:rgba(192,57,43,.05);}
.tc .planread .pr-line{font-size:14px;margin-bottom:6px;}
.tc .planread .pr-verdict{font-size:13.5px;color:#3A453F;line-height:1.5;}
.tc .potnum{margin:2px 0 4px;}
.tc .potnum b{font-family:'IBM Plex Mono',monospace;font-size:22px;font-weight:600;letter-spacing:-.02em;}
.tc .potmove{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;}
.tc .potmove .field{width:130px;}
.tc .fielderr{font-size:12px;color:var(--warn);font-weight:500;}
.tc .disc{background:none;border:none;color:var(--soft);padding:4px;margin:-4px 0 -4px -4px;display:grid;place-items:center;border-radius:6px;flex:none;transition:transform .15s;}
.tc .disc:hover{color:var(--a);background:var(--accsoft);}
.tc .disc.open{transform:rotate(90deg);color:var(--a);}
.tc .envrecent{padding:2px 0 12px 30px;display:flex;flex-direction:column;gap:2px;}
.tc .er{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;padding:5px 0;font-size:13px;}
.tc .er-dot{width:7px;height:7px;border-radius:99px;}
.tc .er-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tc .er-dt{font-size:11.5px;}
.tc .er-am{font-size:13px;}

/* notes + chat */
.tc .note{display:flex;gap:9px;font-size:13px;line-height:1.45;padding:8px 0;
 border-bottom:1px solid var(--hair);}
.tc .note:last-child{border-bottom:none;}
.tc .tick{width:4px;flex:none;border-radius:3px;margin:3px 0;}
.tc .chatlog{display:flex;flex-direction:column;gap:12px;overflow-y:auto;margin-bottom:12px;}
.tc .msg{font-size:13.5px;line-height:1.55;white-space:pre-wrap;}
.tc .msg.me{align-self:flex-end;background:#FCFAF4;border:1.5px solid var(--line);color:var(--ink);
 padding:8px 12px;border-radius:10px 10px 3px 10px;max-width:86%;}
.tc .msg.them{border-left:2px solid var(--joint);padding-left:12px;}
.tc .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px;}
.tc .chip{border:1.5px solid var(--line);background:none;border-radius:8px;padding:4px 10px;font-size:12px;color:#3A453F;}
.tc .chip:hover{border-color:var(--ink);color:var(--ink);}
.tc .chip.on{background:var(--ink);color:var(--paper);border-color:var(--ink);}
.tc .askrow{display:flex;gap:7px;}
.tc .empty{font-size:13px;color:var(--soft);line-height:1.55;padding:8px 0;margin:0;}

/* read-first rows: a clean line you click to open a labeled editor */
.tc .row.click{cursor:pointer;}
.tc .row.click:hover{background:var(--accsoft);}
.tc .editHint{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.08em;
 text-transform:uppercase;color:var(--soft);opacity:0;transition:opacity .12s;}
.tc .row.click:hover .editHint,.tc .row.click:focus-visible .editHint{opacity:1;}
.tc .editor{background:var(--paper);border:1.5px solid var(--line);border-radius:var(--r);
 padding:14px;margin:8px 0 12px;}
.tc .editor .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px 12px;}
.tc .editor .efoot{display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap;}
.tc .editor .snip{margin-top:10px;}

/* celebrations + giving */
.tc .celebrate{background:linear-gradient(120deg,#EEF0DF,#F7F4EC);border:1.5px solid #C6CBAA;
 border-left:3px solid var(--good);border-radius:var(--r);padding:16px 18px;margin-bottom:16px;
 display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;}
.tc .celebrate .ctitle{font-family:'Bricolage Grotesque',sans-serif;font-size:18px;font-weight:800;letter-spacing:-.02em;}
.tc .celebrate .cline{font-size:13px;color:#3A453F;margin:6px 0 8px;max-width:680px;line-height:1.5;}
.tc .celebrate .cverse{font-size:12.5px;font-style:italic;color:#4F5E43;margin:0;}
.tc .celebrate .cverse b{font-style:normal;font-weight:600;color:var(--good);margin-left:6px;}
.tc .givetrack{height:8px;background:var(--track);border-radius:99px;overflow:hidden;margin-top:14px;}
.tc .givetrack i{display:block;height:100%;background:var(--good);border-radius:99px;transition:width .4s ease;}
.tc .mstone{font-size:12px;color:var(--soft);margin-top:10px;}

/* overview at-a-glance cards */
.tc .donutwrap{display:grid;grid-template-columns:200px 1fr;gap:20px;align-items:center;}
@media(max-width:560px){.tc .donutwrap{grid-template-columns:1fr;}}
.tc .donutchart{position:relative;height:200px;}
.tc .donutctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;line-height:1.1;}
.tc .donutctr b{font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:600;letter-spacing:-.02em;}
.tc .donutctr span{font-size:11px;color:var(--soft);text-transform:capitalize;margin-top:2px;}
.tc .donutlegend{display:flex;flex-direction:column;gap:2px;}
.tc .leg{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;background:none;border:none;
 border-radius:9px;padding:8px 10px;font-size:13.5px;color:var(--ink);text-align:left;width:100%;}
.tc .leg:hover{background:var(--accsoft);}
.tc .leg.on{background:var(--accsoft);box-shadow:inset 0 0 0 1px var(--line);}
.tc .leg-dot{width:10px;height:10px;border-radius:3px;}
.tc .leg-am{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--soft);}
.tc .txrow{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--hair);}
.tc .txrow:last-child{border-bottom:none;}
.tc .tx-av{width:34px;height:34px;border-radius:99px;flex:none;display:grid;place-items:center;color:#fff;font-weight:600;font-size:13px;}
.tc .tx-main{min-width:0;display:flex;flex-direction:column;}
.tc .tx-nm{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tc .tx-sub{font-size:11.5px;}
.tc .tx-am{font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:600;}
.tc .potmini{padding:11px 0;border-bottom:1px solid var(--hair);}
.tc .potmini:last-child{border-bottom:none;}
.tc .potmini b{font-family:'Bricolage Grotesque',sans-serif;font-size:14.5px;}
.tc .billstat{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;}
@media(max-width:480px){.tc .billstat{grid-template-columns:1fr;}}
.tc .bs{border-left:4px solid var(--line);background:var(--paper);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;}
.tc .bs-l{font-size:11.5px;color:var(--soft);}
.tc .bs-v{font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;}

/* insights */
.tc .mover{display:grid;grid-template-columns:auto 110px 1fr 58px 64px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--hair);}
.tc .mover:last-child{border-bottom:none;}
.tc .mv-dot{width:9px;height:9px;border-radius:3px;}
.tc .mv-nm{font-size:13.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tc .mv-bar{position:relative;height:8px;background:var(--track);border-radius:99px;overflow:hidden;}
.tc .mv-bar i{position:absolute;top:0;height:100%;border-radius:99px;}
.tc .mv-mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--soft);opacity:.4;}
.tc .mv-fig{font-size:12px;font-weight:600;text-align:right;}
.tc .mv-amt{font-size:12px;text-align:right;}
@media(max-width:640px){.tc .mover{grid-template-columns:auto 1fr 56px;}.tc .mv-bar,.tc .mv-amt{display:none;}}
.tc .topn{padding:9px 0;border-bottom:1px solid var(--hair);}
.tc .topn:last-child{border-bottom:none;}
.tc .topn-h{display:flex;justify-content:space-between;gap:10px;font-size:13.5px;}
.tc .topn-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* trip tracker */
.tc .trip{border-left:4px solid var(--joint);}
.tc .tripstat{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:11px 13px;display:flex;flex-direction:column;gap:3px;}
.tc .tripstat b{font-family:'IBM Plex Mono',monospace;font-size:19px;font-weight:600;letter-spacing:-.01em;}

/* calendar */
.tc .cal-key{display:flex;flex-wrap:wrap;gap:8px 16px;margin-bottom:14px;font-size:12px;color:var(--soft);}
.tc .cal-key span{display:flex;align-items:center;gap:6px;}
.tc .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;}
.tc .cal-head{margin-bottom:6px;}
.tc .cal-wd{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);text-align:center;padding:2px 0;}
.tc .cal-cell{min-height:82px;border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:7px 8px;
 display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;cursor:pointer;transition:border-color .12s,background .12s;}
.tc .cal-cell:hover{border-color:var(--a);background:var(--surface);}
.tc .cal-cell.empty{background:none;border:none;cursor:default;}
.tc .cal-cell.today{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink);}
.tc .cal-cell.sel{border-color:var(--a);box-shadow:inset 0 0 0 1px var(--a);background:var(--accsoft);}
.tc .cal-d{font-family:'IBM Plex Mono',monospace;font-size:12.5px;font-weight:600;}
.tc .cal-cell.today .cal-d{color:var(--a);}
.tc .cal-dots{display:flex;gap:3px;flex-wrap:wrap;}
.tc .cal-dot{width:6px;height:6px;border-radius:99px;}
.tc .cal-ev{font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
.tc .cal-more{font-size:10px;color:var(--soft);}
.tc .cal-cell{position:relative;}
.tc .cal-tip{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%) translateY(4px);
 min-width:190px;max-width:260px;background:var(--ink);color:#fff;border-radius:10px;padding:10px 12px;
 box-shadow:0 12px 30px -10px rgba(0,0,0,.5);opacity:0;visibility:hidden;transition:opacity .12s,transform .12s;
 z-index:20;pointer-events:none;display:flex;flex-direction:column;gap:5px;}
.tc .cal-cell:hover .cal-tip,.tc .cal-cell:focus-visible .cal-tip{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0);}
.tc .cal-tip::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);border:6px solid transparent;border-top-color:var(--ink);}
.tc .cal-tip-d{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:1px;}
.tc .cal-tip-row{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;font-size:12.5px;}
.tc .cal-tip-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tc .cal-tip-am{font-size:12px;}
@media(max-width:640px){.tc .cal-cell{min-height:56px;padding:5px;}.tc .cal-ev{display:none;}.tc .cal-more{display:none;}.tc .cal-tip{display:none;}}

/* financial health — the planner's read */
.tc .health{margin-bottom:16px;padding:22px 24px;}
.tc .health-top{display:flex;gap:24px;align-items:center;flex-wrap:wrap;}
.tc .gauge{position:relative;width:118px;height:118px;flex:none;}
.tc .gauge .g-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;}
.tc .gauge .g-num b{font-family:'IBM Plex Mono',monospace;font-size:30px;font-weight:600;letter-spacing:-.02em;}
.tc .gauge .g-num span{font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);margin-top:3px;}
.tc .health-head{min-width:220px;flex:1;}
.tc .health-head .hl{display:inline-block;font-family:'Bricolage Grotesque',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.02em;}
.tc .health-head .chip-status{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.1em;
 text-transform:uppercase;padding:3px 9px;border-radius:7px;margin-left:10px;vertical-align:middle;border:1.5px solid currentColor;}
.tc .health-head .hr{font-size:13.5px;color:#3A453F;line-height:1.5;margin:9px 0 0;max-width:640px;}
.tc .vitals{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:20px;padding-top:20px;border-top:1px solid var(--line);}
.tc .vital{border:1.5px solid var(--line);border-radius:10px;padding:12px 13px;background:var(--paper);}
.tc .vital .v-h{display:flex;align-items:center;gap:7px;}
.tc .vital .v-dot{width:8px;height:8px;border-radius:99px;flex:none;}
.tc .vital .v-l{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);}
.tc .vital .v-v{font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:600;margin:7px 0 4px;letter-spacing:-.01em;}
.tc .vital .v-n{font-size:11.5px;color:var(--soft);line-height:1.45;}
.tc .v-good{color:var(--good);} .tc .v-watch{color:var(--b);} .tc .v-serious{color:var(--warn);}
.tc .health-do{margin-top:18px;padding-top:16px;border-top:1px solid var(--line);}
.tc .health-do .dh{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--soft);margin-bottom:8px;}
.tc .health-do ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px;}
.tc .health-do li{display:flex;gap:9px;font-size:13px;line-height:1.45;align-items:flex-start;}
.tc .health-do li::before{content:"";width:5px;height:5px;border-radius:99px;background:var(--b);flex:none;margin-top:7px;}
@media(max-width:560px){.tc .gauge{width:96px;height:96px;}.tc .gauge .g-num b{font-size:25px;}}

/* demo banner + stewardship guidance */
.tc .demobar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
 background:var(--goldsoft);border:1.5px solid var(--goldline);border-radius:var(--r);
 padding:9px 14px;margin-bottom:16px;font-size:12.5px;color:#6B4A14;}
.tc .guide{display:flex;gap:14px;align-items:flex-start;background:var(--surface);border:1.5px solid var(--line);
 border-left:3px solid var(--joint);border-radius:var(--r);padding:14px 18px;margin-bottom:16px;}
.tc .guide .gverse{font-family:'Bricolage Grotesque',sans-serif;font-size:15px;font-weight:600;
 line-height:1.5;letter-spacing:-.01em;margin:0 0 6px;color:var(--ink);}
.tc .guide .gref{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;color:var(--b);}
.tc .guide .gline{font-family:'Instrument Sans',sans-serif;font-size:12.5px;color:var(--soft);text-transform:none;letter-spacing:0;font-weight:400;
 margin-left:8px;}

/* concierge + files */
.tc .concierge{margin:0 0 16px;}
.tc .conbar{display:flex;align-items:center;gap:8px;background:var(--surface);border:1.5px solid var(--ink);
 border-radius:var(--r);padding:6px 6px 6px 16px;box-shadow:var(--shadow);}
.tc .conbar input{flex:1;border:none;background:none;font-size:14px;color:var(--ink);font-family:inherit;
 padding:8px 0;min-width:0;}
.tc .conbar input:focus{outline:none;}
.tc .conbar:focus-within{box-shadow:0 0 0 3px rgba(22,32,29,.1);}
.tc .conbar input::placeholder{color:#98A29C;}
.tc .conbar .mic{background:none;border:none;color:var(--soft);border-radius:8px;padding:8px;
 display:grid;place-items:center;flex:none;}
.tc .conbar .mic:hover{background:var(--accsoft);color:var(--ink);}
.tc .conbar .mic.on{background:var(--accsoft);color:var(--warn);}
.tc .conbar .btn{white-space:nowrap;flex:none;}
.tc .concierge .confirm{font-size:12.5px;color:var(--soft);margin:10px 4px 0;}
.tc .consuggest{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
.tc .conreply{background:var(--surface);border:1.5px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);
 padding:14px 16px;margin-top:10px;}
.tc .bulkcard{text-align:left;margin-top:16px;color:var(--ink);}
.tc .bulkrow{display:grid;grid-template-columns:minmax(140px,1fr) 86px 150px 110px 64px 22px;gap:6px;
 align-items:center;padding:4px 0;}
@media(max-width:760px){.tc .bulkrow{grid-template-columns:1fr 80px;}}
.tc .analysis{border-left:2px solid var(--joint);padding:6px 0 6px 12px;margin-top:10px;}
.tc .analysis p{font-size:13px;line-height:1.55;margin:5px 0 0;white-space:pre-wrap;}
.tc .doc{border:1.5px solid var(--line);border-radius:var(--r);padding:12px 14px;margin-bottom:10px;background:var(--surface);}
.tc .doc .snip{font-size:12.5px;color:var(--soft);margin:7px 0 0;line-height:1.5;}
.tc .doc pre{white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:12.5px;color:var(--soft);
 margin:10px 0 0;padding-top:10px;border-top:1px solid var(--hair);max-height:300px;overflow-y:auto;}
.tc .dropzone{border:1.5px dashed var(--line);border-radius:var(--r);padding:18px;text-align:center;
 color:var(--soft);font-size:12.5px;margin-bottom:14px;}
.tc .dropzone.over{background:var(--accsoft);border-color:var(--ink);}
.tc .dropzone.big{padding:30px 18px;color:var(--a);}
.tc .dropzone.big p{color:var(--soft);}
.tc .card.dragover{border-color:var(--ink);box-shadow:0 0 0 3px rgba(22,32,29,.1);}

/* daily study */
.tc .studybanner{display:block;width:100%;text-align:left;background:linear-gradient(120deg,#12332C,#1C4A40);
 color:#fff;border:none;border-radius:16px;padding:20px 22px;margin-bottom:16px;box-shadow:var(--shadow);
 cursor:pointer;transition:transform .1s ease,box-shadow .15s ease;}
.tc .studybanner:hover{box-shadow:0 14px 34px -18px rgba(15,107,96,.7);}
.tc .sb-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#7FC9A9;}
.tc .sb-verse{font-family:'Bricolage Grotesque',sans-serif;font-size:clamp(16px,2vw,20px);font-weight:600;line-height:1.4;
 letter-spacing:-.01em;margin:10px 0 12px;max-width:820px;}
.tc .sb-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.tc .sb-ref{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.7);}
.tc .sb-cta{font-size:12.5px;font-weight:600;color:#fff;}
.tc .studyopen{display:block;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.08em;
 text-transform:uppercase;color:#7FC9A9;margin-top:8px;}
.tc button.sideverse{cursor:pointer;text-align:left;width:100%;transition:background .12s;}
.tc button.sideverse:hover{background:rgba(255,255,255,.09);}
.tc .study{display:flex;flex-direction:column;gap:16px;}
.tc .study-verse{background:var(--paper);border-left:3px solid var(--a);border-radius:10px;padding:14px 16px;}
.tc .study-text{font-family:'Bricolage Grotesque',sans-serif;font-size:16px;font-weight:600;line-height:1.5;letter-spacing:-.01em;margin:0 0 8px;}
.tc .study-ref{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--b);}
.tc .study-block .study-lab{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);}
.tc .study-block p{font-size:14px;line-height:1.6;color:#3A453F;margin:6px 0 0;}
.tc .study-block.pray p{font-style:italic;color:var(--a);}

/* daily bread */
.tc .verse{font-size:19px;line-height:1.5;letter-spacing:.015em;margin:4px 0 10px;max-width:680px;font-style:italic;}
.tc .verseref{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;color:var(--b);}
.tc .verseline{font-size:13px;color:var(--soft);line-height:1.5;margin:12px 0 0;padding-top:12px;
 border-top:1px solid var(--hair);}

/* tooltip */
.tc .tip{background:var(--surface);border:1.5px solid var(--line);color:var(--ink);border-radius:7px;
 padding:7px 10px;font-size:12px;line-height:1.5;}
.tc .tip .k{color:var(--soft);}

/* setup */
.tc .setup{margin:0 auto;padding:7vh 32px 60px;}
.tc .setup .hero{padding:64px 28px;}
.tc .setup h1{font-size:clamp(30px,4.6vw,46px);line-height:1.1;letter-spacing:-.02em;font-weight:800;}
.tc .setup .sub{color:var(--soft);font-size:14.5px;line-height:1.6;margin:0 0 26px;letter-spacing:.02em;}
.tc .choice{padding:26px 24px;text-align:center;}
.tc .choice h3{margin:14px 0 6px;}
.tc .choice .why{color:var(--soft);font-weight:500;
 font-size:15px;margin:0 0 16px;}
.tc .choice .pair,.tc .choice .lbl{text-align:left;}
.tc .choice .btn{width:100%;margin-top:8px;}
.tc .choice .fine{font-size:11px;color:var(--soft);letter-spacing:.06em;margin-top:12px;}
.tc .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:13px;}
@media(prefers-reduced-motion:reduce){.tc *{transition:none!important;animation:none!important;}}
`;

/* ================================================================== */
/*  app shell — top bar + global upload                                */
/* ================================================================== */

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

function TopBar({ state, m, setView, onUpload }) {
  return (
    <div className="topbar">
      <div className="tb-hi">
        <span className="tb-lab">{greeting()},</span>
        <h2 className="tb-name">{m.pA.name} &amp; {m.pB.name}</h2>
      </div>
      <div className="tb-actions">
        <button className="tb-btn" onClick={() => setView("planner")} aria-label="Search and ask">
          <Icon k="search" size={16} /><span className="tb-btn-t">Search & ask</span>
        </button>
        <button className="tb-btn accent" onClick={onUpload} aria-label="Upload a document">
          <Icon k="upload" size={16} /><span className="tb-btn-t">Upload</span>
        </button>
        <div className="tb-avs" title={`${m.pA.name} & ${m.pB.name}`}>
          <span className="tb-av" style={{ background: C.a }}>{m.pA.name.charAt(0)}</span>
          <span className="tb-av" style={{ background: C.b }}>{m.pB.name.charAt(0)}</span>
        </div>
      </div>
    </div>
  );
}

// Drop or pick documents from anywhere — statements, receipts, policies —
// extracted on-device and filed to the paper drawer for search + AI reads.
function UploadModal({ ctx, onClose }) {
  const { patch, setView } = ctx;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState([]);
  const [over, setOver] = useState(false);

  const take = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setBusy(true);
    const added = [];
    for (const f of list) {
      const text = (await extractText(f)).slice(0, 100000);
      const doc = { id: uid(), name: f.name, folder: "Other", added: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }), text };
      added.push(doc);
    }
    patch((s) => { s.docs = [...added, ...(s.docs || [])]; return s; });
    setDone((d) => [...d, ...added.map((a) => a.name)]);
    setBusy(false);
  };

  return (
    <Modal title="Upload a document" sub="Bank statements, receipts, insurance, a spreadsheet — read on your device and kept private." onClose={onClose}>
      <div className={"dropzone big" + (over ? " over" : "")}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
        <Icon k="upload" size={26} />
        <p style={{ margin: "10px 0 4px", fontWeight: 600, color: "var(--ink)" }}>{busy ? "Reading…" : "Drop files here"}</p>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>text, CSV, Excel (.xlsx), Word (.docx)</p>
        <label className="btn" style={{ marginTop: 14, display: "inline-block" }}>
          Choose files
          <input type="file" multiple style={{ display: "none" }} onChange={(e) => take(e.target.files)} />
        </label>
      </div>
      {done.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <p className="mstone" style={{ margin: "0 0 10px" }}>Filed {done.length} document{done.length === 1 ? "" : "s"}: {done.join(", ")}.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost tiny" onClick={() => { onClose(); setView("bills"); }}>See in the drawer</button>
            <button className="btn ghost tiny" onClick={() => { onClose(); setView("planner"); }}>Ask the planner about it</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Today's short study on money and wisdom — passage, reflection, a
// question to talk through, and a prayer. Same for both partners each day.
function DailyStudy({ onClose }) {
  const s = studyForDay();
  return (
    <Modal title="Today's study" sub={s.day} onClose={onClose}>
      <div className="study">
        <div className="study-verse">
          <p className="study-text">“{s.text}”</p>
          <span className="study-ref">{s.ref}</span>
        </div>
        <div className="study-block">
          <span className="study-lab">Reflect</span>
          <p>{s.reflect}</p>
        </div>
        <div className="study-block">
          <span className="study-lab">Talk about it</span>
          <p style={{ fontWeight: 500, color: "var(--ink)" }}>{s.ask}</p>
        </div>
        <div className="study-block pray">
          <span className="study-lab">A prayer</span>
          <p>{s.pray}</p>
        </div>
      </div>
      <button className="btn" onClick={onClose} style={{ marginTop: 4 }}>Amen — close</button>
    </Modal>
  );
}

/* ================================================================== */
/*  root                                                               */
/* ================================================================== */

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dash");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [armClean, setArmClean] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    (async () => {
      let loaded = null;
      try {
        const r = await window.storage.get(KEY);
        if (r && r.value) loaded = JSON.parse(r.value);
      } catch (e) { /* nothing saved yet */ }
      if (!loaded) {
        try {
          const r1 = await window.storage.get(KEY_V1);
          if (r1 && r1.value) loaded = upgrade(JSON.parse(r1.value));
        } catch (e) { /* no earlier version */ }
      }
      if (loaded) setState(loaded);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!state) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      window.storage.set(KEY, JSON.stringify(state), false).catch(() => {});
    }, 450);
  }, [state]);

  const patch = (fn) => setState((s) => fn(structuredClone(s)));

  const plan = useMemo(() => {
    if (!state) return null;
    return state.months[month] || blankMonth(state.months[shiftMonth(month, -1)]);
  }, [state, month]);

  const writeMonth = (fn) =>
    patch((s) => {
      const base = s.months[month] || structuredClone(plan);
      if (!base.paid) base.paid = [];
      if (!base.received) base.received = [];
      s.months[month] = fn(base);
      return s;
    });

  if (loading)
    return <Frame><div className="empty" style={{ padding: 30 }}>Opening your ledger…</div></Frame>;
  if (!state) return <Setup onDone={setState} />;

  const m = model(state, plan, month);
  const ctx = { state, patch, plan, writeMonth, month, setMonth, m, setView, openStudy: () => setStudyOpen(true) };
  const unpaidCount = m.bills.filter((b) => !b.paid).length;
  const startClean = async () => {
    if (!armClean) { setArmClean(true); setTimeout(() => setArmClean(false), 4000); return; }
    try { await window.storage.delete(KEY); } catch (e) { /* nothing stored */ }
    setState(null);
  };
  const navBtn = ([k, label]) => (
    <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>
      <Icon k={k} />{label}
      {k === "bills" && unpaidCount > 0 && <span className="badge">{unpaidCount}</span>}
    </button>
  );

  return (
    <Frame>
      <div className="shell">
        <aside className="side">
          <div className="mark">
            <div className="avatar">{(state.household.name || "H").trim().charAt(0).toUpperCase()}</div>
            <div>
              <span className="nm">{state.household.name}</span>
              <span className="who">{m.pA.name} &amp; {m.pB.name}</span>
            </div>
          </div>
          {NAV_SECTIONS.map(([lab, items]) => (
            <div key={lab}>
              <div className="navlab">{lab}</div>
              <nav>{items.map(navBtn)}</nav>
            </div>
          ))}
          <div className="sidefoot">
            <div className="metaline" style={{ justifyContent: "space-between" }}>
              <span className="muted" style={{ fontSize: 12 }}>available to spend</span>
              <b className="num" style={{ color: m.available < 0 ? "#FF9B8E" : "#fff" }}>{money(m.available)}</b>
            </div>
            <div className="muted" style={{ fontSize: 10.5 }}>build {APP_VERSION}</div>
            {state.demo && (
              <button className="btn ghost tiny" style={{ width: "100%" }} onClick={startClean}>
                {armClean ? "Tap again to erase the sample" : "Sample · start clean"}
              </button>
            )}
            {m.faithOn && (
              <button className="sideverse" onClick={() => setStudyOpen(true)} aria-label="Open today's study">
                <div className="navlab" style={{ margin: "0 0 4px" }}>Daily bread</div>
                <p className="vt">“{m.verse.text}”</p>
                <span className="vr">{m.verse.ref}</span>
                <span className="studyopen">Today's study →</span>
              </button>
            )}
          </div>
        </aside>
        <main className="main">
          <TopBar state={state} m={m} setView={setView} onUpload={() => setUploading(true)} />
          {uploading && <UploadModal ctx={ctx} onClose={() => setUploading(false)} />}
          {studyOpen && m.faithOn && <DailyStudy onClose={() => setStudyOpen(false)} />}
          {state.demo && (
            <div className="demobar">
              <span>You're touring the sample household — nothing here is yours yet.</span>
              <button className="btn ghost tiny" onClick={startClean}>
                {armClean ? "Tap again to erase the sample" : "Start your own"}
              </button>
            </div>
          )}
          {view === "dash" && <Dashboard ctx={ctx} />}
          {view === "budget" && <Budget ctx={ctx} />}
          {view === "txn" && <Spending ctx={ctx} />}
          {view === "bills" && <BillsView ctx={ctx} />}
          {view === "goals" && <GoalsView ctx={ctx} />}
          {view === "calendar" && <CalendarView ctx={ctx} />}
          {view === "insights" && <Insights ctx={ctx} />}
          {view === "plan" && <PlanAhead ctx={ctx} />}
          {view === "worth" && <NetWorth ctx={ctx} />}
          {view === "reports" && <Reports ctx={ctx} />}
          {view === "planner" && <PlannerPage ctx={ctx} />}
          {view === "settings" && <SettingsView ctx={ctx} setState={setState} />}
        </main>
        <div className="bottom">{ALL_NAV.map(navBtn)}</div>
      </div>
    </Frame>
  );
}

const Frame = ({ children }) => (
  <div className="tc"><style>{CSS}</style>{children}</div>
);

function upgrade(v1) {
  return {
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
    incomes: [],
    docs: [],
    chat: v1.chat || [],
  };
}

/* ================================================================== */
/*  computation layer                                                  */
/* ================================================================== */

function model(state, plan, month) {
  const [pA, pB] = state.household.partners;

  // Income. A partner's take-home is either the sum of their paycheck
  // items for the month (incomes with pay:true — each with its own
  // amount and date, tracked like expected income) or, when they have
  // no paychecks defined, their flat monthly number. Never both.
  const liveM = month === monthKey(new Date());
  const received = plan.received || [];
  const allInc = state.incomes || [];
  const inMonth = (i, k) => i.recurring || (i.date ? i.date.slice(0, 7) : i.month) === k;
  const paysFor = (pid, k) => allInc.filter((i) => i.pay && i.who === pid && inMonth(i, k));
  const effFor = (p, k) => {
    const ps = paysFor(p.id, k);
    return ps.length ? ps.reduce((n, i) => n + i.amount, 0) : p.income;
  };
  const effA = effFor(pA, month), effB = effFor(pB, month);
  const baseIncome = effA + effB;

  const track = (i) => ({
    ...i,
    landed: received.includes(i.id),
    late: i.amount > 0 && !received.includes(i.id) && liveM && i.day < todayDay(),
  });
  const paychecks = [...paysFor(pA.id, month), ...paysFor(pB.id, month)].map(track).sort((x, y) => x.day - y.day);
  const extras = allInc.filter((i) => !i.pay && inMonth(i, month));
  const expected = extras.map(track).sort((x, y) => x.day - y.day);
  const extrasTotal = extras.reduce((n, i) => n + i.amount, 0);
  const incomingLeft = [...expected, ...paychecks].filter((e) => !e.landed).reduce((n, e) => n + e.amount, 0);
  const income = baseIncome + extrasTotal;
  // One-time incomes (paychecks included) dated to a later month:
  // visible now under "on the horizon", counted when that month comes.
  const upcoming = allInc
    .filter((i) => !i.recurring && i.month && i.month > month)
    .sort((x, y) => ((x.date || x.month) > (y.date || y.month) ? 1 : -1));

  const spentBy = {};
  plan.entries.forEach((t) => { spentBy[t.envId] = (spentBy[t.envId] || 0) + t.amount; });
  const spentByWho = { a: 0, b: 0, joint: 0 };
  plan.entries.forEach((t) => { spentByWho[t.who] = (spentByWho[t.who] || 0) + t.amount; });

  const planned = plan.envelopes.reduce((n, e) => n + e.planned, 0);
  const spent = plan.entries.reduce((n, t) => n + t.amount, 0);
  const goalMonthly = state.goals.reduce((n, g) => n + g.monthly, 0);
  const debts = state.accounts.filter((a) => a.type === "debt");
  const assets = state.accounts.filter((a) => a.type !== "debt");
  const debtMin = debts.reduce((n, d) => n + (d.minPayment || 0), 0);
  const allocated = planned + goalMonthly;
  const unallocated = income - allocated;
  const leftToSpend = planned - spent;
  const savingsRate = income > 0 ? (goalMonthly / income) * 100 : 0;
  const assetTotal = assets.reduce((n, a) => n + a.balance, 0);
  const debtTotal = debts.reduce((n, a) => n + a.balance, 0);
  const netWorth = assetTotal - debtTotal;

  const byGroup = {};
  plan.envelopes.forEach((e) => {
    const g = e.group || "Other";
    if (!byGroup[g]) byGroup[g] = { planned: 0, spent: 0, items: [] };
    byGroup[g].planned += e.planned;
    byGroup[g].spent += spentBy[e.id] || 0;
    byGroup[g].items.push(e);
  });

  const goalStatus = (g) => {
    const remaining = Math.max(0, g.target - g.saved);
    const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    const monthsNeeded = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
    const eta = monthsNeeded !== null ? shiftMonth(month, monthsNeeded) : null;
    let due = null, late = false, needed = null;
    if (g.due) {
      due = monthsBetween(month, g.due);
      needed = due > 0 ? remaining / due : remaining;
      late = remaining > 0 && (monthsNeeded === null || monthsNeeded > due);
    }
    return { remaining, pct, monthsNeeded, eta, due, late, needed, done: remaining === 0 && g.target > 0 };
  };

  const history = [];
  for (let i = 5; i >= 0; i--) {
    const k = shiftMonth(month, -i);
    const mm = state.months[k];
    const s = mm ? mm.entries.reduce((n, t) => n + t.amount, 0) : 0;
    const inc = effFor(pA, k) + effFor(pB, k) + allInc
      .filter((x) => !x.pay && inMonth(x, k))
      .reduce((n, x) => n + x.amount, 0);
    history.push({ key: k, label: monthLabel(k, true), spent: s, income: inc, saved: goalMonthly });
  }

  // Bills vary month to month: bills[].amount is the usual amount, and
  // plan.billAmounts[billId] holds this month's actual when it differs.
  // Everything downstream uses the effective (this-month) amount.
  const bills = state.bills
    .map((b) => {
      const over = (plan.billAmounts || {})[b.id];
      const amount = over !== undefined ? over : b.amount;
      const paid = (plan.paid || []).includes(b.id);
      const live = month === monthKey(new Date());
      const overdue = !paid && live && b.day < todayDay();
      const dueSoon = !paid && live && !overdue && b.day - todayDay() <= 7;
      const meta = (plan.paidMeta || {})[b.id] || {};
      return { ...b, amount, usual: b.amount, overridden: over !== undefined && over !== b.amount, paid, overdue, dueSoon,
        paidOn: meta.date || "", conf: meta.conf || "" };
    })
    .sort((x, y) => x.day - y.day);
  const billsTotal = bills.reduce((n, b) => n + b.amount, 0);
  const billsLeft = bills.filter((b) => !b.paid).reduce((n, b) => n + b.amount, 0);

  // What a bill actually cost, month by month: the paid entry (stamped
  // with billId) wins; otherwise that month's own amount, if it set one.
  const billHistory = (billId) => {
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const k = shiftMonth(month, -i);
      const mm = state.months[k];
      if (!mm) continue;
      const entry = (mm.entries || []).find((t) => t.billId === billId);
      const over = (mm.billAmounts || {})[billId];
      const meta = (mm.paidMeta || {})[billId] || {};
      if (entry) out.push({ month: k, amount: entry.amount, paid: true, conf: meta.conf });
      else if (over !== undefined) out.push({ month: k, amount: over, paid: (mm.paid || []).includes(billId), conf: meta.conf });
    }
    return out;
  };

  // Bill analytics: what the bills ran each month. Per bill: the paid entry
  // (billId-stamped) wins, then that month's own amount, then the usual.
  // Months with no record at all stay at zero rather than inventing history.
  const billPaidByMonth = [];
  for (let i = 5; i >= 0; i--) {
    const k = shiftMonth(month, -i);
    const mm = state.months[k];
    let total = 0;
    if (mm) state.bills.forEach((b) => {
      const entry = (mm.entries || []).find((t) => t.billId === b.id);
      const over = (mm.billAmounts || {})[b.id];
      total += entry ? entry.amount : over !== undefined ? over : b.amount;
    });
    billPaidByMonth.push({ label: monthLabel(k, true), Bills: Math.round(total * 100) / 100 });
  }
  const billMethodMix = { auto: 0, online: 0, check: 0, unset: 0 };
  state.bills.forEach((b) => { billMethodMix[b.payMethod || "unset"] = (billMethodMix[b.payMethod || "unset"] || 0) + 1; });

  // What's genuinely still spendable: income, less goal savings, less what
  // has already gone out, less the bills that haven't hit yet.
  const available = income - goalMonthly - spent - billsLeft;
  const liveMonth = month === monthKey(new Date());
  const [my, mo] = month.split("-").map(Number);
  const daysLeft = liveMonth ? new Date(my, mo, 0).getDate() - todayDay() + 1 : 0;
  const perDay = liveMonth && daysLeft > 0 && available > 0 ? available / daysLeft : null;

  const payoff = (extra, strategy) => {
    const list = debts.map((d) => ({ ...d }));
    if (!list.length) return { months: 0, interest: 0, order: [] };
    list.sort((x, y) => (strategy === "snowball" ? x.balance - y.balance : (y.apr || 0) - (x.apr || 0)));
    const order = list.map((d) => d.name);
    if (list.reduce((n, d) => n + (d.minPayment || 0), 0) + extra <= 0)
      return { months: 0, interest: 0, order, series: [] };
    let months = 0, interest = 0;
    const series = [{ month: 0, balance: list.reduce((n, d) => n + d.balance, 0) }];
    while (list.some((d) => d.balance > 0) && months < 600) {
      months++;
      let pool = extra;
      list.forEach((d) => {
        if (d.balance <= 0) return;
        const i = (d.balance * ((d.apr || 0) / 100)) / 12;
        interest += i;
        d.balance += i;
        d.balance -= Math.min(d.balance, d.minPayment || 0);
      });
      for (const d of list) {
        if (pool <= 0) break;
        if (d.balance <= 0) continue;
        const pay = Math.min(d.balance, pool);
        d.balance -= pay; pool -= pay;
      }
      series.push({ month: months, balance: Math.max(0, list.reduce((n, d) => n + d.balance, 0)) });
    }
    return { months, interest, order, series };
  };

  const notes = [];
  if (income === 0) notes.push(["joint", "Add what you each take home in Settings — everything else builds from that."]);
  if (unallocated > 1) notes.push(["joint", `${money(unallocated)} a month is unassigned. Park it in a goal or an envelope.`]);
  if (unallocated < -1) notes.push(["warn", `Your plan outruns income by ${money(-unallocated)} a month.`]);
  plan.envelopes.forEach((e) => {
    const s = spentBy[e.id] || 0;
    if (e.planned > 0 && s > e.planned) notes.push(["warn", `${e.name} is ${money(s - e.planned)} over plan.`]);
  });
  bills.filter((b) => b.overdue).forEach((b) => notes.push(["warn", `${b.name} was due the ${ordinal(b.day)} and isn't marked paid.`]));
  bills.filter((b) => b.dueSoon).forEach((b) => notes.push(["joint", `${b.name} (${money(b.amount)}) is due the ${ordinal(b.day)}.`]));
  [...expected, ...paychecks].filter((e) => e.late).forEach((e) => notes.push(["joint", `${e.name} (${money(e.amount)}) was expected the ${ordinal(e.day)} and hasn't been marked received.`]));
  state.goals.forEach((g) => {
    const st = goalStatus(g);
    if (st.late) notes.push(["warn", `${g.name} misses ${monthLabel(g.due)} at ${money(g.monthly)}/mo — it needs ${money(st.needed)}.`]);
    else if (st.done) notes.push(["a", `${g.name} is fully funded. Redirect ${money(g.monthly)}.`]);
  });
  if (debtTotal > 0 && income > 0) {
    const ratio = (debtMin / income) * 100;
    if (ratio > 36) notes.push(["warn", `Debt payments take ${Math.round(ratio)}% of income. Past roughly 36%, everything else gets squeezed.`]);
  }
  if (income > 0 && savingsRate < 10) notes.push(["joint", `You're saving ${Math.round(savingsRate)}% of income. Most plans get comfortable at 15–20%.`]);

  const aInc = effA + extras.filter((i) => i.who === "a").reduce((n, i) => n + i.amount, 0);
  const bInc = effB + extras.filter((i) => i.who === "b").reduce((n, i) => n + i.amount, 0);
  const shareA = aInc + bInc > 0 ? (state.household.splitRule === "even" ? 0.5 : aInc / (aInc + bInc)) : 0.5;
  // One earner + proportional split would render the other spouse as
  // 0% / $0 — views show a neutral "it's all shared money" line instead.
  const singleIncome = state.household.splitRule !== "even" && aInc + bInc > 0 && (aInc === 0 || bInc === 0);
  // Of shared (joint-envelope) spending logged so far, who actually paid.
  const jointEnvIds = new Set(plan.envelopes.filter((e) => e.owner === "joint").map((e) => e.id));
  const covered = { a: 0, b: 0 };
  plan.entries.forEach((t) => {
    if (jointEnvIds.has(t.envId) && (t.who === "a" || t.who === "b")) covered[t.who] += t.amount;
  });
  const jointCost = plan.envelopes.filter((e) => e.owner === "joint").reduce((n, e) => n + e.planned, 0) + goalMonthly;

  /* ---- stewardship: giving envelopes + the daily verse ---- */

  const faithOn = state.faith ? state.faith.enabled !== false : true;
  const givingGroup = byGroup["Giving"] || { planned: 0, spent: 0 };
  const givingSpentIn = (mm) => {
    const gIds = new Set((mm.envelopes || []).filter((e) => e.group === "Giving").map((e) => e.id));
    return (mm.entries || []).reduce((n, t) => n + (gIds.has(t.envId) ? t.amount : 0), 0);
  };
  const givingTargetPct = (state.faith && state.faith.givingTarget) || 10;
  let givingYtd = givingGroup.spent;
  Object.entries(state.months).forEach(([k, mm]) => {
    if (k.slice(0, 4) === month.slice(0, 4) && k < month) givingYtd += givingSpentIn(mm);
  });
  const prevMonthData = state.months[shiftMonth(month, -1)];
  const givingLastMonth = prevMonthData ? givingSpentIn(prevMonthData) : 0;
  const giving = {
    planned: givingGroup.planned,
    given: givingGroup.spent,
    plannedPct: income > 0 ? (givingGroup.planned / income) * 100 : 0,
    givenPct: income > 0 ? (givingGroup.spent / income) * 100 : 0,
    targetPct: givingTargetPct,
    target: (income * givingTargetPct) / 100,
    ytd: givingYtd,
    lastMonth: givingLastMonth,
    metTarget: income > 0 && givingGroup.spent >= (income * givingTargetPct) / 100,
  };

  // Milestones worth marking: a debt reaching zero, the giving target
  // met, giving growing month over month. Shown until the couple marks
  // the moment (state.milestones); celebrated plainly, never gamified.
  const marked = state.milestones || [];
  const celebrations = [];
  debts.forEach((d) => {
    if (d.balance === 0 && !marked.includes(`debt:${d.id}`))
      celebrations.push({
        id: `debt:${d.id}`, kind: "debt",
        title: `${d.name} is paid off.`,
        line: d.minPayment > 0
          ? `${money(d.minPayment)} a month just came back to you — ready to give, to save, or to send at the next debt.`
          : "One less thing owed. That money answers to you two now.",
      });
  });
  if (faithOn && liveM && giving.target > 0) {
    if (giving.metTarget && !marked.includes(`tithe:${month}`))
      celebrations.push({
        id: `tithe:${month}`, kind: "giving",
        title: `You've given ${money(giving.given)} this month — the full ${givingTargetPct}%.`,
        line: "The first fruits went out first. That's the whole practice, working.",
      });
    else if (!giving.metTarget && giving.given > giving.lastMonth && giving.lastMonth > 0 && !marked.includes(`givemore:${month}`))
      celebrations.push({
        id: `givemore:${month}`, kind: "giving",
        title: `You've already given more than all of last month — ${money(giving.given)} and counting.`,
        line: `Last month closed at ${money(giving.lastMonth)}. The direction is the point.`,
      });
  }

  // Prefer naming a joint envelope when something is over plan — the
  // banner and thesis must never read as scripture-adjacent finger-
  // pointing at one named partner.
  const overEnvs = plan.envelopes
    .filter((e) => e.planned > 0 && (spentBy[e.id] || 0) > e.planned)
    .sort((x, y) => (x.owner === "joint" ? 0 : 1) - (y.owner === "joint" ? 0 : 1));
  let verseTheme = null;
  if (unallocated < -1) verseTheme = "planning";
  else if (overEnvs.length) verseTheme = "contentment";
  else if (income > 0 && debtTotal > 0 && (debtMin / income) * 100 > 36) verseTheme = "debt";
  else if (income > 0 && giving.planned === 0) verseTheme = "giving";
  const verse = verseForDay(verseTheme);

  let verseLine;
  if (verse.theme === "giving") {
    verseLine = giving.planned > 0
      ? `${money(giving.planned)} is set aside for giving this month — ${Math.round(giving.plannedPct)}% of what comes in${giving.given > 0 ? `, and ${money(giving.given)} of it has already gone out` : ""}.`
      : "Nothing is set aside for giving yet. An envelope in the Giving group is where it would live.";
  } else if (verse.theme === "planning") {
    verseLine = unallocated < -1
      ? `The plan outruns income by ${money(-unallocated)} — counting the cost means something has to come down.`
      : unallocated > 1
        ? `${money(unallocated)} is still unassigned — the plan isn't finished until every dollar has a job.`
        : "The month is fully planned. Every dollar already has a job.";
  } else if (verse.theme === "contentment") {
    verseLine = overEnvs.length
      ? `${overEnvs[0].name} is ${money((spentBy[overEnvs[0].id] || 0) - overEnvs[0].planned)} past plan — ${overEnvs[0].owner === "joint" ? "the plan was enough when you wrote it together" : "worth a look together"}.`
      : `Spending is inside the plan this month, with ${money(leftToSpend)} still to spend.`;
  } else if (verse.theme === "debt") {
    verseLine = debtTotal > 0
      ? `${money(debtTotal)} is still owed, with ${money(debtMin)} a month going at minimums.`
      : "Nothing is owed right now — worth remembering how that feels.";
  } else if (verse.theme === "provision") {
    verseLine = income > 0
      ? `${money(income)} comes in each month, and the plan gives ${money(allocated)} of it a job.`
      : "Add what you each take home in Settings and the plan builds from there.";
  } else if (verse.theme === "diligence") {
    verseLine = goalMonthly > 0
      ? `${money(goalMonthly)} moves toward your goals every month — gathered little by little.`
      : "Nothing is flowing to goals monthly yet — little by little only works once it starts.";
  } else {
    verseLine = `Shared costs run ${money(jointCost)} a month, carried ${state.household.splitRule === "even" ? "evenly" : "in proportion to what you each bring in"}.`;
  }

  if (faithOn && giving.planned > 0 && giving.given === 0 && month === monthKey(new Date()) && todayDay() > 20)
    notes.push(["joint", `The ${money(giving.planned)} set aside for giving hasn't gone out yet this month.`]);
  if (faithOn && giving.metTarget)
    notes.push(["a", `Giving reached the ${giving.targetPct}% mark this month — ${money(giving.given)} gone out first.`]);
  if (!notes.length) notes.push(["a", "Nothing needs your attention. Log spending as it happens."]);

  let thesis;
  if (income === 0) thesis = ["Start with what you each bring home.", "The plan, the goals, and the read on your month all build from that one number."];
  else if (unallocated > 1) thesis = [`${money(unallocated)} still has no job.`, "Give it one — an envelope, a goal, or a payment against what you owe."];
  else if (unallocated < -1) thesis = [`You've planned ${money(-unallocated)} more than you earn.`, "Something has to come down before the month starts spending itself."];
  else {
    if (overEnvs.length) thesis = [`${overEnvs[0].name} is over by ${money((spentBy[overEnvs[0].id] || 0) - overEnvs[0].planned)}.`,
      overEnvs[0].owner === "joint"
        ? "Everything else is holding — move money from a lighter envelope to cover it."
        : "Everything else is holding — worth a look together."];
    else thesis = ["Every dollar has a job this month.", `${money(leftToSpend)} left to spend, ${money(goalMonthly)} heading toward what's next.`];
  }

  /* ---- the financial-health read: a planner's vitals + score ----
     Each vital scores 0–100 on the yardstick a planner actually uses;
     the headline score is their weighted average over the vitals that
     apply. Everything keys off income + bills + goals + accounts, so it
     comes alive the moment those are entered and needs no extra input. */
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const cashTotal = assets.filter((a) => a.type === "cash").reduce((n, a) => n + a.balance, 0);
  // What a month costs to run (for the emergency runway): the budget if
  // there is one, else bills plus whatever's been spent. Goals are saving,
  // not a cost you need a cushion for, so they stay out of it.
  const monthlyCost = planned > 0 ? planned : billsTotal + spent;
  const runwayMonths = monthlyCost > 0 ? cashTotal / monthlyCost : 0;
  const fixedRatio = income > 0 ? billsTotal / income : 0;
  const debtRatio = income > 0 ? debtMin / income : 0;

  // Net monthly flow: income, less everything with a claim on it — the
  // plan (envelopes + goals) and any bills not already inside an envelope.
  const billsOutsidePlan = bills.reduce((n, b) => {
    const env = plan.envelopes.find((e) => e.id === b.envId);
    return n + (env ? 0 : b.amount); // bills tied to an envelope are already in `planned`
  }, 0);
  const monthlyNet = income - allocated - billsOutsidePlan;

  const vitalDefs = [];
  if (income > 0) {
    vitalDefs.push({
      key: "cashflow", label: "Monthly cash flow",
      value: (monthlyNet >= 0 ? "+" : "−") + money(Math.abs(monthlyNet)).replace(/^-/, ""),
      score: clamp(60 + (monthlyNet / income) * 200),
      status: monthlyNet >= income * 0.02 ? "good" : monthlyNet >= -1 ? "watch" : "serious",
      note: monthlyNet >= 1 ? `${money(monthlyNet)} a month is free after the plan and bills.`
        : monthlyNet >= -1 ? "The plan and bills use up just about every dollar."
        : `The plan and bills run ${money(-monthlyNet)} past what comes in.`,
    });
    vitalDefs.push({
      key: "fixed", label: "Fixed bills", value: Math.round(fixedRatio * 100) + "% of income",
      score: clamp(100 - Math.max(0, fixedRatio - 0.3) * 250),
      status: fixedRatio <= 0.5 ? "good" : fixedRatio <= 0.65 ? "watch" : "serious",
      note: billsTotal === 0 ? "No recurring bills entered yet."
        : `${money(billsTotal)} a month in bills — ${Math.round(fixedRatio * 100)}% of income. Room to breathe sits under about 50%.`,
    });
    vitalDefs.push({
      key: "savings", label: "Savings rate", value: Math.round(savingsRate) + "% of income",
      score: clamp((savingsRate / 20) * 100),
      status: savingsRate >= 15 ? "good" : savingsRate >= 5 ? "watch" : "serious",
      note: goalMonthly === 0 ? "Nothing is flowing to goals yet — even a small amount starts the habit."
        : savingsRate >= 15 ? `${money(goalMonthly)} a month to goals — right in the healthy 15–20% range.`
        : `${money(goalMonthly)} a month heads to goals. Nudging toward 15% would strengthen the month.`,
    });
    vitalDefs.push({
      key: "debt", label: "Debt load",
      value: debtTotal === 0 ? "Debt-free" : Math.round(debtRatio * 100) + "% of income",
      score: debtTotal === 0 ? 100 : clamp(100 - Math.max(0, debtRatio - 0.1) * 300),
      status: debtTotal === 0 ? "good" : debtRatio <= 0.2 ? "good" : debtRatio <= 0.36 ? "watch" : "serious",
      note: debtTotal === 0 ? "Nothing owed — that's a strong place to build from."
        : debtRatio <= 0.2 ? `${money(debtTotal)} owed, ${money(debtMin)} a month at minimums — a manageable ${Math.round(debtRatio * 100)}% of income.`
        : `${money(debtTotal)} owed, ${money(debtMin)} a month at minimums. Past ~36% of income, everything else gets squeezed.`,
    });
  }
  if (assets.length > 0) {
    vitalDefs.push({
      key: "runway", label: "Emergency runway",
      value: runwayMonths >= 0.05 ? runwayMonths.toFixed(1) + " months" : "—",
      score: clamp((runwayMonths / 6) * 100),
      status: runwayMonths >= 3 ? "good" : runwayMonths >= 1 ? "watch" : "serious",
      note: `${money(cashTotal)} in cash covers ${runwayMonths.toFixed(1)} month${runwayMonths === 1 ? "" : "s"} of costs. Three to six months is the usual cushion.`,
    });
  }

  const W = { cashflow: 0.28, runway: 0.22, savings: 0.2, fixed: 0.18, debt: 0.12 };
  const wsum = vitalDefs.reduce((n, v) => n + (W[v.key] || 0.1), 0);
  const score = vitalDefs.length ? Math.round(vitalDefs.reduce((n, v) => n + v.score * (W[v.key] || 0.1), 0) / wsum) : 0;
  const healthLabel = income === 0 ? "Getting started"
    : score >= 80 ? "Thriving" : score >= 65 ? "Steady" : score >= 45 ? "Watchful" : "Strained";
  const worst = vitalDefs.slice().sort((a, b) => a.score - b.score);
  const strong = worst[worst.length - 1];
  const healthRead = income === 0
    ? "Add what you each take home and your bills, and this becomes a live read on the whole picture."
    : score >= 80 ? `The month is in good shape${strong ? ` — ${strong.label.toLowerCase()} especially` : ""}. Keep it steady.`
    : score >= 65 ? "Mostly steady. One or two things below would move the needle."
    : score >= 45 ? "Holding, but a couple of vitals need attention this month."
    : "The month is strained — the items below are where to start.";

  // The planner's next moves: the weakest vitals, turned into one concrete
  // step each, plus the timely bill/goal flags. Ranked worst-first.
  const health = {
    score, label: healthLabel, read: healthRead,
    vitals: vitalDefs,
    actions: worst.filter((v) => v.status !== "good").slice(0, 3).map((v) => v.note),
  };

  return {
    pA, pB, income, spentBy, spentByWho, planned, spent, goalMonthly, allocated, unallocated,
    leftToSpend, savingsRate, assets, debts, assetTotal, debtTotal, netWorth, debtMin, byGroup,
    cashTotal, runwayMonths, monthlyNet, monthlyCost, health,
    goalStatus, history, bills, billsTotal, billsLeft, billHistory, billPaidByMonth, billMethodMix, payoff, notes, thesis, shareA, jointCost,
    faithOn, giving, celebrations, verse, verseLine, available, daysLeft, perDay,
    baseIncome, extrasTotal, expected, incomingLeft, upcoming, paychecks, singleIncome, covered,
    payCounts: { a: paysFor(pA.id, month).length, b: paysFor(pB.id, month).length },
    eff: { a: effA, b: effB },
    ownerColor: (o) => (o === "a" ? C.a : o === "b" ? C.b : C.joint),
    ownerText: (o) => (o === "a" ? CT.a : o === "b" ? CT.b : CT.joint),
    ownerName: (o) => (o === "a" ? pA.name : o === "b" ? pB.name : "Both"),
  };
}

/* ================================================================== */
/*  shared bits                                                        */
/* ================================================================== */

const Head = ({ title, sub, right }) => (
  <div className="phead">
    <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
    {right}
  </div>
);

const MonthNav = ({ month, setMonth }) => (
  <div className="monthnav">
    <button className="arrow" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
    <span className="m num">{monthLabel(month)}</span>
    <button className="arrow" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
  </div>
);

const AddBtn = ({ label, onClick }) => (
  <button className="addbtn" onClick={onClick}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
    {label}
  </button>
);

/**
 * Amount input that survives typing a decimal point. Controlled inputs that
 * round-trip through num() eat the "." mid-keystroke ("2780." re-renders as
 * "2780"); this keeps the raw draft while focused and commits the parsed
 * number on every change.
 */
function MoneyInput({ value, onCommit, className = "field num", ...rest }) {
  const [draft, setDraft] = useState(null);
  return (
    <input className={className} inputMode="decimal"
      value={draft !== null ? draft : (value || "")}
      onChange={(e) => { setDraft(e.target.value); onCommit(num(e.target.value)); }}
      onBlur={() => setDraft(null)}
      {...rest} />
  );
}

const scrollCard = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

// Today as YYYY-MM-DD, for date pickers that should default to now.
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// A simple, focused dialog for the primary "add" actions. Backdrop or Esc
// closes it; the panel itself keeps clicks from closing. Keyboard-friendly.
function Modal({ title, sub, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>{title}</h3>{sub && <p className="modal-sub">{sub}</p>}</div>
          <button className="kill" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// A labeled field for modal forms — label on top, control below, optional error.
const Field = ({ label, children, err }) => (
  <label className="mfield">
    <span className="mfield-l">{label}</span>
    {children}
    {err && <span className="fielderr">{err}</span>}
  </label>
);

const Kpi = ({ label, value, foot, tone, onClick, active }) => {
  const inner = (
    <>
      <div className="lab">{label}</div>
      <div className={"val " + (tone || "")}>{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </>
  );
  return onClick
    ? <button className={"card kpi click" + (active ? " on" : "")} onClick={onClick}>{inner}</button>
    : <div className="card kpi">{inner}</div>;
};

const Tip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="tip">
      <div className="k">{label}</div>
      {payload.map((p, i) => (
        <div key={i}>{p.name}: <span className="num">{money(p.value)}</span></div>
      ))}
    </div>
  );
};

const axis = { stroke: C.soft, fontSize: 11, tickLine: false, axisLine: false };

function Rail({ m, plan }) {
  const base = Math.max(m.income, m.allocated, 1);
  // Segments cluster by group (the mockup's spending families), goals ride
  // along in indigo; ownership stays a per-row concern, not a bar concern.
  const segs = GROUPS.flatMap((g) => plan.envelopes
    .filter((e) => e.group === g && e.planned > 0)
    .map((e) => ({ k: e.id, g, w: (e.planned / base) * 100, c: GROUP_COLORS[g], t: `${e.name} · ${money(e.planned)}` })));
  if (m.goalMonthly > 0) segs.push({ k: "g", g: "Goals", w: (m.goalMonthly / base) * 100, c: C.joint, t: `Goals · ${money(m.goalMonthly)}` });
  const seen = [...new Set(segs.map((s) => s.g))];
  return (
    <div>
      <div className="rail" role="img" aria-label="How this month's income is assigned">
        {segs.map((s) => (
          <div key={s.k} className="seg" style={{ width: s.w + "%", background: s.c }} title={s.t}>
            {s.w > 7 && <span className="segpct">{Math.round(s.w)}%</span>}
          </div>
        ))}
        {m.unallocated > 1 && (
          <div className="seg gap" style={{ width: (m.unallocated / base) * 100 + "%" }} title={`Unassigned · ${money(m.unallocated)}`}>
            {(m.unallocated / base) * 100 > 5 && <span className="segpct">{Math.round((m.unallocated / base) * 100)}%</span>}
          </div>
        )}
        {!segs.length && <div className="seg gap" style={{ width: "100%" }} title="Nothing assigned yet" />}
      </div>
      <div className="railkey">
        {seen.map((g) => (
          <span key={g}><i className="dot" style={{ background: g === "Goals" ? C.joint : GROUP_COLORS[g] }} />{g}</span>
        ))}
        {m.unallocated > 1 && <span><i className="dot" style={{ border: "1.5px dashed " + C.warn }} />unassigned</span>}
      </div>
    </div>
  );
}

const Notes = ({ notes, limit }) => (
  <div>
    {notes.slice(0, limit || notes.length).map((n, i) => (
      <div className="note" key={i}>
        <span className="tick" style={{ background: n[0] === "warn" ? C.warn : n[0] === "joint" ? C.joint : C.a }} />
        <span>{n[1]}</span>
      </div>
    ))}
  </div>
);

/*  The stewardship banner: a verse matched to the view's theme (planning
    on Budget, contentment on Spending, debt on Bills...) plus one line
    tying it to the household's live numbers. Deterministic per day.     */
function Guidance({ m, theme, line }) {
  if (!m.faithOn) return null;
  const v = theme ? verseForDay(theme) : m.verse;
  const tie = line === undefined ? m.verseLine : line;
  return (
    <div className="guide">
      <div style={{ minWidth: 0 }}>
        <p className="gverse">“{v.text}”</p>
        <span className="gref">{v.ref}{tie && <span className="gline">{tie}</span>}</span>
      </div>
    </div>
  );
}

/*  One spending entry, editable in place — note, envelope, who, amount.
    Used on the dashboard (detail + group drill-down) and in Spending.   */
function EntryRow({ t, plan, m, month, writeMonth, trips = [] }) {
  const [open, setOpen] = useState(false);
  const env = plan.envelopes.find((e) => e.id === t.envId);
  const trip = trips.find((x) => x.id === t.tripId);
  const set = (f, v) => writeMonth((mm) => {
    const x = mm.entries.find((y) => y.id === t.id);
    if (x) x[f] = v;
    return mm;
  });
  const remove = () => writeMonth((mm) => { mm.entries = mm.entries.filter((y) => y.id !== t.id); return mm; });

  if (!open) return (
    <div className="row wide click" role="button" tabIndex={0} onClick={() => setOpen(true)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
      aria-label={`Edit ${t.note || (env ? env.name : "entry")}`}>
      <div className="rowname">
        <span className="tag" style={{ color: m.ownerText(t.who), borderColor: m.ownerColor(t.who) }}>{m.ownerName(t.who)}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t.note || (env ? env.name : "Spending")}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>{env ? env.name : "unfiled"}</span>
        {trip && <span className="tag" style={{ color: CT.joint, borderColor: C.joint }}>✈ {trip.name}</span>}
      </div>
      <div className="amt muted hideS">{t.date}</div>
      <div className="amt num">{money(t.amount, true)}</div>
      <div className="amt"><span className="editHint">edit</span></div>
    </div>
  );

  return (
    <div className="editor">
      <div className="fields">
        <div>
          <label className="lbl">What</label>
          <input className="field" value={t.note || ""} placeholder={env ? env.name : "Spending"}
            onChange={(e) => set("note", e.target.value)} aria-label="Note" />
        </div>
        <div>
          <label className="lbl">Envelope</label>
          <select className="field" value={t.envId} onChange={(e) => set("envId", e.target.value)} aria-label="Envelope">
            {plan.envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Who paid</label>
          <select className="field" value={t.who} onChange={(e) => set("who", e.target.value)} aria-label="Who paid">
            <option value="joint">Both</option>
            <option value="a">{m.pA.name}</option>
            <option value="b">{m.pB.name}</option>
          </select>
        </div>
        <div>
          <label className="lbl">Amount</label>
          <MoneyInput value={t.amount} placeholder="0"
            onCommit={(v) => set("amount", v)} aria-label="Amount" />
        </div>
        <div>
          <label className="lbl">Date</label>
          <input className="field num" type="date"
            value={t.day ? `${month}-${String(t.day).padStart(2, "0")}` : ""}
            onChange={(e) => {
              if (!e.target.value) return;
              const d = Number(e.target.value.slice(8, 10));
              writeMonth((mm) => {
                const x = mm.entries.find((y) => y.id === t.id);
                if (x) {
                  x.day = d;
                  x.date = new Date(e.target.value + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
                }
                return mm;
              });
            }} aria-label="Date" />
        </div>
        {trips.length > 0 && (
          <div>
            <label className="lbl">Trip</label>
            <select className="field" value={t.tripId || ""} onChange={(e) => set("tripId", e.target.value || undefined)} aria-label="Trip">
              <option value="">— none —</option>
              {trips.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="efoot">
        <button className="btn tiny" onClick={() => setOpen(false)}>Done</button>
        <span className="muted" style={{ fontSize: 12 }}>{t.date}</span>
        <button className="btn ghost tiny" style={{ marginLeft: "auto", color: C.warn }} onClick={remove}>Remove</button>
      </div>
    </div>
  );
}

/*  One income item — paycheck or expected — editable in place: name,
    amount, every-month day or a real date, received tracking.         */
function IncomeRow({ inc, m, month, patch, setInc, setIncDate, toggleLanded }) {
  const [open, setOpen] = useState(false);
  const whenText = inc.recurring
    ? `every month on the ${ordinal(inc.day)}`
    : `on ${new Date((inc.date || `${month}-${String(inc.day || 15).padStart(2, "0")}`) + "T00:00")
        .toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  if (!open) return (
    <div className="row wide click" role="button" tabIndex={0} onClick={() => setOpen(true)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
      aria-label={`Edit ${inc.name}`}>
      <div className="rowname" style={inc.pay ? { paddingLeft: 12 } : undefined}>
        <span className="tag" style={{ color: m.ownerText(inc.who), borderColor: m.ownerColor(inc.who) }}>{m.ownerName(inc.who)}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.name}</span>
        <span className="muted" style={{ fontSize: 12 }}>{whenText}</span>
        {inc.late && <span className="tag" style={{ color: C.warn, borderColor: C.warn }}>running late</span>}
      </div>
      <div className="amt hideS"><span className="editHint">edit</span></div>
      <div className="amt num">{money(inc.amount)}</div>
      <div className="amt">
        <button className={"btn tiny " + (inc.landed ? "" : "ghost")}
          onClick={(e) => { e.stopPropagation(); toggleLanded(inc); }}
          title={inc.landed ? "Tap if it hasn't actually arrived" : "Tap when the money arrives"}>
          {inc.landed ? "Received" : "Mark received"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="editor">
      <div className="fields">
        <div>
          <label className="lbl">Name</label>
          <input className="field" value={inc.name} onChange={(e) => setInc(inc.id, "name", e.target.value)} aria-label="Income name" />
        </div>
        <div>
          <label className="lbl">How often</label>
          <select className="field" value={inc.recurring ? "monthly" : "once"} onChange={(e) => patch((s) => {
            const x = (s.incomes || []).find((y) => y.id === inc.id);
            if (x) {
              x.recurring = e.target.value === "monthly";
              if (x.recurring) { x.month = ""; x.date = ""; }
              else { x.month = month; x.date = `${month}-${String(x.day || 15).padStart(2, "0")}`; }
            }
            return s;
          })} aria-label="How often">
            <option value="monthly">Every month</option>
            <option value="once">One time</option>
          </select>
        </div>
        <div>
          <label className="lbl">{inc.recurring ? "Day of the month" : "Date it arrives"}</label>
          {inc.recurring ? (
            <input className="field num" type="date"
              value={`${month}-${String(inc.day || 1).padStart(2, "0")}`}
              onChange={(e) => e.target.value && setInc(inc.id, "day", Math.min(31, Math.max(1, Number(e.target.value.slice(8, 10)) || 1)))}
              aria-label="Day of month it repeats" />
          ) : (
            <input className="field num" type="date"
              value={inc.date || `${month}-${String(inc.day || 15).padStart(2, "0")}`}
              onChange={(e) => setIncDate(inc.id, e.target.value)} aria-label="Expected date" />
          )}
        </div>
        <div>
          <label className="lbl">Amount</label>
          <MoneyInput value={inc.amount} placeholder="0"
            onCommit={(v) => setInc(inc.id, "amount", v)} aria-label="Amount" />
        </div>
        {!inc.pay && (
          <div>
            <label className="lbl">Whose</label>
            <select className="field" value={inc.who} onChange={(e) => setInc(inc.id, "who", e.target.value)} aria-label="Whose money">
              <option value="joint">Both</option>
              <option value="a">{m.pA.name}</option>
              <option value="b">{m.pB.name}</option>
            </select>
          </div>
        )}
      </div>
      <div className="efoot">
        <button className="btn tiny" onClick={() => setOpen(false)}>Done</button>
        <button className="btn ghost tiny" style={{ marginLeft: "auto", color: C.warn }}
          onClick={() => patch((s) => { s.incomes = (s.incomes || []).filter((y) => y.id !== inc.id); return s; })}>
          Remove
        </button>
      </div>
    </div>
  );
}

/*  Bulk paste: "Electric — $185" style lines become a proposed setup —
    recurring bills, budget envelopes, or logged spending, one per line. */
function parseBulk(text) {
  const items = [];
  for (const raw of String(text).split(/\n+/)) {
    const l = raw.trim();
    if (!l) continue;
    if (/total/i.test(l)) continue;
    const mch = l.match(/^[\s*•\-–—\[\]()]*(.+?)[\s]*[—–\-:]+[\s]*\$?([\d,]+(?:\.\d+)?)[\s]*$/);
    if (!mch) continue;
    const name = mch[1].replace(/^[\s*•\-–—\[\]()]+/, "").replace(/\s+/g, " ").trim();
    const amount = num(mch[2]);
    if (name && amount) items.push({ name, amount });
  }
  return items;
}

const BILL_LIKE = /rent|mortgage|electric|water|sewer|natural gas|internet|wifi|cable|phone|insurance|payment|loan|streaming|subscript|membership|gym|hoa|daycare|tuition|netflix|spotify|hulu|disney/i;

const WORD_DAYS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
  ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  twentieth: 20, "twenty-first": 21, "twenty first": 21, "twenty-fifth": 25, "twenty fifth": 25,
  thirtieth: 30, "thirty-first": 31, "thirty first": 31,
};

function parseDayFromText(t) {
  const a = t.match(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (a) { const d = parseInt(a[1], 10); if (d >= 1 && d <= 31) return d; }
  const b = t.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if (b) { const d = parseInt(b[1], 10); if (d >= 1 && d <= 31) return d; }
  for (const [w, d] of Object.entries(WORD_DAYS)) if (t.includes(`the ${w}`)) return d;
  return null;
}

// "Mortgage $2700 on the first" → the words before the amount are the name.
function nameBeforeAmount(raw) {
  const cut = raw.search(/[$]?\d/);
  const n = (cut > 0 ? raw.slice(0, cut) : raw).replace(/[\s\-–—:,]+$/, "").trim();
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
}

function classifyItem(name) {
  const n = name.toLowerCase();
  let group = "Other";
  if (/tithe|giving|charity|church|donat/.test(n)) group = "Giving";
  else if (/health|medical|dental|vision|gym|therapy/.test(n)) group = "Health";
  else if (/grocer|fuel|gas\/fuel|pet|transport|commute|diaper/.test(n)) group = "Daily";
  else if (/dining|restaurant|coffee|takeout|streaming|entertain|subscript|travel|hobby|fun/.test(n)) group = "Lifestyle";
  else if (/rent|mortgage|electric|water|sewer|gas|internet|cable|phone|insurance|maintenance|lawn|household|hoa|utilit|payment|loan|debt/.test(n)) group = "Home";
  return { type: BILL_LIKE.test(n) ? "bill" : "budget", group };
}

/*  The concierge: one sentence — typed or spoken — becomes a logged
    transaction. Tries the AI route first; a local parser catches it
    if the route is down, so logging never depends on the network.
    Pasting a multi-line list opens the bulk setup review instead.     */
function Concierge({ ctx, suggest }) {
  const { m, plan, writeMonth, patch, month, state, setView } = ctx;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [reply, setReply] = useState(null);
  const [listening, setListening] = useState(false);
  const [bulk, setBulk] = useState(null);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const onPaste = (e) => {
    const pasted = e.clipboardData ? e.clipboardData.getData("text") : "";
    const items = parseBulk(pasted);
    if (items.length >= 2) {
      e.preventDefault();
      setLast(null);
      setBulk(items.map((it) => ({ ...it, ...classifyItem(it.name), day: 1 })));
    }
  };

  const setBulkItem = (i, f, v) => setBulk(bulk.map((it, j) => (j === i ? { ...it, [f]: v } : it)));

  const applyBulk = () => {
    const items = bulk.filter((it) => it.name.trim() && num(it.amount));
    if (!items.length) { setBulk(null); return; }
    patch((s) => {
      const base = s.months[month] || structuredClone(plan);
      if (!base.paid) base.paid = [];
      items.forEach((it) => {
        const amount = num(it.amount);
        let env = base.envelopes.find((e) => e.name.toLowerCase() === it.name.toLowerCase());
        if (!env) {
          env = { id: uid(), name: it.name, group: it.group, planned: 0, owner: "joint" };
          base.envelopes.push(env);
        }
        if (it.type === "spend") {
          base.entries.unshift({
            id: uid(), envId: env.id, amount, who: "joint", note: it.name,
            date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          });
        } else {
          env.planned = amount;
          env.group = it.group;
        }
        if (it.type === "bill") {
          const day = Math.min(31, Math.max(1, num(it.day) || 1));
          const existing = s.bills.find((b) => b.name.toLowerCase() === it.name.toLowerCase());
          if (existing) { existing.amount = amount; existing.day = day; existing.envId = env.id; }
          else s.bills.push({ id: uid(), name: it.name, amount, day, envId: env.id, owner: "joint" });
        }
      });
      s.months[month] = base;
      return s;
    });
    const billCount = items.filter((i) => i.type === "bill").length;
    const total = items.reduce((n, i) => n + num(i.amount), 0);
    setBulk(null);
    setLast({ msg: `Set up ${items.length} items — ${money(total)} a month, ${billCount} of them recurring bills. The budget and bills pages have them now.` });
  };

  const hear = () => {
    if (!SR) return;
    if (listening) { if (recRef.current) recRef.current.stop(); return; }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => setText((x) => (x ? x + " " : "") + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const localParse = (raw) => {
    const amt = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    const amount = amt ? Math.abs(parseFloat(amt[0])) : 0;
    const lower = raw.toLowerCase();
    const day = parseDayFromText(lower);
    let who = "joint";
    if (m.pA.name && lower.includes(m.pA.name.toLowerCase())) who = "a";
    else if (m.pB.name && lower.includes(m.pB.name.toLowerCase())) who = "b";

    if (/paycheck|payday|gets? paid|salary|bonus|refund|deposit|coming in/.test(lower)) {
      return {
        type: "income", name: nameBeforeAmount(raw) || "Expected income", amount, day: day || 15, who,
        recurring: /every|each month|monthly|paycheck|salary/.test(lower),
        paycheck: /paycheck|salary|gets? paid|payday/.test(lower),
      };
    }
    if (amount && (/(^|\s)bill(s?\s|$)|every month|monthly|\bdue\b/.test(lower) || (day !== null && BILL_LIKE.test(lower)))) {
      return { type: "bill", name: nameBeforeAmount(raw) || "New bill", amount, day: day || 1, who };
    }
    let env = plan.envelopes.find((e) =>
      e.name.toLowerCase().split(/[^a-z]+/).some((w) => w.length > 2 && lower.includes(w)));
    if (!env) env = plan.envelopes.find((e) => e.name === "Everything else") || plan.envelopes[0];
    const note = raw.replace(/[$]?-?\d+([.,]\d+)?/, "").replace(/\s+/g, " ").trim();
    return { type: "spend", amount, envelope: env ? env.name : "", who, note };
  };

  // "Mortgage $2700 on the first" → bill + linked envelope, ready to edit.
  const doBill = (p) => {
    const name = (p.name || "New bill").slice(0, 40);
    const amount = num(p.amount);
    const day = Math.min(31, Math.max(1, num(p.day) || 1));
    const who = ["a", "b", "joint"].includes(p.who) ? p.who : "joint";
    let billId, createdEnv = null;
    patch((s) => {
      const base = s.months[month] || structuredClone(plan);
      if (!base.paid) base.paid = [];
      if (!base.received) base.received = [];
      let env = base.envelopes.find((e) => e.name.toLowerCase() === name.toLowerCase());
      if (!env) {
        env = { id: uid(), name, group: classifyItem(name).group, planned: 0, owner: who };
        base.envelopes.push(env);
        createdEnv = env.id;
      }
      if (!env.planned) env.planned = amount;
      s.months[month] = base;
      billId = uid();
      s.bills.push({ id: billId, name, amount, day, envId: env.id, owner: who });
      return s;
    });
    setLast({
      msg: `Set up ${name} — ${money(amount)} due the ${ordinal(day)}, every month, with its own envelope in the plan. Adjust anything on Bills & files.`,
      undo: { kind: "bill", billId, createdEnv },
    });
    setText(""); setBusy(false);
  };

  const doIncome = (p) => {
    const name = (p.name || "Expected income").slice(0, 40);
    const amount = num(p.amount);
    const day = Math.min(31, Math.max(1, num(p.day) || 15));
    const who = ["a", "b"].includes(p.who) ? p.who : "joint";
    const recurring = !!p.recurring;
    const pay = !!p.paycheck && who !== "joint";
    const id = uid();
    patch((s) => {
      s.incomes = s.incomes || [];
      s.incomes.push({
        id, name, amount, day, who, pay, recurring,
        month: recurring ? "" : month,
        date: recurring ? "" : `${month}-${String(day).padStart(2, "0")}`,
      });
      return s;
    });
    setLast({
      msg: `Posted ${name} — ${money(amount)} expected the ${ordinal(day)}${recurring ? ", every month" : ""}. Adjust it under Money coming in on Budget.`,
      undo: { kind: "income", id },
    });
    setText(""); setBusy(false);
  };

  const undoLast = () => {
    if (last && last.entryId) {
      writeMonth((mm) => { mm.entries = mm.entries.filter((t) => t.id !== last.entryId); return mm; });
    } else if (last && last.undo && last.undo.kind === "bill") {
      patch((s) => {
        s.bills = s.bills.filter((b) => b.id !== last.undo.billId);
        const base = s.months[month];
        if (last.undo.createdEnv && base && !base.entries.some((t) => t.envId === last.undo.createdEnv))
          base.envelopes = base.envelopes.filter((e) => e.id !== last.undo.createdEnv);
        return s;
      });
    } else if (last && last.undo && last.undo.kind === "income") {
      patch((s) => { s.incomes = (s.incomes || []).filter((i) => i.id !== last.undo.id); return s; });
    }
    setLast(null);
  };

  // Anything that isn't a log/setup/search sentence goes to the planner
  // brain; the answer shows inline here and joins the Assistant chat.
  const askAI = async (question) => {
    setBusy(true); setLast(null); setReply(null);
    const history = [...(state.chat || []), { role: "user", content: question }];
    patch((s) => { s.chat = history; return s; });
    try {
      const res = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          system: buildPlannerSystem(m, buildSnapshot(state, m, plan, month)),
          messages: history.slice(-12).map((x) => ({ role: x.role, content: x.content })),
        }),
      });
      const data = await res.json();
      const answer = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      if (!answer) throw new Error("empty");
      patch((s) => { s.chat = [...history, { role: "assistant", content: answer }]; return s; });
      setReply({ text: answer });
      setText("");
    } catch (e) {
      setLast({ err: "Couldn't reach your assistant just now — try again in a moment." });
    }
    setBusy(false);
  };

  const log = async (textArg) => {
    const raw = (textArg !== undefined ? textArg : text).trim();
    if (!raw || busy) return;
    const sm = raw.match(/^(?:find|search(?: for)?|where(?:'s| is)|look for|locate)\s+(.+)$/i);
    if (sm) {
      const needle = sm[1].replace(/^(?:our|my|the)\s+/i, "").replace(/[?.!]\s*$/, "");
      const res = searchEverything(state, needle);
      const answer = res.length
        ? `Here's what I found for “${needle}”:\n\n${res.slice(0, 8).join("\n")}${res.length > 8 ? `\n…and ${res.length - 8} more.` : ""}`
        : `Nothing matches “${needle}” in the paper drawer, bills, spending, goals, or incomes yet.`;
      patch((s) => { s.chat = [...(s.chat || []), { role: "user", content: raw }, { role: "assistant", content: answer }]; return s; });
      setLast(null);
      setReply({ text: answer });
      setText("");
      return;
    }
    if (/\?\s*$/.test(raw) || /^(?:who|what|when|why|how|can|could|should|shall|are|is|do|does|did|will|would|help|explain|tell|show)\b/i.test(raw)) {
      await askAI(raw);
      return;
    }
    if (!/\d/.test(raw)) { await askAI(raw); return; }
    setBusy(true); setLast(null); setReply(null);
    let parsed = null;
    try {
      const res = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 300,
          system:
            `You turn one sentence about household money into ONE JSON object. ` +
            `People: "a" is ${m.pA.name}, "b" is ${m.pB.name}, "joint" means both or unspecified. ` +
            `Pick the type: ` +
            `"spend" for a purchase that already happened — {"type":"spend","amount":n,"envelope":"<exact name from: ${plan.envelopes.map((e) => e.name).join("; ")}>","who":"a"|"b"|"joint","note":"merchant or what it was"}. ` +
            `"bill" for setting up a recurring bill, e.g. "Mortgage $2700 on the first" — {"type":"bill","name":"Mortgage","amount":2700,"day":1,"who":"joint"}. ` +
            `"income" for money arriving (paycheck, bonus, refund, invoice) — {"type":"income","name":"...","amount":n,"day":n,"who":"a"|"b"|"joint","recurring":true|false,"paycheck":true|false}. ` +
            `Reply with ONLY the JSON object, no other text.`,
          messages: [{ role: "user", content: raw }],
        }),
      });
      const data = await res.json();
      const t = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
      const jm = t.match(/\{[\s\S]*\}/);
      if (jm) parsed = JSON.parse(jm[0]);
    } catch (e) { /* offline or proxy down — the local parser takes it */ }
    if (!parsed || !num(parsed.amount)) parsed = localParse(raw);
    if (parsed.type === "bill" && num(parsed.amount)) { doBill(parsed); return; }
    if (parsed.type === "income" && num(parsed.amount)) { doIncome(parsed); return; }
    const env = plan.envelopes.find((e) => e.name === parsed.envelope)
      || plan.envelopes.find((e) => e.name.toLowerCase() === String(parsed.envelope || "").toLowerCase())
      || plan.envelopes.find((e) => e.name === "Everything else") || plan.envelopes[0];
    const amount = num(parsed.amount);
    if (!amount || !env) {
      setBusy(false);
      await askAI(raw);
      return;
    }
    const entry = {
      id: uid(), envId: env.id, amount,
      who: ["a", "b", "joint"].includes(parsed.who) ? parsed.who : "joint",
      note: String(parsed.note || "").slice(0, 60),
      date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
    writeMonth((mm) => { mm.entries.unshift(entry); return mm; });
    const pastMonth = month !== monthKey(new Date()) ? ` Filed in ${monthLabel(month)} — the month you're viewing.` : "";
    setLast({ msg: `Logged ${money(amount, true)} to ${env.name}${entry.note ? ` — ${entry.note}` : ""}, ${m.ownerName(entry.who)}.${pastMonth}`, entryId: entry.id });
    setText(""); setBusy(false);
  };

  return (
    <div className="concierge">
      <div className="conbar">
        <input placeholder={month !== monthKey(new Date())
          ? `Logging into ${monthLabel(month)} — flip back to this month for today's spending`
          : `Log it (“$42 groceries”), set it up (“Mortgage $2,700 on the first”), “find car insurance” — or just ask`}
          value={text} onPaste={onPaste}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && log()}
          aria-label="Log spending in one sentence" />
        {SR && (
          <button className={"mic" + (listening ? " on" : "")} onClick={hear}
            aria-label={listening ? "Stop listening" : "Speak instead of typing"} title="Speak">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
            </svg>
          </button>
        )}
        <button className="btn" onClick={() => log()} disabled={busy || !text.trim()}>{busy ? "…" : "Go"}</button>
      </div>
      {suggest && suggest.length > 0 && (
        <div className="consuggest">
          {suggest.map((s) => (
            <button key={s} className="chip" onClick={() => log(s)} disabled={busy}>{s}</button>
          ))}
        </div>
      )}
      {reply && (
        <div className="conreply">
          <div className="msg them" style={{ whiteSpace: "pre-wrap" }}>{reply.text}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn ghost tiny" onClick={() => setView("planner")}>Continue in Assistant</button>
            <button className="btn ghost tiny" onClick={() => setReply(null)}>Dismiss</button>
          </div>
        </div>
      )}
      {bulk && (
        <div className="card bulkcard">
          <div className="chead">
            <h3>Set up your month from that list</h3>
            <span className="meta num">{bulk.length} items · {money(bulk.reduce((n, i) => n + num(i.amount), 0))}/mo</span>
          </div>
          <p className="empty" style={{ marginTop: 0 }}>
            Each line becomes a bill, a budget envelope, or logged spending — adjust anything, then set it all up at once.
          </p>
          {bulk.map((it, i) => (
            <div className="bulkrow" key={i}>
              <input className="field" value={it.name} onChange={(e) => setBulkItem(i, "name", e.target.value)} aria-label="Item name" />
              <MoneyInput value={it.amount} onCommit={(v) => setBulkItem(i, "amount", v)} aria-label="Amount" />
              <select className="field" value={it.type} onChange={(e) => setBulkItem(i, "type", e.target.value)} aria-label="What it is">
                <option value="bill">Monthly bill</option>
                <option value="budget">Budget envelope</option>
                <option value="spend">Spent — log it</option>
              </select>
              <select className="field" value={it.group} onChange={(e) => setBulkItem(i, "group", e.target.value)} aria-label="Group">
                {GROUPS.map((g) => <option key={g}>{g}</option>)}
              </select>
              {it.type === "bill"
                ? <input className="field num" value={it.day} onChange={(e) => setBulkItem(i, "day", e.target.value)} aria-label="Due day" title="Due day of month" />
                : <span />}
              <button className="kill" onClick={() => setBulk(bulk.filter((_, j) => j !== i))} aria-label="Remove line">×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn" onClick={applyBulk}>Set up {bulk.length} items</button>
            <button className="btn ghost" onClick={() => setBulk(null)}>Cancel</button>
          </div>
        </div>
      )}
      {last && last.msg && (
        <p className="confirm">
          {last.msg}
          {(last.entryId || last.undo) && (
            <button className="btn ghost tiny" style={{ marginLeft: 10 }} onClick={undoLast}>Undo</button>
          )}
        </p>
      )}
      {last && last.err && <p className="confirm" style={{ color: C.warn }}>{last.err}</p>}
    </div>
  );
}

/* ================================================================== */
/*  1. dashboard                                                       */
/* ================================================================== */

const STATUS_C = { good: C.good, watch: C.b, serious: C.warn };

// The financial-health read: a score gauge, the planner's one-liner, the
// vitals a planner actually watches, and the next moves. All from model().
function HealthCard({ m, setView }) {
  const h = m.health;
  const band = h.score >= 65 ? "good" : h.score >= 45 ? "watch" : "serious";
  const ring = STATUS_C[band];
  const r = 52, CIRC = 2 * Math.PI * r;
  const dest = { cashflow: "budget", fixed: "bills", savings: "goals", debt: "worth", runway: "worth" };

  return (
    <div className="card health">
      <div className="health-top">
        {m.income > 0 && (
          <div className="gauge" role="img" aria-label={`Financial health ${h.score} out of 100`}>
            <svg width="118" height="118" viewBox="0 0 118 118">
              <circle cx="59" cy="59" r={r} fill="none" stroke={C.line} strokeWidth="9" />
              <circle cx="59" cy="59" r={r} fill="none" stroke={ring} strokeWidth="9" strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - h.score / 100)}
                transform="rotate(-90 59 59)" style={{ transition: "stroke-dashoffset .6s ease" }} />
            </svg>
            <div className="g-num"><b style={{ color: ring }}>{h.score}</b><span>out of 100</span></div>
          </div>
        )}
        <div className="health-head">
          <div className="biglab">Financial health · {monthLabelForHealth(m)}</div>
          <div style={{ marginTop: 6 }}>
            <span className="hl">{h.label}</span>
            {m.income > 0 && <span className={"chip-status v-" + band}>{band === "good" ? "On track" : band === "watch" ? "Worth attention" : "Needs work"}</span>}
          </div>
          <p className="hr">{h.read}</p>
        </div>
      </div>

      {h.vitals.length > 0 && (
        <div className="vitals">
          {h.vitals.map((v) => (
            <button key={v.key} className="vital" onClick={() => dest[v.key] && setView(dest[v.key])}
              style={{ textAlign: "left", cursor: dest[v.key] ? "pointer" : "default", font: "inherit", color: "inherit" }}>
              <div className="v-h">
                <span className="v-dot" style={{ background: STATUS_C[v.status] }} />
                <span className="v-l">{v.label}</span>
              </div>
              <div className={"v-v v-" + v.status}>{v.value}</div>
              <div className="v-n">{v.note}</div>
            </button>
          ))}
        </div>
      )}

      {h.actions.length > 0 && (
        <div className="health-do">
          <div className="dh">Where a planner would start</div>
          <ul>{h.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
const monthLabelForHealth = (m) => (m.income > 0 ? "this month" : "not enough entered yet");

function Dashboard({ ctx }) {
  const { m, plan, month, setMonth, state, setView, writeMonth, patch, openStudy } = ctx;
  const [showSpend, setShowSpend] = useState(false);
  const [selGroup, setSelGroup] = useState(null);
  const study = studyForDay();

  const groupData = GROUPS
    .map((g) => ({ name: g, value: (m.byGroup[g] || {}).spent || 0, planned: (m.byGroup[g] || {}).planned || 0 }))
    .filter((d) => d.value > 0 || d.planned > 0);
  const groupEnvIds = selGroup
    ? plan.envelopes.filter((e) => (e.group || "Other") === selGroup).map((e) => e.id)
    : [];
  const groupEntries = plan.entries.filter((t) => groupEnvIds.includes(t.envId));
  const selStats = selGroup ? (m.byGroup[selGroup] || { spent: 0, planned: 0 }) : null;

  const recentTx = plan.entries.slice().sort((a, b) => (b.day || 0) - (a.day || 0)).slice(0, 5);
  const overdueTotal = m.bills.filter((b) => b.overdue).reduce((n, b) => n + b.amount, 0);

  return (
    <>
      <Head
        title="Overview"
        sub={`${monthLabel(month)} · ${plan.entries.length} transaction${plan.entries.length === 1 ? "" : "s"} logged`}
        right={<MonthNav month={month} setMonth={setMonth} />}
      />

      {m.faithOn ? (
        <button className="studybanner" onClick={openStudy} aria-label="Open today's study">
          <span className="sb-eyebrow">Today's study · {study.day}</span>
          <p className="sb-verse">“{study.text}”</p>
          <div className="sb-foot">
            <span className="sb-ref">{study.ref}</span>
            <span className="sb-cta">Read &amp; reflect →</span>
          </div>
        </button>
      ) : <Guidance m={m} line={null} />}

      {m.celebrations.map((c) => {
        const v = c.kind === "debt"
          ? (VERSES.find((x) => x.ref === "Romans 13:8") || verseForDay("debt"))
          : verseForDay("giving");
        return (
          <div className="celebrate" key={c.id}>
            <div style={{ minWidth: 0 }}>
              <div className="ctitle">{c.title}</div>
              <p className="cline">{c.line}</p>
              {m.faithOn && <p className="cverse">“{v.text}”<b>{v.ref}</b></p>}
            </div>
            <button className="btn tiny" onClick={() => patch((s) => {
              s.milestones = [...(s.milestones || []), c.id];
              s.milestoneLog = [...(s.milestoneLog || []), { id: c.id, text: c.title, when: month }];
              return s;
            })}>Mark the moment</button>
          </div>
        );
      })}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi dark label="Current balance" value={money(m.cashTotal)} foot={`across ${m.assets.length} cash account${m.assets.length === 1 ? "" : "s"}`}
          onClick={() => setView("worth")} />
        <Kpi label="Income this month" value={money(m.income)} tone="up"
          foot={m.incomingLeft > 0 ? `${money(m.incomingLeft)} still to arrive` : "all in"}
          onClick={() => setView("budget")} />
        <Kpi label="Spent this month" value={money(m.spent)} tone={m.leftToSpend < 0 ? "down" : ""}
          foot={`${money(Math.abs(m.leftToSpend))} ${m.leftToSpend < 0 ? "over" : "left"} of ${money(m.planned)}`}
          onClick={() => setView("txn")} />
        <Kpi label="Available to spend" value={money(m.available)} tone={m.available < 0 ? "down" : ""}
          foot={m.perDay !== null ? `${money(m.perDay)}/day for ${m.daysLeft} more days` : "the plan's headroom"}
          onClick={() => setView("budget")} />
      </div>

      <Concierge ctx={ctx} suggest={[
        m.unallocated > 1 ? `Where should the unassigned ${money(m.unallocated)} go?` : "Are we on track this month?",
        "What's coming due next?",
        "How's our financial health?",
      ]} />

      <HealthCard m={m} setView={setView} />

      <div className="grid g23" style={{ marginBottom: 16 }}>
        {/* Where it went — interactive donut */}
        <div className="card">
          <div className="chead">
            <h3>Where it went</h3>
            <span className="meta">{selGroup ? `${selGroup} — tap the slice again to close` : "tap a slice to open it"}</span>
          </div>
          {groupData.length === 0 ? <p className="empty">Nothing planned or spent yet this month.</p> : (
            <div className="donutwrap">
              <div className="donutchart">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={groupData} dataKey="value" nameKey="name" innerRadius={66} outerRadius={88}
                      paddingAngle={2} stroke="none" style={{ cursor: "pointer" }}
                      onClick={(d) => {
                        const n = d && (d.name || (d.payload && d.payload.name));
                        if (n) setSelGroup(selGroup === n ? null : n);
                      }}>
                      {groupData.map((d, i) => (
                        <Cell key={i} fill={GROUP_COLORS[d.name] || C.soft}
                          opacity={selGroup && selGroup !== d.name ? 0.3 : 1} />
                      ))}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donutctr">
                  <b className="num">{money(selGroup ? selStats.spent : m.spent)}</b>
                  <span>{selGroup || "spent"}</span>
                </div>
              </div>
              <div className="donutlegend">
                {groupData.map((d) => (
                  <button key={d.name} className={"leg" + (selGroup === d.name ? " on" : "")}
                    onClick={() => setSelGroup(selGroup === d.name ? null : d.name)}>
                    <span className="leg-dot" style={{ background: GROUP_COLORS[d.name] || C.soft }} />
                    <span className="leg-nm">{d.name}</span>
                    <span className="leg-am num">{money(d.value)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="card">
          <div className="chead"><h3>Recent transactions</h3>
            <button className="seelink" onClick={() => setView("txn")}>View all →</button></div>
          {recentTx.length === 0 ? <p className="empty">Nothing logged yet. Use the bar above to log a spend.</p> :
            recentTx.map((t) => {
              const e = plan.envelopes.find((x) => x.id === t.envId);
              return (
                <div className="txrow" key={t.id}>
                  <span className="tx-av" style={{ background: m.ownerColor(t.who) }}>{m.ownerName(t.who).charAt(0)}</span>
                  <span className="tx-main">
                    <span className="tx-nm">{t.note || (e ? e.name : "Spending")}</span>
                    <span className="tx-sub muted">{e ? e.name : "unfiled"} · {t.date}</span>
                  </span>
                  <span className="tx-am num">−{money(t.amount).replace(/^-/, "")}</span>
                </div>
              );
            })}
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        {/* Pots */}
        <div className="card">
          <div className="chead"><h3>Pots</h3>
            <button className="seelink" onClick={() => setView("goals")}>See all →</button></div>
          {state.goals.length === 0 ? <p className="empty">No pots yet — the part of the plan that's actually fun.</p> :
            state.goals.slice(0, 4).map((g) => {
              const st = m.goalStatus(g);
              return (
                <div key={g.id} className="potmini">
                  <div className="metaline" style={{ justifyContent: "space-between" }}>
                    <b>{g.name}</b>
                    <span className="num">{money(g.saved)} <span className="muted">/ {money(g.target)}</span></span>
                  </div>
                  <div className="track" style={{ margin: "8px 0 0" }}><i style={{ width: st.pct + "%", background: st.late ? C.warn : C.a }} /></div>
                </div>
              );
            })}
        </div>

        {/* Recurring bills status */}
        <div className="card">
          <div className="chead"><h3>Recurring bills</h3>
            <button className="seelink" onClick={() => setView("bills")}>See all →</button></div>
          <div className="billstat">
            <div className="bs" style={{ borderColor: C.good }}>
              <span className="bs-l">Paid this month</span>
              <span className="bs-v num">{money(m.billsTotal - m.billsLeft)}</span>
            </div>
            <div className="bs" style={{ borderColor: C.b }}>
              <span className="bs-l">Still upcoming</span>
              <span className="bs-v num">{money(m.billsLeft)}</span>
            </div>
            <div className="bs" style={{ borderColor: overdueTotal > 0 ? C.warn : C.line }}>
              <span className="bs-l">Overdue</span>
              <span className="bs-v num" style={{ color: overdueTotal > 0 ? C.warn : undefined }}>{money(overdueTotal)}</span>
            </div>
          </div>
          {m.bills.slice(0, 4).map((b) => (
            <div className="note" key={b.id} style={{ justifyContent: "space-between" }}>
              <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <span className="tick" style={{ background: b.paid ? C.good : b.overdue ? C.warn : C.b, minHeight: 15 }} />
                <span>{b.name}<span className="muted"> · {ordinal(b.day)}</span></span>
              </span>
              <span className={"num " + (b.paid ? "muted" : "")}>{money(b.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        {/* Coming up — plan-ahead scenarios */}
        <div className="card">
          <div className="chead"><h3>Coming up</h3>
            <button className="seelink" onClick={() => setView("plan")}>Plan ahead →</button></div>
          {(state.scenarios || []).length === 0 ? (
            <p className="empty">Nothing big on the horizon. <button className="btn ghost tiny" onClick={() => setView("plan")}>Plan something</button></p>
          ) : (state.scenarios || []).map((sc) => {
            const target = (sc.date || month).slice(0, 7);
            const mu = Math.max(1, monthsBetween(month, target));
            return (
              <div className="note" key={sc.id} style={{ justifyContent: "space-between" }}>
                <span style={{ display: "flex", gap: 9, alignItems: "center", minWidth: 0 }}>
                  <span className="tick" style={{ background: C.joint, minHeight: 15 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sc.name}<span className="muted"> · {monthLabel(target, true)}</span>
                  </span>
                </span>
                <span className="num">{money(num(sc.amount))}{sc.fund === "save" ? <span className="muted"> · {money(num(sc.amount) / mu)}/mo</span> : ""}</span>
              </div>
            );
          })}
        </div>

        {/* Giving — compact, keeps the stewardship layer */}
        {m.faithOn ? (
          <div className="card">
            <div className="chead"><h3>Giving</h3>
              <span className="meta">{m.giving.metTarget ? "target met" : `${money(Math.max(0, m.giving.target - m.giving.given))} to the ${m.giving.targetPct}% mark`}</span></div>
            <div className="potnum"><b className="num">{money(m.giving.given)}</b><span className="muted"> given · {money(m.giving.ytd)} this year</span></div>
            <div className="givetrack"><i style={{ width: Math.min(100, m.giving.target > 0 ? (m.giving.given / m.giving.target) * 100 : 0) + "%" }} /></div>
            <p className="mstone" style={{ marginTop: 12 }}>The first fruits, not the leftovers.{(state.milestoneLog || []).length > 0 ? ` ${(state.milestoneLog || []).length} moment${(state.milestoneLog || []).length === 1 ? "" : "s"} marked.` : ""}</p>
          </div>
        ) : (
          <div className="card">
            <div className="chead"><h3>The month's plan</h3>
              <button className="seelink" onClick={() => setView("budget")}>Edit →</button></div>
            <Rail m={m} plan={plan} />
          </div>
        )}
      </div>

      <div className="grid g23">
        <div className="card">
          <div className="chead"><h3>Six months of cash flow</h3><span className="meta">income vs. what you spent</span></div>
          <div style={{ height: 210 }}>
            <ResponsiveContainer>
              <AreaChart data={m.history} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.a} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={C.a} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} tickFormatter={compact} width={46} />
                <Tooltip content={<Tip />} cursor={{ stroke: C.line }} />
                <Area type="monotone" dataKey="spent" name="Spent" stroke={C.a} fill="url(#gS)" strokeWidth={2} />
                <Line type="monotone" dataKey="income" name="Income" stroke={C.ink} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="chead"><h3>Planner notes</h3><button className="seelink" onClick={() => setView("planner")}>Ask why →</button></div>
          <Notes notes={m.notes} limit={6} />
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  2. budget                                                          */
/* ================================================================== */

// One budget envelope: the editable row, plus a tap to reveal the latest
// three transactions that landed in this category.
function EnvRow({ e, m, plan, set, writeMonth }) {
  const [open, setOpen] = useState(false);
  const i = plan.envelopes.findIndex((x) => x.id === e.id);
  const s = m.spentBy[e.id] || 0;
  const over = e.planned > 0 && s > e.planned;
  const pct = e.planned > 0 ? Math.min(100, (s / e.planned) * 100) : s > 0 ? 100 : 0;
  const recent = plan.entries.filter((t) => t.envId === e.id).slice().sort((a, b) => (b.day || 0) - (a.day || 0)).slice(0, 3);
  return (
    <>
      <div className="row">
        <div className="rowname">
          <button className={"disc" + (open ? " open" : "")} onClick={() => setOpen(!open)}
            aria-label={`${open ? "Hide" : "Show"} recent transactions for ${e.name}`} aria-expanded={open}
            title="Recent transactions">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <input value={e.name} onChange={(ev) => set(i, "name", ev.target.value)} aria-label="Envelope name" />
          <select className="tag hideS" value={e.group || "Other"} onChange={(ev) => set(i, "group", ev.target.value)} aria-label="Group">
            {GROUPS.map((x) => <option key={x}>{x}</option>)}
          </select>
          <button className="tag" onClick={() => {
            const order = ["joint", "a", "b"];
            set(i, "owner", order[(order.indexOf(e.owner) + 1) % 3]);
          }} title="Who covers this">{m.ownerName(e.owner)}</button>
          <button className="kill" onClick={() => writeMonth((mm) => {
            const orphans = mm.entries.filter((t) => t.envId === e.id).length;
            if (orphans && !window.confirm(`Remove ${e.name}? Its ${orphans} logged entr${orphans === 1 ? "y" : "ies"} will move to Everything else.`)) return mm;
            const idx = mm.envelopes.findIndex((x) => x.id === e.id);
            if (idx > -1) mm.envelopes.splice(idx, 1);
            const fallback = mm.envelopes.find((x) => x.name === "Everything else") || mm.envelopes[0];
            if (fallback) mm.entries.forEach((t) => { if (t.envId === e.id) t.envId = fallback.id; });
            return mm;
          })} aria-label={`Remove ${e.name}`}>×</button>
        </div>
        <div className="amt">
          <input className="num" value={e.planned || ""} placeholder="0"
            onChange={(ev) => set(i, "planned", num(ev.target.value))} aria-label={`${e.name} planned`} />
        </div>
        <div className={"amt num " + (over ? "over" : "muted")}>{money(s)}</div>
        <div className="bar"><i style={{ width: pct + "%", background: over ? C.warn : m.ownerColor(e.owner) }} /></div>
      </div>
      {open && (
        <div className="envrecent">
          {recent.length === 0 ? <p className="empty" style={{ padding: "6px 0" }}>Nothing logged here yet this month.</p>
            : recent.map((t) => (
              <div className="er" key={t.id}>
                <span className="er-dot" style={{ background: m.ownerColor(t.who) }} />
                <span className="er-nm">{t.note || e.name}</span>
                <span className="er-dt muted">{t.date}</span>
                <span className="er-am num">{money(t.amount)}</span>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

function Budget({ ctx }) {
  const { m, plan, writeMonth, month, setMonth, state, patch, setView } = ctx;
  const set = (i, field, val) => writeMonth((mm) => { mm.envelopes[i][field] = val; return mm; });

  const setInc = (id, f, v) => patch((s) => {
    const x = (s.incomes || []).find((y) => y.id === id);
    if (x) x[f] = v;
    return s;
  });
  // A one-time income carries a real calendar date; month and day stay
  // synced to it so every month-keyed computation keeps working.
  const setIncDate = (id, val) => patch((s) => {
    const x = (s.incomes || []).find((y) => y.id === id);
    if (x && val) {
      x.date = val;
      x.month = val.slice(0, 7);
      x.day = Math.min(31, Number(val.slice(8, 10)) || 1);
    }
    return s;
  });
  const toggleLanded = (inc) => writeMonth((mm) => {
    mm.received = mm.received.includes(inc.id)
      ? mm.received.filter((x) => x !== inc.id)
      : [...mm.received, inc.id];
    return mm;
  });

  const [ni, setNi] = useState({ kind: "other", name: "", amount: "", timing: "monthly", day: "", date: "" });
  const [niErr, setNiErr] = useState("");
  const addIncome = () => {
    if (!ni.name.trim()) { setNiErr("Name what's coming in."); return; }
    if (!num(ni.amount)) { setNiErr("Enter an amount."); return; }
    setNiErr("");
    const recurring = ni.timing === "monthly";
    const date = recurring ? "" : (ni.date || `${month}-15`);
    patch((s) => {
      s.incomes = s.incomes || [];
      s.incomes.push({
        id: uid(), name: ni.name.trim(), amount: num(ni.amount),
        who: ni.kind === "pay-a" ? "a" : ni.kind === "pay-b" ? "b" : "joint",
        pay: ni.kind === "pay-a" || ni.kind === "pay-b",
        recurring,
        day: recurring ? Math.min(31, Math.max(1, num(ni.day) || 15)) : Math.min(31, Number(date.slice(8, 10)) || 15),
        month: recurring ? "" : date.slice(0, 7),
        date,
      });
      return s;
    });
    setNi({ kind: "other", name: "", amount: "", timing: "monthly", day: "", date: "" });
  };
  const [nc, setNc] = useState(null); // new-category draft

  return (
    <>
      <Head title="Budget" sub="Plan the month before it happens. Tap any number to change it."
        right={<div className="headactions">
          <AddBtn label="Add category" onClick={() => setNc({ name: "", group: "Daily", planned: "" })} />
          <MonthNav month={month} setMonth={setMonth} />
        </div>} />

      {nc && (
        <Modal title="New budget category" sub="A pot of planned spending for the month — groceries, gas, eating out." onClose={() => setNc(null)}>
          <Field label="Category name">
            <input className="field" placeholder="Groceries" value={nc.name} autoFocus
              onChange={(e) => setNc({ ...nc, name: e.target.value })} aria-label="Category name" />
          </Field>
          <div className="mrow">
            <Field label="Group">
              <select className="field" value={nc.group} onChange={(e) => setNc({ ...nc, group: e.target.value })} aria-label="Group">
                {GROUPS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Planned each month">
              <input className="field num" inputMode="decimal" placeholder="$0" value={nc.planned}
                onChange={(e) => setNc({ ...nc, planned: e.target.value })} aria-label="Planned" />
            </Field>
          </div>
          <button className="btn" onClick={() => {
            if (!nc.name.trim()) return;
            writeMonth((mm) => { mm.envelopes.push({ id: uid(), name: nc.name.trim(), group: nc.group, planned: num(nc.planned), owner: "joint" }); return mm; });
            setNc(null);
          }}>Add category</button>
        </Modal>
      )}

      <Guidance m={m} theme="planning"
        line={m.unallocated > 1 ? `${money(m.unallocated)} still needs a job before the plan is finished.`
          : m.unallocated < -1 ? `The plan is ${money(-m.unallocated)} past income — something has to come down.`
            : "Every dollar has a job this month."} />

      <Concierge ctx={ctx} suggest={[
        m.unallocated > 1 ? `Where should the unassigned ${money(m.unallocated)} go?` : "Is this plan realistic?",
        "What changed from last month?",
        ...(m.faithOn ? ["Are we giving the way we mean to?"] : ["Where can we trim?"]),
      ]} />

      <div className="card" id="incomeCard" style={{ marginBottom: 16 }}>
        <div className="chead">
          <h3>Money coming in</h3>
          <span className="meta num">{money(m.income)} expected{m.incomingLeft > 0 ? ` · ${money(m.incomingLeft)} still to come` : ""}</span>
        </div>
        {[0, 1].map((i) => {
          const p = state.household.partners[i];
          const count = i === 0 ? m.payCounts.a : m.payCounts.b;
          const eff = i === 0 ? m.eff.a : m.eff.b;
          return (
            <div className="row wide" key={p.id}>
              <div className="rowname">
                <span className="tag" style={{ color: m.ownerText(p.id), borderColor: m.ownerColor(p.id) }}>{p.name}</span>
                <span>take-home</span>
              </div>
              <div className="amt hideS muted" style={{ textAlign: "left", fontSize: 11.5 }}>
                {count > 0 ? `from ${count} paycheck${count === 1 ? "" : "s"} below` : "flat — or add paychecks below"}
              </div>
              <div className="amt">
                {count > 0
                  ? <span className="num">{money(eff)}</span>
                  : <MoneyInput className="num" value={p.income} placeholder="0"
                      onCommit={(v) => patch((s) => { s.household.partners[i].income = v; return s; })}
                      aria-label={`${p.name} take-home`} />}
              </div>
              <div className="amt muted" style={{ fontSize: 11.5 }}>per month</div>
            </div>
          );
        })}
        {m.paychecks.map((inc) => (
          <IncomeRow key={inc.id} inc={inc} m={m} month={month} patch={patch}
            setInc={setInc} setIncDate={setIncDate} toggleLanded={toggleLanded} />
        ))}
        {m.expected.map((inc) => (
          <IncomeRow key={inc.id} inc={inc} m={m} month={month} patch={patch}
            setInc={setInc} setIncDate={setIncDate} toggleLanded={toggleLanded} />
        ))}
        {m.upcoming.length > 0 && (
          <>
            <div className="grouphead">
              <span>On the horizon</span>
              <span className="num">{money(m.upcoming.reduce((n, i) => n + i.amount, 0))} in later months</span>
            </div>
            {m.upcoming.map((inc) => (
              <div className="row wide" key={inc.id}>
                <div className="rowname">
                  <span className="tag" style={{ color: m.ownerText(inc.who), borderColor: m.ownerColor(inc.who) }}>{m.ownerName(inc.who)}</span>
                  <input value={inc.name} onChange={(e) => setInc(inc.id, "name", e.target.value)} aria-label="Income name" />
                  <button className="kill" onClick={() => patch((s) => { s.incomes = (s.incomes || []).filter((y) => y.id !== inc.id); return s; })}
                    aria-label={`Remove ${inc.name}`}>×</button>
                </div>
                <div className="amt hideS" style={{ textAlign: "left" }}>
                  <input className="field num" type="date" style={{ width: 155, padding: "4px 8px", fontSize: 12.5 }}
                    value={inc.date || `${inc.month}-01`}
                    onChange={(e) => setIncDate(inc.id, e.target.value)} aria-label="Expected date" />
                </div>
                <div className="amt">
                  <MoneyInput className="num" value={inc.amount} placeholder="0"
                    onCommit={(v) => setInc(inc.id, "amount", v)} aria-label="Amount" />
                </div>
                <div className="amt muted" style={{ fontSize: 11.5 }}>counts in {monthLabel(inc.month, true)}</div>
              </div>
            ))}
          </>
        )}
        <div className="grouphead" style={{ marginTop: 4 }}><span>Add money coming in</span></div>
        <div className="chips" style={{ marginTop: 10 }}>
          {[
            { label: `${m.pA.name}'s paycheck`, kind: "pay-a" },
            { label: `${m.pB.name}'s paycheck`, kind: "pay-b" },
            { label: "Bonus", kind: "other" },
            { label: "Side job", kind: "other" },
            { label: "Tax refund", kind: "other" },
            { label: "Gift", kind: "other" },
          ].map((c) => (
            <button key={c.label} className={"chip " + (ni.name === c.label ? "on" : "")}
              onClick={() => setNi({ ...ni, kind: c.kind, name: c.label, timing: c.kind === "other" ? "once" : ni.timing })}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="quickbill" style={{ gridTemplateColumns: "minmax(150px,1fr) 130px 165px 110px auto" }}>
          <input className="field" placeholder="What's coming in?" value={ni.name}
            onChange={(e) => setNi({ ...ni, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addIncome()}
            aria-label="Income name" />
          <select className="field" value={ni.timing} onChange={(e) => setNi({ ...ni, timing: e.target.value })} aria-label="How often">
            <option value="monthly">Every month</option>
            <option value="once">One time</option>
          </select>
          {ni.timing === "monthly" ? (
            <input className="field num" placeholder="Day (e.g. 15)" value={ni.day}
              onChange={(e) => setNi({ ...ni, day: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addIncome()}
              aria-label="Day of the month it arrives" />
          ) : (
            <input className="field num" type="date" value={ni.date || `${month}-15`}
              onChange={(e) => setNi({ ...ni, date: e.target.value })} aria-label="Date it arrives" />
          )}
          <input className="field num" placeholder="$0" value={ni.amount}
            onChange={(e) => setNi({ ...ni, amount: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addIncome()}
            aria-label="Amount" />
          <button className="btn" onClick={addIncome}>Add</button>
        </div>
        {niErr && <p className="fielderr" style={{ marginTop: 8 }}>{niErr}</p>}
        <p className="empty" style={{ marginTop: 10 }}>
          Paychecks set the take-home above; a bonus, an invoice, a side job counts on top. Either way it flows into
          everything — available to spend, the plan, the fair split, the cash-flow chart, and the planner's advice.
        </p>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Income" value={money(m.income)}
          foot={m.extrasTotal > 0 ? `${money(m.baseIncome)} take-home + ${money(m.extrasTotal)} posted` : undefined}
          onClick={() => scrollCard("incomeCard")} />
        <Kpi label="Planned out" value={money(m.planned)} foot={`${Math.round(m.income ? (m.planned / m.income) * 100 : 0)}% of income`}
          onClick={() => scrollCard("planCard")} />
        <Kpi label="Toward goals" value={money(m.goalMonthly)} onClick={() => setView("goals")} />
        <Kpi label="Unassigned" value={money(m.unallocated)} tone={m.unallocated < -1 ? "down" : m.unallocated > 1 ? "mid" : "up"}
          onClick={() => scrollCard("planCard")} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}><Rail m={m} plan={plan} /></div>

      <div className="card" id="planCard">
        {GROUPS.filter((g) => m.byGroup[g]).map((g) => {
          const grp = m.byGroup[g];
          return (
            <div key={g}>
              <div className="grouphead">
                <span>{g}</span>
                <span className="num">{money(grp.spent)} of {money(grp.planned)}</span>
              </div>
              {grp.items.map((e) => (
                <EnvRow key={e.id} e={e} m={m} plan={plan} set={set} writeMonth={writeMonth} />
              ))}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn ghost tiny" onClick={() => setNc({ name: "", group: "Daily", planned: "" })}>+ Add category</button>
          {[["Insurance", "Home"], ["Credit card", "Other"], ["Work", "Other"], ["Giving", "Giving"]]
            .filter(([n]) => !plan.envelopes.some((e) => e.name.toLowerCase() === n.toLowerCase()))
            .map(([n, g]) => (
              <button key={n} className="chip" onClick={() => writeMonth((mm) => {
                mm.envelopes.push({ id: uid(), name: n, group: g, planned: 0, owner: "joint" });
                return mm;
              })}>+ {n}</button>
            ))}
          <button className="btn ghost tiny" disabled={!state.months[shiftMonth(month, -1)]}
            title={state.months[shiftMonth(month, -1)] ? undefined : "Works once you have a previous month on record"}
            onClick={() => writeMonth((mm) => {
            const prev = state.months[shiftMonth(month, -1)];
            if (!prev) return mm;
            mm.envelopes.forEach((e) => {
              const match = prev.envelopes.find((x) => x.name === e.name);
              if (!match) return;
              const s = prev.entries.filter((t) => t.envId === match.id).reduce((n, t) => n + t.amount, 0);
              if (s > 0) e.planned = Math.round(s);
            });
            return mm;
          })}>Match last month's actuals</button>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  3. spending                                                        */
/* ================================================================== */

const PER_PAGE = 10;

function Spending({ ctx }) {
  const { m, plan, state, writeMonth, month, setMonth, patch, setView } = ctx;
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const [env, setEnv] = useState("all");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [addTrip, setAddTrip] = useState("");
  const [tripFilter, setTripFilter] = useState("");

  const trips = state.scenarios || [];
  const tripBudget = (sc) => (sc.items && sc.items.length) ? sc.items.reduce((n, it) => n + num(it.amount), 0) : num(sc.amount);
  // Trip spend tallies tagged entries across every month — a trip can
  // straddle a month boundary.
  const tripSpent = (id) => Object.values(state.months || {}).reduce((n, mm) =>
    n + ((mm.entries || []).filter((t) => t.tripId === id).reduce((a, t) => a + t.amount, 0)), 0);
  const [activeTrip, setActiveTrip] = useState(trips[0] ? trips[0].id : "");
  const trip = trips.find((t) => t.id === activeTrip) || trips[0];

  const envName = (id) => { const e = plan.envelopes.find((x) => x.id === id); return e ? e.name : ""; };
  const filtered = plan.entries.filter((t) => {
    if (tripFilter && t.tripId !== tripFilter) return false;
    if (who !== "all" && t.who !== who) return false;
    if (env !== "all" && t.envId !== env) return false;
    if (q) {
      const hay = ((t.note || "") + " " + envName(t.envId)).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  const rows = filtered.slice().sort((a, b) =>
    sort === "high" ? b.amount - a.amount
    : sort === "low" ? a.amount - b.amount
    : sort === "az" ? (a.note || envName(a.envId)).localeCompare(b.note || envName(b.envId))
    : sort === "oldest" ? (a.day || 0) - (b.day || 0)
    : (b.day || 0) - (a.day || 0)); // latest
  const total = filtered.reduce((n, t) => n + t.amount, 0);

  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const shown = rows.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  // Reset to page 1 whenever the result set changes shape.
  useEffect(() => { setPage(1); }, [q, who, env, sort, tripFilter]);

  return (
    <>
      <Head title="Spending" sub="Everything logged this month, and who spent it."
        right={<div className="headactions">
          <AddBtn label="Add transaction" onClick={() => { setAddTrip(""); setAdding(true); }} />
          <MonthNav month={month} setMonth={setMonth} />
        </div>} />

      {adding && (
        <Modal title={addTrip ? `Add a trip expense` : "Add a transaction"}
          sub={addTrip ? `Tagged to ${(trips.find((t) => t.id === addTrip) || {}).name} — logs against a category too.` : "Logs against a budget category for this month."}
          onClose={() => setAdding(false)}>
          <Logger envelopes={plan.envelopes} m={m} trips={trips} defaultTripId={addTrip}
            onAdd={(e) => writeMonth((mm) => { mm.entries.unshift(e); return mm; })}
            onDone={() => setAdding(false)} />
        </Modal>
      )}

      <Guidance m={m} theme="contentment"
        line={m.leftToSpend >= 0 ? `${money(m.leftToSpend)} left to spend inside what you planned.`
          : `Spending is ${money(-m.leftToSpend)} past the plan this month.`} />

      {trip && (() => {
        const budget = tripBudget(trip);
        const spent = tripSpent(trip.id);
        const left = budget - spent;
        const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
        const daysLeft = trip.date ? monthsBetween(month, trip.date.slice(0, 7)) : null;
        const count = Object.values(state.months || {}).reduce((n, mm) => n + (mm.entries || []).filter((t) => t.tripId === trip.id).length, 0);
        return (
          <div className="card trip" style={{ marginBottom: 16 }}>
            <div className="chead" style={{ flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.joint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                Trip: {trip.name}
              </h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                {trips.length > 1 && (
                  <select className="field" value={activeTrip} onChange={(e) => setActiveTrip(e.target.value)} style={{ width: "auto", padding: "6px 10px", fontSize: 13 }} aria-label="Choose trip">
                    {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <AddBtn label="Add trip expense" onClick={() => { setAddTrip(trip.id); setAdding(true); }} />
              </div>
            </div>
            <div className="grid g3" style={{ gap: 12, marginBottom: 14 }}>
              <div className="tripstat"><span className="v-l">Trip budget</span><b className="num">{money(budget)}</b></div>
              <div className="tripstat"><span className="v-l">Spent so far</span><b className="num">{money(spent)}</b><span className="muted" style={{ fontSize: 11.5 }}>{count} charge{count === 1 ? "" : "s"}</span></div>
              <div className="tripstat"><span className="v-l">{left >= 0 ? "Left to spend" : "Over budget"}</span><b className="num" style={{ color: left < 0 ? C.warn : C.good }}>{money(Math.abs(left))}</b>{daysLeft > 0 && <span className="muted" style={{ fontSize: 11.5 }}>{daysLeft} mo to go</span>}</div>
            </div>
            <div className="track"><i style={{ width: pct + "%", background: left < 0 ? C.warn : C.joint }} /></div>
            <div className="metaline" style={{ marginTop: 10, justifyContent: "space-between" }}>
              <button className="btn ghost tiny" onClick={() => setTripFilter(tripFilter === trip.id ? "" : trip.id)}>
                {tripFilter === trip.id ? "Show all transactions" : "Show only this trip"}
              </button>
              <button className="btn ghost tiny" onClick={() => setView("plan")}>Edit trip budget</button>
            </div>
          </div>
        );
      })()}

      <Concierge ctx={ctx} suggest={[
        "What did we spend the most on?",
        "Where can we trim this month?",
        "Find groceries",
      ]} />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Spent this month" value={money(m.spent)} foot={`${plan.entries.length} transactions`}
          onClick={() => setWho("all")} />
        <Kpi label={`Paid by ${m.pA.name}`} value={money(m.spentByWho.a || 0)} foot="includes shared purchases they covered — tap to filter"
          onClick={() => setWho(who === "a" ? "all" : "a")} active={who === "a"} />
        <Kpi label={`Paid by ${m.pB.name}`} value={money(m.spentByWho.b || 0)} foot="includes shared purchases they covered — tap to filter"
          onClick={() => setWho(who === "b" ? "all" : "b")} active={who === "b"} />
        <Kpi label="Marked shared" value={money(m.spentByWho.joint || 0)} foot="tap to filter"
          onClick={() => setWho(who === "joint" ? "all" : "joint")} active={who === "joint"} />
      </div>

      <div className="toolbar">
        <input className="field" placeholder="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200, flex: 1 }} aria-label="Search transactions" />
        <label className="srt"><span>Sort</span>
          <select className="field" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort transactions">
            <option value="latest">Latest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A to Z</option>
            <option value="high">Highest</option>
            <option value="low">Lowest</option>
          </select>
        </label>
        <label className="srt"><span>Who</span>
          <select className="field" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
            <option value="all">Anyone</option>
            <option value="a">{m.pA.name}</option>
            <option value="b">{m.pB.name}</option>
            <option value="joint">Shared</option>
          </select>
        </label>
        <label className="srt"><span>Category</span>
          <select className="field" value={env} onChange={(e) => setEnv(e.target.value)} aria-label="Filter by envelope">
            <option value="all">All</option>
            {plan.envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
      </div>

      <div className="card">
        <div className="chead">
          <h3>{tripFilter ? `${(trips.find((t) => t.id === tripFilter) || {}).name} — transactions` : "Transactions"}</h3>
          <span className="meta num">{rows.length} shown · {money(total)}</span>
        </div>
        {rows.length === 0 ? <p className="empty">Nothing matches. Clear the filters, or log something above.</p> :
          shown.map((t) => <EntryRow key={t.id} t={t} plan={plan} m={m} month={month} writeMonth={writeMonth} trips={trips} />)}
        {pageCount > 1 && (
          <Pager page={curPage} pageCount={pageCount} setPage={setPage} />
        )}
      </div>
    </>
  );
}

// Keyboard-navigable pager: prev/next plus numbered pages.
function Pager({ page, pageCount, setPage }) {
  const nums = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <div className="pager">
      <button className="pgbtn" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">‹ Prev</button>
      <div className="pgnums">
        {nums.map((n, i) => n === "…"
          ? <span key={"e" + i} className="pgdots">…</span>
          : <button key={n} className={"pgnum" + (n === page ? " on" : "")} onClick={() => setPage(n)}
              aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined}>{n}</button>)}
      </div>
      <button className="pgbtn" onClick={() => setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">Next ›</button>
    </div>
  );
}

// The add-a-transaction form, shown inside a modal. Date defaults to today.
function Logger({ envelopes, m, onAdd, onDone, trips = [], defaultTripId = "" }) {
  const [amount, setAmount] = useState("");
  const [envId, setEnvId] = useState(envelopes[0] ? envelopes[0].id : "");
  const [who, setWho] = useState("joint");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(todayISO());
  const [tripId, setTripId] = useState(defaultTripId);
  const [err, setErr] = useState("");

  const submit = () => {
    if (!num(amount)) { setErr("Enter how much it was."); return; }
    if (!envId) { setErr("Pick a category first — add one on the Budget page."); return; }
    const d = new Date((when || todayISO()) + "T12:00");
    onAdd({
      id: uid(), envId, amount: num(amount), who, note: note.trim(), day: d.getDate(),
      date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      ...(tripId ? { tripId } : {}),
    });
    onDone && onDone();
  };
  const key = (e) => e.key === "Enter" && submit();

  return (
    <>
      <Field label="How much">
        <input className="field num" inputMode="decimal" placeholder="$0" value={amount} autoFocus
          onChange={(e) => { setAmount(e.target.value); setErr(""); }} onKeyDown={key} aria-label="Amount" />
      </Field>
      <Field label="What was it for?">
        <input className="field" placeholder="e.g. groceries at Weis" value={note}
          onChange={(e) => setNote(e.target.value)} onKeyDown={key} aria-label="Note" />
      </Field>
      <div className="mrow">
        <Field label="Category">
          <select className="field" value={envId} onChange={(e) => setEnvId(e.target.value)} aria-label="Category">
            {envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Who spent it">
          <select className="field" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who spent it">
            <option value="joint">Both of us</option>
            <option value="a">{m.pA.name}</option>
            <option value="b">{m.pB.name}</option>
          </select>
        </Field>
      </div>
      <div className="mrow">
        <Field label="When" err={err}>
          <input className="field num" type="date" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When" />
        </Field>
        {trips.length > 0 && (
          <Field label="Part of a trip?">
            <select className="field" value={tripId} onChange={(e) => setTripId(e.target.value)} aria-label="Trip">
              <option value="">— no —</option>
              {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
      </div>
      <button className="btn" onClick={submit}>Add transaction</button>
    </>
  );
}

/* ================================================================== */
/*  4. bills                                                           */
/* ================================================================== */

const COMMON_BILLS = ["Rent", "Mortgage", "Electric", "Water", "Gas", "Internet", "Phone plan", "Car payment", "Car insurance", "Home insurance", "Credit card", "Streaming", "Gym"];

/*  One bill: a clean read line (name · due day · envelope · amount ·
    paid button); clicking opens the labeled editor with this month's
    amount, the usual, and the cost history.                          */
function BillRow({ b, m, state, plan, patch, month, togglePaid, setBillAmount, makeUsual, setPaidMeta }) {
  const [open, setOpen] = useState(false);
  const i = state.bills.findIndex((x) => x.id === b.id);
  const set = (f, v) => patch((s) => { s.bills[i][f] = v; return s; });
  const env = plan.envelopes.find((e) => e.id === b.envId);
  const payHref = b.payUrl ? (/^https?:\/\//i.test(b.payUrl) ? b.payUrl : "https://" + b.payUrl) : "";
  const METHODS = { auto: "Autopay", online: "Online", check: "Check" };
  const paidLabel = b.paidOn
    ? new Date(b.paidOn + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
  const paidBtn = (
    <button className={"btn tiny " + (b.paid ? "" : "ghost")}
      onClick={(e) => { e.stopPropagation(); togglePaid(b); }}>
      {b.paid ? "Paid" : "Mark paid"}
    </button>
  );
  const daysOut = b.day - todayDay();
  const dotc = env ? (GROUP_COLORS[env.group] || C.joint) : C.joint;

  if (!open) return (
    <div className={"billrow" + (b.paid ? " isPaid" : "")} role="button" tabIndex={0} onClick={() => setOpen(true)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
      aria-label={`Edit ${b.name}`}>
      <div className={"due" + (b.overdue ? " od" : b.dueSoon ? " dn" : "")}>
        <span className="d-l">{b.overdue ? "Late" : "Due"}</span>
        <span className="d-n">{b.day}</span>
      </div>

      <div className="bill-main">
        <div className="bill-name">{b.name}{b.company ? <span className="co"> — {b.company}</span> : ""}</div>
        <div className="bill-meta">
          {env && <span className="mtag env" style={{ "--dotc": dotc }}>{env.name}</span>}
          {b.payMethod && <><span className="sep">·</span><span className="mtag">{METHODS[b.payMethod] || b.payMethod}</span></>}
          {b.overridden && <><span className="sep">·</span><span className="mtag">usually {money(b.usual)}</span></>}
        </div>
      </div>

      <div className="bill-amt">
        <div className="a-n">{money(b.amount)}</div>
        {b.paid
          ? <div className="a-s gd">{paidLabel ? `Paid ${paidLabel}` : "Paid"}{b.conf ? ` · #${b.conf}` : ""}</div>
          : b.overdue
            ? <div className="a-s od">Overdue</div>
            : b.dueSoon
              ? <div className="a-s">{daysOut <= 0 ? "Due today" : `In ${daysOut} day${daysOut === 1 ? "" : "s"}`}</div>
              : <div className="a-s">Due the {ordinal(b.day)}</div>}
      </div>

      <div className="bill-act">
        {payHref && !b.paid && (
          <a className="paylink" href={payHref} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()} title="Open payment page" aria-label={`Pay ${b.name} online`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
          </a>
        )}
        {paidBtn}
      </div>
    </div>
  );

  return (
    <div className="editor">
      <div className="fields">
        <div>
          <label className="lbl">Bill</label>
          <input className="field" value={b.name} onChange={(e) => set("name", e.target.value)} aria-label="Bill name" />
        </div>
        <div>
          <label className="lbl">Company</label>
          <input className="field" value={b.company || ""} placeholder="Comcast, Loancare…"
            onChange={(e) => set("company", e.target.value)} aria-label="Company" />
        </div>
        <div>
          <label className="lbl">Amount this month</label>
          <MoneyInput value={b.amount} placeholder="0"
            onCommit={(v) => setBillAmount(b, v)} aria-label={`${b.name} amount this month`} />
        </div>
        <div>
          <label className="lbl">Due date (repeats monthly)</label>
          <input className="field num" type="date"
            value={`${month}-${String(b.day || 1).padStart(2, "0")}`}
            onChange={(e) => e.target.value && set("day", Math.min(31, Math.max(1, Number(e.target.value.slice(8, 10)) || 1)))}
            aria-label="Due date" />
        </div>
        <div>
          <label className="lbl">Envelope</label>
          <select className="field" value={b.envId || ""} onChange={(e) => set("envId", e.target.value)} aria-label="Envelope">
            <option value="">no envelope</option>
            {plan.envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Whose</label>
          <select className="field" value={b.owner} onChange={(e) => set("owner", e.target.value)} aria-label="Whose bill">
            <option value="joint">Both</option>
            <option value="a">{m.pA.name}</option>
            <option value="b">{m.pB.name}</option>
          </select>
        </div>
        <div>
          <label className="lbl">How it's paid</label>
          <select className="field" value={b.payMethod || ""} onChange={(e) => set("payMethod", e.target.value)} aria-label="How it's paid">
            <option value="">—</option>
            <option value="auto">Autopay</option>
            <option value="online">Online</option>
            <option value="check">Check</option>
          </select>
        </div>
        <div>
          <label className="lbl">Payment link</label>
          <input className="field" value={b.payUrl || ""} placeholder="comcast.com/pay"
            onChange={(e) => set("payUrl", e.target.value)} aria-label="Payment link" />
        </div>
        {b.paid && (
          <>
            <div>
              <label className="lbl">Paid on</label>
              <input className="field num" type="date" value={b.paidOn || ""}
                onChange={(e) => setPaidMeta(b, "date", e.target.value)} aria-label="Date paid" />
            </div>
            <div>
              <label className="lbl">Confirmation #</label>
              <input className="field num" value={b.conf || ""} placeholder="from the receipt"
                onChange={(e) => setPaidMeta(b, "conf", e.target.value)} aria-label="Confirmation number" />
            </div>
          </>
        )}
      </div>
      <div className="snip">
        {(() => {
          const h = m.billHistory(b.id);
          if (!h.length) return "No history yet — it starts the first month this bill is paid or given its own amount.";
          const avg = h.reduce((n, x) => n + x.amount, 0) / h.length;
          return (
            <>
              {h.map((x) => (
                <span key={x.month} style={{ marginRight: 16 }}>
                  {monthLabel(x.month, true)} <b className="num" style={{ color: "#3A453F" }}>{money(x.amount)}</b>
                  {x.paid ? "" : <span className="muted"> planned</span>}
                  {x.conf ? <span className="muted num" style={{ fontSize: 11 }}> #{x.conf}</span> : ""}
                </span>
              ))}
              <span className="muted">averages {money(avg)} · usually {money(b.usual)}</span>
            </>
          );
        })()}
      </div>
      <div className="efoot">
        <button className="btn tiny" onClick={() => setOpen(false)}>Done</button>
        {b.overridden && (
          <button className="btn ghost tiny" onClick={() => makeUsual(b)}
            title="Adopt this month's amount as the usual going forward">
            Make {money(b.amount)} the usual
          </button>
        )}
        {paidBtn}
        {payHref && (
          <a className="btn ghost tiny" href={payHref} target="_blank" rel="noopener noreferrer"
            style={{ textDecoration: "none" }}>Open payment page ↗</a>
        )}
        <button className="btn ghost tiny" style={{ marginLeft: "auto", color: C.warn }}
          onClick={() => {
            if (!window.confirm(`Remove ${b.name}?`)) return;
            patch((s) => { s.bills.splice(i, 1); return s; });
          }}>
          Remove
        </button>
      </div>
    </div>
  );
}

function BillsView({ ctx }) {
  const { m, state, patch, plan, writeMonth, month, setMonth, setView } = ctx;
  const set = (i, f, v) => patch((s) => { s.bills[i][f] = v; return s; });
  const [nb, setNb] = useState({ name: "", company: "", amount: "", day: "", envId: "" });
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [sortBy, setSortBy] = useState("day");
  const [billQ, setBillQ] = useState("");
  const [nbErr, setNbErr] = useState("");
  const [adding, setAdding] = useState(false);

  // Typing an amount changes THIS month only; the usual amount stays as
  // the default for future months until "make usual" adopts the new one.
  const setBillAmount = (b, v) => writeMonth((mm) => {
    mm.billAmounts = mm.billAmounts || {};
    mm.billAmounts[b.id] = v;
    return mm;
  });
  const makeUsual = (b) => {
    patch((s) => {
      const x = s.bills.find((y) => y.id === b.id);
      if (x) x.amount = b.amount;
      return s;
    });
    writeMonth((mm) => {
      if (mm.billAmounts) delete mm.billAmounts[b.id];
      return mm;
    });
  };

  const guessEnv = (name) => {
    const n = name.toLowerCase();
    const rules = [
      [/rent|mortgage/, /rent|mortgage/],
      [/electric|water|gas|internet|wifi|phone|utilit|trash|sewer/, /utilit/],
      [/insurance/, /insurance/],
      [/credit card|card/, /credit|card/],
      [/car payment|auto loan|loan/, /debt/],
      [/stream|subscript|music/, /subscript/],
      [/work|office/, /work/],
      [/gym|dental|health/, /health/],
    ];
    for (const [k, e] of rules) {
      if (k.test(n)) {
        const env = plan.envelopes.find((x) => e.test(x.name.toLowerCase()));
        if (env) return env.id;
      }
    }
    return "";
  };

  const addBill = () => {
    if (!nb.name.trim()) { setNbErr("Give the bill a name."); return; }
    if (!num(nb.amount)) { setNbErr("Enter how much it costs."); return; }
    setNbErr("");
    patch((s) => {
      s.bills.push({
        id: uid(), name: nb.name.trim(), company: nb.company.trim(), amount: num(nb.amount),
        day: Math.min(31, Math.max(1, num(nb.day) || 1)),
        envId: nb.envId, owner: "joint",
      });
      return s;
    });
    setNb({ name: "", company: "", amount: "", day: "", envId: "" });
    setAdding(false);
  };
  const nbKey = (e) => e.key === "Enter" && addBill();

  const togglePaid = (b) => writeMonth((mm) => {
    mm.paid = mm.paid || [];
    mm.paidMeta = mm.paidMeta || {};
    if (mm.paid.includes(b.id)) {
      mm.paid = mm.paid.filter((x) => x !== b.id);
      delete mm.paidMeta[b.id];
      // Un-paying removes the entry the paid-toggle logged, so the toggle
      // is symmetric and never double-counts. billId stamps new entries;
      // the note match catches ones logged before the stamp existed.
      const k = mm.entries.findIndex((t) => t.billId === b.id);
      const k2 = k > -1 ? k : mm.entries.findIndex((t) =>
        t.envId === b.envId && t.amount === b.amount && t.note === b.name + " (bill)");
      if (k2 > -1) mm.entries.splice(k2, 1);
    } else {
      mm.paid.push(b.id);
      // Stamp when it was paid; the bill's editor can correct it or add a
      // confirmation number.
      mm.paidMeta[b.id] = { ...(mm.paidMeta[b.id] || {}), date: new Date().toISOString().slice(0, 10) };
      if (b.envId && mm.envelopes.some((e) => e.id === b.envId))
        mm.entries.unshift({
          id: uid(), billId: b.id, envId: b.envId, amount: b.amount, who: b.owner, note: b.name + " (bill)",
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
    }
    return mm;
  });

  const setPaidMeta = (b, f, v) => writeMonth((mm) => {
    mm.paidMeta = mm.paidMeta || {};
    mm.paidMeta[b.id] = { ...(mm.paidMeta[b.id] || {}), [f]: v };
    return mm;
  });

  return (
    <>
      <Head title="Bills & files" sub="The fixed stuff — mark one paid and it logs itself into the right category."
        right={<div className="headactions">
          <AddBtn label="Add bill" onClick={() => { setNb({ name: "", company: "", amount: "", day: "", envId: "" }); setNbErr(""); setAdding(true); }} />
          <MonthNav month={month} setMonth={setMonth} />
        </div>} />

      {adding && (
        <Modal title="Add a recurring bill" sub="Repeats every month. Tap a common one to prefill, or type your own." onClose={() => setAdding(false)}>
          <div className="chips" style={{ marginBottom: 4 }}>
            {COMMON_BILLS.map((b) => (
              <button key={b} className={"chip " + (nb.name === b ? "on" : "")}
                onClick={() => setNb({ ...nb, name: b, envId: guessEnv(b) })}>{b}</button>
            ))}
          </div>
          <Field label="Bill name">
            <input className="field" placeholder="Electric" value={nb.name} autoFocus
              onChange={(e) => setNb({ ...nb, name: e.target.value, envId: nb.envId || guessEnv(e.target.value) })} onKeyDown={nbKey} aria-label="Bill name" />
          </Field>
          <Field label="Company (optional)">
            <input className="field" placeholder="Comcast, Loancare…" value={nb.company}
              onChange={(e) => setNb({ ...nb, company: e.target.value })} onKeyDown={nbKey} aria-label="Company" />
          </Field>
          <div className="mrow">
            <Field label="Amount">
              <input className="field num" inputMode="decimal" placeholder="$0" value={nb.amount}
                onChange={(e) => setNb({ ...nb, amount: e.target.value })} onKeyDown={nbKey} aria-label="Amount" />
            </Field>
            <Field label="Due date">
              <input className="field num" type="date"
                value={nb.day ? `${month}-${String(nb.day).padStart(2, "0")}` : `${month}-01`}
                onChange={(e) => setNb({ ...nb, day: e.target.value ? Number(e.target.value.slice(8, 10)) : "" })}
                aria-label="Due date" />
            </Field>
          </div>
          <Field label="Budget category" err={nbErr}>
            <select className="field" value={nb.envId} onChange={(e) => setNb({ ...nb, envId: e.target.value })} aria-label="Category">
              <option value="">— none —</option>
              {plan.envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <button className="btn" onClick={addBill}>Add bill</button>
        </Modal>
      )}

      <Guidance m={m} theme="debt"
        line={m.billsLeft > 0 ? `${money(m.billsLeft)} in bills still to pay this month.` : "Everything owed this month is paid."} />

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Kpi label="Monthly bills" value={money(m.billsTotal)} foot={`${state.bills.length} recurring`}
          onClick={() => { setUnpaidOnly(false); scrollCard("billList"); }} />
        <Kpi label="Still unpaid" value={money(m.billsLeft)} tone={m.billsLeft > 0 ? "mid" : "up"}
          foot={m.billsLeft > 0 ? "tap to see only what's left" : "all settled"}
          onClick={() => setUnpaidOnly(!unpaidOnly)} active={unpaidOnly} />
        <Kpi label="Share of income" value={m.income ? Math.round((m.billsTotal / m.income) * 100) + "%" : "—"}
          onClick={() => setView("reports")} />
      </div>

      <div className="card" id="billList">
        <div className="chead" style={{ gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ marginRight: "auto" }}>The bills</h3>
          <input className="field" placeholder="Search bills" value={billQ} onChange={(e) => setBillQ(e.target.value)}
            style={{ width: "auto", minWidth: 150, padding: "6px 10px", fontSize: 13 }} aria-label="Search bills" />
          <label className="srt"><span>Sort</span>
            <select className="field" value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              style={{ minWidth: 130 }} aria-label="Sort bills">
              <option value="day">By due date</option>
              <option value="amount">Biggest first</option>
              <option value="name">By name</option>
              <option value="unpaid">Unpaid first</option>
              <option value="method">By how it's paid</option>
            </select>
          </label>
        </div>
        {state.bills.length === 0 && <p className="empty">Add the bills that repeat every month — rent, insurance, the streaming stack you forgot about.</p>}
        {unpaidOnly && m.bills.every((b) => b.paid) && state.bills.length > 0 &&
          <p className="empty">Nothing unpaid — every bill this month is settled.</p>}
        {m.bills
          .filter((b) => !unpaidOnly || !b.paid)
          .filter((b) => !billQ || (b.name + " " + (b.company || "")).toLowerCase().includes(billQ.toLowerCase()))
          .slice()
          .sort((x, y) =>
            sortBy === "amount" ? y.amount - x.amount
            : sortBy === "name" ? x.name.localeCompare(y.name)
            : sortBy === "unpaid" ? (x.paid ? 1 : 0) - (y.paid ? 1 : 0) || x.day - y.day
            : sortBy === "method" ? (x.payMethod || "zz").localeCompare(y.payMethod || "zz") || x.day - y.day
            : x.day - y.day)
          .map((b) => (
          <BillRow key={b.id} b={b} m={m} state={state} plan={plan} patch={patch} month={month}
            togglePaid={togglePaid} setBillAmount={setBillAmount} makeUsual={makeUsual} setPaidMeta={setPaidMeta} />
        ))}
      </div>

      <div className="grid g23" style={{ marginTop: 16 }} id="billStats">
        <div className="card">
          <div className="chead">
            <h3>What the bills have cost</h3>
            <span className="meta">by month — actuals where recorded</span>
          </div>
          {m.billPaidByMonth.every((x) => !x.Bills) ? (
            <p className="empty">This fills in as months go on record — each bar is that month's bills, actual amounts where they were recorded.</p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={m.billPaidByMonth} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} tickFormatter={compact} width={40} />
                <Tooltip content={<Tip />} cursor={{ fill: "rgba(22,32,29,.05)" }} />
                <Bar dataKey="Bills" fill={C.a} radius={3} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <div className="chead">
            <h3>The big ones</h3>
            <span className="meta">this month's amounts</span>
          </div>
          {(() => {
            const top = m.bills.slice().sort((x, y) => y.amount - x.amount).slice(0, 6);
            const max = top.length ? top[0].amount : 0;
            return top.length === 0 ? <p className="empty">No bills yet.</p> : top.map((b) => {
              const env = plan.envelopes.find((e) => e.id === b.envId);
              const c = env ? (GROUP_COLORS[env.group] || C.joint) : C.joint;
              return (
                <div key={b.id} style={{ padding: "7px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.name}{b.company ? <span className="muted"> — {b.company}</span> : ""}
                    </span>
                    <span className="num">{money(b.amount)}</span>
                  </div>
                  <div className="bar" style={{ marginTop: 5 }}>
                    <i style={{ width: (max ? (b.amount / max) * 100 : 0) + "%", background: c }} />
                  </div>
                </div>
              );
            });
          })()}
          <p className="mstone" style={{ marginTop: 12 }}>
            {[
              m.billMethodMix.auto ? `${m.billMethodMix.auto} on autopay` : "",
              m.billMethodMix.online ? `${m.billMethodMix.online} paid online` : "",
              m.billMethodMix.check ? `${m.billMethodMix.check} by check` : "",
              m.billMethodMix.unset ? `${m.billMethodMix.unset} not set — open a bill to say how it's paid` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 28, marginBottom: 12 }}>
        <h3 style={{ fontSize: 17 }}>The paper drawer</h3>
        <div className="sub" style={{ fontSize: 12.5, color: C.soft, marginTop: 3 }}>
          Receipts, statements, spreadsheets, Word docs — drop them here, search inside them, and let the planner read them.
        </div>
      </div>
      <FilesSection ctx={ctx} />
    </>
  );
}

/* ================================================================== */
/*  4b. files — the household's paper drawer                           */
/* ================================================================== */

const FOLDERS = ["Receipts", "Statements", "Insurance", "Taxes", "Home", "Other"];

/* Extract text from whatever gets dropped in: spreadsheets and Word docs
   are converted on-device (SheetJS / mammoth); everything else is read as
   plain text. Returns "" when a file has nothing readable in it. */
async function extractText(file) {
  const ext = (file.name.toLowerCase().split(".").pop() || "");
  const asArrayBuffer = () => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
  try {
    if (["xlsx", "xls", "ods", "csv", "tsv"].includes(ext)) {
      const wb = XLSX.read(await asArrayBuffer(), { type: "array" });
      return wb.SheetNames.map((n) => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n]).trim();
        return wb.SheetNames.length > 1 ? `== ${n} ==\n${csv}` : csv;
      }).filter(Boolean).join("\n\n");
    }
    if (ext === "docx") {
      const res = await mammoth.extractRawText({ arrayBuffer: await asArrayBuffer() });
      return res.value || "";
    }
    return await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsText(file);
    });
  } catch (e) {
    return "";
  }
}

function FilesSection({ ctx }) {
  const { state, patch, m } = ctx;
  const docs = state.docs || [];
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [open, setOpen] = useState(null);
  const [paste, setPaste] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [readErr, setReadErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [aq, setAq] = useState({});
  const [aerr, setAerr] = useState("");
  const fileRef = useRef(null);

  const addDoc = (name, text) => patch((s) => {
    s.docs = s.docs || [];
    s.docs.unshift({
      id: uid(), name: String(name).slice(0, 80), text: String(text).slice(0, 100000),
      folder: "Other",
      added: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    });
    return s;
  });

  const onFiles = async (list) => {
    setReadErr("");
    const skipped = [];
    for (const f of Array.from(list || [])) {
      const text = await extractText(f);
      if (text && text.trim()) addDoc(f.name, text);
      else skipped.push(f.name);
    }
    if (skipped.length) setReadErr(`Couldn't read ${skipped.join(", ")} — scanned images and PDFs aren't supported yet.`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const analyze = async (d) => {
    if (busyId) return;
    setBusyId(d.id); setAerr("");
    const question = (aq[d.id] || "").trim();
    try {
      const res = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 700,
          system:
            `You are the household financial planner for ${m.pA.name} and ${m.pB.name}, a couple who share money. ` +
            `They filed a document in their shared drawer and want your read on it. Be plain and specific: pull out ` +
            `amounts, dates, renewals, obligations, changes, and anything actionable for a household budget. ` +
            `Spreadsheets arrive as CSV text. Keep it under 200 words unless the document demands more. ` +
            `Their combined monthly take-home is ${m.income || "not set"}. If the document is empty or unreadable, say so plainly.`,
          messages: [{
            role: "user",
            content: `File: ${d.name}\n\n---\n${d.text.slice(0, 30000)}\n---\n\n${question || "What should we know from this?"}`,
          }],
        }),
      });
      const data = await res.json();
      const reply = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      if (!reply) throw new Error("empty reply");
      patch((s) => {
        const x = (s.docs || []).find((y) => y.id === d.id);
        if (x) x.analysis = reply;
        return s;
      });
    } catch (e) {
      setAerr("Couldn't reach the planner just now — try again in a moment.");
    }
    setBusyId(null);
  };

  const set = (id, f, v) => patch((s) => {
    const d = (s.docs || []).find((x) => x.id === id);
    if (d) d[f] = v;
    return s;
  });

  const rows = docs.filter((d) => {
    if (folder !== "all" && d.folder !== folder) return false;
    if (q) {
      const s = q.toLowerCase();
      return d.name.toLowerCase().includes(s) || d.text.toLowerCase().includes(s);
    }
    return true;
  });

  const snippet = (d) => {
    if (!q) return d.text.slice(0, 150);
    const i = d.text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return d.text.slice(0, 150);
    return (i > 30 ? "…" : "") + d.text.slice(Math.max(0, i - 30), i + 120);
  };

  return (
    <>
      <div
        className={"dropzone" + (dragOver ? " over" : "")}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
      >
        Drop files here — text, CSV, Excel (.xlsx), Word (.docx) — or{" "}
        <button className="btn ghost tiny" onClick={() => fileRef.current && fileRef.current.click()}>choose files</button>
        <input ref={fileRef} type="file" multiple accept=".txt,.md,.csv,.tsv,.log,.xlsx,.xls,.ods,.docx,text/*" style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)} aria-label="Upload files" />
        <div style={{ marginTop: 6, fontSize: 11 }}>
          Spreadsheets and Word documents are converted to text on your device, and nothing leaves this browser until you ask for an analysis.
        </div>
        {readErr && <div style={{ marginTop: 6, fontSize: 11.5, color: C.warn }}>{readErr}</div>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead"><h3>Or paste it in</h3><span className="meta">an emailed receipt, a confirmation, a policy summary</span></div>
        <textarea className="field" rows={3} placeholder="Paste any text worth keeping…" value={paste}
          onChange={(e) => setPaste(e.target.value)} aria-label="Paste text" />
        <button className="btn tiny" style={{ marginTop: 10 }} disabled={!paste.trim()}
          onClick={() => {
            const firstLine = paste.trim().split("\n")[0].slice(0, 50);
            addDoc(firstLine || "Pasted note", paste.trim());
            setPaste("");
          }}>Keep it</button>
      </div>

      <div className="toolbar">
        <input className="field" style={{ minWidth: 220 }} placeholder="Search inside everything"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search files" />
        <select className="field" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Filter by folder">
          <option value="all">All folders</option>
          {FOLDERS.map((f) => <option key={f}>{f}</option>)}
        </select>
        <span className="muted num" style={{ marginLeft: "auto" }}>{rows.length} of {docs.length}</span>
      </div>

      {docs.length === 0 && (
        <div className="card"><p className="empty">Nothing filed yet. Drop in the first receipt and this becomes the drawer you actually find things in.</p></div>
      )}
      {rows.map((d) => (
        <div className="doc" key={d.id}>
          <div className="rowname" style={{ justifyContent: "space-between" }}>
            <input value={d.name} onChange={(e) => set(d.id, "name", e.target.value)} aria-label="File name"
              style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 16 }} />
            <span style={{ display: "flex", gap: 6, alignItems: "center", flex: "none" }}>
              <select className="tag" value={d.folder || "Other"} onChange={(e) => set(d.id, "folder", e.target.value)} aria-label="File under">
                {FOLDERS.map((f) => <option key={f}>{f}</option>)}
              </select>
              <span className="muted" style={{ fontSize: 11 }}>{d.added}</span>
              <button className="btn ghost tiny" onClick={() => setOpen(open === d.id ? null : d.id)}>
                {open === d.id ? "Close" : "Open"}
              </button>
              <button className="kill" onClick={() => {
                if (!window.confirm(`Remove ${d.name}? Its text and the planner's read go with it.`)) return;
                patch((s) => { s.docs = (s.docs || []).filter((x) => x.id !== d.id); return s; });
              }} aria-label={`Remove ${d.name}`}>×</button>
            </span>
          </div>
          {open === d.id
            ? (
              <>
                <pre>{d.text}</pre>
                <div className="askrow" style={{ marginTop: 10 }}>
                  <input className="field" placeholder="Ask about this file, or leave blank for the planner's read"
                    value={aq[d.id] || ""} onChange={(e) => setAq({ ...aq, [d.id]: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && analyze(d)} aria-label="Question about this file" />
                  <button className="btn tiny" style={{ whiteSpace: "nowrap", flex: "none" }} disabled={busyId === d.id}
                    onClick={() => analyze(d)}>{busyId === d.id ? "Reading…" : "Analyze"}</button>
                </div>
                {aerr && busyId === null && <p className="snip" style={{ color: C.warn }}>{aerr}</p>}
              </>
            )
            : <p className="snip">{snippet(d)}{d.text.length > 150 ? "…" : ""}</p>}
          {d.analysis && (
            <div className="analysis">
              <span className="verseref">Planner's read</span>
              <p>{d.analysis}</p>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/* ================================================================== */
/*  5. goals                                                           */
/* ================================================================== */

function GoalsView({ ctx }) {
  const { m, state, patch, month, setView } = ctx;
  const totalTarget = state.goals.reduce((n, g) => n + g.target, 0);
  const totalSaved = state.goals.reduce((n, g) => n + g.saved, 0);
  const [lateOnly, setLateOnly] = useState(false);
  const lateCount = state.goals.filter((g) => m.goalStatus(g).late).length;
  const [np, setNp] = useState(null); // new-pot draft, or null when closed
  const addPot = () => {
    if (!np.name.trim()) { setNp({ ...np, err: "Give the pot a name." }); return; }
    patch((s) => {
      s.goals = s.goals || [];
      s.goals.push({ id: uid(), name: np.name.trim(), target: num(np.target), saved: num(np.saved),
        monthly: num(np.monthly), due: np.due || "", owner: "joint" });
      return s;
    });
    setNp(null);
  };

  return (
    <>
      <Head title="Pots" sub="Money set aside on purpose — save into each one, and pull from it when the time comes."
        right={<AddBtn label="New pot" onClick={() => setNp({ name: "", target: "", saved: "", monthly: "", due: "" })} />} />

      {np && (
        <Modal title="New pot" sub="A named place to save — a trip, a car, an emergency fund." onClose={() => setNp(null)}>
          <Field label="What's it for?" err={np.err}>
            <input className="field" placeholder="Emergency fund" value={np.name} autoFocus
              onChange={(e) => setNp({ ...np, name: e.target.value, err: "" })} aria-label="Pot name" />
          </Field>
          <div className="mrow">
            <Field label="Goal amount">
              <input className="field num" inputMode="decimal" placeholder="$0" value={np.target}
                onChange={(e) => setNp({ ...np, target: e.target.value })} aria-label="Goal amount" />
            </Field>
            <Field label="Already saved">
              <input className="field num" inputMode="decimal" placeholder="$0" value={np.saved}
                onChange={(e) => setNp({ ...np, saved: e.target.value })} aria-label="Already saved" />
            </Field>
          </div>
          <div className="mrow">
            <Field label="Save monthly">
              <input className="field num" inputMode="decimal" placeholder="$0" value={np.monthly}
                onChange={(e) => setNp({ ...np, monthly: e.target.value })} aria-label="Save monthly" />
            </Field>
            <Field label="Want it by (optional)">
              <input className="field num" type="month" value={np.due}
                onChange={(e) => setNp({ ...np, due: e.target.value })} aria-label="Want it by" />
            </Field>
          </div>
          <button className="btn" onClick={addPot}>Create pot</button>
        </Modal>
      )}

      <Guidance m={m} theme="diligence"
        line={m.goalMonthly > 0 ? `${money(m.goalMonthly)} a month moves toward what's next, little by little.` : "Nothing is flowing to your pots monthly yet."} />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Total saved" value={money(totalSaved)} foot={`of ${money(totalTarget)} across ${state.goals.length} pot${state.goals.length === 1 ? "" : "s"}`}
          onClick={() => setView("worth")} />
        <Kpi label="Going in monthly" value={money(m.goalMonthly)} foot="funded out of the plan"
          onClick={() => setView("budget")} />
        <Kpi label="Savings rate" value={Math.round(m.savingsRate) + "%"} tone={m.savingsRate >= 15 ? "up" : "mid"}
          onClick={() => setView("reports")} />
        <Kpi label="On track" value={`${state.goals.length - lateCount} / ${state.goals.length}`}
          foot={lateCount > 0 ? "tap to see what's behind" : "all where they should be"}
          onClick={() => setLateOnly(!lateOnly)} active={lateOnly} />
      </div>

      {state.goals.length === 0 && <div className="card"><p className="empty">No pots yet. Start with the one you'd both name first if someone asked.</p></div>}

      {lateOnly && lateCount === 0 && state.goals.length > 0 &&
        <div className="card" style={{ marginBottom: 14 }}><p className="empty">Nothing is behind — every pot is on pace for its date.</p></div>}

      {state.goals.filter((g) => !lateOnly || m.goalStatus(g).late).map((g) => (
        <PotCard key={g.id} g={g} ctx={ctx} />
      ))}
      <button className="btn ghost tiny" onClick={() => setNp({ name: "", target: "", saved: "", monthly: "", due: "" })}>+ New pot</button>
    </>
  );
}

// One savings pot: progress, projection, the fields, and a keyboard-
// friendly add/withdraw control that moves money in and out of `saved`.
function PotCard({ g, ctx }) {
  const { m, state, patch, month } = ctx;
  const i = state.goals.findIndex((x) => x.id === g.id);
  const st = m.goalStatus(g);
  const set = (f, v) => patch((s) => { const x = s.goals.find((y) => y.id === g.id); if (x) x[f] = v; return s; });
  const [move, setMove] = useState("");
  const [err, setErr] = useState("");
  const moveMoney = (dir) => {
    const amt = num(move);
    if (!amt) { setErr("Enter an amount first."); return; }
    if (dir < 0 && amt > g.saved) { setErr(`Only ${money(g.saved)} is in this pot.`); return; }
    setErr(""); setMove("");
    set("saved", Math.max(0, g.saved + dir * amt));
  };
  const proj = [];
  if (g.monthly > 0 && st.remaining > 0) {
    const steps = Math.min(st.monthsNeeded, 24);
    for (let k = 0; k <= steps; k++)
      proj.push({ label: monthLabel(shiftMonth(month, k), true), Projected: Math.min(g.target, g.saved + g.monthly * k) });
  }
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="chead">
        <input className="field" style={{ border: "none", background: "none", fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 19, fontWeight: 800, padding: 0 }}
          value={g.name} onChange={(e) => set("name", e.target.value)} aria-label="Pot name" />
        <button className="kill" onClick={() => {
          if (!window.confirm(`Remove ${g.name}? It has ${money(g.saved)} recorded toward it.`)) return;
          patch((s) => { s.goals = s.goals.filter((y) => y.id !== g.id); return s; });
        }} aria-label={`Remove ${g.name}`}>×</button>
      </div>
      <div className="potnum"><b className="num">{money(g.saved)}</b><span className="muted"> of {money(g.target)} · {Math.round(st.pct)}%</span></div>
      <div className="track"><i style={{ width: st.pct + "%", background: st.late ? C.warn : C.a }} /></div>
      <div className="metaline" style={{ marginTop: 10 }}>
        {st.done ? <span className="flag ok">Funded</span>
          : st.eta ? <span>lands <b>{monthLabel(st.eta)}</b>{g.due ? ` · wanted by ${monthLabel(g.due)}` : ""}</span>
            : <span>add a monthly amount to see when it lands</span>}
        {st.late && <span className="flag late">needs {money(st.needed)}/mo</span>}
        {!st.late && g.due && !st.done && <span className="flag ok">on pace</span>}
      </div>

      <div className="potmove">
        <MoneyInput value={move} placeholder="Amount" onCommit={() => {}} onChange={(e) => { setMove(e.target.value); setErr(""); }}
          aria-label={`Move money for ${g.name}`} />
        <button className="btn tiny" onClick={() => moveMoney(1)}>Add money</button>
        <button className="btn ghost tiny" onClick={() => moveMoney(-1)}>Withdraw</button>
        {g.monthly > 0 && <button className="btn ghost tiny" onClick={() => set("saved", g.saved + g.monthly)}>+ this month's {money(g.monthly)}</button>}
        {err && <span className="fielderr">{err}</span>}
      </div>

      {proj.length > 2 && (
        <div style={{ height: 120, marginTop: 14 }}>
          <ResponsiveContainer>
            <LineChart data={proj} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} tickFormatter={compact} width={46} />
              <Tooltip content={<Tip />} />
              <ReferenceLine y={g.target} stroke={C.joint} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="Projected" stroke={C.a} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="fourup">
        <div><label className="lbl">Target</label><MoneyInput value={g.target} placeholder="0" onCommit={(v) => set("target", v)} aria-label="Target" /></div>
        <div><label className="lbl">Saved</label><MoneyInput value={g.saved} placeholder="0" onCommit={(v) => set("saved", v)} aria-label="Saved" /></div>
        <div><label className="lbl">Monthly</label><MoneyInput value={g.monthly} placeholder="0" onCommit={(v) => set("monthly", v)} aria-label="Monthly" /></div>
        <div><label className="lbl">Want it by</label><input className="field num" type="month" value={g.due || ""} onChange={(e) => set("due", e.target.value)} /></div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  5d. insights — the intelligence hub                                */
/* ================================================================== */

// Reads the household's own history for patterns worth knowing, and turns
// the debt accounts into side-by-side payoff scenarios you can steer.
function Insights({ ctx }) {
  const { m, plan, state, month, setView } = ctx;
  const [extra, setExtra] = useState("");
  const [strategy, setStrategy] = useState("avalanche");

  // Spend by group for any month object.
  const groupSpendFor = (mm) => {
    if (!mm) return {};
    const gof = {}; (mm.envelopes || []).forEach((e) => { gof[e.id] = e.group || "Other"; });
    const out = {}; (mm.entries || []).forEach((t) => { const g = gof[t.envId] || "Other"; out[g] = (out[g] || 0) + t.amount; });
    return out;
  };
  const cur = groupSpendFor(plan);
  const priorKeys = [1, 2, 3].map((i) => shiftMonth(month, -i));
  const priorData = priorKeys.map((k) => groupSpendFor(state.months[k])).filter((o) => Object.keys(o).length);
  const movers = GROUPS.map((g) => {
    const now = cur[g] || 0;
    const priors = priorData.map((o) => o[g] || 0);
    const avg = priors.length ? priors.reduce((n, x) => n + x, 0) / priors.length : 0;
    return { g, now, avg, diff: now - avg, pct: avg > 0 ? ((now - avg) / avg) * 100 : (now > 0 ? 100 : 0) };
  }).filter((x) => x.now > 0 || x.avg > 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // Top merchants / notes this month.
  const byNote = {};
  plan.entries.forEach((t) => { const k = (t.note || "").trim() || "Unlabelled"; byNote[k] = (byNote[k] || 0) + t.amount; });
  const topNotes = Object.entries(byNote).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Debt payoff scenarios.
  const hasDebt = m.debts.length > 0;
  const baseAv = m.payoff(0, "avalanche");
  const baseSb = m.payoff(0, "snowball");
  const base = strategy === "snowball" ? baseSb : baseAv;
  const withX = m.payoff(num(extra), strategy);
  const interestSaved = Math.max(0, base.interest - withX.interest);
  const monthsSaved = Math.max(0, base.months - withX.months);
  // Overlay the two series for the chart.
  const maxLen = Math.max(base.series.length, withX.series.length);
  const payChart = [];
  for (let i = 0; i < maxLen; i++) {
    payChart.push({
      label: monthLabel(shiftMonth(month, i), true),
      "At minimums": base.series[i] ? Math.round(base.series[i].balance) : 0,
      "With extra": withX.series[i] ? Math.round(withX.series[i].balance) : (i < maxLen ? 0 : undefined),
    });
  }

  const verse = m.faithOn ? verseForDay(hasDebt ? "debt" : "diligence") : null;

  return (
    <>
      <Head title="Insights" sub="What your numbers are quietly telling you — patterns, movers, and the way out of debt." />

      {m.faithOn && verse && (
        <div className="guide">
          <div>
            <p className="gverse">“{verse.text}”</p>
            <span className="gref">{verse.ref}</span>
            <span className="gline">{hasDebt ? `${money(m.debtTotal)} owed today — here's the fastest road out.` : "Watching the patterns is how the diligent stay ahead."}</span>
          </div>
        </div>
      )}

      {/* Health score, compact */}
      <HealthCard m={m} setView={setView} />

      {/* Spending patterns */}
      <div className="grid g23" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead"><h3>What moved this month</h3><span className="meta">vs. your {priorData.length || 0}-month average</span></div>
          {movers.length === 0 || priorData.length === 0 ? (
            <p className="empty">Once you have a couple of months logged, the biggest changes show up here.</p>
          ) : movers.slice(0, 6).map((x) => (
            <div className="mover" key={x.g}>
              <span className="mv-dot" style={{ background: GROUP_COLORS[x.g] || C.soft }} />
              <span className="mv-nm">{x.g}</span>
              <span className="mv-bar">
                <i style={{ width: Math.min(100, Math.abs(x.pct)) + "%", background: x.diff > 0 ? C.warn : C.good, marginLeft: x.diff > 0 ? "50%" : `${50 - Math.min(50, Math.abs(x.pct) / 2)}%` }} />
                <span className="mv-mid" />
              </span>
              <span className="mv-fig num" style={{ color: x.diff > 0 ? C.warn : C.good }}>
                {x.diff > 0 ? "▲" : "▼"} {Math.abs(Math.round(x.pct))}%
              </span>
              <span className="mv-amt num muted">{money(x.now)}</span>
            </div>
          ))}
          {movers.length > 0 && priorData.length > 0 && (
            <p className="mstone" style={{ marginTop: 12 }}>
              {(() => {
                const up = movers.find((x) => x.diff > 1);
                const down = movers.find((x) => x.diff < -1);
                if (up && Math.abs(up.diff) >= (down ? Math.abs(down.diff) : 0))
                  return `${up.g} is up ${money(up.diff)} on your average — the biggest change this month.`;
                if (down) return `${down.g} is down ${money(-down.diff)} — nice restraint there.`;
                return "Spending is close to your usual across the board.";
              })()}
            </p>
          )}
        </div>

        <div className="card">
          <div className="chead"><h3>Where it's going</h3><span className="meta">top this month</span></div>
          {topNotes.length === 0 ? <p className="empty">Nothing logged yet this month.</p> :
            topNotes.map(([n, amt]) => {
              const max = topNotes[0][1];
              return (
                <div className="topn" key={n}>
                  <div className="topn-h"><span className="topn-nm">{n}</span><span className="num">{money(amt)}</span></div>
                  <div className="track" style={{ margin: "6px 0 0" }}><i style={{ width: (max ? (amt / max) * 100 : 0) + "%", background: C.a }} /></div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Cash-flow trend */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead"><h3>The trend</h3><span className="meta">income vs. spending, six months</span></div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={m.history} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="giS" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.a} stopOpacity={0.25} /><stop offset="100%" stopColor={C.a} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="label" {...axis} /><YAxis {...axis} tickFormatter={compact} width={46} />
              <Tooltip content={<Tip />} cursor={{ stroke: C.line }} />
              <Area type="monotone" dataKey="spent" name="Spent" stroke={C.a} fill="url(#giS)" strokeWidth={2} />
              <Line type="monotone" dataKey="income" name="Income" stroke={C.ink} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Debt payoff scenarios */}
      <div className="card">
        <div className="chead"><h3>Debt payoff scenarios</h3>
          <button className="seelink" onClick={() => setView("worth")}>Manage debts →</button></div>
        {!hasDebt ? (
          <p className="empty">No debts on record — nothing owed is a strong place to build from. Add any loans on Net worth to model a payoff.</p>
        ) : (
          <>
            <div className="toolbar" style={{ marginBottom: 16 }}>
              <div className="chips" style={{ marginBottom: 0 }}>
                <button className={"chip " + (strategy === "avalanche" ? "on" : "")} onClick={() => setStrategy("avalanche")}>Avalanche · highest rate first</button>
                <button className={"chip " + (strategy === "snowball" ? "on" : "")} onClick={() => setStrategy("snowball")}>Snowball · smallest first</button>
              </div>
              <label className="srt" style={{ marginLeft: "auto" }}><span>Extra / mo</span>
                <input className="field num" style={{ width: 110 }} inputMode="decimal" placeholder="$0" value={extra}
                  onChange={(e) => setExtra(e.target.value)} aria-label="Extra per month" />
              </label>
            </div>
            <div className="grid g3" style={{ gap: 12, marginBottom: 16 }}>
              <div className="tripstat"><span className="v-l">Debt-free in</span><b className="num">{withX.months ? `${withX.months} mo` : "—"}</b><span className="muted" style={{ fontSize: 11.5 }}>{withX.months ? monthLabel(shiftMonth(month, withX.months)) : "add a payment"}</span></div>
              <div className="tripstat"><span className="v-l">Interest you'll pay</span><b className="num">{money(withX.interest)}</b>{interestSaved > 0 && <span className="muted" style={{ fontSize: 11.5, color: C.good }}>saves {money(interestSaved)}</span>}</div>
              <div className="tripstat"><span className="v-l">Sooner by</span><b className="num" style={{ color: monthsSaved > 0 ? C.good : undefined }}>{monthsSaved ? `${monthsSaved} mo` : "—"}</b><span className="muted" style={{ fontSize: 11.5 }}>{num(extra) > 0 ? `with ${money(num(extra))}/mo extra` : "add extra to compare"}</span></div>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={payChart} margin={{ top: 6, right: 10, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
                  <YAxis {...axis} tickFormatter={compact} width={46} />
                  <Tooltip content={<Tip />} />
                  <Line type="monotone" dataKey="At minimums" stroke={C.soft} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="With extra" stroke={C.a} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="railkey" style={{ marginTop: 10 }}>
              <span><i className="dot" style={{ background: C.soft }} />At minimums</span>
              <span><i className="dot" style={{ background: C.a }} />With {money(num(extra))}/mo extra</span>
            </div>
            <p className="mstone" style={{ marginTop: 12 }}>
              Order to attack: <b>{withX.order.join(" → ")}</b>.{" "}
              {strategy === "avalanche" ? "Avalanche kills the priciest interest first — the cheapest path." : "Snowball clears whole balances fast — the most motivating path."}
            </p>
          </>
        )}
      </div>
    </>
  );
}

/* ================================================================== */
/*  5c. calendar — the month at a glance                               */
/* ================================================================== */

// A month grid showing what lands each day: bills due, income expected,
// and spending logged. Click a day to see everything on it.
function CalendarView({ ctx }) {
  const { m, plan, state, month, setMonth, setView } = ctx;
  const [sel, setSel] = useState(null);
  const [y, mo] = month.split("-").map(Number);
  const first = new Date(y, mo - 1, 1).getDay(); // 0 Sun … 6 Sat
  const days = new Date(y, mo, 0).getDate();
  const isLive = month === monthKey(new Date());
  const todayD = isLive ? todayDay() : -1;

  // Build a per-day bucket of events.
  const byDay = {};
  const push = (d, ev) => { if (d >= 1 && d <= days) (byDay[d] = byDay[d] || []).push(ev); };
  m.bills.forEach((b) => push(b.day, {
    kind: "bill", label: b.name, amount: b.amount,
    tone: b.paid ? "paid" : b.overdue ? "warn" : "bill",
    note: b.paid ? "paid" : b.overdue ? "overdue" : "due",
  }));
  m.paychecks.forEach((i) => push(i.day, { kind: "in", label: i.name, amount: i.amount, tone: "in", note: "income" }));
  m.expected.forEach((i) => push(i.day, { kind: "in", label: i.name, amount: i.amount, tone: "in", note: "expected" }));
  plan.entries.forEach((t) => {
    if (!t.day) return;
    const e = plan.envelopes.find((x) => x.id === t.envId);
    push(t.day, { kind: "spend", label: t.note || (e ? e.name : "Spending"), amount: t.amount, tone: "spend", note: "spent" });
  });
  (state.scenarios || []).forEach((sc) => {
    if ((sc.date || "").slice(0, 7) === month) push(Number(sc.date.slice(8, 10)), { kind: "plan", label: sc.name, amount: num(sc.amount), tone: "plan", note: "planned" });
  });

  const toneC = { bill: C.b, warn: C.warn, paid: C.good, in: C.good, spend: C.a, plan: C.joint };
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const selItems = sel ? (byDay[sel] || []) : [];
  const dueThisMonth = m.bills.reduce((n, b) => n + (b.paid ? 0 : b.amount), 0);

  return (
    <>
      <Head title="Calendar" sub="Everything that lands this month — bills, income, and spending, day by day."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <Guidance m={m} theme="planning"
        line={dueThisMonth > 0 ? `${money(dueThisMonth)} in bills still to land this month.` : "Nothing left to pay this month."} />

      <div className="card">
        <div className="cal-key">
          <span><i className="dot" style={{ background: C.b }} />Bill due</span>
          <span><i className="dot" style={{ background: C.warn }} />Overdue</span>
          <span><i className="dot" style={{ background: C.good }} />Income</span>
          <span><i className="dot" style={{ background: C.a }} />Spending</span>
          <span><i className="dot" style={{ background: C.joint }} />Planned</span>
        </div>
        <div className="cal-grid cal-head">
          {wd.map((d) => <div key={d} className="cal-wd">{d}</div>)}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (d === null) return <div key={"e" + i} className="cal-cell empty" />;
            const items = byDay[d] || [];
            return (
              <button key={d} className={"cal-cell" + (d === todayD ? " today" : "") + (sel === d ? " sel" : "")}
                onClick={() => setSel(sel === d ? null : d)} aria-label={`Day ${d}, ${items.length} item${items.length === 1 ? "" : "s"}`}>
                <span className="cal-d">{d}</span>
                <span className="cal-dots">
                  {items.slice(0, 4).map((ev, k) => <i key={k} className="cal-dot" style={{ background: toneC[ev.tone] }} />)}
                </span>
                {items.slice(0, 2).map((ev, k) => (
                  <span key={k} className="cal-ev" style={{ color: toneC[ev.tone] }}>{money(ev.amount)}</span>
                ))}
                {items.length > 2 && <span className="cal-more">+{items.length - 2} more</span>}
                {items.length > 0 && (
                  <span className="cal-tip" role="tooltip">
                    <b className="cal-tip-d">{monthLabel(month, false).replace(/ \d{4}/, "")} {d}</b>
                    {items.map((ev, k) => (
                      <span className="cal-tip-row" key={k}>
                        <i className="cal-dot" style={{ background: toneC[ev.tone] }} />
                        <span className="cal-tip-nm">{ev.label}</span>
                        <span className="cal-tip-am num" style={{ color: ev.tone === "in" ? C.good : undefined }}>
                          {ev.tone === "in" ? "+" : ""}{money(ev.amount)}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {sel && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="chead">
            <h3>{monthLabel(month, false).replace(/ \d{4}/, "")} {sel}{sel === todayD ? " · today" : ""}</h3>
            <button className="seelink" onClick={() => setSel(null)}>Close</button>
          </div>
          {selItems.length === 0 ? <p className="empty">Nothing lands on this day.</p> :
            selItems.map((ev, k) => (
              <div className="note" key={k} style={{ justifyContent: "space-between" }}>
                <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <span className="tick" style={{ background: toneC[ev.tone], minHeight: 15 }} />
                  <span>{ev.label}<span className="muted"> · {ev.note}</span></span>
                </span>
                <span className="num" style={{ color: ev.tone === "in" ? C.good : undefined }}>
                  {ev.tone === "in" ? "+" : ev.tone === "spend" || ev.tone === "bill" || ev.tone === "warn" ? "−" : ""}{money(ev.amount).replace(/^-/, "")}
                </span>
              </div>
            ))}
          {selItems.some((e) => e.kind === "bill") && (
            <button className="btn ghost tiny" style={{ marginTop: 12 }} onClick={() => setView("bills")}>Open bills</button>
          )}
        </div>
      )}
    </>
  );
}

/* ================================================================== */
/*  5b. plan ahead — the what-if builder                               */
/* ================================================================== */

// Little estimators so a line item isn't a wild guess. The right one is
// chosen from the item's name; each returns a dollar figure to drop in.
function calcSpec(name, tripDays) {
  const n = (name || "").toLowerCase();
  const d = num(tripDays) || "";
  if (/gas|fuel|petrol|mileage|drive|driving/.test(n)) return {
    title: "Gas estimator",
    fields: [["miles", "Round-trip miles", ""], ["mpg", "Your car's MPG", "25"], ["price", "$ per gallon", "3.50"]],
    compute: (v) => num(v.mpg) > 0 ? (num(v.miles) / num(v.mpg)) * num(v.price) : 0,
    line: (v) => `${num(v.miles)} mi ÷ ${num(v.mpg)} mpg × $${num(v.price)}/gal`,
  };
  if (/food|grocer|meal|eat|dining/.test(n)) return {
    title: "Food estimator",
    fields: [["people", "People", "2"], ["days", "Days", d || "7"], ["rate", "$ per person / day", "40"]],
    compute: (v) => num(v.people) * num(v.days) * num(v.rate),
    line: (v) => `${num(v.people)} people × ${num(v.days)} days × $${num(v.rate)}/day`,
  };
  if (/hotel|lodg|airbnb|stay|resort|room/.test(n)) return {
    title: "Lodging estimator",
    fields: [["nights", "Nights", d || "6"], ["rate", "$ per night", "150"]],
    compute: (v) => num(v.nights) * num(v.rate),
    line: (v) => `${num(v.nights)} nights × $${num(v.rate)}/night`,
  };
  if (/flight|airfare|plane|air|ticket/.test(n)) return {
    title: "Flights estimator",
    fields: [["travelers", "Travelers", "2"], ["price", "$ per ticket", "350"]],
    compute: (v) => num(v.travelers) * num(v.price),
    line: (v) => `${num(v.travelers)} tickets × $${num(v.price)}`,
  };
  if (/car|rental|uber|lyft|taxi|transport/.test(n)) return {
    title: "Rental / rides estimator",
    fields: [["days", "Days", d || "7"], ["rate", "$ per day", "55"]],
    compute: (v) => num(v.days) * num(v.rate),
    line: (v) => `${num(v.days)} days × $${num(v.rate)}/day`,
  };
  return {
    title: "Quick estimator",
    fields: [["qty", "How many", "1"], ["rate", "$ each", "0"]],
    compute: (v) => num(v.qty) * num(v.rate),
    line: (v) => `${num(v.qty)} × $${num(v.rate)}`,
  };
}

function TripItem({ it, tripDays, onName, onAmount, onDel }) {
  const [open, setOpen] = useState(false);
  const spec = calcSpec(it.name, tripDays);
  const [vals, setVals] = useState(() => Object.fromEntries(spec.fields.map(([k, , def]) => [k, def])));
  // Re-seed defaults when the item name changes the estimator type.
  const specKey = spec.title;
  useEffect(() => { setVals(Object.fromEntries(spec.fields.map(([k, , def]) => [k, def]))); }, [specKey]);
  const result = spec.compute(vals);
  return (
    <div className="brk-item">
      <div className="brk-row">
        <input className="field" placeholder="e.g. Flights" value={it.name}
          onChange={(e) => onName(e.target.value)} aria-label="Item name" />
        <MoneyInput value={it.amount} placeholder="$0" onCommit={onAmount} aria-label="Item amount" />
        <button className={"calcbtn" + (open ? " on" : "")} onClick={() => setOpen(!open)} title="Estimate this" aria-label="Estimate this line">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 10h0M12 10h0M16 10h0M8 14h0M12 14h0M16 14h4M8 18h0M12 18h0" /></svg>
        </button>
        <button className="kill" onClick={onDel} aria-label="Remove item">×</button>
      </div>
      {open && (
        <div className="calcpanel">
          <div className="calc-title">{spec.title}</div>
          <div className="calc-fields">
            {spec.fields.map(([k, label]) => (
              <label className="calc-f" key={k}>
                <span>{label}</span>
                <input className="field num" inputMode="decimal" value={vals[k]}
                  onChange={(e) => setVals({ ...vals, [k]: e.target.value })} aria-label={label} />
              </label>
            ))}
          </div>
          <div className="calc-foot">
            <span className="calc-res">{spec.line(vals)} = <b className="num">{money(result)}</b></span>
            <button className="btn tiny" onClick={() => { onAmount(Math.round(result * 100) / 100); setOpen(false); }}>Use {money(result)}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Enter something big and dated (a vacation, a move, a big purchase) and
// see how it lands on the month: what it takes to be ready, what it does
// to free cash flow and the emergency cushion. Scenarios persist in
// state.scenarios and can be committed as a real goal.
function PlanAhead({ ctx }) {
  const { m, state, patch, month, setView } = ctx;
  const scenarios = state.scenarios || [];
  const defaultDate = `${shiftMonth(month, 3)}-15`;

  const upsert = (id, f, v) => patch((s) => {
    s.scenarios = s.scenarios || [];
    const x = s.scenarios.find((y) => y.id === id);
    if (x) x[f] = v;
    return s;
  });
  const add = () => patch((s) => {
    s.scenarios = [...(s.scenarios || []), { id: uid(), name: "Vacation", amount: 3000, date: defaultDate, fund: "save", items: [], days: "" }];
    return s;
  });
  const remove = (id) => patch((s) => { s.scenarios = (s.scenarios || []).filter((y) => y.id !== id); return s; });
  // Line items — the penny-level breakdown of a trip.
  const addItem = (id) => patch((s) => {
    const x = (s.scenarios || []).find((y) => y.id === id);
    if (x) x.items = [...(x.items || []), { id: uid(), name: "", amount: 0 }];
    return s;
  });
  const setItem = (id, iid, f, v) => patch((s) => {
    const x = (s.scenarios || []).find((y) => y.id === id);
    const it = x && (x.items || []).find((z) => z.id === iid);
    if (it) it[f] = v;
    return s;
  });
  const delItem = (id, iid) => patch((s) => {
    const x = (s.scenarios || []).find((y) => y.id === id);
    if (x) x.items = (x.items || []).filter((z) => z.id !== iid);
    return s;
  });
  const TRIP_ITEMS = ["Flights", "Hotel", "Food", "Rental car", "Activities", "Spending money"];
  const seedItems = (id) => patch((s) => {
    const x = (s.scenarios || []).find((y) => y.id === id);
    if (x && (!x.items || !x.items.length)) x.items = TRIP_ITEMS.map((n) => ({ id: uid(), name: n, amount: 0 }));
    return s;
  });

  // Per-scenario math. When a breakdown exists, the cost is the sum of the
  // line items (to the penny); otherwise the single Cost figure.
  const rows = scenarios.map((sc) => {
    const target = (sc.date || defaultDate).slice(0, 7);
    const monthsUntil = Math.max(1, monthsBetween(month, target));
    const items = sc.items || [];
    const hasItems = items.length > 0;
    const amount = hasItems ? items.reduce((n, it) => n + num(it.amount), 0) : num(sc.amount);
    const monthly = sc.fund === "save" ? amount / monthsUntil : 0;
    // What you could set aside by the date at today's free cash flow, and the
    // exact gap or headroom against the trip's cost.
    const canSaveBy = Math.max(0, m.monthlyNet) * monthsUntil;
    const pool = sc.fund === "cash" ? m.cashTotal : canSaveBy;
    const headroom = pool - amount;
    const days = num(sc.days);
    const perDay = days > 0 ? amount / days : 0;
    return { ...sc, amount, target, monthsUntil, monthly, items, hasItems, canSaveBy, pool, headroom, days, perDay };
  });
  const extraMonthly = rows.filter((r) => r.fund === "save").reduce((n, r) => n + r.monthly, 0);
  const cashHit = rows.filter((r) => r.fund === "cash").reduce((n, r) => n + r.amount, 0);
  const newNet = m.monthlyNet - extraMonthly;
  const newCash = m.cashTotal - cashHit;
  const newRunway = m.monthlyCost > 0 ? newCash / m.monthlyCost : 0;

  // Rough cash projection: general cash climbs by free cash flow, less
  // what these plans set aside or spend, month by month for a year.
  const horizon = Math.min(18, Math.max(12, ...rows.map((r) => r.monthsUntil + 1)));
  const proj = [];
  for (let i = 0; i <= horizon; i++) {
    let drag = 0;
    rows.forEach((r) => {
      if (r.fund === "save") drag += Math.min(i, r.monthsUntil) * r.monthly;
      else if (i >= r.monthsUntil) drag += r.amount;
    });
    proj.push({
      label: monthLabel(shiftMonth(month, i), true),
      "As you are": Math.round(m.cashTotal + m.monthlyNet * i),
      "With this plan": Math.round(m.cashTotal + m.monthlyNet * i - drag),
    });
  }

  const verdict = !rows.length ? null
    : newNet < -1 ? { tone: "serious", text: `Setting aside ${money(extraMonthly)} a month would run the month ${money(-newNet)} short. Push the date out, trim a category, or cover part from savings.` }
    : cashHit > 0 && newRunway < 1 ? { tone: "serious", text: `Paying ${money(cashHit)} from savings drops your cushion to ${newRunway.toFixed(1)} months — below one month of costs. Consider saving toward it instead.` }
    : cashHit > 0 && newRunway < 3 ? { tone: "watch", text: `Doable — but paying from savings takes your cushion from ${m.runwayMonths.toFixed(1)} to ${newRunway.toFixed(1)} months. Building it back is the follow-up.` }
    : extraMonthly > 0 ? { tone: "good", text: `You can do this. ${money(extraMonthly)} a month gets you there and still leaves ${money(newNet)} of free cash flow.` }
    : { tone: "good", text: `Covered from savings with the cushion intact at ${newRunway.toFixed(1)} months.` };

  return (
    <>
      <Head title="Plan ahead" sub="Enter something big and coming up — see what it takes and how it lands on your month." />

      <Guidance m={m} theme="planning"
        line={rows.length ? `${rows.length} plan${rows.length === 1 ? "" : "s"} on the board, ${money(extraMonthly)} a month to be ready.` : "Nothing on the board yet — add a trip, a move, or a big purchase below."} />

      {verdict && (
        <div className={"card health"} style={{ marginBottom: 16 }}>
          <div className="health-top">
            <div className="health-head" style={{ minWidth: 0 }}>
              <div className="biglab">The read</div>
              <p className="hr" style={{ marginTop: 8, fontSize: 15 }}>{verdict.text}</p>
            </div>
          </div>
          <div className="vitals" style={{ marginTop: 16, paddingTop: 16 }}>
            <div className="vital">
              <div className="v-h"><span className="v-dot" style={{ background: extraMonthly > 0 ? C.b : C.soft }} /><span className="v-l">Set aside / month</span></div>
              <div className="v-v">{extraMonthly > 0 ? money(extraMonthly) : "—"}</div>
              <div className="v-n">across {rows.filter((r) => r.fund === "save").length || "no"} saved-up plan{rows.filter((r) => r.fund === "save").length === 1 ? "" : "s"}</div>
            </div>
            <div className="vital">
              <div className="v-h"><span className="v-dot" style={{ background: newNet < 0 ? C.warn : C.good }} /><span className="v-l">Free cash flow</span></div>
              <div className={"v-v " + (newNet < 0 ? "v-serious" : "v-good")}>{(newNet >= 0 ? "+" : "−") + money(Math.abs(newNet)).replace(/^-/, "")}</div>
              <div className="v-n">was {(m.monthlyNet >= 0 ? "+" : "−") + money(Math.abs(m.monthlyNet)).replace(/^-/, "")} a month</div>
            </div>
            <div className="vital">
              <div className="v-h"><span className="v-dot" style={{ background: cashHit === 0 ? C.soft : newRunway < 1 ? C.warn : newRunway < 3 ? C.b : C.good }} /><span className="v-l">Emergency runway</span></div>
              <div className="v-v">{cashHit > 0 ? `${newRunway.toFixed(1)} mo` : `${m.runwayMonths.toFixed(1)} mo`}</div>
              <div className="v-n">{cashHit > 0 ? `was ${m.runwayMonths.toFixed(1)} months before this` : "unchanged — nothing from savings"}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead"><h3>What's coming up</h3><span className="meta">a trip, a move, a big purchase</span></div>
        {rows.length === 0 && <p className="empty">Add something you know is coming and we'll show what it takes to be ready.</p>}
        {rows.map((r) => (
          <div className="editor" key={r.id} style={{ marginTop: 10 }}>
            <div className="fields">
              <div>
                <label className="lbl">What is it</label>
                <input className="field" value={r.name} onChange={(e) => upsert(r.id, "name", e.target.value)} aria-label="What is it" />
              </div>
              <div>
                <label className="lbl">{r.hasItems ? "Total (from breakdown)" : "Total cost"}</label>
                {r.hasItems
                  ? <div className="field num" style={{ background: "#EFEADF", color: C.soft }}>{money(r.amount)}</div>
                  : <MoneyInput value={r.amount} onCommit={(v) => upsert(r.id, "amount", v)} aria-label="Total cost" />}
              </div>
              <div>
                <label className="lbl">When</label>
                <input className="field num" type="date" value={r.date || defaultDate}
                  onChange={(e) => e.target.value && upsert(r.id, "date", e.target.value)} aria-label="When" />
              </div>
              <div>
                <label className="lbl">How you'll fund it</label>
                <select className="field" value={r.fund} onChange={(e) => upsert(r.id, "fund", e.target.value)} aria-label="How you'll fund it">
                  <option value="save">Save up monthly</option>
                  <option value="cash">Pay from savings</option>
                </select>
              </div>
              <div>
                <label className="lbl">Trip length (nights)</label>
                <input className="field num" inputMode="numeric" placeholder="—" value={r.days || ""}
                  onChange={(e) => upsert(r.id, "days", e.target.value)} aria-label="Nights" />
              </div>
            </div>

            {/* Penny-level breakdown */}
            <div className="brk">
              <div className="brk-head">
                <span className="lbl" style={{ margin: 0 }}>Break it down — to the penny</span>
                {!r.items.length && <button className="btn ghost tiny" onClick={() => seedItems(r.id)}>Use a trip template</button>}
              </div>
              {r.items.map((it) => (
                <TripItem key={it.id} it={it} tripDays={r.days}
                  onName={(v) => setItem(r.id, it.id, "name", v)}
                  onAmount={(v) => setItem(r.id, it.id, "amount", v)}
                  onDel={() => delItem(r.id, it.id)} />
              ))}
              <button className="btn ghost tiny" style={{ marginTop: 6 }} onClick={() => addItem(r.id)}>+ Add a line</button>
            </div>

            {/* The precise read: exactly what it takes and whether it fits */}
            <div className={"planread " + (r.headroom < -0.005 ? "short" : "ok")}>
              <div className="pr-line">
                <b className="num">{money(r.amount)}</b> total
                {r.days > 0 && <> · <b className="num">{money(r.perDay)}</b>/night</>}
                {r.fund === "save"
                  ? <> · save <b className="num">{money(r.monthly)}</b>/mo for <b>{r.monthsUntil}</b> mo to be ready by {monthLabel(r.target)}</>
                  : <> · paid from savings around {monthLabel(r.target)}</>}
              </div>
              <div className="pr-verdict">
                {r.fund === "save"
                  ? (r.headroom >= -0.005
                    ? <>At your free cash flow you can set aside <b className="num">{money(r.canSaveBy)}</b> by then — this fits with <b className="num">{money(r.headroom)}</b> to spare.</>
                    : <>You're <b className="num">{money(-r.headroom)}</b> short: free cash flow only builds <b className="num">{money(r.canSaveBy)}</b> by then. Push the date out, trim a line, or fund part from savings.</>)
                  : (r.headroom >= -0.005
                    ? <>Savings can cover it — <b className="num">{money(m.cashTotal)}</b> on hand drops to <b className="num">{money(m.cashTotal - r.amount)}</b>, leaving <b className="num">{money(r.headroom)}</b> cushion.</>
                    : <>Savings fall <b className="num">{money(-r.headroom)}</b> short — only <b className="num">{money(m.cashTotal)}</b> is on hand.</>)}
              </div>
            </div>

            <div className="efoot">
              {r.fund === "save" && (
                <button className="btn ghost tiny" onClick={() => {
                  patch((s) => {
                    s.goals = s.goals || [];
                    s.goals.push({ id: uid(), name: r.name, target: r.amount, saved: 0, monthly: Math.round(r.monthly), due: r.target, owner: "joint" });
                    s.scenarios = (s.scenarios || []).filter((y) => y.id !== r.id);
                    return s;
                  });
                  setView("goals");
                }}>Make it a savings pot</button>
              )}
              <button className="btn ghost tiny" style={{ marginLeft: "auto", color: C.warn }} onClick={() => remove(r.id)}>Remove</button>
            </div>
          </div>
        ))}
        <button className="btn ghost tiny" style={{ marginTop: 14 }} onClick={add}>Add something coming up</button>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div className="chead"><h3>Your cash, the next year</h3><span className="meta">rough projection — as you are vs. with this plan</span></div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={proj} margin={{ top: 6, right: 10, left: 6, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} tickFormatter={compact} width={46} />
              <Tooltip content={<Tip />} />
              <ReferenceLine y={0} stroke={C.warn} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="As you are" stroke={C.soft} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              <Line type="monotone" dataKey="With this plan" stroke={C.a} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="railkey" style={{ marginTop: 12 }}>
            <span><i className="dot" style={{ background: C.soft }} />As you are</span>
            <span><i className="dot" style={{ background: C.a }} />With this plan</span>
          </div>
        </div>
      )}
    </>
  );
}

/* ================================================================== */
/*  6. net worth + debt                                                */
/* ================================================================== */

function NetWorth({ ctx }) {
  const { m, state, patch, month, setView } = ctx;
  const [extra, setExtra] = useState("");
  const [strategy, setStrategy] = useState("avalanche");
  const set = (i, f, v) => patch((s) => { s.accounts[i][f] = v; return s; });

  const baseline = m.payoff(0, strategy);
  const withExtra = m.payoff(num(extra), strategy);
  const saved = Math.max(0, baseline.interest - withExtra.interest);
  const mix = m.assets.map((a) => ({ name: a.name, value: a.balance })).filter((d) => d.value > 0);

  return (
    <>
      <Head title="Net worth" sub="What you own, what you owe, and how fast the second one disappears." />

      <Guidance m={m} theme="provision"
        line={`What you own less what you owe: ${money(m.netWorth)}.`} />

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Kpi label="Net worth" value={money(m.netWorth)} tone={m.netWorth < 0 ? "down" : "up"}
          onClick={() => setView("reports")} />
        <Kpi label="Assets" value={money(m.assetTotal)} foot={`${m.assets.length} accounts`}
          onClick={() => scrollCard("accountsCard")} />
        <Kpi label="Debt" value={money(m.debtTotal)} foot={`${money(m.debtMin)}/mo in minimums`} tone={m.debtTotal > 0 ? "down" : ""}
          onClick={() => (m.debts.length > 0 ? scrollCard("payoffCard") : scrollCard("accountsCard"))} />
      </div>

      <div className="grid g23" style={{ marginBottom: 16 }}>
        <div className="card" id="accountsCard">
          <div className="chead"><h3>Accounts</h3><span className="meta">balances you update when you check them</span></div>
          {state.accounts.length === 0 && <p className="empty">Add checking, savings, retirement, the car loan — whatever moves the number.</p>}
          {state.accounts.map((a, i) => (
            <div className="row wide" key={a.id}>
              <div className="rowname">
                <i className="dot" style={{ background: a.type === "debt" ? C.warn : m.ownerColor(a.owner) }} />
                <input value={a.name} onChange={(e) => set(i, "name", e.target.value)} aria-label="Account name" />
                <select className="tag" value={a.type} onChange={(e) => set(i, "type", e.target.value)} aria-label="Type">
                  <option value="cash">Cash</option>
                  <option value="invest">Investment</option>
                  <option value="property">Property</option>
                  <option value="debt">Debt</option>
                </select>
                <button className="tag hideS" onClick={() => {
                  const order = ["joint", "a", "b"];
                  set(i, "owner", order[(order.indexOf(a.owner) + 1) % 3]);
                }}>{m.ownerName(a.owner)}</button>
                <button className="kill" onClick={() => patch((s) => { s.accounts.splice(i, 1); return s; })} aria-label="Remove">×</button>
              </div>
              <div className="amt hideS" style={{ textAlign: "left" }}>
                {a.type === "debt" && (
                  <>
                    <span className="muted">APR </span>
                    <MoneyInput className="num" style={{ width: 40, textAlign: "left" }} value={a.apr} placeholder="0"
                      onCommit={(v) => set(i, "apr", v)} aria-label="APR" />
                    <span className="muted">%</span>
                  </>
                )}
              </div>
              <div className="amt hideS">
                {a.type === "debt" && <MoneyInput className="num" value={a.minPayment} placeholder="min"
                  onCommit={(v) => set(i, "minPayment", v)} aria-label="Minimum payment" />}
              </div>
              <div className="amt">
                <MoneyInput className="num" value={a.balance} placeholder="0" onCommit={(v) => set(i, "balance", v)} aria-label="Balance" />
              </div>
            </div>
          ))}
          <button className="btn ghost tiny" style={{ marginTop: 14 }} onClick={() => patch((s) => {
            s.accounts.push({ id: uid(), name: "New account", type: "cash", balance: 0, owner: "joint", apr: 0, minPayment: 0 });
            return s;
          })}>Add an account</button>
        </div>

        <div className="card">
          <div className="chead"><h3>What holds it up</h3></div>
          {mix.length === 0 ? <p className="empty">Add an asset to see the split.</p> : (
            <div style={{ height: 195 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={mix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={76} paddingAngle={2} stroke="none">
                    {mix.map((d, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="railkey">
            {mix.map((d, i) => <span key={i}><i className="dot" style={{ background: PIE[i % PIE.length] }} />{d.name}</span>)}
          </div>
        </div>
      </div>

      {m.debts.length > 0 && (
        <div className="card" id="payoffCard">
          <div className="chead"><h3>Getting out</h3><span className="meta">simulated month by month at today's balances</span></div>
          <div className="toolbar">
            <div className="chips" style={{ marginBottom: 0 }}>
              <button className={"chip " + (strategy === "avalanche" ? "on" : "")} onClick={() => setStrategy("avalanche")}>Highest rate first</button>
              <button className={"chip " + (strategy === "snowball" ? "on" : "")} onClick={() => setStrategy("snowball")}>Smallest balance first</button>
            </div>
            <span className="muted">Extra per month</span>
            <input className="field num" style={{ width: 100 }} placeholder="$0" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Extra payment" />
          </div>
          <div className="grid g3">
            <Kpi label="Debt-free in" value={withExtra.months ? `${withExtra.months} mo` : "—"}
              foot={withExtra.months ? monthLabel(shiftMonth(month, withExtra.months)) : "add minimum payments first"} />
            <Kpi label="Interest paid" value={money(withExtra.interest)} tone={saved > 0 ? "up" : ""}
              foot={saved > 0 ? `${money(saved)} less than minimums only` : "at minimum payments"} />
            <Kpi label="Attack first" value={withExtra.order[0] || "—"} foot={withExtra.order.slice(1).join(" → ") || "then you're done"} />
          </div>
        </div>
      )}
    </>
  );
}

/* ================================================================== */
/*  7. reports                                                         */
/* ================================================================== */

function Reports({ ctx }) {
  const { m, plan, month, setMonth, state, setView } = ctx;

  const byGroup = Object.entries(m.byGroup).map(([k, v]) => ({ name: k, Spent: v.spent, Planned: v.planned }))
    .filter((d) => d.Spent > 0 || d.Planned > 0);
  const byWho = [
    { name: m.pA.name, value: m.spentByWho.a || 0 },
    { name: m.pB.name, value: m.spentByWho.b || 0 },
    { name: "Shared", value: m.spentByWho.joint || 0 },
  ].filter((d) => d.value > 0);
  const trend = m.history.map((h) => ({ label: h.label, Spent: h.spent, "Toward goals": h.saved }));
  const biggest = [...plan.entries].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const personal = m.planned - m.jointCost + m.goalMonthly;

  return (
    <>
      <Head title="Reports" sub="Patterns you can't see one month at a time."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <Guidance m={m} theme="together"
        line={`Shared costs run ${money(m.jointCost)} a month, carried together.`} />

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead"><h3>Planned vs. actual</h3><span className="meta num">{money(m.spent)} of {money(m.planned)}</span></div>
          {byGroup.length === 0 ? <p className="empty">Nothing to chart yet.</p> : (
            <div style={{ height: 230 }}>
              <ResponsiveContainer>
                <BarChart data={byGroup} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} tickFormatter={compact} width={46} />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(34,29,23,.05)" }} />
                  <Bar dataKey="Planned" fill="rgba(34,29,23,.14)" radius={3} />
                  <Bar dataKey="Spent" fill={C.a} radius={3} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="card">
          <div className="chead"><h3>Who paid</h3><span className="meta">shared runs count toward whoever covered them</span></div>
          {byWho.length === 0 ? <p className="empty">Nothing logged yet.</p> : (
            <>
              <div style={{ height: 185 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byWho} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={2} stroke="none">
                      {byWho.map((d, i) => <Cell key={i} fill={[C.a, C.b, C.joint][i % 3]} />)}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="railkey" style={{ justifyContent: "center" }}>
                {byWho.map((d, i) => <span key={i}><i className="dot" style={{ background: [C.a, C.b, C.joint][i % 3] }} />{d.name}</span>)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid g23" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead"><h3>Six-month trend</h3><span className="meta">the dashed line is your income</span></div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={trend} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} tickFormatter={compact} width={46} />
                <Tooltip content={<Tip />} cursor={{ fill: "rgba(34,29,23,.05)" }} />
                <Bar dataKey="Spent" stackId="s" fill={C.a} radius={[0, 0, 3, 3]} />
                <Bar dataKey="Toward goals" stackId="s" fill={C.joint} radius={[3, 3, 0, 0]} />
                <ReferenceLine y={m.income} stroke={C.ink} strokeDasharray="4 3" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="chead"><h3>Biggest five</h3><span className="meta">this month</span></div>
          {biggest.length === 0 ? <p className="empty">Nothing logged yet.</p> : biggest.map((t) => {
            const e = plan.envelopes.find((x) => x.id === t.envId);
            return (
              <div className="note" key={t.id} style={{ justifyContent: "space-between" }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.note || (e ? e.name : "Spending")} <span className="muted">· {m.ownerName(t.who)}</span>
                </span>
                <span className="num">{money(t.amount)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="chead">
          <h3>The fair-split read</h3>
          <span className="meta">{state.household.splitRule === "even" ? "split down the middle" : "split by income"} — planned shares, not a tally of who's paid</span>
        </div>
        {m.singleIncome ? (
          <p className="empty">One income means there's nothing to split — it's all shared money, carried together.</p>
        ) : (
          <div className="grid g3">
            <Kpi label={`${m.pA.name}'s share of shared costs`} value={money(m.jointCost * m.shareA)} foot={`${Math.round(m.shareA * 100)}% of ${money(m.jointCost)} — the split rule lives in Settings`}
              onClick={() => setView("settings")} />
            <Kpi label={`${m.pB.name}'s share`} value={money(m.jointCost * (1 - m.shareA))} foot={`${Math.round((1 - m.shareA) * 100)}% of ${money(m.jointCost)}`}
              onClick={() => setView("settings")} />
            <Kpi label="Outside the shared pot" value={money(personal)} foot="personal envelopes, spending money, and anything unassigned"
              onClick={() => setView("txn")} />
          </div>
        )}
        {(m.covered.a > 0 || m.covered.b > 0) && (
          <p className="empty" style={{ marginTop: 10 }}>
            So far this month {m.pA.name} has covered {money(m.covered.a)} of shared spending and {m.pB.name} {money(m.covered.b)};
            entries marked Shared aren't counted toward either.
          </p>
        )}
      </div>
    </>
  );
}

/* ================================================================== */
/*  8. planner                                                         */
/* ================================================================== */

/*  The assistant's shared brain: the snapshot every AI call sees, the
    planner voice, and the instant local search across everything.     */
function buildSnapshot(state, m, plan, month) {
  return {
    month: monthLabel(month),
    partners: [m.pA, m.pB].map((p) => ({ name: p.name, monthlyTakeHome: p.income })),
    splitRule: state.household.splitRule,
    monthlyIncome: m.income,
    expectedEarningsThisMonth: m.expected.map((e) => ({
      name: e.name, amount: e.amount, expectedDay: e.day, whose: m.ownerName(e.who),
      received: e.landed, recurring: !!e.recurring,
    })),
    ...(m.upcoming.length > 0 && {
      futureEarnings: m.upcoming.map((e) => ({
        name: e.name, amount: e.amount, expectedDate: e.date || e.month, whose: m.ownerName(e.who),
      })),
    }),
    ...(m.paychecks.length > 0 && {
      paychecksThisMonth: m.paychecks.map((p) => ({
        name: p.name, amount: Math.round(p.amount), expectedDay: p.day, received: p.landed,
      })),
    }),
    envelopes: plan.envelopes.map((e) => ({
      name: e.name, group: e.group, planned: e.planned,
      spentSoFar: m.spentBy[e.id] || 0, coveredBy: m.ownerName(e.owner),
    })),
    recurringBills: m.bills.map((b) => ({ name: b.name, amount: b.amount, dueDay: b.day, paidThisMonth: b.paid })),
    goals: state.goals.map((g) => {
      const st = m.goalStatus(g);
      return {
        name: g.name, target: g.target, saved: g.saved, monthly: g.monthly,
        wantItBy: g.due || null, projectedFinish: st.eta ? monthLabel(st.eta) : null, behindSchedule: st.late,
      };
    }),
    accounts: state.accounts.map((a) => ({
      name: a.name, type: a.type, balance: a.balance, apr: a.apr || null, minPayment: a.minPayment || null,
    })),
    netWorth: m.netWorth,
    totalDebt: m.debtTotal,
    unassignedEachMonth: m.unallocated,
    availableToSpendRestOfMonth: m.available,
    savingsRatePct: Math.round(m.savingsRate),
    cashOnHand: m.cashTotal,
    emergencyRunwayMonths: Math.round(m.runwayMonths * 10) / 10,
    netMonthlyCashFlow: m.monthlyNet,
    financialHealth: {
      score: m.health.score, standing: m.health.label,
      vitals: m.health.vitals.map((v) => ({ what: v.label, value: v.value, status: v.status })),
    },
    upcomingPlans: (state.scenarios || []).map((sc) => ({
      what: sc.name, cost: num(sc.amount), when: sc.date, funding: sc.fund === "cash" ? "from savings" : "saving monthly",
    })),
    lastSixMonths: m.history.map((h) => ({ month: h.label, spent: h.spent })),
    ...(m.faithOn && {
      stewardship: {
        todaysVerse: `${m.verse.ref} — ${m.verse.text}`,
        givingSetAsideThisMonth: m.giving.planned,
        givenSoFarThisMonth: m.giving.given,
        givenThisYear: m.giving.ytd,
        givingTargetPctOfIncome: m.giving.targetPct,
        givingTargetMetThisMonth: m.giving.metTarget,
        milestonesMarked: (state.milestoneLog || []).map((x) => ({ what: x.text, when: x.when })),
      },
    }),
  };
}

function buildPlannerSystem(m, snapshot) {
  return (
    `You are the household financial planner for ${m.pA.name} and ${m.pB.name}, a couple who share money. ` +
    `Speak plainly and warmly, like a planner who knows them. Be specific: use their real numbers and their own category names. ` +
    `Lead with one clear recommendation rather than a menu of options, then the reasoning. Keep it under 180 words unless asked for more. ` +
    `Never invent numbers that aren't in the snapshot — if something is missing, name what they should fill in. ` +
    `Stay neutral between the two of them; never take a side in a disagreement about money. ` +
    `You are not a licensed advisor: for tax, legal, insurance, or investment-product decisions, say so in one line and point them to a professional.\n` +
    (m.faithOn
      ? `They keep a daily scripture practice around money in this app; today's verse and their giving numbers are in the snapshot. When it fits the question, you may frame advice in stewardship terms — giving, contentment, staying out of debt — but never preach, never guilt, and never use scripture to settle a disagreement between them.\n\n`
      : `\n`) +
    `Snapshot (monthly amounts unless noted):\n${JSON.stringify(snapshot, null, 2)}`
  );
}

function searchEverything(state, needle) {
  const q = needle.toLowerCase();
  const out = [];
  (state.docs || []).forEach((d) => {
    const i = d.text.toLowerCase().indexOf(q);
    if (d.name.toLowerCase().includes(q) || i >= 0) {
      const snip = (i >= 0 ? d.text.slice(Math.max(0, i - 40), i + 90) : d.text.slice(0, 90)).replace(/\s+/g, " ").trim();
      out.push(`Paper drawer — ${d.name} (${d.folder}): “…${snip}…”`);
    }
  });
  state.bills.forEach((b) => {
    if (b.name.toLowerCase().includes(q)) out.push(`Bill — ${b.name}, ${money(b.amount)} due the ${ordinal(b.day)}.`);
  });
  Object.keys(state.months).sort().reverse().forEach((k) => {
    (state.months[k].entries || []).forEach((t) => {
      if ((t.note || "").toLowerCase().includes(q)) out.push(`Spending — ${t.note}, ${money(t.amount)} (${monthLabel(k, true)}).`);
    });
  });
  state.goals.forEach((g) => {
    if (g.name.toLowerCase().includes(q)) out.push(`Goal — ${g.name}: ${money(g.saved)} of ${money(g.target)}.`);
  });
  (state.incomes || []).forEach((inc) => {
    if (inc.name.toLowerCase().includes(q)) out.push(`Income — ${inc.name}, ${money(inc.amount)}${inc.recurring ? " every month" : ""}.`);
  });
  return out;
}

function PlannerPage({ ctx }) {
  const { m, state, patch, plan, month } = ctx;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(false);
  const logRef = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const chat = state.chat || [];
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const pushChat = (msgs) => patch((s) => { s.chat = [...(s.chat || []), ...msgs]; return s; });

  const say = (t) => {
    try {
      if (!speakOn || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(String(t).slice(0, 600)));
    } catch (e) { /* no voices available */ }
  };

  const hear = () => {
    if (!SR) return;
    if (listening) { if (recRef.current) recRef.current.stop(); return; }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => setQ((x) => (x ? x + " " : "") + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  // "find car insurance" → instant local search across everything saved.
  const localSearch = (needle) => searchEverything(state, needle);

  // Files dropped into the chat: extracted, filed in the paper drawer,
  // and read by the assistant right here in the conversation.
  const onChatFiles = async (list) => {
    for (const f of Array.from(list || [])) {
      const text = await extractText(f);
      if (!text || !text.trim()) {
        pushChat([{ role: "assistant", content: `I couldn't read ${f.name} — scanned images and PDFs aren't supported yet.` }]);
        continue;
      }
      const docId = uid();
      patch((s) => {
        s.docs = s.docs || [];
        s.docs.unshift({
          id: docId, name: f.name.slice(0, 80), text: String(text).slice(0, 100000), folder: "Other",
          added: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
        });
        return s;
      });
      pushChat([{ role: "user", content: `Uploaded ${f.name}` }]);
      setBusy(true);
      try {
        const res = await fetch(API_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6", max_tokens: 700,
            system:
              `You are the household financial planner for ${m.pA.name} and ${m.pB.name}. They just uploaded a document ` +
              `into your chat. Read it and answer plainly: pull out amounts, dates, renewals, obligations, and anything ` +
              `actionable for a household budget. Spreadsheets arrive as CSV text. Under 200 words.`,
            messages: [{ role: "user", content: `File: ${f.name}\n\n---\n${String(text).slice(0, 30000)}\n---\n\nWhat should we know from this?` }],
          }),
        });
        const data = await res.json();
        const reply = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
        if (!reply) throw new Error("empty");
        patch((s) => {
          const x = (s.docs || []).find((y) => y.id === docId);
          if (x) x.analysis = reply;
          s.chat = [...(s.chat || []), { role: "assistant", content: reply }];
          return s;
        });
        say(reply);
      } catch (e) {
        pushChat([{ role: "assistant", content: `Filed ${f.name} in the paper drawer on Bills & files. I couldn't reach the planner to read it just now — ask me about it again in a moment.` }]);
      }
      setBusy(false);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [chat, busy]);

  const snapshot = buildSnapshot(state, m, plan, month);

  const ask = async (text) => {
    const question = (text === undefined ? q : text).trim();
    if (!question || busy) return;
    const sm = question.match(/^(?:find|search(?: for)?|where(?:'s| is)|look for|locate)\s+(.+)$/i);
    if (sm) {
      const needle = sm[1].replace(/^(?:our|my|the)\s+/i, "").replace(/[?.!]\s*$/, "");
      const res = localSearch(needle);
      const reply = res.length
        ? `Here's what I found for “${needle}”:\n\n${res.slice(0, 12).join("\n")}${res.length > 12 ? `\n…and ${res.length - 12} more.` : ""}`
        : `Nothing matches “${needle}” in the paper drawer, bills, spending, goals, or incomes. Search looks inside every filed document too — try another word.`;
      pushChat([{ role: "user", content: question }, { role: "assistant", content: reply }]);
      say(reply);
      setQ("");
      return;
    }
    const next = [...chat, { role: "user", content: question }];
    patch((s) => { s.chat = next; return s; });
    setQ(""); setErr(""); setBusy(true);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: buildPlannerSystem(m, snapshot),
          messages: next.map((x) => ({ role: x.role, content: x.content })),
        }),
      });
      const data = await res.json();
      const reply = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      patch((s) => { s.chat = [...next, { role: "assistant", content: reply || "No answer came back — try asking again." }]; return s; });
      if (reply) say(reply);
    } catch (e) {
      setErr("Couldn't reach your assistant just now. Try again in a moment.");
    }
    setBusy(false);
  };

  const chips = [
    "Where should the extra go this month?",
    "Find our car insurance",
    ...(m.faithOn ? ["Are we giving the way we mean to?"] : []),
    "Are our goals realistic on this income?",
    "What should we cut first?",
    "How should we split shared costs fairly?",
    "Pay down debt or save faster?",
    "How big should our emergency fund be?",
  ];

  return (
    <>
      <Head title="Assistant" sub="Chat about your money, drop in files for it to read and file, or type “find …” to search everything." />

      <Guidance m={m} theme="giving"
        line={m.giving.planned > 0 ? `${money(m.giving.planned)} set aside for giving this month — ask it anything.` : "Ask it anything — it answers with your numbers."} />
      <div className="grid g23">
        <div className={"card" + (dragOver ? " dragover" : "")} style={{ display: "flex", flexDirection: "column", minHeight: 470 }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onChatFiles(e.dataTransfer.files); }}>
          <div className="chead" style={{ marginBottom: 8 }}>
            <h3>Chat</h3>
            <button className={"chip " + (speakOn ? "on" : "")}
              onClick={() => { if (speakOn) { try { window.speechSynthesis.cancel(); } catch (e) { /* fine */ } } setSpeakOn(!speakOn); }}
              title="Have replies read out loud">
              {speakOn ? "Reading replies aloud" : "Read replies aloud"}
            </button>
          </div>
          <div className="chatlog" ref={logRef} style={{ flex: 1, maxHeight: 460 }}>
            {chat.length === 0 && (
              <p className="empty">
                Ask anything about your money — it answers with your numbers. Drop a statement or document here
                (or Attach one) and it reads and files it. Type “find car insurance” to search everything you've saved.
              </p>
            )}
            {chat.map((x, i) => <div key={i} className={"msg " + (x.role === "user" ? "me" : "them")}>{x.content}</div>)}
            {busy && <div className="msg them muted">Reading…</div>}
          </div>
          {err && <p className="empty" style={{ color: C.warn }}>{err}</p>}
          <div className="chips">{chips.map((c) => <button key={c} className="chip" onClick={() => ask(c)} disabled={busy}>{c}</button>)}</div>
          <div className="askrow">
            <button className="btn ghost tiny" style={{ flex: "none" }} onClick={() => fileRef.current && fileRef.current.click()}
              title="Upload a file into the chat" disabled={busy}>Attach</button>
            <input ref={fileRef} type="file" multiple accept=".txt,.md,.csv,.tsv,.log,.xlsx,.xls,.ods,.docx,text/*"
              style={{ display: "none" }} onChange={(e) => onChatFiles(e.target.files)} aria-label="Upload files to the chat" />
            {SR && (
              <button className={"btn tiny" + (listening ? "" : " ghost")} style={{ flex: "none" }} onClick={hear}
                aria-label={listening ? "Stop listening" : "Speak instead of typing"}>
                {listening ? "Listening…" : "Speak"}
              </button>
            )}
            <input className="field" placeholder="Ask, or “find …” to search" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()} aria-label="Ask your assistant" />
            <button className="btn" onClick={() => ask()} disabled={busy || !q.trim()}>Ask</button>
          </div>
          {chat.length > 0 && (
            <button className="btn ghost tiny" style={{ marginTop: 10, alignSelf: "flex-start" }}
              onClick={() => patch((s) => { s.chat = []; return s; })}>Clear conversation</button>
          )}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="chead"><h3>What it's looking at</h3></div>
            {[["Income", m.income], ["Available to spend", m.available], ["Planned out", m.planned], ["Bills", m.billsTotal], ["Goals", m.goalMonthly]].map(([k, v]) => (
              <div className="note" key={k} style={{ justifyContent: "space-between" }}>
                <span className="muted">{k}</span><span className="num">{money(v)}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="chead"><h3>Planner notes</h3></div>
            <Notes notes={m.notes} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  9. settings                                                        */
/* ================================================================== */

function SettingsView({ ctx, setState }) {
  const { state, patch, m } = ctx;
  const [wipe, setWipe] = useState(false);
  const [copied, setCopied] = useState(false);
  const [restoreTxt, setRestoreTxt] = useState("");
  const [restoreErr, setRestoreErr] = useState("");

  const restore = () => {
    setRestoreErr("");
    try {
      const s = JSON.parse(restoreTxt);
      if (!s || !s.household || !s.months) throw new Error("shape");
      if (window.confirm("Replace everything here with this copy?")) {
        setState(s);
        setRestoreTxt("");
      }
    } catch (e) {
      setRestoreErr("That doesn't look like a copy from this app — paste the whole thing, starting with {.");
    }
  };

  const exportJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      setCopied(true); setTimeout(() => setCopied(false), 2200);
    } catch (e) { setCopied(false); }
  };

  return (
    <>
      <Head title="Settings" sub="Who's in the household, what comes in, and how you split it." />

      <Guidance m={m} theme="together"
        line="The plan works because you both agreed to it." />
      <div className="grid g2">
        <div className="card">
          <div className="chead"><h3>Household</h3></div>
          <label className="lbl">Name</label>
          <input className="field" style={{ marginBottom: 14 }} value={state.household.name}
            onChange={(e) => patch((s) => { s.household.name = e.target.value; s.demo = false; return s; })} />
          {[0, 1].map((i) => (
            <div className="pair" key={i}>
              <div>
                <label className="lbl">{i === 0 ? "First name" : "Second name"}</label>
                <input className="field" value={state.household.partners[i].name}
                  onChange={(e) => patch((s) => { s.household.partners[i].name = e.target.value; s.demo = false; return s; })} />
              </div>
              <div>
                <label className="lbl">Monthly take-home</label>
                {(i === 0 ? m.payCounts.a : m.payCounts.b) > 0 ? (
                  <div className="field num" style={{ background: "#EFEADF", color: C.soft }}>
                    {money(i === 0 ? m.eff.a : m.eff.b)} · set by paychecks in Budget
                  </div>
                ) : (
                  <MoneyInput value={state.household.partners[i].income} placeholder="0"
                    onCommit={(v) => patch((s) => { s.household.partners[i].income = v; return s; })}
                    aria-label={`${state.household.partners[i].name} take-home`} />
                )}
              </div>
            </div>
          ))}
          <label className="lbl" style={{ marginTop: 8 }}>How you split shared costs</label>
          <div className="chips">
            <button className={"chip " + (state.household.splitRule === "proportional" ? "on" : "")}
              onClick={() => patch((s) => { s.household.splitRule = "proportional"; return s; })}>By income</button>
            <button className={"chip " + (state.household.splitRule === "even" ? "on" : "")}
              onClick={() => patch((s) => { s.household.splitRule = "even"; return s; })}>Down the middle</button>
          </div>
          <p className="empty">
            {m.singleIncome
              ? "One income means there's nothing to split — it's all shared money, carried together."
              : state.household.splitRule === "even"
                ? `Shared costs split evenly: ${money(m.jointCost / 2)} each.`
                : `${m.pA.name} covers ${Math.round(m.shareA * 100)}% of shared costs — ${money(m.jointCost * m.shareA)} — matching their share of what comes in.`}
          </p>
          <label className="lbl" style={{ marginTop: 8 }}>Daily scripture</label>
          <div className="chips">
            <button className={"chip " + (m.faithOn ? "on" : "")}
              onClick={() => patch((s) => { s.faith = { enabled: true }; return s; })}>On</button>
            <button className={"chip " + (!m.faithOn ? "on" : "")}
              onClick={() => patch((s) => { s.faith = { enabled: false }; return s; })}>Off</button>
          </div>
          <p className="empty">
            {m.faithOn
              ? "A verse on money and stewardship, new each morning, on every page — and the planner can see it, along with what you've set aside to give."
              : "The pages and planner leave scripture out."}
          </p>
          {m.faithOn && (
            <>
              <label className="lbl" style={{ marginTop: 8 }}>Giving target — % of income</label>
              <input className="field num" style={{ width: 90 }} value={m.giving.targetPct}
                onChange={(e) => patch((s) => {
                  s.faith = { ...(s.faith || {}), givingTarget: Math.max(0, Math.min(100, num(e.target.value))) };
                  return s;
                })} aria-label="Giving target percent of income" />
              <p className="empty">
                The Overview's Giving card measures each month against this — {money(m.giving.target)} at today's income.
              </p>
            </>
          )}
        </div>

        <div className="card">
          <div className="chead"><h3>Your data</h3></div>
          <p className="empty">
            Everything lives in this browser profile, not on a server. One of you holds the master copy — copy it out
            when you want a backup, or to hand it over.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button className="btn ghost tiny" onClick={exportJson}>{copied ? "Copied to clipboard" : "Copy all data"}</button>
            <button className="btn ghost tiny" onClick={async () => {
              if (!wipe) { setWipe(true); return; }
              try { await window.storage.delete(KEY); } catch (e) { /* already gone */ }
              setWipe(false); setState(null);
            }}>{wipe ? "Tap again to erase everything" : "Start over"}</button>
          </div>
          <label className="lbl" style={{ marginTop: 18 }}>Restore from a copy</label>
          <textarea className="field" rows={3} placeholder="Paste a copy made with “Copy all data”…"
            value={restoreTxt} onChange={(e) => setRestoreTxt(e.target.value)} aria-label="Restore data" />
          <button className="btn ghost tiny" style={{ marginTop: 8 }} disabled={!restoreTxt.trim()} onClick={restore}>
            Restore this copy
          </button>
          {restoreErr && <p className="empty" style={{ color: C.warn }}>{restoreErr}</p>}
          <div className="chead" style={{ marginTop: 24 }}><h3>What's stored</h3></div>
          {[
            ["Months planned", Object.keys(state.months).length],
            ["Transactions", Object.values(state.months).reduce((n, x) => n + x.entries.length, 0)],
            ["Goals", state.goals.length],
            ["Accounts", state.accounts.length],
            ["Bills", state.bills.length],
            ["Files", (state.docs || []).length],
          ].map(([k, v]) => (
            <div className="note" key={k} style={{ justifyContent: "space-between" }}>
              <span className="muted">{k}</span><span className="num">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  setup                                                              */
/* ================================================================== */

function Setup({ onDone }) {
  const [name, setName] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [ai, setAi] = useState("");
  const [bi, setBi] = useState("");
  const ready = a.trim() && b.trim();

  const start = () => {
    if (!ready) return;
    onDone({
      household: {
        name: name.trim() || `${a.trim()} & ${b.trim()}`,
        splitRule: "proportional",
        partners: [
          { id: "a", name: a.trim(), income: num(ai) },
          { id: "b", name: b.trim(), income: num(bi) },
        ],
      },
      months: { [monthKey(new Date())]: blankMonth(null) },
      goals: [],
      accounts: [],
      bills: [],
      incomes: [],
      docs: [],
      chat: [],
    });
  };

  return (
    <Frame>
      <div className="setup">
        <div className="hero">
          <div className="gem">◆</div>
          <h1>How would you like to start?</h1>
          <p className="thesis"><span>Two people, one month at a time — the budget, the bills, the goals, and the read on how you're doing all build from what you each bring home.</span></p>
        </div>

        <div className="grid g2">
          <div className="card choice">
            <div className="gem">◆</div>
            <h3>Open the ledger</h3>
            <p className="why">Set up your own household</p>
            <label className="lbl">Household name (optional)</label>
            <input className="field" style={{ marginBottom: 13 }} placeholder="The Kitchen Table Fund"
              value={name} onChange={(e) => setName(e.target.value)} />
            <div className="pair">
              <div><label className="lbl">First name</label>
                <input className="field" placeholder="Alex" value={a} onChange={(e) => setA(e.target.value)} /></div>
              <div><label className="lbl">Monthly take-home</label>
                <input className="field num" placeholder="4,200" value={ai} onChange={(e) => setAi(e.target.value)} /></div>
            </div>
            <div className="pair">
              <div><label className="lbl">Second name</label>
                <input className="field" placeholder="Sam" value={b} onChange={(e) => setB(e.target.value)} /></div>
              <div><label className="lbl">Monthly take-home</label>
                <input className="field num" placeholder="3,800" value={bi} onChange={(e) => setBi(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && start()} /></div>
            </div>
            <button className="btn" onClick={start} disabled={!ready}>Open the ledger</button>
            <p className="fine">Two minutes · your numbers live in this browser only, so set up on the device you'll both use</p>
          </div>

          <div className="card choice">
            <div className="gem">◆</div>
            <h3>Tour the sample</h3>
            <p className="why">Click through a household that's already living in it</p>
            <p className="empty" style={{ textAlign: "left" }}>
              A two-income household with six months of history, bills, goals, and debt already in it.
              Every screen is live — the budget, the spending log, the planner, all of it.
            </p>
            <button className="btn" onClick={() => onDone(demoState())}>See the sample</button>
            <p className="fine">Instant · wipe it and start clean anytime</p>
          </div>
        </div>
      </div>
    </Frame>
  );
}
