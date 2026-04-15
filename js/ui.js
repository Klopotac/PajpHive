// ui.js — Shared UI utilities

export function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
export function generateLocalId() {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

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

export function showMsg(el, msg, isError = false) {
  if (!el) return;
  el.textContent = msg;
  el.className = isError ? "error-msg" : "success-msg";
}

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

// ── Bottom navigation (Material Symbols style) ────────────────────────────────
export function buildNav(containerId) {
  const nav = document.getElementById(containerId);
  if (!nav) return;

  const links = [
    { href: "/index.html",    label: "Apiaries",  icon: "grid_view" },
    { href: "/calendar.html", label: "Calendar",  icon: "calendar_month" },
    { href: "/settings.html", label: "Settings",  icon: "settings" },
  ];

  const currentPath = window.location.pathname;

  nav.innerHTML = links.map(l => {
    const isActive =
      currentPath === l.href ||
      currentPath.endsWith(l.href.replace(/^\//, "")) ||
      (currentPath === "/" && l.href === "/index.html");
    return `<a href="${l.href}" class="${isActive
      ? "flex flex-col items-center justify-center bg-orange-100 text-orange-800 rounded-full px-5 py-2"
      : "flex flex-col items-center justify-center text-zinc-500 p-2 hover:bg-zinc-100 rounded-full"
    } active:scale-90 transition-all duration-300 ease-out no-underline" style="text-decoration:none">
      <span class="material-symbols-outlined" style="font-size:22px;font-variation-settings:'FILL' ${isActive ? 1 : 0},'wght' 400,'GRAD' 0,'opsz' 24">${l.icon}</span>
      <span style="font-size:11px;font-weight:500;margin-top:2px">${l.label}</span>
    </a>`;
  }).join("");
}

// ── Modal confirm helper ───────────────────────────────────────────────────────
export function showConfirm(title, message, okLabel = "Confirm") {
  return new Promise(resolve => {
    const modal = document.getElementById("confirm-modal");
    if (!modal) { resolve(window.confirm(`${title}\n\n${message}`)); return; }

    const titleEl   = document.getElementById("confirm-title");
    const msgEl     = document.getElementById("confirm-message");
    const okBtn     = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    if (titleEl) titleEl.textContent = title;
    if (msgEl)   msgEl.textContent   = message;
    if (okBtn)   okBtn.textContent   = okLabel;
    modal.classList.remove("hidden");

    const cleanup = result => {
      modal.classList.add("hidden");
      okBtn     && okBtn.removeEventListener("click", onOk);
      cancelBtn && cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      resolve(result);
    };
    const onOk       = () => cleanup(true);
    const onCancel   = () => cleanup(false);
    const onBackdrop = e => { if (e.target === modal) cleanup(false); };

    okBtn     && okBtn.addEventListener("click",    onOk,      { once: true });
    cancelBtn && cancelBtn.addEventListener("click", onCancel, { once: true });
    modal.addEventListener("click", onBackdrop);
  });
}
