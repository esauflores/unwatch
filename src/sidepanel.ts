import { errMsg, renderMarkdown, settings, UI } from "./shared";
import { filterVideo, getVideo } from "./videos";
import type { Video } from "./schema";

type Meta = { videoId: string; title?: string; duration?: number };

const err = document.getElementById("err")!;
const out = document.getElementById("out")!;
const metaEl = document.getElementById("meta")!;
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;

let videoId = "";
let t = UI.en;

function showErr(e: string): void {
  err.textContent = e || "";
}

async function tabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function send(msg: unknown): Promise<any> {
  const id = await tabId();
  if (!id) throw new Error("no active tab");
  const res = await chrome.tabs.sendMessage(id, msg);
  if (res?.error) throw new Error(res.error);
  return res;
}

function setMeta(p: Meta): void {
  videoId = p.videoId;
  const d = p.duration ? ` · ${Math.floor(p.duration / 60)}:${String(p.duration % 60).padStart(2, "0")}` : "";
  metaEl.textContent = (p.title || p.videoId) + d;
}

function seek(sec: number): void {
  send({ type: "unwatch:seek", t: sec }).catch(() => {});
}

function showVideo(v: Video): void {
  btn("chat-open").hidden = false; // an extracted video exists → Chat page is available
  renderMarkdown(out, v.filter_md ?? "", seek);
}

// Disable the button and mark it busy while its async work runs, so a slow
// transcript fetch + LLM call reads as "in progress" instead of "nothing happened".
async function busy(id: string, fn: () => Promise<void>): Promise<void> {
  const b = btn(id);
  if (b.disabled) return;
  const label = b.textContent;
  b.disabled = true;
  b.textContent = `${label} …`;
  showErr("");
  try {
    await fn();
  } catch (e) {
    showErr(errMsg(e));
  } finally {
    b.disabled = false;
    b.textContent = label;
  }
}

btn("run").onclick = () =>
  void busy("run", async () => {
    const p = await send({ type: "unwatch:page" });
    setMeta(p);
    showVideo(await filterVideo({ videoId: p.videoId, title: p.title, cues: p.cues }));
  });

btn("chat-open").onclick = () => {
  if (videoId) chrome.tabs.create({ url: chrome.runtime.getURL(`chat.html?v=${videoId}`) });
};

document.getElementById("lib")!.onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
};

(async () => {
  t = UI[(await settings()).lang];
  btn("run").textContent = t.filter;
  btn("chat-open").textContent = t.chat;
  btn("lib").textContent = t.library;
  try {
    const p = await send({ type: "unwatch:meta" });
    setMeta(p);
    const v = await getVideo(p.videoId);
    if (v) showVideo(v);
    else videoId = "";
  } catch {
    videoId = "";
    metaEl.textContent = t.noVideo;
  }
})();
