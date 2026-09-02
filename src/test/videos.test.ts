import { beforeEach, expect, it } from "vitest";
import { chatVideo, filterVideo, getVideo, listVideos } from "@/lib/videos";

// Minimal chrome.storage.local stub — an in-memory object behind get/set.
// Seeded with the demo provider so the flow runs offline.
beforeEach(() => {
  const store: Record<string, unknown> = { provider: "demo" };
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (keys: string | Record<string, unknown>) => {
          if (typeof keys === "string") return { [keys]: store[keys] };
          const out: Record<string, unknown> = {};
          for (const k of Object.keys(keys)) out[k] = k in store ? store[k] : keys[k];
          return out;
        },
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
      },
    },
  };
});

it("demo flow: filter → chat round-trips through the store", async () => {
  const v = await filterVideo({ videoId: "abc", title: "First talk", cues: [{ t: 12, text: "hello world" }] });
  expect(v.verdict).toBe("nuevo");
  expect(v.filter_md).toContain("Demo claim");
  expect(v.claims_md).toContain("- Demo claim");

  const stored = await getVideo("abc");
  expect(stored?.transcript_json).toHaveLength(1);

  const { answer } = await chatVideo("abc", "what is this about?");
  expect(answer).toContain("Demo answer");
  expect((await getVideo("abc"))?.chat_json).toHaveLength(2);
});

it("second video comes back mixto against the first's saved claims", async () => {
  await filterVideo({ videoId: "one", title: "One", cues: [{ t: 1, text: "a" }] });
  const two = await filterVideo({ videoId: "two", title: "Two", cues: [{ t: 1, text: "b" }] });
  expect(two.verdict).toBe("mixto");
  expect(two.filter_md).toContain("overlap");
});

it("listVideos is newest-first and omits transcript/chat", async () => {
  await filterVideo({ videoId: "old", title: "Old", cues: [{ t: 1, text: "a" }] });
  await filterVideo({ videoId: "new", title: "New", cues: [{ t: 1, text: "b" }] });
  const list = await listVideos();
  expect(list.map((v) => v.id)).toEqual(["new", "old"]);
  expect((list[0] as Record<string, unknown>).transcript_json).toBeUndefined();
});

it("chat on an unknown video throws", async () => {
  await expect(chatVideo("nope", "hi")).rejects.toThrow(/filter this video first/);
});

it("re-filtering a video keeps created_at and chat", async () => {
  const first = await filterVideo({ videoId: "x", title: "X", cues: [{ t: 1, text: "a" }] });
  await chatVideo("x", "q");
  const again = await filterVideo({ videoId: "x", title: "X v2", cues: [{ t: 2, text: "b" }] });
  expect(again.created_at).toBe(first.created_at);
  expect(again.chat_json).toHaveLength(2);
});
