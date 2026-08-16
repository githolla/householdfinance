/* ==================================================================
   voice notes — say it, and the sheet fills itself in

   Uses the browser's own speech recognition (free, on-device or
   browser-provided; no audio ever reaches our server). The transcript
   is parsed deterministically — "twenty-three at Trader Joe's for
   groceries" style utterances — and, like a receipt photo, it is a
   PREFILL and nothing more: every path ends with the review sheet
   open and the person confirming.
   ================================================================== */

const Rec = typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export const voiceSupported = () => !!Rec;

/**
 * Listen for one utterance. Resolves {transcript} or rejects with a
 * plain-language message. The recognizer stops itself on silence.
 */
export function listenOnce() {
  return new Promise((resolve, reject) => {
    if (!Rec) { reject(new Error("Voice isn't available in this browser.")); return; }
    const r = new Rec();
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    let settled = false;
    r.onresult = (e) => {
      settled = true;
      const t = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : "";
      resolve({ transcript: String(t || "").trim() });
    };
    r.onerror = (e) => {
      if (settled) return;
      settled = true;
      reject(new Error(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone blocked — allow it in your browser settings."
          : e.error === "no-speech"
            ? "Didn't catch that — try again, a little closer."
            : "Couldn't hear that — type it in instead."
      ));
    };
    r.onend = () => {
      if (!settled) { settled = true; reject(new Error("Didn't catch that — try again.")); }
    };
    try { r.start(); } catch (err) {
      if (!settled) { settled = true; reject(new Error("Couldn't start the microphone.")); }
    }
  });
}

const cap = (s) => s.replace(/(^|\s)([a-z])/g, (m2, a, b) => a + b.toUpperCase());

/* Number words for the amounts people actually say out loud. Speech
   recognition usually returns digits ("$23.50"), so this is the
   fallback, not the main path. */
const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
function wordsToNumber(t) {
  const tokens = t.split(/[\s-]+/).map((w) => WORDS[w]).filter((n) => n !== undefined);
  if (!tokens.length) return null;
  // "fourteen fifty" is how people say $14.50 out loud
  if (tokens.length === 2 && tokens[0] < 100 && tokens[1] < 100 && tokens[1] % 10 === 0 && tokens[0] % 10 !== 0)
    return tokens[0] + tokens[1] / 100;
  let cur = 0;
  for (const n of tokens) {
    if (n === 100) cur = (cur || 1) * 100;
    else cur += n;
  }
  return cur > 0 ? cur : null;
}

/**
 * Turn an utterance into a draft's raw pieces. Deterministic — no
 * model call, works offline, instant.
 */
export function parseSpokenExpense(transcript, envelopeNames = []) {
  // strip punctuation but keep the decimal point in "$23.50"
  const t = " " + String(transcript || "").toLowerCase()
    .replace(/[,!?]/g, " ").replace(/\.(?!\d)/g, " ").replace(/\s+/g, " ").trim() + " ";

  // amount: digits first ("$23", "23.50", "23 dollars"), number words second
  let amount = "";
  const digits = t.match(/\$?\s?(\d+(?:\.\d{1,2})?)/);
  if (digits) amount = digits[1];
  else {
    const w = wordsToNumber(t);
    if (w !== null) amount = String(w);
  }

  // envelope: longest envelope name spoken wins
  let envelope = "";
  for (const name of [...envelopeNames].sort((a, b) => b.length - a.length)) {
    if (name && t.includes(" " + name.toLowerCase() + " ")) { envelope = name; break; }
  }

  // "at <merchant>" and "for <what>"
  const atM = t.match(/ at ([a-z0-9'&. -]+?)(?= for | on | in | \$| \d|$)/);
  const forM = t.match(/ for ([a-z0-9'&. -]+?)(?= at | on | in | \$| \d|$)/);
  const merchant = atM ? cap(atM[1].trim()) : "";
  const note = merchant || (forM ? cap(forM[1].trim()) : "");

  return { amount, merchant, envelope, note, transcript: transcript.trim() };
}
