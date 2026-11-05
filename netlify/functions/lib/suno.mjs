// Shared helpers for talking to SunoAPI.org from Netlify Functions.
// The API key is read from the SUNO_API (or SUNO_API_KEY) environment variable
// and never reaches the browser.

// Docs examples use apibox.erweima.ai; api.sunoapi.org is the branded host.
// Both serve the same API. SUNO_API_BASE overrides the list if set.
const BASES = (process.env.SUNO_API_BASE
  ? [process.env.SUNO_API_BASE]
  : ["https://api.sunoapi.org", "https://apibox.erweima.ai"]
).map((b) => b.replace(/\/+$/, ""));

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function suno(path, { method = "GET", body } = {}) {
  const key = (process.env.SUNO_API || process.env.SUNO_API_KEY || "").trim();
  if (!key) {
    return { ok: false, status: 500, data: { code: 500, msg: "Server is missing the SUNO_API environment variable. Add it in Netlify → Site configuration → Environment variables." } };
  }
  let lastErr;
  for (const base of BASES) {
    try {
      const res = await fetch(base + path, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { code: res.status, msg: text.slice(0, 300) }; }
      // SunoAPI reports errors in the body's `code` field, often with HTTP 200.
      const ok = res.ok && (data.code === undefined || data.code === 200);
      return { ok, status: ok ? 200 : (data.code && data.code !== 200 ? 502 : res.status), data };
    } catch (err) {
      lastErr = err; // network failure: try the next host
    }
  }
  return { ok: false, status: 502, data: { code: 502, msg: `Could not reach SunoAPI: ${lastErr?.message || "network error"}` } };
}

export const ERROR_HINTS = {
  400: "Invalid parameters.",
  401: "Unauthorized — check the SUNO_API value in Netlify.",
  404: "Invalid request method or path.",
  405: "Rate limit exceeded.",
  413: "Prompt or style is too long.",
  429: "Insufficient credits on the SunoAPI account.",
  430: "Too many requests. Please wait a moment and try again.",
  455: "SunoAPI is under maintenance. Try again later.",
  500: "SunoAPI server error.",
};
