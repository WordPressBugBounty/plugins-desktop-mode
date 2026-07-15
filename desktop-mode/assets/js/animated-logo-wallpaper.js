(function() {
  "use strict";
  const CONFIG = {
    /** Grid stride when sampling the logo PNG. Smaller → denser particle field → heavier frame cost. */
    sampleStride: 7,
    /** Alpha threshold (0–255) for "this pixel is part of the logo." */
    alphaThreshold: 128,
    /**
     * Target logo rendering width in CSS pixels. Capped at this value
     * on huge screens; on normal screens we take 72% of the smaller
     * shell axis so the logo reads as "hero-sized" without cropping.
     */
    targetLogoWidth: 1e3,
    /** Fraction of the smaller shell dimension the logo is allowed to occupy. */
    logoShellFraction: 0.72,
    /**
     * Logo width (CSS px) at which particle sprites render at their
     * authored `spriteScale*` size. Below it, sprite scale shrinks
     * proportionally — in a small container (an OS Settings preview
     * tile) desktop-sized additive sprites pile into a single blown-out
     * white blob instead of a legible particle logo. Never scales UP
     * past 1× so full-desktop mounts look exactly as before.
     */
    spriteReferenceWidth: 700,
    /**
     * Spring stiffness — how hard a particle pulls back to its home.
     * Lower = slower, floatier return. At 0.015 the natural-frequency
     * period is ~50 frames (~0.85 s at 60 fps), so particles visibly
     * drift back after a cursor flick rather than snapping home.
     */
    springK: 0.015,
    /** Velocity damping per tick. 1 = no damping, 0 = instant stop. */
    damping: 0.86,
    /**
     * Velocity floor below which a particle is considered at rest —
     * its position snaps to its home and its velocity zeroes out. Kills
     * the subpixel jitter that made the resting logo flicker.
     */
    restVelocityEpsilon: 0.02,
    /**
     * Sand-drag brush radius in CSS pixels. Particles within this
     * distance of the cursor pick up a fraction of the cursor's
     * per-frame displacement — they're carried in the direction the
     * cursor is moving, not pushed away from its position. Beyond
     * the radius the cursor has no effect.
     */
    dragRadius: 150,
    /**
     * Base fraction of the cursor's per-frame displacement that a
     * particle inherits when it's at the dead center of the brush.
     * At 0.22 a particle in the brush core picks up roughly a
     * quarter of the cursor's velocity per frame — enough to read
     * as "dragged" without the particles chasing the cursor.
     */
    dragStrength: 0.22,
    /**
     * Super-linear speed boost. For every {@link dragBoostRefSpeed}
     * pixels-per-frame of cursor speed, the applied drag force is
     * additionally scaled by this factor. Kept gentle (0.3) so fast
     * flicks feel a bit punchier than linear without flinging
     * particles across the screen.
     */
    dragBoost: 0.3,
    /** Reference cursor speed for the boost curve (CSS px / frame). */
    dragBoostRefSpeed: 40,
    /**
     * Cap on the mouse delta a single frame can accumulate. Prevents
     * a wild delta from a stale pointer (e.g. first pointermove after
     * the cursor entered from offscreen) from launching particles
     * into orbit. A real fast mouse rarely exceeds 80 px/frame.
     */
    maxMouseDelta: 80,
    /**
     * Radial-gradient brush texture size. Larger = smoother edges at
     * the cost of texture memory. 128px is plenty — sprites scale
     * down to 10–30 px range for rendering so we have headroom.
     */
    brushSize: 128,
    /** Min/max sprite scale relative to the brush texture size. */
    spriteScaleMin: 0.1,
    spriteScaleMax: 0.26,
    /** Min/max per-particle alpha. */
    spriteAlphaMin: 0.55,
    spriteAlphaMax: 0.92
  };
  const PARTICLE_PALETTE = [
    // Rainbow six (higher weight — the flag's main body).
    16726843,
    16726843,
    // red
    16747562,
    16747562,
    // orange
    16767293,
    16767293,
    // yellow
    5036388,
    5036388,
    // green
    4104447,
    4104447,
    // blue
    11037695,
    11037695,
    // purple
    // Trans flag stripes.
    16757703,
    // pink
    8380415,
    // light blue
    16777215,
    // white
    // POC inclusion stripe.
    13140042
    // warm brown (boosted for visibility under additive)
  ];
  const BACKDROP_CSS = "radial-gradient(circle at 50% 50%, #1e40af 0%, #152a6b 45%, #0a1024 100%)";
  async function mountScene({ container, logoUrl, prefersReducedMotion }) {
    const pixi = window.PIXI;
    if (!pixi) {
      throw new Error(
        "[animated-logo-wallpaper] window.PIXI is undefined; declare `needs: ['pixijs']` on the wallpaper def so the shell loads it before mount."
      );
    }
    const homes = await sampleLogoHomes(logoUrl);
    const priorBackground = container.style.background;
    container.style.background = BACKDROP_CSS;
    const app = new pixi.Application();
    await app.init({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });
    container.appendChild(app.canvas);
    applyCanvasLayout(app.canvas);
    const brushTexture = buildBrushTexture(pixi);
    const particleLayer = new pixi.Container();
    app.stage.addChild(particleLayer);
    const n = homes.length;
    const homeX = new Float32Array(n);
    const homeY = new Float32Array(n);
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const sprites = new Array(n);
    const baseScale = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const sprite = new pixi.Sprite(brushTexture);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.tint = PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)];
      const scale = CONFIG.spriteScaleMin + Math.random() * (CONFIG.spriteScaleMax - CONFIG.spriteScaleMin);
      baseScale[i] = scale;
      sprite.scale.set(scale);
      sprite.alpha = CONFIG.spriteAlphaMin + Math.random() * (CONFIG.spriteAlphaMax - CONFIG.spriteAlphaMin);
      particleLayer.addChild(sprite);
      sprites[i] = sprite;
    }
    let logoScale = 1;
    let logoOffsetX = 0;
    let logoOffsetY = 0;
    const computeLayout = () => {
      const w = app.canvas.clientWidth;
      const h = app.canvas.clientHeight;
      const target = Math.min(
        CONFIG.targetLogoWidth,
        Math.min(w, h) * CONFIG.logoShellFraction
      );
      logoScale = target;
      logoOffsetX = (w - target) / 2;
      logoOffsetY = (h - target) / 2;
      const spriteFactor = Math.min(
        1,
        target / CONFIG.spriteReferenceWidth
      );
      for (let i = 0; i < n; i++) {
        sprites[i].scale.set(baseScale[i] * spriteFactor);
        homeX[i] = logoOffsetX + homes[i][0] * logoScale;
        homeY[i] = logoOffsetY + homes[i][1] * logoScale;
        if (x[i] === 0 && y[i] === 0) {
          x[i] = homeX[i];
          y[i] = homeY[i];
        }
      }
    };
    computeLayout();
    const resizeObserver = new ResizeObserver(() => computeLayout());
    resizeObserver.observe(container);
    let pointerX = -1e6;
    let pointerY = -1e6;
    let pointerActive = false;
    let mouseDx = 0;
    let mouseDy = 0;
    const onPointerMove = (e) => {
      const rect = app.canvas.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      if (pointerActive) {
        const rawDx = nx - pointerX;
        const rawDy = ny - pointerY;
        const cap = CONFIG.maxMouseDelta;
        mouseDx += Math.max(-cap, Math.min(cap, rawDx));
        mouseDy += Math.max(-cap, Math.min(cap, rawDy));
      }
      pointerX = nx;
      pointerY = ny;
      pointerActive = true;
    };
    const onPointerLeave = () => {
      pointerX = -1e6;
      pointerY = -1e6;
      pointerActive = false;
      mouseDx = 0;
      mouseDy = 0;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    let animating = !prefersReducedMotion;
    const syncSprites = () => {
      for (let i = 0; i < n; i++) {
        sprites[i].x = x[i];
        sprites[i].y = y[i];
      }
    };
    const tick = () => {
      if (animating) {
        step(
          n,
          homeX,
          homeY,
          x,
          y,
          vx,
          vy,
          pointerX,
          pointerY,
          pointerActive ? mouseDx : 0,
          pointerActive ? mouseDy : 0
        );
      }
      mouseDx = 0;
      mouseDy = 0;
      syncSprites();
    };
    app.ticker.add(tick);
    syncSprites();
    if (!animating) {
      app.renderer.render(app.stage);
      app.ticker.stop();
    }
    return {
      destroy() {
        resizeObserver.disconnect();
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerleave", onPointerLeave);
        app.destroy({ removeView: true }, {
          children: true,
          texture: true,
          textureSource: true,
          context: true
        });
        try {
          brushTexture.destroy(true);
        } catch {
        }
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
  function step(n, homeX, homeY, x, y, vx, vy, pointerX, pointerY, mouseDx, mouseDy) {
    const {
      springK,
      damping,
      dragRadius,
      dragStrength,
      dragBoost,
      dragBoostRefSpeed,
      restVelocityEpsilon
    } = CONFIG;
    const dragRadiusSq = dragRadius * dragRadius;
    const restEpsSq = restVelocityEpsilon * restVelocityEpsilon;
    const restPosEps = 0.25;
    const restPosEpsSq = restPosEps * restPosEps;
    const mouseSpeed = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);
    const speedMultiplier = 1 + mouseSpeed / dragBoostRefSpeed * dragBoost;
    const dragFx = mouseDx * dragStrength * speedMultiplier;
    const dragFy = mouseDy * dragStrength * speedMultiplier;
    const cursorMoving = mouseDx !== 0 || mouseDy !== 0;
    for (let i = 0; i < n; i++) {
      const dhx = homeX[i] - x[i];
      const dhy = homeY[i] - y[i];
      let fx = dhx * springK;
      let fy = dhy * springK;
      const dx = x[i] - pointerX;
      const dy = y[i] - pointerY;
      const distSq = dx * dx + dy * dy;
      let disturbed = false;
      if (cursorMoving && distSq < dragRadiusSq) {
        const t = 1 - Math.sqrt(distSq) / dragRadius;
        const falloff = t * t;
        fx += dragFx * falloff;
        fy += dragFy * falloff;
        disturbed = true;
      }
      const nvx = (vx[i] + fx) * damping;
      const nvy = (vy[i] + fy) * damping;
      if (!disturbed && nvx * nvx + nvy * nvy < restEpsSq && dhx * dhx + dhy * dhy < restPosEpsSq) {
        x[i] = homeX[i];
        y[i] = homeY[i];
        vx[i] = 0;
        vy[i] = 0;
        continue;
      }
      vx[i] = nvx;
      vy[i] = nvy;
      x[i] += nvx;
      y[i] += nvy;
    }
  }
  function buildBrushTexture(pixi) {
    const size = CONFIG.brushSize;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[animated-logo-wallpaper] 2D canvas context unavailable.");
    }
    const center = size / 2;
    const gradient = ctx.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      center
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.18, "rgba(255, 255, 255, 0.85)");
    gradient.addColorStop(0.42, "rgba(255, 255, 255, 0.28)");
    gradient.addColorStop(0.75, "rgba(255, 255, 255, 0.06)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return pixi.Texture.from(canvas);
  }
  async function sampleLogoHomes(url) {
    const img = await loadImage(url);
    const maxSide = 400;
    const ratio = img.naturalWidth / img.naturalHeight;
    const sampleWidth = ratio >= 1 ? maxSide : Math.round(maxSide * ratio);
    const sampleHeight = ratio >= 1 ? Math.round(maxSide / ratio) : maxSide;
    const off = document.createElement("canvas");
    off.width = sampleWidth;
    off.height = sampleHeight;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return [];
    }
    ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
    const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const homes = [];
    const stride = CONFIG.sampleStride;
    const threshold = CONFIG.alphaThreshold;
    for (let row = 0; row < sampleHeight; row += stride) {
      const rowOffset = row / stride % 2 === 0 ? 0 : stride / 2;
      for (let col = 0; col < sampleWidth; col += stride) {
        const px = Math.min(sampleWidth - 1, Math.round(col + rowOffset));
        const py = row;
        const alpha = data[(py * sampleWidth + px) * 4 + 3];
        if (alpha > threshold) {
          homes.push([px / sampleWidth, py / sampleHeight]);
        }
      }
    }
    return homes;
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load logo: ${url}`));
      img.src = url;
    });
  }
  function applyCanvasLayout(canvas) {
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }
  const WALLPAPER_ID = "wp-animated-logo";
  const PREVIEW = "radial-gradient(circle at 50% 50%, #1e3a8a 0%, #0b0f25 100%)";
  const def = {
    id: WALLPAPER_ID,
    label: "Animated WordPress Logo",
    type: "canvas",
    preview: PREVIEW,
    /**
     * Live tile preview for the OS Settings picker — the real particle
     * scene at tile scale. The scene sizes itself to its container, so
     * no dedicated preview path is needed; the swatch just gets a small
     * swarm.
     */
    renderPreview: async (container, ctx) => {
      const scene = await mountScene({
        container,
        logoUrl: `${ctx.pluginUrl}/assets/images/wp-logo.png`,
        prefersReducedMotion: ctx.prefersReducedMotion
      });
      return () => scene.destroy();
    },
    needs: ["pixijs"],
    mount: async (container, ctx) => {
      const logoUrl = `${ctx.pluginUrl}/assets/images/wp-logo.png`;
      const scene = await mountScene({
        container,
        logoUrl,
        prefersReducedMotion: ctx.prefersReducedMotion
      });
      const NAMESPACE = "desktop-mode/animated-logo";
      const HOOK = "desktop-mode.wallpaper.visibility";
      const api = window.wp?.desktop;
      const visibilityHandler = (...args) => {
        const detail = args[0];
        if (!detail || detail.id !== WALLPAPER_ID) {
          return;
        }
        scene.setAnimating(detail.state === "visible");
      };
      api?.hooks?.addAction(
        HOOK,
        `${NAMESPACE}/visibility`,
        visibilityHandler
      );
      return () => {
        api?.hooks?.removeAction(HOOK, `${NAMESPACE}/visibility`);
        scene.destroy();
      };
    }
  };
  window.desktopModeWallpapers = window.desktopModeWallpapers || {};
  window.desktopModeWallpapers[WALLPAPER_ID] = def;
})();
