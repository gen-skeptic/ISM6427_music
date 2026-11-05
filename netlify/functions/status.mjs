import { suno, json, ERROR_HINTS } from "./lib/suno.mjs";

const FAILED = ["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"];
const pick = (o, ...keys) => { for (const k of keys) if (o?.[k]) return o[k]; return ""; };

export default async (req) => {
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{1,128}$/.test(taskId)) return json({ msg: "Missing or invalid taskId" }, 400);

  const r = await suno(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (!r.ok) {
    const code = r.data?.code;
    return json({ msg: r.data?.msg || ERROR_HINTS[code] || "Status check failed.", code }, r.status);
  }
  const d = r.data?.data || {};
  const items = d.response?.sunoData || d.response?.data || [];

  // Normalise field names (the API has used both camelCase and snake_case).
  const tracks = items.map((t) => ({
    id: t.id,
    title: t.title || "Untitled",
    tags: t.tags || "",
    lyrics: t.prompt || "",
    duration: t.duration || null,
    audioUrl: pick(t, "audioUrl", "audio_url", "sourceAudioUrl", "source_audio_url"),
    streamUrl: pick(t, "streamAudioUrl", "stream_audio_url", "sourceStreamAudioUrl", "source_stream_audio_url"),
    imageUrl: pick(t, "imageUrl", "image_url", "sourceImageUrl", "source_image_url"),
    model: t.modelName || t.model_name || "",
  }));

  const status = d.status || "PENDING";
  return json({
    taskId,
    status,
    done: status === "SUCCESS",
    failed: FAILED.includes(status),
    error: d.errorMessage || (FAILED.includes(status) ? status.replace(/_/g, " ").toLowerCase() : null),
    tracks,
  });
};

export const config = { path: "/api/status" };
