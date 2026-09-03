import { UI } from "@/lib/i18n";
import { defaults } from "@/lib/llm";
import { renderMarkdown } from "@/lib/markdown";
import { formatTranscript, stripVerdictLine, verdictLabel } from "@/lib/schema";
import { bindSettingsForm, DEFAULT_CHAT_PROMPT, DEFAULT_FILTER_PROMPT, settings } from "@/lib/settings";
import { errMsg } from "@/lib/util";
import { deleteVideo, getVideo, listVideos } from "@/lib/videos";

let t = UI.en;

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

const list = document.getElementById("list")!;
const err = document.getElementById("err")!;

const setText = (id: string, s: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = s;
};

(async () => {
  const { lang, provider, model, llmKey, baseUrl } = await settings();
  t = UI[lang];
  for (const [id, s] of [
    ["h-settings", t.settingsHeading],
    ["h-saved", t.savedHeading],
    ["l-lang", t.languageLabel],
    ["l-provider", t.providerLabel],
    ["l-baseurl", t.baseUrlLabel],
    ["n-baseurl", t.baseUrlNote],
    ["l-model", t.modelLabel],
    ["l-key", t.keyLabel],
    ["l-fprompt", t.filterPromptLabel],
    ["l-cprompt", t.chatPromptLabel],
    ["save-btn", t.save],
    ["reset-prompts", t.resetPrompts],
  ] as const) {
    setText(id, s);
  }
  document.getElementById("reset-prompts")!.addEventListener("click", () => {
    const l = (form.elements.namedItem("lang") as HTMLSelectElement).value === "es" ? "es" : "en";
    (form.elements.namedItem("filterPrompt") as HTMLTextAreaElement).value = DEFAULT_FILTER_PROMPT[l];
    (form.elements.namedItem("chatPrompt") as HTMLTextAreaElement).value = DEFAULT_CHAT_PROMPT[l];
  });
  providerSelect.value = provider;
  modelInput.value = model;
  keyInput.value = llmKey;
  baseInput.value = baseUrl;
  baseInput.placeholder = t.baseUrlPlaceholder;
  syncCustomRow();
  syncModelHints();
  const empty = t.nothingSaved;
  try {
    const videos = await listVideos();
    if (!videos.length) {
      list.textContent = empty;
      return;
    }
    for (const v of videos) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML =
        `<div class="item-head"><strong></strong><span class="verdict"></span></div>` +
        `<details><summary>${t.extract}</summary><div class="md"></div></details>` +
        `<div class="row"><button class="copy">${t.copy}</button>` +
        `<button class="dl">${t.transcript}</button><button class="del">${t.del}</button></div>`;
      el.querySelector("strong")!.textContent = v.title;
      const tag = el.querySelector(".verdict") as HTMLElement;
      tag.textContent = verdictLabel(v.verdict, lang);
      if (v.verdict) tag.dataset.v = v.verdict;
      const raw = v.filter_md ?? "";
      renderMarkdown(el.querySelector(".md")!, stripVerdictLine(raw));
      el.querySelector(".copy")!.addEventListener("click", () => navigator.clipboard.writeText(raw));
      el.querySelector(".dl")!.addEventListener("click", async () => {
        const full = await getVideo(v.id);
        if (!full?.transcript_json?.length) return;
        const name =
          (v.title
            .replace(/[^\p{L}\p{N} _-]/gu, "")
            .trim()
            .slice(0, 80) || v.id) + ".txt";
        const url = URL.createObjectURL(new Blob([formatTranscript(full.transcript_json)], { type: "text/plain" }));
        Object.assign(document.createElement("a"), { href: url, download: name }).click();
        URL.revokeObjectURL(url);
      });
      el.querySelector(".del")!.addEventListener("click", async () => {
        if (!confirm(t.deletePrompt(v.title))) return;
        await deleteVideo(v.id);
        el.remove();
        if (!list.children.length) list.textContent = empty;
      });
      list.append(el);
    }
  } catch (e) {
    err.textContent = errMsg(e);
  }
})();
