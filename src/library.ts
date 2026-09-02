import { bindSettingsForm, errMsg, renderMarkdown } from "./shared";
import { listVideos } from "./videos";

bindSettingsForm(document.getElementById("settings") as HTMLFormElement);

const list = document.getElementById("list")!;
const err = document.getElementById("err")!;

(async () => {
  try {
    const videos = await listVideos();
    if (!videos.length) {
      list.textContent = "Nothing saved yet. Filter a video from the side panel.";
      return;
    }
    for (const v of videos) {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `<strong></strong> · <span class="verdict"></span><div class="md"></div>`;
      el.querySelector("strong")!.textContent = v.title;
      el.querySelector(".verdict")!.textContent = v.verdict ?? "—";
      const raw = [v.filter_md, v.conclusiones_md && `\n\n## Conclusiones\n${v.conclusiones_md}`]
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
