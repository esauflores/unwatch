import { bindSettingsForm, errMsg, renderMarkdown, settings, UI } from "./shared";
import { verdictLabel } from "./schema";
import { listVideos } from "./videos";

const form = document.getElementById("settings") as HTMLFormElement;
bindSettingsForm(form);

// ponytail: curated hints, not a live list — the field is free text, so a stale
// entry costs nothing. First id of each is the default used when the field is blank.
const MODEL_HINTS: Record<string, string[]> = {
  anthropic: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-sonnet-5", "claude-opus-4-8"],
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  demo: [],
};
const datalist = document.getElementById("model-suggestions") as HTMLDataListElement;
const modelInput = form.elements.namedItem("model") as HTMLInputElement;
const providerSelect = form.elements.namedItem("provider") as HTMLSelectElement;
function refreshModelHints(): void {
  const ids = MODEL_HINTS[providerSelect.value] ?? [];
  datalist.replaceChildren(...ids.map((id) => Object.assign(document.createElement("option"), { value: id })));
  modelInput.placeholder = ids[0] || "default for provider";
}
providerSelect.addEventListener("change", refreshModelHints);

const list = document.getElementById("list")!;
const err = document.getElementById("err")!;

(async () => {
  const { lang, provider } = await settings();
  providerSelect.value = provider;
  refreshModelHints();
  const t = UI[lang];
  try {
    const videos = await listVideos();
    if (!videos.length) {
      list.textContent = "Nothing saved yet. Filter a video from the side panel.";
      return;
    }
    for (const v of videos) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<div class="item-head"><strong></strong><span class="verdict"></span></div><div class="md"></div>`;
      el.querySelector("strong")!.textContent = v.title;
      const tag = el.querySelector(".verdict") as HTMLElement;
      tag.textContent = verdictLabel(v.verdict, lang);
      if (v.verdict) tag.dataset.v = v.verdict;
      const raw = [v.filter_md, v.conclusiones_md && `\n\n## ${t.notes}\n${v.conclusiones_md}`]
        .filter(Boolean)
        .join("");
      renderMarkdown(el.querySelector(".md")!, raw);
      const copy = document.createElement("button");
      copy.textContent = "Copy";
      copy.onclick = () => navigator.clipboard.writeText(raw);
      el.append(copy);
      list.append(el);
    }
  } catch (e) {
    err.textContent = errMsg(e);
  }
})();
