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
        "End every bullet with a (t=MM:SS) timestamp taken from the transcript, marking where that point is made.",
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
  filterMd: string,
  cues: Cue[],
  history: ChatTurn[],
  question: string,
  lang: Lang,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        `You are helping the user work with the YouTube video "${title}".`,
        "You have its full transcript and the skip/keep extract already generated from it.",
        "Answer from the transcript and cite t=MM:SS. If asked to revise or rewrite the extract, do it from the transcript. If something is not in the transcript, say so. Be short unless asked for more.",
        respondIn(lang),
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
