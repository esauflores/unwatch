// One tab strip under `root`: `<button class="tab" data-view="X">` buttons and
// `<* class="tab-panel" data-view="X">` panels. Clicking a button shows its panel
// (the rest get `hidden`) and marks it active; disabled buttons do nothing.
// Returns the show fn so callers can switch tabs programmatically.
export function initTabs(
  root: ParentNode,
  opts: { onShow?: (view: string) => void; initial?: string } = {},
): (view: string) => void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("button.tab[data-view]")];
  const panels = [...root.querySelectorAll<HTMLElement>(".tab-panel[data-view]")];

  function show(view: string): void {
    for (const p of panels) p.hidden = p.dataset.view !== view;
    for (const b of buttons) b.classList.toggle("active", b.dataset.view === view);
    opts.onShow?.(view);
  }

  for (const b of buttons) b.addEventListener("click", () => b.disabled || show(b.dataset.view!));
  show(opts.initial ?? buttons[0]?.dataset.view ?? "");
  return show;
}
