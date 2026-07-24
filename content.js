(function () {
  "use strict";

  // Avoid duplicate injection if the extension reloads.
  if (window.__whatsThatFontInitialized) return;
  window.__whatsThatFontInitialized = true;

  let active = false;
  let hoverTarget = null;
  let tooltipEl = null;

  const TOOLTIP_ID = "__fontTooltip";

  function createTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.id = TOOLTIP_ID;
    tooltipEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function destroyTooltip() {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
    hoverTarget = null;
  }

  function getFontFamily(style) {
    const raw = style.fontFamily || "";
    if (!raw) return "default";
    // Return the first listed font family, without quotes.
    return raw
      .split(",")[0]
      .trim()
      .replace(/^['"]/, "")
      .replace(/['"]$/, "");
  }

  function getFontSize(style) {
    const raw = style.fontSize || "";
    if (!raw) return "unknown";

    if (raw.endsWith("px")) {
      const px = parseFloat(raw);
      return `${Math.round(px * 10) / 10}px`;
    }

    // Convert computed non-px sizes to px for clarity.
    const pxValue = parseFloat(style.fontSize);
    if (!Number.isNaN(pxValue)) {
      return `${Math.round(pxValue * 10) / 10}px`;
    }
    return raw;
  }

  function getFontWeight(style) {
    return style.fontWeight || "normal";
  }

  function updateTooltipContent(el) {
    const tooltip = createTooltip();
    if (!el) {
      tooltip.style.display = "none";
      return;
    }

    const style = window.getComputedStyle(el);
    const family = getFontFamily(style);
    const size = getFontSize(style);
    const weight = getFontWeight(style);

    tooltip.innerHTML = `
      <div class="wtf-heading">What's That Font?</div>
      <div class="wtf-row"><span class="wtf-label">Font</span><span class="wtf-value wtf-font">${escapeHtml(family)}</span></div>
      <div class="wtf-row"><span class="wtf-label">Size</span><span class="wtf-value">${escapeHtml(size)}</span></div>
      <div class="wtf-row"><span class="wtf-label">Weight</span><span class="wtf-value">${escapeHtml(weight)}</span></div>
    `;

    tooltip.style.display = "block";
  }

  function positionTooltip(clientX, clientY) {
    const tooltip = tooltipEl;
    if (!tooltip) return;

    // Position near the cursor but keep the tooltip on screen.
    const gap = 12;
    const rect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = clientX + gap;
    let top = clientY + gap;

    if (left + rect.width > viewportWidth) {
      left = clientX - rect.width - gap;
    }
    if (top + rect.height > viewportHeight) {
      top = clientY - rect.height - gap;
    }
    if (left < 0) left = gap;
    if (top < 0) top = gap;

    tooltip.style.left = `${left + window.scrollX}px`;
    tooltip.style.top = `${top + window.scrollY}px`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function onMouseMove(event) {
    if (!active) return;

    const { clientX, clientY } = event;
    const target = document.elementFromPoint(clientX, clientY);

    if (target && target !== hoverTarget) {
      hoverTarget = target;
      updateTooltipContent(target);
    }

    positionTooltip(clientX, clientY);
  }

  function onScroll() {
    if (!active || !hoverTarget) return;
    const rect = hoverTarget.getBoundingClientRect();
    positionTooltip(rect.left + rect.width / 2, rect.top);
  }

  function setActive(isActive) {
    active = isActive;
    if (active) {
      document.addEventListener("mousemove", onMouseMove, {
        passive: true,
      });
      document.addEventListener("scroll", onScroll, { passive: true });
    } else {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("scroll", onScroll);
      destroyTooltip();
    }
  }

  chrome.runtime?.onMessage?.addListener?.((message) => {
    if (message?.action === "toggle") {
      window.__fontInspectorActive = !window.__fontInspectorActive;
      showToast(window.__fontInspectorActive);
      setActive(window.__fontInspectorActive);
    }
  });

  function showToast(isActive) {
    let toast = document.getElementById("__fontInspectorToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "__fontInspectorToast";
      toast.style.cssText =
        "position:fixed;top:16px;right:16px;z-index:2147483647;background:#222;color:#fff;padding:8px 14px;border-radius:6px;font-family:sans-serif;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.25);pointer-events:none;transition:opacity 0.2s;";
      document.body.appendChild(toast);
    }
    toast.textContent = isActive
      ? "Font inspector enabled"
      : "Font inspector disabled";
    toast.style.opacity = "1";
    setTimeout(() => {
      toast.style.opacity = "0";
    }, 1500);
  }

  // Restore state when the content script is re-injected.
  if (window.__fontInspectorActive) {
    setActive(true);
  }
})();
