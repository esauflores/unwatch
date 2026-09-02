import { bindSettingsForm, errMsg, renderMarkdown, settings } from "./shared";
import { verdictLabel } from "./schema";
import { deleteVideo, listVideos } from "./videos";

const form = document.getElementById("settings") as HTMLFormElement;
bindSettingsForm(form);

// Fallback only — used when there's no key yet or the /models call fails.
// Snapshot from models.dev (2026-09), newest first; the live /v1/models call supersedes it.
const MODEL_HINTS: Record<string, string[]> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
  openai: ["gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4.1-mini", "gpt-4o-mini"],
  gemini: ["gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
};

// Blank-field default per provider — keep in sync with llm.ts `defaults`.
const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5-mini",
  gemini: "gemini-3.5-flash",
};

// Live list straight from the provider — the only source that's actually current
// and scoped to your key. Returns [] on any failure so the caller falls back.
async function fetchModelIds(provider: string, key: string): Promise<string[]> {
  try {
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/models?limit=1000", {
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });
      const j = await r.json();
      return (j.data ?? [])
        .sort((a: { created_at: string }, b: { created_at: string }) =>
          String(b.created_at).localeCompare(String(a.created_at)),
        )
        .map((m: { id: string }) => m.id);
    }
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const j = await r.json();
      return (j.data ?? [])
        .filter((m: { id: string }) => /^(gpt-|o\d)/.test(m.id))
        .sort((a: { created: number }, b: { created: number }) => (b.created ?? 0) - (a.created ?? 0))
        .map((m: { id: string }) => m.id);
    }
    if (provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1000`);
      const j = await r.json();
      return (j.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((m: { name: string }) => m.name.replace(/^models\//, ""));
    }
  } catch {
    /* fall through to fallback */
  }
  return [];
}

const datalist = document.getElementById("model-suggestions") as HTMLDataListElement;
const modelInput = form.elements.namedItem("model") as HTMLInputElement;
const providerSelect = form.elements.namedItem("provider") as HTMLSelectElement;
const keyInput = form.elements.namedItem("llmKey") as HTMLInputElement;

async function refreshModelHints(): Promise<void> {
  const provider = providerSelect.value;
  const key = keyInput.value.trim();
  const live = key ? await fetchModelIds(provider, key) : [];
  const ids = live.length ? live : (MODEL_HINTS[provider] ?? []);
  if (providerSelect.value !== provider) return; // provider changed while awaiting
  datalist.replaceChildren(...ids.map((id) => Object.assign(document.createElement("option"), { value: id })));
  modelInput.placeholder = DEFAULT_MODEL[provider] || "default for provider";
}
providerSelect.addEventListener("change", refreshModelHints);
keyInput.addEventListener("change", refreshModelHints);

const list = document.getElementById("list")!;
const err = document.getElementById("err")!;

(async () => {
  const { lang, provider, llmKey } = await settings();
  providerSelect.value = provider;
  keyInput.value = llmKey;
  void refreshModelHints();
  const empty = "Nothing saved yet. Extract a video from the side panel.";
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
        `<details><summary>Extract</summary><div class="md"></div></details>` +
        `<div class="row"><button class="copy">Copy</button><button class="del">Delete</button></div>`;
      el.querySelector("strong")!.textContent = v.title;
      const tag = el.querySelector(".verdict") as HTMLElement;
      tag.textContent = verdictLabel(v.verdict, lang);
      if (v.verdict) tag.dataset.v = v.verdict;
      const raw = v.filter_md ?? "";
      renderMarkdown(el.querySelector(".md")!, raw);
      el.querySelector(".copy")!.addEventListener("click", () => navigator.clipboard.writeText(raw));
      el.querySelector(".del")!.addEventListener("click", async () => {
        if (!confirm(`Delete "${v.title}"?`)) return;
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
