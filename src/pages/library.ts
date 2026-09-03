import { UI } from "@/lib/i18n";
import { renderMarkdown } from "@/lib/markdown";
import { formatTranscript, stripVerdictLine, verdictLabel } from "@/lib/schema";
import {
  bindSettingsForm,
  DEFAULT_CHAT_PROMPT,
  DEFAULT_FILTER_PROMPT,
  normalizeBaseUrl,
  originPattern,
  settings,
} from "@/lib/settings";
import { errMsg, modelIds } from "@/lib/util";
import { deleteVideo, getVideo, listVideos } from "@/lib/videos";

let t = UI.en;

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

// `note` is a normal state worth explaining (no key yet, host not granted);
// `error` is a failure and is shown in red.
type ModelLookup = { ids: string[]; error?: string; note?: string };

// A non-2xx here is the single most useful thing to surface — a custom endpoint
// that 404s on /models is the likeliest setup mistake — so this throws instead of
// quietly returning an empty list.
async function getJson(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} — ${(await r.text().catch(() => "")).trim().slice(0, 140)}`);
  return r.json();
}

// Live list straight from the provider — the only source that's actually current
// and scoped to your key.
async function fetchModelIds(provider: string, key: string, baseUrl: string): Promise<ModelLookup> {
  try {
    if (provider === "custom") {
      const parsed = normalizeBaseUrl(baseUrl);
      if ("error" in parsed) return { ids: [], note: t.baseUrlErrors[parsed.error] };
      // Without the host grant the fetch dies as an opaque "Failed to fetch" —
      // check first so the answer is "hit Save", not a network error.
      let granted = false;
      try {
        granted = await chrome.permissions.contains({ origins: [originPattern(parsed.url)] });
      } catch {
        granted = false;
      }
      if (!granted) return { ids: [], note: t.modelsNeedSave };
      const j = await getJson(`${parsed.url}/models`, key ? { Authorization: `Bearer ${key}` } : {});
      // Ids on an arbitrary server carry no useful order — alphabetical it is.
      return { ids: modelIds(j.data ?? j.models ?? j).sort((a, b) => a.localeCompare(b)) };
    }
    if (provider === "anthropic") {
      const j = await getJson("https://api.anthropic.com/v1/models?limit=1000", {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      });
      const ids = (j.data ?? [])
        .sort((a: { created_at: string }, b: { created_at: string }) =>
          String(b.created_at).localeCompare(String(a.created_at)),
        )
        .map((m: { id: string }) => m.id);
      return { ids };
    }
    if (provider === "openai") {
      const j = await getJson("https://api.openai.com/v1/models", { Authorization: `Bearer ${key}` });
      const ids = (j.data ?? [])
        .filter((m: { id: string }) => /^(gpt-|o\d)/.test(m.id))
        .sort((a: { created: number }, b: { created: number }) => (b.created ?? 0) - (a.created ?? 0))
        .map((m: { id: string }) => m.id);
      return { ids };
    }
    if (provider === "gemini") {
      const j = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1000`, {});
      const ids = (j.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((m: { name: string }) => m.name.replace(/^models\//, ""));
      return { ids };
    }
  } catch (e) {
    return { ids: [], error: errMsg(e) };
  }
  return { ids: [] };
}

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

const modelStatus = document.getElementById("model-status")!;
function setModelStatus(msg: string, bad: boolean): void {
  modelStatus.textContent = msg;
  modelStatus.className = bad ? "note bad" : "note";
}

function applyModels(ids: string[], live: boolean, found: ModelLookup): void {
  datalist.replaceChildren(...ids.map((id) => Object.assign(document.createElement("option"), { value: id })));
  if (found.error) setModelStatus(t.modelsFailed(found.error), true);
  else if (found.note) setModelStatus(found.note, false);
  else if (ids.length) setModelStatus(live ? t.modelsFound(ids.length) : t.modelsBuiltin(ids.length), false);
  else setModelStatus(t.modelsNone, false);
}

// A slow lookup must never overwrite the answer to a newer one.
let lookup = 0;

async function refreshModelHints(): Promise<void> {
  const seq = ++lookup;
  const provider = providerSelect.value;
  const key = keyInput.value.trim();
  const base = baseInput.value.trim();
  modelInput.placeholder = DEFAULT_MODEL[provider] || (provider === "custom" ? t.modelRequired : t.modelPlaceholder);
  // An unauthenticated local server still lists its models; the hosted ones can't.
  if (!key && provider !== "custom") {
    applyModels(MODEL_HINTS[provider] ?? [], false, { ids: [] });
    return;
  }
  setModelStatus(t.modelsLoading, false);
  const found = await fetchModelIds(provider, key, base);
  if (seq !== lookup) return; // a newer lookup already answered
  applyModels(found.ids.length ? found.ids : (MODEL_HINTS[provider] ?? []), found.ids.length > 0, found);
  // A custom endpoint has no default, so leaving the box empty only fails later,
  // at Extract — seed it with the first id the server listed. Never overwrite one
  // that's already filled, and never for the hosted three, where empty is the
  // documented way to say "use the provider default".
  if (provider === "custom" && !modelInput.value && found.ids.length) modelInput.value = found.ids[0];
}

// Typing a key or a URL should look them up without waiting for a blur — but not
// once per keystroke.
function debounce(fn: () => void, ms: number): () => void {
  let id = 0;
  return () => {
    clearTimeout(id);
    id = setTimeout(fn, ms);
  };
}
const lookupSoon = debounce(() => void refreshModelHints(), 800);

providerSelect.addEventListener("change", () => {
  syncCustomRow();
  // A model id belongs to one provider — carrying "claude-sonnet-5" over to openai
  // only fails at Extract. Clearing it also lets the lookup below seed a live id.
  modelInput.value = "";
  void refreshModelHints();
});
keyInput.addEventListener("input", lookupSoon);
baseInput.addEventListener("input", lookupSoon);
document.getElementById("refresh-models")!.addEventListener("click", () => void refreshModelHints());

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
    ["refresh-models", t.refreshModels],
  ] as const) {
    setText(id, s);
  }
  document.getElementById("reset-prompts")!.addEventListener("click", () => {
    const l = (form.elements.namedItem("lang") as HTMLSelectElement).value === "es" ? "es" : "en";
    (form.elements.namedItem("filterPrompt") as HTMLTextAreaElement).value = DEFAULT_FILTER_PROMPT[l];
    (form.elements.namedItem("chatPrompt") as HTMLTextAreaElement).value = DEFAULT_CHAT_PROMPT[l];
  });
  providerSelect.value = provider;
  modelInput.value = model; // before the lookup runs, so it can tell "unset" from "saved"
  keyInput.value = llmKey;
  baseInput.value = baseUrl;
  baseInput.placeholder = t.baseUrlPlaceholder;
  syncCustomRow();
  void refreshModelHints();
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
