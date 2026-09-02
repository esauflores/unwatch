import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type ModelMessage } from "ai";

export type Provider = "anthropic" | "openai" | "gemini" | "demo";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const defaults: Record<Exclude<Provider, "demo">, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5-mini",
  gemini: "gemini-3.5-flash",
};

export function demoComplete(messages: ChatMessage[]): string {
  const es = messages.some((m) => /Responde en español/.test(m.content));
  const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (user.includes("Write the notes.")) {
    return es
      ? "- Idea demo a partir del chat.\n- Anótalo si preguntas a un modelo real."
      : "- Demo takeaway from the chat.\n- Worth a note if you ask a real model.";
  }
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
function model(provider: Exclude<Provider, "demo">, apiKey: string, id: string) {
  // .chat() = /v1/chat/completions, which takes `system` role messages; the
  // callable shorthand defaults to the Responses API, which rejects them.
  if (provider === "openai") return createOpenAI({ apiKey }).chat(id);
  if (provider === "gemini") return createGoogleGenerativeAI({ apiKey })(id);
  return createAnthropic({ apiKey, headers: { "anthropic-dangerous-direct-browser-access": "true" } })(id);
}

export async function complete(opts: {
  provider: Provider;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  demo?: boolean;
}): Promise<string> {
  if (opts.demo || opts.provider === "demo") return demoComplete(opts.messages);
  if (!opts.apiKey) throw new Error("missing llm key — set one in Library settings");

  // The AI SDK rejects `role: "system"` inside `messages` — hoist it to `system`.
  const system = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = opts.messages.filter((m) => m.role !== "system") as ModelMessage[];
  const { text } = await generateText({
    model: model(opts.provider, opts.apiKey, opts.model),
    system: system || undefined,
    messages: rest,
  });
  if (!text) throw new Error(`${opts.provider} returned no content`);
  return text;
}
