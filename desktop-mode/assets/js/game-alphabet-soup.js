(function() {
  "use strict";
  const TEXT_DOMAIN = "desktop-mode";
  function i18n() {
    return window.wp?.i18n;
  }
  function __(text, domain = TEXT_DOMAIN) {
    return i18n()?.__(text, domain) ?? text;
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
  function desktopGlobal() {
    return window.wp?.desktop ?? {};
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
  function parseDictionary(raw) {
    const words = [];
    for (const line of raw.split("\n")) {
      const word = line.trim();
      if ("" === word || word.startsWith("#")) {
        continue;
      }
      words.push(word);
    }
    const bucketStart = /* @__PURE__ */ new Map();
    const bucketEnd = /* @__PURE__ */ new Map();
    for (let i = 0; i < words.length; i++) {
      const len = words[i].length;
      if (!bucketStart.has(len)) {
        bucketStart.set(len, i);
      }
      bucketEnd.set(len, i + 1);
    }
    const sliceFor = (minLen, maxLen) => {
      let start = -1;
      let end = -1;
      for (let len = minLen; len <= maxLen; len++) {
        const s = bucketStart.get(len);
        if (s === void 0) {
          continue;
        }
        if (start === -1) {
          start = s;
        }
        end = bucketEnd.get(len);
      }
      if (start === -1) {
        return { start: 0, end: words.length };
      }
      return { start, end };
    };
    const drawOne = (minLen, maxLen, rng) => {
      const { start, end } = sliceFor(minLen, maxLen);
      const span = end - start;
      if (span <= 0) {
        return "";
      }
      const offset = Math.floor(span * Math.pow(rng(), 1.4));
      return words[start + Math.min(offset, span - 1)];
    };
    return {
      size: words.length,
      pick: (minLen, maxLen, rng, avoidInitials) => {
        let word = drawOne(minLen, maxLen, rng);
        if (avoidInitials && avoidInitials.size > 0) {
          for (let attempt = 0; attempt < 3 && word !== "" && avoidInitials.has(word[0]); attempt++) {
            word = drawOne(minLen, maxLen, rng);
          }
        }
        return word;
      }
    };
  }
  async function loadDictionary(url, opts = {}) {
    const res = await trackedFetch(
      url,
      { signal: opts.signal, credentials: "same-origin" },
      {
        windowId: opts.windowId,
        source: opts.source ?? "desktop-mode/games-dictionary"
      }
    );
    if (!res.ok) {
      throw new Error(
        `[desktop-mode] Games dictionary failed to load (${res.status}).`
      );
    }
    const dictionary = parseDictionary(await res.text());
    if (dictionary.size === 0) {
      throw new Error("[desktop-mode] Games dictionary is empty.");
    }
    return dictionary;
  }
  function getPixi() {
    const pixi = window.PIXI;
    return pixi ?? null;
  }
  const SHARE_CARD_WIDTH = 1200;
  const SHARE_CARD_HEIGHT = 630;
  const DECO_TILES = [
    // x, y, size, rotation (radians)
    [1020, 96, 74, -0.16],
    [1108, 210, 56, 0.22],
    [966, 250, 44, 0.42],
    [1084, 356, 66, -0.28],
    [90, 520, 54, 0.18],
    [170, 570, 40, -0.32]
  ];
  const DECO_COLORS = [
    "#ff6b6b",
    "#ffd166",
    "#06d6a0",
    "#4cc9f0",
    "#c77dff",
    "#90e0ef"
  ];
  const CARD_FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';
  function renderShareCard(canvas, data) {
    canvas.width = SHARE_CARD_WIDTH;
    canvas.height = SHARE_CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const accent = data.accent ?? "#ffd166";
    const w = SHARE_CARD_WIDTH;
    const h = SHARE_CARD_HEIGHT;
    ctx.fillStyle = "#1c1233";
    ctx.fillRect(0, 0, w, h);
    const glowA = ctx.createRadialGradient(w * 0.2, h * 0.1, 40, w * 0.2, h * 0.1, 620);
    glowA.addColorStop(0, "rgba(105, 78, 189, 0.55)");
    glowA.addColorStop(1, "rgba(105, 78, 189, 0)");
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, w, h);
    const glowB = ctx.createRadialGradient(w * 0.92, h * 0.95, 40, w * 0.92, h * 0.95, 560);
    glowB.addColorStop(0, "rgba(41, 128, 185, 0.4)");
    glowB.addColorStop(1, "rgba(41, 128, 185, 0)");
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, w, h);
    const letters = (data.gameTitle.replace(/[^a-z]/gi, "") || "ABC").toUpperCase();
    DECO_TILES.forEach(([x, y, size, rotation], i) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = DECO_COLORS[i % DECO_COLORS.length];
      roundRectPath(ctx, -size / 2, -size / 2, size, size, size * 0.24);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.round(size * 0.56)}px ${CARD_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(letters[i % letters.length], 0, size * 0.04);
      ctx.restore();
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(96, 104, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f3efff";
    ctx.font = `700 52px ${CARD_FONT}`;
    ctx.fillText(data.gameTitle, 130, 122);
    ctx.font = `600 26px ${CARD_FONT}`;
    const pillText = data.puzzleLabel;
    const pillWidth = ctx.measureText(pillText).width + 56;
    roundRectPath(ctx, 96, 156, pillWidth, 54, 27);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fill();
    ctx.fillStyle = "rgba(243, 239, 255, 0.85)";
    ctx.fillText(pillText, 124, 192);
    const scoreText = formatScore(data.score);
    const scoreGradient = ctx.createLinearGradient(96, 260, 96, 420);
    scoreGradient.addColorStop(0, "#ffffff");
    scoreGradient.addColorStop(1, accent);
    ctx.fillStyle = scoreGradient;
    ctx.font = `700 150px ${CARD_FONT}`;
    ctx.fillText(scoreText, 90, 420);
    const scoreWidth = ctx.measureText(scoreText).width;
    ctx.fillStyle = "rgba(243, 239, 255, 0.65)";
    ctx.font = `600 30px ${CARD_FONT}`;
    ctx.fillText(data.scoreLabel, 100 + scoreWidth, 418);
    const stats = data.stats.slice(0, 5);
    if (stats.length > 0) {
      const gap = 18;
      const tileW = Math.min(
        200,
        (w - 192 - gap * (stats.length - 1)) / stats.length
      );
      const tileH = 108;
      const top = 462;
      stats.forEach((stat, i) => {
        const x = 96 + i * (tileW + gap);
        roundRectPath(ctx, x, top, tileW, tileH, 18);
        ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 40px ${CARD_FONT}`;
        ctx.fillText(stat.value, x + 22, top + 56);
        ctx.fillStyle = "rgba(243, 239, 255, 0.6)";
        ctx.font = `600 20px ${CARD_FONT}`;
        ctx.fillText(stat.label.toUpperCase(), x + 22, top + 90);
      });
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(243, 239, 255, 0.5)";
    ctx.font = `600 22px ${CARD_FONT}`;
    ctx.fillText(data.footer, w - 60, h - 40);
  }
  function formatScore(score) {
    return Math.max(0, Math.round(score)).toLocaleString();
  }
  function roundRectPath(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
  function cardBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }
  async function shareScoreCard(canvas, filename, title) {
    const blob = await cardBlob(canvas);
    if (!blob) {
      return "failed";
    }
    const nav = window.navigator;
    const file = new File([blob], filename, { type: "image/png" });
    if (typeof nav.share === "function" && (typeof nav.canShare !== "function" || nav.canShare({ files: [file] }))) {
      try {
        await nav.share({ files: [file], title });
        return "shared";
      } catch {
      }
    }
    if (await copyCardToClipboard(blob)) {
      return "copied";
    }
    downloadCard(canvas, filename);
    return "downloaded";
  }
  async function copyCardToClipboard(blob) {
    const nav = window.navigator;
    const ClipboardItemCtor = window.ClipboardItem;
    if (!nav.clipboard?.write || !ClipboardItemCtor) {
      return false;
    }
    try {
      await nav.clipboard.write([
        new ClipboardItemCtor({ "image/png": blob })
      ]);
      return true;
    } catch {
      return false;
    }
  }
  function downloadCard(canvas, filename) {
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    link.click();
  }
  const SOUND_STORAGE_KEY = "desktop-mode/alphabet-soup-sound";
  const MASTER_LEVEL = 0.16;
  const PLUCK_LEVEL = 0.5;
  const PENTATONIC = [0, 2, 4, 7, 9];
  const BASE_FREQUENCY = 220;
  function selectionStepFrequency(index) {
    const step = Math.max(0, Math.floor(index));
    const semitones = 12 * Math.floor(step / PENTATONIC.length) + PENTATONIC[step % PENTATONIC.length];
    return BASE_FREQUENCY * Math.pow(2, semitones / 12);
  }
  function readStoredEnabled() {
    try {
      return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  }
  function storeEnabled(enabled) {
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
    }
  }
  function createSoupAudio() {
    let ctx = null;
    let master = null;
    let enabled = readStoredEnabled();
    let disposed = false;
    const ensureContext = () => {
      if (disposed) {
        return null;
      }
      if (ctx) {
        if ("suspended" === ctx.state) {
          void ctx.resume().catch(() => void 0);
        }
        return ctx;
      }
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) {
        return null;
      }
      try {
        ctx = new Ctor();
      } catch {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = MASTER_LEVEL;
      master.connect(ctx.destination);
      return ctx;
    };
    const pluck = (frequency, opts = {}) => {
      if (!enabled || frequency <= 0) {
        return;
      }
      const context = ensureContext();
      if (!context || !master) {
        return;
      }
      const { type = "sine", delay = 0, duration = 0.22, level = PLUCK_LEVEL } = opts;
      const start = context.currentTime + delay;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(1e-4, start);
      gain.gain.exponentialRampToValueAtTime(level, start + 8e-3);
      gain.gain.exponentialRampToValueAtTime(1e-4, start + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    };
    return {
      cellTouch(index) {
        pluck(selectionStepFrequency(index), { duration: 0.14, level: 0.35 });
      },
      found(length) {
        const root = selectionStepFrequency(Math.min(length, 6));
        pluck(root, { duration: 0.3 });
        pluck(root * 1.25, { delay: 0.05, duration: 0.3 });
        pluck(root * 1.5, { delay: 0.1, duration: 0.35 });
        pluck(root * 2, { delay: 0.16, duration: 0.4, level: 0.4 });
      },
      invalid() {
        pluck(110, { type: "triangle", duration: 0.15, level: 0.35 });
        pluck(116, { type: "triangle", duration: 0.12, level: 0.2 });
      },
      waveClear() {
        pluck(330, { duration: 0.25 });
        pluck(415, { delay: 0.09, duration: 0.25 });
        pluck(494, { delay: 0.18, duration: 0.3 });
        pluck(660, { delay: 0.28, duration: 0.5, level: 0.45 });
      },
      tick() {
        pluck(880, { type: "triangle", duration: 0.06, level: 0.18 });
      },
      gameOver() {
        pluck(392, { type: "triangle", duration: 0.35, level: 0.4 });
        pluck(311, { type: "triangle", delay: 0.14, duration: 0.45, level: 0.4 });
      },
      setEnabled(next) {
        enabled = next;
        storeEnabled(next);
      },
      isEnabled() {
        return enabled;
      },
      dispose() {
        disposed = true;
        if (ctx) {
          void ctx.close().catch(() => void 0);
          ctx = null;
          master = null;
        }
      }
    };
  }
  const TILE_FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';
  const BACKDROP_COLOR = 1839667;
  const BACKDROP_GLOW_A = 3877480;
  const BACKDROP_GLOW_B = 2304604;
  const CELL_COLOR = 16777215;
  const LETTER_COLOR = 15986687;
  const LOCKED_LETTER_COLOR = 2365238;
  const SELECTION_COLOR = 16765286;
  const WORD_COLORS = [
    16739179,
    16765286,
    448160,
    5032432,
    13073919,
    16029582,
    9494767,
    16769126,
    8449433,
    16369487
  ];
  const ENTRANCE_SECONDS = 0.3;
  const ENTRANCE_STAGGER = 0.035;
  const POP_SECONDS = 0.35;
  const FLASH_SECONDS = 0.45;
  function createSoupBoard(pixi, stage) {
    const backdrop = new pixi.Graphics();
    backdrop.zIndex = 0;
    const lockLayer = new pixi.Graphics();
    lockLayer.zIndex = 5;
    const selectionLayer = new pixi.Graphics();
    selectionLayer.zIndex = 8;
    const flashLayer = new pixi.Graphics();
    flashLayer.zIndex = 9;
    const tileLayer = new pixi.Container();
    tileLayer.zIndex = 10;
    stage.addChild(backdrop);
    stage.addChild(lockLayer);
    stage.addChild(selectionLayer);
    stage.addChild(flashLayer);
    stage.addChild(tileLayer);
    let grid = null;
    let tiles = [];
    let locked = [];
    let flashes = [];
    let selection = [];
    let width = 0;
    let height = 0;
    let cell = 48;
    let originX = 0;
    let originY = 0;
    const lockedCells = /* @__PURE__ */ new Set();
    const cellKey = (c) => `${c.row}:${c.col}`;
    const computeLayout = () => {
      if (!grid) {
        return;
      }
      const pad = 18;
      cell = Math.max(
        24,
        Math.min(
          (width - pad * 2) / grid.size,
          (height - pad * 2) / grid.size,
          64
        )
      );
      originX = (width - cell * grid.size) / 2;
      originY = (height - cell * grid.size) / 2;
    };
    const center = (c) => ({
      x: originX + (c.col + 0.5) * cell,
      y: originY + (c.row + 0.5) * cell
    });
    const paintBackdrop = () => {
      backdrop.clear();
      if (width <= 0 || height <= 0) {
        return;
      }
      backdrop.rect(0, 0, width, height).fill(BACKDROP_COLOR);
      backdrop.circle(width * 0.22, height * 0.2, Math.max(width, height) * 0.4).fill({ color: BACKDROP_GLOW_A, alpha: 0.35 });
      backdrop.circle(width * 0.85, height * 0.9, Math.max(width, height) * 0.45).fill({ color: BACKDROP_GLOW_B, alpha: 0.4 });
      if (grid) {
        const platePad = Math.min(14, cell * 0.3);
        backdrop.roundRect(
          originX - platePad,
          originY - platePad,
          cell * grid.size + platePad * 2,
          cell * grid.size + platePad * 2,
          Math.min(22, cell * 0.5)
        ).fill({ color: 0, alpha: 0.28 });
        for (let row = 0; row < grid.size; row++) {
          for (let col = 0; col < grid.size; col++) {
            const p = center({ row, col });
            backdrop.roundRect(
              p.x - cell * 0.42,
              p.y - cell * 0.42,
              cell * 0.84,
              cell * 0.84,
              cell * 0.2
            ).fill({ color: CELL_COLOR, alpha: 0.05 });
          }
        }
      }
    };
    const drawCapsule = (g, cells, color, alpha) => {
      if (0 === cells.length) {
        return;
      }
      const from = center(cells[0]);
      const thickness = cell * 0.78;
      if (cells.length === 1) {
        g.circle(from.x, from.y, thickness / 2).fill({ color, alpha });
        return;
      }
      const to = center(cells[cells.length - 1]);
      g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, width: thickness, alpha, cap: "round" });
    };
    const repaintLocks = () => {
      lockLayer.clear();
      for (const entry of locked) {
        drawCapsule(lockLayer, entry.cells, entry.color, 0.85);
      }
    };
    const repaintSelection = () => {
      selectionLayer.clear();
      if (selection.length > 0) {
        drawCapsule(selectionLayer, selection, SELECTION_COLOR, 0.35);
        for (const c of selection) {
          const p = center(c);
          selectionLayer.circle(p.x, p.y, cell * 0.12).fill({ color: SELECTION_COLOR, alpha: 0.7 });
        }
      }
    };
    const repaintFlashes = () => {
      flashLayer.clear();
      for (const flash of flashes) {
        const progress = Math.min(1, flash.age / FLASH_SECONDS);
        drawCapsule(
          flashLayer,
          flash.cells,
          16733296,
          0.5 * (1 - progress)
        );
      }
    };
    const positionTiles = () => {
      for (const tile of tiles) {
        const p = center(tile.cell);
        tile.node.x = p.x;
        tile.node.y = p.y;
      }
    };
    const rebuildTiles = () => {
      tileLayer.removeChildren();
      for (const tile of tiles) {
        tile.node.destroy();
      }
      tiles = [];
      if (!grid) {
        return;
      }
      for (let row = 0; row < grid.size; row++) {
        for (let col = 0; col < grid.size; col++) {
          const node = new pixi.Text({
            text: grid.letters[row][col].toUpperCase(),
            style: {
              fill: LETTER_COLOR,
              fontSize: Math.round(cell * 0.52),
              fontFamily: TILE_FONT,
              fontWeight: "700"
            },
            resolution: 2
          });
          node.anchor.set(0.5);
          node.alpha = 0;
          node.scale.set(0);
          tileLayer.addChild(node);
          tiles.push({
            node,
            cell: { row, col },
            delay: (row + col) * ENTRANCE_STAGGER,
            age: 0,
            popAge: -1,
            popDelay: 0
          });
        }
      }
      positionTiles();
    };
    return {
      setGrid(next) {
        grid = next;
        locked = [];
        flashes = [];
        selection = [];
        lockedCells.clear();
        computeLayout();
        paintBackdrop();
        repaintLocks();
        repaintSelection();
        repaintFlashes();
        rebuildTiles();
      },
      relayout(nextWidth, nextHeight) {
        width = nextWidth;
        height = nextHeight;
        computeLayout();
        paintBackdrop();
        repaintLocks();
        repaintSelection();
        repaintFlashes();
        positionTiles();
        for (const tile of tiles) {
          tile.node.style.fill = lockedCells.has(cellKey(tile.cell)) ? LOCKED_LETTER_COLOR : LETTER_COLOR;
        }
      },
      cellAt(x, y) {
        if (!grid) {
          return null;
        }
        const col = Math.floor((x - originX) / cell);
        const row = Math.floor((y - originY) / cell);
        if (row < 0 || row >= grid.size || col < 0 || col >= grid.size) {
          return null;
        }
        return { row, col };
      },
      cellCenter(c) {
        return center(c);
      },
      showSelection(cells) {
        selection = cells;
        repaintSelection();
      },
      clearSelection() {
        selection = [];
        repaintSelection();
      },
      lockWord(cells, color) {
        locked.push({ cells, color });
        repaintLocks();
        for (let i = 0; i < cells.length; i++) {
          lockedCells.add(cellKey(cells[i]));
          const tile = tiles.find(
            (t) => t.cell.row === cells[i].row && t.cell.col === cells[i].col
          );
          if (tile) {
            tile.node.style.fill = LOCKED_LETTER_COLOR;
            tile.popAge = 0;
            tile.popDelay = i * 0.03;
          }
        }
      },
      flashInvalid(cells) {
        flashes.push({ cells, age: 0 });
      },
      update(dt) {
        let needsFlashRepaint = false;
        for (const flash of flashes.slice()) {
          flash.age += dt;
          needsFlashRepaint = true;
          if (flash.age >= FLASH_SECONDS) {
            flashes = flashes.filter((f) => f !== flash);
          }
        }
        if (needsFlashRepaint) {
          repaintFlashes();
        }
        for (const tile of tiles) {
          tile.age += dt;
          const t = Math.min(
            1,
            Math.max(0, (tile.age - tile.delay) / ENTRANCE_SECONDS)
          );
          const eased = 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
          let scale = eased;
          tile.node.alpha = Math.min(1, t * 1.6);
          if (tile.popAge >= 0) {
            tile.popAge += dt;
            const pt = Math.min(
              1,
              Math.max(
                0,
                (tile.popAge - tile.popDelay) / POP_SECONDS
              )
            );
            scale *= 1 + 0.35 * Math.sin(Math.PI * pt);
            if (pt >= 1) {
              tile.popAge = -1;
            }
          }
          tile.node.scale.set(Math.max(0, scale));
        }
      },
      destroy() {
        tileLayer.removeChildren();
        for (const tile of tiles) {
          tile.node.destroy();
        }
        tiles = [];
        stage.removeChild(backdrop);
        stage.removeChild(lockLayer);
        stage.removeChild(selectionLayer);
        stage.removeChild(flashLayer);
        stage.removeChild(tileLayer);
        backdrop.destroy();
        lockLayer.destroy();
        selectionLayer.destroy();
        flashLayer.destroy();
        tileLayer.destroy({ children: true });
      }
    };
  }
  const GRAVITY = 560;
  const BURST_LIFETIME = 0.7;
  const SCORE_LIFETIME = 0.9;
  const BANNER_LIFETIME = 1.4;
  const CONFETTI_LIFETIME = 1.6;
  function createSoupFx(pixi, stage, rng = Math.random) {
    const effects = [];
    const remove = (effect) => {
      const idx = effects.indexOf(effect);
      if (idx >= 0) {
        effects.splice(idx, 1);
      }
      if ("burst" === effect.kind || "confetti" === effect.kind) {
        for (const part of effect.parts) {
          stage.removeChild(part.node);
          part.node.destroy();
        }
        return;
      }
      stage.removeChild(effect.node);
      effect.node.destroy();
    };
    return {
      burstAt(x, y, color) {
        const parts = [];
        const count = 10;
        for (let i = 0; i < count; i++) {
          const node = new pixi.Graphics();
          node.circle(0, 0, 2 + rng() * 2.5).fill({ color, alpha: 0.95 });
          node.x = x;
          node.y = y;
          node.zIndex = 30;
          stage.addChild(node);
          const angle = i / count * Math.PI * 2 + rng() * 0.6;
          const speed = 90 + rng() * 160;
          parts.push({
            node,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 60
          });
        }
        effects.push({ kind: "burst", parts, age: 0 });
      },
      floatScore(x, y, text, color) {
        const node = new pixi.Text({
          text,
          style: {
            fill: color,
            fontSize: 22,
            fontFamily: TILE_FONT,
            fontWeight: "700"
          },
          resolution: 2
        });
        node.anchor.set(0.5);
        node.x = x;
        node.y = y;
        node.zIndex = 35;
        stage.addChild(node);
        effects.push({ kind: "score", node, age: 0 });
      },
      banner(text, centerX, centerY) {
        const node = new pixi.Text({
          text,
          style: {
            fill: 16777215,
            fontSize: 40,
            fontFamily: TILE_FONT,
            fontWeight: "700"
          },
          resolution: 2
        });
        node.anchor.set(0.5);
        node.x = centerX;
        node.y = centerY;
        node.zIndex = 40;
        node.alpha = 0;
        stage.addChild(node);
        effects.push({ kind: "banner", node, age: 0 });
      },
      confetti(width, colors) {
        const parts = [];
        const count = 36;
        for (let i = 0; i < count; i++) {
          const node = new pixi.Graphics();
          const color = colors[Math.floor(rng() * colors.length)];
          node.roundRect(-3, -5, 6, 10, 2).fill({ color, alpha: 0.95 });
          node.x = rng() * width;
          node.y = -14 - rng() * 40;
          node.rotation = rng() * Math.PI;
          node.zIndex = 30;
          stage.addChild(node);
          parts.push({
            node,
            vx: (rng() - 0.5) * 90,
            vy: 120 + rng() * 160,
            spin: (rng() - 0.5) * 8
          });
        }
        effects.push({ kind: "confetti", parts, age: 0 });
      },
      update(dt) {
        for (const effect of effects.slice()) {
          effect.age += dt;
          if ("burst" === effect.kind) {
            for (const part of effect.parts) {
              part.vy += GRAVITY * dt;
              part.node.x += part.vx * dt;
              part.node.y += part.vy * dt;
              part.node.alpha = Math.max(
                0,
                1 - effect.age / BURST_LIFETIME
              );
            }
            if (effect.age >= BURST_LIFETIME) {
              remove(effect);
            }
            continue;
          }
          if ("score" === effect.kind) {
            const progress = effect.age / SCORE_LIFETIME;
            effect.node.y -= 46 * dt;
            effect.node.alpha = Math.max(0, 1 - progress * progress);
            if (effect.age >= SCORE_LIFETIME) {
              remove(effect);
            }
            continue;
          }
          if ("banner" === effect.kind) {
            const progress = Math.min(1, effect.age / BANNER_LIFETIME);
            const inT = Math.min(1, progress / 0.18);
            const eased = 1 - (1 - inT) * (1 - inT);
            effect.node.scale.set(0.6 + 0.4 * eased);
            effect.node.alpha = progress < 0.75 ? eased : Math.max(0, 1 - (progress - 0.75) / 0.25);
            if (effect.age >= BANNER_LIFETIME) {
              remove(effect);
            }
            continue;
          }
          for (const part of effect.parts) {
            part.node.x += part.vx * dt;
            part.node.y += part.vy * dt;
            part.node.rotation += part.spin * dt;
            part.node.alpha = Math.max(
              0,
              1 - effect.age / CONFETTI_LIFETIME
            );
          }
          if (effect.age >= CONFETTI_LIFETIME) {
            remove(effect);
          }
        }
      },
      clear() {
        for (const effect of effects.slice()) {
          remove(effect);
        }
      }
    };
  }
  const SOUP_MODES = ["daily", "time-attack"];
  const SOUP_SIZES = ["small", "medium", "big"];
  const DAILY_WAVE_COUNT = 3;
  const TIME_ATTACK_START_SECONDS = 90;
  const TIME_ATTACK_WORD_BONUS_SECONDS = 4;
  const TIME_ATTACK_WAVE_BONUS_SECONDS = 15;
  const LOW_TIME_SECONDS = 10;
  function sizeCells(size) {
    switch (size) {
      case "big":
        return 16;
      case "medium":
        return 12;
      default:
        return 8;
    }
  }
  function baseWordCount(size) {
    switch (size) {
      case "big":
        return 14;
      case "medium":
        return 10;
      default:
        return 6;
    }
  }
  function waveConfig(mode, size, wave) {
    const step = Math.max(0, wave - 1);
    const gridSize = sizeCells(size);
    const base = baseWordCount(size);
    if ("time-attack" === mode) {
      return {
        gridSize,
        wordCount: Math.min(base + 4, base + step),
        minLen: 4,
        maxLen: Math.min(gridSize, 9, 6 + step)
      };
    }
    return {
      gridSize,
      wordCount: base + step,
      minLen: 4,
      maxLen: Math.min(gridSize, 10, 6 + step)
    };
  }
  function isFinalDailyWave(wave) {
    return wave >= DAILY_WAVE_COUNT;
  }
  function createSoupScore() {
    return {
      score: 0,
      wordsFound: 0,
      streak: 0,
      bestStreak: 0,
      correctSelections: 0,
      totalSelections: 0
    };
  }
  function streakMultiplier(streak) {
    return 1 + 0.15 * Math.min(Math.max(0, streak), 10);
  }
  function wordPoints(length, streak) {
    return Math.round(15 * length * streakMultiplier(streak));
  }
  function recordFind(state, length) {
    const points = wordPoints(length, state.streak);
    state.score += points;
    state.wordsFound++;
    state.correctSelections++;
    state.totalSelections++;
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    return points;
  }
  function recordMissSelection(state) {
    state.totalSelections++;
    state.streak = 0;
  }
  function waveClearBonus(wave) {
    return 150 + 50 * Math.max(0, wave - 1);
  }
  function recordWaveClear(state, wave) {
    const bonus = waveClearBonus(wave);
    state.score += bonus;
    return bonus;
  }
  function accuracyPercent(state) {
    if (0 === state.totalSelections) {
      return 100;
    }
    return Math.round(
      state.correctSelections / state.totalSelections * 100
    );
  }
  function wordsPerMinute(state, elapsedSeconds) {
    if (elapsedSeconds <= 0) {
      return 0;
    }
    return Math.round(state.wordsFound * (60 / elapsedSeconds));
  }
  function buildSoupScoreRow(state, opts) {
    const elapsed = Math.max(0, Math.round(opts.elapsedSeconds));
    return {
      score: state.score,
      meta: {
        mode: opts.mode,
        size: opts.size,
        words: state.wordsFound,
        wpm: wordsPerMinute(state, Math.max(1, elapsed)),
        accuracy: accuracyPercent(state),
        streak: state.bestStreak,
        wave: opts.wave,
        time: elapsed
      }
    };
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
  function formatDailySeed(date) {
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = String(date.getUTCFullYear());
    return `${day}-${month}-${year}`;
  }
  function runSeedString(dateSeed, mode, size) {
    return "time-attack" === mode ? `${dateSeed}#time-attack#${size}` : `${dateSeed}#${size}`;
  }
  function waveRng(seedString, wave) {
    return mulberry32(hash32(`${seedString}#wave-${wave}`));
  }
  const DIRECTIONS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, -1],
    [-1, 1]
  ];
  const WORD_DRAW_ATTEMPTS = 24;
  const PLACEMENT_ATTEMPTS = 120;
  const DECOY_BAG_BIAS = 0.6;
  const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
  function generateSoup(opts) {
    const { size, dictionary, rng } = opts;
    const maxLen = Math.min(opts.maxLen, size);
    const minLen = Math.min(opts.minLen, maxLen);
    const letters = [];
    for (let row = 0; row < size; row++) {
      letters.push(new Array(size).fill(null));
    }
    const chosen = [];
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < opts.wordCount; i++) {
      for (let attempt = 0; attempt < WORD_DRAW_ATTEMPTS; attempt++) {
        const word = dictionary.pick(minLen, maxLen, rng);
        if ("" === word || word.length > size || seen.has(word)) {
          continue;
        }
        seen.add(word);
        chosen.push(word);
        break;
      }
    }
    chosen.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
    const placed = [];
    for (const word of chosen) {
      const cells = tryPlaceWord(letters, size, word, rng);
      if (cells) {
        placed.push({ word, cells });
      }
    }
    const bag = [];
    for (const entry of placed) {
      for (const ch of entry.word) {
        bag.push(ch);
      }
    }
    const filled = letters.map(
      (rowLetters) => rowLetters.map((letter) => {
        if (null !== letter) {
          return letter;
        }
        if (bag.length > 0 && rng() < DECOY_BAG_BIAS) {
          return bag[Math.floor(rng() * bag.length)];
        }
        return ALPHABET[Math.floor(rng() * ALPHABET.length)];
      })
    );
    return { size, letters: filled, words: placed };
  }
  function tryPlaceWord(letters, size, word, rng) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const dir = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
      const span = word.length - 1;
      const rowMin = dir[0] < 0 ? span : 0;
      const rowMax = dir[0] > 0 ? size - 1 - span : size - 1;
      const colMin = dir[1] < 0 ? span : 0;
      const colMax = dir[1] > 0 ? size - 1 - span : size - 1;
      if (rowMax < rowMin || colMax < colMin) {
        continue;
      }
      const row = rowMin + Math.floor(rng() * (rowMax - rowMin + 1));
      const col = colMin + Math.floor(rng() * (colMax - colMin + 1));
      const cells = [];
      let fits = true;
      for (let i = 0; i < word.length; i++) {
        const r = row + dir[0] * i;
        const c = col + dir[1] * i;
        if (null !== letters[r][c]) {
          fits = false;
          break;
        }
        cells.push({ row: r, col: c });
      }
      if (!fits) {
        continue;
      }
      for (let i = 0; i < word.length; i++) {
        letters[cells[i].row][cells[i].col] = word[i];
      }
      return cells;
    }
    return null;
  }
  function lineCells(anchor, target, size) {
    const dRow = target.row - anchor.row;
    const dCol = target.col - anchor.col;
    if (0 === dRow && 0 === dCol) {
      return [anchor];
    }
    const angle = Math.atan2(dRow, dCol);
    const spoke = Math.round(angle / (Math.PI / 4));
    const stepRow = [0, 1, 1, 1, 0, -1, -1, -1][(spoke + 8) % 8];
    const stepCol = [1, 1, 0, -1, -1, -1, 0, 1][(spoke + 8) % 8];
    const along = 0 !== stepRow && 0 !== stepCol ? Math.min(Math.abs(dRow), Math.abs(dCol)) : Math.abs(0 !== stepRow ? dRow : dCol);
    const cells = [];
    for (let i = 0; i <= along; i++) {
      const row = anchor.row + stepRow * i;
      const col = anchor.col + stepCol * i;
      if (row < 0 || row >= size || col < 0 || col >= size) {
        break;
      }
      cells.push({ row, col });
    }
    return cells;
  }
  function pathKey(cells) {
    return cells.map((cell) => `${cell.row}:${cell.col}`).join("|");
  }
  function selectionMatches(grid, selection) {
    if (selection.length < 2) {
      return -1;
    }
    const forward = pathKey(selection);
    const backward = pathKey(selection.slice().reverse());
    for (let i = 0; i < grid.words.length; i++) {
      const key = pathKey(grid.words[i].cells);
      if (key === forward || key === backward) {
        return i;
      }
    }
    return -1;
  }
  const MODE_STORAGE_KEY = "desktop-mode/alphabet-soup-mode";
  const SIZE_STORAGE_KEY = "desktop-mode/alphabet-soup-size";
  const PLAYED_STORAGE_KEY = "desktop-mode/alphabet-soup-played";
  const MAX_FRAME_SECONDS = 0.05;
  const WAVE_TRANSITION_SECONDS = 1.4;
  function modeLabel(mode) {
    return "time-attack" === mode ? __("Time Attack") : __("Daily");
  }
  function modeHint(mode) {
    return "time-attack" === mode ? __("90 seconds on the clock — every word buys you more.") : sprintf(
      /* translators: %s: number of waves in a Daily run. */
      __("%s relaxed waves. No clock pressure, just streaks."),
      String(DAILY_WAVE_COUNT)
    );
  }
  function sizeLabel(size) {
    switch (size) {
      case "big":
        return __("Big");
      case "medium":
        return __("Medium");
      default:
        return __("Small");
    }
  }
  function sizeDims(size) {
    const cells = sizeCells(size);
    return `${cells}×${cells}`;
  }
  function readStoredMode() {
    try {
      const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (stored && SOUP_MODES.includes(stored)) {
        return stored;
      }
    } catch {
    }
    return "daily";
  }
  function storeMode(mode) {
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
    }
  }
  function readStoredSize() {
    try {
      const stored = window.localStorage.getItem(SIZE_STORAGE_KEY);
      if (stored && SOUP_SIZES.includes(stored)) {
        return stored;
      }
    } catch {
    }
    return "small";
  }
  function storeSize(size) {
    try {
      window.localStorage.setItem(SIZE_STORAGE_KEY, size);
    } catch {
    }
  }
  function readPlayedToday(dateSeed) {
    try {
      const raw = window.localStorage.getItem(PLAYED_STORAGE_KEY);
      if (!raw) {
        return /* @__PURE__ */ new Set();
      }
      const parsed = JSON.parse(raw);
      if (parsed.date !== dateSeed || !Array.isArray(parsed.seeds)) {
        return /* @__PURE__ */ new Set();
      }
      return new Set(parsed.seeds);
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  function markPlayed(dateSeed, seed) {
    try {
      const seeds = readPlayedToday(dateSeed);
      seeds.add(seed);
      window.localStorage.setItem(
        PLAYED_STORAGE_KEY,
        JSON.stringify({ date: dateSeed, seeds: [...seeds] })
      );
    } catch {
    }
  }
  function formatClock(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }
  function cssColor(color) {
    return `#${color.toString(16).padStart(6, "0")}`;
  }
  function mountAlphabetSoup(ctx) {
    const root = document.createElement("div");
    root.className = "soup";
    ctx.container.appendChild(root);
    const audio = createSoupAudio();
    const hud = document.createElement("div");
    hud.className = "soup__hud";
    const scoreEl = document.createElement("span");
    scoreEl.className = "soup__hud-score";
    const streakEl = document.createElement("span");
    streakEl.className = "soup__hud-streak";
    const timerEl = document.createElement("span");
    timerEl.className = "soup__hud-timer";
    const waveEl = document.createElement("span");
    waveEl.className = "soup__hud-wave";
    const soundToggle = document.createElement("button");
    soundToggle.type = "button";
    soundToggle.className = "soup__hud-sound";
    const paintSoundToggle = () => {
      soundToggle.textContent = audio.isEnabled() ? "🔊" : "🔇";
      soundToggle.setAttribute(
        "aria-label",
        audio.isEnabled() ? __("Mute sound effects") : __("Unmute sound effects")
      );
      soundToggle.setAttribute(
        "aria-pressed",
        audio.isEnabled() ? "false" : "true"
      );
    };
    paintSoundToggle();
    soundToggle.addEventListener("click", () => {
      audio.setEnabled(!audio.isEnabled());
      paintSoundToggle();
    });
    hud.append(scoreEl, streakEl, timerEl, waveEl);
    if (ctx.challenge) {
      const ribbon = document.createElement("span");
      ribbon.className = "soup__hud-ribbon";
      ribbon.textContent = sprintf(
        /* translators: 1: challenger display name, 2: score to beat. */
        __("Beat %1$s: %2$s"),
        ctx.challenge.challengerName,
        String(ctx.challenge.scoreToBeat)
      );
      hud.appendChild(ribbon);
    }
    hud.appendChild(soundToggle);
    root.appendChild(hud);
    const body = document.createElement("div");
    body.className = "soup__body";
    root.appendChild(body);
    const stageEl = document.createElement("div");
    stageEl.className = "soup__stage";
    body.appendChild(stageEl);
    const wordsPanel = document.createElement("aside");
    wordsPanel.className = "soup__words";
    const wordsHeading = document.createElement("p");
    wordsHeading.className = "soup__words-heading";
    const wordsList = document.createElement("ul");
    wordsList.className = "soup__words-list";
    wordsPanel.append(wordsHeading, wordsList);
    body.appendChild(wordsPanel);
    const overlay = document.createElement("div");
    overlay.className = "soup__overlay";
    overlay.hidden = true;
    root.appendChild(overlay);
    const showMessage = (text) => {
      overlay.hidden = false;
      overlay.innerHTML = "";
      const p = document.createElement("p");
      p.className = "soup__overlay-message";
      p.textContent = text;
      overlay.appendChild(p);
    };
    showMessage(__("Warming up the soup…"));
    let disposed = false;
    let state = "loading";
    let app = null;
    let pixi = null;
    let board = null;
    let fx = null;
    let dictionary = null;
    let resizeObserver = null;
    let unsubscribeWindow = null;
    let tickFn = null;
    let mode = readStoredMode();
    let size = readStoredSize();
    const dateSeed = formatDailySeed(/* @__PURE__ */ new Date());
    let seedString = runSeedString(dateSeed, mode, size);
    let officialRun = true;
    let scores = createSoupScore();
    let grid = null;
    let wave = 1;
    let foundWords = /* @__PURE__ */ new Set();
    let chipEls = [];
    let colorCounter = 0;
    let elapsedRun = 0;
    let timeLeft = TIME_ATTACK_START_SECONDS;
    let lastWholeSecond = -1;
    let waveTransition = -1;
    let anchor = null;
    let selection = [];
    const fieldWidth = () => app?.renderer.width ?? 640;
    const fieldHeight = () => app?.renderer.height ?? 480;
    const paintHud = () => {
      scoreEl.textContent = sprintf(
        /* translators: %s: current score. */
        __("Score %s"),
        String(scores.score)
      );
      streakEl.textContent = scores.streak > 1 ? `×${scores.streak}` : "";
      const clock = "time-attack" === mode ? formatClock(timeLeft) : formatClock(elapsedRun);
      timerEl.textContent = `⏱ ${clock}`;
      timerEl.classList.toggle(
        "soup__hud-timer--low",
        "time-attack" === mode && "playing" === state && timeLeft <= LOW_TIME_SECONDS
      );
      waveEl.textContent = sprintf(
        /* translators: 1: current wave number, 2: mode label. */
        __("Wave %1$s · %2$s"),
        String(wave),
        modeLabel(mode)
      );
    };
    const renderChips = () => {
      wordsList.innerHTML = "";
      chipEls = [];
      if (!grid) {
        wordsHeading.textContent = "";
        return;
      }
      wordsHeading.textContent = sprintf(
        /* translators: %s: number of hidden words. */
        __("Find %s words"),
        String(grid.words.length)
      );
      for (const entry of grid.words) {
        const li = document.createElement("li");
        li.className = "soup__word-chip";
        li.textContent = entry.word.toUpperCase();
        wordsList.appendChild(li);
        chipEls.push(li);
      }
    };
    const markChipFound = (index, color) => {
      const chip = chipEls[index];
      if (!chip) {
        return;
      }
      chip.classList.add("soup__word-chip--found");
      chip.style.borderColor = cssColor(color);
      chip.style.color = cssColor(color);
    };
    const startWave = (nextWave) => {
      if (!board || !fx || !dictionary) {
        return;
      }
      wave = nextWave;
      waveTransition = -1;
      foundWords = /* @__PURE__ */ new Set();
      const cfg = waveConfig(mode, size, wave);
      grid = generateSoup({
        size: cfg.gridSize,
        wordCount: cfg.wordCount,
        minLen: cfg.minLen,
        maxLen: cfg.maxLen,
        dictionary,
        rng: waveRng(seedString, wave)
      });
      board.relayout(fieldWidth(), fieldHeight());
      board.setGrid(grid);
      renderChips();
      fx.banner(
        sprintf(
          /* translators: %s: wave number. */
          __("Wave %s"),
          String(wave)
        ),
        fieldWidth() / 2,
        fieldHeight() / 2
      );
      paintHud();
    };
    const waveCleared = () => {
      if (!fx) {
        return;
      }
      recordWaveClear(scores, wave);
      audio.waveClear();
      fx.confetti(fieldWidth(), WORD_COLORS);
      if ("time-attack" === mode) {
        timeLeft += TIME_ATTACK_WAVE_BONUS_SECONDS;
      }
      if ("daily" === mode && isFinalDailyWave(wave)) {
        fx.banner(
          __("Soup finished!"),
          fieldWidth() / 2,
          fieldHeight() / 2
        );
        waveTransition = -1;
        window.setTimeout(() => {
          if (!disposed && "playing" === state) {
            gameOver(true);
          }
        }, 1200);
        return;
      }
      waveTransition = WAVE_TRANSITION_SECONDS;
      paintHud();
    };
    const resolveSelection = (cells) => {
      if (!grid || !board || !fx) {
        return;
      }
      if (cells.length < 2) {
        return;
      }
      const index = selectionMatches(grid, cells);
      if (index >= 0 && !foundWords.has(index)) {
        foundWords.add(index);
        const entry = grid.words[index];
        const color = WORD_COLORS[colorCounter % WORD_COLORS.length];
        colorCounter++;
        const points = recordFind(scores, entry.word.length);
        board.lockWord(entry.cells, color);
        markChipFound(index, color);
        audio.found(entry.word.length);
        const mid = entry.cells[Math.floor(entry.cells.length / 2)];
        const midPoint = board.cellCenter(mid);
        fx.floatScore(midPoint.x, midPoint.y - 8, `+${points}`, color);
        for (const cell of entry.cells) {
          const p = board.cellCenter(cell);
          fx.burstAt(p.x, p.y, color);
        }
        if ("time-attack" === mode) {
          timeLeft += TIME_ATTACK_WORD_BONUS_SECONDS;
        }
        if (foundWords.size >= grid.words.length) {
          waveCleared();
        }
      } else {
        recordMissSelection(scores);
        board.flashInvalid(cells);
        audio.invalid();
      }
      paintHud();
    };
    const gameOver = (completed) => {
      state = "over";
      anchor = null;
      selection = [];
      board?.clearSelection();
      audio.gameOver();
      const row = buildSoupScoreRow(scores, {
        mode,
        size: sizeDims(size),
        wave,
        elapsedSeconds: elapsedRun
      });
      overlay.hidden = false;
      overlay.innerHTML = "";
      const panel = document.createElement("div");
      panel.className = "soup__over-panel";
      const heading = document.createElement("p");
      heading.className = "soup__over-heading";
      if (ctx.challenge) {
        heading.textContent = row.score > ctx.challenge.scoreToBeat ? __("Game Over — challenge beaten!") : __("Game Over — challenge missed.");
      } else if (completed) {
        heading.textContent = __("Soup finished!");
      } else {
        heading.textContent = __("Time’s up!");
      }
      panel.appendChild(heading);
      const stats = document.createElement("p");
      stats.className = "soup__over-stats";
      stats.textContent = sprintf(
        /* translators: 1: score, 2: words found, 3: accuracy percent, 4: best streak, 5: wave reached. */
        __("Score %1$s — %2$s words, %3$s%% accuracy, best streak %4$s, wave %5$s."),
        String(row.score),
        String(scores.wordsFound),
        String(accuracyPercent(scores)),
        String(scores.bestStreak),
        String(wave)
      );
      panel.appendChild(stats);
      if (officialRun) {
        const shareData = {
          gameTitle: __("Alphabet Soup"),
          puzzleLabel: `${modeLabel(mode)} · ${sizeDims(size)} · ${dateSeed}`,
          score: row.score,
          scoreLabel: __("points"),
          stats: [
            { label: __("Words"), value: String(scores.wordsFound) },
            { label: __("WPM"), value: String(row.meta.wpm) },
            {
              label: __("Accuracy"),
              value: `${accuracyPercent(scores)}%`
            },
            { label: __("Streak"), value: String(scores.bestStreak) },
            { label: __("Wave"), value: String(wave) }
          ],
          footer: __("WordPress Desktop Mode")
        };
        const shareCanvas = document.createElement("canvas");
        shareCanvas.className = "soup__share-canvas";
        renderShareCard(shareCanvas, shareData);
        panel.appendChild(shareCanvas);
        const shareRow = document.createElement("div");
        shareRow.className = "soup__share-actions";
        const shareStatus = document.createElement("span");
        shareStatus.className = "soup__share-status";
        shareStatus.setAttribute("role", "status");
        const shareButton = document.createElement("button");
        shareButton.type = "button";
        shareButton.className = "soup__button soup__button--primary";
        shareButton.textContent = __("Share card");
        shareButton.addEventListener("click", () => {
          shareStatus.textContent = "";
          void shareScoreCard(
            shareCanvas,
            `alphabet-soup-${dateSeed}.png`,
            __("Alphabet Soup")
          ).then((outcome) => {
            if (disposed) {
              return;
            }
            switch (outcome) {
              case "shared":
                shareStatus.textContent = __("Shared!");
                break;
              case "copied":
                shareStatus.textContent = __("Card copied to your clipboard.");
                break;
              case "downloaded":
                shareStatus.textContent = __("Card saved as an image.");
                break;
              default:
                shareStatus.textContent = __("The card could not be shared.");
            }
          });
        });
        shareRow.appendChild(shareButton);
        shareRow.appendChild(shareStatus);
        panel.appendChild(shareRow);
      } else {
        const replayNote = document.createElement("p");
        replayNote.className = "soup__over-replay";
        replayNote.textContent = __(
          "Replay run — share cards only go to the first run of each puzzle. A fresh soup is served tomorrow."
        );
        panel.appendChild(replayNote);
      }
      const saveNote = document.createElement("p");
      saveNote.className = "soup__over-save";
      saveNote.textContent = __("Saving your score…");
      panel.appendChild(saveNote);
      ctx.submitScore(row).then(
        () => {
          saveNote.textContent = __("Score saved to the scoreboard.");
        },
        () => {
          saveNote.textContent = __("Your score could not be saved.");
        }
      );
      const actions = document.createElement("div");
      actions.className = "soup__over-actions";
      const again = document.createElement("button");
      again.type = "button";
      again.className = "soup__button";
      again.textContent = __("Play again");
      again.addEventListener("click", () => void requestRun(mode, size));
      actions.appendChild(again);
      const changeMode = document.createElement("button");
      changeMode.type = "button";
      changeMode.className = "soup__button";
      changeMode.textContent = __("Change mode");
      changeMode.addEventListener("click", () => showMenu());
      actions.appendChild(changeMode);
      const quit = document.createElement("button");
      quit.type = "button";
      quit.className = "soup__button";
      quit.textContent = __("Close");
      quit.addEventListener("click", () => ctx.close());
      actions.appendChild(quit);
      panel.appendChild(actions);
      overlay.appendChild(panel);
    };
    const startRun = (picked, pickedSize) => {
      mode = picked;
      size = pickedSize;
      storeMode(picked);
      storeSize(pickedSize);
      seedString = runSeedString(dateSeed, mode, size);
      officialRun = !readPlayedToday(dateSeed).has(seedString);
      markPlayed(dateSeed, seedString);
      scores = createSoupScore();
      colorCounter = 0;
      elapsedRun = 0;
      timeLeft = TIME_ATTACK_START_SECONDS;
      lastWholeSecond = -1;
      overlay.hidden = true;
      overlay.innerHTML = "";
      state = "playing";
      fx?.clear();
      app?.ticker.start();
      startWave(1);
    };
    const requestRun = async (picked, pickedSize) => {
      const seed = runSeedString(dateSeed, picked, pickedSize);
      if (readPlayedToday(dateSeed).has(seed)) {
        const confirm = desktopGlobal().confirm;
        if (typeof confirm === "function") {
          const proceed = await confirm({
            title: __("Replay today’s soup?"),
            message: sprintf(
              /* translators: 1: mode label (Daily / Time Attack), 2: board dimensions (e.g. 12×12). */
              __("You already played today’s %1$s (%2$s). The word positions can be memorized, so replays don’t earn a share card — that stays with your first run."),
              modeLabel(picked),
              sizeDims(pickedSize)
            ),
            confirmLabel: __("Replay anyway"),
            cancelLabel: __("Not now")
          });
          if (!proceed || disposed) {
            return;
          }
        }
      }
      startRun(picked, pickedSize);
    };
    const showMenu = () => {
      state = "menu";
      grid = null;
      renderChips();
      paintHud();
      overlay.hidden = false;
      overlay.innerHTML = "";
      const panel = document.createElement("div");
      panel.className = "soup__over-panel soup__menu";
      const heading = document.createElement("p");
      heading.className = "soup__over-heading";
      heading.textContent = __("Alphabet Soup");
      panel.appendChild(heading);
      const tagline = document.createElement("p");
      tagline.className = "soup__over-stats";
      tagline.textContent = sprintf(
        /* translators: %s: today's puzzle date (dd-mm-yyyy). */
        __("One pot, whole world: everyone gets the same soup today (%s). Drag across the letters to fish the words out."),
        dateSeed
      );
      panel.appendChild(tagline);
      if (ctx.challenge) {
        const note = document.createElement("p");
        note.className = "soup__over-stats";
        note.textContent = sprintf(
          /* translators: 1: challenger display name, 2: score to beat. */
          __("Challenge from %1$s — beat %2$s."),
          ctx.challenge.challengerName,
          String(ctx.challenge.scoreToBeat)
        );
        panel.appendChild(note);
      }
      const sizes = document.createElement("div");
      sizes.className = "soup__menu-sizes";
      sizes.setAttribute("role", "group");
      sizes.setAttribute("aria-label", __("Board size"));
      for (const option of SOUP_SIZES) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "soup__size-chip";
        if (option === size) {
          chip.classList.add("soup__size-chip--current");
        }
        chip.setAttribute(
          "aria-pressed",
          option === size ? "true" : "false"
        );
        chip.textContent = `${sizeLabel(option)} · ${sizeDims(option)}`;
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          size = option;
          storeSize(option);
          showMenu();
        });
        sizes.appendChild(chip);
      }
      panel.appendChild(sizes);
      const played = readPlayedToday(dateSeed);
      const options = document.createElement("div");
      options.className = "soup__menu-options";
      for (const option of SOUP_MODES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "soup__menu-option";
        if (option === mode) {
          button.classList.add("soup__menu-option--current");
        }
        const label = document.createElement("span");
        label.className = "soup__menu-option-label";
        label.textContent = modeLabel(option);
        button.appendChild(label);
        const hint = document.createElement("span");
        hint.className = "soup__menu-option-hint";
        hint.textContent = modeHint(option);
        button.appendChild(hint);
        if (played.has(runSeedString(dateSeed, option, size))) {
          const note = document.createElement("span");
          note.className = "soup__menu-option-played";
          note.textContent = __("Played today — replays aren’t shareable");
          button.appendChild(note);
        }
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          void requestRun(option, size);
        });
        options.appendChild(button);
      }
      panel.appendChild(options);
      overlay.appendChild(panel);
    };
    const pause = () => {
      if ("playing" !== state) {
        return;
      }
      state = "paused";
      anchor = null;
      selection = [];
      board?.clearSelection();
      showMessage(__("Paused — click to resume."));
      app?.ticker.stop();
    };
    const resume = () => {
      if ("paused" !== state) {
        return;
      }
      state = "playing";
      overlay.hidden = true;
      app?.ticker.start();
    };
    overlay.addEventListener("click", () => {
      if ("paused" === state) {
        resume();
      }
    });
    const tick = () => {
      if (!app || !fx || !board) {
        return;
      }
      const dt = Math.min(MAX_FRAME_SECONDS, app.ticker.deltaMS / 1e3);
      fx.update(dt);
      board.update(dt);
      if ("playing" !== state) {
        return;
      }
      elapsedRun += dt;
      if (waveTransition > 0) {
        waveTransition -= dt;
        if (waveTransition <= 0) {
          startWave(wave + 1);
        }
      }
      if ("time-attack" === mode && waveTransition <= 0) {
        timeLeft -= dt;
        const whole = Math.ceil(timeLeft);
        if (whole !== lastWholeSecond) {
          lastWholeSecond = whole;
          if (timeLeft > 0 && timeLeft <= LOW_TIME_SECONDS) {
            audio.tick();
          }
          paintHud();
        }
        if (timeLeft <= 0) {
          timeLeft = 0;
          gameOver(false);
        }
      } else {
        const whole = Math.floor(elapsedRun);
        if (whole !== lastWholeSecond) {
          lastWholeSecond = whole;
          paintHud();
        }
      }
    };
    const canvasPoint = (event) => {
      if (!app) {
        return null;
      }
      const rect = app.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return {
        x: (event.clientX - rect.left) / rect.width * fieldWidth(),
        y: (event.clientY - rect.top) / rect.height * fieldHeight()
      };
    };
    const onPointerDown = (event) => {
      if ("playing" !== state || !board || !grid || !app) {
        return;
      }
      const point = canvasPoint(event);
      const cell = point ? board.cellAt(point.x, point.y) : null;
      if (!cell) {
        return;
      }
      app.canvas.setPointerCapture(event.pointerId);
      anchor = cell;
      selection = [cell];
      board.showSelection(selection);
      audio.cellTouch(0);
    };
    const onPointerMove = (event) => {
      if (!anchor || !board || !grid) {
        return;
      }
      const point = canvasPoint(event);
      if (!point) {
        return;
      }
      const cell = board.cellAt(point.x, point.y);
      if (!cell) {
        return;
      }
      const next = lineCells(anchor, cell, grid.size);
      if (next.length !== selection.length || next[next.length - 1].row !== selection[selection.length - 1].row || next[next.length - 1].col !== selection[selection.length - 1].col) {
        if (next.length > selection.length) {
          audio.cellTouch(next.length - 1);
        }
        selection = next;
        board.showSelection(selection);
      }
    };
    const onPointerUp = () => {
      if (!anchor || !board) {
        return;
      }
      const cells = selection;
      anchor = null;
      selection = [];
      board.clearSelection();
      if ("playing" === state) {
        resolveSelection(cells);
      }
    };
    const boot = async () => {
      const desktop = desktopGlobal();
      if (typeof desktop.loadModules !== "function") {
        throw new Error("[desktop-mode] wp.desktop.loadModules missing.");
      }
      const wordsUrl = String(ctx.config.wordsUrl || "");
      if ("" === wordsUrl) {
        throw new Error(
          "[desktop-mode] Alphabet Soup config lacks the framework wordsUrl."
        );
      }
      const [, loadedDictionary] = await Promise.all([
        desktop.loadModules(["pixijs"]),
        loadDictionary(wordsUrl, {
          windowId: ctx.windowId,
          source: "desktop-mode/alphabet-soup"
        })
      ]);
      if (disposed) {
        return;
      }
      dictionary = loadedDictionary;
      pixi = getPixi();
      if (!pixi) {
        throw new Error("[desktop-mode] PixiJS failed to load.");
      }
      const instance = new pixi.Application();
      await instance.init({
        resizeTo: stageEl,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        // Own ticker — sharing `Ticker.shared` across bundles
        // crashes `Batcher.break()` (see content-graph/scene.ts).
        sharedTicker: false
      });
      if (disposed) {
        instance.destroy({ removeView: true }, { children: true, texture: true });
        return;
      }
      app = instance;
      app.canvas.className = "soup__canvas";
      stageEl.appendChild(app.canvas);
      app.stage.sortableChildren = true;
      board = createSoupBoard(pixi, app.stage);
      fx = createSoupFx(pixi, app.stage);
      board.relayout(fieldWidth(), fieldHeight());
      resizeObserver = new ResizeObserver(() => {
        if (!app || !board) {
          return;
        }
        app.resize();
        board.relayout(fieldWidth(), fieldHeight());
      });
      resizeObserver.observe(stageEl);
      app.canvas.addEventListener("pointerdown", onPointerDown);
      app.canvas.addEventListener("pointermove", onPointerMove);
      app.canvas.addEventListener("pointerup", onPointerUp);
      app.canvas.addEventListener("pointercancel", onPointerUp);
      app.canvas.style.touchAction = "none";
      unsubscribeWindow = desktopGlobal().onWindow?.(ctx.windowId, {
        blurred: pause
      }) ?? null;
      tickFn = tick;
      app.ticker.add(tickFn);
      paintHud();
      showMenu();
    };
    void boot().catch((err) => {
      if (disposed) {
        return;
      }
      showMessage(
        err instanceof Error ? err.message : __("Alphabet Soup could not start.")
      );
      if (typeof console !== "undefined") {
        console.error("[desktop-mode] Alphabet Soup boot failed:", err);
      }
    });
    return () => {
      if (disposed) {
        return;
      }
      disposed = true;
      audio.dispose();
      unsubscribeWindow?.();
      resizeObserver?.disconnect();
      if (app) {
        app.canvas.removeEventListener("pointerdown", onPointerDown);
        app.canvas.removeEventListener("pointermove", onPointerMove);
        app.canvas.removeEventListener("pointerup", onPointerUp);
        app.canvas.removeEventListener("pointercancel", onPointerUp);
        if (tickFn) {
          app.ticker.remove(tickFn);
        }
        app.ticker.stop();
        fx?.clear();
        board?.destroy();
        app.destroy({ removeView: true }, { children: true, texture: true });
        app = null;
      }
      root.remove();
    };
  }
  const def = {
    id: "alphabet-soup",
    title: __("Alphabet Soup"),
    icon: "dashicons-carrot",
    scoreColumns: [
      { key: "score", label: __("Score"), type: "number" },
      { key: "mode", label: __("Mode"), type: "text" },
      { key: "size", label: __("Size"), type: "text" },
      { key: "words", label: __("Words"), type: "number" },
      { key: "wpm", label: __("WPM"), type: "number" },
      { key: "accuracy", label: __("Accuracy"), type: "number" },
      { key: "streak", label: __("Streak"), type: "number" },
      { key: "wave", label: __("Wave"), type: "number" },
      { key: "time", label: __("Time"), type: "time" }
    ],
    window: {
      width: 860,
      height: 660,
      minWidth: 600,
      minHeight: 500
    },
    render: (ctx) => mountAlphabetSoup(ctx)
  };
  const globals = window;
  globals.desktopModeGames = globals.desktopModeGames || {};
  globals.desktopModeGames[def.id] = def;
})();
