(function() {
  "use strict";
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
  const styles$4 = css`:host{display:inline-flex}:host( [ fill-cell ] ){display:flex;width:100%}button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:var( --wpd-button-padding,6px 12px );border-radius:var( --wpd-button-border-radius,6px );font:inherit;font-weight:500;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease;background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid var( --desktop-mode-border,#c3c4c7 ) )}:host( [ fill-cell ] ) button{width:100%;min-height:var( --wpd-button-min-height,44px )}button:disabled{opacity:0.5;cursor:not-allowed}button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.04 ) )}:host( [ variant='primary' ] ) button{background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) );color:var( --wpd-button-fg,#fff );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='primary' ] ) button:hover:not(:disabled ){filter:brightness( 1.06 );background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ variant='secondary' ] ) button{background:var( --wpd-button-bg,rgba( 0,0,0,0.06 ) );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='secondary' ] ) button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.1 ) )}:host( [ variant='danger' ] ) button{background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,#d63638 );border:var( --wpd-button-border,1px solid currentColor )}:host( [ variant='danger' ] ) button:hover:not(:disabled ){background:#d63638;color:#fff}:host( [ variant='link' ] ) button{background:transparent;color:var( --wpd-button-fg,var( --wp-admin-theme-color,#2271b1 ) );border:0;padding:0;text-decoration:underline}:host( [ busy ] ) button{pointer-events:none;opacity:0.75}.wpd-button__spinner{box-sizing:border-box;display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:wpd-button-spin 0.6s linear infinite;flex-shrink:0}@keyframes wpd-button-spin{to{transform:rotate( 360deg )}}`;
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
  _WpdButton.styles = [styles$4];
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
  const styles$3 = css`:host{display:inline-flex;align-items:center;justify-content:center;width:var( --wpd-icon-size,16px );height:var( --wpd-icon-size,16px );color:inherit;line-height:1}:host( [ hidden ] ){display:none}.wpd-icon__glyph{font-size:var( --wpd-icon-size,16px );width:var( --wpd-icon-size,16px );height:var( --wpd-icon-size,16px );line-height:1;color:inherit;display:inline-flex;align-items:center;justify-content:center}.wpd-icon__glyph--char{font-family:dashicons;font-style:normal;font-weight:normal;font-variant:normal;text-transform:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;speak:none}.wpd-icon__glyph.dashicons{font-family:dashicons}`;
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
  _WpdIcon.styles = [styles$3];
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
  const styles$2 = css`:host{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:32px 24px;text-align:center;color:var( --wpd-empty-state-fg,var( --desktop-mode-muted,#646970 ) )}:host( [ hidden ] ){display:none}.wpd-empty-state__icon{margin-bottom:4px;color:var( --wpd-empty-state-icon-color,currentColor );opacity:0.75}.wpd-empty-state__heading{margin:0;font-size:14px;font-weight:600;color:var( --desktop-mode-text,#1d2327 )}.wpd-empty-state__description{margin:0;font-size:12px;line-height:1.4;max-width:48ch}.wpd-empty-state__description:empty{display:none}.wpd-empty-state__cta{margin-top:8px}.wpd-empty-state__cta:empty{display:none}`;
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
  _WpdEmptyState.styles = [styles$2];
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
     * Filter, receives the games registry array (`GameRegistryEntry[]`)
     * on every read. Mirrors the PHP-side `desktop_mode_games` filter.
     *
     * @since 0.9.6
     */
    GAMES: "desktop-mode.games"
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
    const toast = document.createElement("wpd-toast");
    toast.textContent = intent.message;
    if (intent.action) {
      toast.setAttribute("action", intent.action.label);
      toast.addEventListener("wpd-toast-action", () => {
        intent.action?.onClick();
        dismiss();
      });
    }
    if (intent.dismissible) {
      toast.setAttribute("dismissible", "");
      toast.addEventListener("wpd-toast-dismiss", () => {
        intent.onDismiss?.();
        dismiss();
      });
    }
    container.appendChild(toast);
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
      toast.setAttribute("state", "out");
      window.setTimeout(() => {
        toast.remove();
      }, FADE_OUT_MS);
    };
    requestAnimationFrame(() => {
      toast.setAttribute("state", "in");
    });
    if (!intent.persistent) {
      dismissTimer = window.setTimeout(
        dismiss,
        intent.duration ?? DEFAULT_DURATION_MS
      );
    }
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
  function collectRegistrationErrors(def, checks) {
    if (!def || typeof def !== "object") {
      return ["def (not an object)"];
    }
    const d = def;
    const errors = [];
    for (const check of checks) {
      if (!check.valid(d)) {
        errors.push(`${check.field} (${check.message})`);
      }
    }
    return errors;
  }
  class RegistrationError extends Error {
    constructor(kind, errors, def) {
      super(
        `[desktop-mode] ${kind} registration rejected — fields: ` + errors.join(", ") + "."
      );
      this.name = "RegistrationError";
      this.kind = kind;
      this.errors = errors;
      this.def = def;
    }
  }
  function throwOnRegistrationErrors(kind, errors, def) {
    if (errors.length === 0) {
      return;
    }
    throw new RegistrationError(kind, errors, def);
  }
  const SHARED_STORES_SLOT = "__desktopModeSharedStores";
  function resolveSlot() {
    const w = window;
    let slot = w[SHARED_STORES_SLOT];
    if (!slot) {
      slot = /* @__PURE__ */ new Map();
      w[SHARED_STORES_SLOT] = slot;
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
  const store$1 = createSharedStore(
    "desktop-mode/games-registry",
    () => ({
      seed: [],
      listeners: /* @__PURE__ */ new Set()
    })
  );
  const seed = store$1.state.seed;
  const listeners = store$1.state.listeners;
  function register(entry) {
    throwOnRegistrationErrors(
      "Game",
      collectRegistrationErrors(entry, GAME_CHECKS),
      entry
    );
    const idx = seed.findIndex((g) => g.id === entry.id);
    if (idx >= 0) {
      seed[idx] = entry;
    } else {
      seed.push(entry);
    }
    notify$1();
  }
  function subscribe(cb) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }
  function notify$1() {
    const snapshot = Array.from(listeners);
    for (const cb of snapshot) {
      try {
        cb();
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            "[desktop-mode] games registry listener threw:",
            err
          );
        }
      }
    }
  }
  function all() {
    const copy = seed.slice();
    const filtered = applyFilters(HOOKS.GAMES, copy);
    if (!Array.isArray(filtered)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[desktop-mode] `desktop-mode.games` filter returned a non-array; falling back to seed list."
        );
      }
      return copy;
    }
    return filtered.filter(isValidEntry);
  }
  function get(id) {
    return all().find((g) => g.id === id);
  }
  const GAME_CHECKS = [
    {
      field: "id",
      message: "missing or not a non-empty string",
      valid: (g) => typeof g.id === "string" && g.id !== ""
    },
    {
      field: "title",
      message: "missing or not a non-empty string",
      valid: (g) => typeof g.title === "string" && g.title !== ""
    },
    {
      field: "scoreColumns",
      message: "must be an array",
      valid: (g) => Array.isArray(g.scoreColumns)
    },
    {
      field: "render/scriptUrl",
      message: "needs a `render` callback or a `scriptUrl` to lazily load one",
      valid: (g) => typeof g.render === "function" || typeof g.scriptUrl === "string" && g.scriptUrl !== ""
    }
  ];
  function isValidEntry(entry) {
    return collectRegistrationErrors(entry, GAME_CHECKS).length === 0;
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
  const SOURCE = "desktop-mode/games";
  function restEnv() {
    const wpGlobal = window.wp;
    const config = wpGlobal?.desktop?.config;
    return {
      restUrl: config?.restUrl || "/wp-json/",
      restNonce: config?.restNonce || ""
    };
  }
  async function call(path, init = {}, opts = {}) {
    const { restUrl, restNonce } = restEnv();
    const headers = new Headers(init.headers ?? {});
    headers.set("X-WP-Nonce", restNonce);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await trackedFetch(
      joinRestUrl(restUrl, path),
      { ...init, headers, credentials: "same-origin" },
      { source: SOURCE, windowId: opts.windowId, silent: opts.silent }
    );
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = body?.message || `Games request failed (${res.status})`;
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }
    return body;
  }
  function fetchScores(game, args = {}) {
    const params = new URLSearchParams({
      page: String(args.page ?? 1),
      per_page: String(args.perPage ?? 25),
      orderby: args.orderby ?? "score",
      order: args.order ?? "desc"
    });
    if (args.userId) {
      params.set("user_id", String(args.userId));
    }
    return call(`desktop-mode/v1/games/${game}/scores?${params}`);
  }
  function submitScore(game, submission, opts = {}) {
    return call(
      `desktop-mode/v1/games/${game}/scores`,
      {
        method: "POST",
        body: JSON.stringify({
          score: submission.score,
          meta: submission.meta ?? {}
        })
      },
      opts
    );
  }
  function fetchPlaytime() {
    return call("desktop-mode/v1/games/playtime");
  }
  function recordPlaytime(game, seconds, opts = {}) {
    return call(
      `desktop-mode/v1/games/${game}/playtime`,
      {
        method: "POST",
        body: JSON.stringify({ seconds })
      },
      opts
    );
  }
  function fetchChallenges(args = {}) {
    const params = new URLSearchParams({ box: args.box ?? "all" });
    if (args.state) {
      params.set("state", args.state);
    }
    return call(`desktop-mode/v1/games/challenges?${params}`);
  }
  function createChallenge(args) {
    return call("desktop-mode/v1/games/challenges", {
      method: "POST",
      body: JSON.stringify({
        game: args.game,
        recipient_id: args.recipientId,
        score: args.score,
        meta: args.meta ?? {}
      })
    });
  }
  function acceptChallenge(id) {
    return call(`desktop-mode/v1/games/challenges/${id}/accept`, {
      method: "POST"
    });
  }
  function declineChallenge(id) {
    return call(`desktop-mode/v1/games/challenges/${id}/decline`, {
      method: "POST"
    });
  }
  function completeChallenge(id, submission, opts = {}) {
    return call(
      `desktop-mode/v1/games/challenges/${id}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          score: submission.score,
          meta: submission.meta ?? {}
        })
      },
      opts
    );
  }
  const FLUSH_INTERVAL_MS = 6e4;
  function startPlaytimeTracker(gameId, opts = {}) {
    let runningSince = Date.now();
    let bankedMs = 0;
    let stopped = false;
    const harvest = () => {
      if (runningSince === null) {
        return;
      }
      const now = Date.now();
      bankedMs += Math.max(0, now - runningSince);
      runningSince = now;
    };
    const flush = () => {
      harvest();
      const seconds = Math.floor(bankedMs / 1e3);
      if (seconds < 1) {
        return;
      }
      bankedMs -= seconds * 1e3;
      recordPlaytime(gameId, seconds, {
        windowId: opts.windowId,
        silent: true
      }).catch(() => {
        bankedMs += seconds * 1e3;
      });
    };
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);
    return {
      pause: () => {
        harvest();
        runningSince = null;
      },
      resume: () => {
        if (stopped || runningSince !== null) {
          return;
        }
        runningSince = Date.now();
      },
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        clearInterval(interval);
        harvest();
        runningSince = null;
        flush();
      }
    };
  }
  function sumPlaytimeSince(daily, todayKey, windowDays) {
    const today = /* @__PURE__ */ new Date(`${todayKey}T00:00:00Z`);
    if (isNaN(today.getTime()) || windowDays < 1) {
      return 0;
    }
    const cutoff = new Date(
      today.getTime() - (windowDays - 1) * 864e5
    ).toISOString().slice(0, 10);
    let sum = 0;
    for (const [day, seconds] of Object.entries(daily)) {
      if (day >= cutoff && day <= todayKey) {
        sum += Math.max(0, Math.floor(Number(seconds) || 0));
      }
    }
    return sum;
  }
  function formatPlaytime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    if (hours > 0) {
      return sprintf(
        /* translators: 1: hours, 2: minutes. */
        __("%1$dh %2$dm"),
        hours,
        minutes
      );
    }
    if (minutes > 0) {
      return sprintf(__("%dm"), minutes);
    }
    return sprintf(__("%ds"), total);
  }
  function desktopGlobal() {
    return window.wp?.desktop ?? {};
  }
  const DEFAULT_GAME_WIDTH = 760;
  const DEFAULT_GAME_HEIGHT = 560;
  const DEFAULT_GAME_MIN_WIDTH = 480;
  const DEFAULT_GAME_MIN_HEIGHT = 380;
  async function ensureGameRender(entry) {
    if (typeof entry.render === "function") {
      return entry;
    }
    const loadVendorScript = desktopGlobal().loadVendorScript;
    if (!entry.scriptUrl || typeof loadVendorScript !== "function") {
      throw new Error(
        `[desktop-mode] Game "${entry.id}" has no render callback and no loadable script.`
      );
    }
    await loadVendorScript(entry.scriptUrl, {
      translations: entry.scriptTranslations,
      l10n: entry.scriptL10n,
      before: entry.scriptBefore,
      after: entry.scriptAfter
    });
    const globals = window;
    const def = globals.desktopModeGames?.[entry.id];
    if (!def || typeof def.render !== "function") {
      throw new Error(
        `[desktop-mode] No game def on window.desktopModeGames["${entry.id}"]. Script loaded but didn't publish a def — check the plugin's global assignment.`
      );
    }
    const upgraded = {
      ...entry,
      render: def.render,
      window: def.window ?? entry.window
    };
    register(upgraded);
    return upgraded;
  }
  async function launchGame(id, opts = {}) {
    const desktop = desktopGlobal();
    let entry = get(id);
    if (!entry) {
      throw new Error(`[desktop-mode] Unknown game "${id}".`);
    }
    entry = await ensureGameRender(entry);
    const render2 = entry.render;
    if (typeof render2 !== "function") {
      throw new Error(
        `[desktop-mode] Game "${id}" did not provide a render callback.`
      );
    }
    if (typeof desktop.registerWindow !== "function") {
      throw new Error(
        "[desktop-mode] wp.desktop.registerWindow is missing — the shell must boot before launching games."
      );
    }
    const windowId = `desktop-mode-game-${id}`;
    const suspendReason = `game:${windowId}`;
    const manager = desktop.windowManager;
    const existing = manager?.getByBaseId?.(windowId) ?? manager?.getById(windowId);
    if (existing) {
      const winDesktop = existing.config?.desktopId;
      if (winDesktop && manager?.switchDesktop && winDesktop !== manager?.getActiveDesktopId?.()) {
        manager.switchDesktop(winDesktop);
      }
      void desktop.registerWindow({
        id: windowId,
        title: entry.title,
        icon: entry.icon,
        render: () => void 0
      });
      return;
    }
    desktop.wallpaper?.suspend(suspendReason);
    let resumed = false;
    const resumeOnce = () => {
      if (resumed) {
        return;
      }
      resumed = true;
      desktop.wallpaper?.resume(suspendReason);
    };
    let tracker = null;
    const stopTracker = () => {
      tracker?.stop();
      tracker = null;
    };
    desktop.onWindow?.(windowId, {
      closed: () => {
        stopTracker();
        resumeOnce();
      },
      minimized: () => tracker?.pause(),
      restored: () => tracker?.resume()
    });
    const submit = (result) => {
      if (opts.challenge) {
        return completeChallenge(opts.challenge.id, result, {
          windowId
        }).then(() => void 0);
      }
      return submitScore(id, result, { windowId }).then(
        () => void 0
      );
    };
    try {
      await desktop.registerWindow({
        id: windowId,
        title: entry.title,
        icon: entry.icon,
        width: entry.window?.width ?? DEFAULT_GAME_WIDTH,
        height: entry.window?.height ?? DEFAULT_GAME_HEIGHT,
        minWidth: entry.window?.minWidth ?? DEFAULT_GAME_MIN_WIDTH,
        minHeight: entry.window?.minHeight ?? DEFAULT_GAME_MIN_HEIGHT,
        render: (body) => {
          const ctx = {
            windowId,
            container: body,
            config: entry.config ?? {},
            challenge: opts.challenge,
            submitScore: submit,
            close: () => {
              desktop.windowManager?.getById(windowId)?.close();
            }
          };
          tracker = startPlaytimeTracker(id, { windowId });
          const teardown = render2(ctx);
          return () => {
            try {
              teardown?.();
            } finally {
              stopTracker();
              resumeOnce();
            }
          };
        }
      });
    } catch (err) {
      stopTracker();
      resumeOnce();
      throw err;
    }
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
  const modalStyles = css`:host{display:none;position:fixed;inset:0;align-items:center;justify-content:center;background:rgba( 0,0,0,0.45 );backdrop-filter:blur( 2px );z-index:10000;--desktop-mode-text:#f0f0f1;--desktop-mode-text-muted:#bbc1c7;--desktop-mode-muted:#a7aaad;--desktop-mode-muted-fg:#a7aaad;--desktop-mode-border:rgba( 255,255,255,0.25 );--desktop-mode-window-bg:#2c3338;--wpd-button-bg-hover:rgba( 255,255,255,0.08 )}:host( [ open ] ){display:flex}.dialog{max-width:92vw;max-height:90vh;background:var( --wpd-modal-bg,var( --desktop-mode-bg,#1d2327 ) );color:var( --wpd-modal-fg,var( --desktop-mode-fg,#fff ) );border:1px solid rgba( 255,255,255,0.08 );border-radius:10px;box-shadow:0 20px 50px rgba( 0,0,0,0.6 );display:flex;flex-direction:column;overflow:hidden}:host( [ size='sm' ] ) .dialog{width:min( 360px,92vw )}:host(:not( [ size ] ) ) .dialog,:host( [ size='md' ] ) .dialog{width:min( 540px,92vw )}:host( [ size='lg' ] ) .dialog{width:min( 760px,94vw )}.header{display:flex;align-items:center;gap:10px;padding:16px 20px 12px;border-bottom:1px solid rgba( 255,255,255,0.06 )}.title{margin:0;flex:1;font-size:15px;font-weight:600}.header-actions{display:flex;gap:6px}.header-actions::slotted( * ){margin-inline-start:6px}.close{background:transparent;border:0;color:inherit;font-size:18px;line-height:1;padding:4px 8px;border-radius:4px;cursor:pointer;opacity:0.7}.close:hover{opacity:1;background:rgba( 255,255,255,0.08 )}.body{padding:16px 20px;overflow:auto;flex:1 1 auto;font-size:13px;line-height:1.5}.footer{padding:12px 20px 16px;border-top:1px solid rgba( 255,255,255,0.06 )}.footer slot{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}:host( [ mandatory ] ) .close{display:none}`;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const _WpdModal = class _WpdModal extends Component {
    constructor() {
      super(...arguments);
      this._prevFocus = null;
      this._onKey = (e) => {
        if (e.key === "Escape" && !this.hasAttribute("mandatory")) {
          e.preventDefault();
          this._cancel();
          return;
        }
        if (e.key === "Tab") {
          const f = this._focusables();
          if (f.length === 0) {
            return;
          }
          const first = f[0];
          const last = f[f.length - 1];
          const doc = this.ownerDocument;
          const fallback = doc ? doc.activeElement : null;
          const active = e.composedPath()[0] || fallback;
          if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      this._onBackdrop = (e) => {
        if (this.hasAttribute("mandatory")) {
          return;
        }
        const path = e.composedPath();
        const original = path.length > 0 ? path[0] : e.target;
        if (original === this) {
          this._cancel();
        }
      };
    }
    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("role", "dialog");
      this.setAttribute("aria-modal", "true");
      this.addEventListener("keydown", this._onKey);
      this.addEventListener("click", this._onBackdrop);
    }
    disconnectedCallback() {
      this.removeEventListener("keydown", this._onKey);
      this.removeEventListener("click", this._onBackdrop);
    }
    attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback?.(name, oldValue, newValue);
      if (name === "open") {
        if (newValue !== null) {
          const doc = this.ownerDocument;
          this._prevFocus = doc ? doc.activeElement : null;
          queueMicrotask(() => this._focusFirst());
        } else if (this._prevFocus) {
          try {
            this._prevFocus.focus();
          } catch (e) {
          }
          this._prevFocus = null;
        }
      }
    }
    showModal() {
      this.setAttribute("open", "");
    }
    hideModal() {
      this.removeAttribute("open");
    }
    _focusables() {
      const root = this.shadowRoot;
      if (!root) {
        return [];
      }
      const slotted = Array.from(this.querySelectorAll(FOCUSABLE));
      const inShadow = Array.from(root.querySelectorAll(FOCUSABLE));
      return [...slotted, ...inShadow].filter((el) => el.offsetParent !== null || el.tagName === "BUTTON");
    }
    _focusFirst() {
      const f = this._focusables();
      if (f.length > 0) {
        f[0].focus();
      } else {
        const inner = this.shadowRoot?.querySelector(".dialog");
        inner?.focus?.();
      }
    }
    _cancel() {
      const ev = new CustomEvent("wpd-modal-cancel", {
        bubbles: true,
        cancelable: true,
        composed: true
      });
      const allowed = this.dispatchEvent(ev);
      if (allowed) {
        this.hideModal();
      }
    }
    render() {
      const title = this.getAttribute("title") ?? "";
      const mandatory = this.hasAttribute("mandatory");
      return html`
			<div class="dialog" tabindex="-1">
				${title ? html`
						<div class="header">
							<h2 class="title">${title}</h2>
							<div class="header-actions">
								<slot name="header-actions"></slot>
								${mandatory ? html`` : html`<button
										type="button"
										class="close"
										aria-label="Close"
										@click=${() => this._cancel()}
									>×</button>`}
							</div>
						</div>
					` : html``}
				<div class="body">
					<slot></slot>
				</div>
				<div class="footer">
					<slot name="footer"></slot>
				</div>
			</div>
		`;
    }
  };
  _WpdModal.props = ["open", "title", "size", "mandatory"];
  _WpdModal.styles = [modalStyles];
  _WpdModal.help = {
    title: "Modal overlay",
    summary: "Overlay container with title, body, and footer slots. Handles ESC, click-outside, focus trap. Use for rich modal flows that go beyond a yes/no confirm. The dialog surface is dark and re-points the shared surface tokens (--desktop-mode-text/-muted/-border/-window-bg, --wpd-button-bg-hover) so wpd-* controls slotted into it resolve readable dark-surface colors automatically.",
    status: "experimental",
    since: "0.8.5",
    props: [
      { name: "open", type: "boolean attribute", description: "Mounts the dialog visible." },
      { name: "title", type: "string", description: "Heading shown at the top of the dialog." },
      { name: "size", type: "'sm' | 'md' | 'lg'", default: "md", description: "Width preset." },
      {
        name: "mandatory",
        type: "boolean attribute",
        description: "Disables ESC, click-outside and the close button."
      }
    ],
    slots: [
      { name: "(default)", description: "Body content." },
      { name: "footer", description: "Footer button row, right-aligned." },
      { name: "header-actions", description: "Extra actions next to the close button." }
    ],
    events: [
      {
        name: "wpd-modal-cancel",
        description: "Fires when the user dismisses the modal (ESC, click-outside, close button). Cancelable; calling `preventDefault()` keeps the modal open."
      }
    ]
  };
  let WpdModal = _WpdModal;
  defineComponent("wpd-modal", WpdModal);
  const userSearchStyles = css`:host{display:block;position:relative;font-size:13px}.input{width:100%;padding:8px 10px;background:var( --wpd-input-bg,rgba( 255,255,255,0.06 ) );color:inherit;border:1px solid rgba( 255,255,255,0.12 );border-radius:6px;font:inherit;box-sizing:border-box}.input:focus{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-1px}.dropdown{background:var( --desktop-mode-bg,#1d2327 );color:var( --desktop-mode-fg,#fff );border:1px solid rgba( 255,255,255,0.18 );border-radius:6px;overflow:auto;z-index:11000;box-shadow:0 12px 32px rgba( 0,0,0,0.5 )}.empty.error{color:#ff8080}.item{display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border:0;background:transparent;color:inherit;width:100%;text-align:start;font:inherit}.item:hover,.item:focus{background:rgba( 255,255,255,0.06 );outline:none}.avatar{width:24px;height:24px;border-radius:50%;flex:0 0 auto;background:rgba( 255,255,255,0.1 )}.name{font-weight:500}.slug{opacity:0.6;font-size:12px}.empty{padding:12px;color:rgba( 255,255,255,0.5 );font-size:12px}`;
  const _WpdUserSearch = class _WpdUserSearch extends Component {
    constructor() {
      super(...arguments);
      this._timer = null;
      this._abort = null;
      this._results = [];
      this._query = "";
      this._open = false;
      this._phase = "idle";
      this._error = "";
      this._dropdownStyle = "";
      this._onScrollOrResize = () => void 0;
      this._onInput = (e) => {
        const value = e.target.value;
        this._query = value;
        this._scheduleSearch(value);
      };
      this._onFocus = () => {
        if (this._results.length === 0 && this._phase === "idle") {
          this._scheduleSearch(this._query);
          return;
        }
        this._open = true;
        this._positionDropdown();
        this.requestUpdate();
      };
      this._onBlur = () => {
        setTimeout(() => {
          this._open = false;
          this.requestUpdate();
        }, 150);
      };
      this._pick = (user) => {
        this.emit("wpd-user-pick", { user });
        this._results = [];
        this._open = false;
        this._phase = "idle";
        this._query = "";
        const input = this.shadowRoot?.querySelector(".input");
        if (input) {
          input.value = "";
        }
        this.requestUpdate();
      };
    }
    connectedCallback() {
      super.connectedCallback();
      this._onScrollOrResize = () => {
        if (this._open) {
          this._positionDropdown();
          this.requestUpdate();
        }
      };
      window.addEventListener("resize", this._onScrollOrResize);
      window.addEventListener("scroll", this._onScrollOrResize, true);
    }
    disconnectedCallback() {
      if (this._timer) {
        clearTimeout(this._timer);
      }
      if (this._abort) {
        this._abort.abort();
      }
      window.removeEventListener("resize", this._onScrollOrResize);
      window.removeEventListener("scroll", this._onScrollOrResize, true);
    }
    _endpoint() {
      const attr = this.getAttribute("endpoint");
      if (attr) {
        return attr;
      }
      return window.desktopModeConfig?.filesUsersSearchUrl || "";
    }
    _scheduleSearch(q) {
      if (this._timer) {
        clearTimeout(this._timer);
      }
      this._phase = "loading";
      this._open = true;
      this._positionDropdown();
      this.requestUpdate();
      this._timer = setTimeout(() => this._runSearch(q), 200);
    }
    async _runSearch(q) {
      const url = this._endpoint();
      if (!url) {
        this._phase = "error";
        this._error = "Search endpoint is not configured.";
        this._results = [];
        this._open = true;
        this.requestUpdate();
        return;
      }
      if (this._abort) {
        this._abort.abort();
      }
      const ctrl = new AbortController();
      this._abort = ctrl;
      const exclude = this.getAttribute("exclude") || "";
      const full = url + "?q=" + encodeURIComponent(q) + "&exclude=" + encodeURIComponent(exclude);
      try {
        const init = {
          signal: ctrl.signal,
          credentials: "same-origin"
        };
        const res = await trackedFetch(full, init, {
          source: "desktop-mode/files-user-search",
          silent: true
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        this._results = json && Array.isArray(json.users) ? json.users : [];
        this._phase = "ready";
        this._error = "";
        this._open = true;
      } catch (e) {
        if (e.name === "AbortError") {
          return;
        }
        this._results = [];
        this._phase = "error";
        this._error = e.message || "Search failed.";
        this._open = true;
      }
      this._positionDropdown();
      this.requestUpdate();
    }
    _positionDropdown() {
      const input = this.shadowRoot?.querySelector(".input");
      if (!input) {
        return;
      }
      const rect = input.getBoundingClientRect();
      const top = rect.bottom + 4;
      const left = rect.left;
      const width = rect.width;
      const viewportH = window.innerHeight;
      const spaceBelow = viewportH - rect.bottom;
      const spaceAbove = rect.top;
      const maxHeight = Math.max(120, Math.min(280, Math.max(spaceBelow, spaceAbove) - 16));
      if (spaceBelow < 200 && spaceAbove > spaceBelow) {
        this._dropdownStyle = [
          "position:fixed",
          `left:${left}px`,
          `top:${rect.top - 4 - maxHeight}px`,
          `width:${width}px`,
          `max-height:${maxHeight}px`
        ].join(";");
      } else {
        this._dropdownStyle = [
          "position:fixed",
          `left:${left}px`,
          `top:${top}px`,
          `width:${width}px`,
          `max-height:${maxHeight}px`
        ].join(";");
      }
    }
    _dropdownContent() {
      if (this._phase === "loading") {
        return html`<div class="empty">Searching…</div>`;
      }
      if (this._phase === "error") {
        return html`<div class="empty error">${this._error}</div>`;
      }
      if (this._results.length === 0) {
        const message = this._query ? "No matches." : "No users available.";
        return html`<div class="empty">${message}</div>`;
      }
      return this._results.map(
        (u) => html`
				<button
					type="button"
					class="item"
					role="option"
					@mousedown=${(e) => e.preventDefault()}
					@click=${() => this._pick(u)}
				>
					<img class="avatar" src=${u.avatarUrl} alt="" />
					<div>
						<div class="name">${u.name}</div>
						<div class="slug">${u.slug}</div>
					</div>
				</button>
			`
      );
    }
    render() {
      const placeholder = this.getAttribute("placeholder") || "Search users…";
      return html`
			<input
				class="input"
				type="search"
				placeholder=${placeholder}
				autocomplete="off"
				@input=${this._onInput}
				@focus=${this._onFocus}
				@blur=${this._onBlur}
				.value=${this._query}
			/>
			${this._open ? html`
					<div class="dropdown" role="listbox" style=${this._dropdownStyle}>
						${this._dropdownContent()}
					</div>
				` : html``}
		`;
    }
  };
  _WpdUserSearch.props = ["placeholder", "exclude", "endpoint"];
  _WpdUserSearch.styles = [userSearchStyles];
  _WpdUserSearch.help = {
    title: "User autocomplete",
    summary: "Debounced autocomplete over /desktop-mode/v1/files/users/search. Emits wpd-user-pick { user } when a row is chosen. Dropdown anchors as position: fixed so it escapes overflow:auto ancestors.",
    status: "experimental",
    since: "0.8.5",
    props: [
      { name: "placeholder", type: "string", description: "Input placeholder text." },
      {
        name: "exclude",
        type: "csv user ids",
        description: "Already-picked user ids to suppress in results."
      },
      {
        name: "endpoint",
        type: "URL",
        description: "Override the search URL (defaults to desktopModeConfig.filesUsersSearchUrl)."
      }
    ],
    events: [
      { name: "wpd-user-pick", description: "Emitted on pick. Detail: `{ user: SearchUser }`." }
    ]
  };
  let WpdUserSearch = _WpdUserSearch;
  defineComponent("wpd-user-search", WpdUserSearch);
  function usersSearchUrl() {
    const globals = window;
    const localized = globals.desktopModeGamesConfig?.usersSearchUrl;
    if (localized) {
      return localized;
    }
    const wpGlobal = window.wp;
    const restUrl = wpGlobal?.desktop?.config?.restUrl || "/wp-json/";
    return joinRestUrl(restUrl, "desktop-mode/v1/games/users/search");
  }
  function openChallengeDialog(args) {
    return new Promise((resolve) => {
      const modal = document.createElement("wpd-modal");
      modal.setAttribute("open", "");
      modal.setAttribute("title", __("Send a challenge"));
      modal.setAttribute("size", "sm");
      const body = document.createElement("div");
      body.className = "desktop-mode-games__challenge-dialog";
      const summary = document.createElement("p");
      summary.className = "desktop-mode-games__challenge-summary";
      summary.textContent = sprintf(
        /* translators: 1: game title, 2: score. */
        __("Challenge someone to beat your %1$s score of %2$s."),
        args.gameTitle,
        String(args.score)
      );
      body.appendChild(summary);
      const search = document.createElement("wpd-user-search");
      search.setAttribute("placeholder", __("Find a player…"));
      search.setAttribute("endpoint", usersSearchUrl());
      body.appendChild(search);
      const picked = document.createElement("div");
      picked.className = "desktop-mode-games__challenge-picked";
      picked.hidden = true;
      body.appendChild(picked);
      modal.appendChild(body);
      const footer = document.createElement("div");
      footer.setAttribute("slot", "footer");
      footer.className = "desktop-mode-games__challenge-footer";
      const cancel = document.createElement("wpd-button");
      cancel.setAttribute("variant", "ghost");
      cancel.textContent = __("Cancel");
      const send = document.createElement("wpd-button");
      send.setAttribute("variant", "primary");
      send.setAttribute("disabled", "");
      send.textContent = __("Send challenge");
      footer.append(cancel, send);
      modal.appendChild(footer);
      let opponent = null;
      let sending = false;
      const close = () => {
        modal.remove();
        resolve();
      };
      const paintPicked = () => {
        picked.innerHTML = "";
        if (!opponent) {
          picked.hidden = true;
          send.setAttribute("disabled", "");
          return;
        }
        picked.hidden = false;
        const avatar = document.createElement("wpd-avatar");
        avatar.setAttribute("src", opponent.avatarUrl);
        avatar.setAttribute("name", opponent.name);
        avatar.setAttribute("size", "sm");
        avatar.setAttribute("user-id", String(opponent.id));
        picked.appendChild(avatar);
        const name = document.createElement("span");
        name.textContent = opponent.name;
        picked.appendChild(name);
        send.removeAttribute("disabled");
      };
      search.addEventListener("wpd-user-pick", (e) => {
        const user = e.detail?.user;
        if (user) {
          opponent = user;
          paintPicked();
        }
      });
      cancel.addEventListener("click", close);
      modal.addEventListener("wpd-modal-cancel", close);
      send.addEventListener("click", () => {
        if (!opponent || sending) {
          return;
        }
        sending = true;
        send.setAttribute("disabled", "");
        void createChallenge({
          game: args.game,
          recipientId: opponent.id,
          score: args.score,
          meta: args.meta
        }).then(() => {
          showToast({
            message: sprintf(
              /* translators: %s: opponent display name. */
              __("Challenge sent to %s."),
              opponent.name
            )
          });
          close();
        }).catch((err) => {
          sending = false;
          send.removeAttribute("disabled");
          showToast({
            message: err instanceof Error ? err.message : __("Could not send the challenge.")
          });
        });
      });
      document.body.appendChild(modal);
    });
  }
  const styles$1 = css`:host{display:inline;color:inherit;font:inherit}`;
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
  _WpdRelativeTime.styles = [styles$1];
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
  const styles = css`:host{display:block;--wpd-table-bg:var( --wpd-surface,#fff );--wpd-table-border:var( --wpd-border,rgba( 0,0,0,0.08 ) );--wpd-table-column-border:var( --wpd-border-strong,rgba( 0,0,0,0.14 ) );--wpd-table-header-bg:var( --wpd-surface-elevated,#f6f7f7 );--wpd-table-row-hover:rgba( 0,0,0,0.04 );--wpd-table-stripe:rgba( 0,0,0,0.03 );--wpd-table-cell-padding:8px 12px;--wpd-table-font-size:13px;--wpd-table-max-height:none;font-size:var( --wpd-table-font-size );color:inherit}:host( [ hidden ] ){display:none}.scroll{position:relative;overflow:auto;max-height:var( --wpd-table-max-height );border:1px solid var( --wpd-table-border );border-radius:4px;background:var( --wpd-table-bg )}table{width:100%;border-collapse:separate;border-spacing:0;background:var( --wpd-table-bg )}thead th{text-align:start;font-weight:600;background-color:var( --wpd-table-header-bg );padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );white-space:nowrap}tbody td{padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );background-color:var( --wpd-table-bg );vertical-align:middle}tbody tr:last-child td{border-bottom:0}:host( [ striped ] ) tbody tr:nth-child( odd ) td{background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ hover ] ) tbody tr:hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}:host( [ hover ] [ striped ] ) tbody tr:nth-child( odd ):hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) ),linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ compact ] ){--wpd-table-cell-padding:4px 8px;--wpd-table-font-size:12px}:host( [ bordered ] ) thead th,:host( [ bordered ] ) tbody td{border-inline-end:1px solid var( --wpd-table-column-border )}:host( [ bordered ] ) thead th:last-child,:host( [ bordered ] ) tbody td:last-child{border-inline-end:0}th.is-sticky,td.is-sticky{position:sticky;z-index:10}tbody td.is-sticky{background-color:var( --wpd-table-bg )}thead th.is-sticky{background-color:var( --wpd-table-header-bg );z-index:30}:host( [ sticky-header ] ) thead th{position:sticky;top:0;z-index:20}:host( [ sticky-header ] ) thead tr.filter-row th{top:var( --wpd-table-header-height,33px );z-index:20}:host( [ sticky-header ] ) thead th.is-sticky{z-index:40}:host( [ sticky-header ] ) thead tr.filter-row th.is-sticky{z-index:40}th.is-sticky-edge,td.is-sticky-edge{border-inline-end:var( --wpd-table-sticky-edge,2px solid var( --wpd-table-border ) )}.align-center{text-align:center}.align-end{text-align:end}.filter-row th{padding:4px 8px;background-color:var( --wpd-table-header-bg );border-bottom:1px solid var( --wpd-table-border );font-weight:400}.filter-input,.filter-select{width:100%;min-width:60px;box-sizing:border-box;padding:4px 6px;font:inherit;color:inherit;background-color:var( --wpd-table-bg );border:1px solid var( --wpd-table-border );border-radius:3px}.filter-input:focus,.filter-select:focus{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-1px}.expander{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:3px;font-size:11px;line-height:1}.expander:hover{background:rgba( 0,0,0,0.06 )}td.col-expander,th.col-expander{width:36px;min-width:36px;padding-left:0;padding-right:0;text-align:center}tr.subtable td{padding:0;background-color:var( --wpd-table-bg );background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) );border-bottom:1px solid var( --wpd-table-border )}tr.subtable .subtable-inner{padding:8px 12px 8px 32px}tr.empty td{padding:24px;text-align:center;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );font-style:italic}thead th.is-sortable{cursor:pointer;user-select:none}thead th.is-sortable:hover{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}thead th.is-sortable:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-2px}.sort-indicator{font-size:10px;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );margin-inline-start:2px}thead th.sort-asc .sort-indicator,thead th.sort-desc .sort-indicator{color:var( --wp-admin-theme-color,#2271b1 )}td.col-select,th.col-select{width:40px;min-width:40px;padding-left:0;padding-right:0;text-align:center}.select-all-checkbox,.select-row-checkbox{cursor:pointer;margin:0}tbody tr.is-selected td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 10%,var( --wpd-table-bg ) );background-image:none}tbody tr.is-selected:hover td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 16%,var( --wpd-table-bg ) )}tbody tr.skeleton td{padding:var( --wpd-table-cell-padding )}.skeleton-bar{display:block;height:12px;border-radius:3px;background:linear-gradient( 90deg,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 0%,var( --wpd-table-skeleton-highlight,rgba( 0,0,0,0.14 ) ) 50%,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 100% );background-size:200% 100%;animation:wpd-table-skeleton-pulse 1.4s ease-in-out infinite}@keyframes wpd-table-skeleton-pulse{0%{background-position:200% 50%}100%{background-position:-200% 50%}}@media ( prefers-reduced-motion:reduce ){.skeleton-bar{animation:none}}`;
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
      const all2 = document.createElement("option");
      all2.value = "";
      all2.textContent = "All";
      select.appendChild(all2);
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
    _buildSkeletonRow(cols, seed2) {
      const tr = document.createElement("tr");
      tr.classList.add("skeleton");
      tr.setAttribute("aria-hidden", "true");
      for (const _c of cols) {
        const td = document.createElement("td");
        const bar = document.createElement("span");
        bar.className = "skeleton-bar";
        const widthPct = 50 + (seed2 * 7 + tr.children.length * 13) % 40;
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
  _WpdTable.styles = [styles];
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
  const PER_PAGE = 25;
  function currentUserId$2() {
    const wpGlobal = window.wp;
    return Number(wpGlobal?.desktop?.config?.currentUserId) || 0;
  }
  function formatTimeValue(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }
  function buildColumns(game) {
    const columns = [
      {
        key: "userName",
        label: __("Player"),
        render: (_value, row) => {
          const cell = document.createElement("span");
          cell.style.cssText = "display:inline-flex;align-items:center;gap:8px;min-width:0;";
          const avatar = document.createElement("wpd-avatar");
          avatar.setAttribute("src", row.userAvatar);
          avatar.setAttribute("name", row.userName);
          avatar.setAttribute("size", "xs");
          avatar.setAttribute("user-id", String(row.userId));
          cell.appendChild(avatar);
          const name = document.createElement("span");
          name.textContent = row.userName;
          cell.appendChild(name);
          return cell;
        }
      }
    ];
    for (const column of game.scoreColumns) {
      columns.push({
        key: column.key,
        label: column.label,
        render: (_value, row) => {
          const raw = "score" === column.key ? row.score : row.meta[column.key];
          if (raw === void 0 || raw === null) {
            return "—";
          }
          if ("time" === column.type) {
            return formatTimeValue(raw);
          }
          return String(raw);
        }
      });
    }
    columns.push({
      key: "createdAtMs",
      label: __("When"),
      render: (_value, row) => {
        const time = document.createElement("wpd-relative-time");
        time.setAttribute(
          "datetime",
          new Date(row.createdAtMs).toISOString()
        );
        return time;
      }
    });
    columns.push({
      key: "__actions",
      label: "",
      render: (_value, row) => {
        if (row.userId !== currentUserId$2()) {
          return "";
        }
        const btn = document.createElement("wpd-button");
        btn.setAttribute("variant", "secondary");
        btn.setAttribute("size", "sm");
        btn.textContent = __("Challenge…");
        btn.addEventListener("click", () => {
          openChallengeDialog({
            game: game.id,
            gameTitle: game.title,
            score: row.score,
            meta: row.meta
          });
        });
        return btn;
      }
    });
    return columns;
  }
  function renderScoreboard(container, game) {
    container.innerHTML = "";
    const tableHost = document.createElement("div");
    tableHost.className = "desktop-mode-games__scoreboard-table";
    container.appendChild(tableHost);
    const pager = document.createElement("div");
    pager.className = "desktop-mode-games__pager";
    container.appendChild(pager);
    let page = 1;
    let total = 0;
    let loadSeq = 0;
    let disposed = false;
    const table = document.createElement("wpd-table");
    table.setAttribute("sticky-header", "");
    table.setAttribute("hover", "");
    table.setAttribute("striped", "");
    const empty = document.createElement("div");
    empty.setAttribute("slot", "empty");
    empty.className = "desktop-mode-games__scoreboard-empty";
    empty.textContent = __("No scores yet — be the first to play!");
    table.appendChild(empty);
    tableHost.appendChild(table);
    table.columns = buildColumns(game);
    table.data = [];
    const paintPager = () => {
      pager.innerHTML = "";
      const pages = Math.max(1, Math.ceil(total / PER_PAGE));
      if (pages <= 1) {
        return;
      }
      const prev = document.createElement("wpd-button");
      prev.setAttribute("variant", "ghost");
      prev.textContent = __("Previous");
      if (page <= 1) {
        prev.setAttribute("disabled", "");
      }
      prev.addEventListener("click", () => void load(page - 1));
      const label = document.createElement("span");
      label.className = "desktop-mode-games__pager-label";
      label.textContent = `${page} / ${pages}`;
      const next = document.createElement("wpd-button");
      next.setAttribute("variant", "ghost");
      next.textContent = __("Next");
      if (page >= pages) {
        next.setAttribute("disabled", "");
      }
      next.addEventListener("click", () => void load(page + 1));
      pager.append(prev, label, next);
    };
    const load = async (toPage) => {
      const seq = ++loadSeq;
      table.setAttribute("loading", "");
      try {
        const result = await fetchScores(game.id, {
          page: toPage,
          perPage: PER_PAGE
        });
        if (disposed || seq !== loadSeq) {
          return;
        }
        page = toPage;
        total = result.total;
        table.data = result.scores;
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error("[desktop-mode] scoreboard load failed:", err);
        }
      } finally {
        if (!disposed && seq === loadSeq) {
          table.removeAttribute("loading");
          paintPager();
        }
      }
    };
    void load(1);
    return () => {
      disposed = true;
    };
  }
  const store = createSharedStore(
    "desktop-mode/games-challenges",
    () => ({
      rows: /* @__PURE__ */ new Map(),
      version: 0,
      listeners: /* @__PURE__ */ new Set()
    })
  );
  function ingestChallenges(rows) {
    const state = store.state;
    let changed = false;
    for (const row of rows) {
      if (!row || typeof row.id !== "number") {
        continue;
      }
      const prev = state.rows.get(row.id);
      if (!prev || prev.updatedAtMs !== row.updatedAtMs) {
        state.rows.set(row.id, row);
        changed = true;
      }
      if (row.updatedAtMs > state.version) {
        state.version = row.updatedAtMs;
      }
    }
    if (changed) {
      notify();
    }
  }
  function subscribeChallenges(cb) {
    store.state.listeners.add(cb);
    return () => {
      store.state.listeners.delete(cb);
    };
  }
  function notify() {
    for (const cb of Array.from(store.state.listeners)) {
      try {
        cb();
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            "[desktop-mode] challenges store listener threw:",
            err
          );
        }
      }
    }
  }
  function allChallenges() {
    return Array.from(store.state.rows.values()).sort(
      (a, b) => b.updatedAtMs - a.updatedAtMs
    );
  }
  function gameTitle(id) {
    return get(id)?.title || id;
  }
  async function acceptAndPlay(row) {
    const { challenge } = await acceptChallenge(row.id);
    ingestChallenges([challenge]);
    await launchGame(row.game, {
      challenge: {
        id: row.id,
        scoreToBeat: row.scoreToBeat,
        scoreMeta: row.scoreMeta,
        challengerName: row.challengerName
      }
    });
  }
  function currentUserId$1() {
    const wpGlobal = window.wp;
    return Number(wpGlobal?.desktop?.config?.currentUserId) || 0;
  }
  function describeRow(row, viewerId) {
    const incoming = row.recipientId === viewerId;
    const other = incoming ? row.challengerName : row.recipientName;
    const title = gameTitle(row.game);
    const target = String(row.scoreToBeat);
    if ("pending" === row.state) {
      if (incoming) {
        return sprintf(
          /* translators: 1: challenger name, 2: game title, 3: score. */
          __("%1$s challenged you to %2$s — beat %3$s."),
          other,
          title,
          target
        );
      }
      return sprintf(
        /* translators: 1: recipient name, 2: game title, 3: score. */
        __("Waiting for %1$s to accept your %2$s challenge (%3$s)."),
        other,
        title,
        target
      );
    }
    if ("accepted" === row.state) {
      if (incoming) {
        return sprintf(
          /* translators: 1: game title, 2: score. */
          __("You accepted — play %1$s and beat %2$s!"),
          title,
          target
        );
      }
      return sprintf(
        /* translators: 1: recipient name, 2: game title. */
        __("%1$s accepted your %2$s challenge and is playing."),
        other,
        title
      );
    }
    if ("declined" === row.state) {
      if (incoming) {
        return sprintf(
          /* translators: 1: challenger name, 2: game title. */
          __("You declined %1$s’s %2$s challenge."),
          other,
          title
        );
      }
      return sprintf(
        /* translators: 1: recipient name, 2: game title. */
        __("%1$s declined your %2$s challenge."),
        other,
        title
      );
    }
    const beaten = "beaten" === row.result;
    const result = String(row.resultScore ?? 0);
    if (incoming) {
      if (beaten) {
        return sprintf(
          /* translators: 1: game title, 2: result score, 3: target score. */
          __("You beat the %1$s challenge: %2$s vs %3$s."),
          title,
          result,
          target
        );
      }
      return sprintf(
        /* translators: 1: game title, 2: result score, 3: target score. */
        __("You missed the %1$s challenge: %2$s vs %3$s."),
        title,
        result,
        target
      );
    }
    if (beaten) {
      return sprintf(
        /* translators: 1: recipient name, 2: result score, 3: target score. */
        __("%1$s beat your score: %2$s vs %3$s."),
        other,
        result,
        target
      );
    }
    return sprintf(
      /* translators: 1: recipient name, 2: result score, 3: target score. */
      __("%1$s did not beat your score: %2$s vs %3$s."),
      other,
      result,
      target
    );
  }
  function buildRow(row, viewerId) {
    const incoming = row.recipientId === viewerId;
    const item = document.createElement("li");
    item.className = `desktop-mode-games__challenge desktop-mode-games__challenge--${row.state}`;
    const avatar = document.createElement("wpd-avatar");
    const otherId = incoming ? row.challengerId : row.recipientId;
    avatar.setAttribute(
      "src",
      incoming ? row.challengerAvatar : row.recipientAvatar
    );
    avatar.setAttribute(
      "name",
      incoming ? row.challengerName : row.recipientName
    );
    avatar.setAttribute("size", "sm");
    avatar.setAttribute("user-id", String(otherId));
    item.appendChild(avatar);
    const main = document.createElement("div");
    main.className = "desktop-mode-games__challenge-main";
    const text = document.createElement("p");
    text.textContent = describeRow(row, viewerId);
    main.appendChild(text);
    const when = document.createElement("wpd-relative-time");
    when.setAttribute("datetime", new Date(row.updatedAtMs).toISOString());
    main.appendChild(when);
    item.appendChild(main);
    if (incoming && "pending" === row.state) {
      const actions = document.createElement("div");
      actions.className = "desktop-mode-games__challenge-actions";
      const accept = document.createElement("wpd-button");
      accept.setAttribute("variant", "primary");
      accept.setAttribute("size", "sm");
      accept.textContent = __("Accept & Play");
      accept.addEventListener("click", () => {
        accept.setAttribute("disabled", "");
        void acceptAndPlay(row).catch((err) => {
          accept.removeAttribute("disabled");
          showToast({
            message: err instanceof Error ? err.message : __("Could not accept the challenge.")
          });
        });
      });
      actions.appendChild(accept);
      const decline = document.createElement("wpd-button");
      decline.setAttribute("variant", "ghost");
      decline.setAttribute("size", "sm");
      decline.textContent = __("Decline");
      decline.addEventListener("click", () => {
        decline.setAttribute("disabled", "");
        void declineChallenge(row.id).then(({ challenge }) => ingestChallenges([challenge])).catch((err) => {
          decline.removeAttribute("disabled");
          showToast({
            message: err instanceof Error ? err.message : __("Could not decline the challenge.")
          });
        });
      });
      actions.appendChild(decline);
      item.appendChild(actions);
    }
    return item;
  }
  function renderChallengesView(container, gameId) {
    container.innerHTML = "";
    const list = document.createElement("ul");
    list.className = "desktop-mode-games__challenge-list";
    container.appendChild(list);
    const viewerId = currentUserId$1();
    const paint = () => {
      list.innerHTML = "";
      const rows = allChallenges().filter(
        (row) => !gameId || row.game === gameId
      );
      if (rows.length === 0) {
        const empty = document.createElement("wpd-empty-state");
        empty.setAttribute("icon", "awards");
        empty.setAttribute("heading", __("No challenges yet"));
        empty.setAttribute(
          "description",
          __(
            "Press Challenge to throw down one of your scores, or pick a row from the scoreboard."
          )
        );
        list.appendChild(empty);
        return;
      }
      for (const row of rows) {
        list.appendChild(buildRow(row, viewerId));
      }
    };
    const unsubscribe = subscribeChallenges(paint);
    paint();
    void fetchChallenges({ box: "all" }).then(({ challenges }) => ingestChallenges(challenges)).catch((err) => {
      if (typeof console !== "undefined") {
        console.error(
          "[desktop-mode] challenges resync failed:",
          err
        );
      }
    });
    return unsubscribe;
  }
  const ROOT = "[data-desktop-mode-games-root]";
  const GRID = "[data-desktop-mode-games-grid]";
  const DETAIL = "[data-desktop-mode-games-detail]";
  function currentUserId() {
    const wpGlobal = window.wp;
    return Number(wpGlobal?.desktop?.config?.currentUserId) || 0;
  }
  function buildGameIcon(icon) {
    if (icon.startsWith("data:") || /^https?:\/\//.test(icon)) {
      const img = document.createElement("img");
      img.src = icon;
      img.alt = "";
      img.className = "desktop-mode-games__icon-img";
      return img;
    }
    const span = document.createElement("span");
    span.className = `dashicons ${icon || "dashicons-admin-generic"} desktop-mode-games__icon-dashicon`;
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  function renderGamesHub(body) {
    const root = body.querySelector(ROOT);
    const grid = body.querySelector(GRID);
    const detail = body.querySelector(DETAIL);
    if (!root || !grid || !detail) {
      return;
    }
    const teardowns = [];
    let detailTeardowns = [];
    let selectedId = null;
    const disposeDetail = () => {
      for (const fn of detailTeardowns) {
        try {
          fn();
        } catch {
        }
      }
      detailTeardowns = [];
    };
    const challengeFromBest = async (game) => {
      const viewerId = currentUserId();
      const mine = await fetchScores(game.id, {
        perPage: 1,
        userId: viewerId
      });
      const best = mine.scores[0];
      if (!best) {
        showToast({
          message: sprintf(
            /* translators: %s: game title. */
            __("Play %s first — you need a score to challenge with."),
            game.title
          )
        });
        return;
      }
      await openChallengeDialog({
        game: game.id,
        gameTitle: game.title,
        score: best.score,
        meta: best.meta
      });
    };
    const renderDetail = (game) => {
      disposeDetail();
      detail.hidden = false;
      detail.innerHTML = "";
      const hero = document.createElement("div");
      hero.className = "desktop-mode-games__hero";
      const visual = document.createElement("div");
      visual.className = "desktop-mode-games__hero-visual";
      visual.appendChild(buildGameIcon(game.icon));
      hero.appendChild(visual);
      const info = document.createElement("div");
      info.className = "desktop-mode-games__hero-info";
      const title = document.createElement("h2");
      title.className = "desktop-mode-games__hero-title";
      title.textContent = game.title;
      info.appendChild(title);
      if (game.description) {
        const desc = document.createElement("p");
        desc.className = "desktop-mode-games__hero-desc";
        desc.textContent = game.description;
        info.appendChild(desc);
      }
      const playtime = document.createElement("div");
      playtime.className = "desktop-mode-games__hero-playtime";
      playtime.hidden = true;
      info.appendChild(playtime);
      let playtimeStale = false;
      detailTeardowns.push(() => {
        playtimeStale = true;
      });
      const playtimeStat = (label, value) => {
        const stat = document.createElement("span");
        stat.className = "desktop-mode-games__playtime-stat";
        const labelEl = document.createElement("span");
        labelEl.className = "desktop-mode-games__playtime-label";
        labelEl.textContent = label;
        stat.appendChild(labelEl);
        const valueEl = document.createElement("span");
        valueEl.className = "desktop-mode-games__playtime-value";
        valueEl.textContent = value;
        stat.appendChild(valueEl);
        return stat;
      };
      void fetchPlaytime().then((res) => {
        const total = Number(res.playtime[game.id]) || 0;
        if (playtimeStale || total < 1) {
          return;
        }
        const recent = sumPlaytimeSince(
          res.daily?.[game.id] ?? {},
          res.today,
          14
        );
        if (recent > 0) {
          playtime.appendChild(
            playtimeStat(
              __("Play time (last two weeks)"),
              formatPlaytime(recent)
            )
          );
        }
        playtime.appendChild(
          playtimeStat(
            __("Play time (total)"),
            formatPlaytime(total)
          )
        );
        playtime.hidden = false;
      }).catch(() => {
      });
      hero.appendChild(info);
      const actions = document.createElement("div");
      actions.className = "desktop-mode-games__hero-actions";
      const play = document.createElement("wpd-button");
      play.setAttribute("variant", "primary");
      play.setAttribute("size", "lg");
      play.textContent = __("Play");
      play.addEventListener("click", () => {
        play.setAttribute("disabled", "");
        void launchGame(game.id).catch((err) => {
          if (typeof console !== "undefined") {
            console.error(
              "[desktop-mode] game launch failed:",
              err
            );
          }
        }).finally(() => {
          play.removeAttribute("disabled");
        });
      });
      actions.appendChild(play);
      const challenge = document.createElement("wpd-button");
      challenge.setAttribute("variant", "secondary");
      challenge.textContent = __("Challenge…");
      challenge.addEventListener("click", () => {
        challenge.setAttribute("disabled", "");
        void challengeFromBest(game).finally(() => {
          challenge.removeAttribute("disabled");
        });
      });
      actions.appendChild(challenge);
      hero.appendChild(actions);
      detail.appendChild(hero);
      const scoreboardSection = document.createElement("section");
      scoreboardSection.className = "desktop-mode-games__section";
      const scoreboardHeading = document.createElement("h3");
      scoreboardHeading.className = "desktop-mode-games__section-heading";
      scoreboardHeading.textContent = __("Scoreboard");
      scoreboardSection.appendChild(scoreboardHeading);
      const scoreboardHost = document.createElement("div");
      scoreboardSection.appendChild(scoreboardHost);
      detail.appendChild(scoreboardSection);
      detailTeardowns.push(renderScoreboard(scoreboardHost, game));
      const challengesSection = document.createElement("section");
      challengesSection.className = "desktop-mode-games__section";
      const challengesHeading = document.createElement("h3");
      challengesHeading.className = "desktop-mode-games__section-heading";
      challengesHeading.textContent = __("Challenges");
      challengesSection.appendChild(challengesHeading);
      const challengesHost = document.createElement("div");
      challengesSection.appendChild(challengesHost);
      detail.appendChild(challengesSection);
      detailTeardowns.push(renderChallengesView(challengesHost, game.id));
    };
    const select = (id) => {
      const game = get(id);
      if (!game) {
        return;
      }
      selectedId = id;
      for (const tile of Array.from(
        grid.querySelectorAll("[data-game-id]")
      )) {
        const isSelected = tile.getAttribute("data-game-id") === id;
        tile.classList.toggle(
          "desktop-mode-games__tile--selected",
          isSelected
        );
        tile.setAttribute("aria-selected", isSelected ? "true" : "false");
      }
      renderDetail(game);
    };
    const buildTile = (entry) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "desktop-mode-games__tile";
      tile.setAttribute("data-game-id", entry.id);
      tile.setAttribute("role", "option");
      tile.setAttribute("aria-selected", "false");
      const visual = document.createElement("span");
      visual.className = "desktop-mode-games__tile-visual";
      visual.appendChild(buildGameIcon(entry.icon));
      tile.appendChild(visual);
      const title = document.createElement("span");
      title.className = "desktop-mode-games__tile-title";
      title.textContent = entry.title;
      tile.appendChild(title);
      tile.addEventListener("click", () => select(entry.id));
      return tile;
    };
    const paintGrid = () => {
      grid.innerHTML = "";
      const games = all();
      if (games.length === 0) {
        const empty = document.createElement("wpd-empty-state");
        empty.setAttribute("icon", "games");
        empty.setAttribute("heading", __("No games installed"));
        empty.setAttribute(
          "description",
          __("Plugins can add games with desktop_mode_register_game().")
        );
        grid.appendChild(empty);
        disposeDetail();
        detail.hidden = true;
        detail.innerHTML = "";
        selectedId = null;
        return;
      }
      for (const entry of games) {
        grid.appendChild(buildTile(entry));
      }
      const keep = selectedId && games.some((game) => game.id === selectedId) ? selectedId : games[0].id;
      select(keep);
    };
    paintGrid();
    teardowns.push(subscribe(paintGrid));
    return () => {
      disposeDetail();
      for (const fn of teardowns) {
        try {
          fn();
        } catch {
        }
      }
    };
  }
  const registry = window.desktopModeNativeWindows ?? (window.desktopModeNativeWindows = {});
  registry["desktop-mode-games"] = renderGamesHub;
})();
