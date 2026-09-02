import "deep-chat"; // side-effect: registers the <deep-chat> element
import type { DeepChat } from "deep-chat";
import { type Lang, UI } from "@/lib/i18n";
import { renderMarkdown } from "@/lib/markdown";
import { settings } from "@/lib/settings";
import { errMsg } from "@/lib/util";
import { chatVideo, filterVideo, getVideo } from "@/lib/videos";
import { formatTranscript, stripVerdictLine, verdictLabel, type Video } from "@/lib/schema";

type Meta = { videoId: string; title?: string; duration?: number };

const err = document.getElementById("err")!;
const out = document.getElementById("out")!;
const metaEl = document.getElementById("meta")!;
const viewExtract = document.getElementById("view-extract")!;
const viewChat = document.getElementById("view-chat")!;
const viewDownload = document.getElementById("view-download")!;
const dc = document.getElementById("dc") as DeepChat;
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;

let videoId = "";
let lang: Lang = "en";
let t = UI.en;
let chatReady = false;
let current: Video | null = null;

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

type View = "extract" | "chat" | "download";
function showView(view: View): void {
  viewExtract.hidden = view !== "extract";
  viewChat.hidden = view !== "chat";
  viewDownload.hidden = view !== "download";
  for (const v of ["extract", "chat", "download"] as const) {
    btn(`tab-${v}`).classList.toggle("active", view === v);
  }
  if (view === "chat") fitChat();
}

function saveFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
const fileBase = () =>
  (current?.title ?? "unwatch").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 80) || "unwatch";
const chatToMd = (v: Video) =>
  (v.chat_json ?? []).map((turn) => `${turn.role === "user" ? "Q" : "A"}: ${turn.content}`).join("\n\n");

window.addEventListener("resize", () => {
  if (!viewChat.hidden) fitChat();
});

// Configure deep-chat once; (re)seed its messages for whichever video is current.
function setupChat(v: Video): void {
  btn("tab-chat").disabled = false;
  if (!chatReady) {
    chatReady = true;
    dc.style.cssText = `display:block;width:100%;border:1px solid ${C.line};border-radius:10px;background-color:${C.panel}`;
    dc.textInput = {
      placeholder: { text: t.askPlaceholder, style: { color: C.muted } },
      styles: { text: { color: C.fg }, container: { backgroundColor: C.panel2, border: `1px solid ${C.line}` } },
    };
    dc.messageStyles = {
      default: {
        // deep-chat caps .message-bubble at 60% — too narrow for a side panel
        shared: { bubble: { maxWidth: "92%" } },
        ai: { bubble: { backgroundColor: C.panel2, color: C.fg } },
        user: { bubble: { backgroundColor: C.accent, color: C.accentInk } },
      },
    };
    dc.submitButtonStyles = { submit: { container: { default: { backgroundColor: C.accent } } } };
    dc.connect = {
      handler: async (
        body: { messages?: { text?: string }[] },
        signals: { onResponse: (r: { text?: string; error?: string }) => void },
      ) => {
        const msg = body.messages?.[body.messages.length - 1]?.text ?? "";
        try {
          const { answer } = await chatVideo(videoId, msg); // videoId is kept current by refresh()
          signals.onResponse({ text: answer });
        } catch (e) {
          signals.onResponse({ error: errMsg(e) });
        }
      },
    };
  }
  try {
    dc.clearMessages(true);
  } catch {
    /* nothing to clear */
  }
  for (const turn of v.chat_json ?? []) {
    dc.addMessage({ role: turn.role === "assistant" ? "ai" : "user", text: turn.content });
  }
}

function showVideo(v: Video): void {
  current = v;
  const vd = document.getElementById("verdict") as HTMLElement;
  vd.hidden = !v.verdict;
  if (v.verdict) {
    vd.textContent = verdictLabel(v.verdict, lang);
    vd.dataset.v = v.verdict;
  }
  renderMarkdown(out, stripVerdictLine(v.filter_md ?? ""), seek);
  setupChat(v);
  btn("tab-download").disabled = false;
}

// Disable the button and mark it busy while its async work runs, so a slow
// transcript fetch + LLM call reads as "in progress" instead of "nothing happened".
async function busy(id: string, fn: () => Promise<void>): Promise<void> {
  const b = btn(id);
  if (b.disabled) return;
  b.disabled = true;
  b.classList.add("loading");
  showErr("");
  try {
    await fn();
  } catch (e) {
    showErr(errMsg(e));
  } finally {
    b.disabled = false;
    b.classList.remove("loading");
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
btn("tab-download").onclick = async () => {
  if (videoId) current = (await getVideo(videoId)) ?? current; // pick up the latest chat turns
  btn("dl-chat").disabled = !current?.chat_json?.length;
  showView("download");
};
btn("dl-transcript").onclick = () =>
  current && saveFile(`${fileBase()} — transcript.txt`, formatTranscript(current.transcript_json));
btn("dl-extract").onclick = () => current && saveFile(`${fileBase()} — extract.md`, current.filter_md ?? "");
btn("dl-chat").onclick = () => current && saveFile(`${fileBase()} — chat.md`, chatToMd(current));
btn("lib").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });

const loadingEl = document.getElementById("loading")!;
const verdictEl = document.getElementById("verdict") as HTMLElement;

function clearVideoUI(): void {
  current = null;
  out.replaceChildren();
  verdictEl.hidden = true;
  btn("tab-chat").disabled = true;
  btn("tab-download").disabled = true;
  try {
    dc.clearMessages(true);
  } catch {
    /* deep-chat not set up yet */
  }
}

// Re-read the active tab's video and re-render. Used at startup and whenever the
// tab changes or YouTube navigates to another video — no page reload.
async function refresh(): Promise<void> {
  loadingEl.hidden = false;
  try {
    const p = await send({ type: "unwatch:meta" });
    console.log("[unwatch] refresh: meta =", p);
    setMeta(p);
    const v = await getVideo(p.videoId);
    if (v) showVideo(v);
    else clearVideoUI();
    showView("extract");
  } catch {
    videoId = "";
    clearVideoUI();
    metaEl.textContent = t.noVideo;
  } finally {
    loadingEl.hidden = true;
  }
}

// The panel is global (one per window); debounce the triggers so a burst of
// events (tab switch + SPA nav firing together) is one refresh.
let ready = false;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRefresh(): void {
  if (!ready) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refresh(), 250);
}
chrome.tabs.onActivated.addListener(() => {
  console.log("[unwatch] tab activated");
  scheduleRefresh();
});
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info.url && tab.active) {
    console.log("[unwatch] tab url changed", info.url);
    scheduleRefresh();
  }
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "unwatch:navigated") {
    console.log("[unwatch] got unwatch:navigated");
    scheduleRefresh();
  }
});

(async () => {
  lang = (await settings()).lang;
  t = UI[lang];
  btn("run").textContent = t.filter;
  btn("tab-extract").textContent = t.extract;
  btn("tab-chat").textContent = t.chat;
  btn("tab-download").textContent = t.downloadTab;
  btn("dl-transcript").textContent = t.transcript;
  btn("dl-extract").textContent = t.extract;
  btn("dl-chat").textContent = t.chat;
  btn("lib").textContent = t.library;
  await refresh();
  ready = true;
})();
