var desktopModePostsWindow = function(exports) {
  "use strict";
  const TEXT_DOMAIN = "desktop-mode";
  function i18n() {
    return window.wp?.i18n;
  }
  function __(text, domain = TEXT_DOMAIN) {
    return i18n()?.__(text, domain) ?? text;
  }
  function _n(single, plural, number, domain = TEXT_DOMAIN) {
    return i18n()?._n(single, plural, number, domain) ?? (number === 1 ? single : plural);
  }
  function sprintf(format, ...args) {
    const impl = i18n()?.sprintf;
    if (impl) {
      return impl(format, ...args);
    }
    let i = 0;
    return format.replace(/%(?:(\d+)\$)?[sd]/g, (_match, pos) => {
      const idx = pos ? Number.parseInt(pos, 10) - 1 : i++;
      return String(args[idx] ?? "");
    });
  }
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
  const gravatarCache = /* @__PURE__ */ new Map();
  async function resolveAvatarUrl(raw) {
    if (!raw) {
      return null;
    }
    let parsed;
    try {
      parsed = new URL(raw, window.location.href);
    } catch {
      return raw;
    }
    if (!/gravatar\.com$/i.test(parsed.hostname)) {
      return raw;
    }
    parsed.searchParams.delete("d");
    parsed.searchParams.delete("s");
    const cacheKey2 = parsed.toString();
    const cached = gravatarCache.get(cacheKey2);
    if (cached !== void 0) {
      return cached instanceof Promise ? cached : cached;
    }
    const probeUrl = new URL(raw, window.location.href);
    probeUrl.searchParams.set("d", "blank");
    const probe = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            resolve(raw);
            return;
          }
          ctx.drawImage(img, 0, 0, 1, 1);
          const pixel = ctx.getImageData(0, 0, 1, 1).data;
          resolve(pixel[3] === 0 ? null : raw);
        } catch {
          resolve(raw);
        }
      };
      img.onerror = () => resolve(null);
      img.src = probeUrl.toString();
    }).then((next) => {
      gravatarCache.set(cacheKey2, next);
      return next;
    });
    gravatarCache.set(cacheKey2, probe);
    return probe;
  }
  function applyAvatarSrc(avatar, raw) {
    if (!raw) {
      return;
    }
    void resolveAvatarUrl(raw).then((url) => {
      if (!avatar.isConnected) {
        return;
      }
      if (url) {
        avatar.setAttribute("src", url);
      } else {
        avatar.removeAttribute("src");
      }
    });
  }
  const ROOT_ID = "__root__";
  const PALETTE = [
    2257329,
    // wp blue
    8141549,
    // violet
    366185,
    // emerald
    14362487,
    // pink
    15357964,
    // orange
    561586
    // cyan
  ];
  function buildSeedTree() {
    const seeds = [
      { id: "science", name: __("Science"), parent: ROOT_ID },
      { id: "biology", name: __("Biology"), parent: "science" },
      { id: "astronomy", name: __("Astronomy"), parent: "science" },
      { id: "physics", name: __("Physics"), parent: "science" },
      { id: "society", name: __("Society"), parent: ROOT_ID },
      { id: "economics", name: __("Economics"), parent: "society" },
      { id: "politics", name: __("Politics"), parent: "society" },
      { id: "culture", name: __("Culture"), parent: ROOT_ID },
      { id: "music", name: __("Music"), parent: "culture" },
      { id: "cinema", name: __("Cinema"), parent: "culture" }
    ];
    const map = /* @__PURE__ */ new Map();
    seeds.forEach((s, i) => {
      map.set(s.id, {
        id: s.id,
        name: s.name,
        parent: s.parent,
        color: PALETTE[i % PALETTE.length],
        radius: s.parent === ROOT_ID ? 34 : 24,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        tx: 0,
        ty: 0,
        gfx: null,
        label: null,
        dragging: false,
        ...makeFloatPhase(i, 4, 3.5)
      });
    });
    return map;
  }
  function makeFloatPhase(seed, ampX, ampY) {
    const r = (n) => {
      const x = Math.sin(seed * 9301 + n * 49297) * 233280;
      return x - Math.floor(x);
    };
    return {
      phaseX: r(1) * Math.PI * 2,
      phaseY: r(2) * Math.PI * 2,
      // 0.0006–0.0012 rad/ms ≈ 5–10 second periods.
      freqX: 6e-4 + r(3) * 6e-4,
      freqY: 6e-4 + r(4) * 6e-4,
      ampX,
      ampY
    };
  }
  const TAG_SEEDS = [
    { id: "t-wp", name: "wordpress", count: 42, hue: 210 },
    { id: "t-design", name: "design", count: 28, hue: 280 },
    { id: "t-code", name: "code", count: 33, hue: 145 },
    { id: "t-photo", name: "photo", count: 22, hue: 320 },
    { id: "t-news", name: "news", count: 19, hue: 10 }
  ];
  const TAG_FONT_MIN = 11;
  const TAG_FONT_MAX = 16;
  const TAG_PAD_X = 9;
  const TAG_PAD_Y = 4;
  const TAG_GAP_HASH = 3;
  const TAG_GAP_COUNT = 6;
  function fontSizeFor$1(count, max) {
    if (max <= 0) {
      return TAG_FONT_MIN;
    }
    const t = Math.min(1, count / max);
    return TAG_FONT_MIN + (TAG_FONT_MAX - TAG_FONT_MIN) * t;
  }
  function darkenColor(color, factor) {
    const r = Math.round(Math.floor(color / 65536) * factor);
    const g = Math.round(Math.floor(color % 65536 / 256) * factor);
    const b = Math.round(color % 256 * factor);
    return r * 65536 + g * 256 + b;
  }
  function hslToInt$2(h, s, l) {
    const sat = s / 100;
    const lig = l / 100;
    const c = (1 - Math.abs(2 * lig - 1)) * sat;
    const hp = (h % 360 + 360) % 360 / 60;
    const xCol = c * (1 - Math.abs(hp % 2 - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp < 1) {
      r = c;
      g = xCol;
    } else if (hp < 2) {
      r = xCol;
      g = c;
    } else if (hp < 3) {
      g = c;
      b = xCol;
    } else if (hp < 4) {
      g = xCol;
      b = c;
    } else if (hp < 5) {
      r = xCol;
      b = c;
    } else {
      r = c;
      b = xCol;
    }
    const m = lig - c / 2;
    const R = Math.round((r + m) * 255);
    const G = Math.round((g + m) * 255);
    const B = Math.round((b + m) * 255);
    return R * 65536 + G * 256 + B;
  }
  function isDescendant(nodes, candidateId, targetId) {
    if (candidateId === targetId) {
      return true;
    }
    let cur = candidateId;
    const visited = /* @__PURE__ */ new Set();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const n = nodes.get(cur);
      if (!n) {
        return false;
      }
      if (n.parent === targetId) {
        return true;
      }
      cur = n.parent;
    }
    return false;
  }
  function layoutTree(nodes, width, height) {
    const cx = width / 2;
    const cy = height * 0.4;
    const roots = Array.from(nodes.values()).filter((n) => n.parent === ROOT_ID);
    const mindmapH = height * 0.62;
    const rootR = Math.min(width, mindmapH) * 0.22;
    roots.forEach((root, i) => {
      const angle = i / Math.max(1, roots.length) * Math.PI * 2 - Math.PI / 2;
      root.tx = cx + Math.cos(angle) * rootR;
      root.ty = cy + Math.sin(angle) * rootR;
      layoutChildren(nodes, root, angle);
    });
  }
  function layoutTags(tags, width, height) {
    const bandTop = height * 0.72;
    const bandH = height * 0.26;
    const bandCy = bandTop + bandH / 2;
    const gap = 8;
    const rows = [[]];
    let rowW = 0;
    tags.forEach((t) => {
      const w = t.width || 60;
      if (rowW + w + gap > width - 24 && rows[rows.length - 1].length > 0) {
        rows.push([]);
        rowW = 0;
      }
      rows[rows.length - 1].push(t);
      rowW += w + gap;
    });
    const rowSpacing = 38;
    const totalRowsH = rows.length * rowSpacing - rowSpacing;
    const startY = bandCy - totalRowsH / 2;
    rows.forEach((row, rIdx) => {
      const total = row.reduce((acc, t) => acc + (t.width || 60), 0) + gap * Math.max(0, row.length - 1);
      let cursor = (width - total) / 2;
      row.forEach((t) => {
        const w = t.width || 60;
        t.tx = cursor + w / 2;
        t.ty = startY + rIdx * rowSpacing;
        cursor += w + gap;
      });
    });
  }
  function layoutChildren(nodes, parent, parentAngle) {
    const children = Array.from(nodes.values()).filter(
      (n) => n.parent === parent.id
    );
    if (children.length === 0) {
      return;
    }
    const spread = Math.PI * 0.9;
    const baseAngle = parentAngle;
    const step = children.length === 1 ? 0 : spread / (children.length - 1);
    const start = baseAngle - spread / 2;
    const r = 95;
    children.forEach((child, i) => {
      const a = children.length === 1 ? baseAngle : start + step * i;
      child.tx = parent.tx + Math.cos(a) * r;
      child.ty = parent.ty + Math.sin(a) * r;
      layoutChildren(nodes, child, a);
    });
  }
  function layoutTagChip(chip) {
    chip.hashText.style.fontSize = chip.fontSize;
    chip.nameText.style.fontSize = chip.fontSize;
    chip.countText.style.fontSize = Math.max(9, Math.round(chip.fontSize * 0.6));
    const hashW = chip.hashText.width;
    const nameW = chip.nameText.width;
    const nameH = chip.nameText.height;
    const countW = chip.countText.width;
    const countH = chip.countText.height;
    const countBadgeW = Math.max(16, countW + 8);
    const countBadgeH = Math.max(13, countH + 3);
    chip.width = TAG_PAD_X + hashW + TAG_GAP_HASH + nameW + TAG_GAP_COUNT + countBadgeW + TAG_PAD_X;
    chip.height = Math.max(nameH, countBadgeH) + TAG_PAD_Y * 2;
  }
  function paintTagChip(chip) {
    const totalW = chip.width;
    const totalH = chip.height;
    const left = -totalW / 2;
    const top = -totalH / 2;
    const radius = totalH / 2;
    const fillBg = chip.hover ? hslToInt$2(chip.hue, 70, 88) : hslToInt$2(chip.hue, 60, 95);
    const borderColor = hslToInt$2(chip.hue, 50, 70);
    const textColor = 1909543;
    const hashColor = hslToInt$2(chip.hue, 65, 42);
    const countBg = hslToInt$2(chip.hue, 70, 50);
    chip.bg.clear();
    chip.bg.roundRect(left, top, totalW, totalH, radius);
    chip.bg.fill(fillBg);
    chip.bg.stroke({
      color: borderColor,
      width: chip.hover ? 1.6 : 1.2,
      alpha: 0.85
    });
    const hashW = chip.hashText.width;
    const nameW = chip.nameText.width;
    const nameH = chip.nameText.height;
    const countW = chip.countText.width;
    const countH = chip.countText.height;
    const countBadgeW = Math.max(16, countW + 8);
    const countBadgeH = Math.max(13, countH + 3);
    chip.hashText.x = left + TAG_PAD_X;
    chip.hashText.y = (totalH - nameH) / 2 + top;
    chip.hashText.style.fill = hashColor;
    chip.nameText.x = left + TAG_PAD_X + hashW + TAG_GAP_HASH;
    chip.nameText.y = (totalH - nameH) / 2 + top;
    chip.nameText.style.fill = textColor;
    const badgeX = left + TAG_PAD_X + hashW + TAG_GAP_HASH + nameW + TAG_GAP_COUNT;
    const badgeY = (totalH - countBadgeH) / 2 + top;
    chip.bg.roundRect(badgeX, badgeY, countBadgeW, countBadgeH, countBadgeH / 2);
    chip.bg.fill(countBg);
    chip.countText.x = badgeX + (countBadgeW - countW) / 2;
    chip.countText.y = badgeY + (countBadgeH - countH) / 2;
  }
  function renderFallback(stage) {
    stage.replaceChildren();
    const note = document.createElement("p");
    note.className = "wpd-intro__fallback";
    note.textContent = __(
      "A new visual editor for Categories and Tags awaits inside — drag, drop, and reorganize your taxonomy in seconds."
    );
    stage.appendChild(note);
  }
  async function showPostsIntroDialog() {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "wpd-intro-backdrop";
      const dialog = document.createElement("div");
      dialog.className = "wpd-intro";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "wpd-intro-title");
      dialog.tabIndex = -1;
      backdrop.appendChild(dialog);
      const titleEl = document.createElement("h2");
      titleEl.id = "wpd-intro-title";
      titleEl.className = "wpd-intro__title";
      titleEl.textContent = __("Welcome to the new Posts");
      dialog.appendChild(titleEl);
      const lede = document.createElement("p");
      lede.className = "wpd-intro__lede";
      lede.textContent = __(
        "A redesigned Posts experience built around how you actually work. Try the new Categories canvas — grab a node and drop it on another to reparent it."
      );
      dialog.appendChild(lede);
      const stage = document.createElement("div");
      stage.className = "wpd-intro__stage";
      dialog.appendChild(stage);
      const escape = document.createElement("p");
      escape.className = "wpd-intro__escape";
      escape.textContent = __(
        "Prefer the classic Posts list? You can switch back any time from OS Settings → Features."
      );
      dialog.appendChild(escape);
      const actions = document.createElement("div");
      actions.className = "wpd-intro__actions";
      const settingsBtn = document.createElement("button");
      settingsBtn.type = "button";
      settingsBtn.className = "wpd-intro__btn wpd-intro__btn--secondary";
      settingsBtn.textContent = __("Take me to settings");
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "wpd-intro__btn wpd-intro__btn--primary";
      confirmBtn.textContent = __("Got it");
      actions.appendChild(settingsBtn);
      actions.appendChild(confirmBtn);
      dialog.appendChild(actions);
      document.body.appendChild(backdrop);
      let teardownPixi = null;
      const cleanup = (result) => {
        document.removeEventListener("keydown", onKey);
        teardownPixi?.();
        backdrop.remove();
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cleanup("cancel");
        }
      };
      document.addEventListener("keydown", onKey);
      confirmBtn.addEventListener("click", () => cleanup("confirm"));
      settingsBtn.addEventListener("click", () => cleanup("settings"));
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          cleanup("cancel");
        }
      });
      requestAnimationFrame(() => dialog.focus());
      void mountPixi(stage).then((teardown) => {
        teardownPixi = teardown;
      }).catch(() => {
        renderFallback(stage);
      });
    });
  }
  async function mountPixi(stage) {
    const api = window.wp?.desktop;
    if (!api || typeof api.loadModules !== "function") {
      renderFallback(stage);
      return () => {
      };
    }
    try {
      await api.loadModules(["pixijs"]);
    } catch {
      renderFallback(stage);
      return () => {
      };
    }
    const pixiMaybe = window.PIXI;
    if (!pixiMaybe) {
      renderFallback(stage);
      return () => {
      };
    }
    const pixi = pixiMaybe;
    const app = new pixi.Application();
    await app.init({
      resizeTo: stage,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });
    stage.appendChild(app.canvas);
    app.canvas.classList.add("wpd-intro__canvas");
    const world = new pixi.Container();
    world.sortableChildren = true;
    world.scale.set(1);
    app.stage.addChild(world);
    const edgeLayer = new pixi.Container();
    const nodeLayer = new pixi.Container();
    const tagLayer = new pixi.Container();
    const postLayer = new pixi.Container();
    edgeLayer.zIndex = 1;
    nodeLayer.zIndex = 2;
    tagLayer.zIndex = 3;
    postLayer.zIndex = 5;
    world.addChild(edgeLayer);
    world.addChild(postLayer);
    world.addChild(nodeLayer);
    world.addChild(tagLayer);
    const nodes = buildSeedTree();
    nodes.forEach((n) => {
      const gfx = new pixi.Graphics();
      gfx.eventMode = "static";
      gfx.cursor = "grab";
      const label = new pixi.Text({
        text: n.name,
        style: { fill: 16777215, fontSize: 12, fontWeight: "600", fontFamily: "system-ui, -apple-system, sans-serif" },
        resolution: 3,
        anchor: { x: 0.5, y: 0.5 }
      });
      gfx.addChild(label);
      n.gfx = gfx;
      n.label = label;
      nodeLayer.addChild(gfx);
    });
    const tags = [];
    const maxTagCount = TAG_SEEDS.reduce((m, t) => Math.max(m, t.count), 0);
    TAG_SEEDS.forEach((seed, i) => {
      const container = new pixi.Container();
      container.eventMode = "static";
      container.cursor = "grab";
      const bg = new pixi.Graphics();
      const fontSize = fontSizeFor$1(seed.count, maxTagCount);
      const hashText = new pixi.Text({
        text: "#",
        style: { fill: 1909543, fontSize, fontWeight: "600", fontFamily: "system-ui, -apple-system, sans-serif" },
        resolution: 3,
        anchor: { x: 0, y: 0 }
      });
      const nameText = new pixi.Text({
        text: seed.name,
        style: { fill: 1909543, fontSize, fontWeight: "600", fontFamily: "system-ui, -apple-system, sans-serif" },
        resolution: 3,
        anchor: { x: 0, y: 0 }
      });
      const countText = new pixi.Text({
        text: String(seed.count),
        style: { fill: 16777215, fontSize: Math.max(9, Math.round(fontSize * 0.6)), fontWeight: "700", fontFamily: "system-ui, -apple-system, sans-serif" },
        resolution: 3,
        anchor: { x: 0, y: 0 }
      });
      container.addChild(bg, hashText, nameText, countText);
      tagLayer.addChild(container);
      const chip = {
        id: seed.id,
        name: seed.name,
        count: seed.count,
        hue: seed.hue,
        fontSize,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
        bg,
        hashText,
        nameText,
        countText,
        container,
        dragging: false,
        hover: false,
        ...makeFloatPhase(100 + i, 5, 4)
      };
      layoutTagChip(chip);
      paintTagChip(chip);
      tags.push(chip);
    });
    let stageW = stage.clientWidth || 600;
    let stageH = stage.clientHeight || 360;
    layoutTree(nodes, stageW, stageH);
    layoutTags(tags, stageW, stageH);
    const cx0 = stageW / 2;
    const cy0 = stageH * 0.4;
    nodes.forEach((n) => {
      n.x = cx0;
      n.y = cy0;
    });
    tags.forEach((t) => {
      t.x = t.tx;
      t.y = stageH + 40;
    });
    const drawNode = (n, hovered, dropTarget) => {
      n.gfx.clear();
      const r = n.radius * (hovered ? 1.08 : 1);
      if (dropTarget) {
        n.gfx.circle(0, 0, r + 10).fill({ color: n.color, alpha: 0.18 });
      }
      n.gfx.circle(0, 0, r).fill({ color: n.color, alpha: 0.95 }).stroke({ color: 16777215, width: dropTarget ? 3 : 1.5, alpha: 0.9 });
      const labelW = n.label.width;
      const labelH = n.label.height;
      if (labelW + 6 > r * 2) {
        const padX = 8;
        const padY = 3;
        const capW = labelW + padX * 2;
        const capH = labelH + padY * 2;
        n.gfx.roundRect(-capW / 2, -capH / 2, capW, capH, capH / 2).fill({ color: darkenColor(n.color, 0.55), alpha: 0.92 });
      }
      n.gfx.x = n.x;
      n.gfx.y = n.y;
    };
    const drawEdges = () => {
      const edgeLayerWithChildren = edgeLayer;
      const previousChildren = edgeLayerWithChildren.children.slice();
      previousChildren.forEach((c) => edgeLayer.removeChild(c));
      const edge = new pixi.Graphics();
      nodes.forEach((n) => {
        if (!n.parent || n.parent === ROOT_ID) {
          return;
        }
        const parent = nodes.get(n.parent);
        if (!parent) {
          return;
        }
        const dx = n.x - parent.x;
        const cp1x = parent.x + dx * 0.5;
        const cp1y = parent.y;
        const cp2x = parent.x + dx * 0.5;
        const cp2y = n.y;
        edge.moveTo(parent.x, parent.y);
        edge.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, n.x, n.y);
      });
      edge.stroke({ color: 9741240, width: 1.6, alpha: 0.55 });
      edgeLayer.addChild(edge);
    };
    const POSTS_BY_TAG = {
      "t-wp": [{ node: "politics", title: __("WordPress at scale") }, { node: "economics", title: __("Plugins economy") }, { node: "astronomy", title: __("Open-source orbits") }],
      "t-design": [{ node: "cinema", title: __("Title cards reborn") }, { node: "music", title: __("Album art trends") }, { node: "culture", title: __("Type as identity") }],
      "t-code": [{ node: "physics", title: __("Sim notebooks") }, { node: "astronomy", title: __("Pixel pipelines") }, { node: "science", title: __("Code as method") }],
      "t-photo": [{ node: "cinema", title: __("Anamorphic notes") }, { node: "biology", title: __("Field portraits") }, { node: "culture", title: __("Sunday playlist") }],
      "t-news": [{ node: "politics", title: __("Weekly briefing") }, { node: "economics", title: __("Markets recap") }]
    };
    let fakePosts = [];
    const POSTS_BY_CATEGORY = {
      science: [__("What we learned"), __("Open questions"), __("Methodology notes"), __("Replication study")],
      biology: [__("Fieldwork log"), __("Cell shapes"), __("Microscope diary")],
      botany: [__("Pressed leaves"), __("Greenhouse notes"), __("Native species")],
      zoology: [__("Migration map"), __("Birding weekend"), __("Tracks at dawn")],
      astronomy: [__("Comet schedule"), __("Backyard telescope"), __("Lunar tides")],
      physics: [__("Lab notebook"), __("Toy models"), __("Phase transitions")],
      society: [__("Sunday digest"), __("Local elections"), __("Reader letters")],
      economics: [__("Macro recap"), __("Numbers I noticed"), __("Market mood")],
      macro: [__("Inflation trail"), __("Central banks")],
      micro: [__("Pricing tactics"), __("Coffee shop economics")],
      politics: [__("Campaign trail"), __("Town hall notes"), __("Policy explainer")],
      culture: [__("Type as identity"), __("Sunday playlist"), __("City walks")],
      music: [__("Liner notes"), __("Live this week"), __("Album re-listen")],
      cinema: [__("Title cards reborn"), __("Director cut"), __("Set on the road")],
      drama: [__("Three-act notes"), __("Stage to screen")],
      "sci-fi": [__("Anamorphic notes"), __("Future-proof tropes"), __("Worldbuilding 101")]
    };
    const clearFakePosts = () => {
      fakePosts.forEach((p) => {
        try {
          postLayer.removeChild(p.container);
          p.container.destroy({ children: true });
        } catch {
        }
      });
      fakePosts = [];
    };
    const buildPostChip = (title, anchorKind, anchorId, accentColor, angle, orbit, originX, originY, spawnedAt) => {
      const container = new pixi.Container();
      container.alpha = 0;
      container.x = originX;
      container.y = originY;
      const bg = new pixi.Graphics();
      const text = new pixi.Text({
        text: title,
        style: {
          fill: 1909543,
          fontSize: 10,
          fontFamily: "system-ui, -apple-system, sans-serif"
        },
        resolution: 3,
        anchor: { x: 0, y: 0 }
      });
      container.addChild(bg, text);
      postLayer.addChild(container);
      return {
        title,
        anchorKind,
        anchorId,
        accentColor,
        angle,
        orbit,
        originX,
        originY,
        container,
        bg,
        text,
        spawnedAt
      };
    };
    const spawnFakePostsFromTag = (tag) => {
      clearFakePosts();
      const list = POSTS_BY_TAG[tag.id];
      if (!list) {
        return;
      }
      const now = performance.now();
      const ox = tag.container.x;
      const oy = tag.container.y;
      const accent = hslToInt$2(tag.hue, 70, 50);
      const titles = list.map((p) => p.title);
      const spread = Math.PI * 1.2;
      const baseAngle = -Math.PI / 2;
      const step = titles.length === 1 ? 0 : spread / (titles.length - 1);
      const start = baseAngle - spread / 2;
      const orbitR = 56 + Math.min(16, titles.length * 2);
      titles.forEach((title, i) => {
        const angle = titles.length === 1 ? baseAngle : start + step * i;
        fakePosts.push(
          buildPostChip(
            title,
            "tag",
            tag.id,
            accent,
            angle,
            orbitR + i % 2 * 6,
            ox,
            oy,
            now
          )
        );
      });
    };
    const spawnFakePostsFromCategory = (node) => {
      clearFakePosts();
      const titles = POSTS_BY_CATEGORY[node.id];
      if (!titles || titles.length === 0) {
        return;
      }
      const now = performance.now();
      const ox = node.gfx.x;
      const oy = node.gfx.y;
      const spread = Math.PI * 1.6;
      const start = -Math.PI / 2 - spread / 2;
      const step = titles.length === 1 ? 0 : spread / (titles.length - 1);
      titles.forEach((title, i) => {
        const angle = titles.length === 1 ? -Math.PI / 2 : start + step * i;
        fakePosts.push(
          buildPostChip(
            title,
            "node",
            node.id,
            node.color,
            angle,
            78 + i % 3 * 8,
            ox,
            oy,
            now
          )
        );
      });
    };
    let dragging = null;
    let pointerStart = { x: 0, y: 0 };
    let nodeStart = { x: 0, y: 0 };
    let hoverDrop = null;
    let dragTag = null;
    let tagDragStart = { x: 0, y: 0 };
    let tagStart = { x: 0, y: 0 };
    nodes.forEach((n) => {
      n.gfx.on("pointerdown", (raw) => {
        const e = raw;
        dragging = n;
        n.dragging = true;
        pointerStart = { x: e.global.x, y: e.global.y };
        nodeStart = { x: n.x, y: n.y };
        n.gfx.cursor = "grabbing";
        n.gfx.zIndex = 1e3;
        drawNode(n, true, false);
      });
      n.gfx.on("pointerover", () => {
        if (dragging || dragTag) {
          return;
        }
        drawNode(n, true, false);
        spawnFakePostsFromCategory(n);
      });
      n.gfx.on("pointerout", () => {
        if (dragging !== n) {
          drawNode(n, false, hoverDrop === n);
        }
        clearFakePosts();
      });
    });
    tags.forEach((t) => {
      t.container.on("pointerdown", (raw) => {
        const e = raw;
        dragTag = t;
        t.dragging = true;
        tagDragStart = { x: e.global.x, y: e.global.y };
        tagStart = { x: t.x, y: t.y };
        t.container.cursor = "grabbing";
        t.container.zIndex = 5e3;
      });
      t.container.on("pointerover", () => {
        if (dragTag || dragging) {
          return;
        }
        t.hover = true;
        paintTagChip(t);
        spawnFakePostsFromTag(t);
      });
      t.container.on("pointerout", () => {
        t.hover = false;
        paintTagChip(t);
        clearFakePosts();
      });
    });
    const onMove = (e) => {
      const rect = app.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (dragTag) {
        dragTag.x = tagStart.x + (px - tagDragStart.x);
        dragTag.y = tagStart.y + (py - tagDragStart.y);
        dragTag.container.x = dragTag.x;
        dragTag.container.y = dragTag.y;
        return;
      }
      if (!dragging) {
        return;
      }
      const dx = px - pointerStart.x;
      const dy = py - pointerStart.y;
      dragging.x = nodeStart.x + dx;
      dragging.y = nodeStart.y + dy;
      let hit = null;
      nodes.forEach((other) => {
        if (other === dragging) {
          return;
        }
        if (isDescendant(nodes, other.id, dragging.id)) {
          return;
        }
        const ddx = other.x - dragging.x;
        const ddy = other.y - dragging.y;
        if (Math.hypot(ddx, ddy) < other.radius + dragging.radius * 0.6) {
          hit = other;
        }
      });
      if (hit !== hoverDrop) {
        if (hoverDrop) {
          drawNode(hoverDrop, false, false);
        }
        hoverDrop = hit;
        if (hoverDrop) {
          drawNode(hoverDrop, false, true);
        }
      }
      drawNode(dragging, true, false);
    };
    const onUp = () => {
      if (dragTag) {
        dragTag.container.cursor = "grab";
        dragTag.container.zIndex = 0;
        dragTag.dragging = false;
        dragTag = null;
        return;
      }
      if (!dragging) {
        return;
      }
      const drop = hoverDrop;
      if (drop && drop.id !== dragging.parent) {
        dragging.parent = drop.id;
        layoutTree(nodes, stageW, stageH);
      }
      dragging.gfx.cursor = "grab";
      dragging.gfx.zIndex = 0;
      dragging.dragging = false;
      const dragged = dragging;
      dragging = null;
      if (hoverDrop) {
        drawNode(hoverDrop, false, false);
        hoverDrop = null;
      }
      drawNode(dragged, false, false);
    };
    app.canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    const tick = () => {
      const now = performance.now();
      const REPULSION_K2 = 6500;
      const SPRING_K2 = 0.05;
      const SPRING_LEN2 = 110;
      const ANCHOR_K = 0.012;
      const DAMPING = 0.82;
      const MAX_V = 8;
      const list = Array.from(nodes.values());
      const fxArr = new Array(list.length).fill(0);
      const fyArr = new Array(list.length).fill(0);
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a === dragging) {
          continue;
        }
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (b === dragging) {
            continue;
          }
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const d = Math.sqrt(d2);
          const minD = a.radius + b.radius;
          if (d > minD * 4) {
            continue;
          }
          const f = REPULSION_K2 / d2;
          const fx = dx / d * f;
          const fy = dy / d * f;
          fxArr[i] -= fx;
          fyArr[i] -= fy;
          fxArr[j] += fx;
          fyArr[j] += fy;
        }
      }
      list.forEach((c, idx) => {
        if (!c.parent || c.parent === ROOT_ID) {
          return;
        }
        if (c === dragging) {
          return;
        }
        const parent = nodes.get(c.parent);
        if (!parent || parent === dragging) {
          return;
        }
        const pIdx = list.indexOf(parent);
        const dx = parent.x - c.x;
        const dy = parent.y - c.y;
        const d = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
        const diff = d - SPRING_LEN2;
        const sx = dx / d * diff * SPRING_K2;
        const sy = dy / d * diff * SPRING_K2;
        fxArr[idx] += sx;
        fyArr[idx] += sy;
        if (pIdx >= 0) {
          fxArr[pIdx] -= sx;
          fyArr[pIdx] -= sy;
        }
      });
      list.forEach((n, idx) => {
        fxArr[idx] += (n.tx - n.x) * ANCHOR_K;
        fyArr[idx] += (n.ty - n.y) * ANCHOR_K;
      });
      list.forEach((n, idx) => {
        if (n === dragging) {
          n.vx = 0;
          n.vy = 0;
          return;
        }
        n.vx = (n.vx + fxArr[idx]) * DAMPING;
        n.vy = (n.vy + fyArr[idx]) * DAMPING;
        if (n.vx > MAX_V) {
          n.vx = MAX_V;
        } else if (n.vx < -MAX_V) {
          n.vx = -MAX_V;
        }
        if (n.vy > MAX_V) {
          n.vy = MAX_V;
        } else if (n.vy < -MAX_V) {
          n.vy = -MAX_V;
        }
        n.x += n.vx;
        n.y += n.vy;
      });
      drawEdges();
      nodes.forEach((n) => {
        const fx = n === dragging ? n.x : n.x + Math.sin(now * n.freqX + n.phaseX) * n.ampX;
        const fy = n === dragging ? n.y : n.y + Math.sin(now * n.freqY + n.phaseY) * n.ampY;
        drawNode(n, false, hoverDrop === n);
        n.gfx.x = fx;
        n.gfx.y = fy;
      });
      tags.forEach((t) => {
        if (t === dragTag) {
          return;
        }
        t.x += (t.tx - t.x) * 0.16;
        t.y += (t.ty - t.y) * 0.16;
        const fx = t.x + Math.sin(now * t.freqX + t.phaseX) * t.ampX;
        const fy = t.y + Math.sin(now * t.freqY + t.phaseY) * t.ampY * 0.6;
        t.container.x = fx;
        t.container.y = fy;
      });
      fakePosts.forEach((p, idx) => {
        let anchorX = 0;
        let anchorY = 0;
        if (p.anchorKind === "tag") {
          const t2 = tags.find((tg) => tg.id === p.anchorId);
          if (!t2) {
            return;
          }
          anchorX = t2.container.x;
          anchorY = t2.container.y;
        } else {
          const node = nodes.get(p.anchorId);
          if (!node) {
            return;
          }
          anchorX = node.gfx.x;
          anchorY = node.gfx.y;
        }
        const elapsed = now - p.spawnedAt;
        const t = Math.min(1, elapsed / 320);
        p.container.alpha = t;
        const wobble = Math.sin(now * 15e-4 + idx) * 4;
        const tx = anchorX + Math.cos(p.angle) * (p.orbit + wobble);
        const ty = anchorY + Math.sin(p.angle) * (p.orbit + wobble);
        p.container.x += (tx - p.container.x) * 0.16;
        p.container.y += (ty - p.container.y) * 0.16;
        const padX = 7;
        const padY = 3;
        const textW = p.text.width;
        const textH = p.text.height;
        const w = textW + padX * 2;
        const h = textH + padY * 2;
        p.text.x = -w / 2 + padX;
        p.text.y = -h / 2 + padY;
        p.bg.clear();
        p.bg.roundRect(-w / 2, -h / 2, w, h, h / 2);
        p.bg.fill({ color: 16777215, alpha: 0.95 });
        p.bg.stroke({
          color: p.accentColor,
          width: 1.2,
          alpha: 0.85
        });
      });
      const FIT_MARGIN = 24;
      const FIT_EASE = 0.08;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      nodes.forEach((n) => {
        const dx = n.gfx.x;
        const dy = n.gfx.y;
        const r = n.radius + 8;
        if (dx - r < minX) {
          minX = dx - r;
        }
        if (dy - r < minY) {
          minY = dy - r;
        }
        if (dx + r > maxX) {
          maxX = dx + r;
        }
        if (dy + r > maxY) {
          maxY = dy + r;
        }
      });
      tags.forEach((tg) => {
        const dx = tg.container.x;
        const dy = tg.container.y;
        const w = tg.width / 2 + 4;
        const h = tg.height / 2 + 4;
        if (dx - w < minX) {
          minX = dx - w;
        }
        if (dy - h < minY) {
          minY = dy - h;
        }
        if (dx + w > maxX) {
          maxX = dx + w;
        }
        if (dy + h > maxY) {
          maxY = dy + h;
        }
      });
      const bw = maxX - minX;
      const bh = maxY - minY;
      if (bw > 0 && bh > 0 && Number.isFinite(bw) && Number.isFinite(bh)) {
        const sx = (stageW - FIT_MARGIN * 2) / bw;
        const sy = (stageH - FIT_MARGIN * 2) / bh;
        const targetScale = Math.max(0.55, Math.min(1, sx, sy));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const targetX = stageW / 2 - cx * targetScale;
        const targetY = stageH / 2 - cy * targetScale;
        world.x += (targetX - world.x) * FIT_EASE;
        world.y += (targetY - world.y) * FIT_EASE;
        const curScale = world.scale.x;
        world.scale.set(curScale + (targetScale - curScale) * FIT_EASE);
      }
    };
    app.ticker.add(tick);
    const ro = new ResizeObserver(() => {
      stageW = stage.clientWidth || stageW;
      stageH = stage.clientHeight || stageH;
      layoutTree(nodes, stageW, stageH);
      layoutTags(tags, stageW, stageH);
    });
    ro.observe(stage);
    return () => {
      ro.disconnect();
      app.ticker.remove(tick);
      app.canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      clearFakePosts();
      try {
        app.destroy({ removeView: true }, { children: true });
      } catch {
      }
    };
  }
  function html(strings, ...values) {
    return { __wpdHtml: true, strings, values };
  }
  function isTemplateResult$1(v) {
    return !!v && v.__wpdHtml === true;
  }
  const MARKER_PREFIX = "$$wpd$$";
  const MARKER_RE = /\$\$wpd\$\$(\d+)\$\$/g;
  function joinWithMarkers(strings) {
    let out = strings[0];
    for (let i = 1; i < strings.length; i++) {
      out += `${MARKER_PREFIX}${i - 1}$$` + strings[i];
    }
    return out;
  }
  const compiledCache = /* @__PURE__ */ new WeakMap();
  function compile(strings) {
    const cached = compiledCache.get(strings);
    if (cached) {
      return cached;
    }
    const template = document.createElement("template");
    template.innerHTML = joinWithMarkers(strings);
    const recipes = [];
    const walk = (node, path) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        for (const attr of Array.from(el.attributes)) {
          const rawName = attr.name;
          const rawValue = attr.value;
          const prefix = rawName[0];
          if (MARKER_RE.test(rawValue)) {
            MARKER_RE.lastIndex = 0;
            if (prefix === "@") {
              const match = MARKER_RE.exec(rawValue);
              MARKER_RE.lastIndex = 0;
              recipes.push({
                path,
                kind: "event",
                name: rawName.slice(1),
                valueIndex: match ? Number(match[1]) : 0
              });
              el.removeAttribute(rawName);
            } else if (prefix === ".") {
              const match = MARKER_RE.exec(rawValue);
              MARKER_RE.lastIndex = 0;
              recipes.push({
                path,
                kind: "prop",
                name: rawName.slice(1),
                valueIndex: match ? Number(match[1]) : 0
              });
              el.removeAttribute(rawName);
            } else if (prefix === "?") {
              const match = MARKER_RE.exec(rawValue);
              MARKER_RE.lastIndex = 0;
              recipes.push({
                path,
                kind: "bool",
                name: rawName.slice(1),
                valueIndex: match ? Number(match[1]) : 0
              });
              el.removeAttribute(rawName);
            } else {
              const fragments = [];
              const indices = [];
              let lastEnd = 0;
              let m;
              MARKER_RE.lastIndex = 0;
              while ((m = MARKER_RE.exec(rawValue)) !== null) {
                fragments.push(rawValue.slice(lastEnd, m.index));
                indices.push(Number(m[1]));
                lastEnd = m.index + m[0].length;
              }
              fragments.push(rawValue.slice(lastEnd));
              recipes.push({
                path,
                kind: "attr",
                name: rawName,
                template: fragments,
                valueIndices: indices
              });
              el.setAttribute(rawName, "");
            }
          }
        }
      }
      const children = Array.from(node.childNodes);
      let shift = 0;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const liveIndex = i + shift;
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent || "";
          if (!MARKER_RE.test(text)) {
            MARKER_RE.lastIndex = 0;
            continue;
          }
          MARKER_RE.lastIndex = 0;
          const parent = child.parentNode;
          let lastEnd = 0;
          let m;
          const newNodes = [];
          const newRecipes = [];
          MARKER_RE.lastIndex = 0;
          while ((m = MARKER_RE.exec(text)) !== null) {
            if (m.index > lastEnd) {
              newNodes.push(document.createTextNode(text.slice(lastEnd, m.index)));
            }
            const placeholder = document.createTextNode("");
            newNodes.push(placeholder);
            newRecipes.push({
              path: [...path, liveIndex + newNodes.length - 1],
              kind: "node",
              valueIndex: Number(m[1])
            });
            lastEnd = m.index + m[0].length;
          }
          if (lastEnd < text.length) {
            newNodes.push(document.createTextNode(text.slice(lastEnd)));
          }
          for (const nn of newNodes) {
            parent.insertBefore(nn, child);
          }
          parent.removeChild(child);
          shift += newNodes.length - 1;
          recipes.push(...newRecipes);
        } else {
          walk(child, [...path, liveIndex]);
        }
      }
    };
    walk(template.content, []);
    const buildParts = (fragment) => {
      const out = [];
      for (const r of recipes) {
        let node = fragment;
        for (const idx of r.path) {
          node = node.childNodes[idx];
        }
        if (r.kind === "node") {
          out.push({
            kind: "node",
            valueIndex: r.valueIndex,
            child: {
              anchor: node,
              state: null
            }
          });
        } else if (r.kind === "attr") {
          out.push({
            kind: "attr",
            element: node,
            name: r.name,
            template: r.template,
            valueIndices: r.valueIndices
          });
        } else if (r.kind === "event") {
          out.push({
            kind: "event",
            valueIndex: r.valueIndex,
            element: node,
            name: r.name
          });
        } else if (r.kind === "prop") {
          out.push({
            kind: "prop",
            valueIndex: r.valueIndex,
            element: node,
            name: r.name
          });
        } else if (r.kind === "bool") {
          out.push({
            kind: "bool",
            valueIndex: r.valueIndex,
            element: node,
            name: r.name
          });
        }
      }
      return out;
    };
    const entry = { template, buildParts };
    compiledCache.set(strings, entry);
    return entry;
  }
  const mountState = /* @__PURE__ */ new WeakMap();
  function mountIntact(state, container) {
    for (const node of state.nodes) {
      if (node.parentNode !== container) {
        return false;
      }
    }
    return true;
  }
  function render(result, container) {
    const existing = mountState.get(container);
    if (existing && existing.strings === result.strings && mountIntact(existing, container)) {
      applyValues(existing.parts, result.values);
      return;
    }
    const compiled = compile(result.strings);
    const fragment = compiled.template.content.cloneNode(true);
    const parts = compiled.buildParts(fragment);
    const nodes = Array.from(fragment.childNodes);
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(fragment);
    applyValues(parts, result.values);
    mountState.set(container, { strings: result.strings, parts, nodes });
  }
  function applyValues(parts, values) {
    for (const part of parts) {
      if (part.kind === "node") {
        updateChildPart(part.child, values[part.valueIndex]);
      } else if (part.kind === "attr") {
        let composed = part.template[0];
        for (let i = 0; i < part.valueIndices.length; i++) {
          composed += formatText(values[part.valueIndices[i]]);
          composed += part.template[i + 1];
        }
        if (composed !== part.last) {
          part.last = composed;
          if (composed === "") {
            part.element.removeAttribute(part.name);
          } else {
            part.element.setAttribute(part.name, composed);
          }
        }
      } else if (part.kind === "event") {
        const next = values[part.valueIndex];
        if (next !== part.current) {
          if (part.current) {
            part.element.removeEventListener(part.name, part.current);
          }
          if (next) {
            part.element.addEventListener(part.name, next);
          }
          part.current = next;
        }
      } else if (part.kind === "prop") {
        const next = values[part.valueIndex];
        if (next !== part.last) {
          part.last = next;
          part.element[part.name] = next;
        }
      } else if (part.kind === "bool") {
        const next = !!values[part.valueIndex];
        if (next !== part.last) {
          part.last = next;
          if (next) {
            part.element.setAttribute(part.name, "");
          } else {
            part.element.removeAttribute(part.name);
          }
        }
      }
    }
  }
  function updateChildPart(child, value) {
    if (value === null || value === void 0 || value === false) {
      if (child.state) {
        disposeChildState(child.state);
        child.state = null;
      }
      return;
    }
    if (Array.isArray(value)) {
      updateArrayChild(child, value);
      return;
    }
    if (isTemplateResult$1(value)) {
      updateTemplateChild(child, value);
      return;
    }
    if (value instanceof Node) {
      updateNodeChild(child, value);
      return;
    }
    updateTextChild(child, formatText(value));
  }
  function updateNodeChild(child, node) {
    const old = child.state;
    if (old?.shape === "node" && old.node === node) {
      return;
    }
    if (old) {
      disposeChildState(old);
    }
    insertBeforeAnchor(child, [node]);
    child.state = { shape: "node", node };
  }
  function updateTextChild(child, text) {
    const old = child.state;
    if (old?.shape === "text") {
      if (old.text !== text) {
        old.node.textContent = text;
        old.text = text;
      }
      return;
    }
    if (old) {
      disposeChildState(old);
    }
    const node = document.createTextNode(text);
    insertBeforeAnchor(child, [node]);
    child.state = { shape: "text", node, text };
  }
  function updateTemplateChild(child, result) {
    const old = child.state;
    if (old?.shape === "template" && old.strings === result.strings) {
      applyValues(old.parts, result.values);
      return;
    }
    if (old) {
      disposeChildState(old);
    }
    const compiled = compile(result.strings);
    const fragment = compiled.template.content.cloneNode(true);
    const parts = compiled.buildParts(fragment);
    const topNodes = Array.from(fragment.childNodes);
    insertBeforeAnchor(child, [fragment]);
    applyValues(parts, result.values);
    child.state = {
      shape: "template",
      strings: result.strings,
      parts,
      nodes: topNodes
    };
  }
  function updateArrayChild(child, arr) {
    const old = child.state;
    if (old?.shape === "array" && old.entries.length === arr.length) {
      for (let i = 0; i < arr.length; i++) {
        updateChildPart(old.entries[i], arr[i]);
      }
      return;
    }
    if (old) {
      disposeChildState(old);
    }
    const entries = [];
    for (const v of arr) {
      const entryAnchor = document.createTextNode("");
      insertBeforeAnchor(child, [entryAnchor]);
      const entry = { anchor: entryAnchor, state: null };
      updateChildPart(entry, v);
      entries.push(entry);
    }
    child.state = { shape: "array", entries };
  }
  function insertBeforeAnchor(child, nodes) {
    const parent = child.anchor.parentNode;
    if (!parent) {
      return;
    }
    for (const node of nodes) {
      parent.insertBefore(node, child.anchor);
    }
  }
  function disposeChildState(state) {
    if (state.shape === "text") {
      state.node.remove();
      return;
    }
    if (state.shape === "template") {
      for (const node of state.nodes) {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
      return;
    }
    if (state.shape === "node") {
      if (state.node.parentNode) {
        state.node.parentNode.removeChild(state.node);
      }
      return;
    }
    for (const entry of state.entries) {
      if (entry.state) {
        disposeChildState(entry.state);
      }
      entry.anchor.remove();
    }
  }
  function formatText(v) {
    if (v === null || v === void 0 || v === false) {
      return "";
    }
    return String(v);
  }
  const _Component = class _Component extends HTMLElement {
    constructor() {
      super();
      this._renderScheduled = false;
      this._propValues = {};
      const ctor = this.constructor;
      if (ctor.shadow) {
        this.attachShadow({ mode: "open" });
        this._renderRoot = this.shadowRoot;
      } else {
        this._renderRoot = this;
      }
      this._installPropAccessors();
    }
    static get observedAttributes() {
      return this.props.map(kebab);
    }
    connectedCallback() {
      this._adoptStyles();
      this.requestUpdate();
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) {
        return;
      }
      const prop = camel(name);
      this._propValues[prop] = newValue;
      this.requestUpdate();
    }
    /**
     * Declarative class-name setter. Assign an array (or a
     * space-separated string) and the host's `class` attribute is
     * rewritten to match. Intended for programmatic styling — when
     * a plugin has enqueued its own stylesheet and wants to apply
     * one of those classes to a shell component:
     *
     * ```js
     * element.classNames = [ 'my-plugin-brand', 'is-active' ];
     * // → <wpd-select class="my-plugin-brand is-active">
     * ```
     *
     * The plain HTML `class="…"` attribute works just the same and
     * is always preferred when writing markup by hand — this setter
     * exists for the JS-API case where the caller has an array of
     * conditional classes in hand.
     *
     * Getter returns the current `classList` as a plain array for
     * symmetric read/write.
     *
     * @since 0.5.0
     */
    get classNames() {
      return Array.from(this.classList);
    }
    set classNames(next) {
      if (next === null || next === void 0) {
        this.removeAttribute("class");
        return;
      }
      const list = Array.isArray(next) ? next : String(next).split(/\s+/);
      const cleaned = list.map((s) => String(s).trim()).filter((s) => s !== "");
      this.className = cleaned.join(" ");
    }
    /**
     * Request a re-render explicitly. Components rarely need this —
     * declare state via props + attribute observers and the render
     * loop picks up changes automatically.
     */
    requestUpdate() {
      this._scheduleRender();
    }
    /**
     * Dispatch a `CustomEvent` with a `detail`. Bubbles + composed
     * by default (matches typical WC UX — events cross shadow
     * boundaries, parents can listen without knowing about internal
     * structure).
     */
    emit(name, detail) {
      return this.dispatchEvent(
        new CustomEvent(name, {
          detail,
          bubbles: true,
          composed: true
        })
      );
    }
    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------
    /**
     * Wire every `static props` entry to a matched property getter +
     * setter on the element. Setting the property reflects into the
     * attribute (so downstream observers + CSS selectors see it);
     * reading the property falls back to the attribute.
     */
    _installPropAccessors() {
      const ctor = this.constructor;
      for (const prop of ctor.props) {
        if (Object.getOwnPropertyDescriptor(this, prop)) {
          continue;
        }
        const attr = kebab(prop);
        Object.defineProperty(this, prop, {
          get: () => {
            if (prop in this._propValues) {
              return this._propValues[prop];
            }
            return this.getAttribute(attr);
          },
          set: (value) => {
            let str;
            if (value === null || value === void 0 || value === false) {
              str = null;
            } else if (value === true) {
              str = "";
            } else {
              str = String(value);
            }
            this._propValues[prop] = str;
            if (str === null) {
              this.removeAttribute(attr);
            } else {
              this.setAttribute(attr, str);
            }
            this.requestUpdate();
          },
          enumerable: true,
          configurable: true
        });
      }
    }
    /**
     * Schedule a render on the next microtask. Multiple property
     * assignments in the same tick collapse into a single render.
     */
    _scheduleRender() {
      if (this._renderScheduled || !this.isConnected) {
        return;
      }
      this._renderScheduled = true;
      queueMicrotask(() => {
        this._renderScheduled = false;
        if (!this.isConnected) {
          return;
        }
        render(this.render(), this._renderRoot);
      });
    }
    /**
     * Mount adoptable stylesheets onto the shadow root (via
     * `adoptedStyleSheets`) or the light DOM (via one `<style>`
     * tag per def). No-op if `static styles` is empty.
     */
    _adoptStyles() {
      const ctor = this.constructor;
      if (ctor.styles.length === 0) {
        return;
      }
      if (ctor.shadow && this.shadowRoot) {
        const sheets = ctor.styles.map((s) => s.sheet).filter((s) => s !== null);
        this.shadowRoot.adoptedStyleSheets = sheets;
        if (sheets.length !== ctor.styles.length) {
          for (const s of ctor.styles) {
            if (!s.sheet) {
              const tag = document.createElement("style");
              tag.textContent = s.cssText;
              this.shadowRoot.appendChild(tag);
            }
          }
        }
      } else {
        this._adoptLightStyles(ctor);
      }
    }
    _adoptLightStyles(ctor) {
      if (_Component._lightStylesAdopted.has(ctor)) {
        return;
      }
      _Component._lightStylesAdopted.add(ctor);
      for (const s of ctor.styles) {
        const tag = document.createElement("style");
        tag.dataset.wpdUi = this.tagName.toLowerCase();
        tag.textContent = s.cssText;
        document.head.appendChild(tag);
      }
    }
  };
  _Component.props = [];
  _Component.styles = [];
  _Component.shadow = true;
  _Component._lightStylesAdopted = /* @__PURE__ */ new WeakSet();
  let Component = _Component;
  function defineComponent(tag, ctor) {
    if (customElements.get(tag)) {
      return;
    }
    customElements.define(tag, ctor);
  }
  function kebab(s) {
    return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
  }
  function camel(s) {
    return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
  const SUPPORTS_CONSTRUCTABLE_SHEETS = (() => {
    try {
      const s = new CSSStyleSheet();
      return typeof s.replaceSync === "function";
    } catch {
      return false;
    }
  })();
  function css(strings, ...values) {
    let text = strings[0];
    for (let i = 1; i < strings.length; i++) {
      const v = values[i - 1];
      if (typeof v === "string" || typeof v === "number") {
        text += String(v);
      } else if (v && v.__wpdCss) {
        text += v.cssText;
      } else {
        throw new TypeError(
          "[wpd-ui] css`` interpolations must be strings, numbers, or other css`` results. Got: " + typeof v
        );
      }
      text += strings[i];
    }
    if (SUPPORTS_CONSTRUCTABLE_SHEETS) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      return { __wpdCss: true, sheet, cssText: text };
    }
    return { __wpdCss: true, sheet: null, cssText: text };
  }
  function computeAutoId(element) {
    const parts = [];
    const tabs = [];
    let windowId = null;
    let node = element.parentElement;
    while (node) {
      if (node === document.body || node === document.documentElement) {
        break;
      }
      const id = node.id || "";
      if (id.startsWith("wp-window-")) {
        windowId = id.slice("wp-window-".length);
        break;
      }
      if (node.tagName.toLowerCase() === "wpd-tabpanel") {
        const forValue = node.getAttribute("for");
        if (forValue) {
          tabs.unshift(forValue);
        }
      }
      node = node.parentElement;
    }
    if (windowId) {
      parts.push(slugify(windowId));
    }
    for (const tab of tabs) {
      parts.push("tab-" + slugify(tab));
    }
    const label = element.getAttribute("label");
    if (label) {
      parts.push(slugify(label));
    }
    if (parts.length === 0) {
      return "wpd-unnamed";
    }
    return "wpd-" + parts.filter((p) => p !== "").join("-");
  }
  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function ensureAutoId(element) {
    if (element.id) {
      return element.id;
    }
    const id = computeAutoId(element);
    element.id = id;
    return id;
  }
  const styles$8 = css`:host{display:block;--wpd-table-bg:var( --wpd-surface,#fff );--wpd-table-border:var( --wpd-border,rgba( 0,0,0,0.08 ) );--wpd-table-column-border:var( --wpd-border-strong,rgba( 0,0,0,0.14 ) );--wpd-table-header-bg:var( --wpd-surface-elevated,#f6f7f7 );--wpd-table-row-hover:rgba( 0,0,0,0.04 );--wpd-table-stripe:rgba( 0,0,0,0.03 );--wpd-table-cell-padding:8px 12px;--wpd-table-font-size:13px;--wpd-table-max-height:none;font-size:var( --wpd-table-font-size );color:inherit}:host( [ hidden ] ){display:none}.scroll{position:relative;overflow:auto;max-height:var( --wpd-table-max-height );border:1px solid var( --wpd-table-border );border-radius:4px;background:var( --wpd-table-bg )}table{width:100%;border-collapse:separate;border-spacing:0;background:var( --wpd-table-bg )}thead th{text-align:start;font-weight:600;background-color:var( --wpd-table-header-bg );padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );white-space:nowrap}tbody td{padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );background-color:var( --wpd-table-bg );vertical-align:middle}tbody tr:last-child td{border-bottom:0}:host( [ striped ] ) tbody tr:nth-child( odd ) td{background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ hover ] ) tbody tr:hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}:host( [ hover ] [ striped ] ) tbody tr:nth-child( odd ):hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) ),linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ compact ] ){--wpd-table-cell-padding:4px 8px;--wpd-table-font-size:12px}:host( [ bordered ] ) thead th,:host( [ bordered ] ) tbody td{border-inline-end:1px solid var( --wpd-table-column-border )}:host( [ bordered ] ) thead th:last-child,:host( [ bordered ] ) tbody td:last-child{border-inline-end:0}th.is-sticky,td.is-sticky{position:sticky;z-index:10}tbody td.is-sticky{background-color:var( --wpd-table-bg )}thead th.is-sticky{background-color:var( --wpd-table-header-bg );z-index:30}:host( [ sticky-header ] ) thead th{position:sticky;top:0;z-index:20}:host( [ sticky-header ] ) thead tr.filter-row th{top:var( --wpd-table-header-height,33px );z-index:20}:host( [ sticky-header ] ) thead th.is-sticky{z-index:40}:host( [ sticky-header ] ) thead tr.filter-row th.is-sticky{z-index:40}th.is-sticky-edge,td.is-sticky-edge{border-inline-end:var( --wpd-table-sticky-edge,2px solid var( --wpd-table-border ) )}.align-center{text-align:center}.align-end{text-align:end}.filter-row th{padding:4px 8px;background-color:var( --wpd-table-header-bg );border-bottom:1px solid var( --wpd-table-border );font-weight:400}.filter-input,.filter-select{width:100%;min-width:60px;box-sizing:border-box;padding:4px 6px;font:inherit;color:inherit;background-color:var( --wpd-table-bg );border:1px solid var( --wpd-table-border );border-radius:3px}.filter-input:focus,.filter-select:focus{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-1px}.expander{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:3px;font-size:11px;line-height:1}.expander:hover{background:rgba( 0,0,0,0.06 )}td.col-expander,th.col-expander{width:36px;min-width:36px;padding-left:0;padding-right:0;text-align:center}tr.subtable td{padding:0;background-color:var( --wpd-table-bg );background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) );border-bottom:1px solid var( --wpd-table-border )}tr.subtable .subtable-inner{padding:8px 12px 8px 32px}tr.empty td{padding:24px;text-align:center;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );font-style:italic}thead th.is-sortable{cursor:pointer;user-select:none}thead th.is-sortable:hover{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}thead th.is-sortable:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-2px}.sort-indicator{font-size:10px;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );margin-inline-start:2px}thead th.sort-asc .sort-indicator,thead th.sort-desc .sort-indicator{color:var( --wp-admin-theme-color,#2271b1 )}td.col-select,th.col-select{width:40px;min-width:40px;padding-left:0;padding-right:0;text-align:center}.select-all-checkbox,.select-row-checkbox{cursor:pointer;margin:0}tbody tr.is-selected td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 10%,var( --wpd-table-bg ) );background-image:none}tbody tr.is-selected:hover td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 16%,var( --wpd-table-bg ) )}tbody tr.skeleton td{padding:var( --wpd-table-cell-padding )}.skeleton-bar{display:block;height:12px;border-radius:3px;background:linear-gradient( 90deg,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 0%,var( --wpd-table-skeleton-highlight,rgba( 0,0,0,0.14 ) ) 50%,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 100% );background-size:200% 100%;animation:wpd-table-skeleton-pulse 1.4s ease-in-out infinite}@keyframes wpd-table-skeleton-pulse{0%{background-position:200% 50%}100%{background-position:-200% 50%}}@media ( prefers-reduced-motion:reduce ){.skeleton-bar{animation:none}}`;
  const EXPANDER_KEY = "__wpd_expander__";
  const SELECT_KEY = "__wpd_select__";
  const _WpdTable = class _WpdTable extends Component {
    constructor() {
      super(...arguments);
      this._data = [];
      this._columns = [];
      this._filters = {};
      this._expanded = /* @__PURE__ */ new Set();
      this._subTable = null;
      this._sort = null;
      this._selection = /* @__PURE__ */ new Set();
      this._getRowId = (_row, index) => index;
      this._filterCache = /* @__PURE__ */ new Map();
      this._paintScheduled = false;
      this._stickyHeaderWarned = false;
      this._stickyRaceWarned = false;
      this._resizeObserver = null;
      this._stickyMicroScheduled = false;
      this._stickyRafHandle = null;
      this._loadingDesyncWarned = false;
      this._lastStickyIndex = -1;
    }
    // ------------------------------------------------------------------
    // Public properties — set from JS (use `.data=${...}` in templates).
    // ------------------------------------------------------------------
    /** The row buffer. Reassigning replaces (and clears expansion state). */
    get data() {
      return this._data;
    }
    set data(next) {
      this._data = Array.isArray(next) ? next.slice() : [];
      this._expanded.clear();
      this._schedulePaint();
    }
    /** Column descriptors. See {@link WpdTableColumn}. */
    get columns() {
      return this._columns;
    }
    set columns(next) {
      this._columns = Array.isArray(next) ? next.slice() : [];
      const keys = new Set(this._columns.map((c) => c.key));
      for (const k of Object.keys(this._filters)) {
        if (!keys.has(k)) {
          delete this._filters[k];
        }
      }
      for (const k of Array.from(this._filterCache.keys())) {
        if (!keys.has(k)) {
          this._filterCache.delete(k);
        }
      }
      if (this._sort && !keys.has(this._sort.key)) {
        this._sort = null;
      }
      this._schedulePaint();
    }
    /** Read or replace the current filter map. */
    get filters() {
      return { ...this._filters };
    }
    set filters(next) {
      this._filters = next ? { ...next } : {};
      this._schedulePaint();
    }
    /** Read or set the active sort. `null` clears it. */
    get sort() {
      return this._sort ? { ...this._sort } : null;
    }
    set sort(next) {
      this._sort = next ? { ...next } : null;
      this._schedulePaint();
    }
    /** Read or replace the selection (set of row ids). */
    get selection() {
      return new Set(this._selection);
    }
    set selection(next) {
      this._selection = new Set(next ?? []);
      this._schedulePaint();
    }
    /** The currently-selected rows (resolved from `selection` + `data`). */
    get selectedRows() {
      const out = [];
      this._data.forEach((row, i) => {
        if (this._selection.has(this._getRowId(row, i))) {
          out.push(row);
        }
      });
      return out;
    }
    /**
     * The rows currently visible — i.e. passing the active client-side
     * filters, in data order. This is the row set `selectAll()` and
     * the header select-all tri-state operate on.
     *
     * Destructive bulk consumers should resolve `selection` against
     * THIS list rather than `data`: selection deliberately survives
     * `data` reassignment, and a data-driven change (a realtime
     * refresh editing a row so it no longer matches an active filter)
     * can hide a selected row without any filter event firing. Rows
     * the user cannot see must never be swept into a destructive
     * action. See `collectSelectedItems()` in src/recycle-bin/index.ts
     * for the canonical consumer.
     *
     * @since 0.9.4
     */
    get visibleRows() {
      return this._filteredRows().map((entry) => entry.row);
    }
    /** Stable row-id extractor. Default is row index. */
    get getRowId() {
      return this._getRowId;
    }
    set getRowId(fn) {
      this._getRowId = typeof fn === "function" ? fn : (_r, i) => i;
      this._schedulePaint();
    }
    /**
     * Sub-table accessor. Return `null` (or omit) for rows with no
     * children. Return `{ columns, data }` to render a nested
     * `<wpd-table>` inline; or return any `Node` / `html\`\`` template
     * for fully custom expanded content.
     */
    get subTable() {
      return this._subTable;
    }
    set subTable(fn) {
      this._subTable = typeof fn === "function" ? fn : null;
      this._expanded.clear();
      this._schedulePaint();
    }
    /** Read or replace the expansion set (row indices that are open). */
    get expanded() {
      return new Set(this._expanded);
    }
    set expanded(next) {
      this._expanded = new Set(next ?? []);
      this._schedulePaint();
    }
    // ------------------------------------------------------------------
    // Programmatic methods
    // ------------------------------------------------------------------
    /** Open a row's sub-table by index. No-op if the index is out of range. */
    expand(index) {
      if (index < 0 || index >= this._data.length) {
        return;
      }
      if (this._expanded.has(index)) {
        return;
      }
      this._expanded.add(index);
      this.emit("wpd-table-expand-change", {
        row: this._data[index],
        index,
        expanded: true
      });
      this._schedulePaint();
    }
    /** Close a row's sub-table by index. No-op if it wasn't open. */
    collapse(index) {
      if (!this._expanded.has(index)) {
        return;
      }
      this._expanded.delete(index);
      this.emit("wpd-table-expand-change", {
        row: this._data[index],
        index,
        expanded: false
      });
      this._schedulePaint();
    }
    /** Open every row that has children. */
    expandAll() {
      if (!this._subTable) {
        return;
      }
      let changed = false;
      for (let i = 0; i < this._data.length; i++) {
        if (!this._subTable(this._data[i], i)) {
          continue;
        }
        if (!this._expanded.has(i)) {
          this._expanded.add(i);
          changed = true;
        }
      }
      if (changed) {
        this._schedulePaint();
      }
    }
    /** Close every open row. */
    collapseAll() {
      if (this._expanded.size === 0) {
        return;
      }
      this._expanded.clear();
      this._schedulePaint();
    }
    isExpanded(index) {
      return this._expanded.has(index);
    }
    /** Drop every active filter and emit `wpd-table-filter-change`. */
    clearFilters() {
      if (Object.keys(this._filters).length === 0) {
        return;
      }
      this._filters = {};
      this.emit("wpd-table-filter-change", { filters: {} });
      this._schedulePaint();
    }
    /** Drop the active sort and emit `wpd-table-sort-change`. */
    clearSort() {
      if (this._sort === null) {
        return;
      }
      this._sort = null;
      this.emit("wpd-table-sort-change", { sort: null });
      this._schedulePaint();
    }
    /**
     * Add a row id to the selection. Emits `wpd-table-selection-change`.
     *
     * Selection mutators (`select` / `deselect` / `selectAll` /
     * `clearSelection`) update the affected row in place via
     * {@link _syncSelectionDom} rather than re-rendering the whole
     * tbody — a rebuild would tear down the focused checkbox and
     * (because scroll-anchoring abandons a momentarily empty container)
     * could snap scroll back to the top.
     */
    select(id) {
      if (this._selection.has(id)) {
        return;
      }
      const mode = this._readSelectable();
      const previouslySelected = mode === "single" ? Array.from(this._selection) : [];
      if (mode === "single") {
        this._selection.clear();
      }
      this._selection.add(id);
      this._emitSelectionChange();
      this._syncSelectionDom([id, ...previouslySelected]);
    }
    /** Remove a row id from the selection. */
    deselect(id) {
      if (!this._selection.delete(id)) {
        return;
      }
      this._emitSelectionChange();
      this._syncSelectionDom([id]);
    }
    /** Select every visible row — the rows passing the active client-side filters (multi-mode only). */
    selectAll() {
      if (this._readSelectable() !== "multi") {
        return;
      }
      for (const { row, index } of this._filteredRows()) {
        this._selection.add(this._getRowId(row, index));
      }
      this._emitSelectionChange();
      this._syncSelectionDom("all");
    }
    /** Empty the selection. */
    clearSelection() {
      if (this._selection.size === 0) {
        return;
      }
      this._selection.clear();
      this._emitSelectionChange();
      this._syncSelectionDom("all");
    }
    /**
     * Apply a selection change to the existing tbody DOM without
     * rebuilding it. Updates each affected row's `is-selected` class
     * and `select-row-checkbox` `checked` state, then re-syncs the
     * header select-all checkbox (checked / indeterminate / empty).
     *
     * @param ids `'all'` to walk every row, or an iterable of row ids
     *            whose rows need updating. Unknown ids are silently
     *            skipped (row may not be in the current filter/page).
     */
    _syncSelectionDom(ids) {
      const root = this.shadowRoot;
      if (!root) {
        return;
      }
      const tbody = root.querySelector("tbody");
      if (!tbody) {
        return;
      }
      let needle = null;
      if (ids !== "all") {
        needle = /* @__PURE__ */ new Set();
        for (const id of ids) {
          needle.add(String(id));
        }
      }
      const rows = tbody.querySelectorAll(
        "tr[data-row-id]"
      );
      for (const tr of rows) {
        const rowIdStr = tr.dataset.rowId;
        if (rowIdStr === void 0) {
          continue;
        }
        if (needle && !needle.has(rowIdStr)) {
          continue;
        }
        const idx = Number(tr.dataset.rowIndex);
        if (!Number.isFinite(idx)) {
          continue;
        }
        const row = this._data[idx];
        if (row === void 0) {
          continue;
        }
        const id = this._getRowId(row, idx);
        const isSelected = this._selection.has(id);
        tr.classList.toggle("is-selected", isSelected);
        const cb = tr.querySelector(
          "input.select-row-checkbox"
        );
        if (cb && cb.checked !== isSelected) {
          cb.checked = isSelected;
        }
      }
      const headerCb = root.querySelector(
        "thead .select-all-checkbox"
      );
      if (headerCb) {
        const { total, selected } = this._visibleSelectionStats();
        headerCb.checked = total > 0 && selected === total;
        headerCb.indeterminate = selected > 0 && selected < total;
      }
    }
    /** Scroll the (filtered) row at `index` into view inside the table's scroll container. */
    scrollToRow(index) {
      const root = this.shadowRoot;
      if (!root) {
        return;
      }
      const rows = root.querySelectorAll(
        "tbody tr:not(.subtable):not(.empty):not(.skeleton)"
      );
      const row = rows[index];
      if (row) {
        row.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
    connectedCallback() {
      super.connectedCallback();
      this._schedulePaint();
    }
    disconnectedCallback() {
      this._resizeObserver?.disconnect();
      this._resizeObserver = null;
      if (this._stickyRafHandle !== null && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this._stickyRafHandle);
        this._stickyRafHandle = null;
      }
    }
    /**
     * Force a sticky-offsets recompute. Public escape hatch for the
     * rare case where layout settles after every internal hook has
     * fired — e.g. an out-of-band font swap or a JS-driven width
     * change on an ancestor that doesn't bubble through ResizeObserver.
     *
     * Usually you don't need this: the component schedules recomputes
     * on a microtask + animation frame after every paint, and a
     * ResizeObserver on the inner scroll element catches geometry
     * changes thereafter. Reach for `recomputeLayout()` only if you've
     * confirmed that all of those pathways missed your case.
     */
    recomputeLayout() {
      this._applyStickyOffsets();
      this._measureHeaderHeight();
    }
    // ------------------------------------------------------------------
    // Skeleton + paint pipeline
    // ------------------------------------------------------------------
    render() {
      return html`
			<div class="scroll" part="scroll">
				<table part="table">
					<colgroup></colgroup>
					<thead></thead>
					<tbody></tbody>
				</table>
			</div>
		`;
    }
    requestUpdate() {
      super.requestUpdate();
      this._schedulePaint();
    }
    _schedulePaint() {
      if (this._paintScheduled || !this.isConnected) {
        return;
      }
      this._paintScheduled = true;
      queueMicrotask(() => {
        this._paintScheduled = false;
        if (!this.isConnected) {
          return;
        }
        this._paint();
      });
    }
    _paint() {
      const root = this.shadowRoot;
      if (!root) {
        return;
      }
      if (!root.querySelector("tbody")) {
        render(this.render(), root);
      }
      const colgroup = root.querySelector("colgroup");
      const thead = root.querySelector("thead");
      const tbody = root.querySelector("tbody");
      if (!colgroup || !thead || !tbody) {
        return;
      }
      const cols = this._effectiveColumns();
      const stickyN = this._readStickyColumns();
      this._lastStickyIndex = this._computeLastStickyIndex(cols, stickyN);
      this._paintColgroup(colgroup, cols);
      this._paintHead(thead, cols, stickyN);
      this._paintBody(tbody, cols, stickyN);
      this._applyStickyOffsets();
      this._measureHeaderHeight();
      this._scheduleStickyOffsets();
      this._maybeWarnStickyHeader();
      this._maybeWarnLoadingDesync(tbody);
      this._ensureResizeObserver();
    }
    /**
     * Diagnostic for the "I set `loading` but the skeleton never
     * appeared" footgun. If we get here with the attribute on but no
     * `.skeleton` rows in `tbody`, something between attribute set and
     * paint went off the rails — historically this happened when the
     * base `Component.attributeChangedCallback` called `_scheduleRender`
     * directly, bypassing our `requestUpdate` override. Same pattern as
     * the sticky-columns 0px tripwire: should never fire, but if it
     * does, names the bug instead of leaving the dev guessing.
     */
    _maybeWarnLoadingDesync(tbody) {
      if (this._loadingDesyncWarned) {
        return;
      }
      if (!this.hasAttribute("loading")) {
        return;
      }
      if (tbody.querySelector("tr.skeleton")) {
        return;
      }
      this._loadingDesyncWarned = true;
      console.warn(
        "[wpd-table] `loading` attribute is set but no skeleton rows rendered. Either attributeChangedCallback didn't route through requestUpdate (framework regression), or `loading` was set after the most recent paint and no follow-up trigger ran. Toggling `data` will force a paint as a workaround."
      );
    }
    /**
     * Belt-and-braces sticky-offset scheduling.
     *
     *   - Microtask: cheap, fires after the current task drains. Fixes
     *     mounts where the synchronous read in `_paint` happened before
     *     a sibling style applied.
     *   - rAF: fires before the next paint. Catches "layout settles
     *     after a queued style mutation" races — the most common cause
     *     of "col 1 ended up at inset-inline-start: 0px".
     *
     * Both reduce to a no-op when nothing changed. The cost is two
     * extra DOM reads per paint; the win is the bug class disappears.
     */
    _scheduleStickyOffsets() {
      if (!this._stickyMicroScheduled) {
        this._stickyMicroScheduled = true;
        queueMicrotask(() => {
          this._stickyMicroScheduled = false;
          if (this.isConnected) {
            this._applyStickyOffsets();
          }
        });
      }
      if (this._stickyRafHandle === null && typeof requestAnimationFrame !== "undefined") {
        this._stickyRafHandle = requestAnimationFrame(() => {
          this._stickyRafHandle = null;
          if (this.isConnected) {
            this._applyStickyOffsets();
            this._measureHeaderHeight();
          }
        });
      }
    }
    /**
     * Wire a `ResizeObserver` on the inner `.scroll` element (NOT the
     * host). Why: the host's outer width is often pinned by its parent
     * panel — a vertical scrollbar appearing inside the table changes
     * the inner scroll-area width by ~15px without changing the host
     * size. Observing the host would miss that reflow and leave sticky
     * offsets stale.
     *
     * Idempotent — runs once after the first paint produces a real
     * `.scroll` element. Disconnect happens in `disconnectedCallback`.
     */
    _ensureResizeObserver() {
      if (this._resizeObserver) {
        return;
      }
      if (typeof ResizeObserver === "undefined") {
        return;
      }
      const scroll = this.shadowRoot?.querySelector(
        ".scroll"
      );
      if (!scroll) {
        return;
      }
      this._resizeObserver = new ResizeObserver(() => {
        if (!this.isConnected) {
          return;
        }
        this._applyStickyOffsets();
        this._measureHeaderHeight();
        this._stickyHeaderWarned = false;
        this._maybeWarnStickyHeader();
      });
      this._resizeObserver.observe(scroll);
      this._resizeObserver.observe(this);
    }
    _paintColgroup(colgroup, cols) {
      const out = [];
      for (const c of cols) {
        const col = document.createElement("col");
        if (c.width) {
          col.style.width = c.width;
        }
        out.push(col);
      }
      colgroup.replaceChildren(...out);
    }
    _paintHead(thead, cols, stickyN) {
      const newHeaderRow = document.createElement("tr");
      newHeaderRow.setAttribute("part", "header-row");
      for (let i = 0; i < cols.length; i++) {
        newHeaderRow.appendChild(this._buildHeaderCell(cols[i], i, stickyN));
      }
      const existingHeader = thead.querySelector(
        ':scope > tr[part="header-row"]'
      );
      if (existingHeader) {
        thead.replaceChild(newHeaderRow, existingHeader);
      } else {
        thead.insertBefore(newHeaderRow, thead.firstChild);
      }
      const hasFilter = cols.some(
        (c) => c.filter || Array.isArray(c.filterOptions) || typeof c.filterRender === "function"
      );
      let existingFilter = thead.querySelector(
        ":scope > tr.filter-row"
      );
      if (hasFilter) {
        const cells = [];
        for (let i = 0; i < cols.length; i++) {
          cells.push(this._buildFilterCell(cols[i], i, stickyN));
        }
        if (!existingFilter) {
          existingFilter = document.createElement("tr");
          existingFilter.classList.add("filter-row");
          existingFilter.setAttribute("part", "filter-row");
          thead.appendChild(existingFilter);
        }
        const current = Array.from(existingFilter.children);
        let same = current.length === cells.length;
        if (same) {
          for (let i = 0; i < cells.length; i++) {
            if (current[i] !== cells[i]) {
              same = false;
              break;
            }
          }
        }
        if (!same) {
          const wanted = new Set(cells);
          for (const cell of cells) {
            existingFilter.appendChild(cell);
          }
          for (const child of Array.from(existingFilter.children)) {
            if (!wanted.has(child)) {
              existingFilter.removeChild(child);
            }
          }
        }
      } else if (existingFilter) {
        existingFilter.remove();
      }
    }
    _buildHeaderCell(col, index, stickyN) {
      const th = document.createElement("th");
      th.setAttribute("scope", "col");
      th.dataset.key = col.key;
      this._applyCellClasses(th, col, index, stickyN);
      if (col.minWidth) {
        th.style.minWidth = col.minWidth;
      }
      if (col.key === SELECT_KEY) {
        const mode = this._readSelectable();
        if (mode === "multi") {
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = "select-all-checkbox";
          cb.setAttribute("data-noclick", "");
          cb.setAttribute("aria-label", "Select all rows");
          const { total, selected } = this._visibleSelectionStats();
          cb.checked = total > 0 && selected === total;
          cb.indeterminate = selected > 0 && selected < total;
          cb.addEventListener("change", () => {
            if (cb.checked) {
              this.selectAll();
            } else {
              this.clearSelection();
            }
          });
          th.appendChild(cb);
        }
        return th;
      }
      th.textContent = col.label ?? (col.key === EXPANDER_KEY ? "" : col.key);
      if (col.sortable) {
        th.classList.add("is-sortable");
        const isActive = this._sort?.key === col.key;
        const indicator = document.createElement("span");
        indicator.className = "sort-indicator";
        let arrow = "";
        if (isActive) {
          arrow = this._sort.direction === "asc" ? " ▲" : " ▼";
        }
        indicator.textContent = arrow;
        th.appendChild(indicator);
        if (isActive) {
          th.classList.add(
            this._sort.direction === "asc" ? "sort-asc" : "sort-desc"
          );
        }
        th.addEventListener("click", () => this._cycleSort(col.key));
      }
      return th;
    }
    _buildFilterCell(col, index, stickyN) {
      const cached = this._filterCache.get(col.key);
      const hasExplicitOptions = Array.isArray(col.filterOptions);
      const hasCustomRender = typeof col.filterRender === "function";
      let desiredKind;
      if (!col.filter && !hasExplicitOptions && !hasCustomRender || col.key === EXPANDER_KEY || col.key === SELECT_KEY) {
        desiredKind = "none";
      } else if (hasCustomRender) {
        desiredKind = "custom";
      } else if (col.filter === "select" || hasExplicitOptions) {
        desiredKind = "select";
      } else {
        desiredKind = "text";
      }
      if (cached && cached.kind === desiredKind) {
        cached.th.className = "";
        this._applyCellClasses(cached.th, col, index, stickyN);
        if (desiredKind === "select") {
          const select = cached.control;
          const opts = this._resolveFilterOptions(col);
          const optsKey = opts.map((o) => o.value).join("|");
          if (optsKey !== cached.optionsKey) {
            this._populateSelect(select, opts, this._filters[col.key] ?? "");
            cached.optionsKey = optsKey;
          } else {
            select.value = this._filters[col.key] ?? "";
          }
        } else if (desiredKind === "text") {
          const input = cached.control;
          const want = this._filters[col.key] ?? "";
          if (input.value !== want && input.ownerDocument.activeElement !== input) {
            input.value = want;
          }
        } else if (desiredKind === "custom" && col.filterRender) {
          col.filterRender(cached.th, {
            value: this._filters[col.key] ?? "",
            setValue: (next) => this._onFilterChange(col.key, next),
            col
          });
        }
        return cached.th;
      }
      const th = document.createElement("th");
      this._applyCellClasses(th, col, index, stickyN);
      if (desiredKind === "none") {
        this._filterCache.set(col.key, {
          th,
          control: null,
          optionsKey: "",
          kind: "none"
        });
        return th;
      }
      if (desiredKind === "custom" && col.filterRender) {
        col.filterRender(th, {
          value: this._filters[col.key] ?? "",
          setValue: (next) => this._onFilterChange(col.key, next),
          col
        });
        this._filterCache.set(col.key, {
          th,
          control: null,
          optionsKey: "",
          kind: "custom"
        });
        return th;
      }
      let control;
      let optionsKey = "";
      if (desiredKind === "select") {
        const select = document.createElement("select");
        select.classList.add("filter-select");
        select.setAttribute("data-noclick", "");
        select.setAttribute(
          "aria-label",
          `Filter ${col.label ?? col.key}`
        );
        const opts = this._resolveFilterOptions(col);
        this._populateSelect(select, opts, this._filters[col.key] ?? "");
        optionsKey = opts.map((o) => o.value).join("|");
        select.addEventListener("change", () => {
          this._onFilterChange(col.key, select.value);
        });
        control = select;
      } else {
        const input = document.createElement("input");
        input.type = "search";
        input.classList.add("filter-input");
        input.setAttribute("data-noclick", "");
        input.setAttribute("placeholder", "Filter…");
        input.setAttribute("aria-label", `Filter ${col.label ?? col.key}`);
        input.value = this._filters[col.key] ?? "";
        input.addEventListener("input", () => {
          this._onFilterChange(col.key, input.value);
        });
        control = input;
      }
      th.appendChild(control);
      this._filterCache.set(col.key, {
        th,
        control,
        optionsKey,
        kind: desiredKind
      });
      return th;
    }
    _populateSelect(select, options, current) {
      select.replaceChildren();
      const all = document.createElement("option");
      all.value = "";
      all.textContent = "All";
      select.appendChild(all);
      for (const opt of options) {
        const el = document.createElement("option");
        el.value = opt.value;
        el.textContent = opt.label;
        if (opt.value === current) {
          el.selected = true;
        }
        select.appendChild(el);
      }
      select.value = current;
    }
    /**
     * Resolve the option list for a select-filter column. Explicit
     * `filterOptions` win — that's the contract for server-driven
     * tables that need the dropdown to list values not present on
     * the current page. Without `filterOptions`, fall back to the
     * unique row values in the column (legacy behaviour for
     * client-side tables).
     */
    _resolveFilterOptions(col) {
      if (Array.isArray(col.filterOptions)) {
        return col.filterOptions;
      }
      return this._uniqueValues(col.key).map((v) => ({
        value: v,
        label: v
      }));
    }
    // ------------------------------------------------------------------
    // Body
    // ------------------------------------------------------------------
    _paintBody(tbody, cols, stickyN) {
      tbody.replaceChildren();
      if (this.hasAttribute("loading")) {
        const count = this._readLoadingRows();
        for (let i = 0; i < count; i++) {
          tbody.appendChild(this._buildSkeletonRow(cols, i));
        }
        return;
      }
      const filtered = this._sortedRows(this._filteredRows());
      if (filtered.length === 0) {
        tbody.appendChild(this._buildEmptyRow(cols.length));
        return;
      }
      for (const { row, index } of filtered) {
        tbody.appendChild(this._buildBodyRow(row, index, cols, stickyN));
        if (this._expanded.has(index) && this._subTable) {
          const sub = this._subTable(row, index);
          if (sub) {
            tbody.appendChild(this._buildSubTableRow(sub, cols.length));
          }
        }
      }
    }
    _buildEmptyRow(colspan) {
      const tr = document.createElement("tr");
      tr.classList.add("empty");
      const td = document.createElement("td");
      td.colSpan = colspan;
      const slot = document.createElement("slot");
      slot.name = "empty";
      slot.textContent = this.getAttribute("empty") || "No data";
      td.appendChild(slot);
      tr.appendChild(td);
      return tr;
    }
    _buildSkeletonRow(cols, seed) {
      const tr = document.createElement("tr");
      tr.classList.add("skeleton");
      tr.setAttribute("aria-hidden", "true");
      for (const _c of cols) {
        const td = document.createElement("td");
        const bar = document.createElement("span");
        bar.className = "skeleton-bar";
        const widthPct = 50 + (seed * 7 + tr.children.length * 13) % 40;
        bar.style.width = `${widthPct}%`;
        td.appendChild(bar);
        tr.appendChild(td);
      }
      return tr;
    }
    _buildBodyRow(row, rowIndex, cols, stickyN) {
      const tr = document.createElement("tr");
      tr.setAttribute("part", "row");
      tr.dataset.rowIndex = String(rowIndex);
      const id = this._getRowId(row, rowIndex);
      tr.dataset.rowId = String(id);
      if (this._selection.has(id)) {
        tr.classList.add("is-selected");
      }
      tr.addEventListener("click", (e) => {
        this._onRowClick(row, rowIndex, e);
      });
      for (let i = 0; i < cols.length; i++) {
        tr.appendChild(
          this._buildBodyCell(cols[i], i, row, rowIndex, stickyN)
        );
      }
      return tr;
    }
    _buildBodyCell(col, colIndex, row, rowIndex, stickyN) {
      const td = document.createElement("td");
      this._applyCellClasses(td, col, colIndex, stickyN);
      if (col.minWidth) {
        td.style.minWidth = col.minWidth;
      }
      if (col.key === SELECT_KEY) {
        const id = this._getRowId(row, rowIndex);
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "select-row-checkbox";
        cb.setAttribute("data-noclick", "");
        cb.setAttribute("aria-label", "Select row");
        cb.checked = this._selection.has(id);
        cb.addEventListener("change", () => {
          if (cb.checked) {
            this.select(id);
          } else {
            this.deselect(id);
          }
        });
        td.appendChild(cb);
        return td;
      }
      if (col.key === EXPANDER_KEY) {
        const hasChildren = this._subTable ? !!this._subTable(row, rowIndex) : false;
        if (!hasChildren) {
          return td;
        }
        const isOpen = this._expanded.has(rowIndex);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "expander";
        btn.setAttribute("data-noclick", "");
        btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        btn.setAttribute(
          "aria-label",
          isOpen ? "Collapse row" : "Expand row"
        );
        btn.textContent = isOpen ? "▾" : "▸";
        btn.addEventListener("click", (e) => {
          this._toggleRow(rowIndex, row, e);
        });
        td.appendChild(btn);
        return td;
      }
      const value = row[col.key];
      if (col.render) {
        const out = col.render(value, row, rowIndex);
        this._mountCellContent(td, out);
      } else if (value !== null && value !== void 0) {
        td.textContent = String(value);
      }
      return td;
    }
    _buildSubTableRow(sub, colspan) {
      const tr = document.createElement("tr");
      tr.classList.add("subtable");
      tr.setAttribute("part", "subtable-row");
      const td = document.createElement("td");
      td.colSpan = colspan;
      const inner = document.createElement("div");
      inner.classList.add("subtable-inner");
      if (sub instanceof Node) {
        inner.appendChild(sub);
      } else if (isTemplateResult(sub)) {
        render(sub, inner);
      } else {
        const nested = document.createElement("wpd-table");
        nested.columns = sub.columns;
        nested.data = sub.data;
        if (sub.subTable) {
          nested.subTable = sub.subTable;
        }
        inner.appendChild(nested);
      }
      td.appendChild(inner);
      tr.appendChild(td);
      return tr;
    }
    _mountCellContent(td, out) {
      if (typeof out === "string") {
        td.textContent = out;
        return;
      }
      if (out instanceof Node) {
        td.appendChild(out);
        return;
      }
      if (isTemplateResult(out)) {
        render(out, td);
      }
    }
    // ------------------------------------------------------------------
    // Behavior
    // ------------------------------------------------------------------
    _onFilterChange(key, value) {
      if (value === "") {
        delete this._filters[key];
      } else {
        this._filters[key] = value;
      }
      this.emit("wpd-table-filter-change", { filters: { ...this._filters } });
      const root = this.shadowRoot;
      const tbody = root?.querySelector("tbody");
      if (tbody) {
        const cols = this._effectiveColumns();
        const stickyN = this._readStickyColumns();
        this._lastStickyIndex = this._computeLastStickyIndex(cols, stickyN);
        this._paintBody(tbody, cols, stickyN);
        this._applyStickyOffsets();
      }
    }
    _onRowClick(row, index, e) {
      const path = e.composedPath?.() ?? [];
      for (const node of path) {
        if (node instanceof Element && node.hasAttribute("data-noclick")) {
          return;
        }
        if (node === this) {
          break;
        }
      }
      this.emit("wpd-table-row-click", { row, index, originalEvent: e });
    }
    _toggleRow(index, row, e) {
      e.stopPropagation();
      const isOpen = this._expanded.has(index);
      if (isOpen) {
        this._expanded.delete(index);
      } else {
        this._expanded.add(index);
      }
      this.emit("wpd-table-expand-change", {
        row,
        index,
        expanded: !isOpen
      });
      this._schedulePaint();
    }
    _cycleSort(key) {
      if (!this._sort || this._sort.key !== key) {
        this._sort = { key, direction: "asc" };
      } else if (this._sort.direction === "asc") {
        this._sort = { key, direction: "desc" };
      } else {
        this._sort = null;
      }
      this.emit("wpd-table-sort-change", {
        sort: this._sort ? { ...this._sort } : null
      });
      this._schedulePaint();
    }
    _emitSelectionChange() {
      this.emit("wpd-table-selection-change", {
        selection: Array.from(this._selection),
        rows: this.selectedRows
      });
    }
    // ------------------------------------------------------------------
    // Filtering + sorting
    // ------------------------------------------------------------------
    _filteredRows() {
      const out = [];
      const active = Object.keys(this._filters).filter(
        (k) => this._filters[k] !== ""
      );
      for (let i = 0; i < this._data.length; i++) {
        const row = this._data[i];
        let pass = true;
        for (const key of active) {
          const col = this._columns.find((c) => c.key === key);
          if (col && typeof col.filterRender === "function") {
            continue;
          }
          const filter = this._filters[key] ?? "";
          const cell = row[key];
          const cellStr = cell === null || cell === void 0 ? "" : String(cell);
          if (col?.filter === "select") {
            if (cellStr !== filter) {
              pass = false;
              break;
            }
          } else if (!cellStr.toLowerCase().includes(filter.toLowerCase())) {
            pass = false;
            break;
          }
        }
        if (pass) {
          out.push({ row, index: i });
        }
      }
      return out;
    }
    _sortedRows(rows) {
      if (!this._sort) {
        return rows;
      }
      const col = this._columns.find((c) => c.key === this._sort.key);
      if (!col) {
        return rows;
      }
      const dir = this._sort.direction === "desc" ? -1 : 1;
      const out = rows.slice();
      out.sort((a, b) => {
        const av = col.sortValue ? col.sortValue(a.row, a.row[col.key]) : a.row[col.key];
        const bv = col.sortValue ? col.sortValue(b.row, b.row[col.key]) : b.row[col.key];
        return compareValues(av, bv) * dir;
      });
      return out;
    }
    _uniqueValues(key) {
      const seen = /* @__PURE__ */ new Set();
      for (const row of this._data) {
        const v = row[key];
        if (v === null || v === void 0) {
          continue;
        }
        seen.add(String(v));
      }
      return Array.from(seen).sort();
    }
    /**
     * Selection stats over the VISIBLE (client-side-filtered) rows —
     * the same set `selectAll()` operates on. The header select-all
     * tri-state derives from these so "checked" always means "every
     * row the user can see is selected", even while ids of currently
     * hidden rows linger in the selection set.
     */
    _visibleSelectionStats() {
      let total = 0;
      let selected = 0;
      for (const { row, index } of this._filteredRows()) {
        total++;
        if (this._selection.has(this._getRowId(row, index))) {
          selected++;
        }
      }
      return { total, selected };
    }
    // ------------------------------------------------------------------
    // Sticky columns + attribute reads
    // ------------------------------------------------------------------
    _readStickyColumns() {
      const raw = parseInt(this.getAttribute("sticky-columns") || "0", 10);
      return Number.isFinite(raw) && raw > 0 ? raw : 0;
    }
    _readLoadingRows() {
      const raw = parseInt(this.getAttribute("loading-rows") || "5", 10);
      return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : 5;
    }
    _readSelectable() {
      const v = this.getAttribute("selectable");
      if (v === "single") {
        return "single";
      }
      if (v === "multi" || v === "") {
        return "multi";
      }
      return null;
    }
    /**
     * Sticky-band membership. The first N columns get pinned, with two
     * per-column overrides: `column.sticky = true` opts in even outside
     * the band; `column.sticky = false` opts out within it.
     */
    _isStickyIndex(index, stickyN, col) {
      if (col.sticky === false) {
        return false;
      }
      if (col.sticky === true) {
        return true;
      }
      return index < stickyN;
    }
    _computeLastStickyIndex(cols, stickyN) {
      let last = -1;
      for (let i = 0; i < cols.length; i++) {
        if (this._isStickyIndex(i, stickyN, cols[i])) {
          last = i;
        }
      }
      return last;
    }
    _applyCellClasses(cell, col, index, stickyN) {
      if (col.key === EXPANDER_KEY) {
        cell.classList.add("col-expander");
      }
      if (col.key === SELECT_KEY) {
        cell.classList.add("col-select");
      }
      if (col.align === "center") {
        cell.classList.add("align-center");
      }
      if (col.align === "end") {
        cell.classList.add("align-end");
      }
      const sticky = this._isStickyIndex(index, stickyN, col);
      if (sticky) {
        cell.classList.add("is-sticky");
        if (index === this._lastStickyIndex) {
          cell.classList.add("is-sticky-edge");
        }
      }
    }
    _effectiveColumns() {
      const out = [];
      if (this._readSelectable()) {
        out.push({
          key: SELECT_KEY,
          label: "",
          // The descriptor width is painted onto a `<col>`
          // element and is the authoritative column-width
          // source in table-layout: auto — CSS `td { width }`
          // is ignored once `<col>` has a value. Pair with
          // the matching `td.col-select` rule (zero
          // `padding-inline`, `text-align: center`) so the
          // checkbox sits with breathing room on both sides.
          width: "40px",
          align: "center"
        });
      }
      if (this._subTable) {
        out.push({
          key: EXPANDER_KEY,
          label: "",
          // Same contract as col-select. 36px column +
          // 20px button + zero padding centers the chevron
          // with ~8px on each side.
          width: "36px",
          align: "center"
        });
      }
      out.push(...this._columns);
      return out;
    }
    /**
     * Walk the header row, sum the natural widths of the sticky cells,
     * then write cumulative `inset-inline-start` offsets onto every
     * row's matching cells.
     */
    _applyStickyOffsets() {
      const root = this.shadowRoot;
      if (!root) {
        return;
      }
      const headRow = root.querySelector("thead tr");
      if (!headRow) {
        return;
      }
      const ths = Array.from(headRow.children);
      const offsets = [];
      let acc = 0;
      for (let i = 0; i < ths.length; i++) {
        offsets[i] = acc;
        if (ths[i].classList.contains("is-sticky")) {
          acc += ths[i].offsetWidth;
        }
      }
      const rows = root.querySelectorAll(
        "thead tr, tbody tr:not(.subtable):not(.empty):not(.skeleton)"
      );
      rows.forEach((r) => {
        const cells = Array.from(r.children);
        for (let i = 0; i < cells.length; i++) {
          if (cells[i].classList.contains("is-sticky")) {
            cells[i].style.insetInlineStart = `${offsets[i]}px`;
          }
        }
      });
      this._maybeWarnStickyOffsetRace(ths, offsets);
    }
    _maybeWarnStickyOffsetRace(ths, offsets) {
      if (this._stickyRaceWarned) {
        return;
      }
      const stickyN = this._readStickyColumns();
      if (stickyN < 2) {
        return;
      }
      const lastIdx = Math.min(stickyN - 1, ths.length - 1);
      if (lastIdx <= 0) {
        return;
      }
      if (offsets[lastIdx] !== 0) {
        return;
      }
      if (this.offsetWidth === 0) {
        return;
      }
      this._stickyRaceWarned = true;
      const w0 = ths[0]?.offsetWidth ?? 0;
      console.warn(
        `[wpd-table] sticky-columns: column ${lastIdx} resolved to inset-inline-start: 0px while the host is visible. ths[0].offsetWidth was ${w0}px at measurement time. Likely a layout race — call recomputeLayout() after the panel finishes its mount/transition, or wrap the assignment of \`data\` in a requestAnimationFrame.`
      );
    }
    _measureHeaderHeight() {
      const root = this.shadowRoot;
      if (!root) {
        return;
      }
      const headRow = root.querySelector("thead tr");
      if (!headRow) {
        return;
      }
      const h = headRow.offsetHeight;
      if (h > 0) {
        this.style.setProperty("--wpd-table-header-height", `${h}px`);
      }
    }
    /**
     * Once-per-element warning for the most common sticky-header
     * mistake: forgetting to give the table a scroll container. Without
     * a max-height (or a scrolling ancestor), `position: sticky`
     * silently does nothing because there's no scrollport for it to
     * stick within.
     */
    _maybeWarnStickyHeader() {
      if (this._stickyHeaderWarned) {
        return;
      }
      if (!this.hasAttribute("sticky-header")) {
        return;
      }
      if (this.hasAttribute("loading") || this._data.length < 8) {
        return;
      }
      const scroll = this.shadowRoot?.querySelector(
        ".scroll"
      );
      if (!scroll) {
        return;
      }
      if (scroll.offsetWidth === 0) {
        return;
      }
      if (scroll.scrollHeight <= scroll.clientHeight + 1) {
        this._stickyHeaderWarned = true;
        console.warn(
          "[wpd-table] sticky-header is set but the table has no scroll container. Set --wpd-table-max-height on the host (or wrap it in a scrolling parent) so the header has something to stick to."
        );
      }
    }
  };
  _WpdTable.props = [
    "stickyColumns",
    "stickyHeader",
    "striped",
    "hover",
    "compact",
    "bordered",
    "empty",
    "loading",
    "loadingRows",
    "selectable"
  ];
  _WpdTable.styles = [styles$8];
  _WpdTable.help = {
    title: "Table",
    summary: "Data-driven table. Assign `columns` + `data` and you get a styled table with optional per-column filters, click-to-sort, multi-row selection, sticky columns/header, sub-tables, custom cell renderers, loading skeleton, and a slottable empty state.",
    status: "experimental",
    since: "0.6.0",
    props: [
      {
        name: "sticky-columns",
        type: "integer",
        description: "Pin the first N columns to the inline-start edge. Widths are measured after layout, so variable-width columns work. The auto-injected expander (subTable) and select (selectable) columns count toward N."
      },
      {
        name: "sticky-header",
        type: "boolean",
        description: "Pin the header (and filter row) to the top. Requires a scrolling parent or `--wpd-table-max-height` — the component warns once if it detects sticky-header on a non-scrolling container."
      },
      { name: "striped", type: "boolean", description: "Zebra rows." },
      { name: "hover", type: "boolean", description: "Highlight rows on hover." },
      { name: "compact", type: "boolean", description: "Tighter padding + smaller font." },
      { name: "bordered", type: "boolean", description: "Vertical cell borders." },
      {
        name: "empty",
        type: "string",
        description: "Fallback text shown when there are no rows. For richer empty states, project light-DOM content into the `empty` slot."
      },
      {
        name: "loading",
        type: "boolean",
        description: "Paint shimmering skeleton rows in place of body content. Filters / sort headers stay live."
      },
      {
        name: "loading-rows",
        type: "integer",
        description: "Number of skeleton rows when loading. Default 5."
      },
      {
        name: "selectable",
        type: '"single" | "multi"',
        description: "Auto-prepend a checkbox column. `multi` puts a select-all checkbox in the header; `single` enforces at-most-one selected."
      }
    ],
    events: [
      { name: "wpd-table-filter-change", description: "Filter input changed." },
      { name: "wpd-table-sort-change", description: "Header click cycled the sort." },
      { name: "wpd-table-selection-change", description: "Selection set changed." },
      { name: "wpd-table-row-click", description: "Body row clicked (skips data-noclick descendants)." },
      { name: "wpd-table-expand-change", description: "Sub-table toggled." }
    ],
    slots: [
      { name: "empty", description: "Custom empty-state content (CTA, illustration, etc.)." }
    ],
    cssProps: [
      { name: "--wpd-table-bg" },
      { name: "--wpd-table-border" },
      { name: "--wpd-table-column-border" },
      { name: "--wpd-table-header-bg" },
      { name: "--wpd-table-row-hover" },
      { name: "--wpd-table-stripe" },
      { name: "--wpd-table-cell-padding" },
      { name: "--wpd-table-font-size" },
      { name: "--wpd-table-max-height" },
      { name: "--wpd-table-skeleton-color" }
    ],
    example: html`
			<wpd-table id="sample-table" sticky-header striped hover></wpd-table>
		`
  };
  let WpdTable = _WpdTable;
  function isTemplateResult(v) {
    return !!v && v.__wpdHtml === true;
  }
  function compareValues(a, b) {
    if (a === b) {
      return 0;
    }
    if (a === null || a === void 0) {
      return -1;
    }
    if (b === null || b === void 0) {
      return 1;
    }
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      return an - bn;
    }
    return String(a).localeCompare(String(b));
  }
  defineComponent("wpd-table", WpdTable);
  const tabsStyles = css`:host{display:flex;gap:4px;margin-bottom:10px;border-bottom:1px solid var( --desktop-mode-border,#dcdcde )}`;
  const tabPanelStyles = css`:host{display:block}:host( [ hidden ] ){display:none}:host(:focus-visible ){outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:4px;border-radius:4px}`;
  const tabStyles = css`:host{display:inline-block}button{appearance:none;padding:6px 10px;border:none;background:transparent;color:var( --desktop-mode-muted,#50575e );font:inherit;font-size:12px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color 0.15s ease,border-color 0.15s ease}button:hover{color:var( --wp-admin-theme-color,#2271b1 )}button:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:2px}:host( [ aria-selected='true' ] ) button{color:var( --wp-admin-theme-color,#2271b1 );border-bottom-color:var( --wp-admin-theme-color,#2271b1 )}`;
  const _WpdTab = class _WpdTab extends Component {
    render() {
      this.setAttribute("role", "tab");
      return html`
			<button type="button" @click=${() => this._onPick()}>
				<slot></slot>
			</button>
		`;
    }
    _onPick() {
      this.emit("wpd-tab-pick", {
        value: this.value
      });
    }
  };
  _WpdTab.props = ["value"];
  _WpdTab.styles = [tabStyles];
  _WpdTab.help = {
    title: "Tab",
    summary: "Single tab inside a <wpd-tabs> strip. Carries its identifier via `value`; aria-selected + tabindex are mirrored by the parent.",
    status: "stable",
    since: "0.7.0",
    props: [
      {
        name: "value",
        type: "string",
        description: "Identifier the tab contributes to the parent strip selection."
      }
    ],
    slots: [
      { name: "(default)", description: "Visible tab label." }
    ],
    events: [
      {
        name: "wpd-tab-pick",
        description: "Internal event bubbled to the parent <wpd-tabs>. Consumers should listen for wpd-tab-change on the strip instead.",
        detail: "{ value: string | null }"
      }
    ]
  };
  let WpdTab = _WpdTab;
  defineComponent("wpd-tab", WpdTab);
  const _WpdTabs = class _WpdTabs extends Component {
    connectedCallback() {
      super.connectedCallback();
      this.addEventListener("wpd-tab-pick", (e) => {
        const detail = e.detail;
        e.stopPropagation();
        this.value = detail.value;
        this.emit("wpd-tab-change", { value: detail.value });
      });
    }
    /**
     * Declarative item-list setter. Replaces the existing `<wpd-tab>`
     * children with a fresh set built from a `{ value, label }`
     * array. The `value` prop is preserved if it still matches a new
     * entry; otherwise it falls back to the first item.
     *
     * Lets plugins that populate tabs dynamically (route-driven
     * admin screens, filtered lists) replace the declarative
     * markup with a one-liner:
     *
     * ```js
     * tabs.items = [
     *   { value: 'calc',    label: 'Calc' },
     *   { value: 'convert', label: 'Convert' },
     * ];
     * ```
     *
     * @since 0.5.0
     */
    set items(list) {
      replaceChildren(this, "wpd-tab", list);
      const current = this.value;
      const stillValid = current !== null && list.some((i) => i.value === current);
      if (!stillValid && list.length > 0) {
        this.value = list[0].value;
      } else {
        this.requestUpdate();
      }
    }
    render() {
      this.setAttribute("role", "tablist");
      const label = this.label || "";
      if (label) {
        this.setAttribute("aria-label", label);
      }
      const current = this.value;
      queueMicrotask(() => {
        const tabs = this.querySelectorAll("wpd-tab");
        for (const tab of Array.from(tabs)) {
          const v = tab.getAttribute("value");
          tab.setAttribute(
            "aria-selected",
            v === current ? "true" : "false"
          );
          tab.setAttribute("tabindex", v === current ? "0" : "-1");
        }
        syncTabpanels(this, current);
      });
      return html`<slot></slot>`;
    }
  };
  _WpdTabs.props = ["value", "label"];
  _WpdTabs.styles = [tabsStyles];
  _WpdTabs.help = {
    title: "Tabs",
    summary: 'Underline-accent tab strip. Pair with sibling <wpd-tabpanel for="…"> elements and the strip auto-toggles their hidden attribute on selection.',
    status: "stable",
    since: "0.7.0",
    props: [
      {
        name: "value",
        type: "string",
        description: "Currently active tab value. Mirrored to child <wpd-tab> aria-selected."
      },
      {
        name: "label",
        type: "string",
        description: "aria-label for the tablist — describe the tab group for assistive tech."
      }
    ],
    slots: [
      {
        name: "(default)",
        description: '<wpd-tab value="…"> children forming the strip.'
      }
    ],
    events: [
      {
        name: "wpd-tab-change",
        description: "Fires when the active tab changes.",
        detail: "{ value: string }"
      }
    ],
    example: html`
			<wpd-tabs value="one" label="Demo tabs">
				<wpd-tab value="one">One</wpd-tab>
				<wpd-tab value="two">Two</wpd-tab>
				<wpd-tab value="three">Three</wpd-tab>
			</wpd-tabs>
			<wpd-tabpanel for="one">First panel.</wpd-tabpanel>
			<wpd-tabpanel for="two">Second panel.</wpd-tabpanel>
			<wpd-tabpanel for="three">Third panel.</wpd-tabpanel>
		`
  };
  let WpdTabs = _WpdTabs;
  defineComponent("wpd-tabs", WpdTabs);
  const _WpdTabPanel = class _WpdTabPanel extends Component {
    // Shadow DOM — the render target for this component is its
    // own shadow root, which holds a single `<slot>` that projects
    // whatever the caller placed between the `<wpd-tabpanel>` open
    // and close tags. Slotted children remain light-DOM descendants
    // of the panel element (the slot rendering mechanism doesn't
    // move them), so `panel.querySelector(...)` from plugin render
    // callbacks keeps working.
    //
    // Earlier 0.5.0 builds of this component used light DOM with
    // a `<slot>` render, which wiped the panel's server-rendered
    // template content on first mount — every `render()` writes
    // into `_renderRoot`, and with light DOM that's the panel
    // itself. Shadow DOM isolates the render surface.
    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("role", "tabpanel");
      if (!this.hasAttribute("tabindex")) {
        this.setAttribute("tabindex", "0");
      }
      const owner = findOwningTabs(this);
      if (owner) {
        syncTabpanels(owner, owner.getAttribute("value"));
      }
    }
    render() {
      return html`<slot></slot>`;
    }
  };
  _WpdTabPanel.props = ["for"];
  _WpdTabPanel.styles = [tabPanelStyles];
  _WpdTabPanel.help = {
    title: "Tab panel",
    summary: 'Auto-managed panel paired with a sibling <wpd-tabs>. Declares which tab it belongs to via `for="<tab-value>"`; the parent strip toggles `hidden` whenever the active tab changes. role="tabpanel" and tabindex="0" are set automatically.',
    status: "stable",
    since: "0.5.0",
    props: [
      {
        name: "for",
        type: "string",
        description: "Matches the `value` of the owning <wpd-tab>. Panel is shown when its parent tabs strip is on that value."
      }
    ],
    slots: [
      { name: "(default)", description: "Panel body content." }
    ]
  };
  let WpdTabPanel = _WpdTabPanel;
  defineComponent("wpd-tabpanel", WpdTabPanel);
  function replaceChildren(host, tag, items) {
    const existing = host.querySelectorAll(`:scope > ${tag}`);
    for (const el of Array.from(existing)) {
      el.remove();
    }
    for (const item of items) {
      const el = document.createElement(tag);
      el.setAttribute("value", item.value);
      el.textContent = item.label;
      host.appendChild(el);
    }
  }
  function findOwningTabs(panel) {
    const parent = panel.parentElement;
    if (!parent) {
      return null;
    }
    const sibling = parent.querySelector(":scope > wpd-tabs");
    if (sibling) {
      return sibling;
    }
    return panel.closest("wpd-tabs");
  }
  function syncTabpanels(tabs, value) {
    const panels = /* @__PURE__ */ new Set();
    const parent = tabs.parentElement;
    if (parent) {
      for (const p of Array.from(
        parent.querySelectorAll(":scope > wpd-tabpanel")
      )) {
        panels.add(p);
      }
    }
    for (const p of Array.from(
      tabs.querySelectorAll(":scope > wpd-tabpanel")
    )) {
      panels.add(p);
    }
    for (const panel of panels) {
      const pfor = panel.getAttribute("for");
      const active = pfor !== null && pfor === value;
      if (active) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
      panel.setAttribute("aria-hidden", active ? "false" : "true");
    }
  }
  const styles$7 = css`:host{display:inline-flex;max-width:100%}.wpd-tag-input{display:inline-flex;flex-wrap:wrap;align-items:center;gap:var( --wpd-tag-input-gap,4px );padding:var( --wpd-tag-input-padding,2px );min-height:24px;max-width:100%}.wpd-tag-input__chips{display:inline-flex;flex-wrap:wrap;align-items:center;gap:var( --wpd-tag-input-gap,4px );min-width:0}.wpd-tag-input__add{appearance:none;display:inline-flex;align-items:center;gap:3px;padding:1px 8px;min-height:22px;font:inherit;font-size:11px;font-weight:500;line-height:1;color:var( --wpd-tag-input-add-fg,#50575e );background:transparent;border:1px dashed var( --wpd-tag-input-add-border,#c3c4c7 );border-radius:999px;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease}.wpd-tag-input__add:hover:not(:disabled ){background:rgba( 0,0,0,0.04 );color:var( --wpd-tag-input-add-fg-hover,#1d2327 );border-color:var( --wpd-tag-input-add-border-hover,#8c8f94 )}.wpd-tag-input__add:focus-visible{outline:none;border-style:solid;box-shadow:0 0 0 2px var( --wp-admin-theme-color,#2271b1 )}.wpd-tag-input__add:disabled{opacity:0.5;cursor:not-allowed}.wpd-tag-input__add svg{display:block}.wpd-tag-input__editor{position:relative;display:inline-flex;align-items:center;flex:0 1 auto;min-width:120px}.wpd-tag-input__input{appearance:none;font:inherit;font-size:12px;line-height:1.4;padding:2px 8px;border:1px solid var( --wpd-tag-input-input-border,#2271b1 );border-radius:999px;background:var( --wpd-tag-input-input-bg,#fff );color:var( --wpd-tag-input-input-fg,#1d2327 );min-width:80px;max-width:240px}.wpd-tag-input__input:focus{outline:none;box-shadow:0 0 0 2px color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 30%,transparent )}.wpd-tag-input__suggestions{position:absolute;top:calc( 100% + 4px );left:0;min-width:220px;max-width:320px;max-height:240px;overflow-y:auto;padding:4px 0;background:var( --wpd-tag-input-pop-bg,#fff );color:var( --wpd-tag-input-pop-fg,#1d2327 );border:1px solid var( --wpd-tag-input-pop-border,#c3c4c7 );border-radius:8px;box-shadow:0 6px 16px rgba( 0,0,0,0.08 ),0 1px 2px rgba( 0,0,0,0.06 );z-index:50}.wpd-tag-input__suggestion-item{display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:13px;cursor:pointer;user-select:none}.wpd-tag-input__suggestion-item[ aria-selected='true' ]{background:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 10%,transparent );color:var( --wp-admin-theme-color,#2271b1 )}.wpd-tag-input__suggestion-create{font-style:italic;color:var( --wpd-tag-input-create-fg,#50575e );border-top:1px solid var( --wpd-tag-input-pop-divider,#f0f0f1 )}.wpd-tag-input__suggestion-create[ aria-selected='true' ]{color:var( --wp-admin-theme-color,#2271b1 )}.wpd-tag-input__suggestion-empty,.wpd-tag-input__suggestion-loading{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px;color:var( --wpd-tag-input-pop-muted,#646970 )}.wpd-tag-input__suggestion-spinner{display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;animation:wpd-tag-input-spin 0.8s linear infinite}@keyframes wpd-tag-input-spin{to{transform:rotate( 360deg )}}:host( [ disabled ] ) .wpd-tag-input{opacity:0.6;pointer-events:none}`;
  const styles$6 = css`:host{display:inline-flex;max-width:100%;vertical-align:middle}:host( [ hidden ] ){display:none}.wpd-chip{display:inline-flex;align-items:center;gap:var( --wpd-chip-gap,4px );padding:var( --wpd-chip-padding,2px 8px );border-radius:var( --wpd-chip-radius,999px );font-size:var( --wpd-chip-font-size,12px );line-height:var( --wpd-chip-line-height,1.6 );font-weight:var( --wpd-chip-font-weight,500 );background:var( --wpd-chip-bg,#f0f0f1 );color:var( --wpd-chip-fg,#1d2327 );border:var( --wpd-chip-border,1px solid transparent );max-width:100%;box-sizing:border-box;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease,transform 0.12s ease,opacity 0.12s ease}:host( [ tone='accent' ] ) .wpd-chip{background:var( --wpd-chip-bg,color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 14%,transparent ) );color:var( --wpd-chip-fg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ tone='positive' ] ) .wpd-chip{background:var( --wpd-chip-bg,rgba( 30,132,73,0.14 ) );color:var( --wpd-chip-fg,#1d6f42 )}:host( [ tone='warning' ] ) .wpd-chip{background:var( --wpd-chip-bg,rgba( 217,119,6,0.18 ) );color:var( --wpd-chip-fg,#8a4a06 )}:host( [ tone='danger' ] ) .wpd-chip{background:var( --wpd-chip-bg,rgba( 214,54,56,0.14 ) );color:var( --wpd-chip-fg,#a02622 )}:host( [ pending ] ) .wpd-chip{opacity:0.65;animation:wpd-chip-pulse 1.2s ease-in-out infinite}@keyframes wpd-chip-pulse{0%,100%{opacity:0.55}50%{opacity:0.95}}.wpd-chip__label{max-width:var( --wpd-chip-label-max,220px );overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wpd-chip__icon{display:inline-flex;align-items:center;flex-shrink:0}.wpd-chip__icon::slotted( * ){display:inline-flex}.wpd-chip__dismiss{appearance:none;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:16px;height:16px;margin-inline-start:2px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer;opacity:0.55;transition:opacity 0.12s ease,background-color 0.12s ease}.wpd-chip__dismiss:hover,.wpd-chip__dismiss:focus-visible{opacity:1;background:rgba( 0,0,0,0.12 );outline:none}.wpd-chip__dismiss:focus-visible{box-shadow:0 0 0 2px var( --wp-admin-theme-color,#2271b1 )}.wpd-chip__dismiss[ disabled ]{opacity:0.35;cursor:not-allowed}.wpd-chip__dismiss svg{display:block;width:10px;height:10px}:host( [ disabled ] ) .wpd-chip{opacity:0.55;cursor:not-allowed}:host( [ size='compact' ] ) .wpd-chip{padding:var( --wpd-chip-padding,1px 6px );font-size:var( --wpd-chip-font-size,11px )}`;
  const _WpdChip = class _WpdChip extends Component {
    constructor() {
      super(...arguments);
      this._onHostKeyDown = (e) => {
        const dismissible = this.dismissible !== null;
        if (!dismissible) {
          return;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          const disabled = this.disabled !== null;
          if (disabled) {
            return;
          }
          const label = this.label ?? "";
          this.emit("wpd-chip-dismiss", { label });
        }
      };
    }
    connectedCallback() {
      super.connectedCallback();
      this.addEventListener("keydown", this._onHostKeyDown);
    }
    disconnectedCallback() {
      this.removeEventListener("keydown", this._onHostKeyDown);
    }
    render() {
      const label = this.label ?? "";
      const dismissible = this.dismissible !== null;
      const disabled = this.disabled !== null;
      return html`
			<span part="chip" class="wpd-chip">
				<span class="wpd-chip__icon">
					<slot name="icon"></slot>
				</span>
				<span class="wpd-chip__label">
					${label === "" ? html`<slot></slot>` : label}
				</span>
				${dismissible ? html`
							<button
								part="dismiss"
								class="wpd-chip__dismiss"
								type="button"
								aria-label=${`Remove ${label || "chip"}`}
								?disabled=${disabled}
								@click=${(e) => this._onDismiss(e)}
							>
								${_iconCross$1()}
							</button>
					  ` : html``}
			</span>
		`;
    }
    _onDismiss(e) {
      e.stopPropagation();
      const disabled = this.disabled !== null;
      if (disabled) {
        return;
      }
      const label = this.label ?? "";
      this.emit("wpd-chip-dismiss", { label });
    }
  };
  _WpdChip.props = [
    "label",
    "tone",
    "size",
    "dismissible",
    "disabled",
    "pending"
  ];
  _WpdChip.styles = [styles$6];
  _WpdChip.help = {
    title: "Chip",
    summary: "Labelled pill primitive with optional leading icon and trailing dismiss button. Tones mirror <wpd-badge>; pair with <wpd-tag-input> for full add/remove ergonomics.",
    status: "experimental",
    since: "0.8.0",
    props: [
      {
        name: "label",
        type: "string",
        description: "Visible text. Falls back to the default slot when omitted."
      },
      {
        name: "tone",
        type: "'neutral' | 'accent' | 'positive' | 'warning' | 'danger'",
        default: "neutral",
        description: "Color variant. Mirrors <wpd-badge> tones."
      },
      {
        name: "size",
        type: "'default' | 'compact'",
        default: "default",
        description: "Vertical density. Compact halves horizontal padding for dense lists."
      },
      {
        name: "dismissible",
        type: "boolean attribute",
        description: "Renders a trailing × button. Click / Enter / Space emits wpd-chip-dismiss."
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "Visually mutes the chip and blocks the dismiss button. Useful while a parent is mid-update."
      },
      {
        name: "pending",
        type: "boolean attribute",
        description: "Renders a subtle pulse animation while a REST mutation is in flight. Auto-applied by <wpd-tag-input>; safe to set by hand."
      }
    ],
    slots: [
      { name: "(default)", description: "Fallback label when `label` is unset." },
      {
        name: "icon",
        description: "Leading icon (Dashicon, SVG, image). Inherits text color."
      }
    ],
    parts: [
      { name: "chip", description: "The pill container." },
      {
        name: "dismiss",
        description: "The trailing × button (when `dismissible`)."
      }
    ],
    events: [
      {
        name: "wpd-chip-dismiss",
        description: "Fires when the dismiss button is activated. Detail carries the chip's label so a delegated listener can act without DOM walking.",
        detail: "{ label: string }"
      }
    ],
    cssProps: [
      { name: "--wpd-chip-bg", description: "Background color." },
      { name: "--wpd-chip-fg", description: "Text color." },
      { name: "--wpd-chip-border", description: "Border shorthand." },
      {
        name: "--wpd-chip-padding",
        description: "Padding shorthand.",
        default: "2px 8px"
      },
      {
        name: "--wpd-chip-radius",
        description: "Corner radius.",
        default: "999px"
      },
      {
        name: "--wpd-chip-label-max",
        description: "Max width of the inner label before ellipsis.",
        default: "220px"
      }
    ],
    example: html`
			<wpd-cluster gap="6">
				<wpd-chip label="Neutral"></wpd-chip>
				<wpd-chip label="Accent" tone="accent"></wpd-chip>
				<wpd-chip label="Positive" tone="positive"></wpd-chip>
				<wpd-chip label="Warning" tone="warning"></wpd-chip>
				<wpd-chip label="Danger" tone="danger"></wpd-chip>
				<wpd-chip label="Dismissible" dismissible></wpd-chip>
			</wpd-cluster>
		`
  };
  let WpdChip = _WpdChip;
  defineComponent("wpd-chip", WpdChip);
  function _iconCross$1() {
    return html`
		<svg
			viewBox="0 0 12 12"
			width="10"
			height="10"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
		>
			<path d="M3 3 L9 9 M9 3 L3 9" />
		</svg>
	`;
  }
  const _WpdTagInput = class _WpdTagInput extends Component {
    constructor() {
      super(...arguments);
      this._value = [];
      this._suggestions = [];
      this._suggestionsLoading = false;
      this._query = "";
      this._highlight = -1;
      this._focusedChip = -1;
      this._onDocumentPointerDown = (e) => {
        if (!this.isOpen) {
          return;
        }
        const path = e.composedPath();
        if (path.includes(this)) {
          return;
        }
        this.closeInput();
      };
    }
    // Resolves to the inline input AFTER each render. Re-queried on
    // every `requestUpdate` because the shadow tree builds fresh
    // nodes per render.
    get _input() {
      const root = this.shadowRoot;
      return root ? root.querySelector(".wpd-tag-input__input") : null;
    }
    // --- Public properties (JS-only) -------------------------------------
    get value() {
      return this._value;
    }
    set value(next) {
      this._value = Array.isArray(next) ? next.slice() : [];
      if (this._focusedChip >= this._value.length) {
        this._focusedChip = -1;
      }
      this.requestUpdate();
    }
    get suggestions() {
      return this._suggestions;
    }
    set suggestions(next) {
      this._suggestions = Array.isArray(next) ? next.slice() : [];
      this._highlight = this._suggestions.length > 0 ? 0 : -1;
      this._suggestionsLoading = false;
      this.requestUpdate();
    }
    get suggestionsLoading() {
      return this._suggestionsLoading;
    }
    set suggestionsLoading(next) {
      this._suggestionsLoading = !!next;
      this.requestUpdate();
    }
    get query() {
      return this._query;
    }
    get isOpen() {
      return this.open !== null;
    }
    /**
     * Open the inline input + suggestions popover. Equivalent to
     * clicking the "+" trigger. Call from the parent to start tag
     * entry programmatically (e.g. paste interception).
     */
    openInput() {
      if (this.isOpen) {
        return;
      }
      this.open = "";
      this._query = "";
      this._highlight = -1;
      this.emit("wpd-tag-open", {});
      queueMicrotask(() => {
        this._input?.focus();
        this._emitSuggest("");
      });
    }
    /**
     * Close the inline input. Use from a parent to dismiss after a
     * background save resolves.
     */
    closeInput() {
      if (!this.isOpen) {
        return;
      }
      this.open = null;
      this._query = "";
      this._suggestions = [];
      this._highlight = -1;
      this._suggestionsLoading = false;
      this.emit("wpd-tag-close", {});
      this.requestUpdate();
    }
    // --- Lifecycle --------------------------------------------------------
    connectedCallback() {
      super.connectedCallback();
      document.addEventListener("pointerdown", this._onDocumentPointerDown, true);
    }
    disconnectedCallback() {
      document.removeEventListener("pointerdown", this._onDocumentPointerDown, true);
    }
    // --- Render -----------------------------------------------------------
    render() {
      const isOpen = this.isOpen;
      const disabled = this.disabled !== null;
      const readonly = this.readonly !== null;
      const removable = this.removable !== null || this.removable === null && !readonly;
      const creatable = this.creatable !== null;
      const addLabel = this["add-label"] || "+ Add";
      const placeholder = this.placeholder || "Add a tag…";
      return html`
			<span
				class="wpd-tag-input"
				role="group"
				aria-label=${this.label ?? ""}
			>
				${this._renderChips(removable, disabled)}
				${this._renderTrailing({
        isOpen,
        readonly,
        disabled,
        placeholder,
        creatable,
        addLabel
      })}
			</span>
		`;
    }
    _renderTrailing(opts) {
      if (opts.isOpen) {
        return this._renderEditor(opts.placeholder, opts.creatable);
      }
      if (opts.readonly || opts.disabled) {
        return html``;
      }
      return this._renderTrigger(opts.addLabel);
    }
    _renderChips(removable, disabled) {
      const tags = this._value;
      if (tags.length === 0) {
        return html``;
      }
      return html`
			<span class="wpd-tag-input__chips" role="list">
				${tags.map((tag, idx) => {
        const tone = tag.tone ?? "neutral";
        return html`
						<wpd-chip
							role="listitem"
							size="compact"
							tone=${tone}
							label=${tag.label}
							?dismissible=${removable && !disabled}
							?disabled=${disabled}
							?pending=${!!tag.pending}
							tabindex=${idx === this._focusedChip ? "0" : "-1"}
							data-idx=${String(idx)}
							@wpd-chip-dismiss=${(e) => this._onChipDismiss(e, tag)}
							@focus=${() => this._focusedChip = idx}
						></wpd-chip>
					`;
      })}
			</span>
		`;
    }
    _renderTrigger(addLabel) {
      const disabled = this.disabled !== null;
      return html`
			<button
				type="button"
				class="wpd-tag-input__add"
				aria-label=${addLabel}
				aria-haspopup="listbox"
				aria-expanded="false"
				?disabled=${disabled}
				@click=${() => this.openInput()}
			>
				${_iconPlus()}
				<span>${addLabel}</span>
			</button>
		`;
    }
    _renderEditor(placeholder, creatable) {
      const showSuggestions = this._suggestions.length > 0 || this._suggestionsLoading || creatable && this._query.trim().length > 0;
      return html`
			<span class="wpd-tag-input__editor">
				<input
					class="wpd-tag-input__input"
					type="text"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					placeholder=${placeholder}
					.value=${this._query}
					aria-autocomplete="list"
					aria-expanded=${showSuggestions ? "true" : "false"}
					aria-activedescendant=${this._highlight >= 0 ? `wpd-tag-suggestion-${this._highlight}` : ""}
					@input=${(e) => this._onInput(e)}
					@keydown=${(e) => this._onInputKeyDown(e)}
					@blur=${(e) => this._onInputBlur(e)}
				/>
				${showSuggestions ? this._renderSuggestions(creatable) : html``}
			</span>
		`;
    }
    _renderSuggestions(creatable) {
      const trimmed = this._query.trim();
      const items = this._suggestions;
      const showCreate = creatable && trimmed.length > 0 && !items.some((s) => s.label.toLowerCase() === trimmed.toLowerCase()) && !this._value.some((v) => v.label.toLowerCase() === trimmed.toLowerCase());
      return html`
			<div
				class="wpd-tag-input__suggestions"
				role="listbox"
			>
				${this._suggestionsLoading ? html`
							<div class="wpd-tag-input__suggestion-loading">
								<span class="wpd-tag-input__suggestion-spinner" aria-hidden="true"></span>
								<span>Searching…</span>
							</div>
					  ` : html``}
				${items.length === 0 && !this._suggestionsLoading && !showCreate ? html`
							<div class="wpd-tag-input__suggestion-empty">
								${trimmed.length > 0 ? "No matches." : "Type to search."}
							</div>
					  ` : html``}
				${items.map((item, idx) => {
        const selected = idx === this._highlight;
        return html`
						<div
							id=${`wpd-tag-suggestion-${idx}`}
							role="option"
							aria-selected=${selected ? "true" : "false"}
							class="wpd-tag-input__suggestion-item"
							@mousedown=${(e) => {
          e.preventDefault();
          this._addSuggestion(item, false);
        }}
							@mouseenter=${() => {
          this._highlight = idx;
          this.requestUpdate();
        }}
						>
							<span>${item.label}</span>
						</div>
					`;
      })}
				${showCreate ? html`
							<div
								id=${`wpd-tag-suggestion-${items.length}`}
								role="option"
								aria-selected=${this._highlight === items.length ? "true" : "false"}
								class="wpd-tag-input__suggestion-item wpd-tag-input__suggestion-create"
								@mousedown=${(e) => {
        e.preventDefault();
        this._addSuggestion(
          { label: trimmed },
          true
        );
      }}
								@mouseenter=${() => {
        this._highlight = items.length;
        this.requestUpdate();
      }}
							>
								Create "${trimmed}"
							</div>
					  ` : html``}
			</div>
		`;
    }
    // --- Event handlers ---------------------------------------------------
    _onChipDismiss(e, tag) {
      e.stopPropagation();
      this.emit("wpd-tag-remove", { tag });
    }
    _onInput(e) {
      const value = e.target.value;
      this._query = value;
      this._emitSuggest(value);
    }
    _emitSuggest(query) {
      const minQuery = parseInt(
        this["min-query"] || "0",
        10
      ) || 0;
      if (query.length < minQuery) {
        this._suggestions = [];
        this._suggestionsLoading = false;
        this.requestUpdate();
        return;
      }
      this._suggestionsLoading = true;
      this.requestUpdate();
      this.emit("wpd-tag-suggest", { query });
    }
    _onInputKeyDown(e) {
      const creatable = this.creatable !== null;
      const items = this._suggestions;
      const trimmed = this._query.trim();
      const showCreate = creatable && trimmed.length > 0 && !items.some((s) => s.label.toLowerCase() === trimmed.toLowerCase()) && !this._value.some((v) => v.label.toLowerCase() === trimmed.toLowerCase());
      const totalSelectable = items.length + (showCreate ? 1 : 0);
      switch (e.key) {
        case "ArrowDown": {
          if (totalSelectable === 0) {
            return;
          }
          e.preventDefault();
          this._highlight = this._highlight + 1 >= totalSelectable ? 0 : this._highlight + 1;
          this.requestUpdate();
          return;
        }
        case "ArrowUp": {
          if (totalSelectable === 0) {
            return;
          }
          e.preventDefault();
          this._highlight = this._highlight <= 0 ? totalSelectable - 1 : this._highlight - 1;
          this.requestUpdate();
          return;
        }
        case "Enter": {
          e.preventDefault();
          if (this._highlight >= 0 && this._highlight < items.length) {
            this._addSuggestion(items[this._highlight], false);
            return;
          }
          if (this._highlight === items.length && showCreate) {
            this._addSuggestion({ label: trimmed }, true);
            return;
          }
          if (showCreate && trimmed.length > 0) {
            this._addSuggestion({ label: trimmed }, true);
            return;
          }
          return;
        }
        case "Escape": {
          e.preventDefault();
          this.closeInput();
          return;
        }
        case "Backspace": {
          if (this._query === "" && this._value.length > 0) {
            e.preventDefault();
            const lastIdx = this._value.length - 1;
            if (this._focusedChip === lastIdx) {
              this.emit("wpd-tag-remove", {
                tag: this._value[lastIdx]
              });
              this._focusedChip = -1;
            } else {
              this._focusedChip = lastIdx;
              this.requestUpdate();
            }
          }
          return;
        }
        default:
          if (this._focusedChip !== -1) {
            this._focusedChip = -1;
          }
      }
    }
    _onInputBlur(_e) {
      queueMicrotask(() => {
        if (!this.shadowRoot?.activeElement) {
          this.closeInput();
        }
      });
    }
    _addSuggestion(tag, isNew) {
      const exists = this._value.some(
        (v) => v.label.toLowerCase() === tag.label.toLowerCase()
      );
      if (exists) {
        this._query = "";
        this._highlight = -1;
        this._suggestions = [];
        this.requestUpdate();
        this._input?.focus();
        return;
      }
      this.emit("wpd-tag-add", { tag, isNew });
      this._query = "";
      this._highlight = -1;
      this._suggestions = [];
      this._suggestionsLoading = false;
      this.requestUpdate();
      queueMicrotask(() => {
        this._input?.focus();
      });
    }
  };
  _WpdTagInput.props = [
    "label",
    "placeholder",
    "add-label",
    "creatable",
    "removable",
    "disabled",
    "readonly",
    "size",
    "min-query",
    "open"
  ];
  _WpdTagInput.styles = [styles$7];
  _WpdTagInput.help = {
    title: "Tag input",
    summary: "Multi-tag picker with autocomplete and free-form creation. Purely presentational — emits wpd-tag-suggest / wpd-tag-add / wpd-tag-remove and lets the consumer drive REST + optimistic UI.",
    status: "experimental",
    since: "0.8.0",
    props: [
      {
        name: "label",
        type: "string",
        description: "Accessible label for the inline input."
      },
      {
        name: "placeholder",
        type: "string",
        description: "Native placeholder for the inline input.",
        default: "Add a tag…"
      },
      {
        name: "add-label",
        type: "string",
        description: 'Label of the "+" trigger button.',
        default: "+ Add"
      },
      {
        name: "creatable",
        type: "boolean attribute",
        description: "Allow Enter on a non-matching query to emit `wpd-tag-add` with `isNew: true`. Off by default — opt in for taxonomies the user is allowed to extend."
      },
      {
        name: "removable",
        type: "boolean attribute",
        description: "Show × on every chip and emit `wpd-tag-remove` on click. On by default; switch off for read-only views."
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "Disables the entire control. Chips render but the trigger / input / dismiss buttons are inert."
      },
      {
        name: "readonly",
        type: "boolean attribute",
        description: 'Hides the "+" trigger and chip × buttons. Same as setting `creatable=false` and `removable=false` together.'
      },
      {
        name: "size",
        type: "'default' | 'compact'",
        default: "default",
        description: "Density preset. Compact suits dense table cells."
      },
      {
        name: "min-query",
        type: "integer (string)",
        default: "0",
        description: "Minimum query length before `wpd-tag-suggest` fires. Set to 1 or 2 for taxonomies with thousands of terms."
      },
      {
        name: "open",
        type: "boolean attribute",
        description: "Two-way reflected: present while the inline input is showing. Setting it externally opens / closes the picker."
      }
    ],
    events: [
      {
        name: "wpd-tag-suggest",
        description: "Fires when the user types in the input. Consumer fetches suggestions and assigns them back via `el.suggestions = […]`.",
        detail: "{ query: string }"
      },
      {
        name: "wpd-tag-add",
        description: "Fires when the user picks a suggestion or, with `creatable`, presses Enter on a free-form value. Consumer mutates `value`.",
        detail: "{ tag: WpdTagItem; isNew: boolean }"
      },
      {
        name: "wpd-tag-remove",
        description: "Fires when × on a chip is activated. Consumer mutates `value`.",
        detail: "{ tag: WpdTagItem }"
      },
      {
        name: "wpd-tag-open",
        description: "Fires when the inline input opens.",
        detail: "{}"
      },
      {
        name: "wpd-tag-close",
        description: "Fires when the inline input closes.",
        detail: "{}"
      }
    ],
    cssProps: [
      {
        name: "--wpd-tag-input-gap",
        description: "Gap between chips / between chips and trigger.",
        default: "4px"
      },
      {
        name: "--wpd-tag-input-padding",
        description: "Padding around the chip row.",
        default: "2px"
      },
      {
        name: "--wpd-tag-input-add-fg",
        description: 'Foreground color of the "+ Add" trigger.'
      },
      { name: "--wpd-tag-input-pop-bg", description: "Suggestions popover background." }
    ],
    example: html`
			<wpd-tag-input
				label="Tags"
				placeholder="Add a tag…"
				creatable
			></wpd-tag-input>
		`
  };
  let WpdTagInput = _WpdTagInput;
  defineComponent("wpd-tag-input", WpdTagInput);
  function _iconPlus() {
    return html`
		<svg
			viewBox="0 0 12 12"
			width="9"
			height="9"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		>
			<path d="M6 2 L6 10 M2 6 L10 6" />
		</svg>
	`;
  }
  const styles$5 = css`:host{display:flex;width:100%;min-width:0;max-width:100%;align-items:stretch}.wpd-cat{display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:var( --wpd-cat-padding,2px );min-height:24px;max-width:100%;width:100%}.wpd-cat__chips{display:inline-flex;flex-wrap:wrap;align-items:center;gap:var( --wpd-cat-gap,4px );min-width:0}.wpd-cat__chains{display:flex;flex-wrap:wrap;gap:4px;min-width:0}.wpd-cat__viz-host{display:flex;align-items:center;gap:4px;min-width:0;flex:1 1 auto;max-width:100%;min-height:28px;cursor:pointer;position:relative}.wpd-cat__viz-svg{display:block;width:100%;max-width:100%;min-width:0;overflow:visible;flex:1 1 auto}.wpd-cat__viz-svg .wpd-cat-edge{fill:none;stroke:var( --wpd-cat-edge-color,currentColor );stroke-width:1.25;stroke-linecap:round;opacity:0.55;transition:stroke-width 0.18s ease,opacity 0.18s ease}.wpd-cat__viz-svg .wpd-cat-edge[ data-active='true' ]{stroke-width:2;opacity:1}.wpd-cat__viz-svg .wpd-cat-node{cursor:pointer;transition:r 0.2s cubic-bezier( 0.34,1.56,0.64,1 ),fill 0.18s ease,stroke-width 0.18s ease,filter 0.18s ease}.wpd-cat__viz-svg .wpd-cat-node[ data-selected='true' ]{filter:drop-shadow( 0 0 6px var( --wpd-cat-node-glow,rgba( 0,0,0,0.18 ) ) )}.wpd-cat__viz-svg .wpd-cat-node:hover,.wpd-cat__viz-svg .wpd-cat-node:focus-visible{filter:drop-shadow( 0 0 8px var( --wpd-cat-node-glow,rgba( 0,0,0,0.3 ) ) );outline:none}.wpd-cat__viz-svg .wpd-cat-label{font-family:var( --wpd-font,system-ui,sans-serif );font-size:10.5px;fill:var( --wpd-cat-label-fg,#1d2327 );font-weight:500;pointer-events:none;user-select:none}.wpd-cat__viz-svg .wpd-cat-label[ data-selected='false' ]{fill:var( --wpd-cat-label-muted,#8c8f94 );font-weight:400;font-style:italic}.wpd-cat__trigger{appearance:none;display:inline-flex;align-items:center;gap:4px;padding:1px 8px;min-height:22px;font:inherit;font-size:11px;font-weight:500;line-height:1;color:var( --wpd-cat-trigger-fg,#50575e );background:transparent;border:1px dashed var( --wpd-cat-trigger-border,#c3c4c7 );border-radius:999px;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease}.wpd-cat__trigger:hover:not(:disabled ){background:rgba( 0,0,0,0.04 );color:var( --wpd-cat-trigger-fg-hover,#1d2327 );border-color:var( --wpd-cat-trigger-border-hover,#8c8f94 )}.wpd-cat__trigger:focus-visible{outline:none;border-style:solid;box-shadow:0 0 0 2px var( --wp-admin-theme-color,#2271b1 )}.wpd-cat__trigger svg{display:block}.wpd-cat__uncategorized{display:inline-flex;align-items:center;gap:4px;padding:1px 10px;min-height:22px;font-size:11px;font-weight:500;line-height:1.6;color:var( --wpd-cat-uncat-fg,#8c8f94 );background:transparent;border:1px dashed var( --wpd-cat-uncat-border,#c3c4c7 );border-radius:999px;font-style:italic}.wpd-cat__popover{position:fixed;top:0;left:0;min-width:280px;max-width:360px;max-height:360px;display:flex;flex-direction:column;background:var( --wpd-cat-pop-bg,#fff );color:var( --wpd-cat-pop-fg,#1d2327 );border:1px solid var( --wpd-cat-pop-border,#c3c4c7 );border-radius:8px;box-shadow:0 6px 16px rgba( 0,0,0,0.08 ),0 1px 2px rgba( 0,0,0,0.06 );z-index:1000}.wpd-cat__editor{position:relative;display:inline-flex;align-items:center}.wpd-cat__search{appearance:none;font:inherit;font-size:13px;padding:8px 12px;border:0;border-bottom:1px solid var( --wpd-cat-pop-divider,#f0f0f1 );background:transparent;color:inherit;outline:none}.wpd-cat__search:focus{border-bottom-color:var( --wp-admin-theme-color,#2271b1 )}.wpd-cat__tree{flex:1 1 auto;min-height:0;overflow-y:auto;padding:4px 0}.wpd-cat__row-block{display:contents}.wpd-cat__row{display:flex;align-items:center;gap:6px;padding:4px 8px 4px var( --wpd-cat-row-indent,12px );cursor:pointer;user-select:none;font-size:13px;line-height:1.4;position:relative}.wpd-cat__row:hover,.wpd-cat__row[ data-focused='true' ]{background:rgba( 0,0,0,0.04 )}.wpd-cat__row[ data-selected='true' ]{color:var( --wp-admin-theme-color,#2271b1 );font-weight:600}.wpd-cat__row::before{content:'';position:absolute;left:0;top:0;bottom:0;width:var( --wpd-cat-guide-width,0px );border-left:1px dotted var( --wpd-cat-guide-color,rgba( 0,0,0,0.08 ) )}.wpd-cat__expander{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:0;background:transparent;color:inherit;cursor:pointer;flex-shrink:0;opacity:0.65}.wpd-cat__expander:hover{opacity:1}.wpd-cat__expander svg{display:block;transition:transform 0.12s ease}.wpd-cat__row[ data-expanded='true' ] .wpd-cat__expander svg{transform:rotate( 90deg )}.wpd-cat__expander--placeholder{visibility:hidden}.wpd-cat__create-row{display:flex;align-items:center;padding:2px 8px 2px var( --wpd-cat-row-indent,28px );position:relative}.wpd-cat__create-row::before{content:'';position:absolute;left:0;top:0;bottom:0;width:var( --wpd-cat-guide-width,0px );border-left:1px dotted var( --wpd-cat-guide-color,rgba( 0,0,0,0.08 ) )}.wpd-cat__create-wrap{display:inline-flex;align-items:center;flex:1 1 auto;min-width:0;gap:4px;padding:1px 1px 1px 0;border:1px solid transparent;border-radius:6px;background:transparent;transition:border-color 0.12s ease,background-color 0.12s ease,box-shadow 0.12s ease}.wpd-cat__create-wrap:hover{border-color:rgba( 0,0,0,0.12 );background:var( --wpd-cat-pop-bg,#fff )}.wpd-cat__create-wrap:focus-within{border-color:var( --wp-admin-theme-color,#2271b1 );background:var( --wpd-cat-pop-bg,#fff );box-shadow:0 0 0 2px color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 15%,transparent )}.wpd-cat__create-input{flex:1 1 auto;min-width:0;appearance:none;font:inherit;font-size:12px;padding:3px 6px;border:0;background:transparent;color:inherit;outline:none}.wpd-cat__create-input::placeholder{color:var( --wpd-cat-pop-muted,#8c8f94 );font-style:italic;opacity:1}.wpd-cat__create-submit{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex-shrink:0;padding:0;border:0;border-radius:4px;background:transparent;color:var( --wpd-cat-pop-muted,#8c8f94 );cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease}.wpd-cat__create-wrap:focus-within .wpd-cat__create-submit:not( [ disabled ] ){background:var( --wp-admin-theme-color,#2271b1 );color:#fff}.wpd-cat__create-submit:hover:not( [ disabled ] ){filter:brightness( 1.05 )}.wpd-cat__create-submit[ disabled ]{cursor:default;opacity:0.5}.wpd-cat__create-submit svg{display:block;width:11px;height:11px}.wpd-cat__create-spinner{display:inline-block;width:12px;height:12px;margin:0 4px;border-radius:50%;border:2px solid var( --wp-admin-theme-color,#2271b1 );border-top-color:transparent;animation:wpd-cat-spin 0.8s linear infinite;flex-shrink:0}.wpd-cat__check{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;flex-shrink:0;border:1.5px solid var( --wpd-cat-check-border,#8c8f94 );border-radius:3px;color:transparent;transition:background-color 0.12s ease,border-color 0.12s ease,color 0.12s ease}.wpd-cat__row[ data-selected='true' ] .wpd-cat__check{background:var( --wp-admin-theme-color,#2271b1 );border-color:var( --wp-admin-theme-color,#2271b1 );color:#fff}.wpd-cat__check svg{display:block;width:10px;height:10px}.wpd-cat__label{min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wpd-cat__delete{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:18px;height:18px;border:0;border-radius:50%;padding:0;background:transparent;color:var( --wpd-cat-delete-color,#d63638 );cursor:pointer;opacity:0;transition:opacity 0.12s ease,background-color 0.12s ease}.wpd-cat__row:hover .wpd-cat__delete,.wpd-cat__row[ data-focused='true' ] .wpd-cat__delete,.wpd-cat__delete:focus-visible{opacity:1}.wpd-cat__delete:hover,.wpd-cat__delete:focus-visible{background:rgba( 214,54,56,0.12 )}.wpd-cat__delete svg{display:block;width:10px;height:10px}.wpd-cat__match{background:rgba( 252,211,77,0.45 );border-radius:2px;padding:0 1px}.wpd-cat__empty,.wpd-cat__loading{padding:12px;font-size:12px;color:var( --wpd-cat-pop-muted,#646970 );text-align:center}.wpd-cat__loading-spinner{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;animation:wpd-cat-spin 0.8s linear infinite;margin-inline-end:8px;vertical-align:middle}@keyframes wpd-cat-spin{to{transform:rotate( 360deg )}}.wpd-cat__footer{padding:8px 12px;font-size:11px;color:var( --wpd-cat-pop-muted,#646970 );border-top:1px solid var( --wpd-cat-pop-divider,#f0f0f1 );border-radius:10px;background:var( --wpd-cat-pop-footer-bg,#fafafb );display:flex;align-items:center;gap:6px;line-height:1.4}.wpd-cat__footer .dashicons{font-size:14px;width:14px;height:14px;flex-shrink:0}:host( [ disabled ] ) .wpd-cat{opacity:0.6;pointer-events:none}`;
  const CHEVRON_W = "10px";
  const styles$4 = css`:host{display:inline-flex;max-width:100%;align-items:center;min-width:0;font-family:var( --wpd-font,system-ui,sans-serif );font-size:12px;line-height:1;font-weight:500}.wpd-crumb-chain{display:inline-flex;flex-wrap:nowrap;align-items:stretch;max-width:100%;min-width:0;min-height:22px;border-radius:999px;overflow:hidden;filter:drop-shadow( 0 1px 1px rgba( 0,0,0,0.06 ) )}.wpd-crumb{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:22px;padding:2px 12px;background:var( --wpd-crumb-bg,#c3c4c7 );color:var( --wpd-crumb-fg,#1d2327 );text-align:center;min-width:0;max-width:100%;flex-shrink:1;font-size:12px;font-weight:500;letter-spacing:0.01em;white-space:nowrap;cursor:grab;transition:filter 0.15s ease,transform 0.15s ease,background-color 0.12s ease}.wpd-crumb:active{cursor:grabbing}.wpd-crumb:hover{filter:brightness( 1.06 )}.wpd-crumb__remove{cursor:pointer}.wpd-crumb--first{padding-inline-end:22px;clip-path:polygon( 0 0,calc( 100% - ${CHEVRON_W} ) 0,100% 50%,calc( 100% - ${CHEVRON_W} ) 100%,0 100% )}.wpd-crumb--middle{padding-inline:22px;margin-inline-start:calc( -1 * ${CHEVRON_W} );clip-path:polygon( ${CHEVRON_W} 0,calc( 100% - ${CHEVRON_W} ) 0,100% 50%,calc( 100% - ${CHEVRON_W} ) 100%,${CHEVRON_W} 100%,0 50% )}.wpd-crumb--last{padding-inline-start:22px;padding-inline-end:14px;margin-inline-start:calc( -1 * ${CHEVRON_W} );clip-path:polygon( ${CHEVRON_W} 0,100% 0,100% 100%,${CHEVRON_W} 100%,0 50% )}.wpd-crumb--solo{padding:2px 12px;border-radius:999px}.wpd-crumb__label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.4}.wpd-crumb__remove{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;flex-shrink:0;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer;opacity:0.65;transition:opacity 0.12s ease,background-color 0.12s ease,transform 0.12s ease}.wpd-crumb__remove:hover,.wpd-crumb__remove:focus-visible{opacity:1;background:rgba( 0,0,0,0.22 );outline:none;transform:scale( 1.1 )}.wpd-crumb__remove svg{display:block;width:8px;height:8px}.wpd-crumb-chain:hover{filter:drop-shadow( 0 2px 3px rgba( 0,0,0,0.12 ) )}:host( [ disabled ] ) .wpd-crumb-chain{opacity:0.55;pointer-events:none}`;
  var __freeze = Object.freeze;
  var __defProp = Object.defineProperty;
  var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
  var _a;
  const _WpdCrumbChain = class _WpdCrumbChain extends Component {
    constructor() {
      super(...arguments);
      this._segments = [];
    }
    get segments() {
      return this._segments;
    }
    set segments(next) {
      this._segments = Array.isArray(next) ? next.slice() : [];
      this.requestUpdate();
    }
    render() {
      const removable = this.removable !== null;
      const segments = this._segments;
      if (segments.length === 0) {
        return html``;
      }
      return html`
			<div class="wpd-crumb-chain" role="group">
				${segments.map((seg, idx) => {
        const variant = pickVariant(idx, segments.length);
        const bg = seg.color ?? "rgba( 0, 0, 0, 0.08 )";
        const fg = pickForegroundColor(bg);
        const styleStr = `--wpd-crumb-bg: ${bg}; --wpd-crumb-fg: ${fg};`;
        return html`
						<span
							class=${`wpd-crumb wpd-crumb--${variant}`}
							style=${styleStr}
							title=${seg.name}
							draggable="true"
							@click=${(e) => this._onSegmentClick(e, idx, seg)}
							@dragstart=${(e) => this._onSegmentDragStart(e, idx, seg)}
						>
							<span class="wpd-crumb__label">${seg.name}</span>
							${removable ? html`
										<button
											type="button"
											class="wpd-crumb__remove"
											aria-label=${`Remove ${seg.name}`}
											draggable="false"
											@click=${(e) => this._onRemove(e, idx, seg)}
										>${_iconCross()}</button>
								  ` : html``}
						</span>
					`;
      })}
			</div>
		`;
    }
    _onSegmentDragStart(e, index, segment) {
      const target = e.target;
      if (target?.closest(".wpd-crumb__remove")) {
        e.preventDefault();
        return;
      }
      const dragSegments = this._segments.slice(index);
      if (e.dataTransfer) {
        const ghost = buildDragGhost(dragSegments);
        document.body.appendChild(ghost);
        const rect = e.currentTarget?.getBoundingClientRect();
        const offsetX = rect ? Math.min(30, rect.width / 2) : 16;
        const offsetY = rect ? Math.min(16, rect.height / 2) : 12;
        e.dataTransfer.setDragImage(ghost, offsetX, offsetY);
        requestAnimationFrame(() => ghost.remove());
      }
      this.emit("wpd-chain-segment-dragstart", {
        index,
        id: segment.id,
        segment,
        segments: dragSegments,
        dragEvent: e
      });
    }
    _onSegmentClick(e, index, segment) {
      const target = e.target;
      if (target?.closest(".wpd-crumb__remove")) {
        return;
      }
      this.emit("wpd-chain-segment-click", {
        index,
        id: segment.id,
        segment
      });
    }
    _onRemove(e, index, segment) {
      e.stopPropagation();
      this.emit("wpd-chain-remove", { index, id: segment.id, segment });
    }
  };
  _WpdCrumbChain.props = ["removable", "disabled"];
  _WpdCrumbChain.styles = [styles$4];
  _WpdCrumbChain.help = {
    title: "Crumb chain",
    summary: "Chevron-interlocking breadcrumb. Segments slot together like puzzle pieces, with each segment in its own color so the eye reads root → leaf as a single merged path. Reusable for any parent → child → grandchild relationship.",
    status: "experimental",
    since: "0.8.0",
    props: [
      {
        name: "removable",
        type: "boolean attribute",
        description: "Show an × on every segment. Activating it emits `wpd-chain-remove` with the clicked segment + index — consumers cascade the removal down the chain (segment + descendants)."
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "Visually mute the chain and ignore pointer + keyboard input."
      }
    ],
    events: [
      {
        name: "wpd-chain-remove",
        description: "Fires when × on ANY segment is activated. Detail carries the clicked segment + its index. Consumers typically delete the segment AND every descendant in the chain (mirrors the drag semantic, where the same gesture would carry the same set of ids).",
        detail: "{ index: number; id?: number | string; segment: WpdCrumbSegment }"
      },
      {
        name: "wpd-chain-segment-click",
        description: 'Fires when ANY segment is clicked. Useful for navigation drills (click "Tech" to filter to Tech).',
        detail: "{ index: number; id?: number | string; segment: WpdCrumbSegment }"
      },
      {
        name: "wpd-chain-segment-dragstart",
        description: 'Fires when a drag begins from any segment OTHER than the × remove button. Detail carries the segments from the drag-source to the leaf so consumers can ship ids for "this branch" — a drag from the middle segment moves the segment + every descendant in the chain.',
        detail: "{ index: number; id?: number | string; segment: WpdCrumbSegment; segments: WpdCrumbSegment[]; dragEvent: DragEvent }"
      }
    ],
    example: html(_a || (_a = __template([`
			<wpd-crumb-chain id="example-chain" removable></wpd-crumb-chain>
			<script>
				document.getElementById( 'example-chain' ).segments = [
					{ id: 1, name: 'Tech', color: '#2271b1' },
					{ id: 2, name: 'Web Dev', color: '#3a8ed4' },
					{ id: 3, name: 'Frontend', color: '#5cb0ff' },
				];
			<\/script>
		`])))
  };
  let WpdCrumbChain = _WpdCrumbChain;
  defineComponent("wpd-crumb-chain", WpdCrumbChain);
  const DRAG_GHOST_CHEVRON = 10;
  function buildDragGhost(segments) {
    const wrap = document.createElement("div");
    wrap.style.cssText = [
      "display: inline-flex",
      "align-items: stretch",
      "border-radius: 999px",
      "overflow: hidden",
      "filter: drop-shadow( 0 1px 2px rgba( 0, 0, 0, 0.18 ) )",
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      "font-size: 12px",
      "line-height: 1",
      "font-weight: 500",
      // Position offscreen but rendered — display:none / visibility:
      // hidden produce a blank drag-image snapshot.
      "position: fixed",
      "top: -10000px",
      "left: -10000px",
      "pointer-events: none",
      "z-index: 2147483647"
    ].join("; ");
    const total = segments.length;
    segments.forEach((seg, idx) => {
      const span = document.createElement("span");
      const bg = seg.color ?? "rgba( 0, 0, 0, 0.08 )";
      const fg = pickForegroundColor(bg);
      const variant = pickVariant(idx, total);
      const styleParts = [
        "display: inline-flex",
        "align-items: center",
        "justify-content: center",
        "min-height: 22px",
        `background: ${bg}`,
        `color: ${fg}`,
        "white-space: nowrap",
        "box-sizing: border-box",
        "letter-spacing: 0.01em"
      ];
      const c = DRAG_GHOST_CHEVRON;
      if (variant === "solo") {
        styleParts.push("padding: 2px 12px", "border-radius: 999px");
      } else if (variant === "first") {
        styleParts.push(
          "padding: 2px 22px 2px 12px",
          `clip-path: polygon( 0 0, calc( 100% - ${c}px ) 0, 100% 50%, calc( 100% - ${c}px ) 100%, 0 100% )`
        );
      } else if (variant === "middle") {
        styleParts.push(
          "padding: 2px 22px",
          `margin-inline-start: -${c}px`,
          `clip-path: polygon( ${c}px 0, calc( 100% - ${c}px ) 0, 100% 50%, calc( 100% - ${c}px ) 100%, ${c}px 100%, 0 50% )`
        );
      } else {
        styleParts.push(
          "padding: 2px 14px 2px 22px",
          `margin-inline-start: -${c}px`,
          `clip-path: polygon( ${c}px 0, 100% 0, 100% 100%, ${c}px 100%, 0 50% )`
        );
      }
      span.style.cssText = styleParts.join("; ");
      span.textContent = seg.name;
      wrap.appendChild(span);
    });
    return wrap;
  }
  function pickVariant(index, total) {
    if (total === 1) {
      return "solo";
    }
    if (index === 0) {
      return "first";
    }
    if (index === total - 1) {
      return "last";
    }
    return "middle";
  }
  let _readbackCanvas = null;
  function pickForegroundColor(bg) {
    if (!_readbackCanvas) {
      _readbackCanvas = document.createElement("canvas");
      _readbackCanvas.width = 1;
      _readbackCanvas.height = 1;
    }
    const ctx = _readbackCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return "#1d2327";
    }
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      const a = data[3] / 255;
      const r = data[0] * a + 255 * (1 - a);
      const g = data[1] * a + 255 * (1 - a);
      const b = data[2] * a + 255 * (1 - a);
      const lin = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      return L > 0.55 ? "#1d2327" : "#fff";
    } catch {
      return "#1d2327";
    }
  }
  function _iconCross() {
    return html`
		<svg
			viewBox="0 0 12 12"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		>
			<path d="M3 3 L9 9 M9 3 L3 9" />
		</svg>
	`;
  }
  const UNCATEGORIZED_SLUG = "uncategorized";
  const UNCATEGORIZED_DEFAULT_ID = 1;
  function _isUncategorized(item) {
    if (item.id === UNCATEGORIZED_DEFAULT_ID) {
      return true;
    }
    return (item.name || "").toLowerCase() === UNCATEGORIZED_SLUG;
  }
  const _WpdCategoryPicker = class _WpdCategoryPicker extends Component {
    constructor() {
      super(...arguments);
      this._items = [];
      this._value = [];
      this._query = "";
      this._collapsed = /* @__PURE__ */ new Set();
      this._focusedRow = -1;
      this._creatingValues = /* @__PURE__ */ new Map();
      this._creatingPending = /* @__PURE__ */ new Set();
      this._onCellClick = (e) => {
        const target = e.target;
        if (target?.closest(".wpd-cat-node")) {
          return;
        }
        if (this.isOpen) {
          return;
        }
        const disabled = this.disabled !== null;
        const readonly = this.readonly !== null;
        if (disabled || readonly) {
          return;
        }
        this.openPicker();
      };
      this._onDocPointerDown = (e) => {
        if (!this.isOpen) {
          return;
        }
        const path = e.composedPath();
        if (path.includes(this)) {
          return;
        }
        this.closePicker();
      };
      this._onLayoutChange = () => {
        if (!this.isOpen) {
          return;
        }
        this.closePicker();
      };
      this._onDocKeydown = (e) => {
        if (this.isOpen && e.key === "Escape") {
          e.preventDefault();
          this.closePicker();
        }
      };
    }
    get items() {
      return this._items;
    }
    set items(next) {
      this._items = Array.isArray(next) ? next.slice() : [];
      this.requestUpdate();
    }
    get value() {
      return this._value;
    }
    set value(next) {
      this._value = Array.isArray(next) ? next.slice() : [];
      this.requestUpdate();
    }
    get isOpen() {
      return this.open !== null;
    }
    openPicker() {
      if (this.isOpen) {
        return;
      }
      this.open = "";
      this._query = "";
      this._focusedRow = 0;
      this.emit("wpd-categories-open", {});
      queueMicrotask(() => {
        this._positionPopover();
        this._searchInput?.focus();
      });
    }
    closePicker() {
      if (!this.isOpen) {
        return;
      }
      this.open = null;
      this._query = "";
      this._focusedRow = -1;
      this.emit("wpd-categories-close", {});
      this.requestUpdate();
    }
    connectedCallback() {
      super.connectedCallback();
      document.addEventListener("pointerdown", this._onDocPointerDown, true);
      document.addEventListener("keydown", this._onDocKeydown, true);
      window.addEventListener("resize", this._onLayoutChange, { passive: true });
      window.addEventListener("scroll", this._onLayoutChange, {
        passive: true,
        capture: true
      });
    }
    disconnectedCallback() {
      document.removeEventListener("pointerdown", this._onDocPointerDown, true);
      document.removeEventListener("keydown", this._onDocKeydown, true);
      window.removeEventListener("resize", this._onLayoutChange);
      window.removeEventListener("scroll", this._onLayoutChange, { capture: true });
    }
    get _searchInput() {
      return this.shadowRoot?.querySelector(".wpd-cat__search") ?? null;
    }
    // --- Render -----------------------------------------------------------
    render() {
      const isOpen = this.isOpen;
      const disabled = this.disabled !== null;
      const readonly = this.readonly !== null;
      const loading = this.loading !== null;
      const addLabel = this["add-label"] || "Categorize";
      const placeholder = this.placeholder || "Search categories…";
      const maxVisible = Math.max(
        0,
        parseInt(
          this["max-visible"] || "2",
          10
        ) || 2
      );
      return html`
			<span class="wpd-cat" role="group">
				${this._renderChipRow(maxVisible, readonly, disabled, addLabel)}
				${isOpen ? this._renderPopover(placeholder, loading) : html``}
			</span>
		`;
    }
    _renderChipRow(_maxVisible, readonly, disabled, _addLabel) {
      const selectedItems = this._selectedItemsInOrder();
      if (selectedItems.length === 0) {
        return html`
				<span class="wpd-cat__chips" role="list">
					<span
						class="wpd-cat__uncategorized"
						title=${'Posts with no category appear as "Uncategorized" in WordPress.'}
						@click=${this._onCellClick}
					>${"Uncategorized"}</span>
				</span>
			`;
      }
      const chains = this._buildChains(selectedItems);
      return html`
			<div
				class="wpd-cat__chains"
				role="list"
				@click=${this._onCellClick}
			>
				${chains.map(
        (chain) => this._renderChain(chain, readonly, disabled)
      )}
			</div>
		`;
    }
    /**
     * Build a `WpdCrumbSegment[]` per LEAF selection. A "leaf
     * selection" is a selected term that has no other selected
     * descendant. When the user has selected a parent AND its
     * children AND its grandchildren, only the deepest (leaf)
     * selection produces a chain — the chain itself walks
     * root → leaf and includes every path segment. Segments that
     * the user explicitly picked AND segments that just sit on the
     * path render the same way visually; the user's intent ("this
     * post is filed under Parent → Child → Grandchild") is what
     * gets shown, regardless of which subset of the path they
     * happened to tick.
     *
     * Two leaves under the same parent produce two chains; the
     * shared parent appears in both, which matches the user's
     * mental model ("filed under Tech/Web Dev/Frontend AND
     * Tech/Web Dev/Backend") without the ambiguity of merged-tree
     * visualizations.
     */
    _buildChains(selectedItems) {
      const byId = /* @__PURE__ */ new Map();
      for (const item of this._items) {
        byId.set(item.id, item);
      }
      const selectedIds = new Set(selectedItems.map((s) => s.id));
      const hasSelectedDescendant = (ancestorId) => {
        for (const otherId of selectedIds) {
          if (otherId === ancestorId) {
            continue;
          }
          let cursor = byId.get(otherId);
          let safety = 16;
          while (cursor && safety-- > 0) {
            if (cursor.parent === ancestorId) {
              return true;
            }
            if (!cursor.parent) {
              break;
            }
            cursor = byId.get(cursor.parent);
          }
        }
        return false;
      };
      const chainLeaves = selectedItems.filter(
        (item) => !hasSelectedDescendant(item.id)
      );
      const chains = [];
      for (const leaf of chainLeaves) {
        const path = [];
        let cursor = leaf;
        let safety = 16;
        while (cursor && safety-- > 0) {
          if (cursor === leaf || selectedIds.has(cursor.id)) {
            path.unshift(cursor);
          }
          if (!cursor.parent) {
            break;
          }
          cursor = byId.get(cursor.parent);
        }
        const segments = path.map((item) => ({
          id: item.id,
          name: item.name
        }));
        chains.push({ id: leaf.id, segments });
      }
      return chains;
    }
    _renderChain(chain, readonly, disabled) {
      const removable = !readonly && !disabled;
      const onRemove = (e) => {
        e.stopPropagation();
        const detail = e.detail;
        const startIdx = typeof detail?.index === "number" ? detail.index : chain.segments.length - 1;
        const idsToRemove = /* @__PURE__ */ new Set();
        for (const seg of chain.segments.slice(startIdx)) {
          if (typeof seg.id === "number") {
            idsToRemove.add(seg.id);
          }
        }
        const next = this._value.filter(
          (id) => !idsToRemove.has(id)
        );
        if (next.length === this._value.length) {
          return;
        }
        this.emit("wpd-categories-change", { value: next });
      };
      const el = document.createElement("wpd-crumb-chain");
      el.segments = chain.segments;
      if (removable) {
        el.setAttribute("removable", "");
      }
      el.addEventListener("wpd-chain-remove", onRemove);
      return html`<div role="listitem">${el}</div>`;
    }
    _renderPopover(placeholder, loading) {
      const tree = this._buildTree();
      const filtered = this._filterTree(tree, this._query);
      const flat = this._flattenForDisplay(filtered);
      if (this._focusedRow >= flat.length) {
        this._focusedRow = flat.length > 0 ? flat.length - 1 : -1;
      }
      return html`
			<div class="wpd-cat__popover" role="dialog" aria-label="Choose categories">
				<input
					class="wpd-cat__search"
					type="text"
					autocomplete="off"
					placeholder=${placeholder}
					.value=${this._query}
					@input=${(e) => this._onSearchInput(e)}
					@keydown=${(e) => this._onSearchKeydown(e, flat)}
				/>
				<div class="wpd-cat__tree" role="listbox" aria-multiselectable="true">
					${this._renderCreateRow(0, 12, 0, "")}
					${this._renderTreeBody(loading, flat)}
				</div>
				<div class="wpd-cat__footer">
					<span class="dashicons dashicons-info-outline" aria-hidden="true"></span>
					<span>
						Posts with no category appear as
						<strong>Uncategorized</strong>.
					</span>
				</div>
			</div>
		`;
    }
    _renderTreeBody(loading, flat) {
      if (loading) {
        return html`
				<div class="wpd-cat__loading">
					<span class="wpd-cat__loading-spinner" aria-hidden="true"></span>
					${"Loading categories…"}
				</div>
			`;
      }
      if (flat.length === 0) {
        return html`
				<div class="wpd-cat__empty">
					${this._items.length === 0 ? "No categories yet — create one in WordPress to assign." : "No matches."}
				</div>
			`;
      }
      return flat.map((entry, idx) => this._renderRow(entry, idx, flat.length));
    }
    _renderRow(entry, idx, _total) {
      const { node, hasChildren } = entry;
      const isSelected = this._value.includes(node.item.id);
      const isExpanded = !this._collapsed.has(node.item.id);
      const indent = 12 + node.depth * 16;
      const guide = node.depth > 0 ? node.depth * 16 : 0;
      const isFocused = idx === this._focusedRow;
      return html`
			<div class="wpd-cat__row-block">
				<div
					class="wpd-cat__row"
					role="option"
					aria-selected=${isSelected ? "true" : "false"}
					data-selected=${isSelected ? "true" : "false"}
					data-expanded=${isExpanded ? "true" : "false"}
					data-focused=${isFocused ? "true" : "false"}
					data-row-id=${String(node.item.id)}
					style=${`--wpd-cat-row-indent: ${indent}px; --wpd-cat-guide-width: ${guide}px;`}
					@mouseenter=${() => {
        this._focusedRow = idx;
        this.requestUpdate();
      }}
					@click=${(e) => {
        e.preventDefault();
        this._toggleSelection(node.item.id);
      }}
				>
					${hasChildren ? html`<button
								type="button"
								class="wpd-cat__expander"
								aria-label=${isExpanded ? "Collapse" : "Expand"}
								@click=${(e) => {
        e.stopPropagation();
        this._toggleExpand(node.item.id);
      }}
							>${_iconCaretRight()}</button>` : html`<span class="wpd-cat__expander wpd-cat__expander--placeholder" aria-hidden="true">${_iconCaretRight()}</span>`}
					<span class="wpd-cat__check" aria-hidden="true">${_iconCheck()}</span>
					<span class="wpd-cat__label">${this._highlight(node.item.name, this._query)}</span>
					${_isUncategorized(node.item) ? html`` : html`<button
								type="button"
								class="wpd-cat__delete"
								aria-label=${`Delete ${node.item.name}`}
								title=${`Delete ${node.item.name}`}
								@click=${(e) => this._onDeleteClick(e, node.item)}
							>${_iconCrossSmall()}</button>`}
				</div>
				${isExpanded && !_isUncategorized(node.item) ? this._renderCreateRow(
        node.item.id,
        12 + (node.depth + 1) * 16,
        (node.depth + 1) * 16,
        node.item.name
      ) : html``}
			</div>
		`;
    }
    /**
     * Render an always-visible inline create-input. One sits at the
     * top of the popover (parentId 0 = create a root category) and
     * one sits beneath every visible row (create a child of that
     * row). Indent + guide-line align the child input with where the
     * new term will appear in the tree, so the user reads "this
     * input creates a sibling of the children below".
     *
     * The "+" submit button lives inside the input chrome; pressing
     * it (or Enter) emits `wpd-categories-create`. Esc clears the
     * field. While the consumer is processing the create REST call,
     * the field disables and a spinner replaces the submit button.
     */
    _renderCreateRow(parentId, indent, guide, parentName) {
      const value = this._creatingValues.get(parentId) ?? "";
      const pending = this._creatingPending.has(parentId);
      const placeholder = parentId === 0 ? "Add new category…" : `Add child of "${parentName}"…`;
      return html`
			<div
				class="wpd-cat__create-row"
				style=${`--wpd-cat-row-indent: ${indent}px; --wpd-cat-guide-width: ${guide}px;`}
				@click=${(e) => e.stopPropagation()}
			>
				<div class="wpd-cat__create-wrap">
					<input
						class="wpd-cat__create-input"
						type="text"
						autocomplete="off"
						spellcheck="false"
						placeholder=${placeholder}
						aria-label=${placeholder}
						.value=${value}
						?disabled=${pending}
						@input=${(e) => this._onCreateInput(e, parentId)}
						@keydown=${(e) => this._onCreateKeydown(e, parentId)}
					/>
					${pending ? html`<span class="wpd-cat__create-spinner" aria-hidden="true"></span>` : html`<button
								type="button"
								class="wpd-cat__create-submit"
								aria-label=${parentId === 0 ? "Create category" : `Create child of ${parentName}`}
								?disabled=${value.trim().length === 0}
								@click=${(e) => {
        e.stopPropagation();
        this._submitCreate(parentId);
      }}
							>${_iconPlusSmall()}</button>`}
				</div>
			</div>
		`;
    }
    _onCreateInput(e, parentId) {
      const value = e.target.value;
      if (value === "") {
        this._creatingValues.delete(parentId);
      } else {
        this._creatingValues.set(parentId, value);
      }
      this.requestUpdate();
    }
    _onCreateKeydown(e, parentId) {
      if (e.key === "Escape") {
        e.preventDefault();
        this._creatingValues.delete(parentId);
        this.requestUpdate();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        this._submitCreate(parentId);
      }
    }
    _submitCreate(parentId) {
      const name = (this._creatingValues.get(parentId) ?? "").trim();
      if (!name || this._creatingPending.has(parentId)) {
        return;
      }
      this._creatingPending.add(parentId);
      this.requestUpdate();
      this.emit("wpd-categories-create", { name, parent: parentId });
    }
    /**
     * Public API — call after a successful create-handler run to
     * clear the inline input for that parent. Consumers usually
     * mutate `items` + `value` first (so the new term appears + is
     * selected), then call `endCreating( parent )` to clear the
     * field.
     *
     * @param parent The parent id used in the create event detail
     *               (`0` for a root-level create).
     *
     * @public
     */
    endCreating(parent = 0) {
      this._creatingPending.delete(parent);
      this._creatingValues.delete(parent);
      this.requestUpdate();
    }
    /**
     * Public API — call from a consumer's catch path when the
     * create REST request fails. Keeps the typed text intact so the
     * user can retry with the same name; only the pending flag
     * clears.
     *
     * @param parent The parent id used in the create event detail.
     * @param _error Reserved for future use (e.g. surfacing the
     *               error in the input chrome).
     *
     * @public
     */
    failCreating(parent = 0, _error) {
      this._creatingPending.delete(parent);
      this.requestUpdate();
    }
    // --- Tree helpers ----------------------------------------------------
    _buildTree() {
      const byId = /* @__PURE__ */ new Map();
      for (const item of this._items) {
        byId.set(item.id, { item, children: [], depth: 0 });
      }
      const roots = [];
      for (const node of byId.values()) {
        const parentId = node.item.parent;
        if (parentId && byId.has(parentId)) {
          const parentNode = byId.get(parentId);
          parentNode.children.push(node);
        } else {
          roots.push(node);
        }
      }
      const setDepth = (node, depth) => {
        node.depth = depth;
        for (const child of node.children) {
          setDepth(child, depth + 1);
        }
      };
      for (const root of roots) {
        setDepth(root, 0);
      }
      const sortRecursive = (nodes) => {
        nodes.sort((a, b) => {
          const aUncat = _isUncategorized(a.item);
          const bUncat = _isUncategorized(b.item);
          if (aUncat !== bUncat) {
            return aUncat ? -1 : 1;
          }
          return a.item.name.localeCompare(b.item.name);
        });
        for (const n of nodes) {
          sortRecursive(n.children);
        }
      };
      sortRecursive(roots);
      return roots;
    }
    _filterTree(tree, query) {
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) {
        return tree;
      }
      const matches = (node) => {
        const ownMatch = node.item.name.toLowerCase().includes(trimmed);
        if (ownMatch) {
          return {
            item: node.item,
            children: node.children.slice(),
            depth: node.depth
          };
        }
        const childrenMatched = node.children.map(matches).filter((n) => n !== null);
        if (childrenMatched.length > 0) {
          return {
            item: node.item,
            children: childrenMatched,
            depth: node.depth
          };
        }
        return null;
      };
      return tree.map(matches).filter((n) => n !== null);
    }
    _flattenForDisplay(tree) {
      const out = [];
      const isSearching = this._query.trim() !== "";
      const walk = (nodes) => {
        for (const node of nodes) {
          out.push({
            node,
            visible: true,
            hasChildren: node.children.length > 0
          });
          const collapsed = this._collapsed.has(node.item.id) && !isSearching;
          if (!collapsed && node.children.length > 0) {
            walk(node.children);
          }
        }
      };
      walk(tree);
      return out;
    }
    _selectedItemsInOrder() {
      const byId = /* @__PURE__ */ new Map();
      for (const item of this._items) {
        byId.set(item.id, item);
      }
      const real = [];
      const uncatItems = [];
      for (const id of this._value) {
        const item = byId.get(id);
        if (!item) {
          continue;
        }
        if (item.name.toLowerCase() === UNCATEGORIZED_SLUG || item.id === 1) {
          uncatItems.push(item);
        } else {
          real.push(item);
        }
      }
      if (real.length > 0) {
        return real;
      }
      return uncatItems.length > 0 ? [] : real;
    }
    _highlight(label, query) {
      const trimmed = query.trim();
      if (!trimmed) {
        return label;
      }
      const lower = label.toLowerCase();
      const needle = trimmed.toLowerCase();
      const idx = lower.indexOf(needle);
      if (idx === -1) {
        return label;
      }
      return html`${label.slice(0, idx)}<span class="wpd-cat__match"
			>${label.slice(idx, idx + trimmed.length)}</span
		>${label.slice(idx + trimmed.length)}`;
    }
    // --- Mutations -------------------------------------------------------
    _toggleSelection(id) {
      const next = this._value.includes(id) ? this._value.filter((v) => v !== id) : [...this._value, id];
      this.emit("wpd-categories-change", { value: next });
    }
    _onDeleteClick(e, item) {
      e.stopPropagation();
      e.preventDefault();
      this.emit("wpd-categories-delete", { id: item.id, name: item.name });
    }
    _toggleExpand(id) {
      if (this._collapsed.has(id)) {
        this._collapsed.delete(id);
      } else {
        this._collapsed.add(id);
      }
      this.requestUpdate();
    }
    _onSearchInput(e) {
      this._query = e.target.value;
      this._focusedRow = 0;
      this.requestUpdate();
    }
    _onSearchKeydown(e, flat) {
      switch (e.key) {
        case "ArrowDown": {
          if (flat.length === 0) {
            return;
          }
          e.preventDefault();
          this._focusedRow = this._focusedRow + 1 >= flat.length ? 0 : this._focusedRow + 1;
          this.requestUpdate();
          this._scrollFocusedIntoView();
          return;
        }
        case "ArrowUp": {
          if (flat.length === 0) {
            return;
          }
          e.preventDefault();
          this._focusedRow = this._focusedRow <= 0 ? flat.length - 1 : this._focusedRow - 1;
          this.requestUpdate();
          this._scrollFocusedIntoView();
          return;
        }
        case "ArrowRight": {
          if (this._focusedRow < 0 || this._focusedRow >= flat.length) {
            return;
          }
          const entry = flat[this._focusedRow];
          if (entry.hasChildren && this._collapsed.has(entry.node.item.id)) {
            e.preventDefault();
            this._toggleExpand(entry.node.item.id);
          }
          return;
        }
        case "ArrowLeft": {
          if (this._focusedRow < 0 || this._focusedRow >= flat.length) {
            return;
          }
          const entry = flat[this._focusedRow];
          if (entry.hasChildren && !this._collapsed.has(entry.node.item.id)) {
            e.preventDefault();
            this._toggleExpand(entry.node.item.id);
          }
          return;
        }
        case "Enter":
        case " ": {
          if (this._focusedRow < 0 || this._focusedRow >= flat.length) {
            return;
          }
          e.preventDefault();
          const entry = flat[this._focusedRow];
          this._toggleSelection(entry.node.item.id);
          return;
        }
        case "Escape": {
          e.preventDefault();
          this.closePicker();
        }
      }
    }
    _scrollFocusedIntoView() {
      queueMicrotask(() => {
        const tree = this.shadowRoot?.querySelector(".wpd-cat__tree");
        if (!tree) {
          return;
        }
        const row = tree.querySelector(
          `.wpd-cat__row[data-focused="true"]`
        );
        if (!row) {
          return;
        }
        const rRect = row.getBoundingClientRect();
        const tRect = tree.getBoundingClientRect();
        if (rRect.top < tRect.top) {
          row.scrollIntoView({ block: "nearest" });
        } else if (rRect.bottom > tRect.bottom) {
          row.scrollIntoView({ block: "nearest" });
        }
      });
    }
    /**
     * Anchor the `position: fixed` popover to the trigger button.
     * Flips up when the popover would overflow the viewport bottom,
     * right-aligns when it would overflow the right edge. Runs on
     * every open after the popover has rendered (so we can read its
     * actual measured size, not a guess).
     *
     * Why fixed-positioning: the table cell scrolls inside
     * `<wpd-table>`'s shadow DOM, which has its own
     * `overflow: auto`. An `absolute` popover anchored to the cell
     * would be clipped by both the cell scroll AND the table
     * scroll. Fixed positioning escapes every ancestor's overflow
     * and lands the popover wherever we tell it relative to the
     * viewport.
     */
    _positionPopover() {
      const popover = this.shadowRoot?.querySelector(
        ".wpd-cat__popover"
      );
      if (!popover) {
        return;
      }
      const anchorRect = this.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const margin = 8;
      let top = anchorRect.bottom + 4;
      const overflowBottom = top + popRect.height + margin > viewportH;
      const fitsAbove = anchorRect.top - 4 - popRect.height >= margin;
      if (overflowBottom && fitsAbove) {
        top = anchorRect.top - 4 - popRect.height;
      } else if (overflowBottom) {
        top = Math.max(margin, viewportH - popRect.height - margin);
      }
      let left = anchorRect.left;
      if (left + popRect.width + margin > viewportW) {
        left = anchorRect.right - popRect.width;
      }
      left = Math.max(
        margin,
        Math.min(left, viewportW - popRect.width - margin)
      );
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    }
  };
  _WpdCategoryPicker.props = [
    "placeholder",
    "add-label",
    "disabled",
    "readonly",
    "open",
    "loading",
    "max-visible"
  ];
  _WpdCategoryPicker.styles = [styles$5];
  _WpdCategoryPicker.help = {
    title: "Category picker",
    summary: 'Hierarchical multi-select for taxonomy terms. Compact chip row + tree popover with search, collapsible branches, indent guides, keyboard navigation. Aligns with WordPress core: any subset selectable, "Uncategorized" rendered as a muted dashed sentinel when the value is empty.',
    status: "experimental",
    since: "0.8.0",
    props: [
      {
        name: "placeholder",
        type: "string",
        default: "Search categories…",
        description: "Native placeholder for the picker search input."
      },
      {
        name: "add-label",
        type: "string",
        default: "Categorize",
        description: "Currently inert — labeled the dedicated trigger button, which was replaced by the click-to-open cell. Parsed but unused."
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "Disables every interactive surface."
      },
      {
        name: "readonly",
        type: "boolean attribute",
        description: "Prevents opening the picker and hides the per-segment remove buttons on the crumb chains."
      },
      {
        name: "open",
        type: "boolean attribute",
        description: "Two-way reflected: present while the picker popover is open. Setting it externally opens / closes the popover."
      },
      {
        name: "loading",
        type: "boolean attribute",
        description: 'Show a "Loading categories…" spinner inside the popover. Use while the consumer is fetching the term list.'
      },
      {
        name: "max-visible",
        type: "integer (string)",
        default: "2",
        description: 'Currently inert — configured the "+N" overflow chip, which was replaced by the crumb-chain rendering. Parsed but unused.'
      }
    ],
    events: [
      {
        name: "wpd-categories-change",
        description: "Fires when the user toggles a row in the picker. Detail carries the new full id list — consumer mutates `value` (optimistically) and runs REST.",
        detail: "{ value: number[] }"
      },
      {
        name: "wpd-categories-open",
        description: "Fires when the popover opens.",
        detail: "{}"
      },
      {
        name: "wpd-categories-close",
        description: "Fires when the popover closes.",
        detail: "{}"
      },
      {
        name: "wpd-categories-create",
        description: "Fires when the user submits the inline create-child input. Consumer is expected to POST to the taxonomy REST endpoint, append the new term to `items`, and (optionally) auto-select it by adding the new id to `value`. Picker shows a per-row spinner while the create is in flight; the consumer clears it by calling `picker.endCreating( parent )` on success or `picker.failCreating( parent )` on error.",
        detail: "{ name: string; parent: number }"
      },
      {
        name: "wpd-categories-delete",
        description: "Fires when the per-row × button is activated. The button only renders on hover/keyboard-focus and is suppressed for the WP Uncategorized fallback. Consumer is responsible for confirmation + REST + invalidating any cached tree (typically broadcasts `desktop-mode.term.changed`).",
        detail: "{ id: number; name: string }"
      }
    ],
    example: html`
			<wpd-category-picker placeholder="Search categories…"></wpd-category-picker>
		`
  };
  let WpdCategoryPicker = _WpdCategoryPicker;
  defineComponent("wpd-category-picker", WpdCategoryPicker);
  function _iconCaretRight() {
    return html`
		<svg
			viewBox="0 0 12 12"
			width="8"
			height="8"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M5 3 L8 6 L5 9" />
		</svg>
	`;
  }
  function _iconPlusSmall() {
    return html`
		<svg
			viewBox="0 0 12 12"
			width="11"
			height="11"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		>
			<path d="M6 3 L6 9 M3 6 L9 6" />
		</svg>
	`;
  }
  function _iconCheck() {
    return html`
		<svg
			viewBox="0 0 12 12"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M2.5 6 L5 8.5 L9.5 4" />
		</svg>
	`;
  }
  function _iconCrossSmall() {
    return html`
		<svg
			viewBox="0 0 12 12"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		>
			<path d="M3 3 L9 9 M9 3 L3 9" />
		</svg>
	`;
  }
  function hashTitleToHue(input) {
    if (!input) {
      return 214;
    }
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = Math.imul(hash, 33) + input.charCodeAt(i);
    }
    return (hash % 360 + 360) % 360;
  }
  const avatarStyles = css`:host{display:inline-flex;position:relative;width:var( --wpd-avatar-size,32px );height:var( --wpd-avatar-size,32px );flex:0 0 auto;vertical-align:middle;line-height:0;perspective:calc( var( --wpd-avatar-size,32px ) * 8 );--wpd-avatar-tilt-x:0deg;--wpd-avatar-tilt-y:0deg;--wpd-avatar-hover:0;--wpd-avatar-glare-x:50%;--wpd-avatar-glare-y:50%}:host( [ hidden ] ){display:none}.wpd-avatar__tile{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;background:var( --desktop-mode-window-bg,#f0f0f1 );color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:calc( var( --wpd-avatar-size,32px ) * 0.48 );line-height:1;letter-spacing:0;font-feature-settings:'tnum' 1;user-select:none;transform-style:preserve-3d;transform:rotateX( var( --wpd-avatar-tilt-x ) ) rotateY( var( --wpd-avatar-tilt-y ) ) scale( calc( 1 + var( --wpd-avatar-hover ) * 0.07 ) );transition:transform 220ms cubic-bezier( 0.2,0.8,0.2,1 ),box-shadow 220ms cubic-bezier( 0.2,0.8,0.2,1 );box-shadow:inset 0 0 0 1px rgba( 255,255,255,calc( 0.18 + 0.22 * var( --wpd-avatar-hover ) ) ),inset 0 0 0 calc( 1px + var( --wpd-avatar-hover ) * 1px ) rgba( 0,0,0,calc( 0.08 + 0.04 * var( --wpd-avatar-hover ) ) ),0 calc( 1px + var( --wpd-avatar-hover ) * 8px ) calc( 6px + var( --wpd-avatar-hover ) * 18px ) rgba( 0,0,0,calc( 0.08 + 0.18 * var( --wpd-avatar-hover ) ) )}.wpd-avatar__tile::after{content:'';position:absolute;inset:0;border-radius:50%;background:radial-gradient( circle at var( --wpd-avatar-glare-x ) var( --wpd-avatar-glare-y ),rgba( 255,255,255,0.55 ) 0%,rgba( 255,255,255,0 ) 55% );opacity:var( --wpd-avatar-hover );mix-blend-mode:overlay;pointer-events:none;transition:opacity 220ms cubic-bezier( 0.2,0.8,0.2,1 )}.wpd-avatar__tile::before{content:'';position:absolute;inset:calc( var( --wpd-avatar-hover ) * -3px );border-radius:50%;background:radial-gradient( circle at var( --wpd-avatar-glare-x ) var( --wpd-avatar-glare-y ),rgba( 99,102,241,calc( 0.35 * var( --wpd-avatar-hover ) ) ) 0%,rgba( 99,102,241,0 ) 70% );filter:blur( 4px );pointer-events:none;z-index:-1;transition:inset 220ms cubic-bezier( 0.2,0.8,0.2,1 ),background 220ms}.wpd-avatar__tile img{width:100%;height:100%;object-fit:cover;display:block;transform:translateZ( 1px )}.wpd-avatar__dot{position:absolute;bottom:0;inset-inline-end:0;width:calc( var( --wpd-avatar-size,32px ) * 0.32 );height:calc( var( --wpd-avatar-size,32px ) * 0.32 );min-width:8px;min-height:8px;border-radius:50%;box-sizing:border-box;border:2px solid var( --wpd-avatar-dot-ring,var( --desktop-mode-window-bg,#fff ) );background:var( --wpd-avatar-dot-color,transparent );z-index:2}.wpd-avatar__dot--online{background:var( --desktop-mode-success,#00a32a )}.wpd-avatar__dot--inactive{background:var( --desktop-mode-warning,#dba617 )}.wpd-avatar__dot--offline{background:var( --desktop-mode-muted,#8c8f94 )}@media ( prefers-reduced-motion:reduce ){.wpd-avatar__tile{transform:none;transition:box-shadow 200ms}.wpd-avatar__tile::after,.wpd-avatar__tile::before{display:none}}`;
  const SIZE_MAP = {
    xs: 20,
    sm: 24,
    md: 40,
    lg: 64,
    xl: 96
  };
  const VALID_PRESENCE = /* @__PURE__ */ new Set(["online", "inactive", "offline"]);
  const _WpdAvatar = class _WpdAvatar extends Component {
    constructor() {
      super(...arguments);
      this._presenceHandler = null;
      this._imgFailed = false;
      this._onPointerMove = null;
      this._onPointerEnter = null;
      this._onPointerLeave = null;
      this._tiltRaf = 0;
      this._pendingTiltX = "0deg";
      this._pendingTiltY = "0deg";
      this._pendingGlareX = "50%";
      this._pendingGlareY = "50%";
    }
    connectedCallback() {
      super.connectedCallback();
      this._maybeAttachPresenceListener();
      this._attachHoverEffect();
    }
    disconnectedCallback() {
      if (this._presenceHandler) {
        document.removeEventListener(
          "desktop-mode-presence-changed",
          this._presenceHandler
        );
        this._presenceHandler = null;
      }
      this._detachHoverEffect();
    }
    attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback(name, oldValue, newValue);
      if (name === "src") {
        this._imgFailed = false;
      }
      if (name === "user-id" || name === "presence") {
        this._maybeAttachPresenceListener();
      }
    }
    render() {
      const src = this._attr("src");
      const name = this._attr("name") || "";
      const altRaw = this._attr("alt");
      const alt = altRaw !== null ? altRaw : name;
      const sizeRaw = this._attr("size");
      const size = this._resolveSize(sizeRaw);
      const presence = this._presenceForRender();
      const clickable = this._attr("clickable") !== null;
      this.style.setProperty("--wpd-avatar-size", `${size}px`);
      const initialsBg = src && !this._imgFailed ? "" : this._initialsBg(name);
      const inner = src && !this._imgFailed ? html`<img
					src=${src}
					alt=${alt}
					@error=${() => this._onImgError()}
					loading="lazy"
				/>` : this._initials(name);
      const dot = presence ? html`<span
					class=${`wpd-avatar__dot wpd-avatar__dot--${presence}`}
					aria-label=${this._presenceLabel(presence)}
				></span>` : html``;
      if (clickable) {
        return html`
				<button
					type="button"
					class="wpd-avatar__tile"
					aria-label=${alt || "User"}
					style=${initialsBg ? `background:${initialsBg};` : ""}
					@click=${(e) => this._onClick(e)}
				>${inner}</button>
				${dot}
			`;
      }
      return html`
			<div
				class="wpd-avatar__tile"
				role="img"
				aria-label=${alt || "User"}
				style=${initialsBg ? `background:${initialsBg};` : ""}
			>${inner}</div>
			${dot}
		`;
    }
    _attr(name) {
      return this.getAttribute(name);
    }
    _resolveSize(raw) {
      if (!raw) {
        return 32;
      }
      if (raw in SIZE_MAP) {
        return SIZE_MAP[raw];
      }
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 32;
    }
    _initials(name) {
      const trimmed = name.trim();
      if (!trimmed) {
        return "?";
      }
      return Array.from(trimmed)[0]?.toUpperCase() ?? "?";
    }
    _initialsBg(name) {
      const hue = hashTitleToHue(name);
      return `linear-gradient(135deg, hsl(${hue} 62% 55%), hsl(${(hue + 24) % 360} 58% 42%))`;
    }
    _presenceForRender() {
      const raw = this._attr("presence");
      if (raw && VALID_PRESENCE.has(raw)) {
        return raw;
      }
      return null;
    }
    _presenceLabel(p) {
      switch (p) {
        case "online":
          return "Online";
        case "inactive":
          return "Inactive";
        case "offline":
          return "Offline";
      }
    }
    _onImgError() {
      this._imgFailed = true;
      this.requestUpdate();
    }
    _onClick(e) {
      const userId = this._attr("user-id");
      const detail = {
        userId: userId !== null ? Number(userId) || null : null,
        originalEvent: e
      };
      this.emit("wpd-avatar-click", detail);
    }
    /**
     * Wire up the pointer-driven tilt + glare. Listens on the host so
     * one set of bindings covers both the clickable `<button>` and
     * the decorative `<div>` rendering branches. The actual math
     * runs in `_handlePointerMove`; this method just owns the
     * bind/unbind plumbing.
     *
     * Bails entirely when `prefers-reduced-motion: reduce` is set —
     * the CSS has its own `@media` guard for the visual layer, but
     * skipping the JS too saves the per-event work for users who
     * won't benefit from it.
     */
    _attachHoverEffect() {
      const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        return;
      }
      this._onPointerEnter = () => {
        this.style.setProperty("--wpd-avatar-hover", "1");
      };
      this._onPointerLeave = () => {
        this.style.setProperty("--wpd-avatar-hover", "0");
        this._pendingTiltX = "0deg";
        this._pendingTiltY = "0deg";
        this._pendingGlareX = "50%";
        this._pendingGlareY = "50%";
        this._flushTilt();
      };
      this._onPointerMove = (e) => {
        const rect = this.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return;
        }
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        const MAX = 14;
        this._pendingTiltY = `${(nx * MAX).toFixed(2)}deg`;
        this._pendingTiltX = `${(-ny * MAX).toFixed(2)}deg`;
        const gx = Math.max(0, Math.min(100, (nx + 0.5) * 100));
        const gy = Math.max(0, Math.min(100, (ny + 0.5) * 100));
        this._pendingGlareX = `${gx.toFixed(1)}%`;
        this._pendingGlareY = `${gy.toFixed(1)}%`;
        if (!this._tiltRaf) {
          this._tiltRaf = requestAnimationFrame(() => this._flushTilt());
        }
      };
      this.addEventListener("pointerenter", this._onPointerEnter);
      this.addEventListener("pointerleave", this._onPointerLeave);
      this.addEventListener("pointermove", this._onPointerMove);
    }
    _flushTilt() {
      this._tiltRaf = 0;
      this.style.setProperty("--wpd-avatar-tilt-x", this._pendingTiltX);
      this.style.setProperty("--wpd-avatar-tilt-y", this._pendingTiltY);
      this.style.setProperty("--wpd-avatar-glare-x", this._pendingGlareX);
      this.style.setProperty("--wpd-avatar-glare-y", this._pendingGlareY);
    }
    _detachHoverEffect() {
      if (this._onPointerMove) {
        this.removeEventListener("pointermove", this._onPointerMove);
        this._onPointerMove = null;
      }
      if (this._onPointerEnter) {
        this.removeEventListener("pointerenter", this._onPointerEnter);
        this._onPointerEnter = null;
      }
      if (this._onPointerLeave) {
        this.removeEventListener("pointerleave", this._onPointerLeave);
        this._onPointerLeave = null;
      }
      if (this._tiltRaf) {
        cancelAnimationFrame(this._tiltRaf);
        this._tiltRaf = 0;
      }
    }
    _maybeAttachPresenceListener() {
      const userId = this._attr("user-id");
      const explicit = this._attr("presence");
      const wantsListener = !!userId && !explicit;
      if (wantsListener && !this._presenceHandler) {
        this._presenceHandler = (e) => {
          const detail = e.detail;
          if (!detail) {
            return;
          }
          if (String(detail.userId) !== String(userId)) {
            return;
          }
          if (detail.newStatus && VALID_PRESENCE.has(detail.newStatus)) {
            this.setAttribute("presence", detail.newStatus);
          }
        };
        document.addEventListener(
          "desktop-mode-presence-changed",
          this._presenceHandler
        );
      } else if (!wantsListener && this._presenceHandler) {
        document.removeEventListener(
          "desktop-mode-presence-changed",
          this._presenceHandler
        );
        this._presenceHandler = null;
      }
    }
  };
  _WpdAvatar.props = ["src", "alt", "name", "size", "presence", "userId", "clickable"];
  _WpdAvatar.styles = [avatarStyles];
  _WpdAvatar.help = {
    title: "Avatar",
    summary: "Image-or-initials user tile with an optional presence dot. Falls back to a deterministic-hue letter tile when src is empty. Set user-id to auto-subscribe the dot to desktop-mode-presence-changed.",
    status: "stable",
    since: "0.6.0",
    props: [
      { name: "src", type: "string", description: "Image URL. Falls back to initials when empty or load fails." },
      { name: "alt", type: "string", description: "Alt text for the image. Defaults to `name` when omitted." },
      { name: "name", type: "string", description: "Used for initials + hue fallback when no src." },
      {
        name: "size",
        type: 'number | "xs" | "sm" | "md" | "lg" | "xl"',
        description: "Pixel size or named preset. Default 32 (sm-ish). Sets --wpd-avatar-size."
      },
      {
        name: "presence",
        type: '"online" | "inactive" | "offline"',
        description: "Presence dot color. Omit for no dot."
      },
      {
        name: "user-id",
        type: "number",
        description: "When set AND presence is unset, auto-subscribes to desktop-mode-presence-changed and updates the dot."
      },
      {
        name: "clickable",
        type: "boolean attribute",
        description: "Renders the tile as a focusable button that emits wpd-avatar-click. Omit for a decorative tile that lets clicks pass through to the surrounding row."
      }
    ],
    events: [
      {
        name: "wpd-avatar-click",
        description: "Fires on click when the `clickable` attribute is set. Detail carries userId when set.",
        detail: "{ userId: number | null }"
      }
    ],
    cssProps: [
      { name: "--wpd-avatar-size", description: "Tile size in any CSS length. Set automatically by the size attribute." },
      { name: "--wpd-avatar-dot-ring", description: "Background color used as the dot ring (matches surrounding panel by default)." }
    ],
    example: html`
			<wpd-avatar name="Daniel" size="40" presence="online"></wpd-avatar>
		`
  };
  let WpdAvatar = _WpdAvatar;
  defineComponent("wpd-avatar", WpdAvatar);
  const selectStyles = css`:host{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var( --desktop-mode-text,#1d2327 );min-width:0}:host( [ hidden ] ){display:none}.wpd-select__label{font-size:12px;color:var( --desktop-mode-muted,#646970 )}.wpd-select__wrap{position:relative;display:flex;align-items:center;width:100%}select{appearance:none;-webkit-appearance:none;display:block;width:100%;min-width:0;padding:7px 28px 7px 12px;background:rgba( 0,0,0,0.05 );border:1px solid transparent;border-radius:7px;font:inherit;font-size:13px;color:var( --desktop-mode-text,#1d2327 );cursor:pointer;transition:background-color 0.12s ease,border-color 0.12s ease,box-shadow 0.12s ease}select:hover{background:rgba( 0,0,0,0.08 )}select:focus-visible{outline:none;border-color:var( --wp-admin-theme-color,#2271b1 );box-shadow:0 0 0 1px var( --wp-admin-theme-color,#2271b1 )}select:disabled{opacity:0.5;cursor:not-allowed}.wpd-select__chevron{position:absolute;inset-inline-end:10px;top:50%;transform:translateY( -50% );pointer-events:none;color:var( --desktop-mode-muted,#646970 );display:inline-block}select:hover ~ .wpd-select__chevron,select:focus-visible ~ .wpd-select__chevron{color:var( --desktop-mode-text,#1d2327 )}`;
  const optionStyles = css`:host{display:none}`;
  const _WpdOption = class _WpdOption extends Component {
    render() {
      return html``;
    }
  };
  _WpdOption.props = ["value", "disabled"];
  _WpdOption.styles = [optionStyles];
  _WpdOption.help = {
    title: "Option",
    summary: "Opaque data carrier for <wpd-select>. Carries its identifier in `value` and its visible label in textContent. Not rendered directly — the parent reads these and builds a native <select>.",
    status: "stable",
    since: "0.5.0",
    props: [
      {
        name: "value",
        type: "string",
        description: "Option identifier read by the parent <wpd-select>."
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "Renders the option disabled in the parent <select>."
      }
    ],
    slots: [
      { name: "(default)", description: "Label text read from textContent." }
    ]
  };
  let WpdOption = _WpdOption;
  defineComponent("wpd-option", WpdOption);
  const _WpdSelect = class _WpdSelect extends Component {
    constructor() {
      super(...arguments);
      this._optionObserver = null;
    }
    /**
     * Declarative item-list setter. Replaces the existing
     * `<wpd-option>` children with a fresh set; preserves `value`
     * when it still matches, otherwise clears to the placeholder.
     *
     * Same shape as the setter on `<wpd-segmented>` so callers can
     * swap tag names (segmented ↔ select) without touching the
     * populate code when an option list outgrows the pill bar.
     *
     * ```js
     * select.items = [
     *   { value: 'eur', label: 'Euro' },
     *   { value: 'usd', label: 'US Dollar' },
     * ];
     * ```
     *
     * @since 0.5.0
     */
    set items(list) {
      const existing = this.querySelectorAll(":scope > wpd-option");
      for (const el of Array.from(existing)) {
        el.remove();
      }
      for (const item of list) {
        const opt = document.createElement("wpd-option");
        opt.setAttribute("value", item.value);
        opt.textContent = item.label;
        this.appendChild(opt);
      }
      const current = this.value;
      const stillValid = current !== null && list.some((i) => i.value === current);
      if (!stillValid && list.length > 0) {
        this.value = list[0].value;
      }
      this.requestUpdate();
    }
    connectedCallback() {
      super.connectedCallback();
      ensureAutoId(this);
      this._optionObserver = new MutationObserver(() => this.requestUpdate());
      this._optionObserver.observe(this, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["value", "disabled"],
        characterData: true
      });
    }
    disconnectedCallback() {
      this._optionObserver?.disconnect();
      this._optionObserver = null;
    }
    render() {
      const label = this.label || "";
      const current = this.value;
      const placeholder = this.placeholder || "";
      const disabled = this.disabled !== null;
      const name = this.name || "";
      if (label) {
        this.setAttribute("aria-label", label);
      } else {
        this.removeAttribute("aria-label");
      }
      const selectAriaLabel = label || placeholder;
      const options = this._readOptions();
      const hostId = this.id || "wpd-unnamed";
      const selectId = `${hostId}__input`;
      return html`
			${label ? html`<label
						class="wpd-select__label"
						for=${selectId}
					>${label}</label>` : html``}
			<span class="wpd-select__wrap">
				<select
					id=${selectId}
					?disabled=${disabled}
					aria-label=${selectAriaLabel}
					name=${name}
					@change=${(e) => this._onChange(e)}
				>
					${placeholder && !current ? html`<option value="" disabled selected>
								${placeholder}
						  </option>` : html``}
					${options.map(
        (o) => html`
							<option
								value=${o.value}
								?disabled=${o.disabled}
								?selected=${o.value === current}
							>
								${o.label}
							</option>
						`
      )}
				</select>
				<!--
					Inline SVG — the previous dashicons-classed span
					never painted because the global Dashicons font
					stylesheet cannot cross the shadow-root boundary.
					An inline SVG lives inside the shadow tree, inherits
					currentColor via the stroke attribute, and needs
					no external CSS.
				-->
				<svg
					class="wpd-select__chevron"
					viewBox="0 0 12 12"
					width="12"
					height="12"
					aria-hidden="true"
					focusable="false"
				>
					<path
						d="M3 5l3 3 3-3"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						fill="none"
					></path>
				</svg>
			</span>
		`;
    }
    _readOptions() {
      const out = [];
      const children = this.querySelectorAll(":scope > wpd-option");
      for (const child of Array.from(children)) {
        const value = child.getAttribute("value");
        if (value === null) {
          continue;
        }
        out.push({
          value,
          label: (child.textContent || value).trim(),
          disabled: child.hasAttribute("disabled")
        });
      }
      return out;
    }
    _onChange(e) {
      const sel = e.target;
      const next = sel.value;
      this.value = next;
      this.emit("wpd-pick", { value: next });
    }
  };
  _WpdSelect.props = [
    "value",
    "label",
    "placeholder",
    "disabled",
    "name"
  ];
  _WpdSelect.styles = [selectStyles];
  _WpdSelect.help = {
    title: "Select",
    summary: "Dropdown picker that wraps a native <select>. Mirrors the <wpd-segmented> contract (set value, listen for wpd-pick) so callers can swap tag names when a list outgrows a pill bar.",
    status: "stable",
    since: "0.5.0",
    props: [
      {
        name: "value",
        type: "string",
        description: "Currently selected option value."
      },
      {
        name: "label",
        type: "string",
        description: "Visible label rendered above the select and forwarded to the native control as aria-label."
      },
      {
        name: "placeholder",
        type: "string",
        description: "Disabled leading option shown when no value is set."
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "Disables the native select and dims the chrome."
      },
      {
        name: "name",
        type: "string",
        description: "Forwarded to the native <select name=…> for form submission."
      }
    ],
    slots: [
      { name: "(default)", description: '<wpd-option value="…"> children.' }
    ],
    events: [
      {
        name: "wpd-pick",
        description: "Fires when the user picks a new option.",
        detail: "{ value: string }"
      }
    ],
    cssProps: [
      { name: "--desktop-mode-text", description: "Label + value colour." },
      { name: "--desktop-mode-muted", description: "Placeholder + chevron colour." }
    ],
    example: html`
			<wpd-select value="eur" label="Currency">
				<wpd-option value="eur">Euro</wpd-option>
				<wpd-option value="usd">US Dollar</wpd-option>
				<wpd-option value="jpy">Japanese Yen</wpd-option>
			</wpd-select>
		`
  };
  let WpdSelect = _WpdSelect;
  defineComponent("wpd-select", WpdSelect);
  const multiselectStyles = css`
	:host {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
		color: var( --desktop-mode-text, #1d2327 );
		min-width: 0;
	}

	:host( [ hidden ] ) {
		display: none;
	}

	.wpd-multiselect__label {
		font-size: 12px;
		color: var( --desktop-mode-muted, #646970 );
	}

	.wpd-multiselect__trigger {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		min-width: 0;
		padding: 7px 12px 7px 12px;
		background: rgba( 0, 0, 0, 0.05 );
		border: 1px solid transparent;
		border-radius: 7px;
		font: inherit;
		font-size: 13px;
		color: var( --desktop-mode-text, #1d2327 );
		cursor: pointer;
		text-align: start;
		transition: background-color 0.12s ease, border-color 0.12s ease,
			box-shadow 0.12s ease;
	}

	.wpd-multiselect__trigger:hover {
		background: rgba( 0, 0, 0, 0.08 );
	}

	.wpd-multiselect__trigger:focus-visible {
		outline: none;
		border-color: var( --wp-admin-theme-color, #2271b1 );
		box-shadow: 0 0 0 1px var( --wp-admin-theme-color, #2271b1 );
	}

	.wpd-multiselect__trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.wpd-multiselect__trigger[ data-active='true' ] {
		color: var( --wp-admin-theme-color, #2271b1 );
		font-weight: 600;
	}

	.wpd-multiselect__summary {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.wpd-multiselect__chevron {
		color: var( --desktop-mode-muted, #646970 );
		flex-shrink: 0;
		transition: color 0.12s ease, transform 0.18s ease;
	}

	.wpd-multiselect__trigger:hover .wpd-multiselect__chevron,
	.wpd-multiselect__trigger:focus-visible .wpd-multiselect__chevron {
		color: var( --desktop-mode-text, #1d2327 );
	}

	:host( [ open ] ) .wpd-multiselect__chevron {
		transform: rotate( 180deg );
	}
`;
  function _installGlobalPopoverStyles() {
    const STYLE_ID = "wpd-multiselect-popover-styles";
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.wpd-multiselect__popover {
	position: fixed;
	z-index: 100000;
	max-height: 320px;
	overflow-y: auto;
	min-width: 200px;
	padding: 4px 0;
	background: var( --desktop-mode-window-bg, #fff );
	color: var( --desktop-mode-text, #1d2327 );
	border: 1px solid var( --desktop-mode-window-border, #c3c4c7 );
	border-radius: 8px;
	box-shadow: 0 8px 28px rgba( 0, 0, 0, 0.18 );
	font: inherit;
	font-size: 13px;
}

.wpd-multiselect__clear {
	display: block;
	width: 100%;
	padding: 6px 12px;
	font: inherit;
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	text-align: start;
	border: 0;
	border-bottom: 1px solid var( --desktop-mode-window-border, #dcdcde );
	background: transparent;
	color: var( --wp-admin-theme-color, #2271b1 );
	cursor: pointer;
}

.wpd-multiselect__clear:hover {
	background: color-mix(
		in srgb,
		var( --wp-admin-theme-color, #2271b1 ) 10%,
		transparent
	);
}

.wpd-multiselect__option {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 12px;
	cursor: pointer;
	user-select: none;
}

.wpd-multiselect__option:hover {
	background: rgba( 0, 0, 0, 0.05 );
}

.wpd-multiselect__option[ data-disabled='true' ] {
	opacity: 0.5;
	cursor: not-allowed;
}

.wpd-multiselect__option > span {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wpd-multiselect__option > input[ type='checkbox' ] {
	margin: 0;
	flex-shrink: 0;
	accent-color: var( --wp-admin-theme-color, #2271b1 );
}

.wpd-multiselect__empty {
	padding: 8px 12px;
	color: var( --desktop-mode-muted, #646970 );
	font-style: italic;
}

.wpd-multiselect__loading {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	color: var( --desktop-mode-muted, #646970 );
	font-size: 12px;
}

.wpd-multiselect__spinner {
	display: inline-block;
	width: 12px;
	height: 12px;
	border-radius: 50%;
	border: 2px solid currentColor;
	border-top-color: transparent;
	animation: wpd-multiselect-spin 0.8s linear infinite;
}

@keyframes wpd-multiselect-spin {
	to { transform: rotate( 360deg ); }
}
`;
    document.head.appendChild(style);
  }
  if (typeof document !== "undefined") {
    _installGlobalPopoverStyles();
  }
  const _WpdMultiselect = class _WpdMultiselect extends Component {
    constructor() {
      super(...arguments);
      this._optionObserver = null;
      this._popover = null;
      this._teardownOpen = null;
      this._hasMore = false;
      this._loadingMore = false;
    }
    /**
     * Declarative item-list setter. Replaces the existing
     * `<wpd-option>` children with a fresh set; preserves any values
     * that still match.
     *
     * @since 0.8.0
     */
    set items(list) {
      const existing = this.querySelectorAll(":scope > wpd-option");
      for (const el of Array.from(existing)) {
        el.remove();
      }
      for (const item of list) {
        const opt = document.createElement("wpd-option");
        opt.setAttribute("value", item.value);
        opt.textContent = item.label;
        this.appendChild(opt);
      }
      this._loadingMore = false;
      const validSet = new Set(list.map((i) => i.value));
      const next = this._readValues().filter((v) => validSet.has(v));
      this._writeValueAttribute(next);
      this.requestUpdate();
      this._refreshPopover();
    }
    /** Programmatic getter for the parsed selection. */
    get values() {
      return this._readValues();
    }
    /**
     * Programmatic setter — accepts an array of values; serialises
     * back to the `value` attribute as a comma-joined string.
     */
    set values(next) {
      const arr = Array.isArray(next) ? next.map((v) => String(v)).filter((v) => v !== "") : [];
      this._writeValueAttribute(arr);
      this.requestUpdate();
      this._refreshPopover();
    }
    /** Whether more pages are available (drives the load-more emit). */
    get hasMore() {
      return this._hasMore;
    }
    set hasMore(next) {
      this._hasMore = !!next;
      this._refreshPopover();
    }
    /**
     * Whether a load-more fetch is currently in flight. While true,
     * the popover paints a small spinner row and suppresses further
     * `wpd-multiselect-load-more` emits.
     */
    get loadingMore() {
      return this._loadingMore;
    }
    set loadingMore(next) {
      this._loadingMore = !!next;
      this._refreshPopover();
    }
    /**
     * Append additional options without dropping any already in the
     * tree. Used by infinite-scroll consumers — call when the next
     * page lands, then set `loadingMore = false` and update
     * `hasMore` based on whether more pages remain.
     *
     * @since 0.8.0
     */
    appendItems(more) {
      this._loadingMore = false;
      if (!more || more.length === 0) {
        this._refreshPopover();
        return;
      }
      const existing = new Set(
        Array.from(this.querySelectorAll(":scope > wpd-option")).map(
          (el) => el.getAttribute("value")
        )
      );
      for (const item of more) {
        if (existing.has(item.value)) {
          continue;
        }
        const opt = document.createElement("wpd-option");
        opt.setAttribute("value", item.value);
        opt.textContent = item.label;
        this.appendChild(opt);
      }
      this.requestUpdate();
      this._refreshPopover();
    }
    connectedCallback() {
      super.connectedCallback();
      ensureAutoId(this);
      this._optionObserver = new MutationObserver(() => {
        this.requestUpdate();
        this._refreshPopover();
      });
      this._optionObserver.observe(this, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["value", "disabled"],
        characterData: true
      });
    }
    disconnectedCallback() {
      this._optionObserver?.disconnect();
      this._optionObserver = null;
      this._closePopover();
    }
    render() {
      const label = this.label || "";
      const placeholder = this.placeholder || "All";
      const disabled = this.disabled !== null;
      if (label) {
        this.setAttribute("aria-label", label);
      } else {
        this.removeAttribute("aria-label");
      }
      const triggerAriaLabel = label || placeholder;
      const summary = this._summarize(placeholder);
      const isActive = this._readValues().length > 0;
      const hostId = this.id || "wpd-unnamed";
      const triggerId = `${hostId}__trigger`;
      return html`
			${label ? html`<label
						class="wpd-multiselect__label"
						for=${triggerId}
					>${label}</label>` : html``}
			<button
				id=${triggerId}
				type="button"
				class="wpd-multiselect__trigger"
				aria-haspopup="listbox"
				aria-expanded=${this._isOpen() ? "true" : "false"}
				aria-label=${triggerAriaLabel}
				?disabled=${disabled}
				data-active=${isActive ? "true" : "false"}
				@click=${(e) => this._onTriggerClick(e)}
			>
				<span class="wpd-multiselect__summary">${summary}</span>
				<svg
					class="wpd-multiselect__chevron"
					viewBox="0 0 12 12"
					width="12"
					height="12"
					aria-hidden="true"
					focusable="false"
				>
					<path
						d="M3 5l3 3 3-3"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						fill="none"
					/>
				</svg>
			</button>
		`;
    }
    _readOptions() {
      const out = [];
      const children = this.querySelectorAll(":scope > wpd-option");
      for (const child of Array.from(children)) {
        const value = child.getAttribute("value");
        if (value === null) {
          continue;
        }
        out.push({
          value,
          label: (child.textContent || value).trim(),
          disabled: child.hasAttribute("disabled")
        });
      }
      return out;
    }
    _readValues() {
      const raw = this.value ?? "";
      return raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
    }
    _writeValueAttribute(vals) {
      const next = vals.join(",");
      this.value = next;
    }
    _summarize(placeholder) {
      const vals = this._readValues();
      if (vals.length === 0) {
        return placeholder;
      }
      const opts = this._readOptions();
      const byValue = new Map(opts.map((o) => [o.value, o.label]));
      if (vals.length === 1) {
        return byValue.get(vals[0]) ?? vals[0];
      }
      return `${vals.length} selected`;
    }
    _isOpen() {
      return this.open !== null;
    }
    _onTriggerClick(e) {
      e.stopPropagation();
      e.preventDefault();
      const disabled = this.disabled !== null;
      if (disabled) {
        return;
      }
      if (this._popover) {
        this._closePopover();
      } else {
        this._openPopover();
      }
    }
    _openPopover() {
      if (this._popover) {
        return;
      }
      const popover = document.createElement("div");
      popover.className = "wpd-multiselect__popover";
      popover.setAttribute("role", "listbox");
      popover.setAttribute("aria-multiselectable", "true");
      popover.style.setProperty(
        "--wp-admin-theme-color",
        getComputedStyle(this).getPropertyValue(
          "--wp-admin-theme-color"
        ) || "#2271b1"
      );
      document.body.appendChild(popover);
      this._popover = popover;
      this._refreshPopover();
      this._placePopover();
      const onDocPointer = (ev) => {
        const target = ev.target;
        if (!target) {
          return;
        }
        const trigger = this.shadowRoot?.querySelector(
          ".wpd-multiselect__trigger"
        );
        if (popover.contains(target)) {
          return;
        }
        if (trigger && trigger.contains(target)) {
          return;
        }
        this._closePopover();
      };
      const onKey = (ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          this._closePopover();
          const trigger = this.shadowRoot?.querySelector(
            ".wpd-multiselect__trigger"
          );
          trigger?.focus();
        }
      };
      const onResizeScroll = () => this._placePopover();
      const onPopoverScroll = () => {
        if (!this._hasMore || this._loadingMore) {
          return;
        }
        const sh = popover.scrollHeight;
        const ch = popover.clientHeight;
        const st = popover.scrollTop;
        if (sh - (st + ch) < 64) {
          this.emit("wpd-multiselect-load-more", {});
        }
      };
      setTimeout(() => {
        document.addEventListener("pointerdown", onDocPointer, true);
      }, 0);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("resize", onResizeScroll);
      window.addEventListener("scroll", onResizeScroll, true);
      popover.addEventListener("scroll", onPopoverScroll);
      this._teardownOpen = () => {
        document.removeEventListener("pointerdown", onDocPointer, true);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("resize", onResizeScroll);
        window.removeEventListener("scroll", onResizeScroll, true);
        popover.removeEventListener("scroll", onPopoverScroll);
      };
      this.setAttribute("open", "");
      this.requestUpdate();
      this.emit("wpd-multiselect-open", {});
    }
    _closePopover() {
      if (this._teardownOpen) {
        this._teardownOpen();
        this._teardownOpen = null;
      }
      if (this._popover) {
        this._popover.remove();
        this._popover = null;
        this.removeAttribute("open");
        this.requestUpdate();
        this.emit("wpd-multiselect-close", {});
      }
    }
    _refreshPopover() {
      const popover = this._popover;
      if (!popover) {
        return;
      }
      const options = this._readOptions();
      const selected = new Set(this._readValues());
      popover.replaceChildren();
      if (options.length === 0) {
        const empty = document.createElement("div");
        empty.className = "wpd-multiselect__empty";
        empty.textContent = "No options";
        popover.appendChild(empty);
        return;
      }
      if (selected.size > 0) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "wpd-multiselect__clear";
        clear.textContent = "Clear";
        clear.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._writeValueAttribute([]);
          this.requestUpdate();
          this._refreshPopover();
          this._emitPick();
        });
        popover.appendChild(clear);
      }
      for (const opt of options) {
        const row = document.createElement("label");
        row.className = "wpd-multiselect__option";
        row.setAttribute("role", "option");
        row.setAttribute(
          "aria-selected",
          selected.has(opt.value) ? "true" : "false"
        );
        if (opt.disabled) {
          row.setAttribute("aria-disabled", "true");
          row.dataset.disabled = "true";
        }
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected.has(opt.value);
        cb.disabled = opt.disabled;
        cb.addEventListener("change", () => {
          const cur = new Set(this._readValues());
          if (cb.checked) {
            cur.add(opt.value);
          } else {
            cur.delete(opt.value);
          }
          const ordered = options.map((o) => o.value).filter((v) => cur.has(v));
          this._writeValueAttribute(ordered);
          row.setAttribute(
            "aria-selected",
            cb.checked ? "true" : "false"
          );
          this.requestUpdate();
          this._refreshPopover();
          this._emitPick();
        });
        const labelText = document.createElement("span");
        labelText.textContent = opt.label;
        row.appendChild(cb);
        row.appendChild(labelText);
        popover.appendChild(row);
      }
      if (this._loadingMore) {
        const loading = document.createElement("div");
        loading.className = "wpd-multiselect__loading";
        const spinner = document.createElement("span");
        spinner.className = "wpd-multiselect__spinner";
        spinner.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.textContent = "Loading…";
        loading.appendChild(spinner);
        loading.appendChild(text);
        popover.appendChild(loading);
      }
    }
    _placePopover() {
      const popover = this._popover;
      const trigger = this.shadowRoot?.querySelector(
        ".wpd-multiselect__trigger"
      );
      if (!popover || !trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const minW = Math.max(rect.width, 200);
      popover.style.minWidth = `${minW}px`;
      let left = rect.left;
      if (left + minW > vw - 8) {
        left = Math.max(8, vw - minW - 8);
      }
      popover.style.left = `${left}px`;
      popover.style.top = `${rect.bottom + 4}px`;
      const popH = popover.offsetHeight || 200;
      if (rect.bottom + 4 + popH > vh - 8) {
        popover.style.top = `${Math.max(8, rect.top - popH - 4)}px`;
      }
    }
    _emitPick() {
      const values = this._readValues();
      this.emit("wpd-pick", {
        value: values.join(","),
        values
      });
    }
  };
  _WpdMultiselect.props = [
    "value",
    "label",
    "placeholder",
    "disabled",
    "name",
    "open"
  ];
  _WpdMultiselect.styles = [multiselectStyles];
  _WpdMultiselect.help = {
    title: "Multi-select",
    summary: "Multi-select dropdown picker that mirrors <wpd-select> ergonomically. Trigger button shows a one-line summary; clicking opens a checkbox popover. value is a comma-joined id list so it round-trips through plain string attributes.",
    status: "experimental",
    since: "0.8.0",
    props: [
      {
        name: "value",
        type: "string (comma-joined ids)",
        description: 'Currently selected option values, joined by commas (e.g. "1,4"). Empty string means no selection.'
      },
      {
        name: "label",
        type: "string",
        description: "Visible label rendered above the trigger and forwarded as aria-label to the trigger button."
      },
      {
        name: "placeholder",
        type: "string",
        description: 'Trigger summary when no option is checked. Defaults to "All".'
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "Disables the trigger and dims the chrome."
      },
      {
        name: "name",
        type: "string",
        description: "Reserved for HTML form submission; not yet wired to a form field."
      },
      {
        name: "open",
        type: "boolean attribute",
        description: "Read-only reflection of the popover state, set by the component when it opens/closes. Useful from a CSS selector; toggling it programmatically does not open/close the popover — click the trigger instead."
      }
    ],
    slots: [
      { name: "(default)", description: '<wpd-option value="…"> children.' }
    ],
    events: [
      {
        name: "wpd-pick",
        description: "Fires when the user toggles any option. Detail carries both shapes — `value` is the comma-joined attribute round-trip, `values` is the parsed array.",
        detail: "{ value: string; values: string[] }"
      },
      {
        name: "wpd-multiselect-open",
        description: "Fires when the popover opens.",
        detail: "{}"
      },
      {
        name: "wpd-multiselect-close",
        description: "Fires when the popover closes.",
        detail: "{}"
      },
      {
        name: "wpd-multiselect-load-more",
        description: "Fires when the user scrolls near the bottom of the popover and `hasMore` is true. Consumer fetches the next page and calls `picker.appendItems(...)` to extend the list. While the fetch is in flight, set `picker.loadingMore = true` to show the spinner row and prevent re-firing.",
        detail: "{}"
      }
    ],
    cssProps: [
      { name: "--desktop-mode-text", description: "Label + value colour." },
      { name: "--desktop-mode-muted", description: "Placeholder + chevron colour." }
    ],
    example: html`
			<wpd-multiselect value="1,4" label="Authors">
				<wpd-option value="1">Daniel</wpd-option>
				<wpd-option value="4">Peter</wpd-option>
				<wpd-option value="9">Pat</wpd-option>
			</wpd-multiselect>
		`
  };
  let WpdMultiselect = _WpdMultiselect;
  defineComponent("wpd-multiselect", WpdMultiselect);
  const styles$3 = css`:host{display:inline;color:inherit;font:inherit}`;
  const _instances = /* @__PURE__ */ new Set();
  let _ticker = null;
  const TICK_INTERVAL_MS = 3e4;
  function startTicker() {
    if (_ticker !== null) {
      return;
    }
    _ticker = window.setInterval(() => {
      for (const i of _instances) {
        i.tick();
      }
    }, TICK_INTERVAL_MS);
  }
  function stopTickerIfIdle() {
    if (_ticker !== null && _instances.size === 0) {
      window.clearInterval(_ticker);
      _ticker = null;
    }
  }
  function parseDatetime(raw) {
    if (!raw) {
      return null;
    }
    const tryDate = (v) => {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    if (raw.includes("T") || raw.endsWith("Z")) {
      return tryDate(raw);
    }
    return tryDate(raw.replace(" ", "T") + "Z");
  }
  let _rtfCache = null;
  function getRtf() {
    if (!_rtfCache) {
      const lang = typeof navigator !== "undefined" && navigator.language || "en";
      _rtfCache = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
    }
    return _rtfCache;
  }
  function relativeText(date, now) {
    const rtf = getRtf();
    const diffMs = date.getTime() - now;
    const diffSec = Math.round(diffMs / 1e3);
    const abs = Math.abs;
    if (abs(diffSec) < 45) {
      return rtf.format(0, "second");
    }
    const diffMin = Math.round(diffSec / 60);
    if (abs(diffMin) < 45) {
      return rtf.format(diffMin, "minute");
    }
    const diffHour = Math.round(diffMin / 60);
    if (abs(diffHour) < 22) {
      return rtf.format(diffHour, "hour");
    }
    const diffDay = Math.round(diffHour / 24);
    if (abs(diffDay) < 26) {
      return rtf.format(diffDay, "day");
    }
    const diffMonth = Math.round(diffDay / 30);
    if (abs(diffMonth) < 11) {
      return rtf.format(diffMonth, "month");
    }
    const diffYear = Math.round(diffDay / 365);
    return rtf.format(diffYear, "year");
  }
  const _WpdRelativeTime = class _WpdRelativeTime extends Component {
    connectedCallback() {
      super.connectedCallback();
      _instances.add(this);
      startTicker();
    }
    disconnectedCallback() {
      _instances.delete(this);
      stopTickerIfIdle();
    }
    /** Public — the shared ticker calls this on every interval. */
    tick() {
      this.requestUpdate();
    }
    render() {
      const raw = this.datetime;
      const date = parseDatetime(raw);
      if (!date) {
        return html`<span>${raw ?? ""}</span>`;
      }
      const text = relativeText(date, Date.now());
      const absolute = date.toLocaleString();
      return html`<time datetime=${date.toISOString()} title=${absolute}
			>${text}</time
		>`;
    }
  };
  _WpdRelativeTime.props = ["datetime"];
  _WpdRelativeTime.styles = [styles$3];
  _WpdRelativeTime.help = {
    title: "Relative time",
    summary: 'Auto-ticking relative timestamp. Renders "5 minutes ago" / "yesterday" / "in 3 hours" via Intl.RelativeTimeFormat and updates itself every 30s while connected. Useful for any list cell that should age live (recycle bin, notifications, activity log) without forcing the surrounding view to repaint.',
    status: "experimental",
    since: "0.6.0",
    props: [
      {
        name: "datetime",
        type: 'ISO 8601 string OR MySQL-style "Y-m-d H:i:s" (treated as UTC)',
        description: "The moment the relative copy is anchored to. Accepts the format WordPress hands back from `*_gmt` columns directly."
      }
    ],
    slots: [],
    cssProps: [],
    example: html`<wpd-relative-time
			datetime="${new Date(Date.now() - 1e3 * 60 * 5).toISOString()}"
		></wpd-relative-time>`
  };
  let WpdRelativeTime = _WpdRelativeTime;
  defineComponent("wpd-relative-time", WpdRelativeTime);
  const wpdFormStyles = css`:host{display:block;container-type:inline-size;container-name:wpd-form;font-size:13px;color:var( --desktop-mode-text,#1d2327 )}:host( [ hidden ] ){display:none}.header{margin:0 0 18px}.header:empty{display:none}.fields{display:grid;grid-template-columns:1fr;gap:14px 16px;margin:0 0 18px}@container wpd-form ( min-width:480px ){.fields{grid-template-columns:repeat( 2,minmax( 0,1fr ) )}}@container wpd-form ( min-width:760px ){:host( [ columns="3" ] ) .fields{grid-template-columns:repeat( 3,minmax( 0,1fr ) )}}:host( [ columns="1" ] ) .fields{grid-template-columns:1fr}:host( [ columns="2" ] ) .fields{grid-template-columns:repeat( 2,minmax( 0,1fr ) )}::slotted( [ full-width ] ){grid-column:1 / -1}::slotted( [ slot ] ){display:contents}.error{margin:0 0 14px;padding:10px 12px;border-radius:6px;background:rgba( 179,45,46,0.10 );color:#b32d2e;font-size:13px;line-height:1.4}.error[ hidden ]{display:none}.footer{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end;border-top:1px solid var( --desktop-mode-border,#dcdcde );padding-top:14px}:host( [ align="start" ] ) .footer{justify-content:flex-start}:host( [ align="stretch" ] ) .footer{justify-content:stretch}:host( [ align="stretch" ] ) .footer .footer-actions{flex:1 1 auto}.footer-leading,.footer-trailing{display:contents}.footer-actions{display:inline-flex;gap:8px;align-items:center;margin-inline-start:auto}:host( [ align="start" ] ) .footer-actions{margin-inline-start:0}:host( [ busy ] ){pointer-events:none}:host( [ busy ] ) .fields{opacity:0.6}:host( [ busy ] ) .footer{pointer-events:auto}.busy-spinner{display:inline-flex;width:14px;height:14px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:wpd-form-spin 0.7s linear infinite;vertical-align:-2px;margin-inline-end:6px}@keyframes wpd-form-spin{to{transform:rotate( 360deg )}}@media ( prefers-reduced-motion:reduce ){.busy-spinner{animation-duration:2s}}`;
  const _WpdForm = class _WpdForm extends Component {
    constructor() {
      super(...arguments);
      this._initial = /* @__PURE__ */ new Map();
      this._captured = false;
      this._fieldChangeListener = null;
      this._enterSubmitListener = null;
    }
    connectedCallback() {
      super.connectedCallback();
      queueMicrotask(() => this._captureInitialValues());
      this._fieldChangeListener = (e) => this._onAnyFieldInput(e);
      this.addEventListener("wpd-input-change", this._fieldChangeListener);
      this.addEventListener("wpd-input-commit", this._fieldChangeListener);
      this.addEventListener("wpd-checkbox-change", this._fieldChangeListener);
      this.addEventListener("wpd-select-change", this._fieldChangeListener);
      this.addEventListener("change", this._fieldChangeListener);
      this._enterSubmitListener = () => this.submit();
      this.addEventListener("wpd-submit", this._enterSubmitListener);
    }
    disconnectedCallback() {
      if (this._fieldChangeListener) {
        this.removeEventListener("wpd-input-change", this._fieldChangeListener);
        this.removeEventListener("wpd-input-commit", this._fieldChangeListener);
        this.removeEventListener("wpd-checkbox-change", this._fieldChangeListener);
        this.removeEventListener("wpd-select-change", this._fieldChangeListener);
        this.removeEventListener("change", this._fieldChangeListener);
        this._fieldChangeListener = null;
      }
      if (this._enterSubmitListener) {
        this.removeEventListener("wpd-submit", this._enterSubmitListener);
        this._enterSubmitListener = null;
      }
    }
    render() {
      const submitLabel = this["submit-label"] || "Submit";
      const resetLabel = this["reset-label"] || "Reset";
      const error = this.error || "";
      const busy = this.busy !== null;
      const showResetRaw = this["show-reset"];
      const showReset = showResetRaw !== "false";
      return html`
			<div class="header" part="header">
				<slot name="header"></slot>
			</div>
			<div class="fields" part="fields">
				<slot></slot>
			</div>
			<slot name="error">
				${error ? html`<p class="error" role="alert" part="error">${error}</p>` : html`<p class="error" role="alert" part="error" hidden></p>`}
			</slot>
			<footer class="footer" part="footer">
				<span class="footer-leading"
					><slot name="footer-leading"></slot
				></span>
				<span class="footer-actions">
					${showReset ? html`<wpd-button
								variant="ghost"
								data-wpd-form-action="reset"
								?disabled=${busy}
								@click=${() => this.reset()}
							>${resetLabel}</wpd-button>` : html``}
					<wpd-button
						variant="primary"
						data-wpd-form-action="submit"
						?disabled=${busy}
						@click=${() => this.submit()}
					>
						${busy ? html`<span class="busy-spinner" aria-hidden="true"></span>` : html``}
						${submitLabel}
					</wpd-button>
				</span>
				<span class="footer-trailing"
					><slot name="footer-trailing"></slot
				></span>
			</footer>
		`;
    }
    // ─── Public API ──────────────────────────────────────────────────
    /**
     * Collect every named descendant's current value. Checkboxes
     * return `boolean`; everything else returns whatever the field
     * surfaces on its `value` property (or attribute as fallback).
     */
    getValues() {
      const out = {};
      for (const field of this._namedFields()) {
        const name = field.getAttribute("name");
        if (!name) {
          continue;
        }
        out[name] = this._readField(field);
      }
      return out;
    }
    /**
     * Apply a partial values map to the matching named fields.
     * Unknown names are skipped silently (fields may not be
     * mounted yet).
     */
    setValues(patch) {
      for (const [name, value] of Object.entries(patch)) {
        const field = this._fieldByName(name);
        if (!field) {
          continue;
        }
        this._writeField(field, value);
      }
    }
    /** Toggle the busy attribute (also re-renders to refresh the spinner). */
    setBusy(busy) {
      if (busy) {
        this.setAttribute("busy", "");
      } else {
        this.removeAttribute("busy");
      }
    }
    /**
     * Set the top-of-form error banner. Pass `null` (or empty
     * string) to clear. Equivalent to setting the `error` attribute.
     */
    setError(message) {
      if (message) {
        this.setAttribute("error", message);
      } else {
        this.removeAttribute("error");
      }
    }
    /**
     * Mark a single field invalid (or clear it). Useful for
     * server-returned per-field errors — e.g. "username already
     * exists". The optional `message` is set via the field's
     * `error` attribute when supported (currently a no-op for
     * fields that don't render one — falls back to the `invalid`
     * highlight only).
     */
    setFieldInvalid(name, invalid = true, message = null) {
      const field = this._fieldByName(name);
      if (!field) {
        return;
      }
      if (invalid) {
        field.setAttribute("invalid", "");
        if (message !== null) {
          field.setAttribute("error", message);
        }
      } else {
        field.removeAttribute("invalid");
        field.removeAttribute("error");
      }
    }
    /** Clear the form-level error AND every per-field invalid mark. */
    clearErrors() {
      this.setError(null);
      for (const field of this._namedFields()) {
        field.removeAttribute("invalid");
        field.removeAttribute("error");
      }
    }
    /**
     * Restore every field to its initial value (the snapshot taken
     * at first connection). Fires `wpd-form-reset` afterwards.
     */
    reset() {
      this.clearErrors();
      for (const [name, snap] of this._initial.entries()) {
        const field = this._fieldByName(name);
        if (!field) {
          continue;
        }
        if (snap.checked !== null) {
          field.checked = snap.checked;
          if (snap.checked) {
            field.setAttribute("checked", "");
          } else {
            field.removeAttribute("checked");
          }
          continue;
        }
        this._writeField(field, snap.value);
      }
      this.dispatchEvent(
        new CustomEvent("wpd-form-reset", {
          bubbles: true,
          composed: true,
          detail: { form: this }
        })
      );
    }
    /**
     * Programmatic submit. Same path the submit button + Enter key
     * take. Runs required-field validation, then dispatches a
     * cancellable `wpd-form-submit`.
     */
    submit() {
      const failures = [];
      for (const field of this._namedFields()) {
        const name = field.getAttribute("name");
        if (!name) {
          continue;
        }
        const required = field.hasAttribute("required");
        if (!required) {
          continue;
        }
        const value = this._readField(field);
        const empty = value === null || value === void 0 || value === "" || Array.isArray(value) && value.length === 0;
        if (empty) {
          field.setAttribute("invalid", "");
          const labelAttr = field.getAttribute("label");
          failures.push(labelAttr || name);
        }
      }
      if (failures.length > 0) {
        const list = failures.join(", ");
        this.setError(`Required: ${list}`);
        return;
      }
      const values = this.getValues();
      const event = new CustomEvent("wpd-form-submit", {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: { values, form: this }
      });
      this.dispatchEvent(event);
    }
    // ─── Internals ───────────────────────────────────────────────────
    _captureInitialValues() {
      if (this._captured) {
        return;
      }
      const fields = this._namedFields();
      if (fields.length === 0) {
        return;
      }
      for (const field of fields) {
        const name = field.getAttribute("name");
        if (!name) {
          continue;
        }
        const isCheckbox = field.tagName === "WPD-CHECKBOX" || field.tagName === "WPD-CHECKBOX-LABEL" || field.tagName === "INPUT" && field.type === "checkbox";
        this._initial.set(name, {
          value: this._readField(field),
          checked: isCheckbox ? Boolean(field.checked) : null
        });
      }
      this._captured = true;
    }
    _namedFields() {
      return Array.from(
        this.querySelectorAll("[name]")
      );
    }
    _fieldByName(name) {
      const safe = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(name) : name.replace(/["\\]/g, "\\$&");
      return this.querySelector(`[name="${safe}"]`);
    }
    _readField(field) {
      const tag = field.tagName.toUpperCase();
      const isCheckbox = tag === "WPD-CHECKBOX" || tag === "WPD-CHECKBOX-LABEL" || tag === "INPUT" && field.type === "checkbox";
      if (isCheckbox) {
        if (typeof field.checked === "boolean") {
          return field.checked;
        }
        return field.hasAttribute("checked");
      }
      if (field.value !== void 0 && field.value !== null) {
        return field.value;
      }
      return field.getAttribute("value") ?? "";
    }
    _writeField(field, value) {
      const tag = field.tagName.toUpperCase();
      const isCheckbox = tag === "WPD-CHECKBOX" || tag === "WPD-CHECKBOX-LABEL" || tag === "INPUT" && field.type === "checkbox";
      if (isCheckbox) {
        const next = Boolean(value);
        field.checked = next;
        if (next) {
          field.setAttribute("checked", "");
        } else {
          field.removeAttribute("checked");
        }
        return;
      }
      const str = value === null || value === void 0 ? "" : String(value);
      field.value = str;
      field.setAttribute("value", str);
    }
    _onAnyFieldInput(e) {
      const target = e.target;
      if (!target) {
        return;
      }
      const name = target.getAttribute?.("name");
      if (!name) {
        return;
      }
      this.dispatchEvent(
        new CustomEvent("wpd-form-input", {
          bubbles: true,
          composed: true,
          detail: {
            name,
            value: this._readField(target),
            form: this
          }
        })
      );
      if (target.hasAttribute("invalid")) {
        target.removeAttribute("invalid");
      }
    }
  };
  _WpdForm.props = [
    "submit-label",
    "reset-label",
    "error",
    "busy",
    "columns",
    "min-column",
    "show-reset",
    "align"
  ];
  _WpdForm.styles = [wpdFormStyles];
  _WpdForm.help = {
    title: "Form",
    summary: "Container-query-driven responsive form. Auto-collects named fields, validates required, exposes setError / setFieldInvalid / setBusy / reset, fires wpd-form-submit with the collected values map.",
    status: "experimental",
    since: "0.8.1",
    props: [
      {
        name: "submit-label",
        type: "string",
        default: "Submit",
        description: "Label of the primary submit button."
      },
      {
        name: "reset-label",
        type: "string",
        default: "Reset",
        description: "Label of the reset button."
      },
      {
        name: "error",
        type: "string",
        description: "Top-of-form error banner. Show / hide via attribute OR setError(); equivalent."
      },
      {
        name: "busy",
        type: "boolean attribute",
        description: "Loading state — disables the form + flashes a spinner."
      },
      {
        name: "columns",
        type: '"auto" | "1" | "2" | "3"',
        default: "auto",
        description: 'Fixed column count, or "auto" for container-query 1↔2 (or up to 3 above 760px).'
      },
      {
        name: "show-reset",
        type: "boolean attribute",
        default: "true",
        description: 'Whether the reset button is rendered. Rendered by default; pass the literal `show-reset="false"` to hide it — omitting the attribute keeps it visible.'
      },
      {
        name: "align",
        type: '"end" | "start" | "stretch"',
        default: "end",
        description: "Footer button alignment."
      }
    ],
    slots: [
      { name: "(default)", description: "Form fields. `[name]` descendants are auto-collected." },
      { name: "header", description: "Heading / lede above the fields." },
      { name: "error", description: "Custom error UI; replaces the default banner when slotted." },
      { name: "footer-leading", description: "Extras left of the action buttons." },
      { name: "footer-trailing", description: "Extras right of the action buttons." }
    ],
    events: [
      {
        name: "wpd-form-submit",
        description: "Cancellable. Fires on submit after required-field validation passes.",
        detail: "{ values: Record<string, unknown>, form: WpdForm }"
      },
      {
        name: "wpd-form-reset",
        description: "Fires after fields have been restored to their initial values.",
        detail: "{ form: WpdForm }"
      },
      {
        name: "wpd-form-input",
        description: "Bubbles every keystroke / change inside any descendant field; useful for live validation.",
        detail: "{ name: string, value: unknown, form: WpdForm }"
      }
    ],
    example: html`
			<wpd-form submit-label="Add user">
				<wpd-text-field name="username" label="Username" required></wpd-text-field>
				<wpd-text-field name="email" type="email" label="Email" required></wpd-text-field>
				<wpd-text-field name="password" label="Password" full-width></wpd-text-field>
			</wpd-form>
		`
  };
  let WpdForm = _WpdForm;
  defineComponent("wpd-form", WpdForm);
  const textareaStyles = css`:host{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var( --desktop-mode-text,#1d2327 );min-width:0}:host( [ hidden ] ){display:none}.wpd-textarea__label{font-size:12px;color:var( --desktop-mode-muted,#646970 )}textarea{appearance:none;-webkit-appearance:none;display:block;width:100%;min-width:0;box-sizing:border-box;padding:8px 10px;background:var( --desktop-mode-window-bg,#fff );border:1px solid var( --desktop-mode-border,#dcdcde );border-radius:6px;font:inherit;font-size:13px;line-height:1.45;color:var( --desktop-mode-text,#1d2327 );resize:vertical;transition:border-color 0.12s ease,box-shadow 0.12s ease}textarea:hover{border-color:var( --desktop-mode-muted,#8c8f94 )}textarea:focus-visible{outline:none;border-color:var( --wp-admin-theme-color,#2271b1 );box-shadow:0 0 0 1px var( --wp-admin-theme-color,#2271b1 )}textarea:disabled{opacity:0.55;cursor:not-allowed;background:rgba( 0,0,0,0.03 )}textarea[ aria-invalid='true' ]{border-color:#d63638}textarea[ aria-invalid='true' ]:focus-visible{box-shadow:0 0 0 1px #d63638}:host( [ auto-grow ] ) textarea{resize:none;overflow:hidden}`;
  const _WpdTextarea = class _WpdTextarea extends Component {
    constructor() {
      super(...arguments);
      this._textareaEl = null;
    }
    connectedCallback() {
      super.connectedCallback();
      ensureAutoId(this);
    }
    render() {
      const label = this._attr("label") || "";
      const value = this._attr("value") ?? "";
      const placeholder = this._attr("placeholder") || "";
      const disabled = this._boolAttr("disabled");
      const readonly = this._boolAttr("readonly");
      const ariaLabel = this._attr("aria-label") || label;
      const name = this._attr("name") || "";
      const rows = Number(this._attr("rows")) || 3;
      const maxLength = this._attr("maxlength");
      const minLength = this._attr("minlength");
      const invalid = this._boolAttr("invalid");
      const hostId = this.id || "wpd-unnamed";
      const fieldId = `${hostId}__field`;
      return html`
			${label ? html`<label class="wpd-textarea__label" for=${fieldId}>${label}</label>` : html``}
			<textarea
				id=${fieldId}
				part="textarea"
				.value=${value}
				placeholder=${placeholder}
				?disabled=${disabled}
				?readonly=${readonly}
				rows=${rows}
				maxlength=${maxLength ?? ""}
				minlength=${minLength ?? ""}
				name=${name}
				aria-invalid=${invalid ? "true" : "false"}
				aria-label=${ariaLabel || ""}
				@input=${(e) => this._onInput(e)}
				@change=${(e) => this._onChange(e)}
				@keydown=${(e) => this._onKeyDown(e)}
			></textarea>
		`;
    }
    _attr(name) {
      return this.getAttribute(name);
    }
    _boolAttr(name) {
      return this.getAttribute(name) !== null;
    }
    _onInput(e) {
      const ta = e.target;
      this._textareaEl = ta;
      this.setAttribute("value", ta.value);
      this.emit("wpd-input-change", { value: ta.value });
      if (this._boolAttr("auto-grow")) {
        this._autosize(ta);
      }
    }
    _onChange(e) {
      const ta = e.target;
      this.emit("wpd-input-commit", { value: ta.value });
    }
    _onKeyDown(e) {
      if (!this._boolAttr("submit-on-enter")) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const ta = e.target;
        this.emit("wpd-submit", { value: ta.value });
      }
    }
    /**
     * Grow the textarea height to fit content, capped at `max-rows`.
     * Resets to scroll-height each input then clamps; cheap because
     * the browser caches layout.
     */
    _autosize(ta) {
      const maxRows = Number(this._attr("max-rows")) || 8;
      const cs = window.getComputedStyle(ta);
      const fontSize = parseFloat(cs.fontSize) || 13;
      const lineHeightRaw = cs.lineHeight;
      const lineHeight = lineHeightRaw === "normal" ? fontSize * 1.45 : parseFloat(lineHeightRaw) || fontSize * 1.45;
      const paddingTop = parseFloat(cs.paddingTop) || 0;
      const paddingBottom = parseFloat(cs.paddingBottom) || 0;
      const max = lineHeight * maxRows + paddingTop + paddingBottom;
      ta.style.height = "auto";
      const next = Math.min(ta.scrollHeight, max);
      ta.style.height = `${next}px`;
    }
    /** Public helper for callers that programmatically set `.value` and want autosize to re-run. */
    refreshAutosize() {
      if (this._textareaEl && this._boolAttr("auto-grow")) {
        this._autosize(this._textareaEl);
      }
    }
    /** Imperatively focus the underlying textarea. */
    focusInput() {
      const root = this.shadowRoot ?? this;
      const ta = root.querySelector("textarea");
      ta?.focus();
    }
    /** Imperatively clear the value. */
    clear() {
      this.setAttribute("value", "");
      const root = this.shadowRoot ?? this;
      const ta = root.querySelector("textarea");
      if (ta) {
        ta.value = "";
        if (this._boolAttr("auto-grow")) {
          this._autosize(ta);
        }
      }
    }
  };
  _WpdTextarea.props = [
    "label",
    "value",
    "placeholder",
    "disabled",
    "readonly",
    "ariaLabel",
    "name",
    "rows",
    "maxlength",
    "minlength",
    "invalid",
    "autoGrow",
    "maxRows",
    "submitOnEnter"
  ];
  _WpdTextarea.styles = [textareaStyles];
  _WpdTextarea.help = {
    title: "Textarea",
    summary: "Multi-line text input. Same event shape as wpd-text-field. Optional auto-grow up to max-rows; optional submit-on-enter (Enter sends, Shift+Enter newlines).",
    status: "stable",
    since: "0.6.0",
    props: [
      { name: "label", type: "string", description: "Visible label above the textarea." },
      { name: "value", type: "string", description: "Current value; reflected two-way." },
      { name: "placeholder", type: "string", description: "Native placeholder." },
      { name: "disabled", type: "boolean attribute" },
      { name: "readonly", type: "boolean attribute" },
      { name: "aria-label", type: "string", description: "Accessible label when no visible label is rendered." },
      { name: "name", type: "string", description: "Forwarded to native textarea for form submission." },
      { name: "rows", type: "integer (string)", default: "3", description: "Initial visible row count." },
      { name: "maxlength", type: "integer (string)" },
      { name: "minlength", type: "integer (string)" },
      { name: "invalid", type: "boolean attribute", description: "Sets aria-invalid + error styling." },
      { name: "auto-grow", type: "boolean attribute", description: "Grows up to max-rows as the user types." },
      { name: "max-rows", type: "integer (string)", default: "8" },
      {
        name: "submit-on-enter",
        type: "boolean attribute",
        description: "Enter fires wpd-submit; Shift+Enter inserts a newline."
      }
    ],
    events: [
      { name: "wpd-input-change", description: "Fires on every keystroke.", detail: "{ value: string }" },
      { name: "wpd-input-commit", description: "Fires on blur / native change.", detail: "{ value: string }" },
      {
        name: "wpd-submit",
        description: "Fires on Enter (without Shift) when submit-on-enter is set.",
        detail: "{ value: string }"
      }
    ],
    example: html`
			<wpd-textarea label="Message" rows="3" auto-grow max-rows="8" submit-on-enter></wpd-textarea>
		`
  };
  let WpdTextarea = _WpdTextarea;
  defineComponent("wpd-textarea", WpdTextarea);
  let _mountsPromise = null;
  function loadMounts() {
    if (!_mountsPromise) {
      _mountsPromise = Promise.resolve().then(() => userEditRender);
    }
    return _mountsPromise;
  }
  class WpdUserProfile extends HTMLElement {
    constructor() {
      super(...arguments);
      this._initialized = false;
      this._mountedFor = null;
    }
    static get observedAttributes() {
      return ["user-id"];
    }
    connectedCallback() {
      if (!this._initialized) {
        this._initialized = true;
        this._renderShell();
      }
      void this._mountIfNeeded();
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (name !== "user-id" || oldValue === newValue) {
        return;
      }
      if (this._initialized) {
        void this._mountIfNeeded();
      }
    }
    /**
     * Build the layout shell (sidebar + main column + activity
     * region). Same class names as the inline Profile tab in the
     * Users window so the existing posts-window.css rules style
     * both contexts identically.
     */
    _renderShell() {
      this.classList.add("desktop-mode-user-profile");
      this.innerHTML = `
			<div class="desktop-mode-users__edit-layout" data-wpd-user-profile-layout>
				<aside class="desktop-mode-users__edit-aside" data-wpd-user-profile-aside></aside>
				<main class="desktop-mode-users__edit-main">
					<div data-wpd-user-profile-form></div>
					<div class="desktop-mode-users__edit-activity" data-wpd-user-profile-activity></div>
				</main>
			</div>
		`;
    }
    async _mountIfNeeded() {
      const userIdAttr = this.getAttribute("user-id");
      const userId = userIdAttr ? parseInt(userIdAttr, 10) : 0;
      if (!Number.isFinite(userId) || userId <= 0) {
        return;
      }
      if (userId === this._mountedFor) {
        return;
      }
      this._mountedFor = userId;
      const formHost = this.querySelector(
        "[data-wpd-user-profile-form]"
      );
      const asideHost = this.querySelector(
        "[data-wpd-user-profile-aside]"
      );
      const activityHost = this.querySelector(
        "[data-wpd-user-profile-activity]"
      );
      if (!formHost || !asideHost || !activityHost) {
        return;
      }
      const mounts = await loadMounts();
      void mounts.mountProfileFormAt(formHost, userId);
      void mounts.mountProfileAsideAt(asideHost, userId, false);
      void mounts.mountProfileActivityAt(activityHost, userId, false);
    }
  }
  if (typeof customElements !== "undefined" && !customElements.get("wpd-user-profile")) {
    customElements.define("wpd-user-profile", WpdUserProfile);
  }
  const FALLBACK_BASE = "http://localhost/";
  function joinRestUrl(restRoot, path) {
    const base = typeof window !== "undefined" && window.location ? window.location.href : FALLBACK_BASE;
    const url = new URL(restRoot, base);
    const trimmed = path.replace(/^\/+/, "");
    const queryAt = trimmed.indexOf("?");
    const route = queryAt === -1 ? trimmed : trimmed.slice(0, queryAt);
    const extraQuery = queryAt === -1 ? "" : trimmed.slice(queryAt + 1);
    if (url.searchParams.has("rest_route")) {
      const existing = url.searchParams.get("rest_route") ?? "/";
      const prefix = existing.endsWith("/") ? existing : existing + "/";
      url.searchParams.set("rest_route", prefix + route);
    } else {
      const pathname = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
      url.pathname = pathname + route;
    }
    if (extraQuery) {
      const extras = new URLSearchParams(extraQuery);
      extras.forEach((value, key) => {
        url.searchParams.append(key, value);
      });
    }
    return url.toString();
  }
  function broadcastTermChange(taxonomy, action, id) {
    const api = window.wp?.desktop;
    if (api && typeof api.broadcast === "function") {
      api.broadcast("desktop-mode.term.changed", {
        source: "posts-window",
        taxonomy,
        action,
        id
      });
    }
  }
  function createPostsWindowClient(windowId) {
    const getConfig = () => {
      const store = window.desktopModeWindowConfig;
      const cfg = store ? store[windowId] : void 0;
      if (!cfg) {
        throw new Error(
          `[${windowId}] config blob is missing — was the window opened without registration? See the matching \`desktop_mode_register_window()\` call in \`includes/{posts,pages}-window/window.php\`.`
        );
      }
      return cfg;
    };
    const shellFetch = (input, init) => {
      return trackedFetch(input, init, { windowId });
    };
    const request = async (url, init = {}) => {
      const cfg = getConfig();
      const response = await shellFetch(url, {
        ...init,
        credentials: "same-origin",
        headers: {
          "X-WP-Nonce": cfg.restNonce,
          Accept: "application/json",
          ...init.body ? { "Content-Type": "application/json" } : {},
          ...init.headers ?? {}
        }
      });
      if (!response.ok) {
        let message = `${response.status} ${response.statusText}`;
        try {
          const json = await response.json();
          if (json && typeof json.message === "string") {
            message = json.message;
          }
        } catch {
        }
        throw new Error(message);
      }
      const data = init.expectJson === false ? null : await response.json();
      return { data, headers: response.headers };
    };
    const fetchPosts = async (params = {}) => {
      const cfg = getConfig();
      const url = new URL(cfg.postsUrl);
      for (const [key, value] of Object.entries(cfg.queryArgs ?? {})) {
        if (typeof value === "string" && value !== "") {
          url.searchParams.set(key, value);
        }
      }
      if (params.page) {
        url.searchParams.set("page", String(params.page));
      }
      if (params.perPage) {
        url.searchParams.set("per_page", String(params.perPage));
      }
      if (params.search) {
        url.searchParams.set("search", params.search);
      }
      if (params.status) {
        url.searchParams.set("status", params.status);
      } else {
        url.searchParams.set("status", "any");
      }
      if (params.orderby) {
        url.searchParams.set("orderby", params.orderby);
      }
      if (params.order) {
        url.searchParams.set("order", params.order);
      }
      const appendIds = (key, v) => {
        const list = Array.isArray(v) ? v : [v];
        for (const id of list) {
          if (Number.isFinite(id) && id > 0) {
            url.searchParams.append(`${key}[]`, String(id));
          }
        }
      };
      if (params.author) {
        appendIds("author", params.author);
      }
      if (params.tag) {
        appendIds("tags", params.tag);
      }
      const { data, headers } = await request(
        url.toString(),
        { method: "GET" }
      );
      return {
        items: Array.isArray(data) ? data : [],
        total: parseInt(headers.get("X-WP-Total") ?? "0", 10) || 0,
        totalPages: parseInt(headers.get("X-WP-TotalPages") ?? "0", 10) || 0
      };
    };
    const trashPost = async (id) => {
      const cfg = getConfig();
      try {
        await request(`${cfg.postsUrl}/${id}`, {
          method: "DELETE"
        });
        return { id, ok: true };
      } catch (err) {
        return {
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    };
    const buildEditPostUrl = (id) => {
      const cfg = getConfig();
      const sep = cfg.editPostUrlBase.includes("?") ? "&" : "?";
      return `${cfg.editPostUrlBase}${sep}post=${id}&action=edit`;
    };
    const searchTags = async (query, signal) => {
      const cfg = getConfig();
      const url = new URL(joinRestUrl(cfg.restRoot, "wp/v2/tags"));
      url.searchParams.set("per_page", "20");
      url.searchParams.set("_fields", "id,name,slug,count");
      url.searchParams.set("orderby", "count");
      url.searchParams.set("order", "desc");
      if (query) {
        url.searchParams.set("search", query);
        url.searchParams.set("orderby", "name");
        url.searchParams.set("order", "asc");
      }
      const { data } = await request(url.toString(), {
        method: "GET",
        signal
      });
      return Array.isArray(data) ? data : [];
    };
    const createTag = async (name) => {
      const cfg = getConfig();
      const url = joinRestUrl(cfg.restRoot, "wp/v2/tags");
      try {
        const { data } = await request(url, {
          method: "POST",
          body: JSON.stringify({ name })
        });
        broadcastTermChange("post_tag", "created", data.id);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/term[\s_]?exists/i.test(message)) {
          const matches = await searchTags(name);
          const exact = matches.find(
            (t) => t.name.toLowerCase() === name.toLowerCase()
          );
          if (exact) {
            return exact;
          }
        }
        throw err;
      }
    };
    const updatePostTags = async (postId, tagIds) => {
      const cfg = getConfig();
      const url = `${cfg.postsUrl}/${postId}`;
      const { data } = await request(url, {
        method: "POST",
        body: JSON.stringify({ tags: tagIds })
      });
      return data;
    };
    const fetchAllCategories = async (signal) => {
      const cfg = getConfig();
      const url = new URL(joinRestUrl(cfg.restRoot, "wp/v2/categories"));
      url.searchParams.set("per_page", "100");
      url.searchParams.set("_fields", "id,name,slug,parent");
      url.searchParams.set("orderby", "name");
      url.searchParams.set("order", "asc");
      const { data } = await request(url.toString(), {
        method: "GET",
        signal
      });
      return Array.isArray(data) ? data : [];
    };
    const fetchAuthorOptions = async (signal) => {
      const cfg = getConfig();
      const url = new URL(joinRestUrl(cfg.restRoot, "wp/v2/users"));
      url.searchParams.set("per_page", "100");
      url.searchParams.set("who", "authors");
      url.searchParams.set("_fields", "id,name");
      url.searchParams.set("orderby", "name");
      url.searchParams.set("order", "asc");
      try {
        const { data } = await request(url.toString(), {
          method: "GET",
          signal
        });
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    };
    const fetchTagOptions = async (page = 1, perPage = 50, signal) => {
      const cfg = getConfig();
      const url = new URL(joinRestUrl(cfg.restRoot, "wp/v2/tags"));
      url.searchParams.set("per_page", String(Math.max(1, perPage)));
      url.searchParams.set("page", String(Math.max(1, page)));
      url.searchParams.set("_fields", "id,name,count");
      url.searchParams.set("orderby", "count");
      url.searchParams.set("order", "desc");
      try {
        const { data, headers } = await request(
          url.toString(),
          { method: "GET", signal }
        );
        return {
          items: Array.isArray(data) ? data : [],
          totalPages: parseInt(headers.get("X-WP-TotalPages") ?? "0", 10) || 0
        };
      } catch {
        return { items: [], totalPages: 0 };
      }
    };
    const createCategory = async (name, parent = 0, opts = {}) => {
      const cfg = getConfig();
      const url = joinRestUrl(cfg.restRoot, "wp/v2/categories");
      const body = { name, parent };
      if (opts.slug) {
        body.slug = opts.slug;
      }
      if (opts.description) {
        body.description = opts.description;
      }
      try {
        const { data } = await request(url, {
          method: "POST",
          body: JSON.stringify(body)
        });
        broadcastTermChange("category", "created", data.id);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/term[\s_]?exists/i.test(message)) {
          const matches = await fetchAllCategories();
          const exact = matches.find(
            (t) => t.name.toLowerCase() === name.toLowerCase() && t.parent === parent
          );
          if (exact) {
            return exact;
          }
        }
        throw err;
      }
    };
    const updatePostCategories = async (postId, categoryIds) => {
      const cfg = getConfig();
      const url = `${cfg.postsUrl}/${postId}`;
      const { data } = await request(
        url,
        {
          method: "POST",
          body: JSON.stringify({ categories: categoryIds })
        }
      );
      return data;
    };
    const fetchTerms = async (taxonomy, params = {}) => {
      const cfg = getConfig();
      const url = new URL(joinRestUrl(cfg.restRoot, `wp/v2/${taxonomy}`));
      url.searchParams.set("per_page", String(params.perPage ?? 50));
      url.searchParams.set("page", String(params.page ?? 1));
      url.searchParams.set(
        "_fields",
        "id,name,slug,parent,count,description,desktop_mode_count,desktop_mode_is_default"
      );
      url.searchParams.set("orderby", params.orderby ?? "name");
      url.searchParams.set("order", params.order ?? "asc");
      if (params.search) {
        url.searchParams.set("search", params.search);
      }
      if (typeof params.parent === "number" && params.parent >= 0) {
        url.searchParams.set("parent", String(params.parent));
      }
      const { data, headers } = await request(
        url.toString(),
        { method: "GET" }
      );
      const items = Array.isArray(data) ? data.map((t) => {
        const anyCount = t.desktop_mode_count;
        const isDefault = t.desktop_mode_is_default === true;
        return {
          id: t.id ?? 0,
          name: t.name ?? "",
          slug: t.slug ?? "",
          parent: t.parent ?? 0,
          count: typeof anyCount === "number" ? anyCount : t.count ?? 0,
          description: t.description ?? "",
          isDefault
        };
      }) : [];
      return {
        items,
        total: parseInt(headers.get("X-WP-Total") ?? "0", 10) || 0,
        totalPages: parseInt(headers.get("X-WP-TotalPages") ?? "0", 10) || 0
      };
    };
    const fetchTagCooccurrence = async (taxonomy = "tags", limit = 8) => {
      const cfg = getConfig();
      const url = new URL(
        joinRestUrl(
          cfg.restRoot,
          "desktop-mode/v1/tag-cooccurrence"
        )
      );
      url.searchParams.set(
        "taxonomy",
        taxonomy === "tags" ? "post_tag" : "category"
      );
      url.searchParams.set("limit", String(limit));
      const { data } = await request(url.toString(), { method: "GET" });
      const out = /* @__PURE__ */ new Map();
      const pairs = data && typeof data === "object" && !Array.isArray(data) ? data.pairs : void 0;
      if (!pairs) {
        return out;
      }
      for (const [key, neighbors] of Object.entries(pairs)) {
        const id = parseInt(key, 10);
        if (!Number.isFinite(id) || id <= 0) {
          continue;
        }
        const clean = [];
        for (const raw of neighbors) {
          const nid = Number(raw?.id);
          const sh = Number(raw?.shared);
          if (Number.isFinite(nid) && nid > 0 && Number.isFinite(sh) && sh > 0) {
            clean.push({ id: nid, shared: sh });
          }
        }
        if (clean.length > 0) {
          out.set(id, clean);
        }
      }
      return out;
    };
    const updateTerm = async (taxonomy, id, patch) => {
      const cfg = getConfig();
      const url = joinRestUrl(cfg.restRoot, `wp/v2/${taxonomy}/${id}`);
      const { data } = await request(url, {
        method: "POST",
        body: JSON.stringify(patch)
      });
      broadcastTermChange(
        taxonomy === "categories" ? "category" : "post_tag",
        "updated",
        id
      );
      return {
        id: data.id ?? id,
        name: data.name ?? "",
        slug: data.slug ?? "",
        parent: data.parent ?? 0,
        count: data.count ?? 0,
        description: data.description ?? "",
        isDefault: data.isDefault ?? false
      };
    };
    const deleteTerm = async (taxonomy, id) => {
      const cfg = getConfig();
      const url = new URL(
        joinRestUrl(cfg.restRoot, `wp/v2/${taxonomy}/${id}`)
      );
      url.searchParams.set("force", "true");
      await request(url.toString(), { method: "DELETE" });
      broadcastTermChange(
        taxonomy === "categories" ? "category" : "post_tag",
        "deleted",
        id
      );
    };
    return {
      windowId,
      getConfig,
      fetchPosts,
      trashPost,
      buildEditPostUrl,
      searchTags,
      createTag,
      updatePostTags,
      fetchAllCategories,
      fetchAuthorOptions,
      fetchTagOptions,
      createCategory,
      updatePostCategories,
      fetchTerms,
      fetchTagCooccurrence,
      updateTerm,
      deleteTerm
    };
  }
  function createUsersWindowClient(windowId = "desktop-mode-users") {
    const getConfig = () => {
      const store = window.desktopModeWindowConfig;
      const cfg = store?.[windowId];
      if (!cfg) {
        throw new Error(
          `[${windowId}] config blob is missing — was the window opened without registration? See \`includes/users-window/window.php\`.`
        );
      }
      return cfg;
    };
    const shellFetch = (input, init, options) => {
      return trackedFetch(input, init, {
        windowId,
        source: options?.source ?? "users-window/rest",
        silent: options?.silent
      });
    };
    const fetchUsers = async (params) => {
      const cfg = getConfig();
      const baseUrl = cfg.usersUrl || cfg.postsUrl;
      const url = new URL(baseUrl);
      for (const [key, value] of Object.entries(cfg.queryArgs ?? {})) {
        if (typeof value === "string" && value !== "") {
          url.searchParams.set(key, value);
        }
      }
      url.searchParams.set("page", String(Math.max(1, params.page)));
      url.searchParams.set(
        "per_page",
        String(Math.max(1, params.perPage))
      );
      if (params.search) {
        url.searchParams.set("search", params.search);
      }
      if (params.roles && params.roles.length > 0) {
        for (const r of params.roles) {
          url.searchParams.append("roles", r);
        }
      }
      if (params.orderby) {
        url.searchParams.set("orderby", params.orderby);
      }
      if (params.order) {
        url.searchParams.set("order", params.order);
      }
      const res = await shellFetch(
        url.toString(),
        {
          method: "GET",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "X-WP-Nonce": cfg.restNonce
          }
        },
        { source: "users-window/list" }
      );
      if (!res.ok) {
        throw new Error(
          `[users-window] list fetch failed: ${res.status}`
        );
      }
      const items = await res.json();
      const total = parseInt(res.headers.get("X-WP-Total") ?? "0", 10);
      const totalPages = parseInt(
        res.headers.get("X-WP-TotalPages") ?? "0",
        10
      );
      return { items, total, totalPages };
    };
    const fetchOneUser = async (id) => {
      const cfg = getConfig();
      const baseUrl = cfg.usersUrl || cfg.postsUrl;
      const url = new URL(`${baseUrl.replace(/\/$/, "")}/${id}`);
      for (const [key, value] of Object.entries(cfg.queryArgs ?? {})) {
        if (typeof value === "string" && value !== "") {
          url.searchParams.set(key, value);
        }
      }
      const res = await shellFetch(
        url.toString(),
        {
          method: "GET",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "X-WP-Nonce": cfg.restNonce
          }
        },
        { source: "users-window/one", silent: true }
      );
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        throw new Error(
          `[users-window] one fetch failed: ${res.status}`
        );
      }
      return await res.json();
    };
    const bulkSetRole = async (ids, role) => {
      const cfg = getConfig();
      const url = cfg.bulkRoleUrl ?? joinRestUrl(cfg.restRoot, "desktop-mode/v1/users/bulk-role");
      const res = await shellFetch(
        url,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.restNonce
          },
          body: JSON.stringify({ ids, role })
        },
        { source: "users-window/bulk-role" }
      );
      if (!res.ok) {
        throw new Error(
          `[users-window] bulk-role failed: ${res.status}`
        );
      }
      return await res.json();
    };
    const sendPasswordReset = async (id) => {
      const cfg = getConfig();
      const base = cfg.sendResetUrlBase ?? joinRestUrl(cfg.restRoot, "desktop-mode/v1/users/");
      const res = await shellFetch(
        joinRestUrl(base, `${id}/send-password-reset`),
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.restNonce
          }
        },
        { source: "users-window/send-password-reset" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          ok: false,
          error: typeof body.code === "string" ? body.code : `http_${res.status}`
        };
      }
      const data = await res.json();
      return { ok: data.ok === true, email: data.email };
    };
    const resendWelcome = async (id) => {
      const cfg = getConfig();
      const base = cfg.sendResetUrlBase ?? joinRestUrl(cfg.restRoot, "desktop-mode/v1/users/");
      const res = await shellFetch(
        joinRestUrl(base, `${id}/resend-welcome`),
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.restNonce
          }
        },
        { source: "users-window/resend-welcome" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          ok: false,
          error: typeof body.code === "string" ? body.code : `http_${res.status}`
        };
      }
      const data = await res.json();
      return { ok: data.ok === true, email: data.email };
    };
    const createUser = async (body) => {
      const cfg = getConfig();
      const url = cfg.createUserUrl ?? joinRestUrl(cfg.restRoot, "desktop-mode/v1/users");
      const res = await shellFetch(
        url,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.restNonce
          },
          body: JSON.stringify(body)
        },
        { source: "users-window/create" }
      );
      if (!res.ok) {
        const data2 = await res.json().catch(() => ({}));
        const code = data2.code;
        const message = data2.message;
        return {
          ok: false,
          error: typeof code === "string" ? code : `http_${res.status}`,
          message: typeof message === "string" ? message : void 0
        };
      }
      const data = await res.json();
      return {
        ok: data.ok === true,
        user_id: data.user_id,
        email: data.email
      };
    };
    const bulkDeleteUsers = async (ids, reassign) => {
      const cfg = getConfig();
      const url = cfg.bulkDeleteUrl ?? joinRestUrl(cfg.restRoot, "desktop-mode/v1/users/bulk-delete");
      const body = { ids };
      if (typeof reassign === "number" && reassign > 0) {
        body.reassign = reassign;
      }
      const res = await shellFetch(
        url,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.restNonce
          },
          body: JSON.stringify(body)
        },
        { source: "users-window/bulk-delete" }
      );
      if (!res.ok) {
        throw new Error(
          `[users-window] bulk-delete failed: ${res.status}`
        );
      }
      return await res.json();
    };
    return {
      windowId,
      getConfig,
      fetchUsers,
      fetchOneUser,
      bulkSetRole,
      sendPasswordReset,
      resendWelcome,
      createUser,
      bulkDeleteUsers
    };
  }
  const styles$2 = css`:host{display:inline-flex}:host( [ fill-cell ] ){display:flex;width:100%}button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:var( --wpd-button-padding,6px 12px );border-radius:var( --wpd-button-border-radius,6px );font:inherit;font-weight:500;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease;background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid var( --desktop-mode-border,#c3c4c7 ) )}:host( [ fill-cell ] ) button{width:100%;min-height:var( --wpd-button-min-height,44px )}button:disabled{opacity:0.5;cursor:not-allowed}button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.04 ) )}:host( [ variant='primary' ] ) button{background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) );color:var( --wpd-button-fg,#fff );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='primary' ] ) button:hover:not(:disabled ){filter:brightness( 1.06 );background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ variant='secondary' ] ) button{background:var( --wpd-button-bg,rgba( 0,0,0,0.06 ) );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='secondary' ] ) button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.1 ) )}:host( [ variant='danger' ] ) button{background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,#d63638 );border:var( --wpd-button-border,1px solid currentColor )}:host( [ variant='danger' ] ) button:hover:not(:disabled ){background:#d63638;color:#fff}:host( [ variant='link' ] ) button{background:transparent;color:var( --wpd-button-fg,var( --wp-admin-theme-color,#2271b1 ) );border:0;padding:0;text-decoration:underline}:host( [ busy ] ) button{pointer-events:none;opacity:0.75}.wpd-button__spinner{box-sizing:border-box;display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:wpd-button-spin 0.6s linear infinite;flex-shrink:0}@keyframes wpd-button-spin{to{transform:rotate( 360deg )}}`;
  const _WpdButton = class _WpdButton extends Component {
    render() {
      const disabled = this.disabled !== null;
      const busy = this.busy !== null;
      const type = this.type || "button";
      return html`
			<button
				part="button"
				type=${type}
				?disabled=${disabled || busy}
				aria-busy=${busy ? "true" : "false"}
			>
				${busy ? html`<span class="wpd-button__spinner" aria-hidden="true"></span>` : ""}
				<slot></slot>
			</button>
		`;
    }
  };
  _WpdButton.props = ["variant", "disabled", "type", "busy", "fill-cell"];
  _WpdButton.styles = [styles$2];
  _WpdButton.help = {
    title: "Button",
    summary: "Thin wrapper around <button> with consistent variant styling and a slot for the label.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "variant",
        type: "'primary' | 'secondary' | 'ghost' | 'danger' | 'link'",
        default: "ghost",
        description: "Visual weight of the button. Use primary for the single attention-grabbing action per surface."
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "Disable pointer + keyboard interaction and dim the chrome."
      },
      {
        name: "type",
        type: "'button' | 'submit' | 'reset'",
        default: "button",
        description: "Forwarded to the underlying native <button>."
      },
      {
        name: "busy",
        type: "boolean attribute",
        description: "Marks the button as in-progress (e.g., awaiting a fetch)."
      },
      {
        name: "fill-cell",
        type: "boolean attribute",
        description: "Grow to fill the parent flex/grid cell. Useful for tiled keypads."
      }
    ],
    slots: [{ name: "(default)", description: "Button label." }],
    parts: [{ name: "button", description: "Underlying <button> element." }],
    cssProps: [
      { name: "--wpd-button-bg", description: "Background color." },
      {
        name: "--wpd-button-bg-hover",
        description: "Hover wash (ghost + secondary variants)."
      },
      { name: "--wpd-button-fg", description: "Text color." },
      { name: "--wpd-button-border", description: "Border shorthand." },
      { name: "--wpd-button-border-radius", default: "6px" },
      { name: "--wpd-button-padding", default: "6px 12px" },
      {
        name: "--wpd-button-min-height",
        description: "Minimum height when fill-cell is set."
      }
    ],
    example: html`
			<wpd-cluster gap="8">
				<wpd-button variant="primary">Primary</wpd-button>
				<wpd-button variant="secondary">Secondary</wpd-button>
				<wpd-button variant="ghost">Ghost</wpd-button>
				<wpd-button variant="danger">Danger</wpd-button>
				<wpd-button variant="link">Link</wpd-button>
			</wpd-cluster>
		`
  };
  let WpdButton = _WpdButton;
  defineComponent("wpd-button", WpdButton);
  const segmentedStyles = css`:host{display:inline-flex;padding:3px;background:var( --wpd-segmented-bg,rgba( 0,0,0,0.05 ) );border-radius:7px;gap:2px}`;
  const segmentStyles = css`:host{flex:1 1 auto;min-width:0}button{appearance:none;display:block;width:100%;padding:8px 12px;background:transparent;border:0;font:inherit;font-size:13px;color:var( --desktop-mode-muted,#646970 );cursor:pointer;border-radius:5px;transition:background-color 0.12s ease,color 0.12s ease;white-space:nowrap}:host( [ aria-checked='true' ] ) button{background:var( --desktop-mode-window-bg,#fff );color:var( --desktop-mode-text,#1d2327 );box-shadow:0 1px 3px rgba( 0,0,0,0.12 );font-weight:500}`;
  const _WpdSegment = class _WpdSegment extends Component {
    render() {
      this.setAttribute("role", "radio");
      return html`
			<button type="button" @click=${() => this._onPick()}>
				<slot></slot>
			</button>
		`;
    }
    _onPick() {
      this.emit("wpd-segment-pick", {
        value: this.value
      });
    }
  };
  _WpdSegment.props = ["value"];
  _WpdSegment.styles = [segmentStyles];
  _WpdSegment.help = {
    title: "Segment",
    summary: "Single pill inside a <wpd-segmented> group. Value identifies it for selection; aria-checked is mirrored by the parent.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "value",
        type: "string",
        description: "Identifier this segment contributes to the parent group selection."
      }
    ],
    slots: [
      { name: "(default)", description: "Visible segment label." }
    ],
    events: [
      {
        name: "wpd-segment-pick",
        description: "Internal event bubbled to the parent <wpd-segmented>. Consumers should listen for wpd-pick on the group instead.",
        detail: "{ value: string }"
      }
    ]
  };
  let WpdSegment = _WpdSegment;
  defineComponent("wpd-segment", WpdSegment);
  const _WpdSegmented = class _WpdSegmented extends Component {
    connectedCallback() {
      super.connectedCallback();
      this.addEventListener("wpd-segment-pick", (e) => {
        const detail = e.detail;
        e.stopPropagation();
        this.value = detail.value;
        this.emit("wpd-pick", { value: detail.value });
      });
    }
    /**
     * Declarative item-list setter. Replaces the existing
     * `<wpd-segment>` children with a fresh set built from a
     * `{ value, label }` array; preserves the current selection
     * when the value still matches an entry, otherwise falls back
     * to the first item.
     *
     * Collapses the pre-0.11 imperative dance (clear children,
     * `createElement`, set `textContent`, `appendChild`, then
     * `setAttribute('value', …)` on the group — order matters) to
     * a single assignment:
     *
     * ```js
     * segmented.items = [
     *   { value: 'm',  label: 'm' },
     *   { value: 'km', label: 'km' },
     * ];
     * ```
     *
     * @since 0.5.0
     */
    set items(list) {
      const existing = this.querySelectorAll(":scope > wpd-segment");
      for (const el of Array.from(existing)) {
        el.remove();
      }
      for (const item of list) {
        const seg = document.createElement("wpd-segment");
        seg.setAttribute("value", item.value);
        seg.textContent = item.label;
        this.appendChild(seg);
      }
      const current = this.value;
      const stillValid = current !== null && list.some((i) => i.value === current);
      if (!stillValid && list.length > 0) {
        this.value = list[0].value;
      } else {
        this.requestUpdate();
      }
    }
    render() {
      const label = this.label || "";
      if (label) {
        this.setAttribute("aria-label", label);
      }
      this.setAttribute("role", "radiogroup");
      const current = this.value;
      queueMicrotask(() => {
        const segs = this.querySelectorAll("wpd-segment");
        for (const seg of Array.from(segs)) {
          const v = seg.getAttribute("value");
          seg.setAttribute(
            "aria-checked",
            v === current ? "true" : "false"
          );
        }
      });
      return html`<slot></slot>`;
    }
  };
  _WpdSegmented.props = ["value", "label"];
  _WpdSegmented.styles = [segmentedStyles];
  _WpdSegmented.help = {
    title: "Segmented",
    summary: "iOS-style segmented radio group. Pill-shaped bar of equal-width <wpd-segment> children where exactly one is active.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "value",
        type: "string",
        description: "Currently selected segment value. Mirrored onto child aria-checked."
      },
      {
        name: "label",
        type: "string",
        description: "aria-label for the radiogroup."
      }
    ],
    slots: [
      { name: "(default)", description: '<wpd-segment value="…"> children.' }
    ],
    events: [
      {
        name: "wpd-pick",
        description: "Fires when the selected segment changes.",
        detail: "{ value: string }"
      }
    ],
    cssProps: [
      { name: "--desktop-mode-window-bg", description: "Pill background." },
      { name: "--desktop-mode-text", description: "Active label colour." },
      { name: "--desktop-mode-muted", description: "Inactive label colour." }
    ],
    example: html`
			<wpd-segmented value="md" label="Dock size">
				<wpd-segment value="sm">Small</wpd-segment>
				<wpd-segment value="md">Medium</wpd-segment>
				<wpd-segment value="lg">Large</wpd-segment>
			</wpd-segmented>
		`
  };
  let WpdSegmented = _WpdSegmented;
  defineComponent("wpd-segmented", WpdSegmented);
  const menuStyles = css`:host{display:block;min-width:220px;padding:4px;background:var( --desktop-mode-window-bg,#fff );color:var( --desktop-mode-text,#1d2327 );border:1px solid var( --desktop-mode-window-border,#c3c4c7 );border-radius:8px;box-shadow:0 8px 24px rgba( 0,0,0,0.18 ),0 2px 6px rgba( 0,0,0,0.08 )}:host( [ hidden ] ){display:none}`;
  const menuItemStyles = css`:host{display:block}button{display:flex;align-items:center;gap:10px;width:100%;min-height:32px;padding:6px 10px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:1.3;text-align:start;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease}button:hover,button:focus-visible{background:rgba( 0,0,0,0.06 );color:#000;outline:none}button:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-2px}.wpd-menu-item__icon{flex-shrink:0;width:18px;height:18px;font-size:18px;line-height:1;color:var( --wp-admin-theme-color,#2271b1 )}.wpd-menu-item__icon[ hidden ]{display:none}.wpd-menu-item__label{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wpd-menu-item__check{flex-shrink:0;width:16px;height:16px;border-radius:3px;border:1.5px solid rgba( 0,0,0,0.25 );position:relative;background:transparent;transition:background-color 0.12s ease,border-color 0.12s ease}.wpd-menu-item__check[ hidden ]{display:none}:host( [ checked ] ) .wpd-menu-item__check{background:var( --wp-admin-theme-color,#2271b1 );border-color:var( --wp-admin-theme-color,#2271b1 )}:host( [ checked ] ) .wpd-menu-item__check::after{content:'';position:absolute;top:1px;left:4px;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate( 45deg )}`;
  const _WpdMenu = class _WpdMenu extends Component {
    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("role", "menu");
    }
    render() {
      return html`<slot></slot>`;
    }
  };
  _WpdMenu.styles = [menuStyles];
  _WpdMenu.help = {
    title: "Menu",
    summary: "Popover menu used in window title bars and other overflow triggers. Presentation-only: the consumer owns open/close state via the `hidden` attribute and any outside-click dismissal.",
    status: "stable",
    since: "0.9.0",
    slots: [
      { name: "(default)", description: "<wpd-menu-item> children." }
    ],
    cssProps: [
      { name: "--desktop-mode-window-bg", description: "Menu background." },
      { name: "--desktop-mode-window-border", description: "Menu border." },
      { name: "--desktop-mode-text", description: "Item text colour." }
    ],
    example: html`
			<wpd-menu>
				<wpd-menu-item value="new" icon="dashicons-plus">Open another window</wpd-menu-item>
				<wpd-menu-item value="startup" role="menuitemcheckbox" checked>Open on startup</wpd-menu-item>
				<wpd-menu-item value="close">Close window</wpd-menu-item>
			</wpd-menu>
		`
  };
  let WpdMenu = _WpdMenu;
  defineComponent("wpd-menu", WpdMenu);
  const _WpdMenuItem = class _WpdMenuItem extends Component {
    connectedCallback() {
      super.connectedCallback();
      if (!this.hasAttribute("role")) {
        this.setAttribute("role", "menuitem");
      }
    }
    render() {
      const icon = this.icon || "";
      const isCheckbox = this.getAttribute("role") === "menuitemcheckbox";
      const checked = this.checked !== null;
      if (isCheckbox) {
        this.setAttribute("aria-checked", checked ? "true" : "false");
      }
      return html`
			<button type="button" @click=${(e) => this._onPick(e)}>
				<span
					class="wpd-menu-item__check"
					?hidden=${!isCheckbox}
				></span>
				<span
					class="wpd-menu-item__icon dashicons ${icon}"
					aria-hidden="true"
					?hidden=${isCheckbox || !icon}
				></span>
				<span class="wpd-menu-item__label">
					<slot></slot>
				</span>
			</button>
		`;
    }
    _onPick(e) {
      e.preventDefault();
      this.emit("wpd-menu-item-click", {
        value: this.value
      });
    }
  };
  _WpdMenuItem.props = ["icon", "value", "checked"];
  _WpdMenuItem.styles = [menuItemStyles];
  _WpdMenuItem.help = {
    title: "Menu item",
    summary: 'Single row inside a <wpd-menu>. Supports three looks: plain label, left-aligned dashicon (icon="dashicons-…"), or a checkbox indicator (role="menuitemcheckbox" + checked).',
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "icon",
        type: "string (dashicons class)",
        description: 'Dashicons class rendered on the left. Ignored when role="menuitemcheckbox".'
      },
      {
        name: "value",
        type: "string",
        description: "Identifier emitted in wpd-menu-item-click.detail.value."
      },
      {
        name: "checked",
        type: "boolean attribute",
        description: 'Visible check indicator. Only honoured when role="menuitemcheckbox".'
      }
    ],
    slots: [
      { name: "(default)", description: "Menu item label." }
    ],
    events: [
      {
        name: "wpd-menu-item-click",
        description: "Fires when the item is clicked; bubbles so the <wpd-menu> parent can delegate.",
        detail: "{ value: string | null }"
      }
    ]
  };
  let WpdMenuItem = _WpdMenuItem;
  defineComponent("wpd-menu-item", WpdMenuItem);
  function wpdConfirmGlobal$1(options) {
    const fn = window.wp?.desktop?.confirm;
    if (typeof fn !== "function") {
      return Promise.reject(
        new Error(
          "[desktop-mode] wp.desktop.confirm is missing — the main desktop bundle must load before the posts-window script."
        )
      );
    }
    return fn(options);
  }
  const _introShown = /* @__PURE__ */ Object.create(null);
  document.addEventListener("desktop-mode-intros-reset", () => {
    for (const slug of Object.keys(_introShown)) {
      _introShown[slug] = false;
    }
  });
  function maybeShowIntro(client) {
    let cfg;
    try {
      cfg = client.getConfig();
    } catch {
      return;
    }
    const slug = cfg.introSlug || cfg.mode || "posts";
    if (_introShown[slug]) {
      return;
    }
    if (cfg.introSeen) {
      return;
    }
    _introShown[slug] = true;
    const dialogPromise = slug === "pages" ? Promise.resolve().then(() => pagesIntroDialog).then(
      (m) => m.showPagesIntroDialog()
    ) : showPostsIntroDialog();
    void dialogPromise.then((result) => {
      if (result === "cancel") {
        _introShown[slug] = false;
        return;
      }
      void markIntroSeen(cfg, slug, client);
      if (result === "settings") {
        openOsSettingsFeatures();
      }
    }).catch(() => {
      _introShown[slug] = false;
    });
  }
  async function markIntroSeen(cfg, slug, client) {
    if (!cfg.introUrl) {
      return;
    }
    try {
      await trackedFetch(
        cfg.introUrl,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.restNonce
          },
          body: JSON.stringify({ slug })
        },
        {
          windowId: client.windowId,
          source: `${slug}-window/intro`
        }
      );
      cfg.introSeen = true;
    } catch {
    }
  }
  function openOsSettingsFeatures() {
    const api = window.wp?.desktop;
    api?.openOsSettings?.();
  }
  const ROOT$1 = "[data-desktop-mode-posts-root]";
  const STATUS$1 = "[data-desktop-mode-posts-status]";
  const SEARCH$1 = "[data-desktop-mode-posts-search]";
  const REFRESH$1 = "[data-desktop-mode-posts-refresh]";
  const NEW_BTN$1 = "[data-desktop-mode-posts-new]";
  const TABLE$1 = "[data-desktop-mode-posts-table]";
  const BULK$1 = "[data-desktop-mode-posts-bulk]";
  const COUNT$1 = "[data-desktop-mode-posts-count]";
  const PAGE_INDICATOR$1 = "[data-desktop-mode-posts-page-indicator]";
  const PREV$1 = "[data-desktop-mode-posts-prev]";
  const NEXT$1 = "[data-desktop-mode-posts-next]";
  const PER_PAGE$1 = "[data-desktop-mode-posts-per-page]";
  const TOOLBAR_TRAILING_EXTRAS = "[data-desktop-mode-posts-toolbar-extras]";
  const BULK_ACTIONS_HOST$1 = "[data-desktop-mode-posts-bulk-actions]";
  const HOOK_FILTER_COLUMNS = "desktop_mode.postsWindow.columns";
  const HOOK_FILTER_STATUS_SEGMENTS = "desktop_mode.postsWindow.statusSegments";
  const HOOK_FILTER_BULK_ACTIONS = "desktop_mode.postsWindow.bulkActions";
  const HOOK_FILTER_TOOLBAR_TRAILING = "desktop_mode.postsWindow.toolbarTrailing";
  const HOOK_ACTION_OPENED = "desktop_mode.postsWindow.opened";
  const HOOK_ACTION_DATA_LOADED = "desktop_mode.postsWindow.dataLoaded";
  const SEARCH_DEBOUNCE_MS$1 = 250;
  const STATUS_LABELS = {
    publish: __("Published"),
    future: __("Scheduled"),
    draft: __("Draft"),
    pending: __("Pending"),
    private: __("Private"),
    trash: __("Trash")
  };
  function statusBadgeColor(status) {
    switch (status) {
      case "publish":
        return { bg: "#e6f4ea", fg: "#1d6f42" };
      case "draft":
        return { bg: "#fdecea", fg: "#a02622" };
      case "pending":
        return { bg: "#fef7e0", fg: "#8a6d00" };
      case "private":
        return { bg: "#e8f0fe", fg: "#1a52a8" };
      case "future":
        return { bg: "#ede7f6", fg: "#5b3aa0" };
      case "trash":
        return { bg: "#f1f1f2", fg: "#50575e" };
      default:
        return { bg: "#f1f1f2", fg: "#50575e" };
    }
  }
  function decodeTitle(raw) {
    const ta = document.createElement("textarea");
    ta.innerHTML = raw;
    return ta.value;
  }
  function authorOf(row) {
    const embedded = row._embedded?.author?.[0];
    if (embedded) {
      const avatars = embedded.avatar_urls ?? {};
      return {
        id: embedded.id,
        name: embedded.name,
        avatar: avatars["48"] ?? avatars["96"] ?? avatars["24"]
      };
    }
    return { id: row.author, name: __("Unknown") };
  }
  function termRecordsOf(row, taxonomy) {
    const groups = row._embedded?.["wp:term"] ?? [];
    for (const group of groups) {
      if (group.length === 0) {
        continue;
      }
      if (group[0].taxonomy === taxonomy) {
        return group.map((t) => ({ id: t.id, name: t.name }));
      }
    }
    return [];
  }
  function featuredMediaOf(row) {
    const media = row._embedded?.["wp:featuredmedia"]?.[0];
    if (!media) {
      return null;
    }
    const sizes = media.media_details?.sizes ?? {};
    const small = sizes.thumbnail?.source_url ?? sizes.medium?.source_url ?? media.source_url;
    return { url: small, alt: media.alt_text ?? "" };
  }
  function cacheKey(rowId, columnKey) {
    return `${rowId}|${columnKey}`;
  }
  function memoCell(cache, rowId, columnKey, build) {
    const key = cacheKey(rowId, columnKey);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const built = build();
    cache.set(key, built);
    return built;
  }
  const REQUIRED_COLUMN_KEYS = /* @__PURE__ */ new Set(["title"]);
  function getHiddenColumns() {
    try {
      const api = window.wp?.desktop;
      if (api && typeof api.getOsSettings === "function") {
        const snap = api.getOsSettings();
        if (Array.isArray(snap.nativePostsHiddenColumns)) {
          return new Set(snap.nativePostsHiddenColumns);
        }
      }
    } catch {
    }
    return /* @__PURE__ */ new Set();
  }
  const EMPTY_FILTER_DATA = { authors: [], tags: [] };
  function buildAllColumns(cache, client, filterData = EMPTY_FILTER_DATA) {
    const cols = _buildBaseColumns(cache, filterData, client);
    const hooks = window.wp?.hooks;
    return hooks && typeof hooks.applyFilters === "function" ? hooks.applyFilters(
      HOOK_FILTER_COLUMNS,
      cols
    ) : cols;
  }
  function buildColumns$1(cache, client, filterData = EMPTY_FILTER_DATA) {
    const all = buildAllColumns(cache, client, filterData);
    const hidden = getHiddenColumns();
    if (hidden.size === 0) {
      return all;
    }
    return all.filter(
      (col) => REQUIRED_COLUMN_KEYS.has(col.key) || !hidden.has(col.key)
    );
  }
  function _buildBaseColumns(cache, filterData, client) {
    let mode = "posts";
    try {
      const cfg = client.getConfig();
      if (cfg.mode === "pages") {
        mode = "pages";
      }
    } catch {
    }
    const titleCol = {
      key: "title",
      label: __("Title"),
      sortable: true,
      sticky: true,
      render: (_v, row) => memoCell(cache, row.id, "title", () => buildTitleCell(row, client))
    };
    const authorCol = {
      key: "author",
      label: __("Author"),
      sortable: true,
      width: "180px",
      filterRender: (host, ctx) => renderMultiSelectFilter(host, ctx, filterData.authors, {
        label: __("All authors"),
        ariaLabel: __("Filter by author")
      }),
      render: (_v, row) => memoCell(cache, row.id, "author", () => buildAuthorCell(row))
    };
    const dateCol = {
      key: "date",
      label: __("Date"),
      sortable: true,
      width: "170px",
      sortValue: (row) => Date.parse(row.date_gmt + "Z") || 0,
      render: (_v, row) => memoCell(cache, row.id, "date", () => buildDateCell(row))
    };
    if (mode === "pages") {
      const parentCol = {
        key: "parent",
        label: __("Parent"),
        width: "200px",
        render: (_v, row) => memoCell(cache, row.id, "parent", () => buildParentCell(row))
      };
      const templateCol = {
        key: "template",
        label: __("Template"),
        width: "180px",
        render: (_v, row) => memoCell(cache, row.id, "template", () => buildTemplateCell(row, client))
      };
      const slugCol = {
        key: "slug",
        label: __("Slug"),
        width: "200px",
        render: (_v, row) => memoCell(cache, row.id, "slug", () => buildSlugCell(row))
      };
      const commentsCol = {
        key: "comments",
        label: __("Comments"),
        width: "110px",
        sortValue: (row) => typeof row.desktop_mode_comment_count === "number" ? row.desktop_mode_comment_count : 0,
        render: (_v, row) => memoCell(
          cache,
          row.id,
          "comments",
          () => buildCommentsCell(row)
        )
      };
      return [
        titleCol,
        authorCol,
        parentCol,
        templateCol,
        slugCol,
        commentsCol,
        dateCol
      ];
    }
    return [
      titleCol,
      authorCol,
      {
        key: "categories",
        label: __("Categories"),
        width: "260px",
        render: (_v, row) => memoCell(
          cache,
          row.id,
          "categories",
          () => buildCategoriesCell(row, client)
        )
      },
      {
        key: "tags",
        // Drop the fixed width so the column flexes with the
        // available space; pin a minimum that comfortably holds
        // ~4 chips on one line so the cell doesn't collapse the
        // tags into a vertical stack on narrow tables.
        label: __("Tags"),
        minWidth: "360px",
        filterRender: (host, ctx) => renderMultiSelectFilter(
          host,
          ctx,
          filterData.tags.map((t) => ({ id: t.id, name: t.name })),
          {
            label: __("All tags"),
            ariaLabel: __("Filter by tag"),
            dataKey: "tags",
            hasMore: !!filterData.tagsHasMore,
            onLoadMore: filterData.loadMoreTags
          }
        ),
        render: (_v, row) => memoCell(cache, row.id, "tags", () => buildTagsCell(row, client))
      },
      dateCol
    ];
  }
  const _parentTitleByPageRoster = /* @__PURE__ */ new Map();
  function buildParentCell(row) {
    const cell = document.createElement("span");
    cell.className = "desktop-mode-posts__parent";
    const pid = typeof row.parent === "number" ? row.parent : 0;
    if (pid === 0) {
      cell.classList.add("desktop-mode-posts__parent--top");
      cell.textContent = "—";
      cell.setAttribute("aria-label", __("Top-level page"));
      return cell;
    }
    cell.classList.add("desktop-mode-posts__parent--child");
    const titleFromRoster = _parentTitleByPageRoster.get(pid);
    if (titleFromRoster) {
      cell.textContent = `↳ ${titleFromRoster}`;
    } else {
      cell.textContent = sprintf(__("↳ #%d"), pid);
    }
    return cell;
  }
  function refreshParentTitleRoster(rows) {
    _parentTitleByPageRoster.clear();
    for (const row of rows) {
      _parentTitleByPageRoster.set(row.id, decodeTitle(row.title.rendered));
    }
  }
  function buildTemplateCell(row, client) {
    const cell = document.createElement("span");
    cell.className = "desktop-mode-posts__template";
    const slug = typeof row.template === "string" ? row.template : "";
    let label = slug;
    try {
      const cfg = client.getConfig();
      const map = cfg.pageTemplates ?? {};
      label = map[slug] ?? (slug === "" ? __("Default template") : slug);
    } catch {
      label = slug === "" ? __("Default template") : slug;
    }
    cell.textContent = label;
    if (slug !== "") {
      cell.title = slug;
    }
    return cell;
  }
  function buildSlugCell(row) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "desktop-mode-posts__slug";
    const slug = typeof row.slug === "string" ? row.slug : "";
    cell.textContent = slug || "—";
    cell.disabled = slug === "";
    cell.title = slug ? __("Click to copy slug") : "";
    Object.assign(cell.style, {
      appearance: "none",
      background: "transparent",
      border: "none",
      padding: "2px 6px",
      font: "inherit",
      color: "inherit",
      cursor: slug ? "copy" : "default",
      textAlign: "left",
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: "12px",
      borderRadius: "4px",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    });
    cell.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!slug) {
        return;
      }
      void navigator.clipboard?.writeText(slug).then(() => {
        cell.textContent = __("Copied!");
        cell.style.color = "var(--wp-admin-theme-color, #2271b1)";
        setTimeout(() => {
          cell.textContent = slug;
          cell.style.color = "";
        }, 1200);
      }).catch(() => {
      });
    });
    return cell;
  }
  function buildCommentsCell(row) {
    const cell = document.createElement("span");
    cell.className = "desktop-mode-posts__comments";
    Object.assign(cell.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      fontVariantNumeric: "tabular-nums"
    });
    const count = typeof row.desktop_mode_comment_count === "number" ? row.desktop_mode_comment_count : null;
    if (count === null) {
      cell.textContent = "—";
      cell.style.color = "var(--wp-admin-theme-fg-muted, #8c8f94)";
      return cell;
    }
    const icon = document.createElement("span");
    icon.className = "dashicons dashicons-admin-comments";
    icon.setAttribute("aria-hidden", "true");
    Object.assign(icon.style, {
      fontSize: "16px",
      width: "16px",
      height: "16px",
      color: count > 0 ? "var(--wp-admin-theme-color, #2271b1)" : "var(--wp-admin-theme-fg-muted, #8c8f94)"
    });
    const label = document.createElement("span");
    label.textContent = String(count);
    if (count === 0) {
      label.style.color = "var(--wp-admin-theme-fg-muted, #8c8f94)";
    }
    cell.appendChild(icon);
    cell.appendChild(label);
    cell.setAttribute(
      "aria-label",
      // translators: %d is the comment count for a row.
      `${sprintf(_n("%d comment", "%d comments", count), count)}`
    );
    return cell;
  }
  function renderMultiSelectFilter(host, ctx, all, opts) {
    const HOST_KEY = "wpdPostsFilterMounted";
    const tagged = host;
    const optionsForPicker = all.map((o) => ({
      value: String(o.id),
      label: o.name
    }));
    const nextSig = optionsForPicker.map((o) => `${o.value}:${o.label}`).join("|");
    if (tagged[HOST_KEY]) {
      const state = tagged[HOST_KEY];
      if (state.listSig !== nextSig) {
        state.picker.items = optionsForPicker;
        state.listSig = nextSig;
      }
      if (state.picker.getAttribute("value") !== ctx.value) {
        state.picker.setAttribute("value", ctx.value);
      }
      state.picker.hasMore = !!opts.hasMore;
      return;
    }
    const picker = document.createElement("wpd-multiselect");
    picker.setAttribute("placeholder", opts.label);
    picker.setAttribute("aria-label", opts.ariaLabel);
    picker.setAttribute("data-noclick", "");
    picker.setAttribute("value", ctx.value);
    if (opts.dataKey) {
      picker.setAttribute("data-key", opts.dataKey);
    }
    host.appendChild(picker);
    picker.items = optionsForPicker;
    picker.hasMore = !!opts.hasMore;
    picker.addEventListener("wpd-pick", (e) => {
      const detail = e.detail;
      const next = detail?.value ?? "";
      ctx.value = next;
      ctx.setValue(next);
    });
    if (opts.onLoadMore) {
      const onLoadMore = opts.onLoadMore;
      picker.addEventListener("wpd-multiselect-load-more", () => {
        picker.loadingMore = true;
        onLoadMore();
      });
    }
    tagged[HOST_KEY] = { picker, listSig: nextSig };
  }
  function mountKebabColumnToggles(body, cache, repaintColumns, client) {
    const winEl = body.closest(".desktop-mode-window");
    const panel = winEl?.querySelector(
      ".desktop-mode-window__menu-panel"
    );
    if (!panel) {
      return null;
    }
    const SECTION_CLASS = "desktop-mode-posts-window__menu-columns";
    const ITEM_CLASS = "desktop-mode-posts-window__menu-column-item";
    const VALUE_PREFIX = "desktop-mode-posts-column:";
    panel.querySelectorAll(`.${SECTION_CLASS}, .${ITEM_CLASS}`).forEach((n) => n.remove());
    const allCols = buildAllColumns(cache, client);
    const togglable = allCols.filter(
      (c) => !REQUIRED_COLUMN_KEYS.has(c.key)
    );
    if (togglable.length === 0) {
      return null;
    }
    const sectionLabel = document.createElement("div");
    sectionLabel.className = SECTION_CLASS;
    sectionLabel.setAttribute("role", "presentation");
    sectionLabel.textContent = __("Show columns");
    panel.appendChild(sectionLabel);
    const itemEls = /* @__PURE__ */ new Map();
    for (const col of togglable) {
      const item = document.createElement("wpd-menu-item");
      item.setAttribute("role", "menuitemcheckbox");
      item.setAttribute("value", VALUE_PREFIX + col.key);
      item.classList.add("desktop-mode-window__menu-item");
      item.classList.add(ITEM_CLASS);
      item.textContent = col.label || col.key;
      panel.appendChild(item);
      itemEls.set(col.key, item);
    }
    const paintChecked = () => {
      const hidden = getHiddenColumns();
      for (const [key, el] of itemEls) {
        if (hidden.has(key)) {
          el.removeAttribute("checked");
        } else {
          el.setAttribute("checked", "");
        }
      }
    };
    paintChecked();
    const onClick = (e) => {
      const detail = e.detail;
      const value = detail?.value;
      if (typeof value !== "string" || !value.startsWith(VALUE_PREFIX)) {
        return;
      }
      const key = value.slice(VALUE_PREFIX.length);
      if (!itemEls.has(key) || REQUIRED_COLUMN_KEYS.has(key)) {
        return;
      }
      const hidden = getHiddenColumns();
      if (hidden.has(key)) {
        hidden.delete(key);
      } else {
        hidden.add(key);
      }
      const next = Array.from(hidden).sort();
      const api = window.wp?.desktop;
      if (api && typeof api.updateOsSettings === "function") {
        api.updateOsSettings(
          { nativePostsHiddenColumns: next },
          { windowId: "desktop-mode-posts" }
        );
      }
      paintChecked();
      repaintColumns();
    };
    panel.addEventListener("wpd-menu-item-click", onClick);
    return {
      refresh: paintChecked,
      dispose: () => {
        panel.removeEventListener("wpd-menu-item-click", onClick);
        sectionLabel.remove();
        for (const el of itemEls.values()) {
          el.remove();
        }
        itemEls.clear();
      }
    };
  }
  function defaultStatusSegments$1() {
    return [
      { value: "", label: __("All") },
      { value: "publish", label: __("Published") },
      { value: "draft", label: __("Drafts") },
      { value: "pending", label: __("Pending") },
      { value: "future", label: __("Scheduled") },
      { value: "trash", label: __("Trash") }
    ];
  }
  function defaultBulkActions(client) {
    return [
      {
        id: "trash",
        label: __("Move to trash"),
        icon: "dashicons-trash",
        variant: "danger",
        /* translators: %d: row count. */
        confirm: __("Move %d post(s) to the trash?"),
        run: async (ids, ctx) => {
          const data = ctx.table.data ?? [];
          const trashable = ids.filter((id) => {
            const row = data.find((r) => r.id === id);
            return row && row.status !== "trash";
          });
          if (trashable.length === 0) {
            return;
          }
          const results = await Promise.all(
            trashable.map((id) => client.trashPost(id))
          );
          const errors = results.filter((r) => !r.ok);
          if (errors.length > 0) {
            console.error("[posts-window] some trashes failed", errors);
          }
          const okIds = results.filter((r) => r.ok).map((r) => r.id);
          const api = window.wp?.desktop;
          if (api && typeof api.broadcast === "function") {
            api.broadcast("desktop-mode.post.changed", {
              source: "posts-window",
              action: "trashed",
              ids: okIds
            });
          }
        }
      }
    ];
  }
  function resolveBulkActions(client) {
    const hooks = window.wp?.hooks;
    const defaults = defaultBulkActions(client);
    if (!hooks || typeof hooks.applyFilters !== "function") {
      return defaults;
    }
    try {
      const out = hooks.applyFilters(HOOK_FILTER_BULK_ACTIONS, defaults);
      return Array.isArray(out) ? out : defaults;
    } catch (err) {
      console.error(
        "[posts-window] bulk-actions filter threw; falling back to defaults:",
        err
      );
      return defaults;
    }
  }
  function resolveStatusSegments() {
    const hooks = window.wp?.hooks;
    const defaults = defaultStatusSegments$1();
    if (!hooks || typeof hooks.applyFilters !== "function") {
      return defaults;
    }
    try {
      const out = hooks.applyFilters(HOOK_FILTER_STATUS_SEGMENTS, defaults);
      return Array.isArray(out) && out.length > 0 ? out : defaults;
    } catch (err) {
      console.error(
        "[posts-window] status-segments filter threw; falling back to defaults:",
        err
      );
      return defaults;
    }
  }
  function resolveToolbarTrailing(ctx) {
    const hooks = window.wp?.hooks;
    if (!hooks || typeof hooks.applyFilters !== "function") {
      return [];
    }
    try {
      const out = hooks.applyFilters(HOOK_FILTER_TOOLBAR_TRAILING, [], ctx);
      if (!Array.isArray(out)) {
        return [];
      }
      return out.filter((el) => el instanceof HTMLElement);
    } catch (err) {
      console.error(
        "[posts-window] toolbar-trailing filter threw; ignoring:",
        err
      );
      return [];
    }
  }
  function buildTitleCell(row, client) {
    const cell = document.createElement("span");
    cell.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:0;";
    const titleRow = document.createElement("span");
    titleRow.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;";
    const link = document.createElement("a");
    link.href = client.buildEditPostUrl(row.id);
    link.setAttribute("data-noclick", "");
    const title = decodeTitle(row.title.rendered) || __("(no title)");
    link.textContent = title;
    link.title = title;
    link.style.cssText = "font-weight:600;color:inherit;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px;";
    link.addEventListener("mouseenter", () => {
      link.style.textDecoration = "underline";
    });
    link.addEventListener("mouseleave", () => {
      link.style.textDecoration = "none";
    });
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAdminUrl(link.href, {
        title,
        icon: "dashicons-admin-post"
      });
    });
    titleRow.appendChild(link);
    const lock = row.desktop_mode_lock ?? null;
    if (lock) {
      const lockBadge = document.createElement("span");
      lockBadge.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "gap:4px",
        "padding:2px 8px",
        "border-radius:10px",
        "font-size:11px",
        "font-weight:600",
        "background:rgba(179, 45, 46, 0.1)",
        "color:#b32d2e",
        "white-space:nowrap",
        "flex-shrink:0"
      ].join(";");
      const lockIcon = document.createElement("span");
      lockIcon.setAttribute("aria-hidden", "true");
      lockIcon.style.cssText = [
        "font-family:dashicons",
        "font-size:14px",
        "line-height:1",
        "display:inline-block",
        "speak:none",
        "-webkit-font-smoothing:antialiased"
      ].join(";");
      lockIcon.textContent = "";
      lockBadge.appendChild(lockIcon);
      const lockText = document.createElement("span");
      lockText.textContent = lock.userName;
      lockBadge.appendChild(lockText);
      const tipFmt = __("%s is currently editing", "desktop-mode");
      lockBadge.title = sprintf(tipFmt, lock.userName);
      titleRow.appendChild(lockBadge);
    }
    let cfgForBadges = null;
    try {
      cfgForBadges = client.getConfig();
    } catch {
      cfgForBadges = null;
    }
    if (cfgForBadges && cfgForBadges.mode === "pages") {
      if (typeof cfgForBadges.frontPageId === "number" && cfgForBadges.frontPageId === row.id) {
        titleRow.appendChild(
          buildAssignmentBadge(
            __("Front page"),
            "dashicons-admin-home",
            "#0a4b78",
            "rgba(34,113,177,0.12)"
          )
        );
      }
      if (typeof cfgForBadges.postsPageId === "number" && cfgForBadges.postsPageId === row.id) {
        titleRow.appendChild(
          buildAssignmentBadge(
            __("Posts page"),
            "dashicons-admin-post",
            "#5b3aa0",
            "rgba(91,58,160,0.12)"
          )
        );
      }
    }
    if (row.status && row.status !== "publish") {
      const badge = document.createElement("span");
      const colors = statusBadgeColor(row.status);
      badge.textContent = STATUS_LABELS[row.status] ?? row.status;
      badge.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "padding:2px 8px",
        "border-radius:10px",
        "font-size:11px",
        "font-weight:600",
        "text-transform:uppercase",
        "letter-spacing:0.04em",
        `background:${colors.bg}`,
        `color:${colors.fg}`,
        "white-space:nowrap",
        "flex-shrink:0"
      ].join(";");
      titleRow.appendChild(badge);
    }
    if (cfgForBadges?.mode === "pages" && typeof row.link === "string" && row.link && row.status === "publish") {
      const view = document.createElement("a");
      view.href = row.link;
      view.target = "_blank";
      view.rel = "noreferrer noopener";
      view.textContent = __("View");
      view.title = row.link;
      view.setAttribute("data-noclick", "");
      view.style.cssText = [
        "font-size:11px",
        "color:var(--wp-admin-theme-color, #2271b1)",
        "text-decoration:none",
        "flex-shrink:0"
      ].join(";");
      view.addEventListener("click", (e) => e.stopPropagation());
      view.addEventListener("mouseenter", () => {
        view.style.textDecoration = "underline";
      });
      view.addEventListener("mouseleave", () => {
        view.style.textDecoration = "none";
      });
      titleRow.appendChild(view);
    }
    cell.appendChild(titleRow);
    return cell;
  }
  function buildAssignmentBadge(label, dashicon, fg, bg) {
    const badge = document.createElement("span");
    badge.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "gap:4px",
      "padding:2px 8px",
      "border-radius:10px",
      "font-size:11px",
      "font-weight:600",
      `background:${bg}`,
      `color:${fg}`,
      "white-space:nowrap",
      "flex-shrink:0"
    ].join(";");
    const icon = document.createElement("span");
    icon.className = `dashicons ${dashicon}`;
    icon.setAttribute("aria-hidden", "true");
    icon.style.cssText = "font-size:13px;width:13px;height:13px;line-height:1;";
    const text = document.createElement("span");
    text.textContent = label;
    badge.appendChild(icon);
    badge.appendChild(text);
    return badge;
  }
  function buildAuthorCell(row) {
    const a = authorOf(row);
    const wrap = document.createElement("span");
    wrap.style.cssText = "display:inline-flex;align-items:center;gap:8px;min-width:0;";
    const avatar = document.createElement("wpd-avatar");
    avatar.setAttribute("size", "24");
    if (a.name) {
      avatar.setAttribute("name", a.name);
    }
    if (a.id > 0) {
      avatar.setAttribute("user-id", String(a.id));
    }
    if (a.avatar) {
      applyAvatarSrc(avatar, a.avatar);
    }
    wrap.appendChild(avatar);
    const name = document.createElement("span");
    name.textContent = a.name;
    name.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    wrap.appendChild(name);
    return wrap;
  }
  function buildTagsCell(row, client) {
    const wrap = document.createElement("span");
    wrap.style.cssText = "display:inline-flex;align-items:center;width:100%;min-width:0;";
    const picker = document.createElement("wpd-tag-input");
    picker.setAttribute("creatable", "");
    picker.setAttribute("removable", "");
    picker.setAttribute("min-query", "0");
    picker.setAttribute("placeholder", __("Add tag…"));
    picker.setAttribute("add-label", __("Tag"));
    picker.setAttribute("data-noclick", "");
    const seed = termRecordsOf(row, "post_tag").map((t) => ({
      id: t.id,
      label: t.name
    }));
    picker.value = seed;
    const cellState = {
      // Mirror of `picker.value` we mutate optimistically. Keeping
      // it here (rather than reading back from the picker) avoids
      // double-source-of-truth bugs when two events fire in the
      // same tick.
      tags: seed.slice(),
      // AbortController for the in-flight suggest fetch.
      suggestAbort: null,
      suggestDebounce: null,
      // Last query the user typed — used to drop stale responses
      // even after AbortController has fired.
      lastQuery: ""
    };
    const setValue = (next) => {
      cellState.tags = next.slice();
      picker.value = next;
    };
    picker.addEventListener("wpd-tag-suggest", (e) => {
      const detail = e.detail;
      const query = detail?.query ?? "";
      cellState.lastQuery = query;
      if (cellState.suggestDebounce !== null) {
        window.clearTimeout(cellState.suggestDebounce);
        cellState.suggestDebounce = null;
      }
      cellState.suggestDebounce = window.setTimeout(async () => {
        cellState.suggestDebounce = null;
        if (cellState.suggestAbort) {
          cellState.suggestAbort.abort();
        }
        const ac = new AbortController();
        cellState.suggestAbort = ac;
        try {
          const matches = await client.searchTags(query, ac.signal);
          if (cellState.lastQuery !== query) {
            return;
          }
          const existingIds = new Set(cellState.tags.map((t) => t.id));
          picker.suggestions = matches.filter((m) => !existingIds.has(m.id)).map((m) => ({ id: m.id, label: m.name }));
        } catch (err) {
          if (err?.name === "AbortError") {
            return;
          }
          picker.suggestions = [];
          console.warn(
            "[posts-window] tag search failed",
            err
          );
        } finally {
          picker.suggestionsLoading = false;
        }
      }, 200);
    });
    picker.addEventListener("wpd-tag-add", async (e) => {
      const detail = e.detail;
      if (!detail?.tag) {
        return;
      }
      const optimistic = {
        id: detail.tag.id,
        label: detail.tag.label,
        pending: true
      };
      const next = [...cellState.tags, optimistic];
      setValue(next);
      try {
        let resolvedTag = null;
        if (detail.isNew || typeof detail.tag.id !== "number") {
          resolvedTag = await client.createTag(detail.tag.label);
        } else {
          resolvedTag = {
            id: Number(detail.tag.id),
            name: detail.tag.label,
            slug: ""
          };
        }
        const desiredIds = [
          ...cellState.tags.filter((t) => !t.pending).map((t) => Number(t.id)),
          resolvedTag.id
        ];
        await client.updatePostTags(row.id, desiredIds);
        setValue(
          cellState.tags.map((t) => {
            if (t.label.toLowerCase() === detail.tag.label.toLowerCase()) {
              return {
                id: resolvedTag.id,
                label: resolvedTag.name
              };
            }
            return t;
          })
        );
        const api = window.wp?.desktop;
        if (api && typeof api.broadcast === "function") {
          api.broadcast("desktop-mode.post.changed", {
            source: "posts-window",
            action: "tagged",
            ids: [row.id]
          });
        }
      } catch (err) {
        setValue(
          cellState.tags.filter(
            (t) => t.label.toLowerCase() !== detail.tag.label.toLowerCase()
          )
        );
        showTagError(
          sprintf(
            /* translators: %s: tag label */
            __('Couldn’t add tag "%s".'),
            detail.tag.label
          ),
          err
        );
      }
    });
    picker.addEventListener("wpd-tag-remove", async (e) => {
      const detail = e.detail;
      if (!detail?.tag) {
        return;
      }
      const removed = detail.tag;
      const previous = cellState.tags.slice();
      setValue(
        cellState.tags.map(
          (t) => t.label === removed.label ? { ...t, pending: true } : t
        )
      );
      try {
        const desiredIds = previous.filter((t) => t.label !== removed.label).map((t) => Number(t.id)).filter((n) => Number.isFinite(n));
        await client.updatePostTags(row.id, desiredIds);
        setValue(
          previous.filter((t) => t.label !== removed.label)
        );
        const api = window.wp?.desktop;
        if (api && typeof api.broadcast === "function") {
          api.broadcast("desktop-mode.post.changed", {
            source: "posts-window",
            action: "untagged",
            ids: [row.id]
          });
        }
      } catch (err) {
        setValue(previous);
        showTagError(
          sprintf(
            /* translators: %s: tag label */
            __('Couldn’t remove tag "%s".'),
            removed.label
          ),
          err
        );
      }
    });
    wrap.appendChild(picker);
    return wrap;
  }
  function showTagError(title, err) {
    const reason = err instanceof Error ? err.message : String(err);
    const api = window.wp?.desktop;
    if (api && typeof api.showToast === "function") {
      api.showToast({
        message: `${title} ${reason}`.trim(),
        duration: 6e3
      });
      return;
    }
    console.error(title, err);
  }
  function buildCategoriesCell(row, client) {
    const wrap = document.createElement("span");
    wrap.className = "wpd-cat-cell-dropzone";
    wrap.style.cssText = "display:inline-flex;align-items:center;width:100%;min-width:0;border-radius:6px;transition:background-color 0.12s ease, box-shadow 0.12s ease;";
    const picker = document.createElement(
      "wpd-category-picker"
    );
    picker.setAttribute("placeholder", __("Search categories…"));
    picker.setAttribute("add-label", __("Categorize"));
    picker.setAttribute("data-noclick", "");
    _activePickers.add(picker);
    picker.value = row.categories ?? [];
    const seedItems = termRecordsOf(row, "category").map(
      (t) => ({ id: t.id, name: t.name, parent: 0 })
    );
    picker.items = seedItems;
    const cellState = {
      categoryIds: (row.categories ?? []).slice()
    };
    const setValue = (next) => {
      cellState.categoryIds = next.slice();
      picker.value = next;
    };
    void getCategoriesTree(client).then((tree) => {
      if (!picker.isConnected) {
        return;
      }
      picker.items = tree;
    }).catch((err) => {
      console.warn("[posts-window] category tree fetch failed", err);
    });
    picker.addEventListener("wpd-categories-open", () => {
      void primePickerFromCache(picker);
    });
    picker.addEventListener(
      "wpd-categories-create",
      async (e) => {
        const detail = e.detail;
        const parent = detail?.parent ?? 0;
        if (!detail || !detail.name) {
          picker.failCreating(parent);
          return;
        }
        try {
          const created = await client.createCategory(detail.name, parent);
          _categoryTreePromise = null;
          const nextItems = [
            ...picker.items,
            {
              id: created.id,
              name: created.name,
              parent: created.parent
            }
          ];
          picker.items = nextItems;
          const nextValue = [...cellState.categoryIds, created.id];
          setValue(nextValue);
          picker.endCreating(parent);
          try {
            await client.updatePostCategories(row.id, nextValue);
            const api = window.wp?.desktop;
            if (api && typeof api.broadcast === "function") {
              api.broadcast("desktop-mode.post.changed", {
                source: "posts-window",
                action: "categorized",
                ids: [row.id]
              });
            }
          } catch (err) {
            setValue(cellState.categoryIds.filter((id) => id !== created.id));
            showTagError(__("Couldn’t assign new category."), err);
          }
        } catch (err) {
          picker.failCreating(
            parent,
            err instanceof Error ? err.message : String(err)
          );
          showTagError(__("Couldn’t create category."), err);
        }
      }
    );
    picker.addEventListener("wpd-categories-change", async (e) => {
      const detail = e.detail;
      if (!detail || !Array.isArray(detail.value)) {
        return;
      }
      const previous = cellState.categoryIds.slice();
      const next = detail.value.slice();
      setValue(next);
      try {
        await client.updatePostCategories(row.id, next);
        const api = window.wp?.desktop;
        if (api && typeof api.broadcast === "function") {
          api.broadcast("desktop-mode.post.changed", {
            source: "posts-window",
            action: "categorized",
            ids: [row.id]
          });
        }
      } catch (err) {
        setValue(previous);
        showTagError(__("Couldn’t update categories."), err);
      }
    });
    picker.addEventListener("wpd-categories-delete", async (e) => {
      const detail = e.detail;
      if (!detail || typeof detail.id !== "number") {
        return;
      }
      const ok = await wpdConfirmGlobal$1({
        title: __("Delete category?"),
        message: sprintf(
          /* translators: %s: category name. */
          __(
            'Delete the category "%s"? Posts assigned only to it will fall back to Uncategorized.'
          ),
          detail.name
        ),
        confirmLabel: __("Delete"),
        danger: true
      });
      if (!ok) {
        return;
      }
      try {
        await client.deleteTerm("categories", detail.id);
        if (cellState.categoryIds.includes(detail.id)) {
          const next = cellState.categoryIds.filter(
            (id) => id !== detail.id
          );
          setValue(next);
          try {
            await client.updatePostCategories(row.id, next);
          } catch (err) {
            showTagError(
              __("Couldn’t update post categories after delete."),
              err
            );
          }
        }
      } catch (err) {
        showTagError(__("Couldn’t delete category."), err);
      }
    });
    picker.addEventListener("wpd-chain-segment-dragstart", (e) => {
      const detail = e.detail;
      if (!detail || !detail.dragEvent || !detail.dragEvent.dataTransfer) {
        return;
      }
      const ids = [];
      for (const seg of detail.segments) {
        if (typeof seg.id === "number") {
          ids.push(seg.id);
        }
      }
      if (ids.length === 0) {
        return;
      }
      const dt = detail.dragEvent.dataTransfer;
      dt.setData(
        "application/x-desktop-mode-categories",
        JSON.stringify({
          ids,
          source: "posts-window",
          sourcePostId: row.id
        })
      );
      dt.setData("text/plain", ids.join(","));
      dt.effectAllowed = "copy";
    });
    let dropEnterCount = 0;
    const setDropTargetActive = (on) => {
      if (on) {
        wrap.style.backgroundColor = "color-mix(in srgb, var(--wp-admin-theme-color, #2271b1) 12%, transparent)";
        wrap.style.boxShadow = "inset 0 0 0 2px var(--wp-admin-theme-color, #2271b1)";
      } else {
        wrap.style.backgroundColor = "";
        wrap.style.boxShadow = "";
      }
    };
    const acceptsCategoriesDrag = (e) => {
      const types = e.dataTransfer?.types;
      if (!types) {
        return false;
      }
      return Array.from(types).includes(
        "application/x-desktop-mode-categories"
      );
    };
    wrap.addEventListener("dragenter", (e) => {
      if (!acceptsCategoriesDrag(e)) {
        return;
      }
      e.preventDefault();
      dropEnterCount++;
      setDropTargetActive(true);
    });
    wrap.addEventListener("dragover", (e) => {
      if (!acceptsCategoriesDrag(e)) {
        return;
      }
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    });
    wrap.addEventListener("dragleave", () => {
      if (dropEnterCount > 0) {
        dropEnterCount--;
      }
      if (dropEnterCount === 0) {
        setDropTargetActive(false);
      }
    });
    wrap.addEventListener("drop", async (e) => {
      dropEnterCount = 0;
      setDropTargetActive(false);
      if (!acceptsCategoriesDrag(e)) {
        return;
      }
      e.preventDefault();
      const json = e.dataTransfer?.getData(
        "application/x-desktop-mode-categories"
      );
      if (!json) {
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch {
        return;
      }
      const payload = parsed;
      if (!payload || !Array.isArray(payload.ids)) {
        return;
      }
      const incoming = [];
      for (const v of payload.ids) {
        if (typeof v === "number" && Number.isFinite(v)) {
          incoming.push(v);
        }
      }
      if (incoming.length === 0) {
        return;
      }
      if (payload.sourcePostId === row.id && incoming.every((id) => cellState.categoryIds.includes(id))) {
        return;
      }
      const merged = Array.from(
        /* @__PURE__ */ new Set([...cellState.categoryIds, ...incoming])
      );
      if (merged.length === cellState.categoryIds.length) {
        return;
      }
      const previous = cellState.categoryIds.slice();
      setValue(merged);
      try {
        await client.updatePostCategories(row.id, merged);
        const api = window.wp?.desktop;
        if (api && typeof api.broadcast === "function") {
          api.broadcast("desktop-mode.post.changed", {
            source: "posts-window",
            action: "categorized",
            ids: [row.id]
          });
        }
      } catch (err) {
        setValue(previous);
        showTagError(__("Couldn’t add category."), err);
      }
    });
    wrap.appendChild(picker);
    return wrap;
  }
  let _categoryTreePromise = null;
  function getCategoriesTree(client) {
    if (!_categoryTreePromise) {
      _categoryTreePromise = client.fetchAllCategories().then(
        (terms) => terms.map((t) => ({
          id: t.id,
          name: t.name,
          parent: t.parent
        }))
      );
    }
    return _categoryTreePromise;
  }
  function clearCategoryTreeCache() {
    _categoryTreePromise = null;
  }
  const _activePickers = /* @__PURE__ */ new Set();
  function broadcastFreshCategoryTreeToPickers(client) {
    void getCategoriesTree(client).then((tree) => {
      for (const picker of _activePickers) {
        if (picker.isConnected) {
          picker.items = tree;
        } else {
          _activePickers.delete(picker);
        }
      }
    }).catch(() => {
    });
  }
  async function primePickerFromCache(picker) {
    if (!_categoryTreePromise) {
      return;
    }
    try {
      picker.items = await _categoryTreePromise;
    } catch {
    }
  }
  function buildDateCell(row) {
    const wrap = document.createElement("span");
    wrap.style.cssText = "display:flex;flex-direction:column;line-height:1.2;";
    const time = document.createElement("wpd-relative-time");
    time.setAttribute("datetime", row.date);
    wrap.appendChild(time);
    if (row.modified_gmt && row.modified_gmt !== row.date_gmt) {
      const meta = document.createElement("span");
      meta.textContent = __("modified");
      meta.style.cssText = "font-size:11px;color:#646970;";
      wrap.appendChild(meta);
    }
    return wrap;
  }
  function buildSubRow(row) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:16px;padding:12px 16px;background:#fafafa;align-items:flex-start;";
    const featured = featuredMediaOf(row);
    if (featured) {
      const img = document.createElement("img");
      img.src = featured.url;
      img.alt = featured.alt;
      img.loading = "lazy";
      img.style.cssText = "width:96px;height:96px;border-radius:6px;object-fit:cover;flex-shrink:0;";
      wrap.appendChild(img);
    }
    const text = document.createElement("div");
    text.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;";
    const heading = document.createElement("div");
    heading.style.cssText = "font-size:13px;color:#646970;text-transform:uppercase;letter-spacing:0.04em;";
    heading.textContent = __("Excerpt");
    text.appendChild(heading);
    const excerpt = document.createElement("div");
    excerpt.style.cssText = "color:#1d2327;line-height:1.5;";
    const raw = row.excerpt?.rendered ?? "";
    if (raw) {
      const stripped = raw.replace(/<[^>]+>/g, "").trim();
      excerpt.textContent = stripped || __("(no excerpt)");
    } else {
      excerpt.textContent = __("(no excerpt)");
      excerpt.style.color = "#a7aaad";
    }
    text.appendChild(excerpt);
    wrap.appendChild(text);
    return wrap;
  }
  async function renderPostsWindow(body, client) {
    const root = body.querySelector(ROOT$1);
    const table = body.querySelector(TABLE$1);
    if (!root || !table) {
      return;
    }
    maybeShowIntro(client);
    const catsHost = body.querySelector(
      "[data-desktop-mode-posts-cats-host]"
    );
    const tagsHost = body.querySelector(
      "[data-desktop-mode-posts-tags-host]"
    );
    let catsTeardown = null;
    let tagsTeardown = null;
    const tabsEl = body.querySelector(".desktop-mode-posts__tabs");
    if (tabsEl) {
      tabsEl.addEventListener("wpd-tab-change", (e) => {
        const detail = e.detail;
        const value = detail?.value;
        if (value === "categories" && catsHost && !catsTeardown) {
          void Promise.resolve().then(() => categoriesMindmap).then(
            async ({ mountCategoriesMindmap: mountCategoriesMindmap2 }) => {
              catsTeardown = await mountCategoriesMindmap2(catsHost, client);
            }
          );
        }
        if (value === "tags" && tagsHost && !tagsTeardown) {
          void Promise.resolve().then(() => tagsCloud).then(
            async ({ mountTagsCloud: mountTagsCloud2 }) => {
              tagsTeardown = await mountTagsCloud2(tagsHost, client);
            }
          );
        }
      });
    }
    const cfg = client.getConfig();
    const view = {
      page: 1,
      perPage: Math.max(1, cfg.defaultPerPage || 20),
      search: "",
      status: "",
      orderby: "date",
      order: "desc",
      author: [],
      tag: [],
      searchDebounce: null
    };
    const cellCache = /* @__PURE__ */ new Map();
    const filterData = { authors: [], tags: [] };
    table.columns = buildColumns$1(cellCache, client, filterData);
    table.getRowId = (row) => row.id;
    table.subTable = (row) => buildSubRow(row);
    table.sort = { key: "date", direction: "desc" };
    let totalPages = 0;
    let totalRows = 0;
    let refreshSeq = 0;
    const perPageEl = root.querySelector(PER_PAGE$1);
    if (perPageEl) {
      perPageEl.value = String(view.perPage);
    }
    const indicator = root.querySelector(PAGE_INDICATOR$1);
    const prevBtn = root.querySelector(PREV$1);
    const nextBtn = root.querySelector(NEXT$1);
    const bulkBar = root.querySelector(BULK$1);
    const countEl = root.querySelector(COUNT$1);
    const bulkActionsHost = root.querySelector(BULK_ACTIONS_HOST$1);
    const trailingExtras = root.querySelector(
      TOOLBAR_TRAILING_EXTRAS
    );
    const statusHost = root.querySelector(STATUS$1);
    const statusSegments = resolveStatusSegments();
    if (statusHost) {
      statusHost.replaceChildren();
      for (const seg of statusSegments) {
        const el = document.createElement("wpd-segment");
        el.setAttribute("value", seg.value);
        el.textContent = seg.label;
        statusHost.appendChild(el);
      }
      statusHost.setAttribute("value", view.status);
    }
    const updatePager = () => {
      if (indicator) {
        if (totalRows === 0) {
          indicator.textContent = __("No posts");
        } else {
          indicator.textContent = sprintf(
            /* translators: 1: current page, 2: total pages, 3: total posts. */
            __("Page %1$d of %2$d · %3$d posts"),
            view.page,
            Math.max(totalPages, 1),
            totalRows
          );
        }
      }
      if (prevBtn) {
        prevBtn.toggleAttribute("disabled", view.page <= 1);
      }
      if (nextBtn) {
        nextBtn.toggleAttribute("disabled", view.page >= totalPages);
      }
    };
    const updateBulkBar = () => {
      if (!bulkBar || !countEl) {
        return;
      }
      const sel = Array.from(table.selection ?? []);
      if (sel.length === 0) {
        bulkBar.hidden = true;
        return;
      }
      bulkBar.hidden = false;
      countEl.textContent = sprintf(
        /* translators: %d: selected row count. */
        __("%d selected"),
        sel.length
      );
    };
    const clearSelectionOnQueryChange = () => {
      table.clearSelection();
    };
    const buildParams = () => ({
      page: view.page,
      perPage: view.perPage,
      search: view.search || void 0,
      status: view.status || void 0,
      orderby: view.orderby,
      order: view.order,
      author: view.author.length > 0 ? view.author : void 0,
      tag: view.tag.length > 0 ? view.tag : void 0
    });
    const ctx = {
      body,
      table,
      refresh: () => refresh(),
      getSelectedIds: () => Array.from(table.selection ?? []).map((id) => Number(id)),
      getSelectedRows: () => {
        const ids = new Set(ctx.getSelectedIds());
        return (table.data ?? []).filter((r) => ids.has(r.id));
      },
      getCurrentParams: () => buildParams()
    };
    const refresh = async () => {
      const mySeq = ++refreshSeq;
      table.toggleAttribute("loading", true);
      try {
        const result = await client.fetchPosts(buildParams());
        if (mySeq !== refreshSeq) {
          return;
        }
        if (result.items.length === 0 && view.page > 1 && result.totalPages > 0 && view.page > result.totalPages) {
          view.page = 1;
          await refresh();
          return;
        }
        cellCache.clear();
        refreshParentTitleRoster(result.items);
        table.data = result.items;
        totalRows = result.total;
        totalPages = result.totalPages;
        updatePager();
        const hooks2 = window.wp?.hooks;
        if (hooks2 && typeof hooks2.doAction === "function") {
          hooks2.doAction(HOOK_ACTION_DATA_LOADED, {
            items: result.items,
            total: result.total,
            totalPages: result.totalPages,
            page: view.page
          });
        }
        document.dispatchEvent(
          new CustomEvent("desktop-mode-posts-window-data-loaded", {
            detail: {
              items: result.items,
              total: result.total,
              totalPages: result.totalPages,
              page: view.page
            }
          })
        );
      } catch (err) {
        if (mySeq !== refreshSeq) {
          return;
        }
        console.error("[posts-window] list failed", err);
        table.data = [];
        totalRows = 0;
        totalPages = 0;
        updatePager();
      } finally {
        if (mySeq === refreshSeq) {
          table.toggleAttribute("loading", false);
          updateBulkBar();
        }
      }
    };
    const goToFirstPage = () => {
      if (view.page !== 1) {
        view.page = 1;
      }
    };
    root.querySelector(STATUS$1)?.addEventListener("wpd-pick", (e) => {
      const value = e.detail?.value ?? "";
      view.status = value;
      goToFirstPage();
      clearSelectionOnQueryChange();
      void refresh();
    });
    root.querySelector(SEARCH$1)?.addEventListener(
      "wpd-input-change",
      (e) => {
        const value = e.detail?.value ?? "";
        view.search = value;
        if (view.searchDebounce !== null) {
          window.clearTimeout(view.searchDebounce);
        }
        view.searchDebounce = window.setTimeout(() => {
          goToFirstPage();
          clearSelectionOnQueryChange();
          void refresh();
        }, SEARCH_DEBOUNCE_MS$1);
      }
    );
    body.addEventListener("click", (e) => {
      const target = e.target;
      if (!target) {
        return;
      }
      if (target.closest(REFRESH$1)) {
        void refresh();
        return;
      }
      if (target.closest(NEW_BTN$1)) {
        const isPages = cfg.mode === "pages";
        openAdminUrl(cfg.newPostUrl, {
          title: isPages ? __("Add New Page") : __("Add New Post"),
          icon: isPages ? "dashicons-admin-page" : "dashicons-admin-post"
        });
        return;
      }
      if (target.closest(PREV$1)) {
        if (view.page > 1) {
          view.page -= 1;
          clearSelectionOnQueryChange();
          void refresh();
        }
        return;
      }
      if (target.closest(NEXT$1)) {
        if (view.page < totalPages) {
          view.page += 1;
          clearSelectionOnQueryChange();
          void refresh();
        }
      }
    });
    const bulkActions = resolveBulkActions(client);
    if (bulkActionsHost) {
      bulkActionsHost.replaceChildren();
      for (const action of bulkActions) {
        bulkActionsHost.appendChild(buildBulkActionButton(action, ctx));
      }
    }
    if (trailingExtras) {
      const extras = resolveToolbarTrailing(ctx);
      trailingExtras.replaceChildren(...extras);
    }
    perPageEl?.addEventListener("change", () => {
      const next = parseInt(perPageEl.value, 10);
      if (!Number.isFinite(next) || next < 1) {
        return;
      }
      view.perPage = next;
      goToFirstPage();
      clearSelectionOnQueryChange();
      void refresh();
    });
    table.addEventListener("wpd-table-selection-change", () => {
      updateBulkBar();
    });
    table.addEventListener("wpd-table-sort-change", (e) => {
      const detail = e.detail;
      if (!detail || !detail.sort) {
        view.orderby = "date";
        view.order = "desc";
      } else {
        view.orderby = mapColumnToOrderby(detail.sort.key);
        view.order = detail.sort.direction;
      }
      clearSelectionOnQueryChange();
      void refresh();
    });
    const parseIds = (raw) => raw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    const sameIds = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    table.addEventListener("wpd-table-filter-change", (e) => {
      const detail = e.detail;
      const filters = detail?.filters ?? {};
      const nextAuthor = parseIds(filters.author ?? "");
      const nextTag = parseIds(filters.tags ?? "");
      const changed = !sameIds(nextAuthor, view.author) || !sameIds(nextTag, view.tag);
      if (!changed) {
        return;
      }
      view.author = nextAuthor;
      view.tag = nextTag;
      view.page = 1;
      clearSelectionOnQueryChange();
      void refresh();
    });
    activeRunBulkAction = async (action, actionCtx) => {
      const ids = actionCtx.getSelectedIds();
      if (ids.length === 0) {
        return;
      }
      if (action.confirm) {
        const ok = await wpdConfirmGlobal$1({
          message: sprintf(
            /* translators: %d: row count. */
            action.confirm,
            ids.length
          ),
          danger: true
        });
        if (!ok) {
          return;
        }
      }
      try {
        const result = await action.run(ids, actionCtx);
        if (result === false) {
          return;
        }
      } catch (err) {
        console.error(
          `[posts-window] bulk action "${action.id}" failed`,
          err
        );
      }
      table.clearSelection();
      await refresh();
    };
    const broadcastUnsubs = [];
    if (window.wp?.desktop && typeof window.wp.desktop.subscribe === "function") {
      const onChange = (payload) => {
        const detail = payload;
        if (detail?.source === "posts-window") {
          return;
        }
        void refresh();
      };
      broadcastUnsubs.push(
        window.wp.desktop.subscribe("desktop-mode.post.changed", onChange)
      );
      const onTermChange = (payload) => {
        const detail = payload;
        if (detail?.taxonomy === "category") {
          clearCategoryTreeCache();
          broadcastFreshCategoryTreeToPickers(client);
        }
      };
      broadcastUnsubs.push(
        window.wp.desktop.subscribe(
          "desktop-mode.term.changed",
          onTermChange
        )
      );
    }
    const repaintColumns = () => {
      cellCache.clear();
      table.columns = buildColumns$1(cellCache, client, filterData);
    };
    void client.fetchAuthorOptions().then((authors) => {
      filterData.authors = authors;
      repaintColumns();
    });
    let tagPage = 0;
    let tagTotalPages = 1;
    let tagFetching = false;
    const TAG_PAGE_SIZE = 50;
    const fetchNextTagPage = async () => {
      if (tagFetching || tagPage >= tagTotalPages) {
        return;
      }
      tagFetching = true;
      try {
        const next = tagPage + 1;
        const res = await client.fetchTagOptions(next, TAG_PAGE_SIZE);
        tagPage = next;
        tagTotalPages = Math.max(tagTotalPages, res.totalPages || next);
        const seen = new Set(filterData.tags.map((t) => t.id));
        for (const item of res.items) {
          if (!seen.has(item.id)) {
            filterData.tags.push(item);
            seen.add(item.id);
          }
        }
        filterData.tagsHasMore = tagPage < tagTotalPages;
        repaintColumns();
      } finally {
        tagFetching = false;
      }
    };
    filterData.loadMoreTags = () => {
      void fetchNextTagPage();
    };
    void fetchNextTagPage();
    const teardownKebabColumns = mountKebabColumnToggles(
      body,
      cellCache,
      repaintColumns,
      client
    );
    let unsubOsSettings = null;
    if (window.wp?.desktop && typeof window.wp.desktop.subscribeOsSettings === "function") {
      let lastHidden = JSON.stringify(
        Array.from(getHiddenColumns()).sort()
      );
      unsubOsSettings = window.wp.desktop.subscribeOsSettings(() => {
        const next = JSON.stringify(
          Array.from(getHiddenColumns()).sort()
        );
        if (next === lastHidden) {
          return;
        }
        lastHidden = next;
        repaintColumns();
        teardownKebabColumns?.refresh();
      });
    }
    const onWindowClosed = (e) => {
      const detail = e.detail;
      if (detail?.windowId !== "desktop-mode-posts") {
        return;
      }
      document.removeEventListener("desktop-mode-window-closed", onWindowClosed);
      for (const unsub of broadcastUnsubs) {
        try {
          unsub();
        } catch {
        }
      }
      broadcastUnsubs.length = 0;
      teardownKebabColumns?.dispose();
      unsubOsSettings?.();
      catsTeardown?.();
      catsTeardown = null;
      tagsTeardown?.();
      tagsTeardown = null;
      if (view.searchDebounce !== null) {
        window.clearTimeout(view.searchDebounce);
        view.searchDebounce = null;
      }
      clearCategoryTreeCache();
    };
    document.addEventListener("desktop-mode-window-closed", onWindowClosed);
    await refresh();
    const hooks = window.wp?.hooks;
    if (hooks && typeof hooks.doAction === "function") {
      hooks.doAction(HOOK_ACTION_OPENED, ctx);
    }
    document.dispatchEvent(
      new CustomEvent("desktop-mode-posts-window-opened", {
        detail: ctx
      })
    );
  }
  function buildBulkActionButton(action, ctx) {
    const btn = document.createElement("wpd-button");
    btn.setAttribute("variant", action.variant ?? "secondary");
    btn.setAttribute("data-desktop-mode-posts-bulk-action", action.id);
    if (action.icon) {
      const icon = document.createElement("span");
      icon.className = `dashicons ${action.icon}`;
      icon.setAttribute("aria-hidden", "true");
      btn.appendChild(icon);
    }
    btn.appendChild(document.createTextNode(" " + action.label));
    btn.addEventListener("click", () => {
      void runBulkActionFor(action, ctx);
    });
    return btn;
  }
  let activeRunBulkAction = async () => {
  };
  async function runBulkActionFor(action, ctx) {
    await activeRunBulkAction(action, ctx);
  }
  function openAdminUrl(url, opts = {}) {
    const api = window.wp?.desktop;
    if (!api || !api.windowManager || !api.deriveWindowId) {
      window.location.href = url;
      return;
    }
    const id = api.deriveWindowId(url);
    api.windowManager.open({
      id,
      baseId: id,
      url,
      title: opts.title ?? url,
      icon: opts.icon ?? "dashicons-admin-generic"
    });
  }
  function mapColumnToOrderby(key) {
    switch (key) {
      case "title":
        return "title";
      case "author":
        return "author";
      case "date":
        return "date";
      case "modified":
        return "modified";
      case "comments":
        return "comment_count";
      default:
        return "date";
    }
  }
  const registry = window.desktopModeNativeWindows ?? (window.desktopModeNativeWindows = {});
  registry["desktop-mode-posts"] = (body) => {
    const client = createPostsWindowClient("desktop-mode-posts");
    return renderPostsWindow(body, client).catch((err) => {
      console.error("[posts-window] render failed:", err);
    });
  };
  registry["desktop-mode-pages"] = (body) => {
    const client = createPostsWindowClient("desktop-mode-pages");
    return renderPostsWindow(body, client).catch((err) => {
      console.error("[pages-window] render failed:", err);
    });
  };
  registry["desktop-mode-users"] = (body) => {
    const client = createUsersWindowClient("desktop-mode-users");
    return Promise.resolve().then(() => usersRender).then((m) => m.renderUsersWindow(body, client)).catch((err) => {
      console.error("[users-window] render failed:", err);
    });
  };
  registry["desktop-mode-user-edit"] = (body) => {
    const profile = body.querySelector(
      "wpd-user-profile[data-wpd-user-profile-host]"
    );
    if (!profile) {
      return;
    }
    void Promise.resolve().then(() => userEditTarget).then((target) => {
      const pending = target.readUserEditTarget();
      let userId = pending.userId && pending.userId > 0 ? pending.userId : 0;
      if (userId <= 0) {
        try {
          userId = window.desktopModeWindowConfig?.["desktop-mode-user-edit"]?.currentUserId ?? 0;
        } catch {
          userId = 0;
        }
      }
      if (userId > 0) {
        profile.setAttribute("user-id", String(userId));
      }
      target.clearUserEditTarget();
      target.subscribeUserEditTarget((next) => {
        if (!profile.isConnected) {
          return;
        }
        if (next.userId && next.userId > 0 && next.userId !== userId) {
          userId = next.userId;
          profile.setAttribute("user-id", String(userId));
          target.clearUserEditTarget();
        }
      });
    });
  };
  function createUserEditClient(windowId = "desktop-mode-user-edit") {
    const getConfig = () => {
      const store = window.desktopModeWindowConfig;
      const cfg = store?.[windowId];
      if (!cfg) {
        throw new Error(
          `[${windowId}] config blob is missing — was the window opened without registration? See \`includes/user-edit-window/window.php\`.`
        );
      }
      return cfg;
    };
    const shellFetch = (input, init, source) => {
      return trackedFetch(input, init, {
        windowId,
        source: source ?? "user-edit-window/rest"
      });
    };
    const fetchUser = async (id) => {
      const cfg = getConfig();
      const base = cfg.usersUrl ?? joinRestUrl(cfg.restRoot, "wp/v2/users");
      const url = joinRestUrl(base, `${id}?context=edit`);
      const res = await shellFetch(
        url,
        {
          method: "GET",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "X-WP-Nonce": cfg.restNonce
          }
        },
        "user-edit-window/load"
      );
      if (!res.ok) {
        throw new Error(`[user-edit] load failed: ${res.status}`);
      }
      return await res.json();
    };
    const saveUser = async (id, patch) => {
      const cfg = getConfig();
      const base = cfg.usersUrl ?? joinRestUrl(cfg.restRoot, "wp/v2/users");
      const res = await shellFetch(
        joinRestUrl(base, `${id}?context=edit`),
        {
          method: "POST",
          // PUT == POST for WP REST when X-HTTP-Method-Override is unsupported.
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.restNonce,
            "X-HTTP-Method-Override": "PUT"
          },
          body: JSON.stringify(patch)
        },
        "user-edit-window/save"
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const fieldErrors = {};
        const params = data.data?.params;
        if (params && typeof params === "object") {
          for (const [k, v] of Object.entries(params)) {
            fieldErrors[k] = String(v);
          }
        }
        return {
          ok: false,
          error: data.code ?? `http_${res.status}`,
          message: data.message,
          fieldErrors
        };
      }
      const user = await res.json();
      return { ok: true, user };
    };
    const fetchInsights = async (id, opts = {}) => {
      const cfg = getConfig();
      const base = cfg.insightsUrlBase ?? joinRestUrl(cfg.restRoot, "desktop-mode/v1/users/");
      const url = new URL(joinRestUrl(base, `${id}/insights`));
      if (opts.fresh) {
        url.searchParams.set("fresh", "1");
      }
      const res = await shellFetch(
        url.toString(),
        {
          method: "GET",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "X-WP-Nonce": cfg.restNonce
          }
        },
        "user-edit-window/insights"
      );
      if (!res.ok) {
        throw new Error(`[user-edit] insights failed: ${res.status}`);
      }
      return await res.json();
    };
    return {
      windowId,
      getConfig,
      fetchUser,
      saveUser,
      fetchInsights
    };
  }
  const styles$1 = css`:host{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var( --desktop-mode-text,#1d2327 );cursor:pointer}label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}input[ type='checkbox' ]{accent-color:var( --wp-admin-theme-color,#2271b1 );cursor:pointer}:host( [ disabled ] ){opacity:0.5;cursor:not-allowed}:host( [ disabled ] ) label,:host( [ disabled ] ) input[ type='checkbox' ]{cursor:not-allowed}`;
  const _WpdCheckboxLabel = class _WpdCheckboxLabel extends Component {
    render() {
      const label = this.label || "";
      const checked = this.checked !== null;
      const disabled = this.disabled !== null;
      return html`
			<label>
				<input
					type="checkbox"
					?checked=${checked}
					?disabled=${disabled}
					@change=${(e) => this._onChange(e)}
				/>
				<span class="wpd-checkbox-label__text">${label}</span>
			</label>
		`;
    }
    _onChange(e) {
      if (this.disabled !== null) {
        return;
      }
      const next = e.target.checked;
      if (next) {
        this.setAttribute("checked", "");
      } else {
        this.removeAttribute("checked");
      }
      this.emit("wpd-checkbox-change", { checked: next });
    }
  };
  _WpdCheckboxLabel.props = ["label", "checked", "disabled"];
  _WpdCheckboxLabel.styles = [styles$1];
  _WpdCheckboxLabel.help = {
    title: "Checkbox label",
    summary: "Opinionated label-row variant of <wpd-checkbox>: label text + checkbox in a single aligned row. Use when you want the shipped layout without any layout work.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "label",
        type: "string",
        description: "Visible label text, paired with the checkbox via a native <label>."
      },
      {
        name: "checked",
        type: "boolean attribute",
        description: "Reflects and controls the checked state."
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "When present, the checkbox is not interactive and dimmed."
      }
    ],
    events: [
      {
        name: "wpd-checkbox-change",
        description: "Fires when the user toggles the checkbox.",
        detail: "{ checked: boolean }"
      }
    ],
    cssProps: [
      { name: "--desktop-mode-text", description: "Label colour." }
    ],
    example: html`
			<wpd-checkbox-label label="Reduce motion" checked></wpd-checkbox-label>
		`
  };
  let WpdCheckboxLabel = _WpdCheckboxLabel;
  defineComponent("wpd-checkbox-label", WpdCheckboxLabel);
  const styles = css`:host{display:inline-flex;align-items:center;justify-content:center;width:var( --wpd-icon-size,16px );height:var( --wpd-icon-size,16px );color:inherit;line-height:1}:host( [ hidden ] ){display:none}.wpd-icon__glyph{font-size:var( --wpd-icon-size,16px );width:var( --wpd-icon-size,16px );height:var( --wpd-icon-size,16px );line-height:1;color:inherit;display:inline-flex;align-items:center;justify-content:center}.wpd-icon__glyph--char{font-family:dashicons;font-style:normal;font-weight:normal;font-variant:normal;text-transform:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;speak:none}.wpd-icon__glyph.dashicons{font-family:dashicons}`;
  let _cache = null;
  function parseCssContentToChar(raw) {
    let value = raw.trim();
    if (value === "") {
      return null;
    }
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    const escaped = value.match(/^\\([0-9a-f]{1,6})\s?$/i);
    if (escaped) {
      return String.fromCodePoint(parseInt(escaped[1], 16));
    }
    return value || null;
  }
  function buildMap() {
    const map = /* @__PURE__ */ new Map();
    if (typeof document === "undefined") {
      return map;
    }
    const sheets = Array.from(document.styleSheets ?? []);
    for (const sheet of sheets) {
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      if (!rules) {
        continue;
      }
      for (const rule of Array.from(rules)) {
        const styleRule = rule;
        if (!styleRule || !styleRule.selectorText) {
          continue;
        }
        const match = styleRule.selectorText.match(
          /\.dashicons-([a-z0-9-]+)::?before/i
        );
        if (!match) {
          continue;
        }
        const content = styleRule.style?.content;
        if (!content) {
          continue;
        }
        const char = parseCssContentToChar(content);
        if (char) {
          map.set(match[1], char);
        }
      }
    }
    return map;
  }
  function resolveDashicon(name) {
    if (!_cache) {
      _cache = buildMap();
    }
    const slug = name.startsWith("dashicons-") ? name.slice("dashicons-".length) : name;
    return _cache.get(slug) ?? null;
  }
  function refreshDashiconCache() {
    _cache = buildMap();
  }
  let _scheduled = false;
  function primeOnLoad() {
    if (_scheduled || typeof window === "undefined") {
      return;
    }
    _scheduled = true;
    const refresh = () => {
      refreshDashiconCache();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", refresh, { once: true });
    }
    window.addEventListener("load", refresh, { once: true });
  }
  primeOnLoad();
  const _WpdIcon = class _WpdIcon extends Component {
    render() {
      const rawName = this.name || "";
      const slug = rawName.startsWith("dashicons-") ? rawName.slice("dashicons-".length) : rawName;
      const size = this.size;
      if (size && /^\d+$/.test(size)) {
        this.style.setProperty("--wpd-icon-size", `${size}px`);
      }
      const char = resolveDashicon(slug);
      if (char) {
        return html`<span
				class="wpd-icon__glyph wpd-icon__glyph--char dashicons dashicons-${slug}"
				aria-hidden="true"
			>${char}</span>`;
      }
      return html`<span
			class="wpd-icon__glyph dashicons dashicons-${slug}"
			aria-hidden="true"
		></span>`;
    }
  };
  _WpdIcon.props = ["name", "size"];
  _WpdIcon.styles = [styles];
  _WpdIcon.help = {
    title: "Icon",
    summary: 'Dashicon wrapper that inherits theme colour + sizing from its context. Accepts either the dashicon suffix ("calculator") or the full class ("dashicons-calculator"). Marked aria-hidden; wrap in a button/link with its own label for accessible use.',
    status: "stable",
    since: "0.5.0",
    props: [
      {
        name: "name",
        type: "string",
        description: "Dashicon identifier, with or without the `dashicons-` prefix."
      },
      {
        name: "size",
        type: "integer (px)",
        default: "16",
        description: "Glyph size in pixels."
      }
    ],
    cssProps: [
      { name: "--wpd-icon-size", default: "16px" }
    ],
    example: html`
			<wpd-cluster gap="8" align="center">
				<wpd-icon name="admin-post"></wpd-icon>
				<wpd-icon name="calculator" size="20"></wpd-icon>
				<wpd-icon name="dashicons-star-filled" size="32"></wpd-icon>
			</wpd-cluster>
		`
  };
  let WpdIcon = _WpdIcon;
  defineComponent("wpd-icon", WpdIcon);
  const textFieldStyles = css`:host{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var( --desktop-mode-text,#1d2327 );min-width:0}:host( [ hidden ] ){display:none}.wpd-text-field__label{font-size:12px;color:var( --desktop-mode-muted,#646970 )}.wpd-text-field__row{position:relative;display:flex;align-items:center;width:100%}input{appearance:none;-webkit-appearance:none;display:block;width:100%;min-width:0;box-sizing:border-box;padding:7px 10px;background:var( --desktop-mode-window-bg,#fff );border:1px solid var( --desktop-mode-border,#dcdcde );border-radius:6px;font:inherit;font-size:13px;color:var( --desktop-mode-text,#1d2327 );transition:border-color 0.12s ease,box-shadow 0.12s ease}.wpd-text-field__suffix{position:absolute;inset-inline-end:10px;top:50%;transform:translateY( -50% );pointer-events:none;font-size:12px;color:var( --desktop-mode-muted,#646970 )}.wpd-text-field__row--has-reveal input{padding-inline-end:36px}.wpd-text-field__reveal{position:absolute;inset-inline-end:0;top:0;bottom:0;width:34px;display:flex;align-items:center;justify-content:center;padding:0;border:none;background:transparent;color:var( --desktop-mode-muted,#646970 );cursor:pointer;border-radius:0 6px 6px 0;transition:color 0.12s ease}.wpd-text-field__reveal:hover{color:var( --wp-admin-theme-color,#2271b1 )}.wpd-text-field__reveal:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-2px;border-radius:0 6px 6px 0}.wpd-text-field__reveal:disabled{opacity:0.45;cursor:not-allowed}.wpd-text-field__input--masked{-webkit-text-security:disc;text-security:disc}@supports not ( ( -webkit-text-security:disc ) or ( text-security:disc ) ){.wpd-text-field__input--masked{font-family:text-security-disc,"password",monospace;letter-spacing:0.2em}}input:hover{border-color:var( --desktop-mode-muted,#8c8f94 )}input:focus-visible{outline:none;border-color:var( --wp-admin-theme-color,#2271b1 );box-shadow:0 0 0 1px var( --wp-admin-theme-color,#2271b1 )}input:disabled{opacity:0.55;cursor:not-allowed;background:rgba( 0,0,0,0.03 )}input[ aria-invalid='true' ]{border-color:#d63638}input[ aria-invalid='true' ]:focus-visible{box-shadow:0 0 0 1px #d63638}input[ type='number' ]::-webkit-inner-spin-button,input[ type='number' ]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[ type='number' ]{-moz-appearance:textfield}`;
  const _WpdTextField = class _WpdTextField extends Component {
    constructor() {
      super(...arguments);
      this._revealed = false;
    }
    connectedCallback() {
      super.connectedCallback();
      ensureAutoId(this);
    }
    render() {
      const label = this.label || "";
      const value = this.value ?? "";
      const placeholder = this.placeholder || "";
      const disabled = this.disabled !== null;
      const readonly = this.readonly !== null;
      const declaredAutocomplete = this.autocomplete;
      const declaredType = this.type || "text";
      const isPassword = declaredType === "password";
      let autocomplete = declaredAutocomplete || "off";
      if (isPassword && (!declaredAutocomplete || autocomplete === "off")) {
        autocomplete = "new-password";
      }
      const maxLength = this.maxlength;
      const minLength = this.minlength;
      const pattern = this.pattern || "";
      const name = this.name || "";
      const suffix = this.suffix || "";
      const invalid = this.invalid !== null;
      const reveal = this.reveal !== null;
      const isPasswordIntent = declaredType === "password";
      const isMasked = isPasswordIntent && !(reveal && this._revealed);
      let effectiveType;
      if (isPasswordIntent) {
        effectiveType = "text";
      } else if (reveal && this._revealed) {
        effectiveType = "text";
      } else {
        effectiveType = declaredType;
      }
      const rowClass = reveal ? "wpd-text-field__row wpd-text-field__row--has-reveal" : "wpd-text-field__row";
      const inputClass = isMasked ? "wpd-text-field__input wpd-text-field__input--masked" : "wpd-text-field__input";
      const hostId = this.id || "wpd-unnamed";
      const inputId = `${hostId}__input`;
      return html`
			${label ? html`<label
						class="wpd-text-field__label"
						for=${inputId}
					>${label}</label>` : html``}
			<span class=${rowClass}>
				<input
					id=${inputId}
					class=${inputClass}
					type=${effectiveType}
					.value=${value}
					placeholder=${placeholder}
					?disabled=${disabled}
					?readonly=${readonly}
					autocomplete=${autocomplete}
					maxlength=${maxLength ?? ""}
					minlength=${minLength ?? ""}
					pattern=${pattern}
					name=${name}
					aria-invalid=${invalid ? "true" : "false"}
					aria-label=${label || ""}
					@input=${(e) => this._onInput(e)}
					@change=${(e) => this._onChange(e)}
					@keydown=${(e) => this._onKeyDown(e)}
				/>
				${suffix ? html`<span class="wpd-text-field__suffix">${suffix}</span>` : html``}
				${reveal ? this._renderRevealButton(disabled) : html``}
			</span>
		`;
    }
    _renderRevealButton(disabled) {
      const label = this._revealed ? "Hide" : "Show";
      return html`
			<button
				type="button"
				class="wpd-text-field__reveal"
				aria-label=${label}
				aria-pressed=${this._revealed ? "true" : "false"}
				?disabled=${disabled}
				tabindex="0"
				@click=${() => this._onToggleReveal()}
			>
				${this._revealed ? _iconEyeOff() : _iconEye()}
			</button>
		`;
    }
    _onToggleReveal() {
      this._revealed = !this._revealed;
      this.requestUpdate();
    }
    _onInput(e) {
      const input = e.target;
      this.value = input.value;
      this.emit("wpd-input-change", { value: input.value });
    }
    _onChange(e) {
      const input = e.target;
      this.emit("wpd-input-commit", { value: input.value });
    }
    _onKeyDown(e) {
      if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey) {
        const input = e.target;
        this.emit("wpd-submit", { value: input.value });
      }
    }
  };
  _WpdTextField.props = [
    "label",
    "value",
    "placeholder",
    "disabled",
    "readonly",
    "autocomplete",
    "type",
    "maxlength",
    "minlength",
    "pattern",
    "name",
    "suffix",
    "invalid",
    "reveal"
  ];
  _WpdTextField.styles = [textFieldStyles];
  _WpdTextField.help = {
    title: "Text field",
    summary: "Labelled text input primitive. Two-way reflects `value`, emits wpd-input-change per keystroke, wpd-input-commit on blur/change, and wpd-submit on Enter. Optional password reveal toggle.",
    status: "stable",
    since: "0.5.0",
    props: [
      { name: "label", type: "string", description: "Visible label above the input." },
      { name: "value", type: "string", description: "Current input value; reflected two-way." },
      { name: "placeholder", type: "string", description: "Native placeholder string." },
      { name: "disabled", type: "boolean attribute", description: "Disables the native input." },
      { name: "readonly", type: "boolean attribute", description: "Marks the input readonly." },
      {
        name: "autocomplete",
        type: "string",
        default: "off",
        description: "Forwarded to the native input autocomplete attribute."
      },
      {
        name: "type",
        type: "string",
        default: "text",
        description: "Native input type (text, password, email, search, tel, url)."
      },
      { name: "maxlength", type: "integer (string)", description: "Native maxlength." },
      { name: "minlength", type: "integer (string)", description: "Native minlength." },
      { name: "pattern", type: "regex string", description: "Native validation pattern." },
      { name: "name", type: "string", description: "Forwarded to the native input for form submission." },
      { name: "suffix", type: "string", description: "Text rendered inside the right edge of the input row." },
      {
        name: "invalid",
        type: "boolean attribute",
        description: "Marks the field aria-invalid and applies the error style."
      },
      {
        name: "reveal",
        type: "boolean attribute",
        description: 'On type="password" fields, adds an eye-icon toggle that flips the input between hidden and visible text.'
      }
    ],
    events: [
      {
        name: "wpd-input-change",
        description: "Fires on every input keystroke.",
        detail: "{ value: string }"
      },
      {
        name: "wpd-input-commit",
        description: "Fires on the native change event (blur / Enter).",
        detail: "{ value: string }"
      },
      {
        name: "wpd-submit",
        description: "Fires when the user presses Enter (without Shift/Alt/Meta).",
        detail: "{ value: string }"
      }
    ],
    cssProps: [
      { name: "--desktop-mode-text", description: "Text colour." },
      { name: "--desktop-mode-muted", description: "Label + suffix colour." },
      { name: "--desktop-mode-border", description: "Input outline." },
      { name: "--desktop-mode-window-bg", description: "Input background." }
    ],
    example: html`
			<wpd-stack gap="8">
				<wpd-text-field label="Note title" value="Untitled" placeholder="Name this note"></wpd-text-field>
				<wpd-text-field type="password" reveal label="API key"></wpd-text-field>
			</wpd-stack>
		`
  };
  let WpdTextField = _WpdTextField;
  defineComponent("wpd-text-field", WpdTextField);
  function _iconEye() {
    return html`
		<svg
			viewBox="0 0 16 16"
			width="14"
			height="14"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			<path d="M1 8C1 8 3.5 3 8 3s7 5 7 5-2.5 5-7 5S1 8 1 8z" />
			<circle cx="8" cy="8" r="2" />
		</svg>
	`;
  }
  function _iconEyeOff() {
    return html`
		<svg
			viewBox="0 0 16 16"
			width="14"
			height="14"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			<path d="M1 8C1 8 3.5 3 8 3s7 5 7 5-2.5 5-7 5S1 8 1 8z" />
			<circle cx="8" cy="8" r="2" />
			<line x1="2" y1="2" x2="14" y2="14" />
		</svg>
	`;
  }
  function resolveUserEditClient() {
    const store = window.desktopModeWindowConfig;
    if (store?.["desktop-mode-user-edit"]) {
      return createUserEditClient("desktop-mode-user-edit");
    }
    if (store?.["desktop-mode-users"]) {
      return createUserEditClient("desktop-mode-users");
    }
    return createUserEditClient("desktop-mode-user-edit");
  }
  function notifyToast$1(body, kind = "info") {
    const api = window.wp?.desktop;
    if (api?.showToast) {
      let duration;
      if (kind === "error") {
        duration = 8e3;
      } else if (kind === "success") {
        duration = 5e3;
      }
      api.showToast({ message: body, duration });
      return;
    }
    console.info("[user-edit-window]", body);
  }
  async function mountProfileFormAt(host, userId) {
    return loadAndMountProfile(host, userId);
  }
  async function mountProfileAsideAt(host, userId, fresh) {
    return renderInsightsAside(host, userId, fresh);
  }
  async function mountProfileActivityAt(host, userId, fresh) {
    return renderInsightsActivity(host, userId, fresh);
  }
  async function loadAndMountProfile(host, userId) {
    host.replaceChildren();
    const skeleton = document.createElement("div");
    skeleton.className = "desktop-mode-user-edit__skeleton";
    skeleton.style.cssText = "display:flex;align-items:center;justify-content:center;padding:48px;color:var(--desktop-mode-muted, #50575e);font-size:13px;";
    skeleton.textContent = __("Loading profile…");
    host.appendChild(skeleton);
    let user;
    try {
      user = await resolveUserEditClient().fetchUser(userId);
    } catch (err) {
      host.replaceChildren();
      const msg = document.createElement("p");
      msg.style.cssText = "padding:32px;color:#b32d2e;font-size:13px;text-align:center;";
      msg.textContent = sprintf(
        // translators: %s is an error message.
        __("Could not load profile (%s)."),
        String(err.message ?? err)
      );
      host.appendChild(msg);
      throw err;
    }
    host.replaceChildren();
    mountProfileForm(host, user, userId);
    return user;
  }
  function resolveProfileConfig() {
    const store = window.desktopModeWindowConfig;
    const userEdit = store?.["desktop-mode-user-edit"];
    const users = store?.["desktop-mode-users"];
    return {
      ...users ?? {},
      ...userEdit ?? {}
    };
  }
  function mountProfileForm(host, user, userId) {
    const cfg = resolveProfileConfig();
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-user-edit__profile";
    const form = document.createElement("wpd-form");
    form.setAttribute("submit-label", __("Save changes"));
    form.setAttribute("reset-label", __("Revert"));
    form.setAttribute("columns", "auto");
    const header = document.createElement("div");
    header.setAttribute("slot", "header");
    let profileHeader = buildProfileHeader(user);
    header.appendChild(profileHeader);
    form.appendChild(header);
    form.appendChild(textField("username", __("Username"), user.username, {
      readonly: true
    }));
    form.appendChild(textField("first_name", __("First name"), user.first_name));
    form.appendChild(textField("last_name", __("Last name"), user.last_name));
    form.appendChild(
      textField("nickname", __("Nickname"), user.nickname ?? "", {
        required: true,
        fullWidth: false
      })
    );
    const displaySelect = document.createElement("wpd-select");
    displaySelect.setAttribute("name", "name");
    displaySelect.setAttribute("label", __("Display name publicly as"));
    displaySelect.items = displayNameCandidates(user);
    displaySelect.value = user.name;
    form.appendChild(displaySelect);
    form.appendChild(
      textField("email", __("Email (required)"), user.email, {
        required: true,
        type: "email"
      })
    );
    form.appendChild(textField("url", __("Website"), user.url, { type: "url" }));
    const contactMethods = cfg.contactMethods ?? {};
    for (const [slug, label] of Object.entries(contactMethods)) {
      const value = typeof user.meta === "object" && user.meta !== null ? String(
        user.meta[slug] ?? ""
      ) : "";
      form.appendChild(
        textField(`meta.${slug}`, label, value, {
          dataset: { meta: slug }
        })
      );
    }
    const bio = document.createElement("wpd-textarea");
    bio.setAttribute("name", "description");
    bio.setAttribute("label", __("Biographical info"));
    bio.setAttribute(
      "placeholder",
      __("Share a little about yourself — visible on author archives.")
    );
    bio.setAttribute("rows", "4");
    bio.setAttribute("full-width", "");
    bio.value = user.description;
    bio.setAttribute("value", user.description);
    form.appendChild(bio);
    const localeSelect = document.createElement("wpd-select");
    localeSelect.setAttribute("name", "locale");
    localeSelect.setAttribute("label", __("Language"));
    const locales = cfg.locales ?? { "": __("Site default") };
    localeSelect.items = Object.entries(locales).map(([value, label]) => ({
      value,
      label
    }));
    localeSelect.value = String(user.locale ?? "");
    form.appendChild(localeSelect);
    const isSelfEdit = userId === (cfg.currentUserId ?? 0);
    const roleMap = (() => {
      const assignable = cfg.assignableRoles;
      if (assignable && Object.keys(assignable).length > 0) {
        return assignable;
      }
      return cfg.allRoles ?? {};
    })();
    if (!isSelfEdit) {
      const roleSelect = document.createElement("wpd-select");
      roleSelect.setAttribute("name", "roles[0]");
      roleSelect.setAttribute("label", __("Role"));
      roleSelect.items = Object.entries(roleMap).map(([value, label]) => ({
        value,
        label
      }));
      const currentRole = Array.isArray(user.roles) ? user.roles[0] ?? "" : "";
      roleSelect.value = currentRole;
      form.appendChild(roleSelect);
    }
    {
      const optsHeading = document.createElement("h3");
      optsHeading.setAttribute("full-width", "");
      optsHeading.textContent = __("Personal options");
      optsHeading.style.cssText = "margin:18px 0 4px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--desktop-mode-muted, #50575e);";
      form.appendChild(optsHeading);
      const meta = user.meta ?? {};
      const richEditing = String(meta.rich_editing ?? "") !== "false";
      const syntaxHighlighting = String(meta.syntax_highlighting ?? "") !== "false";
      const commentShortcuts = String(meta.comment_shortcuts ?? "false") === "true";
      const adminBarFront = String(meta.show_admin_bar_front ?? "true") !== "false";
      form.appendChild(
        checkboxField(
          "meta.rich_editing",
          __("Disable the visual editor when writing"),
          !richEditing,
          { trueValue: "false", falseValue: "true", fullWidth: true }
        )
      );
      form.appendChild(
        checkboxField(
          "meta.syntax_highlighting",
          __("Disable syntax highlighting when editing code"),
          !syntaxHighlighting,
          { trueValue: "false", falseValue: "true", fullWidth: true }
        )
      );
      form.appendChild(
        checkboxField(
          "meta.comment_shortcuts",
          __("Enable keyboard shortcuts for comment moderation"),
          commentShortcuts,
          { trueValue: "true", falseValue: "false", fullWidth: true }
        )
      );
      form.appendChild(
        checkboxField(
          "meta.show_admin_bar_front",
          __("Show toolbar when viewing site"),
          adminBarFront,
          { trueValue: "true", falseValue: "false", fullWidth: true }
        )
      );
      const colorSchemes = cfg.colorSchemes ?? {};
      const currentScheme = String(meta.admin_color ?? "fresh");
      form.appendChild(
        buildAdminColorPicker(colorSchemes, currentScheme, {
          livePreview: isSelfEdit
        })
      );
    }
    const pwdHeading = document.createElement("h3");
    pwdHeading.setAttribute("full-width", "");
    pwdHeading.textContent = __("Account management");
    pwdHeading.style.cssText = "margin:18px 0 4px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--desktop-mode-muted, #50575e);";
    form.appendChild(pwdHeading);
    const pwdRow = document.createElement("div");
    pwdRow.setAttribute("full-width", "");
    pwdRow.style.cssText = "display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;";
    const pwd = document.createElement("wpd-text-field");
    pwd.setAttribute("name", "password");
    pwd.setAttribute("type", "password");
    pwd.setAttribute("reveal", "");
    pwd.setAttribute("label", __("New password"));
    pwd.setAttribute(
      "placeholder",
      __("Leave blank to keep the current password.")
    );
    pwd.setAttribute("autocomplete", "new-password");
    pwd.style.flex = "1 1 280px";
    pwdRow.appendChild(pwd);
    const genBtn = document.createElement("wpd-button");
    genBtn.setAttribute("variant", "ghost");
    genBtn.setAttribute("type", "button");
    const genIcon = document.createElement("wpd-icon");
    genIcon.setAttribute("name", "randomize");
    genIcon.setAttribute("size", "14");
    genBtn.appendChild(genIcon);
    genBtn.appendChild(document.createTextNode(__("Generate strong")));
    genBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const next = generateStrongPassword$1(18);
      pwd.value = next;
      pwd.setAttribute("value", next);
      const pwdConfirmEl = form.querySelector(
        'wpd-text-field[name="password_confirm"]'
      );
      if (pwdConfirmEl) {
        pwdConfirmEl.value = next;
        pwdConfirmEl.setAttribute("value", next);
      }
      void navigator.clipboard?.writeText(next).catch(() => {
      });
      notifyToast$1(__("Password generated and copied to clipboard."), "success");
    });
    pwdRow.appendChild(genBtn);
    form.appendChild(pwdRow);
    const pwdConfirm = document.createElement("wpd-text-field");
    pwdConfirm.setAttribute("name", "password_confirm");
    pwdConfirm.setAttribute("type", "password");
    pwdConfirm.setAttribute("reveal", "");
    pwdConfirm.setAttribute("label", __("Confirm new password"));
    pwdConfirm.setAttribute(
      "placeholder",
      __("Type the new password again.")
    );
    pwdConfirm.setAttribute("autocomplete", "new-password");
    pwdConfirm.setAttribute("full-width", "");
    form.appendChild(pwdConfirm);
    form.appendChild(
      buildSessionsRow(userId, isSelfEdit)
    );
    form.appendChild(buildAppPasswordsRow(userId));
    if (!isSelfEdit && cfg.isMultisite && user.meta?.is_super_admin !== void 0) {
      form.appendChild(
        checkboxField(
          "meta.is_super_admin",
          __("Grant super admin privileges for the network"),
          Boolean(
            user.meta?.is_super_admin
          ),
          { trueValue: "true", falseValue: "false", fullWidth: true }
        )
      );
    }
    let pending = false;
    form.addEventListener("wpd-form-submit", (e) => {
      const detail = e.detail;
      void onSubmit(detail.values);
    });
    const onSubmit = async (values) => {
      if (pending) {
        return;
      }
      pending = true;
      form.setBusy(true);
      form.clearErrors();
      const patch = {
        first_name: values.first_name,
        last_name: values.last_name,
        nickname: values.nickname,
        name: values.name,
        email: values.email,
        url: values.url,
        description: values.description,
        locale: values.locale ?? ""
      };
      if (typeof values.password === "string" && values.password !== "") {
        const confirm = String(values.password_confirm ?? "");
        if (confirm !== values.password) {
          form.setError(__("The two password fields do not match."));
          form.setFieldInvalid("password_confirm");
          pending = false;
          form.setBusy(false);
          return;
        }
        patch.password = values.password;
      }
      if (typeof values["roles[0]"] === "string" && values["roles[0]"]) {
        patch.roles = [values["roles[0]"]];
      }
      const meta = {};
      for (const [k, v] of Object.entries(values)) {
        if (!k.startsWith("meta.")) {
          continue;
        }
        let resolved = v;
        if (typeof v === "boolean") {
          const field = form.querySelector(`[name="${k}"]`);
          const valueAttr = field?.getAttribute("value");
          resolved = valueAttr ?? String(v);
        }
        meta[k.slice(5)] = resolved;
      }
      if (Object.keys(meta).length > 0) {
        patch.meta = meta;
      }
      const result = await resolveUserEditClient().saveUser(userId, patch);
      pending = false;
      form.setBusy(false);
      if (!result.ok) {
        const summary = result.message ?? mapErrorCode(result.error) ?? __("Save failed.");
        form.setError(summary);
        notifyToast$1(summary, "error");
        if (result.fieldErrors) {
          for (const field of Object.keys(result.fieldErrors)) {
            form.setFieldInvalid(field);
          }
        }
        console.warn("[user-edit] save failed", {
          code: result.error,
          message: result.message
        });
        return;
      }
      notifyToast$1(__("Profile saved."), "success");
      const broadcastApi = window.wp?.desktop;
      broadcastApi?.broadcast?.("desktop-mode.user.changed", {
        source: "user-edit-window",
        action: "updated",
        ids: [userId]
      });
      pwd.value = "";
      pwd.setAttribute("value", "");
      pwdConfirm.value = "";
      pwdConfirm.setAttribute("value", "");
      if (result.user) {
        Object.assign(user, result.user);
        const next = buildProfileHeader(user);
        profileHeader.replaceWith(next);
        profileHeader = next;
        const aside = host.ownerDocument?.querySelector(
          "[data-wpd-user-profile-aside]"
        );
        if (aside) {
          void mountProfileAsideAt(aside, userId, true);
        }
      }
    };
    wrap.appendChild(form);
    host.appendChild(wrap);
  }
  function buildProfileHeader(user) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-user-edit__header";
    wrap.style.cssText = "display:flex;align-items:center;gap:16px;margin:0 0 12px;";
    const avatar = document.createElement("wpd-avatar");
    avatar.setAttribute("size", "64");
    if (user.name || user.username) {
      avatar.setAttribute("name", user.name || user.username || "");
    }
    if (user.id > 0) {
      avatar.setAttribute("user-id", String(user.id));
    }
    const avatars = user.avatar_urls ?? {};
    const rawAvatar = avatars["96"] ?? avatars["48"] ?? "";
    if (rawAvatar) {
      applyAvatarSrc(avatar, rawAvatar);
    }
    wrap.appendChild(avatar);
    const text = document.createElement("div");
    text.style.cssText = "min-width:0;display:flex;flex-direction:column;gap:4px;";
    const name = document.createElement("div");
    name.style.cssText = "font-size:18px;font-weight:600;letter-spacing:-0.01em;";
    name.textContent = user.name || user.username || `#${user.id}`;
    text.appendChild(name);
    const sub = document.createElement("div");
    sub.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;color:var(--desktop-mode-muted, #50575e);flex-wrap:wrap;";
    const handle = document.createElement("span");
    handle.textContent = `@${user.username}`;
    sub.appendChild(handle);
    const dot = document.createElement("span");
    dot.textContent = "·";
    dot.setAttribute("aria-hidden", "true");
    sub.appendChild(dot);
    const roleStr = Array.isArray(user.roles) ? user.roles.join(", ") : "";
    const roleSpan = document.createElement("span");
    roleSpan.textContent = roleStr || __("No role");
    sub.appendChild(roleSpan);
    text.appendChild(sub);
    wrap.appendChild(text);
    return wrap;
  }
  async function loadInsightsInto(host, userId, fresh) {
    host.replaceChildren();
    const skeleton = document.createElement("div");
    skeleton.style.cssText = "display:flex;align-items:center;justify-content:center;padding:32px;color:var(--desktop-mode-muted, #50575e);font-size:13px;";
    skeleton.textContent = __("Loading insights…");
    host.appendChild(skeleton);
    try {
      return await resolveUserEditClient().fetchInsights(userId, { fresh });
    } catch (err) {
      host.replaceChildren();
      const msg = document.createElement("p");
      msg.style.cssText = "padding:24px;color:#b32d2e;font-size:13px;text-align:center;";
      msg.textContent = sprintf(
        // translators: %s is an error message.
        __("Could not load insights (%s)."),
        String(err.message ?? err)
      );
      host.appendChild(msg);
      return null;
    }
  }
  async function renderInsightsAside(host, userId, fresh) {
    const data = await loadInsightsInto(host, userId, fresh);
    if (!data) {
      return;
    }
    host.replaceChildren();
    host.appendChild(buildAsideSummary(data));
    host.appendChild(buildAsideStatGrid(data));
    host.appendChild(buildContentSparkline(data));
  }
  async function renderInsightsActivity(host, userId, fresh) {
    const data = await loadInsightsInto(host, userId, fresh);
    if (!data) {
      return;
    }
    host.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-user-edit__activity";
    const heading = document.createElement("h3");
    heading.textContent = __("Recent activity");
    heading.style.cssText = "margin:24px 0 12px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--desktop-mode-muted, #50575e);";
    wrap.appendChild(heading);
    wrap.appendChild(buildRecentLists(data));
    wrap.appendChild(buildSecurityPanel(data));
    host.appendChild(wrap);
  }
  function buildAsideSummary(data) {
    const card = document.createElement("div");
    card.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "text-align:center",
      "gap:6px",
      "padding:16px",
      "border:1px solid var(--desktop-mode-border, #dcdcde)",
      "border-radius:12px",
      "background:var(--wp-admin-theme-bg-elevated, #f6f7f7)"
    ].join(";");
    const avatar = document.createElement("img");
    avatar.src = data.avatarUrl;
    avatar.alt = "";
    avatar.style.cssText = "width:72px;height:72px;border-radius:50%;flex-shrink:0;";
    card.appendChild(avatar);
    const name = document.createElement("div");
    name.style.cssText = "font-size:15px;font-weight:600;letter-spacing:-0.01em;";
    name.textContent = data.displayName || `#${data.userId}`;
    card.appendChild(name);
    const roles = document.createElement("div");
    roles.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;justify-content:center;";
    for (const role of data.roles) {
      const chip = document.createElement("span");
      chip.textContent = role;
      chip.style.cssText = [
        "display:inline-flex",
        "padding:2px 8px",
        "border-radius:10px",
        "background:rgba(34,113,177,0.10)",
        "color:#0a4b78",
        "font-size:11px",
        "font-weight:600"
      ].join(";");
      roles.appendChild(chip);
    }
    if (data.roles.length === 0) {
      const noRole = document.createElement("span");
      noRole.textContent = __("No role");
      noRole.style.cssText = "font-size:11px;color:var(--desktop-mode-muted, #8c8f94);";
      roles.appendChild(noRole);
    }
    card.appendChild(roles);
    const completeness = data.profileCompleteness;
    if (completeness && completeness.total > 0) {
      const cwrap = document.createElement("div");
      cwrap.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;margin-top:6px;";
      const top = document.createElement("div");
      top.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;font-size:11px;color:var(--desktop-mode-muted, #50575e);";
      const lbl = document.createElement("span");
      lbl.textContent = __("Profile completeness");
      const pct = document.createElement("span");
      pct.style.cssText = "font-variant-numeric:tabular-nums;font-weight:600;";
      pct.textContent = `${completeness.percent}%`;
      top.appendChild(lbl);
      top.appendChild(pct);
      cwrap.appendChild(top);
      const track = document.createElement("div");
      track.style.cssText = [
        "height:4px",
        "border-radius:999px",
        "background:rgba(0,0,0,0.06)",
        "position:relative",
        "overflow:hidden"
      ].join(";");
      const bar = document.createElement("div");
      bar.style.cssText = [
        "position:absolute",
        "inset:0",
        `width:${completeness.percent}%`,
        "background:var(--wp-admin-theme-color, #2271b1)",
        "transition:width 360ms ease"
      ].join(";");
      track.appendChild(bar);
      cwrap.appendChild(track);
      card.appendChild(cwrap);
    }
    return card;
  }
  function buildAsideStatGrid(data) {
    const grid = document.createElement("div");
    grid.style.cssText = [
      "display:grid",
      "grid-template-columns:1fr 1fr",
      "gap:8px",
      "margin-top:12px"
    ].join(";");
    const tile = (label, value, sub) => {
      const card = document.createElement("div");
      card.style.cssText = [
        "border:1px solid var(--desktop-mode-border, #dcdcde)",
        "border-radius:8px",
        "padding:8px 10px",
        "display:flex",
        "flex-direction:column",
        "gap:1px",
        "min-width:0"
      ].join(";");
      const lbl = document.createElement("div");
      lbl.style.cssText = "font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:var(--desktop-mode-muted, #50575e);font-weight:600;";
      lbl.textContent = label;
      const val = document.createElement("div");
      val.style.cssText = "font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;";
      val.textContent = value;
      card.appendChild(lbl);
      card.appendChild(val);
      if (sub) {
        const subEl = document.createElement("div");
        subEl.style.cssText = "font-size:10px;color:var(--desktop-mode-muted, #8c8f94);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        subEl.title = sub;
        subEl.textContent = sub;
        card.appendChild(subEl);
      }
      return card;
    };
    const stats = data.stats;
    let postsSub;
    if (stats.pages > 0) {
      postsSub = sprintf(
        // translators: %d is a count of pages.
        _n("+ %d page", "+ %d pages", stats.pages),
        stats.pages
      );
    }
    grid.appendChild(
      tile(__("Posts"), String(stats.posts), postsSub)
    );
    let commentsSub;
    if (stats.commentsReceived > 0) {
      commentsSub = sprintf(
        // translators: %d is a count of received comments.
        __("%d received"),
        stats.commentsReceived
      );
    }
    grid.appendChild(
      tile(__("Comments"), String(stats.commentsAuthored), commentsSub)
    );
    grid.appendChild(
      tile(
        __("Last login"),
        stats.lastLoginAt ? relativeTime$1(stats.lastLoginAt) : __("Never"),
        stats.lastLoginAt ? new Date(stats.lastLoginAt * 1e3).toLocaleDateString() : void 0
      )
    );
    let memberValue = "—";
    if (stats.daysSinceRegistration !== null) {
      memberValue = sprintf(
        // translators: %d is a number of days.
        _n("%d day", "%d days", stats.daysSinceRegistration),
        stats.daysSinceRegistration
      );
    }
    grid.appendChild(
      tile(
        __("Member"),
        memberValue,
        stats.registeredAt ? new Date(stats.registeredAt * 1e3).toLocaleDateString() : void 0
      )
    );
    return grid;
  }
  function buildContentSparkline(data) {
    const wrap = document.createElement("div");
    wrap.style.cssText = [
      "border:1px solid var(--desktop-mode-border, #dcdcde)",
      "border-radius:10px",
      "padding:14px 16px",
      "margin:0 0 22px"
    ].join(";");
    const head = document.createElement("div");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px;";
    const title = document.createElement("div");
    title.style.cssText = "font-size:13px;font-weight:600;";
    title.textContent = __("Posts published — last 12 months");
    head.appendChild(title);
    const total = data.contentByMonth.reduce((s, m) => s + m.count, 0);
    const sub = document.createElement("div");
    sub.style.cssText = "font-size:11px;color:var(--desktop-mode-muted, #50575e);";
    sub.textContent = sprintf(
      // translators: %d is a count of posts.
      __("%d total"),
      total
    );
    head.appendChild(sub);
    wrap.appendChild(head);
    if (data.contentByMonth.length === 0) {
      const empty = document.createElement("p");
      empty.style.cssText = "margin:0;color:var(--desktop-mode-muted, #50575e);font-size:12px;";
      empty.textContent = __("No activity in the last 12 months.");
      wrap.appendChild(empty);
      return wrap;
    }
    const max = Math.max(1, ...data.contentByMonth.map((m) => m.count));
    const bars = document.createElement("div");
    bars.style.cssText = [
      "display:grid",
      `grid-template-columns:repeat(${data.contentByMonth.length}, 1fr)`,
      "gap:4px",
      "align-items:end",
      "height:60px"
    ].join(";");
    for (const month of data.contentByMonth) {
      const col = document.createElement("div");
      col.style.cssText = "display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;";
      const bar = document.createElement("div");
      const heightPct = Math.round(month.count / max * 100);
      bar.style.cssText = [
        "width:100%",
        `height:${Math.max(3, heightPct)}%`,
        "background:var(--wp-admin-theme-color, #2271b1)",
        month.count === 0 ? "opacity:0.18" : "opacity:1",
        "border-radius:3px 3px 0 0",
        "transition:height 360ms ease"
      ].join(";");
      bar.title = sprintf(
        // translators: %1$s is a YYYY-MM month, %2$d is post count.
        __("%1$s — %2$d posts"),
        month.month,
        month.count
      );
      col.appendChild(bar);
      wrap.appendChild(col);
      bars.appendChild(col);
    }
    wrap.appendChild(bars);
    const labels = document.createElement("div");
    labels.style.cssText = [
      "display:grid",
      `grid-template-columns:repeat(${data.contentByMonth.length}, 1fr)`,
      "gap:4px",
      "margin-top:4px",
      "font-size:10px",
      "color:var(--desktop-mode-muted, #8c8f94)",
      "text-align:center"
    ].join(";");
    for (const month of data.contentByMonth) {
      const span = document.createElement("span");
      const parts = month.month.split("-");
      span.textContent = parts.length === 2 ? parts[1] : month.month;
      labels.appendChild(span);
    }
    wrap.appendChild(labels);
    return wrap;
  }
  function buildRecentLists(data) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:14px;margin:0 0 22px;";
    wrap.appendChild(
      buildRecentList(
        __("Recent posts"),
        __("No recent posts."),
        data.recentPosts.map((p) => ({
          primary: p.title,
          secondary: relativeFromIso(p.dateGmt),
          tag: p.status !== "publish" ? p.status : null,
          badge: p.commentCount > 0 ? sprintf(
            // translators: %d is a count of comments.
            __("%d 💬"),
            p.commentCount
          ) : null
        }))
      )
    );
    wrap.appendChild(
      buildRecentList(
        __("Recent comments"),
        __("No recent comments."),
        data.recentComments.map((c) => {
          const when = relativeFromIso(c.dateGmt);
          return {
            primary: c.excerpt || __("(empty comment)"),
            secondary: c.postTitle ? `${__("on")} "${c.postTitle}" · ${when}` : when,
            tag: c.approved ? null : __("pending"),
            badge: null
          };
        })
      )
    );
    return wrap;
  }
  function buildRecentList(title, emptyText, items) {
    const card = document.createElement("div");
    card.style.cssText = [
      "border:1px solid var(--desktop-mode-border, #dcdcde)",
      "border-radius:10px",
      "padding:14px 16px",
      "min-width:0"
    ].join(";");
    const head = document.createElement("div");
    head.style.cssText = "font-size:13px;font-weight:600;margin:0 0 10px;";
    head.textContent = title;
    card.appendChild(head);
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.style.cssText = "margin:0;color:var(--desktop-mode-muted, #50575e);font-size:12px;";
      empty.textContent = emptyText;
      card.appendChild(empty);
      return card;
    }
    const list = document.createElement("ul");
    list.style.cssText = "list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;";
    for (const item of items) {
      const li = document.createElement("li");
      li.style.cssText = "min-width:0;";
      const top = document.createElement("div");
      top.style.cssText = "display:flex;align-items:baseline;gap:6px;min-width:0;";
      const primary = document.createElement("span");
      primary.style.cssText = "font-size:13px;line-height:1.35;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      primary.textContent = item.primary;
      primary.title = item.primary;
      top.appendChild(primary);
      if (item.tag) {
        const tag = document.createElement("span");
        tag.style.cssText = "font-size:10px;text-transform:uppercase;letter-spacing:0.04em;background:rgba(0,0,0,0.06);padding:1px 6px;border-radius:8px;flex-shrink:0;";
        tag.textContent = item.tag;
        top.appendChild(tag);
      }
      if (item.badge) {
        const badge = document.createElement("span");
        badge.style.cssText = "font-size:11px;color:var(--desktop-mode-muted, #50575e);flex-shrink:0;";
        badge.textContent = item.badge;
        top.appendChild(badge);
      }
      li.appendChild(top);
      const sub = document.createElement("div");
      sub.style.cssText = "font-size:11px;color:var(--desktop-mode-muted, #8c8f94);";
      sub.textContent = item.secondary;
      li.appendChild(sub);
      list.appendChild(li);
    }
    card.appendChild(list);
    return card;
  }
  function buildSecurityPanel(data) {
    const card = document.createElement("div");
    card.style.cssText = [
      "border:1px solid var(--desktop-mode-border, #dcdcde)",
      "border-radius:10px",
      "padding:14px 16px"
    ].join(";");
    const head = document.createElement("div");
    head.style.cssText = "font-size:13px;font-weight:600;margin:0 0 10px;";
    head.textContent = __("Active sessions & app access");
    card.appendChild(head);
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;";
    const sessionTile = document.createElement("div");
    sessionTile.style.cssText = "display:flex;flex-direction:column;gap:2px;font-size:12px;";
    const sessionLabel = document.createElement("div");
    sessionLabel.style.cssText = "color:var(--desktop-mode-muted, #50575e);font-size:11px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;";
    sessionLabel.textContent = __("Active sessions");
    const sessionValue = document.createElement("div");
    sessionValue.style.cssText = "font-size:18px;font-weight:600;";
    sessionValue.textContent = String(data.sessions.length);
    const sessionSub = document.createElement("div");
    sessionSub.style.cssText = "color:var(--desktop-mode-muted, #8c8f94);";
    const currentCount = data.sessions.filter((s) => s.current).length;
    sessionSub.textContent = currentCount > 0 ? __("Includes the current device.") : __("Logged in across multiple devices.");
    sessionTile.appendChild(sessionLabel);
    sessionTile.appendChild(sessionValue);
    sessionTile.appendChild(sessionSub);
    grid.appendChild(sessionTile);
    const appTile = document.createElement("div");
    appTile.style.cssText = "display:flex;flex-direction:column;gap:2px;font-size:12px;";
    const appLabel = document.createElement("div");
    appLabel.style.cssText = "color:var(--desktop-mode-muted, #50575e);font-size:11px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;";
    appLabel.textContent = __("Application passwords");
    const appValue = document.createElement("div");
    appValue.style.cssText = "font-size:18px;font-weight:600;";
    appValue.textContent = String(data.applicationPasswords.total);
    const appSub = document.createElement("div");
    appSub.style.cssText = "color:var(--desktop-mode-muted, #8c8f94);";
    if (data.applicationPasswords.lastUsedAt && data.applicationPasswords.lastUsedName) {
      appSub.textContent = sprintf(
        // translators: %1$s is the app password name, %2$s is a relative time.
        __('"%1$s" last used %2$s'),
        data.applicationPasswords.lastUsedName,
        relativeTime$1(data.applicationPasswords.lastUsedAt)
      );
    } else {
      appSub.textContent = data.applicationPasswords.total ? __("No recent use.") : __("No app passwords issued yet.");
    }
    appTile.appendChild(appLabel);
    appTile.appendChild(appValue);
    appTile.appendChild(appSub);
    grid.appendChild(appTile);
    card.appendChild(grid);
    return card;
  }
  function textField(formName, label, value, opts = {}) {
    const el = document.createElement("wpd-text-field");
    el.setAttribute("name", formName);
    el.setAttribute("label", label);
    el.setAttribute("value", value);
    el.value = value;
    if (opts.required) {
      el.setAttribute("required", "");
    }
    if (opts.readonly) {
      el.setAttribute("readonly", "");
    }
    if (opts.type) {
      el.setAttribute("type", opts.type);
    }
    if (opts.fullWidth !== false && opts.fullWidth) {
      el.setAttribute("full-width", "");
    }
    if (opts.dataset) {
      for (const [k, v] of Object.entries(opts.dataset)) {
        el.dataset[k] = v;
      }
    }
    return el;
  }
  function displayNameCandidates(user) {
    const candidates = /* @__PURE__ */ new Set();
    const add = (s) => {
      const t = s.trim();
      if (t !== "") {
        candidates.add(t);
      }
    };
    add(user.username);
    add(user.nickname ?? "");
    add(user.first_name);
    add(user.last_name);
    if (user.first_name || user.last_name) {
      add(`${user.first_name} ${user.last_name}`.trim());
      add(`${user.last_name} ${user.first_name}`.trim());
    }
    if (user.name) {
      add(user.name);
    }
    return Array.from(candidates).map((name) => ({
      value: name,
      label: name
    }));
  }
  function relativeFromIso(iso) {
    const ms = msFromIso(iso);
    if (!Number.isFinite(ms)) {
      return "—";
    }
    return relativeTime$1(Math.floor(ms / 1e3));
  }
  function relativeTime$1(ts) {
    if (!Number.isFinite(ts)) {
      return "—";
    }
    const now = Math.floor(Date.now() / 1e3);
    const delta = now - ts;
    if (delta < 60) {
      return __("just now");
    }
    if (delta < 3600) {
      return sprintf(__("%d min ago"), Math.floor(delta / 60));
    }
    if (delta < 86400) {
      return sprintf(__("%d h ago"), Math.floor(delta / 3600));
    }
    if (delta < 86400 * 30) {
      return sprintf(__("%d d ago"), Math.floor(delta / 86400));
    }
    if (delta < 86400 * 365) {
      return sprintf(__("%d mo ago"), Math.floor(delta / (86400 * 30)));
    }
    return sprintf(__("%d y ago"), Math.floor(delta / (86400 * 365)));
  }
  function msFromIso(iso) {
    if (!iso) {
      return NaN;
    }
    if (iso.startsWith("0000-00-00")) {
      return NaN;
    }
    let normalized = iso;
    if (normalized.includes(" ")) {
      normalized = normalized.replace(" ", "T");
    }
    if (!/Z$/.test(normalized) && !/[+-]\d{2}:?\d{2}$/.test(normalized)) {
      normalized += "Z";
    }
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  function generateStrongPassword$1(length) {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghjkmnpqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%^&*-_=+";
    const all = upper + lower + digits + symbols;
    const buf = new Uint32Array(length);
    crypto.getRandomValues(buf);
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += all[buf[i] % all.length];
    }
    return out;
  }
  function mapErrorCode(code) {
    switch (code) {
      case "rest_user_invalid_email":
      case "invalid_email":
        return __("Email address is not valid.");
      case "rest_user_email_exists":
      case "existing_user_email":
        return __("That email is already in use.");
      case "rest_user_invalid_role":
        return __("You are not allowed to assign that role.");
      default:
        return null;
    }
  }
  function applyColorSchemePreview(slug, info) {
    if (!info.url) {
      flipBodyClass(slug);
      flipShellScheme(slug);
      return;
    }
    let link = document.getElementById(
      "colors-css"
    );
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.id = "colors-css";
      document.head.appendChild(link);
    }
    link.href = info.url;
    flipBodyClass(slug);
    flipShellScheme(slug);
  }
  function flipShellScheme(slug) {
    const shell = document.querySelector(".desktop-mode-shell");
    if (shell) {
      shell.setAttribute("data-desktop-mode-scheme", slug);
    }
  }
  function flipBodyClass(slug) {
    const body = document.body;
    const next = `admin-color-${slug}`;
    for (const cls of Array.from(body.classList)) {
      if (cls.startsWith("admin-color-") && cls !== next) {
        body.classList.remove(cls);
      }
    }
    body.classList.add(next);
  }
  function buildAdminColorPicker(schemes, current, opts = {}) {
    const wrap = document.createElement("div");
    wrap.setAttribute("full-width", "");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:6px;";
    const label = document.createElement("span");
    label.style.cssText = "font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:var(--desktop-mode-muted, #50575e);font-weight:600;";
    label.textContent = __("Admin colour scheme");
    wrap.appendChild(label);
    const hidden = document.createElement("wpd-text-field");
    hidden.setAttribute("name", "meta.admin_color");
    hidden.setAttribute("value", current);
    hidden.value = current;
    hidden.style.display = "none";
    wrap.appendChild(hidden);
    const grid = document.createElement("div");
    grid.style.cssText = [
      "display:grid",
      "grid-template-columns:repeat(auto-fill, minmax(140px, 1fr))",
      "gap:8px"
    ].join(";");
    wrap.appendChild(grid);
    let selected = current;
    const updateSelected = (slug) => {
      selected = slug;
      hidden.value = slug;
      hidden.setAttribute("value", slug);
      for (const t of Array.from(grid.children)) {
        const tile = t;
        const v = tile.dataset.scheme;
        tile.style.borderColor = v === slug ? "var(--wp-admin-theme-color, #2271b1)" : "var(--desktop-mode-border, #dcdcde)";
        tile.style.boxShadow = v === slug ? "0 0 0 1px var(--wp-admin-theme-color, #2271b1) inset" : "none";
        tile.setAttribute("aria-checked", v === slug ? "true" : "false");
      }
    };
    for (const [slug, info] of Object.entries(schemes)) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.setAttribute("role", "radio");
      tile.setAttribute("aria-checked", slug === selected ? "true" : "false");
      tile.dataset.scheme = slug;
      tile.style.cssText = [
        "appearance:none",
        "border:1px solid var(--desktop-mode-border, #dcdcde)",
        "background:var(--wp-admin-theme-bg, #fff)",
        "color:inherit",
        "border-radius:8px",
        "padding:10px 10px 8px",
        "cursor:pointer",
        "display:flex",
        "flex-direction:column",
        "gap:6px",
        "text-align:left",
        "min-width:0",
        "transition:border-color 120ms ease, box-shadow 120ms ease"
      ].join(";");
      const swatchRow = document.createElement("span");
      swatchRow.style.cssText = "display:flex;height:18px;border-radius:4px;overflow:hidden;border:1px solid rgba(0,0,0,0.06);";
      const colors = (info.colors ?? []).slice(0, 4);
      if (colors.length === 0) {
        colors.push("#dcdcde", "#dcdcde", "#dcdcde");
      }
      for (const color of colors) {
        const swatch = document.createElement("span");
        swatch.style.cssText = `flex:1 1 auto;background:${color};`;
        swatchRow.appendChild(swatch);
      }
      tile.appendChild(swatchRow);
      const name = document.createElement("span");
      name.style.cssText = "font-size:12px;font-weight:500;";
      name.textContent = info.name;
      tile.appendChild(name);
      tile.addEventListener("click", () => {
        updateSelected(slug);
        if (opts.livePreview) {
          applyColorSchemePreview(slug, info);
        }
      });
      grid.appendChild(tile);
    }
    updateSelected(selected);
    return wrap;
  }
  function checkboxField(name, label, checked, opts = {}) {
    const trueValue = opts.trueValue ?? "true";
    const falseValue = opts.falseValue ?? "false";
    const wrap = document.createElement("span");
    if (opts.fullWidth) {
      wrap.setAttribute("full-width", "");
    }
    const cb = document.createElement("wpd-checkbox-label");
    cb.setAttribute("label", label);
    cb.setAttribute("name", name);
    cb.setAttribute("value", checked ? trueValue : falseValue);
    cb.value = checked ? trueValue : falseValue;
    if (checked) {
      cb.setAttribute("checked", "");
    }
    cb.addEventListener("wpd-checkbox-change", (e) => {
      const detail = e.detail;
      const v = detail?.checked ? trueValue : falseValue;
      cb.value = v;
      cb.setAttribute("value", v);
    });
    wrap.appendChild(cb);
    return wrap;
  }
  function buildSessionsRow(userId, isSelfEdit) {
    const wrap = document.createElement("div");
    wrap.setAttribute("full-width", "");
    wrap.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;";
    const label = document.createElement("span");
    label.style.cssText = "font-size:13px;color:var(--desktop-mode-fg, inherit);";
    label.textContent = __("Active sessions");
    wrap.appendChild(label);
    const btn = document.createElement("wpd-button");
    btn.setAttribute("variant", "ghost");
    btn.setAttribute("type", "button");
    btn.textContent = isSelfEdit ? __("Log out everywhere else") : __("Log this user out everywhere");
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const cfg = resolveUserEditClient().getConfig();
        const base = cfg.insightsUrlBase ?? joinRestUrl(cfg.restRoot, "desktop-mode/v1/users/");
        const res = await trackedFetch(
          joinRestUrl(base, `${userId}/destroy-sessions`),
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-WP-Nonce": cfg.restNonce
            },
            body: JSON.stringify({
              scope: isSelfEdit ? "others" : "all"
            })
          },
          { source: "user-edit-window/destroy-sessions" }
        );
        if (!res.ok) {
          throw new Error(`http_${res.status}`);
        }
        notifyToast$1(__("Sessions destroyed."), "success");
      } catch (err) {
        notifyToast$1(
          sprintf(
            // translators: %s is an error message.
            __("Could not destroy sessions (%s)."),
            String(err.message ?? err)
          ),
          "error"
        );
      }
    });
    wrap.appendChild(btn);
    return wrap;
  }
  function buildAppPasswordsRow(userId) {
    const wrap = document.createElement("div");
    wrap.setAttribute("full-width", "");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;border:1px solid var(--desktop-mode-border, #dcdcde);border-radius:8px;padding:12px 14px;";
    const heading = document.createElement("div");
    heading.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
    const headLabel = document.createElement("span");
    headLabel.textContent = __("Application passwords");
    headLabel.style.cssText = "font-size:13px;font-weight:600;";
    heading.appendChild(headLabel);
    wrap.appendChild(heading);
    const cfg = resolveUserEditClient().getConfig();
    const base = cfg.insightsUrlBase ?? joinRestUrl(cfg.restRoot, "desktop-mode/v1/users/");
    const list = document.createElement("ul");
    list.style.cssText = "list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;";
    wrap.appendChild(list);
    const createRow = document.createElement("div");
    createRow.style.cssText = "display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px;";
    const nameInput = document.createElement("wpd-text-field");
    nameInput.setAttribute("label", __("New application password name"));
    nameInput.setAttribute(
      "placeholder",
      __("e.g. iPhone, WP-CLI, Backup tool")
    );
    nameInput.style.flex = "1 1 220px";
    createRow.appendChild(nameInput);
    const createBtn = document.createElement("wpd-button");
    createBtn.setAttribute("variant", "primary");
    createBtn.setAttribute("type", "button");
    createBtn.textContent = __("Create");
    createRow.appendChild(createBtn);
    wrap.appendChild(createRow);
    const renderItems = (items) => {
      list.replaceChildren();
      if (items.length === 0) {
        const empty = document.createElement("li");
        empty.style.cssText = "font-size:12px;color:var(--desktop-mode-muted, #50575e);";
        empty.textContent = __("No application passwords issued yet.");
        list.appendChild(empty);
        return;
      }
      for (const item of items) {
        const row = document.createElement("li");
        row.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px;";
        const nameSpan = document.createElement("span");
        nameSpan.style.cssText = "flex:1 1 auto;font-weight:500;";
        nameSpan.textContent = item.name;
        row.appendChild(nameSpan);
        const meta = document.createElement("span");
        meta.style.cssText = "color:var(--desktop-mode-muted, #8c8f94);";
        meta.textContent = item.last_used ? sprintf(
          // translators: %s is a relative time.
          __("last used %s"),
          relativeTime$1(item.last_used)
        ) : __("never used");
        row.appendChild(meta);
        const revoke = document.createElement("wpd-button");
        revoke.setAttribute("variant", "ghost");
        revoke.setAttribute("type", "button");
        revoke.textContent = __("Revoke");
        revoke.addEventListener("click", async (e) => {
          e.preventDefault();
          try {
            const res = await trackedFetch(
              joinRestUrl(base, `${userId}/application-passwords/${item.uuid}`),
              {
                method: "DELETE",
                credentials: "same-origin",
                headers: { "X-WP-Nonce": cfg.restNonce }
              },
              { source: "user-edit-window/app-pw-revoke" }
            );
            if (!res.ok) {
              throw new Error(`http_${res.status}`);
            }
            row.remove();
            notifyToast$1(__("Application password revoked."), "success");
          } catch (err) {
            notifyToast$1(
              String(err.message ?? err),
              "error"
            );
          }
        });
        row.appendChild(revoke);
        list.appendChild(row);
      }
    };
    const refresh = async () => {
      try {
        const res = await trackedFetch(
          joinRestUrl(base, `${userId}/application-passwords`),
          {
            credentials: "same-origin",
            headers: { "X-WP-Nonce": cfg.restNonce }
          },
          { source: "user-edit-window/app-pw-list", silent: true }
        );
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        renderItems(data.items ?? []);
      } catch {
      }
    };
    void refresh();
    createBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const name = String(nameInput.value ?? "").trim();
      if (!name) {
        notifyToast$1(__("Application password name is required."), "error");
        return;
      }
      try {
        const res = await trackedFetch(
          joinRestUrl(base, `${userId}/application-passwords`),
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-WP-Nonce": cfg.restNonce
            },
            body: JSON.stringify({ name })
          },
          { source: "user-edit-window/app-pw-create" }
        );
        if (!res.ok) {
          throw new Error(`http_${res.status}`);
        }
        const data = await res.json();
        notifyToast$1(
          sprintf(
            // translators: %s is an application password.
            __("Created. Copy the password now: %s"),
            data.password
          ),
          "success"
        );
        void navigator.clipboard?.writeText(data.password).catch(() => {
        });
        nameInput.value = "";
        nameInput.setAttribute("value", "");
        void refresh();
      } catch (err) {
        notifyToast$1(
          String(err.message ?? err),
          "error"
        );
      }
    });
    return wrap;
  }
  const userEditRender = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    mountProfileActivityAt,
    mountProfileAsideAt,
    mountProfileFormAt
  }, Symbol.toStringTag, { value: "Module" }));
  async function showPagesIntroDialog() {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "desktop-mode-pages-intro__backdrop";
      backdrop.setAttribute("role", "presentation");
      Object.assign(backdrop.style, {
        position: "fixed",
        inset: "0",
        background: "color-mix(in srgb, var(--wp-admin-theme-color, #1d2327) 60%, transparent)",
        backdropFilter: "blur(2px)",
        zIndex: "100000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      });
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "desktop-mode-pages-intro-title");
      dialog.className = "desktop-mode-pages-intro";
      Object.assign(dialog.style, {
        background: "var(--wp-admin-theme-bg, #fff)",
        color: "var(--wp-admin-theme-fg, #1d2327)",
        borderRadius: "14px",
        boxShadow: "0 24px 60px rgba(0,0,0,.28)",
        maxWidth: "520px",
        width: "100%",
        maxHeight: "90vh",
        overflow: "auto",
        padding: "28px 32px 24px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      });
      dialog.innerHTML = renderDialogMarkup$1();
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      const primaryBtn = dialog.querySelector(
        '[data-action="confirm"]'
      );
      const settingsBtn = dialog.querySelector(
        '[data-action="settings"]'
      );
      primaryBtn?.focus();
      let resolved = false;
      const cleanup = (result) => {
        if (resolved) {
          return;
        }
        resolved = true;
        document.removeEventListener("keydown", onKey, true);
        backdrop.remove();
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cleanup("cancel");
        }
      };
      document.addEventListener("keydown", onKey, true);
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          cleanup("cancel");
        }
      });
      primaryBtn?.addEventListener("click", () => cleanup("confirm"));
      settingsBtn?.addEventListener("click", () => cleanup("settings"));
    });
  }
  function renderDialogMarkup$1() {
    const title = __("Welcome to the new Pages window");
    const lede = __(
      "You're looking at the redesigned Pages list — same data you already manage, with a UX tuned for how Desktop Mode wants you to work."
    );
    const highlights = [
      __("Sticky header and sticky title column so long lists stay readable as you scroll."),
      __('Front page and Posts page badges right on the title — no more "wait, which one is the homepage?".'),
      __("Page Template column so you can spot which template each page uses at a glance."),
      __("Slug column with one-click copy — perfect when configuring redirects or sharing canonical URLs."),
      __("Comments column, Parent column, View link, lock indicator, multi-select bulk actions, inline search, status segments. All in one screen, no reloads.")
    ];
    const li = (arr) => arr.map(
      (s) => `<li><span class="dot" aria-hidden="true"></span>${escapeHtml$1(s)}</li>`
    ).join("");
    return `
		<style>
			.desktop-mode-pages-intro h2 {
				margin: 0 0 8px;
				font-size: 22px;
				font-weight: 600;
				letter-spacing: -0.01em;
			}
			.desktop-mode-pages-intro p.lede {
				margin: 0 0 20px;
				color: var(--wp-admin-theme-fg-muted, #50575e);
				font-size: 14px;
				line-height: 1.5;
			}
			.desktop-mode-pages-intro__list {
				list-style: none;
				margin: 0 0 22px;
				padding: 0;
				font-size: 14px;
				line-height: 1.5;
			}
			.desktop-mode-pages-intro__list li {
				display: flex;
				align-items: flex-start;
				gap: 10px;
				padding: 6px 0;
			}
			.desktop-mode-pages-intro__list .dot {
				flex: 0 0 auto;
				width: 6px;
				height: 6px;
				margin-top: 9px;
				border-radius: 50%;
				background: var(--wp-admin-theme-color, #2271b1);
			}
			.desktop-mode-pages-intro__footer {
				display: flex;
				justify-content: flex-end;
				gap: 8px;
				margin-top: 8px;
			}
			.desktop-mode-pages-intro__footer button {
				appearance: none;
				border: 1px solid var(--wp-admin-theme-border, #dcdcde);
				background: var(--wp-admin-theme-bg, #fff);
				color: inherit;
				padding: 8px 14px;
				border-radius: 6px;
				font-size: 13px;
				cursor: pointer;
			}
			.desktop-mode-pages-intro__footer button.primary {
				border-color: var(--wp-admin-theme-color, #2271b1);
				background: var(--wp-admin-theme-color, #2271b1);
				color: #fff;
				font-weight: 500;
			}
			.desktop-mode-pages-intro__footer button:hover { filter: brightness(1.05); }
			.desktop-mode-pages-intro__footer button:focus-visible {
				outline: 2px solid var(--wp-admin-theme-color, #2271b1);
				outline-offset: 2px;
			}
		</style>
		<h2 id="desktop-mode-pages-intro-title">${escapeHtml$1(title)}</h2>
		<p class="lede">${escapeHtml$1(lede)}</p>
		<ul class="desktop-mode-pages-intro__list">${li(highlights)}</ul>
		<div class="desktop-mode-pages-intro__footer">
			<button type="button" data-action="settings">${escapeHtml$1(
      __("Take me to settings")
    )}</button>
			<button type="button" class="primary" data-action="confirm">${escapeHtml$1(
      __("Got it")
    )}</button>
		</div>
	`;
  }
  function escapeHtml$1(s) {
    const t = document.createElement("div");
    t.textContent = s;
    return t.innerHTML;
  }
  const pagesIntroDialog = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    showPagesIntroDialog
  }, Symbol.toStringTag, { value: "Module" }));
  const REPULSION_K = 5500;
  const SPRING_K = 0.05;
  const SPRING_LEN = 130;
  const MIN_RADIUS = 22;
  const MAX_RADIUS = 48;
  const POST_PER_PAGE$1 = 10;
  const POST_RING_RADIUS$1 = 170;
  async function mountCategoriesMindmap(host, client) {
    const api = window.wp?.desktop;
    if (!api || typeof api.loadModules !== "function") {
      host.textContent = __("Mindmap unavailable: shell modules API missing.");
      return () => {
      };
    }
    try {
      await api.loadModules(["pixijs"]);
    } catch {
      host.textContent = __("Mindmap unavailable.");
      return () => {
      };
    }
    const pixiMaybe = window.PIXI;
    if (!pixiMaybe) {
      host.textContent = __("Mindmap unavailable.");
      return () => {
      };
    }
    const pixi = pixiMaybe;
    host.replaceChildren();
    host.classList.add("wpd-mindmap");
    const toolbar = document.createElement("div");
    toolbar.className = "wpd-mindmap__toolbar";
    const addRootBtn = document.createElement("button");
    addRootBtn.type = "button";
    addRootBtn.className = "wpd-mindmap__btn wpd-mindmap__btn--primary";
    addRootBtn.innerHTML = '<span class="dashicons dashicons-plus" aria-hidden="true"></span>' + __("Add root category");
    const recenterBtn = document.createElement("button");
    recenterBtn.type = "button";
    recenterBtn.className = "wpd-mindmap__btn";
    recenterBtn.innerHTML = '<span class="dashicons dashicons-image-rotate" aria-hidden="true"></span>' + __("Recenter");
    const searchWrap = document.createElement("div");
    searchWrap.className = "wpd-mindmap__search";
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "wpd-mindmap__search-input";
    searchInput.placeholder = __("Search categories…");
    searchInput.setAttribute(
      "aria-label",
      __("Search categories in the mindmap")
    );
    searchWrap.appendChild(searchInput);
    const searchResults = document.createElement("ul");
    searchResults.className = "wpd-mindmap__search-results";
    searchResults.hidden = true;
    searchWrap.appendChild(searchResults);
    const hint = document.createElement("span");
    hint.className = "wpd-mindmap__hint";
    hint.textContent = __(
      "Click a node to focus + edit · drag onto another to reparent · wheel to zoom"
    );
    toolbar.appendChild(addRootBtn);
    toolbar.appendChild(recenterBtn);
    toolbar.appendChild(searchWrap);
    toolbar.appendChild(hint);
    host.appendChild(toolbar);
    const layout = document.createElement("div");
    layout.className = "wpd-mindmap__layout";
    host.appendChild(layout);
    const stage = document.createElement("div");
    stage.className = "wpd-mindmap__stage";
    stage.classList.add("is-loading");
    layout.appendChild(stage);
    const sidebar = document.createElement("aside");
    sidebar.className = "wpd-mindmap__sidebar";
    layout.appendChild(sidebar);
    const app = new pixi.Application();
    await app.init({
      resizeTo: stage,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });
    stage.appendChild(app.canvas);
    app.canvas.classList.add("wpd-mindmap__canvas");
    const world = new pixi.Container();
    world.x = stage.clientWidth / 2;
    world.y = stage.clientHeight / 2;
    app.stage.addChild(world);
    const edgeLayer = new pixi.Container();
    const nodeLayer = new pixi.Container();
    const postEdgeLayer = new pixi.Container();
    const postLayer = new pixi.Container();
    const chipLayer = new pixi.Container();
    const postChipLayer = new pixi.Container();
    world.addChild(edgeLayer);
    world.addChild(postEdgeLayer);
    world.addChild(postLayer);
    world.addChild(nodeLayer);
    world.addChild(chipLayer);
    world.addChild(postChipLayer);
    const edgeGfx = new pixi.Graphics();
    edgeLayer.addChild(edgeGfx);
    const postEdgeGfx = new pixi.Graphics();
    postEdgeLayer.addChild(postEdgeGfx);
    const CHIP_TEXT_RES2 = 4;
    const pager = new pixi.Container();
    pager.eventMode = "passive";
    pager.visible = false;
    postLayer.addChild(pager);
    const pagerPrev = new pixi.Graphics();
    const pagerNext = new pixi.Graphics();
    const pagerLabel = new pixi.Text({
      text: "1 / 1",
      style: {
        fill: 5265246,
        fontSize: 14,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontWeight: "600"
      },
      resolution: CHIP_TEXT_RES2
    });
    pagerLabel.anchor.set(0.5);
    pagerPrev.eventMode = "static";
    pagerPrev.cursor = "pointer";
    pagerNext.eventMode = "static";
    pagerNext.cursor = "pointer";
    pagerPrev.hitArea = new pixi.Circle(0, 0, 16);
    pagerNext.hitArea = new pixi.Circle(0, 0, 16);
    pager.addChild(pagerPrev);
    pager.addChild(pagerLabel);
    pager.addChild(pagerNext);
    const stopBubble = (e) => {
      e.stopPropagation?.();
      pixiInteractionAt = performance.now();
    };
    pagerPrev.on("pointerdown", stopBubble);
    pagerNext.on("pointerdown", stopBubble);
    pagerPrev.on("pointertap", (e) => {
      stopBubble(e);
      lastFocusChange = performance.now();
      if (focusPage <= 1) {
        return;
      }
      focusPage--;
      void loadPostsForFocus();
    });
    pagerNext.on("pointertap", (e) => {
      stopBubble(e);
      lastFocusChange = performance.now();
      if (focusPage >= focusTotalPages) {
        return;
      }
      focusPage++;
      void loadPostsForFocus();
    });
    const nodes = /* @__PURE__ */ new Map();
    const chips = /* @__PURE__ */ new Map();
    const postChips = /* @__PURE__ */ new Map();
    const postNodes = /* @__PURE__ */ new Map();
    let focusId = null;
    let focusPage = 1;
    let focusTotalPages = 1;
    let loadSeq = 0;
    let pixiInteractionAt = 0;
    let dragNode = null;
    let dragHover = null;
    let panActive = false;
    let panStart = null;
    let panMovedDist = 0;
    let raf = null;
    let lastTick = performance.now();
    let targetScale = world.scale.x;
    let targetWorldX = world.x;
    let targetWorldY = world.y;
    let nudgeAwayFrom = null;
    const pinnedTargetBackup = /* @__PURE__ */ new Map();
    let prevView = null;
    let draft = null;
    const themeHue = readAdminThemeHue$1();
    const clusterColor = (idx) => hslToInt$1((themeHue + idx * 47) % 360, 55, 52);
    let terms = [];
    try {
      const all = [];
      let page = 1;
      while (page <= 5) {
        const res = await client.fetchTerms("categories", { page, perPage: 100 });
        all.push(...res.items);
        if (page >= res.totalPages) {
          break;
        }
        page++;
      }
      terms = all;
    } catch (err) {
      showToast$1(__("Couldn’t load categories:"), err);
    }
    const showError = (title, err) => showToast$1(title, err);
    function isUncategorized(term) {
      if (term.isDefault) {
        return true;
      }
      return term.id === 1 || term.slug === "uncategorized" || term.name.toLowerCase() === "uncategorized";
    }
    function syncEmptyHint() {
      const existing = stage.querySelector(".wpd-mindmap__empty");
      if (terms.length <= 1) {
        if (!existing) {
          const empty = document.createElement("div");
          empty.className = "wpd-mindmap__empty";
          empty.textContent = __(
            'No custom categories yet. Click "Add root category" to start branching.'
          );
          stage.appendChild(empty);
        }
      } else if (existing) {
        existing.remove();
      }
    }
    function buildTree() {
      const childMap = /* @__PURE__ */ new Map();
      for (const t of terms) {
        const list = childMap.get(t.parent) ?? [];
        list.push(t);
        childMap.set(t.parent, list);
      }
      const allRoots = childMap.get(0) ?? [];
      const roots = allRoots.filter((r) => !isUncategorized(r));
      const uncategorized = allRoots.find(isUncategorized);
      const place = (term, depth, rootIdx, angle, angleSpan) => {
        const rootRingByCount = roots.length > 1 ? 110 + roots.length * 28 : 0;
        const rootRing = uncategorized ? Math.max(rootRingByCount, 140) : rootRingByCount;
        const baseRadius = depth === 0 ? rootRing : rootRing + 160 + (depth - 1) * 150;
        const tx = baseRadius * Math.cos(angle);
        const ty = baseRadius * Math.sin(angle);
        const radius = nodeRadius(term.count, terms);
        const color = depth === 0 ? clusterColor(rootIdx) : nodes.get(term.parent)?.color ?? clusterColor(rootIdx);
        let node = nodes.get(term.id);
        if (!node) {
          const gfx = new pixi.Graphics();
          gfx.eventMode = "static";
          gfx.cursor = "pointer";
          node = {
            id: term.id,
            parent: term.parent,
            name: term.name,
            description: term.description,
            count: term.count,
            x: tx,
            y: ty,
            tx,
            ty,
            radius,
            depth,
            color,
            gfx,
            pinned: depth === 0
          };
          nodeLayer.addChild(gfx);
          gfx.on("pointerdown", (e) => onNodePointerDown(e, node));
          nodes.set(term.id, node);
        } else {
          node.parent = term.parent;
          node.name = term.name;
          node.description = term.description;
          node.count = term.count;
          node.depth = depth;
          node.color = color;
          node.radius = radius;
          node.tx = tx;
          node.ty = ty;
          node.pinned = depth === 0;
        }
        drawNodeDisc(node, false);
        const kids = childMap.get(term.id) ?? [];
        if (kids.length > 0) {
          const sub = angleSpan / kids.length;
          kids.forEach((child, i) => {
            place(
              child,
              depth + 1,
              rootIdx,
              angle - angleSpan / 2 + sub * (i + 0.5),
              sub * 0.85
            );
          });
        }
      };
      const liveIds = new Set(terms.map((t) => t.id));
      for (const [id, node] of nodes) {
        if (!liveIds.has(id)) {
          nodeLayer.removeChild(node.gfx);
          node.gfx.destroy();
          nodes.delete(id);
          destroyChip(id);
        }
      }
      const rootCount = Math.max(1, roots.length);
      roots.forEach((root, idx) => {
        const angle = 2 * Math.PI / rootCount * idx;
        place(root, 0, idx, angle, 2 * Math.PI / rootCount);
      });
      if (uncategorized) {
        placeIsolated(uncategorized);
      }
      syncEmptyHint();
    }
    function placeIsolated(term) {
      const tx = 0;
      const ty = 0;
      const radius = nodeRadius(term.count, terms);
      const color = 9211796;
      let node = nodes.get(term.id);
      if (!node) {
        const gfx = new pixi.Graphics();
        gfx.eventMode = "static";
        gfx.cursor = "pointer";
        node = {
          id: term.id,
          parent: 0,
          name: term.name,
          description: term.description,
          count: term.count,
          x: tx,
          y: ty,
          tx,
          ty,
          radius,
          depth: 0,
          color,
          gfx,
          pinned: true
        };
        nodeLayer.addChild(gfx);
        gfx.on("pointerdown", (e) => onNodePointerDown(e, node));
        nodes.set(term.id, node);
      } else {
        node.parent = 0;
        node.name = term.name;
        node.description = term.description;
        node.count = term.count;
        node.depth = 0;
        node.color = color;
        node.radius = radius;
        node.tx = tx;
        node.ty = ty;
        node.pinned = true;
      }
      drawNodeDisc(node, false);
    }
    function drawCurvedEdge(g, x1, y1, x2, y2, color, opts = {}) {
      const dx = x2 - x1;
      const cp1x = x1 + dx * 0.5;
      const cp1y = y1;
      const cp2x = x2 - dx * 0.5;
      const cp2y = y2;
      const alpha = opts.alpha ?? 0.5;
      const width = opts.width ?? 1.5;
      if (!opts.dashed) {
        g.moveTo(x1, y1);
        g.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
        g.stroke({ color, width, alpha });
        return;
      }
      const sampleAt = (t) => {
        const omt = 1 - t;
        const px = omt * omt * omt * x1 + 3 * omt * omt * t * cp1x + 3 * omt * t * t * cp2x + t * t * t * x2;
        const py = omt * omt * omt * y1 + 3 * omt * omt * t * cp1y + 3 * omt * t * t * cp2y + t * t * t * y2;
        return { x: px, y: py };
      };
      const STEPS = 32;
      const phase = opts.dashPhase ?? 0;
      const stride = Math.max(1, opts.dashStride ?? 1);
      let lastX = x1;
      let lastY = y1;
      for (let i = 1; i <= STEPS; i++) {
        const p = sampleAt(i / STEPS);
        const groupIdx = Math.floor((i - 1 + phase) / stride);
        const visible = groupIdx % 2 === 0;
        if (visible) {
          g.moveTo(lastX, lastY);
          g.lineTo(p.x, p.y);
          g.stroke({ color, width, alpha });
        }
        lastX = p.x;
        lastY = p.y;
      }
    }
    function drawNodeDisc(node, highlighted) {
      const g = node.gfx;
      g.clear();
      const r = node.radius;
      if (!highlighted) {
        g.circle(0, 5, r);
        g.fill({ color: 0, alpha: 0.18 });
      }
      if (highlighted) {
        g.circle(0, 0, r + 10);
        g.fill({ color: node.color, alpha: 0.22 });
      }
      g.circle(0, 0, r);
      g.fill(shadeColor(node.color, -0.18));
      g.circle(0, -r * 0.06, r * 0.94);
      g.fill(node.color);
      g.circle(-r * 0.32, -r * 0.42, r * 0.3);
      g.fill({ color: 16777215, alpha: 0.32 });
      g.circle(0, 0, r);
      g.stroke({
        color: 16777215,
        width: highlighted ? 3 : 2,
        alignment: 0
      });
      g.x = node.x;
      g.y = node.y;
      g.zIndex = 10;
      g.hitArea = new pixi.Circle(0, 0, r + 4);
    }
    function drawDropTarget(hover, sourceColor) {
      drawNodeDisc(hover, false);
      const g = hover.gfx;
      const t = performance.now();
      const pulse = Math.sin(t / 280) * 0.5 + 0.5;
      const ringR = hover.radius + 6 + pulse * 5;
      g.circle(0, 0, ringR);
      g.stroke({
        color: sourceColor,
        width: 3,
        alpha: 0.6 + pulse * 0.35
      });
      g.circle(0, 0, hover.radius * 0.42);
      g.fill({ color: sourceColor, alpha: 0.85 });
      g.hitArea = new pixi.Circle(0, 0, hover.radius + 12);
    }
    function drawEdges() {
      edgeGfx.clear();
      for (const node of nodes.values()) {
        if (!node.parent) {
          continue;
        }
        const parent = nodes.get(node.parent);
        if (!parent) {
          continue;
        }
        const isOldLink = dragNode !== null && node === dragNode;
        const isFocusEdge = focusId !== null && (node.id === focusId || node.parent === focusId);
        const dimMul = focusId !== null && !isFocusEdge ? 0.35 : 1;
        drawCurvedEdge(
          edgeGfx,
          parent.x,
          parent.y,
          node.x,
          node.y,
          parent.color,
          isOldLink ? { dashed: true, alpha: 0.28 * dimMul } : { alpha: 0.5 * dimMul }
        );
      }
      if (dragNode && dragHover) {
        const x1 = dragNode.x;
        const y1 = dragNode.y;
        const x2 = dragHover.x;
        const y2 = dragHover.y;
        const targetColor = dragHover.color;
        drawCurvedEdge(edgeGfx, x1, y1, x2, y2, targetColor, {
          alpha: 0.22,
          width: 9
        });
        const dashPhase = Math.floor(performance.now() / 70);
        drawCurvedEdge(edgeGfx, x1, y1, x2, y2, targetColor, {
          alpha: 0.95,
          width: 2.5,
          dashed: true,
          dashStride: 2,
          dashPhase
        });
        const pt = performance.now() % 1300 / 1300;
        const omt = 1 - pt;
        const dx = x2 - x1;
        const cp1x = x1 + dx * 0.5;
        const cp1y = y1;
        const cp2x = x2 - dx * 0.5;
        const cp2y = y2;
        const px = omt * omt * omt * x1 + 3 * omt * omt * pt * cp1x + 3 * omt * pt * pt * cp2x + pt * pt * pt * x2;
        const py = omt * omt * omt * y1 + 3 * omt * omt * pt * cp1y + 3 * omt * pt * pt * cp2y + pt * pt * pt * y2;
        edgeGfx.circle(px, py, 5);
        edgeGfx.fill({ color: 16777215, alpha: 0.95 });
        edgeGfx.stroke({ color: targetColor, width: 2, alpha: 1 });
      }
      postEdgeGfx.clear();
      if (focusId !== null) {
        const center = nodes.get(focusId);
        if (center) {
          for (const post of postNodes.values()) {
            postEdgeGfx.moveTo(center.x, center.y);
            postEdgeGfx.lineTo(post.x, post.y);
            postEdgeGfx.stroke({
              color: center.color,
              width: 1,
              alpha: 0.35
            });
          }
        }
      }
    }
    const FONT_FAMILY2 = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const CHIP_NAME_MAX_CHARS2 = 18;
    const POST_TITLE_MAX_CHARS2 = 22;
    function truncateChipName2(name) {
      return name.length > CHIP_NAME_MAX_CHARS2 ? name.slice(0, CHIP_NAME_MAX_CHARS2 - 1) + "…" : name;
    }
    function ensureChip(node) {
      const existing = chips.get(node.id);
      if (existing) {
        return existing;
      }
      const container = new pixi.Container();
      container.eventMode = "static";
      container.cursor = "pointer";
      const bg = new pixi.Graphics();
      container.addChild(bg);
      const nameText = new pixi.Text({
        text: truncateChipName2(node.name),
        style: {
          fill: 1909543,
          fontSize: 14,
          fontFamily: FONT_FAMILY2,
          fontWeight: "600"
        },
        resolution: CHIP_TEXT_RES2
      });
      container.addChild(nameText);
      const countBg = new pixi.Graphics();
      container.addChild(countBg);
      const countText = new pixi.Text({
        text: String(node.count),
        style: {
          fill: 16777215,
          fontSize: 12,
          fontFamily: FONT_FAMILY2,
          fontWeight: "700"
        },
        resolution: CHIP_TEXT_RES2
      });
      container.addChild(countText);
      const chip = {
        container,
        bg,
        nameText,
        countBg,
        countText,
        width: 0,
        height: 0,
        cachedName: "",
        cachedCount: -1,
        cachedFocused: false,
        cachedHover: false,
        cachedColor: -1
      };
      chips.set(node.id, chip);
      chipLayer.addChild(container);
      container.on("pointerdown", (e) => {
        e.stopPropagation?.();
        pixiInteractionAt = performance.now();
      });
      container.on("pointertap", () => {
        void focusNode(node.id);
      });
      container.on("pointerover", () => {
        chip.cachedHover = true;
        layoutChip(chip, node);
      });
      container.on("pointerout", () => {
        chip.cachedHover = false;
        layoutChip(chip, node);
      });
      return chip;
    }
    function layoutChip(chip, node) {
      const focused = focusId === node.id;
      const displayName = truncateChipName2(node.name);
      const countStr = String(node.count);
      if (chip.nameText.text !== displayName) {
        chip.nameText.text = displayName;
      }
      if (chip.countText.text !== countStr) {
        chip.countText.text = countStr;
      }
      chip.cachedName = displayName;
      chip.cachedCount = node.count;
      chip.cachedFocused = focused;
      chip.cachedColor = node.color;
      const padX = 9;
      const padY = 3;
      const gap = 5;
      const countPadX = 5;
      const countPadY = 2;
      const minBadgeW = 18;
      const nameW = chip.nameText.width;
      const nameH = chip.nameText.height;
      const countW = chip.countText.width;
      const countH = chip.countText.height;
      const badgeW = Math.max(minBadgeW, countW + countPadX * 2);
      const badgeH = countH + countPadY * 2;
      const totalW = padX + nameW + gap + badgeW + padX;
      const totalH = Math.max(nameH, badgeH) + padY * 2;
      chip.width = totalW;
      chip.height = totalH;
      const left = -totalW / 2;
      chip.bg.clear();
      chip.bg.roundRect(left, 0, totalW, totalH, totalH / 2);
      if (focused) {
        chip.bg.fill(node.color);
      } else if (chip.cachedHover) {
        chip.bg.fill({ color: 16777215, alpha: 0.96 });
        chip.bg.stroke({
          color: node.color,
          width: 1.5,
          alpha: 1
        });
      } else {
        chip.bg.fill({ color: 16777215, alpha: 0.88 });
        chip.bg.stroke({
          color: 0,
          width: 1,
          alpha: 0.06
        });
      }
      chip.nameText.x = left + padX;
      chip.nameText.y = (totalH - nameH) / 2;
      chip.nameText.style.fill = focused ? 16777215 : 1909543;
      const badgeX = left + padX + nameW + gap;
      const badgeY = (totalH - badgeH) / 2;
      chip.countBg.clear();
      chip.countBg.roundRect(
        badgeX,
        badgeY,
        badgeW,
        badgeH,
        badgeH / 2
      );
      chip.countBg.fill(
        focused ? { color: 16777215, alpha: 0.25 } : node.color
      );
      chip.countText.x = badgeX + (badgeW - countW) / 2;
      chip.countText.y = badgeY + (badgeH - countH) / 2;
    }
    function destroyChip(id) {
      const chip = chips.get(id);
      if (!chip) {
        return;
      }
      chipLayer.removeChild(chip.container);
      chip.container.destroy({ children: true });
      chips.delete(id);
    }
    function syncChipPositions() {
      const activeIds = new Set(nodes.keys());
      for (const id of [...chips.keys()]) {
        if (!activeIds.has(id)) {
          destroyChip(id);
        }
      }
      const chipCounterScale = 1 / Math.max(0.01, world.scale.x);
      const anyFocus = focusId !== null;
      for (const node of nodes.values()) {
        const chip = ensureChip(node);
        chip.container.x = node.x;
        chip.container.y = node.y + node.radius + 6;
        chip.container.scale.set(chipCounterScale);
        const focused = focusId === node.id;
        const targetAlpha = !anyFocus || focused ? 1 : 0.4;
        if (Math.abs(chip.container.alpha - targetAlpha) > 5e-3) {
          chip.container.alpha += (targetAlpha - chip.container.alpha) * 0.18;
        } else {
          chip.container.alpha = targetAlpha;
        }
        if (Math.abs(node.gfx.alpha - targetAlpha) > 5e-3) {
          node.gfx.alpha += (targetAlpha - node.gfx.alpha) * 0.18;
        } else {
          node.gfx.alpha = targetAlpha;
        }
        const displayName = truncateChipName2(node.name);
        if (chip.cachedName !== displayName || chip.cachedCount !== node.count || chip.cachedFocused !== focused || chip.cachedColor !== node.color) {
          layoutChip(chip, node);
        }
      }
      for (const post of postNodes.values()) {
        const chip = postChips.get(post.id);
        if (!chip) {
          continue;
        }
        chip.container.x = post.x;
        chip.container.y = post.y;
        chip.container.scale.set(chipCounterScale);
        if (chip.container.alpha < 1) {
          chip.container.alpha = Math.min(
            1,
            chip.container.alpha + 0.18
          );
        }
      }
    }
    function physicsStep(dt) {
      const list = Array.from(nodes.values());
      for (const a of list) {
        if (a.pinned) {
          a.x += (a.tx - a.x) * 0.12;
          a.y += (a.ty - a.y) * 0.12;
          a.gfx.x = a.x;
          a.gfx.y = a.y;
          continue;
        }
        let fx = 0;
        let fy = 0;
        for (const b of list) {
          if (a === b) {
            continue;
          }
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 1;
          const f = REPULSION_K / d2;
          const d = Math.sqrt(d2);
          fx += dx / d * f;
          fy += dy / d * f;
        }
        const parent = nodes.get(a.parent);
        if (parent) {
          const dx = parent.x - a.x;
          const dy = parent.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const stretch = d - SPRING_LEN;
          fx += dx / d * stretch * SPRING_K;
          fy += dy / d * stretch * SPRING_K;
        } else {
          fx += -a.x * 8e-4;
          fy += -a.y * 8e-4;
        }
        if (nudgeAwayFrom && a.id !== focusId) {
          const ndx = a.x - nudgeAwayFrom.x;
          const ndy = a.y - nudgeAwayFrom.y;
          const nd = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
          const limit = nudgeAwayFrom.radius + a.radius;
          if (nd < limit) {
            const pushK = 18;
            fx += ndx / nd * pushK * (limit - nd);
            fy += ndy / nd * pushK * (limit - nd);
          }
        }
        if (a !== dragNode) {
          a.x += fx * dt * 1e-3 + (a.tx - a.x) * 0.02;
          a.y += fy * dt * 1e-3 + (a.ty - a.y) * 0.02;
        }
        a.gfx.x = a.x;
        a.gfx.y = a.y;
      }
    }
    function preSettlePhysics(iterations) {
      for (let i = 0; i < iterations; i++) {
        physicsStep(16);
      }
      for (const n of nodes.values()) {
        n.tx = n.x;
        n.ty = n.y;
      }
    }
    function tick() {
      const now = performance.now();
      const dt = Math.min(50, now - lastTick);
      lastTick = now;
      const ZOOM_EASE = 0.22;
      const ds = targetScale - world.scale.x;
      const dwx = targetWorldX - world.x;
      const dwy = targetWorldY - world.y;
      if (Math.abs(ds) > 5e-4 || Math.abs(dwx) > 0.5 || Math.abs(dwy) > 0.5) {
        world.scale.set(world.scale.x + ds * ZOOM_EASE);
        world.x += dwx * ZOOM_EASE;
        world.y += dwy * ZOOM_EASE;
      }
      physicsStep(dt);
      for (const p of postNodes.values()) {
        p.x += (p.tx - p.x) * 0.18;
        p.y += (p.ty - p.y) * 0.18;
        p.gfx.x = p.x;
        p.gfx.y = p.y;
      }
      drawEdges();
      if (dragNode && dragHover) {
        drawDropTarget(dragHover, dragNode.color);
      }
      syncChipPositions();
      raf = requestAnimationFrame(tick);
    }
    let dragStartPos = null;
    let dragOffset = { x: 0, y: 0 };
    function onNodePointerDown(e, node) {
      const ev = e;
      ev.stopPropagation?.();
      pixiInteractionAt = performance.now();
      dragNode = node;
      node.pinned = true;
      node.tx = node.x;
      node.ty = node.y;
      dragStartPos = { x: ev.global.x, y: ev.global.y };
      const local = stageToWorld({ x: ev.global.x, y: ev.global.y });
      dragOffset = { x: node.x - local.x, y: node.y - local.y };
    }
    function stageToWorld(global) {
      return {
        x: (global.x - world.x) / world.scale.x,
        y: (global.y - world.y) / world.scale.y
      };
    }
    function onStagePointerDown(e) {
      const ev = e;
      panActive = true;
      panStart = { x: ev.global.x, y: ev.global.y };
      panMovedDist = 0;
    }
    function onStagePointerMove(e) {
      const ev = e;
      if (dragNode) {
        const cursorWorld = stageToWorld(ev.global);
        const nx = cursorWorld.x + dragOffset.x;
        const ny = cursorWorld.y + dragOffset.y;
        dragNode.x = nx;
        dragNode.y = ny;
        dragNode.tx = nx;
        dragNode.ty = ny;
        dragNode.gfx.x = nx;
        dragNode.gfx.y = ny;
        let hover = null;
        for (const c of nodes.values()) {
          if (c === dragNode) {
            continue;
          }
          const dx = c.x - cursorWorld.x;
          const dy = c.y - cursorWorld.y;
          if (dx * dx + dy * dy < c.radius * c.radius) {
            hover = c;
            break;
          }
        }
        if (hover !== dragHover) {
          if (dragHover) {
            drawNodeDisc(dragHover, focusId === dragHover.id);
          }
          dragHover = hover;
          if (hover && dragNode) {
            drawDropTarget(hover, dragNode.color);
          }
        }
        return;
      }
      if (panActive && panStart) {
        const dx = ev.global.x - panStart.x;
        const dy = ev.global.y - panStart.y;
        world.x += dx;
        world.y += dy;
        targetWorldX += dx;
        targetWorldY += dy;
        panMovedDist += Math.sqrt(dx * dx + dy * dy);
        panStart = { x: ev.global.x, y: ev.global.y };
      }
    }
    async function onStagePointerUp(e) {
      if (dragNode) {
        const node = dragNode;
        const target = dragHover;
        const startPos = dragStartPos;
        dragNode = null;
        dragHover = null;
        dragStartPos = null;
        node.pinned = node.depth === 0;
        let movement = Infinity;
        const ev = e;
        if (startPos && ev && ev.global) {
          const dx = ev.global.x - startPos.x;
          const dy = ev.global.y - startPos.y;
          movement = Math.sqrt(dx * dx + dy * dy);
        }
        if (!target && movement < 2) {
          focusNode(node.id);
          panActive = false;
          panStart = null;
          return;
        }
        if (target && target.id !== node.parent && !isAncestor(node.id, target.id)) {
          try {
            await client.updateTerm("categories", node.id, {
              parent: target.id
            });
            node.parent = target.id;
            terms = terms.map(
              (t) => t.id === node.id ? { ...t, parent: target.id } : t
            );
            buildTree();
          } catch (err) {
            showError(__("Reparent failed:"), err);
          }
        } else {
          drawNodeDisc(node, focusId === node.id);
          if (target) {
            drawNodeDisc(target, focusId === target.id);
          }
        }
      }
      panActive = false;
      panStart = null;
    }
    app.stage.eventMode = "static";
    app.stage.hitArea = new pixi.Rectangle(
      0,
      0,
      stage.clientWidth,
      stage.clientHeight
    );
    app.stage.on("pointerdown", onStagePointerDown);
    app.stage.on("pointermove", onStagePointerMove);
    app.stage.on("pointerup", (e) => void onStagePointerUp(e));
    app.stage.on("pointerupoutside", (e) => void onStagePointerUp(e));
    function onWheel(e) {
      e.preventDefault();
      const SENSITIVITY = 8e-4;
      const factor = Math.exp(-e.deltaY * SENSITIVITY);
      const prev = targetScale;
      const next = Math.max(0.3, Math.min(2.5, prev * factor));
      if (Math.abs(next - prev) < 5e-4) {
        return;
      }
      const r = stage.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const wx = (sx - targetWorldX) / prev;
      const wy = (sy - targetWorldY) / prev;
      targetScale = next;
      targetWorldX = sx - wx * next;
      targetWorldY = sy - wy * next;
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    let firstFitDone = false;
    let settledW = 0;
    let settledH = 0;
    const SETTLE_THRESHOLD_PX = 24;
    const SETTLE_DEBOUNCE_MS = 80;
    let settleTimer = null;
    function onResize() {
      const r = stage.getBoundingClientRect();
      app.renderer.resize(r.width, r.height);
      app.stage.hitArea = new pixi.Rectangle(0, 0, r.width, r.height);
      if (!firstFitDone && r.width > 0 && r.height > 0) {
        firstFitDone = true;
        settledW = r.width;
        settledH = r.height;
        fitToView();
        stage.classList.remove("is-loading");
      }
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        const cur = stage.getBoundingClientRect();
        const dw = Math.abs(cur.width - settledW);
        const dh = Math.abs(cur.height - settledH);
        if (dw >= SETTLE_THRESHOLD_PX || dh >= SETTLE_THRESHOLD_PX) {
          settledW = cur.width;
          settledH = cur.height;
          recenterCamera();
        }
      }, SETTLE_DEBOUNCE_MS);
      app.render();
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(stage);
    function isAncestor(ancestor, descendant) {
      let cur = nodes.get(descendant);
      let safety = 32;
      while (cur && safety-- > 0) {
        if (cur.id === ancestor) {
          return true;
        }
        if (!cur.parent) {
          return false;
        }
        cur = nodes.get(cur.parent);
      }
      return false;
    }
    let lastFocusChange = 0;
    const SPOTLIGHT_RADIUS2 = POST_RING_RADIUS$1 + 130;
    async function focusNode(id) {
      if (focusId === id) {
        closeFocus();
        return;
      }
      const wasFocused = focusId !== null;
      focusId = id;
      focusPage = 1;
      lastFocusChange = performance.now();
      const focused = nodes.get(id);
      if (focused) {
        if (!wasFocused) {
          prevView = {
            scale: targetScale,
            x: targetWorldX,
            y: targetWorldY
          };
        }
        const r = stage.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const half = POST_RING_RADIUS$1 + 70;
          const sx = r.width * 0.85 / (2 * half);
          const sy = r.height * 0.85 / (2 * half);
          const newScale = Math.max(
            0.5,
            Math.min(1.6, Math.min(sx, sy))
          );
          targetScale = newScale;
          targetWorldX = r.width / 2 - focused.x * newScale;
          targetWorldY = r.height / 2 - focused.y * newScale;
        }
        nudgeAwayFrom = {
          x: focused.x,
          y: focused.y,
          radius: SPOTLIGHT_RADIUS2
        };
        pinnedTargetBackup.clear();
        for (const n of nodes.values()) {
          if (n.id === id || !n.pinned) {
            continue;
          }
          const dx = n.x - focused.x;
          const dy = n.y - focused.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d >= SPOTLIGHT_RADIUS2 + n.radius) {
            continue;
          }
          pinnedTargetBackup.set(n.id, { tx: n.tx, ty: n.ty });
          const push = SPOTLIGHT_RADIUS2 + n.radius + 20;
          n.tx = focused.x + dx / d * push;
          n.ty = focused.y + dy / d * push;
        }
      }
      for (const n of nodes.values()) {
        drawNodeDisc(n, focusId === n.id);
      }
      paintSidebar();
      await loadPostsForFocus();
    }
    function closeFocus() {
      focusId = null;
      lastFocusChange = performance.now();
      loadSeq++;
      nudgeAwayFrom = null;
      for (const [id, t] of pinnedTargetBackup) {
        const n = nodes.get(id);
        if (n) {
          n.tx = t.tx;
          n.ty = t.ty;
        }
      }
      pinnedTargetBackup.clear();
      if (prevView) {
        targetScale = prevView.scale;
        targetWorldX = prevView.x;
        targetWorldY = prevView.y;
        prevView = null;
      }
      paintSidebar();
      clearPosts();
      for (const n of nodes.values()) {
        drawNodeDisc(n, false);
      }
    }
    function clearPosts() {
      for (const post of postNodes.values()) {
        postLayer.removeChild(post.gfx);
        post.gfx.destroy();
      }
      postNodes.clear();
      for (const chip of postChips.values()) {
        postChipLayer.removeChild(chip.container);
        chip.container.destroy({ children: true });
      }
      postChips.clear();
      postEdgeGfx.clear();
      pager.visible = false;
    }
    function ensurePostChip(post) {
      const existing = postChips.get(post.id);
      if (existing) {
        return existing;
      }
      const container = new pixi.Container();
      container.eventMode = "static";
      container.cursor = "pointer";
      container.alpha = 0;
      const bg = new pixi.Graphics();
      container.addChild(bg);
      const dot = new pixi.Graphics();
      container.addChild(dot);
      const titleText = new pixi.Text({
        text: post.title,
        style: {
          fill: 1909543,
          // Matches category chip fontSize so the two read at
          // the same weight when both are deployed. Base size
          // is the on-screen size since the post chip's
          // container counter-scales with `1/world.scale.x`
          // in `syncChipPositions`.
          fontSize: 14,
          fontFamily: FONT_FAMILY2,
          fontWeight: "500"
        },
        resolution: CHIP_TEXT_RES2
      });
      container.addChild(titleText);
      const chip = {
        container,
        bg,
        dot,
        titleText,
        width: 0,
        height: 0,
        cachedTitle: "",
        cachedHover: false
      };
      postChips.set(post.id, chip);
      postChipLayer.addChild(container);
      container.on("pointerdown", (e) => {
        e.stopPropagation?.();
        pixiInteractionAt = performance.now();
      });
      container.on("pointertap", () => {
        openInPostsTab(post.id, post.editUrl, post.title);
        closeFocus();
      });
      container.on("pointerover", () => {
        chip.cachedHover = true;
        layoutPostChip(chip, post);
      });
      container.on("pointerout", () => {
        chip.cachedHover = false;
        layoutPostChip(chip, post);
      });
      layoutPostChip(chip, post);
      return chip;
    }
    function layoutPostChip(chip, post) {
      const displayTitle = post.title.length > POST_TITLE_MAX_CHARS2 ? post.title.slice(0, POST_TITLE_MAX_CHARS2 - 1) + "…" : post.title;
      if (chip.titleText.text !== displayTitle) {
        chip.titleText.text = displayTitle;
      }
      chip.cachedTitle = displayTitle;
      const padX = 9;
      const padY = 3;
      const dotR = 4;
      const gap = 6;
      const titleW = chip.titleText.width;
      const titleH = chip.titleText.height;
      const totalW = padX + dotR * 2 + gap + titleW + padX;
      const totalH = Math.max(titleH, dotR * 2) + padY * 2;
      chip.width = totalW;
      chip.height = totalH;
      const left = -totalW / 2;
      const top = -totalH / 2;
      chip.bg.clear();
      chip.bg.roundRect(left, top, totalW, totalH, totalH / 2);
      if (chip.cachedHover) {
        chip.bg.fill({ color: 16777215, alpha: 1 });
        chip.bg.stroke({
          color: post.tone,
          width: 1.5,
          alpha: 1
        });
      } else {
        chip.bg.fill({ color: 16777215, alpha: 0.95 });
        chip.bg.stroke({
          color: 0,
          width: 1,
          alpha: 0.12
        });
      }
      chip.dot.clear();
      chip.dot.circle(left + padX + dotR, 0, dotR);
      chip.dot.fill({ color: post.tone, alpha: 0.85 });
      chip.dot.stroke({ color: 16777215, width: 1 });
      chip.titleText.x = left + padX + dotR * 2 + gap;
      chip.titleText.y = -titleH / 2;
    }
    const POSTS_CACHE_TTL_MS = 6e4;
    const postsCache = /* @__PURE__ */ new Map();
    function applyPostsResult(entry, focusedNodeId) {
      focusTotalPages = entry.totalPages;
      if (Number.isFinite(entry.realTotal)) {
        const node = nodes.get(focusedNodeId);
        if (node && node.count !== entry.realTotal) {
          node.count = entry.realTotal;
          terms = terms.map(
            (t) => t.id === node.id ? { ...t, count: entry.realTotal } : t
          );
          layoutChip(ensureChip(node), node);
        }
      }
      renderPosts(entry.items);
    }
    async function loadPostsForFocus() {
      if (focusId === null) {
        return;
      }
      const mySeq = ++loadSeq;
      const myFocusId = focusId;
      const cacheKey2 = `${focusId}:${focusPage}`;
      const cached = postsCache.get(cacheKey2);
      if (cached && performance.now() - cached.fetchedAt < POSTS_CACHE_TTL_MS) {
        applyPostsResult(cached, myFocusId);
        return;
      }
      const cfg = client.getConfig();
      const url = new URL(cfg.postsUrl);
      url.searchParams.set("categories", String(focusId));
      url.searchParams.set("per_page", String(POST_PER_PAGE$1));
      url.searchParams.set("page", String(focusPage));
      url.searchParams.set("status", "any");
      url.searchParams.set("_fields", "id,title,status");
      try {
        const response = await fetchShellJson$1(client, url.toString());
        if (mySeq !== loadSeq || focusId !== myFocusId) {
          return;
        }
        const raw = response.json ?? [];
        const totalPages = Math.max(
          1,
          parseInt(response.headers.get("X-WP-TotalPages") ?? "1", 10) || 1
        );
        const realTotalParsed = parseInt(response.headers.get("X-WP-Total") ?? "", 10);
        const realTotal = Number.isFinite(realTotalParsed) ? realTotalParsed : -1;
        const items = raw.map((p) => ({
          id: p.id,
          title: stripTags$1(p.title?.rendered || `#${p.id}`),
          editUrl: `${cfg.editPostUrlBase}?post=${p.id}&action=edit`
        }));
        const entry = {
          items,
          totalPages,
          realTotal,
          fetchedAt: performance.now()
        };
        postsCache.set(cacheKey2, entry);
        applyPostsResult(entry, myFocusId);
      } catch (err) {
        showError(__("Couldn’t load posts:"), err);
      }
    }
    function renderPosts(items) {
      clearPosts();
      if (focusId === null) {
        return;
      }
      const center = nodes.get(focusId);
      if (!center) {
        return;
      }
      const count = items.length;
      const ringR = POST_RING_RADIUS$1 + Math.max(0, count - 8) * 6;
      items.forEach((item, idx) => {
        const angle = 2 * Math.PI / Math.max(1, count) * idx - Math.PI / 2;
        const tx = center.x + Math.cos(angle) * ringR;
        const ty = center.y + Math.sin(angle) * ringR;
        const tone = center.color;
        const gfx = new pixi.Graphics();
        postLayer.addChild(gfx);
        const post = {
          id: item.id,
          title: item.title,
          editUrl: item.editUrl,
          angle,
          r: ringR,
          x: center.x,
          y: center.y,
          tx,
          ty,
          gfx,
          tone
        };
        postNodes.set(item.id, post);
        ensurePostChip(post);
      });
      repaintPager();
    }
    function repaintPager() {
      if (focusId === null || focusTotalPages <= 1) {
        pager.visible = false;
        return;
      }
      pager.visible = true;
      const center = nodes.get(focusId);
      if (!center) {
        pager.visible = false;
        return;
      }
      const prevDisabled = focusPage <= 1;
      const nextDisabled = focusPage >= focusTotalPages;
      drawPagerButton(pagerPrev, "◀", prevDisabled);
      drawPagerButton(pagerNext, "▶", nextDisabled);
      pagerPrev.cursor = prevDisabled ? "default" : "pointer";
      pagerNext.cursor = nextDisabled ? "default" : "pointer";
      pagerLabel.text = `${focusPage} / ${focusTotalPages}`;
      pagerPrev.x = -38;
      pagerPrev.y = 0;
      pagerNext.x = 38;
      pagerNext.y = 0;
      pagerLabel.x = 0;
      pagerLabel.y = 0;
      pager.x = center.x;
      pager.y = center.y + POST_RING_RADIUS$1 + 60;
    }
    function drawPagerButton(gfx, glyph, disabled) {
      gfx.clear();
      gfx.circle(0, 0, 14);
      gfx.fill({
        color: disabled ? 15921906 : 16777215,
        alpha: disabled ? 0.7 : 1
      });
      gfx.stroke({
        color: 0,
        width: 1,
        alpha: 0.12
      });
      const children = gfx.children;
      const label = children?.[0] ?? null;
      if (!label) {
        const t = new pixi.Text({
          text: glyph,
          style: {
            fill: disabled ? 11580344 : 5265246,
            fontSize: 16,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontWeight: "600"
          },
          resolution: CHIP_TEXT_RES2
        });
        t.anchor.set(0.5);
        gfx.addChild(t);
      } else {
        label.text = glyph;
        label.style.fill = disabled ? 11580344 : 5265246;
      }
    }
    function openInPostsTab(_id, editUrl, title) {
      const wm = api?.windowManager;
      const derive = api?.deriveWindowId;
      const postsWin = wm && typeof wm.getById === "function" ? wm.getById("desktop-mode-posts") : void 0;
      if (postsWin && typeof postsWin.isFullscreen === "function" && typeof postsWin.toggleFullscreen === "function" && postsWin.isFullscreen()) {
        postsWin.toggleFullscreen();
      }
      if (wm && typeof derive === "function") {
        const id = derive(editUrl);
        wm.open({
          id,
          baseId: id,
          url: editUrl,
          title: title ?? editUrl,
          icon: "dashicons-admin-post"
        });
        return;
      }
      try {
        window.open(editUrl, "_blank");
      } catch {
        window.location.assign(editUrl);
      }
    }
    function paintDraftSidebar(d) {
      const parentNode = d.parent !== 0 ? nodes.get(d.parent) : null;
      const header = document.createElement("div");
      header.className = "wpd-mindmap__sidebar-header";
      const dot = document.createElement("span");
      dot.className = "wpd-mindmap__sidebar-dot";
      const color = parentNode ? parentNode.color : clusterColor(terms.length);
      dot.style.background = `#${color.toString(16).padStart(6, "0")}`;
      const label = document.createElement("code");
      label.className = "wpd-mindmap__sidebar-slug";
      label.textContent = parentNode ? sprintf(
        /* translators: %s: parent category name. */
        __("New child of %s"),
        parentNode.name
      ) : __("New root category");
      header.appendChild(dot);
      header.appendChild(label);
      sidebar.appendChild(header);
      const nameLabel = document.createElement("label");
      nameLabel.className = "wpd-mindmap__sidebar-label";
      nameLabel.textContent = __("Name");
      sidebar.appendChild(nameLabel);
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "wpd-mindmap__editor-name";
      nameInput.placeholder = __("e.g. Recipes");
      sidebar.appendChild(nameInput);
      requestAnimationFrame(() => nameInput.focus());
      const slugLabel = document.createElement("label");
      slugLabel.className = "wpd-mindmap__sidebar-label";
      slugLabel.textContent = __("Slug");
      sidebar.appendChild(slugLabel);
      const slugInput = document.createElement("input");
      slugInput.type = "text";
      slugInput.className = "wpd-mindmap__editor-name";
      slugInput.placeholder = __("auto-from-name");
      slugInput.spellcheck = false;
      slugInput.autocapitalize = "off";
      slugInput.addEventListener("input", () => {
        const v = slugInput.value;
        const norm = v.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        if (v !== norm) {
          const sel = slugInput.selectionStart ?? norm.length;
          slugInput.value = norm;
          slugInput.setSelectionRange(sel, sel);
        }
      });
      sidebar.appendChild(slugInput);
      const descLabel = document.createElement("label");
      descLabel.className = "wpd-mindmap__sidebar-label";
      descLabel.textContent = __("Description");
      sidebar.appendChild(descLabel);
      const descInput = document.createElement("textarea");
      descInput.className = "wpd-mindmap__editor-desc";
      descInput.placeholder = __("Description (optional)");
      descInput.rows = 4;
      sidebar.appendChild(descInput);
      const actions = document.createElement("div");
      actions.className = "wpd-mindmap__editor-actions";
      const createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className = "wpd-mindmap__btn wpd-mindmap__btn--primary";
      createBtn.textContent = __("Create");
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "wpd-mindmap__btn wpd-mindmap__btn--danger";
      cancelBtn.textContent = __("Cancel");
      const handleCreate = async () => {
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.focus();
          return;
        }
        createBtn.disabled = true;
        try {
          const created = await client.createCategory(name, d.parent, {
            slug: slugInput.value.trim() || void 0,
            description: descInput.value || void 0
          });
          const next = {
            id: created.id,
            name: created.name,
            slug: created.slug || "",
            parent: created.parent,
            count: 0,
            description: created.description || "",
            isDefault: false
          };
          if (!terms.some((t) => t.id === next.id)) {
            terms = terms.concat(next);
          }
          draft = null;
          buildTree();
          focusId = created.id;
          paintSidebar();
          await loadPostsForFocus();
        } catch (err) {
          createBtn.disabled = false;
          showError(__("Couldn’t create:"), err);
        }
      };
      createBtn.addEventListener("click", () => {
        void handleCreate();
      });
      cancelBtn.addEventListener("click", () => {
        draft = null;
        paintSidebar();
      });
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void handleCreate();
        } else if (e.key === "Escape") {
          draft = null;
          paintSidebar();
        }
      });
      actions.appendChild(createBtn);
      actions.appendChild(cancelBtn);
      sidebar.appendChild(actions);
    }
    function paintSidebar() {
      sidebar.replaceChildren();
      if (draft !== null) {
        paintDraftSidebar(draft);
        return;
      }
      if (focusId === null) {
        const empty = document.createElement("div");
        empty.className = "wpd-mindmap__sidebar-empty";
        const icon = document.createElement("span");
        icon.className = "dashicons dashicons-admin-tools";
        icon.setAttribute("aria-hidden", "true");
        empty.appendChild(icon);
        const title = document.createElement("h3");
        title.textContent = __("No category selected");
        empty.appendChild(title);
        const help = document.createElement("p");
        help.textContent = __(
          "Click a node on the mindmap to edit its name, description, and posts."
        );
        empty.appendChild(help);
        sidebar.appendChild(empty);
        return;
      }
      const node = nodes.get(focusId);
      if (!node) {
        focusId = null;
        paintSidebar();
        return;
      }
      const id = node.id;
      const header = document.createElement("div");
      header.className = "wpd-mindmap__sidebar-header";
      const dot = document.createElement("span");
      dot.className = "wpd-mindmap__sidebar-dot";
      dot.style.background = `#${node.color.toString(16).padStart(6, "0")}`;
      const term = terms.find((t) => t.id === id);
      const idLabel = document.createElement("code");
      idLabel.className = "wpd-mindmap__sidebar-slug";
      idLabel.textContent = `#${id}`;
      header.appendChild(dot);
      header.appendChild(idLabel);
      sidebar.appendChild(header);
      const nameLabel = document.createElement("label");
      nameLabel.className = "wpd-mindmap__sidebar-label";
      nameLabel.textContent = __("Name");
      sidebar.appendChild(nameLabel);
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "wpd-mindmap__editor-name";
      nameInput.value = node.name;
      nameInput.placeholder = __("Name");
      sidebar.appendChild(nameInput);
      const slugLabel = document.createElement("label");
      slugLabel.className = "wpd-mindmap__sidebar-label";
      slugLabel.textContent = __("Slug");
      sidebar.appendChild(slugLabel);
      const slugInput = document.createElement("input");
      slugInput.type = "text";
      slugInput.className = "wpd-mindmap__editor-name";
      slugInput.value = term?.slug || "";
      slugInput.placeholder = __("auto-from-name");
      slugInput.spellcheck = false;
      slugInput.autocapitalize = "off";
      slugInput.addEventListener("input", () => {
        const v = slugInput.value;
        const norm = v.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        if (v !== norm) {
          const sel = slugInput.selectionStart ?? norm.length;
          slugInput.value = norm;
          slugInput.setSelectionRange(sel, sel);
        }
      });
      sidebar.appendChild(slugInput);
      const descLabel = document.createElement("label");
      descLabel.className = "wpd-mindmap__sidebar-label";
      descLabel.textContent = __("Description");
      sidebar.appendChild(descLabel);
      const descInput = document.createElement("textarea");
      descInput.className = "wpd-mindmap__editor-desc";
      descInput.value = node.description || "";
      descInput.placeholder = __("Description (optional)");
      descInput.rows = 4;
      sidebar.appendChild(descInput);
      const meta = document.createElement("p");
      meta.className = "wpd-mindmap__sidebar-meta";
      meta.textContent = sprintf(
        /* translators: %d: post count. */
        _n(
          "%d post in this category.",
          "%d posts in this category.",
          node.count
        ),
        node.count
      );
      sidebar.appendChild(meta);
      const actions = document.createElement("div");
      actions.className = "wpd-mindmap__editor-actions";
      const addChildBtn = document.createElement("button");
      addChildBtn.type = "button";
      addChildBtn.className = "wpd-mindmap__btn wpd-mindmap__btn--secondary";
      addChildBtn.textContent = __("+ Child");
      addChildBtn.addEventListener("click", () => {
        startDraft(id);
      });
      const makeRootBtn = node.parent && node.parent !== 0 ? document.createElement("button") : null;
      if (makeRootBtn) {
        makeRootBtn.type = "button";
        makeRootBtn.className = "wpd-mindmap__btn wpd-mindmap__btn--secondary";
        makeRootBtn.textContent = __("Make root");
        makeRootBtn.title = __(
          "Promote this category to a top-level root (no parent)."
        );
        makeRootBtn.addEventListener("click", async () => {
          try {
            await client.updateTerm("categories", node.id, { parent: 0 });
            node.parent = 0;
            terms = terms.map(
              (t) => t.id === node.id ? { ...t, parent: 0 } : t
            );
            buildTree();
            paintSidebar();
          } catch (err) {
            showError(__("Couldn’t reparent:"), err);
          }
        });
      }
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "wpd-mindmap__btn wpd-mindmap__btn--primary";
      saveBtn.textContent = __("Save");
      saveBtn.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        if (!name) {
          return;
        }
        const description = descInput.value;
        const slugRaw = slugInput.value.trim();
        const currentSlug = term?.slug ?? "";
        if (name === node.name && description === (node.description || "") && slugRaw === currentSlug) {
          return;
        }
        const patch = { name, description };
        if (slugRaw !== currentSlug) {
          patch.slug = slugRaw;
        }
        try {
          const updated = await client.updateTerm(
            "categories",
            node.id,
            patch
          );
          node.name = updated.name;
          node.description = updated.description;
          terms = terms.map(
            (t) => t.id === node.id ? {
              ...t,
              name: updated.name,
              description: updated.description,
              slug: updated.slug ?? t.slug
            } : t
          );
          layoutChip(ensureChip(node), node);
          paintSidebar();
        } catch (err) {
          showError(__("Couldn’t save:"), err);
        }
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "wpd-mindmap__btn wpd-mindmap__btn--danger";
      delBtn.textContent = __("Delete");
      let armResetTimer = null;
      const armDelete = () => {
        delBtn.textContent = __("Click again to delete");
        delBtn.classList.add("is-armed");
        if (armResetTimer !== null) {
          window.clearTimeout(armResetTimer);
        }
        armResetTimer = window.setTimeout(() => {
          delBtn.textContent = __("Delete");
          delBtn.classList.remove("is-armed");
          armResetTimer = null;
        }, 2500);
      };
      delBtn.addEventListener("click", async () => {
        if (!delBtn.classList.contains("is-armed")) {
          armDelete();
          return;
        }
        if (armResetTimer !== null) {
          window.clearTimeout(armResetTimer);
          armResetTimer = null;
        }
        try {
          await client.deleteTerm("categories", node.id);
          terms = terms.filter((t) => t.id !== node.id);
          focusId = null;
          clearPosts();
          buildTree();
          paintSidebar();
        } catch (err) {
          showError(__("Couldn’t delete:"), err);
        }
      });
      actions.appendChild(addChildBtn);
      if (makeRootBtn) {
        actions.appendChild(makeRootBtn);
      }
      actions.appendChild(saveBtn);
      actions.appendChild(delBtn);
      sidebar.appendChild(actions);
    }
    function startDraft(parent) {
      if (parent !== 0 && !nodes.get(parent)) {
        return;
      }
      draft = { parent };
      paintSidebar();
    }
    addRootBtn.addEventListener("click", () => {
      startDraft(0);
    });
    function fitToView(opts = {}) {
      const padding = opts.padding ?? 90;
      const animate = opts.animate ?? false;
      const r = stage.getBoundingClientRect();
      if (nodes.size === 0 || r.width === 0 || r.height === 0) {
        const cx2 = r.width / 2;
        const cy2 = r.height / 2;
        targetScale = 1;
        targetWorldX = cx2;
        targetWorldY = cy2;
        if (!animate) {
          world.x = cx2;
          world.y = cy2;
          world.scale.set(1);
        }
        return;
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const LABEL_OVERHANG = 30;
      for (const n of nodes.values()) {
        const rad = n.radius;
        minX = Math.min(minX, n.tx - rad);
        minY = Math.min(minY, n.ty - rad);
        maxX = Math.max(maxX, n.tx + rad);
        maxY = Math.max(maxY, n.ty + rad + LABEL_OVERHANG);
      }
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const sx = (r.width - padding * 2) / w;
      const sy = (r.height - padding * 2) / h;
      const scale = Math.max(0.2, Math.min(1.5, Math.min(sx, sy)));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const newWorldX = r.width / 2 - cx * scale;
      const newWorldY = r.height / 2 - cy * scale;
      targetScale = scale;
      targetWorldX = newWorldX;
      targetWorldY = newWorldY;
      if (!animate) {
        world.scale.set(scale);
        world.x = newWorldX;
        world.y = newWorldY;
      }
    }
    function recenterCamera() {
      if (focusId !== null) {
        const focused = nodes.get(focusId);
        const r = stage.getBoundingClientRect();
        if (focused && r.width > 0 && r.height > 0) {
          const half = POST_RING_RADIUS$1 + 70;
          const sx = r.width * 0.85 / (2 * half);
          const sy = r.height * 0.85 / (2 * half);
          const newScale = Math.max(
            0.5,
            Math.min(1.6, Math.min(sx, sy))
          );
          targetScale = newScale;
          targetWorldX = r.width / 2 - focused.x * newScale;
          targetWorldY = r.height / 2 - focused.y * newScale;
          return;
        }
      }
      fitToView({ animate: true });
    }
    recenterBtn.addEventListener("click", () => recenterCamera());
    app.canvas.addEventListener("click", (e) => {
      const now = performance.now();
      if (now - lastFocusChange < 250 || now - pixiInteractionAt < 250) {
        return;
      }
      if (panMovedDist > 4) {
        return;
      }
      const target = e.target;
      if (target === app.canvas && !dragNode && focusId !== null) {
        closeFocus();
      }
    });
    async function refreshCountsViaBulk() {
      if (terms.length === 0) {
        return;
      }
      const cfg = client.getConfig();
      const url = new URL(
        joinRestUrl(cfg.restRoot, "desktop-mode/v1/term-counts")
      );
      url.searchParams.set("taxonomy", "category");
      url.searchParams.set(
        "ids",
        terms.map((t) => t.id).join(",")
      );
      try {
        const response = await fetchShellJson$1(client, url.toString());
        const map = response.json;
        let dirty = false;
        terms = terms.map((t) => {
          const fresh = map[String(t.id)];
          if (typeof fresh === "number" && fresh !== t.count) {
            dirty = true;
            const node = nodes.get(t.id);
            if (node) {
              node.count = fresh;
              layoutChip(ensureChip(node), node);
            }
            return { ...t, count: fresh };
          }
          return t;
        });
        if (dirty) {
          buildTree();
          fitToView({ animate: true });
        }
      } catch {
      }
    }
    buildTree();
    paintSidebar();
    preSettlePhysics(80);
    raf = requestAnimationFrame(tick);
    void refreshCountsViaBulk();
    let currentMatches = [];
    let selectedIndex = 0;
    const repaintHighlight = () => {
      const items = searchResults.querySelectorAll(
        ".wpd-mindmap__search-result"
      );
      items.forEach((el, i) => {
        const active = i === selectedIndex;
        el.classList.toggle("is-active", active);
        if (active) {
          el.scrollIntoView({ block: "nearest" });
        }
      });
    };
    const selectMatch = (n) => {
      searchInput.value = "";
      searchResults.hidden = true;
      searchResults.replaceChildren();
      currentMatches = [];
      selectedIndex = 0;
      void focusNode(n.id);
    };
    const renderSearchResults = () => {
      const q = searchInput.value.trim().toLowerCase();
      if (q.length === 0) {
        searchResults.hidden = true;
        searchResults.replaceChildren();
        currentMatches = [];
        selectedIndex = 0;
        return;
      }
      currentMatches = Array.from(nodes.values()).filter((n) => n.name.toLowerCase().includes(q)).sort((a, b) => b.count - a.count).slice(0, 10);
      selectedIndex = 0;
      searchResults.replaceChildren();
      currentMatches.forEach((n, i) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wpd-mindmap__search-result";
        if (i === 0) {
          btn.classList.add("is-active");
        }
        const nameEl = document.createElement("span");
        nameEl.className = "wpd-mindmap__search-title";
        nameEl.textContent = n.name || `#${n.id}`;
        const countEl = document.createElement("span");
        countEl.className = "wpd-mindmap__search-meta";
        countEl.textContent = sprintf(
          /* translators: %d: number of posts assigned to a category. */
          _n("%d post", "%d posts", n.count),
          n.count
        );
        btn.appendChild(nameEl);
        btn.appendChild(countEl);
        btn.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          selectMatch(n);
        });
        btn.addEventListener("mouseenter", () => {
          selectedIndex = i;
          repaintHighlight();
        });
        li.appendChild(btn);
        searchResults.appendChild(li);
      });
      searchResults.hidden = currentMatches.length === 0;
    };
    searchInput.addEventListener("input", renderSearchResults);
    searchInput.addEventListener("focus", renderSearchResults);
    searchInput.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") {
        if (currentMatches.length === 0) {
          return;
        }
        ev.preventDefault();
        selectedIndex = Math.min(
          selectedIndex + 1,
          currentMatches.length - 1
        );
        repaintHighlight();
      } else if (ev.key === "ArrowUp") {
        if (currentMatches.length === 0) {
          return;
        }
        ev.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        repaintHighlight();
      } else if (ev.key === "Enter") {
        if (currentMatches.length === 0) {
          return;
        }
        ev.preventDefault();
        selectMatch(currentMatches[selectedIndex]);
      } else if (ev.key === "Escape") {
        searchInput.value = "";
        searchResults.hidden = true;
        searchResults.replaceChildren();
        currentMatches = [];
        selectedIndex = 0;
      }
    });
    searchInput.addEventListener("blur", () => {
      setTimeout(() => {
        searchResults.hidden = true;
      }, 120);
    });
    const onDocClickSearch = (ev) => {
      if (!searchWrap.contains(ev.target)) {
        searchResults.hidden = true;
      }
    };
    document.addEventListener("click", onDocClickSearch);
    return () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      ro.disconnect();
      stage.removeEventListener("wheel", onWheel);
      document.removeEventListener("click", onDocClickSearch);
      try {
        app.ticker?.stop();
      } catch {
      }
      try {
        app.destroy({ removeView: true }, { children: true });
      } catch {
      }
      host.replaceChildren();
      host.classList.remove("wpd-mindmap");
    };
  }
  function nodeRadius(count, all) {
    const max = Math.max(1, ...all.map((t) => t.count));
    const ratio = Math.sqrt(count / max);
    return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * ratio;
  }
  function readAdminThemeHue$1() {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--wp-admin-theme-color").trim();
      if (!value) {
        return 210;
      }
      const c = document.createElement("span");
      c.style.color = value;
      document.body.appendChild(c);
      const rgb = getComputedStyle(c).color;
      c.remove();
      const m = rgb.match(/\d+/g);
      if (!m || m.length < 3) {
        return 210;
      }
      return rgbToHue$1(
        parseInt(m[0], 10),
        parseInt(m[1], 10),
        parseInt(m[2], 10)
      );
    } catch {
      return 210;
    }
  }
  function rgbToHue$1(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    if (d === 0) {
      return 210;
    }
    let h;
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    return Math.round(h * 60);
  }
  function hslToInt$1(h, s, l) {
    const sn = s / 100;
    const ln = l / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const hp = h / 60;
    const x = c * (1 - Math.abs(hp % 2 - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp < 1) {
      r = c;
      g = x;
    } else if (hp < 2) {
      r = x;
      g = c;
    } else if (hp < 3) {
      g = c;
      b = x;
    } else if (hp < 4) {
      g = x;
      b = c;
    } else if (hp < 5) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    const m = ln - c / 2;
    const ri = Math.round((r + m) * 255);
    const gi = Math.round((g + m) * 255);
    const bi = Math.round((b + m) * 255);
    return ri * 65536 + gi * 256 + bi;
  }
  function shadeColor(color, delta) {
    const r = Math.floor(color / 65536) % 256;
    const g = Math.floor(color / 256) % 256;
    const b = color % 256;
    const adj = (ch) => {
      return Math.round(ch * (1 + delta));
    };
    return adj(r) * 65536 + adj(g) * 256 + adj(b);
  }
  function stripTags$1(html2) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html2;
    return tmp.textContent || tmp.innerText || "";
  }
  function showToast$1(title, err) {
    const reason = err instanceof Error ? err.message : String(err);
    const api = window.wp?.desktop;
    if (api && typeof api.showToast === "function") {
      api.showToast({
        message: `${title} ${reason}`.trim(),
        duration: 6e3
      });
      return;
    }
    console.error(title, err);
  }
  async function fetchShellJson$1(client, url) {
    const cfg = client.getConfig();
    const init = {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    };
    const response = await trackedFetch(url, init, {
      windowId: "desktop-mode-posts"
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    return { json, headers: response.headers };
  }
  const categoriesMindmap = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    mountCategoriesMindmap
  }, Symbol.toStringTag, { value: "Module" }));
  const POST_PER_PAGE = 10;
  const POST_RING_RADIUS = 170;
  const MIN_FONT_SIZE = 11;
  const MAX_FONT_SIZE = 28;
  const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const CHIP_TEXT_RES = 3;
  const CHIP_NAME_MAX_CHARS = 22;
  const POST_TITLE_MAX_CHARS = 22;
  const CHIP_PAD_X = 11;
  const CHIP_PAD_Y = 6;
  const CHIP_GAP_HASH = 4;
  const CHIP_GAP_COUNT = 8;
  const SPIRAL_PADDING = 14;
  const SPOTLIGHT_RADIUS = POST_RING_RADIUS + 130;
  async function mountTagsCloud(host, client) {
    const api = window.wp?.desktop;
    if (!api || typeof api.loadModules !== "function") {
      host.textContent = __("Tag cloud unavailable: shell modules API missing.");
      return () => {
      };
    }
    try {
      await api.loadModules(["pixijs"]);
    } catch {
      host.textContent = __("Tag cloud unavailable.");
      return () => {
      };
    }
    const pixiMaybe = window.PIXI;
    if (!pixiMaybe) {
      host.textContent = __("Tag cloud unavailable.");
      return () => {
      };
    }
    const pixi = pixiMaybe;
    host.replaceChildren();
    host.classList.add("wpd-tagcloud");
    const toolbar = document.createElement("div");
    toolbar.className = "wpd-tagcloud__toolbar";
    const addTagBtn = document.createElement("button");
    addTagBtn.type = "button";
    addTagBtn.className = "wpd-tagcloud__btn wpd-tagcloud__btn--primary";
    addTagBtn.innerHTML = '<span class="dashicons dashicons-plus" aria-hidden="true"></span>' + __("Add tag");
    const recenterBtn = document.createElement("button");
    recenterBtn.type = "button";
    recenterBtn.className = "wpd-tagcloud__btn";
    recenterBtn.innerHTML = '<span class="dashicons dashicons-image-rotate" aria-hidden="true"></span>' + __("Recenter");
    const reflowBtn = document.createElement("button");
    reflowBtn.type = "button";
    reflowBtn.className = "wpd-tagcloud__btn";
    reflowBtn.innerHTML = '<span class="dashicons dashicons-grid-view" aria-hidden="true"></span>' + __("Reflow");
    reflowBtn.title = __(
      "Recompute the chip layout from scratch — discards manual repositioning."
    );
    const searchWrap = document.createElement("div");
    searchWrap.className = "wpd-tagcloud__search";
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "wpd-tagcloud__search-input";
    searchInput.placeholder = __("Search tags…");
    searchInput.setAttribute(
      "aria-label",
      __("Search tags in the cloud")
    );
    searchWrap.appendChild(searchInput);
    const searchResults = document.createElement("ul");
    searchResults.className = "wpd-tagcloud__search-results";
    searchResults.hidden = true;
    searchWrap.appendChild(searchResults);
    const hint = document.createElement("span");
    hint.className = "wpd-tagcloud__hint";
    hint.textContent = __(
      "Click a tag to focus + edit · drag to reposition · wheel to zoom"
    );
    toolbar.appendChild(addTagBtn);
    toolbar.appendChild(recenterBtn);
    toolbar.appendChild(reflowBtn);
    toolbar.appendChild(searchWrap);
    toolbar.appendChild(hint);
    host.appendChild(toolbar);
    const layout = document.createElement("div");
    layout.className = "wpd-tagcloud__layout";
    host.appendChild(layout);
    const stage = document.createElement("div");
    stage.className = "wpd-tagcloud__stage";
    stage.classList.add("is-loading");
    layout.appendChild(stage);
    const sidebar = document.createElement("aside");
    sidebar.className = "wpd-tagcloud__sidebar";
    layout.appendChild(sidebar);
    const app = new pixi.Application();
    await app.init({
      resizeTo: stage,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });
    stage.appendChild(app.canvas);
    app.canvas.classList.add("wpd-tagcloud__canvas");
    const world = new pixi.Container();
    world.x = stage.clientWidth / 2;
    world.y = stage.clientHeight / 2;
    app.stage.addChild(world);
    const chipLayer = new pixi.Container();
    const postEdgeLayer = new pixi.Container();
    const postLayer = new pixi.Container();
    const postChipLayer = new pixi.Container();
    world.addChild(postEdgeLayer);
    world.addChild(chipLayer);
    world.addChild(postLayer);
    world.addChild(postChipLayer);
    const postEdgeGfx = new pixi.Graphics();
    postEdgeLayer.addChild(postEdgeGfx);
    const pager = new pixi.Container();
    pager.eventMode = "passive";
    pager.visible = false;
    postLayer.addChild(pager);
    const pagerPrev = new pixi.Graphics();
    const pagerNext = new pixi.Graphics();
    const pagerLabel = new pixi.Text({
      text: "1 / 1",
      style: {
        fill: 5265246,
        fontSize: 12,
        fontFamily: FONT_FAMILY,
        fontWeight: "600"
      }
    });
    pagerLabel.anchor.set(0.5);
    pagerPrev.eventMode = "static";
    pagerPrev.cursor = "pointer";
    pagerNext.eventMode = "static";
    pagerNext.cursor = "pointer";
    pagerPrev.hitArea = new pixi.Circle(0, 0, 16);
    pagerNext.hitArea = new pixi.Circle(0, 0, 16);
    pager.addChild(pagerPrev);
    pager.addChild(pagerLabel);
    pager.addChild(pagerNext);
    const stopBubble = (e) => {
      e.stopPropagation?.();
      pixiInteractionAt = performance.now();
    };
    pagerPrev.on("pointerdown", stopBubble);
    pagerNext.on("pointerdown", stopBubble);
    pagerPrev.on("pointertap", (e) => {
      stopBubble(e);
      lastFocusChange = performance.now();
      if (focusPage <= 1) {
        return;
      }
      focusPage--;
      void loadPostsForFocus();
    });
    pagerNext.on("pointertap", (e) => {
      stopBubble(e);
      lastFocusChange = performance.now();
      if (focusPage >= focusTotalPages) {
        return;
      }
      focusPage++;
      void loadPostsForFocus();
    });
    const tags = /* @__PURE__ */ new Map();
    const postChips = /* @__PURE__ */ new Map();
    const postNodes = /* @__PURE__ */ new Map();
    let focusId = null;
    let focusPage = 1;
    let focusTotalPages = 1;
    let loadSeq = 0;
    let pixiInteractionAt = 0;
    let dragChip = null;
    let dragOffset = { x: 0, y: 0 };
    let dragStart = null;
    let panActive = false;
    let panStart = null;
    let panMovedDist = 0;
    let raf = null;
    let lastTick = performance.now();
    let targetScale = world.scale.x;
    let targetWorldX = world.x;
    let targetWorldY = world.y;
    let nudgeAwayFrom = null;
    let prevView = null;
    let lastFocusChange = 0;
    let draft = null;
    let terms = [];
    const positionsKey = computePositionsKey();
    const persistedPositions = readPersistedPositions(positionsKey);
    let cooccurrenceMap = /* @__PURE__ */ new Map();
    const themeHue = readAdminThemeHue();
    try {
      const all = [];
      let page = 1;
      while (page <= 5) {
        const res = await client.fetchTerms("tags", { page, perPage: 100 });
        all.push(...res.items);
        if (page >= res.totalPages) {
          break;
        }
        page++;
      }
      terms = all;
    } catch (err) {
      showToast(__("Couldn’t load tags:"), err);
    }
    const showError = (title, err) => showToast(title, err);
    function buildCloud() {
      const liveIds = new Set(terms.map((t) => t.id));
      for (const [id, box] of tags) {
        if (!liveIds.has(id)) {
          chipLayer.removeChild(box.chip.container);
          box.chip.container.destroy({ children: true });
          tags.delete(id);
        }
      }
      const maxCount = Math.max(1, ...terms.map((t) => t.count));
      const fresh = [];
      for (const term of terms) {
        const fontSize = fontSizeFor(term.count, maxCount);
        const hue = tagHue(term.slug || term.name, themeHue);
        const rotation = tagRotation(term.slug || term.name);
        const existing = tags.get(term.id);
        if (existing) {
          existing.name = term.name;
          existing.slug = term.slug;
          existing.description = term.description;
          existing.count = term.count;
          existing.fontSize = fontSize;
          existing.hue = hue;
          existing.rotation = rotation;
          layoutChip(existing);
        } else {
          const chip = createTagChip(pixi, chipLayer, term, fontSize, hue);
          const persisted = persistedPositions.get(term.id);
          const box = {
            id: term.id,
            name: term.name,
            slug: term.slug,
            description: term.description,
            count: term.count,
            fontSize,
            hue,
            rotation,
            x: persisted ? persisted.x : 0,
            y: persisted ? persisted.y : 0,
            tx: persisted ? persisted.x : 0,
            ty: persisted ? persisted.y : 0,
            width: 0,
            height: 0,
            chip
          };
          tags.set(term.id, box);
          layoutChip(box);
          wireChipPointer(box);
          if (!persisted) {
            fresh.push(box);
          }
        }
      }
      const placed = [];
      const placedById = /* @__PURE__ */ new Map();
      for (const box of tags.values()) {
        if (!fresh.includes(box)) {
          placed.push({
            x: box.tx - box.width / 2,
            y: box.ty - box.height / 2,
            w: box.width,
            h: box.height
          });
          placedById.set(box.id, { x: box.tx, y: box.ty });
        }
      }
      fresh.sort((a, b) => b.count - a.count);
      packBoxesWithClusters(fresh, placed, placedById, cooccurrenceMap);
      for (const box of fresh) {
        box.x = box.tx;
        box.y = box.ty;
      }
    }
    function wireChipPointer(box) {
      const c = box.chip.container;
      c.on("pointerdown", (e) => {
        const ev = e;
        ev.stopPropagation?.();
        pixiInteractionAt = performance.now();
        dragChip = box;
        dragStart = { x: ev.global.x, y: ev.global.y };
        const local = stageToWorld({ x: ev.global.x, y: ev.global.y });
        dragOffset = { x: box.x - local.x, y: box.y - local.y };
      });
      c.on("pointerover", () => {
        box.chip.cachedHover = true;
        paintChip(box);
      });
      c.on("pointerout", () => {
        box.chip.cachedHover = false;
        paintChip(box);
      });
    }
    function layoutChip(box) {
      const chip = box.chip;
      const displayName = truncateChipName(box.name);
      const countStr = String(box.count);
      if (chip.nameText.text !== displayName) {
        chip.nameText.text = displayName;
      }
      if (chip.countText.text !== countStr) {
        chip.countText.text = countStr;
      }
      chip.nameText.style.fontSize = box.fontSize;
      chip.hashText.style.fontSize = box.fontSize;
      chip.countText.style.fontSize = Math.max(
        10,
        Math.round(box.fontSize * 0.55)
      );
      chip.cachedName = displayName;
      chip.cachedCount = box.count;
      chip.cachedHue = box.hue;
      const hashW = chip.hashText.width;
      const nameW = chip.nameText.width;
      const nameH = chip.nameText.height;
      const countW = chip.countText.width;
      const countH = chip.countText.height;
      const countBadgeW = Math.max(18, countW + 10);
      const countBadgeH = Math.max(14, countH + 4);
      const totalW = CHIP_PAD_X + hashW + CHIP_GAP_HASH + nameW + CHIP_GAP_COUNT + countBadgeW + CHIP_PAD_X;
      const totalH = Math.max(nameH, countBadgeH) + CHIP_PAD_Y * 2;
      box.width = totalW;
      box.height = totalH;
      paintChip(box);
    }
    function paintChip(box) {
      const chip = box.chip;
      const focused = focusId === box.id;
      chip.cachedFocused = focused;
      const totalW = box.width;
      const totalH = box.height;
      const left = -totalW / 2;
      const top = -totalH / 2;
      const radius = totalH / 2;
      let fillBg;
      if (focused) {
        fillBg = hslToInt(box.hue, 70, 48);
      } else if (chip.cachedHover) {
        fillBg = hslToInt(box.hue, 70, 92);
      } else {
        fillBg = hslToInt(box.hue, 60, 95);
      }
      const borderColor = focused ? hslToInt(box.hue, 70, 38) : hslToInt(box.hue, 50, 70);
      const textColor = focused ? 16777215 : 1909543;
      const hashColor = focused ? 16777215 : hslToInt(box.hue, 65, 42);
      const countBg = focused ? hslToInt(box.hue, 80, 30) : hslToInt(box.hue, 70, 50);
      chip.shadow.clear();
      chip.shadow.roundRect(
        left - 1,
        top + 3,
        totalW + 2,
        totalH + 2,
        radius + 1
      );
      let shadowAlpha = 0.1;
      if (focused) {
        shadowAlpha = 0.18;
      } else if (chip.cachedHover) {
        shadowAlpha = 0.16;
      }
      chip.shadow.fill({
        color: 0,
        alpha: shadowAlpha
      });
      chip.bg.clear();
      chip.bg.roundRect(left, top, totalW, totalH, radius);
      chip.bg.fill(fillBg);
      chip.bg.stroke({
        color: borderColor,
        width: focused ? 2 : 1.25,
        alpha: focused ? 1 : 0.85
      });
      const hashW = chip.hashText.width;
      const nameW = chip.nameText.width;
      const nameH = chip.nameText.height;
      const countW = chip.countText.width;
      const countH = chip.countText.height;
      const countBadgeW = Math.max(18, countW + 10);
      const countBadgeH = Math.max(14, countH + 4);
      chip.hashText.x = left + CHIP_PAD_X;
      chip.hashText.y = (totalH - nameH) / 2 + top;
      chip.hashText.style.fill = hashColor;
      chip.nameText.x = left + CHIP_PAD_X + hashW + CHIP_GAP_HASH;
      chip.nameText.y = (totalH - nameH) / 2 + top;
      chip.nameText.style.fill = textColor;
      const badgeX = left + CHIP_PAD_X + hashW + CHIP_GAP_HASH + nameW + CHIP_GAP_COUNT;
      const badgeY = (totalH - countBadgeH) / 2 + top;
      chip.bg.roundRect(
        badgeX,
        badgeY,
        countBadgeW,
        countBadgeH,
        countBadgeH / 2
      );
      chip.bg.fill(countBg);
      chip.countText.x = badgeX + (countBadgeW - countW) / 2;
      chip.countText.y = badgeY + (countBadgeH - countH) / 2;
      chip.countText.style.fill = 16777215;
    }
    function findSpiralSlot(w, h, placed, anchorX = 0, anchorY = 0) {
      if (placed.length === 0) {
        return { x: anchorX, y: anchorY };
      }
      const padding = SPIRAL_PADDING;
      {
        const aabb = {
          x: anchorX - w / 2 - padding,
          y: anchorY - h / 2 - padding,
          w: w + padding * 2,
          h: h + padding * 2
        };
        let overlap = false;
        for (const p of placed) {
          if (aabbIntersect(aabb, p)) {
            overlap = true;
            break;
          }
        }
        if (!overlap) {
          return { x: anchorX, y: anchorY };
        }
      }
      let theta = 0;
      const maxIter = 1e4;
      for (let i = 0; i < maxIter; i++) {
        theta += 0.18;
        const r = theta * 5;
        const cx = anchorX + r * Math.cos(theta);
        const cy = anchorY + r * Math.sin(theta) * 0.7;
        const aabb = {
          x: cx - w / 2 - padding,
          y: cy - h / 2 - padding,
          w: w + padding * 2,
          h: h + padding * 2
        };
        let overlap = false;
        for (const p of placed) {
          if (aabbIntersect(aabb, p)) {
            overlap = true;
            break;
          }
        }
        if (!overlap) {
          return { x: cx, y: cy };
        }
      }
      return {
        x: anchorX,
        y: anchorY + (placed.length + 1) * (h + padding)
      };
    }
    function packBoxesWithClusters(boxesInOrder, placed, placedById, cooccurrence) {
      let clusterCounter = 0;
      const allocateClusterAnchor = () => {
        const idx = clusterCounter++;
        if (idx === 0) {
          return { x: 0, y: 0 };
        }
        const theta = idx * 2.4;
        const radius = 120 + idx * 70;
        return {
          x: radius * Math.cos(theta),
          y: radius * Math.sin(theta) * 0.8
        };
      };
      for (const box of boxesInOrder) {
        let anchorX = 0;
        let anchorY = 0;
        let usedCentroid = false;
        const neighbors = cooccurrence.get(box.id);
        if (neighbors && neighbors.length > 0) {
          let sumX = 0;
          let sumY = 0;
          let sumW = 0;
          for (const n of neighbors) {
            const pos = placedById.get(n.id);
            if (!pos) {
              continue;
            }
            sumX += pos.x * n.shared;
            sumY += pos.y * n.shared;
            sumW += n.shared;
          }
          if (sumW > 0) {
            anchorX = sumX / sumW;
            anchorY = sumY / sumW;
            usedCentroid = true;
          }
        }
        if (!usedCentroid) {
          const anchor = allocateClusterAnchor();
          anchorX = anchor.x;
          anchorY = anchor.y;
        }
        const slot = findSpiralSlot(
          box.width,
          box.height,
          placed,
          anchorX,
          anchorY
        );
        box.tx = slot.x;
        box.ty = slot.y;
        placedById.set(box.id, { x: slot.x, y: slot.y });
        placed.push({
          x: slot.x - box.width / 2,
          y: slot.y - box.height / 2,
          w: box.width,
          h: box.height
        });
      }
    }
    function syncChipPositions() {
      const chipCounterScale = 1 / Math.max(0.01, world.scale.x);
      const anyFocus = focusId !== null;
      for (const box of tags.values()) {
        const c = box.chip.container;
        c.x = box.x;
        c.y = box.y;
        const counter = Math.max(1, chipCounterScale);
        c.scale.set(counter);
        c.rotation = box.rotation;
        const focused = focusId === box.id;
        const targetAlpha = !anyFocus || focused ? 1 : 0.32;
        if (Math.abs(c.alpha - targetAlpha) > 5e-3) {
          c.alpha += (targetAlpha - c.alpha) * 0.18;
        } else {
          c.alpha = targetAlpha;
        }
      }
      for (const post of postNodes.values()) {
        const chip = postChips.get(post.id);
        if (!chip) {
          continue;
        }
        chip.container.x = post.x;
        chip.container.y = post.y;
        chip.container.scale.set(chipCounterScale);
        if (chip.container.alpha < 1) {
          chip.container.alpha = Math.min(
            1,
            chip.container.alpha + 0.18
          );
        }
      }
    }
    function tick() {
      const now = performance.now();
      const dt = Math.min(50, now - lastTick);
      lastTick = now;
      const ZOOM_EASE = 0.22;
      const ds = targetScale - world.scale.x;
      const dwx = targetWorldX - world.x;
      const dwy = targetWorldY - world.y;
      if (Math.abs(ds) > 5e-4 || Math.abs(dwx) > 0.5 || Math.abs(dwy) > 0.5) {
        world.scale.set(world.scale.x + ds * ZOOM_EASE);
        world.x += dwx * ZOOM_EASE;
        world.y += dwy * ZOOM_EASE;
      }
      for (const box of tags.values()) {
        if (box === dragChip) {
          continue;
        }
        let tx = box.tx;
        let ty = box.ty;
        if (nudgeAwayFrom && box.id !== focusId) {
          const dx = box.tx - nudgeAwayFrom.x;
          const dy = box.ty - nudgeAwayFrom.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const limit = nudgeAwayFrom.radius + Math.max(box.width, box.height) / 2;
          if (d < limit) {
            const push = limit + 12;
            tx = nudgeAwayFrom.x + dx / d * push;
            ty = nudgeAwayFrom.y + dy / d * push;
          }
        }
        const ease = 1 - Math.exp(-dt * 0.012);
        box.x += (tx - box.x) * ease;
        box.y += (ty - box.y) * ease;
      }
      for (const p of postNodes.values()) {
        p.x += (p.tx - p.x) * 0.18;
        p.y += (p.ty - p.y) * 0.18;
        p.gfx.x = p.x;
        p.gfx.y = p.y;
      }
      drawPostEdges();
      syncChipPositions();
      raf = requestAnimationFrame(tick);
    }
    function drawPostEdges() {
      postEdgeGfx.clear();
      if (focusId === null) {
        return;
      }
      const center = tags.get(focusId);
      if (!center) {
        return;
      }
      for (const post of postNodes.values()) {
        postEdgeGfx.moveTo(center.x, center.y);
        postEdgeGfx.lineTo(post.x, post.y);
        postEdgeGfx.stroke({
          color: hslToInt(center.hue, 60, 50),
          width: 1,
          alpha: 0.35
        });
      }
    }
    function stageToWorld(global) {
      return {
        x: (global.x - world.x) / world.scale.x,
        y: (global.y - world.y) / world.scale.y
      };
    }
    function onStagePointerDown(e) {
      const ev = e;
      panActive = true;
      panStart = { x: ev.global.x, y: ev.global.y };
      panMovedDist = 0;
    }
    function onStagePointerMove(e) {
      const ev = e;
      if (dragChip) {
        const cursorWorld = stageToWorld(ev.global);
        const nx = cursorWorld.x + dragOffset.x;
        const ny = cursorWorld.y + dragOffset.y;
        dragChip.x = nx;
        dragChip.y = ny;
        dragChip.tx = nx;
        dragChip.ty = ny;
        return;
      }
      if (panActive && panStart) {
        const dx = ev.global.x - panStart.x;
        const dy = ev.global.y - panStart.y;
        world.x += dx;
        world.y += dy;
        targetWorldX += dx;
        targetWorldY += dy;
        panMovedDist += Math.sqrt(dx * dx + dy * dy);
        panStart = { x: ev.global.x, y: ev.global.y };
      }
    }
    function onStagePointerUp(e) {
      if (dragChip) {
        const box = dragChip;
        const startPos = dragStart;
        dragChip = null;
        dragStart = null;
        let movement = Infinity;
        const ev = e;
        if (startPos && ev && ev.global) {
          const dx = ev.global.x - startPos.x;
          const dy = ev.global.y - startPos.y;
          movement = Math.sqrt(dx * dx + dy * dy);
        }
        if (movement < 3) {
          void focusTag(box.id);
        } else {
          persistedPositions.set(box.id, { x: box.tx, y: box.ty });
          writePersistedPositions(positionsKey, persistedPositions);
        }
      }
      panActive = false;
      panStart = null;
    }
    app.stage.eventMode = "static";
    app.stage.hitArea = new pixi.Rectangle(
      0,
      0,
      stage.clientWidth,
      stage.clientHeight
    );
    app.stage.on("pointerdown", onStagePointerDown);
    app.stage.on("pointermove", onStagePointerMove);
    app.stage.on("pointerup", (e) => onStagePointerUp(e));
    app.stage.on("pointerupoutside", (e) => onStagePointerUp(e));
    function onWheel(e) {
      e.preventDefault();
      const SENSITIVITY = 8e-4;
      const factor = Math.exp(-e.deltaY * SENSITIVITY);
      const prev = targetScale;
      const next = Math.max(0.3, Math.min(2.5, prev * factor));
      if (Math.abs(next - prev) < 5e-4) {
        return;
      }
      const r = stage.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const wx = (sx - targetWorldX) / prev;
      const wy = (sy - targetWorldY) / prev;
      targetScale = next;
      targetWorldX = sx - wx * next;
      targetWorldY = sy - wy * next;
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    let firstFitDone = false;
    let settledW = 0;
    let settledH = 0;
    const SETTLE_THRESHOLD_PX = 24;
    const SETTLE_DEBOUNCE_MS = 80;
    let settleTimer = null;
    function onResize() {
      const r = stage.getBoundingClientRect();
      app.renderer.resize(r.width, r.height);
      app.stage.hitArea = new pixi.Rectangle(0, 0, r.width, r.height);
      if (!firstFitDone && r.width > 0 && r.height > 0) {
        firstFitDone = true;
        settledW = r.width;
        settledH = r.height;
        fitToView();
        stage.classList.remove("is-loading");
      }
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        const cur = stage.getBoundingClientRect();
        const dw = Math.abs(cur.width - settledW);
        const dh = Math.abs(cur.height - settledH);
        if (dw >= SETTLE_THRESHOLD_PX || dh >= SETTLE_THRESHOLD_PX) {
          settledW = cur.width;
          settledH = cur.height;
          recenterCamera();
        }
      }, SETTLE_DEBOUNCE_MS);
      app.render();
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(stage);
    async function focusTag(id) {
      if (focusId === id) {
        closeFocus();
        return;
      }
      const wasFocused = focusId !== null;
      focusId = id;
      focusPage = 1;
      lastFocusChange = performance.now();
      const focused = tags.get(id);
      if (focused) {
        if (!wasFocused) {
          prevView = {
            scale: targetScale,
            x: targetWorldX,
            y: targetWorldY
          };
        }
        const r = stage.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const half = POST_RING_RADIUS + 70;
          const sx = r.width * 0.85 / (2 * half);
          const sy = r.height * 0.85 / (2 * half);
          const newScale = Math.max(
            0.5,
            Math.min(1.6, Math.min(sx, sy))
          );
          targetScale = newScale;
          targetWorldX = r.width / 2 - focused.x * newScale;
          targetWorldY = r.height / 2 - focused.y * newScale;
        }
        nudgeAwayFrom = {
          x: focused.x,
          y: focused.y,
          radius: SPOTLIGHT_RADIUS
        };
      }
      for (const box of tags.values()) {
        paintChip(box);
      }
      paintSidebar();
      await loadPostsForFocus();
    }
    function closeFocus() {
      focusId = null;
      lastFocusChange = performance.now();
      loadSeq++;
      nudgeAwayFrom = null;
      if (prevView) {
        targetScale = prevView.scale;
        targetWorldX = prevView.x;
        targetWorldY = prevView.y;
        prevView = null;
      }
      paintSidebar();
      clearPosts();
      for (const box of tags.values()) {
        paintChip(box);
      }
    }
    function clearPosts() {
      for (const post of postNodes.values()) {
        postLayer.removeChild(post.gfx);
        post.gfx.destroy();
      }
      postNodes.clear();
      for (const chip of postChips.values()) {
        postChipLayer.removeChild(chip.container);
        chip.container.destroy({ children: true });
      }
      postChips.clear();
      postEdgeGfx.clear();
      pager.visible = false;
    }
    function ensurePostChip(post) {
      const existing = postChips.get(post.id);
      if (existing) {
        return existing;
      }
      const container = new pixi.Container();
      container.eventMode = "static";
      container.cursor = "pointer";
      container.alpha = 0;
      const bg = new pixi.Graphics();
      container.addChild(bg);
      const dot = new pixi.Graphics();
      container.addChild(dot);
      const titleText = new pixi.Text({
        text: post.title,
        style: {
          fill: 1909543,
          fontSize: 12,
          fontFamily: FONT_FAMILY,
          fontWeight: "500"
        },
        resolution: CHIP_TEXT_RES
      });
      container.addChild(titleText);
      const chip = {
        container,
        bg,
        dot,
        titleText,
        width: 0,
        height: 0,
        cachedTitle: "",
        cachedHover: false
      };
      postChips.set(post.id, chip);
      postChipLayer.addChild(container);
      container.on("pointerdown", (e) => {
        e.stopPropagation?.();
        pixiInteractionAt = performance.now();
      });
      container.on("pointertap", () => {
        openInPostsTab(post.id, post.editUrl, post.title);
        closeFocus();
      });
      container.on("pointerover", () => {
        chip.cachedHover = true;
        layoutPostChip(chip, post);
      });
      container.on("pointerout", () => {
        chip.cachedHover = false;
        layoutPostChip(chip, post);
      });
      layoutPostChip(chip, post);
      return chip;
    }
    function layoutPostChip(chip, post) {
      const displayTitle = post.title.length > POST_TITLE_MAX_CHARS ? post.title.slice(0, POST_TITLE_MAX_CHARS - 1) + "…" : post.title;
      if (chip.titleText.text !== displayTitle) {
        chip.titleText.text = displayTitle;
      }
      chip.cachedTitle = displayTitle;
      const padX = 9;
      const padY = 3;
      const dotR = 4;
      const gap = 6;
      const titleW = chip.titleText.width;
      const titleH = chip.titleText.height;
      const totalW = padX + dotR * 2 + gap + titleW + padX;
      const totalH = Math.max(titleH, dotR * 2) + padY * 2;
      chip.width = totalW;
      chip.height = totalH;
      const left = -totalW / 2;
      const top = -totalH / 2;
      chip.bg.clear();
      chip.bg.roundRect(left, top, totalW, totalH, totalH / 2);
      if (chip.cachedHover) {
        chip.bg.fill({ color: 16777215, alpha: 1 });
        chip.bg.stroke({
          color: post.tone,
          width: 1.5,
          alpha: 1
        });
      } else {
        chip.bg.fill({ color: 16777215, alpha: 0.95 });
        chip.bg.stroke({
          color: 0,
          width: 1,
          alpha: 0.12
        });
      }
      chip.dot.clear();
      chip.dot.circle(left + padX + dotR, 0, dotR);
      chip.dot.fill({ color: post.tone, alpha: 0.85 });
      chip.dot.stroke({ color: 16777215, width: 1 });
      chip.titleText.x = left + padX + dotR * 2 + gap;
      chip.titleText.y = -titleH / 2;
    }
    const POSTS_CACHE_TTL_MS = 6e4;
    const postsCache = /* @__PURE__ */ new Map();
    function applyPostsResult(entry, focusedTagId) {
      focusTotalPages = entry.totalPages;
      if (Number.isFinite(entry.realTotal)) {
        const box = tags.get(focusedTagId);
        if (box && box.count !== entry.realTotal) {
          box.count = entry.realTotal;
          terms = terms.map(
            (t) => t.id === box.id ? { ...t, count: entry.realTotal } : t
          );
          layoutChip(box);
        }
      }
      renderPosts(entry.items);
    }
    async function loadPostsForFocus() {
      if (focusId === null) {
        return;
      }
      const mySeq = ++loadSeq;
      const myFocusId = focusId;
      const cacheKey2 = `${focusId}:${focusPage}`;
      const cached = postsCache.get(cacheKey2);
      if (cached && performance.now() - cached.fetchedAt < POSTS_CACHE_TTL_MS) {
        applyPostsResult(cached, myFocusId);
        return;
      }
      const cfg = client.getConfig();
      const url = new URL(cfg.postsUrl);
      url.searchParams.set("tags", String(focusId));
      url.searchParams.set("per_page", String(POST_PER_PAGE));
      url.searchParams.set("page", String(focusPage));
      url.searchParams.set("status", "any");
      url.searchParams.set("_fields", "id,title,status");
      try {
        const response = await fetchShellJson(client, url.toString());
        if (mySeq !== loadSeq || focusId !== myFocusId) {
          return;
        }
        const raw = response.json ?? [];
        const totalPages = Math.max(
          1,
          parseInt(response.headers.get("X-WP-TotalPages") ?? "1", 10) || 1
        );
        const realTotalParsed = parseInt(response.headers.get("X-WP-Total") ?? "", 10);
        const realTotal = Number.isFinite(realTotalParsed) ? realTotalParsed : -1;
        const items = raw.map((p) => ({
          id: p.id,
          title: stripTags(p.title?.rendered || `#${p.id}`),
          editUrl: `${cfg.editPostUrlBase}?post=${p.id}&action=edit`
        }));
        const entry = {
          items,
          totalPages,
          realTotal,
          fetchedAt: performance.now()
        };
        postsCache.set(cacheKey2, entry);
        applyPostsResult(entry, myFocusId);
      } catch (err) {
        showError(__("Couldn’t load posts:"), err);
      }
    }
    function renderPosts(items) {
      clearPosts();
      if (focusId === null) {
        return;
      }
      const center = tags.get(focusId);
      if (!center) {
        return;
      }
      const count = items.length;
      const ringR = POST_RING_RADIUS + Math.max(0, count - 8) * 6;
      const tone = hslToInt(center.hue, 70, 48);
      items.forEach((item, idx) => {
        const angle = 2 * Math.PI / Math.max(1, count) * idx - Math.PI / 2;
        const tx = center.x + Math.cos(angle) * ringR;
        const ty = center.y + Math.sin(angle) * ringR;
        const gfx = new pixi.Graphics();
        postLayer.addChild(gfx);
        const post = {
          id: item.id,
          title: item.title,
          editUrl: item.editUrl,
          angle,
          r: ringR,
          x: center.x,
          y: center.y,
          tx,
          ty,
          gfx,
          tone
        };
        postNodes.set(item.id, post);
        ensurePostChip(post);
      });
      repaintPager();
    }
    function repaintPager() {
      if (focusId === null || focusTotalPages <= 1) {
        pager.visible = false;
        return;
      }
      pager.visible = true;
      const center = tags.get(focusId);
      if (!center) {
        pager.visible = false;
        return;
      }
      const prevDisabled = focusPage <= 1;
      const nextDisabled = focusPage >= focusTotalPages;
      drawPagerButton(pagerPrev, "◀", prevDisabled);
      drawPagerButton(pagerNext, "▶", nextDisabled);
      pagerPrev.cursor = prevDisabled ? "default" : "pointer";
      pagerNext.cursor = nextDisabled ? "default" : "pointer";
      pagerLabel.text = `${focusPage} / ${focusTotalPages}`;
      pagerPrev.x = -38;
      pagerPrev.y = 0;
      pagerNext.x = 38;
      pagerNext.y = 0;
      pagerLabel.x = 0;
      pagerLabel.y = 0;
      pager.x = center.x;
      pager.y = center.y + POST_RING_RADIUS + 60;
    }
    function drawPagerButton(gfx, glyph, disabled) {
      gfx.clear();
      gfx.circle(0, 0, 14);
      gfx.fill({
        color: disabled ? 15921906 : 16777215,
        alpha: disabled ? 0.7 : 1
      });
      gfx.stroke({
        color: 0,
        width: 1,
        alpha: 0.12
      });
      const children = gfx.children;
      const label = children?.[0] ?? null;
      if (!label) {
        const t = new pixi.Text({
          text: glyph,
          style: {
            fill: disabled ? 11580344 : 5265246,
            fontSize: 14,
            fontFamily: FONT_FAMILY,
            fontWeight: "600"
          }
        });
        t.anchor.set(0.5);
        gfx.addChild(t);
      } else {
        label.text = glyph;
        label.style.fill = disabled ? 11580344 : 5265246;
      }
    }
    function openInPostsTab(_id, editUrl, title) {
      const wm = api?.windowManager;
      const derive = api?.deriveWindowId;
      const postsWin = wm && typeof wm.getById === "function" ? wm.getById("desktop-mode-posts") : void 0;
      if (postsWin && typeof postsWin.isFullscreen === "function" && typeof postsWin.toggleFullscreen === "function" && postsWin.isFullscreen()) {
        postsWin.toggleFullscreen();
      }
      if (wm && typeof derive === "function") {
        const id = derive(editUrl);
        wm.open({
          id,
          baseId: id,
          url: editUrl,
          title: title ?? editUrl,
          icon: "dashicons-admin-post"
        });
        return;
      }
      try {
        window.open(editUrl, "_blank");
      } catch {
        window.location.assign(editUrl);
      }
    }
    function paintDraftSidebar() {
      const header = document.createElement("div");
      header.className = "wpd-tagcloud__sidebar-header";
      const dot = document.createElement("span");
      dot.className = "wpd-tagcloud__sidebar-dot";
      dot.style.background = `hsl( ${themeHue}deg 60% 55% )`;
      const label = document.createElement("code");
      label.className = "wpd-tagcloud__sidebar-slug";
      label.textContent = __("New tag");
      header.appendChild(dot);
      header.appendChild(label);
      sidebar.appendChild(header);
      const nameLabel = document.createElement("label");
      nameLabel.className = "wpd-tagcloud__sidebar-label";
      nameLabel.textContent = __("Name");
      sidebar.appendChild(nameLabel);
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "wpd-tagcloud__editor-name";
      nameInput.placeholder = __("e.g. featured");
      sidebar.appendChild(nameInput);
      requestAnimationFrame(() => nameInput.focus());
      const descLabel = document.createElement("label");
      descLabel.className = "wpd-tagcloud__sidebar-label";
      descLabel.textContent = __("Description");
      sidebar.appendChild(descLabel);
      const descInput = document.createElement("textarea");
      descInput.className = "wpd-tagcloud__editor-desc";
      descInput.placeholder = __("Description (optional)");
      descInput.rows = 4;
      sidebar.appendChild(descInput);
      const actions = document.createElement("div");
      actions.className = "wpd-tagcloud__editor-actions";
      const createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className = "wpd-tagcloud__btn wpd-tagcloud__btn--primary";
      createBtn.textContent = __("Create");
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "wpd-tagcloud__btn wpd-tagcloud__btn--danger";
      cancelBtn.textContent = __("Cancel");
      const handleCreate = async () => {
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.focus();
          return;
        }
        createBtn.disabled = true;
        try {
          const created = await client.createTag(name);
          const next = {
            id: created.id,
            name: created.name,
            slug: created.slug || "",
            parent: 0,
            count: 0,
            description: created.description || "",
            isDefault: false
          };
          if (!terms.some((t) => t.id === next.id)) {
            terms = terms.concat(next);
          }
          const desc = descInput.value.trim();
          if (desc) {
            try {
              const updated = await client.updateTerm(
                "tags",
                created.id,
                { description: desc }
              );
              terms = terms.map(
                (t) => t.id === updated.id ? {
                  ...t,
                  description: updated.description ?? desc
                } : t
              );
            } catch {
              showError(
                __("Tag created but description failed:"),
                null
              );
            }
          }
          draft = null;
          buildCloud();
          focusId = created.id;
          paintSidebar();
          await loadPostsForFocus();
        } catch (err) {
          createBtn.disabled = false;
          showError(__("Couldn’t create:"), err);
        }
      };
      createBtn.addEventListener("click", () => {
        void handleCreate();
      });
      cancelBtn.addEventListener("click", () => {
        draft = null;
        paintSidebar();
      });
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void handleCreate();
        } else if (e.key === "Escape") {
          draft = null;
          paintSidebar();
        }
      });
      actions.appendChild(createBtn);
      actions.appendChild(cancelBtn);
      sidebar.appendChild(actions);
    }
    function paintSidebar() {
      sidebar.replaceChildren();
      if (draft !== null) {
        paintDraftSidebar();
        return;
      }
      if (focusId === null) {
        const empty = document.createElement("div");
        empty.className = "wpd-tagcloud__sidebar-empty";
        const icon = document.createElement("span");
        icon.className = "dashicons dashicons-tag";
        icon.setAttribute("aria-hidden", "true");
        empty.appendChild(icon);
        const title = document.createElement("h3");
        title.className = "wpd-tagcloud__sidebar-empty-title";
        title.textContent = __("No tag selected");
        empty.appendChild(title);
        const help = document.createElement("p");
        help.className = "wpd-tagcloud__sidebar-empty-hint";
        help.textContent = __(
          "Click a tag on the cloud to edit it, or click + Add tag to create a new one."
        );
        empty.appendChild(help);
        sidebar.appendChild(empty);
        return;
      }
      const box = tags.get(focusId);
      if (!box) {
        focusId = null;
        paintSidebar();
        return;
      }
      const id = box.id;
      const header = document.createElement("div");
      header.className = "wpd-tagcloud__sidebar-header";
      const dot = document.createElement("span");
      dot.className = "wpd-tagcloud__sidebar-dot";
      dot.style.background = `hsl( ${box.hue}deg 60% 55% )`;
      const term = terms.find((t) => t.id === id);
      const idLabel = document.createElement("code");
      idLabel.className = "wpd-tagcloud__sidebar-slug";
      idLabel.textContent = `#${id}`;
      header.appendChild(dot);
      header.appendChild(idLabel);
      sidebar.appendChild(header);
      const nameLabel = document.createElement("label");
      nameLabel.className = "wpd-tagcloud__sidebar-label";
      nameLabel.textContent = __("Name");
      sidebar.appendChild(nameLabel);
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "wpd-tagcloud__editor-name";
      nameInput.value = box.name;
      nameInput.placeholder = __("Name");
      sidebar.appendChild(nameInput);
      const slugLabel = document.createElement("label");
      slugLabel.className = "wpd-tagcloud__sidebar-label";
      slugLabel.textContent = __("Slug");
      sidebar.appendChild(slugLabel);
      const slugInput = document.createElement("input");
      slugInput.type = "text";
      slugInput.className = "wpd-tagcloud__editor-name";
      slugInput.value = term?.slug || "";
      slugInput.placeholder = __("auto-from-name");
      slugInput.spellcheck = false;
      slugInput.autocapitalize = "off";
      slugInput.addEventListener("input", () => {
        const v = slugInput.value;
        const norm = v.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        if (v !== norm) {
          const sel = slugInput.selectionStart ?? norm.length;
          slugInput.value = norm;
          slugInput.setSelectionRange(sel, sel);
        }
      });
      sidebar.appendChild(slugInput);
      const descLabel = document.createElement("label");
      descLabel.className = "wpd-tagcloud__sidebar-label";
      descLabel.textContent = __("Description");
      sidebar.appendChild(descLabel);
      const descInput = document.createElement("textarea");
      descInput.className = "wpd-tagcloud__editor-desc";
      descInput.value = box.description || "";
      descInput.placeholder = __("Description (optional)");
      descInput.rows = 4;
      sidebar.appendChild(descInput);
      const meta = document.createElement("p");
      meta.className = "wpd-tagcloud__sidebar-meta";
      meta.textContent = sprintf(
        /* translators: %d: post count. */
        _n(
          "%d post tagged with this.",
          "%d posts tagged with this.",
          box.count
        ),
        box.count
      );
      sidebar.appendChild(meta);
      const actions = document.createElement("div");
      actions.className = "wpd-tagcloud__editor-actions";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "wpd-tagcloud__btn wpd-tagcloud__btn--primary";
      saveBtn.textContent = __("Save");
      saveBtn.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        if (!name) {
          return;
        }
        const description = descInput.value;
        const slugRaw = slugInput.value.trim();
        const currentSlug = term?.slug ?? "";
        if (name === box.name && description === (box.description || "") && slugRaw === currentSlug) {
          return;
        }
        const patch = { name, description };
        if (slugRaw !== currentSlug) {
          patch.slug = slugRaw;
        }
        try {
          const updated = await client.updateTerm("tags", box.id, patch);
          box.name = updated.name;
          box.description = updated.description;
          box.slug = updated.slug ?? box.slug;
          box.hue = tagHue(box.slug || box.name, themeHue);
          box.rotation = tagRotation(box.slug || box.name);
          terms = terms.map(
            (t) => t.id === box.id ? {
              ...t,
              name: updated.name,
              description: updated.description,
              slug: updated.slug ?? t.slug
            } : t
          );
          layoutChip(box);
          paintSidebar();
        } catch (err) {
          showError(__("Couldn’t save:"), err);
        }
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "wpd-tagcloud__btn wpd-tagcloud__btn--danger";
      delBtn.textContent = __("Delete");
      let armResetTimer = null;
      const armDelete = () => {
        delBtn.textContent = __("Click again to delete");
        delBtn.classList.add("is-armed");
        if (armResetTimer !== null) {
          window.clearTimeout(armResetTimer);
        }
        armResetTimer = window.setTimeout(() => {
          delBtn.textContent = __("Delete");
          delBtn.classList.remove("is-armed");
          armResetTimer = null;
        }, 2500);
      };
      delBtn.addEventListener("click", async () => {
        if (!delBtn.classList.contains("is-armed")) {
          armDelete();
          return;
        }
        if (armResetTimer !== null) {
          window.clearTimeout(armResetTimer);
          armResetTimer = null;
        }
        try {
          await client.deleteTerm("tags", box.id);
          terms = terms.filter((t) => t.id !== box.id);
          persistedPositions.delete(box.id);
          writePersistedPositions(positionsKey, persistedPositions);
          focusId = null;
          clearPosts();
          buildCloud();
          paintSidebar();
        } catch (err) {
          showError(__("Couldn’t delete:"), err);
        }
      });
      actions.appendChild(saveBtn);
      actions.appendChild(delBtn);
      sidebar.appendChild(actions);
    }
    function startDraft() {
      draft = true;
      paintSidebar();
    }
    addTagBtn.addEventListener("click", () => {
      startDraft();
    });
    function fitToView(opts = {}) {
      const padding = opts.padding ?? 90;
      const animate = opts.animate ?? false;
      const r = stage.getBoundingClientRect();
      if (tags.size === 0 || r.width === 0 || r.height === 0) {
        const cx2 = r.width / 2;
        const cy2 = r.height / 2;
        targetScale = 1;
        targetWorldX = cx2;
        targetWorldY = cy2;
        if (!animate) {
          world.x = cx2;
          world.y = cy2;
          world.scale.set(1);
        }
        return;
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const box of tags.values()) {
        minX = Math.min(minX, box.tx - box.width / 2);
        minY = Math.min(minY, box.ty - box.height / 2);
        maxX = Math.max(maxX, box.tx + box.width / 2);
        maxY = Math.max(maxY, box.ty + box.height / 2);
      }
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const sx = (r.width - padding * 2) / w;
      const sy = (r.height - padding * 2) / h;
      const scale = Math.max(0.2, Math.min(1.5, Math.min(sx, sy)));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const newWorldX = r.width / 2 - cx * scale;
      const newWorldY = r.height / 2 - cy * scale;
      targetScale = scale;
      targetWorldX = newWorldX;
      targetWorldY = newWorldY;
      if (!animate) {
        world.scale.set(scale);
        world.x = newWorldX;
        world.y = newWorldY;
      }
    }
    function recenterCamera() {
      if (focusId !== null) {
        const focused = tags.get(focusId);
        const r = stage.getBoundingClientRect();
        if (focused && r.width > 0 && r.height > 0) {
          const half = POST_RING_RADIUS + 70;
          const sx = r.width * 0.85 / (2 * half);
          const sy = r.height * 0.85 / (2 * half);
          const newScale = Math.max(
            0.5,
            Math.min(1.6, Math.min(sx, sy))
          );
          targetScale = newScale;
          targetWorldX = r.width / 2 - focused.x * newScale;
          targetWorldY = r.height / 2 - focused.y * newScale;
          return;
        }
      }
      fitToView({ animate: true });
    }
    recenterBtn.addEventListener("click", () => recenterCamera());
    reflowBtn.addEventListener("click", () => {
      persistedPositions.clear();
      writePersistedPositions(positionsKey, persistedPositions);
      for (const box of tags.values()) {
        box.tx = 0;
        box.ty = 0;
      }
      const allBoxes = Array.from(tags.values());
      allBoxes.sort((a, b) => b.count - a.count);
      packBoxesWithClusters(
        allBoxes,
        [],
        /* @__PURE__ */ new Map(),
        cooccurrenceMap
      );
      fitToView({ animate: true });
      void refreshCooccurrence();
    });
    app.canvas.addEventListener("click", (e) => {
      const now = performance.now();
      if (now - lastFocusChange < 250 || now - pixiInteractionAt < 250) {
        return;
      }
      if (panMovedDist > 4) {
        return;
      }
      const target = e.target;
      if (target === app.canvas && !dragChip && focusId !== null) {
        closeFocus();
      }
    });
    async function refreshCountsViaBulk() {
      if (terms.length === 0) {
        return;
      }
      const cfg = client.getConfig();
      const url = new URL(
        joinRestUrl(cfg.restRoot, "desktop-mode/v1/term-counts")
      );
      url.searchParams.set("taxonomy", "post_tag");
      url.searchParams.set(
        "ids",
        terms.map((t) => t.id).join(",")
      );
      try {
        const response = await fetchShellJson(client, url.toString());
        const map = response.json;
        let dirty = false;
        terms = terms.map((t) => {
          const fresh = map[String(t.id)];
          if (typeof fresh === "number" && fresh !== t.count) {
            dirty = true;
            const box = tags.get(t.id);
            if (box) {
              box.count = fresh;
            }
            return { ...t, count: fresh };
          }
          return t;
        });
        if (dirty) {
          const maxCount = Math.max(
            1,
            ...terms.map((t) => t.count)
          );
          for (const t of terms) {
            const box = tags.get(t.id);
            if (!box) {
              continue;
            }
            box.count = t.count;
            box.fontSize = fontSizeFor(t.count, maxCount);
            layoutChip(box);
          }
          if (focusId !== null) {
            paintSidebar();
          }
        }
      } catch {
      }
    }
    function relayoutWithCooccurrence() {
      const placed = [];
      const placedById = /* @__PURE__ */ new Map();
      const toRepack = [];
      for (const box of tags.values()) {
        if (persistedPositions.has(box.id)) {
          placed.push({
            x: box.tx - box.width / 2,
            y: box.ty - box.height / 2,
            w: box.width,
            h: box.height
          });
          placedById.set(box.id, { x: box.tx, y: box.ty });
        } else {
          toRepack.push(box);
        }
      }
      toRepack.sort((a, b) => b.count - a.count);
      packBoxesWithClusters(toRepack, placed, placedById, cooccurrenceMap);
    }
    async function refreshCooccurrence() {
      try {
        const fetched = await client.fetchTagCooccurrence("tags", 8);
        cooccurrenceMap = fetched;
        if (cooccurrenceMap.size > 0) {
          relayoutWithCooccurrence();
        }
      } catch {
      }
    }
    buildCloud();
    paintSidebar();
    raf = requestAnimationFrame(tick);
    void refreshCountsViaBulk();
    void refreshCooccurrence();
    if (terms.length === 0) {
      const empty = document.createElement("div");
      empty.className = "wpd-tagcloud__empty";
      empty.textContent = __(
        'No tags yet. Click "Add tag" to start building the cloud.'
      );
      stage.appendChild(empty);
    }
    let currentMatches = [];
    let selectedIndex = 0;
    const repaintHighlight = () => {
      const items = searchResults.querySelectorAll(
        ".wpd-tagcloud__search-result"
      );
      items.forEach((el, i) => {
        const active = i === selectedIndex;
        el.classList.toggle("is-active", active);
        if (active) {
          el.scrollIntoView({ block: "nearest" });
        }
      });
    };
    const selectMatch = (t) => {
      searchInput.value = "";
      searchResults.hidden = true;
      searchResults.replaceChildren();
      currentMatches = [];
      selectedIndex = 0;
      void focusTag(t.id);
    };
    const renderSearchResults = () => {
      const q = searchInput.value.trim().toLowerCase();
      if (q.length === 0) {
        searchResults.hidden = true;
        searchResults.replaceChildren();
        currentMatches = [];
        selectedIndex = 0;
        return;
      }
      currentMatches = Array.from(tags.values()).filter(
        (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
      ).sort((a, b) => b.count - a.count).slice(0, 10);
      selectedIndex = 0;
      searchResults.replaceChildren();
      currentMatches.forEach((t, i) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wpd-tagcloud__search-result";
        if (i === 0) {
          btn.classList.add("is-active");
        }
        const nameEl = document.createElement("span");
        nameEl.className = "wpd-tagcloud__search-title";
        nameEl.textContent = t.name || `#${t.id}`;
        const countEl = document.createElement("span");
        countEl.className = "wpd-tagcloud__search-meta";
        countEl.textContent = sprintf(
          /* translators: %d: number of posts assigned to a tag. */
          _n("%d post", "%d posts", t.count),
          t.count
        );
        btn.appendChild(nameEl);
        btn.appendChild(countEl);
        btn.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          selectMatch(t);
        });
        btn.addEventListener("mouseenter", () => {
          selectedIndex = i;
          repaintHighlight();
        });
        li.appendChild(btn);
        searchResults.appendChild(li);
      });
      searchResults.hidden = currentMatches.length === 0;
    };
    searchInput.addEventListener("input", renderSearchResults);
    searchInput.addEventListener("focus", renderSearchResults);
    searchInput.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") {
        if (currentMatches.length === 0) {
          return;
        }
        ev.preventDefault();
        selectedIndex = Math.min(
          selectedIndex + 1,
          currentMatches.length - 1
        );
        repaintHighlight();
      } else if (ev.key === "ArrowUp") {
        if (currentMatches.length === 0) {
          return;
        }
        ev.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        repaintHighlight();
      } else if (ev.key === "Enter") {
        if (currentMatches.length === 0) {
          return;
        }
        ev.preventDefault();
        selectMatch(currentMatches[selectedIndex]);
      } else if (ev.key === "Escape") {
        searchInput.value = "";
        searchResults.hidden = true;
        searchResults.replaceChildren();
        currentMatches = [];
        selectedIndex = 0;
      }
    });
    searchInput.addEventListener("blur", () => {
      setTimeout(() => {
        searchResults.hidden = true;
      }, 120);
    });
    const onDocClickSearch = (ev) => {
      if (!searchWrap.contains(ev.target)) {
        searchResults.hidden = true;
      }
    };
    document.addEventListener("click", onDocClickSearch);
    return () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      ro.disconnect();
      stage.removeEventListener("wheel", onWheel);
      document.removeEventListener("click", onDocClickSearch);
      try {
        app.ticker?.stop();
      } catch {
      }
      try {
        app.destroy({ removeView: true }, { children: true });
      } catch {
      }
      host.replaceChildren();
      host.classList.remove("wpd-tagcloud");
    };
  }
  function fontSizeFor(count, max) {
    const ratio = Math.sqrt(count / Math.max(1, max));
    return Math.round(
      MIN_FONT_SIZE + (MAX_FONT_SIZE - MIN_FONT_SIZE) * ratio
    );
  }
  function truncateChipName(name) {
    return name.length > CHIP_NAME_MAX_CHARS ? name.slice(0, CHIP_NAME_MAX_CHARS - 1) + "…" : name;
  }
  function aabbIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function slugHash(slug) {
    let h = 0;
    for (let i = 0; i < slug.length; i++) {
      h = (h * 31 + slug.charCodeAt(i)) % 2147483647;
    }
    return h;
  }
  function tagHue(slug, baseHue) {
    const h = slugHash(slug);
    return ((baseHue + h % 256 * 1.4) % 360 + 360) % 360;
  }
  function tagRotation(slug) {
    const h = slugHash(slug);
    const sign = h % 2 === 0 ? -1 : 1;
    const mag = Math.floor(h / 2) % 4 * 0.011;
    return sign * mag;
  }
  function readAdminThemeHue() {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--wp-admin-theme-color").trim();
      if (!value) {
        return 210;
      }
      const c = document.createElement("span");
      c.style.color = value;
      document.body.appendChild(c);
      const rgb = getComputedStyle(c).color;
      c.remove();
      const m = rgb.match(/\d+/g);
      if (!m || m.length < 3) {
        return 210;
      }
      return rgbToHue(
        parseInt(m[0], 10),
        parseInt(m[1], 10),
        parseInt(m[2], 10)
      );
    } catch {
      return 210;
    }
  }
  function rgbToHue(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    if (d === 0) {
      return 210;
    }
    let h;
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    return Math.round(h * 60);
  }
  function hslToInt(h, s, l) {
    const sn = s / 100;
    const ln = l / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const hp = h / 60;
    const x = c * (1 - Math.abs(hp % 2 - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hp < 1) {
      r = c;
      g = x;
    } else if (hp < 2) {
      r = x;
      g = c;
    } else if (hp < 3) {
      g = c;
      b = x;
    } else if (hp < 4) {
      g = x;
      b = c;
    } else if (hp < 5) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    const m = ln - c / 2;
    const ri = Math.round((r + m) * 255);
    const gi = Math.round((g + m) * 255);
    const bi = Math.round((b + m) * 255);
    return ri * 65536 + gi * 256 + bi;
  }
  function stripTags(html2) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html2;
    return tmp.textContent || tmp.innerText || "";
  }
  function showToast(title, err) {
    const reason = err instanceof Error ? err.message : String(err);
    const api = window.wp?.desktop;
    if (api && typeof api.showToast === "function") {
      api.showToast({
        message: `${title} ${reason}`.trim(),
        duration: 6e3
      });
      return;
    }
    console.error(title, err);
  }
  async function fetchShellJson(client, url) {
    const cfg = client.getConfig();
    const init = {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    };
    const response = await trackedFetch(url, init, {
      windowId: "desktop-mode-posts"
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    return { json, headers: response.headers };
  }
  function computePositionsKey() {
    try {
      const host = window.location.host || "unknown";
      const path = window.location.pathname.replace(/\/?wp-admin\/?.*$/, "");
      return `wpd-tagcloud-positions:${host}${path}`;
    } catch {
      return "wpd-tagcloud-positions:fallback";
    }
  }
  function readPersistedPositions(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return /* @__PURE__ */ new Map();
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return /* @__PURE__ */ new Map();
      }
      const out = /* @__PURE__ */ new Map();
      for (const [k, v] of Object.entries(
        parsed
      )) {
        const id = parseInt(k, 10);
        if (!Number.isFinite(id)) {
          continue;
        }
        const pos = v;
        if (typeof pos?.x === "number" && typeof pos?.y === "number") {
          out.set(id, { x: pos.x, y: pos.y });
        }
      }
      return out;
    } catch {
      return /* @__PURE__ */ new Map();
    }
  }
  function writePersistedPositions(key, positions) {
    try {
      const obj = {};
      for (const [id, pos] of positions) {
        obj[String(id)] = pos;
      }
      window.localStorage.setItem(key, JSON.stringify(obj));
    } catch {
    }
  }
  function createTagChip(pixi, chipLayer, term, fontSize, hue) {
    const container = new pixi.Container();
    container.eventMode = "static";
    container.cursor = "pointer";
    const shadow = new pixi.Graphics();
    container.addChild(shadow);
    const bg = new pixi.Graphics();
    container.addChild(bg);
    const hashText = new pixi.Text({
      text: "#",
      style: {
        fill: hslToInt(hue, 65, 42),
        fontSize,
        fontFamily: FONT_FAMILY,
        fontWeight: "700"
      },
      resolution: CHIP_TEXT_RES
    });
    container.addChild(hashText);
    const nameText = new pixi.Text({
      text: truncateChipName(term.name),
      style: {
        fill: 1909543,
        fontSize,
        fontFamily: FONT_FAMILY,
        fontWeight: "600"
      },
      resolution: CHIP_TEXT_RES
    });
    container.addChild(nameText);
    const countText = new pixi.Text({
      text: String(term.count),
      style: {
        fill: 16777215,
        fontSize: Math.max(10, Math.round(fontSize * 0.55)),
        fontFamily: FONT_FAMILY,
        fontWeight: "700"
      },
      resolution: CHIP_TEXT_RES
    });
    container.addChild(countText);
    chipLayer.addChild(container);
    return {
      container,
      shadow,
      bg,
      hashText,
      nameText,
      countText,
      width: 0,
      height: 0,
      cachedName: "",
      cachedCount: -1,
      cachedFocused: false,
      cachedHover: false,
      cachedHue: -1
    };
  }
  const tagsCloud = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    mountTagsCloud
  }, Symbol.toStringTag, { value: "Module" }));
  async function showUsersIntroDialog() {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "desktop-mode-users-intro__backdrop";
      backdrop.setAttribute("role", "presentation");
      Object.assign(backdrop.style, {
        position: "fixed",
        inset: "0",
        background: "color-mix(in srgb, var(--wp-admin-theme-color, #1d2327) 60%, transparent)",
        backdropFilter: "blur(2px)",
        zIndex: "100000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      });
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute(
        "aria-labelledby",
        "desktop-mode-users-intro-title"
      );
      dialog.className = "desktop-mode-users-intro";
      Object.assign(dialog.style, {
        background: "var(--wp-admin-theme-bg, #fff)",
        color: "var(--wp-admin-theme-fg, #1d2327)",
        borderRadius: "14px",
        boxShadow: "0 24px 60px rgba(0,0,0,.28)",
        maxWidth: "520px",
        width: "100%",
        maxHeight: "90vh",
        overflow: "auto",
        padding: "28px 32px 24px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      });
      dialog.innerHTML = renderDialogMarkup();
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      const primaryBtn = dialog.querySelector(
        '[data-action="confirm"]'
      );
      const settingsBtn = dialog.querySelector(
        '[data-action="settings"]'
      );
      primaryBtn?.focus();
      let resolved = false;
      const cleanup = (result) => {
        if (resolved) {
          return;
        }
        resolved = true;
        document.removeEventListener("keydown", onKey, true);
        backdrop.remove();
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cleanup("cancel");
        }
      };
      document.addEventListener("keydown", onKey, true);
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          cleanup("cancel");
        }
      });
      primaryBtn?.addEventListener("click", () => cleanup("confirm"));
      settingsBtn?.addEventListener("click", () => cleanup("settings"));
    });
  }
  function renderDialogMarkup() {
    const title = __("Welcome to the new Users window");
    const lede = __(
      "Same data you already manage, with the polish the Users list has been waiting for."
    );
    const highlights = [
      __("Live online indicator on every row — see who is around right now."),
      __("Last-login column so you finally know who is actually using the site."),
      __("Bulk role change with strict role-permission enforcement — never accidentally promote anyone above your own level."),
      __("One-click password reset and resend-welcome buttons, with sensible rate-limiting."),
      __("Click-to-copy email and a long-overdue search that matches name, username, AND email."),
      __("Per-user content stats: posts, pages, comments at a glance.")
    ];
    const li = (arr) => arr.map(
      (s) => `<li><span class="dot" aria-hidden="true"></span>${escapeHtml(s)}</li>`
    ).join("");
    return `
		<style>
			.desktop-mode-users-intro h2 {
				margin: 0 0 8px;
				font-size: 22px;
				font-weight: 600;
				letter-spacing: -0.01em;
			}
			.desktop-mode-users-intro p.lede {
				margin: 0 0 20px;
				color: var(--wp-admin-theme-fg-muted, #50575e);
				font-size: 14px;
				line-height: 1.5;
			}
			.desktop-mode-users-intro__list {
				list-style: none;
				margin: 0 0 22px;
				padding: 0;
				font-size: 14px;
				line-height: 1.5;
			}
			.desktop-mode-users-intro__list li {
				display: flex;
				align-items: flex-start;
				gap: 10px;
				padding: 6px 0;
			}
			.desktop-mode-users-intro__list .dot {
				flex: 0 0 auto;
				width: 6px;
				height: 6px;
				margin-top: 9px;
				border-radius: 50%;
				background: var(--wp-admin-theme-color, #2271b1);
			}
			.desktop-mode-users-intro__footer {
				display: flex;
				justify-content: flex-end;
				gap: 8px;
				margin-top: 8px;
			}
			.desktop-mode-users-intro__footer button {
				appearance: none;
				border: 1px solid var(--wp-admin-theme-border, #dcdcde);
				background: var(--wp-admin-theme-bg, #fff);
				color: inherit;
				padding: 8px 14px;
				border-radius: 6px;
				font-size: 13px;
				cursor: pointer;
			}
			.desktop-mode-users-intro__footer button.primary {
				border-color: var(--wp-admin-theme-color, #2271b1);
				background: var(--wp-admin-theme-color, #2271b1);
				color: #fff;
				font-weight: 500;
			}
			.desktop-mode-users-intro__footer button:hover { filter: brightness(1.05); }
			.desktop-mode-users-intro__footer button:focus-visible {
				outline: 2px solid var(--wp-admin-theme-color, #2271b1);
				outline-offset: 2px;
			}
		</style>
		<h2 id="desktop-mode-users-intro-title">${escapeHtml(title)}</h2>
		<p class="lede">${escapeHtml(lede)}</p>
		<ul class="desktop-mode-users-intro__list">${li(highlights)}</ul>
		<div class="desktop-mode-users-intro__footer">
			<button type="button" data-action="settings">${escapeHtml(
      __("Take me to settings")
    )}</button>
			<button type="button" class="primary" data-action="confirm">${escapeHtml(
      __("Got it")
    )}</button>
		</div>
	`;
  }
  function escapeHtml(s) {
    const t = document.createElement("div");
    t.textContent = s;
    return t.innerHTML;
  }
  const _initial = {
    userId: null,
    requestedAt: 0,
    tabRequested: false
  };
  let _store = null;
  function getStore() {
    if (_store) {
      return _store;
    }
    const w = window;
    const factory = w.wp?.desktop?.createSharedStore;
    if (typeof factory !== "function") {
      return null;
    }
    _store = factory(
      "desktop-mode/user-edit/target",
      () => ({ ..._initial })
    );
    return _store;
  }
  function setUserEditTarget(userId) {
    const store = getStore();
    if (store) {
      store.state.userId = userId;
      store.state.requestedAt = Date.now();
      store.state.tabRequested = true;
      store.notify();
      return;
    }
    const w = window;
    w._wpdUserEditTarget = {
      userId,
      requestedAt: Date.now(),
      tabRequested: true
    };
  }
  function readUserEditTarget() {
    const store = getStore();
    if (store) {
      return { ...store.state };
    }
    const w = window;
    return w._wpdUserEditTarget ?? { ..._initial };
  }
  function clearUserEditTarget() {
    const store = getStore();
    if (store) {
      store.state.userId = null;
      store.state.requestedAt = 0;
      store.state.tabRequested = false;
      store.notify();
    }
    const w = window;
    if (w._wpdUserEditTarget) {
      w._wpdUserEditTarget = {
        userId: null,
        requestedAt: 0,
        tabRequested: false
      };
    }
  }
  function setUserEditTabRequested(requested) {
    const store = getStore();
    if (store) {
      store.state.tabRequested = requested;
      store.notify();
      return;
    }
    const w = window;
    const prev = w._wpdUserEditTarget ?? { ..._initial };
    w._wpdUserEditTarget = { ...prev, tabRequested: requested };
  }
  function subscribeUserEditTarget(cb) {
    const store = getStore();
    if (!store) {
      return () => {
      };
    }
    return store.subscribe((state) => cb({ ...state }));
  }
  const userEditTarget = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    clearUserEditTarget,
    readUserEditTarget,
    setUserEditTabRequested,
    setUserEditTarget,
    subscribeUserEditTarget
  }, Symbol.toStringTag, { value: "Module" }));
  function wpdConfirmGlobal(options) {
    const w = window;
    const fn = w.wp?.desktop?.confirm;
    if (typeof fn !== "function") {
      return Promise.resolve(window.confirm(options.message));
    }
    return fn(options);
  }
  function notifyToast(body, opts = {}) {
    const w = window;
    const api = w.wp?.desktop;
    if (api?.notify) {
      api.notify({ body, kind: opts.kind });
      return;
    }
    console.info("[users-window]", body);
  }
  function openUserEditWindow(userId) {
    if (!Number.isFinite(userId) || userId <= 0) {
      return;
    }
    setUserEditTarget(userId);
    console.info(
      "[users-window] opening user-edit window for user",
      userId
    );
    const w = window;
    const fn = w.wp?.desktop?.openWindow;
    if (typeof fn !== "function") {
      console.error(
        "[users-window] wp.desktop.openWindow is missing — desktop shell may not be ready."
      );
      notifyToast(
        __("Could not open profile window — desktop shell unavailable."),
        { kind: "error" }
      );
      return;
    }
    const opened = fn("desktop-mode-user-edit", {
      source: "users-window/row-click"
    });
    if (!opened) {
      console.error(
        '[users-window] openWindow("desktop-mode-user-edit") returned false — window not registered server-side. Check includes/user-edit-window/window.php.'
      );
      notifyToast(
        __("Profile window not registered — see console."),
        { kind: "error" }
      );
    }
  }
  const ROOT = "[data-desktop-mode-posts-root]";
  const STATUS = "[data-desktop-mode-posts-status]";
  const SEARCH = "[data-desktop-mode-posts-search]";
  const REFRESH = "[data-desktop-mode-posts-refresh]";
  const NEW_BTN = "[data-desktop-mode-posts-new]";
  const TABLE = "[data-desktop-mode-posts-table]";
  const BULK = "[data-desktop-mode-posts-bulk]";
  const COUNT = "[data-desktop-mode-posts-count]";
  const PAGE_INDICATOR = "[data-desktop-mode-posts-page-indicator]";
  const PREV = "[data-desktop-mode-posts-prev]";
  const NEXT = "[data-desktop-mode-posts-next]";
  const PER_PAGE = "[data-desktop-mode-posts-per-page]";
  const BULK_ACTIONS_HOST = "[data-desktop-mode-posts-bulk-actions]";
  const SEARCH_DEBOUNCE_MS = 250;
  function userCellKey(id, key) {
    return `${id}::${key}`;
  }
  function memoUserCell(cache, id, key, build) {
    const k = userCellKey(id, key);
    const cached = cache.get(k);
    if (cached) {
      return cached;
    }
    const node = build();
    cache.set(k, node);
    return node;
  }
  const _usersIntroShown = { v: false };
  function maybeShowUsersIntro(client) {
    if (_usersIntroShown.v) {
      return;
    }
    let cfg;
    try {
      cfg = client.getConfig();
    } catch {
      return;
    }
    if (cfg.introSeen) {
      return;
    }
    _usersIntroShown.v = true;
    void showUsersIntroDialog().then((result) => {
      if (result === "cancel") {
        _usersIntroShown.v = false;
        return;
      }
      void markUsersIntroSeen(client, cfg);
      if (result === "settings") {
        const w = window;
        w.wp?.desktop?.openOsSettings?.();
      }
    }).catch(() => {
      _usersIntroShown.v = false;
    });
  }
  async function markUsersIntroSeen(client, cfg) {
    if (!cfg.introUrl) {
      return;
    }
    try {
      await trackedFetch(
        cfg.introUrl,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": cfg.restNonce
          },
          body: JSON.stringify({ slug: "users" })
        },
        {
          windowId: client.windowId,
          source: "users-window/intro"
        }
      );
      cfg.introSeen = true;
    } catch {
    }
  }
  function buildIdentityCell(row, cfg) {
    const cell = document.createElement("span");
    cell.style.cssText = "display:flex;align-items:center;gap:10px;min-width:0;";
    const avatar = document.createElement("wpd-avatar");
    avatar.setAttribute("size", "32");
    if (row.name) {
      avatar.setAttribute("name", row.name);
    }
    const presence = row.desktop_mode_presence ?? "offline";
    avatar.setAttribute("presence", presence);
    const avatars = row.avatar_urls ?? {};
    const rawAvatar = avatars["48"] ?? avatars["96"] ?? avatars["24"] ?? "";
    if (rawAvatar) {
      applyAvatarSrc(avatar, rawAvatar);
    }
    cell.appendChild(avatar);
    const text = document.createElement("span");
    text.style.cssText = "display:flex;flex-direction:column;min-width:0;line-height:1.25;";
    const nameRow = document.createElement("span");
    const name = document.createElement("a");
    name.href = `${cfg.editPostUrlBase}?user_id=${row.id}`;
    name.textContent = row.name || `#${row.id}`;
    name.title = name.textContent;
    name.setAttribute("data-noclick", "");
    name.style.cssText = "font-weight:600;color:inherit;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;";
    name.addEventListener("mouseenter", () => {
      name.style.textDecoration = "underline";
    });
    name.addEventListener("mouseleave", () => {
      name.style.textDecoration = "none";
    });
    name.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void openUserEditWindow(row.id);
    });
    nameRow.appendChild(name);
    text.appendChild(nameRow);
    if (row.slug) {
      const sub = document.createElement("span");
      sub.textContent = `@${row.slug}`;
      sub.style.cssText = "font-size:11px;color:var(--wp-admin-theme-fg-muted, #8c8f94);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;";
      text.appendChild(sub);
    }
    cell.appendChild(text);
    return cell;
  }
  function buildEmailCell(row) {
    const cell = document.createElement("button");
    cell.type = "button";
    const email = typeof row.email === "string" ? row.email : "";
    cell.textContent = email || "—";
    cell.disabled = email === "";
    cell.title = email ? __("Click to copy email") : "";
    Object.assign(cell.style, {
      appearance: "none",
      background: "transparent",
      border: "none",
      padding: "2px 6px",
      font: "inherit",
      color: "inherit",
      cursor: email ? "copy" : "default",
      textAlign: "left",
      fontSize: "13px",
      borderRadius: "4px",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    });
    cell.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!email) {
        return;
      }
      void navigator.clipboard?.writeText(email).then(() => {
        const orig = cell.textContent;
        cell.textContent = __("Copied!");
        cell.style.color = "var(--wp-admin-theme-color, #2271b1)";
        setTimeout(() => {
          cell.textContent = orig;
          cell.style.color = "";
        }, 1200);
      }).catch(() => {
      });
    });
    return cell;
  }
  function buildRoleCell(row, cfg) {
    const cell = document.createElement("span");
    cell.style.cssText = "display:inline-flex;flex-wrap:wrap;gap:4px;min-width:0;";
    const roles = Array.isArray(row.roles) ? row.roles : [];
    const labels = cfg.allRoles ?? {};
    if (roles.length === 0) {
      const none = document.createElement("span");
      none.textContent = __("No role");
      none.style.cssText = "color:var(--wp-admin-theme-fg-muted, #8c8f94);font-style:italic;";
      cell.appendChild(none);
      return cell;
    }
    for (const slug of roles) {
      const chip = document.createElement("span");
      chip.textContent = labels[slug] ?? slug;
      chip.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "padding:2px 8px",
        "border-radius:10px",
        "font-size:11px",
        "font-weight:600",
        "background:rgba(34,113,177,0.10)",
        "color:#0a4b78",
        "white-space:nowrap"
      ].join(";");
      cell.appendChild(chip);
    }
    return cell;
  }
  function buildStatsCell(row) {
    const stats = row.desktop_mode_user_stats ?? {
      posts: 0,
      pages: 0,
      comments: 0
    };
    const cell = document.createElement("span");
    cell.style.cssText = "display:inline-flex;align-items:center;gap:10px;font-size:12px;font-variant-numeric:tabular-nums;";
    const mk = (dashicon, count, label) => {
      const span = document.createElement("span");
      span.style.cssText = "display:inline-flex;align-items:center;gap:3px;";
      span.title = label;
      const ic = document.createElement("wpd-icon");
      ic.setAttribute("name", dashicon);
      ic.setAttribute("size", "14");
      ic.style.color = "var(--wp-admin-theme-fg-muted, #8c8f94)";
      span.appendChild(ic);
      const txt = document.createElement("span");
      txt.textContent = String(count);
      if (count === 0) {
        txt.style.color = "var(--wp-admin-theme-fg-muted, #8c8f94)";
      }
      span.appendChild(txt);
      return span;
    };
    cell.appendChild(mk("admin-post", stats.posts, __("Posts")));
    cell.appendChild(mk("admin-page", stats.pages, __("Pages")));
    cell.appendChild(
      mk("admin-comments", stats.comments, __("Comments"))
    );
    return cell;
  }
  function relativeTime(ts) {
    const now = Math.floor(Date.now() / 1e3);
    const delta = now - ts;
    if (delta < 60) {
      return __("just now");
    }
    if (delta < 3600) {
      const m = Math.floor(delta / 60);
      return sprintf(__("%d min ago"), m);
    }
    if (delta < 86400) {
      const h = Math.floor(delta / 3600);
      return sprintf(__("%d h ago"), h);
    }
    if (delta < 86400 * 30) {
      const d = Math.floor(delta / 86400);
      return sprintf(__("%d d ago"), d);
    }
    if (delta < 86400 * 365) {
      const mo = Math.floor(delta / (86400 * 30));
      return sprintf(__("%d mo ago"), mo);
    }
    const y = Math.floor(delta / (86400 * 365));
    return sprintf(__("%d y ago"), y);
  }
  function buildLastLoginCell(row) {
    const cell = document.createElement("span");
    cell.style.cssText = "font-size:13px;font-variant-numeric:tabular-nums;";
    const ts = row.desktop_mode_last_login;
    if (!ts || typeof ts !== "number") {
      cell.textContent = __("Never");
      cell.style.color = "var(--wp-admin-theme-fg-muted, #8c8f94)";
      return cell;
    }
    cell.textContent = relativeTime(ts);
    const dt = new Date(ts * 1e3);
    cell.title = dt.toLocaleString();
    return cell;
  }
  function buildRegisteredCell(row) {
    const cell = document.createElement("span");
    cell.style.cssText = "font-size:13px;font-variant-numeric:tabular-nums;";
    const raw = typeof row.registered_date === "string" ? row.registered_date : "";
    if (!raw) {
      cell.textContent = "—";
      cell.style.color = "var(--wp-admin-theme-fg-muted, #8c8f94)";
      return cell;
    }
    const hasTz = /[Zz]|[+-]\d{2}:?\d{2}$/.test(raw);
    const ts = Math.floor(Date.parse(hasTz ? raw : raw + "Z") / 1e3);
    if (!Number.isFinite(ts)) {
      cell.textContent = raw;
      return cell;
    }
    cell.textContent = relativeTime(ts);
    cell.title = new Date(ts * 1e3).toLocaleString();
    return cell;
  }
  function buildActionsCell(row, cfg, client) {
    const cell = document.createElement("span");
    cell.style.cssText = "display:inline-flex;gap:4px;align-items:center;";
    const canEditViewer = cfg.canEdit === true;
    const canEditRow = row.desktop_mode_can_edit === true;
    if (!canEditViewer || !canEditRow) {
      cell.textContent = "—";
      cell.style.color = "var(--wp-admin-theme-fg-muted, #8c8f94)";
      return cell;
    }
    const mk = (label, dashicon, fn) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = label;
      btn.setAttribute("aria-label", label);
      Object.assign(btn.style, {
        appearance: "none",
        border: "1px solid var(--wp-admin-theme-border, #dcdcde)",
        background: "var(--wp-admin-theme-bg, #fff)",
        color: "inherit",
        padding: "4px 6px",
        borderRadius: "4px",
        cursor: "pointer",
        lineHeight: "1"
      });
      const ic = document.createElement("wpd-icon");
      ic.setAttribute("name", dashicon);
      ic.setAttribute("size", "14");
      btn.appendChild(ic);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        fn();
      });
      return btn;
    };
    cell.appendChild(
      mk(
        __("Send password reset"),
        "email-alt",
        async () => {
          const ok = await wpdConfirmGlobal({
            title: __("Send password reset email?"),
            message: sprintf(
              // translators: %s is a user name.
              __("WordPress will email %s a password-reset link."),
              row.name
            ),
            confirmLabel: __("Send reset email")
          });
          if (!ok) {
            return;
          }
          const result = await client.sendPasswordReset(row.id);
          if (result.ok) {
            notifyToast(
              sprintf(
                // translators: %s is the user's email address.
                __("Reset email sent to %s."),
                result.email ?? row.email ?? ""
              ),
              { kind: "success" }
            );
          } else {
            notifyToast(
              sprintf(
                // translators: %s is an error code.
                __("Could not send reset email (%s)."),
                result.error ?? "unknown"
              ),
              { kind: "error" }
            );
          }
        }
      )
    );
    cell.appendChild(
      mk(
        __("Resend welcome email"),
        "megaphone",
        async () => {
          const ok = await wpdConfirmGlobal({
            title: __("Resend welcome email?"),
            message: sprintf(
              // translators: %s is a user name.
              __(
                "WordPress will resend the original welcome email to %s."
              ),
              row.name
            ),
            confirmLabel: __("Resend")
          });
          if (!ok) {
            return;
          }
          const result = await client.resendWelcome(row.id);
          if (result.ok) {
            notifyToast(
              sprintf(
                // translators: %s is the user's email address.
                __("Welcome email resent to %s."),
                result.email ?? row.email ?? ""
              ),
              { kind: "success" }
            );
          } else {
            notifyToast(
              sprintf(
                // translators: %s is an error code.
                __("Could not resend welcome (%s)."),
                result.error ?? "unknown"
              ),
              { kind: "error" }
            );
          }
        }
      )
    );
    return cell;
  }
  function buildColumns(cache, cfg, client) {
    const cols = [
      {
        key: "identity",
        label: __("Name"),
        sortable: false,
        sticky: true,
        minWidth: "260px",
        render: (_v, row) => memoUserCell(
          cache,
          row.id,
          "identity",
          () => buildIdentityCell(row, cfg)
        )
      },
      {
        key: "email",
        label: __("Email"),
        minWidth: "220px",
        render: (_v, row) => memoUserCell(cache, row.id, "email", () => buildEmailCell(row))
      },
      {
        key: "role",
        label: __("Role"),
        width: "180px",
        render: (_v, row) => memoUserCell(
          cache,
          row.id,
          "role",
          () => buildRoleCell(row, cfg)
        )
      },
      {
        key: "stats",
        label: __("Content"),
        width: "160px",
        sortValue: (row) => {
          const s = row.desktop_mode_user_stats;
          return s ? s.posts + s.pages + s.comments : 0;
        },
        render: (_v, row) => memoUserCell(cache, row.id, "stats", () => buildStatsCell(row))
      },
      {
        key: "last_login",
        label: __("Last login"),
        width: "140px",
        sortable: false,
        sortValue: (row) => typeof row.desktop_mode_last_login === "number" ? row.desktop_mode_last_login : 0,
        render: (_v, row) => memoUserCell(
          cache,
          row.id,
          "last_login",
          () => buildLastLoginCell(row)
        )
      },
      {
        key: "registered",
        label: __("Registered"),
        width: "140px",
        sortable: true,
        render: (_v, row) => memoUserCell(
          cache,
          row.id,
          "registered",
          () => buildRegisteredCell(row)
        )
      }
    ];
    if (cfg.canEdit === true) {
      cols.push({
        key: "actions",
        label: __("Actions"),
        width: "110px",
        sortable: false,
        render: (_v, row) => (
          // Actions cell is intentionally NOT memoized — its closure
          // captures `row` and the row payload changes between
          // fetches. Cheap to rebuild, fewer surprises.
          buildActionsCell(row, cfg, client)
        )
      });
    }
    return cols;
  }
  function defaultStatusSegments() {
    return [
      { value: "", label: __("All") },
      { value: "online", label: __("Online") },
      { value: "recent", label: __("Active 30d") },
      { value: "never", label: __("Never logged in") }
    ];
  }
  function applyClientStatusFilter(rows, status) {
    if (!status) {
      return rows;
    }
    if (status === "online") {
      return rows.filter((r) => r.desktop_mode_presence === "online");
    }
    if (status === "recent") {
      const now = Math.floor(Date.now() / 1e3);
      return rows.filter((r) => {
        const ts = r.desktop_mode_last_login;
        return typeof ts === "number" && ts > 0 && now - ts < 86400 * 30;
      });
    }
    if (status === "never") {
      return rows.filter(
        (r) => !r.desktop_mode_last_login || typeof r.desktop_mode_last_login !== "number"
      );
    }
    return rows;
  }
  async function renderUsersWindow(body, client) {
    const root = body.querySelector(ROOT);
    const table = body.querySelector(TABLE);
    if (!root || !table) {
      return;
    }
    table.addEventListener("wpd-table-row-click", (e) => {
      const detail = e.detail;
      const id = detail?.row?.id;
      if (typeof id !== "number" || id <= 0) {
        return;
      }
      void openUserEditWindow(id);
    });
    maybeShowUsersIntro(client);
    const cfg = client.getConfig();
    const view = {
      page: 1,
      perPage: Math.max(1, cfg.defaultPerPage || 20),
      search: "",
      status: "",
      orderby: "name",
      order: "asc",
      roles: [],
      searchDebounce: null
    };
    const cellCache = /* @__PURE__ */ new Map();
    table.columns = buildColumns(cellCache, cfg, client);
    table.getRowId = (row) => row.id;
    table.sort = { key: "name", direction: "asc" };
    if (!cfg.canEdit && !cfg.canPromote && !cfg.canDelete) {
      table.removeAttribute("selectable");
    }
    let totalPages = 0;
    let totalRows = 0;
    let refreshSeq = 0;
    const perPageEl = root.querySelector(PER_PAGE);
    if (perPageEl) {
      perPageEl.value = String(view.perPage);
    }
    const clearSelectionOnQueryChange = () => {
      table.clearSelection();
    };
    const indicator = root.querySelector(PAGE_INDICATOR);
    const prevBtn = root.querySelector(PREV);
    const nextBtn = root.querySelector(NEXT);
    const bulkBar = root.querySelector(BULK);
    const countEl = root.querySelector(COUNT);
    const bulkActionsHost = root.querySelector(BULK_ACTIONS_HOST);
    const statusHost = root.querySelector(STATUS);
    if (statusHost) {
      statusHost.replaceChildren();
      for (const seg of defaultStatusSegments()) {
        const el = document.createElement("wpd-segment");
        el.setAttribute("value", seg.value);
        el.textContent = seg.label;
        statusHost.appendChild(el);
      }
      statusHost.addEventListener("wpd-pick", (e) => {
        const detail = e.detail;
        view.status = detail?.value ?? "";
        view.page = 1;
        clearSelectionOnQueryChange();
        void refresh();
      });
    }
    const searchEl = root.querySelector(SEARCH);
    if (searchEl) {
      searchEl.addEventListener("input", () => {
        if (view.searchDebounce !== null) {
          clearTimeout(view.searchDebounce);
        }
        view.searchDebounce = window.setTimeout(() => {
          view.search = searchEl.value.trim();
          view.page = 1;
          clearSelectionOnQueryChange();
          void refresh();
        }, SEARCH_DEBOUNCE_MS);
      });
    }
    const refreshBtn = root.querySelector(REFRESH);
    refreshBtn?.addEventListener("click", () => {
      void refresh();
    });
    const newBtn = root.querySelector(NEW_BTN);
    if (newBtn) {
      if (!cfg.canCreate) {
        newBtn.style.display = "none";
      } else {
        newBtn.addEventListener("click", (e) => {
          e.preventDefault();
          const tabs = body.querySelector(
            "[data-desktop-mode-users-tabs]"
          );
          if (!tabs) {
            return;
          }
          tabs.value = "add-new";
          tabs.setAttribute("value", "add-new");
        });
      }
    }
    perPageEl?.addEventListener("change", () => {
      const n = parseInt(perPageEl.value, 10);
      if (Number.isFinite(n) && n > 0) {
        view.perPage = n;
        view.page = 1;
        clearSelectionOnQueryChange();
        void refresh();
      }
    });
    const renderBulkBar = () => {
      if (!bulkBar || !bulkActionsHost) {
        return;
      }
      const sel = table.selection;
      const ids = sel ? Array.from(sel) : [];
      if (ids.length === 0) {
        bulkBar.hidden = true;
        return;
      }
      bulkBar.hidden = false;
      if (countEl) {
        countEl.textContent = sprintf(
          // translators: %d is a count of selected users.
          __("%d selected"),
          ids.length
        );
      }
      bulkActionsHost.replaceChildren();
      const assignable = cfg.assignableRoles ?? {};
      const assignableKeys = Object.keys(assignable);
      if (cfg.canPromote && assignableKeys.length > 0) {
        const wrap = document.createElement("span");
        wrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;";
        const roleDropdown = document.createElement("select");
        Object.assign(roleDropdown.style, {
          padding: "4px 8px",
          borderRadius: "4px",
          border: "1px solid var(--wp-admin-theme-border, #dcdcde)",
          background: "var(--wp-admin-theme-bg, #fff)",
          color: "inherit",
          font: "inherit",
          fontSize: "13px"
        });
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = __("Set role to…");
        roleDropdown.appendChild(placeholder);
        for (const slug of assignableKeys) {
          const opt = document.createElement("option");
          opt.value = slug;
          opt.textContent = assignable[slug];
          roleDropdown.appendChild(opt);
        }
        const apply = document.createElement("wpd-button");
        apply.setAttribute("variant", "primary");
        apply.textContent = __("Apply");
        apply.addEventListener("click", async (e) => {
          e.preventDefault();
          const role = roleDropdown.value;
          if (!role) {
            return;
          }
          const targetIds = Array.from(
            table.selection ?? []
          ).map((id) => Number(id));
          if (targetIds.length === 0) {
            return;
          }
          const ok = await wpdConfirmGlobal({
            title: __("Change role for selected users?"),
            message: sprintf(
              // translators: %1$d is a user count, %2$s is a role label.
              __("Set %1$d user(s)' role to %2$s?"),
              targetIds.length,
              assignable[role]
            ),
            confirmLabel: __("Set role")
          });
          if (!ok) {
            return;
          }
          const out = await client.bulkSetRole(targetIds, role).catch((err) => {
            notifyToast(
              String(err.message ?? err),
              { kind: "error" }
            );
            return null;
          });
          if (!out) {
            return;
          }
          const successes = Object.values(out.results).filter(
            (r) => r.ok
          ).length;
          const failures = targetIds.length - successes;
          if (successes > 0) {
            notifyToast(
              sprintf(
                // translators: %1$d users updated, %2$d failed.
                __("Role updated for %1$d user(s) (%2$d skipped)."),
                successes,
                failures
              ),
              { kind: failures > 0 ? "info" : "success" }
            );
          } else {
            notifyToast(__("No users updated."), { kind: "error" });
          }
          table.clearSelection();
          void refresh();
        });
        wrap.appendChild(roleDropdown);
        wrap.appendChild(apply);
        bulkActionsHost.appendChild(wrap);
      }
    };
    table.addEventListener("wpd-table-selection-change", renderBulkBar);
    prevBtn?.addEventListener("click", () => {
      if (view.page > 1) {
        view.page -= 1;
        clearSelectionOnQueryChange();
        void refresh();
      }
    });
    nextBtn?.addEventListener("click", () => {
      if (view.page < totalPages) {
        view.page += 1;
        clearSelectionOnQueryChange();
        void refresh();
      }
    });
    const updatePager = () => {
      if (indicator) {
        indicator.textContent = sprintf(
          // translators: %1$d current page, %2$d total pages, %3$d total rows.
          __("Page %1$d of %2$d · %3$d users"),
          view.page,
          Math.max(1, totalPages),
          totalRows
        );
      }
      if (prevBtn) {
        prevBtn.disabled = view.page <= 1;
      }
      if (nextBtn) {
        nextBtn.disabled = view.page >= totalPages;
      }
    };
    const buildParams = () => {
      return {
        page: view.page,
        perPage: view.perPage,
        search: view.search || void 0,
        roles: view.roles.length > 0 ? view.roles : void 0,
        orderby: view.orderby,
        order: view.order
      };
    };
    const refresh = async () => {
      const mySeq = ++refreshSeq;
      table.toggleAttribute("loading", true);
      try {
        const result = await client.fetchUsers(buildParams());
        if (mySeq !== refreshSeq) {
          return;
        }
        if (result.items.length === 0 && view.page > 1 && result.totalPages > 0 && view.page > result.totalPages) {
          view.page = 1;
          await refresh();
          return;
        }
        cellCache.clear();
        const filtered = applyClientStatusFilter(result.items, view.status);
        table.data = filtered;
        totalRows = result.total;
        totalPages = result.totalPages;
        updatePager();
        renderBulkBar();
      } catch (err) {
        console.error("[users-window] fetch failed:", err);
        notifyToast(
          __("Could not load users. Try Refresh."),
          { kind: "error" }
        );
      } finally {
        table.toggleAttribute("loading", false);
      }
    };
    mountAddUserForm(body, client, cfg, {
      afterCreate: () => {
        const tabs = body.querySelector(
          "[data-desktop-mode-users-tabs]"
        );
        if (tabs) {
          tabs.value = "all";
          tabs.setAttribute("value", "all");
        }
        view.page = 1;
        void refresh();
      }
    });
    wireProfileSubTab(body, cfg);
    const patchUserRow = async (id) => {
      try {
        const updated = await client.fetchOneUser(id);
        const list = table.data;
        const idx = list.findIndex((r) => r.id === id);
        if (idx < 0) {
          return;
        }
        if (!updated) {
          const next2 = list.slice();
          next2.splice(idx, 1);
          table.data = next2;
          return;
        }
        for (const k of Array.from(cellCache.keys())) {
          if (k.startsWith(`${id}::`)) {
            cellCache.delete(k);
          }
        }
        const next = list.slice();
        next[idx] = updated;
        table.data = applyClientStatusFilter(next, view.status);
      } catch (err) {
        console.warn("[users-window] row patch failed, falling back to refresh", err);
        void refresh();
      }
    };
    const subscribeApi = window.wp?.desktop;
    const unsubscribe = subscribeApi?.subscribe?.(
      "desktop-mode.user.changed",
      (payload) => {
        const ids = payload?.ids;
        if (!Array.isArray(ids)) {
          return;
        }
        for (const raw of ids) {
          const id = typeof raw === "number" ? raw : Number(raw);
          if (Number.isFinite(id) && id > 0) {
            void patchUserRow(id);
          }
        }
      }
    );
    if (unsubscribe) {
      document.addEventListener(
        "desktop-mode-window-closed",
        (e) => {
          const detail = e.detail;
          if (detail?.windowId === "desktop-mode-users") {
            unsubscribe();
          }
        },
        { once: false }
      );
    }
    void refresh();
  }
  function wireProfileSubTab(body, cfg) {
    const profile = body.querySelector(
      "wpd-user-profile[data-wpd-user-profile-self]"
    );
    if (!profile) {
      return;
    }
    const viewerId = cfg.currentUserId;
    if (typeof viewerId === "number" && viewerId > 0) {
      profile.setAttribute("user-id", String(viewerId));
    }
  }
  function mountAddUserForm(body, client, cfg, opts) {
    const formNullable = body.querySelector(
      "[data-desktop-mode-users-add-form]"
    );
    if (!formNullable) {
      return;
    }
    const form = formNullable;
    const defaultRole = cfg.defaultRole ?? "subscriber";
    const assignableRoles = cfg.assignableRoles && Object.keys(cfg.assignableRoles).length > 0 ? cfg.assignableRoles : { [defaultRole]: defaultRole };
    mountSelect(form, "role", __("Role"), assignableRoles, defaultRole);
    mountSelect(
      form,
      "locale",
      __("Language"),
      cfg.locales ?? { "": __("Site default") },
      ""
    );
    const generateBtn = form.querySelector(
      '[data-action="generate-password"]'
    );
    generateBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pwd = generateStrongPassword(18);
      const pwdField = form.querySelector(
        'wpd-text-field[name="password"]'
      );
      if (pwdField) {
        pwdField.value = pwd;
        pwdField.setAttribute("value", pwd);
      }
      void navigator.clipboard?.writeText(pwd).catch(() => {
      });
      notifyToast(__("Generated password copied to clipboard."), {
        kind: "success"
      });
    });
    let pending = false;
    form.addEventListener("wpd-form-submit", (e) => {
      const detail = e.detail;
      void onSubmit(detail.values);
    });
    async function onSubmit(values) {
      if (pending) {
        return;
      }
      pending = true;
      form.setBusy(true);
      form.clearErrors();
      const payload = {
        username: String(values.username ?? "").trim(),
        email: String(values.email ?? "").trim(),
        first_name: optionalString(values.first_name),
        last_name: optionalString(values.last_name),
        url: optionalString(values.url),
        locale: String(values.locale ?? ""),
        password: optionalString(values.password),
        role: optionalString(values.role),
        send_notification: Boolean(values.send_notification)
      };
      const result = await client.createUser(payload);
      pending = false;
      form.setBusy(false);
      if (!result.ok) {
        handleCreateError(form, result.error, result.message, payload);
        return;
      }
      notifyToast(
        sprintf(
          // translators: %s is the user's email address.
          __("User created — welcome email sent to %s."),
          result.email ?? payload.email
        ),
        { kind: "success" }
      );
      opts.afterCreate();
    }
  }
  function mountSelect(form, name, _label, optionsMap, initialValue) {
    const select = form.querySelector(
      `wpd-select[name="${name}"]`
    );
    if (!select) {
      return;
    }
    const items = Object.entries(optionsMap).map(([value, label]) => ({
      value,
      label
    }));
    select.items = items;
    if (initialValue && optionsMap[initialValue] !== void 0) {
      select.value = initialValue;
      select.setAttribute("value", initialValue);
    }
  }
  function handleCreateError(form, code, message, payload) {
    let summary = message;
    if (!summary) {
      switch (code) {
        case "desktop_mode_users_username_exists":
        case "existing_user_login":
          summary = __("That username is already in use.");
          break;
        case "desktop_mode_users_email_exists":
        case "existing_user_email":
          summary = __("That email is already in use.");
          break;
        case "desktop_mode_users_username_invalid":
          summary = __("Username is not valid.");
          break;
        case "desktop_mode_users_email_invalid":
          summary = __("A valid email address is required.");
          break;
        case "desktop_mode_users_role_forbidden":
          summary = __("You are not allowed to assign that role.");
          break;
        default:
          summary = __("Could not create the user.");
      }
    }
    form.setError(summary);
    if (code === "desktop_mode_users_username_exists" || code === "existing_user_login" || code === "desktop_mode_users_username_invalid") {
      form.setFieldInvalid("username");
    }
    if (code === "desktop_mode_users_email_exists" || code === "existing_user_email" || code === "desktop_mode_users_email_invalid") {
      form.setFieldInvalid("email");
    }
    if (code === "desktop_mode_users_role_forbidden") {
      form.setFieldInvalid("role");
    }
    notifyToast(summary, { kind: "error" });
    console.warn("[users-window] create failed", { code, payload });
  }
  function optionalString(value) {
    if (typeof value !== "string") {
      return void 0;
    }
    const trimmed = value.trim();
    return trimmed === "" ? void 0 : trimmed;
  }
  function generateStrongPassword(length) {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghjkmnpqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%^&*-_=+";
    const all = upper + lower + digits + symbols;
    const buf = new Uint32Array(length);
    crypto.getRandomValues(buf);
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += all[buf[i] % all.length];
    }
    return out;
  }
  const usersRender = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    renderUsersWindow
  }, Symbol.toStringTag, { value: "Module" }));
  exports.renderPostsWindow = renderPostsWindow;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({});
