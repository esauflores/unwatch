export type Cue = { t: number; text: string };
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type Verdict = "nuevo" | "ya_visto" | "mixto";

export type Video = {
  id: string;
  title: string;
  created_at: string;
  verdict: Verdict | null;
  filter_md: string;
  claims_md: string;
  transcript_json: Cue[];
  chat_json: ChatTurn[];
};

export type ListItem = Omit<Video, "transcript_json" | "chat_json">;

export function parseVerdict(md: string): Verdict | null {
  const first = md.trim().split("\n")[0]?.toLowerCase() ?? "";
  if (/ya_visto|ya visto|seen/.test(first)) return "ya_visto";
  if (/mixto|mixed/.test(first)) return "mixto";
  if (/nuevo|new/.test(first)) return "nuevo";
  return null;
}

const VERDICT_LABELS = {
  en: { nuevo: "new", ya_visto: "seen", mixto: "mixed" },
  es: { nuevo: "nuevo", ya_visto: "ya visto", mixto: "mixto" },
} as const;

export function verdictLabel(v: Verdict | null, lang: "en" | "es"): string {
  return v ? VERDICT_LABELS[lang][v] : "—";
}

// The extract's first line is the verdict token; drop it for display since the
// UI shows the verdict as a pill.
export function stripVerdictLine(md: string): string {
  const lines = md.split("\n");
  if (lines[0] && lines[0].trim().length < 40 && parseVerdict(lines[0])) {
    lines.shift();
    while (lines[0] !== undefined && !lines[0].trim()) lines.shift();
  }
  return lines.join("\n");
}

export function extractClaimsMd(md: string): string {
  return md
    .split("\n")
    .filter((l) => /^\s*[-*]/.test(l))
    .join("\n");
}

export function formatTranscript(cues: Cue[]): string {
  return cues
    .map((c) => {
      const m = Math.floor(c.t / 60);
      const s = Math.floor(c.t % 60)
        .toString()
        .padStart(2, "0");
      return `[${m}:${s}] ${c.text}`;
    })
    .join("\n");
}

export function listItem(v: Video): ListItem {
  const { transcript_json, chat_json, ...rest } = v;
  return rest;
}
