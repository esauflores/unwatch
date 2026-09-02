import "deep-chat"; // side-effect: registers the <deep-chat> element
import type { DeepChat } from "deep-chat";
import { renderMarkdown, settings, UI } from "./shared";
import { verdictLabel } from "./schema";
import { chatVideo, getVideo } from "./videos";

const videoId = new URLSearchParams(location.search).get("v") ?? "";

const out = document.getElementById("out")!;
const metaEl = document.getElementById("meta")!;
const dc = document.getElementById("dc") as DeepChat;
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;

// Seek the YouTube tab that still has this video open, if any.
async function seek(sec: number): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/watch*" });
  const tab = tabs.find((tb) => tb.url?.includes(`v=${videoId}`)) ?? tabs[0];
  if (tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: "unwatch:seek", t: sec }).catch(() => {});
    chrome.tabs.update(tab.id, { active: true });
  }
}

const C = {
  panel: "#16181c",
  panel2: "#1c1f24",
  fg: "#e9eaec",
  muted: "#969ba3",
  line: "#2a2e35",
  accent: "#8cf",
  accentInk: "#06121a",
};

btn("lib").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });

(async () => {
  const { lang } = await settings();
  const t = UI[lang];
  btn("lib").textContent = t.library;
  document.getElementById("ctx-summary")!.textContent = t.extract;

  const v = videoId ? await getVideo(videoId) : undefined;
  if (!v) {
    metaEl.textContent = t.noVideoChat;
    dc.style.display = "none";
    return;
  }
  document.title = `unwatch — ${v.title}`;
  metaEl.textContent = `${v.title}${v.verdict ? ` · ${verdictLabel(v.verdict, lang)}` : ""}`;
  renderMarkdown(out, v.filter_md ?? "", seek);

  dc.style.cssText = `width:100%;border:1px solid ${C.line};border-radius:10px;background-color:${C.panel}`;
  const fit = () => {
    dc.style.height = `${Math.max(320, window.innerHeight - dc.getBoundingClientRect().top - 16)}px`;
  };
  fit();
  window.addEventListener("resize", fit);
  document.getElementById("context")!.addEventListener("toggle", fit);
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
        signals.onResponse({ error: e instanceof Error ? e.message : String(e) });
      }
    },
  };
})();
