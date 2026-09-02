import { expect, it, vi } from "vitest";
import { complete, demoComplete } from "./llm";
import { extractClaimsMd, formatTranscript, parseVerdict } from "./schema";
import { renderMarkdown } from "./shared";

// Tiny fake DOM so renderMarkdown runs in the node env (no jsdom dependency).
type FakeNode = { tag: string; className: string; type: string; children: FakeNode[]; text: string; onclick?: () => void };
function fakeEl(tag: string): FakeNode {
  const n: any = { tag, className: "", type: "", children: [], text: "", get textContent() { return this._t ?? this.children.map((c: FakeNode) => c.text || (c as any).textContent).join(""); }, set textContent(v: string) { this._t = v; } };
  n.appendChild = (c: FakeNode) => (n.children.push(c), c);
  n.replaceChildren = () => (n.children.length = 0);
  n.addEventListener = (_: string, fn: () => void) => (n.onclick = fn);
  return n;
}
(globalThis as any).document = {
  createElement: (t: string) => fakeEl(t),
  createTextNode: (text: string) => ({ tag: "#text", text, children: [] }),
};

it("parseVerdict reads the first line", () => {
  expect(parseVerdict("nuevo\n\n- x")).toBe("nuevo");
  expect(parseVerdict("ya_visto\n- x")).toBe("ya_visto");
  expect(parseVerdict("mixto — 1 new")).toBe("mixto");
  expect(parseVerdict("hello")).toBe(null);
});

it("extractClaimsMd keeps bullet lines only", () => {
  expect(extractClaimsMd("nuevo\n\n- a\n- b\n\nnote")).toBe("- a\n- b");
});

it("formatTranscript stamps MM:SS", () => {
  expect(formatTranscript([{ t: 12, text: "hi" }, { t: 100, text: "bye" }])).toBe("[0:12] hi\n[1:40] bye");
});

it("demoComplete branches on message content", () => {
  const u = (content: string) => demoComplete([{ role: "user", content }]);
  expect(u("Transcript:\n...")).toMatch(/^nuevo/);
  expect(u("Past claims:\n...")).toMatch(/^mixto/);
  expect(u("Question: what?")).toContain("Demo answer");
  expect(u("Write conclusiones.")).toContain("Demo takeaway");
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
  expect(await complete({ provider: "demo", apiKey: "", model: "demo", messages: [{ role: "user", content: "Transcript:" }] })).toMatch(/^nuevo/);
  await expect(complete({ provider: "openai", apiKey: "", model: "gpt", messages: [] })).rejects.toThrow(/missing llm key/);
});
