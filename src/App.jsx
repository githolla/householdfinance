import { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";

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
    { name: `${A}'s spending`, group: "Other", planned: 250, owner: "a", n: 4 },
    { name: `${B}'s spending`, group: "Other", planned: 250, owner: "b", n: 4 },
    { name: "Everything else", group: "Other", planned: 240, owner: "joint", n: 3 },
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
    chat: [],
  };
}

const NAV = [
  ["dash", "Dashboard"],
  ["budget", "Budget"],
  ["txn", "Spending"],
  ["bills", "Bills"],
  ["goals", "Goals"],
  ["worth", "Net worth"],
  ["reports", "Reports"],
  ["planner", "Planner"],
  ["settings", "Settings"],
];

const C = {
  a: "#2E6F63", b: "#6B5CA5", joint: "#B9862B", warn: "#A93E2F",
  soft: "#5C6864", ink: "#16211F", line: "#D2D6CC",
};
const PIE = ["#2E6F63", "#6B5CA5", "#B9862B", "#4C8C7E", "#8C7BC0", "#A93E2F", "#3F5C57", "#C9A227"];

/* ================================================================== */
/*  styles                                                             */
/* ================================================================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Karla:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

.tc{--paper:#E6E8E1;--surface:#FBFBF8;--ink:#16211F;--soft:#5C6864;--line:#D2D6CC;
 --a:#2E6F63;--b:#6B5CA5;--joint:#B9862B;--warn:#A93E2F;--r:10px;
 background:var(--paper);color:var(--ink);font-family:'Karla',ui-sans-serif,system-ui,sans-serif;
 min-height:100%;box-sizing:border-box;-webkit-font-smoothing:antialiased;font-size:14px;}
.tc *,.tc *::before,.tc *::after{box-sizing:border-box;}
.tc .num{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;}
.tc h1,.tc h2,.tc h3,.tc .serif{font-family:'Fraunces','Iowan Old Style',Georgia,serif;font-weight:400;margin:0;}
.tc button{font-family:inherit;cursor:pointer;}
.tc :focus-visible{outline:2px solid var(--a);outline-offset:2px;border-radius:4px;}

/* shell */
.tc .shell{display:grid;grid-template-columns:206px minmax(0,1fr);min-height:100vh;}
.tc .side{border-right:1px solid var(--line);padding:22px 16px;position:sticky;top:0;height:100vh;
 display:flex;flex-direction:column;gap:22px;}
.tc .mark{line-height:1.15;}
.tc .mark .nm{font-family:'Fraunces',Georgia,serif;font-size:19px;letter-spacing:-.01em;display:block;}
.tc .mark .who{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft);}
.tc nav{display:flex;flex-direction:column;gap:1px;}
.tc nav button{text-align:left;background:none;border:none;padding:7px 9px;border-radius:7px;
 font-size:13.5px;color:var(--soft);letter-spacing:.01em;}
.tc nav button:hover{background:rgba(255,255,255,.55);color:var(--ink);}
.tc nav button.on{background:var(--ink);color:var(--paper);}
.tc .sidefoot{margin-top:auto;font-size:11.5px;color:var(--soft);line-height:1.5;}
.tc .main{padding:22px 26px 70px;min-width:0;}
@media(max-width:860px){
 .tc .shell{grid-template-columns:1fr;}
 .tc .side{position:static;height:auto;border-right:none;border-bottom:1px solid var(--line);
  flex-direction:row;align-items:center;gap:16px;padding:14px 16px;overflow-x:auto;}
 .tc nav{flex-direction:row;gap:2px;}
 .tc nav button{white-space:nowrap;padding:6px 10px;}
 .tc .sidefoot{display:none;}
 .tc .main{padding:18px 16px 60px;}
}

/* page head */
.tc .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;
 border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:22px;}
