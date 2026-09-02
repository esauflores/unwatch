export type Lang = "en" | "es";

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
  lang: Lang;
  filterPrompt: string; // "" → DEFAULT_FILTER_PROMPT[lang]
  chatPrompt: string; // "" → DEFAULT_CHAT_PROMPT[lang]
};

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

type Strings = {
  filter: string;
  chat: string;
  library: string;
  extract: string;
  askPlaceholder: string;
  noVideo: string;
  noVideoChat: string;
  settingsHeading: string;
  savedHeading: string;
  languageLabel: string;
  providerLabel: string;
  modelLabel: string;
  modelPlaceholder: string;
  keyLabel: string;
  save: string;
  saved: string;
  nothingSaved: string;
  copy: string;
  del: string;
  transcript: string;
  filterPromptLabel: string;
  chatPromptLabel: string;
  resetPrompts: string;
  deletePrompt: (title: string) => string;
};

export const UI: Record<Lang, Strings> = {
  en: {
    filter: "Extract from this video",
    chat: "Chat",
    library: "Library & settings",
    extract: "Extract",
    askPlaceholder: "Ask this transcript…",
    noVideo: "Open a youtube.com/watch page, then reopen this panel.",
    noVideoChat: "No extracted video — Extract one from the side panel first.",
    settingsHeading: "Settings",
    savedHeading: "Saved",
    languageLabel: "Language",
    providerLabel: "Provider",
    modelLabel: "Model",
    modelPlaceholder: "default for provider",
    keyLabel: "LLM key",
    save: "Save",
    saved: "saved",
    nothingSaved: "Nothing saved yet. Extract a video from the side panel.",
    copy: "Copy",
    del: "Delete",
    transcript: "Transcript",
    filterPromptLabel: "Extract prompt",
    chatPromptLabel: "Chat prompt",
    resetPrompts: "Reset prompts",
    deletePrompt: (title) => `Delete "${title}"?`,
  },
  es: {
    filter: "Extraer de este video",
    chat: "Chat",
    library: "Biblioteca y ajustes",
    extract: "Extracto",
    askPlaceholder: "Pregunta a esta transcripción…",
    noVideo: "Abre una página youtube.com/watch y reabre este panel.",
    noVideoChat: "Ningún video extraído — extrae uno desde el panel lateral primero.",
    settingsHeading: "Ajustes",
    savedHeading: "Guardados",
    languageLabel: "Idioma",
    providerLabel: "Proveedor",
    modelLabel: "Modelo",
    modelPlaceholder: "predeterminado del proveedor",
    keyLabel: "Clave del LLM",
    save: "Guardar",
    saved: "guardado",
    nothingSaved: "Nada guardado aún. Extrae un video desde el panel lateral.",
    copy: "Copiar",
    del: "Eliminar",
    transcript: "Transcripción",
    filterPromptLabel: "Prompt de extracto",
    chatPromptLabel: "Prompt de chat",
    resetPrompts: "Restablecer prompts",
    deletePrompt: (title) => `¿Eliminar "${title}"?`,
  },
};

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Just enough markdown for what the prompts emit: `-`/`*` bullets, `## headings`,
// `**bold**`, and `t=MM:SS` (a button that seeks the player when onSeek is given).
// ponytail: hand-rolled, add a real parser only if the prompts start emitting more.
function inlineTs(parent: Node, str: string, onSeek?: (t: number) => void): void {
  let last = 0;
  for (const m of str.matchAll(/t=(\d+):(\d{2})/g)) {
    const i = m.index ?? 0;
    if (i > last) parent.appendChild(document.createTextNode(str.slice(last, i)));
    const node = onSeek ? document.createElement("button") : document.createElement("span");
    node.className = "t";
    node.textContent = m[0];
    if (onSeek) {
      (node as HTMLButtonElement).type = "button";
      const t = Number(m[1]) * 60 + Number(m[2]);
      node.addEventListener("click", () => onSeek(t));
    }
    parent.appendChild(node);
    last = i + m[0].length;
  }
  if (last < str.length) parent.appendChild(document.createTextNode(str.slice(last)));
}

function inline(parent: Node, str: string, onSeek?: (t: number) => void): void {
  let last = 0;
  for (const m of str.matchAll(/\*\*(.+?)\*\*/g)) {
    const i = m.index ?? 0;
    if (i > last) inlineTs(parent, str.slice(last, i), onSeek);
    const strong = document.createElement("strong");
    inlineTs(strong, m[1], onSeek);
    parent.appendChild(strong);
    last = i + m[0].length;
  }
  if (last < str.length) inlineTs(parent, str.slice(last), onSeek);
}

export function renderMarkdown(el: HTMLElement, text: string, onSeek?: (t: number) => void): void {
  el.replaceChildren();
  let ul: HTMLUListElement | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (bullet) {
      ul ??= el.appendChild(document.createElement("ul"));
      inline(ul.appendChild(document.createElement("li")), bullet[1], onSeek);
      continue;
    }
    ul = null;
    if (!line.trim()) continue;
    inline(el.appendChild(document.createElement(heading ? "h3" : "div")), heading ? heading[1] : line, onSeek);
  }
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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const lang: Lang = fd.get("lang") === "es" ? "es" : "en";
    const langChanged = lang !== (await settings()).lang;
    const fp = String(fd.get("filterPrompt") || "").trim();
    const cp = String(fd.get("chatPrompt") || "").trim();
    await saveSettings({
      provider: String(fd.get("provider") || "anthropic"),
      model: String(fd.get("model") || ""),
      llmKey: String(fd.get("llmKey") || ""),
      lang,
      filterPrompt: fp === DEFAULT_FILTER_PROMPT[lang] ? "" : fp, // "" tracks the default
      chatPrompt: cp === DEFAULT_CHAT_PROMPT[lang] ? "" : cp,
    });
    form.querySelector("[data-saved]")?.replaceChildren(document.createTextNode(UI[lang].saved));
    if (langChanged) location.reload(); // re-render this page in the new language
  });
}
