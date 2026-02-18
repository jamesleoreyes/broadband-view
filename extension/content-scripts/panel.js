/**
 * BroadbandView — Panel Rendering
 *
 * Injects an "Internet Providers" section into Zillow listing pages,
 * matching Zillow's native section styling (divider → h2 → content).
 * Falls back to a floating overlay if the inline target isn't found.
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
 * Find the "Facts & features" section container by searching for its h2.
 * Returns the container div (h2's parent) so we can insert after it.
 */
function findSectionTarget() {
  const h2s = document.querySelectorAll("h2");
  for (const h2 of h2s) {
    const text = h2.textContent.trim();
    if (text === "Facts & features") {
      return h2.parentElement;
    }
  }
  // Fallback: try "What's special" if "Facts & features" isn't present
  for (const h2 of h2s) {
    if (h2.textContent.trim() === "What's special") {
      return h2.parentElement;
    }
  }
  return null;
}

/**
 * Create the inline section HTML matching Zillow's native section structure.
 */
function createSectionHtml() {
  return `
    <div id="broadband-view-panel" class="bbv-section">
      <div class="bbv-section-divider" role="separator"></div>
      <h2 class="bbv-section-heading">Internet Providers</h2>
      <div class="bbv-section-body">
        <div class="bbv-skeleton">
          <div class="bbv-skeleton-line" style="width: 85%"></div>
          <div class="bbv-skeleton-line" style="width: 65%"></div>
          <div class="bbv-skeleton-line" style="width: 75%"></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Create the floating panel HTML (fallback when inline target isn't found).
 */
function createFloatingHtml() {
  return `
    <div id="broadband-view-panel" class="bbv-panel bbv-panel-floating">
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
  const tier =
    provider.speed_tier || getSpeedTier(provider.max_download_speed);
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
 * Main render function.
 *
 * Tries to inject as a native Zillow section after "Facts & features".
 * Retries finding the target for up to 5 seconds (modal may still be rendering).
 * Falls back to a floating overlay if the target is never found.
 */
async function renderPanel(lat, lng, address) {
  if (document.getElementById("broadband-view-panel")) return;

  // Try to find inline target, retrying for up to 5s (10 × 500ms)
  let target = null;
  for (let i = 0; i < 10; i++) {
    target = findSectionTarget();
    if (target) break;
    await new Promise((r) => setTimeout(r, 500));
    // Another call may have rendered in the meantime
    if (document.getElementById("broadband-view-panel")) return;
  }

  // Build the panel
  const wrapper = document.createElement("div");
  const isInline = !!target;

  if (isInline) {
    wrapper.innerHTML = createSectionHtml();
  } else {
    wrapper.innerHTML = createFloatingHtml();
  }
  const panel = wrapper.firstElementChild;

  // Inject
  if (isInline) {
    target.insertAdjacentElement("afterend", panel);
  } else {
    document.body.appendChild(panel);
  }

  // Content container differs between inline and floating
  const body =
    panel.querySelector(".bbv-section-body") ||
    panel.querySelector(".bbv-body");

  // Set up toggle for floating mode
  const toggleBtn = panel.querySelector(".bbv-toggle");
  if (toggleBtn) {
    let collapsed = false;
    const floatingBody = panel.querySelector(".bbv-body");
    toggleBtn.addEventListener("click", () => {
      collapsed = !collapsed;
      floatingBody.style.display = collapsed ? "none" : "block";
      toggleBtn.innerHTML = collapsed ? "&#9660;" : "&#9650;";
      toggleBtn.setAttribute(
        "aria-label",
        collapsed ? "Expand" : "Collapse",
      );
      toggleBtn.setAttribute("title", collapsed ? "Expand" : "Collapse");
    });
  }

  // Bail if we have nothing to look up
  if (lat == null && lng == null && !address) {
    body.innerHTML = createErrorHtml(
      "Could not determine location for this listing.",
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
