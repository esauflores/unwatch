import "deep-chat"; // side-effect: registers the <deep-chat> element
import type { DeepChat } from "deep-chat";
import { debounce } from "lodash-es";

import { classify, UnwatchError } from "@/lib/errors";
import { type Lang, UI } from "@/lib/i18n";
import { defaults } from "@/lib/llm";
import { renderMarkdown } from "@/lib/markdown";
import { formatTranscript, parseVerdict, stripVerdictLine, type Verdict, verdictLabel, type Video } from "@/lib/schema";
import { bindSettingsForm, DEFAULT_CHAT_PROMPT, DEFAULT_FILTER_PROMPT, settings } from "@/lib/settings";
import { initTabs } from "@/lib/tabs";
import { errMsg } from "@/lib/util";
import { chatVideo, deleteVideo, filterVideo, getVideo, listVideos } from "@/lib/videos";

type Meta = { videoId: string; title?: string; duration?: number };

const err = document.getElementById("err")!;
const out = document.getElementById("out")!;
const metaEl = document.getElementById("meta")!;
const listEl = document.getElementById("list")!;
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

// Translate a known error to the current language; unknown ones keep their raw
// message. `detail` (when present) goes to the console only.
function describeError(e: unknown): string {
  const code = classify(e);
  if (!code) return errMsg(e);
  if (e instanceof UnwatchError && e.detail) console.warn("[unwatch]", e.code, "—", e.detail);
  return t.errors[code];
}

function showErr(e: unknown): void {
  err.textContent = e ? describeError(e) : "";
}

async function tabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function send(msg: unknown): Promise<any> {
  const id = await tabId();
  if (!id) throw new Error("no active tab");
  const res = await chrome.tabs.sendMessage(id, msg);
  if (res?.error) throw res.code ? new UnwatchError(res.code, res.error) : new Error(res.error);
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

function saveFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}
const sanitize = (s: string) =>
  s
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .slice(0, 80);
const fileBase = () => sanitize(current?.title ?? "Unwatch") || "Unwatch";
const chatToMd = (v: Video) =>
  (v.chat_json ?? []).map((turn) => `${turn.role === "user" ? "Q" : "A"}: ${turn.content}`).join("\n\n");

// The Library download buttons act on the video open in the panel — dead until it's extracted.
function syncDlRow(): void {
  btn("dl-transcript").disabled = !current;
  btn("dl-extract").disabled = !current;
  btn("dl-chat").disabled = !current?.chat_json?.length;
}

let currentView = "extract";
const showView = initTabs(document, {
  onShow: (view) => {
    currentView = view;
    if (view === "chat") fitChat();
    if (view === "library") void refreshLibrary();
  },
});

