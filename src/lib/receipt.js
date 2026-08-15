/* ==================================================================
   receipt capture

   Snap a photo, shrink it in the browser, ask Claude to read it, and
   hand back a draft entry. The photo is a prefill and nothing more —
   every path here ends with the review sheet open, whether the model
   answered or not. Base64 never enters persisted state.
   ================================================================== */

export const API_URL = import.meta.env.VITE_ANTHROPIC_URL || "/api/anthropic/v1/messages";

/* Receipts are tall, narrow, and text-dense. 2000px on the long edge keeps
   faded thermal line items readable and stays inside the model's native
   image tier, so nothing gets downscaled server-side. */
const LONG_EDGE = 2000;
const QUALITY = 0.75;
const RETRY_EDGE = 1400;
const RETRY_QUALITY = 0.6;
/* Base64 inflates ~1.37x, so this lands around 3.4MB on the wire. The binding
   limit is the serverless function's 4.5MB request body, not Anthropic's 5MB
   image ceiling. A 2000px JPEG at q0.75 is normally 200–400KB, so the retry
   rung below effectively never fires — it's here for a pathological photo. */
const MAX_BYTES = 2_500_000;

async function decode(file) {
  // imageOrientation honours the EXIF flag — without it a portrait phone
  // photo lands sideways on the canvas and reads badly.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) { /* fall through to the <img> path */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(source, edge, quality) {
  const w = source.width, h = source.height;
  const scale = Math.min(1, edge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
}

function toBase64(blob) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      // The API takes raw base64 — the "data:image/jpeg;base64," prefix must go.
      res(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => rej(new Error("Could not read that photo."));
    reader.readAsDataURL(blob);
  });
}

/** Compress a camera photo down to something we can actually send. */
export async function shrink(file) {
  const source = await decode(file);
  let blob = await draw(source, LONG_EDGE, QUALITY);
  if (!blob) throw new Error("Could not read that photo.");
  if (blob.size > MAX_BYTES) blob = await draw(source, RETRY_EDGE, RETRY_QUALITY);
  if (source.close) source.close();
  return { blob, b64: await toBase64(blob), url: URL.createObjectURL(blob) };
}

/* ---- merchant memory ---------------------------------------------
   Deterministic, no model involved. "SAFEWAY #1423" and "Safeway Inc"
   both key to "safeway", so the map keeps learning across visits.
   ------------------------------------------------------------------ */

export const merchantKey = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(store|no|#)?\s*\d{2,}\b/g, " ")
    .replace(/\b(inc|llc|ltd|co|corp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ---- the vision call --------------------------------------------- */

/* Module-level so the API compiles the schema once and caches it.
   minLength/maximum aren't supported — nullable fields use anyOf. */
const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["legible", "merchant", "total", "date", "envelope", "note", "items"],
  properties: {
    legible: { type: "boolean" },
    merchant: { anyOf: [{ type: "string" }, { type: "null" }] },
    total: { anyOf: [{ type: "number" }, { type: "null" }] },
    date: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
    envelope: { anyOf: [{ type: "string" }, { type: "null" }] },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount"],
        properties: {
          name: { type: "string" },
          amount: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
      },
    },
  },
};

const SYSTEM =
  "Read this receipt. Return the merchant, the grand total actually charged " +
  "(not the subtotal, not the pre-tax figure), the purchase date, and the line items. " +
  "Set envelope to exactly one of the envelope names given, copied character-for-character, " +
  "or null if none clearly fits. note is two to four words a person would recognise later — " +
  "\"Weekly shop\", \"Coffee\", \"Oil change\". If the photo is too blurry, cropped, or dark to " +
  "read, set legible to false and return null for anything you had to guess.";

/**
 * Ask Claude to read a receipt.
 * Throws a plain-language Error on every failure — callers open the sheet regardless.
 */
export async function readReceipt(b64, envelopeNames, signal) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 4000, // caps thinking + output together on this model
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: RECEIPT_SCHEMA },
        },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
              { type: "text", text: `Envelopes: ${envelopeNames.join(", ")}` },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("offline");
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("nokey");
    if (res.status === 413) throw new Error("toobig");
    if (res.status === 429 || res.status === 529) throw new Error("busy");
    throw new Error("failed");
  }

  const data = await res.json();
  // Check stop_reason before touching content — on a refusal content can be empty.
  if (data.stop_reason === "refusal") throw new Error("unreadable");

  const text = (data.content || []).find((c) => c.type === "text");
  if (!text) throw new Error("unreadable");

  let out;
  try {
    out = JSON.parse(text.text);
  } catch (e) {
    throw new Error("unreadable");
  }
  return clean(out);
}

/* Each field is validated independently — a bad date never costs a good total. */
function clean(out) {
  const total =
    typeof out.total === "number" && isFinite(out.total) && out.total > 0 && out.total < 100000
      ? out.total
      : null;
  const date = typeof out.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(out.date)
    && !isNaN(new Date(out.date).getTime()) ? out.date : null;
  return {
    legible: out.legible !== false,
    merchant: typeof out.merchant === "string" ? out.merchant.trim() : "",
    total,
    date,
    envelope: typeof out.envelope === "string" ? out.envelope : "",
    note: typeof out.note === "string" ? out.note.trim() : "",
    items: Array.isArray(out.items)
      ? out.items
          .filter((i) => i && typeof i.name === "string")
          .map((i) => ({ name: i.name, amount: typeof i.amount === "number" ? i.amount : 0 }))
          .slice(0, 60)
      : [],
  };
}

/** Plain-language copy for each failure, in the app's voice. */
export const RECEIPT_ERRORS = {
  nokey: "No API key set — type the amount in instead.",
  offline: "Couldn't reach the reader. The photo's still here — try again.",
  busy: "The reader is busy. Try again in a moment.",
  toobig: "That photo was too large to send. Try again.",
  unreadable: "Couldn't read the total — what was it?",
  failed: "That didn't come back cleanly. Type it in instead.",
};
