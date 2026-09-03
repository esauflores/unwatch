import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type ModelMessage } from "ai";

import { UnwatchError } from "@/lib/errors";

export type Provider = "anthropic" | "openai" | "gemini" | "custom" | "demo";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

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

export async function complete(opts: {
  provider: Provider;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  baseUrl?: string;
  demo?: boolean;
}): Promise<string> {
  if (opts.demo || opts.provider === "demo") return demoComplete(opts.messages);
  // A local endpoint is usually unauthenticated; every hosted one needs a key.
  if (!opts.apiKey && opts.provider !== "custom") throw new UnwatchError("key_missing");
  // Without this, createOpenAI would quietly fall back to api.openai.com.
  if (opts.provider === "custom" && !opts.baseUrl) throw new Error("missing base URL — set one in Library settings");
  if (!opts.model) throw new Error(`no model set for ${opts.provider} — pick one in Library settings`);

  // The AI SDK rejects `role: "system"` inside `messages` — hoist it to `system`.
  const system = opts.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = opts.messages.filter((m) => m.role !== "system") as ModelMessage[];

  // No default timeout in the SDK — a hung connection would wait forever. A flag
  // (not signal.aborted) tells our timeout apart from a future caller-supplied
  // abort, e.g. #3's stream-cancel: that one should surface as its own error.
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, 120_000);
  let text: string;
  try {
    ({ text } = await generateText({
      model: model(opts.provider, opts.apiKey, opts.model, opts.baseUrl),
      system: system || undefined,
      messages: rest,
      abortSignal: ac.signal,
    }));
  } catch (e) {
    if (timedOut) throw new UnwatchError("timeout", opts.provider);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!text) throw new UnwatchError("empty_response", opts.provider);
  return text;
}
