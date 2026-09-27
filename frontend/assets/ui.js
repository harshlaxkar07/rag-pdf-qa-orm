/* ==========================================================================
   Shared UI runtime: DOM helpers, theming, toasts, modals, HTTP, formatting.
   No dependencies. Exposed as the global `UI`.
   ========================================================================== */
(function (global) {
  "use strict";

  /* ---------- DOM ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else node.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const child of [].concat(children || [])) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  /* ---------- Icons (Lucide-style, 24x24 stroke) ---------- */
  const PATHS = {
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
    audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
    bot: '<rect width="18" height="12" x="3" y="8" rx="2"/><path d="M12 2v6"/><circle cx="12" cy="2" r="1"/><path d="M8 13v2"/><path d="M16 13v2"/><path d="M1 14v2"/><path d="M23 14v2"/>',
    sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 15l4-4 4 4 5-6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16V4a2 2 0 0 1 2-2h10"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m2 7 10 6 10-6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
    pin: '<path d="M12 21s-7-5.7-7-11a7 7 0 1 1 14 0c0 5.3-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
    briefcase: '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    school: '<path d="m4 10 8-4 8 4-8 4Z"/><path d="M4 10v6a8 4 0 0 0 16 0v-6"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="m8.2 13.4-1.4 7.3 5.2-2.7 5.2 2.7-1.4-7.3"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5Z"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9Z"/>',
    brain: '<path d="M12 5a3 3 0 1 0-5.9.8A3 3 0 0 0 4 12a3 3 0 0 0 2 2.8A3 3 0 0 0 12 19Z"/><path d="M12 5a3 3 0 1 1 5.9.8A3 3 0 0 1 20 12a3 3 0 0 1-2 2.8A3 3 0 0 1 12 19Z"/><path d="M12 5v14"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    pen: '<path d="M12 19l7-7 3 3-7 7-3-3Z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18Z"/><path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
    eraser: '<path d="m7 21-4-4a2 2 0 0 1 0-2.8L14 3.2a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L11 20"/><path d="M22 21H7"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    play: '<path d="m6 3 14 9-14 9Z"/>',
    pause: '<rect width="4" height="16" x="6" y="4" rx="1"/><rect width="4" height="16" x="14" y="4" rx="1"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
    cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    frown: '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    meh: '<circle cx="12" cy="12" r="10"/><path d="M8 15h8"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    quote: '<path d="M3 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3"/><path d="M14 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3"/>',
  };

  function icon(name, size) {
    const d = PATHS[name] || PATHS.info;
    const s = size || 24;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }

  function iconNode(name, size) {
    const wrap = document.createElement("span");
    wrap.style.display = "contents";
    wrap.innerHTML = icon(name, size);
    return wrap.firstChild;
  }

  function hydrateIcons(root) {
    $$("[data-icon]", root).forEach((node) => {
      node.innerHTML = icon(node.dataset.icon, node.dataset.size || 24);
      delete node.dataset.icon;
    });
  }

  /* ---------- Theme ---------- */
  const THEME_KEY = "ui-theme";

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* storage unavailable */ }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $$("[data-theme-toggle]").forEach((btn) => {
      btn.innerHTML = icon(theme === "light" ? "moon" : "sun", 18);
      btn.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
      btn.title = theme === "light" ? "Dark theme" : "Light theme";
    });
  }

  function initTheme() {
    const stored = safeGet(THEME_KEY);
    const prefersLight = global.matchMedia && global.matchMedia("(prefers-color-scheme: light)").matches;
    applyTheme(stored || (prefersLight ? "light" : "dark"));
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    safeSet(THEME_KEY, next);
    applyTheme(next);
  }

  /* ---------- Toasts ---------- */
  function toastHost() {
    let host = $(".toasts");
    if (!host) {
      host = el("div", { class: "toasts", role: "status", "aria-live": "polite" });
      document.body.append(host);
    }
    return host;
  }

  function toast(message, type, title) {
    type = type || "info";
    const icons = { success: "checkCircle", error: "xCircle", warn: "alert", info: "info" };
    const titles = { success: "Success", error: "Something went wrong", warn: "Heads up", info: "Note" };

    const node = el("div", { class: `toast ${type}` });
    node.innerHTML = `
      <span class="ti">${icon(icons[type], 18)}</span>
      <div class="toast-body">
        <div class="toast-title">${esc(title || titles[type])}</div>
        <div class="toast-msg">${esc(message)}</div>
      </div>
      <button class="tx" aria-label="Dismiss">${icon("x", 15)}</button>`;

    const close = () => {
      node.classList.add("out");
      setTimeout(() => node.remove(), 200);
    };
    $(".tx", node).addEventListener("click", close);
    toastHost().append(node);
    setTimeout(close, type === "error" ? 7000 : 4200);
    return node;
  }

  /* ---------- Modal ---------- */
  function modal(opts) {
    const backdrop = el("div", { class: "modal-backdrop" });
    const box = el("div", { class: "modal" + (opts.size === "lg" ? " lg" : "") });

    box.innerHTML = `
      <div class="modal-head">
        <h3>${esc(opts.title || "")}</h3>
        <button class="btn btn-ghost btn-icon" data-close aria-label="Close">${icon("x", 17)}</button>
      </div>
      <div class="modal-body"></div>`;

    const body = $(".modal-body", box);
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.append(opts.body);

    if (opts.actions && opts.actions.length) {
      const foot = el("div", { class: "modal-foot" });
      opts.actions.forEach((a) => {
        const btn = el("button", { class: "btn " + (a.variant ? "btn-" + a.variant : ""), type: "button" }, a.label);
        btn.addEventListener("click", () => a.onClick && a.onClick(close, btn));
        foot.append(btn);
      });
      box.append(foot);
    }

    function close() {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }

    $("[data-close]", box).addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    document.addEventListener("keydown", onKey);

    backdrop.append(box);
    document.body.append(backdrop);
    const focusable = $("input, textarea, select, button:not([data-close])", box);
    if (focusable) focusable.focus();

    return { close, body, box };
  }

  function confirm(opts) {
    return new Promise((resolve) => {
      const m = modal({
        title: opts.title || "Are you sure?",
        body: `<p class="muted">${esc(opts.message || "")}</p>`,
        actions: [
          { label: opts.cancelLabel || "Cancel", onClick: (close) => { close(); resolve(false); } },
          {
            label: opts.confirmLabel || "Confirm",
            variant: opts.danger ? "danger" : "primary",
            onClick: (close) => { close(); resolve(true); },
          },
        ],
      });
      m.box.addEventListener("remove", () => resolve(false));
    });
  }

  /* ---------- HTTP ---------- */
  const http = {
    base: "",
    headers: {},

    async request(path, options) {
      options = options || {};
      const headers = Object.assign({}, this.headers, options.headers || {});
      let body = options.body;

      if (body && !(body instanceof FormData) && typeof body === "object") {
        body = JSON.stringify(body);
        headers["Content-Type"] = "application/json";
      }

      let response;
      try {
        response = await fetch(this.base + path, {
          method: options.method || "GET",
          headers,
          body,
          signal: options.signal,
        });
      } catch (err) {
        throw new Error("Cannot reach the API. Confirm the server is running.");
      }

      if (options.raw) return response;

      const text = await response.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch (_) { data = text; }
      }

      if (!response.ok) {
        const detail =
          (data && (data.detail || data.message || data.error)) || response.statusText;
        const err = new Error(
          typeof detail === "string" ? detail : JSON.stringify(detail)
        );
        err.status = response.status;
        err.data = data;
        throw err;
      }
      return data;
    },

    get(path, options) { return this.request(path, Object.assign({ method: "GET" }, options)); },
    post(path, body, options) { return this.request(path, Object.assign({ method: "POST", body }, options)); },
    put(path, body, options) { return this.request(path, Object.assign({ method: "PUT", body }, options)); },
    patch(path, body, options) { return this.request(path, Object.assign({ method: "PATCH", body }, options)); },
    del(path, options) { return this.request(path, Object.assign({ method: "DELETE" }, options)); },
  };

  /* ---------- Formatting ---------- */
  function bytes(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    if (n < 1024) return n + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let value = n / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return value.toFixed(value >= 10 ? 0 : 1) + " " + units[i];
  }

  function months(m) {
    if (!m && m !== 0) return "—";
    const y = Math.floor(m / 12);
    const rest = m % 12;
    if (!y) return rest + " mo";
    if (!rest) return y + " yr";
    return `${y} yr ${rest} mo`;
  }

  function date(value, withTime) {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d)) return String(value);
    const opts = { year: "numeric", month: "short", day: "numeric" };
    if (withTime) { opts.hour = "2-digit"; opts.minute = "2-digit"; }
    return d.toLocaleDateString(undefined, opts);
  }

  function relative(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d)) return String(value);
    const diff = (Date.now() - d.getTime()) / 1000;
    const steps = [
      [60, "second", 1],
      [3600, "minute", 60],
      [86400, "hour", 3600],
      [604800, "day", 86400],
      [2629800, "week", 604800],
      [31557600, "month", 2629800],
      [Infinity, "year", 31557600],
    ];
    for (const [limit, unit, div] of steps) {
      if (Math.abs(diff) < limit) {
        const n = Math.round(-diff / div);
        return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(n, unit);
      }
    }
    return date(value);
  }

  function duration(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return "—";
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  const pct = (n) => (n === null || n === undefined || isNaN(n) ? "—" : Math.round(n * 100) + "%");

  function initials(name) {
    if (!name) return "?";
    return String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }

  function highlightJson(value) {
    const json = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return esc(json).replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = "json-num";
        if (/^"/.test(match)) cls = /:$/.test(match) ? "json-key" : "json-str";
        else if (/true|false/.test(match)) cls = "json-bool";
        else if (/null/.test(match)) cls = "json-null";
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard", "success");
      return true;
    } catch (_) {
      const ta = el("textarea", { style: "position:fixed;opacity:0" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try { document.execCommand("copy"); toast("Copied to clipboard", "success"); }
      catch (e) { toast("Copy is unavailable in this browser", "warn"); }
      ta.remove();
    }
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait || 280);
    };
  }

  /* ---------- Dropzone ---------- */
  function dropzone(node, onFiles, opts) {
    opts = opts || {};
    const input = $('input[type="file"]', node) || el("input", { type: "file" });
    if (!input.parentNode) node.append(input);
    if (opts.accept) input.accept = opts.accept;
    if (opts.multiple) input.multiple = true;

    const emit = (files) => {
      const list = Array.from(files || []);
      if (list.length) onFiles(opts.multiple ? list : list[0]);
    };

    node.addEventListener("click", (e) => { if (e.target !== input) input.click(); });
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    input.addEventListener("change", () => { emit(input.files); input.value = ""; });

    ["dragenter", "dragover"].forEach((ev) =>
      node.addEventListener(ev, (e) => { e.preventDefault(); node.classList.add("over"); })
    );
    ["dragleave", "drop"].forEach((ev) =>
      node.addEventListener(ev, (e) => { e.preventDefault(); node.classList.remove("over"); })
    );
    node.addEventListener("drop", (e) => emit(e.dataTransfer.files));

    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    return input;
  }

  /* ---------- Shell (nav + sidebar + theme wiring) ---------- */
  function shell(opts) {
    opts = opts || {};
    initTheme();
    hydrateIcons();

    $$("[data-theme-toggle]").forEach((b) => b.addEventListener("click", toggleTheme));

    const sidebar = $(".sidebar");
    const menuBtn = $(".menu-btn");
    let scrim = null;

    function closeSidebar() {
      if (!sidebar) return;
      sidebar.classList.remove("open");
      if (scrim) { scrim.remove(); scrim = null; }
    }
    function openSidebar() {
      if (!sidebar) return;
      sidebar.classList.add("open");
      scrim = el("div", { class: "scrim", onclick: closeSidebar });
      document.body.append(scrim);
    }
    if (menuBtn) {
      menuBtn.addEventListener("click", () =>
        sidebar.classList.contains("open") ? closeSidebar() : openSidebar()
      );
    }

    const titleNode = $("[data-page-title]");

    function go(name, push) {
      const target = $(`.page[data-page="${name}"]`);
      if (!target) return;
      $$(".page").forEach((p) => p.classList.toggle("active", p === target));
      $$("[data-nav]").forEach((n) => n.classList.toggle("active", n.dataset.nav === name));
      if (titleNode) titleNode.textContent = target.dataset.title || name;
      if (push !== false && location.hash.slice(1) !== name) location.hash = name;
      closeSidebar();
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
      if (opts.onNavigate) opts.onNavigate(name);
    }

    $$("[data-nav]").forEach((n) =>
      n.addEventListener("click", (e) => { e.preventDefault(); go(n.dataset.nav); })
    );

    window.addEventListener("hashchange", () => {
      const name = location.hash.slice(1);
      if (name) go(name, false);
    });

    const start = location.hash.slice(1) || opts.start || ($(".page") && $(".page").dataset.page);
    if (start) go(start, false);

    return { go, closeSidebar };
  }

  global.UI = {
    $, $$, el, esc, icon, iconNode, hydrateIcons,
    initTheme, toggleTheme, applyTheme,
    toast, modal, confirm,
    http, dropzone, shell,
    bytes, months, date, relative, duration, pct, initials,
    highlightJson, copy, debounce,
    store: { get: safeGet, set: safeSet },
  };
})(window);
