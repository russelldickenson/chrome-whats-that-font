// Track the active state per tab so clicking the toolbar icon toggles font inspection.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  await toggleTab(tab.id);
});

chrome.commands?.onCommand?.addListener?.((command, tab) => {
  if (command === "toggle-font-inspector" && tab?.id) {
    toggleTab(tab.id);
  }
});

async function toggleTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "toggle" });
  } catch (err) {
    if (
      err.message?.includes("Receiving end does not exist") ||
      err.message?.includes("Could not establish connection")
    ) {
      // Content script is not loaded in this tab yet; inject it and try again.
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ["tooltip.css"],
        });
        await chrome.tabs.sendMessage(tabId, { action: "toggle" });
      } catch (injectErr) {
        console.error("Font inspector injection failed:", injectErr);
      }
    } else {
      console.error("Font inspector toggle failed:", err);
    }
  }
}
