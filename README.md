# Unwatch

Skip a YouTube video from its captions. Filter → ask → save bullets.

Oliver runs 10–15 videos/podcasts a day and doesn't watch them. In Claude that
loop is ~10 min each: summary → skip if it's more of the same → ask what he
actually cares about. Unwatch puts that on the watch page as a side panel with
**Extract**, **Chat** and **Download** tabs.

A Chrome MV3 extension, TypeScript, bundled with esbuild. **No server:** the LLM
call is BYOK straight from the extension (via the Vercel AI SDK), and every video
is one row in `chrome.storage.local`. Providers: `anthropic` (default) / `openai`
/ `gemini`. (`demo` — a keyless stub — still exists for tests but isn't in the UI.)

## Build & load

```sh
pnpm install
pnpm build          # → dist/   (pnpm watch to rebuild on save)
```

1. Chrome → `chrome://extensions` → Developer mode
2. Load unpacked → `dist/`
3. Open a YouTube watch page that has captions
4. Click the Unwatch icon (side panel)
5. **Library & settings** → pick a provider + paste an LLM key, Save
6. **Extract from this video** — verdict + claim bullets. **Chat** and **Download** tabs unlock after

After every `pnpm build`, hit the reload ↻ on the extension card.

## Real model

Library → **Provider** (`anthropic` / `openai` / `gemini`) + **LLM key** +
optional **Model**, Save. Then Extract again. Defaults: Anthropic
`claude-sonnet-5`, OpenAI `gpt-5-mini`, Gemini `gemini-3.5-flash`.

The **Model** box autocompletes from the provider's own `/v1/models` once a key
is set (falls back to a short built-in list); it's free text, so any id works.

**Language** (Library → `English` / `Español`, default English) switches both the
panel labels and the language the model answers in. One mode at a time, no mixing.

**Prompts** — Library has an editable **Extract prompt** and **Chat prompt**, each
with a per-language default and a **Reset prompts** button. `{verdict}` / `{overlap}`
(extract) and `{title}` (chat) are filled in; `Respond in <lang>` and the transcript
blocks are appended automatically. An untouched box follows the Language selector;
once you edit it, it stays as written. Stored as `""` while it matches the default.

The key is stored **unencrypted in this browser** (`chrome.storage.local`, same
as a `.env` file) and is sent only to the provider you pick. Use a key with a
spend cap.

## What it does

- One click on `youtube.com/watch`: transcript from the page → one BYOK call
  → markdown (verdict + claim bullets). No captions → one-line error, stop.
- Verdict is **vs your own saved bullets**, not "AI videos in general":
  `new`/`nuevo` | `seen`/`ya_visto` | `mixed`/`mixto` (per language). First video:
  no past list.
- **Chat** tab (side panel, deep-chat UI) against **this** transcript + the
  extract (stuffed, no RAG). Answers cite `t=MM:SS`; Chat has the extract too, so
  "revise the bullets" works. Unlocks once the video is extracted.
- **Download** tab: one button each for transcript (`.txt`, `[M:SS]`), extract
  (`.md`), and chat (`.md`) of the current video.
- **Library**: saved videos — collapsed extract, copy, download transcript,
  delete — plus settings.

One stored row per video is both the library and the novelty pile:
`id, title, created_at, verdict, filter_md, claims_md, transcript_json, chat_json`

Out of scope: slide OCR / frame extraction, RAG / embeddings, transcription when
there are no captions, Spotify / Apple / paste-a-URL, a search box or cards UI,
prompt cache / multi-user accounts, map-reduce for long videos. A hosted Hono +
D1 backend (for a shared library across devices) is the plausible next step —
`videos.ts` is already the route-handler shape.

## How it works

1. **`content.ts`** runs on every `youtube.com/*` page: reads `videoId` / title /
   duration, and on request pulls the transcript — `youtube-transcript` (lib)
   first, then scrapes YouTube's own "Show transcript" panel if that returns an
   empty body (PoToken-gated videos).
2. **Extract this video** (side panel) → `sidepanel.ts` asks the tab for the
   transcript, then `videos.ts#filterVideo`: `prompt.ts` builds the prompt from
   the transcript + the claim bullets of your last ~50 saved videos → one
   `generateText` call in `llm.ts` (Vercel AI SDK, your key) → first line parsed
   into a verdict → row saved to `chrome.storage.local` → card rendered. The
   **Chat** tab unlocks.
3. **Chat** tab → `sidepanel.ts` wires a deep-chat widget seeded with the stored
   history; each message runs `videos.ts#chatVideo` with a system prompt of
   **full transcript + current extract** — so answers cite `t=MM:SS` and
   "rewrite the bullets" works. Turns are appended to the row.
4. **`library.ts`** lists the rows (collapsed extract, copy, download transcript,
   delete) and owns the provider / model / key / language form.

## Layout

```
src/
  manifest.json  styles.css  icon.svg → icon-{16,32,48,128}.png
  pages/                                  esbuild entry points (+ their .html)
    background.ts  service worker: opens the side panel on the action click
    content.ts     videoId/title/duration + transcript + SPA-nav ping
                   (youtube-transcript lib, DOM panel scrape as fallback)
    sidepanel.ts   Extract | Chat | Download tabs        (+ sidepanel.html)
    library.ts     saved list + settings                 (+ library.html)
  lib/                                     shared, no DOM entry of its own
    schema.ts      types + pure helpers
    i18n.ts        Lang + the UI string table
    settings.ts    chrome.storage.local settings + the settings form
    markdown.ts    the tiny markdown → DOM renderer
    prompt.ts      filter / chat prompt assembly
    llm.ts         BYOK via Vercel AI SDK: anthropic | openai | gemini | demo
    videos.ts      store + orchestration (filter/chat/list/get/delete)
    util.ts        errMsg
  test/            pure logic + the demo flow through a stubbed storage
```

Imports use the `@/` alias for `src/` (`tsconfig.json` `paths`, mirrored in
`vitest.config.ts`; esbuild reads it from tsconfig).

`pnpm test` · `pnpm typecheck`
