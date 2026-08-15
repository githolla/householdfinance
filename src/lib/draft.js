/* ==================================================================
   the shape EntrySheet is seeded with

   Lives apart from the sheet so the capture hook can build one without
   importing a React component.
   ================================================================== */

export const BLANK = {
  amount: "", note: "", envId: "", who: "joint",
  merchant: "", items: [], dateISO: "", why: "", thumb: "",
};

/** Whatever the reader managed to get, turned into a draft entry. */
export function draftFromReceipt(out, m, thumb) {
  const match = m.matchEnvelope(out.merchant, out.envelope);
  return {
    ...BLANK,
    amount: out.total ? String(out.total) : "",
    note: out.note || "",
    envId: match.envId,
    who: match.who,
    merchant: out.merchant || "",
    items: out.items || [],
    dateISO: out.date || "",
    why: match.why,
    thumb: thumb || "",
  };
}

/**
 * An empty draft, optionally pinned to an envelope the person tapped.
 * Defaults to whatever they reach for most this month — not the tightest
 * envelope, which is usually rent and almost never what's being logged.
 */
export const blankDraft = (m, envId, defaultWho) => ({
  ...BLANK,
  envId: envId || m.recentEnvIds[0] || (m.tightest[0] ? m.tightest[0].id : ""),
  who: defaultWho || "joint",
});