window.addEventListener("resize", () => {
  if (currentView === "chat") fitChat();
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
      stream: true,
      handler: (
        body: { messages?: { text?: string }[] },
        signals: {
          onResponse: (r: { text?: string; error?: string }) => void;
          onOpen: () => void;
          onClose: () => void;
          stopClicked: { listener: () => void };
        },
      ) => {
        const msg = body.messages?.[body.messages.length - 1]?.text ?? "";
        const ac = new AbortController();
        signals.stopClicked.listener = () => ac.abort(); // the chat's stop button
        signals.onOpen();
        void (async () => {
          try {
            // videoId is kept current by refresh(); chunks append to the bubble.
            await chatVideo(videoId, msg, (chunk) => signals.onResponse({ text: chunk }), ac.signal);
          } catch (e) {
            if (!ac.signal.aborted) signals.onResponse({ error: describeError(e) });
          } finally {
            signals.onClose();
          }
        })();
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

// Idempotent — safe to call on every stream chunk as the verdict firms up.
function setVerdict(v: Verdict | null): void {
  verdictEl.hidden = !v;
  if (v) {
    verdictEl.textContent = verdictLabel(v, lang);
    verdictEl.dataset.v = v;
  }
}

function showVideo(v: Video): void {
  current = v;
  setVerdict(v.verdict);
  renderMarkdown(out, stripVerdictLine(v.filter_md ?? ""), seek);
  setupChat(v);
  syncDlRow();
}

// Disable the button and mark it busy while its async work runs, so a slow
// transcript fetch + LLM call reads as "in progress" instead of "nothing happened".
async function busy(id: string, fn: () => Promise<void>): Promise<void> {
  const b = btn(id);
  if (b.disabled) return;
  b.disabled = true;
  b.classList.add("busy");
  showErr("");
  try {
    await fn();
  } catch (e) {
    showErr(e);
  } finally {
    b.disabled = false;
    b.classList.remove("busy");
  }
}

btn("run").onclick = () =>
  void busy("run", async () => {
    const p = await send({ type: "unwatch:page" });
    setMeta(p);
    clearVideoUI(); // fresh panel to stream into
    let acc = "";
    try {
      const v = await filterVideo({ videoId: p.videoId, title: p.title, cues: p.cues }, (chunk) => {
        acc += chunk;
        renderMarkdown(out, stripVerdictLine(acc), seek);
        setVerdict(parseVerdict(acc));
      });
      showVideo(v); // final clean render + wire chat + enable downloads
    } catch (e) {
      clearVideoUI(); // drop the partial render
      throw e;
    }
  });

// ---- Library tab: downloads for the current video + the saved-video list ----
btn("dl-transcript").onclick = () =>
  current && saveFile(`${fileBase()} — transcript.txt`, formatTranscript(current.transcript_json));
btn("dl-extract").onclick = () => current && saveFile(`${fileBase()} — extract.md`, current.filter_md ?? "");
btn("dl-chat").onclick = () => current && saveFile(`${fileBase()} — chat.md`, chatToMd(current));

async function refreshLibrary(): Promise<void> {
  if (videoId) current = (await getVideo(videoId)) ?? current; // pick up the latest chat turns
  syncDlRow();

  try {
    const videos = await listVideos();
    if (!videos.length) {
      listEl.replaceChildren(document.createTextNode(t.nothingSaved));
      return;
    }
    listEl.replaceChildren();
    for (const v of videos) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML =
        `<div class="item-head"><strong></strong><span class="verdict"></span></div>` +
        `<details><summary>${t.extract}</summary><div class="md"></div></details>` +
        `<div class="row">` +
        `<button class="dl-t">${t.transcript}</button>` +
        `<button class="dl-e">${t.extract}</button>` +
        `<button class="dl-c">${t.chat}</button>` +
        `<button class="del">${t.del}</button></div>`;
      el.querySelector("strong")!.textContent = v.title;
      const tag = el.querySelector(".verdict") as HTMLElement;
      tag.textContent = verdictLabel(v.verdict, lang);
      if (v.verdict) tag.dataset.v = v.verdict;
      const raw = v.filter_md ?? "";
      renderMarkdown(el.querySelector(".md")!, stripVerdictLine(raw));
      const base = sanitize(v.title) || v.id;
      el.querySelector(".dl-t")!.addEventListener("click", async () => {
        const full = await getVideo(v.id);
        if (full?.transcript_json?.length) saveFile(`${base} — transcript.txt`, formatTranscript(full.transcript_json));
      });
      el.querySelector(".dl-e")!.addEventListener("click", () => saveFile(`${base} — extract.md`, raw));
      el.querySelector(".dl-c")!.addEventListener("click", async () => {
        const full = await getVideo(v.id);
        if (full?.chat_json?.length) saveFile(`${base} — chat.md`, chatToMd(full));
      });
      el.querySelector(".del")!.addEventListener("click", async () => {
        if (!confirm(t.deletePrompt(v.title))) return;
        await deleteVideo(v.id);
        el.remove();
        if (!listEl.children.length) listEl.replaceChildren(document.createTextNode(t.nothingSaved));
      });
      listEl.append(el);
    }
  } catch (e) {
    showErr(e);
  }
}

// ---- Settings tab ----
const form = document.getElementById("settings") as HTMLFormElement;
bindSettingsForm(form);

// The Model box is free text; this is a convenience list of common ids, from
// models.dev (2026-09). A `custom` endpoint gets none — type the id it serves.
const MODEL_HINTS: Record<string, string[]> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
  openai: ["gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4.1-mini", "gpt-4o-mini"],
  gemini: ["gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
};

const datalist = document.getElementById("model-suggestions") as HTMLDataListElement;
const modelInput = form.elements.namedItem("model") as HTMLInputElement;
const providerSelect = form.elements.namedItem("provider") as HTMLSelectElement;
const keyInput = form.elements.namedItem("llmKey") as HTMLInputElement;
const baseInput = form.elements.namedItem("baseUrl") as HTMLInputElement;
const baseRow = document.getElementById("row-baseurl") as HTMLElement;

// Base URL is meaningless for the hosted three — only show it where it applies.
function syncCustomRow(): void {
  baseRow.hidden = providerSelect.value !== "custom";
}

// Fill the datalist from the hardcoded hints for the current provider.
function syncModelHints(): void {
  const p = providerSelect.value;
  const ids = MODEL_HINTS[p] ?? [];
  datalist.replaceChildren(...ids.map((id) => Object.assign(document.createElement("option"), { value: id })));
  modelInput.placeholder =
    defaults[p as keyof typeof defaults] || (p === "custom" ? t.modelRequired : t.modelPlaceholder);
}

providerSelect.addEventListener("change", () => {
  syncCustomRow();
  // A model id belongs to one provider — carrying "claude-sonnet-5" over to openai
  // only fails at Extract.
  modelInput.value = "";
  syncModelHints();
});

document.getElementById("reset-prompts")!.addEventListener("click", () => {
  const l = (form.elements.namedItem("lang") as HTMLSelectElement).value === "es" ? "es" : "en";
  (form.elements.namedItem("filterPrompt") as HTMLTextAreaElement).value = DEFAULT_FILTER_PROMPT[l];
  (form.elements.namedItem("chatPrompt") as HTMLTextAreaElement).value = DEFAULT_CHAT_PROMPT[l];
});

const loadingEl = document.getElementById("loading")!;
const verdictEl = document.getElementById("verdict") as HTMLElement;

function clearVideoUI(): void {
  current = null;
  out.replaceChildren();
  verdictEl.hidden = true;
  btn("tab-chat").disabled = true;
  syncDlRow();
  if (currentView === "chat") showView("extract"); // Chat has no video to show now
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
    setMeta(p);
    const v = await getVideo(p.videoId);
    if (v) showVideo(v);
    else clearVideoUI();
    // Snap to Extract for the new video — but don't yank the user off Library/Settings.
    if (currentView === "extract" || currentView === "chat") showView("extract");
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
const scheduleRefresh = debounce(() => {
  if (ready) void refresh();
}, 250);
chrome.tabs.onActivated.addListener(scheduleRefresh);
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (info.url && tab.active) scheduleRefresh();
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "unwatch:navigated") scheduleRefresh();
});

