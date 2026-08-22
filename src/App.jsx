import { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import { verseForDay } from "./scripture.js";

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
    months[k] = { envelopes, entries, paid: [] };
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
  months[cur].paid = bills.filter((b) => b.day < dayNow - 1).map((b) => b.id);

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
      { id: uid(), name: "Credit card", type: "debt", balance: 3850, owner: "joint", apr: 22.9, minPayment: 120 },
    ],
    bills,
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

const NAV = [
  ["dash", "Dashboard"],
  ["budget", "Budget"],
  ["txn", "Spending"],
  ["bills", "Bills"],
  ["files", "Files"],
  ["goals", "Goals"],
  ["worth", "Net worth"],
  ["reports", "Reports"],
  ["planner", "Planner"],
  ["settings", "Settings"],
];

const C = {
  a: "#2E6F63", b: "#6B5CA5", joint: "#A5821F", warn: "#A93E2F",
  soft: "#7A7264", ink: "#221D17", line: "#E2DACB",
};
const PIE = ["#A5821F", "#2E6F63", "#6B5CA5", "#B9862B", "#4C8C7E", "#A93E2F", "#3F5C57", "#C9A227"];

/* ================================================================== */
/*  styles                                                             */
/* ================================================================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500&family=IBM+Plex+Mono:wght@400;500&display=swap');

body{margin:0;background:#F5F1E8;}
.tc{--paper:#F5F1E8;--surface:#FCFAF5;--ink:#221D17;--soft:#7A7264;--line:#E2DACB;
 --a:#2E6F63;--b:#6B5CA5;--joint:#A5821F;--warn:#A93E2F;--r:12px;
 --goldline:rgba(165,130,31,.4);--goldsoft:rgba(165,130,31,.1);--hair:rgba(34,29,23,.08);
 background:var(--paper);color:var(--ink);font-family:'Jost',ui-sans-serif,system-ui,sans-serif;
 min-height:100vh;box-sizing:border-box;-webkit-font-smoothing:antialiased;font-size:14px;font-weight:400;}
.tc *,.tc *::before,.tc *::after{box-sizing:border-box;}
.tc .num{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;}
.tc h1,.tc h2,.tc h3,.tc .serif{font-family:'Cormorant Garamond','Iowan Old Style',Georgia,serif;font-weight:500;margin:0;}
.tc button{font-family:inherit;cursor:pointer;}
.tc :focus-visible{outline:1px solid var(--joint);outline-offset:2px;border-radius:4px;}
.tc .gem{display:flex;align-items:center;justify-content:center;gap:12px;color:var(--joint);
 font-size:10px;line-height:1;}
.tc .gem::before,.tc .gem::after{content:"";height:1px;width:36px;background:var(--goldline);}

/* shell — top bar with clickable tabs */
.tc .shell{min-height:100vh;}
.tc .top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:24px;flex-wrap:wrap;
 padding:14px 28px;background:rgba(245,241,232,.94);backdrop-filter:blur(10px);
 border-bottom:1px solid var(--line);}
.tc .mark{line-height:1.2;min-width:150px;}
.tc .mark .nm{font-family:'Cormorant Garamond',Georgia,serif;font-size:19px;letter-spacing:.08em;display:block;}
.tc .mark .who{font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--soft);}
.tc nav{display:flex;gap:2px;flex:1;justify-content:center;overflow-x:auto;}
.tc nav button{background:none;border:none;border-bottom:1px solid transparent;padding:9px 12px;
 font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--soft);white-space:nowrap;}
.tc nav button:hover{color:var(--ink);}
.tc nav button.on{color:var(--joint);border-bottom-color:var(--joint);}
.tc .topnet{text-align:right;min-width:110px;line-height:1.4;}
.tc .topnet .who{font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--soft);display:block;}
.tc .main{padding:26px 32px 80px;min-width:0;}
@media(max-width:980px){
 .tc .top{gap:10px;padding:12px 16px;}
 .tc nav{order:3;flex-basis:100%;justify-content:flex-start;}
 .tc .mark{flex:1;}
 .tc .main{padding:18px 16px 60px;}
}

/* page head */
.tc .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;
 border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:22px;}
.tc .phead h1{font-size:21px;letter-spacing:.22em;text-transform:uppercase;font-weight:500;}
.tc .phead .sub{font-size:12.5px;color:var(--soft);margin-top:4px;letter-spacing:.02em;}
.tc .monthnav{display:flex;align-items:center;gap:5px;}
.tc .monthnav .m{font-size:13px;min-width:120px;text-align:center;}
.tc .arrow{background:none;border:1px solid var(--line);border-radius:50%;width:25px;height:25px;
 color:var(--soft);font-size:13px;display:grid;place-items:center;line-height:1;}
.tc .arrow:hover{border-color:var(--joint);color:var(--joint);}

