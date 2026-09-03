// A small typed-error vocabulary. Throw an UnwatchError at the point that knows
// what went wrong; translate it to `UI[lang].errors[code]` at the edge. Anything
// that isn't one of these still surfaces its raw message, so this can grow one
// code at a time.
export type ErrCode =
  | "not_watch_page"
  | "no_captions"
  | "ad_playing"
  | "consent_required"
  | "too_long"
  | "key_missing"
  | "key_rejected"
  | "rate_limited"
  | "network"
  | "timeout"
  | "empty_response";

export class UnwatchError extends Error {
  constructor(
    public code: ErrCode,
    public detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "UnwatchError";
  }
}

function statusOf(e: unknown): number | undefined {
  const s = (e as { statusCode?: unknown; status?: unknown })?.statusCode ?? (e as { status?: unknown })?.status;
  return typeof s === "number" ? s : undefined;
}

// message + raw response body, for sniffing what a generic 400 actually was.
const bodyText = (e: unknown): string =>
  `${(e as { message?: string })?.message ?? ""} ${(e as { responseBody?: string })?.responseBody ?? ""}`;

// Every provider phrases "your transcript overflowed the context window" its own
// way, always as a 400 — OpenAI: "maximum context length is N tokens" + code
// "context_length_exceeded"; Anthropic: "prompt is too long: N tokens > M".
// Match the common shapes; anything else stays a raw 400.
const TOO_LONG =
  /context[ _](?:length|window)|context_length_exceeded|prompt is too long|too many tokens|maximum.{0,40}tokens|token count.{0,40}exceed/i;

// Best-effort: map an unknown error to an ErrCode, or null to fall back to its
// raw message. Covers our own UnwatchError, HTTP-status-bearing errors (the AI
// SDK's APICallError carries `statusCode`), and fetch() network failures.
export function classify(e: unknown): ErrCode | null {
  if (e instanceof UnwatchError) return e.code;
  const status = statusOf(e);
  if (status === 401 || status === 403) return "key_rejected";
  if (status === 429) return "rate_limited";
  if (status === 400 && TOO_LONG.test(bodyText(e))) return "too_long";
  if (status && status >= 500) return "network";
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return "network";
  return null;
}
