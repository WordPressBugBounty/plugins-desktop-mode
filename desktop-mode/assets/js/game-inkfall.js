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
  const SOUND_STORAGE_KEY = "desktop-mode/inkfall-sound";
  const MASTER_LEVEL = 0.16;
  const PLUCK_LEVEL = 0.5;
  const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
  const BASE_FREQUENCY = 196;
  function letterFrequency(ch) {
    const letter = ch.toLowerCase();
    if (letter.length !== 1 || letter < "a" || letter > "z") {
      return 0;
    }
    const index = letter.charCodeAt(0) - 97;
    const semitones = 12 * Math.floor(index / MAJOR_SCALE.length) + MAJOR_SCALE[index % MAJOR_SCALE.length];
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
  function createGameAudio() {
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
      const { type = "sine", delay = 0, duration = 0.22, level: level2 = PLUCK_LEVEL } = opts;
      const start = context.currentTime + delay;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(1e-4, start);
      gain.gain.exponentialRampToValueAtTime(level2, start + 8e-3);
      gain.gain.exponentialRampToValueAtTime(1e-4, start + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    };
    return {
      letter(ch) {
        pluck(letterFrequency(ch));
      },
      typo() {
        pluck(98, { type: "triangle", duration: 0.15, level: 0.35 });
        pluck(103, { type: "triangle", duration: 0.12, level: 0.2 });
      },
      wordBurst(lastLetter) {
        const root = letterFrequency(lastLetter) || BASE_FREQUENCY;
        pluck(root, { duration: 0.3 });
        pluck(root * 1.25, { delay: 0.06, duration: 0.3 });
        pluck(root * 1.5, { delay: 0.12, duration: 0.35 });
        pluck(root * 2, { delay: 0.18, duration: 0.4, level: 0.4 });
      },
      miss() {
        pluck(165, { type: "triangle", duration: 0.3, level: 0.4 });
        pluck(123, { type: "triangle", delay: 0.12, duration: 0.4, level: 0.4 });
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
  const MAX_RAMP_SECONDS = 300;
  const STARTING_LIVES = 3;
  const REFERENCE_HEIGHT = 600;
  const DIFFICULTY_MODES = [
    "easy",
    "medium",
    "hard"
  ];
  const PRESETS = {
    // The original tuning — genuinely gentle for the first minute.
    easy: {
      spawn: [3200, 900],
      speed: [40, 170],
      concurrentStart: 1,
      concurrentSteps: [
        [20, 2],
        [60, 3],
        [120, 4],
        [200, 5]
      ],
      bandStart: [3, 4],
      bandSteps: [
        [30, 3, 5],
        [75, 3, 6],
        [150, 4, 8],
        [225, 5, 10],
        [300, 6, 12]
      ]
    },
    // Brisk from the first word; two words on screen almost
    // immediately, six by the end.
    medium: {
      spawn: [2400, 700],
      speed: [75, 230],
      concurrentStart: 1,
      concurrentSteps: [
        [10, 2],
        [40, 3],
        [90, 4],
        [150, 5],
        [240, 6]
      ],
      bandStart: [3, 5],
      bandSteps: [
        [20, 4, 6],
        [60, 4, 8],
        [120, 5, 10],
        [200, 6, 12],
        [300, 7, 12]
      ]
    },
    // Opens near easy's mid-game and keeps going: fast ink, long
    // words, up to seven at once.
    hard: {
      spawn: [1700, 550],
      speed: [110, 300],
      concurrentStart: 2,
      concurrentSteps: [
        [10, 3],
        [30, 4],
        [70, 5],
        [120, 6],
        [200, 7]
      ],
      bandStart: [4, 6],
      bandSteps: [
        [15, 5, 8],
        [45, 6, 10],
        [90, 7, 12],
        [150, 8, 12]
      ]
    }
  };
  function clampT(t) {
    if (!Number.isFinite(t) || t < 0) {
      return 0;
    }
    return Math.min(t, MAX_RAMP_SECONDS);
  }
  function preset(mode) {
    return PRESETS[mode] ?? PRESETS.easy;
  }
  function spawnIntervalMs(t, mode = "easy") {
    const clamped = clampT(t);
    const [start, floor] = preset(mode).spawn;
    return Math.round(
      start - (start - floor) * clamped / MAX_RAMP_SECONDS
    );
  }
  function fallSpeed(t, mode = "easy") {
    const clamped = clampT(t);
    const [start, cap] = preset(mode).speed;
    return start + (cap - start) * clamped / MAX_RAMP_SECONDS;
  }
  function maxConcurrent(t, mode = "easy") {
    const clamped = clampT(t);
    const { concurrentStart, concurrentSteps } = preset(mode);
    let value = concurrentStart;
    for (const [threshold, stepValue] of concurrentSteps) {
      if (clamped >= threshold) {
        value = stepValue;
      }
    }
    return value;
  }
  function lengthBand(t, mode = "easy") {
    const clamped = clampT(t);
    const { bandStart, bandSteps } = preset(mode);
    let band = {
      min: bandStart[0],
      max: bandStart[1]
    };
    for (const [threshold, min, max] of bandSteps) {
      if (clamped >= threshold) {
        band = { min, max };
      }
    }
    return band;
  }
  function level(t) {
    return Math.min(15, Math.floor(clampT(t) / 20));
  }
  function difficultyAt(t, mode = "easy") {
    const band = lengthBand(t, mode);
    return {
      spawnIntervalMs: spawnIntervalMs(t, mode),
      fallSpeed: fallSpeed(t, mode),
      maxConcurrent: maxConcurrent(t, mode),
      minLength: band.min,
      maxLength: band.max,
      level: level(t)
    };
  }
  const SCATTER_GRAVITY = 900;
  const SCATTER_LIFETIME = 0.9;
  function scatterVelocities(count, rng) {
    const particles = [];
    for (let i = 0; i < count; i++) {
      const lateral = count > 1 ? i / (count - 1) * 2 - 1 : 0;
      particles.push({
        vx: lateral * (80 + rng() * 60),
        vy: -(120 + rng() * 120),
        spin: (rng() * 2 - 1) * 6
      });
    }
    return particles;
  }
  function integrateStep(particle, dt) {
    const vyNext = particle.vy + SCATTER_GRAVITY * dt;
    return {
      dx: particle.vx * dt,
      // Trapezoidal-ish: average the old and new vertical velocity
      // over the step so coarse frames don't over-accelerate.
      dy: (particle.vy + vyNext) / 2 * dt,
      dRotation: particle.spin * dt,
      vyNext
    };
  }
  function scatterAlpha(age) {
    return Math.max(0, 1 - age / SCATTER_LIFETIME);
  }
  const INK_COLOR = 2832981;
  const ACCENT_COLOR = 9323693;
  const PAPER_COLOR = 16249832;
  const RULE_COLOR = 12375270;
  const MARGIN_COLOR = 15245729;
  const WORD_FONT = 'Georgia, "Times New Roman", serif';
  const WORD_FONT_SIZE = 26;
  const RULE_SPACING = 32;
  function paintPaper(graphics, width, height) {
    graphics.clear();
    graphics.rect(0, 0, width, height).fill({ color: PAPER_COLOR });
    for (let y = RULE_SPACING; y < height; y += RULE_SPACING) {
      graphics.moveTo(0, y).lineTo(width, y).stroke({ color: RULE_COLOR, width: 1, alpha: 0.55 });
    }
    const marginX = Math.min(64, Math.round(width * 0.08));
    graphics.moveTo(marginX, 0).lineTo(marginX, height).stroke({ color: MARGIN_COLOR, width: 2, alpha: 0.7 });
    graphics.moveTo(0, height - 6).lineTo(width, height - 6).stroke({ color: INK_COLOR, width: 2, alpha: 0.25 });
  }
  function buildWordSprite(pixi, text) {
    const container = new pixi.Container();
    const style = {
      fill: INK_COLOR,
      fontSize: WORD_FONT_SIZE,
      fontFamily: WORD_FONT
    };
    const matched = new pixi.Text({ text: "", style: { ...style, fill: ACCENT_COLOR } });
    const rest = new pixi.Text({ text, style });
    container.addChild(matched, rest);
    return { container, matched, rest, text, width: rest.width };
  }
  function setMatchedCount(sprite, count) {
    const clamped = Math.max(0, Math.min(count, sprite.text.length));
    sprite.matched.text = sprite.text.slice(0, clamped);
    sprite.rest.text = sprite.text.slice(clamped);
    sprite.rest.x = clamped > 0 ? sprite.matched.width : 0;
  }
  const NOTE_GLYPHS = ["♪", "♫", "♩", "♬"];
  const NOTE_FLIGHT_SECONDS = 0.18;
  const BLOT_LIFETIME = 1.1;
  function createFxLayer(pixi, stage, rng = Math.random) {
    const effects = [];
    const remove = (effect) => {
      const idx = effects.indexOf(effect);
      if (idx >= 0) {
        effects.splice(idx, 1);
      }
      if ("scatter" === effect.kind) {
        for (const char of effect.chars) {
          stage.removeChild(char.node);
          char.node.destroy();
        }
        return;
      }
      stage.removeChild(effect.node);
      effect.node.destroy();
    };
    return {
      launchNote(fromX, fromY, toX, toY, onArrive) {
        const glyph = NOTE_GLYPHS[Math.floor(rng() * NOTE_GLYPHS.length)] ?? NOTE_GLYPHS[0];
        const node = new pixi.Text({
          text: glyph,
          style: {
            fill: ACCENT_COLOR,
            fontSize: 30,
            fontFamily: WORD_FONT
          }
        });
        node.anchor.set(0.5);
        node.x = fromX;
        node.y = fromY;
        node.zIndex = 30;
        stage.addChild(node);
        effects.push({
          kind: "note",
          node,
          fromX,
          fromY,
          toX,
          toY,
          age: 0,
          onArrive
        });
      },
      tearWord(sprite) {
        const scratch = new pixi.Text({
          text: "",
          style: {
            fill: INK_COLOR,
            fontSize: WORD_FONT_SIZE,
            fontFamily: WORD_FONT
          }
        });
        const offsets = [];
        for (let i = 0; i < sprite.text.length; i++) {
          scratch.text = sprite.text.slice(0, i);
          offsets.push(scratch.width);
        }
        scratch.destroy();
        const particles = scatterVelocities(sprite.text.length, rng);
        const chars = [];
        for (let i = 0; i < sprite.text.length; i++) {
          const node = new pixi.Text({
            text: sprite.text[i],
            style: {
              fill: ACCENT_COLOR,
              fontSize: WORD_FONT_SIZE,
              fontFamily: WORD_FONT
            }
          });
          node.anchor.set(0.5);
          node.x = sprite.container.x + offsets[i] + 7;
          node.y = sprite.container.y + WORD_FONT_SIZE / 2;
          node.zIndex = 20;
          stage.addChild(node);
          chars.push({ node, particle: particles[i] });
        }
        stage.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        effects.push({ kind: "scatter", chars, age: 0 });
      },
      splashBlot(x, y) {
        const blot = new pixi.Graphics();
        blot.circle(0, 0, 9).fill({ color: INK_COLOR, alpha: 0.8 });
        blot.ellipse(-12, 3, 4, 2.5).fill({ color: INK_COLOR, alpha: 0.6 });
        blot.ellipse(11, -2, 3, 2).fill({ color: INK_COLOR, alpha: 0.6 });
        blot.circle(6, 7, 2.5).fill({ color: INK_COLOR, alpha: 0.5 });
        blot.x = x;
        blot.y = y;
        blot.zIndex = 10;
        stage.addChild(blot);
        effects.push({ kind: "blot", node: blot, age: 0 });
      },
      update(dt) {
        for (const effect of effects.slice()) {
          effect.age += dt;
          if ("note" === effect.kind) {
            const progress = Math.min(
              1,
              effect.age / NOTE_FLIGHT_SECONDS
            );
            const eased = 1 - (1 - progress) * (1 - progress);
            effect.node.x = effect.fromX + (effect.toX - effect.fromX) * eased;
            effect.node.y = effect.fromY + (effect.toY - effect.fromY) * progress * progress;
            effect.node.rotation = progress * 0.6;
            if (progress >= 1) {
              const arrive = effect.onArrive;
              remove(effect);
              arrive();
            }
            continue;
          }
          if ("scatter" === effect.kind) {
            for (const char of effect.chars) {
              const step = integrateStep(char.particle, dt);
              char.node.x += step.dx;
              char.node.y += step.dy;
              char.node.rotation += step.dRotation;
              char.particle.vy = step.vyNext;
              char.node.alpha = scatterAlpha(effect.age);
            }
            if (effect.age >= SCATTER_LIFETIME) {
              remove(effect);
            }
            continue;
          }
          const fadeStart = BLOT_LIFETIME * 0.4;
          if (effect.age <= fadeStart) {
            effect.node.alpha = 1;
          } else {
            const fade = (effect.age - fadeStart) / (BLOT_LIFETIME - fadeStart);
            effect.node.alpha = Math.max(0, 1 - fade);
          }
          if (effect.age >= BLOT_LIFETIME) {
            remove(effect);
          }
        }
      },
      busy() {
        return effects.length > 0;
      },
      clear() {
        for (const effect of effects.slice()) {
          remove(effect);
        }
      }
    };
  }
  function createGameInput(host, handlers) {
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    input.className = "inkfall__key-capture";
    host.appendChild(input);
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if ("Backspace" === e.key) {
        e.preventDefault();
        handlers.onBackspace();
        return;
      }
      if ("Escape" === e.key) {
        e.preventDefault();
        handlers.onEscape();
        return;
      }
      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        e.preventDefault();
        handlers.onLetter(e.key.toLowerCase());
      }
    };
    const onInput = () => {
      input.value = "";
    };
    input.addEventListener("keydown", onKeyDown);
    input.addEventListener("input", onInput);
    const onPointerDown = () => {
      window.setTimeout(() => input.focus(), 0);
    };
    host.addEventListener("pointerdown", onPointerDown);
    return {
      focus: () => input.focus(),
      dispose: () => {
        input.removeEventListener("keydown", onKeyDown);
        input.removeEventListener("input", onInput);
        host.removeEventListener("pointerdown", onPointerDown);
        input.remove();
      }
    };
  }
  function createMatcher() {
    let targetId = null;
    let matchedCount = 0;
    const reset = () => {
      targetId = null;
      matchedCount = 0;
    };
    return {
      handleKey(ch, live) {
        const letter = ch.toLowerCase();
        if (letter.length !== 1 || !/[a-z]/.test(letter)) {
          return { kind: "ignored" };
        }
        if (targetId === null) {
          let candidate = null;
          for (const word of live) {
            if (word.text[0] !== letter) {
              continue;
            }
            if (!candidate || word.y > candidate.y) {
              candidate = word;
            }
          }
          if (!candidate) {
            return { kind: "ignored" };
          }
          targetId = candidate.id;
          matchedCount = 1;
          if (candidate.text.length === 1) {
            const completedId = targetId;
            reset();
            return { kind: "completed", targetId: completedId };
          }
          return { kind: "locked", targetId, matchedCount };
        }
        const target = live.find((word) => word.id === targetId);
        if (!target) {
          reset();
          return this.handleKey(letter, live);
        }
        if (target.text[matchedCount] !== letter) {
          return { kind: "typo", targetId: target.id };
        }
        matchedCount++;
        if (matchedCount >= target.text.length) {
          const completedId = target.id;
          reset();
          return { kind: "completed", targetId: completedId };
        }
        return { kind: "advanced", targetId: target.id, matchedCount };
      },
      handleBackspace() {
        if (targetId === null) {
          return;
        }
        matchedCount = Math.max(1, matchedCount - 1);
      },
      release: reset,
      forget(wordId) {
        if (targetId === wordId) {
          reset();
        }
      },
      state() {
        return { targetId, matchedCount };
      }
    };
  }
  function createScoreState() {
    return {
      score: 0,
      wordsCompleted: 0,
      streak: 0,
      correctKeys: 0,
      totalKeys: 0,
      typoInCurrentWord: false
    };
  }
  function streakMultiplier(streak) {
    return 1 + 0.1 * Math.min(Math.max(0, streak), 10);
  }
  function wordPoints(length, heightFraction, streak) {
    const height = Math.min(1, Math.max(0, heightFraction));
    return Math.round(
      10 * length * (1 + 0.5 * height) * streakMultiplier(streak)
    );
  }
  function recordCorrectKey(state) {
    state.correctKeys++;
    state.totalKeys++;
  }
  function recordTypo(state) {
    state.totalKeys++;
    state.typoInCurrentWord = true;
    state.streak = 0;
  }
  function recordCompletion(state, length, heightFraction) {
    const points = wordPoints(length, heightFraction, state.streak);
    state.score += points;
    state.wordsCompleted++;
    if (state.typoInCurrentWord) {
      state.streak = 0;
    } else {
      state.streak++;
    }
    state.typoInCurrentWord = false;
    return points;
  }
  function recordMiss(state) {
    state.streak = 0;
    state.typoInCurrentWord = false;
  }
  function accuracyPercent(state) {
    if (state.totalKeys === 0) {
      return 100;
    }
    return Math.round(state.correctKeys / state.totalKeys * 100);
  }
  function wordsPerMinute(state, elapsedSeconds) {
    if (elapsedSeconds <= 0) {
      return 0;
    }
    return Math.round(state.correctKeys / 5 * (60 / elapsedSeconds));
  }
  function buildScoreRow(state, elapsedSeconds, level2, mode) {
    const meta = {
      words: state.wordsCompleted,
      wpm: wordsPerMinute(state, elapsedSeconds),
      accuracy: accuracyPercent(state),
      time: Math.round(elapsedSeconds),
      level: level2
    };
    if (mode) {
      meta.mode = mode;
    }
    return { score: state.score, meta };
  }
  function getPixi() {
    const pixi = window.PIXI;
    return pixi ?? null;
  }
  const MODE_STORAGE_KEY = "desktop-mode/inkfall-mode";
  function modeLabel(mode) {
    switch (mode) {
      case "medium":
        return __("Medium");
      case "hard":
        return __("Hard");
      default:
        return __("Easy");
    }
  }
  function modeHint(mode) {
    switch (mode) {
      case "medium":
        return __("Brisk from the first word.");
      case "hard":
        return __("Fast ink, long words. Good luck.");
      default:
        return __("A gentle warm-up that builds.");
    }
  }
  function readStoredMode() {
    try {
      const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (stored && DIFFICULTY_MODES.includes(stored)) {
        return stored;
      }
    } catch {
    }
    return "easy";
  }
  function storeMode(mode) {
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
    }
  }
  const MAX_FRAME_SECONDS = 0.05;
  const EMPTY_FIELD_SPAWN_GAP_MS = 250;
  function mountInkfall(ctx) {
    const root = document.createElement("div");
    root.className = "inkfall";
    ctx.container.appendChild(root);
    const audio = createGameAudio();
    const hud = document.createElement("div");
    hud.className = "inkfall__hud";
    const scoreEl = document.createElement("span");
    scoreEl.className = "inkfall__hud-score";
    const streakEl = document.createElement("span");
    streakEl.className = "inkfall__hud-streak";
    const livesEl = document.createElement("span");
    livesEl.className = "inkfall__hud-lives";
    const levelEl = document.createElement("span");
    levelEl.className = "inkfall__hud-level";
    const soundToggle = document.createElement("button");
    soundToggle.type = "button";
    soundToggle.className = "inkfall__hud-sound";
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
    hud.append(scoreEl, streakEl, livesEl, levelEl);
    if (ctx.challenge) {
      const ribbon = document.createElement("span");
      ribbon.className = "inkfall__hud-ribbon";
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
    const stageEl = document.createElement("div");
    stageEl.className = "inkfall__stage";
    root.appendChild(stageEl);
    const overlay = document.createElement("div");
    overlay.className = "inkfall__overlay";
    overlay.hidden = true;
    root.appendChild(overlay);
    const showMessage = (text) => {
      overlay.hidden = false;
      overlay.innerHTML = "";
      const p = document.createElement("p");
      p.className = "inkfall__overlay-message";
      p.textContent = text;
      overlay.appendChild(p);
    };
    showMessage(__("Loading the notebook…"));
    let disposed = false;
    let state = "loading";
    let app = null;
    let pixi = null;
    let fx = null;
    let paper = null;
    let dictionary = null;
    let input = null;
    let resizeObserver = null;
    let unsubscribeWindow = null;
    let tickFn = null;
    const matcher = createMatcher();
    let scores = createScoreState();
    let live = [];
    let lives = STARTING_LIVES;
    let clockSeconds = 0;
    let spawnTimerMs = 0;
    let lastSpawnAtMs = 0;
    let elapsedTotalMs = 0;
    let nextWordId = 1;
    let mode = readStoredMode();
    const paintHud = () => {
      scoreEl.textContent = sprintf(
        /* translators: %s: current score. */
        __("Score %s"),
        String(scores.score)
      );
      streakEl.textContent = scores.streak > 1 ? `×${scores.streak}` : "";
      livesEl.textContent = "●".repeat(lives) + "○".repeat(
        Math.max(0, STARTING_LIVES - lives)
      );
      levelEl.textContent = sprintf(
        /* translators: 1: current level number, 2: difficulty label. */
        __("Level %1$s · %2$s"),
        String(level(clockSeconds)),
        modeLabel(mode)
      );
    };
    const fieldWidth = () => app?.renderer.width ?? 600;
    const fieldHeight = () => app?.renderer.height ?? REFERENCE_HEIGHT;
    const bottomY = () => fieldHeight() - 10;
    const matchable = () => live.map((word) => ({
      id: word.id,
      text: word.text,
      y: word.sprite.container.y
    }));
    const removeWord = (word, keepSprite) => {
      live = live.filter((entry) => entry.id !== word.id);
      matcher.forget(word.id);
      if (!keepSprite && app) {
        app.stage.removeChild(word.sprite.container);
        word.sprite.container.destroy({ children: true });
      }
    };
    const spawnWord = () => {
      if (!app || !pixi || !dictionary) {
        return;
      }
      const snapshot = difficultyAt(clockSeconds, mode);
      const initials = new Set(live.map((word) => word.text[0]));
      const text = dictionary.pick(
        snapshot.minLength,
        snapshot.maxLength,
        Math.random,
        initials
      );
      if ("" === text) {
        return;
      }
      const sprite = buildWordSprite(pixi, text);
      const margin = Math.min(64, Math.round(fieldWidth() * 0.08));
      const maxX = Math.max(
        margin + 8,
        fieldWidth() - sprite.width - 16
      );
      sprite.container.x = margin + 8 + Math.random() * Math.max(1, maxX - margin - 8);
      sprite.container.y = -WORD_FONT_SIZE - 4;
      app.stage.addChild(sprite.container);
      live.push({
        id: nextWordId++,
        text,
        sprite,
        jitter: 0.9 + Math.random() * 0.2
      });
      lastSpawnAtMs = elapsedTotalMs;
    };
    const applyHighlight = () => {
      const lock = matcher.state();
      for (const word of live) {
        setMatchedCount(
          word.sprite,
          word.id === lock.targetId ? lock.matchedCount : 0
        );
      }
    };
    const completeWord = (wordId) => {
      const word = live.find((entry) => entry.id === wordId);
      if (!word || !fx) {
        return;
      }
      const height = fieldHeight();
      const heightFraction = (bottomY() - word.sprite.container.y) / Math.max(1, height);
      recordCompletion(scores, word.text.length, heightFraction);
      const sprite = word.sprite;
      removeWord(word, true);
      setMatchedCount(sprite, sprite.text.length);
      const lastLetter = sprite.text[sprite.text.length - 1];
      const targetX = sprite.container.x + sprite.width / 2;
      const targetY = sprite.container.y + WORD_FONT_SIZE / 2;
      fx.launchNote(
        fieldWidth() / 2,
        fieldHeight() - 12,
        targetX,
        targetY,
        () => {
          fx?.tearWord(sprite);
          audio.wordBurst(lastLetter);
        }
      );
      paintHud();
    };
    const gameOver = () => {
      state = "over";
      matcher.release();
      applyHighlight();
      const elapsed = Math.min(clockSeconds, MAX_RAMP_SECONDS);
      const row = buildScoreRow(scores, elapsed, level(clockSeconds), mode);
      overlay.hidden = false;
      overlay.innerHTML = "";
      const panel = document.createElement("div");
      panel.className = "inkfall__over-panel";
      const heading = document.createElement("p");
      heading.className = "inkfall__over-heading";
      if (ctx.challenge) {
        heading.textContent = row.score > ctx.challenge.scoreToBeat ? __("Game Over — challenge beaten!") : __("Game Over — challenge missed.");
      } else {
        heading.textContent = __("Game Over");
      }
      panel.appendChild(heading);
      const stats = document.createElement("p");
      stats.className = "inkfall__over-stats";
      stats.textContent = sprintf(
        /* translators: 1: score, 2: words typed, 3: words per minute, 4: accuracy percent. */
        __("Score %1$s — %2$s words, %3$s WPM, %4$s%% accuracy."),
        String(row.score),
        String(scores.wordsCompleted),
        String(wordsPerMinute(scores, Math.max(1, elapsed))),
        String(accuracyPercent(scores))
      );
      panel.appendChild(stats);
      const saveNote = document.createElement("p");
      saveNote.className = "inkfall__over-save";
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
      actions.className = "inkfall__over-actions";
      const again = document.createElement("button");
      again.type = "button";
      again.className = "inkfall__button inkfall__button--primary";
      again.textContent = __("Play again");
      again.addEventListener("click", () => {
        startRun(mode);
      });
      actions.appendChild(again);
      const changeMode = document.createElement("button");
      changeMode.type = "button";
      changeMode.className = "inkfall__button";
      changeMode.textContent = __("Change difficulty");
      changeMode.addEventListener("click", () => {
        showMenu();
      });
      actions.appendChild(changeMode);
      const quit = document.createElement("button");
      quit.type = "button";
      quit.className = "inkfall__button";
      quit.textContent = __("Close");
      quit.addEventListener("click", () => ctx.close());
      actions.appendChild(quit);
      panel.appendChild(actions);
      overlay.appendChild(panel);
    };
    const clearField = () => {
      for (const word of live.slice()) {
        removeWord(word, false);
      }
      fx?.clear();
      scores = createScoreState();
      lives = STARTING_LIVES;
      clockSeconds = 0;
      spawnTimerMs = 0;
      matcher.release();
    };
    const startRun = (picked) => {
      mode = picked;
      storeMode(picked);
      clearField();
      overlay.hidden = true;
      overlay.innerHTML = "";
      state = "playing";
      app?.ticker.start();
      paintHud();
      input?.focus();
    };
    const showMenu = () => {
      clearField();
      state = "menu";
      paintHud();
      overlay.hidden = false;
      overlay.innerHTML = "";
      const panel = document.createElement("div");
      panel.className = "inkfall__over-panel inkfall__menu";
      const heading = document.createElement("p");
      heading.className = "inkfall__over-heading";
      heading.textContent = __("Choose your pace");
      panel.appendChild(heading);
      if (ctx.challenge) {
        const note = document.createElement("p");
        note.className = "inkfall__over-stats";
        note.textContent = sprintf(
          /* translators: 1: challenger display name, 2: score to beat. */
          __("Challenge from %1$s — beat %2$s."),
          ctx.challenge.challengerName,
          String(ctx.challenge.scoreToBeat)
        );
        panel.appendChild(note);
      }
      const options = document.createElement("div");
      options.className = "inkfall__menu-options";
      for (const option of DIFFICULTY_MODES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "inkfall__menu-option";
        if (option === mode) {
          button.classList.add("inkfall__menu-option--current");
        }
        const label = document.createElement("span");
        label.className = "inkfall__menu-option-label";
        label.textContent = modeLabel(option);
        button.appendChild(label);
        const hint = document.createElement("span");
        hint.className = "inkfall__menu-option-hint";
        hint.textContent = modeHint(option);
        button.appendChild(hint);
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          startRun(option);
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
      input?.focus();
    };
    overlay.addEventListener("click", () => {
      if ("paused" === state) {
        resume();
      }
    });
    const tick = () => {
      if (!app || !fx) {
        return;
      }
      const dt = Math.min(MAX_FRAME_SECONDS, app.ticker.deltaMS / 1e3);
      elapsedTotalMs += app.ticker.deltaMS;
      fx.update(dt);
      if ("playing" !== state) {
        return;
      }
      clockSeconds += dt;
      const snapshot = difficultyAt(clockSeconds, mode);
      const speedScale = fieldHeight() / REFERENCE_HEIGHT;
      spawnTimerMs += dt * 1e3;
      const canSpawn = live.length < snapshot.maxConcurrent;
      if (canSpawn && spawnTimerMs >= snapshot.spawnIntervalMs) {
        spawnTimerMs = 0;
        spawnWord();
      } else if (live.length === 0 && elapsedTotalMs - lastSpawnAtMs > EMPTY_FIELD_SPAWN_GAP_MS) {
        spawnTimerMs = 0;
        spawnWord();
      }
      const floor = bottomY();
      for (const word of live.slice()) {
        word.sprite.container.y += snapshot.fallSpeed * speedScale * word.jitter * dt;
        if (word.sprite.container.y + WORD_FONT_SIZE >= floor) {
          const centerX = word.sprite.container.x + word.sprite.width / 2;
          removeWord(word, false);
          fx.splashBlot(centerX, floor);
          audio.miss();
          recordMiss(scores);
          lives--;
          applyHighlight();
          paintHud();
          if (lives <= 0) {
            gameOver();
            return;
          }
        }
      }
    };
    const onLetter = (letter) => {
      if ("playing" !== state) {
        return;
      }
      const result = matcher.handleKey(letter, matchable());
      switch (result.kind) {
        case "locked":
        case "advanced":
          recordCorrectKey(scores);
          audio.letter(letter);
          applyHighlight();
          break;
        case "completed":
          recordCorrectKey(scores);
          audio.letter(letter);
          completeWord(result.targetId);
          applyHighlight();
          break;
        case "typo": {
          recordTypo(scores);
          audio.typo();
          const word = live.find(
            (entry) => entry.id === result.targetId
          );
          if (word) {
            word.sprite.container.alpha = 0.4;
            window.setTimeout(() => {
              word.sprite.container.alpha = 1;
            }, 120);
          }
          paintHud();
          break;
        }
      }
    };
    const boot = async () => {
      const desktop = desktopGlobal();
      if (typeof desktop.loadModules !== "function") {
        throw new Error("[desktop-mode] wp.desktop.loadModules missing.");
      }
      const wordsUrl = String(ctx.config.wordsUrl || "");
      if ("" === wordsUrl) {
        throw new Error("[desktop-mode] Inkfall config lacks wordsUrl.");
      }
      const [, loadedDictionary] = await Promise.all([
        desktop.loadModules(["pixijs"]),
        loadDictionary(wordsUrl, {
          windowId: ctx.windowId,
          source: "desktop-mode/inkfall"
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
      app.canvas.className = "inkfall__canvas";
      stageEl.appendChild(app.canvas);
      app.stage.sortableChildren = true;
      paper = new pixi.Graphics();
      paper.zIndex = 0;
      app.stage.addChild(paper);
      paintPaper(paper, fieldWidth(), fieldHeight());
      fx = createFxLayer(pixi, app.stage);
      resizeObserver = new ResizeObserver(() => {
        if (!app || !paper) {
          return;
        }
        app.resize();
        paintPaper(paper, fieldWidth(), fieldHeight());
        const margin = Math.min(64, Math.round(fieldWidth() * 0.08));
        for (const word of live) {
          const maxX = fieldWidth() - word.sprite.width - 16;
          if (word.sprite.container.x > maxX) {
            word.sprite.container.x = Math.max(margin + 8, maxX);
          }
        }
      });
      resizeObserver.observe(stageEl);
      input = createGameInput(root, {
        onLetter,
        onBackspace: () => {
          matcher.handleBackspace();
          applyHighlight();
        },
        onEscape: () => {
          matcher.release();
          applyHighlight();
        }
      });
      unsubscribeWindow = desktopGlobal().onWindow?.(ctx.windowId, {
        blurred: pause,
        focused: () => input?.focus()
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
        err instanceof Error ? err.message : __("Inkfall could not start.")
      );
      if (typeof console !== "undefined") {
        console.error("[desktop-mode] Inkfall boot failed:", err);
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
      input?.dispose();
      if (app) {
        if (tickFn) {
          app.ticker.remove(tickFn);
        }
        app.ticker.stop();
        fx?.clear();
        app.destroy({ removeView: true }, { children: true, texture: true });
        app = null;
      }
      root.remove();
    };
  }
  const def = {
    id: "inkfall",
    title: __("Inkfall"),
    icon: "dashicons-edit",
    scoreColumns: [
      { key: "score", label: __("Score"), type: "number" },
      { key: "mode", label: __("Difficulty"), type: "text" },
      { key: "words", label: __("Words"), type: "number" },
      { key: "wpm", label: __("WPM"), type: "number" },
      { key: "accuracy", label: __("Accuracy"), type: "number" },
      { key: "time", label: __("Time"), type: "time" },
      { key: "level", label: __("Level"), type: "number" }
    ],
    window: {
      width: 820,
      height: 620,
      minWidth: 520,
      minHeight: 420
    },
    render: (ctx) => mountInkfall(ctx)
  };
  const globals = window;
  globals.desktopModeGames = globals.desktopModeGames || {};
  globals.desktopModeGames[def.id] = def;
})();
