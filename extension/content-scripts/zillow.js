/**
 * BroadbandView — Zillow Content Script
 *
 * Extracts property address + coordinates from Zillow listing pages
 * using a prioritized extraction strategy, then triggers panel injection.
 */

(function () {
  "use strict";

  // --- Address String Parser ---

  /**
   * Parse "757 Painted Lady Ct, Rock Hill, SC 29732" into components.
   */
  function parseAddressString(str) {
    if (!str) return null;
    const match = str.match(
      /^(.+?),\s*(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/,
    );
    if (!match) return null;
    return {
      streetAddress: match[1].trim(),
      city: match[2].trim(),
      state: match[3],
      zip: match[4],
    };
  }

  function formatAddress(parts) {
    if (!parts) return "";
    return [parts.streetAddress, parts.city, parts.state, parts.zip]
      .filter(Boolean)
      .join(", ");
  }

  // --- Extraction Strategies ---

  const strategies = {
    /**
     * Strategy 1 (Primary): JSON-LD structured data
     * Most reliable — tied to SEO, unlikely to be removed.
     */
    jsonLd() {
      const scripts = document.querySelectorAll(
        'script[type="application/ld+json"]',
      );
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          const items = Array.isArray(data) ? data : [data];

          for (const item of items) {
            let listing = null;

            // Direct RealEstateListing
            if (item["@type"] === "RealEstateListing") {
              listing = item;
            }
            // ItemList (search overlay with listing)
            else if (item["@type"] === "ItemList") {
              listing = item.itemListElement?.[0]?.item;
            }

            if (!listing) continue;

            // Navigate: offers → itemOffered → address/geo
            const offered = listing.offers?.itemOffered || listing;
            const address = offered?.address;
            const geo = offered?.geo;

            if (geo?.latitude && geo?.longitude) {
              return {
                lat: parseFloat(geo.latitude),
                lng: parseFloat(geo.longitude),
                address: address
                  ? formatAddress({
                      streetAddress: address.streetAddress,
                      city: address.addressLocality,
                      state: address.addressRegion,
                      zip: address.postalCode,
                    })
                  : "",
                source: "json-ld",
              };
            }
          }
        } catch {
          // Invalid JSON, skip
        }
      }
      return null;
    },

    /**
     * Strategy 2 (Fallback): DOM + __NEXT_DATA__
     * Extract address from H1, coordinates from Next.js hydration data.
     */
    domNextData() {
      // Try to get address from H1
      const h1 = document.querySelector("h1");
      const addressText = h1?.textContent?.trim();
      if (!addressText) return null;

      // Try to get lat/lng from __NEXT_DATA__
      const nextDataEl = document.getElementById("__NEXT_DATA__");
      if (nextDataEl) {
        try {
          const nextData = JSON.parse(nextDataEl.textContent);
          const cache =
            nextData?.props?.pageProps?.componentProps?.gdpClientCache;
          if (cache) {
            const firstKey = Object.keys(cache)[0];
            const property = cache[firstKey]?.property;
            if (property?.latitude && property?.longitude) {
              return {
                lat: property.latitude,
                lng: property.longitude,
                address: addressText,
                source: "dom-nextdata",
              };
            }
          }
        } catch {
          // Parse error, continue
        }
      }

      // DOM only (no coordinates — API will need to geocode)
      const parsed = parseAddressString(addressText);
      if (parsed) {
        return {
          lat: null,
          lng: null,
          address: formatAddress(parsed),
          source: "dom-only",
        };
      }

      return null;
    },

    /**
     * Strategy 3 (Fallback): URL pattern
     * Zillow URLs: /homedetails/{address-slug}/{zpid}_zpid/
     */
    urlPattern() {
      const match = window.location.pathname.match(
        /\/homedetails\/([^/]+)\/(\d+)_zpid/,
      );
      if (!match) return null;

      const addressSlug = match[1];
      // Convert slug: "757-Painted-Lady-Ct-Rock-Hill-SC-29732" → "757 Painted Lady Ct Rock Hill SC 29732"
      const address = addressSlug.replace(/-/g, " ");

      return {
        lat: null,
        lng: null,
        address,
        source: "url",
      };
    },

    /**
     * Strategy 4 (Last resort): Page title
     * Format: "757 Painted Lady Ct, Rock Hill, SC 29732 | MLS #... | Zillow"
     */
    pageTitle() {
      const title = document.title;
      const addressPart = title.split("|")[0]?.trim();
      if (!addressPart) return null;

      const parsed = parseAddressString(addressPart);
      if (parsed) {
        return {
          lat: null,
          lng: null,
          address: formatAddress(parsed),
          source: "title",
        };
      }
      return null;
    },
  };

  /**
   * Try all strategies in priority order.
   */
  function extractPropertyData() {
    for (const [name, strategy] of Object.entries(strategies)) {
      const result = strategy();
      if (result) {
        console.log(
          `[BroadbandView] Extracted via ${result.source}:`,
          result.address,
          result.lat ? `(${result.lat}, ${result.lng})` : "(no coords)",
        );
        return result;
      }
    }
    console.warn("[BroadbandView] Could not extract property data from page");
    return null;
  }

  /**
   * Remove any existing BroadbandView panel.
   */
  function removeExistingPanel() {
    const existing = document.getElementById("broadband-view-panel");
    if (existing) existing.remove();
  }

  /**
   * Main initialization: extract data → render panel.
   */
  function initBroadbandView() {
    // Don't re-inject if already present
    if (document.getElementById("broadband-view-panel")) return;

    const propertyData = extractPropertyData();
    if (!propertyData) return;

    const { renderPanel } = window.__broadbandView || {};
    if (!renderPanel) {
      console.error("[BroadbandView] Panel renderer not loaded");
      return;
    }

    renderPanel(propertyData.lat, propertyData.lng, propertyData.address);
  }

  // --- Retry Init (wait for Zillow's React hydration) ---

  /**
   * Poll for property data until it's available or we give up.
   * Zillow's SPA may not have rendered JSON-LD / __NEXT_DATA__ yet
   * when our content script first runs at document_idle.
   */
  function initWithRetry(maxAttempts = 15, intervalMs = 500) {
    let attempts = 0;

    function tryInit() {
      attempts++;

      // Already rendered by a previous attempt or SPA nav
      if (document.getElementById("broadband-view-panel")) return;

      const propertyData = extractPropertyData();

      if (propertyData) {
        const { renderPanel } = window.__broadbandView || {};
        if (renderPanel) {
          renderPanel(propertyData.lat, propertyData.lng, propertyData.address);
          return;
        }
      }

      if (attempts < maxAttempts) {
        setTimeout(tryInit, intervalMs);
      }
    }

    tryInit();
  }

  // --- Helpers ---

  function isListingPage(url) {
    return url.includes("/homedetails/");
  }

  // --- SPA Navigation Detection ---
  // Zillow uses history.pushState to open listing modals over the search
  // page — no real page load occurs. Content scripts can't intercept
  // pushState directly (isolated world), so we poll the URL to detect
  // changes. The interval is lightweight (~0 cost when URL hasn't changed).

  let lastUrl = window.location.href;
  let lastWasListing = isListingPage(lastUrl);

  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;

    const previousUrl = lastUrl;
    lastUrl = currentUrl;
    const nowIsListing = isListingPage(currentUrl);

    // Navigated away from a listing (closed modal / went back to search)
    if (!nowIsListing && lastWasListing) {
      removeExistingPanel();
    }

    // Navigated to a listing (opened modal or switched listing)
    if (nowIsListing) {
      removeExistingPanel();
      initWithRetry();
    }

    lastWasListing = nowIsListing;
  }, 300);

  // --- Initial Run (only on listing pages) ---

  if (isListingPage(window.location.href)) {
    initWithRetry();
  }
})();
