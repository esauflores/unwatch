import type { ChatMessage } from "./llm";
import type { ChatTurn, Cue } from "./schema";
import { formatTranscript } from "./schema";

export function filterMessages(
  title: string,
  cues: Cue[],
  past: { title: string; claims_md: string }[],
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
        "First line must be exactly one of: nuevo | ya_visto | mixto",
        "Then 8–12 claim bullets (specific tactics, numbers, names — not 'the host discusses AI').",
        "If past claims are provided, tag each bullet **nuevo** or **solapado** and name the overlapping video.",
        "Timestamps only on new hooks, as (t=MM:SS).",
        "If there are no past claims, skip overlap tags and use nuevo.",
        "Do not classify against the open internet. Only vs the past claims.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Title: ${title}\n\n${pastBlock ? `Past claims:\n\n${pastBlock}\n\n` : ""}Transcript:\n\n${formatTranscript(cues)}`,
    },
  ];
}

export function chatMessages(title: string, cues: Cue[], history: ChatTurn[], question: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Answer only from this video's transcript. If it is not in the transcript, say so. Cite t=MM:SS. Be short unless asked for more.",
    },
    { role: "user", content: `Title: ${title}\n\nTranscript:\n\n${formatTranscript(cues)}` },
    ...history,
    { role: "user", content: `Question: ${question}` },
  ];
}

export function conclusionesMessages(title: string, filterMd: string, history: ChatTurn[]): ChatMessage[] {
  const chat = history.map((h) => `${h.role}: ${h.content}`).join("\n\n");
  return [
    {
      role: "system",
      content:
        "Write article-ready conclusiones in markdown bullets: claim + why + optional timestamp. Use the user's questions as the angle. Do not rehash the filter card.",
    },
    {
      role: "user",
      content: `Title: ${title}\n\nFilter:\n${filterMd}\n\nChat:\n${chat || "(no chat)"}\n\nWrite conclusiones.`,
    },
  ];
}
