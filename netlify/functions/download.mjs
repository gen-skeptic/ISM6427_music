import { suno, json } from "./lib/suno.mjs";

// Browsers ignore <a download> for files on another domain, so they open the
// MP3 in a tab instead. This function looks the track up by task ID (so it
// can't be used to proxy arbitrary URLs), then streams the audio back with
// Content-Disposition: attachment, which makes the browser save it.

const safeName = (s) =>
  (s || "track").replace(/[^\w\- ().]+/g, "").trim().slice(0, 80) || "track";

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const taskId = q.get("taskId") || "";
  const id = q.get("id") || "";
  if (!/^[\w-]{1,128}$/.test(taskId) || !/^[\w-]{1,128}$/.test(id)) {
    return json({ msg: "Missing or invalid taskId / id" }, 400);
  }

  const r = await suno(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (!r.ok) return json({ msg: r.data?.msg || "Could not look up the track." }, r.status);

  const items = r.data?.data?.response?.sunoData || r.data?.data?.response?.data || [];
  const t = items.find((x) => x.id === id);
  const src = t && (t.audioUrl || t.audio_url || t.sourceAudioUrl || t.source_audio_url);
  if (!src) return json({ msg: "Track not found, or its file isn't ready yet." }, 404);

  let upstream;
  try {
    upstream = await fetch(src);
  } catch {
    return json({ msg: "Could not reach the file host." }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    return json({ msg: `The file host returned ${upstream.status}. Files expire after 14 days.` }, 502);
  }

  const filename = `${safeName(q.get("name") || t.title)}.mp3`;
  const headers = {
    "content-type": upstream.headers.get("content-type") || "audio/mpeg",
    "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "cache-control": "private, max-age=3600",
  };
  const len = upstream.headers.get("content-length");
  if (len) headers["content-length"] = len;
  return new Response(upstream.body, { headers });
};

export const config = { path: "/api/download" };