.tc .phead h1{font-size:24px;letter-spacing:-.015em;}
.tc .phead .sub{font-size:12.5px;color:var(--soft);margin-top:3px;}
.tc .monthnav{display:flex;align-items:center;gap:5px;}
.tc .monthnav .m{font-size:13px;min-width:120px;text-align:center;}
.tc .arrow{background:none;border:1px solid var(--line);border-radius:50%;width:25px;height:25px;
 color:var(--soft);font-size:13px;display:grid;place-items:center;line-height:1;}
.tc .arrow:hover{border-color:var(--a);color:var(--a);}

/* thesis */
.tc .thesis{font-family:'Fraunces',Georgia,serif;font-size:clamp(21px,2.7vw,31px);line-height:1.26;
 letter-spacing:-.015em;max-width:820px;margin:0 0 26px;}
.tc .thesis span{color:var(--soft);}

/* grid + cards */
.tc .grid{display:grid;gap:16px;}
.tc .g2{grid-template-columns:repeat(2,minmax(0,1fr));}
.tc .g3{grid-template-columns:repeat(3,minmax(0,1fr));}
.tc .g4{grid-template-columns:repeat(4,minmax(0,1fr));}
.tc .g23{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);}
@media(max-width:980px){.tc .g23,.tc .g3,.tc .g4{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:620px){.tc .grid{grid-template-columns:minmax(0,1fr)!important;}}
.tc .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px 17px;}
.tc .card h3{font-size:15.5px;}
.tc .chead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:13px;}
.tc .chead .meta{font-size:11.5px;color:var(--soft);}

/* kpi */
.tc .kpi{padding:14px 15px;}
.tc .kpi .lab{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--soft);}
.tc .kpi .val{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
 font-size:23px;letter-spacing:-.02em;margin-top:7px;line-height:1.1;word-break:break-word;}
.tc .kpi .foot{font-size:11.5px;color:var(--soft);margin-top:7px;line-height:1.4;}
.tc .up{color:var(--a);}.tc .down{color:var(--warn);}.tc .mid{color:var(--joint);}

/* rail */
.tc .rail{display:flex;height:30px;width:100%;gap:2px;}
.tc .seg{min-width:2px;border-radius:3px;}
.tc .seg.gap{background:repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(92,104,100,.2) 5px,rgba(92,104,100,.2) 6px);
 border:1px dashed var(--soft);}
.tc .railkey{display:flex;flex-wrap:wrap;gap:13px;margin-top:10px;font-size:11.5px;color:var(--soft);}
.tc .railkey span{display:flex;align-items:center;gap:6px;}
.tc .dot{width:8px;height:8px;border-radius:2px;display:inline-block;flex:none;}

/* rows */
.tc .row{display:grid;grid-template-columns:1fr 92px 92px;gap:10px;align-items:center;padding:8px 0;
 border-bottom:1px solid rgba(210,214,204,.62);}
.tc .row:last-child{border-bottom:none;}
.tc .row.wide{grid-template-columns:1fr 130px 92px 96px;}
@media(max-width:700px){.tc .row.wide{grid-template-columns:1fr 96px;}
 .tc .hideS{display:none;}}
.tc .rowname{display:flex;align-items:center;gap:8px;min-width:0;}
.tc .rowname input{border:none;background:none;font-size:14px;color:var(--ink);padding:2px 0;
 width:100%;min-width:0;font-family:inherit;}
.tc .rowname input:hover{border-bottom:1px dotted var(--line);}
.tc .amt{text-align:right;font-size:13.5px;}
.tc .amt input{width:100%;text-align:right;border:none;background:none;font-size:13.5px;color:var(--ink);
 font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;padding:3px 0;}
