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
  conclusiones_md: string;
};

export type ListItem = Omit<Video, "transcript_json" | "chat_json">;

export function parseVerdict(md: string): Verdict | null {
  const first = md.trim().split("\n")[0]?.toLowerCase() ?? "";
  if (first.includes("ya_visto") || first.includes("ya visto")) return "ya_visto";
  if (first.includes("mixto")) return "mixto";
  if (first.includes("nuevo")) return "nuevo";
  return null;
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
