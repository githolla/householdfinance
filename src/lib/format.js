/* ==================================================================
   formatting, month math, and the shared palette

   Every number in the app is stored as a plain number and formatted
   here at the edge. Never format for storage.
   ================================================================== */

export const money = (n, cents) => {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return (v < 0 ? "-$" : "$") + s;
};

export const compact = (n) => {
  const v = Math.abs(n);
  if (v >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (v >= 1000) return Math.round(n / 1000) + "k";
  return String(Math.round(n));
};

export const pct = (n, digits) => `${(Number(n) || 0).toFixed(digits || 0)}%`;

export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const monthLabel = (k, short) => {
  if (!k) return "";
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: short ? "short" : "long",
    year: short ? "2-digit" : "numeric",
  });
};

export const shiftMonth = (k, d) => {
  const [y, m] = k.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + d, 1));
};

export const monthsBetween = (a, b) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};

export const daysInMonth = (k) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

export const yearOf = (k) => Number(String(k).split("-")[0]);
export const monthOf = (k) => Number(String(k).split("-")[1]);

export const uid = () => Math.random().toString(36).slice(2, 9);

/** Strips currency formatting and never returns NaN. All user input goes through this. */
export const num = (v) => {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
};

export const todayDay = () => new Date().getDate();

export const ordinal = (d) => {
  const s = ["th", "st", "nd", "rd"], v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * Normalise a pasted bill-pay link, or return "" if it isn't one we'll open.
 * Only http(s) — a `javascript:` or `data:` URL in a link we render is a way
 * to run someone else's code on a tap.
 */
export const safeUrl = (v) => {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch (e) {
    return "";
  }
};

/** "chase.com" out of "https://secure.chase.com/pay?x=1" — for the button label. */
export const hostOf = (v) => {
  const u = safeUrl(v);
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
};

export const GROUPS = ["Home", "Daily", "Lifestyle", "Health", "Giving", "Other"];

/* Bright modern set on a cool near-white page: clear blue = partner A and
   the brand, emerald = partner B, amber = shared/goals, red = the only
   alarm colour, forest = confirmed-good (darker than partner B's emerald).
   Every coloured mark still sits beside a word — colour never carries
   state alone — so the greens (partner B vs confirmed-good) are always
   disambiguated by their labels. */
export const C = {
  a: "#2A78D6", b: "#1BAF7A", joint: "#EDA100", warn: "#E34948", ok: "#15803D",
  soft: "#64748B", ink: "#16202B", line: "#E5E8EC",
  brand: "#2A78D6", brandSoft: "#E3EEFB",
};

export const PIE = ["#2A78D6", "#1BAF7A", "#EDA100", "#8A5CE0", "#E87BA4", "#12A5BC", "#85B7EB", "#F5C4B3"];
