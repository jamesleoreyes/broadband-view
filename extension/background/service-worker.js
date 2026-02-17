/**
 * BroadbandView — Service Worker
 *
 * 1. Proxies API requests from content scripts to avoid PNA (Private Network Access)
 *    restrictions. Content scripts run in the web page's origin, which triggers
 *    Chrome's "site wants to access local network" prompt when fetching localhost.
 *    The service worker runs in the extension's own context, bypassing this entirely.
 *
 * 2. Updates the extension badge with ISP count for the current tab.
 */

const API_BASE_URL = "http://localhost:3001";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // --- API Proxy: lookup ---
  if (message.type === "API_LOOKUP") {
    fetch(`${API_BASE_URL}/api/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: message.lat,
        lng: message.lng,
        address: message.address,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    // Return true to indicate we'll call sendResponse asynchronously
    return true;
  }

  // --- API Proxy: health check ---
  if (message.type === "API_HEALTH") {
    fetch(`${API_BASE_URL}/api/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
        return res.json();
      })
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true;
  }

  // --- Badge update ---
  if (message.type === "PROVIDER_COUNT" && sender.tab?.id) {
    const count = message.count;
    chrome.action.setBadgeText({
      text: count > 0 ? String(count) : "",
      tabId: sender.tab.id,
    });
    chrome.action.setBadgeBackgroundColor({
      color: count > 0 ? "#22c55e" : "#94a3b8",
      tabId: sender.tab.id,
    });
  }
});

// Clear badge when navigating away from a listing
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});
