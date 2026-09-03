export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// OpenAI-compatible servers disagree on the shape of /models: most return
// [{ id }], some hand back bare strings. Anything else is dropped.
export function modelIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) =>
      typeof m === "string" ? m : typeof (m as { id?: unknown })?.id === "string" ? (m as { id: string }).id : "",
    )
    .filter(Boolean);
}
