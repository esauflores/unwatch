import { errMsg, renderMarkdown, settings, UI } from "./shared";
import { chatVideo, conclusionesVideo, getVideo } from "./videos";
import type { Video } from "./schema";

const videoId = new URLSearchParams(location.search).get("v") ?? "";

const err = document.getElementById("err")!;
const out = document.getElementById("out")!;
const chatEl = document.getElementById("chat")!;
const q = document.getElementById("q") as HTMLTextAreaElement;
const metaEl = document.getElementById("meta")!;
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

const renderMd = (el: HTMLElement, text: string): void => renderMarkdown(el, text, seek);

function renderHistory(v: Video): void {
  const parts: string[] = [];
  for (const turn of v.chat_json ?? []) {
    parts.push(`${turn.role === "user" ? "Q" : "A"}: ${turn.content}`);
  }
  if (v.conclusiones_md) parts.push(`## ${t.notes}\n${v.conclusiones_md}`);
  chatEl.dataset.raw = parts.join("\n\n");
  renderMd(chatEl, chatEl.dataset.raw);
}

function appendChat(block: string): void {
  const raw = chatEl.dataset.raw ? `${chatEl.dataset.raw}\n\n${block}` : block;
  chatEl.dataset.raw = raw;
  renderMd(chatEl, raw);
}

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

btn("ask").onclick = () => {
  const message = q.value.trim();
  if (!message) return;
  void busy("ask", async () => {
    const { answer } = await chatVideo(videoId, message);
    q.value = "";
    appendChat(`Q: ${message}\nA: ${answer}`);
  });
};

btn("conc").onclick = () =>
  void busy("conc", async () => {
    const { conclusiones_md } = await conclusionesVideo(videoId);
    await navigator.clipboard.writeText(conclusiones_md);
    appendChat(`## ${t.notes} (${t.copied})\n${conclusiones_md}`);
  });

btn("lib").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });

(async () => {
  t = UI[(await settings()).lang];
  btn("ask").textContent = t.ask;
  btn("conc").textContent = t.notes;
  btn("lib").textContent = t.library;
  q.placeholder = t.askPlaceholder;

  const v = videoId ? await getVideo(videoId) : undefined;
  if (!v) {
    metaEl.textContent = "No extracted video — Extract one from the side panel first.";
    q.disabled = true;
    btn("ask").disabled = true;
    btn("conc").disabled = true;
    return;
  }
  document.title = `unwatch — ${v.title}`;
  metaEl.textContent = `${v.title}${v.verdict ? ` · ${v.verdict}` : ""}`;
  renderMd(out, v.filter_md ?? "");
  renderHistory(v);
})();
