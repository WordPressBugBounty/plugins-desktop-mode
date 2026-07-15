(function() {
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
    const cacheKey = parsed.toString();
    const cached = gravatarCache.get(cacheKey);
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
      gravatarCache.set(cacheKey, next);
      return next;
    });
    gravatarCache.set(cacheKey, probe);
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
  function render(result, container) {
    const existing = mountState.get(container);
    if (existing && existing.strings === result.strings) {
      applyValues(existing.parts, result.values);
      return;
    }
    const compiled = compile(result.strings);
    const fragment = compiled.template.content.cloneNode(true);
    const parts = compiled.buildParts(fragment);
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(fragment);
    applyValues(parts, result.values);
    mountState.set(container, { strings: result.strings, parts });
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
  const styles$2 = css`:host{display:block;--wpd-table-bg:var( --wpd-surface,#fff );--wpd-table-border:var( --wpd-border,rgba( 0,0,0,0.08 ) );--wpd-table-column-border:var( --wpd-border-strong,rgba( 0,0,0,0.14 ) );--wpd-table-header-bg:var( --wpd-surface-elevated,#f6f7f7 );--wpd-table-row-hover:rgba( 0,0,0,0.04 );--wpd-table-stripe:rgba( 0,0,0,0.03 );--wpd-table-cell-padding:8px 12px;--wpd-table-font-size:13px;--wpd-table-max-height:none;font-size:var( --wpd-table-font-size );color:inherit}:host( [ hidden ] ){display:none}.scroll{position:relative;overflow:auto;max-height:var( --wpd-table-max-height );border:1px solid var( --wpd-table-border );border-radius:4px;background:var( --wpd-table-bg )}table{width:100%;border-collapse:separate;border-spacing:0;background:var( --wpd-table-bg )}thead th{text-align:start;font-weight:600;background-color:var( --wpd-table-header-bg );padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );white-space:nowrap}tbody td{padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );background-color:var( --wpd-table-bg );vertical-align:middle}tbody tr:last-child td{border-bottom:0}:host( [ striped ] ) tbody tr:nth-child( odd ) td{background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ hover ] ) tbody tr:hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}:host( [ hover ] [ striped ] ) tbody tr:nth-child( odd ):hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) ),linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ compact ] ){--wpd-table-cell-padding:4px 8px;--wpd-table-font-size:12px}:host( [ bordered ] ) thead th,:host( [ bordered ] ) tbody td{border-inline-end:1px solid var( --wpd-table-column-border )}:host( [ bordered ] ) thead th:last-child,:host( [ bordered ] ) tbody td:last-child{border-inline-end:0}th.is-sticky,td.is-sticky{position:sticky;z-index:10}tbody td.is-sticky{background-color:var( --wpd-table-bg )}thead th.is-sticky{background-color:var( --wpd-table-header-bg );z-index:30}:host( [ sticky-header ] ) thead th{position:sticky;top:0;z-index:20}:host( [ sticky-header ] ) thead tr.filter-row th{top:var( --wpd-table-header-height,33px );z-index:20}:host( [ sticky-header ] ) thead th.is-sticky{z-index:40}:host( [ sticky-header ] ) thead tr.filter-row th.is-sticky{z-index:40}th.is-sticky-edge,td.is-sticky-edge{border-inline-end:var( --wpd-table-sticky-edge,2px solid var( --wpd-table-border ) )}.align-center{text-align:center}.align-end{text-align:end}.filter-row th{padding:4px 8px;background-color:var( --wpd-table-header-bg );border-bottom:1px solid var( --wpd-table-border );font-weight:400}.filter-input,.filter-select{width:100%;min-width:60px;box-sizing:border-box;padding:4px 6px;font:inherit;color:inherit;background-color:var( --wpd-table-bg );border:1px solid var( --wpd-table-border );border-radius:3px}.filter-input:focus,.filter-select:focus{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-1px}.expander{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:3px;font-size:11px;line-height:1}.expander:hover{background:rgba( 0,0,0,0.06 )}td.col-expander,th.col-expander{width:36px;min-width:36px;padding-left:0;padding-right:0;text-align:center}tr.subtable td{padding:0;background-color:var( --wpd-table-bg );background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) );border-bottom:1px solid var( --wpd-table-border )}tr.subtable .subtable-inner{padding:8px 12px 8px 32px}tr.empty td{padding:24px;text-align:center;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );font-style:italic}thead th.is-sortable{cursor:pointer;user-select:none}thead th.is-sortable:hover{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}thead th.is-sortable:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-2px}.sort-indicator{font-size:10px;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );margin-inline-start:2px}thead th.sort-asc .sort-indicator,thead th.sort-desc .sort-indicator{color:var( --wp-admin-theme-color,#2271b1 )}td.col-select,th.col-select{width:40px;min-width:40px;padding-left:0;padding-right:0;text-align:center}.select-all-checkbox,.select-row-checkbox{cursor:pointer;margin:0}tbody tr.is-selected td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 10%,var( --wpd-table-bg ) );background-image:none}tbody tr.is-selected:hover td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 16%,var( --wpd-table-bg ) )}tbody tr.skeleton td{padding:var( --wpd-table-cell-padding )}.skeleton-bar{display:block;height:12px;border-radius:3px;background:linear-gradient( 90deg,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 0%,var( --wpd-table-skeleton-highlight,rgba( 0,0,0,0.14 ) ) 50%,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 100% );background-size:200% 100%;animation:wpd-table-skeleton-pulse 1.4s ease-in-out infinite}@keyframes wpd-table-skeleton-pulse{0%{background-position:200% 50%}100%{background-position:-200% 50%}}@media ( prefers-reduced-motion:reduce ){.skeleton-bar{animation:none}}`;
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
  _WpdTable.styles = [styles$2];
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
  const styles$1 = css`:host{display:inline-flex;max-width:100%;vertical-align:middle}:host( [ hidden ] ){display:none}.wpd-chip{display:inline-flex;align-items:center;gap:var( --wpd-chip-gap,4px );padding:var( --wpd-chip-padding,2px 8px );border-radius:var( --wpd-chip-radius,999px );font-size:var( --wpd-chip-font-size,12px );line-height:var( --wpd-chip-line-height,1.6 );font-weight:var( --wpd-chip-font-weight,500 );background:var( --wpd-chip-bg,#f0f0f1 );color:var( --wpd-chip-fg,#1d2327 );border:var( --wpd-chip-border,1px solid transparent );max-width:100%;box-sizing:border-box;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease,transform 0.12s ease,opacity 0.12s ease}:host( [ tone='accent' ] ) .wpd-chip{background:var( --wpd-chip-bg,color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 14%,transparent ) );color:var( --wpd-chip-fg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ tone='positive' ] ) .wpd-chip{background:var( --wpd-chip-bg,rgba( 30,132,73,0.14 ) );color:var( --wpd-chip-fg,#1d6f42 )}:host( [ tone='warning' ] ) .wpd-chip{background:var( --wpd-chip-bg,rgba( 217,119,6,0.18 ) );color:var( --wpd-chip-fg,#8a4a06 )}:host( [ tone='danger' ] ) .wpd-chip{background:var( --wpd-chip-bg,rgba( 214,54,56,0.14 ) );color:var( --wpd-chip-fg,#a02622 )}:host( [ pending ] ) .wpd-chip{opacity:0.65;animation:wpd-chip-pulse 1.2s ease-in-out infinite}@keyframes wpd-chip-pulse{0%,100%{opacity:0.55}50%{opacity:0.95}}.wpd-chip__label{max-width:var( --wpd-chip-label-max,220px );overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wpd-chip__icon{display:inline-flex;align-items:center;flex-shrink:0}.wpd-chip__icon::slotted( * ){display:inline-flex}.wpd-chip__dismiss{appearance:none;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:16px;height:16px;margin-inline-start:2px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer;opacity:0.55;transition:opacity 0.12s ease,background-color 0.12s ease}.wpd-chip__dismiss:hover,.wpd-chip__dismiss:focus-visible{opacity:1;background:rgba( 0,0,0,0.12 );outline:none}.wpd-chip__dismiss:focus-visible{box-shadow:0 0 0 2px var( --wp-admin-theme-color,#2271b1 )}.wpd-chip__dismiss[ disabled ]{opacity:0.35;cursor:not-allowed}.wpd-chip__dismiss svg{display:block;width:10px;height:10px}:host( [ disabled ] ) .wpd-chip{opacity:0.55;cursor:not-allowed}:host( [ size='compact' ] ) .wpd-chip{padding:var( --wpd-chip-padding,1px 6px );font-size:var( --wpd-chip-font-size,11px )}`;
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
								${_iconCross()}
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
  _WpdChip.styles = [styles$1];
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
  function _iconCross() {
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
  const HIGHLIGHTS = [
    {
      icon: "dashicons-yes-alt",
      title: __("Triage in one place"),
      body: __(
        "Pending / All / Spam / Trash / Mine tabs — every status surface in a single window with live counts."
      )
    },
    {
      icon: "dashicons-controls-repeat",
      title: __("Bulk moderation with undo"),
      body: __(
        "Multi-select and approve, spam, or trash dozens at once. Every action shows an 8-second undo toast."
      )
    },
    {
      icon: "dashicons-format-chat",
      title: __("Inline reply"),
      body: __(
        "Reply right inside the row — no modal, no full-page navigation. Press R on any row to jump straight to the editor."
      )
    },
    {
      icon: "dashicons-warning",
      title: __("Spam confidence score"),
      body: __(
        "Every comment gets a 0–100 score from Akismet + heuristics. Optionally turn on AI scoring in OS Settings → Features so each new comment is also scored by your configured AI provider on arrival."
      )
    },
    {
      icon: "dashicons-admin-users",
      title: __("Author insights drawer"),
      body: __(
        "Click an avatar to see the author's full history — total comments, spam rate, first seen, and one-click block."
      )
    },
    {
      icon: "dashicons-keyboard-hide",
      title: __("Keyboard moderation"),
      body: __(
        "J/K to navigate, A approve, S spam, D trash, R reply, E edit, U undo. Press ? any time for the cheat sheet."
      )
    }
  ];
  async function showCommentsIntroDialog() {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "wpd-intro-backdrop";
      const dialog = document.createElement("div");
      dialog.className = "wpd-intro wpd-intro--comments";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "wpd-comments-intro-title");
      dialog.tabIndex = -1;
      backdrop.appendChild(dialog);
      const titleEl = document.createElement("h2");
      titleEl.id = "wpd-comments-intro-title";
      titleEl.className = "wpd-intro__title";
      titleEl.textContent = __("Welcome to the new Comments");
      dialog.appendChild(titleEl);
      const lede = document.createElement("p");
      lede.className = "wpd-intro__lede";
      lede.textContent = __(
        "A moderation surface built around how you actually triage: bulk actions with undo, an inline reply editor, keyboard shortcuts, and a spam score that surfaces the obvious junk first."
      );
      dialog.appendChild(lede);
      const grid = document.createElement("div");
      grid.className = "wpd-intro__grid";
      HIGHLIGHTS.forEach((h) => {
        const card = document.createElement("div");
        card.className = "wpd-intro__card";
        const icon = document.createElement("span");
        icon.className = `dashicons ${h.icon} wpd-intro__card-icon`;
        icon.setAttribute("aria-hidden", "true");
        const heading = document.createElement("h3");
        heading.className = "wpd-intro__card-title";
        heading.textContent = h.title;
        const body = document.createElement("p");
        body.className = "wpd-intro__card-body";
        body.textContent = h.body;
        card.append(icon, heading, body);
        grid.appendChild(card);
      });
      dialog.appendChild(grid);
      const escape = document.createElement("p");
      escape.className = "wpd-intro__escape";
      escape.textContent = __(
        "Prefer the classic Comments screen? You can switch back any time from OS Settings → Features."
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
      confirmBtn.textContent = __("Let me moderate");
      actions.append(settingsBtn, confirmBtn);
      dialog.appendChild(actions);
      document.body.appendChild(backdrop);
      const cleanup = (result) => {
        document.removeEventListener("keydown", onKey);
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
    });
  }
  function statusForTab(tab) {
    switch (tab) {
      case "pending":
        return "hold";
      case "all":
        return "approve";
      case "spam":
        return "spam";
      case "trash":
        return "trash";
      case "mine":
        return "approve,hold,spam";
    }
  }
  let activeWindowId = "desktop-mode-comments";
  function setActiveWindowId(id) {
    activeWindowId = id;
  }
  let activeConfig = null;
  function setActiveConfig(config) {
    activeConfig = config;
  }
  function getActiveConfig() {
    return activeConfig;
  }
  function authHeaders(cfg) {
    return {
      "X-WP-Nonce": cfg.restNonce,
      "Content-Type": "application/json"
    };
  }
  async function fetchComments(cfg, params) {
    const url = new URL(cfg.commentsUrl);
    const qa = cfg.queryArgs ?? {};
    Object.entries(qa).forEach(([k, v]) => {
      if (k === "status") {
        return;
      }
      if (Array.isArray(v)) {
        v.forEach((item) => url.searchParams.append(k, String(item)));
      } else if (v !== null && v !== void 0) {
        url.searchParams.set(k, String(v));
      }
    });
    url.searchParams.set("status", statusForTab(params.tab));
    url.searchParams.set("page", String(params.page));
    url.searchParams.set("per_page", String(params.perPage));
    if (params.search && params.search.trim() !== "") {
      url.searchParams.set("search", params.search.trim());
    }
    if (params.tab === "mine" && params.currentUserId > 0) {
      url.searchParams.set("author", String(params.currentUserId));
    }
    const response = await trackedFetch(
      url.toString(),
      {
        method: "GET",
        credentials: "same-origin",
        headers: authHeaders(cfg)
      },
      {
        windowId: activeWindowId,
        source: "desktop-mode/comments/list"
      }
    );
    if (!response.ok) {
      throw new Error(`Comments list failed: ${response.status}`);
    }
    const rows = await response.json();
    const total = parseInt(
      response.headers.get("X-WP-Total") ?? String(rows.length),
      10
    );
    const totalPages = parseInt(
      response.headers.get("X-WP-TotalPages") ?? "1",
      10
    );
    return { rows, total, totalPages };
  }
  async function bulkModerate(cfg, ids, action) {
    const response = await trackedFetch(
      cfg.bulkUrl,
      {
        method: "POST",
        credentials: "same-origin",
        headers: authHeaders(cfg),
        body: JSON.stringify({ ids, action })
      },
      {
        windowId: activeWindowId,
        source: `desktop-mode/comments/bulk/${action}`
      }
    );
    if (!response.ok) {
      throw new Error(`Bulk action ${action} failed: ${response.status}`);
    }
    return await response.json();
  }
  async function updateCommentContent(cfg, id, content) {
    const url = `${cfg.commentsUrl}/${id}`;
    const response = await trackedFetch(
      url,
      {
        method: "POST",
        credentials: "same-origin",
        headers: authHeaders(cfg),
        body: JSON.stringify({ content })
      },
      {
        windowId: activeWindowId,
        source: "desktop-mode/comments/edit"
      }
    );
    if (!response.ok) {
      throw new Error(`Comment edit failed: ${response.status}`);
    }
    return await response.json();
  }
  async function postReply(cfg, parentId, content) {
    const response = await trackedFetch(
      cfg.replyUrl,
      {
        method: "POST",
        credentials: "same-origin",
        headers: authHeaders(cfg),
        body: JSON.stringify({ parent: parentId, content })
      },
      {
        windowId: activeWindowId,
        source: "desktop-mode/comments/reply"
      }
    );
    if (!response.ok) {
      throw new Error(`Reply failed: ${response.status}`);
    }
    return await response.json();
  }
  async function fetchAuthorInsights(cfg, email) {
    const url = `${cfg.insightsUrlBase}${encodeURIComponent(email)}`;
    const response = await trackedFetch(
      url,
      {
        method: "GET",
        credentials: "same-origin",
        headers: authHeaders(cfg)
      },
      {
        windowId: activeWindowId,
        source: "desktop-mode/comments/insights"
      }
    );
    if (!response.ok) {
      throw new Error(`Insights failed: ${response.status}`);
    }
    return await response.json();
  }
  async function fetchCounts(cfg) {
    const response = await trackedFetch(
      cfg.countsUrl,
      {
        method: "GET",
        credentials: "same-origin",
        headers: authHeaders(cfg)
      },
      {
        windowId: activeWindowId,
        source: "desktop-mode/comments/counts",
        silent: true
      }
    );
    if (!response.ok) {
      throw new Error(`Counts failed: ${response.status}`);
    }
    return await response.json();
  }
  async function fetchReplies(cfg, parentId) {
    const url = new URL(cfg.commentsUrl);
    url.searchParams.set("parent", String(parentId));
    url.searchParams.set("per_page", "50");
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "asc");
    url.searchParams.set("status", "approve,hold");
    const response = await trackedFetch(
      url.toString(),
      {
        method: "GET",
        credentials: "same-origin",
        headers: authHeaders(cfg)
      },
      {
        windowId: activeWindowId,
        source: "desktop-mode/comments/replies"
      }
    );
    if (!response.ok) {
      throw new Error(`Replies fetch failed: ${response.status}`);
    }
    return await response.json();
  }
  const styles = css`:host{display:inline-flex}:host( [ fill-cell ] ){display:flex;width:100%}button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:var( --wpd-button-padding,6px 12px );border-radius:var( --wpd-button-border-radius,6px );font:inherit;font-weight:500;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease;background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid var( --desktop-mode-border,#c3c4c7 ) )}:host( [ fill-cell ] ) button{width:100%;min-height:var( --wpd-button-min-height,44px )}button:disabled{opacity:0.5;cursor:not-allowed}button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.04 ) )}:host( [ variant='primary' ] ) button{background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) );color:var( --wpd-button-fg,#fff );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='primary' ] ) button:hover:not(:disabled ){filter:brightness( 1.06 );background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ variant='secondary' ] ) button{background:var( --wpd-button-bg,rgba( 0,0,0,0.06 ) );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='secondary' ] ) button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.1 ) )}:host( [ variant='danger' ] ) button{background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,#d63638 );border:var( --wpd-button-border,1px solid currentColor )}:host( [ variant='danger' ] ) button:hover:not(:disabled ){background:#d63638;color:#fff}:host( [ variant='link' ] ) button{background:transparent;color:var( --wpd-button-fg,var( --wp-admin-theme-color,#2271b1 ) );border:0;padding:0;text-decoration:underline}:host( [ busy ] ) button{pointer-events:none;opacity:0.75}`;
  const _WpdButton = class _WpdButton extends Component {
    render() {
      const disabled = this.disabled !== null;
      const type = this.type || "button";
      return html`
			<button part="button" type=${type} ?disabled=${disabled}>
				<slot></slot>
			</button>
		`;
    }
  };
  _WpdButton.props = ["variant", "disabled", "type", "busy", "fill-cell"];
  _WpdButton.styles = [styles];
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
  function getApi() {
    return window.wp?.desktop;
  }
  function showToast(message, duration = 4e3, action) {
    const api = getApi();
    if (api?.showToast) {
      api.showToast({ message, duration, action });
      return;
    }
    console.info("[comments-window]", message);
  }
  function publish(channel, payload) {
    getApi()?.activity?.publish?.(channel, payload);
  }
  function updateDockBadge(count) {
    const api = getApi();
    api?.dock?.setBadge?.("desktop-mode-comments", count);
    api?.taskbar?.setBadge?.("desktop-mode-comments", count);
    api?.icons?.setBadge?.("desktop-mode-comments", count);
  }
  function readConfig() {
    const cfg = window;
    const fromShared = cfg.desktopModeWindowConfig?.["desktop-mode-comments"];
    if (fromShared) {
      return fromShared;
    }
    const fromLazy = cfg.desktopModeNativeWindowConfig?.["desktop-mode-comments"];
    return fromLazy ?? null;
  }
  function spamChipFor(row) {
    const score = Math.max(0, Math.min(100, row.desktop_mode_spam_score));
    let tone = "positive";
    if (score >= 70) {
      tone = "danger";
    } else if (score >= 40) {
      tone = "warning";
    }
    const chip = document.createElement("wpd-chip");
    chip.setAttribute("label", String(score));
    chip.setAttribute("tone", tone);
    chip.dataset.score = String(score);
    chip.dataset.tone = tone;
    chip.style.cssText = [
      "--wpd-chip-gap:0",
      "--wpd-chip-padding:2px 12px",
      "--wpd-chip-font-weight:700",
      "min-inline-size:44px",
      "justify-content:center",
      "font-variant-numeric:tabular-nums"
    ].join(";");
    if (row.desktop_mode_ai_verdict) {
      chip.dataset.ai = "1";
      chip.style.boxShadow = "0 0 0 2px rgba(99,102,241,0.5)";
      chip.style.position = "relative";
      chip.style.borderRadius = "999px";
      const dot = document.createElement("span");
      dot.style.cssText = [
        "position:absolute",
        "top:-3px",
        "inset-inline-end:-3px",
        "width:8px",
        "height:8px",
        "border-radius:50%",
        "background:linear-gradient(135deg,#818cf8,#6366f1)",
        "box-shadow:0 0 0 2px #fff",
        "pointer-events:none"
      ].join(";");
      chip.appendChild(dot);
    }
    const notes = [];
    if (row.desktop_mode_akismet === "true") {
      notes.push(__("Akismet flagged this comment as spam."));
    } else if (row.desktop_mode_akismet === "false") {
      notes.push(__("Akismet cleared this comment."));
    }
    const verdict = row.desktop_mode_ai_verdict;
    if (verdict) {
      if (verdict.spam) {
        notes.push(__("AI: looks like promotional spam."));
      }
      if (verdict.harmful) {
        notes.push(__("AI: hostile / abusive tone."));
      }
      if (!verdict.spam && !verdict.harmful) {
        notes.push(__("AI: looks safe."));
      }
      if (verdict.summary) {
        notes.push(verdict.summary);
      }
    }
    chip.title = notes.length > 0 ? sprintf(
      /* translators: 1: spam score 0–100, 2: extra moderation notes. */
      __("Spam score: %1$d / 100. %2$s"),
      score,
      notes.join(" ")
    ) : sprintf(
      /* translators: %d: spam score 0–100. */
      __("Spam score: %d / 100."),
      score
    );
    return chip;
  }
  function mountRichEditor(placeholder) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-comments__reply";
    const toolbar = document.createElement("div");
    toolbar.className = "desktop-mode-comments__reply-toolbar";
    const cmds = [
      { cmd: "bold", icon: "dashicons-editor-bold", label: __("Bold") },
      { cmd: "italic", icon: "dashicons-editor-italic", label: __("Italic") },
      { cmd: "insertUnorderedList", icon: "dashicons-editor-ul", label: __("Bulleted list") },
      { cmd: "insertOrderedList", icon: "dashicons-editor-ol", label: __("Numbered list") }
    ];
    cmds.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "desktop-mode-comments__reply-tool";
      btn.title = c.label;
      btn.setAttribute("aria-label", c.label);
      btn.innerHTML = `<span class="dashicons ${c.icon}" aria-hidden="true"></span>`;
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        document.execCommand(c.cmd);
        editable.focus();
      });
      toolbar.appendChild(btn);
    });
    const linkBtn = document.createElement("button");
    linkBtn.type = "button";
    linkBtn.className = "desktop-mode-comments__reply-tool";
    linkBtn.title = __("Wrap selection in a link");
    linkBtn.setAttribute("aria-label", __("Wrap selection in a link"));
    linkBtn.innerHTML = '<span class="dashicons dashicons-admin-links" aria-hidden="true"></span>';
    linkBtn.addEventListener("mousedown", (e) => e.preventDefault());
    linkBtn.addEventListener("click", () => {
      const selection = editable.ownerDocument.getSelection?.()?.toString().trim() ?? "";
      if (/^https?:\/\//i.test(selection)) {
        document.execCommand("createLink", false, selection);
      } else {
        showToast(
          __("Select a full URL (https://…) in your reply, then click the link button.")
        );
      }
    });
    toolbar.appendChild(linkBtn);
    const editable = document.createElement("div");
    editable.className = "desktop-mode-comments__reply-input";
    editable.contentEditable = "true";
    editable.setAttribute("role", "textbox");
    editable.setAttribute("aria-multiline", "true");
    editable.setAttribute("aria-label", placeholder);
    editable.dataset.placeholder = placeholder;
    wrap.append(toolbar, editable);
    return {
      root: wrap,
      getValue: () => editable.innerHTML.trim(),
      focus: () => editable.focus(),
      destroy: () => wrap.remove()
    };
  }
  function mountPlainEditor(placeholder) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-comments__reply desktop-mode-comments__reply--plain";
    const ta = document.createElement("textarea");
    ta.className = "desktop-mode-comments__reply-input";
    ta.placeholder = placeholder;
    ta.rows = 3;
    wrap.appendChild(ta);
    return {
      root: wrap,
      getValue: () => ta.value.trim(),
      focus: () => ta.focus(),
      destroy: () => wrap.remove()
    };
  }
  function mountReplyEditor(flavor, placeholder) {
    if (flavor === "plain") {
      return mountPlainEditor(placeholder);
    }
    return mountRichEditor(placeholder);
  }
  function ensureBackdrop(host) {
    const windowRoot = host.closest(".desktop-mode-window") ?? host.parentElement;
    if (!windowRoot) {
      return null;
    }
    let backdrop = windowRoot.querySelector(
      ":scope > [data-desktop-mode-comments-drawer-backdrop]"
    );
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "desktop-mode-comments__drawer-backdrop";
      backdrop.setAttribute("data-desktop-mode-comments-drawer-backdrop", "");
      windowRoot.insertBefore(backdrop, windowRoot.firstChild);
    }
    return backdrop;
  }
  function closeAuthorDrawer(host) {
    host.removeAttribute("data-open");
    host.setAttribute("aria-hidden", "true");
    const backdrop = ensureBackdrop(host);
    backdrop?.removeAttribute("data-open");
    const tearDown = host.__teardown;
    if (tearDown) {
      tearDown();
      delete host.__teardown;
    }
  }
  async function openAuthorDrawer(cfg, host, email) {
    const backdrop = ensureBackdrop(host);
    const wasOpen = host.getAttribute("data-open") === "true";
    host.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "desktop-mode-comments__drawer-loading";
    loading.textContent = __("Loading author insights…");
    host.appendChild(loading);
    if (!wasOpen) {
      host.setAttribute("aria-hidden", "false");
      backdrop?.setAttribute("data-open", "false");
      requestAnimationFrame(() => {
        host.setAttribute("data-open", "true");
        backdrop?.setAttribute("data-open", "true");
      });
      const onEsc = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeAuthorDrawer(host);
        }
      };
      const onBackdropClick = () => closeAuthorDrawer(host);
      document.addEventListener("keydown", onEsc);
      backdrop?.addEventListener("click", onBackdropClick);
      host.__teardown = () => {
        document.removeEventListener("keydown", onEsc);
        backdrop?.removeEventListener("click", onBackdropClick);
      };
    }
    let data;
    try {
      data = await fetchAuthorInsights(cfg, email);
    } catch (err) {
      host.replaceChildren();
      const errEl = document.createElement("p");
      errEl.className = "desktop-mode-comments__drawer-error";
      errEl.textContent = err instanceof Error ? err.message : __("Could not load insights.");
      host.appendChild(errEl);
      return;
    }
    host.replaceChildren();
    const header = document.createElement("header");
    header.className = "desktop-mode-comments__drawer-header";
    const avatar = document.createElement("wpd-avatar");
    avatar.setAttribute("size", "64");
    if (data.userName) {
      avatar.setAttribute("name", data.userName);
    }
    if (data.avatarUrl) {
      applyAvatarSrc(avatar, data.avatarUrl);
    }
    if (data.userId > 0) {
      avatar.setAttribute("user-id", String(data.userId));
    }
    avatar.className = "desktop-mode-comments__drawer-avatar";
    const headerText = document.createElement("div");
    const name = document.createElement("h2");
    name.textContent = data.userName || data.email;
    const sub = document.createElement("p");
    sub.textContent = data.email;
    sub.className = "desktop-mode-comments__drawer-sub";
    headerText.append(name, sub);
    header.append(avatar, headerText);
    host.appendChild(header);
    const reliability = document.createElement("div");
    reliability.className = "desktop-mode-comments__drawer-meter";
    const reliabilityLabel = document.createElement("span");
    reliabilityLabel.textContent = sprintf(
      /* translators: %d: 0–100 reliability score. */
      __("Reliability: %d / 100"),
      data.reliability
    );
    const meter = document.createElement("div");
    meter.className = "desktop-mode-comments__drawer-bar";
    meter.style.setProperty("--value", `${data.reliability}%`);
    reliability.append(reliabilityLabel, meter);
    host.appendChild(reliability);
    const stats = document.createElement("dl");
    stats.className = "desktop-mode-comments__drawer-stats";
    const lines = [
      [__("Total comments"), String(data.total)],
      [__("Approved"), String(data.counts.approve)],
      [__("Pending"), String(data.counts.hold)],
      [__("Spam"), String(data.counts.spam)],
      [__("Trash"), String(data.counts.trash)],
      [
        __("First seen"),
        data.oldest ? (/* @__PURE__ */ new Date(data.oldest + "Z")).toLocaleDateString() : "—"
      ],
      [
        __("Last seen"),
        data.newest ? (/* @__PURE__ */ new Date(data.newest + "Z")).toLocaleDateString() : "—"
      ]
    ];
    lines.forEach(([label, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      stats.append(dt, dd);
    });
    host.appendChild(stats);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "desktop-mode-comments__drawer-close";
    closeBtn.textContent = __("Close");
    closeBtn.addEventListener("click", () => closeAuthorDrawer(host));
    host.appendChild(closeBtn);
    publish("desktop-mode-comments/insights-opened", { email: data.email });
  }
  const undoStack = [];
  function inverseAction(action) {
    switch (action) {
      case "approve":
        return "unapprove";
      case "unapprove":
        return "approve";
      case "spam":
        return "unspam";
      case "unspam":
        return "spam";
      case "trash":
        return "untrash";
      case "untrash":
        return "trash";
    }
  }
  function actionPastTense(action, count) {
    switch (action) {
      case "approve":
        return sprintf(__("Approved %d."), count);
      case "unapprove":
        return sprintf(__("Unapproved %d."), count);
      case "spam":
        return sprintf(__("Marked %d as spam."), count);
      case "unspam":
        return sprintf(__("Un-spammed %d."), count);
      case "trash":
        return sprintf(__("Trashed %d."), count);
      case "untrash":
        return sprintf(__("Restored %d."), count);
    }
  }
  async function renderCommentsWindow(body) {
    const cfg = readConfig();
    if (!cfg) {
      body.innerHTML = `<p class="desktop-mode-comments__fatal">${__(
        "Comments window configuration missing."
      )}</p>`;
      return;
    }
    setActiveConfig(cfg);
    const tabsEl = body.querySelector(
      "[data-desktop-mode-comments-tabs]"
    );
    const newPillEl = body.querySelector(
      "[data-desktop-mode-comments-new-pill]"
    );
    const drawerEl = body.querySelector(
      "[data-desktop-mode-comments-drawer]"
    );
    if (!tabsEl || !newPillEl || !drawerEl) {
      return;
    }
    const helpEl = body.querySelector(
      "[data-desktop-mode-comments-help]"
    );
    const panels = {
      pending: makePanel(body, "pending", cfg),
      all: makePanel(body, "all", cfg),
      spam: makePanel(body, "spam", cfg),
      trash: makePanel(body, "trash", cfg),
      mine: makePanel(body, "mine", cfg)
    };
    let activeTab = "pending";
    let lastSeenPending = 0;
    const refresh = async (tab, opts = {}) => {
      const state = panels[tab];
      if (!state.table || !state.tableHost) {
        return;
      }
      state.table.setAttribute("loading", "");
      try {
        const params = {
          tab,
          page: state.page,
          perPage: state.perPage,
          search: state.search,
          currentUserId: cfg.currentUserId
        };
        const result = await fetchComments(cfg, params);
        state.rows = result.rows;
        state.total = result.total;
        state.totalPages = result.totalPages;
        state.repliesByParent.clear();
        state.openReplies.clear();
        await customElements.whenDefined("wpd-table");
        state.table.data = state.rows;
        state.table.clearSelection();
        updatePager(state);
        if (tab === "pending" && !opts.force) {
          if (lastSeenPending === 0) {
            lastSeenPending = result.total;
          }
        }
      } catch (err) {
        console.error("[comments-window] refresh failed:", err);
        showToast(
          err instanceof Error ? err.message : __("Could not load comments.")
        );
      } finally {
        state.table.removeAttribute("loading");
      }
    };
    const setActive = (tab) => {
      activeTab = tab;
      tabsEl.setAttribute("value", tab);
      void refresh(tab);
    };
    tabsEl.addEventListener("wpd-tab-change", (e) => {
      const next = e.detail?.value;
      if (next) {
        setActive(next);
      }
    });
    Object.values(panels).forEach((state) => {
      wirePanel(state, cfg, async (ids, action) => {
        await runBulk(ids, action, state, refresh, cfg);
      }, drawerEl);
    });
    setActive("pending");
    let countsTimer = null;
    const pollCounts = async () => {
      try {
        const counts = await fetchCounts(cfg);
        updateDockBadge(counts.pending);
        if (activeTab === "pending") {
          const diff = counts.pending - lastSeenPending;
          if (diff > 0) {
            newPillEl.hidden = false;
            newPillEl.replaceChildren();
            const label = document.createElement("span");
            label.textContent = sprintf(
              /* translators: %d: number of new pending comments. */
              __("%d new pending — reload"),
              diff
            );
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = __("Reload");
            btn.addEventListener("click", () => {
              newPillEl.hidden = true;
              lastSeenPending = counts.pending;
              void refresh("pending", { force: true });
            });
            newPillEl.append(label, btn);
          }
        }
      } catch {
      }
    };
    countsTimer = window.setInterval(pollCounts, 3e4);
    void pollCounts();
    const onKey = (e) => {
      const ownerDoc = body.ownerDocument;
      if (!body.contains(ownerDoc.activeElement)) {
        return;
      }
      const target = ownerDoc.activeElement;
      const editing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.tagName === "WPD-TEXT-FIELD");
      if (editing) {
        return;
      }
      const state = panels[activeTab];
      if (!state.table) {
        return;
      }
      const ids = Array.from(state.table.selection).map((v) => Number(v)).filter(Boolean);
      switch (e.key) {
        case "j":
        case "k":
          e.preventDefault();
          moveFocus(state, e.key === "j" ? 1 : -1);
          break;
        case "a":
          if (ids.length > 0) {
            e.preventDefault();
            const targetAction = activeTab === "pending" ? "approve" : "unapprove";
            void runBulk(ids, targetAction, state, refresh, cfg);
          }
          break;
        case "s":
          if (ids.length > 0) {
            e.preventDefault();
            void runBulk(
              ids,
              activeTab === "spam" ? "unspam" : "spam",
              state,
              refresh,
              cfg
            );
          }
          break;
        case "d":
          if (ids.length > 0) {
            e.preventDefault();
            void runBulk(
              ids,
              activeTab === "trash" ? "untrash" : "trash",
              state,
              refresh,
              cfg
            );
          }
          break;
        case "u":
          e.preventDefault();
          void undoLast(cfg, refresh, activeTab);
          break;
        case "r":
          if (ids.length === 1) {
            e.preventDefault();
            openReplyFor(state, ids[0], cfg);
          }
          break;
        case "e":
          if (ids.length === 1) {
            e.preventDefault();
            openEditFor(state, ids[0], cfg, refresh);
          }
          break;
        case "?":
          if (helpEl) {
            e.preventDefault();
            helpEl.hidden = !helpEl.hidden;
            helpEl.querySelector("[data-desktop-mode-comments-help-close]")?.addEventListener(
              "click",
              () => {
                helpEl.hidden = true;
              },
              { once: true }
            );
          }
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    if (!cfg.introSeen) {
      void (async () => {
        const outcome = await showCommentsIntroDialog();
        if (outcome !== "cancel") {
          try {
            await trackedFetch(
              cfg.introUrl,
              {
                method: "POST",
                credentials: "same-origin",
                headers: {
                  "X-WP-Nonce": cfg.restNonce,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ slug: cfg.introSlug })
              },
              { source: "desktop-mode/comments/intro-seen", silent: true }
            );
          } catch {
          }
        }
        if (outcome === "settings") {
          getApi()?.openWindow?.({ id: "desktop-mode-os-settings" });
        }
      })();
    }
    const onClosed = (e) => {
      const detail = e.detail;
      if (detail?.windowId !== "desktop-mode-comments") {
        return;
      }
      if (countsTimer) {
        window.clearInterval(countsTimer);
        countsTimer = null;
      }
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("desktop-mode-window-closed", onClosed);
      setActiveConfig(null);
    };
    document.addEventListener("desktop-mode-window-closed", onClosed);
  }
  function makePanel(body, tab, cfg) {
    const root = body.querySelector(
      `[data-desktop-mode-comments-panel="${tab}"]`
    );
    if (!root) {
      throw new Error(`[comments-window] panel ${tab} not found`);
    }
    root.innerHTML = `
		<header class="desktop-mode-comments__toolbar">
			<div class="desktop-mode-comments__toolbar-left">
				<wpd-text-field
					data-desktop-mode-comments-search
					placeholder="${__("Search comments…")}"
				></wpd-text-field>
			</div>
			<div class="desktop-mode-comments__toolbar-right" data-desktop-mode-comments-bulk hidden>
				<span class="desktop-mode-comments__count" data-desktop-mode-comments-count></span>
				<span class="desktop-mode-comments__bulk-actions" data-desktop-mode-comments-bulk-actions></span>
			</div>
			<div class="desktop-mode-comments__toolbar-trailing">
				<wpd-button variant="ghost" data-desktop-mode-comments-refresh title="${__(
      "Refresh"
    )}">
					<span class="dashicons dashicons-update" aria-hidden="true"></span>
				</wpd-button>
			</div>
		</header>
		<div class="desktop-mode-comments__body" data-desktop-mode-comments-body>
			<wpd-table
				data-desktop-mode-comments-table
				selectable="multi"
				sticky-header
				hover
				striped
				bordered
				loading
			>
				<div slot="empty" class="desktop-mode-comments__empty">
					<span class="dashicons dashicons-admin-comments" aria-hidden="true"></span>
					<p>${__("No comments to moderate here.")}</p>
				</div>
			</wpd-table>
		</div>
		<footer class="desktop-mode-comments__pager">
			<div class="desktop-mode-comments__pager-meta" data-desktop-mode-comments-page-indicator>—</div>
			<div class="desktop-mode-comments__pager-nav">
				<wpd-button variant="ghost" data-desktop-mode-comments-prev disabled>
					<span class="dashicons dashicons-arrow-left-alt2" aria-hidden="true"></span>
					${__("Previous")}
				</wpd-button>
				<wpd-button variant="ghost" data-desktop-mode-comments-next disabled>
					${__("Next")}
					<span class="dashicons dashicons-arrow-right-alt2" aria-hidden="true"></span>
				</wpd-button>
				<label class="desktop-mode-comments__pager-perpage">
					${__("Per page")}
					<select data-desktop-mode-comments-per-page>
						<option value="10">10</option>
						<option value="20" selected>20</option>
						<option value="50">50</option>
						<option value="100">100</option>
					</select>
				</label>
			</div>
		</footer>
	`;
    return {
      root,
      tab,
      page: 1,
      perPage: cfg.defaultPerPage,
      search: "",
      total: 0,
      totalPages: 1,
      rows: [],
      repliesByParent: /* @__PURE__ */ new Map(),
      openReplies: /* @__PURE__ */ new Set()
    };
  }
  function buildColumns(cfg, state, drawerEl) {
    const cols = [];
    cols.push({
      key: "author_name",
      label: __("Author"),
      sticky: true,
      minWidth: "180px",
      render: (_v, row) => {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;gap:10px;align-items:center;min-width:0;";
        const avatar = document.createElement("wpd-avatar");
        avatar.setAttribute("size", "32");
        avatar.setAttribute("clickable", "");
        avatar.setAttribute("title", __("Show author insights"));
        if (row.author_name) {
          avatar.setAttribute("name", row.author_name);
        }
        const rawAvatarUrl = row.author_avatar_urls?.["48"] ?? "";
        if (rawAvatarUrl) {
          applyAvatarSrc(avatar, rawAvatarUrl);
        }
        if (row.author > 0) {
          avatar.setAttribute("user-id", String(row.author));
        }
        avatar.addEventListener("wpd-avatar-click", (e) => {
          e.stopPropagation();
          void openAuthorDrawer(cfg, drawerEl, row.author_email);
        });
        const meta = document.createElement("div");
        meta.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;line-height:1.3;";
        const name = document.createElement("strong");
        name.style.cssText = "font-weight:600;color:#1d2327;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        name.textContent = row.author_name || __("Anonymous");
        const email = document.createElement("small");
        email.style.cssText = "color:#646970;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        email.textContent = row.author_email;
        meta.append(name, email);
        wrap.append(avatar, meta);
        return wrap;
      }
    });
    cols.push({
      key: "content",
      label: __("Comment"),
      minWidth: "320px",
      render: (_v, row) => {
        const wrap = document.createElement("div");
        wrap.className = "desktop-mode-comments__content";
        const body = document.createElement("div");
        body.className = "desktop-mode-comments__content-body";
        body.innerHTML = row.content?.rendered ?? "";
        wrap.appendChild(body);
        if (row.desktop_mode_replies_count > 0) {
          const tog = document.createElement("button");
          tog.type = "button";
          tog.className = "desktop-mode-comments__replies-toggle";
          tog.textContent = sprintf(
            /* translators: %d: number of direct replies. */
            _n(
              "+ %d reply",
              "+ %d replies",
              row.desktop_mode_replies_count
            ),
            row.desktop_mode_replies_count
          );
          tog.addEventListener("click", (e) => {
            e.stopPropagation();
            void toggleReplies(state, row.id, cfg, wrap);
          });
          wrap.appendChild(tog);
        }
        return wrap;
      }
    });
    cols.push({
      key: "desktop_mode_post_title",
      label: __("In response to"),
      minWidth: "180px",
      render: (_v, row) => {
        if (!row.desktop_mode_post_link) {
          return row.desktop_mode_post_title;
        }
        const a = document.createElement("a");
        a.href = row.desktop_mode_post_link;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = row.desktop_mode_post_title;
        return a;
      }
    });
    cols.push({
      key: "desktop_mode_spam_score",
      label: __("Spam"),
      align: "center",
      sortable: true,
      width: "78px",
      render: (_v, row) => spamChipFor(row)
    });
    cols.push({
      key: "date_gmt",
      label: __("Submitted on"),
      sortable: true,
      width: "160px",
      render: (_v, row) => {
        try {
          return (/* @__PURE__ */ new Date(row.date_gmt + "Z")).toLocaleString();
        } catch {
          return row.date_gmt;
        }
      }
    });
    return cols;
  }
  function wirePanel(state, cfg, runBulkLocal, drawerEl) {
    const table = state.root.querySelector(
      "[data-desktop-mode-comments-table]"
    );
    const body = state.root.querySelector(
      "[data-desktop-mode-comments-body]"
    );
    const bulkBar = state.root.querySelector(
      "[data-desktop-mode-comments-bulk]"
    );
    const bulkActionsHost = state.root.querySelector(
      "[data-desktop-mode-comments-bulk-actions]"
    );
    const countEl = state.root.querySelector(
      "[data-desktop-mode-comments-count]"
    );
    if (!table || !body || !bulkBar || !bulkActionsHost || !countEl) {
      return;
    }
    const searchEl = state.root.querySelector(
      "[data-desktop-mode-comments-search]"
    );
    const refreshBtn = state.root.querySelector(
      "[data-desktop-mode-comments-refresh]"
    );
    const prevBtn = state.root.querySelector(
      "[data-desktop-mode-comments-prev]"
    );
    const nextBtn = state.root.querySelector(
      "[data-desktop-mode-comments-next]"
    );
    const perPageSel = state.root.querySelector(
      "[data-desktop-mode-comments-per-page]"
    );
    state.table = table;
    state.tableHost = body;
    void customElements.whenDefined("wpd-table").then(() => {
      table.columns = buildColumns(cfg, state, drawerEl);
      table.getRowId = (row) => row.id;
      if (state.rows.length > 0) {
        table.data = state.rows;
      }
    });
    const renderBulkActions = () => {
      bulkActionsHost.replaceChildren();
      const actions = [];
      if (state.tab === "pending" || state.tab === "all" || state.tab === "mine") {
        actions.push({ label: __("Approve"), action: "approve" });
        actions.push({ label: __("Unapprove"), action: "unapprove" });
      }
      if (state.tab === "spam") {
        actions.push({ label: __("Not spam"), action: "unspam" });
      } else {
        actions.push({ label: __("Spam"), action: "spam" });
      }
      if (state.tab === "trash") {
        actions.push({ label: __("Restore"), action: "untrash" });
      } else {
        actions.push({ label: __("Trash"), action: "trash", danger: true });
      }
      actions.forEach((a) => {
        const btn = document.createElement("wpd-button");
        btn.setAttribute("variant", a.danger ? "danger" : "ghost");
        btn.textContent = a.label;
        btn.addEventListener("click", () => {
          const sel = Array.from(table.selection).map((v) => Number(v)).filter(Boolean);
          if (sel.length > 0) {
            void runBulkLocal(sel, a.action);
          }
        });
        bulkActionsHost.appendChild(btn);
      });
    };
    renderBulkActions();
    table.addEventListener("wpd-table-selection-change", () => {
      const count = table.selection.size;
      bulkBar.hidden = count === 0;
      countEl.textContent = sprintf(
        /* translators: %d: count of selected rows. */
        __("%d selected"),
        count
      );
    });
    let searchDebounce = null;
    searchEl?.addEventListener("wpd-input-change", (e) => {
      const val = e.detail?.value ?? "";
      if (searchDebounce) {
        window.clearTimeout(searchDebounce);
      }
      searchDebounce = window.setTimeout(() => {
        state.search = String(val);
        state.page = 1;
        void reloadActivePanel(state);
      }, 300);
    });
    refreshBtn?.addEventListener("click", () => {
      void reloadActivePanel(state);
    });
    prevBtn?.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        void reloadActivePanel(state);
      }
    });
    nextBtn?.addEventListener("click", () => {
      if (state.page < state.totalPages) {
        state.page += 1;
        void reloadActivePanel(state);
      }
    });
    perPageSel?.addEventListener("change", () => {
      state.perPage = parseInt(perPageSel.value, 10) || 20;
      state.page = 1;
      void reloadActivePanel(state);
    });
  }
  async function reloadActivePanel(state) {
    const cfg = getActiveConfig();
    if (!cfg || !state.table) {
      return;
    }
    state.table.setAttribute("loading", "");
    try {
      const result = await fetchComments(cfg, {
        tab: state.tab,
        page: state.page,
        perPage: state.perPage,
        search: state.search,
        currentUserId: cfg.currentUserId
      });
      state.rows = result.rows;
      state.total = result.total;
      state.totalPages = result.totalPages;
      await customElements.whenDefined("wpd-table");
      state.table.data = state.rows;
      state.table.clearSelection();
      updatePager(state);
    } catch (err) {
      console.error("[comments-window] reload failed:", err);
      showToast(
        err instanceof Error ? err.message : __("Could not load comments.")
      );
    } finally {
      state.table.removeAttribute("loading");
    }
  }
  function updatePager(state) {
    const indicator = state.root.querySelector(
      "[data-desktop-mode-comments-page-indicator]"
    );
    const prevBtn = state.root.querySelector(
      "[data-desktop-mode-comments-prev]"
    );
    const nextBtn = state.root.querySelector(
      "[data-desktop-mode-comments-next]"
    );
    if (indicator) {
      indicator.textContent = sprintf(
        /* translators: 1: current page, 2: total pages, 3: total rows. */
        __("Page %1$d of %2$d (%3$d total)"),
        state.page,
        state.totalPages,
        state.total
      );
    }
    if (prevBtn) {
      prevBtn.disabled = state.page <= 1;
    }
    if (nextBtn) {
      nextBtn.disabled = state.page >= state.totalPages;
    }
  }
  async function toggleReplies(state, parentId, cfg, host) {
    const existing = host.querySelector(".desktop-mode-comments__replies");
    if (existing) {
      existing.remove();
      state.openReplies.delete(parentId);
      return;
    }
    state.openReplies.add(parentId);
    let replies = state.repliesByParent.get(parentId);
    if (!replies) {
      try {
        replies = await fetchReplies(cfg, parentId);
        state.repliesByParent.set(parentId, replies);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : __("Could not load replies.")
        );
        return;
      }
    }
    const tree = document.createElement("div");
    tree.className = "desktop-mode-comments__replies";
    replies.forEach((r) => {
      const item = document.createElement("div");
      item.className = "desktop-mode-comments__reply-row";
      const author = document.createElement("strong");
      author.textContent = r.author_name || __("Anonymous");
      const sep = document.createTextNode(" — ");
      const cnt = document.createElement("span");
      cnt.innerHTML = r.content?.rendered ?? "";
      item.append(author, sep, cnt);
      tree.appendChild(item);
    });
    host.appendChild(tree);
  }
  function openReplyFor(state, id, cfg) {
    const row = state.rows.find((r) => r.id === id);
    if (!row) {
      return;
    }
    const tr = state.tableHost?.querySelector(
      `tr[data-row-id="${id}"]`
    );
    const host = tr?.nextElementSibling?.classList.contains(
      "desktop-mode-comments__inline-host"
    ) ? tr.nextElementSibling : (() => {
      const ins = document.createElement("div");
      ins.className = "desktop-mode-comments__inline-host";
      tr?.after(ins);
      return ins;
    })();
    host.replaceChildren();
    const editor = mountReplyEditor(
      cfg.replyEditor,
      __("Write a reply…")
    );
    host.appendChild(editor.root);
    const actions = document.createElement("div");
    actions.className = "desktop-mode-comments__inline-actions";
    const cancel = document.createElement("wpd-button");
    cancel.setAttribute("variant", "ghost");
    cancel.textContent = __("Cancel");
    cancel.addEventListener("click", () => {
      editor.destroy();
      host.remove();
    });
    const send = document.createElement("wpd-button");
    send.setAttribute("variant", "primary");
    send.textContent = __("Send reply");
    send.addEventListener("click", async () => {
      const value = editor.getValue();
      if (!value) {
        showToast(__("Reply is empty."));
        return;
      }
      try {
        await postReply(cfg, id, value);
        showToast(__("Reply posted."));
        publish("desktop-mode-comments/replied", {
          parentId: id,
          postId: row.post
        });
        editor.destroy();
        host.remove();
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : __("Reply failed.")
        );
      }
    });
    actions.append(cancel, send);
    host.appendChild(actions);
    editor.focus();
  }
  function openEditFor(state, id, cfg, refresh) {
    const row = state.rows.find((r) => r.id === id);
    if (!row || !row.desktop_mode_can_edit) {
      showToast(__("You can't edit this comment."));
      return;
    }
    const tr = state.tableHost?.querySelector(
      `tr[data-row-id="${id}"]`
    );
    if (!tr) {
      return;
    }
    const host = document.createElement("div");
    host.className = "desktop-mode-comments__inline-host";
    tr.after(host);
    const editor = mountReplyEditor(cfg.replyEditor, __("Edit comment…"));
    host.appendChild(editor.root);
    const editable = editor.root.querySelector(
      ".desktop-mode-comments__reply-input"
    );
    if (editable) {
      if (editable instanceof HTMLTextAreaElement) {
        editable.value = row.content?.raw ?? "";
      } else {
        editable.innerHTML = row.content?.rendered ?? "";
      }
    }
    const actions = document.createElement("div");
    actions.className = "desktop-mode-comments__inline-actions";
    const cancel = document.createElement("wpd-button");
    cancel.setAttribute("variant", "ghost");
    cancel.textContent = __("Cancel");
    cancel.addEventListener("click", () => {
      editor.destroy();
      host.remove();
    });
    const save = document.createElement("wpd-button");
    save.setAttribute("variant", "primary");
    save.textContent = __("Save");
    save.addEventListener("click", async () => {
      try {
        await updateCommentContent(cfg, id, editor.getValue());
        showToast(__("Comment updated."));
        publish("desktop-mode-comments/edited", { id });
        editor.destroy();
        host.remove();
        await refresh(state.tab);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : __("Edit failed.")
        );
      }
    });
    actions.append(cancel, save);
    host.appendChild(actions);
    editor.focus();
  }
  async function runBulk(ids, action, state, refresh, cfg) {
    try {
      const result = await bulkModerate(cfg, ids, action);
      const inverse = inverseAction(action);
      if (inverse && result.processed.length > 0) {
        undoStack.push({
          action,
          ids: result.processed,
          inverse,
          expiresAt: Date.now() + 8e3
        });
        showToast(
          actionPastTense(action, result.processed.length),
          8e3,
          {
            label: __("Undo"),
            onClick: () => {
              void undoLast(cfg, refresh, state.tab);
            }
          }
        );
      } else {
        showToast(actionPastTense(action, result.processed.length));
      }
      publish(`desktop-mode-comments/${action}d`, {
        ids: result.processed,
        counts: result.counts
      });
      updateDockBadge(result.counts.pending);
      state.table?.clearSelection();
      await refresh(state.tab, { force: true });
    } catch (err) {
      const fallback = sprintf(__("Bulk %s failed."), action);
      showToast(err instanceof Error ? err.message : fallback);
    }
  }
  async function undoLast(cfg, refresh, currentTab) {
    const last = undoStack.pop();
    if (!last || !last.inverse || Date.now() > last.expiresAt) {
      return;
    }
    try {
      await bulkModerate(cfg, last.ids, last.inverse);
      showToast(__("Undone."));
      await refresh(currentTab, { force: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : __("Undo failed.")
      );
    }
  }
  function moveFocus(state, direction) {
    if (!state.table || state.rows.length === 0) {
      return;
    }
    const selected = Array.from(state.table.selection).map((v) => Number(v)).filter(Boolean);
    const currentIndex = selected.length > 0 ? state.rows.findIndex((r) => r.id === selected[0]) : -1;
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) {
      nextIndex = 0;
    }
    if (nextIndex >= state.rows.length) {
      nextIndex = state.rows.length - 1;
    }
    const nextId = state.rows[nextIndex]?.id;
    if (!nextId) {
      return;
    }
    state.table.clearSelection();
    state.table.select(nextId);
    const tr = state.tableHost?.querySelector(
      `tr[data-row-id="${nextId}"]`
    );
    tr?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  const registry = window.desktopModeNativeWindows ?? (window.desktopModeNativeWindows = {});
  registry["desktop-mode-comments"] = (body) => {
    setActiveWindowId("desktop-mode-comments");
    return renderCommentsWindow(body).catch((err) => {
      console.error("[comments-window] render failed:", err);
    });
  };
})();