.tc .amt input:hover,.tc .amt input:focus{border-bottom:1px solid var(--line);outline:none;}
.tc .muted{color:var(--soft);}
.tc .over{color:var(--warn);font-weight:500;}
.tc .bar{grid-column:1/-1;height:4px;background:rgba(92,104,100,.13);border-radius:3px;overflow:hidden;}
.tc .bar i{display:block;height:100%;border-radius:3px;}
.tc .kill{background:none;border:none;color:var(--line);font-size:15px;padding:0 2px;line-height:1;}
.tc .kill:hover{color:var(--warn);}
.tc .tag{border:1px solid var(--line);background:var(--surface);border-radius:20px;font-size:10px;
 letter-spacing:.09em;text-transform:uppercase;padding:2px 8px;color:var(--soft);white-space:nowrap;
 font-family:inherit;max-width:120px;}
.tc .grouphead{font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--soft);
 padding:16px 0 4px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;}

/* controls */
.tc .field{border:1px solid var(--line);background:var(--surface);border-radius:var(--r);padding:8px 10px;
 font-size:13.5px;color:var(--ink);font-family:inherit;width:100%;}
.tc .field:focus{border-color:var(--a);outline:none;}
.tc .btn{border:1px solid var(--ink);background:var(--ink);color:var(--paper);border-radius:var(--r);
 padding:8px 14px;font-size:13px;}
.tc .btn:hover{background:#0d1614;}
.tc .btn[disabled]{opacity:.42;cursor:default;}
.tc .btn.ghost{background:none;color:var(--ink);border-color:var(--line);}
.tc .btn.ghost:hover{background:rgba(255,255,255,.6);border-color:var(--a);color:var(--a);}
.tc .btn.tiny{padding:5px 10px;font-size:12px;}
.tc .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;}
.tc .toolbar .field{width:auto;min-width:120px;}
.tc .logger{display:grid;grid-template-columns:100px 1fr 140px 1fr auto;gap:8px;background:var(--surface);
 border:1px solid var(--line);border-radius:var(--r);padding:10px;margin-bottom:16px;}
@media(max-width:760px){.tc .logger{grid-template-columns:1fr 1fr;}.tc .logger .wide{grid-column:1/-1;}}

/* goals */
.tc .track{height:7px;background:rgba(92,104,100,.14);border-radius:4px;margin:11px 0 9px;overflow:hidden;}
.tc .track i{display:block;height:100%;background:var(--joint);border-radius:4px;transition:width .4s ease;}
.tc .flag{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:20px;
 border:1px solid currentColor;white-space:nowrap;}
.tc .flag.ok{color:var(--a);}.tc .flag.late{color:var(--warn);}
.tc .metaline{display:flex;flex-wrap:wrap;gap:13px;font-size:12.5px;color:var(--soft);align-items:center;}
.tc .metaline b{color:var(--ink);font-weight:500;}
.tc .fourup{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px;padding-top:12px;
 border-top:1px solid var(--line);}
@media(max-width:640px){.tc .fourup{grid-template-columns:repeat(2,1fr);}}
.tc .lbl{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);margin-bottom:4px;}

/* notes + chat */
.tc .note{display:flex;gap:9px;font-size:13px;line-height:1.45;padding:8px 0;
 border-bottom:1px solid rgba(210,214,204,.7);}
.tc .note:last-child{border-bottom:none;}
.tc .tick{width:4px;flex:none;border-radius:3px;margin:3px 0;}
.tc .chatlog{display:flex;flex-direction:column;gap:12px;overflow-y:auto;margin-bottom:12px;}
.tc .msg{font-size:13.5px;line-height:1.55;white-space:pre-wrap;}
.tc .msg.me{align-self:flex-end;background:var(--ink);color:var(--paper);padding:8px 12px;
 border-radius:12px 12px 3px 12px;max-width:86%;}
.tc .msg.them{border-left:2px solid var(--joint);padding-left:12px;}
.tc .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px;}
.tc .chip{border:1px solid var(--line);background:none;border-radius:20px;padding:5px 11px;font-size:12px;color:var(--soft);}
.tc .chip:hover{border-color:var(--a);color:var(--a);}
.tc .chip.on{background:var(--ink);color:var(--paper);border-color:var(--ink);}
.tc .askrow{display:flex;gap:7px;}
.tc .empty{font-size:13px;color:var(--soft);line-height:1.55;padding:8px 0;margin:0;}

