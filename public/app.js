const $ = (id) => document.getElementById(id);
const STORE_KEY = "waveform.jobs.v1";
const POLL_MS = 5000;
const MAX_POLL_MS = 15 * 60 * 1000;

const IDEAS = [
  "A dreamy lo-fi hip hop beat for late night studying",
  "An upbeat 80s synth-pop anthem about chasing the sunset",
  "A soulful acoustic ballad about coming home after years away",
  "Epic orchestral trailer music with thundering drums",
  "A funky disco track about Friday night with a slap bass groove",
  "A country song about a dog who loves road trips",
];
const STYLES = ["pop", "lo-fi", "synthwave", "indie rock", "r&b", "jazz", "edm", "acoustic", "hip hop", "cinematic", "female vocals", "male vocals"];

let mode = "simple";
const jobs = load();
const timers = new Map();

/* ---------- storage ---------- */
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(jobs.slice(0, 50))); } catch { /* storage unavailable */ }
}

/* ---------- composer ---------- */
document.querySelectorAll(".tab").forEach((tab) =>
  tab.addEventListener("click", () => setMode(tab.dataset.mode))
);
function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.mode === next;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelector(".mode-simple").hidden = next !== "simple";
  document.querySelector(".mode-custom").hidden = next !== "custom";
  syncInstrumental();
  hideError();
}

function counter(inputId, outId) {
  const el = $(inputId), out = $(outId);
  const update = () => (out.textContent = el.value.length);
  el.addEventListener("input", update);
  update();
}
counter("prompt", "promptCount");
counter("style", "styleCount");
counter("lyrics", "lyricsCount");

IDEAS.forEach((idea) => {
  const b = chip(idea.length > 38 ? idea.slice(0, 36) + "…" : idea);
  b.title = idea;
  b.addEventListener("click", () => { $("prompt").value = idea; $("prompt").dispatchEvent(new Event("input")); });
  $("ideaChips").append(b);
});
STYLES.forEach((s) => {
  const b = chip("+ " + s);
  b.addEventListener("click", () => {
    const cur = $("style").value.split(",").map((x) => x.trim()).filter(Boolean);
    if (!cur.includes(s)) cur.push(s);
    $("style").value = cur.join(", ");
    $("style").dispatchEvent(new Event("input"));
  });
  $("styleChips").append(b);
});
function chip(text) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "tag"; b.textContent = text;
  return b;
}

function syncInstrumental() {
  const instr = $("instrumental").checked;
  document.querySelector(".lyrics-field").hidden = instr;
  $("vocalGender").disabled = instr;
}
$("instrumental").addEventListener("change", syncInstrumental);

