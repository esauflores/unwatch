import type { ErrCode } from "@/lib/errors";
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
  errors: Record<ErrCode, string>;
  permissionDenied: string;
  save: string;
  saved: string;
  nothingSaved: string;
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
    library: "Library",
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
    errors: {
      not_watch_page: "Open a youtube.com/watch page first.",
      no_captions: "This video has no readable captions.",
      ad_playing: "An ad is playing — captions can't be read yet. Try again in a moment.",
      consent_required: "YouTube is showing a consent or sign-in screen for this video.",
      too_long: "The transcript is longer than the model's context window.",
      key_missing: "No LLM key set — add one in Settings.",
      key_rejected: "The LLM provider rejected your key. Check it in Settings.",
      rate_limited: "Rate limited or out of quota — wait a moment and retry.",
      network: "Network error reaching the LLM provider.",
      timeout: "The request to the LLM provider timed out.",
      empty_response: "The model returned nothing. Try again.",
    },
    permissionDenied: "not saved — Chrome needs access to that host to reach it",
    save: "Save",
    saved: "saved",
    nothingSaved: "Nothing saved yet. Extract a video from the side panel.",
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
    library: "Biblioteca",
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
    errors: {
      not_watch_page: "Abre primero una página youtube.com/watch.",
      no_captions: "Este video no tiene subtítulos legibles.",
      ad_playing: "Hay un anuncio en reproducción — los subtítulos aún no se pueden leer. Inténtalo en un momento.",
      consent_required: "YouTube muestra una pantalla de consentimiento o inicio de sesión para este video.",
      too_long: "La transcripción supera la ventana de contexto del modelo.",
      key_missing: "No hay clave del LLM — añade una en Ajustes.",
      key_rejected: "El proveedor del LLM rechazó tu clave. Revísala en Ajustes.",
      rate_limited: "Límite de peticiones o cuota agotada — espera un momento y reinténtalo.",
      network: "Error de red al contactar con el proveedor del LLM.",
      timeout: "La petición al proveedor del LLM expiró.",
      empty_response: "El modelo no devolvió nada. Inténtalo de nuevo.",
    },
    permissionDenied: "no guardado — Chrome necesita acceso a ese host para alcanzarlo",
    save: "Guardar",
    saved: "guardado",
    nothingSaved: "Nada guardado aún. Extrae un video desde el panel lateral.",
    del: "Eliminar",
    transcript: "Transcripción",
    filterPromptLabel: "Prompt de extracto",
    chatPromptLabel: "Prompt de chat",
    resetPrompts: "Restablecer prompts",
    deletePrompt: (title) => `¿Eliminar "${title}"?`,
  },
};
