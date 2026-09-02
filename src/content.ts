import { YoutubeTranscript } from "youtube-transcript";

type Cue = { t: number; text: string };

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

// Primary path: the youtube-transcript package (watch-HTML / InnerTube → timedtext).
async function libCaptions(id: string): Promise<Cue[]> {
  let rows;
  try {
    rows = await YoutubeTranscript.fetchTranscript(id, { lang: "es" });
  } catch {
    rows = await YoutubeTranscript.fetchTranscript(id);
  }
  // offset/duration come back in ms (srv3) or seconds (classic) depending on the
  // format YouTube served — a caption line is never 100s long, so let duration decide.
  const inMs = rows.some((r) => r.duration > 100);
  return rows
    .map((r) => ({ t: inMs ? r.offset / 1000 : r.offset, text: r.text.replace(/\s+/g, " ").trim() }))
    .filter((c) => c.text);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function tsToSeconds(s: string): number {
  const p = s.trim().split(":").map(Number);
  return p.some((n) => Number.isNaN(n)) ? 0 : p.reduce((a, n) => a * 60 + n, 0);
}

function clickByText(re: RegExp): boolean {
  for (const n of Array.from(document.querySelectorAll<HTMLElement>("button, tp-yt-paper-button, a"))) {
    if (re.test((n.getAttribute("aria-label") || n.textContent || "").trim())) {
      n.click();
      return true;
    }
  }
  return false;
}

// Fallback: PoToken-gated videos give the lib an empty timedtext body, but
// YouTube's own "Show transcript" panel still renders (its player already minted
// the token), so read the segments straight off the DOM.
async function scrapeTranscriptPanel(): Promise<Cue[]> {
  const SEG = "ytd-transcript-segment-renderer";
  if (!document.querySelector(SEG)) {
    document.querySelector<HTMLElement>("ytd-text-inline-expander #expand, tp-yt-paper-button#expand")?.click();
    await sleep(300);
    if (!clickByText(/^show transcript$/i) && !clickByText(/transcript/i)) {
      throw new Error("no transcript available for this video");
    }
    for (let i = 0; i < 30 && !document.querySelector(SEG); i++) await sleep(200);
  }

  const cues: Cue[] = [];
  for (const el of Array.from(document.querySelectorAll(SEG))) {
    const text = (el.querySelector(".segment-text")?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) cues.push({ t: tsToSeconds(el.querySelector(".segment-timestamp")?.textContent ?? ""), text });
  }
  clickByText(/^hide transcript$/i); // leave the page as we found it

  if (!cues.length) throw new Error("transcript panel rendered no segments");
  console.warn(`[unwatch] scraped ${cues.length} transcript segments from the panel`);
  return cues;
}

async function captions(): Promise<Cue[]> {
  const id = videoId();
  if (!id) throw new Error("not a watch page");
  try {
    const cues = await libCaptions(id);
    if (cues.length) {
      console.warn(`[unwatch] youtube-transcript: ${cues.length} lines`);
      return cues;
    }
  } catch (e) {
    console.warn("[unwatch] youtube-transcript failed:", errMsg(e));
  }
  console.warn("[unwatch] falling back to YouTube's transcript panel");
  return scrapeTranscriptPanel();
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
