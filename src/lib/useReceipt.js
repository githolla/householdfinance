/* ==================================================================
   the capture → read → review flow, in one hook

   Owned by the App shell so the quick-add button and the desktop logger
   drive the same sheet. The base64 lives in a ref: it re-renders nothing
   and never reaches persisted state.
   ================================================================== */

import { useState, useRef, useCallback, useEffect } from "react";
import { shrink, readReceipt, RECEIPT_ERRORS } from "./receipt.js";
import { draftFromReceipt } from "./draft.js";

export function useReceipt(m, envelopeNames) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const b64 = useRef("");
  const thumb = useRef("");
  const abort = useRef(null);

  const revoke = () => {
    if (thumb.current) URL.revokeObjectURL(thumb.current);
    thumb.current = "";
  };

  const close = useCallback(() => {
    if (abort.current) abort.current.abort();
    abort.current = null;
    revoke();
    b64.current = "";
    setOpen(false);
    setBusy(false);
    setError("");
    setSeed(null);
  }, []);

  useEffect(() => () => { if (abort.current) abort.current.abort(); revoke(); }, []);

  /** Open the sheet with nothing in it — the no-receipt path. */
  const openBlank = useCallback((draft) => {
    revoke();
    b64.current = "";
    setError("");
    setBusy(false);
    setSeed(draft || {});
    setOpen(true);
  }, []);

  const read = useCallback(async () => {
    if (!b64.current) return;
    if (abort.current) abort.current.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true);
    setError("");
    try {
      const out = await readReceipt(b64.current, envelopeNames, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setSeed(draftFromReceipt(out, m, thumb.current));
      if (!out.legible || out.total === null) setError(RECEIPT_ERRORS.unreadable);
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(RECEIPT_ERRORS[e.message] || RECEIPT_ERRORS.failed);
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }, [m, envelopeNames]);

  /** Sheet opens immediately; the read fills it in when it lands. */
  const capture = useCallback(async (file) => {
    if (!file) return;
    revoke();
    setSeed({});
    setError("");
    setOpen(true);
    setBusy(true);
    try {
      const shrunk = await shrink(file);
      b64.current = shrunk.b64;
      thumb.current = shrunk.url;
      setSeed({ thumb: shrunk.url });
    } catch (e) {
      setBusy(false);
      setError("Couldn't open that photo. Type the amount in instead.");
      return;
    }
    await read();
  }, [read]);

  return { open, seed, busy, error, capture, openBlank, close, retry: read, hasPhoto: !!b64.current };
}
