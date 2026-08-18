// Per-tab active state, persisted in session storage so it survives
// service-worker restarts (but not browser restarts).
const STORAGE_KEY = "activeTabs";

async function getActiveTabs() {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  return data[STORAGE_KEY] || {};
}

async function setTabActive(tabId, isActive) {
  const activeTabs = await getActiveTabs();
  if (isActive) {
    activeTabs[tabId] = true;
  } else {
    delete activeTabs[tabId];
  }
  await chrome.storage.session.set({ [STORAGE_KEY]: activeTabs });
  updateBadge(tabId, isActive);
}

function updateBadge(tabId, isActive) {
  chrome.action.setBadgeText({ tabId, text: isActive ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#38bdf8" });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  await toggleTab(tab.id);
});

chrome.commands?.onCommand?.addListener?.((command, tab) => {
  if (command === "toggle-font-inspector" && tab?.id) {
    toggleTab(tab.id);
  }
});

// Lets a freshly-loaded content script (e.g. after navigation) ask whether
// the inspector should be active on its tab.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "getState") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ active: false });
      return;
    }
    getActiveTabs().then((activeTabs) => {
      sendResponse({ active: !!activeTabs[tabId] });
    });
    return true; // keep the message channel open for the async response
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const activeTabs = await getActiveTabs();
  if (tabId in activeTabs) {
    delete activeTabs[tabId];
    await chrome.storage.session.set({ [STORAGE_KEY]: activeTabs });
  }
});

async function toggleTab(tabId) {
  const activeTabs = await getActiveTabs();
  const nextActive = !activeTabs[tabId];

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: "setActive",
      active: nextActive,
    });
    await setTabActive(tabId, nextActive);
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
        await chrome.tabs.sendMessage(tabId, {
          action: "setActive",
          active: nextActive,
        });
        await setTabActive(tabId, nextActive);
      } catch (injectErr) {
        console.error("Font inspector injection failed:", injectErr);
      }
    } else {
      console.error("Font inspector toggle failed:", err);
    }
  }
}