const rangeOut = (id, outId, fmt) => {
  const el = $(id), out = $(outId);
  const update = () => (out.textContent = fmt(Number(el.value)));
  el.addEventListener("input", update); update();
};
rangeOut("duration", "durationOut", (v) => (v < 10 ? "auto" : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`));
rangeOut("styleWeight", "styleWeightOut", (v) => v.toFixed(2));
rangeOut("weirdness", "weirdOut", (v) => v.toFixed(2));

function showError(msg) { $("error").textContent = msg; $("error").hidden = false; }
function hideError() { $("error").hidden = true; }

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const instrumental = $("instrumental").checked;
  const payload = { customMode: mode === "custom", instrumental, model: $("model").value };
  let label;

  if (mode === "simple") {
    payload.prompt = $("prompt").value.trim();
    if (!payload.prompt) return showError("Describe the song you want first.");
    label = payload.prompt;
  } else {
    Object.assign(payload, {
      title: $("title").value.trim(),
      style: $("style").value.trim(),
      lyrics: instrumental ? "" : $("lyrics").value.trim(),
      negativeTags: $("negativeTags").value.trim(),
      vocalGender: $("vocalGender").value,
      variety: Number($("variety").value),
      styleWeight: Number($("styleWeight").value),
      weirdnessConstraint: Number($("weirdness").value),
    });
    const d = Number($("duration").value);
    if (d >= 10) payload.duration = d;
    if (!payload.style && !payload.lyrics) return showError("Add a style or some lyrics.");
    if (!instrumental && !payload.lyrics) return showError("Add lyrics, or switch on Instrumental.");
    label = payload.title || payload.style || payload.lyrics.split("\n")[0];
  }

  const btn = $("submit");
  btn.disabled = true; btn.classList.add("loading");
  btn.querySelector(".btn-label").textContent = "Sending…";
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.taskId) throw new Error(data.msg || `Request failed (${res.status})`);

    const job = {
      taskId: data.taskId,
      label,
      mode,
      model: payload.model,
      instrumental,
      createdAt: Date.now(),
      status: "PENDING",
      tracks: [],
    };
    jobs.unshift(job);
    save();
    render();
    poll(job);
    refreshCredits();
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false; btn.classList.remove("loading");
    btn.querySelector(".btn-label").textContent = "Generate track";
  }
});

/* ---------- polling ---------- */
function poll(job) {
  clearTimeout(timers.get(job.taskId));
  const tick = async () => {
    if (Date.now() - job.createdAt > MAX_POLL_MS) {
      job.status = "TIMEOUT"; job.error = "Timed out waiting for the tracks."; save(); render(); return;
    }
    try {
      const res = await fetch(`/api/status?taskId=${encodeURIComponent(job.taskId)}`);
      const data = await res.json();
      if (res.ok) {
        job.status = data.status;
        if (data.tracks?.length) job.tracks = data.tracks;
        if (data.failed) job.error = data.error || "Generation failed.";
        save(); render();
        if (data.done || data.failed) { refreshCredits(); return; }
      }
    } catch { /* transient network error: keep polling */ }
    timers.set(job.taskId, setTimeout(tick, POLL_MS));
  };
  timers.set(job.taskId, setTimeout(tick, 1500));
}

/* ---------- rendering ---------- */
const STATUS = {
  PENDING: { text: "task.queued", cls: "working", step: 1 },
  TEXT_SUCCESS: { text: "lyrics.written", cls: "working", step: 2 },
  FIRST_SUCCESS: { text: "preview.ready", cls: "working", step: 3 },
  SUCCESS: { text: "tracks.ready", cls: "mint", step: 4 },
};
const isFinal = (s) => s === "SUCCESS" || !STATUS[s];

function fmtDur(s) {
  if (!s) return "";
  s = Math.round(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function timeAgo(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(t).toLocaleDateString();
}

let examples = [];

async function loadExamples() {
  try {
    const res = await fetch("/examples/examples.json", { cache: "no-cache" });
    if (!res.ok) return;
    const list = await res.json();
    examples = (Array.isArray(list) ? list : []).map((x, i) => ({
      taskId: `example-${i}`,
      example: true,
      label: x.label || x.title || "Example track",
      mode: x.mode || "simple",
      model: x.model || "V6",
      instrumental: Boolean(x.instrumental),
      status: "SUCCESS",
      // Either one track inline ({title, src, ...}) or several in `tracks`.
      tracks: (Array.isArray(x.tracks) ? x.tracks : [x]).map((t, j) => ({
        id: `example-${i}-${j}`,
        title: t.title || "Example track",
        tags: t.tags || "",
        lyrics: t.lyrics || "",
        duration: t.duration || null,
        audioUrl: t.src,
        imageUrl: t.image || "",
        local: true,
      })),
    }));
    render();
  } catch { /* no examples */ }
}

function render() {
  const root = $("jobs");
  root.replaceChildren();
  $("empty").hidden = jobs.length > 0;
  $("clearAll").hidden = jobs.length === 0;

  for (const job of [...jobs, ...examples]) {
    const el = $("jobTpl").content.firstElementChild.cloneNode(true);
    const st = STATUS[job.status] || { text: job.status === "TIMEOUT" ? "task.timed_out" : "task.failed", cls: "failed", step: 0 };
    el.querySelector(".job-prompt").textContent = job.label;
    el.querySelector(".job-meta").textContent = job.example
      ? ["Example", job.model.replace("_", " "), job.instrumental ? "Instrumental" : null].filter(Boolean).join(" · ")
      : [job.mode === "custom" ? "Custom" : "Simple", job.model.replace("_", " "), job.instrumental ? "Instrumental" : null, timeAgo(job.createdAt)]
          .filter(Boolean).join(" · ");
    if (job.example) el.classList.add("is-example");
    const line = el.querySelector(".job-status");
    line.classList.add(st.cls);
    line.dataset.step = st.step;
    el.querySelector(".status-text").textContent =
      st.cls === "failed" ? `${st.text} · ${job.error || "something went wrong"}`
        : job.example ? "example.track" : st.text;

    const list = el.querySelector(".tracks");
    for (const t of job.tracks) list.append(trackCard(t, job));
    root.append(el);
  }
}

function trackCard(t, job) {
  const el = $("trackTpl").content.firstElementChild.cloneNode(true);
  const src = t.audioUrl || t.streamUrl;
  el.dataset.src = src || "";
  el.querySelector(".t-title").textContent = t.title || "Untitled";
  el.querySelector(".t-tags").textContent = t.tags || "";
  el.querySelector(".t-dur").textContent = t.audioUrl ? fmtDur(t.duration) : "streaming preview…";
  const img = el.querySelector("img");
  if (t.imageUrl) img.src = t.imageUrl;
  img.onerror = () => img.removeAttribute("src");

  const cover = el.querySelector(".cover");
  cover.disabled = !src;
  cover.addEventListener("click", () => play(t, el));
  if (current && current === src) el.classList.add("playing");

  const dl = el.querySelector(".dl");
  const filename = `${(t.title || "track").replace(/[^\w\- ()]+/g, "").trim() || "track"}.mp3`;
  if (t.local) {
    // Same-origin file: the download attribute works directly.
    dl.href = t.audioUrl;
    dl.download = filename;
    dl.removeAttribute("target");
  } else if (t.audioUrl) {
    // Cross-origin file: browsers ignore download=, so fetch it through
    // /api/download, which replies with Content-Disposition: attachment.
    const proxied = `/api/download?taskId=${encodeURIComponent(job.taskId)}&id=${encodeURIComponent(t.id)}&name=${encodeURIComponent(t.title || "track")}`;
    dl.href = proxied;
    dl.download = filename;
    dl.removeAttribute("target");
    dl.addEventListener("click", (e) => { e.preventDefault(); saveTrack(dl, proxied, t.audioUrl, filename); });
  } else {
    dl.setAttribute("aria-disabled", "true");
    dl.removeAttribute("href");
  }

  const lyricsBtn = el.querySelector(".lyrics-btn");
  const pre = el.querySelector(".t-lyrics");
  if (job.instrumental || !t.lyrics) lyricsBtn.hidden = true;
  else {
    pre.textContent = t.lyrics;
    lyricsBtn.addEventListener("click", () => {
      pre.hidden = !pre.hidden;
      lyricsBtn.textContent = pre.hidden ? "Lyrics" : "Hide";
    });
  }
  return el;
}

async function saveTrack(btn, proxied, original, filename) {
  if (btn.dataset.busy) return;
  btn.dataset.busy = "1";
  const label = btn.textContent;
  btn.textContent = "Saving…";
  try {
    const res = await fetch(proxied);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).msg || `HTTP ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    btn.textContent = "Saved";
  } catch (err) {
    // Last resort: open the original file so it can be saved from the browser.
    window.open(original, "_blank", "noopener");
    btn.textContent = "Opened";
    console.warn("Download failed:", err.message);
  } finally {
    setTimeout(() => { btn.textContent = label; delete btn.dataset.busy; }, 2000);
  }
}

