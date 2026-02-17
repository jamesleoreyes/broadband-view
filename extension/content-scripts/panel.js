/**
 * BroadbandView — Panel Rendering
 *
 * Creates and manages the broadband availability panel
 * injected into Zillow listing pages.
 */

// Technology badge styles (mirrors shared/types.ts TECH_META)
const TECH_BADGES = {
  50: { label: "Fiber", color: "#22c55e", bg: "#f0fdf4" },
  40: { label: "Cable", color: "#3b82f6", bg: "#eff6ff" },
  70: { label: "Fixed Wireless", color: "#f97316", bg: "#fff7ed" },
  71: { label: "Fixed Wireless", color: "#f97316", bg: "#fff7ed" },
  72: { label: "Fixed Wireless", color: "#f97316", bg: "#fff7ed" },
  10: { label: "DSL", color: "#6b7280", bg: "#f9fafb" },
  60: { label: "Satellite", color: "#a855f7", bg: "#faf5ff" },
  61: { label: "Satellite", color: "#a855f7", bg: "#faf5ff" },
  0: { label: "Other", color: "#6b7280", bg: "#f9fafb" },
};

function getSpeedTier(downloadMbps) {
  if (downloadMbps >= 1000) return "Gigabit+";
  if (downloadMbps >= 500) return "Very Fast";
  if (downloadMbps >= 100) return "Fast";
  if (downloadMbps >= 25) return "Good";
  return "Basic";
}

function getSpeedTierClass(tier) {
  return tier.toLowerCase().replace(/[^a-z]/g, "");
}

function formatSpeed(mbps) {
  if (mbps >= 1000) {
    const gbps = mbps / 1000;
    return `${gbps % 1 === 0 ? gbps.toFixed(0) : gbps.toFixed(1)} Gbps`;
  }
  return `${mbps} Mbps`;
}

/**
 * Find the best injection point in the Zillow page for the panel.
 */
function findInsertionTarget() {
  const selectors = [
    // After the home facts section
    '[data-testid="facts-table"]',
    // After the price/summary area
    '[class*="summary-container"]',
    // After the home details container
    "#home-details-content",
    // Near the description
    '[data-testid="description"]',
    // Generic: any section in main content
    "main section",
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  // Ultimate fallback
  return document.querySelector("main") || document.body;
}

function createSkeletonHtml() {
  return `
    <div class="bbv-panel" id="broadband-view-panel">
      <div class="bbv-header">
        <div class="bbv-header-left">
          <svg class="bbv-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
          <h3 class="bbv-title">Internet Providers</h3>
        </div>
        <button class="bbv-toggle" aria-label="Collapse" title="Collapse">&#9650;</button>
      </div>
      <div class="bbv-body">
        <div class="bbv-skeleton">
          <div class="bbv-skeleton-line" style="width: 85%"></div>
          <div class="bbv-skeleton-line" style="width: 65%"></div>
          <div class="bbv-skeleton-line" style="width: 75%"></div>
        </div>
      </div>
    </div>
  `;
}

function createProviderCard(provider) {
  const badge = TECH_BADGES[provider.technology_code] || TECH_BADGES[0];
  const tier = provider.speed_tier || getSpeedTier(provider.max_download_speed);
  const dlFormatted =
    provider.download_formatted || formatSpeed(provider.max_download_speed);
  const ulFormatted =
    provider.upload_formatted || formatSpeed(provider.max_upload_speed);
  const tierClass = getSpeedTierClass(tier);

  return `
    <div class="bbv-provider">
      <div class="bbv-provider-header">
        <span class="bbv-provider-name">${escapeHtml(provider.provider_name)}</span>
        <span class="bbv-tech-badge" style="background:${badge.bg};color:${badge.color};border:1px solid ${badge.color}">
          ${badge.label}
        </span>
      </div>
      <div class="bbv-provider-speeds">
        <span class="bbv-speed">
          <span class="bbv-speed-label">&#x2193;</span> ${dlFormatted}
          <span class="bbv-speed-sep">/</span>
          <span class="bbv-speed-label">&#x2191;</span> ${ulFormatted}
        </span>
        <span class="bbv-tier bbv-tier-${tierClass}">${tier}</span>
      </div>
    </div>
  `;
}

function createEmptyHtml() {
  return `
    <div class="bbv-state bbv-empty">
      <p>No broadband availability data found for this location.</p>
      <p class="bbv-subtext">This may mean the FCC has no data for this Census block, or data hasn't been imported for this state yet.</p>
    </div>
  `;
}

function createErrorHtml(message) {
  return `
    <div class="bbv-state bbv-error">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Main render function — injects the panel and populates it with ISP data.
 */
async function renderPanel(lat, lng, address) {
  // Don't inject if already present
  if (document.getElementById("broadband-view-panel")) return;

  const target = findInsertionTarget();

  // Inject skeleton loading state
  const wrapper = document.createElement("div");
  wrapper.innerHTML = createSkeletonHtml();
  const panel = wrapper.firstElementChild;

  if (target.nextSibling) {
    target.parentNode.insertBefore(panel, target.nextSibling);
  } else {
    target.parentNode.appendChild(panel);
  }

  const body = panel.querySelector(".bbv-body");
  const toggleBtn = panel.querySelector(".bbv-toggle");

  // Toggle collapse/expand
  let collapsed = false;
  toggleBtn.addEventListener("click", () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? "none" : "block";
    toggleBtn.innerHTML = collapsed ? "&#9660;" : "&#9650;";
    toggleBtn.setAttribute("aria-label", collapsed ? "Expand" : "Collapse");
    toggleBtn.setAttribute("title", collapsed ? "Expand" : "Collapse");
  });

  // If we don't have lat/lng, we can't call the API
  if (lat == null || lng == null) {
    body.innerHTML = createErrorHtml(
      "Could not determine coordinates for this listing.",
    );
    return;
  }

  try {
    const { lookupProviders } = window.__broadbandViewApi || {};
    if (!lookupProviders) {
      body.innerHTML = createErrorHtml("API client not loaded.");
      return;
    }

    const response = await lookupProviders(lat, lng, address);

    if (!response.success) {
      body.innerHTML = createErrorHtml(
        response.error || "Lookup failed. Please try again.",
      );
      return;
    }

    const { providers, data_vintage } = response.data;

    if (!providers || providers.length === 0) {
      body.innerHTML = createEmptyHtml();
    } else {
      body.innerHTML =
        providers.map(createProviderCard).join("") +
        `<div class="bbv-footer">
          <a href="https://broadbandmap.fcc.gov" target="_blank" rel="noopener">
            Internet availability data from the FCC Broadband Data Collection
          </a>
          ${data_vintage ? `<span class="bbv-vintage">Data as of ${data_vintage}</span>` : ""}
        </div>`;
    }

    // Notify service worker of provider count (for badge)
    if (chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: "PROVIDER_COUNT",
        count: providers.length,
      });
    }
  } catch (err) {
    console.error("[BroadbandView] API error:", err);
    body.innerHTML = createErrorHtml(
      "Could not load broadband data. Is the API running?",
    );
  }
}

// Expose globally for zillow.js to call
window.__broadbandView = { renderPanel };
