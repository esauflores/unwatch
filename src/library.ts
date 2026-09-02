import { bindSettingsForm, errMsg, renderMarkdown, settings, UI } from "./shared";
import { verdictLabel } from "./schema";
import { listVideos } from "./videos";

const form = document.getElementById("settings") as HTMLFormElement;
bindSettingsForm(form);

// Fallback only — used when there's no key yet or the /models call fails.
const MODEL_HINTS: Record<string, string[]> = {
  anthropic: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-sonnet-5", "claude-opus-4-8"],
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
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
      return (j.data ?? []).map((m: { id: string }) => m.id);
    }
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const j = await r.json();
      return (j.data ?? [])
        .map((m: { id: string }) => m.id)
        .filter((id: string) => /^(gpt-|o\d)/.test(id))
        .sort();
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
  modelInput.placeholder = (MODEL_HINTS[provider] ?? [])[0] || "default for provider";
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
  const t = UI[lang];
  try {
    const videos = await listVideos();
    if (!videos.length) {
      list.textContent = "Nothing saved yet. Filter a video from the side panel.";
      return;
    }
    for (const v of videos) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<div class="item-head"><strong></strong><span class="verdict"></span></div><div class="md"></div>`;
      el.querySelector("strong")!.textContent = v.title;
      const tag = el.querySelector(".verdict") as HTMLElement;
      tag.textContent = verdictLabel(v.verdict, lang);
      if (v.verdict) tag.dataset.v = v.verdict;
      const raw = [v.filter_md, v.conclusiones_md && `\n\n## ${t.notes}\n${v.conclusiones_md}`]
        .filter(Boolean)
        .join("");
      renderMarkdown(el.querySelector(".md")!, raw);
      const copy = document.createElement("button");
      copy.textContent = "Copy";
      copy.onclick = () => navigator.clipboard.writeText(raw);
      el.append(copy);
      list.append(el);
    }
  } catch (e) {
    err.textContent = errMsg(e);
  }
})();
