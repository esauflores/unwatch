# unwatch

Skip a YouTube video from its captions. Filter → ask → save bullets.

Oliver runs 10–15 videos/podcasts a day and doesn't watch them. In Claude that
loop is ~10 min each: summary → skip if it's more of the same → ask what he
actually cares about. unwatch puts that on the watch page as a side panel plus a
chat page.

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
4. Click the unwatch icon (side panel)
5. **Library & settings** → pick a provider + paste an LLM key, Save
6. **Extract from this video** — verdict + claim bullets. **Chat** (header) opens the chat page in a new tab

After every `pnpm build`, hit the reload ↻ on the extension card.

## Real model

Library → **Provider** (`anthropic` / `openai` / `gemini`) + **LLM key** +
optional **Model**, Save. Then Extract again. Defaults: Anthropic
`claude-sonnet-5`, OpenAI `gpt-5-mini`, Gemini `gemini-3.5-flash`.

The **Model** box autocompletes from the provider's own `/v1/models` once a key
is set (falls back to a short built-in list); it's free text, so any id works.

**Language** (Library → `English` / `Español`, default English) switches both the
panel labels and the language the model answers in. One mode at a time, no mixing.

The key is stored **unencrypted in this browser** (`chrome.storage.local`, same
as a `.env` file) and is sent only to the provider you pick. Use a key with a
spend cap.

## What it does

- One click on `youtube.com/watch`: transcript from the page → one BYOK call
  → markdown (verdict + claim bullets). No captions → one-line error, stop.
- Verdict is **vs your own saved bullets**, not "AI videos in general":
  `new`/`nuevo` | `seen`/`ya_visto` | `mixed`/`mixto` (per language). First video:
  no past list.
- Chat on a separate page (`chat.html?v=…`, deep-chat UI) against **this**
  transcript + the extract (stuffed, no RAG). Answers cite `t=MM:SS`; the
  timestamp seeks the YouTube tab. Chat has the extract too, so "revise the
  bullets" works.
- **Library**: saved videos — collapsed extract, copy, download transcript
  (`.txt`, `[M:SS]` lines), delete — plus settings.

One stored row per video is both the library and the novelty pile:
`id, title, created_at, verdict, filter_md, claims_md, transcript_json, chat_json`

Out of scope: slide OCR / frame extraction, RAG / embeddings, transcription when
there are no captions, Spotify / Apple / paste-a-URL, a search box or cards UI,
prompt cache / multi-user accounts, map-reduce for long videos. A hosted Hono +
D1 backend (for a shared library across devices) is the plausible next step —
`videos.ts` is already the route-handler shape.

## Layout

```
src/
  manifest.json  styles.css  icon.svg → icon-{16,32,48,128}.png
  background.ts   service worker: opens the side panel on the action click
  content.ts      videoId/title/duration + transcript (youtube-transcript lib,
                  DOM transcript-panel scrape as fallback)
  sidepanel.ts    extract + result card                (+ sidepanel.html)
  chat.ts         chat on one video                    (+ chat.html, deep-chat UI)
  library.ts      saved list + settings                (+ library.html)
  shared.ts       settings in chrome.storage.local
  videos.ts       store + orchestration (filter/chat/list/get)
  llm.ts          BYOK via Vercel AI SDK: anthropic | openai | gemini | demo
  prompt.ts       filter / chat prompts
  schema.ts       types + pure helpers
  *.test.ts       pure logic + the demo flow through a stubbed storage
```

`pnpm test` · `pnpm typecheck`
