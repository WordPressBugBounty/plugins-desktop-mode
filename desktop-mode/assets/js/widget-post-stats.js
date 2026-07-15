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
  const WIDGET_ID = "desktop-mode/post-stats";
  const REFRESH_MS = 5 * 6e4;
  const MONTHS_BACK = 6;
  const COLORS = {
    published: "#3b82f6",
    pending: "#fbbf24",
    draft: "#a5b4fc"
  };
  function monthKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }
  function shortLabel(ym) {
    const [, m] = ym.split("-");
    return new Date(2e3, parseInt(m, 10) - 1, 1).toLocaleString(void 0, { month: "short" });
  }
  function buildBuckets() {
    const now = /* @__PURE__ */ new Date();
    return Array.from({ length: MONTHS_BACK }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1 - i), 1);
      const ym = monthKey(d);
      return { ym, label: shortLabel(ym), published: 0, pending: 0, draft: 0 };
    });
  }
  async function fetchPosts() {
    const root = window.wpApiSettings?.root ?? "/wp-json/";
    const cutoff = /* @__PURE__ */ new Date();
    cutoff.setMonth(cutoff.getMonth() - MONTHS_BACK);
    cutoff.setDate(1);
    const after = cutoff.toISOString();
    const statuses = ["publish", "draft", "pending"];
    const all = [];
    for (const status of statuses) {
      let page = 1;
      let total = Infinity;
      while (all.length < 200 && (page - 1) * 100 < total) {
        const res = await trackedFetch(
          root.replace(/\/$/, "") + `/wp/v2/posts?per_page=100&page=${page}&status=${status}&after=${encodeURIComponent(after)}&_fields=id,date,status`,
          { credentials: "same-origin" },
          { source: "desktop-mode/post-stats", silent: true }
        );
        if (!res.ok) {
          break;
        }
        total = parseInt(res.headers.get("X-WP-Total") ?? "0", 10);
        const posts = await res.json();
        if (!Array.isArray(posts) || posts.length === 0) {
          break;
        }
        all.push(...posts);
        page++;
      }
    }
    return all;
  }
  function safeRoundRect(ctx, rx, ry, rw, rh, rr) {
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(rx, ry, rw, rh, rr);
    } else {
      ctx.rect(rx, ry, rw, rh);
    }
  }
  function drawChart(canvas, buckets) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const PAD = { top: 18, right: 10, bottom: 22, left: 28 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;
    if (chartW <= 0 || chartH <= 0) {
      return;
    }
    const maxVal = Math.max(1, ...buckets.map((b) => b.published + b.pending + b.draft));
    const barGroupW = chartW / buckets.length;
    const barPad = barGroupW * 0.2;
    const barW = Math.max(1, barGroupW - barPad * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.07)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = PAD.top + chartH - chartH * i / 3;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + chartW, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.font = "9px -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(Math.round(maxVal * i / 3)), PAD.left - 4, y + 3);
    }
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const x = PAD.left + barGroupW * i + barPad;
      let yTop = PAD.top + chartH;
      for (const seg of [
        { value: b.published, color: COLORS.published },
        { value: b.pending, color: COLORS.pending },
        { value: b.draft, color: COLORS.draft }
      ]) {
        if (seg.value === 0) {
          continue;
        }
        const segH = seg.value / maxVal * chartH;
        yTop -= segH;
        ctx.fillStyle = seg.color;
        ctx.beginPath();
        safeRoundRect(ctx, x, yTop, barW, segH, 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.font = "9px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.label, x + barW / 2, PAD.top + chartH + 13);
    }
  }
  function renderHeader(container, total, error) {
    const header = document.createElement("div");
    header.className = "dm-poststats__header";
    const title = document.createElement("span");
    title.className = "dm-poststats__title";
    title.textContent = "Post Stats";
    const totalEl = document.createElement("span");
    totalEl.className = "dm-poststats__total";
    totalEl.textContent = error ? "" : `${total} post${total !== 1 ? "s" : ""} in 6 mo`;
    header.appendChild(title);
    header.appendChild(totalEl);
    container.appendChild(header);
  }
  function buildLegend(container) {
    const legend = document.createElement("div");
    legend.className = "dm-poststats__legend";
    for (const [label, color] of [
      ["Published", COLORS.published],
      ["Pending", COLORS.pending],
      ["Draft", COLORS.draft]
    ]) {
      const item = document.createElement("div");
      item.className = "dm-poststats__legend-item";
      const swatch = document.createElement("span");
      swatch.className = "dm-poststats__legend-swatch";
      swatch.style.background = color;
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(label));
      legend.appendChild(item);
    }
    container.appendChild(legend);
  }
  const mount = async (container, _ctx) => {
    let destroyed = false;
    let intervalId = null;
    let ro = null;
    const refresh = async () => {
      if (destroyed) {
        return;
      }
      try {
        const posts = await fetchPosts();
        const buckets = buildBuckets();
        for (const post of posts) {
          const ym = post.date ? post.date.slice(0, 7) : null;
          const bucket = ym ? buckets.find((b) => b.ym === ym) : null;
          if (!bucket) {
            continue;
          }
          if (post.status === "publish") {
            bucket.published++;
          } else if (post.status === "pending") {
            bucket.pending++;
          } else if (post.status === "draft") {
            bucket.draft++;
          }
        }
        const total = posts.length;
        if (destroyed) {
          return;
        }
        container.innerHTML = "";
        renderHeader(container, total, false);
        if (total === 0) {
          const empty = document.createElement("div");
          empty.className = "dm-poststats__empty";
          empty.textContent = "No posts in the last 6 months.";
          container.appendChild(empty);
          return;
        }
        const wrap = document.createElement("div");
        wrap.className = "dm-poststats__canvas-wrap";
        const canvas = document.createElement("canvas");
        canvas.className = "dm-poststats__canvas";
        wrap.appendChild(canvas);
        container.appendChild(wrap);
        buildLegend(container);
        ro?.disconnect();
        ro = new ResizeObserver((entries) => {
          if (destroyed) {
            return;
          }
          const entry = entries[0];
          if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            drawChart(canvas, buckets);
          }
        });
        ro.observe(wrap);
      } catch {
        if (!destroyed) {
          container.innerHTML = "";
          renderHeader(container, 0, true);
          const errEl = document.createElement("div");
          errEl.className = "dm-poststats__error";
          errEl.textContent = "Could not load post data.";
          container.appendChild(errEl);
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
      ro?.disconnect();
    };
  };
  const w = window;
  w.desktopModeWidgets = w.desktopModeWidgets ?? {};
  w.desktopModeWidgets[WIDGET_ID] = mount;
})();
