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
    return format.replace(/%[sd]/g, () => String(args[i++] ?? ""));
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
  const styles$c = css`:host{display:block;--wpd-table-bg:var( --wpd-surface,#fff );--wpd-table-border:var( --wpd-border,rgba( 0,0,0,0.08 ) );--wpd-table-column-border:var( --wpd-border-strong,rgba( 0,0,0,0.14 ) );--wpd-table-header-bg:var( --wpd-surface-elevated,#f6f7f7 );--wpd-table-row-hover:rgba( 0,0,0,0.04 );--wpd-table-stripe:rgba( 0,0,0,0.03 );--wpd-table-cell-padding:8px 12px;--wpd-table-font-size:13px;--wpd-table-max-height:none;font-size:var( --wpd-table-font-size );color:inherit}:host( [ hidden ] ){display:none}.scroll{position:relative;overflow:auto;max-height:var( --wpd-table-max-height );border:1px solid var( --wpd-table-border );border-radius:4px;background:var( --wpd-table-bg )}table{width:100%;border-collapse:separate;border-spacing:0;background:var( --wpd-table-bg )}thead th{text-align:start;font-weight:600;background-color:var( --wpd-table-header-bg );padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );white-space:nowrap}tbody td{padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );background-color:var( --wpd-table-bg );vertical-align:middle}tbody tr:last-child td{border-bottom:0}:host( [ striped ] ) tbody tr:nth-child( odd ) td{background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ hover ] ) tbody tr:hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}:host( [ hover ] [ striped ] ) tbody tr:nth-child( odd ):hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) ),linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ compact ] ){--wpd-table-cell-padding:4px 8px;--wpd-table-font-size:12px}:host( [ bordered ] ) thead th,:host( [ bordered ] ) tbody td{border-inline-end:1px solid var( --wpd-table-column-border )}:host( [ bordered ] ) thead th:last-child,:host( [ bordered ] ) tbody td:last-child{border-inline-end:0}th.is-sticky,td.is-sticky{position:sticky;z-index:10}tbody td.is-sticky{background-color:var( --wpd-table-bg )}thead th.is-sticky{background-color:var( --wpd-table-header-bg );z-index:30}:host( [ sticky-header ] ) thead th{position:sticky;top:0;z-index:20}:host( [ sticky-header ] ) thead tr.filter-row th{top:var( --wpd-table-header-height,33px );z-index:20}:host( [ sticky-header ] ) thead th.is-sticky{z-index:40}:host( [ sticky-header ] ) thead tr.filter-row th.is-sticky{z-index:40}th.is-sticky-edge,td.is-sticky-edge{border-inline-end:var( --wpd-table-sticky-edge,2px solid var( --wpd-table-border ) )}.align-center{text-align:center}.align-end{text-align:end}.filter-row th{padding:4px 8px;background-color:var( --wpd-table-header-bg );border-bottom:1px solid var( --wpd-table-border );font-weight:400}.filter-input,.filter-select{width:100%;min-width:60px;box-sizing:border-box;padding:4px 6px;font:inherit;color:inherit;background-color:var( --wpd-table-bg );border:1px solid var( --wpd-table-border );border-radius:3px}.filter-input:focus,.filter-select:focus{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-1px}.expander{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:3px;font-size:11px;line-height:1}.expander:hover{background:rgba( 0,0,0,0.06 )}td.col-expander,th.col-expander{width:36px;min-width:36px;padding-left:0;padding-right:0;text-align:center}tr.subtable td{padding:0;background-color:var( --wpd-table-bg );background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) );border-bottom:1px solid var( --wpd-table-border )}tr.subtable .subtable-inner{padding:8px 12px 8px 32px}tr.empty td{padding:24px;text-align:center;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );font-style:italic}thead th.is-sortable{cursor:pointer;user-select:none}thead th.is-sortable:hover{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}thead th.is-sortable:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-2px}.sort-indicator{font-size:10px;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );margin-inline-start:2px}thead th.sort-asc .sort-indicator,thead th.sort-desc .sort-indicator{color:var( --wp-admin-theme-color,#2271b1 )}td.col-select,th.col-select{width:40px;min-width:40px;padding-left:0;padding-right:0;text-align:center}.select-all-checkbox,.select-row-checkbox{cursor:pointer;margin:0}tbody tr.is-selected td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 10%,var( --wpd-table-bg ) );background-image:none}tbody tr.is-selected:hover td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 16%,var( --wpd-table-bg ) )}tbody tr.skeleton td{padding:var( --wpd-table-cell-padding )}.skeleton-bar{display:block;height:12px;border-radius:3px;background:linear-gradient( 90deg,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 0%,var( --wpd-table-skeleton-highlight,rgba( 0,0,0,0.14 ) ) 50%,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 100% );background-size:200% 100%;animation:wpd-table-skeleton-pulse 1.4s ease-in-out infinite}@keyframes wpd-table-skeleton-pulse{0%{background-position:200% 50%}100%{background-position:-200% 50%}}@media ( prefers-reduced-motion:reduce ){.skeleton-bar{animation:none}}`;
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
    /** Select every row currently in `data` (multi-mode only). */
    selectAll() {
      if (this._readSelectable() !== "multi") {
        return;
      }
      this._data.forEach(
        (row, i) => this._selection.add(this._getRowId(row, i))
      );
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
        const total = this._data.length;
        const selectedCount = this._countSelectedInData();
        headerCb.checked = total > 0 && selectedCount === total;
        headerCb.indeterminate = selectedCount > 0 && selectedCount < total;
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
          const total = this._data.length;
          const selectedCount = this._countSelectedInData();
          cb.checked = total > 0 && selectedCount === total;
          cb.indeterminate = selectedCount > 0 && selectedCount < total;
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
    _countSelectedInData() {
      let n = 0;
      this._data.forEach((row, i) => {
        if (this._selection.has(this._getRowId(row, i))) {
          n++;
        }
      });
      return n;
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
  _WpdTable.styles = [styles$c];
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
  const styles$b = css`:host{display:flex;flex-direction:column;gap:var( --wpd-card-gap,12px );padding:var( --wpd-card-padding,16px );border:1px solid var( --wpd-card-border,var( --wpd-border,rgba( 0,0,0,0.08 ) ) );border-radius:var( --wpd-card-radius,12px );background:var( --wpd-card-bg,#fff );color:var( --wpd-card-fg,inherit );box-sizing:border-box;min-width:0;transition:transform 180ms ease,box-shadow 180ms ease,border-color 180ms ease}:host( [ hidden ] ){display:none}:host( [ compact ] ){padding:var( --wpd-card-padding-compact,10px );gap:var( --wpd-card-gap-compact,6px );border-radius:var( --wpd-card-radius-compact,8px )}:host( [ interactive ] ){cursor:pointer;outline-offset:2px}:host( [ interactive ]:hover ),:host( [ interactive ]:focus-visible ){transform:translateY( -2px );box-shadow:var( --wpd-card-shadow-hover,0 4px 16px rgba( 0,0,0,0.08 ) );border-color:var( --wpd-card-border-hover,var( --wpd-border-strong,rgba( 0,0,0,0.16 ) ) )}:host( [ selected ] ){border-color:var( --wpd-card-border-selected,var( --wp-admin-theme-color,#2271b1 ) );box-shadow:var( --wpd-card-shadow-selected,0 0 0 1px var( --wp-admin-theme-color,#2271b1 ) inset )}:host( [ disabled ] ){opacity:0.55;pointer-events:none;cursor:not-allowed}@media ( prefers-reduced-motion:reduce ){:host{transition:none}:host( [ interactive ]:hover ),:host( [ interactive ]:focus-visible ){transform:none}}::slotted( header ){display:flex;align-items:center;gap:12px;min-width:0}::slotted( footer ){display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}`;
  const NOCLICK_SELECTOR = "[data-noclick]";
  const _WpdCard = class _WpdCard extends Component {
    constructor() {
      super(...arguments);
      this._onClick = (ev) => {
        if (!this.hasAttribute("interactive") || this.hasAttribute("disabled")) {
          return;
        }
        const target = ev.target;
        if (target?.closest(NOCLICK_SELECTOR)) {
          return;
        }
        this._emitCardClick(ev);
      };
      this._onKeyDown = (ev) => {
        if (!this.hasAttribute("interactive") || this.hasAttribute("disabled")) {
          return;
        }
        if (ev.key !== "Enter" && ev.key !== " " && ev.key !== "Spacebar") {
          return;
        }
        const target = ev.target;
        if (target && target !== this && target.closest(NOCLICK_SELECTOR)) {
          return;
        }
        if (target instanceof HTMLElement && target !== this && (target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
          return;
        }
        ev.preventDefault();
        this._emitCardClick(ev);
      };
    }
    connectedCallback() {
      super.connectedCallback();
      this._syncRoles();
      this.addEventListener("click", this._onClick);
      this.addEventListener("keydown", this._onKeyDown);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._onClick);
      this.removeEventListener("keydown", this._onKeyDown);
    }
    render() {
      this._syncRoles();
      return html`<slot name="header"></slot><slot></slot><slot name="footer"></slot>`;
    }
    _syncRoles() {
      const interactive = this.hasAttribute("interactive");
      const disabled = this.hasAttribute("disabled");
      if (interactive) {
        if (!this.hasAttribute("role")) {
          this.setAttribute("role", "button");
        }
        this.setAttribute("tabindex", disabled ? "-1" : "0");
        this.setAttribute("aria-disabled", disabled ? "true" : "false");
      } else {
        this.removeAttribute("role");
        this.removeAttribute("tabindex");
        this.removeAttribute("aria-disabled");
      }
    }
    _emitCardClick(originalEvent) {
      this.dispatchEvent(
        new CustomEvent("wpd-card-click", {
          detail: { originalEvent },
          bubbles: true,
          composed: true
        })
      );
    }
  };
  _WpdCard.props = [
    "interactive",
    "selected",
    "compact",
    "disabled"
  ];
  _WpdCard.styles = [styles$b];
  _WpdCard.help = {
    title: "Card",
    summary: "Generic hover-aware container. Becomes click-emitting + focusable when `interactive`. Slots for header / default body / footer have built-in layout rhythm so consumers don't need bespoke wrapper components.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "interactive",
        type: "boolean",
        default: "false",
        description: 'Surfaces hover lift + cursor + role="button" + emits `wpd-card-click` on click / Enter / Space.'
      },
      {
        name: "selected",
        type: "boolean",
        default: "false",
        description: "Paints the accent ring — pickers / single-selection lists turn this on for the active card."
      },
      {
        name: "compact",
        type: "boolean",
        default: "false",
        description: "Tighter padding + smaller radius for dense lists."
      },
      {
        name: "disabled",
        type: "boolean",
        default: "false",
        description: "Fades the card and blocks pointer / key input. No `wpd-card-click` while disabled."
      }
    ],
    events: [
      {
        name: "wpd-card-click",
        detail: "{ originalEvent: MouseEvent | KeyboardEvent }",
        description: "Fires when an interactive card is activated. Skips events whose target is inside a `[data-noclick]` descendant so inline action buttons don't double-fire."
      }
    ],
    slots: [
      {
        name: "(default)",
        description: "Card body. Free-form content."
      },
      {
        name: "header",
        description: "Top slot — laid out as a flex row with 12px gap. Drop an `<img>` / icon plus a title block."
      },
      {
        name: "footer",
        description: "Bottom slot — pinned via `margin-top: auto`. Standard pattern: meta on the left, primary CTA on the right."
      }
    ],
    cssProps: [
      { name: "--wpd-card-bg", default: "#fff" },
      { name: "--wpd-card-fg", default: "inherit" },
      { name: "--wpd-card-padding", default: "16px" },
      { name: "--wpd-card-padding-compact", default: "10px" },
      { name: "--wpd-card-gap", default: "12px" },
      { name: "--wpd-card-gap-compact", default: "6px" },
      { name: "--wpd-card-radius", default: "12px" },
      { name: "--wpd-card-radius-compact", default: "8px" },
      { name: "--wpd-card-border", default: "var(--wpd-border, rgba(0,0,0,0.08))" },
      { name: "--wpd-card-border-hover", default: "var(--wpd-border-strong, rgba(0,0,0,0.16))" },
      { name: "--wpd-card-border-selected", default: "var(--wp-admin-theme-color, #2271b1)" },
      { name: "--wpd-card-shadow-hover", default: "0 4px 16px rgba(0,0,0,0.08)" }
    ],
    example: html`
			<wpd-card interactive>
				<header>
					<wpd-icon name="dashicons-admin-plugins" size="40"></wpd-icon>
					<div>
						<h3>Akismet</h3>
						<p>by Automattic</p>
					</div>
				</header>
				<p>The anti-spam service for WordPress sites.</p>
				<footer>
					<span>1M+ active</span>
					<wpd-button variant="primary" data-noclick>Install</wpd-button>
				</footer>
			</wpd-card>
		`
  };
  let WpdCard = _WpdCard;
  defineComponent("wpd-card", WpdCard);
  const styles$a = css`:host{display:inline-flex;align-items:center;gap:var( --wpd-badge-gap,6px );padding:var( --wpd-badge-padding,2px 8px );font:var( --wpd-badge-font,500 12px/1.4 var( --desktop-mode-font,system-ui ) );color:var( --wpd-badge-color,var( --desktop-mode-text,#1d2327 ) );background:var( --wpd-badge-bg,rgba( 0,0,0,0.06 ) );border:var( --wpd-badge-border,1px solid transparent );border-radius:var( --wpd-badge-border-radius,999px );white-space:nowrap;vertical-align:baseline}:host( [ hidden ] ){display:none}.dot{width:var( --wpd-badge-dot-size,8px );height:var( --wpd-badge-dot-size,8px );border-radius:50%;background:currentColor;flex:0 0 auto}:host( [ tone="success" ] ){--wpd-badge-color:var( --wpd-badge-success,#1a7f37 );--wpd-badge-bg:var( --wpd-badge-success-bg,rgba( 26,127,55,0.12 ) )}:host( [ tone="warning" ] ){--wpd-badge-color:var( --wpd-badge-warning,#9a6700 );--wpd-badge-bg:var( --wpd-badge-warning-bg,rgba( 154,103,0,0.12 ) )}:host( [ tone="danger" ] ){--wpd-badge-color:var( --wpd-badge-danger,#cf222e );--wpd-badge-bg:var( --wpd-badge-danger-bg,rgba( 207,34,46,0.12 ) )}:host( [ tone="info" ] ){--wpd-badge-color:var( --wpd-badge-info,#0969da );--wpd-badge-bg:var( --wpd-badge-info-bg,rgba( 9,105,218,0.12 ) )}:host( [ tone="neutral" ] ){--wpd-badge-color:var( --wpd-badge-neutral,#57606a );--wpd-badge-bg:var( --wpd-badge-neutral-bg,rgba( 87,96,106,0.12 ) )}:host( [ no-dot ] ) .dot{display:none}`;
  const _WpdBadge = class _WpdBadge extends Component {
    render() {
      return html`<span class="dot" aria-hidden="true"></span><slot></slot>`;
    }
  };
  _WpdBadge.props = ["tone", "noDot"];
  _WpdBadge.styles = [styles$a];
  _WpdBadge.help = {
    title: "Badge",
    summary: "Status pill with a colored leading dot and a label slot. Use for window-attached states, count chips, version markers, and any other small status surface where a leading tone-coded dot communicates meaning at a glance.",
    status: "experimental",
    since: "0.6.0",
    props: [
      {
        name: "tone",
        type: '"success" | "warning" | "danger" | "info" | "neutral"',
        description: 'Color tone applied to the dot + pill background. Default is "neutral".'
      },
      {
        name: "no-dot",
        type: "boolean",
        description: "Suppress the leading dot. Useful for count badges where the label itself is the whole signal."
      }
    ],
    slots: [{ name: "(default)", description: "Badge label." }],
    cssProps: [
      { name: "--wpd-badge-color", description: "Foreground color (also dot color)." },
      { name: "--wpd-badge-bg", description: "Pill background color." },
      { name: "--wpd-badge-border", default: "1px solid transparent" },
      { name: "--wpd-badge-padding", default: "2px 8px" },
      { name: "--wpd-badge-gap", default: "6px" },
      { name: "--wpd-badge-dot-size", default: "8px" },
      { name: "--wpd-badge-border-radius", default: "999px" }
    ],
    example: html`
			<wpd-badge tone="success">Attached</wpd-badge>
			<wpd-badge tone="warning">Detaching…</wpd-badge>
			<wpd-badge tone="danger">Errored</wpd-badge>
			<wpd-badge tone="info" no-dot>v0.6.0</wpd-badge>
		`
  };
  let WpdBadge = _WpdBadge;
  defineComponent("wpd-badge", WpdBadge);
  const flyoutStyles = css`:host{display:block;position:absolute;z-index:10;background:var( --wpd-flyout-bg,var( --wpd-surface-elevated,#ffffff ) );color:var( --wpd-flyout-fg,var( --desktop-mode-fg,#1d2327 ) );border-radius:14px;box-shadow:var( --wpd-flyout-shadow,0 16px 48px rgba( 0,25,53,0.4 ) );transform:translateX( 110% );opacity:0;pointer-events:none;transition:transform 220ms cubic-bezier( 0.22,1,0.36,1 ),opacity 180ms ease}:host( [ open ] ){transform:translateX( 0 );opacity:1;pointer-events:auto}:host( [ placement='end' ] ),:host(:not( [ placement ] ) ){inset-block:64px 14px;inset-inline-end:14px;width:min( 320px,calc( 100% - 28px ) )}:host( [ placement='start' ] ){inset-block:64px 14px;inset-inline-start:14px;width:min( 320px,calc( 100% - 28px ) );transform:translateX( -110% )}:host( [ placement='start' ][ open ] ){transform:translateX( 0 )}:host( [ placement='top' ] ){inset-block-start:14px;inset-inline:14px;max-block-size:calc( 100% - 28px );transform:translateY( -110% )}:host( [ placement='top' ][ open ] ){transform:translateY( 0 )}:host-context( [ dir='rtl' ] ):host( [ placement='end' ] ),:host-context( [ dir='rtl' ] ):host(:not( [ placement ] ) ){transform:translateX( -110% )}:host-context( [ dir='rtl' ] ):host( [ placement='end' ][ open ] ),:host-context( [ dir='rtl' ] ):host(:not( [ placement ] ) [ open ] ){transform:translateX( 0 )}:host-context( [ dir='rtl' ] ):host( [ placement='start' ] ){transform:translateX( 110% )}:host-context( [ dir='rtl' ] ):host( [ placement='start' ][ open ] ){transform:translateX( 0 )}:host::before{content:'';position:fixed;inset:0;background:var( --wpd-flyout-backdrop,transparent );z-index:-1;pointer-events:none;transition:opacity 180ms ease;opacity:0}:host( [ open ] )::before{opacity:1}@media ( prefers-reduced-motion:reduce ){:host{transition:none}:host::before{transition:none}}`;
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "area[href]",
    "button:not([disabled])",
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(",");
  const CLOSE_BUTTON_SELECTOR = "[data-flyout-close]";
  const _WpdFlyout = class _WpdFlyout extends Component {
    constructor() {
      super(...arguments);
      this._trigger = null;
      this._onDocKey = null;
      this._onScopePointerDown = null;
      this._onHostClick = null;
      this._onHostKeyDown = null;
      this._pendingReason = null;
    }
    connectedCallback() {
      super.connectedCallback();
      if (!this.hasAttribute("role")) {
        this.setAttribute("role", "dialog");
      }
      if (!this.hasAttribute("open")) {
        this.setAttribute("inert", "");
      }
    }
    disconnectedCallback() {
      this._detachOpenListeners();
    }
    attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback(name, oldValue, newValue);
      if (name === "open") {
        if (newValue !== null && oldValue === null) {
          this._handleOpen();
        } else if (newValue === null && oldValue !== null) {
          this._handleClose();
        }
      }
    }
    _handleOpen() {
      this.removeAttribute("inert");
      const doc = this.ownerDocument;
      const active = doc?.activeElement ?? null;
      this._trigger = active instanceof HTMLElement && active !== this && active !== doc?.body && active !== doc?.documentElement ? active : null;
      queueMicrotask(() => {
        if (!this.hasAttribute("open")) {
          return;
        }
        const focusable = this._firstFocusable();
        (focusable ?? this).focus?.({ preventScroll: true });
      });
      this._attachOpenListeners();
    }
    _handleClose() {
      const reason = this._pendingReason ?? "api";
      this._pendingReason = null;
      this.setAttribute("inert", "");
      this._detachOpenListeners();
      this.emit("wpd-flyout-dismiss", { reason });
      const trigger = this._trigger;
      this._trigger = null;
      if (trigger && trigger.isConnected) {
        trigger.focus?.({ preventScroll: true });
      }
    }
    /** Internal dismissal — flags the reason then removes `open`. */
    _dismiss(reason) {
      if (!this.hasAttribute("open")) {
        return;
      }
      this._pendingReason = reason;
      this.removeAttribute("open");
    }
    _attachOpenListeners() {
      const scopeRoot = this._resolveScopeRoot();
      this._onScopePointerDown = (e) => {
        if (!this.hasAttribute("open")) {
          return;
        }
        const path = e.composedPath();
        if (path.includes(this)) {
          return;
        }
        if (this._trigger && path.includes(this._trigger)) {
          return;
        }
        this._dismiss("pointer");
      };
      scopeRoot.addEventListener("pointerdown", this._onScopePointerDown);
      this._onDocKey = (e) => {
        if (e.key === "Escape" && this.hasAttribute("open")) {
          e.preventDefault();
          this._dismiss("escape");
        }
      };
      document.addEventListener("keydown", this._onDocKey);
      this._onHostKeyDown = (e) => {
        if (e.key !== "Tab") {
          return;
        }
        const focusables = this._allFocusable();
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = this.ownerDocument?.activeElement ?? null;
        if (e.shiftKey && (active === first || active === this)) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus({ preventScroll: true });
        }
      };
      this.addEventListener("keydown", this._onHostKeyDown);
      this._onHostClick = (e) => {
        const target = e.target;
        const closeBtn = target?.closest?.(CLOSE_BUTTON_SELECTOR);
        if (closeBtn && this.contains(closeBtn)) {
          this._dismiss("close-button");
        }
      };
      this.addEventListener("click", this._onHostClick);
    }
    _detachOpenListeners() {
      if (this._onDocKey) {
        document.removeEventListener("keydown", this._onDocKey);
        this._onDocKey = null;
      }
      if (this._onScopePointerDown) {
        const scopeRoot = this._resolveScopeRoot();
        scopeRoot.removeEventListener("pointerdown", this._onScopePointerDown);
        this._onScopePointerDown = null;
      }
      if (this._onHostKeyDown) {
        this.removeEventListener("keydown", this._onHostKeyDown);
        this._onHostKeyDown = null;
      }
      if (this._onHostClick) {
        this.removeEventListener("click", this._onHostClick);
        this._onHostClick = null;
      }
    }
    _resolveScopeRoot() {
      const scope = this.getAttribute("scope") ?? "window";
      if (scope === "document") {
        return document.body;
      }
      if (scope === "parent") {
        return this.parentElement ?? document.body;
      }
      const windowBody = this.closest(".desktop-mode-window__body");
      return windowBody ?? this.parentElement ?? document.body;
    }
    _firstFocusable() {
      const slotMatch = this.querySelector(FOCUSABLE_SELECTOR);
      return slotMatch ?? null;
    }
    _allFocusable() {
      return Array.from(
        this.querySelectorAll(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.disabled);
    }
    render() {
      return html`<slot></slot>`;
    }
  };
  _WpdFlyout.props = [
    "open",
    "placement",
    "scope",
    "aria-label",
    "aria-labelledby"
  ];
  _WpdFlyout.styles = [flyoutStyles];
  _WpdFlyout.help = {
    title: "Flyout",
    summary: "Window-scoped sliding card. Lives `position: absolute` inside a window body, slides in from the configured edge with margins on every side, captures the previously-focused element as the trigger for restore-on-close, traps focus while open, and dismisses on Escape / pointerdown-outside / `[data-flyout-close]` click / imperative `open`-removal — all firing one `wpd-flyout-dismiss` event with a `reason` discriminator.",
    status: "experimental",
    since: "0.8.2",
    props: [
      {
        name: "open",
        type: "boolean attribute",
        description: "Mounts the flyout open. Removing the attribute (programmatically or via the component's own dismissal paths) slides it back out and fires `wpd-flyout-dismiss`."
      },
      {
        name: "placement",
        type: "'end' | 'start' | 'top'",
        default: "end",
        description: "Which inside-window edge the card anchors to. `'end'` is the inline-end edge (right in LTR, left in RTL). All placements keep gutters on every edge — the panel reads as a floating card, not a drawer."
      },
      {
        name: "scope",
        type: "'window' | 'parent' | 'document'",
        default: "window",
        description: "Which container the click-outside listener attaches to. `'window'` (default) walks up to the closest `.desktop-mode-window__body`; `'parent'` uses the immediate parent element; `'document'` listens on `document.body`. The first option is the right one for any flyout inside a desktop-mode window."
      },
      {
        name: "aria-label",
        type: "string",
        description: "Accessible name for the dialog landmark."
      },
      {
        name: "aria-labelledby",
        type: "id reference",
        description: "Id of the element labelling the flyout — wins over `aria-label` when both are set."
      }
    ],
    events: [
      {
        name: "wpd-flyout-dismiss",
        description: "Fires whenever the flyout closes. Detail: `{ reason: 'escape' | 'pointer' | 'close-button' | 'api' }`. The `'api'` reason fires when an external caller imperatively removes the `open` attribute."
      }
    ],
    cssProps: [
      {
        name: "--wpd-flyout-bg",
        description: "Card background. Default: white surface."
      },
      {
        name: "--wpd-flyout-fg",
        description: "Card foreground. Default: `--desktop-mode-fg`."
      },
      {
        name: "--wpd-flyout-shadow",
        description: "Drop shadow. Default: a deep navy 16px/48px lift."
      },
      {
        name: "--wpd-flyout-backdrop",
        description: "Backdrop layer dimming the window body while the flyout is open. Default `transparent` — flyout is additive, not modal. Set to e.g. `rgba(0,0,0,0.4)` for window-scoped modality."
      }
    ],
    slots: [
      {
        name: "(default)",
        description: "Card content. The component does not impose padding or a header — wrap in your own `<wpd-panel>` / header / scroll container as needed. Mark a button with `data-flyout-close` to wire it to the framework dismissal path."
      }
    ],
    example: html`
			<div
				style="position:relative;height:280px;border:1px solid rgba(0,0,0,0.08);border-radius:8px;background:var(--desktop-mode-bg-soft, #f6f7f7);overflow:hidden;"
			>
				<div
					style="height:32px;background:rgba(0,0,0,0.04);display:flex;align-items:center;padding:0 12px;font-size:12px;opacity:0.7;"
				>
					Mock window — title bar
				</div>
				<div style="padding:12px;">
					<wpd-button
						id="wpd-flyout-example-trigger"
						@click=${(e) => {
      const flyout = e.currentTarget.getRootNode().querySelector("#wpd-flyout-example-flyout");
      flyout?.setAttribute("open", "");
    }}
						>Open flyout</wpd-button
					>
					<p style="opacity:0.7;font-size:13px;">
						Click the button. The card slides in from the right
						edge with margins from every window edge — title
						bar stays visible above. Press Escape, click outside
						the card, or hit Close to dismiss.
					</p>
				</div>
				<wpd-flyout
					id="wpd-flyout-example-flyout"
					placement="end"
					scope="parent"
					aria-label="Sample flyout"
				>
					<div style="padding:18px;">
						<h4 style="margin:0 0 8px;">Account</h4>
						<p style="margin:0 0 12px;font-size:13px;opacity:0.8;">
							Floating card inside the window. Margins from
							every edge so the chrome reads through.
						</p>
						<wpd-button data-flyout-close>Close</wpd-button>
					</div>
				</wpd-flyout>
			</div>
		`
  };
  let WpdFlyout = _WpdFlyout;
  defineComponent("wpd-flyout", WpdFlyout);
  function getWpHooks() {
    const hooks = window.wp?.hooks;
    if (!hooks) {
      throw new Error(
        "[desktop-mode] `window.wp.hooks` is not available. The plugin declares `wp-hooks` as a script dependency; if you are seeing this error, verify the enqueue order."
      );
    }
    return hooks;
  }
  function addAction(hookName2, namespace, callback, priority) {
    getWpHooks().addAction(
      hookName2,
      namespace,
      callback,
      priority
    );
  }
  function removeAction(hookName2, namespace) {
    return getWpHooks().removeAction(hookName2, namespace);
  }
  function applyFilters(hookName2, value, ...args) {
    return getWpHooks().applyFilters(hookName2, value, ...args);
  }
  function doAction(hookName2, ...args) {
    getWpHooks().doAction(hookName2, ...args);
  }
  const HOOKS = {
    /**
     * Action, fires when one of the shell's own try/catch barriers
     * catches an exception. Payload: `{ scope:
     * 'widget-mount' | 'widget-teardown' | 'window-open' | 'wallpaper-mount' |
     * 'wallpaper-teardown' | 'session-save' | 'menu-refresh' | string,
     * id?: string, error: unknown }`. Paired with the existing
     * `console.error` calls — a monitor widget can surface these as
     * first-class entries.
     */
    SHELL_ERROR: "desktop-mode.shell.error",
    /**
     * Action, fires once per `wp.desktop.broadcast()` call with the
     * fully-resolved `{ topic, payload }` detail. Lets plugins log,
     * mirror, or augment broadcast traffic without subscribing for
     * every individual topic.
     */
    BROADCAST: "desktop-mode.broadcast"
  };
  const HOOK_PREFIX = "desktop-mode.activity.";
  function hookName(channel) {
    return `${HOOK_PREFIX}${String(channel)}`;
  }
  let subscribeSeq = 0;
  const activity = {
    publish(channel, payload) {
      doAction(hookName(channel), payload);
    },
    subscribe(channel, cb) {
      const ns = `desktop-mode/activity-sub/${++subscribeSeq}`;
      const hook = hookName(channel);
      addAction(
        hook,
        ns,
        (payload) => cb(payload)
      );
      let removed = false;
      return () => {
        if (removed) {
          return;
        }
        removed = true;
        removeAction(hook, ns);
      };
    },
    filter(channel, value, ...args) {
      return applyFilters(hookName(channel), value, ...args);
    }
  };
  const EVENT_NAME = "desktop-mode-broadcast";
  function broadcast(topic, payload) {
    const filteredTopic = String(
      applyFilters("desktop-mode.broadcast.topic", topic, { payload }) ?? topic
    );
    const filteredPayload = applyFilters(
      "desktop-mode.broadcast.payload",
      payload,
      { topic: filteredTopic }
    );
    const detail = {
      topic: filteredTopic,
      payload: filteredPayload
    };
    document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    doAction(HOOKS.BROADCAST, detail);
    activity.publish(
      filteredTopic,
      filteredPayload
    );
    {
      return;
    }
  }
  function subscribe(topic, cb) {
    const handler = (e) => {
      const detail = e.detail;
      if (!detail) {
        return;
      }
      if (detail.topic !== topic) {
        return;
      }
      try {
        cb(detail.payload, { topic: detail.topic });
      } catch (err) {
        doAction(HOOKS.SHELL_ERROR, {
          scope: "broadcast-subscriber",
          topic: detail.topic,
          error: err
        });
      }
    };
    document.addEventListener(EVENT_NAME, handler);
    return () => document.removeEventListener(EVENT_NAME, handler);
  }
  const styles$9 = css`:host{display:inline-flex}:host( [ fill-cell ] ){display:flex;width:100%}button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:var( --wpd-button-padding,6px 12px );border-radius:var( --wpd-button-border-radius,6px );font:inherit;font-weight:500;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease;background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid var( --desktop-mode-border,#c3c4c7 ) )}:host( [ fill-cell ] ) button{width:100%;min-height:var( --wpd-button-min-height,44px )}button:disabled{opacity:0.5;cursor:not-allowed}button:hover:not(:disabled ){background:rgba( 0,0,0,0.04 )}:host( [ variant='primary' ] ) button{background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) );color:var( --wpd-button-fg,#fff );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='primary' ] ) button:hover:not(:disabled ){filter:brightness( 1.06 );background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ variant='secondary' ] ) button{background:var( --wpd-button-bg,rgba( 0,0,0,0.06 ) );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='secondary' ] ) button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.1 ) )}:host( [ variant='danger' ] ) button{background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,#d63638 );border:var( --wpd-button-border,1px solid currentColor )}:host( [ variant='danger' ] ) button:hover:not(:disabled ){background:#d63638;color:#fff}:host( [ variant='link' ] ) button{background:transparent;color:var( --wpd-button-fg,var( --wp-admin-theme-color,#2271b1 ) );border:0;padding:0;text-decoration:underline}:host( [ busy ] ) button{pointer-events:none;opacity:0.75}`;
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
  _WpdButton.styles = [styles$9];
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
  function buildCard(plugin, installed, callbacks) {
    const card = document.createElement("wpd-card");
    card.classList.add("desktop-mode-plugins__card");
    card.setAttribute("interactive", "");
    card.dataset.slug = plugin.slug;
    card.setAttribute(
      "aria-label",
      sprintf(
        /* translators: %s: plugin name */
        __("View details for %s", "desktop-mode"),
        plugin.name
      )
    );
    const header = document.createElement("header");
    header.className = "desktop-mode-plugins__card-header";
    const iconWrap = document.createElement("div");
    iconWrap.className = "desktop-mode-plugins__card-icon";
    const iconUrl = pickIcon(plugin.icons);
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener(
        "load",
        () => img.classList.add("is-loaded")
      );
      img.addEventListener("error", () => {
        iconWrap.replaceChildren(buildFallbackGlyph$1());
      });
      iconWrap.appendChild(img);
    } else {
      iconWrap.appendChild(buildFallbackGlyph$1());
    }
    const titleBlock = document.createElement("div");
    titleBlock.className = "desktop-mode-plugins__card-titleblock";
    const title = document.createElement("h3");
    title.className = "desktop-mode-plugins__card-title";
    title.textContent = decodeEntities(plugin.name);
    const byline = document.createElement("p");
    byline.className = "desktop-mode-plugins__card-byline";
    byline.innerHTML = sprintf(
      /* translators: %s: plugin author name (HTML-stripped) */
      __("by %s", "desktop-mode"),
      `<span>${escapeHtml$2(stripHtml$4(plugin.author ?? ""))}</span>`
    );
    titleBlock.append(title, byline);
    header.setAttribute("slot", "header");
    header.append(iconWrap, titleBlock);
    const desc = document.createElement("p");
    desc.className = "desktop-mode-plugins__card-desc";
    desc.textContent = decodeEntities(plugin.short_description ?? "");
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-plugins__card-footer";
    footer.setAttribute("slot", "footer");
    const meta = document.createElement("div");
    meta.className = "desktop-mode-plugins__card-meta";
    meta.appendChild(buildStarCluster(plugin.rating ?? 0, plugin.num_ratings ?? 0));
    const installs = document.createElement("span");
    installs.className = "desktop-mode-plugins__card-installs";
    installs.textContent = formatInstalls(plugin.active_installs ?? 0);
    meta.appendChild(installs);
    const cta = buildCta(plugin, installed, callbacks, card);
    footer.append(meta, cta);
    card.append(header, desc, footer);
    card.addEventListener("wpd-card-click", () => {
      callbacks.onOpen(plugin.slug, plugin);
    });
    return card;
  }
  function repaintCardCta(card, plugin, installed, callbacks) {
    const footer = card.querySelector(
      ".desktop-mode-plugins__card-footer"
    );
    if (!footer) {
      return;
    }
    const previous = footer.querySelector(
      "[data-plugin-card-cta]"
    );
    if (previous) {
      previous.remove();
    }
    footer.appendChild(buildCta(plugin, installed, callbacks, card));
  }
  function buildCta(plugin, installed, callbacks, card) {
    const installedRow = installed.get(plugin.slug);
    const button2 = document.createElement("wpd-button");
    button2.setAttribute("data-plugin-card-cta", "");
    button2.setAttribute("data-noclick", "");
    if (installedRow) {
      if (installedRow.status === "active" || installedRow.status === "active-network") {
        button2.setAttribute("variant", "ghost");
        button2.setAttribute("disabled", "");
        button2.textContent = __("Active", "desktop-mode");
      } else {
        button2.setAttribute("variant", "primary");
        button2.textContent = __("Activate", "desktop-mode");
        button2.addEventListener("click", (ev) => {
          ev.stopPropagation();
          void callbacks.onActivate(installedRow, card);
        });
      }
    } else {
      button2.setAttribute("variant", "primary");
      button2.textContent = __("Install", "desktop-mode");
      button2.addEventListener("click", (ev) => {
        ev.stopPropagation();
        void callbacks.onInstall(plugin, card);
      });
    }
    return button2;
  }
  function buildStarCluster(rating0to100, totalRatings) {
    const wrap = document.createElement("span");
    wrap.className = "desktop-mode-plugins__stars";
    wrap.setAttribute("aria-label", formatStarsAriaLabel(rating0to100));
    const stars5 = Math.max(0, Math.min(5, rating0to100 / 100 * 5));
    const full = Math.floor(stars5);
    const half = stars5 - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    for (let i = 0; i < full; i++) {
      wrap.appendChild(buildStar("filled"));
    }
    for (let i = 0; i < half; i++) {
      wrap.appendChild(buildStar("half"));
    }
    for (let i = 0; i < empty; i++) {
      wrap.appendChild(buildStar("empty"));
    }
    if (totalRatings > 0) {
      const count = document.createElement("span");
      count.className = "desktop-mode-plugins__stars-count";
      count.textContent = `(${formatThousands(totalRatings)})`;
      wrap.appendChild(count);
    }
    return wrap;
  }
  function buildStar(kind) {
    const span = document.createElement("span");
    span.className = "desktop-mode-plugins__star";
    span.setAttribute("aria-hidden", "true");
    const icon = document.createElement("span");
    if (kind === "filled") {
      icon.className = "dashicons dashicons-star-filled";
    } else if (kind === "half") {
      icon.className = "dashicons dashicons-star-half";
    } else {
      icon.className = "dashicons dashicons-star-empty";
    }
    span.appendChild(icon);
    return span;
  }
  function buildFallbackGlyph$1() {
    const fallback = document.createElement("span");
    fallback.className = "dashicons dashicons-admin-plugins desktop-mode-plugins__card-icon-fallback";
    fallback.setAttribute("aria-hidden", "true");
    return fallback;
  }
  function pickIcon(icons) {
    if (!icons) {
      return null;
    }
    return icons.svg ?? icons["256"] ?? icons["256x256"] ?? icons.default ?? icons["128"] ?? icons["128x128"] ?? icons["2x"] ?? icons["1x"] ?? Object.values(icons)[0] ?? null;
  }
  function formatInstalls(n) {
    if (n <= 0) {
      return __("Fewer than 10 active", "desktop-mode");
    }
    if (n >= 1e6) {
      const millions = Math.floor(n / 1e6);
      return sprintf(
        /* translators: %d: integer number of millions of active installs */
        __("%d+ million active", "desktop-mode"),
        millions
      );
    }
    if (n >= 1e3) {
      return sprintf(
        /* translators: %s: comma-grouped active install count */
        __("%s+ active", "desktop-mode"),
        formatThousands(roundTo3SigFigs(n))
      );
    }
    return sprintf(
      /* translators: %s: comma-grouped active install count */
      __("%s+ active", "desktop-mode"),
      formatThousands(n)
    );
  }
  function roundTo3SigFigs(n) {
    const order = Math.pow(10, Math.floor(Math.log10(n)) - 2);
    return Math.floor(n / order) * order;
  }
  function formatStarsAriaLabel(rating0to100) {
    const stars5 = Math.max(0, Math.min(5, rating0to100 / 100 * 5));
    return sprintf(
      /* translators: %s: rating out of 5 (one decimal) */
      __("Rated %s out of 5", "desktop-mode"),
      stars5.toFixed(1)
    );
  }
  function formatThousands(n) {
    try {
      return new Intl.NumberFormat().format(n);
    } catch {
      return String(n);
    }
  }
  const _entityCache = document.createElement("textarea");
  function decodeEntities(html2) {
    if (!html2) {
      return "";
    }
    _entityCache.innerHTML = html2;
    return _entityCache.value;
  }
  function escapeHtml$2(raw) {
    const tmp = document.createElement("div");
    tmp.textContent = raw;
    return tmp.innerHTML;
  }
  function stripHtml$4(html2) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html2;
    return tmp.textContent ?? "";
  }
  function api() {
    return window.wp?.desktop ?? null;
  }
  function makeCardDraggable(card, plugin) {
    if (card.dataset.dragWired === "1") {
      return;
    }
    card.dataset.dragWired = "1";
    card.addEventListener("pointerdown", (ev) => {
      const desktop = api();
      const manager = desktop?.dragManager;
      if (!manager) {
        return;
      }
      const t = ev.target;
      if (t?.closest("[data-plugin-card-cta]")) {
        return;
      }
      manager.start({
        payload: {
          type: "wporg-plugin",
          source: card,
          data: {
            slug: plugin.slug,
            name: plugin.name,
            iconUrl: pickIcon(plugin.icons) ?? null,
            homepage: plugin.homepage ?? "",
            authorName: stripHtml$3(plugin.author ?? ""),
            shortDescription: plugin.short_description ?? ""
          },
          ghost: buildGhost(plugin, card, ev)
        },
        origin: ev,
        onClickOnly: () => {
        }
      });
    });
  }
  function installPluginDropTargets() {
    const desktop = api();
    const manager = desktop?.dragManager;
    if (!manager) {
      return () => {
      };
    }
    const teardowns = [];
    const dock = findDockElement();
    if (dock) {
      const off = manager.registerDropTarget({
        id: "desktop-mode-plugins-window/dock",
        element: dock,
        accept: (p) => p.type === "wporg-plugin",
        onEnter: () => {
          dock.setAttribute("data-plugins-card-drop-active", "");
        },
        onLeave: () => {
          dock.removeAttribute("data-plugins-card-drop-active");
        },
        onDrop: (session) => {
          dock.removeAttribute("data-plugins-card-drop-active");
          const data = session.payload.data;
          const slug = String(data.slug ?? "");
          if (!slug) {
            return;
          }
          const name = String(data.name ?? slug);
          const icon = typeof data.iconUrl === "string" && data.iconUrl ? data.iconUrl : "dashicons-admin-plugins";
          const homepage = String(data.homepage ?? "");
          const url = homepage !== "" ? homepage : `https://wordpress.org/plugins/${encodeURIComponent(slug)}/`;
          if (typeof desktop?.registerSystemTile === "function") {
            desktop.registerSystemTile({
              id: `wporg-plugin-${slug}`,
              title: name,
              icon,
              url
            });
          }
          if (typeof desktop?.showToast === "function") {
            desktop.showToast({
              message: sprintf(
                /* translators: %s: plugin name */
                __("Pinned %s to the dock.", "desktop-mode"),
                name
              ),
              duration: 3500
            });
          }
        }
      });
      teardowns.push(off);
    }
    return () => {
      for (const off of teardowns) {
        try {
          off();
        } catch {
        }
      }
    };
  }
  function findDockElement() {
    return document.querySelector(".desktop-mode-bottom-dock") ?? document.querySelector(".desktop-mode-dock") ?? document.querySelector("[data-desktop-mode-dock]");
  }
  function buildGhost(plugin, card, origin) {
    const rect = card.getBoundingClientRect();
    const offsetX = origin.clientX - rect.left;
    const offsetY = origin.clientY - rect.top;
    const ghost = document.createElement("div");
    ghost.className = "desktop-mode-plugins__drag-ghost";
    const iconUrl = pickIcon(plugin.icons);
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "";
      ghost.appendChild(img);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "dashicons dashicons-admin-plugins desktop-mode-plugins__drag-ghost-fallback";
      ghost.appendChild(fallback);
    }
    const label = document.createElement("span");
    label.textContent = plugin.name;
    ghost.appendChild(label);
    return { offsetX, offsetY, element: ghost };
  }
  function stripHtml$3(html2) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html2;
    return tmp.textContent ?? "";
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
  const WINDOW_ID = "desktop-mode-plugins";
  function getConfig() {
    const store = window.desktopModeWindowConfig;
    const cfg = store ? store[WINDOW_ID] : void 0;
    if (!cfg) {
      throw new Error(
        `[${WINDOW_ID}] config blob is missing — was the window opened without registration? See the matching \`desktop_mode_register_window()\` call in \`includes/plugins-window/window.php\`.`
      );
    }
    return cfg;
  }
  function shellFetch(input, init) {
    return trackedFetch(input, init, {
      windowId: WINDOW_ID,
      source: "desktop-mode/plugins-window"
    });
  }
  async function restRequest(url, init = {}) {
    const cfg = getConfig();
    const { expectJson = true, ...rest } = init;
    const response = await shellFetch(url, {
      ...rest,
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json",
        ...rest.body ? { "Content-Type": "application/json" } : {},
        ...rest.headers ?? {}
      }
    });
    if (!response.ok) {
      throw await unpackErrorResponse(response);
    }
    if (!expectJson) {
      return void 0;
    }
    return await response.json();
  }
  async function ajaxRequest(action, args = {}, options = {}) {
    const cfg = getConfig();
    const body = new URLSearchParams();
    body.set("action", action);
    const nonceField = options.nonceField ?? "_ajax_nonce";
    const nonceValue = options.nonceValue ?? cfg.ajaxNonce;
    body.set(nonceField, nonceValue);
    for (const [key, value] of Object.entries(args)) {
      if (value === void 0) {
        continue;
      }
      body.set(key, String(value));
    }
    const response = await shellFetch(cfg.ajaxUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json"
      },
      body
    });
    const json = await readJsonOrThrow(response);
    return unwrapAjaxEnvelope(json, response.status);
  }
  async function ajaxUpload(action, formData) {
    const cfg = getConfig();
    formData.set("action", action);
    if (!formData.has("_ajax_nonce")) {
      formData.set("_ajax_nonce", cfg.ajaxNonce);
    }
    const response = await shellFetch(cfg.ajaxUrl, {
      method: "POST",
      credentials: "same-origin",
      body: formData
      // Don't set Content-Type — the browser appends the boundary.
    });
    const json = await readJsonOrThrow(response);
    return unwrapAjaxEnvelope(json, response.status);
  }
  async function readJsonOrThrow(response) {
    let json;
    try {
      json = await response.json();
    } catch (err) {
      throw new Error(
        `Server returned ${response.status} with non-JSON body. (${String(err)})`
      );
    }
    if (!response.ok) {
      const errPayload = typeof json === "object" && json !== null && "success" in json && json.success === false ? json.data : json;
      throw extractAjaxError(errPayload, response.status);
    }
    return json;
  }
  function unwrapAjaxEnvelope(json, status) {
    if (typeof json === "object" && json !== null && "success" in json) {
      const env = json;
      if (env.success) {
        return env.data ?? null;
      }
      throw extractAjaxError(env.data, status);
    }
    return json;
  }
  function extractAjaxError(data, status) {
    if (typeof data === "object" && data !== null) {
      const obj = data;
      const msg = obj.message ?? obj.errorMessage ?? obj.code ?? obj.errorCode;
      if (typeof msg === "string" && msg !== "") {
        const err = new Error(msg);
        err.code = obj.code ?? obj.errorCode;
        err.status = status;
        return err;
      }
    }
    return new Error(`Request failed (${status}).`);
  }
  async function unpackErrorResponse(response) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const json = await response.json();
      if (json && typeof json.message === "string" && json.message !== "") {
        message = json.message;
      }
      const err = new Error(message);
      err.code = json?.code;
      err.status = response.status;
      return err;
    } catch {
      const err = new Error(message);
      err.status = response.status;
      return err;
    }
  }
  async function fetchInstalledPlugins(opts = {}) {
    const cfg = getConfig();
    const params = new URLSearchParams({ context: "view", per_page: "100" });
    if (opts.force) {
      params.set("desktop_mode_force_refresh", "1");
    }
    const url = joinRestUrl(cfg.restRoot, `wp/v2/plugins?${params.toString()}`);
    return restRequest(url, { method: "GET" });
  }
  async function activateInstalledPlugin(plugin) {
    return mutateInstalledPlugin(plugin, { status: "active" });
  }
  async function deactivateInstalledPlugin(plugin) {
    return mutateInstalledPlugin(plugin, { status: "inactive" });
  }
  async function mutateInstalledPlugin(plugin, body) {
    const cfg = getConfig();
    return restRequest(
      joinRestUrl(cfg.restRoot, `wp/v2/plugins/${encodePluginPath(plugin.plugin)}`),
      {
        method: "PUT",
        body: JSON.stringify(body)
      }
    );
  }
  async function deleteInstalledPlugin(plugin) {
    const cfg = getConfig();
    await restRequest(
      joinRestUrl(
        cfg.restRoot,
        `wp/v2/plugins/${encodePluginPath(plugin.plugin)}?force=true`
      ),
      {
        method: "DELETE",
        expectJson: false
      }
    );
  }
  function encodePluginPath(plugin) {
    return plugin.split("/").map(encodeURIComponent).join("/");
  }
  async function updateInstalledPlugin(plugin) {
    const pluginFile = plugin.plugin.endsWith(".php") ? plugin.plugin : plugin.plugin + ".php";
    return ajaxRequest(
      "update-plugin",
      {
        plugin: pluginFile,
        slug: plugin.desktop_mode_update_available?.slug || plugin.textdomain || plugin.plugin.split("/")[0]
      },
      { nonceField: "_ajax_nonce", nonceValue: getConfig().updatesNonce }
    );
  }
  async function toggleAutoUpdate(plugin, state) {
    const pluginFile = plugin.plugin.endsWith(".php") ? plugin.plugin : plugin.plugin + ".php";
    await ajaxRequest(
      "toggle-auto-updates",
      {
        type: "plugin",
        asset: pluginFile,
        state
      },
      { nonceField: "_ajax_nonce", nonceValue: getConfig().updatesNonce }
    );
  }
  async function browsePlugins(args = {}) {
    return ajaxRequest("desktop_mode_plugins_browse", {
      browse: args.browse,
      search: args.search,
      tag: args.tag,
      page: args.page,
      per_page: args.perPage
    });
  }
  async function fetchPluginInfo(slug) {
    return ajaxRequest("desktop_mode_plugins_info", { slug });
  }
  async function fetchFeaturedPlugins() {
    return ajaxRequest("desktop_mode_plugins_featured");
  }
  async function fetchPluginReviews(slug) {
    return ajaxRequest("desktop_mode_plugins_reviews", { slug });
  }
  async function installPluginBySlug(slug) {
    return ajaxRequest(
      "install-plugin",
      { slug },
      { nonceField: "_ajax_nonce", nonceValue: getConfig().updatesNonce }
    );
  }
  async function uploadPluginZip(file, options = {}) {
    const data = new FormData();
    data.set("pluginzip", file);
    if (options.overwrite) {
      data.set("overwrite", "1");
    }
    return ajaxUpload("desktop_mode_plugins_upload", data);
  }
  async function refreshFrameworkMenu() {
    const refresh = window.wp?.desktop?.refreshMenu;
    if (typeof refresh !== "function") {
      return;
    }
    try {
      await refresh();
    } catch {
    }
  }
  function isDesktopModeSelf(pluginFile) {
    let self = "";
    try {
      self = getConfig().selfPluginFile;
    } catch {
      return false;
    }
    const trim = (s) => s.endsWith(".php") ? s.slice(0, -4) : s;
    return self !== "" && trim(self) === trim(pluginFile);
  }
  function reloadOutOfDesktopMode() {
    const target = window.top ?? window;
    let dest;
    try {
      dest = getConfig().adminUrl;
    } catch {
      dest = "";
    }
    window.setTimeout(() => {
      if (dest) {
        try {
          target.location.assign(dest);
          return;
        } catch {
        }
        window.location.assign(dest);
        return;
      }
      try {
        target.location.reload();
      } catch {
        window.location.reload();
      }
    }, 800);
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
  function toast$3(message, duration = 3500) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.showToast === "function") {
      api2.showToast({ message, duration });
      return;
    }
    console.log("[plugins-window]", message);
  }
  async function confirm$1(opts) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.confirm === "function") {
      return api2.confirm(opts);
    }
    return Promise.resolve(true);
  }
  function openDetailFlyout(flyout, slug, hint, callbacks) {
    flyout.replaceChildren();
    const card = document.createElement("div");
    card.className = "desktop-mode-plugins__flyout";
    const hero = buildHeroSkeleton(hint);
    const tabs = buildTabs();
    const body = document.createElement("div");
    body.className = "desktop-mode-plugins__flyout-body";
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-plugins__flyout-footer";
    card.append(hero.root, tabs.root, body, footer);
    flyout.appendChild(card);
    flyout.setAttribute("open", "");
    let info = null;
    const reviewsCache2 = { loaded: false };
    const refreshFooter = () => {
      paintFooter(footer, slug, info, callbacks, () => closeFlyout(flyout));
    };
    refreshFooter();
    tabs.onChange((tab) => {
      paintTabBody(body, tab, info, slug, reviewsCache2);
    });
    paintTabBody(body, "overview", info, slug, reviewsCache2);
    void (async () => {
      try {
        info = await fetchPluginInfo(slug);
        paintHero(hero, info);
        refreshFooter();
        const current = tabs.current();
        paintTabBody(body, current, info, slug, reviewsCache2);
      } catch (err) {
        body.innerHTML = "";
        const failure = document.createElement("p");
        failure.className = "desktop-mode-plugins__flyout-error";
        failure.textContent = err instanceof Error ? err.message : __("Could not load plugin details.", "desktop-mode");
        body.appendChild(failure);
      }
    })();
  }
  function closeFlyout(flyout) {
    flyout.removeAttribute("open");
  }
  function buildHeroSkeleton(hint) {
    const root = document.createElement("header");
    root.className = "desktop-mode-plugins__flyout-hero";
    const banner = document.createElement("div");
    banner.className = "desktop-mode-plugins__flyout-banner";
    root.appendChild(banner);
    const inner = document.createElement("div");
    inner.className = "desktop-mode-plugins__flyout-hero-inner";
    const icon = document.createElement("div");
    icon.className = "desktop-mode-plugins__flyout-hero-icon";
    const text = document.createElement("div");
    text.className = "desktop-mode-plugins__flyout-hero-text";
    const title = document.createElement("h2");
    title.className = "desktop-mode-plugins__flyout-hero-title";
    const byline = document.createElement("p");
    byline.className = "desktop-mode-plugins__flyout-hero-byline";
    const meta = document.createElement("div");
    meta.className = "desktop-mode-plugins__flyout-hero-meta";
    const stars = document.createElement("div");
    stars.className = "desktop-mode-plugins__flyout-hero-stars";
    meta.appendChild(stars);
    text.append(title, byline, meta);
    inner.append(icon, text);
    root.appendChild(inner);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "desktop-mode-plugins__flyout-close";
    close.setAttribute("data-flyout-close", "");
    close.setAttribute(
      "aria-label",
      __("Close plugin details", "desktop-mode")
    );
    close.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 L6 18"></path><path d="M6 6 L18 18"></path></svg>';
    root.appendChild(close);
    if (hint) {
      title.textContent = hint.name;
      byline.textContent = sprintf(
        /* translators: %s: plugin author */
        __("by %s", "desktop-mode"),
        stripHtml$2(hint.author ?? "")
      );
      const iconUrl = pickIcon(hint.icons);
      if (iconUrl) {
        const img = document.createElement("img");
        img.src = iconUrl;
        img.alt = "";
        icon.appendChild(img);
      }
      stars.appendChild(
        buildStarCluster(hint.rating ?? 0, hint.num_ratings ?? 0)
      );
    }
    return { root, icon, title, byline, stars, meta, banner };
  }
  function paintHero(parts, info) {
    parts.title.textContent = info.name;
    parts.byline.textContent = sprintf(
      /* translators: %s: plugin author */
      __("by %s", "desktop-mode"),
      stripHtml$2(info.author ?? "")
    );
    parts.icon.replaceChildren();
    const iconUrl = pickIcon(info.icons);
    if (iconUrl) {
      const img = document.createElement("img");
      img.src = iconUrl;
      img.alt = "";
      parts.icon.appendChild(img);
    }
    parts.stars.replaceChildren(
      buildStarCluster(info.rating ?? 0, info.num_ratings ?? 0)
    );
    const bannerUrl = info.banners?.high ?? info.banners?.low;
    if (bannerUrl) {
      parts.banner.style.backgroundImage = `url("${bannerUrl}")`;
      parts.banner.classList.add("has-banner");
    }
    parts.meta.querySelectorAll(":scope > .desktop-mode-plugins__flyout-meta-row").forEach((n) => n.remove());
    const metaRow = document.createElement("div");
    metaRow.className = "desktop-mode-plugins__flyout-meta-row";
    const installs = document.createElement("span");
    installs.textContent = sprintf(
      /* translators: %s: comma-grouped active install count */
      __("%s+ active", "desktop-mode"),
      new Intl.NumberFormat().format(info.active_installs ?? 0)
    );
    const updated = document.createElement("span");
    updated.textContent = sprintf(
      /* translators: %s: human-readable date string from wp.org */
      __("Updated %s", "desktop-mode"),
      humanDate$1(info.last_updated)
    );
    const tested = document.createElement("span");
    tested.textContent = info.tested ? sprintf(
      /* translators: %s: maximum tested WordPress version */
      __("Tested up to WordPress %s", "desktop-mode"),
      info.tested
    ) : "";
    metaRow.append(installs, updated);
    if (tested.textContent) {
      metaRow.appendChild(tested);
    }
    parts.meta.appendChild(metaRow);
  }
  function buildTabs() {
    const root = document.createElement("wpd-tabs");
    root.className = "desktop-mode-plugins__flyout-tabs";
    root.setAttribute("value", "overview");
    const labels = [
      { value: "overview", label: __("Overview", "desktop-mode") },
      { value: "screenshots", label: __("Screenshots", "desktop-mode") },
      { value: "reviews", label: __("Reviews", "desktop-mode") },
      { value: "changelog", label: __("Changelog", "desktop-mode") },
      { value: "faq", label: __("FAQ", "desktop-mode") }
    ];
    for (const opt of labels) {
      const tab = document.createElement("wpd-tab");
      tab.setAttribute("value", opt.value);
      tab.textContent = opt.label;
      root.appendChild(tab);
    }
    let current = "overview";
    const subscribers = /* @__PURE__ */ new Set();
    root.addEventListener("wpd-tab-change", (ev) => {
      const detail = ev.detail;
      const value = detail?.value ?? "overview";
      current = value;
      for (const cb of subscribers) {
        cb(current);
      }
    });
    return {
      root,
      current: () => current,
      onChange: (cb) => subscribers.add(cb)
    };
  }
  function paintTabBody(body, tab, info, slug, reviewsCache2) {
    body.replaceChildren();
    if (!info) {
      body.appendChild(buildSkeletonLines(4));
      return;
    }
    if (tab === "overview") {
      body.appendChild(buildHtmlSection(info.sections?.description ?? info.short_description ?? ""));
      return;
    }
    if (tab === "screenshots") {
      body.appendChild(buildScreenshots(info.screenshots));
      return;
    }
    if (tab === "changelog") {
      body.appendChild(buildHtmlSection(info.sections?.changelog ?? ""));
      return;
    }
    if (tab === "faq") {
      body.appendChild(buildHtmlSection(info.sections?.faq ?? ""));
      return;
    }
    if (tab === "reviews") {
      body.appendChild(buildRatingsHistogram(info));
      const list = document.createElement("div");
      list.className = "desktop-mode-plugins__reviews-list";
      const loadingLine = document.createElement("p");
      loadingLine.className = "desktop-mode-plugins__reviews-loading";
      loadingLine.textContent = __("Loading recent reviews…", "desktop-mode");
      list.appendChild(loadingLine);
      body.appendChild(list);
      if (!reviewsCache2.loaded) {
        void (async () => {
          try {
            const resp = await fetchPluginReviews(slug);
            list.replaceChildren();
            if (!resp.parsed || resp.items.length === 0) {
              const fallback = document.createElement("p");
              fallback.className = "desktop-mode-plugins__reviews-fallback";
              fallback.innerHTML = sprintf(
                /* translators: %s: anchor tag with link to wp.org reviews */
                __(
                  "Recent reviews aren’t available right now. %s",
                  "desktop-mode"
                ),
                `<a href="https://wordpress.org/plugins/${encodeURIComponent(slug)}/#reviews" target="_blank" rel="noopener">${__(
                  "Read reviews on WordPress.org ↗",
                  "desktop-mode"
                )}</a>`
              );
              list.appendChild(fallback);
            } else {
              for (const item of resp.items) {
                list.appendChild(buildReviewCard$1(item));
              }
            }
            reviewsCache2.loaded = true;
          } catch {
            list.replaceChildren();
            const failure = document.createElement("p");
            failure.className = "desktop-mode-plugins__reviews-fallback";
            failure.textContent = __(
              "Could not load reviews.",
              "desktop-mode"
            );
            list.appendChild(failure);
          }
        })();
      }
    }
  }
  function buildHtmlSection(html2) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__html";
    if (!html2) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-plugins__empty-line";
      empty.textContent = __("No content available.", "desktop-mode");
      wrap.appendChild(empty);
      return wrap;
    }
    wrap.innerHTML = sanitizeHtml$1(html2);
    wrap.querySelectorAll("a").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener nofollow");
    });
    return wrap;
  }
  function buildScreenshots(shots) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__screenshots";
    const items = shots ? Object.values(shots) : [];
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-plugins__empty-line";
      empty.textContent = __(
        "This plugin doesn’t ship screenshots.",
        "desktop-mode"
      );
      wrap.appendChild(empty);
      return wrap;
    }
    for (const shot of items) {
      const fig = document.createElement("figure");
      fig.className = "desktop-mode-plugins__screenshot";
      const img = document.createElement("img");
      img.src = shot.src;
      img.loading = "lazy";
      img.alt = shot.caption ?? "";
      fig.appendChild(img);
      if (shot.caption) {
        const cap = document.createElement("figcaption");
        cap.innerHTML = sanitizeHtml$1(shot.caption);
        cap.querySelectorAll("a").forEach((a) => {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener nofollow");
        });
        fig.appendChild(cap);
      }
      wrap.appendChild(fig);
    }
    return wrap;
  }
  function buildRatingsHistogram(info) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__histogram";
    const ratings = info.ratings ?? {};
    const total = Object.values(ratings).reduce(
      (a, b) => a + (typeof b === "number" ? b : 0),
      0
    );
    if (total === 0) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-plugins__empty-line";
      empty.textContent = __("No ratings yet.", "desktop-mode");
      wrap.appendChild(empty);
      return wrap;
    }
    for (let star = 5; star >= 1; star--) {
      const count = ratings[String(star)] ?? 0;
      const ratio = count / total;
      const row = document.createElement("div");
      row.className = "desktop-mode-plugins__histogram-row";
      const label = document.createElement("span");
      label.className = "desktop-mode-plugins__histogram-label";
      label.textContent = sprintf(
        /* translators: %d: number of stars (1–5) */
        __("%d ★", "desktop-mode"),
        star
      );
      const track = document.createElement("span");
      track.className = "desktop-mode-plugins__histogram-track";
      const fill = document.createElement("span");
      fill.className = "desktop-mode-plugins__histogram-fill";
      fill.style.width = `${Math.round(ratio * 100)}%`;
      track.appendChild(fill);
      const num = document.createElement("span");
      num.className = "desktop-mode-plugins__histogram-count";
      num.textContent = new Intl.NumberFormat().format(count);
      row.append(label, track, num);
      wrap.appendChild(row);
    }
    return wrap;
  }
  function buildReviewCard$1(item) {
    const card = document.createElement("article");
    card.className = "desktop-mode-plugins__review";
    const head = document.createElement("header");
    head.className = "desktop-mode-plugins__review-head";
    const author = document.createElement("span");
    author.className = "desktop-mode-plugins__review-author";
    author.textContent = item.author || __("Anonymous", "desktop-mode");
    const star = buildStarCluster(item.stars / 5 * 100, 0);
    head.append(author, star);
    if (item.date) {
      const date = document.createElement("time");
      date.className = "desktop-mode-plugins__review-date";
      date.textContent = item.date;
      head.appendChild(date);
    }
    const body = document.createElement("p");
    body.className = "desktop-mode-plugins__review-excerpt";
    body.textContent = item.excerpt;
    card.append(head, body);
    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener nofollow";
      link.textContent = __("Read on WordPress.org ↗", "desktop-mode");
      link.className = "desktop-mode-plugins__review-link";
      card.appendChild(link);
    }
    return card;
  }
  function buildSkeletonLines(count) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__skeleton";
    for (let i = 0; i < count; i++) {
      const line = document.createElement("span");
      line.className = "desktop-mode-plugins__skeleton-line";
      line.style.width = `${60 + i * 10 % 40}%`;
      wrap.appendChild(line);
    }
    return wrap;
  }
  function paintFooter(footer, slug, info, callbacks, close) {
    footer.replaceChildren();
    const cfg = getConfig();
    const installed = callbacks.getInstalled(slug);
    const left = document.createElement("div");
    left.className = "desktop-mode-plugins__flyout-footer-left";
    const wpOrg = document.createElement("a");
    wpOrg.href = `https://wordpress.org/plugins/${encodeURIComponent(slug)}/`;
    wpOrg.target = "_blank";
    wpOrg.rel = "noopener";
    wpOrg.className = "desktop-mode-plugins__flyout-wporg";
    wpOrg.textContent = __("View on WordPress.org ↗", "desktop-mode");
    left.appendChild(wpOrg);
    const right = document.createElement("div");
    right.className = "desktop-mode-plugins__flyout-footer-right";
    if (installed) {
      if (cfg.caps.activate) {
        if (installed.status === "active" || installed.status === "active-network") {
          const btn = button(__("Deactivate", "desktop-mode"), "secondary");
          btn.addEventListener("click", () => {
            void doDeactivate();
          });
          right.appendChild(btn);
        } else {
          const btn = button(__("Activate", "desktop-mode"), "primary");
          btn.addEventListener("click", () => {
            void doActivate();
          });
          right.appendChild(btn);
        }
      }
      if (cfg.caps.delete && installed.status === "inactive") {
        const btn = button(__("Delete", "desktop-mode"), "danger");
        btn.addEventListener("click", () => {
          void doDelete();
        });
        right.appendChild(btn);
      }
    } else if (cfg.caps.install) {
      const btn = button(__("Install", "desktop-mode"), "primary");
      btn.addEventListener("click", () => {
        void doInstall(btn);
      });
      right.appendChild(btn);
    }
    footer.append(left, right);
    async function doInstall(btn) {
      const originalText = btn.textContent ?? "";
      btn.setAttribute("busy", "");
      btn.setAttribute("disabled", "");
      btn.textContent = __("Installing…", "desktop-mode");
      try {
        const result = await installPluginBySlug(slug);
        toast$3(
          sprintf(
            /* translators: %s: plugin name */
            __("Installed %s.", "desktop-mode"),
            info?.name ?? slug
          )
        );
        await callbacks.onPluginInstalled(result.plugin ?? "", slug);
        paintFooter(footer, slug, info, callbacks, close);
        void refreshFrameworkMenu();
      } catch (err) {
        btn.removeAttribute("busy");
        btn.removeAttribute("disabled");
        btn.textContent = originalText;
        toast$3(
          sprintf(
            /* translators: %s: error message */
            __("Install failed: %s", "desktop-mode"),
            describe$2(err)
          ),
          6e3
        );
      }
    }
    async function doActivate() {
      if (!installed) {
        return;
      }
      try {
        const updated = await activateInstalledPlugin(installed);
        callbacks.onPluginActivated(updated);
        toast$3(
          sprintf(
            /* translators: %s: plugin name */
            __("%s activated.", "desktop-mode"),
            updated.name || updated.plugin
          )
        );
        paintFooter(footer, slug, info, callbacks, close);
        void refreshFrameworkMenu();
      } catch (err) {
        toast$3(
          sprintf(
            /* translators: %s: error message */
            __("Activation failed: %s", "desktop-mode"),
            describe$2(err)
          ),
          6e3
        );
      }
    }
    async function doDeactivate() {
      if (!installed) {
        return;
      }
      try {
        const updated = await deactivateInstalledPlugin(installed);
        callbacks.onPluginDeactivated(updated);
        if (isDesktopModeSelf(updated.plugin)) {
          toast$3(
            __(
              "Desktop Mode deactivated. Reloading…",
              "desktop-mode"
            ),
            2e3
          );
          reloadOutOfDesktopMode();
          return;
        }
        toast$3(
          sprintf(
            /* translators: %s: plugin name */
            __("%s deactivated.", "desktop-mode"),
            updated.name || updated.plugin
          )
        );
        paintFooter(footer, slug, info, callbacks, close);
        void refreshFrameworkMenu();
      } catch (err) {
        toast$3(
          sprintf(
            /* translators: %s: error message */
            __("Deactivation failed: %s", "desktop-mode"),
            describe$2(err)
          ),
          6e3
        );
      }
    }
    async function doDelete() {
      if (!installed) {
        return;
      }
      const ok = await confirm$1({
        title: __("Delete plugin?", "desktop-mode"),
        message: sprintf(
          /* translators: %s: plugin name */
          __(
            "Permanently delete %s? Its files will be removed from disk. This cannot be undone.",
            "desktop-mode"
          ),
          installed.name || installed.plugin
        ),
        confirmLabel: __("Delete", "desktop-mode"),
        danger: true
      });
      if (!ok) {
        return;
      }
      try {
        await deleteInstalledPlugin(installed);
        callbacks.onPluginDeleted(installed);
        if (isDesktopModeSelf(installed.plugin)) {
          toast$3(
            __(
              "Desktop Mode deleted. Reloading…",
              "desktop-mode"
            ),
            2e3
          );
          reloadOutOfDesktopMode();
          return;
        }
        toast$3(
          sprintf(
            /* translators: %s: plugin name */
            __("%s deleted.", "desktop-mode"),
            installed.name || installed.plugin
          )
        );
        close();
        void refreshFrameworkMenu();
      } catch (err) {
        toast$3(
          sprintf(
            /* translators: %s: error message */
            __("Delete failed: %s", "desktop-mode"),
            describe$2(err)
          ),
          6e3
        );
      }
    }
  }
  function button(label, variant) {
    const b = document.createElement("wpd-button");
    b.setAttribute("variant", variant);
    b.textContent = label;
    return b;
  }
  function isSafeUrl(raw) {
    const cleaned = Array.from(raw).filter((ch) => ch.charCodeAt(0) > 32).join("").toLowerCase();
    const scheme = cleaned.match(/^([a-z][a-z0-9+.-]*):/);
    if (!scheme) {
      return true;
    }
    return ["http", "https", "mailto", "tel"].includes(scheme[1]);
  }
  function sanitizeHtml$1(html2) {
    const allowed = /* @__PURE__ */ new Set([
      "A",
      "ABBR",
      "B",
      "BLOCKQUOTE",
      "BR",
      "CODE",
      "DD",
      "DEL",
      "DIV",
      "DL",
      "DT",
      "EM",
      "FIGCAPTION",
      "FIGURE",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "HR",
      "I",
      "IMG",
      "KBD",
      "LI",
      "OL",
      "P",
      "PRE",
      "Q",
      "S",
      "SMALL",
      "SPAN",
      "STRONG",
      "SUB",
      "SUP",
      "TABLE",
      "TBODY",
      "TD",
      "TFOOT",
      "TH",
      "THEAD",
      "TR",
      "U",
      "UL"
    ]);
    const allowedAttrs = /* @__PURE__ */ new Set([
      "href",
      "src",
      "alt",
      "title",
      "name",
      "rel",
      "target",
      "colspan",
      "rowspan"
    ]);
    const wrap = document.createElement("div");
    wrap.innerHTML = html2;
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];
    let current = walker.currentNode;
    while (current) {
      const next = walker.nextNode();
      if (current === wrap) {
        current = next;
        continue;
      }
      if (!allowed.has(current.tagName)) {
        toRemove.push(current);
      } else {
        for (const attr of Array.from(current.attributes)) {
          if (!allowedAttrs.has(attr.name.toLowerCase())) {
            current.removeAttribute(attr.name);
          }
        }
        if (current.tagName === "A") {
          const href = current.getAttribute("href") ?? "";
          if (href && !isSafeUrl(href)) {
            current.removeAttribute("href");
          }
        }
        if (current.tagName === "IMG") {
          const src = current.getAttribute("src") ?? "";
          if (src && !isSafeUrl(src)) {
            current.removeAttribute("src");
          }
        }
      }
      current = next;
    }
    for (const el of toRemove) {
      const text = document.createTextNode(el.textContent ?? "");
      el.replaceWith(text);
    }
    return wrap.innerHTML;
  }
  function describe$2(err) {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
  function stripHtml$2(html2) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html2;
    return tmp.textContent ?? "";
  }
  function humanDate$1(raw) {
    if (!raw) {
      return "—";
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (m) {
      const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      try {
        return date.toLocaleDateString();
      } catch {
        return raw;
      }
    }
    return raw;
  }
  const CANARY_TAG = "wpd-confirm-dialog";
  let inflight = null;
  function isLoaded() {
    return typeof window.customElements !== "undefined" && !!window.customElements.get(CANARY_TAG);
  }
  function injectScript(scriptUrl) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-desktop-mode-shell-overlays="1"]'
      );
      const finish = () => {
        if (isLoaded()) {
          resolve();
          return;
        }
        reject(
          new Error(
            "[desktop-mode] shell-overlays bundle loaded but did not register the overlay components."
          )
        );
      };
      if (existing) {
        if (isLoaded()) {
          finish();
        } else {
          existing.addEventListener("load", finish);
          existing.addEventListener(
            "error",
            () => reject(new Error("failed to load shell-overlays bundle"))
          );
        }
        return;
      }
      const s = document.createElement("script");
      s.src = scriptUrl;
      s.async = true;
      s.dataset.desktopModeShellOverlays = "1";
      s.addEventListener("load", finish);
      s.addEventListener(
        "error",
        () => reject(new Error("failed to load shell-overlays bundle"))
      );
      document.head.appendChild(s);
    });
  }
  function ensureShellOverlaysLoaded(scriptUrl) {
    if (isLoaded()) {
      return Promise.resolve();
    }
    if (!scriptUrl) {
      return Promise.resolve();
    }
    if (!inflight) {
      inflight = injectScript(scriptUrl);
    }
    return inflight;
  }
  function shellOverlaysBundleUrl() {
    const cfg = window.desktopModeConfig;
    return cfg?.shellOverlaysBundleUrl ?? "";
  }
  function openWithShellOverlays(isStillCurrent, fn) {
    const url = shellOverlaysBundleUrl();
    if (isLoaded() || !url) {
      fn();
      return;
    }
    void ensureShellOverlaysLoaded(url).then(() => {
      if (!isStillCurrent()) {
        return;
      }
      fn();
    }).catch((err) => {
      if (typeof console !== "undefined") {
        console.warn(
          "[desktop-mode] shell-overlays failed to load; menu/dialog suppressed:",
          err
        );
      }
    });
  }
  async function wpdConfirm(options) {
    await ensureShellOverlaysLoaded(shellOverlaysBundleUrl());
    return new Promise((resolve) => {
      const dialog = document.createElement("wpd-confirm-dialog");
      dialog.setAttribute("open", "");
      if (options.title) {
        dialog.setAttribute("title", options.title);
      }
      dialog.setAttribute("message", options.message);
      if (options.confirmLabel) {
        dialog.setAttribute("confirm-label", options.confirmLabel);
      }
      if (options.cancelLabel) {
        dialog.setAttribute("cancel-label", options.cancelLabel);
      }
      {
        dialog.setAttribute("danger", "");
      }
      if (options.hideCancel) {
        dialog.setAttribute("hide-cancel", "");
      }
      if (options.dismissable) {
        dialog.setAttribute("dismissable", "");
      }
      const cleanup = (ok) => {
        dialog.remove();
        resolve(ok);
      };
      dialog.addEventListener("wpd-confirm", () => cleanup(true));
      dialog.addEventListener("wpd-cancel", () => cleanup(false));
      document.body.appendChild(dialog);
      const inner = dialog.shadowRoot?.querySelector(".dialog");
      (inner ?? dialog).focus?.();
    });
  }
  const DEFAULT_DURATION_MS = 4e3;
  const FADE_OUT_MS = 200;
  function showToast(options) {
    const intent = activity.filter(
      "desktop-mode/toast-requested",
      { ...options }
    );
    if (!intent || intent.cancel === true) {
      return () => void 0;
    }
    let dismissRequested = false;
    let realDismiss = null;
    openWithShellOverlays(
      () => !dismissRequested,
      () => {
        realDismiss = renderToast(intent);
      }
    );
    return () => {
      dismissRequested = true;
      if (realDismiss) {
        realDismiss();
      }
    };
  }
  function renderToast(intent) {
    const container = ensureContainer();
    const toast2 = document.createElement("wpd-toast");
    toast2.textContent = intent.message;
    if (intent.action) {
      toast2.setAttribute("action", intent.action.label);
      toast2.addEventListener("wpd-toast-action", () => {
        intent.action?.onClick();
        dismiss();
      });
    }
    container.appendChild(toast2);
    let dismissed = false;
    let dismissTimer = null;
    const dismiss = () => {
      if (dismissed) {
        return;
      }
      dismissed = true;
      if (dismissTimer !== null) {
        window.clearTimeout(dismissTimer);
        dismissTimer = null;
      }
      toast2.setAttribute("state", "out");
      window.setTimeout(() => {
        toast2.remove();
      }, FADE_OUT_MS);
    };
    requestAnimationFrame(() => {
      toast2.setAttribute("state", "in");
    });
    dismissTimer = window.setTimeout(
      dismiss,
      intent.duration ?? DEFAULT_DURATION_MS
    );
    activity.publish("desktop-mode/toast-shown", { ...intent });
    return dismiss;
  }
  function ensureContainer() {
    const existing = document.querySelector(
      "wpd-toast-container"
    );
    if (existing) {
      return existing;
    }
    const el = document.createElement("wpd-toast-container");
    document.body.appendChild(el);
    return el;
  }
  const PLUGINS_CHANGED_TOPIC$3 = "desktop-mode.plugin.changed";
  const PLUGINS_CHANGED_SOURCE = "upload-dialog";
  function openUploadDialog(host, prefilled, callbacks = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "desktop-mode-plugins__upload-overlay";
      const card = document.createElement("div");
      card.className = "desktop-mode-plugins__upload-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      card.setAttribute(
        "aria-label",
        __("Upload a plugin .zip", "desktop-mode")
      );
      const heading = document.createElement("h2");
      heading.className = "desktop-mode-plugins__upload-heading";
      heading.textContent = __("Upload a plugin", "desktop-mode");
      const lede = document.createElement("p");
      lede.className = "desktop-mode-plugins__upload-lede";
      lede.textContent = __(
        "Pick a .zip file from your computer, or drop one onto the area below.",
        "desktop-mode"
      );
      const dropZone = document.createElement("div");
      dropZone.className = "desktop-mode-plugins__upload-dropzone";
      dropZone.tabIndex = 0;
      dropZone.setAttribute("role", "button");
      dropZone.setAttribute(
        "aria-label",
        __(
          "Drop a .zip plugin file here, or click to choose a file.",
          "desktop-mode"
        )
      );
      const dropIcon = document.createElement("span");
      dropIcon.className = "dashicons dashicons-upload desktop-mode-plugins__upload-icon";
      dropIcon.setAttribute("aria-hidden", "true");
      const dropHint = document.createElement("p");
      dropHint.className = "desktop-mode-plugins__upload-hint";
      dropHint.textContent = __(
        "Drop your .zip here or click to browse",
        "desktop-mode"
      );
      const fileLabel = document.createElement("p");
      fileLabel.className = "desktop-mode-plugins__upload-filename";
      fileLabel.hidden = true;
      dropZone.append(dropIcon, dropHint, fileLabel);
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip,application/zip,application/x-zip-compressed";
      input.style.display = "none";
      dropZone.appendChild(input);
      const status = document.createElement("p");
      status.className = "desktop-mode-plugins__upload-status";
      status.hidden = true;
      const actions = document.createElement("div");
      actions.className = "desktop-mode-plugins__upload-actions";
      const cancelBtn = document.createElement("wpd-button");
      cancelBtn.setAttribute("variant", "ghost");
      cancelBtn.textContent = __("Cancel", "desktop-mode");
      const submitBtn = document.createElement("wpd-button");
      submitBtn.setAttribute("variant", "primary");
      submitBtn.textContent = __("Install", "desktop-mode");
      submitBtn.setAttribute("disabled", "");
      actions.append(cancelBtn, submitBtn);
      card.append(heading, lede, dropZone, status, actions);
      overlay.appendChild(card);
      host.appendChild(overlay);
      const swallowDrag = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      overlay.addEventListener("dragenter", swallowDrag);
      overlay.addEventListener("dragover", swallowDrag);
      overlay.addEventListener("drop", swallowDrag);
      let pickedFile = null;
      let uploading = false;
      const setFile = (file) => {
        pickedFile = file;
        if (file) {
          dropZone.classList.add("has-file");
          fileLabel.hidden = false;
          fileLabel.textContent = sprintf(
            /* translators: 1: file name, 2: file size in KB */
            __("%1$s · %2$s KB", "desktop-mode"),
            file.name,
            Math.round(file.size / 1024).toString()
          );
          submitBtn.removeAttribute("disabled");
        } else {
          dropZone.classList.remove("has-file");
          fileLabel.hidden = true;
          submitBtn.setAttribute("disabled", "");
        }
      };
      dropZone.addEventListener("click", (ev) => {
        if (ev.target?.tagName === "INPUT") {
          return;
        }
        input.click();
      });
      dropZone.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          input.click();
        }
      });
      dropZone.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        dropZone.classList.add("is-hovered");
      });
      dropZone.addEventListener("dragleave", (ev) => {
        ev.stopPropagation();
        dropZone.classList.remove("is-hovered");
      });
      dropZone.addEventListener("drop", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        dropZone.classList.remove("is-hovered");
        const file = ev.dataTransfer?.files?.[0];
        if (file && isZip(file)) {
          setFile(file);
        } else if (file) {
          showStatus(
            __("Only .zip files are accepted.", "desktop-mode"),
            "error"
          );
        }
      });
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file && isZip(file)) {
          setFile(file);
        }
      });
      const close = (result) => {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        resolve(result);
      };
      const onKey = (ev) => {
        if (ev.key === "Escape" && !uploading) {
          close(null);
        }
      };
      document.addEventListener("keydown", onKey);
      cancelBtn.addEventListener("click", () => {
        if (uploading) {
          return;
        }
        close(null);
      });
      submitBtn.addEventListener("click", () => {
        if (!pickedFile || uploading) {
          return;
        }
        void runUpload();
      });
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay && !uploading) {
          close(null);
        }
      });
      if (prefilled && isZip(prefilled)) {
        setFile(prefilled);
      }
      async function runUpload(overwrite = false) {
        if (!pickedFile) {
          return;
        }
        uploading = true;
        submitBtn.setAttribute("busy", "");
        submitBtn.setAttribute("disabled", "");
        cancelBtn.setAttribute("disabled", "");
        showStatus(
          overwrite ? __("Replacing existing plugin…", "desktop-mode") : __("Uploading and installing…", "desktop-mode"),
          "info"
        );
        try {
          const result = await uploadPluginZip(pickedFile, { overwrite });
          if (callbacks.onUploaded) {
            callbacks.onUploaded(result);
          }
          broadcast(PLUGINS_CHANGED_TOPIC$3, {
            source: PLUGINS_CHANGED_SOURCE,
            plugin: result.plugin_file,
            action: "install"
          });
          void refreshFrameworkMenu();
          showSuccessPanel(result);
        } catch (err) {
          const errStatus = err.status;
          const errCode = err.code;
          if (!overwrite && (errStatus === 409 || errCode === "folder_exists")) {
            uploading = false;
            submitBtn.removeAttribute("busy");
            submitBtn.removeAttribute("disabled");
            cancelBtn.removeAttribute("disabled");
            showStatus(
              __(
                "A plugin with the same folder name is already installed.",
                "desktop-mode"
              ),
              "info"
            );
            const ok = await wpdConfirm({
              title: __("Replace existing plugin?", "desktop-mode"),
              message: __(
                "A plugin with the same folder name is already installed. Replacing it overwrites the installed files. Any local edits to the plugin will be lost. The plugin will keep its activation state.",
                "desktop-mode"
              ),
              confirmLabel: __("Replace", "desktop-mode"),
              cancelLabel: __("Cancel", "desktop-mode")
            });
            if (ok) {
              await runUpload(true);
            }
            return;
          }
          uploading = false;
          submitBtn.removeAttribute("busy");
          submitBtn.removeAttribute("disabled");
          cancelBtn.removeAttribute("disabled");
          const message = err instanceof Error ? err.message : String(err);
          showStatus(
            sprintf(
              /* translators: %s: error message from the upload handler */
              __("Upload failed: %s", "desktop-mode"),
              message
            ),
            "error"
          );
        }
      }
      function showSuccessPanel(result) {
        uploading = false;
        dropZone.remove();
        input.remove();
        actions.remove();
        status.hidden = true;
        const successHeading = document.createElement("h3");
        successHeading.className = "desktop-mode-plugins__upload-success-heading";
        successHeading.textContent = __(
          "Plugin installed successfully.",
          "desktop-mode"
        );
        const detail = document.createElement("p");
        detail.className = "desktop-mode-plugins__upload-success-detail";
        const name = result.plugin_name || result.plugin_file;
        detail.textContent = result.plugin_version ? sprintf(
          /* translators: 1: plugin name 2: plugin version */
          __("%1$s %2$s", "desktop-mode"),
          name,
          result.plugin_version
        ) : name;
        const successActions = document.createElement("div");
        successActions.className = "desktop-mode-plugins__upload-actions";
        const closeBtn = document.createElement("wpd-button");
        closeBtn.setAttribute("variant", "ghost");
        closeBtn.textContent = __("Close", "desktop-mode");
        const activateBtn = document.createElement("wpd-button");
        activateBtn.setAttribute("variant", "primary");
        activateBtn.textContent = __("Activate Plugin", "desktop-mode");
        successActions.append(closeBtn, activateBtn);
        card.append(successHeading, detail, successActions);
        closeBtn.addEventListener("click", () => {
          if (uploading) {
            return;
          }
          close(result);
        });
        activateBtn.addEventListener("click", () => {
          if (uploading) {
            return;
          }
          void runActivate();
        });
        async function runActivate() {
          uploading = true;
          activateBtn.setAttribute("busy", "");
          activateBtn.setAttribute("disabled", "");
          closeBtn.setAttribute("disabled", "");
          try {
            const pluginFile = result.plugin_file.endsWith(".php") ? result.plugin_file.slice(0, -4) : result.plugin_file;
            const updated = await activateInstalledPlugin({
              plugin: pluginFile,
              status: "inactive"
            });
            if (callbacks.onActivated) {
              callbacks.onActivated(result.plugin_file);
            }
            void refreshFrameworkMenu();
            broadcast(PLUGINS_CHANGED_TOPIC$3, {
              source: PLUGINS_CHANGED_SOURCE,
              plugin: updated.plugin,
              action: "activate"
            });
            showToast({
              message: sprintf(
                /* translators: %s: plugin name */
                __("%s activated.", "desktop-mode"),
                name
              )
            });
            uploading = false;
            successHeading.textContent = __(
              "Plugin activated.",
              "desktop-mode"
            );
            activateBtn.remove();
            closeBtn.removeAttribute("disabled");
            closeBtn.setAttribute("variant", "primary");
            closeBtn.textContent = __("Done", "desktop-mode");
            closeBtn.focus?.();
          } catch (err) {
            uploading = false;
            activateBtn.removeAttribute("busy");
            activateBtn.removeAttribute("disabled");
            closeBtn.removeAttribute("disabled");
            const message = err instanceof Error ? err.message : String(err);
            status.hidden = false;
            status.dataset.tone = "error";
            status.textContent = sprintf(
              /* translators: %s: error message from the activate handler */
              __("Activate failed: %s", "desktop-mode"),
              message
            );
            card.appendChild(status);
          }
        }
        window.setTimeout(() => activateBtn.focus?.(), 16);
      }
      function showStatus(message, tone) {
        status.hidden = false;
        status.dataset.tone = tone;
        status.textContent = message;
      }
      window.setTimeout(() => dropZone.focus(), 16);
    });
  }
  function isZip(file) {
    if (file.size <= 0) {
      return false;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith(".zip")) {
      return true;
    }
    return file.type === "application/zip" || file.type === "application/x-zip-compressed";
  }
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
  const PLUGINS_CHANGED_TOPIC$2 = "desktop-mode.plugin.changed";
  const SOURCE$2 = "browse-view";
  function toast$2(message, duration = 3500) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.showToast === "function") {
      api2.showToast({ message, duration });
      return;
    }
    console.log("[plugins-window]", message);
  }
  function mountBrowseView(host, flyoutEl, bodyEl) {
    host.replaceChildren();
    const state = {
      filter: "featured",
      search: "",
      page: 1,
      totalPages: 0,
      loading: false,
      exhausted: false,
      plugins: [],
      installed: /* @__PURE__ */ new Map(),
      cardsBySlug: /* @__PURE__ */ new Map()
    };
    const toolbar = document.createElement("header");
    toolbar.className = "desktop-mode-plugins__toolbar";
    const left = document.createElement("div");
    left.className = "desktop-mode-plugins__toolbar-left";
    const segmented = document.createElement("wpd-segmented");
    segmented.setAttribute("value", "featured");
    const filters = [
      { value: "featured", label: __("Featured", "desktop-mode") },
      { value: "popular", label: __("Popular", "desktop-mode") },
      { value: "recommended", label: __("Recommended", "desktop-mode") },
      { value: "favorites", label: __("Favorites", "desktop-mode") },
      { value: "new", label: __("New", "desktop-mode") },
      { value: "beta", label: __("Beta", "desktop-mode") }
    ];
    for (const opt of filters) {
      const seg = document.createElement("wpd-segment");
      seg.setAttribute("value", opt.value);
      seg.textContent = opt.label;
      segmented.appendChild(seg);
    }
    segmented.addEventListener("wpd-pick", (ev) => {
      const next = ev.detail?.value ?? "featured";
      state.filter = next;
      void resetAndLoad();
    });
    const search = document.createElement("wpd-text-field");
    search.setAttribute("placeholder", __("Search WordPress.org…", "desktop-mode"));
    let searchDebounce;
    search.addEventListener("wpd-input-change", (ev) => {
      const value = ev.detail?.value ?? "";
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        state.search = value;
        void resetAndLoad();
      }, 250);
    });
    left.append(segmented, search);
    const right = document.createElement("div");
    right.className = "desktop-mode-plugins__toolbar-trailing";
    const cfg = getConfig();
    if (cfg.caps.upload) {
      const upload = document.createElement("wpd-button");
      upload.setAttribute("variant", "secondary");
      upload.innerHTML = '<span class="dashicons dashicons-upload" aria-hidden="true"></span> ' + __("Upload Plugin", "desktop-mode");
      upload.addEventListener("click", () => {
        void openUploadDialog(bodyEl, null, {
          onUploaded: () => void refreshInstalled()
        });
      });
      right.appendChild(upload);
    }
    const refreshButton = document.createElement("wpd-button");
    refreshButton.setAttribute("variant", "ghost");
    refreshButton.setAttribute("title", __("Refresh", "desktop-mode"));
    refreshButton.innerHTML = '<span class="dashicons dashicons-update" aria-hidden="true"></span>';
    refreshButton.addEventListener("click", () => {
      void refreshInstalled();
      void resetAndLoad();
    });
    right.appendChild(refreshButton);
    toolbar.append(left, right);
    const gallery = document.createElement("div");
    gallery.className = "desktop-mode-plugins__gallery";
    const sentinel = document.createElement("div");
    sentinel.className = "desktop-mode-plugins__gallery-sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    const status = document.createElement("p");
    status.className = "desktop-mode-plugins__gallery-status";
    status.hidden = true;
    host.append(toolbar, gallery, status);
    const dropOverlay = document.createElement("div");
    dropOverlay.className = "desktop-mode-plugins__window-drop";
    dropOverlay.setAttribute("aria-hidden", "true");
    const dropMsg = document.createElement("p");
    dropMsg.textContent = __(
      "Drop the .zip to install.",
      "desktop-mode"
    );
    dropOverlay.appendChild(dropMsg);
    bodyEl.appendChild(dropOverlay);
    let dragDepth = 0;
    const isZipDrag = (ev) => Boolean(
      ev.dataTransfer?.types.includes("Files")
    );
    const onDragEnter = (ev) => {
      if (!cfg.caps.upload) {
        return;
      }
      if (!isZipDrag(ev)) {
        return;
      }
      dragDepth++;
      bodyEl.classList.add("has-zip-dragover");
    };
    const onDragLeave = (ev) => {
      if (!cfg.caps.upload || !isZipDrag(ev)) {
        return;
      }
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        bodyEl.classList.remove("has-zip-dragover");
      }
    };
    const onDragOver = (ev) => {
      if (cfg.caps.upload && isZipDrag(ev)) {
        ev.preventDefault();
      }
    };
    const onDrop = (ev) => {
      if (!cfg.caps.upload) {
        return;
      }
      const file = ev.dataTransfer?.files?.[0];
      dragDepth = 0;
      bodyEl.classList.remove("has-zip-dragover");
      if (!file) {
        return;
      }
      ev.preventDefault();
      void openUploadDialog(bodyEl, file, {
        onUploaded: () => void refreshInstalled()
      });
    };
    bodyEl.addEventListener("dragenter", onDragEnter);
    bodyEl.addEventListener("dragleave", onDragLeave);
    bodyEl.addEventListener("dragover", onDragOver);
    bodyEl.addEventListener("drop", onDrop);
    const teardownDropTargets = installPluginDropTargets();
    const cardCallbacks = {
      onOpen: (slug, hint) => {
        if (!flyoutEl) {
          return;
        }
        openDetailFlyout(flyoutEl, slug, hint, {
          getInstalled: (s) => state.installed.get(s),
          onPluginInstalled: async (pluginFile, slug2) => {
            await refreshInstalled();
            const card = state.cardsBySlug.get(slug2);
            const plugin = state.plugins.find((p) => p.slug === slug2);
            if (card && plugin) {
              repaintCardCta(card, plugin, state.installed, cardCallbacks);
            }
            broadcast(PLUGINS_CHANGED_TOPIC$2, {
              source: SOURCE$2,
              plugin: pluginFile ?? slug2,
              action: "install"
            });
            if (pluginFile) {
              console.log("[plugins-window] installed", pluginFile);
            }
          },
          onPluginActivated: (updated) => {
            state.installed.set(indexKeyFor$1(updated), updated);
            const card = state.cardsBySlug.get(updated.textdomain ?? "");
            const plugin = state.plugins.find(
              (p) => p.slug === (updated.textdomain ?? "")
            );
            if (card && plugin) {
              repaintCardCta(card, plugin, state.installed, cardCallbacks);
            }
            broadcast(PLUGINS_CHANGED_TOPIC$2, {
              source: SOURCE$2,
              plugin: updated.plugin,
              action: "activate"
            });
          },
          onPluginDeactivated: (updated) => {
            state.installed.set(indexKeyFor$1(updated), updated);
            const card = state.cardsBySlug.get(updated.textdomain ?? "");
            const plugin = state.plugins.find(
              (p) => p.slug === (updated.textdomain ?? "")
            );
            if (card && plugin) {
              repaintCardCta(card, plugin, state.installed, cardCallbacks);
            }
            broadcast(PLUGINS_CHANGED_TOPIC$2, {
              source: SOURCE$2,
              plugin: updated.plugin,
              action: "deactivate"
            });
          },
          onPluginDeleted: (deleted) => {
            const key = indexKeyFor$1(deleted);
            state.installed.delete(key);
            const card = state.cardsBySlug.get(deleted.textdomain ?? "");
            const plugin = state.plugins.find(
              (p) => p.slug === (deleted.textdomain ?? "")
            );
            if (card && plugin) {
              repaintCardCta(card, plugin, state.installed, cardCallbacks);
            }
            broadcast(PLUGINS_CHANGED_TOPIC$2, {
              source: SOURCE$2,
              plugin: deleted.plugin,
              action: "delete"
            });
          }
        });
      },
      onInstall: async (plugin, card) => {
        const cta = card.querySelector("[data-plugin-card-cta]");
        const ctaOriginalText = cta?.textContent ?? "";
        cta?.setAttribute("busy", "");
        cta?.setAttribute("disabled", "");
        if (cta) {
          cta.textContent = __("Installing…", "desktop-mode");
        }
        try {
          await installPluginBySlug(plugin.slug);
          await refreshInstalled();
          toast$2(
            sprintf(
              /* translators: %s: plugin name */
              __("Installed %s.", "desktop-mode"),
              plugin.name
            )
          );
          repaintCardCta(card, plugin, state.installed, cardCallbacks);
          broadcast(PLUGINS_CHANGED_TOPIC$2, {
            source: SOURCE$2,
            plugin: plugin.slug,
            action: "install"
          });
          void refreshFrameworkMenu();
        } catch (err) {
          cta?.removeAttribute("busy");
          cta?.removeAttribute("disabled");
          if (cta) {
            cta.textContent = ctaOriginalText;
          }
          toast$2(
            sprintf(
              /* translators: %s: error message */
              __("Install failed: %s", "desktop-mode"),
              describe$1(err)
            ),
            6e3
          );
        }
      },
      onActivate: async (installed, card) => {
        const cta = card.querySelector("[data-plugin-card-cta]");
        const ctaOriginalText = cta?.textContent ?? "";
        cta?.setAttribute("busy", "");
        cta?.setAttribute("disabled", "");
        if (cta) {
          cta.textContent = __("Activating…", "desktop-mode");
        }
        try {
          const updated = await activateInstalledPlugin(installed);
          state.installed.set(indexKeyFor$1(updated), updated);
          toast$2(
            sprintf(
              /* translators: %s: plugin name */
              __("%s activated.", "desktop-mode"),
              updated.name || updated.plugin
            )
          );
          const plugin = state.plugins.find(
            (p) => p.slug === (updated.textdomain ?? "")
          );
          if (plugin) {
            repaintCardCta(card, plugin, state.installed, cardCallbacks);
          }
          broadcast(PLUGINS_CHANGED_TOPIC$2, {
            source: SOURCE$2,
            plugin: updated.plugin,
            action: "activate"
          });
          void refreshFrameworkMenu();
        } catch (err) {
          cta?.removeAttribute("busy");
          cta?.removeAttribute("disabled");
          if (cta) {
            cta.textContent = ctaOriginalText;
          }
          toast$2(
            sprintf(
              /* translators: %s: error message */
              __("Activation failed: %s", "desktop-mode"),
              describe$1(err)
            ),
            6e3
          );
        }
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMore();
          }
        }
      },
      { root: gallery, rootMargin: "240px", threshold: 0 }
    );
    observer.observe(sentinel);
    void refreshInstalled();
    void resetAndLoad();
    async function refreshInstalled() {
      try {
        const rows = await fetchInstalledPlugins();
        state.installed = new Map(
          rows.map((r) => [indexKeyFor$1(r), r])
        );
        for (const [slug, card] of state.cardsBySlug) {
          const plugin = state.plugins.find((p) => p.slug === slug);
          if (plugin) {
            repaintCardCta(card, plugin, state.installed, cardCallbacks);
          }
        }
      } catch {
      }
    }
    async function resetAndLoad() {
      state.page = 1;
      state.totalPages = 0;
      state.exhausted = false;
      state.plugins = [];
      state.cardsBySlug.clear();
      gallery.replaceChildren();
      for (let i = 0; i < 6; i++) {
        gallery.appendChild(buildSkeletonCard$1());
      }
      gallery.appendChild(sentinel);
      await loadMore();
    }
    const inflightSkeletons = [];
    function showInflightLoader() {
      if (inflightSkeletons.length > 0) {
        return;
      }
      for (let i = 0; i < 4; i++) {
        const skel = buildSkeletonCard$1();
        gallery.insertBefore(skel, sentinel);
        inflightSkeletons.push(skel);
      }
    }
    function clearInflightLoader() {
      for (const skel of inflightSkeletons) {
        skel.remove();
      }
      inflightSkeletons.length = 0;
    }
    async function loadMore() {
      if (state.loading || state.exhausted) {
        return;
      }
      state.loading = true;
      if (state.page > 1) {
        showInflightLoader();
      }
      try {
        const data = await browsePlugins({
          browse: state.search === "" ? state.filter : void 0,
          search: state.search === "" ? void 0 : state.search,
          page: state.page,
          perPage: 24
        });
        if (state.page === 1) {
          gallery.replaceChildren();
          gallery.appendChild(sentinel);
        }
        const info = data.info ?? {};
        if (typeof info.pages === "number" && info.pages > 0) {
          state.totalPages = info.pages;
        }
        const incoming = data.plugins ?? [];
        if (incoming.length === 0) {
          state.exhausted = true;
          if (state.page === 1) {
            showStatus(__("No plugins matched.", "desktop-mode"));
          }
          return;
        }
        for (const plugin of incoming) {
          if (!plugin?.slug) {
            continue;
          }
          if (state.cardsBySlug.has(plugin.slug)) {
            continue;
          }
          const card = buildCard(plugin, state.installed, cardCallbacks);
          makeCardDraggable(card, plugin);
          gallery.insertBefore(card, sentinel);
          state.cardsBySlug.set(plugin.slug, card);
          state.plugins.push(plugin);
        }
        state.page++;
        if (state.totalPages > 0 && state.page > state.totalPages) {
          state.exhausted = true;
        } else if (state.totalPages === 0 && incoming.length < 24) {
          state.exhausted = true;
        }
        hideStatus();
      } catch (err) {
        showStatus(
          sprintf(
            /* translators: %s: error message */
            __("Could not load plugins: %s", "desktop-mode"),
            describe$1(err)
          )
        );
      } finally {
        clearInflightLoader();
        state.loading = false;
      }
    }
    function showStatus(message) {
      status.hidden = false;
      status.textContent = message;
    }
    function hideStatus() {
      status.hidden = true;
      status.textContent = "";
    }
    const unsubscribePluginsChanged = subscribe(
      PLUGINS_CHANGED_TOPIC$2,
      (payload) => {
        if (payload?.source === SOURCE$2) {
          return;
        }
        void refreshInstalled();
      }
    );
    return () => {
      unsubscribePluginsChanged();
      observer.disconnect();
      bodyEl.removeEventListener("dragenter", onDragEnter);
      bodyEl.removeEventListener("dragleave", onDragLeave);
      bodyEl.removeEventListener("dragover", onDragOver);
      bodyEl.removeEventListener("drop", onDrop);
      dropOverlay.remove();
      teardownDropTargets();
      host.replaceChildren();
    };
  }
  function buildSkeletonCard$1() {
    const card = document.createElement("wpd-card");
    card.classList.add(
      "desktop-mode-plugins__card",
      "desktop-mode-plugins__card--skeleton"
    );
    card.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) {
      const line = document.createElement("span");
      line.className = "desktop-mode-plugins__skeleton-line";
      line.style.width = `${50 + i * 17 % 50}%`;
      card.appendChild(line);
    }
    return card;
  }
  function indexKeyFor$1(plugin) {
    return plugin.textdomain || plugin.plugin;
  }
  function describe$1(err) {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
  const styles$8 = css`:host{position:absolute;width:var( --wpd-ribbon-size,90px );height:var( --wpd-ribbon-size,90px );overflow:hidden;pointer-events:none;z-index:var( --wpd-ribbon-z,2 )}:host( [ hidden ] ){display:none}.banner{position:absolute;display:block;width:var( --wpd-ribbon-banner-width,140px );padding:var( --wpd-ribbon-padding,4px 0 );text-align:center;font:var( --wpd-ribbon-font,700 10px/1.4 var( --desktop-mode-font,system-ui ) );letter-spacing:var( --wpd-ribbon-tracking,0.06em );text-transform:uppercase;color:var( --wpd-ribbon-fg,#fff );background:var( --wpd-ribbon-bg,var( --wp-admin-theme-color,#2271b1 ) );box-shadow:var( --wpd-ribbon-shadow,0 2px 4px rgba( 0,0,0,0.2 ) )}:host(:not( [ placement ] ) ),:host( [ placement='top-end' ] ){inset-block-start:0;inset-inline-end:0}:host(:not( [ placement ] ) ) .banner,:host( [ placement='top-end' ] ) .banner{inset-block-start:var( --wpd-ribbon-banner-offset,20px );inset-inline-end:var( --wpd-ribbon-banner-pull,-36px );transform:rotate( 45deg )}:host( [ placement='top-start' ] ){inset-block-start:0;inset-inline-start:0}:host( [ placement='top-start' ] ) .banner{inset-block-start:var( --wpd-ribbon-banner-offset,20px );inset-inline-start:var( --wpd-ribbon-banner-pull,-36px );transform:rotate( -45deg )}:host( [ placement='bottom-end' ] ){inset-block-end:0;inset-inline-end:0}:host( [ placement='bottom-end' ] ) .banner{inset-block-end:var( --wpd-ribbon-banner-offset,20px );inset-inline-end:var( --wpd-ribbon-banner-pull,-36px );transform:rotate( -45deg )}:host( [ placement='bottom-start' ] ){inset-block-end:0;inset-inline-start:0}:host( [ placement='bottom-start' ] ) .banner{inset-block-end:var( --wpd-ribbon-banner-offset,20px );inset-inline-start:var( --wpd-ribbon-banner-pull,-36px );transform:rotate( 45deg )}:host-context( [ dir='rtl' ] ):host(:not( [ placement ] ) ) .banner,:host-context( [ dir='rtl' ] ):host( [ placement='top-end' ] ) .banner{transform:rotate( -45deg )}:host-context( [ dir='rtl' ] ):host( [ placement='top-start' ] ) .banner{transform:rotate( 45deg )}:host-context( [ dir='rtl' ] ):host( [ placement='bottom-end' ] ) .banner{transform:rotate( 45deg )}:host-context( [ dir='rtl' ] ):host( [ placement='bottom-start' ] ) .banner{transform:rotate( -45deg )}:host( [ tone='success' ] ) .banner{background:var( --wpd-ribbon-success,#1a7f37 )}:host( [ tone='warning' ] ) .banner{background:var( --wpd-ribbon-warning,#9a6700 )}:host( [ tone='danger' ] ) .banner{background:var( --wpd-ribbon-danger,#cf222e )}:host( [ tone='info' ] ) .banner{background:var( --wpd-ribbon-info,#0969da )}:host( [ tone='neutral' ] ) .banner{background:var( --wpd-ribbon-neutral,#57606a )}`;
  const _WpdRibbon = class _WpdRibbon extends Component {
    render() {
      return html`<span class="banner" part="banner"><slot></slot></span>`;
    }
  };
  _WpdRibbon.props = ["placement", "tone"];
  _WpdRibbon.styles = [styles$8];
  _WpdRibbon.help = {
    title: "Ribbon",
    summary: "45° corner ribbon. Wraps the top-end (default), top-start, bottom-end, or bottom-start corner of its positioned parent. The host owns clipping + rotation; consumers only set position-relative on the parent and drop a label inside.",
    status: "experimental",
    since: "0.8.6",
    props: [
      {
        name: "placement",
        type: '"top-end" | "top-start" | "bottom-end" | "bottom-start"',
        description: "Which corner of the parent the ribbon hugs. Defaults to `top-end` (logical right in LTR, left in RTL)."
      },
      {
        name: "tone",
        type: '"primary" | "success" | "warning" | "danger" | "info" | "neutral"',
        description: "Background color tone. Defaults to `primary` (the admin theme accent)."
      }
    ],
    slots: [{ name: "(default)", description: "Ribbon label text. Keep short." }],
    cssProps: [
      { name: "--wpd-ribbon-size", default: "90px", description: "Square clipping window edge." },
      { name: "--wpd-ribbon-banner-width", default: "140px", description: "Width of the rotated strip." },
      { name: "--wpd-ribbon-banner-offset", default: "20px", description: "Distance from corner to strip center." },
      { name: "--wpd-ribbon-banner-pull", default: "-36px", description: "How far the strip overhangs the clip edge." },
      { name: "--wpd-ribbon-bg", default: "var(--wp-admin-theme-color, #2271b1)" },
      { name: "--wpd-ribbon-fg", default: "#fff" },
      { name: "--wpd-ribbon-shadow", default: "0 2px 4px rgba(0,0,0,0.2)" },
      { name: "--wpd-ribbon-padding", default: "4px 0" },
      { name: "--wpd-ribbon-font", default: "700 10px/1.4 system-ui" },
      { name: "--wpd-ribbon-tracking", default: "0.06em" },
      { name: "--wpd-ribbon-z", default: "2" }
    ],
    example: html`
			<div
				style="position: relative; width: 240px; height: 120px;
				       border: 1px solid #ccc; border-radius: 8px;
				       padding: 16px; box-sizing: border-box;"
			>
				<wpd-ribbon>Featured</wpd-ribbon>
				Card body…
			</div>
		`
  };
  let WpdRibbon = _WpdRibbon;
  defineComponent("wpd-ribbon", WpdRibbon);
  const PLUGINS_CHANGED_TOPIC$1 = "desktop-mode.plugin.changed";
  const SOURCE$1 = "featured-view";
  function toast$1(message, duration = 3500) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.showToast === "function") {
      api2.showToast({ message, duration });
      return;
    }
    console.log("[plugins-window]", message);
  }
  function mountFeaturedView(host, flyoutEl) {
    host.replaceChildren();
    const state = {
      plugins: [],
      installed: /* @__PURE__ */ new Map(),
      cardsBySlug: /* @__PURE__ */ new Map(),
      loading: true
    };
    const intro = document.createElement("header");
    intro.className = "desktop-mode-plugins__featured-intro";
    const heading = document.createElement("h2");
    heading.className = "desktop-mode-plugins__featured-heading";
    heading.textContent = __("Made for Desktop Mode", "desktop-mode");
    const description = document.createElement("p");
    description.className = "desktop-mode-plugins__featured-blurb";
    description.textContent = __(
      "Plugins that extend Desktop Mode — desktop decorations, native windows, widgets, and other companions.",
      "desktop-mode"
    );
    intro.append(heading, description);
    const gallery = document.createElement("div");
    gallery.className = "desktop-mode-plugins__gallery";
    const status = document.createElement("p");
    status.className = "desktop-mode-plugins__gallery-status";
    status.hidden = true;
    host.append(intro, gallery, status);
    const cardCallbacks = {
      onOpen: (slug, hint) => {
        if (!flyoutEl) {
          return;
        }
        openDetailFlyout(flyoutEl, slug, hint, {
          getInstalled: (s) => state.installed.get(s),
          onPluginInstalled: async (pluginFile, slug2) => {
            await refreshInstalled();
            repaintSlugCard(slug2);
            broadcast(PLUGINS_CHANGED_TOPIC$1, {
              source: SOURCE$1,
              plugin: pluginFile ?? slug2,
              action: "install"
            });
          },
          onPluginActivated: (updated) => {
            state.installed.set(indexKeyFor(updated), updated);
            repaintSlugCard(updated.textdomain ?? "");
            broadcast(PLUGINS_CHANGED_TOPIC$1, {
              source: SOURCE$1,
              plugin: updated.plugin,
              action: "activate"
            });
          },
          onPluginDeactivated: (updated) => {
            state.installed.set(indexKeyFor(updated), updated);
            repaintSlugCard(updated.textdomain ?? "");
            broadcast(PLUGINS_CHANGED_TOPIC$1, {
              source: SOURCE$1,
              plugin: updated.plugin,
              action: "deactivate"
            });
          },
          onPluginDeleted: (deleted) => {
            state.installed.delete(indexKeyFor(deleted));
            repaintSlugCard(deleted.textdomain ?? "");
            broadcast(PLUGINS_CHANGED_TOPIC$1, {
              source: SOURCE$1,
              plugin: deleted.plugin,
              action: "delete"
            });
          }
        });
      },
      onInstall: async (plugin, card) => {
        const cta = card.querySelector("[data-plugin-card-cta]");
        const originalText = cta?.textContent ?? "";
        cta?.setAttribute("busy", "");
        cta?.setAttribute("disabled", "");
        if (cta) {
          cta.textContent = __("Installing…", "desktop-mode");
        }
        try {
          await installPluginBySlug(plugin.slug);
          await refreshInstalled();
          toast$1(
            sprintf(
              /* translators: %s: plugin name */
              __("Installed %s.", "desktop-mode"),
              plugin.name
            )
          );
          repaintCardCta(card, plugin, state.installed, cardCallbacks);
          broadcast(PLUGINS_CHANGED_TOPIC$1, {
            source: SOURCE$1,
            plugin: plugin.slug,
            action: "install"
          });
          void refreshFrameworkMenu();
        } catch (err) {
          cta?.removeAttribute("busy");
          cta?.removeAttribute("disabled");
          if (cta) {
            cta.textContent = originalText;
          }
          toast$1(
            sprintf(
              /* translators: %s: error message */
              __("Install failed: %s", "desktop-mode"),
              formatError(err)
            ),
            6e3
          );
        }
      },
      onActivate: async (installed, card) => {
        const cta = card.querySelector("[data-plugin-card-cta]");
        const originalText = cta?.textContent ?? "";
        cta?.setAttribute("busy", "");
        cta?.setAttribute("disabled", "");
        if (cta) {
          cta.textContent = __("Activating…", "desktop-mode");
        }
        try {
          const updated = await activateInstalledPlugin(installed);
          state.installed.set(indexKeyFor(updated), updated);
          toast$1(
            sprintf(
              /* translators: %s: plugin name */
              __("%s activated.", "desktop-mode"),
              updated.name || updated.plugin
            )
          );
          const plugin = state.plugins.find(
            (p) => p.slug === (updated.textdomain ?? "")
          );
          if (plugin) {
            repaintCardCta(card, plugin, state.installed, cardCallbacks);
          }
          broadcast(PLUGINS_CHANGED_TOPIC$1, {
            source: SOURCE$1,
            plugin: updated.plugin,
            action: "activate"
          });
          void refreshFrameworkMenu();
        } catch (err) {
          cta?.removeAttribute("busy");
          cta?.removeAttribute("disabled");
          if (cta) {
            cta.textContent = originalText;
          }
          toast$1(
            sprintf(
              /* translators: %s: error message */
              __("Activation failed: %s", "desktop-mode"),
              formatError(err)
            ),
            6e3
          );
        }
      }
    };
    void load();
    async function load() {
      state.loading = true;
      paintSkeletons();
      try {
        const [featured, installed] = await Promise.all([
          fetchFeaturedPlugins(),
          fetchInstalledPlugins().catch(() => [])
        ]);
        state.installed = new Map(
          installed.map((r) => [indexKeyFor(r), r])
        );
        state.plugins = featured.plugins ?? [];
        renderGallery();
        if (state.plugins.length === 0) {
          showStatus(__("No featured plugins yet.", "desktop-mode"));
        } else {
          hideStatus();
        }
      } catch (err) {
        gallery.replaceChildren();
        showStatus(
          sprintf(
            /* translators: %s: error message */
            __("Could not load featured plugins: %s", "desktop-mode"),
            formatError(err)
          )
        );
      } finally {
        state.loading = false;
      }
    }
    function paintSkeletons() {
      gallery.replaceChildren();
      state.cardsBySlug.clear();
      for (let i = 0; i < 3; i++) {
        gallery.appendChild(buildSkeletonCard());
      }
    }
    function renderGallery() {
      gallery.replaceChildren();
      state.cardsBySlug.clear();
      for (const plugin of state.plugins) {
        if (!plugin?.slug) {
          continue;
        }
        const card = buildCard(plugin, state.installed, cardCallbacks);
        if (plugin.featured) {
          card.classList.add("desktop-mode-plugins__card--featured");
          const ribbon = document.createElement("wpd-ribbon");
          ribbon.textContent = __("Featured", "desktop-mode");
          card.prepend(ribbon);
        }
        makeCardDraggable(card, plugin);
        gallery.appendChild(card);
        state.cardsBySlug.set(plugin.slug, card);
      }
    }
    function repaintSlugCard(slug) {
      if (!slug) {
        return;
      }
      const card = state.cardsBySlug.get(slug);
      const plugin = state.plugins.find((p) => p.slug === slug);
      if (card && plugin) {
        repaintCardCta(card, plugin, state.installed, cardCallbacks);
      }
    }
    async function refreshInstalled() {
      try {
        const rows = await fetchInstalledPlugins();
        state.installed = new Map(
          rows.map((r) => [indexKeyFor(r), r])
        );
        for (const [slug, card] of state.cardsBySlug) {
          const plugin = state.plugins.find((p) => p.slug === slug);
          if (plugin) {
            repaintCardCta(card, plugin, state.installed, cardCallbacks);
          }
        }
      } catch {
      }
    }
    function showStatus(message) {
      status.hidden = false;
      status.textContent = message;
    }
    function hideStatus() {
      status.hidden = true;
      status.textContent = "";
    }
    const unsubscribePluginsChanged = subscribe(
      PLUGINS_CHANGED_TOPIC$1,
      (payload) => {
        if (payload?.source === SOURCE$1) {
          return;
        }
        void refreshInstalled();
      }
    );
    return () => {
      unsubscribePluginsChanged();
      host.replaceChildren();
    };
  }
  function buildSkeletonCard() {
    const card = document.createElement("wpd-card");
    card.classList.add(
      "desktop-mode-plugins__card",
      "desktop-mode-plugins__card--skeleton"
    );
    card.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 4; i++) {
      const line = document.createElement("span");
      line.className = "desktop-mode-plugins__skeleton-line";
      line.style.width = `${50 + i * 17 % 50}%`;
      card.appendChild(line);
    }
    return card;
  }
  function indexKeyFor(plugin) {
    return plugin.textdomain || plugin.plugin;
  }
  function formatError(err) {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
  const queue = [];
  let inFlight = false;
  function enqueueUpdateJob(run) {
    return new Promise((resolve, reject) => {
      queue.push({
        run,
        resolve,
        reject
      });
      void drain();
    });
  }
  async function drain() {
    if (inFlight) {
      return;
    }
    const job = queue.shift();
    if (!job) {
      return;
    }
    inFlight = true;
    try {
      const value = await job.run();
      job.resolve(value);
    } catch (err) {
      job.reject(err);
    } finally {
      inFlight = false;
      void Promise.resolve().then(drain);
    }
  }
  const WP_ORG_ASSET_RE = /^(https:\/\/ps\.w\.org\/[a-z0-9-]+\/assets\/)icon\.svg$/i;
  function buildCandidates(initialUrl) {
    const match = initialUrl.match(WP_ORG_ASSET_RE);
    if (!match) {
      return [initialUrl];
    }
    const base = match[1];
    return [
      initialUrl,
      base + "icon-256x256.png",
      base + "icon-256x256.gif",
      base + "icon-128x128.png",
      base + "icon-128x128.gif"
    ];
  }
  function attachIconFallback(img, initialUrl, onExhausted) {
    const candidates = buildCandidates(initialUrl);
    let index = 0;
    img.addEventListener("error", () => {
      index += 1;
      if (index < candidates.length) {
        img.src = candidates[index];
        return;
      }
      onExhausted();
    });
    return candidates[0];
  }
  const styles$7 = css`:host{display:inline-flex;max-width:100%;vertical-align:middle}:host( [ hidden ] ){display:none}.wpd-chip{display:inline-flex;align-items:center;gap:var( --wpd-chip-gap,4px );padding:var( --wpd-chip-padding,2px 8px );border-radius:var( --wpd-chip-radius,999px );font-size:var( --wpd-chip-font-size,12px );line-height:var( --wpd-chip-line-height,1.6 );font-weight:var( --wpd-chip-font-weight,500 );background:var( --wpd-chip-bg,#f0f0f1 );color:var( --wpd-chip-fg,#1d2327 );border:var( --wpd-chip-border,1px solid transparent );max-width:100%;box-sizing:border-box;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease,transform 0.12s ease,opacity 0.12s ease}:host( [ tone='accent' ] ) .wpd-chip{background:var( --wpd-chip-bg,color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 14%,transparent ) );color:var( --wpd-chip-fg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ tone='positive' ] ) .wpd-chip{background:var( --wpd-chip-bg,rgba( 30,132,73,0.14 ) );color:var( --wpd-chip-fg,#1d6f42 )}:host( [ tone='warning' ] ) .wpd-chip{background:var( --wpd-chip-bg,rgba( 217,119,6,0.18 ) );color:var( --wpd-chip-fg,#8a4a06 )}:host( [ tone='danger' ] ) .wpd-chip{background:var( --wpd-chip-bg,rgba( 214,54,56,0.14 ) );color:var( --wpd-chip-fg,#a02622 )}:host( [ pending ] ) .wpd-chip{opacity:0.65;animation:wpd-chip-pulse 1.2s ease-in-out infinite}@keyframes wpd-chip-pulse{0%,100%{opacity:0.55}50%{opacity:0.95}}.wpd-chip__label{max-width:var( --wpd-chip-label-max,220px );overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wpd-chip__icon{display:inline-flex;align-items:center;flex-shrink:0}.wpd-chip__icon::slotted( * ){display:inline-flex}.wpd-chip__dismiss{appearance:none;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:16px;height:16px;margin-inline-start:2px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer;opacity:0.55;transition:opacity 0.12s ease,background-color 0.12s ease}.wpd-chip__dismiss:hover,.wpd-chip__dismiss:focus-visible{opacity:1;background:rgba( 0,0,0,0.12 );outline:none}.wpd-chip__dismiss:focus-visible{box-shadow:0 0 0 2px var( --wp-admin-theme-color,#2271b1 )}.wpd-chip__dismiss[ disabled ]{opacity:0.35;cursor:not-allowed}.wpd-chip__dismiss svg{display:block;width:10px;height:10px}:host( [ disabled ] ) .wpd-chip{opacity:0.55;cursor:not-allowed}:host( [ size='compact' ] ) .wpd-chip{padding:var( --wpd-chip-padding,1px 6px );font-size:var( --wpd-chip-font-size,11px )}`;
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
  _WpdChip.styles = [styles$7];
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
  const styles$6 = css`:host{display:flex;flex-direction:row;flex-wrap:wrap;gap:var( --wpd-cluster-gap,8px );justify-content:var( --wpd-cluster-justify,flex-start );align-items:var( --wpd-cluster-align,center )}:host( [ hidden ] ){display:none}`;
  const _WpdCluster = class _WpdCluster extends Component {
    render() {
      const gap = this.gap;
      const justify = this.justify;
      const align = this.align;
      const gapPx = gap && /^\d+$/.test(gap) ? `${gap}px` : "";
      if (gapPx) {
        this.style.setProperty("--wpd-cluster-gap", gapPx);
      }
      if (justify) {
        this.style.setProperty("--wpd-cluster-justify", justify);
      }
      if (align) {
        this.style.setProperty("--wpd-cluster-align", align);
      }
      return html`<slot></slot>`;
    }
  };
  _WpdCluster.props = ["gap", "justify", "align"];
  _WpdCluster.styles = [styles$6];
  _WpdCluster.help = {
    title: "Cluster",
    summary: "Horizontal flex layout with a gap + wrap. The sibling of <wpd-stack> — use it for rows of controls (button groups, toolbars). Children wrap gracefully when the container narrows.",
    status: "stable",
    since: "0.5.0",
    props: [
      {
        name: "gap",
        type: "integer (px)",
        default: "8",
        description: "Space between children."
      },
      {
        name: "justify",
        type: "'start' | 'center' | 'end' | 'space-between' | 'space-around'",
        default: "start",
        description: "Main-axis alignment (justify-content)."
      },
      {
        name: "align",
        type: "'start' | 'center' | 'end' | 'stretch' | 'baseline'",
        default: "center",
        description: "Cross-axis alignment (align-items)."
      }
    ],
    slots: [
      { name: "(default)", description: "Inline children." }
    ],
    cssProps: [
      { name: "--wpd-cluster-gap", default: "8px" },
      { name: "--wpd-cluster-justify", default: "start" },
      { name: "--wpd-cluster-align", default: "center" }
    ],
    example: html`
			<wpd-cluster gap="8" justify="end">
				<wpd-button>Cancel</wpd-button>
				<wpd-button variant="primary">Save</wpd-button>
			</wpd-cluster>
		`
  };
  let WpdCluster = _WpdCluster;
  defineComponent("wpd-cluster", WpdCluster);
  const styles$5 = css`:host{display:flex;flex-direction:column;gap:var( --wpd-stack-gap,12px );align-items:var( --wpd-stack-align,stretch );padding:var( --wpd-stack-padding,0 )}:host( [ hidden ] ){display:none}`;
  const _WpdStack = class _WpdStack extends Component {
    render() {
      const gap = this.gap;
      const align = this.align;
      const padding = this.padding;
      const gapPx = gap && /^\d+$/.test(gap) ? `${gap}px` : "";
      if (gapPx) {
        this.style.setProperty("--wpd-stack-gap", gapPx);
      }
      if (align) {
        this.style.setProperty("--wpd-stack-align", align);
      }
      if (padding !== null && /^\d+$/.test(padding)) {
        this.style.setProperty("--wpd-stack-padding", `${padding}px`);
      }
      return html`<slot></slot>`;
    }
  };
  _WpdStack.props = ["gap", "align", "padding"];
  _WpdStack.styles = [styles$5];
  _WpdStack.help = {
    title: "Stack",
    summary: 'Vertical flex layout with a gap — the "stack" primitive every design system eventually invents. Use it instead of hand-rolling display:flex; flex-direction:column.',
    status: "stable",
    since: "0.5.0",
    props: [
      {
        name: "gap",
        type: "integer (px)",
        default: "12",
        description: "Space between children."
      },
      {
        name: "align",
        type: "'start' | 'center' | 'end' | 'stretch'",
        default: "stretch",
        description: "Cross-axis alignment (align-items)."
      },
      {
        name: "padding",
        type: "integer (px)",
        default: "0",
        description: "Inset padding on every side. Pass 0 for edge-to-edge."
      }
    ],
    slots: [
      { name: "(default)", description: "Stacked children." }
    ],
    cssProps: [
      { name: "--wpd-stack-gap", default: "12px" },
      { name: "--wpd-stack-align", default: "stretch" },
      { name: "--wpd-stack-padding", default: "0" }
    ],
    example: html`
			<wpd-stack gap="12">
				<wpd-section heading="Foo">First</wpd-section>
				<wpd-section heading="Bar">Second</wpd-section>
			</wpd-stack>
		`
  };
  let WpdStack = _WpdStack;
  defineComponent("wpd-stack", WpdStack);
  const styles$4 = css`:host{display:grid;grid-template-columns:var( --wpd-grid-columns,1fr );grid-template-rows:var( --wpd-grid-rows,auto );gap:var( --wpd-grid-gap,8px );column-gap:var( --wpd-grid-column-gap,var( --wpd-grid-gap,8px ) );row-gap:var( --wpd-grid-row-gap,var( --wpd-grid-gap,8px ) )}:host( [ hidden ] ){display:none}`;
  const _WpdGrid = class _WpdGrid extends Component {
    render() {
      const columns = this.columns;
      const rows = this.rows;
      const gap = this.gap;
      const cg = this["column-gap"];
      const rg = this["row-gap"];
      if (columns && /^\d+$/.test(columns)) {
        this.style.setProperty(
          "--wpd-grid-columns",
          `repeat(${columns}, minmax(0, 1fr))`
        );
      }
      if (rows && /^\d+$/.test(rows)) {
        this.style.setProperty(
          "--wpd-grid-rows",
          `repeat(${rows}, minmax(0, 1fr))`
        );
      }
      if (gap && /^\d+$/.test(gap)) {
        this.style.setProperty("--wpd-grid-gap", `${gap}px`);
      }
      if (cg && /^\d+$/.test(cg)) {
        this.style.setProperty("--wpd-grid-column-gap", `${cg}px`);
      }
      if (rg && /^\d+$/.test(rg)) {
        this.style.setProperty("--wpd-grid-row-gap", `${rg}px`);
      }
      return html`<slot></slot>`;
    }
  };
  _WpdGrid.props = ["columns", "rows", "gap", "column-gap", "row-gap"];
  _WpdGrid.styles = [styles$4];
  _WpdGrid.help = {
    title: "Grid",
    summary: 'Neutral CSS grid container. The 2-D twin of <wpd-stack>/<wpd-cluster>. No role is emitted — callers wrap in role="grid"/"radiogroup" if warranted.',
    status: "stable",
    since: "0.5.0",
    props: [
      {
        name: "columns",
        type: "integer",
        default: "1",
        description: "Number of equal-width columns (repeat(N, minmax(0, 1fr)))."
      },
      {
        name: "rows",
        type: "integer",
        description: "Optional fixed row count. Omit for content-driven sizing."
      },
      { name: "gap", type: "integer (px)", description: "Cell spacing on both axes." },
      { name: "column-gap", type: "integer (px)", description: "x-axis override." },
      { name: "row-gap", type: "integer (px)", description: "y-axis override." }
    ],
    slots: [
      { name: "(default)", description: "Grid children." }
    ],
    cssProps: [
      { name: "--wpd-grid-columns" },
      { name: "--wpd-grid-rows" },
      { name: "--wpd-grid-gap" },
      { name: "--wpd-grid-column-gap" },
      { name: "--wpd-grid-row-gap" }
    ],
    example: html`
			<wpd-grid columns="4" gap="8">
				<wpd-button>7</wpd-button>
				<wpd-button>8</wpd-button>
				<wpd-button>9</wpd-button>
				<wpd-button variant="primary">÷</wpd-button>
				<wpd-button>4</wpd-button>
				<wpd-button>5</wpd-button>
				<wpd-button>6</wpd-button>
				<wpd-button variant="primary">×</wpd-button>
			</wpd-grid>
		`
  };
  let WpdGrid = _WpdGrid;
  defineComponent("wpd-grid", WpdGrid);
  const styles$3 = css`:host{display:inline-block;--wpd-spinner-color:var( --wp-admin-theme-color,#21759b );--wpd-spinner-accent:#fff;--wpd-spinner-size:48px;width:var( --wpd-spinner-size );height:var( --wpd-spinner-size );color:var( --wpd-spinner-color );vertical-align:middle;line-height:0}:host( [ hidden ] ){display:none}.root,.root svg{display:block;width:100%;height:100%}.root svg .mark{fill:var( --wpd-spinner-accent,#fff )}@keyframes wpd-spinner-spin{to{transform:rotate( 360deg )}}@keyframes wpd-spinner-scale{0%,100%{transform:scale( 1 )}50%{transform:scale( 1.045 )}}@keyframes wpd-spinner-opacity{0%,100%{opacity:1}50%{opacity:0.7}}@media ( prefers-reduced-motion:reduce ){.root svg [ style*='animation' ]{animation:none !important}}`;
  const WPD_SPINNER_PRESETS = Object.freeze({
    classic: {
      sp1: 12,
      sp2: 24,
      sp3: 40,
      a1: 28,
      a2: 15,
      a3: 8,
      gap: 4,
      dir2: 1,
      dir3: -1,
      pulse: "none",
      dots: 0
    },
    comet: {
      sp1: 8,
      sp2: 14,
      sp3: 26,
      a1: 50,
      a2: 28,
      a3: 12,
      gap: 3,
      dir2: 1,
      dir3: 1,
      pulse: "none",
      dots: 5
    },
    orbit: {
      sp1: 10,
      sp2: 10,
      sp3: 32,
      a1: 50,
      a2: 50,
      a3: 8,
      gap: 5,
      dir2: -1,
      dir3: -1,
      pulse: "opacity",
      dots: 3
    },
    pulse: {
      sp1: 6,
      sp2: 18,
      sp3: 30,
      a1: 20,
      a2: 12,
      a3: 6,
      gap: 4,
      dir2: 1,
      dir3: -1,
      pulse: "both",
      dots: 8
    }
  });
  const CX = 61.26;
  const CY = 61.26;
  const DISC_R = 58.453;
  const W_PATHS = '<path d="m8.708 61.26c0 20.802 12.089 38.779 29.619 47.298l-25.069-68.686c-2.916 6.536-4.55 13.769-4.55 21.388z"/><path d="m96.74 58.608c0-6.495-2.333-10.993-4.334-14.494-2.664-4.329-5.161-7.995-5.161-12.324 0-4.831 3.664-9.328 8.825-9.328.233 0 .454.029.681.042-9.35-8.566-21.807-13.796-35.489-13.796-18.36 0-34.513 9.42-43.91 23.688 1.233.037 2.395.063 3.382.063 5.497 0 14.006-.667 14.006-.667 2.833-.167 3.167 3.994.337 4.329 0 0-2.847.335-6.015.501l19.138 56.925 11.501-34.493-8.188-22.434c-2.83-.166-5.511-.501-5.511-.501-2.832-.166-2.5-4.496.332-4.329 0 0 8.679.667 13.843.667 5.496 0 14.006-.667 14.006-.667 2.835-.167 3.168 3.994.337 4.329 0 0-2.853.335-6.015.501l18.992 56.494 5.242-17.517c2.272-7.269 4.001-12.49 4.001-16.989z"/><path d="m62.184 65.857-15.768 45.819c4.708 1.384 9.687 2.141 14.846 2.141 6.12 0 11.989-1.058 17.452-2.979-.141-.225-.269-.464-.374-.724z"/><path d="m107.376 36.046c.226 1.674.354 3.471.354 5.404 0 5.333-.996 11.328-3.996 18.824l-16.053 46.413c15.624-9.111 26.133-26.038 26.133-45.426.001-9.137-2.333-17.729-6.438-25.215z"/>';
  const _WpdSpinner = class _WpdSpinner extends Component {
    constructor() {
      super(...arguments);
      this._paintScheduled = false;
    }
    connectedCallback() {
      super.connectedCallback();
      this._schedulePaint();
    }
    render() {
      return html`<div class="root" part="root"></div>`;
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
      this._syncCssVars();
      const root = this.shadowRoot?.querySelector(
        ".root"
      );
      if (!root) {
        return;
      }
      root.innerHTML = this._buildSvg();
    }
    /**
     * Reflect the color / accent / size attributes onto CSS custom
     * properties on the host. Removing the attribute clears the var
     * so the default cascades back in.
     */
    _syncCssVars() {
      const sync = (attr, varName, transform) => {
        const v = this.getAttribute(attr);
        if (v === null) {
          this.style.removeProperty(varName);
        } else {
          this.style.setProperty(
            varName,
            transform ? transform(v) : v
          );
        }
      };
      sync("color", "--wpd-spinner-color");
      sync("accent", "--wpd-spinner-accent");
      sync(
        "size",
        "--wpd-spinner-size",
        (v) => /^-?\d+(\.\d+)?$/.test(v.trim()) ? `${v}px` : v
      );
    }
    _effectiveConfig() {
      const presetName = this.getAttribute("preset") ?? "classic";
      const preset = WPD_SPINNER_PRESETS[presetName] ?? WPD_SPINNER_PRESETS.classic;
      const num = (attr, fallback) => {
        const v = this.getAttribute(attr);
        if (v === null) {
          return fallback;
        }
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
      };
      const dir = (attr, fallback) => {
        const v = this.getAttribute(attr);
        if (v === null) {
          return fallback;
        }
        const lc = v.toLowerCase();
        if (lc === "-1" || lc === "ccw" || lc === "reverse") {
          return -1;
        }
        return 1;
      };
      const pulse = () => {
        const v = this.getAttribute("pulse");
        if (v === "scale" || v === "opacity" || v === "both" || v === "none") {
          return v;
        }
        return preset.pulse;
      };
      return {
        sp1: num("sp1", preset.sp1),
        sp2: num("sp2", preset.sp2),
        sp3: num("sp3", preset.sp3),
        a1: num("a1", preset.a1),
        a2: num("a2", preset.a2),
        a3: num("a3", preset.a3),
        gap: num("gap", preset.gap),
        dir2: dir("dir2", preset.dir2),
        dir3: dir("dir3", preset.dir3),
        pulse: pulse(),
        dots: Math.max(0, Math.floor(num("dots", preset.dots)))
      };
    }
    _buildSvg() {
      const cfg = this._effectiveConfig();
      const label = escAttr(this.getAttribute("label") ?? "Loading");
      const pad = cfg.gap * 3 + 14;
      const vbMin = -pad;
      const vbSize = 122.52 + pad * 2;
      const r1 = DISC_R + cfg.gap + 2;
      const r2 = r1 + cfg.gap + 2;
      const r3 = r2 + cfg.gap + 1.5;
      const ring1Anim = `animation: wpd-spinner-spin ${(cfg.sp1 / 10).toFixed(2)}s linear infinite`;
      const ring2Anim = `animation: wpd-spinner-spin ${(cfg.sp2 / 10).toFixed(2)}s linear infinite${cfg.dir2 < 0 ? " reverse" : ""}`;
      const ring3Anim = `animation: wpd-spinner-spin ${(cfg.sp3 / 10).toFixed(2)}s linear infinite${cfg.dir3 < 0 ? " reverse" : ""}`;
      const pspd = (cfg.sp1 * 1.8 / 10).toFixed(1);
      const ospd = (cfg.sp1 * 2.3 / 10).toFixed(1);
      let pulseStyle = "";
      if (cfg.pulse === "scale") {
        pulseStyle = `animation: wpd-spinner-scale ${pspd}s ease-in-out infinite`;
      } else if (cfg.pulse === "opacity") {
        pulseStyle = `animation: wpd-spinner-opacity ${ospd}s ease-in-out infinite`;
      } else if (cfg.pulse === "both") {
        pulseStyle = `animation: wpd-spinner-scale ${pspd}s ease-in-out infinite, wpd-spinner-opacity ${ospd}s ease-in-out infinite`;
      }
      let dotEls = "";
      if (cfg.dots > 0) {
        const dr = r3 + cfg.gap + 1;
        const dc2 = 2 * Math.PI * dr;
        const dsz = 1.6;
        const dotDur = (cfg.sp1 * 0.65 / 10).toFixed(2);
        for (let i = 0; i < cfg.dots; i++) {
          const offset = -(i / cfg.dots) * dc2;
          dotEls += `<circle cx="${CX}" cy="${CY}" r="${dr.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="${dsz}" stroke-dasharray="${dsz.toFixed(2)} ${(dc2 - dsz).toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round" stroke-opacity="0.65" style="transform-origin:${CX}px ${CY}px;animation: wpd-spinner-spin ${dotDur}s linear infinite"/>`;
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbMin} ${vbMin} ${vbSize} ${vbSize}" role="img" aria-label="${label}"><g style="transform-origin:${CX}px ${CY}px${pulseStyle ? ";" + pulseStyle : ""}"><circle cx="${CX}" cy="${CY}" r="${DISC_R}" fill="currentColor"/><g class="mark">${W_PATHS}</g></g><circle cx="${CX}" cy="${CY}" r="${r1.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="0.6" stroke-opacity="0.2"/><circle cx="${CX}" cy="${CY}" r="${r1.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="${dasharray(r1, cfg.a1)}" stroke-linecap="round" style="transform-origin:${CX}px ${CY}px;${ring1Anim}"/><circle cx="${CX}" cy="${CY}" r="${r2.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="0.5" stroke-opacity="0.15"/><circle cx="${CX}" cy="${CY}" r="${r2.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-opacity="0.8" stroke-dasharray="${dasharray(r2, cfg.a2)}" stroke-linecap="round" style="transform-origin:${CX}px ${CY}px;${ring2Anim}"/><circle cx="${CX}" cy="${CY}" r="${r3.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="0.4" stroke-opacity="0.12"/><circle cx="${CX}" cy="${CY}" r="${r3.toFixed(2)}" fill="none" stroke="currentColor" stroke-width="1.0" stroke-opacity="0.6" stroke-dasharray="${dasharray(r3, cfg.a3)}" stroke-linecap="round" style="transform-origin:${CX}px ${CY}px;${ring3Anim}"/>` + dotEls + `</svg>`;
    }
  };
  _WpdSpinner.props = [
    "preset",
    "size",
    "color",
    "accent",
    "sp1",
    "sp2",
    "sp3",
    "a1",
    "a2",
    "a3",
    "gap",
    "dir2",
    "dir3",
    "pulse",
    "dots",
    "label"
  ];
  _WpdSpinner.styles = [styles$3];
  _WpdSpinner.help = {
    title: "Spinner",
    summary: "Animated WordPress-mark loading indicator with four curated presets and full per-attribute overrides. CSS variables drive disc + accent colors and size; reduced-motion preferences are respected.",
    status: "experimental",
    since: "0.6.0",
    props: [
      {
        name: "preset",
        type: '"classic" | "comet" | "orbit" | "pulse"',
        default: "classic",
        description: "Visual personality. Every other attribute defaults to the preset's value and can be overridden individually."
      },
      {
        name: "size",
        type: "integer (px) or CSS length",
        default: "48",
        description: "Sets `--wpd-spinner-size`. Bare numbers are treated as px; pass a CSS length (e.g. `2em`) to opt into ems / rems."
      },
      {
        name: "color",
        type: "CSS color",
        description: "Disc + ring + dot color. Sets `--wpd-spinner-color`. Default inherits the WP admin theme color."
      },
      {
        name: "accent",
        type: "CSS color",
        default: "#fff",
        description: "Color of the W mark inside the disc. Sets `--wpd-spinner-accent`. Default white — change for dark-on-light or themed marks."
      },
      {
        name: "sp1, sp2, sp3",
        type: "integer (deciseconds)",
        description: "Per-ring rotation duration in tenths-of-a-second (12 → 1.2s). Higher = slower."
      },
      {
        name: "a1, a2, a3",
        type: "integer (0-100)",
        description: "Per-ring arc length as a percentage of the ring circumference."
      },
      {
        name: "gap",
        type: "integer",
        description: "Gap between concentric rings (units approximate to px at 120-viewport)."
      },
      {
        name: "dir2, dir3",
        type: '"1" | "-1" | "cw" | "ccw"',
        description: "Per-ring direction; ring 1 is always clockwise."
      },
      {
        name: "pulse",
        type: '"none" | "scale" | "opacity" | "both"',
        description: "Pulse animation applied to the disc + W mark."
      },
      {
        name: "dots",
        type: "integer",
        description: "Outer trailing dot count. Sensible values: 0, 3, 5, 8."
      },
      {
        name: "label",
        type: "string",
        default: "Loading",
        description: 'Accessible name for the SVG (`role="img"` + `aria-label`).'
      }
    ],
    cssProps: [
      { name: "--wpd-spinner-color", default: "var(--wp-admin-theme-color, #21759b)" },
      { name: "--wpd-spinner-accent", default: "#fff" },
      { name: "--wpd-spinner-size", default: "48px" }
    ],
    example: html`<wpd-spinner preset="comet" size="80"></wpd-spinner>`
  };
  let WpdSpinner = _WpdSpinner;
  function dasharray(r, pct) {
    const c = 2 * Math.PI * r;
    const visible = pct / 100 * c;
    const gap = c - visible;
    return `${visible.toFixed(2)} ${gap.toFixed(2)}`;
  }
  function escAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  defineComponent("wpd-spinner", WpdSpinner);
  const styles$2 = css`:host{display:inline-flex;align-items:center;justify-content:center;width:var( --wpd-icon-size,16px );height:var( --wpd-icon-size,16px );color:inherit;line-height:1}:host( [ hidden ] ){display:none}.wpd-icon__glyph{font-size:var( --wpd-icon-size,16px );width:var( --wpd-icon-size,16px );height:var( --wpd-icon-size,16px );line-height:1;color:inherit;display:inline-flex;align-items:center;justify-content:center}.wpd-icon__glyph--char{font-family:dashicons;font-style:normal;font-weight:normal;font-variant:normal;text-transform:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;speak:none}.wpd-icon__glyph.dashicons{font-family:dashicons}`;
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
  _WpdIcon.styles = [styles$2];
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
  const styles$1 = css`:host{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:32px 24px;text-align:center;color:var( --wpd-empty-state-fg,var( --desktop-mode-muted,#646970 ) )}:host( [ hidden ] ){display:none}.wpd-empty-state__icon{margin-bottom:4px;color:var( --wpd-empty-state-icon-color,currentColor );opacity:0.75}.wpd-empty-state__heading{margin:0;font-size:14px;font-weight:600;color:var( --desktop-mode-text,#1d2327 )}.wpd-empty-state__description{margin:0;font-size:12px;line-height:1.4;max-width:48ch}.wpd-empty-state__description:empty{display:none}.wpd-empty-state__cta{margin-top:8px}.wpd-empty-state__cta:empty{display:none}`;
  const _WpdEmptyState = class _WpdEmptyState extends Component {
    render() {
      const icon = this.icon || "";
      const heading = this.heading || "";
      const description = this.description || "";
      return html`
			${icon ? html`<wpd-icon
						class="wpd-empty-state__icon"
						name=${icon}
						size="28"
				  ></wpd-icon>` : null}
			<h3 class="wpd-empty-state__heading">${heading}</h3>
			<p class="wpd-empty-state__description">${description}</p>
			<div class="wpd-empty-state__cta">
				<slot name="cta"></slot>
			</div>
			<slot></slot>
		`;
    }
  };
  _WpdEmptyState.props = ["icon", "heading", "description"];
  _WpdEmptyState.styles = [styles$1];
  _WpdEmptyState.help = {
    title: "Empty state",
    summary: 'Centered placeholder for "nothing here yet" UI: icon + heading + description + optional CTA. A canonical shape so empty states look consistent across the shell.',
    status: "stable",
    since: "0.5.0",
    props: [
      {
        name: "icon",
        type: "string (dashicons slug)",
        description: "Dashicons identifier (with or without the dashicons- prefix)."
      },
      {
        name: "heading",
        type: "string",
        description: "Bold first line."
      },
      {
        name: "description",
        type: "string",
        description: "Secondary paragraph below the heading."
      }
    ],
    slots: [
      { name: "cta", description: "Call-to-action button row below the description." },
      { name: "(default)", description: "Any additional content rendered after the CTA." }
    ],
    cssProps: [
      { name: "--desktop-mode-text", description: "Heading colour." },
      { name: "--desktop-mode-muted", description: "Description colour." },
      { name: "--wpd-empty-state-fg" },
      { name: "--wpd-empty-state-icon-color" }
    ],
    example: html`
			<wpd-empty-state
				icon="admin-plugins"
				heading="No plugins installed yet"
				description="Install a plugin to see it here."
			>
				<wpd-button slot="cta" variant="primary">Browse plugins</wpd-button>
			</wpd-empty-state>
		`
  };
  let WpdEmptyState = _WpdEmptyState;
  defineComponent("wpd-empty-state", WpdEmptyState);
  const styles = css`:host{display:block;--_track:var( --wpd-rating-track,rgba( 0,0,0,0.08 ) );--_fill:var( --wpd-rating-fill,linear-gradient( 90deg,#f5af00 0%,#ffd245 100% ) );--_star:var( --wpd-rating-star,#f5af00 );--_star-empty:var( --wpd-rating-star-empty,rgba( 0,0,0,0.18 ) );--_surface:var( --wpd-rating-surface,var( --wpd-surface-raised,rgba( 255,255,255,0.7 ) ) );--_border:var( --wpd-rating-border,var( --wpd-border,rgba( 0,0,0,0.08 ) ) );--_fg:var( --wpd-rating-fg,var( --wpd-fg,inherit ) );--_fg-muted:var( --wpd-rating-fg-muted,var( --wpd-fg-muted,#666 ) )}:host( [ hidden ] ){display:none}.summary-card{display:grid;grid-template-columns:minmax( 140px,180px ) 1fr;gap:28px;align-items:center;padding:18px 20px;background:var( --_surface );border:1px solid var( --_border );border-radius:14px;color:var( --_fg )}.summary{display:flex;flex-direction:column;align-items:center;gap:8px;padding-inline-end:20px;border-inline-end:1px solid var( --_border )}.big{font-size:44px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;color:var( --_fg )}.stars{display:inline-flex;gap:2px;color:var( --_star )}.stars svg{width:16px;height:16px;display:block}.stars .empty{color:var( --_star-empty )}.total{font-size:12px;color:var( --_fg-muted )}.bars{display:grid;gap:6px;min-width:0}.row{display:grid;grid-template-columns:42px 1fr 60px;gap:12px;align-items:center;font-size:12.5px;color:var( --_fg-muted )}.row__label{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums;font-weight:600}.row__label svg{width:11px;height:11px;color:var( --_star )}.row__track{position:relative;height:10px;background:var( --_track );border-radius:999px;overflow:hidden}.row__fill{position:absolute;inset:0;background:var( --_fill );border-radius:999px;transform-origin:left center;transform:scaleX( var( --ratio,0 ) );transition:transform 600ms cubic-bezier( 0.2,0.8,0.2,1 )}:host(:dir( rtl ) ) .row__fill,:host-context( [ dir='rtl' ] ) .row__fill{transform-origin:right center}.row__count{text-align:end;font-variant-numeric:tabular-nums;color:var( --_fg )}@media ( prefers-reduced-motion:reduce ){.row__fill{transition:none}}@media ( max-width:540px ){.summary-card{grid-template-columns:1fr;gap:16px}.summary{padding-inline-end:0;border-inline-end:0;border-block-end:1px solid var( --_border );padding-block-end:14px}}`;
  const _WpdRatingSummary = class _WpdRatingSummary extends Component {
    constructor() {
      super(...arguments);
      this._ratings = {};
    }
    /**
     * Per-star counts. Setting this triggers a re-render so consumers
     * can swap data without recreating the element.
     */
    get ratings() {
      return { ...this._ratings };
    }
    set ratings(next) {
      this._ratings = next ? { ...next } : {};
      this.requestUpdate();
    }
    render() {
      const rating = clamp01to100(numAttr(this, "rating"));
      const stars0to5 = rating / 100 * 5;
      const totalAttr = numAttr(this, "total");
      const total = totalAttr > 0 ? totalAttr : (this._ratings["5"] ?? 0) + (this._ratings["4"] ?? 0) + (this._ratings["3"] ?? 0) + (this._ratings["2"] ?? 0) + (this._ratings["1"] ?? 0);
      const fmt = new Intl.NumberFormat();
      const big = rating > 0 ? (rating / 100 * 5).toFixed(1) : "—";
      return html`
			<div class="summary-card" role="img" aria-label=${ariaLabel(rating, total)}>
				<div class="summary">
					<div class="big">${big}</div>
					<div class="stars" aria-hidden="true">
						${renderStarRow(stars0to5)}
					</div>
					<div class="total">
						${total === 1 ? "1 rating" : `${fmt.format(total)} ratings`}
					</div>
				</div>
				<div class="bars">
					${[5, 4, 3, 2, 1].map((star) => {
        const count = this._ratings[String(star)] ?? 0;
        const ratio = total === 0 ? 0 : count / total;
        return html`
							<div
								class="row"
								role="presentation"
								aria-label=${`${star} stars: ${fmt.format(count)}`}
							>
								<span class="row__label">
									${star} ${filledStarSvg()}
								</span>
								<span class="row__track">
									<span
										class="row__fill"
										style=${`--ratio: ${ratio.toFixed(4)}`}
									></span>
								</span>
								<span class="row__count">${fmt.format(count)}</span>
							</div>
						`;
      })}
				</div>
			</div>
		`;
    }
  };
  _WpdRatingSummary.props = ["rating", "total"];
  _WpdRatingSummary.styles = [styles];
  _WpdRatingSummary.help = {
    title: "Rating summary",
    summary: "Two-pane rating distribution: big average + 5-star cluster + total count on the left, one animated bar per star bucket on the right. Mirrors the WordPress.org plugin reviews summary.",
    status: "experimental",
    since: "0.8.5",
    props: [
      {
        name: "rating",
        type: "number (0–100)",
        description: "Average rating on the wp.org 0–100 scale. Converted to a 0–5 display inside."
      },
      {
        name: "total",
        type: "number",
        description: "Total number of ratings. Optional — auto-summed from `ratings` when omitted."
      }
    ],
    cssProps: [
      { name: "--wpd-rating-fill", description: "Background of the bar fill." },
      { name: "--wpd-rating-track", description: "Background of the empty bar track." },
      { name: "--wpd-rating-star", description: "Color of filled stars." },
      { name: "--wpd-rating-star-empty", description: "Color of empty stars." },
      { name: "--wpd-rating-surface", description: "Card background." },
      { name: "--wpd-rating-border", description: "Card border color." },
      { name: "--wpd-rating-fg", description: "Primary text color." },
      { name: "--wpd-rating-fg-muted", description: "Secondary text color." }
    ],
    example: html`
			<wpd-rating-summary rating="92"></wpd-rating-summary>
		`
  };
  let WpdRatingSummary = _WpdRatingSummary;
  function numAttr(host, name) {
    const raw = host.getAttribute(name);
    if (raw === null || raw === "") {
      return 0;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  function clamp01to100(n) {
    if (n < 0) {
      return 0;
    }
    if (n > 100) {
      return 100;
    }
    return n;
  }
  function ariaLabel(rating, total) {
    if (total === 0) {
      return "No ratings yet";
    }
    const stars = rating / 100 * 5;
    return `Average rating ${stars.toFixed(1)} out of 5, from ${total} ratings`;
  }
  function renderStarRow(stars0to5) {
    const full = Math.floor(stars0to5);
    const half = stars0to5 - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    const list = [];
    for (let i = 0; i < full; i++) {
      list.push(filledStarSvg());
    }
    for (let i = 0; i < half; i++) {
      list.push(halfStarSvg());
    }
    for (let i = 0; i < empty; i++) {
      list.push(emptyStarSvg());
    }
    return list;
  }
  function filledStarSvg() {
    return html`
		<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
			<path
				d="M8 1.5l2.06 4.17 4.6.67-3.33 3.25.79 4.58L8 12L3.88 14.17l.79-4.58L1.34 6.34l4.6-.67L8 1.5z"
			/>
		</svg>
	`;
  }
  function halfStarSvg() {
    return html`
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<defs>
				<linearGradient id="wpd-half-star">
					<stop offset="50%" stop-color="currentColor" />
					<stop
						offset="50%"
						stop-color="currentColor"
						stop-opacity="0.22"
					/>
				</linearGradient>
			</defs>
			<path
				fill="url(#wpd-half-star)"
				d="M8 1.5l2.06 4.17 4.6.67-3.33 3.25.79 4.58L8 12L3.88 14.17l.79-4.58L1.34 6.34l4.6-.67L8 1.5z"
			/>
		</svg>
	`;
  }
  function emptyStarSvg() {
    return html`
		<svg
			class="empty"
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden="true"
		>
			<path
				d="M8 1.5l2.06 4.17 4.6.67-3.33 3.25.79 4.58L8 12L3.88 14.17l.79-4.58L1.34 6.34l4.6-.67L8 1.5z"
			/>
		</svg>
	`;
  }
  defineComponent("wpd-rating-summary", WpdRatingSummary);
  const wpOrgCache = /* @__PURE__ */ new Map();
  const reviewsCache = /* @__PURE__ */ new Map();
  function buildInstalledDetail(row) {
    const root = document.createElement("div");
    root.className = "desktop-mode-plugins__detail";
    root.setAttribute("data-noclick", "");
    const style = document.createElement("style");
    style.textContent = PANEL_STYLES;
    root.appendChild(style);
    const slug = deriveSlug(row);
    root.appendChild(buildHero(row));
    const tabsHost = document.createElement("div");
    tabsHost.className = "desktop-mode-plugins__detail-tabs-wrap";
    root.appendChild(tabsHost);
    const body = document.createElement("div");
    body.className = "desktop-mode-plugins__detail-body";
    root.appendChild(body);
    const tabs = document.createElement("wpd-tabs");
    tabs.className = "desktop-mode-plugins__detail-tabs";
    tabs.setAttribute("value", "overview");
    const tabDefs = [
      { value: "overview", label: __("Overview", "desktop-mode"), show: true },
      { value: "details", label: __("Details", "desktop-mode"), show: true },
      { value: "changelog", label: __("Changelog", "desktop-mode"), show: !!slug },
      { value: "faq", label: __("FAQ", "desktop-mode"), show: !!slug },
      { value: "reviews", label: __("Reviews", "desktop-mode"), show: !!slug }
    ];
    for (const def of tabDefs) {
      if (!def.show) {
        continue;
      }
      const tab = document.createElement("wpd-tab");
      tab.setAttribute("value", def.value);
      tab.textContent = def.label;
      tabs.appendChild(tab);
    }
    tabsHost.appendChild(tabs);
    let info = slug ? wpOrgCache.get(slug) ?? null : null;
    let infoFetching = false;
    let active = "overview";
    const ensureInfo = () => {
      if (!slug || info || infoFetching) {
        return;
      }
      infoFetching = true;
      void (async () => {
        try {
          info = await fetchPluginInfo(slug);
          wpOrgCache.set(slug, info);
          if (root.isConnected) {
            paintActive();
          }
        } catch {
          if (root.isConnected) {
            paintActive();
          }
        } finally {
          infoFetching = false;
        }
      })();
    };
    const paintActive = () => {
      body.replaceChildren(renderTab(active, row, slug, info));
    };
    tabs.addEventListener("wpd-tab-change", (ev) => {
      const detail = ev.detail;
      active = detail?.value ?? "overview";
      if (slug && active !== "overview" && active !== "details") {
        ensureInfo();
      }
      paintActive();
    });
    paintActive();
    return root;
  }
  function buildHero(row, _slug) {
    const hero = document.createElement("div");
    hero.className = "desktop-mode-plugins__detail-hero";
    const inner = document.createElement("div");
    inner.className = "desktop-mode-plugins__detail-hero-inner";
    const iconTile = document.createElement("div");
    iconTile.className = "desktop-mode-plugins__detail-hero-icon";
    const iconUrl = row.desktop_mode_icon_url;
    if (iconUrl) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = attachIconFallback(img, iconUrl, () => {
        iconTile.replaceChildren(buildFallbackGlyph());
      });
      iconTile.appendChild(img);
    } else {
      iconTile.appendChild(buildFallbackGlyph());
    }
    const titleBlock = document.createElement("wpd-stack");
    titleBlock.setAttribute("gap", "6");
    titleBlock.className = "desktop-mode-plugins__detail-hero-text";
    const titleRow = document.createElement("wpd-cluster");
    titleRow.setAttribute("gap", "10");
    titleRow.setAttribute("align", "center");
    const title = document.createElement("h3");
    title.className = "desktop-mode-plugins__detail-title";
    title.textContent = row.name || row.plugin;
    titleRow.appendChild(title);
    if (row.version) {
      const ver = document.createElement("wpd-badge");
      ver.setAttribute("tone", "neutral");
      ver.setAttribute("no-dot", "");
      ver.textContent = sprintf(
        /* translators: %s: version number */
        __("v%s", "desktop-mode"),
        row.version
      );
      titleRow.appendChild(ver);
    }
    const isActive = row.status === "active" || row.status === "active-network";
    const statusBadge = document.createElement("wpd-badge");
    statusBadge.setAttribute("tone", isActive ? "success" : "neutral");
    statusBadge.textContent = isActive ? __("Active", "desktop-mode") : __("Inactive", "desktop-mode");
    titleRow.appendChild(statusBadge);
    const update = row.desktop_mode_update_available;
    if (update?.available && update.new_version) {
      const upd = document.createElement("wpd-badge");
      upd.setAttribute("tone", "warning");
      upd.textContent = sprintf(
        /* translators: %s: new version available */
        __("Update to %s", "desktop-mode"),
        update.new_version
      );
      titleRow.appendChild(upd);
    }
    titleBlock.appendChild(titleRow);
    const byline = document.createElement("p");
    byline.className = "desktop-mode-plugins__detail-byline";
    const authorText = stripHtml$1(row.author ?? "") || __("Unknown author", "desktop-mode");
    if (row.author_uri) {
      const a = document.createElement("a");
      a.href = row.author_uri;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = authorText;
      a.setAttribute("data-noclick", "");
      byline.append(__("by", "desktop-mode") + " ", a);
    } else {
      byline.textContent = sprintf(
        /* translators: %s: plugin author */
        __("by %s", "desktop-mode"),
        authorText
      );
    }
    titleBlock.appendChild(byline);
    inner.append(iconTile, titleBlock);
    hero.appendChild(inner);
    return hero;
  }
  function renderTab(tab, row, slug, info) {
    if (tab === "overview") {
      return renderOverview(row, slug, info);
    }
    if (tab === "details") {
      return renderDetails(row);
    }
    if (tab === "changelog") {
      return renderChangelog(info);
    }
    if (tab === "faq") {
      return renderFaq(info);
    }
    return renderReviews(slug, info);
  }
  function renderOverview(row, slug, info) {
    const stack = document.createElement("wpd-stack");
    stack.setAttribute("gap", "20");
    const chipStrip = buildOverviewChips(row, info);
    if (chipStrip.children.length > 0) {
      stack.appendChild(chipStrip);
    }
    const descHtml = info?.sections?.description ?? info?.short_description ?? readDescription(row);
    if (descHtml) {
      const desc = document.createElement("div");
      desc.className = "desktop-mode-plugins__detail-html";
      desc.innerHTML = sanitizeHtml(descHtml);
      sanitizeLinks(desc);
      stack.appendChild(desc);
    } else if (slug && !info) {
      stack.appendChild(buildLoadingBlock(__("Loading description…", "desktop-mode")));
    } else {
      stack.appendChild(
        buildEmpty(
          "admin-plugins",
          __("No description", "desktop-mode"),
          __("This plugin doesn’t ship a description in its header.", "desktop-mode")
        )
      );
    }
    const actions = document.createElement("wpd-cluster");
    actions.setAttribute("gap", "8");
    actions.className = "desktop-mode-plugins__detail-actions";
    if (slug) {
      actions.appendChild(
        linkButton(
          "primary",
          __("View on WordPress.org", "desktop-mode"),
          `https://wordpress.org/plugins/${encodeURIComponent(slug)}/`
        )
      );
    }
    if (row.plugin_uri) {
      actions.appendChild(
        linkButton("secondary", __("Plugin website", "desktop-mode"), row.plugin_uri)
      );
    }
    if (row.author_uri) {
      actions.appendChild(
        linkButton("ghost", __("Author website", "desktop-mode"), row.author_uri)
      );
    }
    if (actions.children.length > 0) {
      stack.appendChild(actions);
    }
    return stack;
  }
  function buildOverviewChips(row, info) {
    const strip = document.createElement("wpd-cluster");
    strip.setAttribute("gap", "8");
    strip.className = "desktop-mode-plugins__detail-chip-strip";
    if (info) {
      if (typeof info.rating === "number" && info.rating > 0) {
        const stars = document.createElement("span");
        stars.className = "desktop-mode-plugins__detail-stars-pill";
        stars.appendChild(buildStarCluster(info.rating, info.num_ratings ?? 0));
        strip.appendChild(stars);
      }
      if (info.active_installs) {
        strip.appendChild(
          chip(
            "admin-users",
            sprintf(
              /* translators: %s: comma-grouped active install count */
              __("%s+ active installs", "desktop-mode"),
              new Intl.NumberFormat().format(info.active_installs)
            )
          )
        );
      }
      if (info.last_updated) {
        strip.appendChild(
          chip(
            "update",
            sprintf(
              /* translators: %s: date the plugin was last updated */
              __("Updated %s", "desktop-mode"),
              humanDate(info.last_updated)
            )
          )
        );
      }
      if (info.tested) {
        strip.appendChild(
          chip(
            "wordpress-alt",
            sprintf(
              /* translators: %s: maximum tested WordPress version */
              __("Tested up to WP %s", "desktop-mode"),
              info.tested
            )
          )
        );
      }
    }
    if (row.requires_wp) {
      strip.appendChild(
        chip(
          "wordpress",
          sprintf(
            /* translators: %s: minimum WordPress version */
            __("Requires WP %s+", "desktop-mode"),
            row.requires_wp
          )
        )
      );
    }
    if (row.requires_php) {
      strip.appendChild(
        chip(
          "editor-code",
          sprintf(
            /* translators: %s: minimum PHP version */
            __("Requires PHP %s+", "desktop-mode"),
            row.requires_php
          )
        )
      );
    }
    if (row.network_only) {
      strip.appendChild(
        chip("networking", __("Network only", "desktop-mode"))
      );
    }
    return strip;
  }
  function renderDetails(row) {
    const grid = document.createElement("wpd-grid");
    grid.setAttribute("columns", "2");
    grid.setAttribute("gap", "12");
    grid.className = "desktop-mode-plugins__detail-grid";
    pushFactCard(grid, "media-document", __("Plugin file", "desktop-mode"), codeNode(row.plugin));
    if (row.version) {
      pushFactCard(grid, "tag", __("Version", "desktop-mode"), row.version);
    }
    if (row.desktop_mode_size_kb !== null && row.desktop_mode_size_kb !== void 0) {
      pushFactCard(
        grid,
        "database",
        __("Size on disk", "desktop-mode"),
        formatSize$1(row.desktop_mode_size_kb)
      );
    }
    if (row.requires_wp) {
      pushFactCard(
        grid,
        "wordpress-alt",
        __("Requires WordPress", "desktop-mode"),
        sprintf(
          /* translators: %s: version */
          __("%s+", "desktop-mode"),
          row.requires_wp
        )
      );
    }
    if (row.requires_php) {
      pushFactCard(
        grid,
        "editor-code",
        __("Requires PHP", "desktop-mode"),
        sprintf(
          /* translators: %s: version */
          __("%s+", "desktop-mode"),
          row.requires_php
        )
      );
    }
    if (row.textdomain) {
      pushFactCard(
        grid,
        "translation",
        __("Text domain", "desktop-mode"),
        codeNode(String(row.textdomain))
      );
    }
    if (row.plugin_uri) {
      pushFactCard(grid, "admin-links", __("Plugin URL", "desktop-mode"), externalLink(row.plugin_uri));
    }
    if (row.author_uri) {
      pushFactCard(grid, "admin-users", __("Author URL", "desktop-mode"), externalLink(row.author_uri));
    }
    if (row.network_only) {
      pushFactCard(
        grid,
        "networking",
        __("Scope", "desktop-mode"),
        __("Network only", "desktop-mode")
      );
    }
    pushFactCard(
      grid,
      row.status === "active" || row.status === "active-network" ? "yes-alt" : "marker",
      __("Status", "desktop-mode"),
      row.status === "active" || row.status === "active-network" ? __("Active", "desktop-mode") : __("Inactive", "desktop-mode")
    );
    return grid;
  }
  function pushFactCard(parent, icon, label, value) {
    const card = document.createElement("wpd-card");
    card.setAttribute("compact", "");
    card.className = "desktop-mode-plugins__detail-fact";
    const head = document.createElement("div");
    head.setAttribute("slot", "header");
    head.className = "desktop-mode-plugins__detail-fact-head";
    const ico = document.createElement("span");
    ico.className = `dashicons dashicons-${icon}`;
    ico.setAttribute("aria-hidden", "true");
    const lab = document.createElement("span");
    lab.className = "desktop-mode-plugins__detail-fact-label";
    lab.textContent = label;
    head.append(ico, lab);
    card.appendChild(head);
    const val = document.createElement("div");
    val.className = "desktop-mode-plugins__detail-fact-value";
    if (typeof value === "string") {
      val.textContent = value;
    } else {
      val.appendChild(value);
    }
    card.appendChild(val);
    parent.appendChild(card);
  }
  function renderChangelog(info) {
    if (!info) {
      return buildLoadingBlock(__("Loading from WordPress.org…", "desktop-mode"));
    }
    const html2 = info.sections?.changelog;
    if (!html2) {
      return buildEmpty(
        "list-view",
        __("No changelog", "desktop-mode"),
        __("This plugin doesn’t ship a changelog.", "desktop-mode")
      );
    }
    const entries = parseChangelogEntries(html2);
    if (entries.length === 0) {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-plugins__detail-html";
      wrap.innerHTML = sanitizeHtml(html2);
      sanitizeLinks(wrap);
      return wrap;
    }
    const stack = document.createElement("wpd-stack");
    stack.setAttribute("gap", "12");
    stack.className = "desktop-mode-plugins__detail-changelog";
    entries.forEach((entry, i) => {
      const card = document.createElement("wpd-card");
      card.className = "desktop-mode-plugins__detail-changelog-entry";
      const head = document.createElement("div");
      head.setAttribute("slot", "header");
      head.className = "desktop-mode-plugins__detail-changelog-head";
      const ver = document.createElement("wpd-badge");
      ver.setAttribute("tone", i === 0 ? "success" : "neutral");
      ver.textContent = entry.version;
      head.appendChild(ver);
      if (i === 0) {
        const latest = document.createElement("span");
        latest.className = "desktop-mode-plugins__detail-changelog-latest";
        latest.textContent = __("Latest", "desktop-mode");
        head.appendChild(latest);
      }
      card.appendChild(head);
      const body = document.createElement("div");
      body.className = "desktop-mode-plugins__detail-html";
      body.innerHTML = sanitizeHtml(entry.body);
      sanitizeLinks(body);
      card.appendChild(body);
      stack.appendChild(card);
    });
    return stack;
  }
  function parseChangelogEntries(html2) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html2;
    if (tmp.childNodes.length === 0) {
      return [];
    }
    const entries = [];
    let current = null;
    const versionRegex = /([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[\w.+-]*)?)/;
    const flush = () => {
      if (!current) {
        return;
      }
      entries.push({ version: current.version, body: current.html.trim() });
      current = null;
    };
    for (const node of Array.from(tmp.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        const isHeading = /^H[1-6]$/.test(el.tagName);
        const text = (el.textContent ?? "").trim();
        const cleaned = text.replace(/^=+\s*|\s*=+$/g, "").trim();
        const headingMatch = isHeading ? cleaned.match(versionRegex) : null;
        if (headingMatch) {
          flush();
          current = { version: cleaned, html: "" };
          continue;
        }
        if (!current) {
          continue;
        }
        current.html += el.outerHTML;
        continue;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        if (!current) {
          continue;
        }
        if (text.trim() === "") {
          if (current.html !== "") {
            current.html += text;
          }
          continue;
        }
        current.html += `<p>${escapeHtml$1(text)}</p>`;
      }
    }
    flush();
    return entries;
  }
  function renderFaq(info) {
    if (!info) {
      return buildLoadingBlock(__("Loading from WordPress.org…", "desktop-mode"));
    }
    const html2 = info.sections?.faq;
    if (!html2) {
      return buildEmpty(
        "editor-help",
        __("No FAQ", "desktop-mode"),
        __("This plugin doesn’t ship an FAQ.", "desktop-mode")
      );
    }
    const pairs = parseFaqPairs(html2);
    if (pairs.length === 0) {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-plugins__detail-html";
      wrap.innerHTML = sanitizeHtml(html2);
      sanitizeLinks(wrap);
      return wrap;
    }
    const stack = document.createElement("wpd-stack");
    stack.setAttribute("gap", "8");
    stack.className = "desktop-mode-plugins__detail-faq";
    pairs.forEach((pair, i) => {
      const item = document.createElement("details");
      item.className = "desktop-mode-plugins__detail-faq-item";
      if (i === 0) {
        item.setAttribute("open", "");
      }
      const summary = document.createElement("summary");
      summary.className = "desktop-mode-plugins__detail-faq-q";
      const qText = document.createElement("span");
      qText.className = "desktop-mode-plugins__detail-faq-q-text";
      qText.textContent = pair.question;
      const chevron = document.createElement("span");
      chevron.className = "desktop-mode-plugins__detail-faq-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5 L6 7.5 L9 4.5"/></svg>';
      summary.append(qText, chevron);
      const body = document.createElement("div");
      body.className = "desktop-mode-plugins__detail-faq-a desktop-mode-plugins__detail-html";
      body.innerHTML = sanitizeHtml(pair.answer);
      sanitizeLinks(body);
      item.append(summary, body);
      stack.appendChild(item);
    });
    return stack;
  }
  function parseFaqPairs(html2) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html2;
    const dts = Array.from(tmp.querySelectorAll(":scope > dt"));
    if (dts.length > 0) {
      const pairs2 = [];
      for (const dt of dts) {
        pairs2.push(splitDtIntoPair(dt));
      }
      return pairs2.filter((p) => p.question !== "");
    }
    const dl = tmp.querySelector(":scope > dl");
    if (dl) {
      const pairs2 = [];
      let current2 = null;
      for (const node of Array.from(dl.children)) {
        if (node.tagName === "DT") {
          if (current2) {
            pairs2.push({ question: current2.q, answer: current2.html.trim() });
          }
          current2 = { q: (node.textContent ?? "").trim(), html: "" };
        } else if (node.tagName === "DD" && current2) {
          current2.html += node.innerHTML;
        } else if (current2) {
          current2.html += node.outerHTML;
        }
      }
      if (current2) {
        pairs2.push({ question: current2.q, answer: current2.html.trim() });
      }
      return pairs2.filter((p) => p.question !== "");
    }
    const pairs = [];
    let current = null;
    const flush = () => {
      if (!current) {
        return;
      }
      pairs.push({ question: current.q, answer: current.html.trim() });
      current = null;
    };
    for (const node of Array.from(tmp.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        const isHeading = /^H[1-6]$/.test(el.tagName);
        const text = (el.textContent ?? "").trim();
        if (isHeading && text) {
          flush();
          current = { q: text, html: "" };
          continue;
        }
        if (!current) {
          continue;
        }
        current.html += el.outerHTML;
        continue;
      }
      if (node.nodeType === Node.TEXT_NODE && current) {
        const text = node.textContent ?? "";
        if (text.trim() === "") {
          if (current.html !== "") {
            current.html += text;
          }
          continue;
        }
        current.html += `<p>${escapeHtml$1(text)}</p>`;
      }
    }
    flush();
    return pairs.filter((p) => p.question !== "");
  }
  function splitDtIntoPair(dt) {
    let question = "";
    let answerHtml = "";
    let seenElement = false;
    for (const child of Array.from(dt.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!seenElement) {
          question += child.textContent ?? "";
        } else {
          const txt = child.textContent ?? "";
          if (txt.trim() !== "") {
            answerHtml += `<p>${escapeHtml$1(txt)}</p>`;
          }
        }
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }
      const el = child;
      if (el.tagName === "P" && (el.textContent ?? "").trim() === "") {
        continue;
      }
      seenElement = true;
      answerHtml += el.outerHTML;
    }
    return {
      question: question.replace(/\s+/g, " ").trim(),
      answer: answerHtml.trim()
    };
  }
  function escapeHtml$1(text) {
    const tmp = document.createElement("span");
    tmp.textContent = text;
    return tmp.innerHTML;
  }
  function renderReviews(slug, info) {
    const stack = document.createElement("wpd-stack");
    stack.setAttribute("gap", "16");
    if (!info) {
      stack.appendChild(buildLoadingBlock(__("Loading from WordPress.org…", "desktop-mode")));
      return stack;
    }
    stack.appendChild(buildHistogram(info));
    const body = document.createElement("div");
    body.className = "desktop-mode-plugins__detail-reviews";
    stack.appendChild(body);
    const cached = reviewsCache.get(slug);
    if (cached) {
      paintReviewList(body, cached, slug);
    } else {
      body.appendChild(buildLoadingBlock(__("Loading recent reviews…", "desktop-mode")));
      void (async () => {
        try {
          const resp = await fetchPluginReviews(slug);
          reviewsCache.set(slug, resp);
          if (body.isConnected) {
            paintReviewList(body, resp, slug);
          }
        } catch {
          if (body.isConnected) {
            body.replaceChildren(
              buildEmpty(
                "warning",
                __("Couldn’t load reviews", "desktop-mode"),
                __("WordPress.org didn’t respond. Try again in a moment.", "desktop-mode")
              )
            );
          }
        }
      })();
    }
    return stack;
  }
  function paintReviewList(host, resp, slug) {
    host.replaceChildren();
    if (!resp.parsed) {
      host.appendChild(buildReviewsFallback(slug));
      return;
    }
    if (resp.items.length === 0) {
      host.appendChild(buildWriteReviewCta(slug));
      return;
    }
    const grid = document.createElement("wpd-grid");
    grid.setAttribute("columns", "2");
    grid.setAttribute("gap", "12");
    grid.className = "desktop-mode-plugins__detail-reviews-grid";
    for (const item of resp.items) {
      grid.appendChild(buildReviewCard(item));
    }
    host.appendChild(grid);
    const more = document.createElement("div");
    more.className = "desktop-mode-plugins__detail-reviews-more";
    more.appendChild(
      linkButton(
        "ghost",
        __("Read all reviews on WordPress.org ↗", "desktop-mode"),
        `https://wordpress.org/plugins/${encodeURIComponent(slug)}/#reviews`
      )
    );
    host.appendChild(more);
  }
  function buildReviewsFallback(slug) {
    const empty = buildEmpty(
      "external",
      __("Reviews live on WordPress.org", "desktop-mode"),
      __(
        "We couldn’t pull the review feed here. Open the full thread on WordPress.org to read every review.",
        "desktop-mode"
      )
    );
    const cta = document.createElement("wpd-button");
    cta.setAttribute("slot", "cta");
    cta.setAttribute("variant", "primary");
    cta.setAttribute("size", "small");
    cta.setAttribute("data-noclick", "");
    cta.textContent = __("Open reviews on WordPress.org ↗", "desktop-mode");
    cta.addEventListener("click", () => {
      window.open(
        `https://wordpress.org/plugins/${encodeURIComponent(slug)}/#reviews`,
        "_blank",
        "noopener,noreferrer"
      );
    });
    empty.appendChild(cta);
    return empty;
  }
  function buildWriteReviewCta(slug) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__detail-reviews-cta";
    wrap.appendChild(
      linkButton(
        "primary",
        __("Write a review on WordPress.org ↗", "desktop-mode"),
        `https://wordpress.org/support/plugin/${encodeURIComponent(slug)}/reviews/#new-post`
      )
    );
    return wrap;
  }
  function buildReviewCard(item) {
    const card = document.createElement("wpd-card");
    card.setAttribute("compact", "");
    card.className = "desktop-mode-plugins__detail-review";
    const head = document.createElement("div");
    head.setAttribute("slot", "header");
    head.className = "desktop-mode-plugins__detail-review-head";
    const author = document.createElement("strong");
    author.textContent = item.author || __("Anonymous", "desktop-mode");
    head.appendChild(author);
    const stars = buildStarCluster(item.stars / 5 * 100, 0);
    head.appendChild(stars);
    if (item.date) {
      const date = document.createElement("span");
      date.className = "desktop-mode-plugins__detail-review-date";
      date.textContent = item.date;
      head.appendChild(date);
    }
    card.appendChild(head);
    if (item.excerpt) {
      const body = document.createElement("p");
      body.className = "desktop-mode-plugins__detail-review-body";
      body.textContent = item.excerpt;
      card.appendChild(body);
    }
    if (item.url) {
      const foot = document.createElement("div");
      foot.setAttribute("slot", "footer");
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("data-noclick", "");
      link.textContent = __("Read full review ↗", "desktop-mode");
      link.className = "desktop-mode-plugins__detail-review-link";
      foot.appendChild(link);
      card.appendChild(foot);
    }
    return card;
  }
  function buildHistogram(info) {
    const el = document.createElement("wpd-rating-summary");
    if (typeof info.rating === "number") {
      el.setAttribute("rating", String(info.rating));
    }
    if (info.num_ratings) {
      el.setAttribute("total", String(info.num_ratings));
    }
    const buckets = {};
    const ratings = info.ratings ?? {};
    for (const key of ["1", "2", "3", "4", "5"]) {
      const v = ratings[key];
      if (typeof v === "number") {
        buckets[key] = v;
      }
    }
    el.ratings = buckets;
    return el;
  }
  function chip(icon, label) {
    const c = document.createElement("wpd-chip");
    c.setAttribute("label", label);
    c.setAttribute("tone", "neutral");
    const ico = document.createElement("span");
    ico.setAttribute("slot", "icon");
    ico.className = `dashicons dashicons-${icon}`;
    ico.setAttribute("aria-hidden", "true");
    c.appendChild(ico);
    return c;
  }
  function buildLoadingBlock(label) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-plugins__detail-loading-block";
    const spinner = document.createElement("wpd-spinner");
    spinner.setAttribute("preset", "classic");
    spinner.setAttribute("size", "20");
    wrap.appendChild(spinner);
    const text = document.createElement("span");
    text.textContent = label;
    wrap.appendChild(text);
    return wrap;
  }
  function buildEmpty(icon, heading, description) {
    const e = document.createElement("wpd-empty-state");
    e.setAttribute("icon", `dashicons-${icon}`);
    e.setAttribute("heading", heading);
    e.setAttribute("description", description);
    return e;
  }
  function buildFallbackGlyph() {
    const span = document.createElement("span");
    span.className = "dashicons dashicons-admin-plugins";
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  function linkButton(variant, label, href) {
    const btn = document.createElement("wpd-button");
    btn.setAttribute("variant", variant);
    btn.setAttribute("size", "small");
    btn.textContent = label;
    btn.setAttribute("data-noclick", "");
    btn.addEventListener("click", () => {
      window.open(href, "_blank", "noopener,noreferrer");
    });
    return btn;
  }
  function codeNode(text) {
    const code = document.createElement("code");
    code.textContent = text;
    return code;
  }
  function externalLink(href) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = href;
    a.setAttribute("data-noclick", "");
    return a;
  }
  function sanitizeLinks(wrap) {
    wrap.querySelectorAll("a").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      a.setAttribute("data-noclick", "");
    });
  }
  function deriveSlug(row) {
    if (!row.desktop_mode_icon_url) {
      return "";
    }
    const fromUpdate = row.desktop_mode_update_available?.slug;
    if (fromUpdate) {
      return fromUpdate;
    }
    const file = typeof row.plugin === "string" ? row.plugin : "";
    if (file) {
      const slash = file.indexOf("/");
      if (slash > 0) {
        return file.slice(0, slash);
      }
    }
    if (row.textdomain) {
      return String(row.textdomain);
    }
    return "";
  }
  function readDescription(row) {
    const d = row.description;
    if (!d) {
      return "";
    }
    if (typeof d === "string") {
      return d;
    }
    return d.rendered || d.raw || "";
  }
  function formatSize$1(kb) {
    if (kb < 1024) {
      return sprintf(
        /* translators: %d: kilobytes */
        __("%d KB", "desktop-mode"),
        kb
      );
    }
    return sprintf(
      /* translators: %s: megabytes (one decimal) */
      __("%s MB", "desktop-mode"),
      (kb / 1024).toFixed(1)
    );
  }
  function humanDate(raw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (!m) {
      return raw;
    }
    try {
      return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString();
    } catch {
      return raw;
    }
  }
  function stripHtml$1(html2) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html2;
    return tmp.textContent ?? "";
  }
  function sanitizeHtml(html2) {
    const allowed = /* @__PURE__ */ new Set([
      "A",
      "ABBR",
      "B",
      "BLOCKQUOTE",
      "BR",
      "CODE",
      "DD",
      "DEL",
      "DIV",
      "DL",
      "DT",
      "EM",
      "FIGCAPTION",
      "FIGURE",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "HR",
      "I",
      "IMG",
      "KBD",
      "LI",
      "OL",
      "P",
      "PRE",
      "Q",
      "S",
      "SMALL",
      "SPAN",
      "STRONG",
      "SUB",
      "SUP",
      "TABLE",
      "TBODY",
      "TD",
      "TFOOT",
      "TH",
      "THEAD",
      "TR",
      "U",
      "UL"
    ]);
    const allowedAttrs = /* @__PURE__ */ new Set([
      "href",
      "src",
      "alt",
      "title",
      "name",
      "rel",
      "target",
      "colspan",
      "rowspan"
    ]);
    const wrap = document.createElement("div");
    wrap.innerHTML = html2;
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];
    let current = walker.currentNode;
    while (current) {
      const next = walker.nextNode();
      if (current === wrap) {
        current = next;
        continue;
      }
      if (!allowed.has(current.tagName)) {
        toRemove.push(current);
      } else {
        for (const attr of Array.from(current.attributes)) {
          if (!allowedAttrs.has(attr.name.toLowerCase())) {
            current.removeAttribute(attr.name);
          }
        }
        if (current.tagName === "A") {
          const href = current.getAttribute("href") ?? "";
          if (href.toLowerCase().startsWith("javascript:")) {
            current.removeAttribute("href");
          }
        }
        if (current.tagName === "IMG") {
          const src = current.getAttribute("src") ?? "";
          if (src.toLowerCase().startsWith("javascript:")) {
            current.removeAttribute("src");
          }
        }
      }
      current = next;
    }
    for (const el of toRemove) {
      const text = document.createTextNode(el.textContent ?? "");
      el.replaceWith(text);
    }
    return wrap.innerHTML;
  }
  const PANEL_STYLES = `
.desktop-mode-plugins__detail {
	display: block;
	background: var( --wpd-surface-subtle, rgba( 0, 0, 0, 0.025 ) );
	border-block-start: 1px solid var( --wpd-border, rgba( 0, 0, 0, 0.08 ) );
	border-block-end: 1px solid var( --wpd-border, rgba( 0, 0, 0, 0.08 ) );
	color: var( --wpd-fg, inherit );
	font-size: 13px;
	line-height: 1.55;
}

/* Hero */
.desktop-mode-plugins__detail-hero {
	background: var( --wpd-surface-raised, rgba( 255, 255, 255, 0.6 ) );
	border-block-end: 1px solid var( --wpd-border, rgba( 0, 0, 0, 0.08 ) );
}
.desktop-mode-plugins__detail-hero-inner {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 14px 24px;
}
.desktop-mode-plugins__detail-hero-icon {
	flex: 0 0 44px;
	width: 44px;
	height: 44px;
	border-radius: 10px;
	overflow: hidden;
	background: var( --wpd-surface, rgba( 0, 0, 0, 0.04 ) );
	box-shadow: 0 0 0 1px var( --wpd-border, rgba( 0, 0, 0, 0.08 ) ) inset;
	display: flex;
	align-items: center;
	justify-content: center;
}
.desktop-mode-plugins__detail-hero-icon img {
	width: 100%;
	height: 100%;
	max-width: 100%;
	max-height: 100%;
	object-fit: contain;
	display: block;
}
.desktop-mode-plugins__detail-hero-icon .dashicons {
	font-size: 20px;
	width: 20px;
	height: 20px;
	line-height: 20px;
	color: var( --wpd-fg-muted, #888 );
}
.desktop-mode-plugins__detail-hero-text {
	flex: 1 1 auto;
	min-width: 0;
}
.desktop-mode-plugins__detail-title {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
	line-height: 1.25;
	letter-spacing: -0.005em;
	color: var( --wpd-fg, inherit );
}
.desktop-mode-plugins__detail-byline {
	margin: 0;
	font-size: 12.5px;
	color: var( --wpd-fg-muted, #666 );
}
.desktop-mode-plugins__detail-byline a {
	color: inherit;
	text-decoration: underline;
	text-decoration-color: var( --wpd-border-strong, rgba( 0, 0, 0, 0.25 ) );
}
.desktop-mode-plugins__detail-byline a:hover {
	color: var( --wp-admin-theme-color, #2271b1 );
}

/* Tab strip */
.desktop-mode-plugins__detail-tabs-wrap {
	padding: 0 24px;
	background: var( --wpd-surface-raised, rgba( 255, 255, 255, 0.6 ) );
	border-block-end: 1px solid var( --wpd-border, rgba( 0, 0, 0, 0.08 ) );
}
.desktop-mode-plugins__detail-tabs {
	display: block;
}

/* Body */
.desktop-mode-plugins__detail-body {
	padding: 22px 24px 26px;
	max-width: 100%;
}

/* Overview chip strip */
.desktop-mode-plugins__detail-chip-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
}
.desktop-mode-plugins__detail-stars-pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 12px;
	border-radius: 999px;
	background: rgba( 234, 179, 8, 0.12 );
	color: #8a5a00;
	font-size: 12px;
	font-weight: 600;
}
.desktop-mode-plugins__detail-actions {
	padding-top: 4px;
}

/* Sanitized HTML body (description / changelog / FAQ answers) */
.desktop-mode-plugins__detail-html {
	color: var( --wpd-fg, inherit );
	font-size: 14px;
	line-height: 1.65;
	max-width: 78ch;
}
.desktop-mode-plugins__detail-html h1,
.desktop-mode-plugins__detail-html h2,
.desktop-mode-plugins__detail-html h3,
.desktop-mode-plugins__detail-html h4 {
	margin: 16px 0 6px;
	line-height: 1.3;
	font-weight: 600;
}
.desktop-mode-plugins__detail-html h1 { font-size: 18px; }
.desktop-mode-plugins__detail-html h2 { font-size: 16px; }
.desktop-mode-plugins__detail-html h3 { font-size: 14.5px; }
.desktop-mode-plugins__detail-html h4 { font-size: 13.5px; }
.desktop-mode-plugins__detail-html p {
	margin: 0 0 10px;
}
.desktop-mode-plugins__detail-html ul,
.desktop-mode-plugins__detail-html ol {
	margin: 0 0 10px;
	padding-inline-start: 22px;
}
.desktop-mode-plugins__detail-html li { margin-bottom: 4px; }
.desktop-mode-plugins__detail-html code,
.desktop-mode-plugins__detail-html pre {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12px;
	background: rgba( 0, 0, 0, 0.06 );
	border-radius: 4px;
}
.desktop-mode-plugins__detail-html code { padding: 1px 6px; }
.desktop-mode-plugins__detail-html pre {
	padding: 10px 12px;
	overflow-x: auto;
	margin: 0 0 10px;
}
.desktop-mode-plugins__detail-html pre code {
	background: transparent;
	padding: 0;
}
.desktop-mode-plugins__detail-html a {
	color: var( --wp-admin-theme-color, #2271b1 );
}
.desktop-mode-plugins__detail-html img {
	display: block;
	max-width: 100%;
	max-height: 220px;
	width: auto;
	height: auto;
	object-fit: contain;
	margin: 8px 0;
	border-radius: 6px;
}

/* Details fact cards */
.desktop-mode-plugins__detail-grid {
	width: 100%;
}
.desktop-mode-plugins__detail-fact {
	min-width: 0;
}
.desktop-mode-plugins__detail-fact-head {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var( --wpd-fg-muted, #666 );
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.desktop-mode-plugins__detail-fact-head .dashicons {
	font-size: 14px;
	width: 14px;
	height: 14px;
	line-height: 14px;
}
.desktop-mode-plugins__detail-fact-value {
	font-size: 14px;
	color: var( --wpd-fg, inherit );
	word-break: break-word;
	overflow-wrap: anywhere;
	font-weight: 500;
}
.desktop-mode-plugins__detail-fact-value code {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12.5px;
	background: rgba( 0, 0, 0, 0.06 );
	padding: 2px 7px;
	border-radius: 4px;
	font-weight: 400;
}
.desktop-mode-plugins__detail-fact-value a {
	color: var( --wp-admin-theme-color, #2271b1 );
	text-decoration: none;
}
.desktop-mode-plugins__detail-fact-value a:hover {
	text-decoration: underline;
}

/* Changelog — version-grouped cards */
.desktop-mode-plugins__detail-changelog {
	width: 100%;
}
.desktop-mode-plugins__detail-changelog-entry {
	width: 100%;
}
.desktop-mode-plugins__detail-changelog-head {
	display: flex;
	align-items: center;
	gap: 10px;
}
.desktop-mode-plugins__detail-changelog-latest {
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var( --wpd-fg-muted, #666 );
}

/* FAQ — accordion */
.desktop-mode-plugins__detail-faq {
	width: 100%;
}
.desktop-mode-plugins__detail-faq-item {
	background: var( --wpd-surface-raised, rgba( 255, 255, 255, 0.7 ) );
	border: 1px solid var( --wpd-border, rgba( 0, 0, 0, 0.08 ) );
	border-radius: 12px;
	overflow: hidden;
	transition: box-shadow 160ms ease, border-color 160ms ease;
}
.desktop-mode-plugins__detail-faq-item[open] {
	border-color: var( --wp-admin-theme-color, #2271b1 );
	box-shadow: 0 4px 14px rgba( 0, 0, 0, 0.06 );
}
.desktop-mode-plugins__detail-faq-q {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 14px 16px;
	cursor: pointer;
	list-style: none;
	user-select: none;
}
.desktop-mode-plugins__detail-faq-q::-webkit-details-marker {
	display: none;
}
.desktop-mode-plugins__detail-faq-q:hover {
	background: rgba( 0, 0, 0, 0.025 );
}
.desktop-mode-plugins__detail-faq-q-text {
	flex: 1 1 auto;
	font-size: 14px;
	font-weight: 600;
	color: var( --wpd-fg, inherit );
	line-height: 1.4;
}
.desktop-mode-plugins__detail-faq-chevron {
	flex: 0 0 auto;
	width: 24px;
	height: 24px;
	border-radius: 50%;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: rgba( 0, 0, 0, 0.05 );
	color: var( --wpd-fg-muted, #555 );
	transition: transform 200ms cubic-bezier( 0.2, 0.8, 0.2, 1 ), background 160ms ease;
}
.desktop-mode-plugins__detail-faq-item[open] .desktop-mode-plugins__detail-faq-chevron {
	transform: rotate( 180deg );
	background: var( --wp-admin-theme-color, #2271b1 );
	color: #fff;
}
.desktop-mode-plugins__detail-faq-a {
	padding: 4px 16px 16px;
	border-block-start: 1px solid var( --wpd-border, rgba( 0, 0, 0, 0.06 ) );
	background: rgba( 0, 0, 0, 0.012 );
}
@media ( prefers-reduced-motion: reduce ) {
	.desktop-mode-plugins__detail-faq-chevron,
	.desktop-mode-plugins__detail-faq-item {
		transition: none;
	}
}

/* Reviews */
.desktop-mode-plugins__detail-reviews {
	width: 100%;
}
.desktop-mode-plugins__detail-reviews-grid {
	width: 100%;
}
.desktop-mode-plugins__detail-reviews-more,
.desktop-mode-plugins__detail-reviews-cta {
	display: flex;
	justify-content: center;
	padding-top: 12px;
}
.desktop-mode-plugins__detail-review {
	width: 100%;
	height: 100%;
	box-sizing: border-box;
}
.desktop-mode-plugins__detail-review-body {
	display: -webkit-box;
	-webkit-line-clamp: 4;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
@media ( max-width: 720px ) {
	.desktop-mode-plugins__detail-reviews-grid {
		grid-template-columns: 1fr !important;
	}
}
.desktop-mode-plugins__detail-review-head {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}
.desktop-mode-plugins__detail-review-date {
	margin-inline-start: auto;
	font-size: 11.5px;
	color: var( --wpd-fg-muted, #888 );
}
.desktop-mode-plugins__detail-review-body {
	margin: 0;
	font-size: 13px;
	color: var( --wpd-fg, inherit );
	line-height: 1.55;
}
.desktop-mode-plugins__detail-review-link {
	font-size: 12px;
	font-weight: 600;
	color: var( --wp-admin-theme-color, #2271b1 );
	text-decoration: none;
}
.desktop-mode-plugins__detail-review-link:hover {
	text-decoration: underline;
}

/* Loading block */
.desktop-mode-plugins__detail-loading-block {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	padding: 12px 14px;
	border-radius: 10px;
	background: var( --wpd-surface-raised, rgba( 255, 255, 255, 0.7 ) );
	border: 1px solid var( --wpd-border, rgba( 0, 0, 0, 0.08 ) );
	color: var( --wpd-fg-muted, #666 );
	font-size: 13px;
}

@media ( max-width: 720px ) {
	.desktop-mode-plugins__detail-grid {
		grid-template-columns: 1fr !important;
	}
}
`;
  const PLUGINS_CHANGED_TOPIC = "desktop-mode.plugin.changed";
  const SOURCE = "installed-view";
  function toast(message, duration = 3500) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.showToast === "function") {
      api2.showToast({ message, duration });
      return;
    }
    console.log("[plugins-window]", message);
  }
  async function confirm(opts) {
    const api2 = window.wp?.desktop;
    if (api2 && typeof api2.confirm === "function") {
      return api2.confirm(opts);
    }
    return Promise.resolve(true);
  }
  function mountInstalledView(host) {
    host.replaceChildren();
    const state = {
      rows: [],
      statusFilter: "",
      search: "",
      loading: true,
      updating: /* @__PURE__ */ new Set(),
      autoUpdating: /* @__PURE__ */ new Set()
    };
    const toolbar = document.createElement("header");
    toolbar.className = "desktop-mode-plugins__toolbar";
    const left = document.createElement("div");
    left.className = "desktop-mode-plugins__toolbar-left";
    const statusFilter = document.createElement("wpd-segmented");
    statusFilter.setAttribute("value", "");
    const statusOptions = [
      { value: "", label: __("All", "desktop-mode") },
      { value: "active", label: __("Active", "desktop-mode") },
      { value: "inactive", label: __("Inactive", "desktop-mode") },
      { value: "update", label: __("Update available", "desktop-mode") }
    ];
    let updateCountBadge = null;
    for (const opt of statusOptions) {
      const seg = document.createElement("wpd-segment");
      seg.setAttribute("value", opt.value);
      if (opt.value === "update") {
        const label = document.createElement("span");
        label.textContent = opt.label;
        seg.appendChild(label);
        const badge = document.createElement("wpd-badge");
        badge.setAttribute("tone", "warning");
        badge.setAttribute("no-dot", "");
        badge.style.cssText = "margin-inline-start:6px;";
        badge.hidden = true;
        seg.appendChild(badge);
        updateCountBadge = badge;
      } else {
        seg.textContent = opt.label;
      }
      statusFilter.appendChild(seg);
    }
    statusFilter.addEventListener("wpd-pick", (ev) => {
      const detail = ev.detail;
      state.statusFilter = detail?.value ?? "";
      paintTable();
    });
    const search = document.createElement("wpd-text-field");
    search.setAttribute(
      "placeholder",
      __("Search installed plugins…", "desktop-mode")
    );
    let searchDebounce;
    search.addEventListener("wpd-input-change", (ev) => {
      const value = ev.detail?.value ?? "";
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        state.search = value;
        paintTable();
      }, 200);
    });
    left.append(statusFilter, search);
    const right = document.createElement("div");
    right.className = "desktop-mode-plugins__toolbar-right";
    const bulkBar = document.createElement("div");
    bulkBar.className = "desktop-mode-plugins__bulk";
    bulkBar.hidden = true;
    right.appendChild(bulkBar);
    const trailing = document.createElement("div");
    trailing.className = "desktop-mode-plugins__toolbar-trailing";
    const refreshButton = document.createElement("wpd-button");
    refreshButton.setAttribute("variant", "ghost");
    refreshButton.setAttribute("title", __("Refresh", "desktop-mode"));
    refreshButton.innerHTML = '<span class="dashicons dashicons-update" aria-hidden="true"></span>';
    refreshButton.addEventListener("click", () => {
      void (async () => {
        await reload({ force: true });
        void refreshFrameworkMenu();
      })();
    });
    trailing.appendChild(refreshButton);
    toolbar.append(left, right, trailing);
    const tableWrap = document.createElement("div");
    tableWrap.className = "desktop-mode-plugins__body";
    const table = document.createElement("wpd-table");
    table.setAttribute("selectable", "multi");
    table.setAttribute("sticky-header", "");
    table.setAttribute("sticky-columns", "1");
    table.setAttribute("hover", "");
    table.setAttribute("striped", "");
    table.setAttribute("bordered", "");
    table.setAttribute("loading", "");
    table.setAttribute("data-installed-rows", "");
    const empty = document.createElement("div");
    empty.setAttribute("slot", "empty");
    empty.className = "desktop-mode-plugins__empty";
    empty.innerHTML = '<span class="dashicons dashicons-admin-plugins" aria-hidden="true"></span><p>' + __("No plugins match your filters.", "desktop-mode") + "</p>";
    table.appendChild(empty);
    const getRowId = (row, index) => row.plugin || String(index);
    table.getRowId = getRowId;
    table.columns = buildColumns();
    table.subTable = (row) => buildInstalledDetail(row);
    table.addEventListener("wpd-table-row-click", (ev) => {
      const detail = ev.detail;
      if (!detail) {
        return;
      }
      if (table.isExpanded(detail.index)) {
        table.collapse(detail.index);
      } else {
        table.expand(detail.index);
      }
    });
    tableWrap.appendChild(table);
    host.append(toolbar, tableWrap);
    const selectionListener = (ev) => {
      const detail = ev.detail;
      const ids = detail?.selection ?? [];
      paintBulkBar(ids);
    };
    table.addEventListener("wpd-table-selection-change", selectionListener);
    void reload();
    function buildColumns() {
      const cfg = getConfig();
      const cols = [
        {
          key: "name",
          label: __("Plugin", "desktop-mode"),
          sortable: true,
          sticky: true,
          render: (_value, row) => renderNameCell(row)
        },
        {
          key: "status",
          label: __("Status", "desktop-mode"),
          sortable: true,
          render: (_value, row) => renderStatusCell(row)
        },
        {
          key: "version",
          label: __("Version", "desktop-mode"),
          sortable: true,
          render: (_value, row) => renderVersionCell(row)
        },
        {
          key: "author",
          label: __("Author", "desktop-mode"),
          render: (_value, row) => renderAuthorCell(row)
        },
        {
          key: "desktop_mode_size_kb",
          label: __("Size", "desktop-mode"),
          align: "end",
          sortable: true,
          sortValue: (row) => row.desktop_mode_size_kb ?? 0,
          render: (_value, row) => formatSize(row.desktop_mode_size_kb ?? null)
        }
      ];
      if (cfg.autoUpdatesEnabled) {
        cols.push({
          key: "auto_updates",
          label: __("Automatic Updates", "desktop-mode"),
          sortable: true,
          sortValue: (row) => row.desktop_mode_auto_update?.enabled ? 1 : 0,
          render: (_value, row) => renderAutoUpdateCell(row)
        });
      }
      cols.push({
        key: "_actions",
        label: "",
        align: "end",
        render: (_value, row) => renderActionsCell(row)
      });
      return cfg.caps.activate || cfg.caps.delete ? cols : cols.slice(0, -1);
    }
    function renderNameCell(row) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;align-items:center;gap:12px;min-width:0;padding:4px 0;";
      const icon = document.createElement("div");
      icon.style.cssText = "flex:0 0 32px;width:32px;height:32px;max-width:32px;max-height:32px;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.04);box-sizing:border-box;";
      const url = row.desktop_mode_icon_url;
      if (url) {
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.style.cssText = "width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;display:block;";
        img.src = attachIconFallback(img, url, () => {
          icon.replaceChildren(buildFallbackIcon());
        });
        icon.appendChild(img);
      } else {
        icon.appendChild(buildFallbackIcon());
      }
      const text = document.createElement("div");
      text.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto;line-height:1.35;";
      const title = document.createElement("strong");
      title.textContent = row.name || row.plugin;
      title.style.cssText = "display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      const path = document.createElement("span");
      path.textContent = row.plugin;
      path.style.cssText = "display:block;font-size:0.78em;color:#888;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      text.append(title, path);
      wrap.append(icon, text);
      return wrap;
    }
    function buildFallbackIcon() {
      const fallback = document.createElement("span");
      fallback.className = "dashicons dashicons-admin-plugins";
      fallback.setAttribute("aria-hidden", "true");
      fallback.style.cssText = "font-size:18px;width:18px;height:18px;line-height:18px;color:#888;";
      return fallback;
    }
    function renderStatusCell(row) {
      const badge = document.createElement("span");
      const isActive = row.status === "active" || row.status === "active-network";
      const dot = isActive ? "#16a34a" : "#9ca3af";
      const bg = isActive ? "rgba(22, 163, 74, 0.14)" : "rgba(120, 120, 120, 0.12)";
      const fg = isActive ? "#166e37" : "#555";
      badge.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 8px;border-radius:999px;font-size:0.78em;font-weight:600;line-height:1.4;white-space:nowrap;background:${bg};color:${fg};`;
      const dotEl = document.createElement("span");
      dotEl.style.cssText = `width:6px;height:6px;border-radius:50%;background:${dot};flex:0 0 auto;display:inline-block;`;
      badge.appendChild(dotEl);
      const label = document.createElement("span");
      label.textContent = isActive ? __("Active", "desktop-mode") : __("Inactive", "desktop-mode");
      badge.appendChild(label);
      return badge;
    }
    function renderVersionCell(row) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
      const v = document.createElement("span");
      v.textContent = row.version ?? "—";
      wrap.appendChild(v);
      const update = row.desktop_mode_update_available;
      if (update?.available && update.new_version) {
        const badge = document.createElement("span");
        badge.style.cssText = "font-size:0.78em;background:rgba(245,175,0,0.18);color:#915f00;padding:1px 7px;border-radius:999px;font-weight:600;";
        badge.textContent = sprintf(
          /* translators: %s: new plugin version */
          __("→ %s", "desktop-mode"),
          update.new_version
        );
        wrap.appendChild(badge);
      }
      return wrap;
    }
    function renderAuthorCell(row) {
      const wrap = document.createElement("span");
      wrap.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;";
      const text = stripHtml(row.author ?? "");
      wrap.textContent = text || __("Unknown", "desktop-mode");
      return wrap;
    }
    function renderAutoUpdateCell(row) {
      const wrap = document.createElement("div");
      wrap.setAttribute("data-noclick", "");
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;white-space:nowrap;";
      const meta = row.desktop_mode_auto_update;
      const forced = meta?.forced ?? null;
      if (forced !== null) {
        const label2 = document.createElement("span");
        label2.style.cssText = "color:var(--wp-desktop-text-muted,#666);";
        label2.textContent = forced ? __("Auto-updates enabled", "desktop-mode") : __("Auto-updates disabled", "desktop-mode");
        wrap.appendChild(label2);
        return wrap;
      }
      const supported = !!meta?.supported;
      if (!supported) {
        const placeholder = document.createElement("span");
        placeholder.style.cssText = "color:var(--wp-desktop-text-muted,#9ca3af);";
        placeholder.textContent = "—";
        placeholder.title = __(
          "This plugin does not check in with WordPress.org, so automatic updates can't be scheduled.",
          "desktop-mode"
        );
        wrap.appendChild(placeholder);
        return wrap;
      }
      const enabled = !!meta?.enabled;
      const busy = state.autoUpdating.has(row.plugin);
      const link = document.createElement("a");
      link.href = "#";
      link.setAttribute("role", "button");
      link.setAttribute("data-wp-action", enabled ? "disable" : "enable");
      link.style.cssText = "display:inline-flex;align-items:center;gap:6px;color:var(--wp-desktop-accent,#2271b1);text-decoration:none;cursor:pointer;font-size:0.9em;";
      if (busy) {
        link.style.opacity = "0.6";
        link.style.pointerEvents = "none";
        link.setAttribute("aria-busy", "true");
      }
      const label = document.createElement("span");
      if (busy) {
        label.textContent = enabled ? __("Disabling…", "desktop-mode") : __("Enabling…", "desktop-mode");
      } else {
        label.textContent = enabled ? __("Disable auto-updates", "desktop-mode") : __("Enable auto-updates", "desktop-mode");
      }
      link.appendChild(label);
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void runToggleAutoUpdate(row);
      });
      wrap.appendChild(link);
      return wrap;
    }
    function renderActionsCell(row) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:inline-flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:nowrap;";
      wrap.setAttribute("data-noclick", "");
      const can = row.desktop_mode_can_manage ?? {
        activate: row.status === "inactive",
        deactivate: row.status === "active" || row.status === "active-network",
        delete: row.status === "inactive"
      };
      const update = row.desktop_mode_update_available;
      if (getConfig().caps.update && update?.available) {
        if (update.package) {
          const updating = state.updating.has(row.plugin);
          const label = updating ? __("Updating…", "desktop-mode") : sprintf(
            /* translators: %s: new plugin version (e.g. "1.4.2") */
            __("Update to %s", "desktop-mode"),
            update.new_version ?? ""
          );
          const btn = button2(label, "primary");
          if (updating) {
            btn.setAttribute("disabled", "");
            btn.setAttribute("aria-busy", "true");
          }
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            void runUpdate(row);
          });
          wrap.appendChild(btn);
        } else {
          const hint = document.createElement("span");
          hint.style.cssText = "font-size:0.78em;color:var(--wp-desktop-text-muted,#666);";
          hint.textContent = __("Auto-update unavailable", "desktop-mode");
          hint.title = __(
            "This plugin does not ship a wp.org download package. Update it manually from its source.",
            "desktop-mode"
          );
          wrap.appendChild(hint);
        }
      }
      if (can.activate) {
        const btn = button2(__("Activate", "desktop-mode"), "primary");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          void runActivate(row);
        });
        wrap.appendChild(btn);
      } else if (can.deactivate) {
        const btn = button2(__("Deactivate", "desktop-mode"), "secondary");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          void runDeactivate(row);
        });
        wrap.appendChild(btn);
      }
      if (can.delete) {
        const btn = button2(__("Delete", "desktop-mode"), "danger");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          void runDelete(row);
        });
        wrap.appendChild(btn);
      }
      return wrap;
    }
    function button2(label, variant) {
      const b = document.createElement("wpd-button");
      b.setAttribute("variant", variant);
      b.setAttribute("size", "small");
      b.textContent = label;
      return b;
    }
    function paintBulkBar(ids) {
      bulkBar.replaceChildren();
      if (ids.length === 0) {
        bulkBar.hidden = true;
        return;
      }
      bulkBar.hidden = false;
      const count = document.createElement("span");
      count.className = "desktop-mode-plugins__bulk-count";
      count.textContent = sprintf(
        /* translators: %d: number of selected plugins */
        __("%d selected", "desktop-mode"),
        ids.length
      );
      bulkBar.appendChild(count);
      const cfg = getConfig();
      const selected = state.rows.filter((r) => ids.includes(r.plugin));
      if (cfg.caps.update) {
        const updatable = selected.filter(
          (r) => !!r.desktop_mode_update_available?.available && !!r.desktop_mode_update_available.package
        );
        if (updatable.length > 0) {
          const btn = button2(
            sprintf(
              /* translators: %d: number of plugins with pending updates */
              __("Update %d", "desktop-mode"),
              updatable.length
            ),
            "primary"
          );
          btn.addEventListener("click", () => {
            void runBulk(updatable, "update");
          });
          bulkBar.appendChild(btn);
        }
      }
      if (cfg.caps.activate) {
        const activatable = selected.filter((r) => r.status === "inactive");
        if (activatable.length > 0) {
          const btn = button2(__("Activate", "desktop-mode"), "primary");
          btn.addEventListener("click", () => {
            void runBulk(activatable, "activate");
          });
          bulkBar.appendChild(btn);
        }
        const deactivatable = selected.filter(
          (r) => r.status === "active" || r.status === "active-network"
        );
        if (deactivatable.length > 0) {
          const btn = button2(__("Deactivate", "desktop-mode"), "secondary");
          btn.addEventListener("click", () => {
            void runBulk(deactivatable, "deactivate");
          });
          bulkBar.appendChild(btn);
        }
      }
      if (cfg.caps.delete) {
        const deletable = selected.filter((r) => r.status === "inactive");
        if (deletable.length > 0) {
          const btn = button2(__("Delete", "desktop-mode"), "danger");
          btn.addEventListener("click", () => {
            void runBulk(deletable, "delete");
          });
          bulkBar.appendChild(btn);
        }
      }
    }
    async function reload(opts = {}) {
      state.loading = true;
      table.setAttribute("loading", "");
      try {
        state.rows = await fetchInstalledPlugins(opts);
      } catch (err) {
        toast(
          sprintf(
            /* translators: %s: error message */
            __("Could not load plugins: %s", "desktop-mode"),
            describe(err)
          ),
          6e3
        );
        state.rows = [];
      }
      state.loading = false;
      paintTable();
    }
    function paintTable() {
      if (state.loading) {
        table.setAttribute("loading", "");
      } else {
        table.removeAttribute("loading");
      }
      table.data = filterRows(state.rows);
      paintUpdateCount();
    }
    function paintUpdateCount() {
      if (!updateCountBadge) {
        return;
      }
      const count = state.rows.filter(
        (r) => !!r.desktop_mode_update_available?.available
      ).length;
      if (count > 0) {
        updateCountBadge.textContent = String(count);
        updateCountBadge.hidden = false;
      } else {
        updateCountBadge.hidden = true;
        updateCountBadge.textContent = "";
      }
    }
    function filterRows(rows) {
      const q = state.search.trim().toLowerCase();
      const status = state.statusFilter;
      return rows.filter((row) => {
        if (status === "active") {
          if (row.status !== "active" && row.status !== "active-network") {
            return false;
          }
        } else if (status === "inactive") {
          if (row.status !== "inactive") {
            return false;
          }
        } else if (status === "update") {
          if (!row.desktop_mode_update_available?.available) {
            return false;
          }
        }
        if (q !== "") {
          const haystack = `${row.name ?? ""} ${row.plugin} ${stripHtml(row.author ?? "")}`.toLowerCase();
          if (!haystack.includes(q)) {
            return false;
          }
        }
        return true;
      });
    }
    async function runActivate(row) {
      const previous = row.status;
      applyStatusOptimistic(row, "active");
      try {
        const updated = await activateInstalledPlugin(row);
        mergeRow(updated);
        toast(
          sprintf(
            /* translators: %s: plugin name */
            __("%s activated.", "desktop-mode"),
            row.name || row.plugin
          )
        );
        broadcast(PLUGINS_CHANGED_TOPIC, {
          source: SOURCE,
          plugin: row.plugin,
          action: "activate"
        });
        void refreshFrameworkMenu();
      } catch (err) {
        applyStatusOptimistic(row, previous);
        toast(
          sprintf(
            /* translators: %s: error message */
            __("Activation failed: %s", "desktop-mode"),
            describe(err)
          ),
          6e3
        );
      }
    }
    async function runDeactivate(row) {
      const previous = row.status;
      applyStatusOptimistic(row, "inactive");
      try {
        const updated = await deactivateInstalledPlugin(row);
        mergeRow(updated);
        if (isDesktopModeSelf(row.plugin)) {
          toast(
            __(
              "Desktop Mode deactivated. Reloading…",
              "desktop-mode"
            ),
            2e3
          );
          reloadOutOfDesktopMode();
          return;
        }
        toast(
          sprintf(
            /* translators: %s: plugin name */
            __("%s deactivated.", "desktop-mode"),
            row.name || row.plugin
          )
        );
        broadcast(PLUGINS_CHANGED_TOPIC, {
          source: SOURCE,
          plugin: row.plugin,
          action: "deactivate"
        });
        void refreshFrameworkMenu();
      } catch (err) {
        applyStatusOptimistic(row, previous);
        toast(
          sprintf(
            /* translators: %s: error message */
            __("Deactivation failed: %s", "desktop-mode"),
            describe(err)
          ),
          6e3
        );
      }
    }
    async function runDelete(row) {
      const ok = await confirm({
        title: __("Delete plugin?", "desktop-mode"),
        message: sprintf(
          /* translators: %s: plugin name */
          __(
            "Permanently delete %s? Its files will be removed from disk. This cannot be undone.",
            "desktop-mode"
          ),
          row.name || row.plugin
        ),
        confirmLabel: __("Delete", "desktop-mode"),
        danger: true
      });
      if (!ok) {
        return;
      }
      try {
        await deleteInstalledPlugin(row);
        state.rows = state.rows.filter((r) => r.plugin !== row.plugin);
        paintTable();
        if (isDesktopModeSelf(row.plugin)) {
          toast(
            __(
              "Desktop Mode deleted. Reloading…",
              "desktop-mode"
            ),
            2e3
          );
          reloadOutOfDesktopMode();
          return;
        }
        toast(
          sprintf(
            /* translators: %s: plugin name */
            __("%s deleted.", "desktop-mode"),
            row.name || row.plugin
          )
        );
        broadcast(PLUGINS_CHANGED_TOPIC, {
          source: SOURCE,
          plugin: row.plugin,
          action: "delete"
        });
        void refreshFrameworkMenu();
      } catch (err) {
        toast(
          sprintf(
            /* translators: %s: error message */
            __("Delete failed: %s", "desktop-mode"),
            describe(err)
          ),
          6e3
        );
      }
    }
    async function runUpdate(row) {
      if (state.updating.has(row.plugin)) {
        return;
      }
      state.updating.add(row.plugin);
      paintTable();
      try {
        const result = await enqueueUpdateJob(() => updateInstalledPlugin(row));
        mergeRow({
          ...row,
          version: result.newVersion,
          desktop_mode_update_available: {
            available: false,
            new_version: null,
            package: "",
            slug: row.desktop_mode_update_available?.slug ?? ""
          }
        });
        toast(
          sprintf(
            /* translators: 1: plugin name, 2: new version */
            __("%1$s updated to %2$s.", "desktop-mode"),
            row.name || row.plugin,
            result.newVersion
          )
        );
        broadcast(PLUGINS_CHANGED_TOPIC, {
          source: SOURCE,
          plugin: row.plugin,
          action: "update"
        });
        void refreshFrameworkMenu();
      } catch (err) {
        const errCode = err?.code;
        const errMessage = err?.message;
        const coreUpToDateMessage = window.wp?.i18n?.__?.("The plugin is at the latest version.");
        const isUpToDate = errCode === "up_to_date" || !!coreUpToDateMessage && errMessage === coreUpToDateMessage;
        if (isUpToDate) {
          mergeRow({
            ...row,
            desktop_mode_update_available: {
              available: false,
              new_version: null,
              package: "",
              slug: row.desktop_mode_update_available?.slug ?? ""
            }
          });
          toast(
            sprintf(
              /* translators: %s: plugin name */
              __("%s is already up to date.", "desktop-mode"),
              row.name || row.plugin
            )
          );
          broadcast(PLUGINS_CHANGED_TOPIC, {
            source: SOURCE,
            plugin: row.plugin,
            action: "update"
          });
        } else {
          toast(
            sprintf(
              /* translators: 1: plugin name, 2: error message */
              __("Update of %1$s failed: %2$s", "desktop-mode"),
              row.name || row.plugin,
              describe(err)
            ),
            6e3
          );
          void reload();
        }
        void refreshFrameworkMenu();
      } finally {
        state.updating.delete(row.plugin);
        paintTable();
      }
    }
    async function runToggleAutoUpdate(row) {
      if (state.autoUpdating.has(row.plugin)) {
        return;
      }
      const meta = row.desktop_mode_auto_update;
      if (!meta || meta.forced !== null || !meta.supported) {
        return;
      }
      const wasEnabled = meta.enabled;
      const nextState = wasEnabled ? "disable" : "enable";
      state.autoUpdating.add(row.plugin);
      paintTable();
      try {
        await toggleAutoUpdate(row, nextState);
        mergeRow({
          ...row,
          desktop_mode_auto_update: {
            ...meta,
            enabled: !wasEnabled
          }
        });
        toast(
          wasEnabled ? sprintf(
            /* translators: %s: plugin name */
            __("Auto-updates disabled for %s.", "desktop-mode"),
            row.name || row.plugin
          ) : sprintf(
            /* translators: %s: plugin name */
            __("Auto-updates enabled for %s.", "desktop-mode"),
            row.name || row.plugin
          )
        );
        broadcast(PLUGINS_CHANGED_TOPIC, {
          source: SOURCE,
          plugin: row.plugin,
          action: "auto-update"
        });
      } catch (err) {
        toast(
          sprintf(
            /* translators: 1: plugin name, 2: error message */
            __(
              "Could not toggle auto-updates for %1$s: %2$s",
              "desktop-mode"
            ),
            row.name || row.plugin,
            describe(err)
          ),
          6e3
        );
      } finally {
        state.autoUpdating.delete(row.plugin);
        paintTable();
      }
    }
    async function runBulk(rows, action) {
      if (rows.length === 0) {
        return;
      }
      if (action === "delete") {
        const ok = await confirm({
          title: __("Delete selected plugins?", "desktop-mode"),
          message: sprintf(
            /* translators: %d: number of plugins */
            __(
              "Permanently delete %d plugin(s)? Their files will be removed from disk. This cannot be undone.",
              "desktop-mode"
            ),
            rows.length
          ),
          confirmLabel: __("Delete", "desktop-mode"),
          danger: true
        });
        if (!ok) {
          return;
        }
      }
      let succeeded = 0;
      let selfMutated = false;
      const failures = [];
      for (const row of rows) {
        try {
          if (action === "activate") {
            mergeRow(await activateInstalledPlugin(row));
          } else if (action === "deactivate") {
            mergeRow(await deactivateInstalledPlugin(row));
          } else if (action === "delete") {
            await deleteInstalledPlugin(row);
            state.rows = state.rows.filter((r) => r.plugin !== row.plugin);
          } else if (action === "update") {
            state.updating.add(row.plugin);
            paintTable();
            try {
              const result = await enqueueUpdateJob(
                () => updateInstalledPlugin(row)
              );
              mergeRow({
                ...row,
                version: result.newVersion,
                desktop_mode_update_available: {
                  available: false,
                  new_version: null,
                  package: "",
                  slug: row.desktop_mode_update_available?.slug ?? ""
                }
              });
            } finally {
              state.updating.delete(row.plugin);
            }
          }
          if ((action === "deactivate" || action === "delete") && isDesktopModeSelf(row.plugin)) {
            selfMutated = true;
          }
          succeeded++;
        } catch (err) {
          failures.push({ row, err });
        }
      }
      paintTable();
      table.clearSelection();
      if (selfMutated) {
        toast(
          action === "delete" ? __("Desktop Mode deleted. Reloading…", "desktop-mode") : __("Desktop Mode deactivated. Reloading…", "desktop-mode"),
          2e3
        );
        reloadOutOfDesktopMode();
        return;
      }
      if (succeeded > 0) {
        broadcast(PLUGINS_CHANGED_TOPIC, {
          source: SOURCE,
          action: "bulk"
        });
      }
      void refreshFrameworkMenu();
      let noun = "";
      if (action === "delete") {
        noun = __("deleted", "desktop-mode");
      } else if (action === "activate") {
        noun = __("activated", "desktop-mode");
      } else if (action === "update") {
        noun = __("updated", "desktop-mode");
      } else {
        noun = __("deactivated", "desktop-mode");
      }
      const summary = failures.length === 0 ? sprintf(
        /* translators: 1: count, 2: action verb (activated, deactivated, deleted) */
        __("%1$d plugin(s) %2$s.", "desktop-mode"),
        succeeded,
        noun
      ) : sprintf(
        /* translators: 1: success count, 2: failure count, 3: action verb */
        __("%1$d %3$s, %2$d failed.", "desktop-mode"),
        succeeded,
        failures.length,
        noun
      );
      toast(summary, 5e3);
    }
    function applyStatusOptimistic(row, next) {
      row.status = next;
      paintTable();
    }
    function mergeRow(updated) {
      const idx = state.rows.findIndex((r) => r.plugin === updated.plugin);
      if (idx >= 0) {
        state.rows[idx] = { ...state.rows[idx], ...updated };
      } else {
        state.rows.push(updated);
      }
      paintTable();
    }
    const unsubscribePluginsChanged = subscribe(
      PLUGINS_CHANGED_TOPIC,
      (payload) => {
        if (payload?.source === SOURCE) {
          return;
        }
        void reload();
      }
    );
    return () => {
      unsubscribePluginsChanged();
      table.removeEventListener("wpd-table-selection-change", selectionListener);
      host.replaceChildren();
    };
  }
  function formatSize(kb) {
    if (kb === null || kb === void 0) {
      return "—";
    }
    if (kb < 1024) {
      return sprintf(
        /* translators: %d: size in kilobytes */
        __("%d KB", "desktop-mode"),
        kb
      );
    }
    const mb = kb / 1024;
    return sprintf(
      /* translators: %s: size in megabytes (one decimal) */
      __("%s MB", "desktop-mode"),
      mb.toFixed(1)
    );
  }
  function stripHtml(html2) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html2;
    return tmp.textContent ?? "";
  }
  function describe(err) {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
  }
  const _initial = {
    tab: null,
    requestedAt: 0
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
      "desktop-mode/plugins-window/tab-target",
      () => ({ ..._initial })
    );
    return _store;
  }
  function consumePluginsWindowTab() {
    const store = getStore();
    if (store) {
      const tab = store.state.tab;
      if (tab !== null) {
        store.state.tab = null;
        store.state.requestedAt = 0;
        store.notify();
      }
      return tab;
    }
    const w = window;
    const prev = w._wpdPluginsWindowTab;
    if (prev) {
      w._wpdPluginsWindowTab = { tab: null, requestedAt: 0 };
      return prev.tab;
    }
    return null;
  }
  function subscribePluginsWindowTab(cb) {
    const store = getStore();
    if (!store) {
      return () => {
      };
    }
    return store.subscribe((state) => cb({ ...state }));
  }
  function renderPluginsWindow(body) {
    const root = body.querySelector(
      "[data-desktop-mode-plugins-root]"
    );
    if (!root) {
      body.innerHTML = '<p style="padding:20px;color:var(--wpd-fg-muted,#666);">' + __("Plugins window template missing.", "desktop-mode") + "</p>";
      return;
    }
    const config = getConfig();
    const tabs = root.querySelector(
      "[data-desktop-mode-plugins-tabs]"
    );
    const installedHost = root.querySelector(
      "[data-desktop-mode-plugins-installed-host]"
    );
    let installedTeardown = null;
    if (installedHost) {
      if (config.caps.activate) {
        installedTeardown = mountInstalledView(installedHost);
      } else {
        installedHost.replaceChildren();
        const msg = document.createElement("p");
        msg.style.padding = "20px";
        msg.style.color = "var(--wpd-fg-muted, #666)";
        msg.textContent = __(
          "You do not have permission to manage plugins.",
          "desktop-mode"
        );
        installedHost.appendChild(msg);
      }
    }
    const browseHost = root.querySelector(
      "[data-desktop-mode-plugins-browse-host]"
    );
    const flyout = root.querySelector(
      "[data-desktop-mode-plugins-flyout]"
    );
    let browseTeardown = null;
    if (browseHost && config.caps.install) {
      browseTeardown = mountBrowseView(browseHost, flyout, body);
    }
    const featuredHost = root.querySelector(
      "[data-desktop-mode-plugins-featured-host]"
    );
    let featuredTeardown = null;
    if (featuredHost && config.caps.install) {
      featuredTeardown = mountFeaturedView(featuredHost, flyout);
    }
    const applyTab = (tab) => {
      if (!tabs) {
        return;
      }
      if ((tab === "browse" || tab === "featured") && !config.caps.install) {
        tabs.setAttribute("value", "installed");
        return;
      }
      tabs.setAttribute("value", tab);
    };
    const initialTab = consumePluginsWindowTab();
    if (initialTab) {
      applyTab(initialTab);
    }
    const unsubscribeTab = subscribePluginsWindowTab((state) => {
      if (state.tab) {
        applyTab(state.tab);
      }
    });
    const onClosed = (ev) => {
      const detail = ev.detail;
      if (detail?.windowId !== "desktop-mode-plugins") {
        return;
      }
      document.removeEventListener("desktop-mode-window-closed", onClosed);
      unsubscribeTab();
      if (installedTeardown) {
        installedTeardown();
        installedTeardown = null;
      }
      if (browseTeardown) {
        browseTeardown();
        browseTeardown = null;
      }
      if (featuredTeardown) {
        featuredTeardown();
        featuredTeardown = null;
      }
    };
    document.addEventListener("desktop-mode-window-closed", onClosed);
    void maybeShowIntro(config);
  }
  let _introShown = false;
  async function maybeShowIntro(config) {
    if (_introShown || config.introSeen) {
      return;
    }
    _introShown = true;
    try {
      const { showPluginsIntroDialog: showPluginsIntroDialog2 } = await Promise.resolve().then(() => introDialog);
      const result = await showPluginsIntroDialog2();
      if (result === "cancel") {
        _introShown = false;
        return;
      }
      void markIntroSeen(config);
      if (result === "settings") {
        openOsSettingsFeatures();
      }
    } catch {
      _introShown = false;
    }
  }
  async function markIntroSeen(config) {
    if (!config.introUrl) {
      return;
    }
    try {
      await trackedFetch(
        config.introUrl,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-WP-Nonce": config.restNonce
          },
          body: JSON.stringify({ slug: "plugins" })
        },
        {
          windowId: "desktop-mode-plugins",
          source: "plugins-window/intro"
        }
      );
      config.introSeen = true;
    } catch {
    }
  }
  function openOsSettingsFeatures() {
    const api2 = window.wp?.desktop;
    if (typeof api2?.openOsSettings === "function") {
      api2.openOsSettings({ tabId: "features" });
    }
  }
  const registry = window.desktopModeNativeWindows ?? (window.desktopModeNativeWindows = {});
  registry["desktop-mode-plugins"] = (body) => {
    renderPluginsWindow(body);
  };
  async function showPluginsIntroDialog() {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "desktop-mode-plugins-intro__backdrop";
      backdrop.setAttribute("role", "presentation");
      Object.assign(backdrop.style, {
        position: "fixed",
        inset: "0",
        background: "color-mix(in srgb, var(--wp-admin-theme-color, #1d2327) 60%, transparent)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        zIndex: "100000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      });
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "desktop-mode-plugins-intro-title");
      dialog.className = "desktop-mode-plugins-intro";
      Object.assign(dialog.style, {
        background: "var(--wp-admin-theme-bg, #fff)",
        color: "var(--wp-admin-theme-fg, #1d2327)",
        borderRadius: "14px",
        boxShadow: "0 24px 60px rgba(0,0,0,.28)",
        maxWidth: "560px",
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
    const title = __("Welcome to the new Plugins window", "desktop-mode");
    const lede = __(
      "You're looking at the redesigned Plugins admin — same WordPress.org repository under the hood, with a workflow tuned for how Desktop Mode wants you to work.",
      "desktop-mode"
    );
    const highlights = [
      __(
        "Two tabs in one window — Installed for managing what you have, Browse for discovering new plugins. No more bouncing between Plugins → Add New → back to Installed.",
        "desktop-mode"
      ),
      __(
        "A real gallery on Browse — clean cards with rating, install count, last updated, and a click-anywhere detail flyout. Subtle hover lift, lazy-loaded icons, infinite scroll.",
        "desktop-mode"
      ),
      __(
        "The detail flyout shows screenshots, the ratings histogram, recent reviews, the changelog and FAQ — all without leaving the window.",
        "desktop-mode"
      ),
      __(
        "Drag a .zip onto the window to install — or drag a Browse card straight to the dock to pin a shortcut. The framework drag bridge handles the rest.",
        "desktop-mode"
      ),
      __(
        'The dock repaints LIVE after every install / activate / deactivate / delete. No reload, no stale tile, no "wait, did that work?".',
        "desktop-mode"
      ),
      __(
        "Per-row capability flags so the UI hides actions you can't perform — and the server re-validates every mutation, so flags can't be tampered into more permissions.",
        "desktop-mode"
      )
    ];
    const li = (arr) => arr.map(
      (s) => `<li><span class="dot" aria-hidden="true"></span>${escapeHtml(
        s
      )}</li>`
    ).join("");
    return `
		<style>
			.desktop-mode-plugins-intro h2 {
				margin: 0 0 8px;
				font-size: 22px;
				font-weight: 600;
				letter-spacing: -0.01em;
			}
			.desktop-mode-plugins-intro p.lede {
				margin: 0 0 20px;
				color: var(--wp-admin-theme-fg-muted, #50575e);
				font-size: 14px;
				line-height: 1.5;
			}
			.desktop-mode-plugins-intro__list {
				list-style: none;
				margin: 0 0 22px;
				padding: 0;
				font-size: 14px;
				line-height: 1.5;
			}
			.desktop-mode-plugins-intro__list li {
				display: flex;
				align-items: flex-start;
				gap: 10px;
				padding: 6px 0;
			}
			.desktop-mode-plugins-intro__list .dot {
				flex: 0 0 auto;
				width: 6px;
				height: 6px;
				margin-top: 9px;
				border-radius: 50%;
				background: var(--wp-admin-theme-color, #2271b1);
			}
			.desktop-mode-plugins-intro__footer {
				display: flex;
				justify-content: flex-end;
				gap: 8px;
				margin-top: 8px;
			}
			.desktop-mode-plugins-intro__footer button {
				appearance: none;
				border: 1px solid var(--wp-admin-theme-border, #dcdcde);
				background: var(--wp-admin-theme-bg, #fff);
				color: inherit;
				padding: 8px 14px;
				border-radius: 6px;
				font-size: 13px;
				cursor: pointer;
			}
			.desktop-mode-plugins-intro__footer button.primary {
				border-color: var(--wp-admin-theme-color, #2271b1);
				background: var(--wp-admin-theme-color, #2271b1);
				color: #fff;
				font-weight: 500;
			}
			.desktop-mode-plugins-intro__footer button:hover {
				filter: brightness(1.05);
			}
			.desktop-mode-plugins-intro__footer button:focus-visible {
				outline: 2px solid var(--wp-admin-theme-color, #2271b1);
				outline-offset: 2px;
			}
		</style>
		<h2 id="desktop-mode-plugins-intro-title">${escapeHtml(title)}</h2>
		<p class="lede">${escapeHtml(lede)}</p>
		<ul class="desktop-mode-plugins-intro__list">${li(highlights)}</ul>
		<div class="desktop-mode-plugins-intro__footer">
			<button type="button" data-action="settings">${escapeHtml(
      __("Take me to settings", "desktop-mode")
    )}</button>
			<button type="button" class="primary" data-action="confirm">${escapeHtml(
      __("Got it", "desktop-mode")
    )}</button>
		</div>
	`;
  }
  function escapeHtml(s) {
    const t = document.createElement("div");
    t.textContent = s;
    return t.innerHTML;
  }
  const introDialog = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    showPluginsIntroDialog
  }, Symbol.toStringTag, { value: "Module" }));
})();
