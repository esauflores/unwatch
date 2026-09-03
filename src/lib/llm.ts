import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { type ModelMessage, streamText } from "ai";

import { UnwatchError } from "@/lib/errors";

export type Provider = "anthropic" | "openai" | "gemini" | "custom" | "demo";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompleteOpts = {
  provider: Provider;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  baseUrl?: string;
  demo?: boolean;
};

// `custom` is deliberately absent: the base URL decides which ids exist, so there
// is no sane guess. complete() turns an empty model into a message instead.
export const defaults: Partial<Record<Exclude<Provider, "demo">, string>> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5-mini",
  gemini: "gemini-3.5-flash",
};

export function demoComplete(messages: ChatMessage[]): string {
  const es = messages.some((m) => /Responde en español/.test(m.content));
  const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (user.includes("Question:")) {
    return es
      ? "Respuesta demo (t=00:12). Elige un proveedor y añade una clave para una real."
      : "Demo answer (t=00:12). Pick a provider and add a key for a real one.";
  }
  if (user.includes("Past claims:")) {
    return es
      ? "mixto\n\n- **solapado** — solape demo con un video anterior\n- **nuevo** — gancho demo (t=00:12)"
      : "mixed\n\n- **overlap** — Demo overlap with a past video\n- **new** — Demo new hook (t=00:12)";
  }
  return es
    ? "nuevo\n\n- Afirmación demo de la transcripción (t=00:12)\n- Segunda afirmación para tener bullets (t=01:40)"
    : "new\n\n- Demo claim from the transcript (t=00:12)\n- Second claim so the library has bullets (t=01:40)";
}

// BYOK straight from the extension. The Anthropic provider needs the browser-access
// header or the request is CORS-blocked; the other two just take the key.
function model(provider: Exclude<Provider, "demo">, apiKey: string, id: string, baseUrl?: string) {
  // .chat() = /v1/chat/completions, which takes `system` role messages; the
  // callable shorthand defaults to the Responses API, which rejects them.
  if (provider === "openai") return createOpenAI({ apiKey }).chat(id);
  if (provider === "gemini") return createGoogleGenerativeAI({ apiKey })(id);
  // Anything OpenAI-shaped: Ollama, LM Studio, OpenRouter, vLLM, a company gateway.
  // Local servers want no key at all, but an empty Bearer trips some of them, so
  // send the placeholder the Ollama docs use.
  if (provider === "custom") return createOpenAI({ apiKey: apiKey || "unused", baseURL: baseUrl }).chat(id);
  return createAnthropic({ apiKey, headers: { "anthropic-dangerous-direct-browser-access": "true" } })(id);
}

function guard(opts: CompleteOpts): void {
  // A local endpoint is usually unauthenticated; every hosted one needs a key.
  if (!opts.apiKey && opts.provider !== "custom") throw new UnwatchError("key_missing");
  // Without this, createOpenAI would quietly fall back to api.openai.com.
  if (opts.provider === "custom" && !opts.baseUrl) throw new Error("missing base URL — set one in Library settings");
  if (!opts.model) throw new Error(`no model set for ${opts.provider} — pick one in Library settings`);
}

// The AI SDK rejects `role: "system"` inside `messages` — hoist it to `system`.
function splitSystem(messages: ChatMessage[]): { system: string; rest: ModelMessage[] } {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  return { system, rest: messages.filter((m) => m.role !== "system") as ModelMessage[] };
}

// Streaming BYOK call: feed each chunk to onDelta, resolve to the full text.
// `signal` lets a caller cancel (deep-chat's stop button) — that surfaces as the
// raw abort error, kept distinct from our own 120s timeout via `timeout.aborted`.
export async function stream(
  opts: CompleteOpts & { onDelta: (chunk: string) => void; signal?: AbortSignal },
): Promise<string> {
  if (opts.demo || opts.provider === "demo") {
    const text = demoComplete(opts.messages);
    opts.onDelta(text);
    return text;
  }
  guard(opts);
  const { system, rest } = splitSystem(opts.messages);

  // No default timeout in the SDK. `timeout.aborted` afterwards tells our 120s
  // limit apart from a caller-supplied abort (deep-chat's stop button).
  const timeout = AbortSignal.timeout(120_000);
  const abortSignal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  // streamText routes stream errors to onError rather than throwing from the
  // iterable in some paths — capture there and re-throw after the loop.
  let captured: unknown;
  try {
    const result = streamText({
      model: model(opts.provider, opts.apiKey, opts.model, opts.baseUrl),
      system: system || undefined,
      messages: rest,
      abortSignal,
      onError: ({ error }) => {
        captured = error;
      },
    });
    for await (const delta of result.textStream) opts.onDelta(delta);
    if (captured) throw captured;
    const text = await result.text;
    if (!text) throw new UnwatchError("empty_response", opts.provider);
    return text;
  } catch (e) {
    if (timeout.aborted) throw new UnwatchError("timeout", opts.provider);
    throw captured ?? e;
  }
}

// Non-streaming: run the stream and hand back only the final string. Kept for the
// demo path and callers (tests) that don't want chunks.
export async function complete(opts: CompleteOpts): Promise<string> {
  return stream({ ...opts, onDelta: () => {} });
}
