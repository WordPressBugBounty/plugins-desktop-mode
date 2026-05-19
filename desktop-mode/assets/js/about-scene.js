(function() {
  "use strict";
  const CONFIG = {
    /** Grid stride when sampling the logo PNG. Lower → denser → heavier. */
    sampleStride: 2,
    /** Alpha threshold (0–255) above which a sampled pixel becomes a particle home. */
    alphaThreshold: 64,
    /** Cap on total particles — guards against absurd logo sizes. */
    maxParticles: 8e3,
    /** Particle "home" layout: fraction of the canvas the logo occupies. */
    logoFraction: 0.78,
    /**
     * Vertical centre of the logo as a fraction of canvas height. Pushed
     * a touch below 0.5 because the title text sits above the logotype
     * — visual centre vs. geometric centre. Tuned so the white space
     * above the eyebrow and below the hint feels balanced.
     */
    logoCenterY: 0.55,
    /** Spring stiffness toward the home position. */
    springK: 0.018,
    /** Velocity damping per tick — lower = more lethargic, more drift. */
    damping: 0.88,
    /** Velocity floor below which a particle snaps to its home. */
    restVelocityEpsilon: 0.025,
    /**
     * Cursor magnetic radius (CSS pixels). Particles inside this disc
     * feel an inverse-square pull toward the pointer.
     */
    magnetRadius: 220,
    /** Magnetic strength scalar — higher = grabbier, but easy to over-do. */
    magnetStrength: 1600,
    /** Cap the per-particle magnetic force so deep-radius particles don't teleport. */
    magnetForceCap: 1.6,
    /**
     * Sand-drag brush radius — particles within this distance of the
     * cursor inherit a fraction of its per-frame displacement, so a
     * fast pan whips them along the cursor's direction of travel
     * (independent of the magnetic pull above).
     */
    dragRadius: 140,
    dragStrength: 0.18,
    maxMouseDelta: 80,
    /** Click shockwave: peak outward push at the impact ring. */
    shockwavePeak: 14,
    /** Speed (CSS px / frame) at which the shockwave ring expands outward. */
    shockwaveSpeed: 22,
    /** Frames a shockwave lives before it's culled. */
    shockwaveLifeFrames: 75,
    /**
     * Boids: search radius for neighbours when computing separation /
     * alignment. Tighter than the standard preset because the dense
     * particle field makes a small radius give a beautiful subtle
     * "shimmer" without the loop blowing up O(neighbours).
     */
    boidsRadius: 14,
    /** Boids: separation force scalar — pushes apart particles that are too close. */
    separationStrength: 0.01,
    /** Boids: alignment force scalar — biases velocity toward neighbour mean. */
    alignmentStrength: 5e-3,
    /** Cell size of the spatial hash used by the boids loop. */
    gridCell: 18,
    /** Sparkle pool size — borrowed-only, so capping it costs nothing on idle frames. */
    sparkleCount: 128,
    /** Per-frame chance of spawning a sparkle from any particle. */
    sparkleSpawnRate: 0.6,
    /** Sparkle frames-of-life. */
    sparkleLifeFrames: 80,
    /** Particle brush texture pixel size. Big enough to look soft when scaled. */
    brushSize: 96,
    /** Sparkle brush texture pixel size — smaller = sharper twinkle. */
    sparkleBrushSize: 32,
    /**
     * Per-particle sprite size range — smaller than the wallpaper variant
     * because the field is much denser; larger sprites would mush the
     * lettering into a glow blob.
     */
    spriteScaleMin: 0.05,
    spriteScaleMax: 0.13,
    /** Per-particle alpha range. */
    spriteAlphaMin: 0.55,
    spriteAlphaMax: 0.95,
    /** Hue cycle period in frames (~7s at 60fps). */
    hueCycleFrames: 420
  };
  const HUE_PALETTE = [
    5162495,
    // sky cyan (the Automattic blue dot, brightened)
    8031487,
    // periwinkle
    11889663,
    // amethyst
    16735441,
    // electric magenta
    16744043,
    // sunset coral
    16765286,
    // soft gold
    5036472,
    // mint
    5162495
    // back to start (closes the loop seamlessly)
  ];
  const BACKDROP_CSS = "radial-gradient(circle at 50% 35%, #1b3461 0%, #0c1733 55%, #050918 100%)";
  async function mountAboutScene(opts) {
    const { container, logoUrl, prefersReducedMotion, labels } = opts;
    const pixi = window.PIXI;
    if (!pixi) {
      throw new Error(
        "[desktop-mode/about] window.PIXI is undefined; load the pixijs module before calling mountAboutScene()."
      );
    }
    const { homes, aspectRatio } = await sampleLogoHomes(logoUrl);
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
    const brushTexture = buildBrushTexture(pixi, CONFIG.brushSize);
    const sparkleTexture = buildSparkleTexture(pixi, CONFIG.sparkleBrushSize);
    const particleLayer = new pixi.Container();
    const sparkleLayer = new pixi.Container();
    const textLayer = new pixi.Container();
    app.stage.addChild(particleLayer);
    app.stage.addChild(sparkleLayer);
    app.stage.addChild(textLayer);
    const fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const eyebrowText = makeText(pixi, labels.eyebrow, {
      fontFamily: fontStack,
      fontSize: 11,
      fill: 10204671,
      fontWeight: "600",
      letterSpacing: 4
    });
    const titleText = makeText(pixi, labels.title, {
      fontFamily: fontStack,
      fontSize: 38,
      fill: 16777215,
      fontWeight: "300",
      letterSpacing: -0.4
    });
    const bylineText = makeText(pixi, labels.byline, {
      fontFamily: fontStack,
      fontSize: 14,
      fill: 12634858,
      fontWeight: "400",
      fontStyle: "italic",
      letterSpacing: 0.3
    });
    const versionText = makeText(
      pixi,
      labels.version,
      {
        fontFamily: fontStack,
        fontSize: 11,
        fill: 7306928,
        fontWeight: "500",
        letterSpacing: 1
      }
    );
    const hintText = makeText(pixi, labels.hint, {
      fontFamily: fontStack,
      fontSize: 10,
      fill: 16777215,
      fontWeight: "500",
      letterSpacing: 2.4
    });
    hintText.alpha = 0.5;
    textLayer.addChild(eyebrowText);
    textLayer.addChild(titleText);
    textLayer.addChild(bylineText);
    textLayer.addChild(versionText);
    textLayer.addChild(hintText);
    const n = homes.length;
    const homeX = new Float32Array(n);
    const homeY = new Float32Array(n);
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const phase = new Float32Array(n);
    const sprites = new Array(n);
    for (let i = 0; i < n; i++) {
      const sprite = new pixi.Sprite(brushTexture);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      const scale = CONFIG.spriteScaleMin + Math.random() * (CONFIG.spriteScaleMax - CONFIG.spriteScaleMin);
      sprite.scale.set(scale);
      sprite.alpha = CONFIG.spriteAlphaMin + Math.random() * (CONFIG.spriteAlphaMax - CONFIG.spriteAlphaMin);
      particleLayer.addChild(sprite);
      sprites[i] = sprite;
      phase[i] = Math.random();
    }
    const sparkles = [];
    for (let i = 0; i < CONFIG.sparkleCount; i++) {
      const sprite = new pixi.Sprite(sparkleTexture);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.visible = false;
      sparkleLayer.addChild(sprite);
      sparkles.push({ sprite, life: 0, vx: 0, vy: 0 });
    }
    let prevOffsetX = NaN;
    let prevOffsetY = NaN;
    let prevWidthPx = 0;
    let prevHeightPx = 0;
    const computeLayout = () => {
      const w = app.canvas.clientWidth;
      const h = app.canvas.clientHeight;
      if (w <= 0 || h <= 0) {
        return;
      }
      const fitW = w * CONFIG.logoFraction;
      const fitH = h * CONFIG.logoFraction * 0.45;
      let widthPx = fitW;
      let heightPx = widthPx / aspectRatio;
      if (heightPx > fitH) {
        heightPx = fitH;
        widthPx = heightPx * aspectRatio;
      }
      const logoOffsetX = (w - widthPx) / 2;
      const logoOffsetY = h * CONFIG.logoCenterY - heightPx / 2;
      const isFirstCompute = Number.isNaN(prevOffsetX) || prevWidthPx <= 0 || prevHeightPx <= 0;
      if (!isFirstCompute) {
        const sx = widthPx / prevWidthPx;
        const sy = heightPx / prevHeightPx;
        for (let i = 0; i < n; i++) {
          const relX = (x[i] - prevOffsetX) / prevWidthPx;
          const relY = (y[i] - prevOffsetY) / prevHeightPx;
          x[i] = logoOffsetX + relX * widthPx;
          y[i] = logoOffsetY + relY * heightPx;
          vx[i] *= sx;
          vy[i] *= sy;
        }
      }
      for (let i = 0; i < n; i++) {
        homeX[i] = logoOffsetX + homes[i][0] * widthPx;
        homeY[i] = logoOffsetY + homes[i][1] * heightPx;
        if (isFirstCompute) {
          x[i] = homeX[i];
          y[i] = homeY[i];
        }
      }
      const cx = w / 2;
      eyebrowText.x = cx;
      eyebrowText.y = Math.max(28, h * 0.1);
      titleText.x = cx;
      titleText.y = Math.max(56, h * 0.18);
      const titleScale = clamp(w / 760, 0.6, 1.25);
      titleText.scale.set(titleScale);
      const logoBottom = logoOffsetY + heightPx;
      bylineText.x = cx;
      bylineText.y = Math.min(h - 70, logoBottom + 40);
      versionText.x = cx;
      versionText.y = Math.min(h - 46, logoBottom + 70);
      hintText.x = cx;
      hintText.y = h - 22;
      prevOffsetX = logoOffsetX;
      prevOffsetY = logoOffsetY;
      prevWidthPx = widthPx;
      prevHeightPx = heightPx;
    };
    computeLayout();
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        app.renderer.resize(w, h);
      }
      computeLayout();
      try {
        app.render();
      } catch {
      }
    });
    resizeObserver.observe(container);
    let pointerX = -1e6;
    let pointerY = -1e6;
    let pointerActive = false;
    let mouseDx = 0;
    let mouseDy = 0;
    const shockwaves = [];
    const onPointerMove = (e) => {
      const rect = app.canvas.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      const inside = nx >= 0 && ny >= 0 && nx <= rect.width && ny <= rect.height;
      if (!inside) {
        pointerActive = false;
        pointerX = -1e6;
        pointerY = -1e6;
        return;
      }
      if (pointerActive) {
        const cap = CONFIG.maxMouseDelta;
        mouseDx += Math.max(-cap, Math.min(cap, nx - pointerX));
        mouseDy += Math.max(-cap, Math.min(cap, ny - pointerY));
      }
      pointerX = nx;
      pointerY = ny;
      pointerActive = true;
    };
    const onPointerLeave = () => {
      pointerActive = false;
      pointerX = -1e6;
      pointerY = -1e6;
      mouseDx = 0;
      mouseDy = 0;
    };
    const onPointerDown = (e) => {
      const rect = app.canvas.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      if (nx < 0 || ny < 0 || nx > rect.width || ny > rect.height) {
        return;
      }
      shockwaves.push({ x: nx, y: ny, age: 0 });
    };
    app.canvas.addEventListener("pointermove", onPointerMove, { passive: true });
    app.canvas.addEventListener("pointerleave", onPointerLeave);
    app.canvas.addEventListener("pointerdown", onPointerDown);
    let animating = !prefersReducedMotion;
    let frame = 0;
    const syncSprites = () => {
      const cycle = frame % CONFIG.hueCycleFrames / CONFIG.hueCycleFrames;
      for (let i = 0; i < n; i++) {
        const sprite = sprites[i];
        sprite.x = x[i];
        sprite.y = y[i];
        const t = (cycle + phase[i]) % 1;
        const idxF = t * (HUE_PALETTE.length - 1);
        const a = HUE_PALETTE[Math.floor(idxF)];
        const b = HUE_PALETTE[Math.min(HUE_PALETTE.length - 1, Math.floor(idxF) + 1)];
        sprite.tint = mixColor(a, b, idxF - Math.floor(idxF));
      }
    };
    const tick = () => {
      frame++;
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
          pointerActive,
          pointerActive ? mouseDx : 0,
          pointerActive ? mouseDy : 0,
          shockwaves
        );
        updateShockwaves(shockwaves);
        updateSparkles(sparkles, x, y, n);
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
        app.canvas.removeEventListener("pointermove", onPointerMove);
        app.canvas.removeEventListener("pointerleave", onPointerLeave);
        app.canvas.removeEventListener("pointerdown", onPointerDown);
        try {
          app.destroy(true, {
            children: true,
            texture: true,
            textureSource: true,
            context: true
          });
        } catch {
        }
        try {
          brushTexture.destroy(true);
        } catch {
        }
        try {
          sparkleTexture.destroy(true);
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
  function step(n, homeX, homeY, x, y, vx, vy, pointerX, pointerY, pointerActive, mouseDx, mouseDy, shockwaves) {
    const {
      springK,
      damping,
      magnetRadius,
      magnetStrength,
      magnetForceCap,
      dragRadius,
      dragStrength,
      shockwavePeak,
      shockwaveSpeed,
      shockwaveLifeFrames,
      boidsRadius,
      separationStrength,
      alignmentStrength,
      gridCell,
      restVelocityEpsilon
    } = CONFIG;
    const magnetRadSq = magnetRadius * magnetRadius;
    const dragRadSq = dragRadius * dragRadius;
    const restEpsSq = restVelocityEpsilon * restVelocityEpsilon;
    const grid = boidsBuildGrid(n, x, y, gridCell);
    const mouseSpeed = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);
    const cursorMoving = mouseSpeed > 1e-3;
    const dragFx = mouseDx * dragStrength;
    const dragFy = mouseDy * dragStrength;
    for (let i = 0; i < n; i++) {
      const dhx = homeX[i] - x[i];
      const dhy = homeY[i] - y[i];
      let fx = dhx * springK;
      let fy = dhy * springK;
      if (pointerActive) {
        const dx = pointerX - x[i];
        const dy = pointerY - y[i];
        const distSq = dx * dx + dy * dy;
        if (distSq < magnetRadSq && distSq > 4) {
          const dist = Math.sqrt(distSq);
          let force = magnetStrength / distSq;
          if (force > magnetForceCap) {
            force = magnetForceCap;
          }
          fx += dx / dist * force;
          fy += dy / dist * force;
        }
      }
      if (cursorMoving) {
        const dx = x[i] - pointerX;
        const dy = y[i] - pointerY;
        const distSq = dx * dx + dy * dy;
        if (distSq < dragRadSq) {
          const t = 1 - Math.sqrt(distSq) / dragRadius;
          const falloff = t * t;
          fx += dragFx * falloff;
          fy += dragFy * falloff;
        }
      }
      for (let s = 0; s < shockwaves.length; s++) {
        const sw = shockwaves[s];
        const dx = x[i] - sw.x;
        const dy = y[i] - sw.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ringR = sw.age * shockwaveSpeed;
        const lifeT = sw.age / shockwaveLifeFrames;
        const lifeFalloff = (1 - lifeT) * (1 - lifeT);
        const ringWidth = 30 + sw.age * 0.5;
        const ringDelta = Math.abs(dist - ringR);
        if (ringDelta < ringWidth && dist > 0.01) {
          const ringStrength = 1 - ringDelta / ringWidth;
          const force = shockwavePeak * ringStrength * lifeFalloff;
          fx += dx / dist * force;
          fy += dy / dist * force;
        }
      }
      const cx = Math.floor(x[i] / gridCell);
      const cy = Math.floor(y[i] / gridCell);
      let sepFx = 0;
      let sepFy = 0;
      let alignVx = 0;
      let alignVy = 0;
      let neighbourCount = 0;
      const radSq = boidsRadius * boidsRadius;
      for (let nx = cx - 1; nx <= cx + 1; nx++) {
        for (let ny = cy - 1; ny <= cy + 1; ny++) {
          const bucket = grid.get(nx * 100003 + ny);
          if (!bucket) {
            continue;
          }
          for (let k = 0; k < bucket.length; k++) {
            const j = bucket[k];
            if (j === i) {
              continue;
            }
            const ddx = x[i] - x[j];
            const ddy = y[i] - y[j];
            const dSq = ddx * ddx + ddy * ddy;
            if (dSq < radSq && dSq > 0.01) {
              const inv = 1 / dSq;
              sepFx += ddx * inv;
              sepFy += ddy * inv;
              alignVx += vx[j];
              alignVy += vy[j];
              neighbourCount++;
            }
          }
        }
      }
      if (neighbourCount > 0) {
        fx += sepFx * separationStrength;
        fy += sepFy * separationStrength;
        fx += (alignVx / neighbourCount - vx[i]) * alignmentStrength;
        fy += (alignVy / neighbourCount - vy[i]) * alignmentStrength;
      }
      const nvx = (vx[i] + fx) * damping;
      const nvy = (vy[i] + fy) * damping;
      const calm = !pointerActive && shockwaves.length === 0 && nvx * nvx + nvy * nvy < restEpsSq && dhx * dhx + dhy * dhy < 0.5;
      if (calm) {
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
  function boidsBuildGrid(n, x, y, gridCell) {
    const grid = /* @__PURE__ */ new Map();
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i] / gridCell);
      const cy = Math.floor(y[i] / gridCell);
      const key = cx * 100003 + cy;
      const bucket = grid.get(key);
      if (bucket) {
        bucket.push(i);
      } else {
        grid.set(key, [i]);
      }
    }
    return grid;
  }
  function updateShockwaves(shockwaves) {
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      shockwaves[i].age++;
      if (shockwaves[i].age >= CONFIG.shockwaveLifeFrames) {
        shockwaves.splice(i, 1);
      }
    }
  }
  function updateSparkles(sparkles, x, y, n) {
    let spawnsLeft = 0;
    let r = Math.random();
    while (r < CONFIG.sparkleSpawnRate) {
      spawnsLeft++;
      r += Math.random();
    }
    for (let s = 0; s < sparkles.length && spawnsLeft > 0; s++) {
      if (sparkles[s].life <= 0) {
        const idx = Math.floor(Math.random() * n);
        const sprite = sparkles[s].sprite;
        sprite.x = x[idx];
        sprite.y = y[idx];
        sprite.scale.set(0.4 + Math.random() * 0.5);
        sprite.alpha = 1;
        sprite.tint = HUE_PALETTE[Math.floor(Math.random() * HUE_PALETTE.length)];
        sprite.visible = true;
        sparkles[s].life = CONFIG.sparkleLifeFrames;
        sparkles[s].vx = (Math.random() - 0.5) * 0.3;
        sparkles[s].vy = -0.45 - Math.random() * 0.4;
        spawnsLeft--;
      }
    }
    for (let s = 0; s < sparkles.length; s++) {
      const spk = sparkles[s];
      if (spk.life <= 0) {
        continue;
      }
      spk.life--;
      spk.sprite.x += spk.vx;
      spk.sprite.y += spk.vy;
      const t = spk.life / CONFIG.sparkleLifeFrames;
      spk.sprite.alpha = t * t;
      const baseScale = 0.4 + (1 - t) * 0.4;
      spk.sprite.scale.set(baseScale);
      if (spk.life <= 0) {
        spk.sprite.visible = false;
      }
    }
  }
  function mixColor(a, b, t) {
    const ar = Math.floor(a / 65536);
    const ag = Math.floor(a / 256) % 256;
    const ab = a % 256;
    const br = Math.floor(b / 65536);
    const bg = Math.floor(b / 256) % 256;
    const bb = b % 256;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bcomp = Math.round(ab + (bb - ab) * t);
    return r * 65536 + g * 256 + bcomp;
  }
  function buildBrushTexture(pixi, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[desktop-mode/about] 2D canvas context unavailable.");
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
  function buildSparkleTexture(pixi, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[desktop-mode/about] 2D canvas context unavailable.");
    }
    const center = size / 2;
    const radial = ctx.createRadialGradient(
      center,
      center,
      0,
      center,
      center,
      center * 0.5
    );
    radial.addColorStop(0, "rgba(255, 255, 255, 1)");
    radial.addColorStop(0.4, "rgba(255, 255, 255, 0.5)");
    radial.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "lighter";
    const armWidth = 1.5;
    for (const isVertical of [false, true]) {
      const grad = isVertical ? ctx.createLinearGradient(0, 0, 0, size) : ctx.createLinearGradient(0, 0, size, 0);
      grad.addColorStop(0, "rgba(255, 255, 255, 0)");
      grad.addColorStop(0.5, "rgba(255, 255, 255, 0.85)");
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = grad;
      if (isVertical) {
        ctx.fillRect(center - armWidth, 0, armWidth * 2, size);
      } else {
        ctx.fillRect(0, center - armWidth, size, armWidth * 2);
      }
    }
    return pixi.Texture.from(canvas);
  }
  async function sampleLogoHomes(url) {
    const img = await loadImage(url);
    const maxSide = 600;
    const ratio = img.naturalWidth / img.naturalHeight;
    const sampleWidth = ratio >= 1 ? maxSide : Math.round(maxSide * ratio);
    const sampleHeight = ratio >= 1 ? Math.round(maxSide / ratio) : maxSide;
    const empty = { homes: [], aspectRatio: 1 };
    const off = document.createElement("canvas");
    off.width = sampleWidth;
    off.height = sampleHeight;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return empty;
    }
    ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
    const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let minX = sampleWidth;
    let minY = sampleHeight;
    let maxX = 0;
    let maxY = 0;
    const threshold = CONFIG.alphaThreshold;
    for (let py = 0; py < sampleHeight; py++) {
      for (let px = 0; px < sampleWidth; px++) {
        const alpha = data[(py * sampleWidth + px) * 4 + 3];
        if (alpha > threshold) {
          if (px < minX) {
            minX = px;
          }
          if (px > maxX) {
            maxX = px;
          }
          if (py < minY) {
            minY = py;
          }
          if (py > maxY) {
            maxY = py;
          }
        }
      }
    }
    if (minX > maxX || minY > maxY) {
      return empty;
    }
    const bboxW = maxX - minX + 1;
    const bboxH = maxY - minY + 1;
    const aspectRatio = bboxW / bboxH;
    const homes = [];
    const stride = CONFIG.sampleStride;
    for (let row = minY; row <= maxY; row += stride) {
      const rowOffset = (row - minY) / stride % 2 === 0 ? 0 : stride / 2;
      for (let col = minX; col <= maxX; col += stride) {
        const px = Math.min(maxX, Math.round(col + rowOffset));
        const py = row;
        const alpha = data[(py * sampleWidth + px) * 4 + 3];
        if (alpha > threshold) {
          homes.push([
            (px - minX) / bboxW,
            (py - minY) / bboxH
          ]);
          if (homes.length >= CONFIG.maxParticles) {
            return { homes, aspectRatio };
          }
        }
      }
    }
    return { homes, aspectRatio };
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
  function makeText(pixi, text, style) {
    const t = new pixi.Text({
      text,
      style: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fill: style.fill,
        fontWeight: style.fontWeight ?? "normal",
        fontStyle: style.fontStyle ?? "normal",
        letterSpacing: style.letterSpacing ?? 0,
        align: "center"
      },
      resolution: 2,
      anchor: { x: 0.5, y: 0.5 }
    });
    return t;
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
  window.desktopModeMountAboutScene = mountAboutScene;
})();