(async () => {
  const s = await settings();
  lang = s.lang;
  t = UI[lang];

  btn("run").textContent = t.filter;
  btn("tab-extract").textContent = t.extract;
  btn("tab-chat").textContent = t.chat;
  btn("tab-library").textContent = t.library;
  btn("tab-settings").textContent = t.settingsHeading;
  btn("dl-transcript").textContent = t.transcript;
  btn("dl-extract").textContent = t.extract;
  btn("dl-chat").textContent = t.chat;
  for (const [id, str] of [
    ["h-saved", t.savedHeading],
    ["l-provider", t.providerLabel],
    ["l-baseurl", t.baseUrlLabel],
    ["n-baseurl", t.baseUrlNote],
    ["l-model", t.modelLabel],
    ["l-key", t.keyLabel],
    ["l-fprompt", t.filterPromptLabel],
    ["l-cprompt", t.chatPromptLabel],
    ["l-lang", t.languageLabel],
    ["save-btn", t.save],
    ["reset-prompts", t.resetPrompts],
  ] as const) {
    const el = document.getElementById(id);
    if (el) el.textContent = str;
  }

  providerSelect.value = s.provider;
  modelInput.value = s.model;
  keyInput.value = s.llmKey;
  baseInput.value = s.baseUrl;
  baseInput.placeholder = t.baseUrlPlaceholder;
  syncCustomRow();
  syncModelHints();

  await refresh();
  ready = true;
})();
