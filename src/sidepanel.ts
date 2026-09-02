import "deep-chat"; // side-effect: registers the <deep-chat> element
import type { DeepChat } from "deep-chat";
import { errMsg, renderMarkdown, settings, UI } from "./shared";
import { chatVideo, filterVideo, getVideo } from "./videos";
import type { Video } from "./schema";

type Meta = { videoId: string; title?: string; duration?: number };

const err = document.getElementById("err")!;
const out = document.getElementById("out")!;
const metaEl = document.getElementById("meta")!;
const viewExtract = document.getElementById("view-extract")!;
const viewChat = document.getElementById("view-chat")!;
const dc = document.getElementById("dc") as DeepChat;
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;

let videoId = "";
let t = UI.en;
let chatReady = false;

const C = {
  panel: "#16181c",
  panel2: "#1c1f24",
  fg: "#e9eaec",
  muted: "#969ba3",
  line: "#2a2e35",
  accent: "#8cf",
  accentInk: "#06121a",
};

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

function fitChat(): void {
  dc.style.height = `${Math.max(280, window.innerHeight - dc.getBoundingClientRect().top - 14)}px`;
}

function showView(view: "extract" | "chat"): void {
  viewExtract.hidden = view !== "extract";
  viewChat.hidden = view !== "chat";
  btn("tab-extract").classList.toggle("active", view === "extract");
  btn("tab-chat").classList.toggle("active", view === "chat");
  if (view === "chat") fitChat();
}

// One-time deep-chat wiring, once a video has been extracted for this tab.
function setupChat(v: Video): void {
  btn("tab-chat").disabled = false;
  if (chatReady) return;
  chatReady = true;

  dc.style.cssText = `display:block;width:100%;border:1px solid ${C.line};border-radius:10px;background-color:${C.panel}`;
  dc.textInput = {
    placeholder: { text: t.askPlaceholder, style: { color: C.muted } },
    styles: { text: { color: C.fg }, container: { backgroundColor: C.panel2, border: `1px solid ${C.line}` } },
  };
  dc.messageStyles = {
    default: {
      ai: { bubble: { backgroundColor: C.panel2, color: C.fg } },
      user: { bubble: { backgroundColor: C.accent, color: C.accentInk } },
    },
  };
  dc.submitButtonStyles = { submit: { container: { default: { backgroundColor: C.accent } } } };
  dc.history = (v.chat_json ?? []).map((turn) => ({
    role: turn.role === "assistant" ? "ai" : "user",
    text: turn.content,
  }));
  dc.connect = {
    handler: async (
      body: { messages?: { text?: string }[] },
      signals: { onResponse: (r: { text?: string; error?: string }) => void },
    ) => {
      const msg = body.messages?.[body.messages.length - 1]?.text ?? "";
      try {
        const { answer } = await chatVideo(videoId, msg);
        signals.onResponse({ text: answer });
      } catch (e) {
        signals.onResponse({ error: errMsg(e) });
      }
    },
  };
  window.addEventListener("resize", () => {
    if (!viewChat.hidden) fitChat();
  });
}

function showVideo(v: Video): void {
  renderMarkdown(out, v.filter_md ?? "", seek);
  setupChat(v);
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

btn("tab-extract").onclick = () => showView("extract");
btn("tab-chat").onclick = () => showView("chat");
btn("lib").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });

(async () => {
  t = UI[(await settings()).lang];
  btn("run").textContent = t.filter;
  btn("tab-extract").textContent = t.extract;
  btn("tab-chat").textContent = t.chat;
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
