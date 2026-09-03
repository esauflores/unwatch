import { YoutubeTranscript } from "youtube-transcript";

import { UnwatchError } from "@/lib/errors";

type Cue = { t: number; text: string };

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Errors cross the runtime-message boundary as a string, so send the ErrCode
// alongside it when we have one — the panel rebuilds the UnwatchError. For our
// own errors send the bare detail, not the `code: detail` message.
const errPayload = (e: unknown) =>
  e instanceof UnwatchError ? { error: e.detail ?? e.code, code: e.code } : { error: errMsg(e), code: undefined };

function videoId(): string | null {
  return new URLSearchParams(location.search).get("v");
}

function title(): string {
  // document.title is updated by YouTube's router on every SPA nav; the <h1> can
  // lag or be a stale renderer, so use it only as a fallback.
  const fromDoc = document.title
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s*-\s*YouTube\s*$/, "")
    .trim();
  return fromDoc || document.querySelector("h1.ytd-watch-metadata")?.textContent?.trim() || "";
}

function duration(): number {
  const txt = document.querySelector(".ytp-time-duration")?.textContent?.trim();
  if (txt && /^\d+(:\d{2})+$/.test(txt)) {
    return txt.split(":").reduce((a, n) => a * 60 + Number(n), 0);
  }
  const d = document.querySelector("video")?.duration;
  return Number.isFinite(d) && (d ?? 0) > 0 ? Math.round(d as number) : 0;
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
      throw new UnwatchError("no_captions", "transcript panel button never appeared");
    }
    for (let i = 0; i < 30 && !document.querySelector(SEG); i++) await sleep(200);
  }

  const cues: Cue[] = [];
  for (const el of Array.from(document.querySelectorAll(SEG))) {
    const text = (el.querySelector(".segment-text")?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) cues.push({ t: tsToSeconds(el.querySelector(".segment-timestamp")?.textContent ?? ""), text });
  }
  clickByText(/^hide transcript$/i); // leave the page as we found it

  if (!cues.length) throw new UnwatchError("no_captions", "transcript panel rendered no segments");
  console.warn(`[unwatch] scraped ${cues.length} transcript segments from the panel`);
  return cues;
}

// While an ad plays, #movie_player carries .ad-showing and caption access is
// blocked — a different failure from "this video has no captions" (retryable).
const adPlaying = () => !!document.querySelector(".ad-showing, .ad-interrupting");

// YouTube's cookie-consent lightbox sits over the player; nothing loads behind
// it. The element name has drifted across YT revisions — cover the known ones.
const consentWall = () =>
  !!document.querySelector("ytd-consent-bump-v2-lightbox, ytd-consent-bump-lightbox, #consent-bump");

async function captions(): Promise<Cue[]> {
  const id = videoId();
  if (!id) throw new UnwatchError("not_watch_page");
  if (consentWall()) throw new UnwatchError("consent_required");
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
  try {
    return await scrapeTranscriptPanel();
  } catch (e) {
    if (adPlaying()) throw new UnwatchError("ad_playing");
    throw e;
  }
}

function meta(): { videoId: string; title: string; duration: number } {
  const id = videoId();
  if (!id) throw new UnwatchError("not_watch_page");
  return { videoId: id, title: title(), duration: duration() };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "unwatch:meta") {
    try {
      sendResponse(meta());
    } catch (err) {
      sendResponse(errPayload(err));
    }
    return;
  }
  if (msg?.type === "unwatch:page") {
    (async () => ({ ...meta(), cues: await captions() }))()
      .then(sendResponse)
      .catch((err) => sendResponse(errPayload(err)));
    return true;
  }
  if (msg?.type === "unwatch:seek") {
    const video = document.querySelector("video");
    if (video && Number.isFinite(msg.t)) video.currentTime = msg.t;
  }
});

// YouTube SPA-navigates between videos without a full page load. On a real
// video-id change, wait for document.title to actually update (it lags the URL),
// then tell the panel so its re-read picks up the fresh title/duration.
let lastId = videoId();
function onNav(): void {
  const id = videoId();
  if (id === lastId) return;
  lastId = id;
  const before = document.title;
  let tries = 0;
  const iv = setInterval(() => {
    if (document.title !== before || ++tries > 25) {
      clearInterval(iv);
      chrome.runtime.sendMessage({ type: "unwatch:navigated" }).catch(() => {});
    }
  }, 100);
}
document.addEventListener("yt-navigate-finish", onNav);
window.addEventListener("yt-navigate-finish", onNav);
setInterval(onNav, 1000); // catch navs where the event doesn't reach us
