// ui.js — Shared UI utilities

// ── Invite / ID helpers ────────────────────────────────────────────────────────

export function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function generateLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// ── Date formatting ────────────────────────────────────────────────────────────

export function formatDate(ts) {
  if (!ts) return "Never";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(ts) {
  if (!ts) return "Never";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ── Messaging ──────────────────────────────────────────────────────────────────

export function showMsg(el, msg, isError = false) {
  if (!el) return;
  el.textContent = msg;
  el.className = isError ? "error-msg" : "success-msg";
}

// ── Clipboard ──────────────────────────────────────────────────────────────────

export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) { return false; }
}

// ── Sync banner ────────────────────────────────────────────────────────────────

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

// ── Bottom navigation ──────────────────────────────────────────────────────────

export function buildNav(containerId) {
  const nav = document.getElementById(containerId);
  if (!nav) return;

  const links = [
    {
      href: "/index.html",
      label: "Hives",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>`,
    },
    {
      href: "/calendar.html",
      label: "Calendar",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>`,
    },
    {
      href: "/settings.html",
      label: "Settings",
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>`,
    },
  ];

  const currentPath = window.location.pathname;

  nav.innerHTML = links.map(l => {
    const isActive =
      currentPath === l.href ||
      currentPath.endsWith(l.href.replace(/^\//, "")) ||
      (currentPath === "/" && l.href === "/index.html");
    return `<a href="${l.href}" class="nav-item${isActive ? " active" : ""}"${isActive ? ' aria-current="page"' : ""}>
      <span class="nav-icon">${l.icon}</span>
      <span class="nav-label">${l.label}</span>
    </a>`;
  }).join("");
}

// ── Modal confirm helper ───────────────────────────────────────────────────────

/**
 * Show a confirmation modal, resolve true/false.
 * Page needs: #confirm-modal, #confirm-title, #confirm-message, #confirm-ok, #confirm-cancel
 */
export function showConfirm(title, message, okLabel = "Confirm") {
  return new Promise(resolve => {
    const modal = document.getElementById("confirm-modal");
    if (!modal) { resolve(window.confirm(`${title}\n\n${message}`)); return; }

    const titleEl = document.getElementById("confirm-title");
    const msgEl   = document.getElementById("confirm-message");
    const okBtn   = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    if (titleEl) titleEl.textContent = title;
    if (msgEl)   msgEl.textContent   = message;
    if (okBtn)   okBtn.textContent   = okLabel;
    modal.classList.remove("hidden");

    const cleanup = result => {
      modal.classList.add("hidden");
      okBtn    && okBtn.removeEventListener("click", onOk);
      cancelBtn && cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      resolve(result);
    };
    const onOk      = () => cleanup(true);
    const onCancel  = () => cleanup(false);
    const onBackdrop = e => { if (e.target === modal) cleanup(false); };

    okBtn    && okBtn.addEventListener("click",    onOk,       { once: true });
    cancelBtn && cancelBtn.addEventListener("click", onCancel,  { once: true });
    modal.addEventListener("click", onBackdrop);
  });
}