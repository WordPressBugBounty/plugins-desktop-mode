(function() {
  "use strict";
  const sw = globalThis;
  const VERSION = "0.8.0-pwa-3";
  const STATIC_CACHE = `desktop-mode-static-${VERSION}`;
  const RUNTIME_CACHE = `desktop-mode-runtime-${VERSION}`;
  const OFFLINE_URL = "/desktop-mode/?offline=1";
  const PRECACHE_PATHS = [
    "assets/css/desktop.css",
    "assets/css/variables.css",
    "assets/css/dock.css",
    "assets/css/windows.css",
    "assets/images/wp-logo.png"
  ];
  sw.addEventListener("install", (event) => {
    event.waitUntil(precache());
    void sw.skipWaiting();
  });
  sw.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))
        );
        await sw.clients.claim();
      })()
    );
  });
  sw.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") {
      return;
    }
    const url = new URL(req.url);
    if (url.origin !== sw.location.origin) {
      return;
    }
    const isPortal = url.pathname.startsWith("/desktop-mode/");
    const isAdmin = url.pathname.startsWith("/wp-admin/");
    const isPluginAsset = url.pathname.includes(
      "/wp-content/plugins/desktop-mode/"
    );
    if (!isPortal && !isAdmin && !isPluginAsset) {
      return;
    }
    if (isPluginAsset && isJsAssetPath(url.pathname)) {
      event.respondWith(networkFirstForAsset(req));
      return;
    }
    if (isPluginAsset && isStaticAssetPath(url.pathname)) {
      event.respondWith(staleWhileRevalidate(req));
      return;
    }
    if (req.mode === "navigate" && req.destination === "document") {
      event.respondWith(networkFirstWithOfflineFallback(req));
    }
  });
  sw.addEventListener("push", (event) => {
    event.waitUntil(Promise.resolve());
  });
  sw.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
      (async () => {
        const target = event.notification.data?.url ?? "/desktop-mode/";
        const all = await sw.clients.matchAll({
          type: "window",
          includeUncontrolled: true
        });
        const existing = all.find((c) => c.url.includes("/desktop-mode/"));
        if (existing) {
          if (typeof existing.focus === "function") {
            await existing.focus();
          }
          return;
        }
        if (sw.clients.openWindow) {
          await sw.clients.openWindow(target);
        }
      })()
    );
  });
  async function precache() {
    try {
      const cache = await caches.open(STATIC_CACHE);
      const base = pluginAssetBase();
      await cache.addAll(PRECACHE_PATHS.map((p) => base + p));
    } catch {
    }
  }
  function pluginAssetBase() {
    const here = sw.location.pathname;
    const idx = here.indexOf("/desktop-mode/");
    const origin = sw.location.origin;
    if (idx >= 0) {
      return origin + "/wp-content/plugins/desktop-mode/";
    }
    return origin + "/wp-content/plugins/desktop-mode/";
  }
  function isStaticAssetPath(pathname) {
    return /\.(css|png|jpg|jpeg|svg|webp|woff2?|ttf|gif|ico)$/i.test(
      pathname
    );
  }
  function isJsAssetPath(pathname) {
    return /\.js$/i.test(pathname);
  }
  async function networkFirstForAsset(req) {
    const cache = await caches.open(RUNTIME_CACHE);
    try {
      const fresh = await fetch(req.url, { cache: "reload" });
      if (fresh && fresh.status === 200) {
        cache.put(req, fresh.clone()).catch(() => void 0);
      }
      return fresh;
    } catch {
      const cached = await cache.match(req);
      if (cached) {
        return cached;
      }
      return new Response("", { status: 504 });
    }
  }
  async function staleWhileRevalidate(req) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200) {
        cache.put(req, res.clone()).catch(() => void 0);
      }
      return res;
    }).catch(() => void 0);
    if (cached) {
      return cached;
    }
    const fresh = await network;
    if (fresh) {
      return fresh;
    }
    return new Response("", { status: 504 });
  }
  async function networkFirstWithOfflineFallback(req) {
    try {
      const fresh = await fetch(req);
      return fresh;
    } catch {
      const cache = await caches.open(STATIC_CACHE);
      const fallback = await cache.match(OFFLINE_URL);
      if (fallback) {
        return fallback;
      }
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>Offline</title><p>You appear to be offline. The app will work again as soon as the connection returns.</p>',
        {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        }
      );
    }
  }
})();
