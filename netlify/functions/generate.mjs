import { suno, json, ERROR_HINTS } from "./lib/suno.mjs";

const MODELS = ["V6", "V6_MINI", "V6_WILD"];
const clampNum = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
};
const str = (v) => (typeof v === "string" ? v.trim() : "");

export default async (req) => {
  if (req.method !== "POST") return json({ msg: "Method not allowed" }, 405);

  let input;
  try { input = await req.json(); } catch { return json({ msg: "Invalid JSON body" }, 400); }

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.includes(input.model) ? input.model : "V6";

  const origin = process.env.URL || new URL(req.url).origin;
  const body = { customMode, instrumental, model, callBackUrl: `${origin}/api/callback` };

  const prompt = str(input.prompt);
  const style = str(input.style);
  const lyrics = str(input.lyrics);

  if (!customMode) {
    // Simple mode: prompt is the idea; lyrics are written automatically.
    if (!prompt && !style) return json({ msg: "Describe the song you want." }, 400);
    if (prompt.length > 3000) return json({ msg: "Description must be 3000 characters or fewer." }, 400);
    if (prompt) body.prompt = prompt;
    if (style) body.style = style.slice(0, 1000);
  } else {
    const title = str(input.title);
    const negativeTags = str(input.negativeTags);
    if (!style && !lyrics && !negativeTags) return json({ msg: "Custom mode needs at least a style or lyrics." }, 400);
    if (!instrumental && !lyrics) return json({ msg: "Add lyrics, or switch on Instrumental." }, 400);
    if (title.length > 80) return json({ msg: "Title must be 80 characters or fewer." }, 400);
    if (style.length > 1000) return json({ msg: "Style must be 1000 characters or fewer." }, 400);
    if (lyrics.length > 5000) return json({ msg: "Lyrics must be 5000 characters or fewer." }, 400);
    if (negativeTags.length > 1000) return json({ msg: "Excluded styles must be 1000 characters or fewer." }, 400);

    if (title) body.title = title;
    if (style) body.style = style;
    if (lyrics && !instrumental) body.lyrics = lyrics;
    if (negativeTags) body.negativeTags = negativeTags;
    if (input.vocalGender === "m" || input.vocalGender === "f") body.vocalGender = input.vocalGender;

    const duration = clampNum(input.duration, 10, 360);
    if (duration !== undefined) body.duration = Math.round(duration);
    const styleWeight = clampNum(input.styleWeight, 0, 1);
    if (styleWeight !== undefined) body.styleWeight = Math.round(styleWeight * 100) / 100;
    const weirdness = clampNum(input.weirdnessConstraint, 0, 1);
    if (weirdness !== undefined) body.weirdnessConstraint = Math.round(weirdness * 100) / 100;
    const variety = clampNum(input.variety, 0, 4);
    if (variety !== undefined) body.variety = Math.round(variety);
  }

  const r = await suno("/api/v1/generate", { method: "POST", body });
  if (!r.ok) {
    const code = r.data?.code;
    return json({ msg: r.data?.msg || ERROR_HINTS[code] || "Generation request failed.", hint: ERROR_HINTS[code], code }, r.status);
  }
  const taskId = r.data?.data?.taskId;
  if (!taskId) return json({ msg: "SunoAPI did not return a task ID." }, 502);
  return json({ taskId });
};

export const config = { path: "/api/generate" };
