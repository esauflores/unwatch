import { errMsg, renderMarkdown, settings, UI } from "./shared";
import { chatVideo, conclusionesVideo, filterVideo, getVideo } from "./videos";
import type { Video } from "./schema";

type Meta = { videoId: string; title?: string; duration?: number };

const err = document.getElementById("err")!;
const out = document.getElementById("out")!;
const chatEl = document.getElementById("chat")!;
const q = document.getElementById("q") as HTMLTextAreaElement;
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

function seek(t: number): void {
  send({ type: "unwatch:seek", t }).catch(() => {});
}

const renderMd = (el: HTMLElement, text: string): void => renderMarkdown(el, text, seek);

function showVideo(v: Video): void {
  renderMd(out, v.filter_md ?? "");
  const parts: string[] = [];
  for (const turn of v.chat_json ?? []) {
    parts.push(`${turn.role === "user" ? "Q" : "A"}: ${turn.content}`);
  }
  if (v.conclusiones_md) parts.push(`## ${t.notes}\n${v.conclusiones_md}`);
  const raw = parts.join("\n\n");
  chatEl.dataset.raw = raw;
  renderMd(chatEl, raw);
}

function appendChat(block: string): void {
  const raw = chatEl.dataset.raw ? `${chatEl.dataset.raw}\n\n${block}` : block;
  chatEl.dataset.raw = raw;
  renderMd(chatEl, raw);
}

async function ensureVideo(): Promise<void> {
  const p = await send({ type: "unwatch:meta" });
  if (!videoId) throw new Error("filter a video first");
  if (p.videoId !== videoId) throw new Error("filter this video first");
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

btn("ask").onclick = () => {
  const message = q.value.trim();
  if (!message) return;
  void busy("ask", async () => {
    await ensureVideo();
    const { answer } = await chatVideo(videoId, message);
    q.value = "";
    appendChat(`Q: ${message}\nA: ${answer}`);
  });
};

btn("conc").onclick = () =>
  void busy("conc", async () => {
    await ensureVideo();
    const { conclusiones_md } = await conclusionesVideo(videoId);
    await navigator.clipboard.writeText(conclusiones_md);
    appendChat(`## ${t.notes} (${t.copied})\n${conclusiones_md}`);
  });

document.getElementById("lib")!.onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
};

(async () => {
  t = UI[(await settings()).lang];
  btn("run").textContent = t.filter;
  btn("ask").textContent = t.ask;
  btn("conc").textContent = t.notes;
  btn("lib").textContent = t.library;
  q.placeholder = t.askPlaceholder;
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
