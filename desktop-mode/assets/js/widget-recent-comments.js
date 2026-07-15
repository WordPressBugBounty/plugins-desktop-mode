(function() {
  "use strict";
  const NONCE_HEADER = "X-WP-Nonce";
  function injectRestNonce(input, init) {
    const nonce = readRestNonce();
    if (!nonce) {
      return init;
    }
    const url = resolveUrl(input);
    if (!url || !isSameOriginRestUrl(url)) {
      return init;
    }
    const baseHeaders = init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : void 0);
    const headers = new Headers(baseHeaders ?? {});
    if (headers.has(NONCE_HEADER)) {
      return init;
    }
    headers.set(NONCE_HEADER, nonce);
    return { ...init ?? {}, headers };
  }
  function readRestNonce() {
    if (typeof window === "undefined") {
      return void 0;
    }
    const cfg = window.desktopModeConfig;
    const value = cfg?.restNonce;
    return typeof value === "string" && value.length > 0 ? value : void 0;
  }
  function resolveUrl(input) {
    try {
      const base = typeof window !== "undefined" && window.location ? window.location.href : void 0;
      if (typeof input === "string") {
        return new URL(input, base);
      }
      if (input instanceof URL) {
        return input;
      }
      if (typeof Request !== "undefined" && input instanceof Request) {
        return new URL(input.url, base);
      }
      return null;
    } catch {
      return null;
    }
  }
  function isSameOriginRestUrl(url) {
    if (typeof window === "undefined" || !window.location || url.origin !== window.location.origin) {
      return false;
    }
    if (url.pathname.includes("/wp-json/")) {
      return true;
    }
    if (url.searchParams.has("rest_route")) {
      return true;
    }
    return false;
  }
  function trackedFetch(input, init, opts = {}) {
    const fn = window.wp?.desktop?.fetch;
    if (typeof fn === "function") {
      return fn(input, init, opts);
    }
    const finalInit = injectRestNonce(input, init);
    return fetch(input, finalInit);
  }
  const WIDGET_ID = "desktop-mode/recent-comments";
  const REFRESH_MS = 6e4;
  const LIMIT = 8;
  const STATUS_META = {
    approved: { label: "Approved", color: "#22c55e" },
    hold: { label: "Pending", color: "#f59e0b" },
    spam: { label: "Spam", color: "#ef4444" },
    trash: { label: "Trash", color: "#9ca3af" }
  };
  function timeAgo(isoUtc) {
    const ts = isoUtc.endsWith("Z") ? isoUtc : isoUtc + "Z";
    const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1e3);
    if (secs < 60) {
      return secs + "s ago";
    }
    if (secs < 3600) {
      return Math.floor(secs / 60) + "m ago";
    }
    if (secs < 86400) {
      return Math.floor(secs / 3600) + "h ago";
    }
    return Math.floor(secs / 86400) + "d ago";
  }
  async function fetchComments() {
    const root = window.wpApiSettings?.root ?? "/wp-json/";
    const res = await trackedFetch(
      root.replace(/\/$/, "") + `/wp/v2/comments?per_page=${LIMIT}&orderby=date&order=desc&_embed=up`,
      { credentials: "same-origin" },
      { source: "desktop-mode/recent-comments", silent: true }
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }
  function render(container, comments, error) {
    container.innerHTML = "";
    const header = document.createElement("div");
    header.className = "dm-comments__header";
    const title = document.createElement("span");
    title.className = "dm-comments__title";
    title.textContent = "Recent Comments";
    const badge = document.createElement("span");
    badge.className = "dm-comments__badge";
    const pending = comments ? comments.filter((c) => c.status === "hold").length : 0;
    if (pending > 0) {
      badge.textContent = pending + " pending";
      badge.classList.add("dm-comments__badge--visible");
    }
    header.appendChild(title);
    header.appendChild(badge);
    container.appendChild(header);
    if (error) {
      const err = document.createElement("div");
      err.className = "dm-comments__error";
      err.textContent = "Could not load comments.";
      container.appendChild(err);
      return;
    }
    if (!comments || comments.length === 0) {
      const empty = document.createElement("div");
      empty.className = "dm-comments__empty";
      empty.textContent = "No comments yet.";
      container.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "dm-comments__list";
    for (const c of comments) {
      const row = document.createElement("div");
      row.className = "dm-comments__row";
      const avatar = document.createElement("div");
      avatar.className = "dm-comments__avatar";
      avatar.textContent = (c.author_name || "?").trim().charAt(0).toUpperCase();
      const body = document.createElement("div");
      body.className = "dm-comments__body";
      const meta = document.createElement("div");
      meta.className = "dm-comments__meta";
      const author = document.createElement("span");
      author.className = "dm-comments__author";
      author.textContent = c.author_name || "Anonymous";
      const sm = STATUS_META[c.status] ?? STATUS_META.hold;
      const statusEl = document.createElement("span");
      statusEl.className = "dm-comments__status";
      statusEl.style.background = sm.color;
      statusEl.textContent = sm.label;
      const time = document.createElement("span");
      time.className = "dm-comments__time";
      time.textContent = timeAgo(c.date_gmt);
      meta.appendChild(author);
      meta.appendChild(statusEl);
      meta.appendChild(time);
      const postEl = document.createElement("div");
      postEl.className = "dm-comments__post";
      postEl.textContent = "↳ " + (c._embedded?.up?.[0]?.title?.rendered ?? `Post #${c.post}`);
      body.appendChild(meta);
      body.appendChild(postEl);
      row.appendChild(avatar);
      row.appendChild(body);
      list.appendChild(row);
    }
    container.appendChild(list);
  }
  const mount = async (container, _ctx) => {
    let destroyed = false;
    let intervalId = null;
    const refresh = async () => {
      if (destroyed) {
        return;
      }
      try {
        const comments = await fetchComments();
        if (!destroyed) {
          render(container, comments, false);
        }
      } catch {
        if (!destroyed) {
          render(container, null, true);
        }
      }
    };
    await refresh();
    intervalId = setInterval(refresh, REFRESH_MS);
    return () => {
      destroyed = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  };
  const w = window;
  w.desktopModeWidgets = w.desktopModeWidgets ?? {};
  w.desktopModeWidgets[WIDGET_ID] = mount;
})();
