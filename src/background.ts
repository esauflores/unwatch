chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "unwatch:pr") return;
  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse(null);
    return;
  }
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const el = document.getElementById("movie_player") as any;
        try {
          return el?.getPlayerResponse?.() ?? el?.playerResponse ?? (window as any).ytInitialPlayerResponse ?? null;
        } catch {
          return (window as any).ytInitialPlayerResponse ?? null;
        }
      },
    })
    .then((r) => sendResponse(r?.[0]?.result ?? null), () => sendResponse(null));
  return true;
});
