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
  const WIDGET_ID = "desktop-mode/starter";
  const mount = async (container, ctx) => {
    let destroyed = false;
    const root = document.createElement("div");
    root.className = "dm-starter";
    const header = document.createElement("div");
    header.className = "dm-starter__header";
    header.textContent = "Starter Widget";
    const body = document.createElement("div");
    body.className = "dm-starter__body";
    body.textContent = "Loading…";
    root.appendChild(header);
    root.appendChild(body);
    container.appendChild(root);
    const clickCount = ctx.storage.get("clicks") ?? 0;
    const counter = document.createElement("button");
    counter.className = "dm-starter__counter";
    counter.textContent = `Clicked ${clickCount} ${clickCount === 1 ? "time" : "times"}`;
    const onClick = () => {
      const current = ctx.storage.get("clicks") ?? 0;
      const next = current + 1;
      ctx.storage.set("clicks", next);
      counter.textContent = `Clicked ${next} ${next === 1 ? "time" : "times"}`;
    };
    counter.addEventListener("click", onClick);
    root.appendChild(counter);
    const rootUrl = window.wpApiSettings?.root ?? "/wp-json/";
    const loadData = async () => {
      if (destroyed) {
        return;
      }
      try {
        const res = await trackedFetch(
          rootUrl.replace(/\/$/, "") + "/wp/v2/posts?per_page=1&orderby=date&order=desc&_fields=id,title",
          { credentials: "same-origin" },
          { source: "desktop-mode/starter", silent: true }
        );
        if (destroyed) {
          return;
        }
        if (!res.ok) {
          body.textContent = "Could not load posts (" + res.status + ").";
          return;
        }
        const posts = await res.json();
        if (destroyed) {
          return;
        }
        body.textContent = posts.length > 0 ? "Latest post: " + posts[0].title.rendered : "No posts found.";
      } catch {
        if (!destroyed) {
          body.textContent = "Could not load data.";
        }
      }
    };
    await loadData();
    const intervalId = setInterval(loadData, 6e4);
    return () => {
      destroyed = true;
      clearInterval(intervalId);
      counter.removeEventListener("click", onClick);
    };
  };
  const w = window;
  w.desktopModeWidgets = w.desktopModeWidgets ?? {};
  w.desktopModeWidgets[WIDGET_ID] = mount;
})();
