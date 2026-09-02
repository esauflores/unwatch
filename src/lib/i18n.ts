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
    downloadTab: "Descargar",
    deletePrompt: (title) => `¿Eliminar "${title}"?`,
  },
};
