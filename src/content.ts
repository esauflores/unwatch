type Cue = { t: number; text: string };
type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string };
type PlayerResponse = {
  videoDetails?: { videoId?: string };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
};
type Json3 = { events?: { tStartMs?: number; segs?: { utf8?: string }[] }[] };

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function videoId(): string | null {
  return new URLSearchParams(location.search).get("v");
}

function title(): string {
  return (
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim() || document.title
  );
}

function duration(): number {
  const player = document.getElementById("movie_player") as any;
  const d = player?.getDuration?.() ?? document.querySelector("video")?.duration;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}

function matches(pr: unknown): PlayerResponse | null {
  const p = pr as PlayerResponse | null;
  return p && p.videoDetails?.videoId === videoId() ? p : null;
}

function fromPlayer(): PlayerResponse | null {
  const el = document.getElementById("movie_player") as any;
  if (!el) return null;
  try {
    const raw = el.getPlayerResponse?.() ?? el.playerResponse;
    return matches(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

function parseEmbedded(text: string): unknown {
  const idx = text.indexOf("ytInitialPlayerResponse");
  if (idx === -1) return null;
  const eq = text.indexOf("=", idx);
  if (eq === -1) return null;
  try {
    return JSON.parse(text.slice(eq + 1).trim().replace(/;?\s*$/, "").replace(/;$/, ""));
  } catch {
    const start = text.indexOf("{", eq);
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function fromScripts(): PlayerResponse | null {
  for (const script of document.scripts) {
    const hit = matches(parseEmbedded(script.textContent ?? ""));
    if (hit) return hit;
  }
  return null;
}

function fromMain(): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "unwatch:pr" }, (pr) => resolve(pr ?? null));
  });
}

async function playerResponse(): Promise<PlayerResponse | null> {
  return (
    fromPlayer() ||
    matches((window as any).ytInitialPlayerResponse) ||
    fromScripts() ||
    matches(await fromMain())
  );
}

function parseJson3(data: Json3): Cue[] {
  const events = data?.events;
  if (!Array.isArray(events)) return [];
  const cues: Cue[] = [];
  for (const ev of events) {
    if (!ev?.segs) continue;
    const text = ev.segs.map((s) => s.utf8 ?? "").join("").trim();
    if (!text || text === "\n") continue;
    cues.push({ t: (ev.tStartMs ?? 0) / 1000, text });
  }
  return cues;
}

async function captions(): Promise<Cue[]> {
  const pr = await playerResponse();
  const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error("no transcript on this video");
  }
  const track =
    tracks.find((t) => String(t.languageCode ?? "").startsWith("es")) ||
    tracks.find((t) => !t.kind || t.kind !== "asr") ||
    tracks[0];
  const url = new URL(track.baseUrl, location.origin);
  url.searchParams.set("fmt", "json3");
  const res = await fetch(url);
  if (!res.ok) throw new Error("could not fetch captions");
  const cues = parseJson3(await res.json());
  if (!cues.length) throw new Error("empty transcript");
  return cues;
}

function meta(): { videoId: string; title: string; duration: number } {
  const id = videoId();
  if (!id) throw new Error("not a watch page");
  return { videoId: id, title: title(), duration: duration() };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "unwatch:meta") {
    try {
      sendResponse(meta());
    } catch (err) {
      sendResponse({ error: errMsg(err) });
    }
    return;
  }
  if (msg?.type === "unwatch:page") {
    (async () => ({ ...meta(), cues: await captions() }))()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: errMsg(err) }));
    return true;
  }
  if (msg?.type === "unwatch:seek") {
    const video = document.querySelector("video");
    if (video && Number.isFinite(msg.t)) video.currentTime = msg.t;
  }
});