/* hero + thesis — stays a dark photo band against the light page */
.tc .hero{position:relative;border-radius:14px;overflow:hidden;text-align:center;color:#F3EDE1;
 padding:58px 28px 54px;margin-bottom:24px;border:1px solid var(--goldline);
 background:linear-gradient(180deg,rgba(20,17,16,.5),rgba(20,17,16,.82)),
  url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=60') center/cover,
  #1D1815;}
.tc .hero .gem{margin-bottom:18px;color:#C9A227;}
.tc .hero .gem::before,.tc .hero .gem::after{background:rgba(201,162,39,.5);}
.tc .thesis{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(24px,3.4vw,38px);line-height:1.3;
 letter-spacing:.05em;max-width:1080px;margin:0 auto;font-weight:500;}
.tc .thesis span{display:block;font-size:clamp(14px,1.6vw,17px);color:rgba(243,237,225,.78);
 letter-spacing:.06em;margin-top:12px;font-style:italic;}

/* grid + cards */
.tc .grid{display:grid;gap:16px;}
.tc .g2{grid-template-columns:repeat(2,minmax(0,1fr));}
.tc .g3{grid-template-columns:repeat(3,minmax(0,1fr));}
.tc .g4{grid-template-columns:repeat(4,minmax(0,1fr));}
.tc .g23{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);}
@media(max-width:980px){.tc .g23,.tc .g3,.tc .g4{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:620px){.tc .grid{grid-template-columns:minmax(0,1fr)!important;}}
.tc .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:17px 18px;}
.tc .card h3{font-size:13.5px;letter-spacing:.24em;text-transform:uppercase;font-weight:500;}
.tc .chead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:14px;}
.tc .chead .meta{font-size:11.5px;color:var(--soft);letter-spacing:.03em;}

/* kpi */
.tc .kpi{padding:15px 16px;}
.tc .kpi .lab{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(165,130,31,.9);}
.tc .kpi .val{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
 font-size:22px;letter-spacing:-.02em;margin-top:8px;line-height:1.1;word-break:break-word;}
.tc .kpi .foot{font-size:11.5px;color:var(--soft);margin-top:7px;line-height:1.4;}
.tc .up{color:var(--a);}.tc .down{color:var(--warn);}.tc .mid{color:var(--joint);}

/* rail */
.tc .rail{display:flex;height:30px;width:100%;gap:2px;}
.tc .seg{min-width:2px;border-radius:3px;}
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
 .tc .hideS{display:none;}}
.tc .rowname{display:flex;align-items:center;gap:8px;min-width:0;}
.tc .rowname input{border:none;background:none;font-size:14px;color:var(--ink);padding:2px 0;
 width:100%;min-width:0;font-family:inherit;}
.tc .rowname input:hover{border-bottom:1px dotted var(--goldline);}
.tc .amt{text-align:right;font-size:13.5px;}
.tc .amt input{width:100%;text-align:right;border:none;background:none;font-size:13.5px;color:var(--ink);
 font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;padding:3px 0;}
