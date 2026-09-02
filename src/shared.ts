export type Lang = "en" | "es";

export type Settings = {
  provider: string;
  model: string;
  llmKey: string;
  lang: Lang;
};

const DEFAULTS: Settings = {
  provider: "anthropic",
  model: "",
  llmKey: "",
  lang: "en",
};

export const UI: Record<Lang, {
  filter: string;
  chat: string;
  ask: string;
  library: string;
  askPlaceholder: string;
  noVideo: string;
  copied: string;
}> = {
  en: {
    filter: "Extract from this video",
    chat: "Chat",
    ask: "Ask",
    library: "Library & settings",
    askPlaceholder: "Ask this transcript…",
    noVideo: "Open a youtube.com/watch page, then reopen this panel.",
    copied: "copied",
  },
  es: {
    filter: "Extraer de este video",
    chat: "Chat",
    ask: "Preguntar",
    library: "Biblioteca y ajustes",
    askPlaceholder: "Pregunta a esta transcripción…",
    noVideo: "Abre una página youtube.com/watch y reabre este panel.",
    copied: "copiado",
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

export function bindSettingsForm(form: HTMLFormElement): void {
  settings().then((s) => {
    for (const [k, v] of Object.entries(s)) {
      const el = form.elements.namedItem(k);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = String(v);
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    await saveSettings({
      provider: String(fd.get("provider") || "anthropic"),
      model: String(fd.get("model") || ""),
      llmKey: String(fd.get("llmKey") || ""),
      lang: fd.get("lang") === "es" ? "es" : "en",
    });
    form.querySelector("[data-saved]")?.replaceChildren(document.createTextNode("saved"));
  });
}
