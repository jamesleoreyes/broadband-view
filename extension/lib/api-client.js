/**
 * BroadbandView — API Client
 *
 * Routes API calls through the service worker via chrome.runtime.sendMessage
 * to avoid Chrome's Private Network Access (PNA) restrictions.
 *
 * Content scripts run in the web page's origin (e.g. zillow.com), so fetching
 * localhost directly triggers a "site wants to access local network" prompt
 * and can cause bot detection. The service worker runs in the extension's
 * own context, bypassing PNA entirely.
 */

async function lookupProviders(lat, lng, address) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "API_LOOKUP", lat, lng, address },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.success) {
          reject(new Error(response?.error || "API request failed"));
          return;
        }
        resolve(response.data);
      },
    );
  });
}

async function checkHealth() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "API_HEALTH" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || !response.success) {
        reject(new Error(response?.error || "Health check failed"));
        return;
      }
      resolve(response.data);
    });
  });
}

// Expose globally for other content scripts
window.__broadbandViewApi = { lookupProviders, checkHealth };
