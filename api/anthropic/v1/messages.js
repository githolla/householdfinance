/**
 * Vercel serverless proxy for the planner's Anthropic calls.
 *
 * The app fetches /api/anthropic/v1/messages in every environment. In dev,
 * vite.config.js proxies that path to api.anthropic.com with the key from
 * .env. On Vercel, this function answers the same path, so App.jsx needs no
 * environment awareness. Set ANTHROPIC_API_KEY in Vercel → Project Settings →
 * Environment Variables (all environments), then redeploy.
 *
 * Guards: POST only, known-model allowlist, max_tokens cap — the key is
 * server-side, but the route is public on preview URLs, so keep it from
 * being useful as a general-purpose Anthropic relay.
 */

const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
]);
const MAX_TOKENS_CAP = 1500;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "POST only" } });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: {
        message:
          "ANTHROPIC_API_KEY is not set. Add it in Vercel → Project Settings → Environment Variables, then redeploy.",
      },
    });
  }

  const body = req.body;
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: { message: "Malformed request body" } });
  }
  if (!ALLOWED_MODELS.has(body.model)) {
    return res.status(400).json({ error: { message: `Model not allowed: ${body.model}` } });
  }
  const payload = {
    ...body,
    max_tokens: Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP),
    stream: false,
  };

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({
      error: { message: `Could not reach the Anthropic API: ${e.message}` },
    });
  }
}
