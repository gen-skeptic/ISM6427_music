import { suno, json } from "./lib/suno.mjs";

export default async () => {
  const r = await suno("/api/v1/generate/credit");
  if (!r.ok) return json({ msg: r.data?.msg || "Could not load credits" }, r.status);
  return json({ credits: r.data?.data ?? null });
};

export const config = { path: "/api/credits" };