.tc .amt input:hover,.tc .amt input:focus{border-bottom:1px solid var(--line);outline:none;}
.tc .muted{color:var(--soft);}
.tc .over{color:var(--warn);font-weight:500;}
.tc .bar{grid-column:1/-1;height:4px;background:rgba(34,29,23,.08);border-radius:3px;overflow:hidden;}
.tc .bar i{display:block;height:100%;border-radius:3px;}
.tc .kill{background:none;border:none;color:#CFC6B4;font-size:15px;padding:0 2px;line-height:1;}
.tc .kill:hover{color:var(--warn);}
.tc .tag{border:1px solid var(--line);background:none;border-radius:20px;font-size:10px;
 letter-spacing:.12em;text-transform:uppercase;padding:2px 8px;color:var(--soft);white-space:nowrap;
 font-family:inherit;max-width:120px;}
.tc .grouphead{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:rgba(165,130,31,.9);
 padding:16px 0 4px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;}

/* controls */
.tc .field{border:1px solid rgba(201,162,39,.28);background:#FFFFFF;border-radius:var(--r);padding:9px 11px;
 font-size:13.5px;color:var(--ink);font-family:inherit;width:100%;}
.tc .field::placeholder{color:#A79D8C;}
.tc .field:focus{border-color:var(--joint);outline:none;}
.tc select.field option{background:#FFFFFF;color:var(--ink);}
.tc .btn{border:1px solid var(--goldline);background:none;color:var(--ink);border-radius:var(--r);
 padding:10px 16px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;}
.tc .btn:hover{background:var(--goldsoft);border-color:var(--joint);}
.tc .btn[disabled]{opacity:.38;cursor:default;}
.tc .btn.ghost{background:none;color:var(--soft);border-color:var(--line);}
.tc .btn.ghost:hover{background:var(--goldsoft);border-color:var(--goldline);color:var(--ink);}
.tc .btn.tiny{padding:5px 10px;font-size:10px;letter-spacing:.16em;}
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
.tc .flag.ok{color:var(--a);}.tc .flag.late{color:var(--warn);}
.tc .metaline{display:flex;flex-wrap:wrap;gap:13px;font-size:12.5px;color:var(--soft);align-items:center;}
.tc .metaline b{color:var(--ink);font-weight:500;}
.tc .fourup{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px;padding-top:12px;
 border-top:1px solid var(--line);}
@media(max-width:640px){.tc .fourup{grid-template-columns:repeat(2,1fr);}}
.tc .lbl{display:block;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(165,130,31,.9);margin-bottom:5px;}

/* notes + chat */
.tc .note{display:flex;gap:9px;font-size:13px;line-height:1.45;padding:8px 0;
 border-bottom:1px solid var(--hair);}
.tc .note:last-child{border-bottom:none;}
.tc .tick{width:4px;flex:none;border-radius:3px;margin:3px 0;}
.tc .chatlog{display:flex;flex-direction:column;gap:12px;overflow-y:auto;margin-bottom:12px;}
.tc .msg{font-size:13.5px;line-height:1.55;white-space:pre-wrap;}
.tc .msg.me{align-self:flex-end;background:#FFFDF8;border:1px solid var(--goldline);color:var(--ink);
 padding:8px 12px;border-radius:12px 12px 3px 12px;max-width:86%;}
.tc .msg.them{border-left:2px solid var(--joint);padding-left:12px;}
.tc .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px;}
.tc .chip{border:1px solid var(--line);background:none;border-radius:20px;padding:5px 12px;font-size:12px;color:var(--soft);}
.tc .chip:hover{border-color:var(--joint);color:var(--joint);}
.tc .chip.on{background:var(--joint);color:#FDFCF7;border-color:var(--joint);}
.tc .askrow{display:flex;gap:7px;}
.tc .empty{font-size:13px;color:var(--soft);line-height:1.55;padding:8px 0;margin:0;}

/* concierge + files */
.tc .concierge{max-width:860px;margin:0 auto 24px;text-align:center;padding:24px 26px;}
.tc .concierge .why{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;color:var(--joint);
 font-size:14.5px;margin:8px 0 15px;}
.tc .concierge .askrow{max-width:680px;margin:0 auto;}
.tc .concierge .askrow .btn{white-space:nowrap;flex:none;}
.tc .concierge .confirm{font-size:12.5px;color:var(--soft);margin:12px 0 0;}
.tc .doc{border:1px solid var(--line);border-radius:var(--r);padding:12px 14px;margin-bottom:10px;background:var(--surface);}
.tc .doc .snip{font-size:12.5px;color:var(--soft);margin:7px 0 0;line-height:1.5;}
.tc .doc pre{white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:12.5px;color:var(--soft);
 margin:10px 0 0;padding-top:10px;border-top:1px solid var(--hair);max-height:300px;overflow-y:auto;}
.tc .dropzone{border:1px dashed var(--goldline);border-radius:var(--r);padding:18px;text-align:center;
 color:var(--soft);font-size:12.5px;margin-bottom:14px;}
.tc .dropzone.over{background:var(--goldsoft);border-color:var(--joint);}

/* daily bread */
.tc .verse{font-size:19px;line-height:1.5;letter-spacing:.015em;margin:4px 0 10px;max-width:680px;font-style:italic;}
.tc .verseref{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--joint);}
.tc .verseline{font-size:13px;color:var(--soft);line-height:1.5;margin:12px 0 0;padding-top:12px;
 border-top:1px solid var(--hair);}

/* tooltip */
.tc .tip{background:#FFFDF8;border:1px solid var(--goldline);color:var(--ink);border-radius:7px;
 padding:7px 10px;font-size:12px;line-height:1.5;}
.tc .tip .k{color:var(--soft);}

/* setup */
.tc .setup{margin:0 auto;padding:7vh 32px 60px;}
.tc .setup .hero{padding:64px 28px;}
.tc .setup h1{font-size:clamp(30px,4.6vw,46px);line-height:1.15;letter-spacing:.06em;font-weight:500;}
.tc .setup .sub{color:var(--soft);font-size:14.5px;line-height:1.6;margin:0 0 26px;letter-spacing:.02em;}
.tc .choice{padding:26px 24px;text-align:center;}
.tc .choice h3{margin:14px 0 6px;}
.tc .choice .why{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;color:var(--joint);
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
      s.months[month] = fn(base);
      return s;
    });

  if (loading)
    return <Frame><div className="empty" style={{ padding: 30 }}>Opening your ledger…</div></Frame>;
  if (!state) return <Setup onDone={setState} />;

  const m = model(state, plan, month);
  const ctx = { state, patch, plan, writeMonth, month, setMonth, m, setView };

  return (
    <Frame>
      <div className="shell">
        <header className="top">
          <div className="mark">
            <span className="nm">{state.household.name}</span>
            <span className="who">{m.pA.name} &amp; {m.pB.name}</span>
          </div>
          <nav>
            {NAV.map(([k, label]) => (
              <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{label}</button>
            ))}
          </nav>
          <div className="topnet">
            <span className="num" style={{ fontSize: 14 }}>{money(m.netWorth)}</span>
            <span className="who">net worth</span>
            {state.demo && (
              <button className="btn ghost tiny" style={{ marginTop: 6 }}
                onClick={async () => {
                  try { await window.storage.delete(KEY); } catch (e) { /* nothing stored */ }
                  setState(null);
                }}>Sample · start clean</button>
            )}
          </div>
        </header>
        <main className="main">
          {view === "dash" && <Dashboard ctx={ctx} />}
          {view === "budget" && <Budget ctx={ctx} />}
          {view === "txn" && <Spending ctx={ctx} />}
          {view === "bills" && <BillsView ctx={ctx} />}
          {view === "files" && <FilesView ctx={ctx} />}
          {view === "goals" && <GoalsView ctx={ctx} />}
          {view === "worth" && <NetWorth ctx={ctx} />}
          {view === "reports" && <Reports ctx={ctx} />}
          {view === "planner" && <PlannerPage ctx={ctx} />}
          {view === "settings" && <SettingsView ctx={ctx} setState={setState} />}
        </main>
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
    docs: [],
    chat: v1.chat || [],
  };
}

