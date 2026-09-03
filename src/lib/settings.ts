import { trimEnd } from "lodash-es";

import { type Lang, UI } from "@/lib/i18n";

// Editable system prompts, one default per language. {verdict}/{overlap} are
// filled per language and {title} per video; respondIn(lang) + the transcript
// blocks are appended by prompt.ts. Stored as "" = follow the built-in default.
export const DEFAULT_FILTER_PROMPT: Record<Lang, string> = {
  en:
    "You write a skip/keep card for a YouTube video from its captions. Output markdown only. " +
    "First line must be exactly one of: {verdict}. Then 8–12 claim bullets (specific tactics, numbers, " +
    "names — not 'the host discusses AI'). If past claims are provided, tag each bullet {overlap} and name " +
    "the overlapping video. End every bullet with a (t=MM:SS) timestamp taken from the transcript, marking " +
    "where that point is made. If there are no past claims, skip overlap tags and use the first verdict " +
    "value. Do not classify against the open internet. Only vs the past claims.",
  es:
    "Escribes una tarjeta de saltar/ver para un video de YouTube a partir de sus subtítulos. Devuelve solo " +
    "markdown. La primera línea debe ser exactamente una de: {verdict}. Luego 8–12 viñetas de afirmaciones " +
    "(tácticas concretas, números, nombres — no 'el anfitrión habla de IA'). Si se dan afirmaciones previas, " +
    "etiqueta cada viñeta {overlap} y nombra el video que se solapa. Termina cada viñeta con una marca de " +
    "tiempo (t=MM:SS) tomada de la transcripción, indicando dónde se dice ese punto. Si no hay afirmaciones " +
    "previas, omite las etiquetas de solape y usa el primer valor del veredicto. No clasifiques contra " +
    "internet abierto. Solo contra las afirmaciones previas.",
};

export const DEFAULT_CHAT_PROMPT: Record<Lang, string> = {
  en:
    'You are helping the user work with the YouTube video "{title}". You have its full transcript and the ' +
    "skip/keep extract already generated from it. Answer from the transcript and cite t=MM:SS. If asked to " +
    "revise or rewrite the extract, do it from the transcript. If something is not in the transcript, say " +
    "so. Be short unless asked for more.",
  es:
    'Ayudas al usuario a trabajar con el video de YouTube "{title}". Tienes su transcripción completa y el ' +
    "extracto de saltar/ver ya generado a partir de ella. Responde a partir de la transcripción y cita " +
    "t=MM:SS. Si te piden revisar o reescribir el extracto, hazlo a partir de la transcripción. Si algo no " +
    "está en la transcripción, dilo. Sé breve salvo que pidan más.",
};

export type Settings = {
  provider: string;
  model: string;
  llmKey: string;
  baseUrl: string; // provider "custom" only — an OpenAI-compatible /v1 root
  lang: Lang;
  filterPrompt: string; // "" → DEFAULT_FILTER_PROMPT[lang]
  chatPrompt: string; // "" → DEFAULT_CHAT_PROMPT[lang]
};

export type BaseUrlError = "missing" | "invalid" | "insecure";

// Kept to the two hosts Chrome can actually grant an http:// match pattern for.
const isLocal = (host: string) => host === "localhost" || host === "127.0.0.1";

// The key travels to whatever host is typed here, so plaintext is only allowed
// where it cannot leave the machine. Trailing slashes go — the AI SDK appends
// "/chat/completions" straight onto this.
export function normalizeBaseUrl(raw: string): { url: string } | { error: BaseUrlError } {
  const trimmed = trimEnd(raw.trim(), "/");
  if (!trimmed) return { error: "missing" };
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { error: "invalid" };
  }
  if (u.protocol === "http:") {
    return isLocal(u.hostname) ? { url: trimmed } : { error: "insecure" };
  }
  return u.protocol === "https:" ? { url: trimmed } : { error: "invalid" };
}

// Chrome match patterns carry no port, so one grant covers every port on the host.
export function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

