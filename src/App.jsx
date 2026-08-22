import { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import * as XLSX from "xlsx";
import mammoth from "mammoth/mammoth.browser";
import { verseForDay, VERSES } from "./scripture.js";

/* ================================================================== */
/*  data + helpers                                                     */
/* ================================================================== */

const API_URL = import.meta.env.VITE_ANTHROPIC_URL || "/api/anthropic/v1/messages";

const KEY = "twocolumn:v2";
const KEY_V1 = "twocolumn:v1";

const money = (n, cents) => {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return (v < 0 ? "-$" : "$") + s;
};
const compact = (n) => {
  const v = Math.abs(n);
  if (v >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (v >= 1000) return Math.round(n / 1000) + "k";
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
  Home: "#7086D6", Daily: "#6D9DC9", Lifestyle: "#A488CF",
  Health: "#55A297", Giving: "#7FAE7A", Other: "#9AA3AE",
};

const seedEnvelopes = () => [
  { id: uid(), name: "Rent / mortgage", group: "Home", planned: 0, owner: "joint" },
  { id: uid(), name: "Utilities", group: "Home", planned: 0, owner: "joint" },
  { id: uid(), name: "Groceries", group: "Daily", planned: 0, owner: "joint" },
  { id: uid(), name: "Transport", group: "Daily", planned: 0, owner: "joint" },
  { id: uid(), name: "Eating out", group: "Lifestyle", planned: 0, owner: "joint" },
  { id: uid(), name: "Subscriptions", group: "Lifestyle", planned: 0, owner: "joint" },
  { id: uid(), name: "Health", group: "Health", planned: 0, owner: "joint" },
  { id: uid(), name: "Giving", group: "Giving", planned: 0, owner: "joint" },
  { id: uid(), name: "Everything else", group: "Other", planned: 0, owner: "joint" },
];

const blankMonth = (prev) => ({
  envelopes: prev ? prev.envelopes.map((e) => ({ ...e, id: uid() })) : seedEnvelopes(),
  entries: [],
  paid: [],
  received: [],
  billAmounts: {},
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
    ["goals", "Goals"],
  ]],
  ["Longer view", [
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
  a: "#7086D6", b: "#55A297", joint: "#C0965C", warn: "#D4574E",
  soft: "#6F6F76", ink: "#18181B", line: "#E7E7E5",
};
// Darker companions for text at small sizes — the C hues pass as fills
// and borders but fail contrast as 10-11px type on white.
const CT = { a: "#5563A8", b: "#3E7A6F", joint: "#8A6431" };
const PIE = ["#7086D6", "#55A297", "#C0965C", "#A488CF", "#7FAE7A", "#D4574E", "#6D9DC9", "#9AA3AE"];

/* ================================================================== */
/*  styles                                                             */
/* ================================================================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

body{margin:0;background:#F6F6F5;}
.tc{--paper:#F6F6F5;--surface:#FFFFFF;--ink:#18181B;--soft:#6F6F76;--line:#E7E7E5;
 --a:#7086D6;--b:#55A297;--joint:#C0965C;--warn:#D4574E;--r:12px;
 --acc:#5B5BD6;--accsoft:#F0F0FA;
 --goldline:rgba(192,150,92,.4);--goldsoft:rgba(192,150,92,.1);--hair:rgba(0,0,0,.06);
 --shadow:0 1px 2px rgba(0,0,0,.04);
 background:var(--paper);color:var(--ink);font-family:'Inter',ui-sans-serif,system-ui,sans-serif;
 min-height:100vh;box-sizing:border-box;-webkit-font-smoothing:antialiased;font-size:14px;font-weight:400;}
.tc *,.tc *::before,.tc *::after{box-sizing:border-box;}
.tc .num{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;}
.tc h1,.tc h2,.tc h3,.tc .serif{font-family:'Space Grotesk','Inter',ui-sans-serif,sans-serif;font-weight:600;margin:0;}
.tc button{font-family:inherit;cursor:pointer;}
.tc :focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:6px;}
.tc .gem{display:flex;align-items:center;justify-content:center;font-size:0;line-height:0;}
.tc .gem::before{content:"";height:2px;width:28px;border-radius:2px;background:var(--ink);}
.tc .gem::after{content:none;}

/* shell — sidebar on desktop, bottom icon bar on mobile */
.tc .shell{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh;}
.tc .side{background:var(--surface);border-right:1px solid var(--line);padding:18px 14px;
 position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:18px;overflow-y:auto;}
.tc .mark{display:flex;align-items:center;gap:10px;line-height:1.25;}
.tc .avatar{width:34px;height:34px;border-radius:9px;background:var(--ink);color:#fff;flex:none;
 display:grid;place-items:center;font-weight:600;font-size:15px;}
.tc .mark .nm{font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;font-size:15.5px;letter-spacing:-.01em;display:block;}
.tc .mark .who{font-size:11.5px;color:var(--soft);}
.tc .navlab{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;
 color:#9AA0A6;margin:0 10px 6px;}
.tc nav{display:flex;flex-direction:column;gap:2px;}
.tc nav button{display:flex;align-items:center;gap:10px;background:none;border:none;border-radius:10px;
 padding:8px 10px;font-size:13.5px;font-weight:500;color:#3F4349;text-align:left;width:100%;}
.tc nav button:hover{background:#F1F1EF;}
.tc nav button.on{background:#ECECEA;color:var(--ink);}
.tc nav button svg{flex:none;opacity:.7;}
.tc nav button.on svg{opacity:1;}
.tc .badge{margin-left:auto;background:var(--warn);color:#fff;font-size:10px;font-weight:600;
 border-radius:999px;padding:1px 6px;line-height:1.5;}
.tc .sidefoot{margin-top:auto;display:flex;flex-direction:column;gap:10px;}
.tc .sideverse{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px;}
.tc .sideverse .vt{font-size:12.5px;line-height:1.55;font-style:italic;color:#3F4349;margin:6px 0 8px;
 display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;}
.tc .sideverse .vr{font-size:11px;font-weight:600;color:var(--acc);}
.tc .main{padding:24px 28px 90px;min-width:0;}
.tc .bottom{display:none;}
@media(max-width:900px){
 .tc .shell{grid-template-columns:1fr;}
 .tc .side{display:none;}
 .tc .main{padding:16px 14px 88px;}
 .tc .bottom{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:30;
  background:rgba(255,255,255,.96);backdrop-filter:blur(12px);border-top:1px solid var(--line);
  overflow-x:auto;gap:2px;padding:6px 8px calc(6px + env(safe-area-inset-bottom));}
 .tc .bottom button{flex:1 0 22%;display:flex;flex-direction:column;align-items:center;gap:3px;
  background:none;border:none;font-size:10px;font-weight:500;color:var(--soft);padding:5px 2px;
  border-radius:10px;position:relative;white-space:nowrap;}
 .tc input,.tc select,.tc textarea{font-size:16px;}
 .tc .bottom button.on{color:var(--acc);}
 .tc .bottom .badge{position:absolute;top:0;right:8px;margin:0;padding:0 5px;font-size:9.5px;}
}

/* page head */
.tc .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;
 border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:22px;}
.tc .phead h1{font-size:24px;letter-spacing:-.02em;font-weight:600;}
.tc .phead .sub{font-size:13px;color:var(--soft);margin-top:4px;}
.tc .monthnav{display:flex;align-items:center;gap:5px;}
.tc .monthnav .m{font-size:13px;min-width:120px;text-align:center;}
.tc .arrow{background:none;border:1px solid var(--line);border-radius:50%;width:25px;height:25px;
 color:var(--soft);font-size:13px;display:grid;place-items:center;line-height:1;}
.tc .arrow:hover{border-color:var(--acc);color:var(--acc);}

/* hero + thesis — a bright gradient band */
.tc .hero{position:relative;border-radius:16px;overflow:hidden;text-align:center;color:var(--ink);
 padding:38px 28px 34px;margin-bottom:24px;border:1px solid var(--line);
 background:linear-gradient(180deg,#FFFFFF,#F1F1EF);}
.tc .hero .gem{margin-bottom:16px;}
.tc .thesis{font-family:'Space Grotesk',Inter,sans-serif;font-size:clamp(22px,3vw,34px);line-height:1.25;
 letter-spacing:-.02em;max-width:1080px;margin:0 auto;font-weight:600;}
.tc .thesis span{display:block;font-size:clamp(14px,1.5vw,16px);color:#5A5F66;font-weight:400;
 letter-spacing:0;margin-top:10px;}

/* grid + cards */
.tc .grid{display:grid;gap:16px;}
.tc .g2{grid-template-columns:repeat(2,minmax(0,1fr));}
.tc .g3{grid-template-columns:repeat(3,minmax(0,1fr));}
.tc .g4{grid-template-columns:repeat(4,minmax(0,1fr));}
.tc .g23{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);}
@media(max-width:980px){.tc .g23,.tc .g3,.tc .g4{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:620px){.tc .grid{grid-template-columns:minmax(0,1fr)!important;}}
.tc .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:18px;
 box-shadow:var(--shadow);}
.tc .card h3{font-size:15px;letter-spacing:-.01em;font-weight:600;}
.tc .chead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:14px;}
.tc .chead .meta{font-size:12px;color:var(--soft);}

/* kpi + hero card */
.tc .kpi{padding:16px;}
.tc .kpi .lab,.tc .biglab{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--soft);}
.tc .kpi .val{font-variant-numeric:tabular-nums;font-weight:600;
 font-size:22px;letter-spacing:-.02em;margin-top:8px;line-height:1.1;word-break:break-word;}
.tc .kpi .foot{font-size:11.5px;color:var(--soft);margin-top:7px;line-height:1.4;}
.tc .kpi.click{cursor:pointer;text-align:left;width:100%;font-family:inherit;font-size:inherit;color:inherit;
 transition:border-color .15s ease;}
.tc .kpi.click:hover{border-color:var(--acc);}
.tc .kpi.click.on{border-color:var(--acc);background:var(--accsoft);}
.tc .herocard{padding:22px 24px;margin-bottom:16px;}
.tc .bignum{font-size:clamp(28px,3.4vw,38px);font-weight:600;letter-spacing:-.03em;line-height:1.05;
 font-variant-numeric:tabular-nums;margin-top:6px;}
.tc .ofinc{font-size:14px;color:var(--soft);font-weight:400;letter-spacing:0;}
.tc .herosub{font-size:13.5px;color:#4A4F55;line-height:1.55;margin:8px 0 16px;max-width:760px;}
.tc .quickbill{display:grid;grid-template-columns:minmax(150px,1fr) 110px 100px 190px auto;gap:8px;align-items:center;}
@media(max-width:760px){.tc .quickbill{grid-template-columns:1fr 1fr;}}
.tc .up{color:#54876B;}.tc .down{color:var(--warn);}.tc .mid{color:#A9803F;}

/* rail */
.tc .rail{display:flex;height:12px;width:100%;gap:2px;}
.tc .seg{min-width:2px;border-radius:2px;}
.tc .seg.gap{background:repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(34,29,23,.12) 5px,rgba(34,29,23,.12) 6px);
 border:1px dashed var(--soft);}
.tc .railkey{display:flex;flex-wrap:wrap;gap:13px;margin-top:10px;font-size:11.5px;color:var(--soft);}
.tc .railkey span{display:flex;align-items:center;gap:6px;}
.tc .dot{width:8px;height:8px;border-radius:2px;display:inline-block;flex:none;}

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
.tc .rowname input:hover{border-bottom:1px dotted #C9CDD2;}
.tc .amt{text-align:right;font-size:13.5px;}
.tc .amt input{width:100%;text-align:right;border:none;background:none;font-size:13.5px;color:var(--ink);
 font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;padding:3px 0;}
.tc .amt input:hover{border-bottom:1px solid var(--line);}
.tc .amt input:focus{outline:none;border-bottom:2px solid var(--acc);}
.tc .muted{color:var(--soft);}
.tc .over{color:var(--warn);font-weight:500;}
.tc .bar{grid-column:1/-1;height:4px;background:rgba(34,29,23,.08);border-radius:3px;overflow:hidden;}
.tc .bar i{display:block;height:100%;border-radius:3px;}
.tc .kill{background:none;border:none;color:var(--soft);font-size:16px;padding:10px;margin:-8px -6px;line-height:1;}
.tc .kill:hover{color:var(--warn);}
.tc .tag{border:1px solid var(--line);background:none;border-radius:20px;font-size:11px;
 letter-spacing:.08em;text-transform:uppercase;padding:4px 9px;color:var(--soft);white-space:nowrap;
 font-family:inherit;max-width:130px;}
.tc .grouphead{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--soft);
 padding:16px 0 4px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;}

/* controls */
.tc .field{border:1px solid var(--line);background:#FFFFFF;border-radius:8px;padding:9px 11px;
 font-size:13.5px;color:var(--ink);font-family:inherit;width:100%;}
.tc .field::placeholder{color:#9CA0A8;}
.tc .field:focus{border-color:var(--acc);outline:none;box-shadow:0 0 0 3px rgba(91,91,214,.13);}
.tc select.field option{background:#FFFFFF;color:var(--ink);}
.tc .btn{border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:9px;
 padding:9px 16px;font-size:13px;font-weight:500;letter-spacing:0;text-transform:none;}
.tc .btn:hover{background:#2E2E33;border-color:#2E2E33;}
.tc .btn[disabled]{opacity:.45;cursor:default;}
.tc .btn.ghost{background:#fff;color:#3F4349;border-color:var(--line);}
.tc .btn.ghost:hover{background:#F7F7F5;border-color:#C9CDD2;color:var(--ink);}
.tc .btn.tiny{padding:5px 10px;font-size:12px;font-weight:500;}
.tc .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;}
.tc .toolbar .field{width:auto;min-width:120px;}
.tc .logger{display:grid;grid-template-columns:100px 1fr 140px 1fr auto;gap:8px;background:var(--surface);
 border:1px solid var(--line);border-radius:var(--r);padding:10px;margin-bottom:16px;}
@media(max-width:760px){.tc .logger{grid-template-columns:1fr 1fr;}.tc .logger .wide{grid-column:1/-1;}}

/* goals */
.tc .track{height:7px;background:rgba(34,29,23,.1);border-radius:4px;margin:11px 0 9px;overflow:hidden;}
.tc .track i{display:block;height:100%;background:var(--joint);border-radius:4px;transition:width .4s ease;}
.tc .flag{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:20px;
 border:1px solid currentColor;white-space:nowrap;}
.tc .flag.ok{color:#5563A8;}.tc .flag.late{color:var(--warn);}
.tc .metaline{display:flex;flex-wrap:wrap;gap:13px;font-size:12.5px;color:var(--soft);align-items:center;}
.tc .metaline b{color:var(--ink);font-weight:500;}
.tc .fourup{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px;padding-top:12px;
 border-top:1px solid var(--line);}
@media(max-width:640px){.tc .fourup{grid-template-columns:repeat(2,1fr);}}
.tc .lbl{display:block;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--soft);margin-bottom:5px;}

/* notes + chat */
.tc .note{display:flex;gap:9px;font-size:13px;line-height:1.45;padding:8px 0;
 border-bottom:1px solid var(--hair);}
.tc .note:last-child{border-bottom:none;}
.tc .tick{width:4px;flex:none;border-radius:3px;margin:3px 0;}
.tc .chatlog{display:flex;flex-direction:column;gap:12px;overflow-y:auto;margin-bottom:12px;}
.tc .msg{font-size:13.5px;line-height:1.55;white-space:pre-wrap;}
.tc .msg.me{align-self:flex-end;background:#fff;border:1px solid var(--line);color:var(--ink);
 padding:8px 12px;border-radius:12px 12px 3px 12px;max-width:86%;}
.tc .msg.them{border-left:2px solid var(--joint);padding-left:12px;}
.tc .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px;}
.tc .chip{border:1px solid var(--line);background:none;border-radius:20px;padding:5px 12px;font-size:12px;color:var(--soft);}
.tc .chip:hover{border-color:var(--acc);color:var(--acc);}
.tc .chip.on{background:var(--ink);color:#fff;border-color:var(--ink);}
.tc .askrow{display:flex;gap:7px;}
.tc .empty{font-size:13px;color:var(--soft);line-height:1.55;padding:8px 0;margin:0;}

/* read-first rows: a clean line you click to open a labeled editor */
.tc .row.click{cursor:pointer;}
.tc .row.click:hover{background:#FAFAF8;}
.tc .editHint{font-size:11.5px;color:var(--acc);opacity:0;transition:opacity .12s;}
.tc .row.click:hover .editHint,.tc .row.click:focus-visible .editHint{opacity:1;}
.tc .editor{background:var(--paper);border:1px solid var(--line);border-radius:10px;
 padding:14px;margin:8px 0 12px;}
.tc .editor .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px 12px;}
.tc .editor .efoot{display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap;}
.tc .editor .snip{margin-top:10px;}

/* celebrations + giving */
.tc .celebrate{background:linear-gradient(120deg,#F2F8EC,#FBF6E7);border:1px solid #DCE4CB;
 border-left:3px solid #7FAE7A;border-radius:12px;padding:16px 18px;margin-bottom:16px;
 display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;}
.tc .celebrate .ctitle{font-family:'Space Grotesk',Inter,sans-serif;font-size:18px;font-weight:600;letter-spacing:-.01em;}
.tc .celebrate .cline{font-size:13px;color:#4A4F55;margin:6px 0 8px;max-width:680px;line-height:1.5;}
.tc .celebrate .cverse{font-size:12.5px;font-style:italic;color:#59684F;margin:0;}
.tc .celebrate .cverse b{font-style:normal;font-weight:600;color:#5E8355;margin-left:6px;}
.tc .givetrack{height:8px;background:rgba(23,24,28,.07);border-radius:4px;overflow:hidden;margin-top:14px;}
.tc .givetrack i{display:block;height:100%;background:#7FAE7A;border-radius:4px;transition:width .4s ease;}
.tc .mstone{font-size:12px;color:var(--soft);margin-top:10px;}

/* demo banner + stewardship guidance */
.tc .demobar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
 background:var(--goldsoft);border:1px solid var(--goldline);border-radius:10px;
 padding:9px 14px;margin-bottom:16px;font-size:12.5px;color:#6B5327;}
.tc .guide{display:flex;gap:14px;align-items:flex-start;background:#FBFAF7;border:1px solid #ECE7DC;
 border-left:3px solid var(--joint);border-radius:12px;padding:14px 18px;margin-bottom:16px;}
.tc .guide .gverse{font-family:'Space Grotesk',Inter,sans-serif;font-size:15px;font-weight:500;
 line-height:1.5;letter-spacing:-.005em;margin:0 0 6px;color:#26262B;}
.tc .guide .gref{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:#A07C3F;}
.tc .guide .gline{font-size:12.5px;color:var(--soft);text-transform:none;letter-spacing:0;font-weight:400;
 margin-left:8px;}

/* concierge + files */
.tc .concierge{margin:0 0 16px;}
.tc .conbar{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);
 border-radius:14px;padding:6px 6px 6px 16px;box-shadow:var(--shadow);}
.tc .conbar input{flex:1;border:none;background:none;font-size:14px;color:var(--ink);font-family:inherit;
 padding:8px 0;min-width:0;}
.tc .conbar input:focus{outline:none;}
.tc .conbar:focus-within{border-color:var(--acc);box-shadow:0 0 0 3px rgba(91,91,214,.13);}
.tc .conbar input::placeholder{color:#9AA0A6;}
.tc .conbar .mic{background:none;border:none;color:var(--soft);border-radius:10px;padding:8px;
 display:grid;place-items:center;flex:none;}
.tc .conbar .mic:hover{background:#F3F4F2;color:var(--ink);}
.tc .conbar .mic.on{background:var(--accsoft);color:var(--acc);}
.tc .conbar .btn{white-space:nowrap;flex:none;}
.tc .concierge .confirm{font-size:12.5px;color:var(--soft);margin:10px 4px 0;}
.tc .bulkcard{text-align:left;margin-top:16px;color:var(--ink);}
.tc .bulkrow{display:grid;grid-template-columns:minmax(140px,1fr) 86px 150px 110px 64px 22px;gap:6px;
 align-items:center;padding:4px 0;}
@media(max-width:760px){.tc .bulkrow{grid-template-columns:1fr 80px;}}
.tc .analysis{border-left:2px solid var(--acc);padding:6px 0 6px 12px;margin-top:10px;}
.tc .analysis p{font-size:13px;line-height:1.55;margin:5px 0 0;white-space:pre-wrap;}
.tc .doc{border:1px solid var(--line);border-radius:var(--r);padding:12px 14px;margin-bottom:10px;background:var(--surface);}
.tc .doc .snip{font-size:12.5px;color:var(--soft);margin:7px 0 0;line-height:1.5;}
.tc .doc pre{white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:12.5px;color:var(--soft);
 margin:10px 0 0;padding-top:10px;border-top:1px solid var(--hair);max-height:300px;overflow-y:auto;}
.tc .dropzone{border:1px dashed #C9CDD2;border-radius:var(--r);padding:18px;text-align:center;
 color:var(--soft);font-size:12.5px;margin-bottom:14px;}
.tc .dropzone.over{background:var(--accsoft);border-color:var(--acc);}
.tc .card.dragover{border-color:var(--acc);box-shadow:0 0 0 3px rgba(91,91,214,.13);}

/* daily bread */
.tc .verse{font-size:19px;line-height:1.5;letter-spacing:.015em;margin:4px 0 10px;max-width:680px;font-style:italic;}
.tc .verseref{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;color:var(--acc);}
.tc .verseline{font-size:13px;color:var(--soft);line-height:1.5;margin:12px 0 0;padding-top:12px;
 border-top:1px solid var(--hair);}

/* tooltip */
.tc .tip{background:#fff;border:1px solid var(--line);color:var(--ink);border-radius:7px;
 padding:7px 10px;font-size:12px;line-height:1.5;}
.tc .tip .k{color:var(--soft);}

/* setup */
.tc .setup{margin:0 auto;padding:7vh 32px 60px;}
.tc .setup .hero{padding:64px 28px;}
.tc .setup h1{font-size:clamp(30px,4.6vw,46px);line-height:1.15;letter-spacing:.06em;font-weight:500;}
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
/*  root                                                               */
/* ================================================================== */

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dash");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [armClean, setArmClean] = useState(false);
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
  const ctx = { state, patch, plan, writeMonth, month, setMonth, m, setView };
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
              <b className="num" style={{ color: m.available < 0 ? C.warn : C.ink }}>{money(m.available)}</b>
            </div>
            {state.demo && (
              <button className="btn ghost tiny" style={{ width: "100%" }} onClick={startClean}>
                {armClean ? "Tap again to erase the sample" : "Sample · start clean"}
              </button>
            )}
            {m.faithOn && view !== "dash" && (
              <div className="sideverse">
                <div className="navlab" style={{ margin: "0 0 4px" }}>Daily bread</div>
                <p className="vt">“{m.verse.text}”</p>
                <span className="vr">{m.verse.ref}</span>
              </div>
            )}
          </div>
        </aside>
        <main className="main">
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
      return { ...b, amount, usual: b.amount, overridden: over !== undefined && over !== b.amount, paid, overdue, dueSoon };
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
      if (entry) out.push({ month: k, amount: entry.amount, paid: true });
      else if (over !== undefined) out.push({ month: k, amount: over, paid: (mm.paid || []).includes(billId) });
    }
    return out;
  };

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
      return { months: 0, interest: 0, order };
    let months = 0, interest = 0;
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
    }
    return { months, interest, order };
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

  return {
    pA, pB, income, spentBy, spentByWho, planned, spent, goalMonthly, allocated, unallocated,
    leftToSpend, savingsRate, assets, debts, assetTotal, debtTotal, netWorth, debtMin, byGroup,
    goalStatus, history, bills, billsTotal, billsLeft, billHistory, payoff, notes, thesis, shareA, jointCost,
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
  const segs = plan.envelopes.filter((e) => e.planned > 0)
    .map((e) => ({ k: e.id, w: (e.planned / base) * 100, c: m.ownerColor(e.owner), t: `${e.name} · ${money(e.planned)}` }));
  if (m.goalMonthly > 0) segs.push({ k: "g", w: (m.goalMonthly / base) * 100, c: C.joint, t: `Goals · ${money(m.goalMonthly)}` });
  return (
    <div>
      <div className="rail">
        {segs.map((s) => <div key={s.k} className="seg" style={{ width: s.w + "%", background: s.c }} title={s.t} />)}
        {m.unallocated > 1 && <div className="seg gap" style={{ width: (m.unallocated / base) * 100 + "%" }} title={`Unassigned · ${money(m.unallocated)}`} />}
        {!segs.length && <div className="seg gap" style={{ width: "100%" }} title="Nothing assigned yet" />}
      </div>
      <div className="railkey">
        <span><i className="dot" style={{ background: C.a }} />{m.pA.name}</span>
        <span><i className="dot" style={{ background: C.b }} />{m.pB.name}</span>
        <span><i className="dot" style={{ background: C.joint }} />shared &amp; goals</span>
        <span><i className="dot" style={{ border: "1px dashed " + C.soft }} />unassigned</span>
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
function EntryRow({ t, plan, m, writeMonth }) {
  const [open, setOpen] = useState(false);
  const env = plan.envelopes.find((e) => e.id === t.envId);
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
          <input className="field num" value={t.amount || ""} placeholder="0"
            onChange={(e) => set("amount", num(e.target.value))} aria-label="Amount" />
        </div>
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
            <input className="field num" value={inc.day}
              onChange={(e) => setInc(inc.id, "day", Math.min(31, Math.max(1, num(e.target.value) || 1)))} aria-label="Day of month" />
          ) : (
            <input className="field num" type="date"
              value={inc.date || `${month}-${String(inc.day || 15).padStart(2, "0")}`}
              onChange={(e) => setIncDate(inc.id, e.target.value)} aria-label="Expected date" />
          )}
        </div>
        <div>
          <label className="lbl">Amount</label>
          <input className="field num" value={inc.amount || ""} placeholder="0"
            onChange={(e) => setInc(inc.id, "amount", num(e.target.value))} aria-label="Amount" />
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
function Concierge({ ctx }) {
  const { m, plan, writeMonth, patch, month } = ctx;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
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

  const log = async () => {
    const raw = text.trim();
    if (!raw || busy) return;
    setBusy(true); setLast(null);
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
      setLast({ err: "Couldn't find an amount in that — try something like “14.50 coffee”." });
      setBusy(false);
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
          : `Try “$42 groceries”, “Mortgage $2,700 on the first”, “bonus $900 the 10th” — or paste a whole list`}
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
        <button className="btn" onClick={log} disabled={busy || !text.trim()}>{busy ? "…" : "Log it"}</button>
      </div>
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
              <input className="field num" value={it.amount} onChange={(e) => setBulkItem(i, "amount", num(e.target.value))} aria-label="Amount" />
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

function Dashboard({ ctx }) {
  const { m, plan, month, setMonth, state, setView, writeMonth, patch } = ctx;
  const [showSpend, setShowSpend] = useState(false);
  const [selGroup, setSelGroup] = useState(null);

  const groupData = GROUPS
    .map((g) => ({ name: g, value: (m.byGroup[g] || {}).spent || 0, planned: (m.byGroup[g] || {}).planned || 0 }))
    .filter((d) => d.value > 0 || d.planned > 0);
  const groupEnvIds = selGroup
    ? plan.envelopes.filter((e) => (e.group || "Other") === selGroup).map((e) => e.id)
    : [];
  const groupEntries = plan.entries.filter((t) => groupEnvIds.includes(t.envId));
  const selStats = selGroup ? (m.byGroup[selGroup] || { spent: 0, planned: 0 }) : null;

  const nextBill = m.bills.find((b) => !b.paid);

  return (
    <>
      <Head
        title="Overview"
        sub={`${monthLabel(month)} · ${plan.entries.length} transaction${plan.entries.length === 1 ? "" : "s"} logged`}
        right={<MonthNav month={month} setMonth={setMonth} />}
      />

      <Guidance m={m} line={null} />

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

      <Concierge ctx={ctx} />

      <div className="card herocard">
        <div className="biglab">Available to spend</div>
        <div className="bignum num" style={{ color: m.available < 0 ? C.warn : C.ink }}>
          {money(m.available)}<span className="ofinc"> of {money(m.income)} coming in{m.incomingLeft > 0 ? ` (${money(m.incomingLeft)} still to come)` : ""}{m.perDay !== null ? ` · ${money(m.perDay)}/day for ${m.daysLeft} more day${m.daysLeft === 1 ? "" : "s"}` : ""}</span>
        </div>
        <p className="herosub">{m.thesis[0]} {m.thesis[1]}</p>
        <Rail m={m} plan={plan} />
      </div>

      {m.faithOn && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="chead">
            <h3>Giving</h3>
            <span className="meta">the first fruits, not the leftovers</span>
          </div>
          <div className="grid g4">
            <Kpi label="Given this month" value={money(m.giving.given)} tone={m.giving.metTarget ? "up" : ""}
              foot={`${m.giving.givenPct.toFixed(1)}% of income`} />
            <Kpi label={`The ${m.giving.targetPct}% mark`} value={money(m.giving.target)}
              foot={m.giving.metTarget ? "met this month" : m.giving.target > 0 ? `${money(Math.max(0, m.giving.target - m.giving.given))} to go` : "set incomes to see it"} />
            <Kpi label="Given this year" value={money(m.giving.ytd)} foot="every month on record" />
            <Kpi label="Set aside" value={money(m.giving.planned)} foot="in Giving envelopes" />
          </div>
          <div className="givetrack">
            <i style={{ width: Math.min(100, m.giving.target > 0 ? (m.giving.given / m.giving.target) * 100 : 0) + "%" }} />
          </div>
          {(state.milestoneLog || []).length > 0 && (
            <p className="mstone">
              Moments marked: {(state.milestoneLog || []).slice(-3).map((x) => `${x.text.replace(/\.$/, "")} (${monthLabel(x.when, true)})`).join(" · ")}
            </p>
          )}
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Coming in" value={money(m.income)}
          foot={m.extrasTotal > 0
            ? `${money(m.baseIncome)} take-home + ${money(m.extrasTotal)} posted${m.incomingLeft > 0 ? ` · ${money(m.incomingLeft)} yet to arrive` : ""}`
            : `${m.pA.name} & ${m.pB.name}, take-home`} />
        <Kpi label="Assigned" value={money(m.allocated)}
          foot={m.income > 0 ? `${money(m.planned)} to envelopes + ${money(m.goalMonthly)} to goals` : "set incomes in Settings"} />
        <Kpi label="Spent this month" value={money(m.spent)} tone={m.leftToSpend < 0 ? "down" : ""}
          foot={`${money(m.leftToSpend)} left of ${money(m.planned)} — tap to see & edit`}
          onClick={() => setShowSpend(!showSpend)} active={showSpend} />
        <Kpi label="Bills due next" value={nextBill ? money(nextBill.amount) : "—"}
          foot={nextBill ? `${nextBill.name} · the ${ordinal(nextBill.day)}` : "nothing unpaid"} />
      </div>

      {showSpend && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="chead">
            <h3>This month, in detail</h3>
            <span className="meta num">{money(m.spent)} across {plan.entries.length} entries — everything here is editable</span>
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {plan.entries.length === 0
              ? <p className="empty">Nothing logged yet this month. Tell the concierge above what you spent.</p>
              : plan.entries.map((t) => <EntryRow key={t.id} t={t} plan={plan} m={m} writeMonth={writeMonth} />)}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead">
          <h3>Where it went</h3>
          <span className="meta">{selGroup ? `${selGroup} — tap the slice again to close it` : "tap a slice or a chip to open it"}</span>
        </div>
        {groupData.length === 0 ? <p className="empty">Nothing planned or spent yet this month.</p> : (
          <div className="grid g2">
            <div>
              <div style={{ height: 235 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={groupData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={84}
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
              </div>
              <div className="chips" style={{ justifyContent: "center", marginBottom: 0 }}>
                {groupData.map((d) => (
                  <button key={d.name} className={"chip " + (selGroup === d.name ? "on" : "")}
                    onClick={() => setSelGroup(selGroup === d.name ? null : d.name)}>
                    <i className="dot" style={{ background: GROUP_COLORS[d.name] || C.soft, marginRight: 6 }} />
                    {d.name} · {money(d.value)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              {!selGroup ? (
                <p className="empty">
                  The house, daily life, the fun, giving — each slice opens into every entry inside it,
                  and anything can be changed right here.
                </p>
              ) : (
                <>
                  <div className="metaline" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                    <b style={{ fontFamily: "'Space Grotesk', Inter, sans-serif", fontSize: 17 }}>{selGroup}</b>
                    <span className="num">{money(selStats.spent)} of {money(selStats.planned)} planned</span>
                  </div>
                  <div className="track">
                    <i style={{
                      width: Math.min(100, selStats.planned > 0 ? (selStats.spent / selStats.planned) * 100 : (selStats.spent > 0 ? 100 : 0)) + "%",
                      background: selStats.planned > 0 && selStats.spent > selStats.planned ? C.warn : GROUP_COLORS[selGroup],
                    }} />
                  </div>
                  <div style={{ maxHeight: 250, overflowY: "auto" }}>
                    {groupEntries.length === 0
                      ? <p className="empty">Nothing logged in {selGroup} yet this month.</p>
                      : groupEntries.map((t) => <EntryRow key={t.id} t={t} plan={plan} m={m} writeMonth={writeMonth} />)}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid g23" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead"><h3>Six months of cash flow</h3><span className="meta">income vs. what you actually spent</span></div>
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
          <div className="chead"><h3>Planner notes</h3><button className="btn ghost tiny" onClick={() => setView("planner")}>Ask why</button></div>
          <Notes notes={m.notes} limit={6} />
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="chead"><h3>Goals</h3><button className="btn ghost tiny" onClick={() => setView("goals")}>Manage</button></div>
          {state.goals.length === 0 ? <p className="empty">No goals yet — the part of the plan that's actually fun.</p> :
            state.goals.slice(0, 4).map((g) => {
              const st = m.goalStatus(g);
              return (
                <div key={g.id} style={{ marginBottom: 13 }}>
                  <div className="metaline" style={{ justifyContent: "space-between" }}>
                    <b style={{ fontFamily: "'Space Grotesk', Inter, sans-serif", fontSize: 15 }}>{g.name}</b>
                    <span className="num">{money(g.saved)} / {money(g.target)}</span>
                  </div>
                  <div className="track"><i style={{ width: st.pct + "%", background: st.late ? C.warn : C.joint }} /></div>
                  <div className="metaline">
                    {st.done ? <span className="flag ok">Funded</span> : st.eta ? <span>lands <b>{monthLabel(st.eta)}</b></span> : <span>set a monthly amount</span>}
                    {st.late && <span className="flag late">needs {money(st.needed)}/mo</span>}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="card">
          <div className="chead">
            <h3>Coming due</h3>
            <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span className="meta num">{money(m.billsLeft)} left</span>
              <button className="btn ghost tiny" onClick={() => setView("bills")}>Manage</button>
            </span>
          </div>
          {m.bills.length === 0 ? (
            <p className="empty">No recurring bills yet. <button className="btn ghost tiny" onClick={() => setView("bills")}>Add some</button></p>
          ) : m.bills.slice(0, 7).map((b) => (
            <div className="note" key={b.id} style={{ justifyContent: "space-between" }}>
              <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <span className="tick" style={{ background: b.paid ? C.a : b.overdue ? C.warn : C.joint, minHeight: 15 }} />
                <span>{b.name}<span className="muted"> · {ordinal(b.day)}</span>
                  {b.overdue && <span className="over" style={{ fontWeight: 600 }}> · overdue</span>}</span>
              </span>
              <span className={"num " + (b.paid ? "muted" : "")}>{money(b.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  2. budget                                                          */
/* ================================================================== */

function Budget({ ctx }) {
  const { m, plan, writeMonth, month, setMonth, state, patch } = ctx;
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
  const addIncome = () => {
    if (!ni.name.trim() || !num(ni.amount)) return;
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

  return (
    <>
      <Head title="Budget" sub="Plan the month before it happens. Tap any number to change it."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <Guidance m={m} theme="planning"
        line={m.unallocated > 1 ? `${money(m.unallocated)} still needs a job before the plan is finished.`
          : m.unallocated < -1 ? `The plan is ${money(-m.unallocated)} past income — something has to come down.`
            : "Every dollar has a job this month."} />

      <div className="card" style={{ marginBottom: 16 }}>
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
                  : <input className="num" value={p.income || ""} placeholder="0"
                      onChange={(e) => patch((s) => { s.household.partners[i].income = num(e.target.value); return s; })}
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
                  <input className="num" value={inc.amount || ""} placeholder="0"
                    onChange={(e) => setInc(inc.id, "amount", num(e.target.value))} aria-label="Amount" />
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
          <button className="btn" onClick={addIncome} disabled={!ni.name.trim() || !num(ni.amount)}>Add</button>
        </div>
        <p className="empty" style={{ marginTop: 10 }}>
          Paychecks set the take-home above; a bonus, an invoice, a side job counts on top. Either way it flows into
          everything — available to spend, the plan, the fair split, the cash-flow chart, and the planner's advice.
        </p>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Income" value={money(m.income)}
          foot={m.extrasTotal > 0 ? `${money(m.baseIncome)} take-home + ${money(m.extrasTotal)} posted` : undefined} />
        <Kpi label="Planned out" value={money(m.planned)} foot={`${Math.round(m.income ? (m.planned / m.income) * 100 : 0)}% of income`} />
        <Kpi label="Toward goals" value={money(m.goalMonthly)} />
        <Kpi label="Unassigned" value={money(m.unallocated)} tone={m.unallocated < -1 ? "down" : m.unallocated > 1 ? "mid" : "up"} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}><Rail m={m} plan={plan} /></div>

      <div className="card">
        {GROUPS.filter((g) => m.byGroup[g]).map((g) => {
          const grp = m.byGroup[g];
          return (
            <div key={g}>
              <div className="grouphead">
                <span>{g}</span>
                <span className="num">{money(grp.spent)} of {money(grp.planned)}</span>
              </div>
              {grp.items.map((e) => {
                const i = plan.envelopes.findIndex((x) => x.id === e.id);
                const s = m.spentBy[e.id] || 0;
                const over = e.planned > 0 && s > e.planned;
                const pct = e.planned > 0 ? Math.min(100, (s / e.planned) * 100) : s > 0 ? 100 : 0;
                return (
                  <div className="row" key={e.id}>
                    <div className="rowname">
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
                        mm.envelopes.splice(i, 1);
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
                );
              })}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn ghost tiny" onClick={() => writeMonth((mm) => {
            mm.envelopes.push({ id: uid(), name: "New envelope", group: "Other", planned: 0, owner: "joint" });
            return mm;
          })}>Add an envelope</button>
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

function Spending({ ctx }) {
  const { m, plan, writeMonth, month, setMonth } = ctx;
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const [env, setEnv] = useState("all");

  const rows = plan.entries.filter((t) => {
    if (who !== "all" && t.who !== who) return false;
    if (env !== "all" && t.envId !== env) return false;
    if (q && !(t.note || "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const total = rows.reduce((n, t) => n + t.amount, 0);

  return (
    <>
      <Head title="Spending" sub="Everything logged this month, and who spent it."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <Guidance m={m} theme="contentment"
        line={m.leftToSpend >= 0 ? `${money(m.leftToSpend)} left to spend inside what you planned.`
          : `Spending is ${money(-m.leftToSpend)} past the plan this month.`} />

      <Logger envelopes={plan.envelopes} m={m}
        onAdd={(e) => writeMonth((mm) => { mm.entries.unshift(e); return mm; })} />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Spent this month" value={money(m.spent)} foot={`${plan.entries.length} transactions`} />
        <Kpi label={`Paid by ${m.pA.name}`} value={money(m.spentByWho.a || 0)} foot="includes shared purchases they covered" />
        <Kpi label={`Paid by ${m.pB.name}`} value={money(m.spentByWho.b || 0)} foot="includes shared purchases they covered" />
        <Kpi label="Marked shared" value={money(m.spentByWho.joint || 0)} />
      </div>

      <div className="toolbar">
        <input className="field" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 170 }} aria-label="Search notes" />
        <select className="field" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
          <option value="all">Anyone</option>
          <option value="a">{m.pA.name}</option>
          <option value="b">{m.pB.name}</option>
          <option value="joint">Shared</option>
        </select>
        <select className="field" value={env} onChange={(e) => setEnv(e.target.value)} aria-label="Filter by envelope">
          <option value="all">All envelopes</option>
          {plan.envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="muted num" style={{ marginLeft: "auto" }}>{rows.length} shown · {money(total)}</span>
      </div>

      <div className="card">
        {rows.length === 0 ? <p className="empty">Nothing matches. Clear the filters, or log something above.</p> :
          rows.map((t) => <EntryRow key={t.id} t={t} plan={plan} m={m} writeMonth={writeMonth} />)}
      </div>
    </>
  );
}

function Logger({ envelopes, m, onAdd }) {
  const [amount, setAmount] = useState("");
  const [envId, setEnvId] = useState(envelopes[0] ? envelopes[0].id : "");
  const [who, setWho] = useState("joint");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!envelopes.some((e) => e.id === envId)) setEnvId(envelopes[0] ? envelopes[0].id : "");
  }, [envelopes, envId]);

  const submit = () => {
    const amt = num(amount);
    if (!amt || !envId) return;
    onAdd({
      id: uid(), envId, amount: amt, who, note: note.trim(),
      date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
    setAmount(""); setNote("");
  };
  const key = (e) => e.key === "Enter" && submit();

  return (
    <div className="logger">
      <input className="field num" placeholder="$0" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={key} aria-label="Amount" />
      <select className="field" value={envId} onChange={(e) => setEnvId(e.target.value)} aria-label="Envelope">
        {envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <select className="field" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who spent it">
        <option value="joint">Both of us</option>
        <option value="a">{m.pA.name}</option>
        <option value="b">{m.pB.name}</option>
      </select>
      <input className="field wide" placeholder="What was it for?" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={key} aria-label="Note" />
      <button className="btn" onClick={submit} disabled={!num(amount)}>Log it</button>
    </div>
  );
}

/* ================================================================== */
/*  4. bills                                                           */
/* ================================================================== */

const COMMON_BILLS = ["Rent", "Mortgage", "Electric", "Water", "Gas", "Internet", "Phone plan", "Car payment", "Car insurance", "Streaming", "Gym"];

/*  One bill: a clean read line (name · due day · envelope · amount ·
    paid button); clicking opens the labeled editor with this month's
    amount, the usual, and the cost history.                          */
function BillRow({ b, m, state, plan, patch, togglePaid, setBillAmount, makeUsual }) {
  const [open, setOpen] = useState(false);
  const i = state.bills.findIndex((x) => x.id === b.id);
  const set = (f, v) => patch((s) => { s.bills[i][f] = v; return s; });
  const env = plan.envelopes.find((e) => e.id === b.envId);
  const paidBtn = (
    <button className={"btn tiny " + (b.paid ? "" : "ghost")}
      onClick={(e) => { e.stopPropagation(); togglePaid(b); }}>
      {b.paid ? "Paid" : b.overdue ? "Overdue — mark paid" : "Mark paid"}
    </button>
  );

  if (!open) return (
    <div className="row wide click" role="button" tabIndex={0} onClick={() => setOpen(true)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
      aria-label={`Edit ${b.name}`}>
      <div className="rowname">
        <span style={{ width: 4, height: 16, borderRadius: 3, flex: "none", background: b.paid ? C.a : b.overdue ? C.warn : C.joint }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          due the {ordinal(b.day)}{env ? ` · ${env.name}` : ""}
        </span>
        {b.overridden && <span className="tag hideS">usually {money(b.usual)}</span>}
      </div>
      <div className="amt hideS"><span className="editHint">edit</span></div>
      <div className="amt num">{money(b.amount)}</div>
      <div className="amt">{paidBtn}</div>
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
          <label className="lbl">Amount this month</label>
          <input className="field num" value={b.amount || ""} placeholder="0"
            onChange={(e) => setBillAmount(b, num(e.target.value))} aria-label={`${b.name} amount this month`} />
        </div>
        <div>
          <label className="lbl">Due day</label>
          <input className="field num" value={b.day}
            onChange={(e) => set("day", Math.min(31, Math.max(1, num(e.target.value) || 1)))} aria-label="Due day" />
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
                  {monthLabel(x.month, true)} <b className="num" style={{ color: "#3F4349" }}>{money(x.amount)}</b>
                  {x.paid ? "" : <span className="muted"> planned</span>}
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
  const { m, state, patch, plan, writeMonth, month, setMonth } = ctx;
  const set = (i, f, v) => patch((s) => { s.bills[i][f] = v; return s; });
  const [nb, setNb] = useState({ name: "", amount: "", day: "", envId: "" });

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
      [/car payment|auto loan|loan|card/, /debt/],
      [/stream|subscript|music/, /subscript/],
      [/gym|dental|insurance|health/, /health/],
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
    if (!nb.name.trim() || !num(nb.amount)) return;
    patch((s) => {
      s.bills.push({
        id: uid(), name: nb.name.trim(), amount: num(nb.amount),
        day: Math.min(31, Math.max(1, num(nb.day) || 1)),
        envId: nb.envId, owner: "joint",
      });
      return s;
    });
    setNb({ name: "", amount: "", day: "", envId: "" });
  };
  const nbKey = (e) => e.key === "Enter" && addBill();

  const togglePaid = (b) => writeMonth((mm) => {
    mm.paid = mm.paid || [];
    if (mm.paid.includes(b.id)) {
      mm.paid = mm.paid.filter((x) => x !== b.id);
      // Un-paying removes the entry the paid-toggle logged, so the toggle
      // is symmetric and never double-counts. billId stamps new entries;
      // the note match catches ones logged before the stamp existed.
      const k = mm.entries.findIndex((t) => t.billId === b.id);
      const k2 = k > -1 ? k : mm.entries.findIndex((t) =>
        t.envId === b.envId && t.amount === b.amount && t.note === b.name + " (bill)");
      if (k2 > -1) mm.entries.splice(k2, 1);
    } else {
      mm.paid.push(b.id);
      if (b.envId && mm.envelopes.some((e) => e.id === b.envId))
        mm.entries.unshift({
          id: uid(), billId: b.id, envId: b.envId, amount: b.amount, who: b.owner, note: b.name + " (bill)",
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
    }
    return mm;
  });

  return (
    <>
      <Head title="Bills & files" sub="The fixed stuff — mark one paid and it logs itself into the right envelope. The paper drawer of receipts and documents lives below."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <Guidance m={m} theme="debt"
        line={m.billsLeft > 0 ? `${money(m.billsLeft)} in bills still to pay this month.` : "Everything owed this month is paid."} />

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Kpi label="Monthly bills" value={money(m.billsTotal)} foot={`${state.bills.length} recurring`} />
        <Kpi label="Still unpaid" value={money(m.billsLeft)} tone={m.billsLeft > 0 ? "mid" : "up"} />
        <Kpi label="Share of income" value={m.income ? Math.round((m.billsTotal / m.income) * 100) + "%" : "—"} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead"><h3>Add a bill</h3><span className="meta">tap one below, or type your own — it picks the envelope for you</span></div>
        <div className="chips">
          {COMMON_BILLS.map((b) => (
            <button key={b} className={"chip " + (nb.name === b ? "on" : "")}
              onClick={() => setNb({ ...nb, name: b, envId: guessEnv(b) })}>{b}</button>
          ))}
        </div>
        <div className="quickbill">
          <input className="field" placeholder="Bill name" value={nb.name}
            onChange={(e) => setNb({ ...nb, name: e.target.value, envId: nb.envId || guessEnv(e.target.value) })}
            onKeyDown={nbKey} aria-label="Bill name" />
          <input className="field num" placeholder="$0" value={nb.amount}
            onChange={(e) => setNb({ ...nb, amount: e.target.value })} onKeyDown={nbKey} aria-label="Amount" />
          <input className="field num" placeholder="Due day" value={nb.day}
            onChange={(e) => setNb({ ...nb, day: e.target.value })} onKeyDown={nbKey} aria-label="Due day of month" />
          <select className="field" value={nb.envId} onChange={(e) => setNb({ ...nb, envId: e.target.value })} aria-label="Envelope">
            <option value="">no envelope</option>
            {plan.envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button className="btn" onClick={addBill} disabled={!nb.name.trim() || !num(nb.amount)}>Add</button>
        </div>
        <p className="empty" style={{ marginTop: 10 }}>
          Link an envelope and marking the bill paid logs the spending into it automatically. Amounts can change
          month to month — retype the amount when the real bill arrives and only that month changes; tap
          "history" on any bill to see what it has actually cost.
        </p>
      </div>

      <div className="card">
        {state.bills.length === 0 && <p className="empty">Add the bills that repeat every month — rent, insurance, the streaming stack you forgot about.</p>}
        {m.bills.map((b) => (
          <BillRow key={b.id} b={b} m={m} state={state} plan={plan} patch={patch}
            togglePaid={togglePaid} setBillAmount={setBillAmount} makeUsual={makeUsual} />
        ))}
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
              style={{ fontFamily: "'Space Grotesk', Inter, sans-serif", fontSize: 16 }} />
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
  const { m, state, patch, month } = ctx;
  const totalTarget = state.goals.reduce((n, g) => n + g.target, 0);
  const totalSaved = state.goals.reduce((n, g) => n + g.saved, 0);

  return (
    <>
      <Head title="Goals" sub="Anything you'd rather fund on purpose than pay for by surprise." />

      <Guidance m={m} theme="diligence"
        line={m.goalMonthly > 0 ? `${money(m.goalMonthly)} a month moves toward what's next, little by little.` : "Nothing is flowing to goals monthly yet."} />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Saved so far" value={money(totalSaved)} foot={`of ${money(totalTarget)} across ${state.goals.length}`} />
        <Kpi label="Going in monthly" value={money(m.goalMonthly)} />
        <Kpi label="Savings rate" value={Math.round(m.savingsRate) + "%"} tone={m.savingsRate >= 15 ? "up" : "mid"} />
        <Kpi label="On track" value={`${state.goals.filter((g) => !m.goalStatus(g).late).length} / ${state.goals.length}`} />
      </div>

      {state.goals.length === 0 && <div className="card"><p className="empty">No goals yet. Start with the one you'd both name first if someone asked.</p></div>}

      {state.goals.map((g, i) => {
        const st = m.goalStatus(g);
        const set = (f, v) => patch((s) => { s.goals[i][f] = v; return s; });
        const proj = [];
        if (g.monthly > 0 && st.remaining > 0) {
          const steps = Math.min(st.monthsNeeded, 24);
          for (let k = 0; k <= steps; k++)
            proj.push({ label: monthLabel(shiftMonth(month, k), true), Projected: Math.min(g.target, g.saved + g.monthly * k) });
        }
        return (
          <div className="card" key={g.id} style={{ marginBottom: 14 }}>
            <div className="chead">
              <input className="field" style={{ border: "none", background: "none", fontFamily: "'Space Grotesk', Inter, sans-serif", fontSize: 19, padding: 0 }}
                value={g.name} onChange={(e) => set("name", e.target.value)} aria-label="Goal name" />
              <button className="kill" onClick={() => {
                if (!window.confirm(`Remove ${g.name}? It has ${money(g.saved)} recorded toward it.`)) return;
                patch((s) => { s.goals.splice(i, 1); return s; });
              }} aria-label={`Remove ${g.name}`}>×</button>
            </div>
            <div className="track"><i style={{ width: st.pct + "%", background: st.late ? C.warn : C.joint }} /></div>
            <div className="metaline">
              <span className="num"><b>{money(g.saved)}</b> of {money(g.target)} · {Math.round(st.pct)}%</span>
              {st.done ? <span className="flag ok">Funded</span>
                : st.eta ? <span>lands <b>{monthLabel(st.eta)}</b>{g.due ? ` · wanted by ${monthLabel(g.due)}` : ""}</span>
                  : <span>add a monthly amount to see when it lands</span>}
              {st.late && <span className="flag late">needs {money(st.needed)}/mo</span>}
              {!st.late && g.due && !st.done && <span className="flag ok">on pace</span>}
              <button className="btn ghost tiny" onClick={() => set("saved", g.saved + g.monthly)}>
                Add this month's {money(g.monthly)}
              </button>
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
              <div><label className="lbl">Target</label><input className="field num" value={g.target || ""} placeholder="0" onChange={(e) => set("target", num(e.target.value))} /></div>
              <div><label className="lbl">Saved</label><input className="field num" value={g.saved || ""} placeholder="0" onChange={(e) => set("saved", num(e.target.value))} /></div>
              <div><label className="lbl">Monthly</label><input className="field num" value={g.monthly || ""} placeholder="0" onChange={(e) => set("monthly", num(e.target.value))} /></div>
              <div><label className="lbl">Want it by</label><input className="field num" type="month" value={g.due || ""} onChange={(e) => set("due", e.target.value)} /></div>
            </div>
          </div>
        );
      })}
      <button className="btn ghost tiny" onClick={() => patch((s) => {
        s.goals.push({ id: uid(), name: "New goal", target: 0, saved: 0, monthly: 0, due: "", owner: "joint" });
        return s;
      })}>Add a goal</button>
    </>
  );
}

/* ================================================================== */
/*  6. net worth + debt                                                */
/* ================================================================== */

function NetWorth({ ctx }) {
  const { m, state, patch, month } = ctx;
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
        <Kpi label="Net worth" value={money(m.netWorth)} tone={m.netWorth < 0 ? "down" : "up"} />
        <Kpi label="Assets" value={money(m.assetTotal)} foot={`${m.assets.length} accounts`} />
        <Kpi label="Debt" value={money(m.debtTotal)} foot={`${money(m.debtMin)}/mo in minimums`} tone={m.debtTotal > 0 ? "down" : ""} />
      </div>

      <div className="grid g23" style={{ marginBottom: 16 }}>
        <div className="card">
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
                    <input className="num" style={{ width: 40, textAlign: "left" }} value={a.apr || ""} placeholder="0"
                      onChange={(e) => set(i, "apr", num(e.target.value))} aria-label="APR" />
                    <span className="muted">%</span>
                  </>
                )}
              </div>
              <div className="amt hideS">
                {a.type === "debt" && <input className="num" value={a.minPayment || ""} placeholder="min"
                  onChange={(e) => set(i, "minPayment", num(e.target.value))} aria-label="Minimum payment" />}
              </div>
              <div className="amt">
                <input className="num" value={a.balance || ""} placeholder="0" onChange={(e) => set(i, "balance", num(e.target.value))} aria-label="Balance" />
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
        <div className="card">
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
  const { m, plan, month, setMonth, state } = ctx;

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
            <Kpi label={`${m.pA.name}'s share of shared costs`} value={money(m.jointCost * m.shareA)} foot={`${Math.round(m.shareA * 100)}% of ${money(m.jointCost)}`} />
            <Kpi label={`${m.pB.name}'s share`} value={money(m.jointCost * (1 - m.shareA))} foot={`${Math.round((1 - m.shareA) * 100)}% of ${money(m.jointCost)}`} />
            <Kpi label="Outside the shared pot" value={money(personal)} foot="personal envelopes, spending money, and anything unassigned" />
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
  const localSearch = (qRaw) => {
    const needle = qRaw.toLowerCase();
    const out = [];
    (state.docs || []).forEach((d) => {
      const i = d.text.toLowerCase().indexOf(needle);
      if (d.name.toLowerCase().includes(needle) || i >= 0) {
        const snip = (i >= 0 ? d.text.slice(Math.max(0, i - 40), i + 90) : d.text.slice(0, 90)).replace(/\s+/g, " ").trim();
        out.push(`Paper drawer — ${d.name} (${d.folder}): “…${snip}…”`);
      }
    });
    state.bills.forEach((b) => {
      if (b.name.toLowerCase().includes(needle)) out.push(`Bill — ${b.name}, ${money(b.amount)} due the ${ordinal(b.day)}.`);
    });
    Object.keys(state.months).sort().reverse().forEach((k) => {
      (state.months[k].entries || []).forEach((t) => {
        if ((t.note || "").toLowerCase().includes(needle)) out.push(`Spending — ${t.note}, ${money(t.amount)} (${monthLabel(k, true)}).`);
      });
    });
    state.goals.forEach((g) => {
      if (g.name.toLowerCase().includes(needle)) out.push(`Goal — ${g.name}: ${money(g.saved)} of ${money(g.target)}.`);
    });
    (state.incomes || []).forEach((inc) => {
      if (inc.name.toLowerCase().includes(needle)) out.push(`Income — ${inc.name}, ${money(inc.amount)}${inc.recurring ? " every month" : ""}.`);
    });
    return out;
  };

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

  const snapshot = {
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
          system:
            `You are the household financial planner for ${m.pA.name} and ${m.pB.name}, a couple who share money. ` +
            `Speak plainly and warmly, like a planner who knows them. Be specific: use their real numbers and their own category names. ` +
            `Lead with one clear recommendation rather than a menu of options, then the reasoning. Keep it under 180 words unless asked for more. ` +
            `Never invent numbers that aren't in the snapshot — if something is missing, name what they should fill in. ` +
            `Stay neutral between the two of them; never take a side in a disagreement about money. ` +
            `You are not a licensed advisor: for tax, legal, insurance, or investment-product decisions, say so in one line and point them to a professional.\n` +
            (m.faithOn
              ? `They keep a daily scripture practice around money in this app; today's verse and their giving numbers are in the snapshot. When it fits the question, you may frame advice in stewardship terms — giving, contentment, staying out of debt — but never preach, never guilt, and never use scripture to settle a disagreement between them.\n\n`
              : `\n`) +
            `Snapshot (monthly amounts unless noted):\n${JSON.stringify(snapshot, null, 2)}`,
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
                  <div className="field num" style={{ background: "#F1F1EF", color: C.soft }}>
                    {money(i === 0 ? m.eff.a : m.eff.b)} · set by paychecks in Budget
                  </div>
                ) : (
                  <input className="field num" value={state.household.partners[i].income || ""} placeholder="0"
                    onChange={(e) => patch((s) => { s.household.partners[i].income = num(e.target.value); return s; })} />
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
