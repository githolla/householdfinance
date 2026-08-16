/* ==================================================================
   bill reading — upload a stack of bills, get prefilled rows back

   Same contract as receipts: the photo is a prefill and nothing more.
   Every failure path ends with an editable row the person finishes by
   hand. Base64 never enters persisted state. Files are read one at a
   time — a stack of six bills is six sequential calls, not a burst.
   ================================================================== */

import { API_URL, shrink } from "./receipt.js";

const BILL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["legible", "biller", "amount", "dueDay", "website"],
  properties: {
    legible: { type: "boolean" },
    biller: { anyOf: [{ type: "string" }, { type: "null" }] },
    amount: { anyOf: [{ type: "number" }, { type: "null" }] },
    dueDay: { anyOf: [{ type: "integer" }, { type: "null" }] },
    website: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
};

const SYSTEM =
  "Read this bill, statement, or payment screenshot. Return the biller's short everyday name " +
  "(\"Electric\", \"Xfinity\", \"State Farm\" — not the legal entity), the amount due this cycle " +
  "(the current amount due, not the total balance and not past-due arrears unless that's all there is), " +
  "dueDay as the day-of-month it's due (1–31), and the payment website domain if one is printed " +
  "(just the domain, like \"xfinity.com\"). If the image is too blurry, cropped, or isn't a bill, " +
  "set legible to false and return null for anything you'd be guessing.";

/** Read one bill image. Throws the same plain error keys as readReceipt. */
export async function readBill(b64, signal) {
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
          format: { type: "json_schema", schema: BILL_SCHEMA },
        },
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text", text: "Read this bill." },
          ],
        }],
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
  if (data.stop_reason === "refusal") throw new Error("unreadable");
  const text = (data.content || []).find((c) => c.type === "text");
  if (!text) throw new Error("unreadable");
  let out;
  try { out = JSON.parse(text.text); } catch (e) { throw new Error("unreadable"); }

  const amount = typeof out.amount === "number" && isFinite(out.amount) && out.amount > 0 && out.amount < 100000
    ? Math.round(out.amount * 100) / 100 : 0;
  const day = Number.isInteger(out.dueDay) && out.dueDay >= 1 && out.dueDay <= 31 ? out.dueDay : 1;
  let payUrl = "";
  if (typeof out.website === "string" && out.website.trim()) {
    const w = out.website.trim().replace(/^https?:\/\//, "");
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(w)) payUrl = "https://" + w;
  }
  return {
    legible: out.legible !== false,
    name: typeof out.biller === "string" ? out.biller.trim() : "",
    amount, day, payUrl,
  };
}

/**
 * Read a whole stack, one at a time, reporting progress.
 * onOne(result) fires per file with either the parsed bill or an
 * empty editable shell — never nothing.
 */
export async function readBillStack(files, onProgress, onOne, signal) {
  let i = 0;
  for (const file of files) {
    i++;
    onProgress(i, files.length);
    try {
      const { b64 } = await shrink(file);
      const bill = await readBill(b64, signal);
      onOne({ ...bill, error: bill.legible && bill.name ? "" : "couldn't read it all — finish this one by hand" });
    } catch (e) {
      if (e.name === "AbortError") return;
      onOne({ legible: false, name: "", amount: 0, day: 1, payUrl: "", error: "couldn't read this one — fill it in" });
    }
  }
}
