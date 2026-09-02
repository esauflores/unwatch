import { DeepChat } from "deep-chat";
import { errMsg, renderMarkdown, settings, UI } from "./shared";
import { chatVideo, conclusionesVideo, getVideo } from "./videos";

const videoId = new URLSearchParams(location.search).get("v") ?? "";

const err = document.getElementById("err")!;
const out = document.getElementById("out")!;
const metaEl = document.getElementById("meta")!;
const dc = document.getElementById("dc") as DeepChat;
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;

let t = UI.en;

function showErr(e: string): void {
  err.textContent = e || "";
}

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

btn("conc").onclick = () =>
  void busy("conc", async () => {
    const { conclusiones_md } = await conclusionesVideo(videoId);
    await navigator.clipboard.writeText(conclusiones_md);
    dc.addMessage({ role: "ai", text: `**${t.notes} (${t.copied})**\n\n${conclusiones_md}` });
  });

btn("lib").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });

(async () => {
  t = UI[(await settings()).lang];
  btn("conc").textContent = t.notes;
  btn("lib").textContent = t.library;

  const v = videoId ? await getVideo(videoId) : undefined;
  if (!v) {
    metaEl.textContent = "No extracted video — Extract one from the side panel first.";
    dc.style.display = "none";
    btn("conc").disabled = true;
    return;
  }
  document.title = `unwatch — ${v.title}`;
  metaEl.textContent = `${v.title}${v.verdict ? ` · ${v.verdict}` : ""}`;
  renderMarkdown(out, v.filter_md ?? "", seek);

  dc.style.cssText = `width:100%;height:70vh;border:1px solid ${C.line};border-radius:10px;background-color:${C.panel}`;
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
    handler: async (body: { messages?: { text?: string }[] }, signals: { onResponse: (r: { text?: string; error?: string }) => void }) => {
      const msg = body.messages?.[body.messages.length - 1]?.text ?? "";
      try {
        const { answer } = await chatVideo(videoId, msg);
        signals.onResponse({ text: answer });
      } catch (e) {
        signals.onResponse({ error: errMsg(e) });
      }
    },
  };
})();
