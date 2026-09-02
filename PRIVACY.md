# Privacy Policy — Unwatch

_Last updated: 2026-09-02_

Unwatch is a Chrome extension that extracts a skip/keep verdict and claim
bullets from a YouTube video's transcript and lets you chat with it, using an
LLM API key you provide.

## There is no Unwatch server

Unwatch has no backend. It does not send your data to the developer or to any
third party other than the LLM provider you explicitly choose.

## What is stored, and where

Everything is stored **locally in your browser** via `chrome.storage.local`.
Nothing is uploaded anywhere by the extension itself.

- **Your LLM API key** — stored unencrypted in `chrome.storage.local` (the same
  trust level as a `.env` file on your machine). Used only to authenticate the
  requests you trigger. Use a key with a spend cap.
- **Settings** — provider, model id, interface language, and your edited
  prompts.
- **Saved videos** — for each video you run: its id, title, timestamp, the
  verdict, the extract and claim bullets, the transcript, and your chat history.

You can delete any saved video from the Library, and clearing the extension's
storage (or removing the extension) erases all of it.

## What is sent to your LLM provider

When you click **Extract from this video** or send a **Chat** message, Unwatch
sends the following directly from your browser to the provider you selected
(Anthropic, OpenAI, Google Gemini, or the OpenAI-compatible endpoint whose base
URL you typed), authenticated with your key:

- the current video's transcript and title
- the claim bullets of your recently saved videos (Extract only, for the
  novelty comparison)
- the current extract and your chat messages (Chat only)

That request is governed by the privacy policy and data-use terms of the
provider you chose. Unwatch does not receive a copy.

## Permissions

- **`activeTab` + access to `youtube.com`** — read the transcript, title, and
  duration of the watch page you are on.
- **`storage` / `unlimitedStorage`** — save the data described above locally.
- **`sidePanel`** — render the extension UI.
- **Host access to `api.anthropic.com`, `api.openai.com`,
  `generativelanguage.googleapis.com`** — send the LLM requests you trigger.
- **Optional host access** — granted only if you pick the `custom` provider, and
  only for the single host of the base URL you typed. Chrome asks before granting
  it; declining leaves the setting unsaved. Nothing is sent anywhere else.

## No tracking

Unwatch contains no analytics, no telemetry, and no advertising. It does not
collect, transmit, or sell personal information.

## Contact

Questions or issues: <https://github.com/esauflores/unwatch/issues>
