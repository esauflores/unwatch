export type Provider = "anthropic" | "openai" | "gemini" | "demo";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export const defaults: Record<Exclude<Provider, "demo">, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
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

export async function complete(opts: {
  provider: Provider;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  demo?: boolean;
}): Promise<string> {
  if (opts.demo || opts.provider === "demo") return demoComplete(opts.messages);
  if (!opts.apiKey) throw new Error("missing llm key — set one in Library settings");

  if (opts.provider === "openai") return openai(opts.apiKey, opts.model, opts.messages);
  if (opts.provider === "anthropic") return anthropic(opts.apiKey, opts.model, opts.messages);
  if (opts.provider === "gemini") return gemini(opts.apiKey, opts.model, opts.messages);
  throw new Error("unknown provider");
}

async function openai(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  const data = rec(await res.json());
  if (!res.ok) throw new Error(`openai failed (${res.status})`);
  const content = rec(rec((Array.isArray(data.choices) ? data.choices[0] : {}) as object).message).content;
  if (typeof content !== "string" || !content) throw new Error("openai returned no content");
  return content;
}

async function anthropic(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 2048, system: system || undefined, messages: rest }),
  });
  const data = rec(await res.json());
  if (!res.ok) throw new Error(`anthropic failed (${res.status})`);
  const block = (Array.isArray(data.content) ? data.content[0] : {}) as object;
  const text = rec(block).text;
  if (typeof text !== "string" || !text) throw new Error("anthropic returned no content");
  return text;
}

async function gemini(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
    }),
  });
  const data = rec(await res.json());
  if (!res.ok) throw new Error(`gemini failed (${res.status})`);
  const parts = rec(rec((Array.isArray(data.candidates) ? data.candidates[0] : {}) as object).content).parts;
  const text = rec(Array.isArray(parts) ? parts[0] : {}).text;
  if (typeof text !== "string" || !text) throw new Error("gemini returned no content");
  return text;
}
