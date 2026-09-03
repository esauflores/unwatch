import { expect, it, vi } from "vitest";

import { classify, UnwatchError } from "@/lib/errors";
import { complete, demoComplete, stream } from "@/lib/llm";
import { renderMarkdown } from "@/lib/markdown";
import { extractClaimsMd, formatTranscript, parseVerdict, stripVerdictLine } from "@/lib/schema";
import { normalizeBaseUrl, originPattern } from "@/lib/settings";

// Tiny fake DOM so renderMarkdown runs in the node env (no jsdom dependency).
type FakeNode = {
  tag: string;
  className: string;
  type: string;
  children: FakeNode[];
  text: string;
  onclick?: () => void;
};
function fakeEl(tag: string): FakeNode {
  const n: any = {
    tag,
    className: "",
    type: "",
    children: [],
    text: "",
    get textContent() {
      return this._t ?? this.children.map((c: FakeNode) => c.text || (c as any).textContent).join("");
    },
    set textContent(v: string) {
      this._t = v;
    },
  };
  n.appendChild = (c: FakeNode) => (n.children.push(c), c);
  n.replaceChildren = () => (n.children.length = 0);
  n.addEventListener = (_: string, fn: () => void) => (n.onclick = fn);
  return n;
}
(globalThis as any).document = {
  createElement: (t: string) => fakeEl(t),
  createTextNode: (text: string) => ({ tag: "#text", text, children: [] }),
};

it("parseVerdict reads the first line, either language", () => {
  expect(parseVerdict("nuevo\n\n- x")).toBe("nuevo");
  expect(parseVerdict("ya_visto\n- x")).toBe("ya_visto");
  expect(parseVerdict("mixto — 1 new")).toBe("mixto");
  expect(parseVerdict("new\n\n- x")).toBe("nuevo");
  expect(parseVerdict("seen")).toBe("ya_visto");
  expect(parseVerdict("mixed")).toBe("mixto");
  expect(parseVerdict("hello")).toBe(null);
});

it("extractClaimsMd keeps bullet lines only", () => {
  expect(extractClaimsMd("nuevo\n\n- a\n- b\n\nnote")).toBe("- a\n- b");
});

it("stripVerdictLine drops the leading verdict line, keeps real content", () => {
  expect(stripVerdictLine("nuevo\n\n- a\n- b")).toBe("- a\n- b");
  expect(stripVerdictLine("**mixed**\n- a")).toBe("- a");
  expect(stripVerdictLine("- a\n- b")).toBe("- a\n- b"); // no verdict line → untouched
});

it("formatTranscript stamps MM:SS", () => {
  expect(
    formatTranscript([
      { t: 12, text: "hi" },
      { t: 100, text: "bye" },
    ]),
  ).toBe("[0:12] hi\n[1:40] bye");
});

it("demoComplete branches on message content (English default)", () => {
  const u = (content: string) => demoComplete([{ role: "user", content }]);
  expect(u("Transcript:\n...")).toMatch(/^new/);
  expect(u("Past claims:\n...")).toMatch(/^mixed/);
  expect(u("Question: what?")).toContain("Demo answer");
});

it("demoComplete answers in Spanish when the system prompt asks", () => {
  const out = demoComplete([
    { role: "system", content: "… Responde en español." },
    { role: "user", content: "Transcript:\n..." },
  ]);
  expect(out).toMatch(/^nuevo/);
  expect(out).toContain("transcripción");
});

it("renderMarkdown: bullets, bold, and a seeking timestamp button", () => {
  const seek = vi.fn();
  const el = (globalThis as any).document.createElement("div");
  renderMarkdown(el, "## Head\n\n- **nuevo** — a hook (t=01:40)\n- plain", seek);
  const kinds = el.children.map((c: any) => c.tag);
  expect(kinds).toEqual(["h3", "ul"]);
  expect(el.children[1].children).toHaveLength(2); // two <li>
  const btn = el.children[1].children[0].children.find((c: any) => c.className === "t");
  expect(btn.tag).toBe("button");
  btn.onclick();
  expect(seek).toHaveBeenCalledWith(100);
});

it("complete falls back to demo, and rejects a real provider with no key", async () => {
  expect(
    await complete({
      provider: "demo",
      apiKey: "",
      model: "demo",
      messages: [{ role: "user", content: "Transcript:" }],
    }),
  ).toMatch(/^new/);
  await expect(complete({ provider: "openai", apiKey: "", model: "gpt", messages: [] })).rejects.toThrow(/key_missing/);
});

it("stream: demo feeds onDelta and resolves to the same text", async () => {
  const chunks: string[] = [];
  const text = await stream({
    provider: "demo",
    apiKey: "",
    model: "demo",
    messages: [{ role: "user", content: "Transcript:" }],
    onDelta: (c) => chunks.push(c),
  });
  expect(text).toMatch(/^new/);
  expect(chunks).toEqual([text]);
});

it("classify: known error shapes -> ErrCode, unknown -> null", () => {
  expect(classify(new UnwatchError("rate_limited"))).toBe("rate_limited");
  expect(classify({ statusCode: 401 })).toBe("key_rejected");
  expect(classify({ statusCode: 403 })).toBe("key_rejected");
  expect(classify({ statusCode: 429 })).toBe("rate_limited");
  expect(classify({ status: 503 })).toBe("network");
  expect(classify(new TypeError("Failed to fetch"))).toBe("network");
  expect(classify(new Error("something odd"))).toBe(null);
  // a 400 is too_long only when the body says so
  expect(classify({ statusCode: 400, message: "prompt is too long: 210000 tokens > 200000 maximum" })).toBe("too_long");
  expect(classify({ statusCode: 400, responseBody: "maximum context length is 128000 tokens" })).toBe("too_long");
  expect(classify({ statusCode: 400, message: "invalid model id" })).toBe(null);
});

it("complete lets a custom endpoint run keyless, but not without a base URL or model", async () => {
  // A keyless call must not fall through to the hosted-provider key check.
  await expect(complete({ provider: "custom", apiKey: "", model: "llama3", messages: [] })).rejects.toThrow(
    /missing base URL/,
  );
  await expect(
    complete({ provider: "custom", apiKey: "", model: "", baseUrl: "http://localhost:11434/v1", messages: [] }),
  ).rejects.toThrow(/no model set for custom/);
});

it("normalizeBaseUrl: https anywhere, http only on the loopback host", () => {
  expect(normalizeBaseUrl("https://openrouter.ai/api/v1")).toEqual({ url: "https://openrouter.ai/api/v1" });
  expect(normalizeBaseUrl("  http://localhost:11434/v1/  ")).toEqual({ url: "http://localhost:11434/v1" });
  expect(normalizeBaseUrl("http://127.0.0.1:1234/v1")).toEqual({ url: "http://127.0.0.1:1234/v1" });
  expect(normalizeBaseUrl("http://api.example.com/v1")).toEqual({ error: "insecure" });
  expect(normalizeBaseUrl("api.example.com/v1")).toEqual({ error: "invalid" }); // no scheme
  expect(normalizeBaseUrl("ftp://example.com")).toEqual({ error: "invalid" });
  expect(normalizeBaseUrl("   ")).toEqual({ error: "missing" });
});

it("originPattern drops the port, which Chrome match patterns can't carry", () => {
  expect(originPattern("http://localhost:11434/v1")).toBe("http://localhost/*");
  expect(originPattern("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/*");
});
