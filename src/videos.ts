import { complete, defaults, type Provider } from "./llm";
import { chatMessages, filterMessages } from "./prompt";
import { type Cue, extractClaimsMd, type ListItem, listItem, parseVerdict, type Video } from "./schema";
import { settings } from "./shared";

const KEY = "videos";

async function load(): Promise<Video[]> {
  const r = await chrome.storage.local.get(KEY);
  return Array.isArray(r[KEY]) ? (r[KEY] as Video[]) : [];
}

async function save(videos: Video[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: videos });
}

function put(videos: Video[], video: Video): Video[] {
  const i = videos.findIndex((v) => v.id === video.id);
  if (i === -1) videos.push(video);
  else videos[i] = video;
  return videos;
}

async function llmOpts() {
  const s = await settings();
  const provider = (s.provider || "anthropic") as Provider;
  const model = s.model || (provider !== "demo" ? defaults[provider] : "demo");
  return { provider, apiKey: s.llmKey, model, demo: provider === "demo", lang: s.lang };
}

export async function getVideo(id: string): Promise<Video | undefined> {
  return (await load()).find((v) => v.id === id);
}

export async function listVideos(): Promise<ListItem[]> {
  return [...(await load())].reverse().map(listItem);
}

export async function filterVideo(input: { videoId: string; title: string; cues: Cue[] }): Promise<Video> {
  const videos = await load();
  const existing = videos.find((v) => v.id === input.videoId);
  const past = videos
    .filter((v) => v.id !== input.videoId && v.claims_md)
    .slice(-50)
    .map((v) => ({ title: v.title, claims_md: v.claims_md }));

  const { lang, ...llm } = await llmOpts();
  const filter_md = await complete({ ...llm, messages: filterMessages(input.title, input.cues, past, lang) });

  const video: Video = {
    id: input.videoId,
    title: input.title,
    created_at: existing?.created_at ?? new Date().toISOString(),
    verdict: parseVerdict(filter_md),
    filter_md,
    claims_md: extractClaimsMd(filter_md),
    transcript_json: input.cues,
    chat_json: existing?.chat_json ?? [],
  };
  await save(put(videos, video));
  return video;
}

export async function chatVideo(id: string, message: string): Promise<{ answer: string }> {
  const videos = await load();
  const video = videos.find((v) => v.id === id);
  if (!video) throw new Error("filter this video first");
  const { lang, ...llm } = await llmOpts();
  const answer = await complete({
    ...llm,
    messages: chatMessages(video.title, video.filter_md, video.transcript_json, video.chat_json, message, lang),
  });
  video.chat_json.push({ role: "user", content: message }, { role: "assistant", content: answer });
  await save(videos);
  return { answer };
}
