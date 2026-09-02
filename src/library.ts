import { bindSettingsForm, errMsg, renderMarkdown, settings, UI } from "./shared";
import { verdictLabel } from "./schema";
import { listVideos } from "./videos";

bindSettingsForm(document.getElementById("settings") as HTMLFormElement);

const list = document.getElementById("list")!;
const err = document.getElementById("err")!;

(async () => {
  const { lang } = await settings();
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
