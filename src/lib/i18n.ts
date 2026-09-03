import type { BaseUrlError } from "@/lib/settings";

export type Lang = "en" | "es";

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
  modelRequired: string;
  keyLabel: string;
  baseUrlLabel: string;
  baseUrlPlaceholder: string;
  baseUrlNote: string;
  baseUrlErrors: Record<BaseUrlError, string>;
  permissionDenied: string;
  save: string;
  saved: string;
  nothingSaved: string;
  copy: string;
  del: string;
  transcript: string;
  filterPromptLabel: string;
  chatPromptLabel: string;
  resetPrompts: string;
  downloadTab: string;
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
    modelRequired: "required — no default for a custom endpoint",
    keyLabel: "LLM key",
    baseUrlLabel: "Base URL",
    baseUrlNote: "Any OpenAI-compatible server. Your key is sent to this host, and only to it.",
    baseUrlPlaceholder: "http://localhost:11434/v1",
    baseUrlErrors: {
      missing: "base URL required for a custom endpoint",
      invalid: "not a valid URL — include the scheme, e.g. https://host/v1",
      insecure: "http:// is only allowed for localhost / 127.0.0.1 — use https://",
    },
    permissionDenied: "not saved — Chrome needs access to that host to reach it",
    save: "Save",
    saved: "saved",
    nothingSaved: "Nothing saved yet. Extract a video from the side panel.",
    copy: "Copy",
    del: "Delete",
    transcript: "Transcript",
    filterPromptLabel: "Extract prompt",
    chatPromptLabel: "Chat prompt",
    resetPrompts: "Reset prompts",
    downloadTab: "Download",
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
    modelRequired: "obligatorio — un endpoint propio no tiene predeterminado",
    keyLabel: "Clave del LLM",
    baseUrlLabel: "URL base",
    baseUrlNote: "Cualquier servidor compatible con OpenAI. Tu clave se envía a este host, y solo a él.",
    baseUrlPlaceholder: "http://localhost:11434/v1",
    baseUrlErrors: {
      missing: "la URL base es obligatoria para un endpoint propio",
      invalid: "URL no válida — incluye el esquema, p. ej. https://host/v1",
      insecure: "http:// solo se permite para localhost / 127.0.0.1 — usa https://",
    },
    permissionDenied: "no guardado — Chrome necesita acceso a ese host para alcanzarlo",
    save: "Guardar",
    saved: "guardado",
    nothingSaved: "Nada guardado aún. Extrae un video desde el panel lateral.",
    copy: "Copiar",
    del: "Eliminar",
    transcript: "Transcripción",
    filterPromptLabel: "Prompt de extracto",
    chatPromptLabel: "Prompt de chat",
    resetPrompts: "Restablecer prompts",
    downloadTab: "Descargar",
    deletePrompt: (title) => `¿Eliminar "${title}"?`,
  },
};
