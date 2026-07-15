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
    const baseHeaders = typeof Request !== "undefined" && input instanceof Request ? input.headers : void 0;
    const headers = new Headers(baseHeaders ?? {});
    if (headers.has(NONCE_HEADER)) {
      return init;
    }
    headers.set(NONCE_HEADER, nonce);
    return { ...{}, headers };
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
  const AGE_SATURATION_DAYS = 3650;
  const SAPLING_CLOCK_PER_DAY = 1 / 250;
  function clamp01$2(v) {
    return Math.min(1, Math.max(0, v));
  }
  function sat(v, k) {
    return v <= 0 ? 0 : v / (v + k);
  }
  function ageCurve(days) {
    if (days <= 0) {
      return 0;
    }
    const log01 = clamp01$2(
      Math.log1p(days) / Math.log1p(AGE_SATURATION_DAYS)
    );
    return Math.min(log01, days * SAPLING_CLOCK_PER_DAY);
  }
  function buildHormones(snapshot) {
    const posts = Math.max(0, snapshot.totalPosts);
    const comments = Math.max(0, snapshot.totalComments);
    const traffic = Math.max(0, snapshot.traffic);
    const users = Math.max(0, snapshot.activeUsers);
    const performance = clamp01$2(snapshot.performance);
    const energy = 0.35 * sat(posts, 120) + 0.25 * sat(comments, 400) + 0.25 * sat(traffic, 2e3) + 0.15 * sat(users, 8);
    const vigor01 = clamp01$2(energy * (0.6 + 0.4 * performance));
    const bloom01 = clamp01$2(sat(comments / Math.max(1, posts), 4));
    const wind01 = clamp01$2(0.2 + 0.8 * sat(traffic, 5e3));
    const pages = Math.max(0, snapshot.totalPages);
    return {
      age01: ageCurve(snapshot.siteAgeDays),
      vigor01,
      foliage01: clamp01$2(sat(posts, 150)),
      health01: clamp01$2(snapshot.seoHealth),
      bloom01,
      wind01,
      // Pages are the site's evergreen scaffolding → structural mass.
      structure01: clamp01$2(sat(pages, 40)),
      // Performance → how vividly the canopy holds itself up.
      vitality01: performance,
      spark: Math.min(40, Math.round(users))
    };
  }
  const KEYFRAMES = [
    { h: 0, top: 658970, mid: 856614, bottom: 1448494, star: 1, light: 0.12 },
    { h: 5, top: 1712182, mid: 3813194, bottom: 7031386, star: 0.8, light: 0.3 },
    { h: 6.5, top: 3691647, mid: 11565151, bottom: 15773808, star: 0.15, light: 0.62 },
    { h: 9, top: 6001622, mid: 10275054, bottom: 14478584, star: 0, light: 0.9 },
    { h: 13, top: 4163284, mid: 8567018, bottom: 13165813, star: 0, light: 1 },
    { h: 16, top: 5932736, mid: 11186898, bottom: 15258796, star: 0, light: 0.92 },
    { h: 18.5, top: 2767466, mid: 10115706, bottom: 15762766, star: 0.15, light: 0.55 },
    { h: 20, top: 1712960, mid: 4863328, bottom: 9067107, star: 0.55, light: 0.35 },
    { h: 22, top: 856608, mid: 1317424, bottom: 2238526, star: 0.9, light: 0.18 }
  ];
  function clamp01$1(v) {
    return Math.min(1, Math.max(0, v));
  }
  function lerpColor$1(a, b, t) {
    const ar = Math.floor(a / 65536) % 256;
    const ag = Math.floor(a / 256) % 256;
    const ab = a % 256;
    const br = Math.floor(b / 65536) % 256;
    const bg = Math.floor(b / 256) % 256;
    const bb = b % 256;
    return Math.round(ar + (br - ar) * t) * 65536 + Math.round(ag + (bg - ag) * t) * 256 + Math.round(ab + (bb - ab) * t);
  }
  function smoothRamp(x, edge0, edge1) {
    const t = clamp01$1((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  }
  function skyForTime(hours) {
    const h = (hours % 24 + 24) % 24;
    let a = KEYFRAMES[KEYFRAMES.length - 1];
    let b = KEYFRAMES[0];
    let span = KEYFRAMES[0].h + 24 - a.h;
    let local = h < KEYFRAMES[0].h ? h + 24 - a.h : h - a.h;
    for (let i = 0; i < KEYFRAMES.length - 1; i++) {
      if (h >= KEYFRAMES[i].h && h < KEYFRAMES[i + 1].h) {
        a = KEYFRAMES[i];
        b = KEYFRAMES[i + 1];
        span = b.h - a.h;
        local = h - a.h;
        break;
      }
    }
    const t = span <= 0 ? 0 : clamp01$1(local / span);
    const sunT = clamp01$1((h - 5.5) / 13);
    const sunAlpha = smoothRamp(h, 5.5, 7) * (1 - smoothRamp(h, 17.2, 18.8));
    const moonH = (h - 18 + 24) % 24 / 12;
    const moonAlpha = clamp01$1(
      Math.max(smoothRamp(h, 17.5, 19.5), 1 - smoothRamp(h, 4.5, 6.5))
    );
    return {
      top: lerpColor$1(a.top, b.top, t),
      mid: lerpColor$1(a.mid, b.mid, t),
      bottom: lerpColor$1(a.bottom, b.bottom, t),
      starAlpha: a.star + (b.star - a.star) * t,
      light01: a.light + (b.light - a.light) * t,
      sunAlpha,
      moonAlpha,
      sunX01: sunT,
      sunY01: 0.86 - Math.sin(sunT * Math.PI) * 0.64,
      moonX01: moonH,
      moonY01: 0.82 - Math.sin(moonH * Math.PI) * 0.6,
      starAngle: h / 24 * Math.PI * 2
    };
  }
  function currentHour() {
    const override = window.desktopModeLivingTreeHourOverride;
    if (typeof override === "number" && Number.isFinite(override)) {
      return (override % 24 + 24) % 24;
    }
    const now = /* @__PURE__ */ new Date();
    return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  }
  function buildGradientTexture(pixi, top, mid, bottom) {
    const w = 8;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, hex(top));
    gradient.addColorStop(0.55, hex(mid));
    gradient.addColorStop(1, hex(bottom));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    return pixi.Texture.from(canvas);
  }
  function buildDiscTexture(pixi) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const c = size / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.32, "rgba(255, 255, 255, 0.95)");
    gradient.addColorStop(0.42, "rgba(255, 255, 255, 0.4)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return pixi.Texture.from(canvas);
  }
  function buildEarthTexture(pixi) {
    const w = 8;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.22, "rgba(255, 255, 255, 0.85)");
    gradient.addColorStop(0.45, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 1)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    return pixi.Texture.from(canvas);
  }
  const EARTH_DAY = 3820076;
  const EARTH_NIGHT = 1053964;
  function buildStarTexture(pixi) {
    const size = 8;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const c = size / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.25, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.15)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return pixi.Texture.from(canvas);
  }
  function buildBrightStarTexture(pixi) {
    const size = 24;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const c = size / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, 4);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.5)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c, 1);
    ctx.lineTo(c, size - 1);
    ctx.moveTo(1, c);
    ctx.lineTo(size - 1, c);
    ctx.stroke();
    return pixi.Texture.from(canvas);
  }
  function buildCloudTexture(pixi) {
    const w = 280;
    const h = 190;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const lobes = [
      [0.36, 0.52, 0.19, 0.85],
      [0.5, 0.42, 0.22, 0.9],
      [0.64, 0.5, 0.19, 0.85],
      [0.44, 0.58, 0.17, 0.8],
      [0.58, 0.6, 0.15, 0.75],
      [0.28, 0.6, 0.13, 0.6],
      [0.72, 0.6, 0.12, 0.55]
    ];
    for (const [lx, ly, lr, la] of lobes) {
      const radius = lr * h;
      const gradient = ctx.createRadialGradient(
        lx * w,
        ly * h,
        1,
        lx * w,
        ly * h,
        radius
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${la})`);
      gradient.addColorStop(0.6, `rgba(255, 255, 255, ${la * 0.45})`);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
    return pixi.Texture.from(canvas);
  }
  function buildStreakTexture(pixi) {
    const w = 72;
    const h = 4;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.75, "rgba(255, 255, 255, 0.55)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 1)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    return pixi.Texture.from(canvas);
  }
  const STAR_COUNT = 650;
  const BRIGHT_STAR_RATIO = 0.12;
  const CLOUD_COUNT = 5;
  const SHOOTING_STAR_POOL = 2;
  const SHOOTING_STARS_PER_MINUTE = 2;
  class SkyLayer {
    constructor(pixi, parent) {
      this.stars = [];
      this.shooting = [];
      this.clouds = [];
      this.width = 1;
      this.height = 1;
      this.groundLine = 1;
      this.starAlpha = 0;
      this.cloudLight = 1;
      this.lastTickT = 0;
      this.pixi = pixi;
      this.root = new pixi.Container();
      parent.addChild(this.root);
      this.gradientTexture = buildGradientTexture(pixi, 856614, 1317424, 2238526);
      this.gradient = new pixi.Sprite(this.gradientTexture);
      this.root.addChild(this.gradient);
      this.discTexture = buildDiscTexture(pixi);
      this.starTexture = buildStarTexture(pixi);
      this.brightStarTexture = buildBrightStarTexture(pixi);
      this.cloudTexture = buildCloudTexture(pixi);
      this.streakTexture = buildStreakTexture(pixi);
      this.starRoot = new pixi.Container();
      this.root.addChild(this.starRoot);
      for (let i = 0; i < STAR_COUNT; i++) {
        const bright = Math.random() < BRIGHT_STAR_RATIO;
        const sprite = new pixi.Sprite(
          bright ? this.brightStarTexture : this.starTexture
        );
        sprite.anchor.set(0.5);
        const scale = bright ? 0.6 + Math.random() * 0.4 : 0.3 + Math.random() * 0.42;
        sprite.scale.set(scale);
        this.starRoot.addChild(sprite);
        this.stars.push({
          sprite,
          theta: Math.random() * Math.PI * 2,
          r01: Math.sqrt(Math.random()),
          phase: Math.random() * Math.PI * 2,
          baseAlpha: bright ? 0.9 + Math.random() * 0.1 : 0.55 + Math.random() * 0.45,
          twinkle: 0.4 + Math.random() * 2.2
        });
      }
      for (let i = 0; i < SHOOTING_STAR_POOL; i++) {
        const sprite = new pixi.Sprite(this.streakTexture);
        sprite.anchor.set(0.5);
        sprite.visible = false;
        this.root.addChild(sprite);
        this.shooting.push({
          sprite,
          active: false,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          life: 0
        });
      }
      this.earthTexture = buildEarthTexture(pixi);
      this.earth = new pixi.Sprite(this.earthTexture);
      this.earth.tint = EARTH_NIGHT;
      this.root.addChild(this.earth);
      this.cloudRoot = new pixi.Container();
      this.root.addChild(this.cloudRoot);
      for (let i = 0; i < CLOUD_COUNT; i++) {
        const sprite = new pixi.Sprite(this.cloudTexture);
        sprite.anchor.set(0.5);
        const stretch = 0.9 + Math.random() * 1.4;
        sprite.scale.x = stretch;
        sprite.scale.y = 0.7 + Math.random() * 0.5;
        this.cloudRoot.addChild(sprite);
        this.clouds.push({
          sprite,
          y01: 0.06 + Math.random() * 0.38,
          speed: 3 + Math.random() * 5,
          baseAlpha: 0.35 + Math.random() * 0.3,
          offset01: (i + Math.random()) / CLOUD_COUNT,
          width: 220 * stretch
        });
      }
      this.sun = new pixi.Sprite(this.discTexture);
      this.sun.anchor.set(0.5);
      this.moon = new pixi.Sprite(this.discTexture);
      this.moon.anchor.set(0.5);
      this.root.addChild(this.sun);
      this.root.addChild(this.moon);
      this.layoutClouds(0);
    }
    /**
     * Position the clouds for time `t` — stateless (pure function of t)
     * so pauses, reduced motion, and resizes all land on a valid layout.
     */
    layoutClouds(t) {
      for (const cloud of this.clouds) {
        const span = this.width + cloud.width * 2;
        const travelled = (cloud.offset01 * span + t * cloud.speed * (this.width / 1500)) % span;
        cloud.sprite.x = travelled - cloud.width;
        cloud.sprite.y = cloud.y01 * this.height;
        cloud.sprite.alpha = cloud.baseAlpha * this.cloudLight;
      }
    }
    /**
     * Resize to cover the canvas and reposition everything.
     *
     * @param width      Canvas width (CSS px).
     * @param height     Canvas height (CSS px).
     * @param groundLine Y of the tree's ground line; the earth band's
     *                   soft top edge blends in just above it. Defaults
     *                   near the bottom.
     */
    resize(width, height, groundLine) {
      this.width = Math.max(1, width);
      this.height = Math.max(1, height);
      this.groundLine = groundLine ?? this.height * 0.94;
      this.gradient.scale.x = this.width / 8;
      this.gradient.scale.y = this.height / 256;
      const bandTop = this.groundLine - 10;
      this.earth.x = 0;
      this.earth.y = bandTop;
      this.earth.scale.x = this.width / 8;
      this.earth.scale.y = Math.max(0.4, (this.height - bandTop + 8) / 128);
      this.layoutStars();
      this.layoutClouds(0);
    }
    /**
     * Place the star field as a disc around the celestial pole — a point
     * below the horizon's centre, so rotating the field arcs the stars
     * east → west overhead exactly like the sun. The container's pivot
     * sits on the pole; `applyState` only touches `rotation`.
     */
    layoutStars() {
      const poleX = this.width * 0.5;
      const poleY = this.height * 1.3;
      const fieldRadius = Math.hypot(this.width * 0.5, poleY) + 40;
      this.starRoot.pivot?.set(poleX, poleY);
      this.starRoot.x = poleX;
      this.starRoot.y = poleY;
      for (const star of this.stars) {
        star.sprite.x = poleX + Math.cos(star.theta) * star.r01 * fieldRadius;
        star.sprite.y = poleY + Math.sin(star.theta) * star.r01 * fieldRadius;
      }
    }
    /** Apply a sky state — colours, luminaries, star opacity (slow cadence). */
    applyState(state) {
      const next = buildGradientTexture(this.pixi, state.top, state.mid, state.bottom);
      this.gradient.texture = next;
      this.gradientTexture.destroy(true);
      this.gradientTexture = next;
      this.gradient.scale.x = this.width / 8;
      this.gradient.scale.y = this.height / 256;
      this.starAlpha = state.starAlpha;
      this.starRoot.alpha = state.starAlpha;
      this.starRoot.rotation = state.starAngle;
      this.earth.tint = lerpColor$1(EARTH_NIGHT, EARTH_DAY, state.light01);
      this.cloudLight = 0.12 + 0.88 * state.light01;
      for (const cloud of this.clouds) {
        cloud.sprite.tint = lerpColor$1(3752286, 16777215, state.light01);
        cloud.sprite.alpha = cloud.baseAlpha * this.cloudLight;
      }
      const discSize = Math.max(70, Math.min(this.width, this.height) * 0.16);
      const altitude01 = Math.min(
        1,
        Math.max(0, (0.86 - state.sunY01) / 0.64)
      );
      this.sun.tint = lerpColor$1(16755550, 16773828, altitude01);
      this.sun.scale.set(discSize * 1.4 / 128);
      this.sun.x = state.sunX01 * this.width;
      this.sun.y = state.sunY01 * this.height;
      this.sun.alpha = state.sunAlpha;
      this.moon.tint = 15922431;
      this.moon.scale.set(discSize / 128);
      this.moon.x = state.moonX01 * this.width;
      this.moon.y = state.moonY01 * this.height;
      this.moon.alpha = state.moonAlpha * 0.95;
    }
    /**
     * Twinkle the stars, drift the clouds, fly the shooting stars
     * (cheap; every frame).
     */
    tick(t) {
      this.layoutClouds(t);
      if (this.starAlpha <= 0.01) {
        this.lastTickT = t;
        return;
      }
      const dt = Math.min(0.1, Math.max(0, t - this.lastTickT));
      this.lastTickT = t;
      for (const star of this.stars) {
        const flick = 0.8 + 0.2 * Math.sin(t * star.twinkle + star.phase);
        star.sprite.alpha = star.baseAlpha * flick;
      }
      if (this.starAlpha > 0.3 && Math.random() < dt * (SHOOTING_STARS_PER_MINUTE / 60)) {
        const meteor = this.shooting.find((m) => !m.active);
        if (meteor) {
          meteor.active = true;
          meteor.life = 0.5;
          meteor.x = this.width * (0.1 + Math.random() * 0.8);
          meteor.y = this.height * (0.05 + Math.random() * 0.3);
          const angle = Math.PI * 0.25 + Math.random() * Math.PI * 0.5 + (Math.random() < 0.5 ? Math.PI * 0.5 : 0);
          const speed = 900 + Math.random() * 500;
          meteor.vx = Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1);
          meteor.vy = Math.abs(Math.sin(angle)) * speed * 0.45;
          meteor.sprite.rotation = Math.atan2(meteor.vy, meteor.vx);
          meteor.sprite.visible = true;
        }
      }
      for (const meteor of this.shooting) {
        if (!meteor.active) {
          continue;
        }
        meteor.life -= dt;
        meteor.x += meteor.vx * dt;
        meteor.y += meteor.vy * dt;
        meteor.sprite.x = meteor.x;
        meteor.sprite.y = meteor.y;
        meteor.sprite.alpha = Math.max(0, meteor.life / 0.5) * this.starAlpha;
        if (meteor.life <= 0 || meteor.y > this.groundLine) {
          meteor.active = false;
          meteor.sprite.visible = false;
        }
      }
    }
    /** Release the sky's own textures. */
    destroy() {
      this.root.destroy({ children: true });
      try {
        this.gradientTexture.destroy(true);
        this.earthTexture.destroy(true);
        this.discTexture.destroy(true);
        this.starTexture.destroy(true);
        this.brightStarTexture.destroy(true);
        this.cloudTexture.destroy(true);
        this.streakTexture.destroy(true);
      } catch {
      }
    }
  }
  const TUNER_CLICK_THRESHOLD = 20;
  const TUNER_CLICK_WINDOW_MS = 2500;
  const SLIDER_DEFS = [
    { key: "siteAgeDays", label: "Site age (days)", min: 0, max: 7300, step: 1 },
    { key: "totalPosts", label: "Posts", min: 0, max: 3e3, step: 1 },
    { key: "totalPages", label: "Pages", min: 0, max: 300, step: 1 },
    { key: "totalCategories", label: "Categories", min: 0, max: 300, step: 1 },
    { key: "totalTags", label: "Tags", min: 0, max: 800, step: 1 },
    { key: "totalComments", label: "Comments", min: 0, max: 8e3, step: 1 },
    { key: "activeUsers", label: "Online users", min: 0, max: 40, step: 1 },
    { key: "traffic", label: "Traffic (views)", min: 0, max: 2e4, step: 50 },
    { key: "seoHealth", label: "SEO health", min: 0, max: 1, step: 0.01 },
    { key: "performance", label: "Performance", min: 0, max: 1, step: 0.01 }
  ];
  function isDeveloperModeEnabled() {
    const api = window.wp?.desktop;
    try {
      return api?.getOsSettings?.().developerModeEnabled === true;
    } catch {
      return false;
    }
  }
  function createClickCounter(threshold, windowMs) {
    let count = 0;
    let last = 0;
    return {
      hit(now) {
        if (now - last > windowMs) {
          count = 0;
        }
        last = now;
        count++;
        if (count >= threshold) {
          count = 0;
          return true;
        }
        return false;
      },
      reset() {
        count = 0;
      }
    };
  }
  function isTrunkHit(lx, ly, env) {
    const halfWidth = Math.max(16, env.trunkBaseGirth * 3);
    return Math.abs(lx) <= halfWidth && ly <= 6 && ly >= -env.heightMax * 0.55;
  }
  function createTrunkClickGesture(opts) {
    const counter = createClickCounter(TUNER_CLICK_THRESHOLD, TUNER_CLICK_WINDOW_MS);
    const now = opts.now ?? Date.now;
    return (event) => {
      if (!opts.isEnabled()) {
        return;
      }
      const { lx, ly } = opts.toLocal(event.clientX, event.clientY);
      if (!opts.isHit(lx, ly)) {
        counter.reset();
        return;
      }
      if (counter.hit(now())) {
        opts.onTrigger();
      }
    };
  }
  function formatValue(def2, value) {
    return def2.step < 1 ? value.toFixed(2) : String(Math.round(value));
  }
  function hormoneLine(snapshot) {
    const h = buildHormones(snapshot);
    const f = (v) => v.toFixed(2);
    return `age ${f(h.age01)} · vigor ${f(h.vigor01)} · foliage ${f(h.foliage01)} · health ${f(h.health01)} · bloom ${f(h.bloom01)} · struct ${f(h.structure01)} · vitality ${f(h.vitality01)} · wind ${f(h.wind01)} · spark ${h.spark}`;
  }
  function formatHour(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    const hh = String((h + Math.floor(m / 60)) % 24).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  function openDebugPanel(opts) {
    const state = { ...opts.snapshot };
    let pending = null;
    const panel = document.createElement("div");
    panel.dataset.livingTreeTuner = "1";
    panel.style.cssText = [
      "position:fixed",
      "top:48px",
      "right:18px",
      "width:300px",
      "max-height:calc(100vh - 72px)",
      "overflow-y:auto",
      "box-sizing:border-box",
      "padding:14px 16px 16px",
      "background:rgba(13, 17, 26, 0.85)",
      "backdrop-filter:blur(14px)",
      "border:1px solid rgba(255, 255, 255, 0.14)",
      "border-radius:14px",
      "box-shadow:0 12px 40px rgba(0, 0, 0, 0.45)",
      "color:#e8ecf3",
      'font:12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      "pointer-events:auto",
      "z-index:2147483000"
    ].join(";");
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:2px";
    const title = document.createElement("strong");
    title.textContent = "🌳 Living Tree — DNA tuner";
    title.style.cssText = "font-size:13px";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "✕";
    closeButton.setAttribute("aria-label", "Close DNA tuner");
    closeButton.style.cssText = "background:none;border:0;color:#9aa3b2;cursor:pointer;font-size:14px;padding:2px 4px";
    header.appendChild(title);
    header.appendChild(closeButton);
    panel.appendChild(header);
    const note = document.createElement("div");
    note.textContent = "Debug preview only — nothing is saved.";
    note.style.cssText = "color:#9aa3b2;margin-bottom:8px";
    panel.appendChild(note);
    const hormones = document.createElement("div");
    hormones.style.cssText = "font-family:ui-monospace, Menlo, monospace;font-size:10.5px;color:#8fd3a8;margin-bottom:10px;word-break:break-word";
    hormones.textContent = hormoneLine(state);
    panel.appendChild(hormones);
    if (opts.onHourChange) {
      const onHourChange = opts.onHourChange;
      const row = document.createElement("label");
      row.style.cssText = "display:block;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255, 255, 255, 0.1)";
      const caption = document.createElement("div");
      caption.style.cssText = "display:flex;justify-content:space-between;align-items:center";
      const name = document.createElement("span");
      name.textContent = "Time of day";
      const right = document.createElement("span");
      right.style.cssText = "display:flex;align-items:center;gap:6px";
      const value = document.createElement("span");
      value.style.cssText = "color:#9aa3b2;font-variant-numeric:tabular-nums";
      const liveButton = document.createElement("button");
      liveButton.type = "button";
      liveButton.textContent = "live";
      liveButton.setAttribute("aria-label", "Follow the real clock again");
      liveButton.style.cssText = "background:rgba(255, 255, 255, 0.1);border:1px solid rgba(255, 255, 255, 0.2);border-radius:6px;color:#cfd6e0;cursor:pointer;font-size:10px;padding:1px 7px";
      right.appendChild(value);
      right.appendChild(liveButton);
      caption.appendChild(name);
      caption.appendChild(right);
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "24";
      input.step = "0.05";
      input.dataset.livingTreeHour = "1";
      input.value = String(opts.hour ?? 12);
      value.textContent = formatHour(Number(input.value));
      input.style.cssText = "width:100%;margin:2px 0 0;accent-color:#e8c56f";
      input.addEventListener("input", () => {
        value.textContent = formatHour(Number(input.value));
        onHourChange(Number(input.value));
      });
      liveButton.addEventListener("click", () => {
        onHourChange(null);
        input.value = String(currentHour());
        value.textContent = formatHour(Number(input.value));
      });
      row.appendChild(caption);
      row.appendChild(input);
      panel.appendChild(row);
    }
    const schedule = () => {
      if (pending !== null) {
        clearTimeout(pending);
      }
      pending = setTimeout(() => {
        pending = null;
        hormones.textContent = hormoneLine(state);
        opts.onChange({ ...state });
      }, 60);
    };
    for (const def2 of SLIDER_DEFS) {
      const row = document.createElement("label");
      row.style.cssText = "display:block;margin-bottom:8px";
      const caption = document.createElement("div");
      caption.style.cssText = "display:flex;justify-content:space-between";
      const name = document.createElement("span");
      name.textContent = def2.label;
      const value = document.createElement("span");
      value.style.cssText = "color:#9aa3b2;font-variant-numeric:tabular-nums";
      value.textContent = formatValue(def2, state[def2.key]);
      caption.appendChild(name);
      caption.appendChild(value);
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(def2.min);
      input.max = String(def2.max);
      input.step = String(def2.step);
      input.value = String(state[def2.key]);
      input.style.cssText = "width:100%;margin:2px 0 0;accent-color:#6fbf8f";
      input.addEventListener("input", () => {
        state[def2.key] = Number(input.value);
        value.textContent = formatValue(def2, state[def2.key]);
        schedule();
      });
      row.appendChild(caption);
      row.appendChild(input);
      panel.appendChild(row);
    }
    const dispose = () => {
      if (pending !== null) {
        clearTimeout(pending);
        pending = null;
      }
      panel.remove();
    };
    closeButton.addEventListener("click", () => {
      dispose();
      opts.onClose();
    });
    document.body.appendChild(panel);
    return dispose;
  }
  const LEVELS = [
    { days: 30, depth: 2 },
    { days: 180, depth: 4 },
    { days: 730, depth: 6 },
    { days: 1825, depth: 8 },
    { days: 3650, depth: 10 }
  ];
  const DEPTH_ANCIENT = 12;
  const MATURE_HEIGHT = 900;
  const MATURE_CROWN_RADIUS = 380;
  const MATURE_TRUNK_GIRTH = 26.5;
  const MATURE_ATTRACTOR_BUDGET = 860;
  function maxDepthForAge(age01) {
    for (const level of LEVELS) {
      if (age01 < ageCurve(level.days)) {
        return level.depth;
      }
    }
    return DEPTH_ANCIENT;
  }
  function trunkGirthForAge(age01) {
    return 2.5 + (MATURE_TRUNK_GIRTH - 2.5) * Math.min(1, Math.max(0, age01));
  }
  function revealCountForAge(total, age01) {
    const a = Math.min(1, Math.max(0, age01));
    return Math.max(2, Math.min(total, 2 + Math.round((total - 2) * Math.pow(a, 1.35))));
  }
  function buildEnvelope(age01, vigor01, rng) {
    const heightMax = MATURE_HEIGHT * (0.88 + rng() * 0.24);
    const crownRadius = MATURE_CROWN_RADIUS * (0.82 + rng() * 0.36);
    return {
      heightMax,
      crownRadius,
      trunkBaseGirth: MATURE_TRUNK_GIRTH,
      maxDepth: DEPTH_ANCIENT,
      attractorBudget: MATURE_ATTRACTOR_BUDGET
    };
  }
  function sampleAttractors(env, count, rng) {
    const out = [];
    const crownHeight = env.heightMax * 0.72;
    const cy = -(env.heightMax - crownHeight / 2);
    const rx = env.crownRadius;
    const ry = crownHeight / 2;
    let guard = 0;
    while (out.length < count && guard < count * 40) {
      guard++;
      const x = (rng() * 2 - 1) * rx;
      const y = cy + (rng() * 2 - 1) * ry;
      const nx = x / rx;
      const ny = (y - cy) / ry;
      const inside = nx * nx + ny * ny <= 1;
      const pinch = ny < -0.85 ? Math.abs(nx) < 0.55 : true;
      if (inside && pinch) {
        out.push({ x, y });
      }
    }
    return out;
  }
  function buildGrowthConfig(env, vigor01) {
    const segLen = Math.min(24, Math.max(7, env.heightMax / 42));
    return {
      segLen,
      influenceRadius: segLen * 5,
      // Tight kill radius: attractors survive near a passing branch long
      // enough to pull secondary shoots out of it — this is where the
      // fine interior twigs (and therefore full-canopy foliage) come
      // from. A generous radius mows the cloud down into bare chains.
      killRadius: segLen * 0.82,
      jitter: 0.22,
      tropism: 0.28,
      droop: 0.02,
      maxNodes: Math.max(6, Math.round(env.attractorBudget * 2)),
      growthRate: 3 + Math.round(7 * Math.min(1, Math.max(0, vigor01)))
    };
  }
  class GrowthSimulator {
    /**
     * @param env The envelope bounding growth + supplying the attractors.
     * @param cfg Growth tuning (segment length, influence/kill radii, …).
     * @param rng Seeded PRNG — every stochastic choice draws from here.
     */
    constructor(env, cfg, rng) {
      this.env = env;
      this.cfg = cfg;
      this.rng = rng;
      this.nodes = [];
      this.childCount = [];
      this.finished = false;
      this.attractors = sampleAttractors(env, env.attractorBudget, rng);
      this.addNode({ x: 0, y: 0 }, null, 0, { x: 0, y: -1 });
    }
    /** Whether growth has terminated. */
    get done() {
      return this.finished;
    }
    /**
     * Advance growth by up to `budget` whole SCA iterations.
     *
     * @param budget Iterations to run this frame (≥1).
     */
    step(budget) {
      for (let i = 0; i < Math.max(1, Math.floor(budget)); i++) {
        if (this.finished) {
          return;
        }
        this.iterate();
      }
    }
    /** One atomic SCA iteration: associate → spawn → kill. */
    iterate() {
      if (this.attractors.length === 0 || this.nodes.length >= this.cfg.maxNodes) {
        this.finished = true;
        return;
      }
      const { influenceRadius, killRadius, segLen, jitter, tropism, droop } = this.cfg;
      const pullX = new Float64Array(this.nodes.length);
      const pullY = new Float64Array(this.nodes.length);
      const pulls = new Int32Array(this.nodes.length);
      const influenceSq = influenceRadius * influenceRadius;
      for (const a of this.attractors) {
        let best = -1;
        let bestDSq = influenceSq;
        for (let n = 0; n < this.nodes.length; n++) {
          const p = this.nodes[n].pos;
          const dx = a.x - p.x;
          const dy = a.y - p.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDSq) {
            bestDSq = dSq;
            best = n;
          }
        }
        if (best >= 0) {
          const p = this.nodes[best].pos;
          const d = Math.max(1e-6, Math.sqrt(bestDSq));
          pullX[best] += (a.x - p.x) / d;
          pullY[best] += (a.y - p.y) / d;
          pulls[best]++;
        }
      }
      const spawnedFrom = [];
      const nodeCountBefore = this.nodes.length;
      for (let n = 0; n < nodeCountBefore; n++) {
        if (pulls[n] === 0) {
          continue;
        }
        if (this.nodes.length >= this.cfg.maxNodes) {
          break;
        }
        const parent = this.nodes[n];
        const isFork = this.childCount[n] > 0;
        const childDepth = parent.depth + (isFork ? 1 : 0);
        if (childDepth > this.env.maxDepth) {
          continue;
        }
        let dx = pullX[n] / pulls[n] + (this.rng() - 0.5) * jitter;
        let dy = pullY[n] / pulls[n] + (this.rng() - 0.5) * jitter - tropism;
        dy += droop * (parent.depth / Math.max(1, this.env.maxDepth));
        let len = Math.max(1e-6, Math.hypot(dx, dy));
        dx /= len;
        dy /= len;
        if (dy > 0.2) {
          dy = 0.2 + (dy - 0.2) * 0.25;
          len = Math.max(1e-6, Math.hypot(dx, dy));
          dx /= len;
          dy /= len;
        }
        this.addNode(
          { x: parent.pos.x + dx * segLen, y: parent.pos.y + dy * segLen },
          n,
          childDepth,
          { x: dx, y: dy }
        );
        spawnedFrom.push(n);
      }
      if (spawnedFrom.length > 0) {
        const killSq = killRadius * killRadius;
        const newNodes = this.nodes.slice(nodeCountBefore);
        this.attractors = this.attractors.filter((a) => {
          for (const node of newNodes) {
            const dx = a.x - node.pos.x;
            const dy = a.y - node.pos.y;
            if (dx * dx + dy * dy < killSq) {
              return false;
            }
          }
          return true;
        });
        return;
      }
      this.extendTowardNearest();
    }
    /** Trunk bootstrap: grow the highest tip toward the nearest attractor. */
    extendTowardNearest() {
      if (this.nodes.length >= this.cfg.maxNodes) {
        this.finished = true;
        return;
      }
      let tip = 0;
      for (let n = 0; n < this.nodes.length; n++) {
        if (this.childCount[n] === 0 && this.nodes[n].pos.y < this.nodes[tip].pos.y) {
          tip = n;
        }
      }
      const from = this.nodes[tip];
      let nearest = null;
      let nearestD = Infinity;
      for (const a of this.attractors) {
        const d = Math.hypot(a.x - from.pos.x, a.y - from.pos.y);
        if (d < nearestD) {
          nearestD = d;
          nearest = a;
        }
      }
      if (!nearest || from.depth > this.env.maxDepth) {
        this.finished = true;
        return;
      }
      if ((nearest.y - from.pos.y) / nearestD > 0.45) {
        const dead = nearest;
        this.attractors = this.attractors.filter((a) => a !== dead);
        return;
      }
      const jitterAmount = this.cfg.jitter * 0.5;
      let dx = (nearest.x - from.pos.x) / nearestD + (this.rng() - 0.5) * jitterAmount;
      let dy = (nearest.y - from.pos.y) / nearestD - this.cfg.tropism;
      let len = Math.max(1e-6, Math.hypot(dx, dy));
      dx /= len;
      dy /= len;
      if (dy > 0.2) {
        dy = 0.2 + (dy - 0.2) * 0.25;
        len = Math.max(1e-6, Math.hypot(dx, dy));
        dx /= len;
        dy /= len;
      }
      this.addNode(
        {
          x: from.pos.x + dx * this.cfg.segLen,
          y: from.pos.y + dy * this.cfg.segLen
        },
        tip,
        from.depth,
        { x: dx, y: dy }
      );
    }
    addNode(pos, parent, depth, direction) {
      this.nodes.push({
        id: this.nodes.length,
        pos,
        parent,
        depth,
        radius: 1,
        compliance: 0,
        direction
      });
      this.childCount.push(0);
      if (parent !== null) {
        this.childCount[parent]++;
      }
    }
    /** Terminal (childless) node indices — where leaves want to live. */
    tips() {
      const out = [];
      for (let n = 0; n < this.nodes.length; n++) {
        if (this.childCount[n] === 0 && n > 0) {
          out.push(n);
        }
      }
      return out;
    }
  }
  const TIP_RADIUS = 1.1;
  function computeGirth(nodes, trunkBase, exponent = 2.2) {
    if (nodes.length === 0) {
      return;
    }
    const acc = new Float64Array(nodes.length);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const r = acc[i] > 0 ? Math.pow(acc[i], 1 / exponent) : TIP_RADIUS;
      nodes[i].radius = r;
      const parent = nodes[i].parent;
      if (parent !== null) {
        acc[parent] += Math.pow(r, exponent);
      }
    }
    const scale = trunkBase / Math.max(TIP_RADIUS, nodes[0].radius);
    for (const node of nodes) {
      node.radius = Math.max(0.7, node.radius * scale);
      const rel = Math.min(1, node.radius / Math.max(0.7, trunkBase));
      node.compliance = Math.pow(1 - rel, 1.6);
    }
  }
  function revealSkeleton(full, count, depthCap) {
    const out = [];
    const map = new Int32Array(full.length).fill(-1);
    for (let i = 0; i < full.length && out.length < count; i++) {
      const node = full[i];
      if (node.depth > depthCap) {
        continue;
      }
      if (node.parent !== null && map[node.parent] === -1) {
        continue;
      }
      map[i] = out.length;
      out.push({
        ...node,
        id: out.length,
        parent: node.parent === null ? null : map[node.parent]
      });
    }
    return out;
  }
  function countWithinDepth(full, depthCap) {
    return revealSkeleton(full, Infinity, depthCap).length;
  }
  function hash32(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const BASE_HUE = 105;
  const BASE_HUE_IDENTITY_SPREAD = 24;
  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }
  function hslToRgb(h, s, l) {
    const hue = (h % 360 + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(hue / 60 % 2 - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) {
      r = c;
      g = x;
    } else if (hue < 120) {
      r = x;
      g = c;
    } else if (hue < 180) {
      g = c;
      b = x;
    } else if (hue < 240) {
      g = x;
      b = c;
    } else if (hue < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    const to255 = (v) => Math.round((v + m) * 255);
    return to255(r) * 65536 + to255(g) * 256 + to255(b);
  }
  function canopyHue(siteKey) {
    const identity = hash32(siteKey);
    return BASE_HUE - BASE_HUE_IDENTITY_SPREAD / 2 + identity % (BASE_HUE_IDENTITY_SPREAD + 1);
  }
  function leafColor(hue, health01, ageDays) {
    const health = clamp01(health01);
    const effectiveHue = health >= 0.7 ? hue : 20 + (hue - 20) * (health / 0.7);
    let s = 0.3 + 0.42 * health;
    let l = 0.32 + 0.18 * health;
    const dryness = clamp01((ageDays - 730) / 2920);
    s *= 1 - 0.55 * dryness;
    l -= 0.06 * dryness;
    return hslToRgb(effectiveHue, clamp01(s), clamp01(l));
  }
  function getPixi() {
    const pixi = window.PIXI;
    return pixi ?? null;
  }
  const BARK_DARK = 3351578;
  const BARK_LIGHT = 9071176;
  const BARK_SHADE = 2036491;
  const BARK_HIGHLIGHT = 14266499;
  const BARK_GROOVE = 2364937;
  function lerpColor(a, b, t) {
    const ar = Math.floor(a / 65536) % 256;
    const ag = Math.floor(a / 256) % 256;
    const ab = a % 256;
    const br = Math.floor(b / 65536) % 256;
    const bg = Math.floor(b / 256) % 256;
    const bb = b % 256;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return r * 65536 + g * 256 + bl;
  }
  function buildChains(nodes) {
    if (nodes.length < 2) {
      return [];
    }
    const children = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i].parent;
      if (p !== null) {
        children[p].push(i);
      }
    }
    const chains = [];
    const starts = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].parent === null || children[nodes[i].parent].length > 1) {
        if (nodes[i].parent !== null) {
          starts.push({ from: nodes[i].parent, head: i });
        } else if (children[i].length > 0) {
          starts.push({ from: i, head: children[i][0] });
        }
      }
    }
    for (const start of starts) {
      const run = [start.from, start.head];
      let cursor = start.head;
      while (children[cursor].length === 1) {
        cursor = children[cursor][0];
        run.push(cursor);
      }
      let compliance = 0;
      let radius = 0;
      for (const idx of run) {
        compliance += nodes[idx].compliance;
        radius += nodes[idx].radius;
      }
      chains.push({
        nodeIdx: run,
        meanCompliance: compliance / run.length,
        meanRadius: radius / run.length,
        fromRoot: start.from === 0 && nodes[0].parent === null
      });
    }
    chains.sort((a, b) => b.meanRadius - a.meanRadius);
    return chains;
  }
  function buildBranchMesh(nodes, pixi) {
    return new pixi.Graphics();
  }
  function computeChainGeometry(chain, nodes, displace) {
    const count = chain.nodeIdx.length;
    if (count < 2) {
      return null;
    }
    const px = new Float64Array(count);
    const py = new Float64Array(count);
    const pr = new Float64Array(count);
    const compliance = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const node = nodes[chain.nodeIdx[i]];
      px[i] = node.pos.x + 0;
      py[i] = node.pos.y + 0;
      pr[i] = Math.max(0.6, node.radius);
      compliance[i] = node.compliance;
    }
    if (chain.fromRoot) {
      pr[0] *= 1.75;
      if (count > 2) {
        pr[1] *= 1.3;
      }
    } else {
      pr[0] = Math.min(pr[0], pr[1] * 1.35 + 0.6);
    }
    const leftX = new Float64Array(count);
    const leftY = new Float64Array(count);
    const rightX = new Float64Array(count);
    const rightY = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(count - 1, i + 1);
      let tx = px[i1] - px[i0];
      let ty = py[i1] - py[i0];
      const len = Math.max(1e-6, Math.hypot(tx, ty));
      tx /= len;
      ty /= len;
      const nx = -ty;
      const ny = tx;
      leftX[i] = px[i] + nx * pr[i];
      leftY[i] = py[i] + ny * pr[i];
      rightX[i] = px[i] - nx * pr[i];
      rightY[i] = py[i] - ny * pr[i];
    }
    return { chain, px, py, leftX, leftY, rightX, rightY, compliance };
  }
  function drawBranches(g, chains, nodes, displace) {
    g.clear();
    const geometries = [];
    for (const chain of chains) {
      const geometry = computeChainGeometry(chain, nodes);
      if (geometry) {
        geometries.push(geometry);
      }
    }
    const filleted = /* @__PURE__ */ new Set();
    for (const geo of geometries) {
      const forkIdx = geo.chain.nodeIdx[0];
      if (geo.chain.fromRoot || filleted.has(forkIdx)) {
        continue;
      }
      filleted.add(forkIdx);
      const fork = nodes[forkIdx];
      g.circle(
        fork.pos.x + 0,
        fork.pos.y + 0,
        Math.max(0.6, fork.radius)
      ).fill({
        color: lerpColor(BARK_DARK, BARK_LIGHT, fork.compliance)
      });
    }
    for (const geo of geometries) {
      const chain = geo.chain;
      const count = geo.px.length;
      const { px, py, leftX, leftY, rightX, rightY } = geo;
      const last = count - 1;
      const lastNode = nodes[chain.nodeIdx[last]];
      g.circle(
        px[last],
        py[last],
        Math.max(0.6, lastNode.radius)
      ).fill({
        color: lerpColor(BARK_DARK, BARK_LIGHT, geo.compliance[last])
      });
      for (let i = 0; i < count - 1; i++) {
        const j = Math.min(count - 1, i + 2);
        const mid = Math.min(count - 1, i + 1);
        g.poly(
          [
            leftX[i],
            leftY[i],
            leftX[mid],
            leftY[mid],
            leftX[j],
            leftY[j],
            rightX[j],
            rightY[j],
            rightX[mid],
            rightY[mid],
            rightX[i],
            rightY[i]
          ],
          true
        ).fill({
          color: lerpColor(BARK_DARK, BARK_LIGHT, geo.compliance[mid])
        });
      }
      if (chain.meanRadius > 1.8) {
        g.moveTo(leftX[0], leftY[0]);
        for (let i = 1; i < count; i++) {
          g.lineTo(leftX[i], leftY[i]);
        }
        g.stroke({
          color: BARK_SHADE,
          width: Math.max(0.8, chain.meanRadius * 0.5),
          alpha: 0.28,
          cap: "round",
          join: "round"
        });
        g.moveTo(
          rightX[0] * 0.35 + px[0] * 0.65,
          rightY[0] * 0.35 + py[0] * 0.65
        );
        for (let i = 1; i < count; i++) {
          g.lineTo(
            rightX[i] * 0.35 + px[i] * 0.65,
            rightY[i] * 0.35 + py[i] * 0.65
          );
        }
        g.stroke({
          color: BARK_HIGHLIGHT,
          width: Math.max(0.7, chain.meanRadius * 0.3),
          alpha: 0.14,
          cap: "round",
          join: "round"
        });
      }
      if (chain.meanRadius > 4.5) {
        for (const side of [-0.38, 0.31]) {
          g.moveTo(
            px[0] + (leftX[0] - px[0]) * side,
            py[0] + (leftY[0] - py[0]) * side
          );
          for (let i = 1; i < count; i++) {
            g.lineTo(
              px[i] + (leftX[i] - px[i]) * side,
              py[i] + (leftY[i] - py[i]) * side
            );
          }
          g.stroke({
            color: BARK_GROOVE,
            width: 1.1,
            alpha: 0.16,
            cap: "round",
            join: "round"
          });
        }
      }
    }
  }
  const FLOWER_TEX_SIZE = 40;
  const FLOWER_TINTS = [16773621, 16767464, 16771529, 16241919];
  function buildFlowerTexture$1(pixi) {
    const size = FLOWER_TEX_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const c = size / 2;
    const petalR = size * 0.2;
    const orbit = size * 0.22;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * orbit, c + Math.sin(a) * orbit, petalR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 214, 120, 1)";
    ctx.beginPath();
    ctx.arc(c, c, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    return pixi.Texture.from(canvas);
  }
  class BloomEngine {
    /**
     * @param layer The flower layer (back→front: after leaves).
     * @param pixi  The vendor Pixi namespace.
     */
    constructor(layer, pixi) {
      this.flowers = [];
      this.texture = null;
      this.layer = layer;
      this.pixi = pixi;
    }
    /**
     * Promote a `bloom01` fraction of the canopy to flowers. Blossom
     * scatters WITHIN each cluster's radius so flowers nest in foliage
     * instead of floating beside it.
     *
     * @param bloom01    Fraction of the canopy that flowers, 0..1.
     * @param placements Cluster placements from `LeafGenerator.placements()`.
     * @param rng        Seeded PRNG so the same site blooms the same way.
     */
    apply(bloom01, placements, rng) {
      this.clear();
      const fraction = Math.min(1, Math.max(0, bloom01));
      if (fraction === 0 || placements.length === 0) {
        return;
      }
      this.texture = this.texture ?? buildFlowerTexture$1(this.pixi);
      const perCluster = 1 + Math.round(fraction * 2);
      const count = Math.min(140, Math.round(placements.length * fraction * perCluster));
      const placed = [];
      const MIN_GAP = 26;
      const MIN_GAP_SQ = MIN_GAP * MIN_GAP;
      for (let i = 0; i < count; i++) {
        let base = null;
        for (let attempt = 0; attempt < 4 && !base; attempt++) {
          const p = placements[Math.floor(rng() * placements.length)];
          const spread = (p.radius ?? 12) * 1.3;
          const candidate = {
            x: p.pos.x + (rng() * 2 - 1) * spread,
            y: p.pos.y + (rng() * 2 - 1) * spread * 0.8,
            compliance: p.compliance,
            radius: p.radius ?? 12
          };
          const crowded = placed.some((q) => {
            const dx = q.x - candidate.x;
            const dy = q.y - candidate.y;
            return dx * dx + dy * dy < MIN_GAP_SQ;
          });
          if (!crowded) {
            base = candidate;
            const sprite = new this.pixi.Sprite(this.texture);
            sprite.anchor.set(0.5);
            sprite.tint = FLOWER_TINTS[Math.floor(rng() * FLOWER_TINTS.length)];
            const scale = candidate.radius * (0.32 + rng() * 0.22) / FLOWER_TEX_SIZE;
            sprite.scale.set(scale);
            sprite.alpha = 0;
            this.layer.addChild(sprite);
            placed.push({ x: candidate.x, y: candidate.y });
            this.flowers.push({
              sprite,
              base: { x: candidate.x, y: candidate.y },
              compliance: candidate.compliance,
              phase: rng() * Math.PI * 2,
              scale
            });
          }
        }
      }
    }
    /**
     * Breathe: fade in and pulse gently, riding the same wind offset the
     * scene applies to leaves via the shared displacement callback.
     *
     * @param dt       Delta time (seconds).
     * @param t        Elapsed scene time (seconds).
     * @param displace Wind displacement at a point (already unscaled).
     */
    update(dt, t, displace) {
      for (const flower of this.flowers) {
        flower.sprite.alpha = Math.min(0.95, flower.sprite.alpha + dt * 0.5);
        const pulse = 1 + 0.08 * Math.sin(t * 1.6 + flower.phase);
        flower.sprite.scale.set(flower.scale * pulse);
        const w = displace(flower.base.x, flower.base.y);
        flower.sprite.x = flower.base.x + w.x * flower.compliance;
        flower.sprite.y = flower.base.y + w.y * flower.compliance;
      }
    }
    clear() {
      for (const flower of this.flowers) {
        this.layer.removeChild(flower.sprite);
        flower.sprite.destroy();
      }
      this.flowers.length = 0;
    }
    /** Release sprites + the shared texture. */
    destroy() {
      this.clear();
      if (this.texture) {
        this.texture.destroy(true);
        this.texture = null;
      }
    }
  }
  const MAX_BUTTERFLIES = 8;
  const TEX_W$1 = 72;
  const TEX_H$1 = 56;
  const CRUISE_SPEED = 58;
  const WING_COLORS = [14715452, 6266848, 15126382, 15789538, 10847192];
  function computeButterflyCount(totalTags) {
    const tags = Math.max(0, Math.floor(totalTags));
    if (tags === 0) {
      return 0;
    }
    return Math.min(
      MAX_BUTTERFLIES,
      Math.max(2, 2 + Math.round(6 * (tags / (tags + 40))))
    );
  }
  function shade$3(color, f) {
    const r = Math.min(255, Math.round(Math.floor(color / 65536) % 256 * f));
    const g = Math.min(255, Math.round(Math.floor(color / 256) % 256 * f));
    const b = Math.min(255, Math.round(color % 256 * f));
    return r * 65536 + g * 256 + b;
  }
  function css$1(color, alpha = 1) {
    const r = Math.floor(color / 65536) % 256;
    const g = Math.floor(color / 256) % 256;
    const b = color % 256;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  function drawWing(ctx, cx, cy, side, color) {
    const light = shade$3(color, 1.25);
    const deep = shade$3(color, 0.62);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(side, 1);
    let gradient = ctx.createRadialGradient(4, -2, 2, 18, -12, 22);
    gradient.addColorStop(0, css$1(light));
    gradient.addColorStop(0.72, css$1(color));
    gradient.addColorStop(1, css$1(deep));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(2, -1);
    ctx.bezierCurveTo(10, -22, 30, -26, 33, -16);
    ctx.bezierCurveTo(34, -8, 26, -2, 2, 1);
    ctx.closePath();
    ctx.fill();
    gradient = ctx.createRadialGradient(3, 4, 2, 14, 12, 18);
    gradient.addColorStop(0, css$1(color));
    gradient.addColorStop(1, css$1(deep));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.bezierCurveTo(18, 2, 24, 12, 18, 19);
    ctx.bezierCurveTo(12, 24, 4, 16, 2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css$1(16777215, 0.75);
    ctx.beginPath();
    ctx.arc(24, -16, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(29, -12, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function buildButterflyTexture(pixi, color) {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W$1;
    canvas.height = TEX_H$1;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const cx = TEX_W$1 / 2;
    const cy = TEX_H$1 / 2 + 2;
    drawWing(ctx, cx, cy, -1, color);
    drawWing(ctx, cx, cy, 1, color);
    ctx.fillStyle = css$1(3024416);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 4.2);
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = css$1(3024416, 0.9);
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8);
      ctx.quadraticCurveTo(cx + side * 3, cy - 14, cx + side * 6, cy - 16);
      ctx.stroke();
    }
    return pixi.Texture.from(canvas);
  }
  class ButterflyLayer {
    /**
     * @param layer The butterfly layer (front of the tree body).
     * @param pixi  The vendor Pixi namespace.
     */
    constructor(layer, pixi) {
      this.butterflies = [];
      this.textures = /* @__PURE__ */ new Map();
      this.targetPool = [];
      this.roam = { minX: -100, maxX: 100, minY: -120, maxY: 0 };
      this.layer = layer;
      this.pixi = pixi;
    }
    /**
     * (Re)hatch the butterflies. Each starts perched on (or heading to) a
     * flower; colours cycle through the unlocked slice of the wing set.
     *
     * @param totalTags Tag count — drives population + colour variety.
     * @param targets   Flower-head waypoints from `FlowerField.targets()`.
     * @param roam      Airspace for non-flower waypoints (meadow + lower crown).
     * @param rng       Seeded PRNG — colours and first perches are DNA.
     */
    populate(totalTags, targets, roam, rng) {
      this.clear();
      this.targetPool = targets.map((p) => ({ x: p.x, y: p.y }));
      this.roam = roam;
      const count = computeButterflyCount(totalTags);
      if (count === 0) {
        return;
      }
      const varieties = Math.max(
        1,
        Math.min(WING_COLORS.length, Math.ceil(count * WING_COLORS.length / MAX_BUTTERFLIES))
      );
      for (let i = 0; i < count; i++) {
        const color = WING_COLORS[i % varieties];
        let texture = this.textures.get(color);
        if (!texture) {
          texture = buildButterflyTexture(this.pixi, color);
          this.textures.set(color, texture);
        }
        const sprite = new this.pixi.Sprite(texture);
        sprite.anchor.set(0.5, 0.5);
        const scale = 0.24 + rng() * 0.1;
        sprite.scale.set(scale);
        const start = this.pickTarget(rng);
        sprite.x = start.point.x;
        sprite.y = start.point.y;
        this.layer.addChild(sprite);
        this.butterflies.push({
          sprite,
          pos: { x: start.point.x, y: start.point.y },
          vel: { x: 0, y: 0 },
          target: start.point,
          dwell: start.perchable ? 1 + rng() * 3 : 0,
          perchable: start.perchable,
          flapPhase: rng() * Math.PI * 2,
          bobPhase: rng() * Math.PI * 2,
          scale
        });
      }
    }
    /** Next waypoint: usually a flower, sometimes open air. */
    pickTarget(rand) {
      if (this.targetPool.length > 0 && rand() < 0.68) {
        const p = this.targetPool[Math.floor(rand() * this.targetPool.length)];
        return { point: { x: p.x, y: p.y }, perchable: true };
      }
      return {
        point: {
          x: this.roam.minX + rand() * (this.roam.maxX - this.roam.minX),
          y: this.roam.minY + rand() * (this.roam.maxY - this.roam.minY)
        },
        perchable: false
      };
    }
    /**
     * Per-frame update (full rate — the flap needs it, and there are at
     * most {@link MAX_BUTTERFLIES} sprites): seek the current waypoint
     * with a bobbing flutter, perch and pump on flowers, then move on.
     *
     * @param dt Delta time (seconds).
     * @param t  Elapsed scene time (seconds).
     */
    update(dt, t) {
      for (const b of this.butterflies) {
        if (b.dwell > 0) {
          b.dwell -= dt;
          b.flapPhase += dt * 2.6;
          b.sprite.scale.x = b.scale * (0.22 + 0.18 * Math.abs(Math.cos(b.flapPhase)));
          b.sprite.rotation = 0;
          if (b.dwell <= 0) {
            const next = this.pickTarget(Math.random);
            b.target = next.point;
            b.perchable = next.perchable;
          }
          continue;
        }
        const dx = b.target.x - b.pos.x;
        const dy = b.target.y - b.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 9) {
          if (b.perchable) {
            b.pos.x = b.target.x;
            b.pos.y = b.target.y;
            b.vel.x = 0;
            b.vel.y = 0;
            b.dwell = 1.5 + Math.random() * 3.5;
          } else {
            const next = this.pickTarget(Math.random);
            b.target = next.point;
            b.perchable = next.perchable;
          }
        } else {
          const speed = CRUISE_SPEED * Math.min(1, 0.35 + dist / 90);
          const ux = dx / dist;
          const uy = dy / dist;
          const ease = Math.min(1, dt * 2.2);
          b.vel.x += (ux * speed - b.vel.x) * ease;
          b.vel.y += (uy * speed - b.vel.y) * ease;
          b.pos.x += b.vel.x * dt;
          b.pos.y += b.vel.y * dt + Math.sin(t * 6.5 + b.bobPhase) * 14 * dt;
        }
        b.flapPhase += dt * (13 + 3 * Math.sin(t * 0.9 + b.bobPhase));
        b.sprite.x = b.pos.x;
        b.sprite.y = b.pos.y;
        b.sprite.scale.x = b.scale * (0.3 + 0.7 * Math.abs(Math.cos(b.flapPhase)));
        b.sprite.rotation = Math.max(-0.35, Math.min(0.35, b.vel.x * 5e-3));
      }
    }
    /** Number of live butterflies (observability + tests). */
    count() {
      return this.butterflies.length;
    }
    /** Remove every butterfly (textures stay cached for the next hatch). */
    clear() {
      for (const b of this.butterflies) {
        this.layer.removeChild(b.sprite);
        b.sprite.destroy();
      }
      this.butterflies.length = 0;
    }
    /** Release sprites + the shared textures. */
    destroy() {
      this.clear();
      for (const texture of this.textures.values()) {
        try {
          texture.destroy(true);
        } catch {
        }
      }
      this.textures.clear();
    }
  }
  const MIN_LEAVES = 6;
  const MAX_LEAVES = 3200;
  const LEAVES_PER_CLUSTER = 10;
  const TUFT_HUE_JITTER = 9;
  function leafyShootRadius(trunkBase) {
    return Math.max(3.4, trunkBase * 0.3);
  }
  const LEAF_TEX_SIZE$1 = 48;
  function computeLeafBudget(foliage01) {
    const f = Math.min(1, Math.max(0, foliage01));
    return Math.round(MIN_LEAVES + (MAX_LEAVES - MIN_LEAVES) * Math.pow(f, 1.35));
  }
  function shade$2(color, f) {
    const r = Math.min(255, Math.round(Math.floor(color / 65536) % 256 * f));
    const g = Math.min(255, Math.round(Math.floor(color / 256) % 256 * f));
    const b = Math.min(255, Math.round(color % 256 * f));
    return r * 65536 + g * 256 + b;
  }
  const CLUSTER_TEX_SIZE = 96;
  const CLUSTER_TEX_VARIANTS = 4;
  const BLADES_PER_TEXTURE_MIN = 6;
  const BLADES_PER_TEXTURE_MAX = 10;
  function drawBladeInto(ctx, x, y, rotation, length, brightness) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    const half = length * 0.28;
    const gradient = ctx.createLinearGradient(0, -length / 2, 0, length / 2);
    const c = Math.round(255 * brightness);
    gradient.addColorStop(0, `rgba(${c}, ${c}, ${c}, 1)`);
    gradient.addColorStop(0.55, `rgba(${c}, ${c}, ${c}, 0.95)`);
    gradient.addColorStop(1, `rgba(${Math.round(c * 0.72)}, ${Math.round(c * 0.72)}, ${Math.round(c * 0.72)}, 0.9)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, -length / 2);
    ctx.quadraticCurveTo(half, 0, 0, length / 2);
    ctx.quadraticCurveTo(-half, 0, 0, -length / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${Math.round(c * 0.4)}, ${Math.round(c * 0.4)}, ${Math.round(c * 0.4)}, 0.3)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -length / 2 + 3);
    ctx.quadraticCurveTo(1, 0, 0, length / 2 - 3);
    ctx.stroke();
    ctx.restore();
  }
  function buildLeafClusterTexture(pixi, seedIndex) {
    const size = CLUSTER_TEX_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    let s = 2654435769 + seedIndex * 2246822519;
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    const blades = BLADES_PER_TEXTURE_MIN + Math.floor(rand() * (BLADES_PER_TEXTURE_MAX - BLADES_PER_TEXTURE_MIN + 1));
    const cx = size / 2;
    const cy = size * 0.62;
    for (let b = 0; b < blades; b++) {
      const angle = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.15;
      const length = size * (0.34 + rand() * 0.24);
      const reach = length * 0.32;
      drawBladeInto(
        ctx,
        cx + Math.cos(angle) * reach + (rand() - 0.5) * 8,
        cy + Math.sin(angle) * reach,
        angle + Math.PI / 2 + (rand() - 0.5) * 0.5,
        length,
        0.5 + b / blades * 0.45 + rand() * 0.08
      );
    }
    return pixi.Texture.from(canvas);
  }
  function buildLeafTexture(pixi) {
    const size = LEAF_TEX_SIZE$1;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const cx = size / 2;
    const gradient = ctx.createLinearGradient(0, 2, 0, size - 2);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.55, "rgba(235, 235, 235, 0.96)");
    gradient.addColorStop(1, "rgba(170, 170, 170, 0.9)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cx, 2);
    ctx.quadraticCurveTo(size - 6, size * 0.38, cx, size - 3);
    ctx.quadraticCurveTo(6, size * 0.38, cx, 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(90, 90, 90, 0.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, 5);
    ctx.quadraticCurveTo(cx + 2, size / 2, cx, size - 6);
    ctx.stroke();
    return pixi.Texture.from(canvas);
  }
  class LeafGenerator {
    /**
     * @param backLayer  Silhouette-foliage layer BEHIND the branches.
     * @param frontLayer Lit-leaf layer in front of the branches.
     * @param pixi       The vendor Pixi namespace.
     */
    constructor(backLayer, frontLayer, pixi) {
      this.clusters = [];
      this.clusterTextures = null;
      this.leafCount = 0;
      this.backLayer = backLayer;
      this.frontLayer = frontLayer;
      this.pixi = pixi;
    }
    /**
     * Populate the canopy on every leafy shoot of the revealed skeleton.
     *
     * @param nodes    The revealed skeleton (radius filled by computeGirth).
     * @param hormones Foliage / health / vigour / vitality drive the look.
     * @param baseHue  The site's canopy green (`canopyHue`), 0..360.
     * @param snapshot The snapshot (post/visit aggregates size the leaves).
     * @param rng      Seeded PRNG so a reload keeps the same canopy.
     */
    populate(nodes, hormones, baseHue, snapshot, rng) {
      this.clear();
      if (nodes.length < 2) {
        return;
      }
      if (!this.clusterTextures) {
        this.clusterTextures = [];
        for (let v = 0; v < CLUSTER_TEX_VARIANTS; v++) {
          this.clusterTextures.push(buildLeafClusterTexture(this.pixi, v));
        }
      }
      let trunkBase = 1;
      let deepest = 0;
      let treeTop = 0;
      for (const node of nodes) {
        trunkBase = Math.max(trunkBase, node.radius);
        deepest = Math.max(deepest, node.depth);
        treeTop = Math.max(treeTop, -node.pos.y);
      }
      const shootRadius = leafyShootRadius(trunkBase);
      const minLeafDepth = Math.min(1, deepest);
      const isLeaderTip = (node) => node.depth === 0 && node.radius <= shootRadius * 0.55 && -node.pos.y > treeTop * 0.6;
      const points = [];
      for (let idx = 1; idx < nodes.length; idx++) {
        const node = nodes[idx];
        if (node.parent === null || node.depth < minLeafDepth && !isLeaderTip(node)) {
          continue;
        }
        if (node.radius > shootRadius) {
          if (node.radius <= trunkBase * 0.62 && node.depth >= 1) {
            points.push({
              x: node.pos.x,
              y: node.pos.y,
              compliance: node.compliance,
              inner: true
            });
          }
          continue;
        }
        points.push({ x: node.pos.x, y: node.pos.y, compliance: node.compliance });
        const p = nodes[node.parent];
        if (p.radius <= shootRadius * 1.4 && p.depth >= minLeafDepth) {
          points.push({
            x: (node.pos.x + p.pos.x) / 2,
            y: (node.pos.y + p.pos.y) / 2,
            compliance: (node.compliance + p.compliance) / 2
          });
        }
      }
      if (points.length === 0) {
        return;
      }
      let treeHeight = 1;
      for (const node of nodes) {
        treeHeight = Math.max(treeHeight, -node.pos.y);
      }
      const leafScale = Math.min(1.25, Math.max(0.4, treeHeight / 520));
      const vigorFill = 0.7 + 0.3 * Math.min(1, Math.max(0, hormones.vigor01));
      const vitality = Math.min(1, Math.max(0, hormones.vitality01));
      const budget = Math.min(
        Math.round(computeLeafBudget(hormones.foliage01) * vigorFill * 2.2),
        points.length * LEAVES_PER_CLUSTER * 2
      );
      const clusterCount = Math.min(points.length, Math.max(1, Math.floor(budget / 2)));
      const perCluster = Math.max(2, Math.round(budget / clusterCount));
      const meanVisits = Math.max(1, snapshot.traffic / Math.max(1, snapshot.totalPosts));
      const order = points.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const tuftFill = 0.8 + 0.8 * Math.min(1, Math.max(0, hormones.foliage01));
      for (let c = 0; c < clusterCount; c++) {
        const anchor = order[c % order.length];
        const clusterRadius = (13 + rng() * 9) * leafScale * tuftFill;
        const center = {
          x: anchor.x + (rng() * 2 - 1) * 6 * leafScale,
          y: anchor.y + (rng() * 2 - 1) * 6 * leafScale - clusterRadius * 0.2
        };
        const hue = baseHue + (rng() * 2 - 1) * TUFT_HUE_JITTER;
        const clusterAge = rng() * Math.max(30, snapshot.siteAgeDays);
        const baseColor = leafColor(hue, hormones.health01, clusterAge);
        const cluster = {
          center,
          compliance: anchor.compliance,
          radius: clusterRadius,
          leaves: [],
          delay: c / clusterCount * 1.6,
          age: 0,
          phase: rng() * Math.PI * 2
        };
        for (let i = 0; i < perCluster; i++) {
          const angle = rng() * Math.PI * 2;
          const dist = (rng() + rng()) / 2 * clusterRadius;
          const dx = Math.cos(angle) * dist;
          const dy = Math.sin(angle) * dist * 0.82;
          const visits = meanVisits * (0.25 + rng() * 1.5);
          const size = (22 + Math.log1p(visits) * 5) * (0.75 + rng() * 0.5) * leafScale;
          const behind = anchor.inner === true || i % 3 === 0;
          const clusterTextureList = this.clusterTextures;
          const sprite = new this.pixi.Sprite(
            clusterTextureList[Math.floor(rng() * clusterTextureList.length)]
          );
          sprite.anchor.set(0.5);
          let lightBase = behind ? 0.42 : 0.78;
          if (anchor.inner === true) {
            lightBase = 0.34;
          }
          const light = lightBase + 0.42 * (0.5 - dy / (clusterRadius * 2)) + rng() * 0.12;
          sprite.tint = shade$2(baseColor, light);
          sprite.alpha = 0;
          sprite.scale.set(size * (behind ? 1.25 : 1) / CLUSTER_TEX_SIZE);
          const baseRotation = (rng() * 2 - 1) * Math.PI;
          sprite.rotation = baseRotation;
          (behind ? this.backLayer : this.frontLayer).addChild(sprite);
          cluster.leaves.push({
            sprite,
            dx,
            dy,
            baseRotation,
            phase: rng() * Math.PI * 2,
            alphaMax: (behind ? 0.85 : 0.94) * (0.55 + 0.45 * vitality),
            behind
          });
          this.leafCount++;
        }
        this.clusters.push(cluster);
      }
    }
    /**
     * Per-frame update: staggered fade-in, wind displacement per tuft
     * (× compliance), and a subtle per-leaf rotation flutter.
     *
     * @param dt   Delta time (seconds).
     * @param wind The active wind field.
     * @param t    Elapsed scene time (seconds).
     */
    update(dt, wind, t) {
      for (const cluster of this.clusters) {
        cluster.age += dt;
        const reveal = Math.min(1, Math.max(0, (cluster.age - cluster.delay) / 1.1));
        if (reveal <= 0) {
          continue;
        }
        const w = wind.sample(cluster.center.x, cluster.center.y, t);
        const cxNow = cluster.center.x + w.x * cluster.compliance;
        const cyNow = cluster.center.y + w.y * cluster.compliance;
        for (const leaf of cluster.leaves) {
          leaf.sprite.alpha = leaf.alphaMax * reveal;
          if (leaf.behind) {
            leaf.sprite.x = cxNow + leaf.dx;
            leaf.sprite.y = cyNow + leaf.dy;
            continue;
          }
          const shimmer = cluster.compliance;
          leaf.sprite.x = cxNow + leaf.dx + Math.sin(t * 2.8 + leaf.phase) * 2.4 * shimmer;
          leaf.sprite.y = cyNow + leaf.dy + Math.cos(t * 2.1 + leaf.phase * 1.7) * 1.3 * shimmer;
          leaf.sprite.rotation = leaf.baseRotation + Math.sin(t * 3.1 + leaf.phase) * 0.16 * shimmer;
        }
      }
    }
    /** Tuft placements — the blossom layer anchors to these. */
    placements() {
      return this.clusters.map((cluster) => ({
        pos: cluster.center,
        compliance: cluster.compliance,
        radius: cluster.radius
      }));
    }
    /** Number of live leaf sprites (observability + tests). */
    count() {
      return this.leafCount;
    }
    /**
     * A sample of real canopy leaves (position / tint / size) — the
     * falling-leaves layer detaches copies of THESE, so a drifting leaf
     * always matches the canopy it left.
     *
     * @param cap Max samples to return, spread evenly across the canopy.
     */
    sources(cap) {
      const all = [];
      for (const cluster of this.clusters) {
        for (const leaf of cluster.leaves) {
          if (!leaf.behind) {
            all.push({
              x: cluster.center.x + leaf.dx,
              y: cluster.center.y + leaf.dy,
              tint: leaf.sprite.tint,
              // A faller is ONE leaf, not the whole bundle — hand
              // the shed a single-blade-sized sample.
              size: leaf.sprite.scale.x * CLUSTER_TEX_SIZE * 0.42
            });
          }
        }
      }
      if (all.length <= cap) {
        return all;
      }
      const step = all.length / cap;
      const out = [];
      for (let i = 0; i < cap; i++) {
        out.push(all[Math.floor(i * step)]);
      }
      return out;
    }
    clear() {
      for (const cluster of this.clusters) {
        for (const leaf of cluster.leaves) {
          (leaf.behind ? this.backLayer : this.frontLayer).removeChild(leaf.sprite);
          leaf.sprite.destroy();
        }
      }
      this.clusters.length = 0;
      this.leafCount = 0;
    }
    /** Release sprites + the shared texture. */
    destroy() {
      this.clear();
      if (this.clusterTextures) {
        for (const texture of this.clusterTextures) {
          texture.destroy(true);
        }
        this.clusterTextures = null;
      }
    }
  }
  const MAX_CONCURRENT = 5;
  const SPAWN_EVERY_MIN = 2.5;
  const SPAWN_EVERY_SPREAD = 5;
  const LEAF_TEX_SIZE = 48;
  class FallingLeaves {
    /**
     * @param layer The lit-leaf layer (a falling leaf is still a leaf).
     * @param pixi  The vendor Pixi namespace.
     */
    constructor(layer, pixi) {
      this.texture = null;
      this.pool = [];
      this.sources = [];
      this.nextSpawn = SPAWN_EVERY_MIN;
      this.layer = layer;
      this.pixi = pixi;
    }
    /**
     * Point the shedder at the current canopy. An empty array (used
     * while a new tree grows) stops new releases and lets airborne
     * leaves finish their fall.
     *
     * @param sources Real canopy leaf samples from `LeafGenerator.sources()`.
     */
    setSources(sources) {
      this.sources = sources;
    }
    /**
     * Advance the shed: release on schedule, tumble, land, recycle.
     *
     * @param dt   Delta time (seconds).
     * @param wind The active wind field (fallers drift with it).
     * @param t    Elapsed scene time (seconds).
     */
    update(dt, wind, t) {
      this.nextSpawn -= dt;
      if (this.nextSpawn <= 0 && this.sources.length > 0) {
        this.nextSpawn = SPAWN_EVERY_MIN + Math.random() * SPAWN_EVERY_SPREAD;
        this.release();
      }
      for (const leaf of this.pool) {
        if (!leaf.active) {
          continue;
        }
        leaf.y += leaf.fallSpeed * dt;
        const w = wind.sample(leaf.x, leaf.y, t);
        leaf.x += (w.x * 0.6 + Math.sin(t * 1.9 + leaf.swayPhase) * leaf.swayWidth) * dt;
        leaf.sprite.x = leaf.x;
        leaf.sprite.y = leaf.y;
        leaf.sprite.rotation += leaf.rotSpeed * dt;
        if (leaf.y >= -4) {
          leaf.fade -= dt * 1.1;
          leaf.sprite.alpha = Math.max(0, leaf.fade * 0.9);
          if (leaf.fade <= 0) {
            leaf.active = false;
            leaf.sprite.visible = false;
          }
        }
      }
    }
    /** Detach one canopy leaf copy and let it go. */
    release() {
      const source = this.sources[Math.floor(Math.random() * this.sources.length)];
      if (!source) {
        return;
      }
      let leaf = this.pool.find((candidate) => !candidate.active) ?? null;
      if (!leaf) {
        if (this.pool.length >= MAX_CONCURRENT) {
          return;
        }
        this.texture = this.texture ?? buildLeafTexture(this.pixi);
        const sprite = new this.pixi.Sprite(this.texture);
        sprite.anchor.set(0.5);
        this.layer.addChild(sprite);
        leaf = {
          sprite,
          active: false,
          x: 0,
          y: 0,
          fallSpeed: 0,
          swayPhase: 0,
          swayWidth: 0,
          rotSpeed: 0,
          fade: 1
        };
        this.pool.push(leaf);
      }
      leaf.active = true;
      leaf.x = source.x;
      leaf.y = source.y;
      leaf.fallSpeed = 26 + Math.random() * 22;
      leaf.swayPhase = Math.random() * Math.PI * 2;
      leaf.swayWidth = 14 + Math.random() * 16;
      leaf.rotSpeed = (Math.random() * 2 - 1) * 3.2;
      leaf.fade = 1;
      leaf.sprite.tint = source.tint;
      leaf.sprite.scale.set(source.size / LEAF_TEX_SIZE);
      leaf.sprite.rotation = Math.random() * Math.PI * 2;
      leaf.sprite.alpha = 0.92;
      leaf.sprite.visible = true;
      leaf.sprite.x = leaf.x;
      leaf.sprite.y = leaf.y;
    }
    /** Release sprites + the shared texture. */
    destroy() {
      for (const leaf of this.pool) {
        this.layer.removeChild(leaf.sprite);
        leaf.sprite.destroy();
      }
      this.pool.length = 0;
      if (this.texture) {
        this.texture.destroy(true);
        this.texture = null;
      }
    }
  }
  const GLOW_TEX_SIZE = 32;
  function buildGlowTexture(pixi) {
    const size = GLOW_TEX_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const c = size / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, "rgba(255, 244, 180, 1)");
    gradient.addColorStop(0.3, "rgba(255, 224, 120, 0.7)");
    gradient.addColorStop(1, "rgba(255, 200, 60, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return pixi.Texture.from(canvas);
  }
  class FireflyLayer {
    /**
     * @param layer The firefly layer (front-most, additive).
     * @param pixi  The vendor Pixi namespace.
     */
    constructor(layer, pixi) {
      this.flies = [];
      this.texture = null;
      this.bounds = { minX: -80, maxX: 80, minY: -220, maxY: -40 };
      this.layer = layer;
      this.pixi = pixi;
    }
    /**
     * Constrain wandering to the crown region.
     *
     * @param bounds The crown bounding box in reference space.
     */
    setBounds(bounds) {
      this.bounds = bounds;
    }
    /**
     * Set the number of fireflies; spawns / retires sprites to match.
     *
     * @param n Firefly count (from the `spark` hormone).
     */
    setCount(n) {
      const target = Math.max(0, Math.round(n));
      while (this.flies.length > target) {
        const fly = this.flies.pop();
        if (fly) {
          this.layer.removeChild(fly.sprite);
          fly.sprite.destroy();
        }
      }
      if (this.flies.length < target) {
        this.texture = this.texture ?? buildGlowTexture(this.pixi);
        while (this.flies.length < target) {
          const sprite = new this.pixi.Sprite(this.texture);
          sprite.anchor.set(0.5);
          sprite.blendMode = "add";
          sprite.scale.set((6 + Math.random() * 5) / GLOW_TEX_SIZE);
          const x = this.randomX();
          const y = this.randomY();
          sprite.x = x;
          sprite.y = y;
          this.layer.addChild(sprite);
          this.flies.push({
            sprite,
            x,
            y,
            tx: this.randomX(),
            ty: this.randomY(),
            phase: Math.random() * Math.PI * 2,
            retarget: 2 + Math.random() * 4
          });
        }
      }
    }
    /**
     * Per-frame drift + twinkle.
     *
     * @param dt Delta time (seconds).
     * @param t  Elapsed scene time (seconds).
     */
    update(dt, t) {
      for (const fly of this.flies) {
        fly.retarget -= dt;
        if (fly.retarget <= 0) {
          fly.tx = this.randomX();
          fly.ty = this.randomY();
          fly.retarget = 2 + Math.random() * 4;
        }
        fly.x += (fly.tx - fly.x) * dt * 0.4 + Math.sin(t * 2.2 + fly.phase) * 0.35;
        fly.y += (fly.ty - fly.y) * dt * 0.4 + Math.cos(t * 1.7 + fly.phase) * 0.3;
        fly.sprite.x = fly.x;
        fly.sprite.y = fly.y;
        fly.sprite.alpha = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.6 + fly.phase * 3));
      }
    }
    randomX() {
      return this.bounds.minX + Math.random() * (this.bounds.maxX - this.bounds.minX);
    }
    randomY() {
      return this.bounds.minY + Math.random() * (this.bounds.maxY - this.bounds.minY);
    }
    /** Release sprites + the shared texture. */
    destroy() {
      this.setCount(0);
      if (this.texture) {
        this.texture.destroy(true);
        this.texture = null;
      }
    }
  }
  const MIN_FLOWERS = 3;
  const MAX_FLOWERS = 80;
  const MAX_PATCHES = 8;
  const TEX_W = 80;
  const TEX_H = 112;
  const SPECIES = ["daisy", "poppy", "bell", "cosmos"];
  const PETAL_COLORS = [14241610, 7311320, 15779402, 15770300, 11112406, 16118506];
  const STEM_COLOR = 4160063;
  function computeFlowerCount(totalCategories) {
    const cats = Math.max(0, Math.floor(totalCategories));
    if (cats === 0) {
      return 0;
    }
    return Math.min(
      MAX_FLOWERS,
      Math.max(MIN_FLOWERS, Math.round(2.5 * Math.sqrt(cats)))
    );
  }
  function shade$1(color, f) {
    const r = Math.min(255, Math.round(Math.floor(color / 65536) % 256 * f));
    const g = Math.min(255, Math.round(Math.floor(color / 256) % 256 * f));
    const b = Math.min(255, Math.round(color % 256 * f));
    return r * 65536 + g * 256 + b;
  }
  function css(color, alpha = 1) {
    const r = Math.floor(color / 65536) % 256;
    const g = Math.floor(color / 256) % 256;
    const b = color % 256;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  function mix(a, b, f) {
    const ch = (shift) => {
      const ca = Math.floor(a / shift) % 256;
      const cb = Math.floor(b / shift) % 256;
      return Math.round(ca + (cb - ca) * f);
    };
    return ch(65536) * 65536 + ch(256) * 256 + ch(1);
  }
  function drawStem(ctx, cx, headY, bend) {
    const baseY = TEX_H - 2;
    ctx.strokeStyle = css(shade$1(STEM_COLOR, 0.9));
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - bend * 0.4, baseY);
    ctx.quadraticCurveTo(cx + bend, (baseY + headY) / 2, cx, headY + 4);
    ctx.stroke();
    const leaf = (ly, dir) => {
      const lx = cx + bend * 0.5;
      const len = 14 + Math.abs(bend) * 2;
      ctx.fillStyle = css(shade$1(STEM_COLOR, 1.05), 0.95);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx + dir * len * 0.7, ly - len * 0.45, lx + dir * len, ly - len * 0.15);
      ctx.quadraticCurveTo(lx + dir * len * 0.55, ly + len * 0.12, lx, ly);
      ctx.closePath();
      ctx.fill();
    };
    leaf(TEX_H * 0.68, 1);
    leaf(TEX_H * 0.8, -1);
  }
  function drawPetal(ctx, cx, cy, angle, length, width, inner, outer, notched) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const gradient = ctx.createLinearGradient(0, 0, length, 0);
    gradient.addColorStop(0, css(inner));
    gradient.addColorStop(1, css(outer));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    if (notched) {
      ctx.quadraticCurveTo(length * 0.45, -width * 0.62, length * 0.96, -width * 0.3);
      ctx.lineTo(length * 0.88, 0);
      ctx.lineTo(length * 0.96, width * 0.3);
      ctx.quadraticCurveTo(length * 0.45, width * 0.62, 2, 0);
    } else {
      ctx.quadraticCurveTo(length * 0.5, -width * 0.58, length, 0);
      ctx.quadraticCurveTo(length * 0.5, width * 0.58, 2, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawDisc(ctx, cx, cy, r) {
    const gradient = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.15, cx, cy, r);
    gradient.addColorStop(0, css(16768906));
    gradient.addColorStop(1, css(13602606));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function buildFlowerTexture(pixi, species, petal, seed) {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const rand = mulberry32(hash32(`flower|${species}|${seed}`));
    const cx = TEX_W / 2;
    const headY = 26;
    const bend = (rand() * 2 - 1) * 7;
    drawStem(ctx, cx, headY, bend);
    const light = mix(petal, 16777215, 0.35);
    const deep = shade$1(petal, 0.72);
    if (species === "daisy") {
      const petals = 11;
      for (let i = 0; i < petals; i++) {
        const a = i / petals * Math.PI * 2 + rand() * 0.1;
        drawPetal(ctx, cx, headY, a, 19, 6.5, mix(petal, 16777215, 0.12), light, false);
      }
      drawDisc(ctx, cx, headY, 6.5);
    } else if (species === "poppy") {
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 - Math.PI / 2 + rand() * 0.12;
        const orbit = 8.5;
        const px = cx + Math.cos(a) * orbit;
        const py = headY + Math.sin(a) * orbit;
        const gradient = ctx.createRadialGradient(px, py, 1, px, py, 12);
        gradient.addColorStop(0, css(deep));
        gradient.addColorStop(0.75, css(petal));
        gradient.addColorStop(1, css(light, 0.9));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, 11.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = css(3482158);
      ctx.beginPath();
      ctx.arc(cx, headY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(15258234, 0.9);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + rand() * 0.2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 6.5, headY + Math.sin(a) * 6.5, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (species === "bell") {
      const bell = (bx, by, s) => {
        ctx.strokeStyle = css(shade$1(STEM_COLOR, 0.85));
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx, headY + 4);
        ctx.quadraticCurveTo((cx + bx) / 2, Math.min(headY, by) - 8, bx, by - 10 * s);
        ctx.stroke();
        const gradient = ctx.createLinearGradient(bx, by - 12 * s, bx, by + 8 * s);
        gradient.addColorStop(0, css(light));
        gradient.addColorStop(1, css(deep));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(bx, by - 10 * s);
        ctx.bezierCurveTo(
          bx + 7 * s,
          by - 9 * s,
          bx + 8 * s,
          by - 1 * s,
          bx + 6 * s,
          by + 5 * s
        );
        ctx.quadraticCurveTo(bx + 3 * s, by + 3.4 * s, bx, by + 5.5 * s);
        ctx.quadraticCurveTo(bx - 3 * s, by + 3.4 * s, bx - 6 * s, by + 5 * s);
        ctx.bezierCurveTo(
          bx - 8 * s,
          by - 1 * s,
          bx - 7 * s,
          by - 9 * s,
          bx,
          by - 10 * s
        );
        ctx.closePath();
        ctx.fill();
      };
      bell(cx - 9, headY + 12, 1);
      bell(cx + 10, headY + 5, 0.8);
    } else {
      const petals = 8;
      for (let i = 0; i < petals; i++) {
        const a = i / petals * Math.PI * 2 + Math.PI / petals;
        drawPetal(ctx, cx, headY, a, 18, 7.5, petal, light, true);
      }
      drawDisc(ctx, cx, headY, 4.5);
    }
    return pixi.Texture.from(canvas);
  }
  class FlowerField {
    /**
     * @param layer The flower-field layer (in front of the turf).
     * @param pixi  The vendor Pixi namespace.
     */
    constructor(layer, pixi) {
      this.flowers = [];
      this.textures = /* @__PURE__ */ new Map();
      this.layer = layer;
      this.pixi = pixi;
    }
    /**
     * (Re)plant the meadow. Deterministic for a given site + options:
     * categories map to patches (species+colour), patches to scattered
     * blossoms, denser and larger toward the foreground.
     *
     * @param opts Field geometry + the category count.
     */
    build(opts) {
      this.clear();
      const count = computeFlowerCount(opts.categories);
      if (count === 0) {
        return;
      }
      const rng = mulberry32(hash32(`${opts.siteKey}|flowers`));
      const patchCount = Math.min(Math.max(1, opts.categories), MAX_PATCHES);
      const combos = [];
      for (const petal of PETAL_COLORS) {
        for (const species of SPECIES) {
          combos.push({ species, petal });
        }
      }
      for (let i = combos.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [combos[i], combos[j]] = [combos[j], combos[i]];
      }
      const clearance = opts.trunkBase * 4 + 26;
      const slot = opts.fieldHalf * 2 / patchCount;
      const patches = [];
      for (let p = 0; p < patchCount; p++) {
        let x = -opts.fieldHalf + (p + 0.5) * slot + (rng() - 0.5) * slot * 0.7;
        if (Math.abs(x) < clearance) {
          x = clearance * (x < 0 ? -1 : 1) + rng() * 20;
        }
        patches.push({
          x,
          y: 3 + rng() * Math.max(8, opts.coverDepth * 0.7),
          combo: p % combos.length
        });
      }
      for (let i = 0; i < count; i++) {
        const patch = patches[i % patches.length];
        const combo = combos[patch.combo];
        const key = `${combo.species}:${combo.petal}`;
        let texture = this.textures.get(key);
        if (!texture) {
          texture = buildFlowerTexture(
            this.pixi,
            combo.species,
            combo.petal,
            patch.combo
          );
          this.textures.set(key, texture);
        }
        const x = patch.x + (rng() + rng() - 1) * 42;
        const y = Math.min(
          Math.max(2, patch.y + (rng() + rng() - 1) * opts.coverDepth * 0.3),
          Math.max(4, opts.coverDepth * 0.9)
        );
        const depth01 = Math.min(1, y / Math.max(8, opts.coverDepth));
        const height = (21 + rng() * 13) * (0.72 + depth01 * 0.38);
        const sprite = new this.pixi.Sprite(texture);
        sprite.anchor.set(0.5, 1);
        const scale = height / (TEX_H * 0.78);
        sprite.scale.set(scale);
        if (rng() < 0.5) {
          sprite.scale.x = -scale;
        }
        sprite.tint = shade$1(16777215, 0.66 + 0.34 * depth01);
        sprite.alpha = 0;
        sprite.x = x;
        sprite.y = y;
        this.layer.addChild(sprite);
        this.flowers.push({
          sprite,
          base: { x, y },
          height,
          phase: rng() * Math.PI * 2,
          scale,
          alphaMax: 0.9 + rng() * 0.1,
          delay: rng() * 1.4,
          age: 0
        });
      }
    }
    /**
     * Per-frame update (canopy cadence, 30 Hz): staggered bloom fade-in
     * and a stalk sway — the sprite pivots on its stem base, bending with
     * the wind sampled at its head like one supple stalk.
     *
     * @param dt       Delta time (seconds).
     * @param t        Elapsed scene time (seconds).
     * @param displace Wind displacement at a point (already unscaled).
     */
    update(dt, t, displace) {
      for (const flower of this.flowers) {
        flower.age += dt;
        const reveal = Math.min(1, Math.max(0, (flower.age - flower.delay) / 1.2));
        flower.sprite.alpha = flower.alphaMax * reveal;
        if (reveal <= 0) {
          continue;
        }
        const w = displace(flower.base.x, flower.base.y - flower.height);
        const give = Math.min(0.2, Math.abs(w.x) * 0.012) * (w.x < 0 ? -1 : 1);
        flower.sprite.rotation = give * (flower.height / 28) + Math.sin(t * 1.3 + flower.phase) * 0.022;
      }
    }
    /**
     * Flower-head positions in reference space — the butterflies' waypoints.
     */
    targets() {
      return this.flowers.map((flower) => ({
        x: flower.base.x,
        y: flower.base.y - flower.height * 0.92
      }));
    }
    /** Number of planted flowers (observability + tests). */
    count() {
      return this.flowers.length;
    }
    clear() {
      for (const flower of this.flowers) {
        this.layer.removeChild(flower.sprite);
        flower.sprite.destroy();
      }
      this.flowers.length = 0;
    }
    /** Release sprites + the shared textures. */
    destroy() {
      this.clear();
      for (const texture of this.textures.values()) {
        try {
          texture.destroy(true);
        } catch {
        }
      }
      this.textures.clear();
    }
  }
  const BLADES_PER_CLUMP = 34;
  const FALLEN_LEAVES = 7;
  const GRASS_HUE = 96;
  function shade(color, f) {
    const r = Math.min(255, Math.round(Math.floor(color / 65536) % 256 * f));
    const g = Math.min(255, Math.round(Math.floor(color / 256) % 256 * f));
    const b = Math.min(255, Math.round(color % 256 * f));
    return r * 65536 + g * 256 + b;
  }
  function buildGroundGradientTexture(pixi) {
    const w = 256;
    const h = 96;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.5)");
    gradient.addColorStop(0.8, "rgba(255, 255, 255, 0.16)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(1, h / w);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = gradient;
    ctx.fillRect(-w, -h, w * 3, h * 3);
    ctx.restore();
    return pixi.Texture.from(canvas);
  }
  class GroundLayer {
    /**
     * @param layer The ground layer (bottom of the tree body).
     * @param pixi  The vendor Pixi namespace.
     */
    constructor(layer, pixi) {
      this.gradientTexture = null;
      this.leafTexture = null;
      this.mounds = [];
      this.turf = null;
      this.litter = [];
      this.layer = layer;
      this.pixi = pixi;
    }
    /**
     * (Re)build the meadow. Deterministic for a given site + options.
     *
     * @param opts Meadow geometry + hormones.
     */
    build(opts) {
      this.clear();
      const rng = mulberry32(hash32(`${opts.siteKey}|ground`));
      this.gradientTexture = this.gradientTexture ?? buildGroundGradientTexture(this.pixi);
      const grass = leafColor(GRASS_HUE, opts.health01, 0);
      const soil = shade(grass, 0.16);
      const meadowHalf = Math.max(opts.span * 1.15, opts.coverHalfWidth);
      const mound = (tint, alpha, w, h, x, y) => {
        const sprite = new this.pixi.Sprite(this.gradientTexture);
        sprite.anchor.set(0.5);
        sprite.tint = tint;
        sprite.alpha = alpha;
        sprite.scale.x = w / 256;
        sprite.scale.y = h / 96;
        sprite.x = x;
        sprite.y = y;
        this.layer.addChild(sprite);
        this.mounds.push(sprite);
      };
      mound(soil, 0.95, meadowHalf * 2.6, 130, 0, 22);
      mound(shade(grass, 0.34), 0.75, meadowHalf * 1.7, 70, -meadowHalf * 0.12, 8);
      mound(shade(grass, 0.28), 0.7, meadowHalf * 1.2, 56, meadowHalf * 0.24, 12);
      mound(0, 0.45, opts.trunkBase * 10 + 60, 30, 0, 4);
      const turf = new this.pixi.Graphics();
      const fieldDepth = Math.max(24, opts.coverDepth + 10);
      const rowStep = 10;
      const rowCount = Math.max(3, Math.ceil(fieldDepth / rowStep) + 1);
      for (let r = 0; r < rowCount; r++) {
        const depth01 = rowCount === 1 ? 1 : r / (rowCount - 1);
        const tone = 0.5 + depth01 * 0.55;
        const sizeScale = 0.78 + depth01 * 0.3;
        const clumpCount = Math.max(20, Math.round(meadowHalf / 26));
        const slotWidth = meadowHalf * 2 / clumpCount;
        for (let c = 0; c < clumpCount; c++) {
          const spread = -meadowHalf + (c + 0.5) * slotWidth + (rng() - 0.5) * slotWidth * 0.8;
          const baseY = r * rowStep + rng() * rowStep * 0.7;
          this.drawClumpBlades(
            turf,
            rng,
            shade(grass, tone),
            sizeScale,
            spread,
            baseY
          );
        }
      }
      this.layer.addChild(turf);
      turf.cacheAsTexture?.(true);
      this.turf = turf;
      this.leafTexture = this.leafTexture ?? buildLeafTexture(this.pixi);
      for (let i = 0; i < FALLEN_LEAVES; i++) {
        const sprite = new this.pixi.Sprite(this.leafTexture);
        sprite.anchor.set(0.5);
        sprite.tint = shade(leafColor(46, 0.35, 2e3), 1.1);
        sprite.alpha = 0.8;
        const size = 13 + rng() * 8;
        sprite.scale.x = size / 48;
        sprite.scale.y = size / 48 * 0.5;
        sprite.rotation = (rng() * 2 - 1) * 0.5 + Math.PI / 2;
        const side = rng() < 0.5 ? -1 : 1;
        sprite.x = side * (opts.trunkBase * 3 + 30 + rng() * (opts.trunkBase * 5 + 70));
        sprite.y = 8 + rng() * Math.max(10, opts.coverDepth * 0.6);
        this.layer.addChild(sprite);
        this.litter.push(sprite);
      }
    }
    /**
     * Draw one clump's blades into the shared turf Graphics: curved
     * strokes leaning from a shared root at (`originX`, `originY`), back
     * blades darker, front blades brighter.
     */
    drawClumpBlades(g, rng, grass, sizeScale, originX, originY) {
      for (let b = 0; b < BLADES_PER_CLUMP; b++) {
        const rootX = originX + (rng() * 2 - 1) * 42;
        const height = (9 + rng() * 19) * sizeScale;
        const lean = (rng() * 2 - 1) * 11;
        const midLean = lean * 0.35 + (rng() * 2 - 1) * 2;
        const depth = b / BLADES_PER_CLUMP;
        const color = shade(grass, 0.45 + depth * 0.6 + rng() * 0.1);
        g.moveTo(rootX, originY + 2).bezierCurveTo(
          rootX + midLean,
          originY - height * 0.45,
          rootX + lean * 0.8,
          originY - height * 0.8,
          rootX + lean,
          originY - height
        ).stroke({
          color,
          width: 1 + rng() * 0.9,
          alpha: 0.85,
          cap: "round"
        });
      }
    }
    clear() {
      for (const sprite of this.mounds) {
        this.layer.removeChild(sprite);
        sprite.destroy();
      }
      this.mounds.length = 0;
      if (this.turf) {
        this.layer.removeChild(this.turf);
        this.turf.destroy();
        this.turf = null;
      }
      for (const sprite of this.litter) {
        this.layer.removeChild(sprite);
        sprite.destroy();
      }
      this.litter.length = 0;
    }
    /** Release sprites + shared textures. */
    destroy() {
      this.clear();
      if (this.gradientTexture) {
        try {
          this.gradientTexture.destroy(true);
        } catch {
        }
        this.gradientTexture = null;
      }
      if (this.leafTexture) {
        try {
          this.leafTexture.destroy(true);
        } catch {
        }
        this.leafTexture = null;
      }
    }
  }
  const IVY_TEX_SIZE = 24;
  const MAX_IVY = 260;
  const IVY_SHADES = [1984032, 2577962, 1719586, 3105331];
  function computeIvyBudget(structure01) {
    const s = Math.min(1, Math.max(0, structure01));
    return Math.round(MAX_IVY * Math.pow(s, 0.8));
  }
  function buildIvyTexture(pixi) {
    const size = IVY_TEX_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[living-tree-wallpaper] 2D canvas context unavailable.");
    }
    const c = size / 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    for (const [lx, ly, lr] of [
      [c, c - 3, 6],
      [c - 5, c + 2, 5],
      [c + 5, c + 2, 5]
    ]) {
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(c - 4, c + 5);
    ctx.lineTo(c, size - 2);
    ctx.lineTo(c + 4, c + 5);
    ctx.closePath();
    ctx.fill();
    return pixi.Texture.from(canvas);
  }
  class IvyLayer {
    /**
     * @param layer Layer just above the branches (ivy hugs the wood).
     * @param pixi  The vendor Pixi namespace.
     */
    constructor(layer, pixi) {
      this.leaves = [];
      this.texture = null;
      this.settled = false;
      this.layer = layer;
      this.pixi = pixi;
    }
    /**
     * Cloak the thick wood in ivy, coverage from `structure01`.
     *
     * Climbing pattern: leaves fill from the ground UP — low structure
     * rings the trunk base, full structure reaches the first boughs.
     *
     * @param nodes       The revealed skeleton (radius from computeGirth).
     * @param structure01 Evergreen-content hormone, 0..1.
     * @param rng         Seeded PRNG — the cloak is stable per site.
     */
    populate(nodes, structure01, rng) {
      this.clear();
      this.settled = false;
      if (nodes.length < 2 || structure01 <= 0) {
        return;
      }
      this.texture = this.texture ?? buildIvyTexture(this.pixi);
      let trunkBase = 1;
      for (const node of nodes) {
        trunkBase = Math.max(trunkBase, node.radius);
      }
      const minHostRadius = Math.max(3.4, trunkBase * 0.26);
      const hosts = nodes.filter((n) => n.parent !== null && n.radius > minHostRadius).sort((a, b) => b.pos.y - a.pos.y);
      if (hosts.length === 0) {
        return;
      }
      const budget = Math.min(
        computeIvyBudget(structure01),
        hosts.length * 8
      );
      const reachable = Math.max(
        1,
        Math.round(hosts.length * (0.25 + 0.75 * structure01))
      );
      for (let i = 0; i < budget; i++) {
        const host = hosts[Math.floor(rng() * reachable)];
        const parent = nodes[host.parent];
        const t = rng();
        const bx = parent.pos.x + (host.pos.x - parent.pos.x) * t;
        const by = parent.pos.y + (host.pos.y - parent.pos.y) * t;
        const across = (rng() * 2 - 1) * host.radius * 0.85;
        const sprite = new this.pixi.Sprite(this.texture);
        sprite.anchor.set(0.5);
        sprite.tint = IVY_SHADES[Math.floor(rng() * IVY_SHADES.length)];
        sprite.alpha = 0;
        sprite.scale.set((6 + rng() * 5) / IVY_TEX_SIZE);
        sprite.rotation = (rng() * 2 - 1) * Math.PI;
        sprite.x = bx + across;
        sprite.y = by;
        this.layer.addChild(sprite);
        this.leaves.push({
          sprite,
          phase: rng() * Math.PI * 2,
          alphaMax: 0.8 + rng() * 0.2
        });
      }
    }
    /**
     * Fade in, then go fully static — ivy hugs wood that doesn't sway,
     * and per-frame work on ~200 settled sprites is money for nothing.
     *
     * @param dt Delta time (seconds).
     * @param t  Elapsed scene time (seconds).
     */
    update(dt, t) {
      if (this.settled) {
        return;
      }
      let pending = false;
      for (const leaf of this.leaves) {
        if (leaf.sprite.alpha < leaf.alphaMax) {
          leaf.sprite.alpha = Math.min(leaf.alphaMax, leaf.sprite.alpha + dt * 0.7);
          pending = true;
        }
      }
      this.settled = !pending && this.leaves.length > 0;
    }
    clear() {
      for (const leaf of this.leaves) {
        this.layer.removeChild(leaf.sprite);
        leaf.sprite.destroy();
      }
      this.leaves.length = 0;
    }
    /** Release sprites + the shared texture. */
    destroy() {
      this.clear();
      if (this.texture) {
        this.texture.destroy(true);
        this.texture = null;
      }
    }
  }
  const SWAY_X = 16;
  const SWAY_Y = 3.5;
  class WindField {
    constructor() {
      this.strength = 0;
    }
    /**
     * Sample the wind displacement at a point and time. Callers scale the
     * result by the element's compliance before applying it.
     *
     * @param x Reference-space x.
     * @param y Reference-space y.
     * @param t Elapsed time (seconds).
     * @return Displacement vector.
     */
    sample(x, y, t) {
      if (this.strength <= 0) {
        return { x: 0, y: 0 };
      }
      const gust = Math.sin(t * 0.9 + x * 4e-3 + y * 3e-3);
      const breeze = Math.sin(t * 2.1 + y * 6e-3 + 1.7);
      const shiver = Math.sin(t * 5.3 + x * 0.01 + 4.1);
      const s = this.strength;
      return {
        x: s * SWAY_X * (0.62 * gust + 0.28 * breeze + 0.1 * shiver),
        y: s * SWAY_Y * (0.5 * breeze + 0.5 * shiver)
      };
    }
    /**
     * Retune wind strength live (e.g. after a traffic re-poll, or set to 0
     * for reduced-motion).
     *
     * @param w01 Normalised wind strength, 0..1.
     */
    setStrength(w01) {
      this.strength = Math.min(1, Math.max(0, w01));
    }
  }
  const BACKDROP_CSS = "#141a2e";
  function sproutSnapshot() {
    return {
      siteUrl: window.location.origin,
      siteName: document.title || "",
      installEpoch: 0,
      siteAgeDays: 0,
      totalPosts: 0,
      totalPages: 0,
      totalCategories: 0,
      totalTags: 0,
      totalComments: 0,
      activeUsers: 0,
      traffic: 0,
      seoHealth: 0.7,
      performance: 0.8,
      branches: []
    };
  }
  async function mountScene({ container, snapshot, prefersReducedMotion }) {
    const pixi = getPixi();
    if (!pixi) {
      throw new Error(
        "[living-tree-wallpaper] window.PIXI is undefined; declare `needs: ['pixijs']` on the wallpaper def so the shell loads it before mount."
      );
    }
    const priorBackground = container.style.background;
    container.style.background = BACKDROP_CSS;
    const app = new pixi.Application();
    await app.init({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      sharedTicker: false
    });
    container.appendChild(app.canvas);
    let dna = snapshot ?? sproutSnapshot();
    let hormones = buildHormones(dna);
    let rng = mulberry32(hash32(`${dna.siteUrl}|${dna.siteName}|${dna.installEpoch}`));
    let envelope = buildEnvelope(hormones.age01, hormones.vigor01, rng);
    let cfg = buildGrowthConfig(envelope, hormones.vigor01);
    let canopy = canopyHue(`${dna.siteUrl}|${dna.siteName}`);
    const wind = new WindField();
    wind.setStrength(prefersReducedMotion ? 0 : hormones.wind01);
    const growCanonical = () => {
      const sim = new GrowthSimulator(envelope, cfg, rng);
      let guard = 0;
      while (!sim.done && guard++ < 5e3) {
        sim.step(10);
      }
      return sim.nodes;
    };
    let fullNodes = growCanonical();
    let depthCap = maxDepthForAge(hormones.age01);
    let targetCount = revealCountForAge(
      countWithinDepth(fullNodes, depthCap),
      hormones.age01
    );
    let revealCount = prefersReducedMotion ? targetCount : 2;
    let revealed = revealSkeleton(fullNodes, revealCount, depthCap);
    let finalRevealed = revealSkeleton(fullNodes, targetCount, depthCap);
    const currentTrunkBase = () => trunkGirthForAge(hormones.age01);
    const finalExtent = () => {
      let height = 40;
      let halfWidth = 30;
      for (const node of finalRevealed) {
        height = Math.max(height, -node.pos.y);
        halfWidth = Math.max(halfWidth, Math.abs(node.pos.x));
      }
      return { height: height + cfg.segLen * 2, halfWidth: halfWidth + cfg.segLen * 2 };
    };
    const sky = new SkyLayer(pixi, app.stage);
    const treeRoot = new pixi.Container();
    const treeBody = new pixi.Container();
    const groundLayer = new pixi.Container();
    const flowerFieldLayer = new pixi.Container();
    const canopyBackLayer = new pixi.Container();
    const branchLayer = new pixi.Container();
    const ivyLayer = new pixi.Container();
    const leafLayer = new pixi.Container();
    const flowerLayer = new pixi.Container();
    const butterflyLayer = new pixi.Container();
    const fireflyLayer = new pixi.Container();
    treeBody.addChild(
      groundLayer,
      flowerFieldLayer,
      canopyBackLayer,
      branchLayer,
      ivyLayer,
      leafLayer,
      flowerLayer,
      butterflyLayer
    );
    treeRoot.addChild(treeBody, fireflyLayer);
    app.stage.addChild(treeRoot);
    const refreshSky = () => {
      const state = skyForTime(currentHour());
      sky.applyState(state);
      treeBody.alpha = 0.62 + 0.38 * state.light01;
      fireflyLayer.alpha = 0.15 + 0.85 * (1 - state.light01);
    };
    const ground = new GroundLayer(groundLayer, pixi);
    const flowerField = new FlowerField(flowerFieldLayer, pixi);
    let meadowDepth = 20;
    const buildGround = () => {
      const scale = treeRoot.scale.x || 1;
      const canvasW = app.canvas.clientWidth || container.clientWidth || 800;
      const canvasH = app.canvas.clientHeight || container.clientHeight || 600;
      const span = finalExtent().halfWidth * 1.3 + 80;
      const coverHalfWidth = canvasW / (2 * scale) + 40;
      meadowDepth = Math.max(0, canvasH - treeRoot.y) / scale + 8;
      ground.build({
        span,
        coverHalfWidth,
        coverDepth: meadowDepth,
        trunkBase: currentTrunkBase(),
        health01: hormones.health01,
        siteKey: `${dna.siteUrl}|${dna.siteName}`
      });
      flowerField.build({
        categories: dna.totalCategories,
        fieldHalf: Math.min(coverHalfWidth * 0.95, span * 1.35 + 90),
        coverDepth: meadowDepth,
        trunkBase: currentTrunkBase(),
        siteKey: `${dna.siteUrl}|${dna.siteName}`
      });
    };
    const branchGraphics = buildBranchMesh(revealed, pixi);
    branchLayer.addChild(branchGraphics);
    let chains = [];
    let chainNodeCount = -1;
    const currentChains = () => {
      if (revealed.length !== chainNodeCount) {
        chains = buildChains(revealed);
        chainNodeCount = revealed.length;
      }
      return chains;
    };
    const leaves = new LeafGenerator(canopyBackLayer, leafLayer, pixi);
    const falling = new FallingLeaves(leafLayer, pixi);
    const ivy = new IvyLayer(ivyLayer, pixi);
    const bloom = new BloomEngine(flowerLayer, pixi);
    const butterflies = new ButterflyLayer(butterflyLayer, pixi);
    const fireflies = new FireflyLayer(fireflyLayer, pixi);
    const fit = () => {
      const w = app.canvas.clientWidth || container.clientWidth || 800;
      const h = app.canvas.clientHeight || container.clientHeight || 600;
      const extent = finalExtent();
      const scale = Math.min(
        h * 0.84 / Math.max(160, extent.height),
        w * 0.8 / Math.max(160, extent.halfWidth * 2),
        // Never blow a sprout up to fill a 4K desktop.
        1.6
      );
      treeRoot.scale.set(scale);
      treeRoot.x = w / 2;
      treeRoot.y = h - Math.max(12, h * 0.04);
      sky.resize(w, h, treeRoot.y - 4 * scale);
    };
    fit();
    refreshSky();
    buildGround();
    const resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(container);
    let t = 0;
    let decorated = false;
    let animating = !prefersReducedMotion;
    const decorate = () => {
      decorated = true;
      computeGirth(revealed, currentTrunkBase());
      drawBranches(branchGraphics, currentChains(), revealed);
      branchGraphics.cacheAsTexture?.(true);
      leaves.populate(revealed, hormones, canopy, dna, rng);
      falling.setSources(leaves.sources(48));
      ivy.populate(revealed, hormones.structure01, rng);
      bloom.apply(hormones.bloom01, leaves.placements(), rng);
      const extent = finalExtent();
      butterflies.populate(
        dna.totalTags,
        flowerField.targets(),
        {
          minX: -extent.halfWidth,
          maxX: extent.halfWidth,
          minY: -extent.height * 0.55,
          maxY: Math.max(4, meadowDepth * 0.6)
        },
        rng
      );
      fireflies.setBounds({
        minX: -extent.halfWidth,
        maxX: extent.halfWidth,
        minY: -extent.height,
        maxY: -extent.height * 0.35
      });
      fireflies.setCount(hormones.spark);
    };
    let skyClock = 0;
    let foliageFlip = false;
    let foliageDt = 0;
    const tick = (ticker) => {
      if (!animating) {
        return;
      }
      const dt = ticker.deltaTime / 60;
      t += dt;
      sky.tick(t);
      skyClock += dt;
      if (skyClock >= 12) {
        skyClock = 0;
        refreshSky();
      }
      if (revealCount < targetCount) {
        revealCount = Math.min(targetCount, revealCount + cfg.growthRate);
        revealed = revealSkeleton(fullNodes, revealCount, depthCap);
        computeGirth(revealed, currentTrunkBase());
        drawBranches(branchGraphics, currentChains(), revealed);
        if (revealCount >= targetCount) {
          decorate();
        }
        return;
      }
      if (!decorated) {
        decorate();
      }
      foliageDt += dt;
      foliageFlip = !foliageFlip;
      if (foliageFlip) {
        leaves.update(foliageDt, wind, t);
        bloom.update(foliageDt, t, (x, y) => wind.sample(x, y, t));
        flowerField.update(foliageDt, t, (x, y) => wind.sample(x, y, t));
        foliageDt = 0;
      }
      falling.update(dt, wind, t);
      ivy.update(dt, t);
      butterflies.update(dt, t);
      fireflies.update(dt, t);
    };
    app.ticker.add(tick);
    const growInstantly = () => {
      revealCount = targetCount;
      revealed = revealSkeleton(fullNodes, revealCount, depthCap);
      computeGirth(revealed, currentTrunkBase());
      drawBranches(branchGraphics, currentChains(), revealed);
      decorate();
      leaves.update(60, wind, t);
      ivy.update(60, t);
      bloom.update(60, t, () => ({ x: 0, y: 0 }));
      flowerField.update(60, t, () => ({ x: 0, y: 0 }));
    };
    const applyDna = (next, instant) => {
      dna = next;
      hormones = buildHormones(dna);
      rng = mulberry32(hash32(`${dna.siteUrl}|${dna.siteName}|${dna.installEpoch}`));
      envelope = buildEnvelope(hormones.age01, hormones.vigor01, rng);
      cfg = buildGrowthConfig(envelope, hormones.vigor01);
      canopy = canopyHue(`${dna.siteUrl}|${dna.siteName}`);
      wind.setStrength(prefersReducedMotion ? 0 : hormones.wind01);
      branchGraphics.cacheAsTexture?.(false);
      fullNodes = growCanonical();
      depthCap = maxDepthForAge(hormones.age01);
      targetCount = revealCountForAge(
        countWithinDepth(fullNodes, depthCap),
        hormones.age01
      );
      finalRevealed = revealSkeleton(fullNodes, targetCount, depthCap);
      revealCount = targetCount;
      revealed = revealSkeleton(fullNodes, revealCount, depthCap);
      chainNodeCount = -1;
      decorated = false;
      leaves.populate([], hormones, canopy, dna, rng);
      falling.setSources([]);
      ivy.populate([], 0, rng);
      bloom.apply(0, [], rng);
      butterflies.clear();
      fireflies.setCount(0);
      fit();
      refreshSky();
      buildGround();
      drawBranches(branchGraphics, currentChains(), revealed);
      {
        growInstantly();
      }
      if (prefersReducedMotion) {
        app.renderer.render(app.stage);
      }
    };
    if (prefersReducedMotion) {
      growInstantly();
      animating = false;
      app.renderer.render(app.stage);
      app.ticker.stop();
    }
    const setHourOverride = (hour) => {
      const w = window;
      if (hour === null) {
        delete w.desktopModeLivingTreeHourOverride;
      } else {
        w.desktopModeLivingTreeHourOverride = hour;
      }
    };
    let disposeTuner = null;
    const onWindowClick = createTrunkClickGesture({
      isEnabled: () => !disposeTuner && isDeveloperModeEnabled(),
      toLocal: (clientX, clientY) => {
        const rect = app.canvas.getBoundingClientRect();
        const scale = treeRoot.scale.x || 1;
        return {
          lx: (clientX - rect.left - treeRoot.x) / scale,
          ly: (clientY - rect.top - treeRoot.y) / scale
        };
      },
      // Hit-test against the REVEALED tree's proportions, not the
      // mature canonical envelope — a sapling's trunk is short.
      isHit: (lx, ly) => {
        const extent = finalExtent();
        return isTrunkHit(lx, ly, {
          ...envelope,
          heightMax: extent.height,
          trunkBaseGirth: currentTrunkBase()
        });
      },
      onTrigger: () => {
        disposeTuner = openDebugPanel({
          snapshot: dna,
          hour: currentHour(),
          onChange: (edited) => applyDna(edited),
          onHourChange: (hour) => {
            setHourOverride(hour);
            refreshSky();
            if (prefersReducedMotion) {
              app.renderer.render(app.stage);
            }
          },
          onClose: () => {
            disposeTuner = null;
            setHourOverride(null);
            refreshSky();
          }
        });
      }
    });
    window.addEventListener("click", onWindowClick);
    return {
      destroy() {
        window.removeEventListener("click", onWindowClick);
        if (disposeTuner) {
          disposeTuner();
          disposeTuner = null;
          setHourOverride(null);
        }
        resizeObserver.disconnect();
        app.ticker.stop();
        leaves.destroy();
        falling.destroy();
        ivy.destroy();
        bloom.destroy();
        butterflies.destroy();
        fireflies.destroy();
        flowerField.destroy();
        ground.destroy();
        sky.destroy();
        app.destroy({ removeView: true }, { children: true, texture: true });
        container.style.background = priorBackground;
      },
      setAnimating(playing) {
        animating = playing && !prefersReducedMotion;
        if (animating) {
          app.ticker.start();
        } else {
          app.ticker.stop();
        }
      }
    };
  }
  const WALLPAPER_ID = "wp-living-tree";
  const PREVIEW = "linear-gradient(180deg, #24304a 0%, #6b4a63 70%, #b5744f 100%)";
  function restRoot() {
    const settings = window.wpApiSettings;
    return settings?.root ?? "/wp-json/";
  }
  async function fetchSnapshot() {
    try {
      const res = await trackedFetch(
        `${restRoot()}desktop-mode/v1/living-tree/snapshot`,
        void 0,
        { source: "desktop-mode/living-tree", silent: true }
      );
      if (!res.ok) {
        return null;
      }
      return await res.json();
    } catch {
      return null;
    }
  }
  const PREVIEW_PARAMS = {
    siteAgeDays: 540,
    totalPosts: 120,
    totalPages: 8,
    totalCategories: 6,
    totalTags: 24,
    totalComments: 260,
    activeUsers: 3,
    traffic: 420,
    seoHealth: 0.85,
    performance: 0.9
  };
  function numParam(params, key) {
    const value = params[key];
    return typeof value === "number" && Number.isFinite(value) ? value : PREVIEW_PARAMS[key];
  }
  function showcaseSnapshot(params) {
    return {
      siteUrl: window.location.origin,
      siteName: typeof params.siteName === "string" && params.siteName !== "" ? params.siteName : "living-tree-preview",
      installEpoch: 0,
      siteAgeDays: numParam(params, "siteAgeDays"),
      totalPosts: numParam(params, "totalPosts"),
      totalPages: numParam(params, "totalPages"),
      totalCategories: numParam(params, "totalCategories"),
      totalTags: numParam(params, "totalTags"),
      totalComments: numParam(params, "totalComments"),
      activeUsers: numParam(params, "activeUsers"),
      traffic: numParam(params, "traffic"),
      seoHealth: numParam(params, "seoHealth"),
      performance: numParam(params, "performance"),
      branches: []
    };
  }
  const def = {
    id: WALLPAPER_ID,
    label: "Living Tree",
    type: "canvas",
    preview: PREVIEW,
    previewParams: PREVIEW_PARAMS,
    /**
     * Live tile preview for the OS Settings picker. Grows a showcase
     * tree from {@link showcaseSnapshot} — never the real site DNA, so
     * a brand-new site still previews the wallpaper at full glory. The
     * reveal animation plays at normal speed (a mature tree grows in a
     * couple of seconds), which doubles as the preview's motion.
     */
    renderPreview: async (container, ctx) => {
      const scene = await mountScene({
        container,
        snapshot: showcaseSnapshot(ctx.params),
        prefersReducedMotion: ctx.prefersReducedMotion
      });
      return () => scene.destroy();
    },
    needs: ["pixijs"],
    mount: async (container, ctx) => {
      const snapshot = await fetchSnapshot();
      const scene = await mountScene({
        container,
        snapshot,
        prefersReducedMotion: ctx.prefersReducedMotion
      });
      const NAMESPACE = "desktop-mode/living-tree";
      const HOOK = "desktop-mode.wallpaper.visibility";
      const api = window.wp?.desktop;
      const visibilityHandler = (...args) => {
        const detail = args[0];
        if (!detail || detail.id !== WALLPAPER_ID) {
          return;
        }
        scene.setAnimating(detail.state === "visible");
      };
      api?.hooks?.addAction(HOOK, `${NAMESPACE}/visibility`, visibilityHandler);
      return () => {
        api?.hooks?.removeAction(HOOK, `${NAMESPACE}/visibility`);
        scene.destroy();
      };
    }
  };
  window.desktopModeWallpapers = window.desktopModeWallpapers || {};
  window.desktopModeWallpapers[WALLPAPER_ID] = def;
})();