/* tooltip */
.tc .tip{background:var(--ink);color:var(--paper);border-radius:7px;padding:7px 10px;font-size:12px;line-height:1.5;}
.tc .tip .k{opacity:.65;}

/* setup */
.tc .setup{max-width:560px;margin:0 auto;padding:6vh 18px 40px;}
.tc .setup h1{font-size:clamp(30px,5vw,44px);line-height:1.1;margin-bottom:12px;letter-spacing:-.02em;}
.tc .setup .sub{color:var(--soft);font-size:15px;line-height:1.55;margin-bottom:26px;}
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
        <aside className="side">
          <div className="mark">
            <span className="nm">{state.household.name}</span>
            <span className="who">{m.pA.name} &amp; {m.pB.name}</span>
          </div>
          <nav>
            {NAV.map(([k, label]) => (
              <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{label}</button>
            ))}
          </nav>
          <div className="sidefoot">
            {state.demo && (
              <div style={{ marginBottom: 12 }}>
                <span className="tag" style={{ borderColor: C.joint, color: C.joint }}>Sample data</span>
                <button className="btn ghost tiny" style={{ marginTop: 8, display: "block" }}
                  onClick={async () => {
                    try { await window.storage.delete(KEY); } catch (e) { /* nothing stored */ }
                    setState(null);
                  }}>Start clean</button>
              </div>
            )}
            <div className="num" style={{ fontSize: 15, color: C.ink }}>{money(m.netWorth)}</div>
            net worth today
          </div>
        </aside>
        <main className="main">
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
  if (!notes.length) notes.push(["a", "Nothing needs your attention. Log spending as it happens."]);

  const shareA = income > 0 ? (state.household.splitRule === "even" ? 0.5 : pA.income / income) : 0.5;
  const jointCost = plan.envelopes.filter((e) => e.owner === "joint").reduce((n, e) => n + e.planned, 0) + goalMonthly;

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
      <Head
        title="Dashboard"
        sub={`${monthLabel(month)} · ${plan.entries.length} transactions logged`}
        right={<MonthNav month={month} setMonth={setMonth} />}
      />
      <p className="thesis">{m.thesis[0]} <span>{m.thesis[1]}</span></p>

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
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(92,104,100,.07)" }} />
                  <Bar dataKey="planned" name="Planned" fill="rgba(92,104,100,.16)" radius={3} />
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
                    <b style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 15 }}>{g.name}</b>
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
              <input className="field" style={{ border: "none", background: "none", fontFamily: "Fraunces, Georgia, serif", fontSize: 19, padding: 0 }}
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
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(92,104,100,.07)" }} />
                  <Bar dataKey="Planned" fill="rgba(92,104,100,.2)" radius={3} />
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
                <Tooltip content={<Tip />} cursor={{ fill: "rgba(92,104,100,.07)" }} />
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
            `You are not a licensed advisor: for tax, legal, insurance, or investment-product decisions, say so in one line and point them to a professional.\n\n` +
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
      chat: [],
    });
  };

  return (
    <Frame>
      <div className="setup">
        <h1>Two people,<br />one month at a time.</h1>
        <p className="sub">
          Tell it who's in the household and what you each bring home. The budget, the bills, the goals, the net worth,
          and the read on how you're doing all build from there.
        </p>
        <div style={{ marginBottom: 13 }}>
          <label className="lbl">Household name (optional)</label>
          <input className="field" placeholder="The Kitchen Table Fund" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
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
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={start} disabled={!ready}>Open the ledger</button>
          <button className="btn ghost" onClick={() => onDone(demoState())}>Click through a sample household</button>
        </div>
        <p className="empty" style={{ marginTop: 14 }}>
          The sample is a two-income household with six months of history, bills, goals, and debt already in it —
          every screen is live, and you can wipe it and start clean whenever you want.
        </p>
      </div>
    </Frame>
  );
}
