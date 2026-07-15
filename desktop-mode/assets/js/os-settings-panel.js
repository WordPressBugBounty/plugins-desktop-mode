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
  function html(strings, ...values) {
    return { __wpdHtml: true, strings, values };
  }
  function isTemplateResult(v) {
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
    if (isTemplateResult(value)) {
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
      const list2 = Array.isArray(next) ? next : String(next).split(/\s+/);
      const cleaned = list2.map((s) => String(s).trim()).filter((s) => s !== "");
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
  const styles$a = css`:host{display:inline-flex}:host( [ fill-cell ] ){display:flex;width:100%}button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:var( --wpd-button-padding,6px 12px );border-radius:var( --wpd-button-border-radius,6px );font:inherit;font-weight:500;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease;background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid var( --desktop-mode-border,#c3c4c7 ) )}:host( [ fill-cell ] ) button{width:100%;min-height:var( --wpd-button-min-height,44px )}button:disabled{opacity:0.5;cursor:not-allowed}button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.04 ) )}:host( [ variant='primary' ] ) button{background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) );color:var( --wpd-button-fg,#fff );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='primary' ] ) button:hover:not(:disabled ){filter:brightness( 1.06 );background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ variant='secondary' ] ) button{background:var( --wpd-button-bg,rgba( 0,0,0,0.06 ) );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='secondary' ] ) button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.1 ) )}:host( [ variant='danger' ] ) button{background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,#d63638 );border:var( --wpd-button-border,1px solid currentColor )}:host( [ variant='danger' ] ) button:hover:not(:disabled ){background:#d63638;color:#fff}:host( [ variant='link' ] ) button{background:transparent;color:var( --wpd-button-fg,var( --wp-admin-theme-color,#2271b1 ) );border:0;padding:0;text-decoration:underline}:host( [ busy ] ) button{pointer-events:none;opacity:0.75}`;
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
  _WpdButton.styles = [styles$a];
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
  const styles$9 = css`:host{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var( --desktop-mode-text,#1d2327 );cursor:pointer}label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}input[ type='checkbox' ]{accent-color:var( --wp-admin-theme-color,#2271b1 );cursor:pointer}:host( [ disabled ] ){opacity:0.5;cursor:not-allowed}:host( [ disabled ] ) label,:host( [ disabled ] ) input[ type='checkbox' ]{cursor:not-allowed}`;
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
  _WpdCheckboxLabel.styles = [styles$9];
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
  const styles$8 = css`:host{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var( --desktop-mode-muted,#646970 )}label{display:inline-flex;align-items:center;gap:8px}input[ type='color' ]{width:28px;height:28px;padding:0;border:1px solid var( --desktop-mode-border,#c3c4c7 );border-radius:6px;background:transparent;cursor:pointer}:host( [ variant='block' ] ){display:flex;width:100%}:host( [ variant='block' ] ) label{display:flex;flex:1;align-items:center}:host( [ variant='block' ] ) input[ type='color' ]{flex:1;width:auto;height:32px}input[ type='color' ]::-webkit-color-swatch-wrapper{padding:2px}input[ type='color' ]::-webkit-color-swatch{border:none;border-radius:2px}`;
  const _WpdColorField = class _WpdColorField extends Component {
    render() {
      const label = this.label || "";
      const value = this.value || "#000000";
      return html`
			<label>
				<span class="wpd-color-field__label">${label}</span>
				<input
					type="color"
					.value=${value}
					@input=${(e) => this._onInput(e)}
				/>
			</label>
		`;
    }
    _onInput(e) {
      const input = e.target;
      this.value = input.value;
      this.emit("wpd-color-change", { value: input.value });
    }
  };
  _WpdColorField.props = ["label", "value", "variant"];
  _WpdColorField.styles = [styles$8];
  _WpdColorField.help = {
    title: "Color field",
    summary: "Label + native color input. Reflects the value attribute both ways and emits wpd-color-change live on every edit (no debounce — callers debounce upstream).",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "label",
        type: "string",
        description: "Visible label rendered next to the swatch."
      },
      {
        name: "value",
        type: "CSS hex color",
        default: "#000000",
        description: "Current color. Two-way reflected with the native picker."
      },
      {
        name: "variant",
        type: "string",
        description: "Optional visual variant hint for the stylesheet."
      }
    ],
    events: [
      {
        name: "wpd-color-change",
        description: "Fires on every user edit.",
        detail: "{ value: string }"
      }
    ],
    cssProps: [
      { name: "--desktop-mode-border", description: "Swatch outline." },
      { name: "--desktop-mode-muted", description: "Label colour." }
    ],
    example: html`
			<wpd-color-field label="Accent" value="#8b5cf6"></wpd-color-field>
		`
  };
  let WpdColorField = _WpdColorField;
  defineComponent("wpd-color-field", WpdColorField);
  const styles$7 = css`:host{display:inline-flex;align-items:center;justify-content:center;width:var( --wpd-icon-size,16px );height:var( --wpd-icon-size,16px );color:inherit;line-height:1}:host( [ hidden ] ){display:none}.wpd-icon__glyph{font-size:var( --wpd-icon-size,16px );width:var( --wpd-icon-size,16px );height:var( --wpd-icon-size,16px );line-height:1;color:inherit;display:inline-flex;align-items:center;justify-content:center}.wpd-icon__glyph--char{font-family:dashicons;font-style:normal;font-weight:normal;font-variant:normal;text-transform:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;speak:none}.wpd-icon__glyph.dashicons{font-family:dashicons}`;
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
  _WpdIcon.styles = [styles$7];
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
  const styles$6 = css`:host{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:32px 24px;text-align:center;color:var( --wpd-empty-state-fg,var( --desktop-mode-muted,#646970 ) )}:host( [ hidden ] ){display:none}.wpd-empty-state__icon{margin-bottom:4px;color:var( --wpd-empty-state-icon-color,currentColor );opacity:0.75}.wpd-empty-state__heading{margin:0;font-size:14px;font-weight:600;color:var( --desktop-mode-text,#1d2327 )}.wpd-empty-state__description{margin:0;font-size:12px;line-height:1.4;max-width:48ch}.wpd-empty-state__description:empty{display:none}.wpd-empty-state__cta{margin-top:8px}.wpd-empty-state__cta:empty{display:none}`;
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
  _WpdEmptyState.styles = [styles$6];
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
  const styles$5 = css`:host{display:flex;align-items:flex-start;gap:10px;width:100%;box-sizing:border-box;padding:10px 14px;font:var( --wpd-notice-font,13px/1.5 var( --desktop-mode-font,system-ui ) );color:var( --wpd-notice-color,var( --desktop-mode-text,#1d2327 ) );background:var( --wpd-notice-bg,rgba( 0,0,0,0.04 ) );border-block-end:1px solid var( --wpd-notice-border,rgba( 0,0,0,0.08 ) );border-inline-start:4px solid var( --wpd-notice-accent,#646970 )}:host( [ hidden ] ){display:none}.wpd-notice__icon{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:var( --wpd-notice-accent,#646970 )}.wpd-notice__icon[ hidden ]{display:none}.wpd-notice__label{flex:1;min-width:0;word-wrap:break-word}::slotted( a ){color:var( --wpd-notice-link,var( --wp-admin-theme-color,#2271b1 ) )}::slotted( p:first-child ){margin-block-start:0}::slotted( p:last-child ){margin-block-end:0}.wpd-notice__close{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;background:transparent;color:inherit;opacity:0.6;cursor:pointer;border-radius:4px;transition:opacity 0.12s ease,background-color 0.12s ease}.wpd-notice__close:hover{opacity:1;background:rgba( 0,0,0,0.06 )}.wpd-notice__close:focus-visible{opacity:1;outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:1px}.wpd-notice__close[ hidden ]{display:none}.wpd-notice__close svg{width:14px;height:14px}:host( [ tone='info' ] ){--wpd-notice-accent:var( --wpd-notice-info,#0969da );--wpd-notice-bg:var( --wpd-notice-info-bg,rgba( 9,105,218,0.08 ) );--wpd-notice-border:var( --wpd-notice-info-border,rgba( 9,105,218,0.16 ) )}:host( [ tone='success' ] ){--wpd-notice-accent:var( --wpd-notice-success,#1a7f37 );--wpd-notice-bg:var( --wpd-notice-success-bg,rgba( 26,127,55,0.08 ) );--wpd-notice-border:var( --wpd-notice-success-border,rgba( 26,127,55,0.16 ) )}:host( [ tone='warning' ] ){--wpd-notice-accent:var( --wpd-notice-warning,#9a6700 );--wpd-notice-bg:var( --wpd-notice-warning-bg,rgba( 154,103,0,0.08 ) );--wpd-notice-border:var( --wpd-notice-warning-border,rgba( 154,103,0,0.16 ) )}:host( [ tone='error' ] ),:host( [ tone='danger' ] ){--wpd-notice-accent:var( --wpd-notice-error,#cf222e );--wpd-notice-bg:var( --wpd-notice-error-bg,rgba( 207,34,46,0.08 ) );--wpd-notice-border:var( --wpd-notice-error-border,rgba( 207,34,46,0.16 ) )}:host( [ tone='neutral' ] ){--wpd-notice-accent:var( --wpd-notice-neutral,#57606a );--wpd-notice-bg:var( --wpd-notice-neutral-bg,rgba( 87,96,106,0.08 ) );--wpd-notice-border:var( --wpd-notice-neutral-border,rgba( 87,96,106,0.16 ) )}`;
  const KEY_PREFIX = "desktop-mode-notice-dismissed";
  function currentUserSuffix() {
    const w = window.wp;
    const uid = w?.desktop?.config?.currentUserId;
    if (typeof uid === "number" && uid > 0) {
      return String(uid);
    }
    return "anon";
  }
  function storageKey() {
    return `${KEY_PREFIX}:${currentUserSuffix()}`;
  }
  function readMap() {
    try {
      const raw = window.localStorage.getItem(storageKey());
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
    }
    return {};
  }
  function writeMap(map) {
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(map));
    } catch {
    }
  }
  function isNoticeDismissed(id) {
    if (!id) {
      return false;
    }
    return readMap()[id] === true;
  }
  function markNoticeDismissed(id) {
    if (!id) {
      return;
    }
    const map = readMap();
    map[id] = true;
    writeMap(map);
  }
  function clearNoticeDismissed(id) {
    if (!id) {
      return;
    }
    const map = readMap();
    if (map[id]) {
      delete map[id];
      writeMap(map);
    }
  }
  const _WpdNotice = class _WpdNotice extends Component {
    connectedCallback() {
      super.connectedCallback();
      if (!this.hasAttribute("role")) {
        this.setAttribute("role", "status");
      }
      if (!this.hasAttribute("tone")) {
        this.setAttribute("tone", "info");
      }
      const id = this.getAttribute("notice-id");
      if (id && isNoticeDismissed(id)) {
        this.hidden = true;
      }
    }
    /**
     * Imperatively dismiss the notice — hides the host and records
     * the dismissal in localStorage when `notice-id` is set.
     */
    dismiss() {
      this.hidden = true;
      const id = this.getAttribute("notice-id");
      if (id) {
        markNoticeDismissed(id);
      }
      this.emit("wpd-notice-dismiss", { noticeId: id ?? void 0 });
    }
    /**
     * Clear a previously recorded dismissal and re-show the notice.
     * Useful in tests and for "Show again" affordances.
     */
    undismiss() {
      const id = this.getAttribute("notice-id");
      if (id) {
        clearNoticeDismissed(id);
      }
      this.hidden = false;
    }
    render() {
      const icon = this.getAttribute("icon");
      const dismissible = !this.hasAttribute("not-dismissible");
      return html`
			<span
				class="wpd-notice__icon dashicons ${icon ?? ""}"
				?hidden=${!icon}
				aria-hidden="true"
			></span>
			<span class="wpd-notice__label"><slot></slot></span>
			<button
				type="button"
				class="wpd-notice__close"
				?hidden=${!dismissible}
				aria-label=${__("Dismiss notice")}
				@click=${(e) => this._onDismiss(e)}
			>
				<svg viewBox="0 0 14 14" aria-hidden="true">
					<path
						d="M3 3 L11 11 M11 3 L3 11"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						fill="none"
					></path>
				</svg>
			</button>
		`;
    }
    _onDismiss(e) {
      e.preventDefault();
      e.stopPropagation();
      this.dismiss();
    }
  };
  _WpdNotice.props = ["tone", "notDismissible", "icon", "noticeId"];
  _WpdNotice.styles = [styles$5];
  _WpdNotice.help = {
    title: "Notice",
    summary: "Full-width banner placed inside a window (typically the after-titlebar slot). Tone-coded background + accent stripe, optional close button, optional dashicons leading glyph. Slotted content is HTML — links and basic formatting are supported.",
    status: "experimental",
    since: "0.8.6",
    props: [
      {
        name: "tone",
        type: '"info" | "success" | "warning" | "error" | "danger" | "neutral"',
        description: "Color palette. Defaults to `info`. `error` and `danger` are aliases."
      },
      {
        name: "not-dismissible",
        type: "boolean",
        description: "Suppress the trailing close button. Defaults to dismissible."
      },
      {
        name: "icon",
        type: "string",
        description: "Optional Dashicons class for a leading glyph (e.g. `dashicons-info`)."
      },
      {
        name: "notice-id",
        type: "string",
        description: "Persistence key. When set, the notice records its dismissed state in localStorage so it stays closed across reloads for the same user."
      }
    ],
    slots: [
      {
        name: "(default)",
        description: "Message HTML. Links, `<strong>`, `<em>`, and other inline formatting are allowed."
      }
    ],
    events: [
      {
        name: "wpd-notice-dismiss",
        description: "Fires after the user clicks the close button.",
        detail: "{ noticeId?: string }"
      }
    ],
    cssProps: [
      { name: "--wpd-notice-bg", description: "Background color." },
      { name: "--wpd-notice-accent", description: "Left-edge stripe + icon color." },
      { name: "--wpd-notice-color", description: "Text color." },
      { name: "--wpd-notice-border", description: "Bottom border color." },
      { name: "--wpd-notice-link", description: "Color for slotted <a> elements." }
    ],
    example: html`
			<wpd-notice tone="warning" notice-id="docs/example">
				Heads up — this is a demo notice.
				<a href="#">Learn more</a>.
			</wpd-notice>
		`
  };
  let WpdNotice = _WpdNotice;
  defineComponent("wpd-notice", WpdNotice);
  const styles$4 = css`:host{display:flex;flex-direction:column;gap:var( --wpd-panel-gap,12px );padding:var( --wpd-panel-padding,16px );box-sizing:border-box}:host( [ hidden ] ){display:none}`;
  const _WpdPanel = class _WpdPanel extends Component {
    render() {
      const gap = this.gap;
      const padding = this.padding;
      if (gap && /^\d+$/.test(gap)) {
        this.style.setProperty("--wpd-panel-gap", `${gap}px`);
      }
      if (padding && /^\d+$/.test(padding)) {
        this.style.setProperty("--wpd-panel-padding", `${padding}px`);
      }
      return html`<slot></slot>`;
    }
  };
  _WpdPanel.props = ["gap", "padding"];
  _WpdPanel.styles = [styles$4];
  _WpdPanel.help = {
    title: "Panel",
    summary: "Padded, flex-column container matching the default inset and rhythm of a native-window body. Opt-in for the OS-Settings-style padded layout.",
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
        name: "padding",
        type: "integer (px)",
        default: "16",
        description: "Inset around children. Pass 0 to drop the inset."
      }
    ],
    slots: [{ name: "(default)", description: "Panel body." }],
    cssProps: [
      { name: "--wpd-panel-gap", default: "12px" },
      { name: "--wpd-panel-padding", default: "16px" }
    ],
    example: html`
			<wpd-panel>
				<wpd-section heading="Look">Panel section A</wpd-section>
				<wpd-section heading="Feel">Panel section B</wpd-section>
			</wpd-panel>
		`
  };
  let WpdPanel = _WpdPanel;
  defineComponent("wpd-panel", WpdPanel);
  const styles$3 = css`:host{display:flex;align-items:center;gap:10px;font-size:12px;color:var( --desktop-mode-muted,#646970 )}input[ type='range' ]{flex:1;accent-color:var( --wp-admin-theme-color,#2271b1 )}.wpd-range-field__value{min-width:3ch;text-align:end;font-variant-numeric:tabular-nums;color:var( --desktop-mode-text,#1d2327 )}`;
  const _WpdRangeField = class _WpdRangeField extends Component {
    render() {
      const label = this.label || "";
      const value = this.value || "0";
      const min = this.min || "0";
      const max = this.max || "100";
      const step = this.step || "1";
      const suffix = this.suffix || "";
      return html`
			<label class="wpd-range-field__label">${label}</label>
			<input
				type="range"
				min=${min}
				max=${max}
				step=${step}
				.value=${value}
				@input=${(e) => this._onInput(e)}
			/>
			<span class="wpd-range-field__value">${value}${suffix}</span>
		`;
    }
    _onInput(e) {
      const input = e.target;
      const n = parseFloat(input.value);
      if (!Number.isFinite(n)) {
        return;
      }
      this.value = String(n);
      this.emit("wpd-range-change", { value: n });
    }
  };
  _WpdRangeField.props = ["label", "value", "min", "max", "step", "suffix"];
  _WpdRangeField.styles = [styles$3];
  _WpdRangeField.help = {
    title: "Range field",
    summary: "Label + range slider + live numeric readout. Emits wpd-range-change with an already-parsed number.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "label",
        type: "string",
        description: "Visible label above the slider."
      },
      {
        name: "value",
        type: "number (string)",
        default: "0",
        description: "Current slider value."
      },
      {
        name: "min",
        type: "number (string)",
        default: "0",
        description: "Lower bound of the slider range."
      },
      {
        name: "max",
        type: "number (string)",
        default: "100",
        description: "Upper bound of the slider range."
      },
      {
        name: "step",
        type: "number (string)",
        default: "1",
        description: "Slider step granularity."
      },
      {
        name: "suffix",
        type: "string",
        description: 'Text appended to the readout (e.g. "px", "%").'
      }
    ],
    events: [
      {
        name: "wpd-range-change",
        description: "Fires on every slider movement.",
        detail: "{ value: number }"
      }
    ],
    cssProps: [
      { name: "--desktop-mode-text", description: "Readout + label colour." },
      { name: "--desktop-mode-muted", description: "Secondary colour." }
    ],
    example: html`
			<wpd-range-field
				label="Dock size"
				value="48"
				min="32"
				max="80"
				step="4"
				suffix="px"
			></wpd-range-field>
		`
  };
  let WpdRangeField = _WpdRangeField;
  defineComponent("wpd-range-field", WpdRangeField);
  const styles$2 = css`:host{display:block;margin-block-end:28px}:host( [ hidden ] ){display:none}.wpd-section__heading{margin:0 0 2px;font-size:14px;font-weight:600;color:var( --desktop-mode-text,#1d2327 )}.wpd-section__description{margin:0 0 14px;font-size:12px;color:var( --desktop-mode-muted,#646970 );line-height:1.45}.wpd-section__description:empty{display:none}:host( [ stack ] ) .wpd-section__body{display:flex;flex-direction:column;gap:var( --wpd-section-gap,12px )}`;
  const _WpdSection = class _WpdSection extends Component {
    render() {
      const heading = this.heading || "";
      const description = this.description || "";
      return html`
			<h3 class="wpd-section__heading">${heading}</h3>
			<p class="wpd-section__description">${description}</p>
			<div class="wpd-section__body"><slot></slot></div>
		`;
    }
  };
  _WpdSection.props = ["heading", "description", "stack"];
  _WpdSection.styles = [styles$2];
  _WpdSection.help = {
    title: "Section",
    summary: "Titled panel with heading + description + a body slot. The canonical OS Settings section wrapper.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "heading",
        type: "string",
        description: "Section title, rendered as an <h3>."
      },
      {
        name: "description",
        type: "string",
        description: "Secondary descriptive paragraph below the heading."
      },
      {
        name: "stack",
        type: "boolean",
        description: "When present, the default slot becomes a flex column with a consistent gap (--wpd-section-gap, default 12px) between children. Opt-in — existing callers whose slotted controls ship their own margin stay unchanged. Recommended for third-party settings tabs and any new surface."
      }
    ],
    slots: [
      { name: "(default)", description: "Section body content." }
    ],
    cssProps: [
      { name: "--desktop-mode-text", description: "Heading colour." },
      { name: "--desktop-mode-muted", description: "Description colour." }
    ],
    example: html`
			<wpd-section
				heading="Wallpaper"
				description="Pick a backdrop for the desktop."
			>
				<wpd-swatch-grid>
					<wpd-swatch value="a" preview="#b1e7b9"></wpd-swatch>
					<wpd-swatch value="b" preview="#e7b1c9"></wpd-swatch>
				</wpd-swatch-grid>
			</wpd-section>
		`
  };
  let WpdSection = _WpdSection;
  defineComponent("wpd-section", WpdSection);
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
    set items(list2) {
      const existing = this.querySelectorAll(":scope > wpd-segment");
      for (const el of Array.from(existing)) {
        el.remove();
      }
      for (const item of list2) {
        const seg = document.createElement("wpd-segment");
        seg.setAttribute("value", item.value);
        seg.textContent = item.label;
        this.appendChild(seg);
      }
      const current = this.value;
      const stillValid = current !== null && list2.some((i) => i.value === current);
      if (!stillValid && list2.length > 0) {
        this.value = list2[0].value;
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
    set items(list2) {
      const existing = this.querySelectorAll(":scope > wpd-option");
      for (const el of Array.from(existing)) {
        el.remove();
      }
      for (const item of list2) {
        const opt = document.createElement("wpd-option");
        opt.setAttribute("value", item.value);
        opt.textContent = item.label;
        this.appendChild(opt);
      }
      const current = this.value;
      const stillValid = current !== null && list2.some((i) => i.value === current);
      if (!stillValid && list2.length > 0) {
        this.value = list2[0].value;
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
  const styles$1 = css`:host{display:block;width:100%;aspect-ratio:4 / 3}:host( [ size='small' ] ){display:inline-block;width:32px;height:32px;aspect-ratio:1 / 1;flex:0 0 auto}:host( [ variant='wallpaper' ] ){aspect-ratio:16 / 9}:host( [ variant='wallpaper' ] ) button{display:flex;align-items:flex-end;justify-content:flex-start;padding:6px 8px;overflow:hidden}button{appearance:none;position:relative;width:100%;height:100%;padding:0;border-radius:10px;border:2px solid transparent;cursor:pointer;background-color:#eee;background-size:cover;background-position:center;transition:transform 0.15s ease,border-color 0.15s ease,box-shadow 0.15s ease}:host( [ size='small' ] ) button{border-radius:50%}button:hover{transform:scale( 1.04 )}button[ aria-pressed='true' ]{border-color:var( --wp-admin-theme-color,#2271b1 );box-shadow:0 0 0 2px var( --wp-admin-theme-color,#2271b1 )}:host( [ variant='wallpaper' ] ) button:hover{transform:translateY( -1px )}`;
  const _WpdSwatch = class _WpdSwatch extends Component {
    render() {
      const selected = this.selected !== null;
      const label = this.label || "";
      const preview = this.preview || "";
      return html`
			<button
				type="button"
				aria-pressed=${selected ? "true" : "false"}
				aria-label=${label}
				title=${label}
				style="background: ${preview}"
				@click=${() => this._onPick()}
			>
				<slot></slot>
			</button>
		`;
    }
    _onPick() {
      this.emit("wpd-pick", {
        value: this.value
      });
    }
  };
  _WpdSwatch.props = ["value", "label", "selected", "preview", "size", "variant"];
  _WpdSwatch.styles = [styles$1];
  _WpdSwatch.help = {
    title: "Swatch",
    summary: "Selectable color/wallpaper tile. Renders as an aria-pressed button with a background driven by the preview attribute.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "value",
        type: "string",
        description: "Identifier emitted on the wpd-pick event when the swatch is clicked."
      },
      {
        name: "label",
        type: "string",
        description: "aria-label + title for the button."
      },
      {
        name: "selected",
        type: "boolean attribute",
        description: "Marks the swatch as the active choice within a swatch-grid."
      },
      {
        name: "preview",
        type: "CSS background value",
        description: "Raw CSS background (color, gradient, url()) painted on the tile."
      },
      {
        name: "size",
        type: "string",
        description: "Visual size hint (e.g. sm, md, lg). Consumed by the stylesheet."
      },
      {
        name: "variant",
        type: "string",
        description: "Optional visual variant (e.g. color vs wallpaper)."
      }
    ],
    slots: [
      { name: "(default)", description: "Optional overlay content rendered inside the tile." }
    ],
    events: [
      {
        name: "wpd-pick",
        description: "Fires when the swatch is clicked.",
        detail: "{ value: string }"
      }
    ],
    example: html`
			<wpd-swatch-grid label="Accent">
				<wpd-swatch value="red" preview="#ef4444" label="Red" selected></wpd-swatch>
				<wpd-swatch value="blue" preview="#3b82f6" label="Blue"></wpd-swatch>
				<wpd-swatch value="green" preview="#10b981" label="Green"></wpd-swatch>
			</wpd-swatch-grid>
		`
  };
  let WpdSwatch = _WpdSwatch;
  defineComponent("wpd-swatch", WpdSwatch);
  const styles = css`:host{display:grid;grid-template-columns:repeat( var( --wpd-swatch-grid-cols,4 ),1fr );gap:12px}:host( [ mode='row' ] ){display:flex;flex-wrap:wrap;align-items:center;gap:10px}`;
  const _WpdSwatchGrid = class _WpdSwatchGrid extends Component {
    render() {
      const label = this.label || "";
      const cols = this.columns || "";
      if (cols) {
        this.style.setProperty("--wpd-swatch-grid-cols", cols);
      }
      this.setAttribute("role", "radiogroup");
      if (label) {
        this.setAttribute("aria-label", label);
      }
      return html`<slot></slot>`;
    }
  };
  _WpdSwatchGrid.props = ["label", "columns", "mode"];
  _WpdSwatchGrid.styles = [styles];
  _WpdSwatchGrid.help = {
    title: "Swatch grid",
    summary: "Flex grid container for <wpd-swatch> children. Emits radiogroup semantics so screen readers announce the tiles as a unit.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "label",
        type: "string",
        description: 'aria-label describing the group (e.g. "Accent color").'
      },
      {
        name: "columns",
        type: "CSS grid track template",
        description: "Overrides the default column track via --wpd-swatch-grid-cols."
      },
      {
        name: "mode",
        type: "string",
        description: "Optional rendering variant forwarded to child swatches."
      }
    ],
    slots: [
      { name: "(default)", description: "<wpd-swatch> children." }
    ],
    cssProps: [
      { name: "--wpd-swatch-grid-cols", description: "Grid column template." }
    ],
    example: html`
			<wpd-swatch-grid label="Wallpaper">
				<wpd-swatch value="a" preview="linear-gradient(135deg,#f093fb,#f5576c)"></wpd-swatch>
				<wpd-swatch value="b" preview="linear-gradient(135deg,#4facfe,#00f2fe)"></wpd-swatch>
				<wpd-swatch value="c" preview="linear-gradient(135deg,#43e97b,#38f9d7)"></wpd-swatch>
			</wpd-swatch-grid>
		`
  };
  let WpdSwatchGrid = _WpdSwatchGrid;
  defineComponent("wpd-swatch-grid", WpdSwatchGrid);
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
    set items(list2) {
      replaceChildren(this, "wpd-tab", list2);
      const current = this.value;
      const stillValid = current !== null && list2.some((i) => i.value === current);
      if (!stillValid && list2.length > 0) {
        this.value = list2[0].value;
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
  const HD_MIN_WIDTH = 1920;
  const HD_MIN_HEIGHT = 1080;
  const MEDIA_PER_PAGE = 40;
  const SEARCH_DEBOUNCE_MS = 300;
  const CUSTOM_GRADIENT_ID = "custom-gradient";
  const CUSTOM_IMAGE_ID = "custom-image";
  const DEFAULT_WALLPAPER_ID = "dark";
  const DEFAULT_ACCENTS = [
    { id: "wp-blue", label: "WordPress Blue", value: "#2271b1" },
    { id: "indigo", label: "Indigo", value: "#3858e9" },
    { id: "teal", label: "Teal", value: "#04a4cc" },
    { id: "emerald", label: "Emerald", value: "#059669" },
    { id: "amber", label: "Amber", value: "#d97706" },
    { id: "rose", label: "Rose", value: "#e11d48" }
  ];
  function getAccents() {
    const config = window.wp?.desktop?.config;
    const raw = config?.accentColors;
    if (!Array.isArray(raw) || raw.length === 0) {
      return DEFAULT_ACCENTS;
    }
    const clean = [];
    for (const entry of raw) {
      if (entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.label === "string" && typeof entry.value === "string" && entry.id !== "" && entry.label !== "" && /^#[0-9a-f]{3,8}$/i.test(entry.value)) {
        clean.push({ id: entry.id, label: entry.label, value: entry.value });
      }
    }
    return clean.length > 0 ? clean : DEFAULT_ACCENTS;
  }
  const DOCK_SIZES = [
    { id: "compact", label: "Compact", width: 48, icon: 18 },
    { id: "default", label: "Default", width: 56, icon: 20 },
    { id: "large", label: "Large", width: 72, icon: 26 }
  ];
  const DESKTOP_LAYOUTS = [
    { id: "classic", label: "Classic" },
    { id: "unified", label: "Unified" },
    { id: "spatial", label: "Spatial" }
  ];
  const DEFAULTS = {
    wallpaper: DEFAULT_WALLPAPER_ID,
    accent: "wp-blue",
    dockSize: "default",
    desktopLayout: "classic",
    dockRailRenderer: "default",
    unfocusEffect: "darken",
    windowLinkRenderer: "svg-splines",
    windowLinkVisibility: "always",
    windowLinksEnabled: true,
    windowLinkRaiseOnFocus: true,
    windowLinkHighlight: true,
    customGradient: {
      from: "#2271b1",
      to: "#7c3aed",
      angle: 135
    },
    customImage: null,
    wallpaperSettings: {},
    libraryHdOnly: true,
    ai: {
      enabled: false
    },
    // Opt-IN Beta as of 0.9.1. Fresh installs land on the classic
    // chromeless `edit.php` iframe; a user opts in via OS Settings →
    // Features → Beta features to get the native Posts window. The
    // native windows used to default ON (opt-out, 0.8.0) but are now
    // opt-in so the redesign is a deliberate choice, not imposed.
    heartbeatRate: 60,
    nativePostsEnabled: false,
    nativePostsHiddenColumns: [],
    // Same opt-in Beta posture as Posts — fresh installs keep the
    // iframe; users opt in to the native Pages window.
    nativePagesEnabled: false,
    // Native Users window — same opt-in Beta posture. Capability-gated
    // server-side (the window is only registered for users with
    // `list_users`), so this toggle only affects the small set of
    // users who can see the Users tile in the first place.
    nativeUsersEnabled: false,
    // Native Plugins window — replaces `plugins.php` and
    // `plugin-install.php`. Same opt-in Beta posture; cap-gated on
    // `activate_plugins` server-side, so this toggle only affects
    // users who could see the Plugins tile anyway.
    nativePluginsEnabled: false,
    // Native Comments window — replaces `edit-comments.php`. Same
    // opt-in Beta posture; cap-gated on `edit_posts` server-side.
    nativeCommentsEnabled: false,
    showDesktopOnWallpaperClick: false,
    showPostStatusRibbons: true,
    developerModeEnabled: false,
    foldersSharingEnabled: true,
    itemVisibility: {},
    dockOrder: [],
    dockPromotedPositions: {}
  };
  function isPromise(value) {
    return !!value && typeof value === "object" && typeof value.then === "function";
  }
  function sanitizeFilename(name) {
    const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return cleaned || "wallpaper";
  }
  function isUsableImage(item) {
    if (!item || typeof item.id !== "number" || !item.source_url) {
      return false;
    }
    const d = item.media_details;
    return !!d && typeof d.width === "number" && typeof d.height === "number" && d.width > 0 && d.height > 0;
  }
  function stripHtml(markup) {
    if (!markup) {
      return "";
    }
    const el = document.createElement("div");
    el.innerHTML = markup;
    return el.textContent?.trim() || "";
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
  function structuredDefaults() {
    return {
      ...DEFAULTS,
      customGradient: { ...DEFAULTS.customGradient },
      customImage: null,
      wallpaperSettings: { ...DEFAULTS.wallpaperSettings },
      ai: { ...DEFAULTS.ai },
      // Clone the collection fields too. A shallow `...DEFAULTS`
      // aliases these nested objects, so a later in-place mutation
      // (e.g. dragging the gradient editor after a Reset, which spreads
      // these defaults into live state) would corrupt the module-level
      // DEFAULTS singleton for the rest of the session.
      //
      // These are one-level clones, which is sufficient *because* all
      // three defaults are empty (`{}` / `[]`) — there are no inner
      // objects to share. If `DEFAULTS.dockPromotedPositions` ever
      // ships seeded entries, its `{ x, y }` values would need a
      // deeper clone here.
      itemVisibility: { ...DEFAULTS.itemVisibility },
      dockOrder: [...DEFAULTS.dockOrder],
      dockPromotedPositions: { ...DEFAULTS.dockPromotedPositions }
    };
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
  const store$5 = createSharedStore(
    "desktop-mode/settings-tab-registry",
    () => ({
      registry: /* @__PURE__ */ new Map(),
      listeners: /* @__PURE__ */ new Set()
    })
  );
  const registry$3 = store$5.state.registry;
  const listeners$4 = store$5.state.listeners;
  function listSettingsTabs() {
    return Array.from(registry$3.values()).sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100)
    );
  }
  function subscribeSettingsTabs(cb) {
    listeners$4.add(cb);
    return () => {
      listeners$4.delete(cb);
    };
  }
  let loadPromise = null;
  function loadImpl(scriptUrl) {
    if (window.desktopModeMountAboutScene) {
      return Promise.resolve(window.desktopModeMountAboutScene);
    }
    if (loadPromise) {
      return loadPromise;
    }
    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-desktop-mode-about-scene="1"]'
      );
      const finish = () => {
        const fn = window.desktopModeMountAboutScene;
        if (!fn) {
          reject(
            new Error(
              "[desktop-mode] about-scene bundle loaded but did not register desktopModeMountAboutScene"
            )
          );
          return;
        }
        resolve(fn);
      };
      if (existing) {
        if (window.desktopModeMountAboutScene) {
          finish();
        } else {
          existing.addEventListener("load", finish);
          existing.addEventListener(
            "error",
            () => reject(new Error("failed to load about-scene bundle"))
          );
        }
        return;
      }
      const s = document.createElement("script");
      s.src = scriptUrl;
      s.async = true;
      s.dataset.desktopModeAboutScene = "1";
      s.addEventListener("load", finish);
      s.addEventListener(
        "error",
        () => reject(new Error("failed to load about-scene bundle"))
      );
      document.head.appendChild(s);
    });
    return loadPromise;
  }
  async function mountAboutSceneLazy(opts, scriptUrl) {
    const fn = await loadImpl(scriptUrl);
    return fn(opts);
  }
  function waitForSize(el) {
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const observer = new ResizeObserver(() => {
        if (el.clientWidth > 0 && el.clientHeight > 0) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(el);
    });
  }
  function buildAboutSection() {
    const wrapper = document.createElement("div");
    wrapper.classList.add("desktop-mode-os-settings__about");
    const config = window.desktopModeConfig ?? {};
    const pluginUrl2 = config.pluginUrl ?? "";
    const version = config.pluginVersion ?? "";
    const aboutSceneBundleUrl = config.aboutSceneBundleUrl ?? "";
    const desktopApi = window.wp?.desktop;
    render(
      html`
			<div
				class="desktop-mode-os-settings__about-stage-host"
				data-about-stage
			></div>
		`,
      wrapper
    );
    let scene = null;
    let aborted = false;
    const tearDown = () => {
      aborted = true;
      if (scene) {
        try {
          scene.destroy();
        } catch {
        }
        scene = null;
      }
    };
    const mount = async () => {
      if (aborted || !wrapper.isConnected) {
        return;
      }
      const host = wrapper.querySelector("[data-about-stage]");
      if (!host) {
        return;
      }
      try {
        if (desktopApi?.loadModules) {
          await desktopApi.loadModules(["pixijs"]);
        }
        if (aborted || !wrapper.isConnected) {
          return;
        }
        await waitForSize(host);
        if (aborted || !wrapper.isConnected) {
          return;
        }
        const built = await mountAboutSceneLazy(
          {
            container: host,
            logoUrl: `${pluginUrl2}/assets/images/automattic-logotype-color.png`,
            prefersReducedMotion: typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            labels: {
              eyebrow: __("WordPress Desktop Mode"),
              title: __("Crafted with curiosity"),
              byline: __("an experiment by Automattic"),
              version: version ? `${__("Version")} ${version}` : "",
              hint: __("Move your cursor through the swarm · click for a spark")
            }
          },
          aboutSceneBundleUrl
        );
        if (aborted || !wrapper.isConnected) {
          built.destroy();
          return;
        }
        scene = built;
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error("[desktop-mode/about] scene mount failed:", err);
        }
      }
    };
    requestAnimationFrame(() => {
      void mount();
    });
    const observer = new MutationObserver(() => {
      if (!wrapper.isConnected) {
        tearDown();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return wrapper;
  }
  function translateAccentLabel(id, fallback) {
    switch (id) {
      case "wp-blue":
        return __("WordPress Blue");
      case "indigo":
        return __("Indigo");
      case "teal":
        return __("Teal");
      case "emerald":
        return __("Emerald");
      case "amber":
        return __("Amber");
      case "rose":
        return __("Rose");
      default:
        return fallback;
    }
  }
  function translateDockSizeLabel(id, fallback) {
    switch (id) {
      case "compact":
        return __("Compact");
      case "default":
        return __("Default");
      case "large":
        return __("Large");
      default:
        return fallback;
    }
  }
  function translateDesktopLayoutLabel(id, fallback) {
    switch (id) {
      case "classic":
        return __("Classic");
      case "unified":
        return __("Unified");
      case "spatial":
        return __("Spatial");
      default:
        return fallback;
    }
  }
  function translateDesktopLayoutDescription(id) {
    switch (id) {
      case "classic":
        return __(
          "Side bar with the core admin menus, plus a bottom dock for plugin apps."
        );
      case "unified":
        return __(
          "Single bottom dock holding every menu — core and plugin apps share one rail."
        );
      case "spatial":
        return __(
          "Bottom dock for plugin apps; core admin menus appear as icons on the wallpaper."
        );
      default:
        return "";
    }
  }
  function buildAccentSection(ctx) {
    const onPick = (e) => {
      const id = e.detail?.value ?? "";
      if (!getAccents().some((a) => a.id === id)) {
        return;
      }
      ctx.state.accent = id;
      ctx.save();
      ctx.apply();
      paint();
    };
    const wrapper = document.createElement("div");
    const paint = () => render(
      html`
				<wpd-section
					heading=${__("Accent color")}
					description=${__("Used in focused window title bars, buttons, and focus rings.")}
				>
					<wpd-swatch-grid
						label=${__("Accent color")}
						mode="row"
						@wpd-pick=${onPick}
					>
						${getAccents().map(
        (a) => html`<wpd-swatch
								value=${a.id}
								label=${translateAccentLabel(a.id, a.label)}
								preview=${a.value}
								size="small"
								?selected=${ctx.state.accent === a.id}
							></wpd-swatch>`
      )}
					</wpd-swatch-grid>
				</wpd-section>
			`,
      wrapper
    );
    paint();
    return wrapper;
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
  function renderIcon(icon, opts) {
    const className = opts.className ?? "";
    const title = opts.title ?? "";
    if (typeof icon === "string" && icon.startsWith("dashicons-")) {
      const el = document.createElement("span");
      el.className = `dashicons ${icon} ${className}`.trim();
      el.setAttribute("aria-hidden", "true");
      return el;
    }
    if (typeof icon === "string" && icon.startsWith("data:image/svg+xml;base64,")) {
      const base64Part = icon.slice("data:image/svg+xml;base64,".length);
      if (/^[A-Za-z0-9+/=]+$/.test(base64Part)) {
        const el = document.createElement("span");
        el.className = className;
        el.setAttribute("aria-hidden", "true");
        el.style.backgroundImage = `url("${icon}")`;
        el.style.backgroundRepeat = "no-repeat";
        el.style.backgroundPosition = "center";
        el.style.backgroundSize = "contain";
        el.style.display = "inline-block";
        return el;
      }
    }
    if (typeof icon === "string" && /^data:image\/(png|jpeg|jpg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,/i.test(icon)) {
      const commaIdx = icon.indexOf(",");
      const payload = commaIdx >= 0 ? icon.slice(commaIdx + 1) : "";
      if (/^[A-Za-z0-9+/=]+$/.test(payload)) {
        return makeImgIcon(icon, className);
      }
    }
    if (typeof icon === "string" && (icon.startsWith("http://") || icon.startsWith("https://"))) {
      return makeImgIcon(icon, className);
    }
    const span = document.createElement("span");
    span.className = `${className} desktop-mode-icon-letter`.trim();
    span.setAttribute("aria-hidden", "true");
    const letters = letterFromTitle(title);
    span.textContent = letters;
    const hue = hashTitleToHue(title);
    span.style.backgroundColor = `hsl( ${hue}, 60%, 45% )`;
    span.style.color = "#fff";
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.justifyContent = "center";
    span.style.fontWeight = "600";
    span.style.borderRadius = "4px";
    return span;
  }
  function makeImgIcon(src, className) {
    const img = document.createElement("img");
    img.className = className;
    img.src = src;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.draggable = false;
    return img;
  }
  function letterFromTitle(title) {
    const trimmed = (title ?? "").trim();
    if (trimmed === "") {
      return "?";
    }
    const words = trimmed.split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    const first = words[0];
    if (first.length >= 2) {
      return first.slice(0, 2).toUpperCase();
    }
    return first.toUpperCase();
  }
  function resolvePlacement(id, nativeRail, visibility) {
    const override = visibility[id];
    if (override) {
      return override;
    }
    return nativeRail;
  }
  function listPlaceableItems(dockItems, desktopIcons, visibility) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of dockItems) {
      if (seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      out.push({
        id: item.id,
        title: item.title,
        icon: item.icon,
        nativeRail: "dock",
        placement: resolvePlacement(item.id, "dock", visibility)
      });
    }
    for (const icon of desktopIcons) {
      if (seen.has(icon.id)) {
        continue;
      }
      seen.add(icon.id);
      out.push({
        id: icon.id,
        title: icon.title,
        icon: icon.icon,
        nativeRail: "desktop",
        placement: resolvePlacement(icon.id, "desktop", visibility)
      });
    }
    out.sort(
      (a, b) => a.title.localeCompare(b.title, void 0, { sensitivity: "base" })
    );
    return out;
  }
  function readDockItems() {
    const api = window.wp?.desktop;
    if (api && typeof api.getMenuItems === "function") {
      return api.getMenuItems();
    }
    const cfg = window.desktopModeConfig;
    const raw = cfg?.dockItems ?? [];
    return raw.map((i) => ({
      id: i.id,
      title: i.title,
      icon: i.icon,
      url: i.url,
      badge: i.badge,
      submenu: i.submenu,
      multi: i.multi,
      isCore: i.isCore
    }));
  }
  function readDesktopIcons() {
    const cfg = window.desktopModeConfig;
    return cfg?.desktopIcons ?? [];
  }
  function getPlacementOptions() {
    return [
      { id: "desktop", label: __("On the desktop") },
      { id: "dock", label: __("On the dock") },
      { id: "both", label: __("On both") },
      { id: "hidden", label: __("Hidden") }
    ];
  }
  function buildAppsIconsSection(ctx) {
    const wrapper = document.createElement("div");
    const setPlacement = (id, placement) => {
      const next = { ...ctx.state.itemVisibility };
      next[id] = placement;
      ctx.state.itemVisibility = next;
      ctx.save();
      paint();
    };
    const onPlacementChange = (id) => (e) => {
      const detail = e.detail;
      const next = detail?.value;
      if (next === "both" || next === "dock" || next === "desktop" || next === "hidden") {
        setPlacement(id, next);
      }
    };
    const paint = (visibility = ctx.state.itemVisibility) => {
      const dockItems = readDockItems();
      const desktopIcons = readDesktopIcons();
      const rows = listPlaceableItems(dockItems, desktopIcons, visibility);
      render(
        html`
				<wpd-section
					heading=${__("Apps & Icons")}
					description=${__(
          "Choose where each app shortcut shows up — on the dock, on the desktop wallpaper, both, or hidden entirely. Changes apply instantly to the running shell."
        )}
				>
					${rows.length === 0 ? html`<wpd-empty-state
								heading=${__("No apps registered yet")}
								description=${__(
          "Plugins and the admin menu will appear here once they’re registered."
        )}
							></wpd-empty-state>` : html`<div class="desktop-mode-apps-icons__list">
								${rows.map(
          (row) => html`<div
											class="desktop-mode-apps-icons__row"
											data-item-id=${row.id}
										>
											<div class="desktop-mode-apps-icons__identity">
												${renderIcon(row.icon, {
            title: row.title,
            className: "desktop-mode-apps-icons__icon"
          })}
												<div class="desktop-mode-apps-icons__title">
													${row.title}
												</div>
											</div>
											<wpd-select
												label=${__("Show in")}
												value=${row.placement}
												@wpd-pick=${onPlacementChange(row.id)}
											>
												${getPlacementOptions().map(
            (o) => html`<wpd-option
															value=${o.id}
															>${o.label}</wpd-option
														>`
          )}
											</wpd-select>
										</div>`
        )}
							</div>`}
				</wpd-section>
			`,
        wrapper
      );
    };
    paint();
    const wpDesktop = window.wp?.desktop;
    if (wpDesktop?.subscribeOsSettings) {
      const unsubscribe = wpDesktop.subscribeOsSettings((snapshot) => {
        if (!wrapper.isConnected) {
          unsubscribe();
          return;
        }
        paint(snapshot.itemVisibility);
      });
    }
    return wrapper;
  }
  function buildDesktopLayoutSection(ctx) {
    const onPick = (e) => {
      const id = e.detail?.value ?? "";
      if (!DESKTOP_LAYOUTS.some((l) => l.id === id)) {
        return;
      }
      ctx.state.desktopLayout = id;
      ctx.save();
      ctx.apply();
      paint();
    };
    const wrapper = document.createElement("div");
    const paint = () => render(
      html`
				<wpd-section
					heading=${__("Desktop layout")}
					description=${translateDesktopLayoutDescription(
        ctx.state.desktopLayout
      )}
				>
					<wpd-segmented
						value=${ctx.state.desktopLayout}
						label=${__("Desktop layout")}
						@wpd-pick=${onPick}
					>
						${DESKTOP_LAYOUTS.map(
        (l) => html`<wpd-segment value=${l.id}
									>${translateDesktopLayoutLabel(
          l.id,
          l.label
        )}</wpd-segment
								>`
      )}
					</wpd-segmented>
				</wpd-section>
			`,
      wrapper
    );
    paint();
    return wrapper;
  }
  function buildDockSizeSection(ctx) {
    const onPick = (e) => {
      const id = e.detail?.value ?? "";
      if (!DOCK_SIZES.some((d) => d.id === id)) {
        return;
      }
      ctx.state.dockSize = id;
      ctx.save();
      ctx.apply();
      paint();
    };
    const wrapper = document.createElement("div");
    const paint = () => render(
      html`
				<wpd-section
					heading=${__("Dock size")}
					description=${__("Width of the dock and size of its icons.")}
				>
					<wpd-segmented
						value=${ctx.state.dockSize}
						label=${__("Dock size")}
						@wpd-pick=${onPick}
					>
						${DOCK_SIZES.map(
        (s) => html`<wpd-segment value=${s.id}
								>${translateDockSizeLabel(s.id, s.label)}</wpd-segment
							>`
      )}
					</wpd-segmented>
				</wpd-section>
			`,
      wrapper
    );
    paint();
    return wrapper;
  }
  const store$4 = createSharedStore(
    "desktop-mode/dock-rail-registry",
    () => ({
      registry: /* @__PURE__ */ new Map(),
      listeners: /* @__PURE__ */ new Set(),
      activeId: "default"
    })
  );
  const registry$2 = store$4.state.registry;
  const listeners$3 = store$4.state.listeners;
  function list() {
    return Array.from(registry$2.values());
  }
  function subscribe$1(cb) {
    listeners$3.add(cb);
    return () => {
      listeners$3.delete(cb);
    };
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
    /** Filter, receives the wallpaper registry array. */
    WALLPAPERS: "desktop-mode.wallpapers",
    /** Filter, receives the unfocused-window effect registry array. */
    UNFOCUS_EFFECTS: "desktop-mode.unfocus-effects",
    /**
     * Filter, receives a wallpaper's preview params (seeded from the
     * def's `previewParams`) before its `renderPreview` runs in the OS
     * Settings picker. Args: `( params, wallpaperId )`.
     */
    WALLPAPER_PREVIEW_PARAMS: "desktop-mode.wallpaper.preview-params",
    /**
     * Action, fires after a wallpaper's persisted settings change (the
     * user edited them through the wallpaper's config dialog in OS
     * Settings). Payload: `{ id, settings }` — the wallpaper id and the
     * full post-merge settings object. A mounted wallpaper subscribes to
     * live-apply changes without a remount.
     *
     * @since 0.9.5
     */
    WALLPAPER_SETTINGS_CHANGED: "desktop-mode.wallpaper.settings-changed",
    /**
     * Filter — applied to the registered window-link renderer list on
     * every read (`wp.desktop.listWindowLinkRenderers()`). Signature:
     * `( defs: WindowLinkRendererDef[] ) => WindowLinkRendererDef[]`.
     *
     * @since 0.9.4
     */
    WINDOW_LINK_RENDERERS: "desktop-mode.window-links.renderers"
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
  const dialogStyles = css`:host{display:none;position:fixed;inset:0;align-items:center;justify-content:center;background:rgba( 0,0,0,0.45 );backdrop-filter:blur( 2px );z-index:10000}:host( [ open ] ){display:flex}.dialog{width:min( 420px,92vw );background:var( --wpd-confirm-dialog-bg,var( --desktop-mode-bg,#1d2327 ) );color:var( --wpd-confirm-dialog-fg,var( --desktop-mode-fg,#fff ) );border:1px solid rgba( 255,255,255,0.08 );border-radius:10px;box-shadow:0 20px 50px rgba( 0,0,0,0.6 );padding:20px 22px 18px;display:flex;flex-direction:column;gap:10px;position:relative}.close{position:absolute;top:8px;right:10px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:0;border-radius:6px;color:var( --wpd-confirm-dialog-fg-muted,rgba( 255,255,255,0.7 ) );cursor:pointer;font-size:22px;line-height:1;padding:0}.close:hover{background:rgba( 255,255,255,0.08 );color:inherit}.title{margin:0 0 4px;font-size:16px;font-weight:600}.message{margin:0;color:var( --wpd-confirm-dialog-fg-muted,rgba( 255,255,255,0.7 ) );line-height:1.45;white-space:pre-line}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}.btn{border:0;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer;font-weight:500}.btn--secondary{background:rgba( 255,255,255,0.08 );color:inherit}.btn--secondary:hover{background:rgba( 255,255,255,0.14 )}.btn--primary{background:var( --wp-admin-theme-color,#2271b1 );color:#fff}.btn--primary:hover{filter:brightness( 1.08 )}.btn--danger{background:#d63638;color:#fff}.btn--danger:hover{filter:brightness( 1.08 )}`;
  const _WpdConfirmDialog = class _WpdConfirmDialog extends Component {
    constructor() {
      super(...arguments);
      this._onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          this._cancel();
        }
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          this._confirm();
        }
      };
      this._onBackdrop = (e) => {
        const path = e.composedPath();
        const original = path.length > 0 ? path[0] : e.target;
        if (original === this) {
          this._cancel();
        }
      };
      this._confirm = () => {
        this.emit("wpd-confirm", { confirmed: true });
        this.removeAttribute("open");
      };
      this._cancel = () => {
        this.emit("wpd-cancel", { confirmed: false });
        this.removeAttribute("open");
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
    render() {
      const title = this.title ?? "";
      const message = this.message ?? "";
      const confirmLabel = this["confirm-label"] || "Confirm";
      const cancelLabel = this["cancel-label"] || "Cancel";
      const isDanger = this.hasAttribute("danger");
      const hideCancel = this.hasAttribute("hide-cancel");
      const isDismissable = this.hasAttribute("dismissable");
      return html`
			<div class="dialog" tabindex="-1">
				${isDismissable ? html`<button
						type="button"
						class="close"
						aria-label="Close"
						@click=${() => this._cancel()}
					>&times;</button>` : html``}
				${title ? html`<h2 class="title">${title}</h2>` : html``}
				${message ? html`<p class="message">${message}</p>` : html``}
				<div class="actions">
					${hideCancel ? html`` : html`<button
							type="button"
							class="btn btn--secondary"
							@click=${() => this._cancel()}
						>
							${cancelLabel}
						</button>`}
					<button
						type="button"
						class="btn ${isDanger ? "btn--danger" : "btn--primary"}"
						@click=${() => this._confirm()}
					>
						${confirmLabel}
					</button>
				</div>
			</div>
		`;
    }
  };
  _WpdConfirmDialog.props = [
    "open",
    "title",
    "message",
    "confirm-label",
    "cancel-label",
    "danger",
    "hide-cancel",
    "dismissable"
  ];
  _WpdConfirmDialog.styles = [dialogStyles];
  _WpdConfirmDialog.help = {
    title: "Confirm dialog",
    summary: "Modal Yes/No replacement for window.confirm(). Two consumption paths: declarative element with `open` + `wpd-confirm` event, or the imperative Promise-returning `wpdConfirm()` helper.",
    status: "experimental",
    since: "0.9.0",
    props: [
      { name: "open", type: "boolean attribute", description: "Mounts the dialog visible." },
      { name: "title", type: "string", description: "Heading shown at the top." },
      { name: "message", type: "string", description: "Body copy. Newlines preserved." },
      { name: "confirm-label", type: "string", default: "Confirm", description: "Confirm-button label." },
      { name: "cancel-label", type: "string", default: "Cancel", description: "Cancel-button label." },
      { name: "danger", type: "boolean attribute", description: "Renders the confirm button red." },
      { name: "hide-cancel", type: "boolean attribute", description: "Hides the cancel button entirely. Useful when there is no alternative action — pair with `dismissable` so the user still has an explicit way to close." },
      { name: "dismissable", type: "boolean attribute", description: "Renders an X close button in the top-right corner. Click emits `wpd-cancel`." }
    ],
    events: [
      {
        name: "wpd-confirm",
        description: "Fires on confirm. Detail: `{ confirmed: true }`."
      },
      {
        name: "wpd-cancel",
        description: "Fires on cancel (Cancel button, Escape, backdrop click). Detail: `{ confirmed: false }`."
      }
    ]
  };
  let WpdConfirmDialog = _WpdConfirmDialog;
  defineComponent("wpd-confirm-dialog", WpdConfirmDialog);
  function wpdConfirm(options) {
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
  createSharedStore(
    "desktop-mode/native-url-remap",
    () => ({ remaps: [], deps: null })
  );
  function buildDockRailRendererSection(ctx) {
    const wrapper = document.createElement("div");
    const onPick = (e) => {
      const id = e.detail?.value ?? "";
      if (id === "") {
        return;
      }
      ctx.state.dockRailRenderer = id;
      ctx.save();
      ctx.apply();
      paint();
    };
    let renderers = list();
    const paint = () => {
      if (renderers.length <= 1) {
        render(html``, wrapper);
        return;
      }
      render(
        html`
				<wpd-section
					heading=${__("Dock style")}
					description=${__(
          "How the rail itself paints — the shipped icon strip, or anything a plugin replaces it with. Switching is instant; the dock rebuilds with the new renderer."
        )}
				>
					<wpd-segmented
						value=${ctx.state.dockRailRenderer}
						label=${__("Dock style")}
						@wpd-pick=${onPick}
					>
						${renderers.map(
          (r) => html`<wpd-segment value=${r.id}
									>${r.label}</wpd-segment
								>`
        )}
					</wpd-segmented>
				</wpd-section>
			`,
        wrapper
      );
    };
    const unsubscribe = subscribe$1(() => {
      renderers = list();
      paint();
    });
    const observer = new MutationObserver(() => {
      if (!wrapper.isConnected) {
        unsubscribe();
        observer.disconnect();
      }
    });
    queueMicrotask(() => {
      if (wrapper.parentNode) {
        observer.observe(wrapper.parentNode, {
          childList: true,
          subtree: false
        });
      }
    });
    paint();
    return wrapper;
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
  const UNFOCUS_EFFECT_NONE = "none";
  const store$3 = createSharedStore(
    "desktop-mode/unfocus-effect-registry",
    () => ({ registry: /* @__PURE__ */ new Map(), listeners: /* @__PURE__ */ new Set() })
  );
  const registry$1 = store$3.state.registry;
  const listeners$2 = store$3.state.listeners;
  const UNFOCUS_EFFECT_ID = /^[a-z0-9_/-]+$/;
  function registerUnfocusEffect(def) {
    const errors = [];
    if (!def || typeof def !== "object") {
      errors.push("def (not an object)");
    } else {
      if (typeof def.id !== "string" || def.id.trim() === "") {
        errors.push("id (missing)");
      } else if (!UNFOCUS_EFFECT_ID.test(def.id.trim().toLowerCase())) {
        errors.push(
          `id (must match ${UNFOCUS_EFFECT_ID} — lowercase alphanum, hyphens, underscores, slashes for vendor/sub-id)`
        );
      } else if (def.id.trim().toLowerCase() === UNFOCUS_EFFECT_NONE) {
        errors.push('id ("none" is reserved)');
      }
      if (typeof def.label !== "string" || def.label.trim() === "") {
        errors.push("label (missing)");
      }
      if (typeof def.className !== "string" && typeof def.apply !== "function") {
        errors.push(
          "className|apply (at least one must be provided — a CSS class to toggle or an apply callback)"
        );
      }
    }
    throwOnRegistrationErrors("UnfocusEffect", errors, def);
    const id = def.id.trim().toLowerCase();
    registry$1.set(id, { ...def, id });
    notify$1();
  }
  function listUnfocusEffects() {
    const copy = Array.from(registry$1.values());
    const filtered = applyFilters(
      HOOKS.UNFOCUS_EFFECTS,
      copy
    );
    if (!Array.isArray(filtered)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[desktop-mode] `desktop-mode.unfocus-effects` filter returned a non-array; falling back to registry list."
        );
      }
      return copy;
    }
    return filtered;
  }
  function subscribeUnfocusEffects(cb) {
    listeners$2.add(cb);
    return () => {
      listeners$2.delete(cb);
    };
  }
  function notify$1() {
    const snapshot = Array.from(listeners$2);
    for (const cb of snapshot) {
      try {
        cb();
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            "[desktop-mode] unfocus-effect registry listener threw:",
            err
          );
        }
      }
    }
  }
  registerUnfocusEffect({
    id: "darken",
    label: __("Darken"),
    description: __("Dim unfocused windows so the focused one stands out."),
    className: "desktop-mode-window--fx-darken"
  });
  registerUnfocusEffect({
    id: "frost",
    label: __("Frost"),
    description: __(
      "Throw unfocused windows out of focus — a soft, frosted-glass blur, as if you were looking at them through an iced-over pane."
    ),
    className: "desktop-mode-window--fx-frost"
  });
  registerUnfocusEffect({
    id: "grayscale",
    label: __("Grayscale"),
    description: __(
      "Drain the colour from unfocused windows so the focused one is the only thing still in colour — your eye snaps right to it."
    ),
    className: "desktop-mode-window--fx-grayscale"
  });
  const WINDOW_LINK_RENDERER_NONE = "none";
  const store$2 = createSharedStore(
    "desktop-mode/window-link-renderer-registry",
    () => ({ registry: /* @__PURE__ */ new Map(), listeners: /* @__PURE__ */ new Set() })
  );
  const registry = store$2.state.registry;
  const listeners$1 = store$2.state.listeners;
  function listWindowLinkRenderers() {
    const copy = Array.from(registry.values());
    const filtered = applyFilters(
      HOOKS.WINDOW_LINK_RENDERERS,
      copy
    );
    if (!Array.isArray(filtered)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[desktop-mode] `desktop-mode.window-links.renderers` filter returned a non-array; falling back to registry list."
        );
      }
      return copy;
    }
    return filtered;
  }
  function subscribeWindowLinkRenderers(cb) {
    listeners$1.add(cb);
    return () => {
      listeners$1.delete(cb);
    };
  }
  const LINK_VISIBILITIES = [
    { id: "focus", label: () => __("When a related window is focused") },
    { id: "always", label: () => __("Always") },
    { id: "off", label: () => __("Off") }
  ];
  function buildEffectsSection(ctx) {
    const wrapper = document.createElement("div");
    const onPick = (e) => {
      const id = e.detail?.value ?? "";
      if (id === "") {
        return;
      }
      if (id !== UNFOCUS_EFFECT_NONE && !effects.some((fx) => fx.id === id)) {
        return;
      }
      ctx.state.unfocusEffect = id;
      ctx.save();
      ctx.apply();
      paint();
    };
    const onPickLinkRenderer = (e) => {
      const id = e.detail?.value ?? "";
      if (id === "") {
        return;
      }
      if (id !== WINDOW_LINK_RENDERER_NONE && !linkRenderers.some((r) => r.id === id)) {
        return;
      }
      ctx.state.windowLinkRenderer = id;
      ctx.save();
      ctx.apply();
      paint();
    };
    const onPickLinkVisibility = (e) => {
      const id = e.detail?.value ?? "";
      if (id !== "focus" && id !== "always" && id !== "off") {
        return;
      }
      ctx.state.windowLinkVisibility = id;
      ctx.save();
      ctx.apply();
      paint();
    };
    let effects = listUnfocusEffects();
    let linkRenderers = listWindowLinkRenderers();
    const paint = () => {
      const active = effects.find(
        (fx) => fx.id === ctx.state.unfocusEffect
      );
      const fallbackDescription = __(
        "Apply a visual treatment to every window except the one you are working in."
      );
      const description = ctx.state.unfocusEffect !== UNFOCUS_EFFECT_NONE && active?.description ? active.description : fallbackDescription;
      const activeLinkRenderer = linkRenderers.find(
        (r) => r.id === ctx.state.windowLinkRenderer
      );
      const linksFallbackDescription = __(
        "Draw a visual tie between windows showing related content — a post and its comments or media."
      );
      const linksDescription = ctx.state.windowLinkRenderer !== WINDOW_LINK_RENDERER_NONE && activeLinkRenderer?.description ? activeLinkRenderer.description : linksFallbackDescription;
      render(
        html`
				<wpd-section
					heading=${__("Unfocused windows")}
					description=${description}
				>
					<wpd-select
						value=${ctx.state.unfocusEffect}
						label=${__("Unfocused window effect")}
						@wpd-pick=${onPick}
					>
						<wpd-option value=${UNFOCUS_EFFECT_NONE}>
							${__("None")}
						</wpd-option>
						${effects.map(
          (fx) => html`<wpd-option value=${fx.id}
									>${fx.label}</wpd-option
								>`
        )}
					</wpd-select>
				</wpd-section>
				<wpd-section
					heading=${__("Window links")}
					description=${linksDescription}
				>
					<wpd-select
						value=${ctx.state.windowLinkRenderer}
						label=${__("Link style")}
						@wpd-pick=${onPickLinkRenderer}
					>
						<wpd-option value=${WINDOW_LINK_RENDERER_NONE}>
							${__("None")}
						</wpd-option>
						${linkRenderers.map(
          (r) => html`<wpd-option value=${r.id}
									>${r.label}</wpd-option
								>`
        )}
					</wpd-select>
					<wpd-select
						value=${ctx.state.windowLinkVisibility}
						label=${__("Show links")}
						@wpd-pick=${onPickLinkVisibility}
					>
						${LINK_VISIBILITIES.map(
          (v) => html`<wpd-option value=${v.id}
									>${v.label()}</wpd-option
								>`
        )}
					</wpd-select>
				</wpd-section>
			`,
        wrapper
      );
    };
    const unsubscribe = subscribeUnfocusEffects(() => {
      effects = listUnfocusEffects();
      paint();
    });
    const unsubscribeLinks = subscribeWindowLinkRenderers(() => {
      linkRenderers = listWindowLinkRenderers();
      paint();
    });
    const observer = new MutationObserver(() => {
      if (!wrapper.isConnected) {
        unsubscribe();
        unsubscribeLinks();
        observer.disconnect();
      }
    });
    queueMicrotask(() => {
      if (wrapper.parentNode) {
        observer.observe(wrapper.parentNode, {
          childList: true,
          subtree: false
        });
      }
    });
    paint();
    return wrapper;
  }
  function buildExtendedSection(ctx) {
    const { extendedOptions, extendedOptionsUrl, restNonce } = ctx.config;
    const state = {
      media_library_enhanced: extendedOptions?.media_library_enhanced === true,
      saving: false,
      error: ""
    };
    const el = document.createElement("div");
    const save = async () => {
      if (!extendedOptionsUrl || !restNonce || state.saving) {
        return;
      }
      state.saving = true;
      state.error = "";
      paint();
      try {
        const res = await trackedFetch(
          extendedOptionsUrl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-WP-Nonce": restNonce
            },
            body: JSON.stringify({
              options: {
                media_library_enhanced: state.media_library_enhanced
              }
            })
          },
          { source: "desktop-mode/settings/extended" }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          state.error = err.message ?? `Error ${res.status}`;
        } else {
          const saved = await res.json().catch(() => null);
          if (saved && typeof saved === "object") {
            ctx.config.extendedOptions = saved;
          }
        }
      } catch {
        state.error = __("Network error — check your connection.");
      } finally {
        state.saving = false;
        paint();
      }
    };
    const onMediaToggle = (e) => {
      state.media_library_enhanced = e.detail?.checked === true;
      save();
    };
    const paint = () => render(
      html`
				<wpd-section
					heading=${__("Extended options")}
					description=${__(
        "Site-wide enhancements that apply to every user. Toggling requires the affected page to be reloaded for the change to take effect."
      )}
				>
					<wpd-checkbox-label
						label=${__("Enable drag-and-drop in the Media Library")}
						?checked=${state.media_library_enhanced}
						@wpd-checkbox-change=${onMediaToggle}
					></wpd-checkbox-label>

					<p class="desktop-mode-ext__hint">
						${__(
        "Makes every item in the WordPress Media Library draggable. Drop a media item into text fields, rich-text editors, Gutenberg blocks, or any target that accepts images or files. No replacement of the library — just a drag-and-drop layer on top of the one you already know."
      )}
					</p>

					${state.error ? html`<p class="desktop-mode-ext__error">${state.error}</p>` : html``}
					${state.saving ? html`<p class="desktop-mode-ext__saving">${__("Saving…")}</p>` : html``}
				</wpd-section>
			`,
      el
    );
    paint();
    return el;
  }
  function buildFeaturesSection(ctx) {
    const wrapper = document.createElement("div");
    const onNativePostsToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.nativePostsEnabled = checked;
      ctx.save();
      paint();
    };
    const onHeartbeatRateChange = (e) => {
      const raw = e.detail?.value;
      const next = Number(raw);
      if (![15, 30, 45, 60].includes(next)) {
        return;
      }
      ctx.state.heartbeatRate = next;
      ctx.save();
      try {
        const wp = window.wp;
        const speed = next >= 60 ? "slow" : "standard";
        wp?.heartbeat?.interval?.(speed);
      } catch (_e) {
      }
      paint();
    };
    const onNativePagesToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.nativePagesEnabled = checked;
      ctx.save();
      paint();
    };
    const onNativeUsersToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.nativeUsersEnabled = checked;
      ctx.save();
      paint();
    };
    const onNativePluginsToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.nativePluginsEnabled = checked;
      ctx.save();
      paint();
    };
    const onNativeCommentsToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.nativeCommentsEnabled = checked;
      ctx.save();
      paint();
    };
    const onShowDesktopOnClickToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.showDesktopOnWallpaperClick = checked;
      ctx.save();
      paint();
    };
    const onWindowLinksToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.windowLinksEnabled = checked;
      ctx.save();
      ctx.apply();
      paint();
    };
    const onWindowLinkRaiseToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.windowLinkRaiseOnFocus = checked;
      ctx.save();
      ctx.apply();
      paint();
    };
    const onWindowLinkHighlightToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.windowLinkHighlight = checked;
      ctx.save();
      ctx.apply();
      paint();
    };
    const onShowPostStatusRibbonsToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.showPostStatusRibbons = checked;
      ctx.save();
      paint();
    };
    const onDeveloperModeToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.developerModeEnabled = checked;
      ctx.save();
      paint();
    };
    const onFolderSharingToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.foldersSharingEnabled = checked;
      ctx.save();
      paint();
    };
    let purging = false;
    const onPurgeShareTables = async () => {
      if (purging) {
        return;
      }
      const ok = await wpdConfirm({
        title: __("Delete folder sharing data?"),
        message: __(
          "This drops every shares table on the site (current + legacy). All invites, accept/deny decisions, and share rows are permanently removed. Recipients lose their access until someone shares with them again. The empty tables are recreated on the next admin load so the feature keeps working — but every existing share is gone."
        ),
        confirmLabel: __("Delete data")
      });
      if (!ok) {
        return;
      }
      const base = shellCfg?.filesUrl;
      const nonce = shellCfg?.restNonce;
      if (!base || !nonce) {
        showToast({ message: __("Files REST endpoint is not available.") });
        return;
      }
      purging = true;
      paint();
      try {
        const url = base.replace(/\/+$/, "") + "/folder-sharing-tables/purge";
        const res = await trackedFetch(
          url,
          {
            method: "POST",
            headers: { "X-WP-Nonce": nonce },
            credentials: "same-origin"
          },
          { source: "os-settings/folder-sharing-purge" }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${res.status}: ${body.slice(0, 200)}`);
        }
        const data = await res.json();
        showToast({
          message: __("Folder sharing data deleted.") + " (" + data.dropped.length + " tables)"
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        showToast({
          message: __("Could not delete sharing data.") + " " + detail
        });
      } finally {
        purging = false;
        paint();
      }
    };
    const shellCfg = window.desktopModeConfig;
    const aiState = {
      enabled: shellCfg?.commentsAi?.enabled ?? false,
      providerConfigured: shellCfg?.commentsAi?.providerConfigured ?? false,
      saving: false
    };
    const onCommentsAiToggle = async (e) => {
      const checked = e.detail?.checked === true;
      if (!shellCfg?.commentsAiUrl || aiState.saving) {
        return;
      }
      aiState.saving = true;
      aiState.enabled = checked;
      paint();
      try {
        const response = await trackedFetch(
          shellCfg.commentsAiUrl,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-WP-Nonce": shellCfg.restNonce ?? ""
            },
            body: JSON.stringify({ enabled: checked })
          },
          { source: "os-settings/comments-ai" }
        );
        if (response.ok) {
          const json = await response.json();
          aiState.enabled = json.enabled;
          aiState.providerConfigured = json.providerConfigured;
          if (shellCfg.commentsAi) {
            shellCfg.commentsAi.enabled = json.enabled;
            shellCfg.commentsAi.providerConfigured = json.providerConfigured;
          }
        } else {
          aiState.enabled = !checked;
        }
      } catch {
        aiState.enabled = !checked;
      }
      aiState.saving = false;
      paint();
    };
    const onAiAssistantToggle = (e) => {
      const checked = e.detail?.checked === true;
      ctx.state.ai = { ...ctx.state.ai, enabled: checked };
      ctx.save();
      paint();
    };
    const refreshAiStatus = async () => {
      const ai = shellCfg?.aiAssistant;
      if (!ai || !shellCfg?.aiStatusUrl) {
        return;
      }
      try {
        const res = await trackedFetch(
          shellCfg.aiStatusUrl,
          {
            credentials: "same-origin",
            headers: { "X-WP-Nonce": shellCfg.restNonce ?? "" }
          },
          { source: "os-settings/ai-status", silent: true }
        );
        if (!res.ok) {
          return;
        }
        const json = await res.json();
        const changed = ai.available !== (json.available === true) || ai.assistantProviderConfigured !== (json.assistantProviderConfigured === true);
        ai.available = json.available === true;
        ai.providerConfigured = json.providerConfigured === true;
        ai.assistantProviderConfigured = json.assistantProviderConfigured === true;
        aiState.providerConfigured = ai.providerConfigured;
        paint();
        if (changed) {
          document.dispatchEvent(
            new CustomEvent("desktop-mode-ai-status-changed")
          );
        }
      } catch {
      }
    };
    let statusInFlight = false;
    const onOsSettingsFocus = (e) => {
      if (e.detail?.windowId !== "desktop-mode-os-settings") {
        return;
      }
      if (statusInFlight) {
        return;
      }
      statusInFlight = true;
      void refreshAiStatus().finally(() => {
        statusInFlight = false;
      });
    };
    document.addEventListener("desktop-mode-window-focused", onOsSettingsFocus);
    const statusCleanup = new MutationObserver(() => {
      if (!wrapper.isConnected) {
        document.removeEventListener(
          "desktop-mode-window-focused",
          onOsSettingsFocus
        );
        statusCleanup.disconnect();
      }
    });
    statusCleanup.observe(document.body, { childList: true, subtree: true });
    const onOpenConnectors = () => {
      const url = shellCfg?.aiAssistant?.connectorsUrl ?? "";
      if (!url) {
        return;
      }
      const desktop = window.wp?.desktop;
      if (desktop?.windowManager?.open) {
        const id = desktop.deriveWindowId ? desktop.deriveWindowId(url) : url;
        desktop.windowManager.open({
          id,
          url,
          title: __("Connectors"),
          icon: "dashicons-admin-settings"
        });
      } else {
        window.open(url, "_blank", "noopener");
      }
    };
    let resetting = false;
    const onResetIntros = async () => {
      if (resetting) {
        return;
      }
      const cfg = window.desktopModeConfig;
      if (!cfg?.seenIntrosUrl) {
        return;
      }
      resetting = true;
      paint();
      try {
        await trackedFetch(
          cfg.seenIntrosUrl,
          {
            method: "DELETE",
            credentials: "same-origin",
            headers: {
              "X-WP-Nonce": cfg.restNonce ?? ""
            }
          },
          { source: "os-settings/reset-intros" }
        );
        const store2 = window.desktopModeWindowConfig;
        if (store2) {
          Object.values(store2).forEach((entry) => {
            if (entry && typeof entry === "object") {
              entry.introSeen = false;
            }
          });
        }
        document.dispatchEvent(
          new CustomEvent("desktop-mode-intros-reset")
        );
      } catch {
      }
      resetting = false;
      paint();
    };
    const paint = () => render(
      html`
				<wpd-section
					heading=${__("Features")}
					description=${__(
        "Tune individual Desktop Mode behaviors. Each toggle affects only your account and takes effect immediately — no reload required. Watch the dot in the OS Settings title bar to see when a change has been saved."
      )}
				>
					${shellCfg?.aiAssistant?.available ? html`
								<div class="desktop-mode-features__item">
									<wpd-checkbox-label
										label=${__("AI assistant")}
										?checked=${ctx.state.ai.enabled}
										?disabled=${!shellCfg.aiAssistant.assistantProviderConfigured}
										@wpd-checkbox-change=${onAiAssistantToggle}
									></wpd-checkbox-label>
									<p class="desktop-mode-features__hint">
										${__(
        "Adds an assistant powered by AI that finds your content, gets around wp-admin, and answers questions about your site — all in plain language. Off by default."
      )}
									</p>
									${!shellCfg.aiAssistant.assistantProviderConfigured ? html`
												<wpd-notice tone="warning" not-dismissible>
													${__(
        "This feature requires an AI provider configured in"
      )}
													<a
														href=${shellCfg.aiAssistant.connectorsUrl}
														@click=${(e) => {
        e.preventDefault();
        onOpenConnectors();
      }}
														>${__(
        "Settings → Connectors"
      )}</a
													>.
												</wpd-notice>
											` : ""}
								</div>
							` : ""}
					${shellCfg?.commentsAi ? html`
							<div class="desktop-mode-features__item">
								<wpd-checkbox-label
									label=${__("Score new comments with AI")}
									?checked=${aiState.enabled}
									?disabled=${aiState.saving || !aiState.providerConfigured}
									@wpd-checkbox-change=${onCommentsAiToggle}
								></wpd-checkbox-label>
								<p class="desktop-mode-features__hint">
									${__(
        "Scores every new comment for spam and hostility, folding the result into the spam confidence shown in the Comments window. Site-wide, off by default."
      )}
								</p>
								${!aiState.providerConfigured ? html`
											<wpd-notice tone="warning" not-dismissible>
												${__("This feature requires an AI provider configured in")}
												<a
													href=${shellCfg?.aiAssistant?.connectorsUrl ?? ""}
													@click=${(e) => {
        e.preventDefault();
        onOpenConnectors();
      }}
													>${__("Settings → Connectors")}</a
												>.
											</wpd-notice>
										` : ""}
							</div>
						` : ""}
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__("Window links")}
							?checked=${ctx.state.windowLinksEnabled}
							@wpd-checkbox-change=${onWindowLinksToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        "Draws arrowed connector lines between windows showing related content — a post and its comments or media, or two posts that link to each other. The line style and when the lines show live in Effects → Window links. On by default."
      )}
						</p>
						<div class="desktop-mode-features__item">
							<wpd-checkbox-label
								label=${__("Bring related windows to front")}
								?checked=${ctx.state.windowLinkRaiseOnFocus}
								?disabled=${!ctx.state.windowLinksEnabled}
								@wpd-checkbox-change=${onWindowLinkRaiseToggle}
							></wpd-checkbox-label>
							<p class="desktop-mode-features__hint">
								${__(
        "Clicking a window surfaces the windows directly tied to it — a parent brings up all of its children, a child brings up its parent — rising to just below the one you clicked, without stealing focus."
      )}
							</p>
						</div>
						<div class="desktop-mode-features__item">
							<wpd-checkbox-label
								label=${__("Highlight related windows")}
								?checked=${ctx.state.windowLinkHighlight}
								?disabled=${!ctx.state.windowLinksEnabled}
								@wpd-checkbox-change=${onWindowLinkHighlightToggle}
							></wpd-checkbox-label>
							<p class="desktop-mode-features__hint">
								${__(
        "While a group member is focused, its related windows get an accent outline and a soft glow so the family is recognizable at a glance."
      )}
							</p>
						</div>
					</div>
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__(
        "Show desktop when clicking the wallpaper"
      )}
							?checked=${ctx.state.showDesktopOnWallpaperClick}
							@wpd-checkbox-change=${onShowDesktopOnClickToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        'macOS-style gesture: a left click on the empty desktop minimizes every window, and a second click restores them. When on, the matching "Show desktop" entry is removed from the wallpaper context menu — the click gesture replaces it. Off by default.'
      )}
						</p>
					</div>
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__(
        "Show post/page status ribbon"
      )}
							?checked=${ctx.state.showPostStatusRibbons}
							@wpd-checkbox-change=${onShowPostStatusRibbonsToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        "Paints a diagonal corner ribbon — Draft, Pending, Private, or Scheduled — on My WordPress tiles whose post status isn’t published. Off hides every ribbon; tiles still respect their dimmed-icon treatment so unpublished items remain visible at a glance. On by default."
      )}
						</p>
					</div>
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__("Enable developer mode")}
							?checked=${ctx.state.developerModeEnabled}
							@wpd-checkbox-change=${onDeveloperModeToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        "Unlocks developer-facing surfaces meant for plugin authors: the Starter Widget appears in the add-widget picker, and the OS Settings → Components tab runs its intentional missing-import-warner demo (a console banner plus three deliberate console.error entries). Off by default so regular users don’t see developer noise."
      )}
						</p>
					</div>
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__("Folder sharing")}
							?checked=${ctx.state.foldersSharingEnabled}
							@wpd-checkbox-change=${onFolderSharingToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        'Lets you share desktop folders with other users or roles, with read or read+write access. When off, every share-related affordance (Share button, invites, "Leave shared folder") disappears from your shell and the heartbeat stops delivering share payloads to your session. Other users are unaffected. On by default.'
      )}
						</p>
						${shellCfg?.currentUserIsAdmin ? html`
								<div class="desktop-mode-features__danger-row">
									<wpd-button
										variant="danger"
										?disabled=${purging}
										@click=${onPurgeShareTables}
									>
										${purging ? __("Deleting…") : __("Delete folder sharing data")}
									</wpd-button>
									<p class="desktop-mode-features__hint">
										${__(
        "Site-wide destructive action (admin only). Drops every shares table — invites, decisions, share rows. Empty tables are recreated immediately so the feature still works for anyone who wants to start fresh. Use this on sites that never needed sharing to clear the data outright."
      )}
									</p>
								</div>
							` : ""}
					</div>
					<div class="desktop-mode-features__item">
						<label class="desktop-mode-features__select-label">
							<span class="desktop-mode-features__select-title">${__(
        "WordPress Heartbeat rate"
      )}</span>
							<wpd-select
								value=${String(ctx.state.heartbeatRate)}
								@wpd-pick=${onHeartbeatRateChange}
							>
								<wpd-option value="15">${__("Fast — 15s (not recommended)")}</wpd-option>
								<wpd-option value="30">${__("Medium — 30s")}</wpd-option>
								<wpd-option value="45">${__("Slow — 45s")}</wpd-option>
								<wpd-option value="60">${__("Very slow — 60s (default)")}</wpd-option>
							</wpd-select>
						</label>
						<p class="desktop-mode-features__hint">
							${__(
        "How often the WordPress Heartbeat API runs. Faster = quicker live updates (autosaves, lock checks, the heartbeat widget) at the cost of more server traffic. 15 s triples server load vs. the 60 s default — use sparingly. 30 s and 45 s require a page reload to apply exactly; 15 s and 60 s take effect immediately."
      )}
						</p>
					</div>
					<div class="desktop-mode-features__row">
						<wpd-button
							variant="secondary"
							?disabled=${resetting}
							@click=${onResetIntros}
						>
							${resetting ? __("Resetting…") : __("Reset what’s-new dialogs")}
						</wpd-button>
						<p class="desktop-mode-features__hint">
							${__(
        "Re-shows the one-time introduction dialog the next time you open each redesigned native window."
      )}
						</p>
					</div>
				</wpd-section>
				<wpd-section
					heading=${__("Beta features")}
					description=${__(
        "Experimental redesigns of core admin screens. Off by default — opt in to try them. Each toggle affects only your account and takes effect immediately, no reload required."
      )}
				>
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__("Use the native Posts window")}
							?checked=${ctx.state.nativePostsEnabled}
							@wpd-checkbox-change=${onNativePostsToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        "Beta — off by default. Turn on to replace the classic Posts list iframe with a native, table-driven window: sticky header, server-paginated rows, multi-select bulk actions, and a sub-row preview. Toggle off any time to return to the classic screen."
      )}
						</p>
					</div>
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__("Use the native Pages window")}
							?checked=${ctx.state.nativePagesEnabled}
							@wpd-checkbox-change=${onNativePagesToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        "Beta — off by default. Turn on for the same table-driven experience as the Posts window, tailored for Pages: a Parent column, hierarchical sort, and a lock indicator when another user is editing a page. Toggle off any time to return to the classic screen."
      )}
						</p>
					</div>
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__("Use the native Users window")}
							?checked=${ctx.state.nativeUsersEnabled}
							@wpd-checkbox-change=${onNativeUsersToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        "Beta — off by default. Turn on for a native Users list with bulk role change, last-login tracking, live online indicators, click-to-copy email, and one-click password resets. Capability-gated — readers see a read-only view, role assignment respects WordPress role permissions."
      )}
						</p>
					</div>
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__("Use the native Plugins window")}
							?checked=${ctx.state.nativePluginsEnabled}
							@wpd-checkbox-change=${onNativePluginsToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        "Beta — off by default. Turn on for a native two-tab Plugins window: an Installed list with bulk activate / deactivate / delete, and a Browse gallery powered by the WordPress.org repository — rich detail flyout with screenshots, ratings histogram, and recent reviews. Drag a .zip onto the window to install, or drag a card from Browse to the dock to pin it."
      )}
						</p>
					</div>
					<div class="desktop-mode-features__item">
						<wpd-checkbox-label
							label=${__("Use the native Comments window")}
							?checked=${ctx.state.nativeCommentsEnabled}
							@wpd-checkbox-change=${onNativeCommentsToggle}
						></wpd-checkbox-label>
						<p class="desktop-mode-features__hint">
							${__(
        "Beta — off by default. Turn on for a redesigned moderation queue with Pending / All / Spam / Trash / Mine tabs, bulk approve/spam/trash plus an 8-second undo, inline reply right in the row, an author insights drawer, a per-row spam confidence score (Akismet + heuristics), and full keyboard moderation (j/k navigate, a approve, s spam, d trash, r reply, e edit, u undo)."
      )}
						</p>
					</div>
				</wpd-section>
			`,
      wrapper
    );
    paint();
    return wrapper;
  }
  const WPD_COMPONENT_TAGS = [
    "wpd-section",
    "wpd-button",
    "wpd-swatch",
    "wpd-swatch-grid",
    "wpd-segmented",
    "wpd-segment",
    "wpd-select",
    "wpd-option",
    "wpd-multiselect",
    "wpd-color-field",
    "wpd-range-field",
    "wpd-text-field",
    "wpd-number-field",
    "wpd-checkbox",
    "wpd-checkbox-label",
    "wpd-toast",
    "wpd-toast-container",
    "wpd-tabs",
    "wpd-tab",
    "wpd-tabpanel",
    "wpd-window-button",
    "wpd-menu",
    "wpd-menu-item",
    "wpd-context-menu",
    "wpd-context-menu-option",
    "wpd-confirm-dialog",
    "wpd-modal",
    "wpd-user-search",
    "wpd-role-picker",
    "wpd-flyout",
    "wpd-tab-chip",
    "wpd-stack",
    "wpd-cluster",
    "wpd-icon",
    "wpd-body",
    "wpd-panel",
    "wpd-row",
    "wpd-grid",
    "wpd-display",
    "wpd-empty-state",
    "wpd-key",
    "wpd-code",
    "wpd-badge",
    "wpd-ribbon",
    "wpd-tile",
    "wpd-log",
    "wpd-steps",
    "wpd-step",
    "wpd-table",
    "wpd-spinner",
    "wpd-relative-time",
    "wpd-avatar",
    "wpd-textarea",
    "wpd-chip",
    "wpd-tag-input",
    "wpd-form",
    "wpd-save-status",
    "wpd-category-picker",
    "wpd-crumb-chain",
    "wpd-card",
    "wpd-rating-summary",
    "wpd-notice",
    "wpd-progress-bar"
  ];
  let demoBannerLogged = false;
  function logDemoBanner() {
    if (demoBannerLogged) {
      return;
    }
    demoBannerLogged = true;
    const headingStyle = [
      "background: #ffb400",
      "color: #1a1a1a",
      "font-weight: 700",
      "font-size: 12px",
      "padding: 4px 8px",
      "border-radius: 3px"
    ].join(";");
    const bodyStyle = [
      "color: #b25c00",
      "font-weight: 500"
    ].join(";");
    console.log(
      '%c⚠ wp.desktop — INTENTIONAL DEMO%c\nThe next three console.error entries are fired ON PURPOSE by the\nOS Settings → Components tab to demonstrate the <wpd-*> missing-\nimport warner. They are not real bugs.\n\n  1. <wpd-example-console-fail-due-to-unregistered-component>\n  2. <wpd-buton>   (typo of <wpd-button>)\n  3. <wpd-totally-made-up-thing>\n\nSource: src/settings/sections/help.ts — the "Missing-import\nwarner — live demo" section. Remove that section in your fork\nif you want a quieter Components tab.',
      headingStyle,
      bodyStyle
    );
  }
  function buildHelpSection(ctx) {
    const entries = collectEntries();
    const el = document.createElement("div");
    el.classList.add("desktop-mode-os-settings__help");
    let activeTag = entries[0]?.tag ?? "";
    const paint = () => {
      if (ctx.state.developerModeEnabled) {
        logDemoBanner();
      }
      const active = entries.find((e) => e.tag === activeTag) ?? entries[0];
      render(
        html`
				<wpd-section
					heading=${__("Component library")}
					description=${__(
          "Every <wpd-*> web component shipped by this plugin, with its props, slots, and a live example. Descriptors live next to each component class — the list stays in sync with the code."
        )}
				>
					<p class="desktop-mode-os-settings__help-count">
						${String(entries.length)} ${__("components registered.")}
					</p>
				</wpd-section>

				${ctx.state.developerModeEnabled ? html`
						<wpd-section
							heading=${__("Missing-import warner — live demo")}
							description=${__(
          'The three <wpd-*> tags below are intentionally bogus. Open the browser console: within ~2 seconds you should see three console.error entries from the framework, each pointing the developer at the fix (typo with "did you mean", and unknown tags). The tags are kept off-screen so they do not affect layout. Remove this section in your fork if you want a quieter Components tab.'
        )}
						>
							<div
								class="desktop-mode-os-settings__help-warner-demo"
								aria-hidden="true"
								style="position:absolute;width:0;height:0;overflow:hidden;clip:rect(0 0 0 0);"
							>
								<!--
									Case 1 — invented name, nothing close in the registry.
									Triggers the "no component by that name exists" branch.
								-->
								<wpd-example-console-fail-due-to-unregistered-component></wpd-example-console-fail-due-to-unregistered-component>

								<!--
									Case 2 — typo within Levenshtein distance of a real tag.
									Triggers the "Did you mean <wpd-button>?" branch.
								-->
								<wpd-buton></wpd-buton>

								<!--
									Case 3 — looks plausible but is not in the registry.
									Triggers the unknown-tag branch with no suggestion.
								-->
								<wpd-totally-made-up-thing></wpd-totally-made-up-thing>
							</div>
						</wpd-section>
					` : ""}

				<div class="desktop-mode-os-settings__help-layout">
					<nav
						class="desktop-mode-os-settings__help-nav"
						aria-label=${__("Components")}
					>
						${entries.map(
          (entry) => html`
								<button
									type="button"
									class=${classNames(
            "desktop-mode-os-settings__help-nav-item",
            entry.tag === (active?.tag ?? "") ? "is-active" : ""
          )}
									aria-pressed=${entry.tag === (active?.tag ?? "") ? "true" : "false"}
									@click=${() => {
            activeTag = entry.tag;
            paint();
          }}
								>
									<span class="desktop-mode-os-settings__help-nav-title"
										>${entry.title}</span
									>
									<span class="desktop-mode-os-settings__help-nav-tag"
										>&lt;${entry.tag}&gt;</span
									>
								</button>
							`
        )}
					</nav>
					<div class="desktop-mode-os-settings__help-detail">
						${active ? renderDetail(active) : renderEmpty()}
					</div>
				</div>
			`,
        el
      );
    };
    paint();
    const wpDesktop = window.wp?.desktop;
    if (wpDesktop?.subscribeOsSettings) {
      const unsubscribe = wpDesktop.subscribeOsSettings(() => {
        if (!el.isConnected) {
          unsubscribe();
          return;
        }
        paint();
      });
    }
    return el;
  }
  function renderDetail(entry) {
    const help = entry.help;
    const status = help?.status ?? "stable";
    const since = help?.since;
    return html`
		<header class="desktop-mode-os-settings__help-head">
			<h3 class="desktop-mode-os-settings__help-title">${entry.title}</h3>
			<code class="desktop-mode-os-settings__help-code"
				>&lt;${entry.tag}&gt;</code
			>
			<span
				class=${classNames(
      "desktop-mode-os-settings__help-badge",
      `is-${status}`
    )}
				>${statusLabel(status)}</span
			>
			${since ? html`<span class="desktop-mode-os-settings__help-since"
						>${__("Since")} ${since}</span
					>` : html``}
		</header>

		${help?.summary ? html`<p class="desktop-mode-os-settings__help-summary">
					${help.summary}
				</p>` : html``}

		${help?.example ? html`
					<section class="desktop-mode-os-settings__help-group">
						<h4>${__("Example")}</h4>
						<div class="desktop-mode-os-settings__help-example">
							${help.example}
						</div>
					</section>
				` : html``}
		${renderPropsTable(entry, help)} ${renderSlots(help)}
		${renderEvents(help)} ${renderParts(help)}
		${renderCssProps(help)}
		${!help ? html`<p class="desktop-mode-os-settings__help-note">
					${__(
      "This component has no help descriptor yet. Add `static help` to its class for a fuller reference."
    )}
				</p>` : html``}
	`;
  }
  function renderPropsTable(entry, help) {
    const documented = help?.props ?? [];
    const documentedNames = new Set(documented.map((p) => p.name));
    const undocumented = entry.props.filter((p) => !documentedNames.has(p));
    if (documented.length === 0 && undocumented.length === 0) {
      return html``;
    }
    return html`
		<section class="desktop-mode-os-settings__help-group">
			<h4>${__("Props")}</h4>
			<table class="desktop-mode-os-settings__help-table">
				<thead>
					<tr>
						<th>${__("Name")}</th>
						<th>${__("Type")}</th>
						<th>${__("Default")}</th>
						<th>${__("Description")}</th>
					</tr>
				</thead>
				<tbody>
					${documented.map(
      (p) => html`
							<tr>
								<td><code>${p.name}</code></td>
								<td>${p.type ?? "—"}</td>
								<td>${p.default ?? "—"}</td>
								<td>${p.description ?? ""}</td>
							</tr>
						`
    )}
					${undocumented.map(
      (name) => html`
							<tr>
								<td><code>${name}</code></td>
								<td>—</td>
								<td>—</td>
								<td>
									<em
										>${__(
        "Undocumented — declared via static props."
      )}</em
									>
								</td>
							</tr>
						`
    )}
				</tbody>
			</table>
		</section>
	`;
  }
  function renderSlots(help) {
    if (!help?.slots?.length) {
      return html``;
    }
    return html`
		<section class="desktop-mode-os-settings__help-group">
			<h4>${__("Slots")}</h4>
			<ul class="desktop-mode-os-settings__help-list">
				${help.slots.map(
      (s) => html`
						<li>
							<code>${s.name}</code>
							${s.description ? html` — ${s.description}` : html``}
						</li>
					`
    )}
			</ul>
		</section>
	`;
  }
  function renderEvents(help) {
    if (!help?.events?.length) {
      return html``;
    }
    return html`
		<section class="desktop-mode-os-settings__help-group">
			<h4>${__("Events")}</h4>
			<ul class="desktop-mode-os-settings__help-list">
				${help.events.map(
      (e) => html`
						<li>
							<code>${e.name}</code>
							${e.detail ? html` — <code>${e.detail}</code>` : html``}
							${e.description ? html` — ${e.description}` : html``}
						</li>
					`
    )}
			</ul>
		</section>
	`;
  }
  function renderParts(help) {
    if (!help?.parts?.length) {
      return html``;
    }
    return html`
		<section class="desktop-mode-os-settings__help-group">
			<h4>${__("Shadow parts")}</h4>
			<ul class="desktop-mode-os-settings__help-list">
				${help.parts.map(
      (p) => html`
						<li>
							<code>::part(${p.name})</code>
							${p.description ? html` — ${p.description}` : html``}
						</li>
					`
    )}
			</ul>
		</section>
	`;
  }
  function renderCssProps(help) {
    if (!help?.cssProps?.length) {
      return html``;
    }
    return html`
		<section class="desktop-mode-os-settings__help-group">
			<h4>${__("CSS custom properties")}</h4>
			<ul class="desktop-mode-os-settings__help-list">
				${help.cssProps.map(
      (v) => html`
						<li>
							<code>${v.name}</code>
							${v.default ? html`
										(${__("default")}
										<code>${v.default}</code>)
									` : html``}
							${v.description ? html` — ${v.description}` : html``}
						</li>
					`
    )}
			</ul>
		</section>
	`;
  }
  function renderEmpty() {
    return html`<p>${__("No components registered.")}</p>`;
  }
  function collectEntries() {
    const entries = [];
    for (const tag of WPD_COMPONENT_TAGS) {
      const ctor = customElements.get(tag);
      if (!ctor) {
        continue;
      }
      const help = ctor.help ?? null;
      const title = help?.title ?? defaultTitleFromTag(tag);
      const props = ctor.props ?? [];
      entries.push({ tag, title, help, props });
    }
    entries.sort((a, b) => a.title.localeCompare(b.title));
    return entries;
  }
  function defaultTitleFromTag(tag) {
    const bare = tag.replace(/^wpd-/, "").replace(/-/g, " ");
    return bare.charAt(0).toUpperCase() + bare.slice(1);
  }
  function statusLabel(status) {
    switch (status) {
      case "experimental":
        return __("Experimental");
      case "planned":
        return __("Planned");
      case "stable":
      default:
        return __("Stable");
    }
  }
  function classNames(...parts) {
    return parts.filter(Boolean).join(" ");
  }
  const store$1 = createSharedStore(
    "desktop-mode/wallpaper-registry",
    () => ({
      seed: [],
      listeners: /* @__PURE__ */ new Set()
    })
  );
  const seed = store$1.state.seed;
  const listeners = store$1.state.listeners;
  function register(def) {
    throwOnRegistrationErrors(
      "Wallpaper",
      collectRegistrationErrors(def, WALLPAPER_CHECKS),
      def
    );
    const idx = seed.findIndex((w) => w.id === def.id);
    if (idx >= 0) {
      seed[idx] = def;
    } else {
      seed.push(def);
    }
    notify();
  }
  function unregister(id) {
    const idx = seed.findIndex((w) => w.id === id);
    if (idx >= 0) {
      seed.splice(idx, 1);
      notify();
    }
  }
  function subscribe(cb) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }
  function notify() {
    const snapshot = Array.from(listeners);
    for (const cb of snapshot) {
      try {
        cb();
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            "[desktop-mode] wallpaper registry listener threw:",
            err
          );
        }
      }
    }
  }
  function all() {
    const copy = seed.slice();
    const filtered = applyFilters(HOOKS.WALLPAPERS, copy);
    if (!Array.isArray(filtered)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[desktop-mode] `desktop-mode.wallpapers` filter returned a non-array; falling back to seed list."
        );
      }
      return copy;
    }
    return filtered.filter(isValidDef);
  }
  function get(id) {
    return all().find((w) => w.id === id);
  }
  const WALLPAPER_CHECKS = [
    {
      field: "id",
      message: "missing or not a non-empty string",
      valid: (d) => typeof d.id === "string" && d.id !== ""
    },
    {
      field: "label",
      message: "missing or not a non-empty string",
      valid: (d) => typeof d.label === "string" && d.label !== ""
    },
    {
      field: "preview",
      message: "missing or not a non-empty string",
      valid: (d) => typeof d.preview === "string" && d.preview !== ""
    },
    {
      field: "type",
      message: 'must be "css" or "canvas"',
      valid: (d) => d.type === "css" || d.type === "canvas"
    },
    {
      field: "value/resolveValue/mount",
      message: "css types need `value` or `resolveValue`; canvas types need `mount`",
      valid: (d) => {
        if (d.type === "css") {
          return typeof d.value === "string" || typeof d.resolveValue === "function";
        }
        if (d.type === "canvas") {
          return typeof d.mount === "function";
        }
        return true;
      }
    }
  ];
  function isValidDef(def) {
    return collectRegistrationErrors(def, WALLPAPER_CHECKS).length === 0;
  }
  const store = createSharedStore(
    "desktop-mode/wallpaper-settings",
    () => ({ values: {} })
  );
  function getWallpaperSettings(id) {
    return { ...store.state.values[id] ?? {} };
  }
  function publishWallpaperSettings(id, settings) {
    store.state.values[id] = { ...settings };
    doAction(HOOKS.WALLPAPER_SETTINGS_CHANGED, {
      id,
      settings: { ...settings }
    });
  }
  const modalStyles = css`:host{display:none;position:fixed;inset:0;align-items:center;justify-content:center;background:rgba( 0,0,0,0.45 );backdrop-filter:blur( 2px );z-index:10000;--desktop-mode-text:#f0f0f1;--desktop-mode-text-muted:#bbc1c7;--desktop-mode-muted:#a7aaad;--desktop-mode-muted-fg:#a7aaad;--desktop-mode-border:rgba( 255,255,255,0.25 );--wpd-button-bg-hover:rgba( 255,255,255,0.08 )}:host( [ open ] ){display:flex}.dialog{max-width:92vw;max-height:90vh;background:var( --wpd-modal-bg,var( --desktop-mode-bg,#1d2327 ) );color:var( --wpd-modal-fg,var( --desktop-mode-fg,#fff ) );border:1px solid rgba( 255,255,255,0.08 );border-radius:10px;box-shadow:0 20px 50px rgba( 0,0,0,0.6 );display:flex;flex-direction:column;overflow:hidden}:host( [ size='sm' ] ) .dialog{width:min( 360px,92vw )}:host(:not( [ size ] ) ) .dialog,:host( [ size='md' ] ) .dialog{width:min( 540px,92vw )}:host( [ size='lg' ] ) .dialog{width:min( 760px,94vw )}.header{display:flex;align-items:center;gap:10px;padding:16px 20px 12px;border-bottom:1px solid rgba( 255,255,255,0.06 )}.title{margin:0;flex:1;font-size:15px;font-weight:600}.header-actions{display:flex;gap:6px}.header-actions::slotted( * ){margin-inline-start:6px}.close{background:transparent;border:0;color:inherit;font-size:18px;line-height:1;padding:4px 8px;border-radius:4px;cursor:pointer;opacity:0.7}.close:hover{opacity:1;background:rgba( 255,255,255,0.08 )}.body{padding:16px 20px;overflow:auto;flex:1 1 auto;font-size:13px;line-height:1.5}.footer{padding:12px 20px 16px;border-top:1px solid rgba( 255,255,255,0.06 )}.footer slot{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}:host( [ mandatory ] ) .close{display:none}`;
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
    summary: "Overlay container with title, body, and footer slots. Handles ESC, click-outside, focus trap. Use for rich modal flows that go beyond a yes/no confirm. The dialog surface is dark and re-points the shared surface tokens (--desktop-mode-text/-muted/-border, --wpd-button-bg-hover) so wpd-* controls slotted into it resolve readable dark-surface colors automatically.",
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
  async function fetchMediaPage(config, page, search, hdOnly) {
    const url = new URL(config.mediaUrl);
    url.searchParams.set("media_type", "image");
    url.searchParams.set("per_page", String(MEDIA_PER_PAGE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "desc");
    url.searchParams.set(
      "_fields",
      "id,source_url,alt_text,title,media_details"
    );
    if (search) {
      url.searchParams.set("search", search);
    }
    if (hdOnly) {
      url.searchParams.set("desktop_mode_min_width", String(HD_MIN_WIDTH));
      url.searchParams.set("desktop_mode_min_height", String(HD_MIN_HEIGHT));
    }
    const response = await trackedFetch(
      url.toString(),
      {
        credentials: "same-origin",
        headers: { "X-WP-Nonce": config.restNonce }
      },
      { source: "desktop-mode/settings/media" }
    );
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data && typeof data.message === "string") {
          message = data.message;
        }
      } catch {
      }
      throw new Error(message);
    }
    const totalPagesHeader = response.headers.get("X-WP-TotalPages");
    const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
    const items = await response.json();
    return { items: items.filter(isUsableImage), totalPages: totalPages || 1 };
  }
  async function uploadImage(config, file) {
    const response = await trackedFetch(
      config.mediaUrl,
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-WP-Nonce": config.restNonce,
          "Content-Type": file.type,
          "Content-Disposition": `attachment; filename="${sanitizeFilename(file.name)}"`
        },
        body: file
      },
      { source: "desktop-mode/settings/media-upload" }
    );
    if (!response.ok) {
      let message = `Upload failed (HTTP ${response.status}).`;
      try {
        const data2 = await response.json();
        if (data2 && typeof data2.message === "string") {
          message = data2.message;
        }
      } catch {
      }
      throw new Error(message);
    }
    const data = await response.json();
    return { id: data.id, url: data.source_url };
  }
  function buildCustomImageSection(ctx, body) {
    const tabDefs = [];
    const pane = document.createElement("div");
    pane.className = "desktop-mode-os-settings__tab-pane";
    if (ctx.config.canUpload) {
      tabDefs.push({
        key: "upload",
        label: __("Upload new"),
        render: () => renderUploadPane(ctx, pane, body)
      });
    }
    tabDefs.push({
      key: "library",
      label: __("Media Library"),
      render: () => renderLibraryPane(ctx, pane, body)
    });
    const initialKey = tabDefs[0].key;
    const onTabChange = (e) => {
      const key = e.detail.value;
      tabDefs.find((t) => t.key === key)?.render();
    };
    const wrap = document.createElement("div");
    render(
      html`
			<div class="desktop-mode-os-settings__uploader">
				<h4 class="desktop-mode-os-settings__uploader-heading">
					${__("Or use your own image")}
				</h4>
				${tabDefs.length > 1 ? html`<wpd-tabs
							value=${initialKey}
							label=${__("Image source")}
							@wpd-tab-change=${onTabChange}
						>
							${tabDefs.map(
        (def) => html`<wpd-tab value=${def.key}
									>${def.label}</wpd-tab
								>`
      )}
						</wpd-tabs>` : null}
				${pane}
			</div>
		`,
      wrap
    );
    tabDefs.find((t) => t.key === initialKey)?.render();
    return wrap.firstElementChild;
  }
  function renderUploadPane(ctx, pane, body) {
    const tile = document.createElement("div");
    tile.className = "desktop-mode-os-settings__upload-tile";
    tile.dataset.wallpaperId = CUSTOM_IMAGE_ID;
    tile.setAttribute(
      "aria-pressed",
      ctx.state.wallpaper === CUSTOM_IMAGE_ID ? "true" : "false"
    );
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.className = "desktop-mode-os-settings__file-input";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) {
        void handleImageFile(ctx, file, tile, body);
      }
      fileInput.value = "";
    });
    render(html`${fileInput}${tile}`, pane);
    renderUploadTile(ctx, tile, fileInput, body);
  }
  function renderUploadTile(ctx, tile, fileInput, body) {
    tile.classList.remove("desktop-mode-os-settings__upload-tile--filled");
    tile.classList.remove("desktop-mode-os-settings__upload-tile--dragover");
    tile.classList.remove("desktop-mode-os-settings__upload-tile--busy");
    tile.removeAttribute("aria-label");
    const hasImage = !!ctx.state.customImage;
    if (hasImage) {
      tile.classList.add("desktop-mode-os-settings__upload-tile--filled");
      tile.setAttribute("aria-label", __("Custom image wallpaper"));
      tile.style.backgroundImage = `url("${encodeURI(ctx.state.customImage.url)}")`;
    } else {
      tile.style.backgroundImage = "";
      tile.setAttribute("aria-label", __("Upload a wallpaper image"));
    }
    const onRemove = (e) => {
      e.stopPropagation();
      ctx.state.customImage = null;
      if (ctx.state.wallpaper === CUSTOM_IMAGE_ID) {
        ctx.state.wallpaper = DEFAULT_WALLPAPER_ID;
      }
      registerCustomImageIfPresent(ctx.state);
      ctx.save();
      ctx.apply();
      renderUploadTile(ctx, tile, fileInput, body);
      refreshWallpaperPressedState(ctx, body);
    };
    render(
      hasImage ? html`
					<wpd-button
						variant="danger"
						class="desktop-mode-os-settings__upload-remove"
						aria-label=${__("Remove custom image")}
						@click=${onRemove}
						>${__("Remove")}</wpd-button
					>
				` : html`
					<div class="desktop-mode-os-settings__upload-inner">
						<span
							class="desktop-mode-os-settings__upload-plus"
							aria-hidden="true"
							>+</span
						>
						<span class="desktop-mode-os-settings__upload-prompt"
							>${__("Drop an image here, or click to upload")}</span
						>
						<span class="desktop-mode-os-settings__upload-hint"
							>${__(
        "JPEG, PNG, or WebP · goes straight to your Media Library"
      )}</span
						>
					</div>
				`,
      tile
    );
    tile.onclick = () => {
      if (tile.classList.contains("desktop-mode-os-settings__upload-tile--busy")) {
        return;
      }
      if (ctx.state.customImage) {
        selectWallpaper(ctx, CUSTOM_IMAGE_ID, body);
        return;
      }
      fileInput.click();
    };
    tile.ondragover = (e) => {
      e.preventDefault();
      tile.classList.add("desktop-mode-os-settings__upload-tile--dragover");
    };
    tile.ondragleave = () => {
      tile.classList.remove("desktop-mode-os-settings__upload-tile--dragover");
    };
    tile.ondrop = (e) => {
      e.preventDefault();
      tile.classList.remove("desktop-mode-os-settings__upload-tile--dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        void handleImageFile(ctx, file, tile, body);
      }
    };
  }
  async function handleImageFile(ctx, file, tile, body) {
    if (!file.type.startsWith("image/")) {
      showUploadError(tile, __("That file isn’t an image."));
      return;
    }
    tile.classList.add("desktop-mode-os-settings__upload-tile--busy");
    render(
      html`<span class="desktop-mode-os-settings__upload-status"
			>${__("Uploading…")}</span
		>`,
      tile
    );
    const fileInput = tile.parentElement?.querySelector(
      ".desktop-mode-os-settings__file-input"
    );
    try {
      const media = await uploadImage(ctx.config, file);
      ctx.state.customImage = { id: media.id, url: media.url };
      ctx.state.wallpaper = CUSTOM_IMAGE_ID;
      registerCustomImageIfPresent(ctx.state);
      ctx.save();
      ctx.apply();
      if (fileInput) {
        renderUploadTile(ctx, tile, fileInput, body);
      }
      refreshWallpaperPressedState(ctx, body);
    } catch (err) {
      tile.classList.remove("desktop-mode-os-settings__upload-tile--busy");
      if (fileInput) {
        renderUploadTile(ctx, tile, fileInput, body);
      }
      const message = err instanceof Error ? err.message : __("Upload failed.");
      showUploadError(tile, message);
    }
  }
  function showUploadError(tile, message) {
    let err = tile.querySelector(".desktop-mode-os-settings__upload-error");
    if (!err) {
      err = document.createElement("span");
      err.className = "desktop-mode-os-settings__upload-error";
      err.setAttribute("role", "status");
      tile.appendChild(err);
    }
    err.textContent = message;
    window.setTimeout(() => {
      err?.remove();
    }, 4e3);
  }
  function renderLibraryPane(ctx, pane, body) {
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = __("Search your media");
    search.className = "desktop-mode-os-settings__library-search";
    search.setAttribute("aria-label", __("Search media"));
    const grid = document.createElement("div");
    grid.className = "desktop-mode-os-settings__library-grid";
    const meta = document.createElement("span");
    meta.className = "desktop-mode-os-settings__library-meta";
    const loadMore = document.createElement("wpd-button");
    loadMore.setAttribute("variant", "ghost");
    loadMore.textContent = __("Load more");
    let query = "";
    let page = 0;
    let totalPages = 0;
    let loaded = [];
    let hiddenByHd = 0;
    let loading = false;
    const onHdToggle = (e) => {
      ctx.state.libraryHdOnly = e.detail.checked;
      ctx.save();
      resetAndReload();
    };
    render(
      html`
			<div class="desktop-mode-os-settings__library">
				<div class="desktop-mode-os-settings__library-toolbar">
					${search}
					<wpd-checkbox-label
						label=${sprintf(
        // translators: %1$d is the HD minimum width in px, %2$d is the minimum height.
        __("Only HD (≥%1$d×%2$d)"),
        HD_MIN_WIDTH,
        HD_MIN_HEIGHT
      )}
						?checked=${ctx.state.libraryHdOnly}
						@wpd-checkbox-change=${onHdToggle}
					></wpd-checkbox-label>
				</div>
				${grid}
				<div class="desktop-mode-os-settings__library-footer">
					${meta}${loadMore}
				</div>
			</div>
		`,
      pane
    );
    const updateMeta = () => {
      const visible = visibleLibraryItems(ctx.state, loaded).length;
      const parts = [
        // translators: %d is the number of media items currently visible.
        sprintf(__("Showing %d"), visible)
      ];
      if (ctx.state.libraryHdOnly && hiddenByHd > 0) {
        parts.push(
          // translators: %d is the number of images filtered out by the HD toggle.
          sprintf(__("%d hidden by HD filter"), hiddenByHd)
        );
      }
      meta.textContent = parts.join(" · ");
      loadMore.hidden = page >= totalPages;
      if (loading) {
        loadMore.setAttribute("disabled", "");
      } else {
        loadMore.removeAttribute("disabled");
      }
    };
    const renderGrid = () => {
      const visible = visibleLibraryItems(ctx.state, loaded);
      hiddenByHd = loaded.length - visible.length;
      if (visible.length === 0 && !loading) {
        render(
          html`<p class="desktop-mode-os-settings__library-empty">
					${ctx.state.libraryHdOnly ? __(
            "No HD images found. Try unchecking the filter, or upload a larger image."
          ) : __("No images in your Media Library yet.")}
				</p>`,
          grid
        );
      } else {
        grid.innerHTML = "";
        for (const item of visible) {
          grid.appendChild(buildLibraryTile(ctx, item, body));
        }
      }
      updateMeta();
    };
    const loadNextPage = async () => {
      if (loading || totalPages > 0 && page >= totalPages) {
        return;
      }
      loading = true;
      updateMeta();
      if (page === 0) {
        render(
          html`${Array.from(
            { length: 8 },
            () => html`<div
						class="desktop-mode-os-settings__library-tile desktop-mode-os-settings__library-tile--skeleton"
					></div>`
          )}`,
          grid
        );
      }
      try {
        const result = await fetchMediaPage(
          ctx.config,
          page + 1,
          query,
          ctx.state.libraryHdOnly
        );
        page = page + 1;
        totalPages = result.totalPages;
        loaded = loaded.concat(result.items);
        renderGrid();
      } catch (err) {
        render(
          html`<p class="desktop-mode-os-settings__library-error">
					${err instanceof Error ? sprintf(
            // translators: %s is the browser-supplied error message.
            __("Couldn’t load your media: %s"),
            err.message
          ) : __("Couldn’t load your media.")}
				</p>`,
          grid
        );
      } finally {
        loading = false;
        updateMeta();
      }
    };
    const resetAndReload = () => {
      page = 0;
      totalPages = 0;
      loaded = [];
      hiddenByHd = 0;
      void loadNextPage();
    };
    let searchTimer = null;
    search.addEventListener("input", () => {
      if (searchTimer !== null) {
        window.clearTimeout(searchTimer);
      }
      searchTimer = window.setTimeout(() => {
        searchTimer = null;
        query = search.value.trim();
        resetAndReload();
      }, SEARCH_DEBOUNCE_MS);
    });
    loadMore.addEventListener("click", () => {
      void loadNextPage();
    });
    void loadNextPage();
  }
  function visibleLibraryItems(state, items) {
    if (!state.libraryHdOnly) {
      return items;
    }
    return items.filter(
      (it) => it.media_details.width >= HD_MIN_WIDTH && it.media_details.height >= HD_MIN_HEIGHT
    );
  }
  function buildLibraryTile(ctx, item, body) {
    const isSelected = ctx.state.wallpaper === CUSTOM_IMAGE_ID && ctx.state.customImage?.id === item.id;
    const sizes = item.media_details.sizes || {};
    const thumbUrl = sizes.medium?.source_url || sizes.thumbnail?.source_url || sizes.large?.source_url || item.source_url;
    const altOrTitle = item.alt_text || stripHtml(item.title?.rendered || "") || `Image #${item.id}`;
    const onClick = () => {
      ctx.state.customImage = { id: item.id, url: item.source_url };
      ctx.state.wallpaper = CUSTOM_IMAGE_ID;
      registerCustomImageIfPresent(ctx.state);
      ctx.save();
      ctx.apply();
      refreshWallpaperPressedState(ctx, body);
      const tileGrid = wrapper.firstElementChild?.parentElement;
      if (tileGrid) {
        tileGrid.querySelectorAll("[data-media-id]").forEach((el) => {
          const selected = el.dataset.mediaId === String(item.id);
          el.setAttribute("aria-pressed", selected ? "true" : "false");
          el.classList.toggle(
            "desktop-mode-os-settings__library-tile--selected",
            selected
          );
        });
      }
    };
    const wrapper = document.createElement("div");
    render(
      html`
			<button
				type="button"
				class=${isSelected ? "desktop-mode-os-settings__library-tile desktop-mode-os-settings__library-tile--selected" : "desktop-mode-os-settings__library-tile"}
				data-media-id=${String(item.id)}
				aria-pressed=${isSelected ? "true" : "false"}
				aria-label=${altOrTitle}
				title=${altOrTitle}
				style=${`background-image: url("${encodeURI(thumbUrl)}")`}
				@click=${onClick}
			>
				<span class="desktop-mode-os-settings__library-tile-dims"
					>${item.media_details.width}×${item.media_details.height}</span
				>
			</button>
		`,
      wrapper
    );
    return wrapper.firstElementChild;
  }
  const MAX_LIVE_PREVIEWS = 4;
  const MIN_MOUNT_SIZE = 24;
  const REMOUNT_EPSILON = 4;
  const REMOUNT_DEBOUNCE_MS = 250;
  const PREVIEW_OVERLAY_CLASS = "desktop-mode-os-settings__wallpaper-live-preview";
  function loadNeeds(def) {
    const needs = def.type === "canvas" ? def.needs : void 0;
    if (!needs || needs.length === 0) {
      return Promise.resolve();
    }
    const api = window.wp?.desktop;
    if (!api?.loadModules) {
      return Promise.reject(
        new Error(
          `[desktop-mode] Wallpaper "${def.id}" declares needs but wp.desktop.loadModules is unavailable.`
        )
      );
    }
    return api.loadModules(needs);
  }
  function pluginUrl() {
    const config = window.desktopModeConfig;
    return config?.pluginUrl ?? "";
  }
  function prefersReducedMotion() {
    return typeof window.matchMedia === "function" && window.matchMedia("( prefers-reduced-motion: reduce )").matches;
  }
  function previewParams(def) {
    const seed2 = { ...def.previewParams ?? {} };
    const filtered = applyFilters(
      HOOKS.WALLPAPER_PREVIEW_PARAMS,
      seed2,
      def.id
    );
    if (!filtered || typeof filtered !== "object") {
      return seed2;
    }
    return filtered;
  }
  function createWallpaperPreviewManager(root) {
    const previews = /* @__PURE__ */ new Map();
    let disposed = false;
    const liveCount = () => {
      let n = 0;
      previews.forEach((p) => {
        if (p.teardown || p.mounting) {
          n++;
        }
      });
      return n;
    };
    const clearRemountTimer = (p) => {
      if (p.remountTimer !== null) {
        clearTimeout(p.remountTimer);
        p.remountTimer = null;
      }
    };
    const unmount = (p) => {
      p.generation++;
      p.mounting = false;
      clearRemountTimer(p);
      if (p.teardown) {
        const teardown = p.teardown;
        p.teardown = null;
        try {
          teardown();
        } catch (err) {
          if (typeof console !== "undefined") {
            console.error(
              `[desktop-mode] Wallpaper "${p.defId}" preview teardown threw:`,
              err
            );
          }
        }
      }
      p.overlay.innerHTML = "";
    };
    const maybeMount = (p) => {
      if (disposed || !p.visible || p.teardown || p.mounting) {
        return;
      }
      if (resizeObserver && (p.tile.clientWidth < MIN_MOUNT_SIZE || p.tile.clientHeight < MIN_MOUNT_SIZE)) {
        return;
      }
      mount(p);
    };
    const mount = (p) => {
      const def = get(p.defId);
      if (!def?.renderPreview) {
        return;
      }
      if (liveCount() >= MAX_LIVE_PREVIEWS) {
        return;
      }
      const gen = ++p.generation;
      p.mounting = true;
      p.mountWidth = p.tile.clientWidth;
      p.mountHeight = p.tile.clientHeight;
      const ctx = {
        id: def.id,
        pluginUrl: pluginUrl(),
        prefersReducedMotion: prefersReducedMotion(),
        visible: !document.hidden,
        settings: getWallpaperSettings(def.id),
        params: previewParams(def),
        width: p.mountWidth,
        height: p.mountHeight
      };
      const onResolve = (teardown) => {
        if (gen !== p.generation || disposed) {
          try {
            teardown();
          } catch {
          }
          return;
        }
        p.mounting = false;
        p.teardown = teardown;
        if (sizeDrifted(p)) {
          scheduleRemount(p);
        }
      };
      const onError = (err) => {
        if (gen !== p.generation) {
          return;
        }
        p.mounting = false;
        p.overlay.innerHTML = "";
        if (typeof console !== "undefined") {
          console.error(
            `[desktop-mode] Wallpaper "${def.id}" renderPreview failed:`,
            err
          );
        }
      };
      loadNeeds(def).then(() => {
        if (gen !== p.generation || disposed) {
          return;
        }
        let result;
        try {
          result = def.renderPreview(p.overlay, ctx);
        } catch (err) {
          onError(err);
          return;
        }
        if (isPromise(result)) {
          result.then(onResolve, onError);
          return;
        }
        onResolve(result);
      }, onError);
    };
    const sizeDrifted = (p) => Math.abs(p.tile.clientWidth - p.mountWidth) > REMOUNT_EPSILON || Math.abs(p.tile.clientHeight - p.mountHeight) > REMOUNT_EPSILON;
    const scheduleRemount = (p) => {
      clearRemountTimer(p);
      p.remountTimer = setTimeout(() => {
        p.remountTimer = null;
        if (disposed || !p.teardown || !sizeDrifted(p)) {
          return;
        }
        unmount(p);
        maybeMount(p);
      }, REMOUNT_DEBOUNCE_MS);
    };
    const onIntersect = (entries) => {
      for (const entry of entries) {
        const p = previews.get(entry.target);
        if (!p) {
          continue;
        }
        p.visible = entry.isIntersecting;
        if (entry.isIntersecting) {
          maybeMount(p);
        } else {
          unmount(p);
        }
      }
    };
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(onIntersect, { threshold: 0.1 }) : null;
    const onTileResize = (entries) => {
      for (const entry of entries) {
        const p = previews.get(entry.target);
        if (!p || disposed) {
          continue;
        }
        if (!p.teardown && !p.mounting) {
          maybeMount(p);
        } else if (p.teardown && sizeDrifted(p)) {
          scheduleRemount(p);
        }
      }
    };
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(onTileResize) : null;
    const remove = (p) => {
      unmount(p);
      observer?.unobserve(p.tile);
      resizeObserver?.unobserve(p.tile);
      p.overlay.remove();
      previews.delete(p.tile);
    };
    const sync = () => {
      if (disposed) {
        return;
      }
      const tiles = root.querySelectorAll(
        "wpd-swatch[data-wallpaper-id]"
      );
      const seen = /* @__PURE__ */ new Set();
      tiles.forEach((tile) => {
        seen.add(tile);
        const defId = tile.dataset.wallpaperId ?? "";
        const def = get(defId);
        const wants = !!def?.renderPreview && !!observer;
        const existing = previews.get(tile);
        if (existing && (existing.defId !== defId || !wants)) {
          remove(existing);
        }
        if (!wants || previews.has(tile)) {
          return;
        }
        const overlay = document.createElement("div");
        overlay.className = PREVIEW_OVERLAY_CLASS;
        overlay.setAttribute("aria-hidden", "true");
        tile.appendChild(overlay);
        previews.set(tile, {
          tile,
          overlay,
          defId,
          generation: 0,
          teardown: null,
          mounting: false,
          visible: false,
          mountWidth: 0,
          mountHeight: 0,
          remountTimer: null
        });
        observer.observe(tile);
        resizeObserver?.observe(tile);
      });
      previews.forEach((p, tile) => {
        if (!seen.has(tile)) {
          remove(p);
        }
      });
    };
    const dispose = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      previews.forEach((p) => unmount(p));
      previews.clear();
      observer?.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener(
        "desktop-mode-window-closed",
        onWindowClosed
      );
    };
    const onWindowClosed = () => {
      if (!root.isConnected) {
        dispose();
      }
    };
    document.addEventListener("desktop-mode-window-closed", onWindowClosed);
    return { sync, dispose };
  }
  function customGradientCss(state) {
    const { from, to, angle } = state.customGradient;
    return `linear-gradient(${angle}deg, ${from}, ${to})`;
  }
  const CUSTOM_GRADIENT_DESCRIPTION = () => __("Mix your own two-colour gradient and set the angle — your desk, your palette.");
  function attachCustomGradientEditor(ctx) {
    register({
      id: CUSTOM_GRADIENT_ID,
      label: __("Custom gradient"),
      type: "css",
      preview: customGradientCss(ctx.state),
      description: CUSTOM_GRADIENT_DESCRIPTION(),
      resolveValue: () => customGradientCss(ctx.state),
      renderEditor: (container) => renderCustomGradientEditor(ctx, container)
    });
  }
  function registerCustomImageIfPresent(state) {
    if (!state.customImage) {
      unregister(CUSTOM_IMAGE_ID);
      return;
    }
    const safeUrl = encodeURI(state.customImage.url);
    const value = `url("${safeUrl}") center/cover no-repeat, #1d2327`;
    register({
      id: CUSTOM_IMAGE_ID,
      label: __("Custom image"),
      type: "css",
      value,
      preview: value,
      description: __(
        "Any image from your media library or an upload, sized to cover the whole desk."
      )
    });
  }
  function selectWallpaper(ctx, id, body) {
    ctx.state.wallpaper = id;
    ctx.save();
    ctx.apply();
    refreshWallpaperPressedState(ctx, body);
    const slot = body.querySelector(
      ".desktop-mode-os-settings__wallpaper-description-slot"
    );
    if (slot) {
      syncWallpaperDescription(ctx, slot);
    }
    const configSlot = body.querySelector(
      ".desktop-mode-os-settings__wallpaper-config-slot"
    );
    if (configSlot) {
      syncWallpaperConfigButton(ctx, configSlot);
    }
  }
  function syncWallpaperConfigButton(ctx, slot) {
    const inner = slot.firstElementChild;
    if (!inner) {
      return;
    }
    const def = get(ctx.state.wallpaper);
    if (!def || typeof def.renderConfig !== "function") {
      slot.dataset.expanded = "false";
      slot.style.marginTop = "";
      return;
    }
    slot.style.marginTop = "12px";
    render(
      html`
			<div class="desktop-mode-os-settings__wallpaper-config">
				<wpd-button
					variant="secondary"
					@click=${() => openWallpaperConfigDialog(ctx, def)}
				>
					<wpd-icon name="admin-generic"></wpd-icon>
					${__("Wallpaper settings")}
				</wpd-button>
			</div>
		`,
      inner
    );
    slot.dataset.expanded = "true";
  }
  function openWallpaperConfigDialog(ctx, def) {
    if (typeof def.renderConfig !== "function") {
      return;
    }
    const modal = document.createElement("wpd-modal");
    modal.setAttribute("size", "sm");
    modal.setAttribute(
      "title",
      sprintf(
        /* translators: %s: wallpaper name. */
        __("%s settings"),
        def.label
      )
    );
    const body = document.createElement("div");
    body.className = "desktop-mode-os-settings__wallpaper-config-form";
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.gap = "14px";
    modal.appendChild(body);
    const done = document.createElement("wpd-button");
    done.setAttribute("slot", "footer");
    done.setAttribute("variant", "primary");
    done.textContent = __("Done");
    modal.appendChild(done);
    let configTeardown = null;
    let closed = false;
    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      if (configTeardown) {
        try {
          configTeardown();
        } catch (err) {
          if (typeof console !== "undefined") {
            console.error(
              `[desktop-mode] Wallpaper "${def.id}" config teardown threw:`,
              err
            );
          }
        }
        configTeardown = null;
      }
      modal.remove();
    };
    done.addEventListener("click", close);
    modal.addEventListener("wpd-modal-cancel", close);
    const configCtx = {
      id: def.id,
      pluginUrl: "",
      prefersReducedMotion: typeof window.matchMedia === "function" && window.matchMedia("( prefers-reduced-motion: reduce )").matches,
      visible: !document.hidden,
      settings: getWallpaperSettings(def.id),
      setSettings: (partial) => {
        const merged = {
          ...ctx.state.wallpaperSettings[def.id] ?? {},
          ...partial
        };
        ctx.state.wallpaperSettings[def.id] = merged;
        ctx.save();
        publishWallpaperSettings(def.id, merged);
      }
    };
    document.body.appendChild(modal);
    modal.setAttribute("open", "");
    try {
      const result = def.renderConfig(body, configCtx);
      if (isPromise(result)) {
        result.then((teardown) => {
          if (closed) {
            try {
              teardown();
            } catch {
            }
            return;
          }
          configTeardown = teardown;
        });
      } else {
        configTeardown = result;
      }
    } catch (err) {
      if (typeof console !== "undefined") {
        console.error(
          `[desktop-mode] Wallpaper "${def.id}" renderConfig threw:`,
          err
        );
      }
      close();
    }
  }
  function syncWallpaperDescription(ctx, slot) {
    const inner = slot.firstElementChild;
    if (!inner) {
      return;
    }
    const def = get(ctx.state.wallpaper);
    const text = (def?.description ?? "").trim();
    if (!def || !text) {
      slot.dataset.expanded = "false";
      return;
    }
    render(
      html`
			<div class="desktop-mode-os-settings__wallpaper-description">
				<div class="desktop-mode-os-settings__wallpaper-description-header">
					<wpd-icon
						class="desktop-mode-os-settings__wallpaper-description-icon"
						name=${def.type === "canvas" ? "star-filled" : "art"}
					></wpd-icon>
					<strong>${def.label}</strong>
				</div>
				<p>${text}</p>
			</div>
		`,
      inner
    );
    slot.dataset.expanded = "true";
  }
  function refreshWallpaperPressedState(ctx, body) {
    body.querySelectorAll("[data-wallpaper-id]").forEach((el) => {
      const selected = el.dataset.wallpaperId === ctx.state.wallpaper;
      if (selected) {
        el.setAttribute("selected", "");
      } else {
        el.removeAttribute("selected");
      }
      el.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }
  function syncEditorSlot(ctx, slot, inner, def) {
    teardownEditor(ctx);
    inner.innerHTML = "";
    if (!def.renderEditor) {
      slot.dataset.expanded = "false";
      return;
    }
    const editorCtx = {
      id: def.id,
      pluginUrl: "",
      prefersReducedMotion: typeof window.matchMedia === "function" && window.matchMedia("( prefers-reduced-motion: reduce )").matches,
      visible: !document.hidden,
      settings: getWallpaperSettings(def.id)
    };
    try {
      const result = def.renderEditor(inner, editorCtx);
      if (isPromise(result)) {
        result.then((teardown) => {
          ctx.activeEditorTeardown = teardown;
        });
      } else {
        ctx.activeEditorTeardown = result;
      }
    } catch (err) {
      if (typeof console !== "undefined") {
        console.error(
          `[desktop-mode] Wallpaper "${def.id}" renderEditor threw:`,
          err
        );
      }
    }
    slot.dataset.expanded = "true";
  }
  function teardownEditor(ctx) {
    if (ctx.activeEditorTeardown) {
      try {
        ctx.activeEditorTeardown();
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            "[desktop-mode] Wallpaper editor teardown threw:",
            err
          );
        }
      }
      ctx.activeEditorTeardown = null;
    }
  }
  function renderCustomGradientEditor(ctx, container) {
    container.classList.add("desktop-mode-os-settings__gradient-editor-inner");
    const onFrom = (e) => {
      ctx.state.customGradient.from = e.detail.value;
      onChange();
    };
    const onTo = (e) => {
      ctx.state.customGradient.to = e.detail.value;
      onChange();
    };
    const onAngle = (e) => {
      ctx.state.customGradient.angle = e.detail.value;
      onChange();
    };
    const onChange = () => {
      ctx.save();
      ctx.apply();
      syncGradientPreviewSwatch(ctx, container);
      paint();
    };
    const paint = () => render(
      html`
				<div class="desktop-mode-os-settings__gradient-row">
					<wpd-color-field
						variant="block"
						label=${__("From")}
						value=${ctx.state.customGradient.from}
						@wpd-color-change=${onFrom}
					></wpd-color-field>
					<wpd-color-field
						variant="block"
						label=${__("To")}
						value=${ctx.state.customGradient.to}
						@wpd-color-change=${onTo}
					></wpd-color-field>
				</div>
				<wpd-range-field
					label=${__("Angle")}
					min="0"
					max="360"
					step="1"
					suffix="°"
					value=${String(ctx.state.customGradient.angle)}
					@wpd-range-change=${onAngle}
				></wpd-range-field>
			`,
      container
    );
    paint();
    return () => {
    };
  }
  function syncGradientPreviewSwatch(ctx, editorEl) {
    const section = editorEl.closest("wpd-section");
    const preview = section?.querySelector(
      `[data-wallpaper-id="${CUSTOM_GRADIENT_ID}"]`
    );
    if (preview) {
      preview.style.background = customGradientCss(ctx.state);
    }
  }
  let activePreviewManager = null;
  function buildWallpaperSection(ctx, body) {
    const editorSlot = document.createElement("div");
    editorSlot.className = "desktop-mode-os-settings__editor-slot";
    editorSlot.dataset.expanded = "false";
    const editorInner = document.createElement("div");
    editorInner.className = "desktop-mode-os-settings__editor-slot-inner";
    editorSlot.appendChild(editorInner);
    const descriptionSlot = document.createElement("div");
    descriptionSlot.className = "desktop-mode-os-settings__wallpaper-description-slot";
    descriptionSlot.dataset.expanded = "false";
    const descriptionInner = document.createElement("div");
    descriptionInner.className = "desktop-mode-os-settings__wallpaper-description-slot-inner";
    descriptionSlot.appendChild(descriptionInner);
    const configSlot = document.createElement("div");
    configSlot.className = "desktop-mode-os-settings__wallpaper-config-slot";
    configSlot.dataset.expanded = "false";
    const configInner = document.createElement("div");
    configInner.className = "desktop-mode-os-settings__wallpaper-config-slot-inner";
    configSlot.appendChild(configInner);
    const onPick = (e) => {
      const id = e.detail?.value ?? "";
      const def = get(id);
      if (!def || def.id === CUSTOM_IMAGE_ID) {
        return;
      }
      selectWallpaper(ctx, def.id, body);
      syncEditorSlot(ctx, editorSlot, editorInner, def);
      paint();
    };
    const customImageSection = buildCustomImageSection(ctx, body);
    const wrapper = document.createElement("div");
    activePreviewManager?.dispose();
    const previewManager = createWallpaperPreviewManager(wrapper);
    activePreviewManager = previewManager;
    const paint = () => render(
      html`
				<wpd-section
					heading=${__("Wallpaper")}
					description=${__(
        "The backdrop behind your windows. Pick a preset, mix your own gradient, or drop in an image."
      )}
				>
					<div
						class="desktop-mode-os-settings__grid desktop-mode-os-settings__grid--wallpapers"
						@wpd-pick=${onPick}
					>
						${all().filter((def) => def.id !== CUSTOM_IMAGE_ID).map(
        (def) => html`<wpd-swatch
									value=${def.id}
									label=${def.label}
									preview=${def.preview}
									variant="wallpaper"
									data-wallpaper-id=${def.id}
									?selected=${ctx.state.wallpaper === def.id}
								>
									<span class="desktop-mode-os-settings__swatch-label"
										>${def.label}</span
									>
								</wpd-swatch>`
      )}
					</div>
					${descriptionSlot} ${configSlot} ${editorSlot}
					${customImageSection}
				</wpd-section>
			`,
      wrapper
    );
    paint();
    previewManager.sync();
    const active = get(ctx.state.wallpaper);
    if (active) {
      syncEditorSlot(ctx, editorSlot, editorInner, active);
    }
    syncWallpaperDescription(ctx, descriptionSlot);
    syncWallpaperConfigButton(ctx, configSlot);
    const unsubscribe = subscribe(() => {
      if (!wrapper.isConnected) {
        unsubscribe();
        previewManager.dispose();
        return;
      }
      paint();
      previewManager.sync();
      const now = get(ctx.state.wallpaper);
      if (now) {
        syncEditorSlot(ctx, editorSlot, editorInner, now);
      }
      syncWallpaperDescription(ctx, descriptionSlot);
      syncWallpaperConfigButton(ctx, configSlot);
    });
    return wrapper;
  }
  function isTabVisible(tab, isAdmin) {
    if (tab.capability && tab.capability === "manage_options") {
      return isAdmin;
    }
    return true;
  }
  function renderOsSettingsPanel(ctx, body) {
    attachCustomGradientEditor(ctx);
    teardownEditor(ctx);
    if (ctx.tabRegistryUnsubscribe) {
      ctx.tabRegistryUnsubscribe();
      ctx.tabRegistryUnsubscribe = null;
    }
    body.classList.add("desktop-mode-os-settings");
    const onReset = () => {
      const preservedImage = ctx.state.customImage;
      ctx.state = { ...structuredDefaults(), customImage: preservedImage };
      ctx.save();
      ctx.apply();
      ctx.renderPanel(body);
    };
    const isAdmin = ctx.config.isAdmin;
    const externalTabs = listSettingsTabs().filter(
      (tab) => isTabVisible(tab, isAdmin)
    );
    const rows = [
      {
        id: "appearance",
        order: 10,
        tab: html`<wpd-tab value="appearance"
				>${__("Appearance")}</wpd-tab
			>`,
        panel: html`<wpd-tabpanel for="appearance">
				<wpd-panel>
					<p class="desktop-mode-os-settings__intro">
						${__(
          "Personalize your desktop. Changes apply instantly and are saved to this browser."
        )}
					</p>
					${buildWallpaperSection(ctx, body)}
					${buildAccentSection(ctx)}
					${buildDesktopLayoutSection(ctx)}
					${buildDockSizeSection(ctx)}
					${buildDockRailRendererSection(ctx)}
				</wpd-panel>
			</wpd-tabpanel>`
      },
      {
        id: "features",
        order: 25,
        tab: html`<wpd-tab value="features"
				>${__("Features")}</wpd-tab
			>`,
        panel: html`<wpd-tabpanel for="features">
				<wpd-panel>
					${buildFeaturesSection(ctx)}
					${isAdmin ? buildExtendedSection(ctx) : ""}
				</wpd-panel>
			</wpd-tabpanel>`
      },
      {
        id: "apps-icons",
        order: 22,
        tab: html`<wpd-tab value="apps-icons"
				>${__("Apps & Icons")}</wpd-tab
			>`,
        panel: html`<wpd-tabpanel for="apps-icons">
				<wpd-panel>${buildAppsIconsSection(ctx)}</wpd-panel>
			</wpd-tabpanel>`
      },
      {
        id: "effects",
        order: 27,
        tab: html`<wpd-tab value="effects"
				>${__("Effects")}</wpd-tab
			>`,
        panel: html`<wpd-tabpanel for="effects">
				<wpd-panel>${buildEffectsSection(ctx)}</wpd-panel>
			</wpd-tabpanel>`
      }
    ];
    if (isAdmin) {
      rows.push({
        id: "help",
        order: 40,
        tab: html`<wpd-tab value="help">${__("Components")}</wpd-tab>`,
        panel: html`<wpd-tabpanel for="help">
				<wpd-panel>${buildHelpSection(ctx)}</wpd-panel>
			</wpd-tabpanel>`
      });
    }
    rows.push({
      id: "about",
      order: Number.MAX_SAFE_INTEGER,
      tab: html`<wpd-tab value="about">${__("About")}</wpd-tab>`,
      panel: html`<wpd-tabpanel for="about">
			<wpd-panel padding="0">${buildAboutSection()}</wpd-panel>
		</wpd-tabpanel>`
    });
    for (const tab of externalTabs) {
      const tabId = `ext-${tab.id}`;
      const hostAttr = `wpd-settings-tab-host-${tab.id}`;
      const tabRef = tab;
      rows.push({
        id: tabId,
        order: tab.order ?? 100,
        tab: html`<wpd-tab value=${tabId}>${tab.label}</wpd-tab>`,
        panel: html`<wpd-tabpanel for=${tabId}>
				<wpd-panel><div data-host=${hostAttr}></div></wpd-panel>
			</wpd-tabpanel>`,
        mount: (rootBody) => {
          const host = rootBody.querySelector(
            `[data-host="${hostAttr}"]`
          );
          if (!host) {
            return;
          }
          try {
            tabRef.render(host, {
              isAdmin,
              getOsSettings: () => ctx.getOsSettingsSnapshot(),
              subscribeOsSettings: (cb) => ctx.subscribeOsSettings(cb)
            });
          } catch (err) {
            if (typeof console !== "undefined") {
              console.error(
                "[desktop-mode] settings tab render threw:",
                tabRef.id,
                err
              );
            }
          }
        }
      });
    }
    rows.sort((a, b) => a.order - b.order);
    const previousTabs = body.querySelector("wpd-tabs");
    const previousValue = ctx.activeTabId ?? previousTabs?.value ?? previousTabs?.getAttribute("value") ?? "appearance";
    const activeRowExists = rows.some((r) => r.id === previousValue);
    const initialTab = activeRowExists ? previousValue : "appearance";
    render(
      html`
			<wpd-tabs value=${initialTab} label=${__("Settings sections")}>
				${rows.map((r) => r.tab)}
			</wpd-tabs>
			${rows.map((r) => r.panel)}
			<wpd-panel class="desktop-mode-os-settings__footer">
				<wpd-button variant="ghost" @click=${onReset}
					>${__("Reset to defaults")}</wpd-button
				>
			</wpd-panel>
		`,
      body
    );
    for (const row of rows) {
      if (row.mount) {
        row.mount(body);
      }
    }
    const tabsHost = body.querySelector("wpd-tabs");
    if (tabsHost) {
      tabsHost.addEventListener("wpd-tab-change", (e) => {
        const detail = e.detail;
        if (detail?.value) {
          ctx.activeTabId = detail.value;
        }
      });
    }
    ctx.activeTabId = initialTab;
    ctx.tabRegistryUnsubscribe = subscribeSettingsTabs(() => {
      if (!body.isConnected) {
        if (ctx.tabRegistryUnsubscribe) {
          ctx.tabRegistryUnsubscribe();
          ctx.tabRegistryUnsubscribe = null;
        }
        return;
      }
      ctx.renderPanel(body);
    });
  }
  window.desktopModeRenderOsSettingsPanel = renderOsSettingsPanel;
})();