// First-run default: follow the browser UI language (still overridable in settings).
function browserLang(): Lang {
  try {
    return chrome.i18n.getUILanguage().toLowerCase().startsWith("es") ? "es" : "en";
  } catch {
    return "en";
  }
}

const DEFAULTS: Settings = {
  provider: "anthropic",
  model: "",
  llmKey: "",
  baseUrl: "",
  lang: browserLang(),
  filterPrompt: "",
  chatPrompt: "",
};

export function resolvedPrompts(s: Settings): { filter: string; chat: string } {
  return {
    filter: s.filterPrompt || DEFAULT_FILTER_PROMPT[s.lang],
    chat: s.chatPrompt || DEFAULT_CHAT_PROMPT[s.lang],
  };
}

export async function settings(): Promise<Settings> {
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s } as Settings;
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(partial);
}

const isDefaultPrompt = (val: string, defs: Record<Lang, string>) =>
  !val.trim() || Object.values(defs).includes(val.trim());

// A prompt textarea that still holds a built-in default (any language's) follows
// the Language selector; one the user has edited is left alone.
function syncPromptDefaults(form: HTMLFormElement, lang: Lang): void {
  for (const [name, defs] of [
    ["filterPrompt", DEFAULT_FILTER_PROMPT],
    ["chatPrompt", DEFAULT_CHAT_PROMPT],
  ] as const) {
    const el = form.elements.namedItem(name);
    if (el instanceof HTMLTextAreaElement && isDefaultPrompt(el.value, defs)) el.value = defs[lang];
  }
}

export function bindSettingsForm(form: HTMLFormElement): void {
  settings().then((s) => {
    for (const [k, v] of Object.entries(s)) {
      const el = form.elements.namedItem(k);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        el.value = String(v);
      }
    }
    syncPromptDefaults(form, s.lang); // show the default prose for the current language
  });

  const langSel = form.elements.namedItem("lang");
  if (langSel instanceof HTMLSelectElement) {
    langSel.addEventListener("change", () => syncPromptDefaults(form, langSel.value === "es" ? "es" : "en"));
  }

  const status = (msg: string, ok: boolean) => {
    const el = form.querySelector("[data-saved]");
    if (!el) return;
    el.className = ok ? "ok" : "ok bad";
    el.replaceChildren(document.createTextNode(msg));
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const lang: Lang = fd.get("lang") === "es" ? "es" : "en";
    const t = UI[lang];
    const provider = String(fd.get("provider") || "anthropic");
    let baseUrl = String(fd.get("baseUrl") || "").trim();

    if (provider === "custom") {
      const parsed = normalizeBaseUrl(baseUrl);
      if ("error" in parsed) return status(t.baseUrlErrors[parsed.error], false);
      baseUrl = parsed.url;
      // Extension pages are subject to CORS, so an undeclared host is unreachable.
      // Ask for this one origin only — and before any other await, so the click is
      // still the user gesture chrome.permissions.request insists on.
      let granted = false;
      try {
        granted = await chrome.permissions.request({ origins: [originPattern(baseUrl)] });
      } catch {
        granted = false; // malformed pattern (an IPv6 literal, say) — Chrome throws
      }
      if (!granted) return status(t.permissionDenied, false);
    }

    const langChanged = lang !== (await settings()).lang;
    const fp = String(fd.get("filterPrompt") || "").trim();
    const cp = String(fd.get("chatPrompt") || "").trim();
    await saveSettings({
      provider,
      model: String(fd.get("model") || ""),
      llmKey: String(fd.get("llmKey") || ""),
      baseUrl, // kept even off `custom`, so switching back doesn't lose it
      lang,
      filterPrompt: fp === DEFAULT_FILTER_PROMPT[lang] ? "" : fp, // "" tracks the default
      chatPrompt: cp === DEFAULT_CHAT_PROMPT[lang] ? "" : cp,
    });
    status(t.saved, true);
    if (langChanged) location.reload(); // re-render this page in the new language
  });
}
