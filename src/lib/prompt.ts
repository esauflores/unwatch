import type { Lang } from "@/lib/i18n";
import type { ChatMessage } from "@/lib/llm";
import type { ChatTurn, Cue } from "@/lib/schema";
import { formatTranscript } from "@/lib/schema";

// Structural labels (Title:, Transcript:, …) stay English in both modes — they are
// scaffolding, not output. Only the instructions and the requested output language change.
const respondIn = (lang: Lang) => (lang === "es" ? "Responde en español." : "Respond in English.");
const verdictTokens = (lang: Lang) => (lang === "es" ? "nuevo | ya_visto | mixto" : "new | seen | mixed");
const overlapTags = (lang: Lang) => (lang === "es" ? "**nuevo** o **solapado**" : "**new** or **overlap**");

export function filterMessages(
  title: string,
  cues: Cue[],
  past: { title: string; claims_md: string }[],
  lang: Lang,
  systemPrompt: string,
): ChatMessage[] {
  const pastBlock = past
    .filter((p) => p.claims_md.trim())
    .map((p) => `## ${p.title}\n${p.claims_md}`)
    .join("\n\n");

  const system =
    systemPrompt.replace(/\{verdict\}/g, verdictTokens(lang)).replace(/\{overlap\}/g, overlapTags(lang)) +
    " " +
    respondIn(lang);

  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `Title: ${title}\n\n${pastBlock ? `Past claims:\n\n${pastBlock}\n\n` : ""}Transcript:\n\n${formatTranscript(cues)}`,
    },
  ];
}

export function chatMessages(
  title: string,
  filterMd: string,
  cues: Cue[],
  history: ChatTurn[],
  question: string,
  lang: Lang,
  systemPrompt: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        systemPrompt.replace(/\{title\}/g, title) + " " + respondIn(lang),
        "",
        "Extract:",
        filterMd || "(none)",
        "",
        "Transcript:",
        formatTranscript(cues),
      ].join("\n"),
    },
    ...history,
    { role: "user", content: `Question: ${question}` },
  ];
}
