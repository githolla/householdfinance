/* ==================================================================
   the production stand-in for the dev proxy

   vite.config.js only proxies /api/anthropic while `npm run dev` is
   running. A built site has no such route, so without this the planner
   and receipt reading 404 in production.

   The key is read from the environment here, on the server, and never
   goes near the browser. Do NOT move it to a VITE_ variable — anything
   prefixed VITE_ is inlined into the client bundle and is public.
   ================================================================== */

export const config = {
  // The planner runs Opus with thinking on; the 10s default is not enough.
  // 60s is the Hobby ceiling.
  maxDuration: 60,
};

const ALLOWED = new Set(["v1/messages"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { type: "method_not_allowed", message: "POST only." } });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: {
        type: "authentication_error",
        message: "ANTHROPIC_API_KEY isn't set on the server. Add it in the Vercel project's environment variables.",
      },
    });
  }

  /* Only forward the one endpoint the app actually calls — this route is
     public, and a general-purpose passthrough is someone else's free API key. */
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : String(req.query.path || "");
  if (!ALLOWED.has(path)) {
    return res.status(404).json({ error: { type: "not_found_error", message: `No route for /${path}.` } });
  }

  try {
    const upstream = await fetch(`https://api.anthropic.com/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (e) {
    // Never surface the upstream error verbatim — it can echo request detail.
    return res.status(502).json({
      error: { type: "api_error", message: "Couldn't reach Anthropic from the server." },
    });
  }
}
