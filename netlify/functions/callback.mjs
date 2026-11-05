// SunoAPI requires a callBackUrl. The app polls /api/status for results,
// so this endpoint just acknowledges the callback.
export default async () => new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

export const config = { path: "/api/callback" };
