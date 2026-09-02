import type { ChatMessage } from "./llm";
import type { Lang } from "./shared";
import type { ChatTurn, Cue } from "./schema";
import { formatTranscript } from "./schema";

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
): ChatMessage[] {
  const pastBlock = past
    .filter((p) => p.claims_md.trim())
    .map((p) => `## ${p.title}\n${p.claims_md}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: [
        "You write a skip/keep card for a YouTube video from its captions.",
        "Output markdown only.",
        `First line must be exactly one of: ${verdictTokens(lang)}`,
        "Then 8–12 claim bullets (specific tactics, numbers, names — not 'the host discusses AI').",
        `If past claims are provided, tag each bullet ${overlapTags(lang)} and name the overlapping video.`,
        "Timestamps only on new hooks, as (t=MM:SS).",
        `If there are no past claims, skip overlap tags and use the first verdict value.`,
        "Do not classify against the open internet. Only vs the past claims.",
        respondIn(lang),
      ].join(" "),
    },
    {
      role: "user",
      content: `Title: ${title}\n\n${pastBlock ? `Past claims:\n\n${pastBlock}\n\n` : ""}Transcript:\n\n${formatTranscript(cues)}`,
    },
  ];
}

export function chatMessages(
  title: string,
  cues: Cue[],
  history: ChatTurn[],
  question: string,
  lang: Lang,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        `You answer questions about the YouTube video "${title}" using only its full transcript below.`,
        "If the answer is not in the transcript, say so. Cite t=MM:SS. Be short unless asked for more.",
        respondIn(lang),
        "",
        "Transcript:",
        formatTranscript(cues),
      ].join("\n"),
    },
    ...history,
    { role: "user", content: `Question: ${question}` },
  ];
}

export function conclusionesMessages(
  title: string,
  filterMd: string,
  history: ChatTurn[],
  lang: Lang,
): ChatMessage[] {
  const chat = history.map((h) => `${h.role}: ${h.content}`).join("\n\n");
  return [
    {
      role: "system",
      content: `Write article-ready notes in markdown bullets: claim + why + optional timestamp. Use the user's questions as the angle. Do not rehash the filter card. ${respondIn(lang)}`,
    },
    {
      role: "user",
      content: `Title: ${title}\n\nFilter:\n${filterMd}\n\nChat:\n${chat || "(no chat)"}\n\nWrite the notes.`,
    },
  ];
}