/* ================================================================== */
/*  computation layer                                                  */
/* ================================================================== */

function model(state, plan, month) {
  const [pA, pB] = state.household.partners;
  const income = pA.income + pB.income;

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
    history.push({ key: k, label: monthLabel(k, true), spent: s, income, saved: goalMonthly });
  }

  const bills = state.bills
    .map((b) => {
      const paid = (plan.paid || []).includes(b.id);
      const live = month === monthKey(new Date());
      const overdue = !paid && live && b.day < todayDay();
      const dueSoon = !paid && live && !overdue && b.day - todayDay() <= 7;
      return { ...b, paid, overdue, dueSoon };
    })
    .sort((x, y) => x.day - y.day);
  const billsTotal = bills.reduce((n, b) => n + b.amount, 0);
  const billsLeft = bills.filter((b) => !b.paid).reduce((n, b) => n + b.amount, 0);

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

  const shareA = income > 0 ? (state.household.splitRule === "even" ? 0.5 : pA.income / income) : 0.5;
  const jointCost = plan.envelopes.filter((e) => e.owner === "joint").reduce((n, e) => n + e.planned, 0) + goalMonthly;

  /* ---- stewardship: giving envelopes + the daily verse ---- */

  const faithOn = state.faith ? state.faith.enabled !== false : true;
  const givingGroup = byGroup["Giving"] || { planned: 0, spent: 0 };
  const giving = {
    planned: givingGroup.planned,
    given: givingGroup.spent,
    plannedPct: income > 0 ? (givingGroup.planned / income) * 100 : 0,
    givenPct: income > 0 ? (givingGroup.spent / income) * 100 : 0,
  };

  const overEnvs = plan.envelopes.filter((e) => e.planned > 0 && (spentBy[e.id] || 0) > e.planned);
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
      ? `${overEnvs[0].name} is ${money((spentBy[overEnvs[0].id] || 0) - overEnvs[0].planned)} past plan — the plan was enough when you wrote it together.`
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
  if (!notes.length) notes.push(["a", "Nothing needs your attention. Log spending as it happens."]);

  let thesis;
  if (income === 0) thesis = ["Start with what you each bring home.", "The plan, the goals, and the read on your month all build from that one number."];
  else if (unallocated > 1) thesis = [`${money(unallocated)} still has no job.`, "Give it one — an envelope, a goal, or a payment against what you owe."];
  else if (unallocated < -1) thesis = [`You've planned ${money(-unallocated)} more than you earn.`, "Something has to come down before the month starts spending itself."];
  else {
    const over = plan.envelopes.filter((e) => e.planned > 0 && (spentBy[e.id] || 0) > e.planned);
    if (over.length) thesis = [`${over[0].name} is over by ${money((spentBy[over[0].id] || 0) - over[0].planned)}.`, "Everything else is holding — move money from a lighter envelope to cover it."];
    else thesis = ["Every dollar has a job this month.", `${money(leftToSpend)} left to spend, ${money(goalMonthly)} heading toward what's next.`];
  }

  return {
    pA, pB, income, spentBy, spentByWho, planned, spent, goalMonthly, allocated, unallocated,
    leftToSpend, savingsRate, assets, debts, assetTotal, debtTotal, netWorth, debtMin, byGroup,
    goalStatus, history, bills, billsTotal, billsLeft, payoff, notes, thesis, shareA, jointCost,
    faithOn, giving, verse, verseLine,
    ownerColor: (o) => (o === "a" ? C.a : o === "b" ? C.b : C.joint),
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

const Kpi = ({ label, value, foot, tone }) => (
  <div className="card kpi">
    <div className="lab">{label}</div>
    <div className={"val " + (tone || "")}>{value}</div>
    {foot && <div className="foot">{foot}</div>}
  </div>
);

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

/*  The concierge: one sentence — typed or spoken — becomes a logged
    transaction. Tries the AI route first; a local parser catches it
    if the route is down, so logging never depends on the network.    */
function Concierge({ ctx }) {
  const { m, plan, writeMonth } = ctx;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

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
    const lower = raw.toLowerCase();
    let env = plan.envelopes.find((e) =>
      e.name.toLowerCase().split(/[^a-z]+/).some((w) => w.length > 2 && lower.includes(w)));
    if (!env) env = plan.envelopes.find((e) => e.name === "Everything else") || plan.envelopes[0];
    let who = "joint";
    if (m.pA.name && lower.includes(m.pA.name.toLowerCase())) who = "a";
    else if (m.pB.name && lower.includes(m.pB.name.toLowerCase())) who = "b";
    const note = raw.replace(/[$]?-?\d+([.,]\d+)?/, "").replace(/\s+/g, " ").trim();
    return { amount: amt ? Math.abs(parseFloat(amt[0])) : 0, envelope: env ? env.name : "", who, note };
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
            `You turn one sentence about household spending into JSON. ` +
            `Envelopes: ${plan.envelopes.map((e) => e.name).join("; ")}. ` +
            `People: "a" is ${m.pA.name}, "b" is ${m.pB.name}, "joint" means both or unspecified. ` +
            `Reply with ONLY a JSON object: {"amount": number, "envelope": "<exact envelope name>", "who": "a"|"b"|"joint", "note": "<the merchant or what it was, a few words>"}. ` +
            `Pick the closest envelope. No other text.`,
          messages: [{ role: "user", content: raw }],
        }),
      });
      const data = await res.json();
      const t = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
      const jm = t.match(/\{[\s\S]*\}/);
      if (jm) parsed = JSON.parse(jm[0]);
    } catch (e) { /* offline or proxy down — the local parser takes it */ }
    if (!parsed || !num(parsed.amount)) parsed = localParse(raw);
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
    setLast({ msg: `Logged ${money(amount, true)} to ${env.name}${entry.note ? ` — ${entry.note}` : ""}, ${m.ownerName(entry.who)}.`, entryId: entry.id });
    setText(""); setBusy(false);
  };

  return (
    <div className="card concierge">
      <div className="gem">◆</div>
      <h3>Tell it what you spent</h3>
      <p className="why">“$42 groceries at the farmers market” · “coffee 6.50, {m.pA.name}”</p>
      <div className="askrow">
        {SR && (
          <button className={"btn tiny" + (listening ? "" : " ghost")} onClick={hear}
            aria-label={listening ? "Stop listening" : "Speak instead of typing"}>
            {listening ? "Listening…" : "Speak"}
          </button>
        )}
        <input className="field" placeholder="Say it or type it — amount, what, who" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && log()}
          aria-label="Log spending in one sentence" />
        <button className="btn" onClick={log} disabled={busy || !text.trim()}>{busy ? "…" : "Log it"}</button>
      </div>
      {last && last.msg && (
        <p className="confirm">
          {last.msg}
          <button className="btn ghost tiny" style={{ marginLeft: 10 }}
            onClick={() => { writeMonth((mm) => { mm.entries = mm.entries.filter((t) => t.id !== last.entryId); return mm; }); setLast(null); }}>
            Undo
          </button>
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
  const { m, plan, month, setMonth, state, setView } = ctx;
  const catData = plan.envelopes
    .map((e) => ({ name: e.name, spent: m.spentBy[e.id] || 0, planned: e.planned }))
    .filter((d) => d.spent > 0 || d.planned > 0)
    .sort((a, b) => b.spent - a.spent).slice(0, 7);

  return (
    <>
      <div className="hero">
        <div className="gem">◆</div>
        <h2 className="thesis">{m.thesis[0]} <span>{m.thesis[1]}</span></h2>
      </div>

      <Concierge ctx={ctx} />

      <Head
        title="Dashboard"
        sub={`${monthLabel(month)} · ${plan.entries.length} transactions logged`}
        right={<MonthNav month={month} setMonth={setMonth} />}
      />

      {m.faithOn && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="chead">
            <h3>Daily bread</h3>
            <span className="meta">new each morning · World English Bible</span>
          </div>
          <p className="verse serif">“{m.verse.text}”</p>
          <div className="verseref">{m.verse.ref}</div>
          <p className="verseline">{m.verseLine}</p>
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Net worth" value={money(m.netWorth)} foot={`${money(m.assetTotal)} assets · ${money(m.debtTotal)} owed`} tone={m.netWorth < 0 ? "down" : ""} />
        <Kpi label="Left to spend" value={money(m.leftToSpend)} foot={`of ${money(m.planned)} planned`} tone={m.leftToSpend < 0 ? "down" : "up"} />
        <Kpi label="Unassigned" value={money(m.unallocated)} tone={m.unallocated < -1 ? "down" : m.unallocated > 1 ? "mid" : "up"}
          foot={m.unallocated > 1 ? "give it a job" : m.unallocated < -1 ? "over-planned" : "fully allocated"} />
        <Kpi label="Savings rate" value={Math.round(m.savingsRate) + "%"} foot={`${money(m.goalMonthly)} toward goals`} tone={m.savingsRate >= 15 ? "up" : "mid"} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead">
          <h3>Every dollar, given a job</h3>
          <span className="meta num">{money(m.income)} in · {money(m.allocated)} assigned</span>
        </div>
        <Rail m={m} plan={plan} />
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

      <div className="grid g23" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="chead"><h3>Where the month went</h3><span className="meta num">{money(m.spent)} spent</span></div>
          {catData.length === 0 ? <p className="empty">Nothing logged yet this month.</p> : (
            <div style={{ height: 26 * catData.length + 24 }}>
              <ResponsiveContainer>
                <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }} barCategoryGap={6}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={112} {...axis} />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(34,29,23,.05)" }} />
                  <Bar dataKey="planned" name="Planned" fill="rgba(34,29,23,.12)" radius={3} />
                  <Bar dataKey="spent" name="Spent" fill={C.a} radius={3} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="card">
          <div className="chead"><h3>Coming due</h3><span className="meta num">{money(m.billsLeft)} left</span></div>
          {m.bills.length === 0 ? (
            <p className="empty">No recurring bills yet. <button className="btn ghost tiny" onClick={() => setView("bills")}>Add some</button></p>
          ) : m.bills.slice(0, 6).map((b) => (
            <div className="note" key={b.id} style={{ justifyContent: "space-between" }}>
              <span style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <span className="tick" style={{ background: b.paid ? C.a : b.overdue ? C.warn : C.joint, minHeight: 15 }} />
                <span>{b.name}<span className="muted"> · {ordinal(b.day)}</span></span>
              </span>
              <span className={"num " + (b.paid ? "muted" : "")}>{money(b.amount)}</span>
            </div>
          ))}
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
                    <b style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 15 }}>{g.name}</b>
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
          <div className="chead"><h3>Recent spending</h3><button className="btn ghost tiny" onClick={() => setView("txn")}>See all</button></div>
          {plan.entries.length === 0 ? <p className="empty">Nothing logged yet this month.</p> :
            plan.entries.slice(0, 7).map((t) => {
              const env = plan.envelopes.find((e) => e.id === t.envId);
              return (
                <div className="note" key={t.id} style={{ justifyContent: "space-between" }}>
                  <span style={{ display: "flex", gap: 9, alignItems: "center", minWidth: 0 }}>
                    <i className="dot" style={{ background: m.ownerColor(t.who) }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.note || (env ? env.name : "Spending")}
                    </span>
                  </span>
                  <span className="num">{money(t.amount)}</span>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  2. budget                                                          */
/* ================================================================== */

function Budget({ ctx }) {
  const { m, plan, writeMonth, month, setMonth, state } = ctx;
  const set = (i, field, val) => writeMonth((mm) => { mm.envelopes[i][field] = val; return mm; });

  return (
    <>
      <Head title="Budget" sub="Plan the month before it happens. Tap any number to change it."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Income" value={money(m.income)} />
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
                      <button className="kill" onClick={() => writeMonth((mm) => { mm.envelopes.splice(i, 1); return mm; })} aria-label={`Remove ${e.name}`}>×</button>
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
          <button className="btn ghost tiny" onClick={() => writeMonth((mm) => {
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

      <Logger envelopes={plan.envelopes} m={m}
        onAdd={(e) => writeMonth((mm) => { mm.entries.unshift(e); return mm; })} />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Spent this month" value={money(m.spent)} foot={`${plan.entries.length} transactions`} />
        <Kpi label={m.pA.name} value={money(m.spentByWho.a || 0)} />
        <Kpi label={m.pB.name} value={money(m.spentByWho.b || 0)} />
        <Kpi label="Shared" value={money(m.spentByWho.joint || 0)} />
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
          rows.map((t) => {
            const e = plan.envelopes.find((x) => x.id === t.envId);
            const idx = plan.entries.indexOf(t);
            return (
              <div className="row wide" key={t.id}>
                <div className="rowname">
                  <i className="dot" style={{ background: m.ownerColor(t.who) }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "Spending"}</span>
                  <span className="tag">{e ? e.name : "unfiled"}</span>
                </div>
                <div className="amt muted hideS" style={{ textAlign: "left" }}>{m.ownerName(t.who)}</div>
                <div className="amt muted hideS">{t.date}</div>
                <div className="amt num">
                  {money(t.amount, true)}
                  <button className="kill" onClick={() => writeMonth((mm) => { mm.entries.splice(idx, 1); return mm; })} aria-label="Remove">×</button>
                </div>
              </div>
            );
          })}
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

function BillsView({ ctx }) {
  const { m, state, patch, plan, writeMonth, month, setMonth } = ctx;
  const set = (i, f, v) => patch((s) => { s.bills[i][f] = v; return s; });

  const togglePaid = (b) => writeMonth((mm) => {
    mm.paid = mm.paid || [];
    if (mm.paid.includes(b.id)) mm.paid = mm.paid.filter((x) => x !== b.id);
    else {
      mm.paid.push(b.id);
      if (b.envId && mm.envelopes.some((e) => e.id === b.envId))
        mm.entries.unshift({
          id: uid(), envId: b.envId, amount: b.amount, who: b.owner, note: b.name + " (bill)",
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        });
    }
    return mm;
  });

  return (
    <>
      <Head title="Bills" sub="The fixed stuff. Mark one paid and it logs itself into the right envelope."
        right={<MonthNav month={month} setMonth={setMonth} />} />

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Kpi label="Monthly bills" value={money(m.billsTotal)} foot={`${state.bills.length} recurring`} />
        <Kpi label="Still unpaid" value={money(m.billsLeft)} tone={m.billsLeft > 0 ? "mid" : "up"} />
        <Kpi label="Share of income" value={m.income ? Math.round((m.billsTotal / m.income) * 100) + "%" : "—"} />
      </div>

      <div className="card">
        {state.bills.length === 0 && <p className="empty">Add the bills that repeat every month — rent, insurance, the streaming stack you forgot about.</p>}
        {m.bills.map((b) => {
          const i = state.bills.findIndex((x) => x.id === b.id);
          return (
            <div className="row wide" key={b.id}>
              <div className="rowname">
                <span style={{ width: 4, height: 16, borderRadius: 3, flex: "none", background: b.paid ? C.a : b.overdue ? C.warn : C.joint }} />
                <input value={b.name} onChange={(e) => set(i, "name", e.target.value)} aria-label="Bill name" />
                <select className="tag hideS" value={b.envId || ""} onChange={(e) => set(i, "envId", e.target.value)} aria-label="Envelope">
                  <option value="">no envelope</option>
                  {plan.envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <button className="tag" onClick={() => {
                  const order = ["joint", "a", "b"];
                  set(i, "owner", order[(order.indexOf(b.owner) + 1) % 3]);
                }}>{m.ownerName(b.owner)}</button>
                <button className="kill" onClick={() => patch((s) => { s.bills.splice(i, 1); return s; })} aria-label="Remove">×</button>
              </div>
              <div className="amt hideS" style={{ textAlign: "left" }}>
                <span className="muted">due </span>
                <input className="num" style={{ width: 36, textAlign: "left" }} value={b.day}
                  onChange={(e) => set(i, "day", Math.min(31, Math.max(1, num(e.target.value) || 1)))} aria-label="Due day" />
              </div>
              <div className="amt"><input className="num" value={b.amount || ""} placeholder="0" onChange={(e) => set(i, "amount", num(e.target.value))} aria-label="Amount" /></div>
              <div className="amt">
                <button className={"btn tiny " + (b.paid ? "" : "ghost")} onClick={() => togglePaid(b)}>
                  {b.paid ? "Paid" : "Mark paid"}
                </button>
              </div>
            </div>
          );
        })}
        <button className="btn ghost tiny" style={{ marginTop: 14 }} onClick={() => patch((s) => {
          s.bills.push({ id: uid(), name: "New bill", amount: 0, day: 1, envId: "", owner: "joint" });
          return s;
        })}>Add a bill</button>
      </div>
    </>
  );
}

/* ================================================================== */
/*  4b. files — the household's paper drawer                           */
/* ================================================================== */

const FOLDERS = ["Receipts", "Statements", "Insurance", "Taxes", "Home", "Other"];

function FilesView({ ctx }) {
  const { state, patch } = ctx;
  const docs = state.docs || [];
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [open, setOpen] = useState(null);
  const [paste, setPaste] = useState("");
  const [dragOver, setDragOver] = useState(false);
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

  const onFiles = (list) => {
    Array.from(list || []).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => addDoc(f.name, reader.result);
      reader.readAsText(f);
    });
    if (fileRef.current) fileRef.current.value = "";
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
      <Head title="Files" sub="The paper you'd otherwise lose — receipts, statements, renewal letters. Search finds it later." />

      <div
        className={"dropzone" + (dragOver ? " over" : "")}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
      >
        Drop text files here, or{" "}
        <button className="btn ghost tiny" onClick={() => fileRef.current && fileRef.current.click()}>choose files</button>
        <input ref={fileRef} type="file" multiple accept=".txt,.md,.csv,.log,text/*" style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)} aria-label="Upload files" />
        <div style={{ marginTop: 6, fontSize: 11 }}>Text only for now, stored in this browser with everything else.</div>
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
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16 }} />
            <span style={{ display: "flex", gap: 6, alignItems: "center", flex: "none" }}>
              <select className="tag" value={d.folder || "Other"} onChange={(e) => set(d.id, "folder", e.target.value)} aria-label="File under">
                {FOLDERS.map((f) => <option key={f}>{f}</option>)}
              </select>
              <span className="muted" style={{ fontSize: 11 }}>{d.added}</span>
              <button className="btn ghost tiny" onClick={() => setOpen(open === d.id ? null : d.id)}>
                {open === d.id ? "Close" : "Open"}
              </button>
              <button className="kill" onClick={() => patch((s) => { s.docs = (s.docs || []).filter((x) => x.id !== d.id); return s; })}
                aria-label={`Remove ${d.name}`}>×</button>
            </span>
          </div>
          {open === d.id
            ? <pre>{d.text}</pre>
            : <p className="snip">{snippet(d)}{d.text.length > 150 ? "…" : ""}</p>}
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
              <input className="field" style={{ border: "none", background: "none", fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 19, padding: 0 }}
                value={g.name} onChange={(e) => set("name", e.target.value)} aria-label="Goal name" />
              <button className="kill" onClick={() => patch((s) => { s.goals.splice(i, 1); return s; })} aria-label="Remove">×</button>
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
          <div className="chead"><h3>Who spent it</h3><span className="meta">this month</span></div>
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
          <span className="meta">{state.household.splitRule === "even" ? "split down the middle" : "split by income"}</span>
        </div>
        <div className="grid g3">
          <Kpi label={`${m.pA.name}'s share of shared costs`} value={money(m.jointCost * m.shareA)} foot={`${Math.round(m.shareA * 100)}% of ${money(m.jointCost)}`} />
          <Kpi label={`${m.pB.name}'s share`} value={money(m.jointCost * (1 - m.shareA))} foot={`${Math.round((1 - m.shareA) * 100)}% of ${money(m.jointCost)}`} />
          <Kpi label="Outside the shared pot" value={money(personal)} foot="personal envelopes, spending money, and anything unassigned" />
        </div>
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
  const logRef = useRef(null);
  const chat = state.chat || [];

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [chat, busy]);

  const snapshot = {
    month: monthLabel(month),
    partners: [m.pA, m.pB].map((p) => ({ name: p.name, monthlyTakeHome: p.income })),
    splitRule: state.household.splitRule,
    monthlyIncome: m.income,
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
    savingsRatePct: Math.round(m.savingsRate),
    lastSixMonths: m.history.map((h) => ({ month: h.label, spent: h.spent })),
    ...(m.faithOn && {
      stewardship: {
        todaysVerse: `${m.verse.ref} — ${m.verse.text}`,
        givingSetAsideThisMonth: m.giving.planned,
        givenSoFarThisMonth: m.giving.given,
        givingShareOfIncomePct: Math.round(m.giving.plannedPct),
      },
    }),
  };

  const ask = async (text) => {
    const question = (text === undefined ? q : text).trim();
    if (!question || busy) return;
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
    } catch (e) {
      setErr("Couldn't reach your planner just now. Try again in a moment.");
    }
    setBusy(false);
  };

  const chips = [
    "Where should the extra go this month?",
    ...(m.faithOn ? ["Are we giving the way we mean to?"] : []),
    "Are our goals realistic on this income?",
    "What should we cut first?",
    "How should we split shared costs fairly?",
    "Pay down debt or save faster?",
    "How big should our emergency fund be?",
  ];

  return (
    <>
      <Head title="Planner" sub="It can see your income, envelopes, bills, goals, and accounts." />
      <div className="grid g23">
        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 470 }}>
          <div className="chatlog" ref={logRef} style={{ flex: 1, maxHeight: 460 }}>
            {chat.length === 0 && <p className="empty">Ask anything about your money. It answers with your numbers, not general advice.</p>}
            {chat.map((x, i) => <div key={i} className={"msg " + (x.role === "user" ? "me" : "them")}>{x.content}</div>)}
            {busy && <div className="msg them muted">Reading your numbers…</div>}
          </div>
          {err && <p className="empty" style={{ color: C.warn }}>{err}</p>}
          <div className="chips">{chips.map((c) => <button key={c} className="chip" onClick={() => ask(c)} disabled={busy}>{c}</button>)}</div>
          <div className="askrow">
            <input className="field" placeholder="Ask a question" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()} aria-label="Ask your planner" />
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
            {[["Income", m.income], ["Planned out", m.planned], ["Bills", m.billsTotal], ["Goals", m.goalMonthly], ["Net worth", m.netWorth]].map(([k, v]) => (
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

  const exportJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      setCopied(true); setTimeout(() => setCopied(false), 2200);
    } catch (e) { setCopied(false); }
  };

  return (
    <>
      <Head title="Settings" sub="Who's in the household, what comes in, and how you split it." />
      <div className="grid g2">
        <div className="card">
          <div className="chead"><h3>Household</h3></div>
          <label className="lbl">Name</label>
          <input className="field" style={{ marginBottom: 14 }} value={state.household.name}
            onChange={(e) => patch((s) => { s.household.name = e.target.value; return s; })} />
          {[0, 1].map((i) => (
            <div className="pair" key={i}>
              <div>
                <label className="lbl">{i === 0 ? "First name" : "Second name"}</label>
                <input className="field" value={state.household.partners[i].name}
                  onChange={(e) => patch((s) => { s.household.partners[i].name = e.target.value; return s; })} />
              </div>
              <div>
                <label className="lbl">Monthly take-home</label>
                <input className="field num" value={state.household.partners[i].income || ""} placeholder="0"
                  onChange={(e) => patch((s) => { s.household.partners[i].income = num(e.target.value); return s; })} />
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
            {state.household.splitRule === "even"
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
              ? "A verse on money and stewardship, new each morning, on the dashboard — and the planner can see it, along with what you've set aside to give."
              : "The dashboard and planner leave scripture out."}
          </p>
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
            <p className="fine">Two minutes · your numbers, your plan</p>
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
