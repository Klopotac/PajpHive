// ui.js — Shared UI utilities

// Generate a short random invite code (also kept in db.js to avoid circular imports)
export function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Generate a unique local ID for offline records
export function generateLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// Format a Firestore Timestamp or JS Date as readable string
export function formatDate(ts) {
  if (!ts) return "Never";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Format as date + time
export function formatDateTime(ts) {
  if (!ts) return "Never";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Show a temporary status message in an element
export function showMsg(el, msg, isError = false) {
  if (!el) return;
  el.textContent = msg;
  el.className = isError ? "error-msg" : "success-msg";
}

// Copy text to clipboard — works on HTTP (non-HTTPS) and older browsers
export async function copyToClipboard(text) {
  // Modern API — requires HTTPS or localhost
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fall through to legacy method
    }
  }
  // Legacy fallback — works on HTTP
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

// Show/hide sync banner.
export function updateSyncBanner(count, customMsg) {
  const banner = document.getElementById("sync-banner");
  if (!banner) return;
  if (count > 0) {
    banner.textContent = `${count} recording${count > 1 ? "s" : ""} waiting to sync`;
    banner.classList.add("visible");
  } else if (customMsg) {
    banner.textContent = customMsg;
    banner.classList.add("visible");
    setTimeout(() => banner.classList.remove("visible"), 4000);
  } else {
    banner.classList.remove("visible");
  }
}

// Build nav links — highlights current page
export function buildNav(containerId) {
  const nav = document.getElementById(containerId);
  if (!nav) return;
  const links = [
    { href: "/index.html", label: "Hives" },
    { href: "/calendar.html", label: "Calendar" },
    { href: "/settings.html", label: "Settings" }
  ];
  const currentPath = window.location.pathname;
  nav.innerHTML = links.map(l => {
    const isActive = currentPath === l.href
      || currentPath.endsWith(l.href.substring(1))
      || (currentPath === "/" && l.href === "/index.html");
    return `<a href="${l.href}"${isActive ? ' aria-current="page"' : ""}>${l.label}</a>`;
  }).join(" | ");
}