/* ---------- player ---------- */
const audio = $("audio");
let current = null;
function play(t, card) {
  const src = t.audioUrl || t.streamUrl;
  if (!src) return;
  if (current === src && !audio.paused) { audio.pause(); return; }
  if (current !== src) {
    audio.src = src;
    current = src;
    $("playerTitle").textContent = t.title || "Untitled";
    $("playerTags").textContent = t.tags || "";
    $("playerArt").src = t.imageUrl || "";
  }
  $("player").hidden = false;
  audio.play().catch(() => {});
  markPlaying();
}
function markPlaying() {
  document.querySelectorAll(".track-card").forEach((c) =>
    c.classList.toggle("playing", !audio.paused && c.dataset.src === current)
  );
}
audio.addEventListener("play", markPlaying);
audio.addEventListener("pause", markPlaying);
audio.addEventListener("ended", markPlaying);

/* ---------- credits ---------- */
async function refreshCredits() {
  const box = $("credits");
  try {
    const res = await fetch("/api/credits");
    const data = await res.json();
    if (!res.ok || data.credits == null) throw new Error();
    $("creditsValue").textContent = `credits ${Number(data.credits).toLocaleString()}`;
    box.classList.remove("unknown");
    box.classList.toggle("low", data.credits < 20);
  } catch {
    box.classList.add("unknown");
    $("creditsValue").textContent = "credits unavailable";
  }
}

$("clearAll").addEventListener("click", () => {
  if (!confirm("Remove all tracks from this list? (Download any you want to keep first.)")) return;
  timers.forEach(clearTimeout); timers.clear();
  jobs.length = 0; save(); render();
});

/* ---------- theme ---------- */
const themeSel = $("theme");
themeSel.value = document.documentElement.dataset.theme || "mocha";
themeSel.addEventListener("change", () => {
  document.documentElement.dataset.theme = themeSel.value;
  try { localStorage.setItem("waveform.theme", themeSel.value); } catch { /* ignore */ }
});

/* ---------- boot ---------- */
render();
loadExamples();
refreshCredits();
jobs.filter((j) => !isFinal(j.status)).forEach(poll);
