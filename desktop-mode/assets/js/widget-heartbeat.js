(function() {
  "use strict";
  const SHARED_STORES_SLOT = "__desktopModeSharedStores";
  function resolveSlot() {
    const w2 = window;
    let slot = w2[SHARED_STORES_SLOT];
    if (!slot) {
      slot = /* @__PURE__ */ new Map();
      w2[SHARED_STORES_SLOT] = slot;
    }
    return slot;
  }
  function createSharedStore(key, initialState) {
    const slot = resolveSlot();
    let record = slot.get(key);
    if (!record) {
      record = {
        state: initialState(),
        listeners: /* @__PURE__ */ new Set(),
        rebuild: initialState
      };
      slot.set(key, record);
    }
    const handle = {
      // `record.state` is the live reference. The getter on the
      // `state` field reads the latest value even if `reset()`
      // reassigned it to a fresh object.
      get state() {
        return record.state;
      },
      set state(next) {
        record.state = next;
      },
      getState() {
        return record.state;
      },
      notify() {
        for (const cb of Array.from(record.listeners)) {
          try {
            cb(record.state);
          } catch (err) {
            console.error(
              `[desktop-mode/shared-store:${key}] subscriber threw:`,
              err
            );
          }
        }
      },
      subscribe(cb) {
        record.listeners.add(cb);
        return () => {
          record.listeners.delete(cb);
        };
      },
      setState(patch) {
        const cur = record.state;
        if (typeof cur !== "object" || cur === null) {
          console.warn(
            `[desktop-mode/shared-store:${key}] setState called on a primitive store; use the state setter instead.`
          );
          return;
        }
        Object.assign(cur, patch);
        handle.notify();
      },
      reset() {
        const fresh = record.rebuild();
        const cur = record.state;
        if (typeof cur === "object" && cur !== null && typeof fresh === "object" && fresh !== null) {
          const target = cur;
          for (const k of Object.keys(target)) {
            delete target[k];
          }
          Object.assign(target, fresh);
        } else {
          record.state = fresh;
        }
        record.listeners.clear();
      }
    };
    return handle;
  }
  async function loadPixi() {
    const wp = window.wp;
    const fn = wp?.desktop?.loadModules;
    if (typeof fn !== "function") {
      throw new Error(
        "wp.desktop.loadModules is not available — main shell may not have booted yet."
      );
    }
    await fn(["pixijs"]);
  }
  const wpBeatStore = createSharedStore(
    "desktop-mode/heartbeat-widget/wp-beats",
    () => ({
      lastTickAt: 0,
      lastSendAt: 0,
      intervalSecs: 15,
      tickSeq: 0,
      booted: false
    })
  );
  function bootWpBeatTracker() {
    const s = wpBeatStore;
    if (s.state.booted) {
      return;
    }
    s.state.booted = true;
    s.state.intervalSecs = wpHeartbeatInterval();
    s.state.lastTickAt = performance.now();
    const jq = window.jQuery;
    if (!jq) {
      return;
    }
    const $doc = jq(document);
    $doc.on("heartbeat-send", () => {
      s.state.lastSendAt = performance.now();
    });
    $doc.on("heartbeat-tick", () => {
      s.state.lastTickAt = performance.now();
      s.state.intervalSecs = wpHeartbeatInterval();
      s.state.tickSeq += 1;
      s.notify();
    });
  }
  const HEART_PALETTE = {
    rim: 6950693,
    bright: 16731501,
    hi: 16754104
  };
  const HEART_COLOR_REST = HEART_PALETTE.bright;
  const HEART_COLOR_BEAT = HEART_PALETTE.hi;
  const HEART_SIZE = 52;
  const mount = async (container, ctx) => {
    try {
      await loadPixi();
    } catch (e) {
      renderFallback(container, e.message);
      return () => void 0;
    }
    return mountWithPixi(container, ctx);
  };
  function logoUrl(ctx) {
    const base = (ctx?.pluginUrl ?? "").replace(/\/+$/, "");
    return `${base}/assets/images/wp-logo.png`;
  }
  function renderFallback(container, message) {
    container.classList.add("desktop-mode-widget-heartbeat");
    container.classList.add("desktop-mode-widget-heartbeat--fallback");
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-widget-heartbeat__fallback";
    wrap.textContent = message || "Could not load animation engine.";
    container.appendChild(wrap);
  }
  const FRAME_HEIGHT_WITH_HEART = 230;
  const FRAME_HEIGHT_NO_HEART = 88;
  async function mountWithPixi(container, ctx) {
    const pixi = window.PIXI;
    if (!pixi) {
      renderFallback(container, "PIXI not available.");
      return () => void 0;
    }
    container.classList.add("desktop-mode-widget-heartbeat");
    let showHeart = ctx.storage.get("showHeart") ?? true;
    if (!showHeart) {
      container.classList.add("desktop-mode-widget-heartbeat--no-heart");
    }
    const stage = document.createElement("div");
    stage.className = "desktop-mode-widget-heartbeat__stage";
    container.appendChild(stage);
    const meta = document.createElement("div");
    meta.className = "desktop-mode-widget-heartbeat__meta";
    const label = document.createElement("div");
    label.className = "desktop-mode-widget-heartbeat__label";
    label.textContent = "Next beat in";
    meta.appendChild(label);
    const remaining = document.createElement("div");
    remaining.className = "desktop-mode-widget-heartbeat__remaining";
    remaining.textContent = "—";
    meta.appendChild(remaining);
    container.appendChild(meta);
    const bar = document.createElement("div");
    bar.className = "desktop-mode-widget-heartbeat__bar";
    const fill = document.createElement("div");
    fill.className = "desktop-mode-widget-heartbeat__bar-fill";
    bar.appendChild(fill);
    container.appendChild(bar);
    const app = new pixi.Application();
    await app.init({
      resizeTo: stage,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });
    stage.appendChild(app.canvas);
    const halo = buildHalo(pixi);
    const { view: heart, body: heartBody } = buildHeart(pixi);
    const logo = buildLogoSprite(pixi, logoUrl(ctx));
    app.stage.addChild(halo);
    app.stage.addChild(heart);
    heart.addChild(logo);
    const centre = () => {
      halo.x = app.screen.width / 2;
      halo.y = app.screen.height / 2;
      heart.x = app.screen.width / 2;
      heart.y = app.screen.height / 2;
    };
    centre();
    const ro = new ResizeObserver(() => centre());
    ro.observe(stage);
    bootWpBeatTracker();
    let pulseAccum = 0;
    let bigBeatT = 0;
    let glow = 0;
    let lastSeenSeq = wpBeatStore.state.tickSeq;
    const unsubscribe = wpBeatStore.subscribe((s) => {
      if (s.tickSeq !== lastSeenSeq) {
        lastSeenSeq = s.tickSeq;
        bigBeatT = 1;
        glow = 1;
      }
    });
    const jq = window.jQuery;
    let simHandle = null;
    if (!jq) {
      simHandle = setInterval(() => {
        wpBeatStore.state.lastTickAt = performance.now();
        wpBeatStore.state.tickSeq += 1;
        wpBeatStore.notify();
      }, wpBeatStore.state.intervalSecs * 1e3);
    }
    const detach = () => {
      unsubscribe();
      if (simHandle !== null) {
        clearInterval(simHandle);
      }
    };
    const tick = () => {
      const dt = app.ticker.deltaMS / 1e3;
      pulseAccum += dt;
      const restPhase = pulseAccum / 4 * Math.PI * 2;
      const restingScaleBase = 1 + 8e-3 * Math.sin(restPhase);
      let restingScale = restingScaleBase;
      let squishX = 0;
      let squishY = 0;
      if (bigBeatT > 0) {
        bigBeatT = Math.max(0, bigBeatT - dt / 0.9);
        const t = 1 - bigBeatT;
        let env;
        if (t < 0.1) {
          env = 0.55 * (t / 0.1);
        } else if (t < 0.28) {
          env = 0.55 - 0.5 * ((t - 0.1) / 0.18);
        } else if (t < 0.55) {
          env = 0.05 + 0.1 * Math.sin((t - 0.28) / 0.27 * Math.PI);
        } else {
          const k = (t - 0.55) / 0.45;
          env = 0.05 * (1 - k) * Math.exp(-2.5 * k);
        }
        restingScale += env;
        if (t < 0.2) {
          const sP = Math.sin(t / 0.2 * Math.PI);
          squishX = 0.1 * sP;
          squishY = -0.05 * sP;
        }
      }
      heart.scale.x = restingScale * (1 + squishX);
      heart.scale.y = restingScale * (1 + squishY);
      glow = Math.max(0, glow - dt / 1.2);
      halo.alpha = 0.1 + glow * 0.55;
      const haloScale = 1 + glow * 0.15;
      halo.scale.set(haloScale);
      heartBody.tint = lerpColor(
        HEART_COLOR_REST,
        HEART_COLOR_BEAT,
        Math.min(1, glow * 0.6 + bigBeatT * 0.4)
      );
      const elapsed = (performance.now() - wpBeatStore.state.lastTickAt) / 1e3;
      const intervalSecs = wpBeatStore.state.intervalSecs;
      const progress = clamp(elapsed / Math.max(intervalSecs, 1), 0, 1);
      fill.style.width = `${(progress * 100).toFixed(1)}%`;
      const remainSecs = Math.max(0, intervalSecs - elapsed);
      remaining.textContent = `${remainSecs.toFixed(1)}s`;
    };
    app.ticker.add(tick);
    const resyncCanvasToStage = () => {
      requestAnimationFrame(() => {
        try {
          app.resize?.();
        } catch (_e) {
          try {
            const sw = stage.clientWidth;
            const sh = stage.clientHeight;
            if (sw > 0 && sh > 0) {
              app.renderer.resize(sw, sh);
            }
          } catch (_err) {
          }
        }
        centre();
      });
    };
    const onContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openHeartbeatMenu(e, showHeart, (next) => {
        showHeart = next;
        ctx.storage.set("showHeart", next);
        applyHeartVisibility(container, next);
        if (next) {
          resyncCanvasToStage();
        }
      });
    };
    container.addEventListener("contextmenu", onContextMenu);
    applyHeartVisibility(container, showHeart);
    if (showHeart) {
      resyncCanvasToStage();
    }
    return () => {
      container.removeEventListener("contextmenu", onContextMenu);
      detach();
      ro.disconnect();
      app.ticker.remove(tick);
      try {
        app.canvas?.remove();
      } catch {
      }
      container.classList.remove("desktop-mode-widget-heartbeat");
      container.classList.remove("desktop-mode-widget-heartbeat--no-heart");
    };
  }
  function applyHeartVisibility(container, showHeart) {
    container.classList.toggle("desktop-mode-widget-heartbeat--no-heart", !showHeart);
    const card = container.closest(".desktop-mode-widgets__card");
    if (card) {
      card.classList.add("desktop-mode-widgets__card--heartbeat");
      const h = showHeart ? FRAME_HEIGHT_WITH_HEART : FRAME_HEIGHT_NO_HEART;
      card.style.height = `${h}px`;
    }
  }
  function openHeartbeatMenu(e, showHeart, onToggle) {
    document.querySelectorAll(".desktop-mode-widget-heartbeat__menu").forEach((el) => el.remove());
    const menu = document.createElement("wpd-context-menu");
    menu.className = "desktop-mode-widget-heartbeat__menu";
    menu.setAttribute("open", "");
    menu.style.position = "fixed";
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.style.zIndex = "10500";
    const opt = document.createElement("wpd-context-menu-option");
    opt.setAttribute("value", "show-heart");
    if (showHeart) {
      opt.setAttribute("checked", "");
    }
    opt.textContent = "Show heart";
    menu.appendChild(opt);
    const close = () => {
      menu.remove();
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onOutside = (ev) => {
      if (!menu.contains(ev.target)) {
        close();
      }
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        close();
      }
    };
    menu.addEventListener("wpd-context-menu-pick", () => {
      onToggle(!showHeart);
      close();
    });
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(4, window.innerWidth - rect.width - 8)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(4, window.innerHeight - rect.height - 8)}px`;
    }
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }
  function buildHalo(pixi) {
    const g = new pixi.Graphics();
    const radii = [HEART_SIZE * 1.2, HEART_SIZE * 1.05, HEART_SIZE * 0.85];
    const alphas = [0.12, 0.18, 0.28];
    radii.forEach((r, i) => {
      g.circle(0, 0, r);
      g.fill({ color: HEART_COLOR_BEAT, alpha: alphas[i] });
    });
    g.alpha = 0.1;
    return g;
  }
  function heartPath(scaleMul = 1) {
    const samples = 240;
    const pts = [];
    const s = HEART_SIZE / 17 * scaleMul;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples * Math.PI * 2;
      const x = 16 * 1.08 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push(x * s, y * s);
    }
    return pts;
  }
  function buildHeart(pixi) {
    const wrap = new pixi.Container();
    const bounds = heartBoundingY();
    const shadow = new pixi.Graphics();
    shadow.poly(heartPath(1.05));
    shadow.fill({ color: 0, alpha: 0.55 });
    shadow.y = 5;
    shadow.alpha = 0.55;
    wrap.addChild(shadow);
    const gradientCanvas = makeGradientCanvas();
    const gradientTexture = pixi.Texture.from(gradientCanvas);
    const gradientSprite = new pixi.Sprite(gradientTexture);
    const heartHeight = bounds.maxY - bounds.minY;
    const overscan = HEART_SIZE * 2.5;
    gradientSprite.width = overscan;
    gradientSprite.height = heartHeight;
    gradientSprite.x = -overscan / 2;
    gradientSprite.y = bounds.minY;
    gradientSprite.tint = HEART_COLOR_REST;
    const mask = new pixi.Graphics();
    mask.poly(heartPath(1));
    mask.fill({ color: 16777215, alpha: 1 });
    gradientSprite.mask = mask;
    wrap.addChild(mask);
    wrap.addChild(gradientSprite);
    const hi1 = new pixi.Graphics();
    hi1.ellipse(
      -HEART_SIZE * 0.32,
      -HEART_SIZE * 0.5,
      HEART_SIZE * 0.18,
      HEART_SIZE * 0.1
    );
    hi1.fill({ color: 16777215, alpha: 0.45 });
    hi1.rotation = -0.5;
    wrap.addChild(hi1);
    const hi2 = new pixi.Graphics();
    hi2.ellipse(
      HEART_SIZE * 0.2,
      -HEART_SIZE * 0.38,
      HEART_SIZE * 0.09,
      HEART_SIZE * 0.05
    );
    hi2.fill({ color: 16777215, alpha: 0.22 });
    hi2.rotation = 0.4;
    wrap.addChild(hi2);
    const outline = new pixi.Graphics();
    outline.poly(heartPath(1));
    outline.stroke({ color: 16777215, alpha: 0.18, width: 1 });
    wrap.addChild(outline);
    return { view: wrap, body: gradientSprite };
  }
  function heartBoundingY() {
    const pts = heartPath(1);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < pts.length; i += 2) {
      if (pts[i] < minY) {
        minY = pts[i];
      }
      if (pts[i] > maxY) {
        maxY = pts[i];
      }
    }
    return { minY, maxY };
  }
  function makeGradientCanvas() {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 512;
    const ctx = c.getContext("2d");
    if (!ctx) {
      return c;
    }
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#ffd6e3");
    grad.addColorStop(0.18, "#ff8ba3");
    grad.addColorStop(0.42, "#ff4d6d");
    grad.addColorStop(0.72, "#9a1f3d");
    grad.addColorStop(1, "#3d061a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    return c;
  }
  function buildLogoSprite(pixi, url) {
    const wrap = new pixi.Container();
    wrap.y = HEART_SIZE * 0.08;
    const shadow = new pixi.Sprite();
    shadow.anchor.set(0.5);
    shadow.tint = HEART_PALETTE.rim;
    shadow.alpha = 0.6;
    shadow.y = HEART_SIZE * 0.035;
    wrap.addChild(shadow);
    const mark = new pixi.Sprite();
    mark.anchor.set(0.5);
    wrap.addChild(mark);
    const targetWidth = HEART_SIZE * 0.92;
    const img = new Image();
    img.src = url;
    img.decode().then(() => {
      const resolution = Math.min(window.devicePixelRatio || 1, 2);
      const widthPx = Math.ceil(targetWidth * resolution * 1.7);
      const canvas = rasterizeLogo(img, widthPx);
      const texture = pixi.Texture.from(canvas);
      const scale = targetWidth / canvas.width;
      shadow.texture = texture;
      shadow.scale.set(scale);
      mark.texture = texture;
      mark.scale.set(scale);
    }).catch(() => {
    });
    return wrap;
  }
  function rasterizeLogo(img, widthPx) {
    let src = img;
    let w2 = img.naturalWidth;
    let h = img.naturalHeight;
    while (w2 / 2 >= widthPx * 2) {
      w2 = Math.round(w2 / 2);
      h = Math.round(h / 2);
      const step = document.createElement("canvas");
      step.width = w2;
      step.height = h;
      const g2 = step.getContext("2d");
      if (!g2) {
        break;
      }
      g2.imageSmoothingEnabled = true;
      g2.imageSmoothingQuality = "high";
      g2.drawImage(src, 0, 0, w2, h);
      src = step;
    }
    const out = document.createElement("canvas");
    out.width = Math.max(1, widthPx);
    out.height = Math.max(
      1,
      Math.round(widthPx * img.naturalHeight / Math.max(1, img.naturalWidth))
    );
    const g = out.getContext("2d");
    if (g) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(src, 0, 0, out.width, out.height);
    }
    return out;
  }
  function wpHeartbeatInterval() {
    const wp = window.wp;
    try {
      const fn = wp?.heartbeat?.interval;
      if (typeof fn === "function") {
        const v = Number(fn());
        if (Number.isFinite(v) && v > 0) {
          return v;
        }
      }
    } catch (e) {
    }
    return 15;
  }
  function lerpColor(a, b, t) {
    const ar = Math.trunc(a / 65536) % 256;
    const ag = Math.trunc(a / 256) % 256;
    const ab = a % 256;
    const br = Math.trunc(b / 65536) % 256;
    const bg = Math.trunc(b / 256) % 256;
    const bb = b % 256;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bv = Math.round(ab + (bb - ab) * t);
    return r * 65536 + g * 256 + bv;
  }
  function clamp(v, lo, hi) {
    if (v < lo) {
      return lo;
    }
    if (v > hi) {
      return hi;
    }
    return v;
  }
  const w = window;
  w.desktopModeWidgets = w.desktopModeWidgets || {};
  w.desktopModeWidgets["desktop-mode/heartbeat"] = mount;
})();
