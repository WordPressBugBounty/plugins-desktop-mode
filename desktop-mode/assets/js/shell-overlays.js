(function() {
  "use strict";
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
  const TEXT_DOMAIN = "desktop-mode";
  function i18n() {
    return window.wp?.i18n;
  }
  function __(text, domain = TEXT_DOMAIN) {
    return i18n()?.__(text, domain) ?? text;
  }
  const containerStyles = css`:host{position:fixed;top:calc( var( --wp-admin--admin-bar--height,32px ) + 16px );inset-inline-end:16px;display:flex;flex-direction:column;gap:8px;z-index:calc( var( --desktop-mode-z-fullscreen,99999 ) + 10 );pointer-events:none}`;
  const toastStyles = css`:host{display:flex;align-items:center;gap:12px;min-width:280px;max-width:420px;padding:10px 14px;background:#1d2327;color:#fff;border-radius:10px;border:1px solid rgba( 255,255,255,0.12 );box-shadow:0 10px 30px rgba( 0,0,0,0.4 ),0 2px 6px rgba( 0,0,0,0.18 ),inset 0 0 0 1px rgba( 255,255,255,0.04 );font-size:13px;line-height:1.4;opacity:0;transform:translateY( -8px );transition:opacity 0.18s ease,transform 0.18s ease;pointer-events:auto}:host( [ state='in' ] ){opacity:1;transform:translateY( 0 )}:host( [ state='out' ] ){opacity:0;transform:translateY( -8px )}.wpd-toast__label{flex:1}button[ hidden ]{display:none}button{flex-shrink:0;padding:4px 10px;border:none;border-radius:4px;background:rgba( 255,255,255,0.12 );color:#fff;font:inherit;font-size:12px;font-weight:500;cursor:pointer;transition:background-color 0.12s ease}button:hover{background:rgba( 255,255,255,0.22 )}button:focus-visible{outline:2px solid rgba( 255,255,255,0.6 );outline-offset:2px}.wpd-toast__close{display:inline-flex;align-items:center;justify-content:center;padding:4px;border-radius:6px;background:transparent;color:rgba( 255,255,255,0.7 )}.wpd-toast__close:hover{background:rgba( 255,255,255,0.14 );color:#fff}@media ( prefers-reduced-motion:reduce ){:host{transition-duration:0.01ms}}`;
  const _WpdToastContainer = class _WpdToastContainer extends Component {
    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("aria-live", "polite");
    }
    render() {
      return html`<slot></slot>`;
    }
  };
  _WpdToastContainer.styles = [containerStyles];
  _WpdToastContainer.help = {
    title: "Toast container",
    summary: "Singleton stack beneath <body> that hosts transient <wpd-toast> notifications in the top-right. Created lazily by showToast(); authors rarely place one themselves.",
    status: "stable",
    since: "0.9.0",
    slots: [
      { name: "(default)", description: "<wpd-toast> children, stacked vertically." }
    ],
    cssProps: [
      { name: "--desktop-mode-z-fullscreen", description: "z-index base — toasts sit above fullscreen windows." }
    ],
    example: html`
			<wpd-toast-container>
				<wpd-toast state="in">Settings saved.</wpd-toast>
				<wpd-toast state="in" action="Undo">Theme changed.</wpd-toast>
			</wpd-toast-container>
		`
  };
  let WpdToastContainer = _WpdToastContainer;
  defineComponent("wpd-toast-container", WpdToastContainer);
  const _WpdToast = class _WpdToast extends Component {
    connectedCallback() {
      super.connectedCallback();
      if (!this.hasAttribute("role")) {
        this.setAttribute("role", "status");
      }
    }
    render() {
      const action = this.action || "";
      const dismissible = this.hasAttribute("dismissible");
      return html`
			<span class="wpd-toast__label"><slot></slot></span>
			<button
				type="button"
				?hidden=${!action}
				@click=${(e) => this._onAction(e)}
			>
				${action}
			</button>
			<button
				type="button"
				class="wpd-toast__close"
				aria-label=${__("Dismiss")}
				?hidden=${!dismissible}
				@click=${(e) => this._onDismiss(e)}
			>
				<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true" focusable="false">
					<path
						d="M3 3 L11 11 M11 3 L3 11"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						fill="none"
					></path>
				</svg>
			</button>
		`;
    }
    _onAction(e) {
      e.preventDefault();
      e.stopPropagation();
      this.emit("wpd-toast-action", {});
    }
    _onDismiss(e) {
      e.preventDefault();
      e.stopPropagation();
      this.emit("wpd-toast-dismiss", {});
    }
  };
  _WpdToast.props = ["action", "state", "dismissible"];
  _WpdToast.styles = [toastStyles];
  _WpdToast.help = {
    title: "Toast",
    summary: 'Single transient notification. Message is slotted; fade-in / fade-out is CSS-driven by flipping the state attribute between "in" and "out". Usually created via the showToast() helper rather than authored by hand.',
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "action",
        type: "string",
        description: "Optional action button label. When set, a button renders on the right and emits wpd-toast-action on click."
      },
      {
        name: "state",
        type: "'in' | 'out'",
        description: 'Drives the CSS fade transition. Set to "in" when rendered, flip to "out" before removal.'
      },
      {
        name: "dismissible",
        type: "boolean",
        description: "When set, a close (×) button renders on the right and emits wpd-toast-dismiss on click. Use for persistent toasts the user must be able to close."
      }
    ],
    slots: [
      { name: "(default)", description: "Message text." }
    ],
    events: [
      {
        name: "wpd-toast-action",
        description: "Fires when the action button is clicked.",
        detail: "{}"
      },
      {
        name: "wpd-toast-dismiss",
        description: "Fires when the close (×) button is clicked.",
        detail: "{}"
      }
    ],
    example: html`
			<wpd-toast state="in" action="Undo">Post moved to trash.</wpd-toast>
		`
  };
  let WpdToast = _WpdToast;
  defineComponent("wpd-toast", WpdToast);
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
  const menuStyles$1 = css`:host{display:none;position:fixed;min-width:180px;background:var( --wpd-context-menu-bg,var( --desktop-mode-bg,#1d2327 ) );color:var( --wpd-context-menu-fg,var( --desktop-mode-fg,#fff ) );border:1px solid rgba( 255,255,255,0.08 );border-radius:8px;box-shadow:0 8px 24px rgba( 0,0,0,0.45 );padding:4px;font-size:13px;line-height:1.3;z-index:9999}:host( [ open ] ){display:block}`;
  const optionStyles$1 = css`:host{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;background:transparent;color:inherit;text-align:start;cursor:pointer;border-radius:4px;box-sizing:border-box;user-select:none}:host(:hover ),:host( [ active ] ){background:rgba( 255,255,255,0.1 );outline:none}:host( [ disabled ] ){opacity:0.45;cursor:not-allowed}:host( [ danger ] ){color:#ff8a8a}:host( [ danger ]:hover ){background:rgba( 255,90,90,0.18 )}:host( [ heading ] ){padding:8px 10px 4px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var( --wpd-context-menu-fg-muted,rgba( 255,255,255,0.5 ) );pointer-events:none}.icon{display:inline-flex;align-items:center;justify-content:center;font-size:18px;width:20px;height:20px}.label{flex:1}.chevron{margin-inline-start:auto;padding-inline-start:8px;font-size:16px;line-height:1;opacity:0.7}.check{display:inline-flex;align-items:center;justify-content:center;width:14px;font-size:13px;line-height:1;opacity:0.95}`;
  const _WpdContextMenu = class _WpdContextMenu extends Component {
    render() {
      return html`
			<slot></slot>
		`;
    }
    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("role", "menu");
    }
  };
  _WpdContextMenu.props = ["open"];
  _WpdContextMenu.styles = [menuStyles$1];
  _WpdContextMenu.help = {
    title: "Context menu",
    summary: "Floating popup menu primitive. Pair with <wpd-context-menu-option> children. Toggle via the `open` boolean attribute. Listen for `wpd-context-menu-pick` to handle activation.",
    status: "experimental",
    since: "0.9.0",
    props: [
      {
        name: "open",
        type: "boolean attribute",
        description: "Mounts the menu in its open / visible state."
      }
    ],
    slots: [
      { name: "(default)", description: "List of <wpd-context-menu-option> items." }
    ],
    events: [
      {
        name: "wpd-context-menu-pick",
        description: "Bubbled from a non-disabled, non-heading option on activation. Detail: `{ id, value }`."
      }
    ]
  };
  let WpdContextMenu = _WpdContextMenu;
  defineComponent("wpd-context-menu", WpdContextMenu);
  const _WpdContextMenuOption = class _WpdContextMenuOption extends Component {
    constructor() {
      super(...arguments);
      this._onActivate = (e) => {
        if (this.hasAttribute("disabled") || this.hasAttribute("heading")) {
          return;
        }
        const target = e.target;
        if (target && target !== this && target.closest("wpd-context-menu-option") !== this) {
          return;
        }
        this.emit("wpd-context-menu-pick", {
          id: this.dataset.menuItemId ?? this.id ?? "",
          value: this.getAttribute("value") ?? ""
        });
      };
      this._onKey = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this._onActivate(e);
        }
      };
    }
    connectedCallback() {
      super.connectedCallback();
      const isHeading = this.hasAttribute("heading");
      this.setAttribute("role", isHeading ? "presentation" : "menuitem");
      if (!isHeading) {
        this.setAttribute("tabindex", "0");
      }
      this.addEventListener("click", this._onActivate);
      this.addEventListener("keydown", this._onKey);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._onActivate);
      this.removeEventListener("keydown", this._onKey);
    }
    render() {
      const icon = this.getAttribute("icon");
      const hasChildren = this.hasAttribute("has-children");
      const checked = this.hasAttribute("checked");
      return html`
			${checked ? html`<span class="check" aria-hidden="true">✓</span>` : html``}
			${icon ? html`<span class="icon dashicons ${icon}" aria-hidden="true"></span>` : html``}
			<span class="label"><slot></slot></span>
			${hasChildren ? html`<span class="chevron" aria-hidden="true">›</span>` : html``}
		`;
    }
  };
  _WpdContextMenuOption.props = [
    "value",
    "icon",
    "disabled",
    "danger",
    "heading",
    "has-children",
    "checked"
  ];
  _WpdContextMenuOption.styles = [optionStyles$1];
  _WpdContextMenuOption.help = {
    title: "Context menu option",
    summary: "Single row inside <wpd-context-menu>. Use `icon` for a leading dashicon, `danger` for destructive items, `heading` for a non-interactive section header, `has-children` to render a trailing chevron.",
    status: "experimental",
    since: "0.9.0",
    props: [
      {
        name: "value",
        type: "string",
        description: "Forwarded as `detail.value` on activation."
      },
      {
        name: "icon",
        type: "string",
        description: "Dashicon class (e.g. `dashicons-trash`)."
      },
      {
        name: "disabled",
        type: "boolean attribute",
        description: "Renders the option dimmed; clicks are ignored."
      },
      {
        name: "danger",
        type: "boolean attribute",
        description: "Destructive styling — red text, red hover."
      },
      {
        name: "heading",
        type: "boolean attribute",
        description: "Non-interactive section header. Ignores clicks."
      },
      {
        name: "has-children",
        type: "boolean attribute",
        description: "Renders a trailing chevron to suggest a submenu."
      },
      {
        name: "checked",
        type: "boolean attribute",
        description: "Renders a leading check mark — for radio-style picks inside a submenu (e.g. the active Sort By order)."
      }
    ],
    slots: [
      { name: "(default)", description: "Visible label." }
    ],
    events: [
      {
        name: "wpd-context-menu-pick",
        description: "Bubbled on click / Enter for non-heading non-disabled options. Detail: `{ id, value }`."
      }
    ]
  };
  let WpdContextMenuOption = _WpdContextMenuOption;
  defineComponent("wpd-context-menu-option", WpdContextMenuOption);
  const menuStyles = css`:host{display:block;min-width:220px;padding:4px;background:var( --desktop-mode-window-bg,#fff );color:var( --desktop-mode-text,#1d2327 );border:1px solid var( --desktop-mode-window-border,#c3c4c7 );border-radius:8px;box-shadow:0 8px 24px rgba( 0,0,0,0.18 ),0 2px 6px rgba( 0,0,0,0.08 )}:host( [ hidden ] ){display:none}`;
  const menuItemStyles = css`:host{display:block}button{display:flex;align-items:center;gap:10px;width:100%;min-height:32px;padding:6px 10px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:1.3;text-align:start;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease}button:hover,button:focus-visible{background:rgba( 0,0,0,0.06 );color:#000;outline:none}button:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-2px}.wpd-menu-item__icon{flex-shrink:0;width:18px;height:18px;font-size:18px;line-height:1;color:var( --wp-admin-theme-color,#2271b1 )}.wpd-menu-item__icon[ hidden ]{display:none}.wpd-menu-item__label{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wpd-menu-item__check{flex-shrink:0;width:16px;height:16px;border-radius:3px;border:1.5px solid rgba( 0,0,0,0.25 );position:relative;background:transparent;transition:background-color 0.12s ease,border-color 0.12s ease}.wpd-menu-item__check[ hidden ]{display:none}:host( [ checked ] ) .wpd-menu-item__check{background:var( --wp-admin-theme-color,#2271b1 );border-color:var( --wp-admin-theme-color,#2271b1 )}:host( [ checked ] ) .wpd-menu-item__check::after{content:'';position:absolute;top:1px;left:4px;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate( 45deg )}`;
  const _WpdMenu = class _WpdMenu extends Component {
    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("role", "menu");
    }
    render() {
      return html`<slot></slot>`;
    }
  };
  _WpdMenu.styles = [menuStyles];
  _WpdMenu.help = {
    title: "Menu",
    summary: "Popover menu used in window title bars and other overflow triggers. Presentation-only: the consumer owns open/close state via the `hidden` attribute and any outside-click dismissal.",
    status: "stable",
    since: "0.9.0",
    slots: [
      { name: "(default)", description: "<wpd-menu-item> children." }
    ],
    cssProps: [
      { name: "--desktop-mode-window-bg", description: "Menu background." },
      { name: "--desktop-mode-window-border", description: "Menu border." },
      { name: "--desktop-mode-text", description: "Item text colour." }
    ],
    example: html`
			<wpd-menu>
				<wpd-menu-item value="new" icon="dashicons-plus">Open another window</wpd-menu-item>
				<wpd-menu-item value="startup" role="menuitemcheckbox" checked>Open on startup</wpd-menu-item>
				<wpd-menu-item value="close">Close window</wpd-menu-item>
			</wpd-menu>
		`
  };
  let WpdMenu = _WpdMenu;
  defineComponent("wpd-menu", WpdMenu);
  const _WpdMenuItem = class _WpdMenuItem extends Component {
    connectedCallback() {
      super.connectedCallback();
      if (!this.hasAttribute("role")) {
        this.setAttribute("role", "menuitem");
      }
    }
    render() {
      const icon = this.icon || "";
      const isCheckbox = this.getAttribute("role") === "menuitemcheckbox";
      const checked = this.checked !== null;
      if (isCheckbox) {
        this.setAttribute("aria-checked", checked ? "true" : "false");
      }
      return html`
			<button type="button" @click=${(e) => this._onPick(e)}>
				<span
					class="wpd-menu-item__check"
					?hidden=${!isCheckbox}
				></span>
				<span
					class="wpd-menu-item__icon dashicons ${icon}"
					aria-hidden="true"
					?hidden=${isCheckbox || !icon}
				></span>
				<span class="wpd-menu-item__label">
					<slot></slot>
				</span>
			</button>
		`;
    }
    _onPick(e) {
      e.preventDefault();
      this.emit("wpd-menu-item-click", {
        value: this.value
      });
    }
  };
  _WpdMenuItem.props = ["icon", "value", "checked"];
  _WpdMenuItem.styles = [menuItemStyles];
  _WpdMenuItem.help = {
    title: "Menu item",
    summary: 'Single row inside a <wpd-menu>. Supports three looks: plain label, left-aligned dashicon (icon="dashicons-…"), or a checkbox indicator (role="menuitemcheckbox" + checked).',
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "icon",
        type: "string (dashicons class)",
        description: 'Dashicons class rendered on the left. Ignored when role="menuitemcheckbox".'
      },
      {
        name: "value",
        type: "string",
        description: "Identifier emitted in wpd-menu-item-click.detail.value."
      },
      {
        name: "checked",
        type: "boolean attribute",
        description: 'Visible check indicator. Only honoured when role="menuitemcheckbox".'
      }
    ],
    slots: [
      { name: "(default)", description: "Menu item label." }
    ],
    events: [
      {
        name: "wpd-menu-item-click",
        description: "Fires when the item is clicked; bubbles so the <wpd-menu> parent can delegate.",
        detail: "{ value: string | null }"
      }
    ]
  };
  let WpdMenuItem = _WpdMenuItem;
  defineComponent("wpd-menu-item", WpdMenuItem);
  const styles$4 = css`:host{display:inline-flex}button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:none;border-radius:5px;background:transparent;color:var( --wpd-btn-color,currentColor );cursor:pointer;transition:background-color 0.15s ease,color 0.15s ease}button:hover{color:var( --wpd-btn-color-hover,currentColor );background:var( --wpd-btn-bg-hover,rgba( 0,0,0,0.06 ) )}button:focus-visible{color:var( --wpd-btn-color-hover,currentColor );background:var( --wpd-btn-bg-hover,rgba( 0,0,0,0.06 ) );outline:2px solid var( --wpd-btn-outline,currentColor );outline-offset:1px}:host( [ active ] ) button{color:var( --wpd-btn-color-hover,currentColor );background:var( --wpd-btn-bg-active,rgba( 0,0,0,0.08 ) )}:host( [ danger ] ) button:hover{color:#fff;background:var( --wpd-btn-danger-hover,#d63638 )}svg{display:block;pointer-events:none;flex-shrink:0}svg:empty{display:none}::slotted( span ){line-height:1}::slotted( svg ){display:block}`;
  const ICONS$1 = {
    minimize: '<path d="M3 6h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>',
    maximize: '<rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.25" fill="none"/>',
    fullscreen: '<path d="M4.5 2H2v2.5M10 4.5V2H7.5M4.5 10H2V7.5M10 7.5V10H7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    "fullscreen-exit": '<path d="M2 4.5H4.5V2M7.5 2V4.5H10M2 7.5H4.5V10M7.5 10V7.5H10" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    detach: '<path d="M5 2H2.5v7.5H10V7M6.5 2H10v3.5M10 2L5.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    reload: (
      // Filled icon scaled from a 512×512 source into the 12×12 viewBox
      // shared with the other title-bar glyphs. The wrapping `<g>` does
      // the math; the inner path is dropped in unmodified so its
      // authoring tool can be re-edited and copy-pasted again.
      // `scale(0.021)` ≈ 90% of full fit, with `translate(0.6)` to
      // keep the result centered inside the 12×12 viewBox so the
      // glyph reads slightly smaller than min/max/close — closer to
      // the visual weight of the other title-bar buttons.
      '<g transform="translate(0.6 0.6) scale(0.021)" fill="currentColor"><path d="m504.554 233.704-76.447 91.467c-6.329 7.572-15.417 11.479-24.571 11.479a31.872 31.872 0 0 1-20.504-7.447l-91.467-76.447c-13.561-11.334-15.366-31.515-4.032-45.075s31.515-15.366 45.075-4.032l37.506 31.347c-10.274-74.891-74.668-132.774-152.337-132.774C132.984 102.223 64 171.207 64 256s68.984 153.777 153.777 153.777c17.673 0 32 14.327 32 32s-14.327 32-32 32c-58.17 0-112.859-22.653-153.991-63.785C22.653 368.859 0 314.17 0 256s22.653-112.859 63.786-153.992c41.132-41.132 95.821-63.785 153.991-63.785s112.859 22.653 153.992 63.785c32.517 32.516 53.471 73.508 60.829 117.991l22.849-27.339c11.334-13.56 31.515-15.364 45.075-4.032 13.56 11.335 15.365 31.516 4.032 45.076z"/></g>'
    ),
    close: '<path d="M3.25 3.25l5.5 5.5M3.25 8.75l5.5-5.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>',
    menu: '<circle cx="3" cy="6" r="1.2" fill="currentColor"/><circle cx="6" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="6" r="1.2" fill="currentColor"/>'
  };
  const _WpdWindowButton = class _WpdWindowButton extends Component {
    constructor() {
      super(...arguments);
      this._activateWired = false;
    }
    render() {
      const iconKey = this.icon || "";
      const svgInner = ICONS$1[iconKey] || "";
      return html`
			<button type="button">
				<svg
					width="14"
					height="14"
					viewBox="0 0 12 12"
					aria-hidden="true"
					focusable="false"
				></svg>
				<slot></slot>
			</button>
			<span data-svg-buffer style="display:none">${svgInner}</span>
		`;
    }
    /**
     * After each render, copy the raw SVG markup into the actual
     * `<svg>` element. The templater only writes text into slots,
     * so we stash the intended markup in a hidden buffer and
     * `innerHTML = ` the svg once here — a one-shot post-render
     * hook that keeps the declarative template honest.
     *
     * Also wires up the `wpd-button-activate` CustomEvent that
     * fires exactly once per gesture — the canonical contract
     * for plugin-registered title-bar buttons. Plugin authors who
     * use `addEventListener( 'click', cb )` directly still get
     * what they expect (the title bar's drag-handler now excludes
     * chrome buttons by class so static clicks land normally),
     * but `wpd-button-activate` is the documented surface that
     * documents the once-per-gesture contract explicitly. See
     * the class-level docblock for rationale.
     */
    connectedCallback() {
      super.connectedCallback();
      queueMicrotask(() => this._paintSvg());
      queueMicrotask(() => this._wireActivateEvent());
    }
    attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback(name, oldValue, newValue);
      queueMicrotask(() => this._paintSvg());
    }
    _paintSvg() {
      const root = this.shadowRoot;
      if (!root) {
        return;
      }
      const svg = root.querySelector("svg");
      const buffer = root.querySelector("[data-svg-buffer]");
      if (svg && buffer) {
        const markup = buffer.textContent || "";
        if (svg.innerHTML !== markup) {
          svg.innerHTML = markup;
        }
      }
    }
    _wireActivateEvent() {
      if (this._activateWired) {
        return;
      }
      const root = this.shadowRoot;
      if (!root) {
        return;
      }
      const button = root.querySelector("button");
      if (!button) {
        return;
      }
      this._activateWired = true;
      button.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("wpd-button-activate", {
            bubbles: true,
            composed: true,
            cancelable: true
          })
        );
      });
    }
  };
  _WpdWindowButton.props = ["icon", "active", "danger"];
  _WpdWindowButton.styles = [styles$4];
  _WpdWindowButton.help = {
    title: "Window button",
    summary: "Chrome button used in native-window title bars. Built-in icons cover the standard controls (minimize, maximize, fullscreen, detach, close, menu). Focused/unfocused coloring is driven by --wpd-btn-* CSS custom properties the window shell owns.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "icon",
        type: "'minimize' | 'maximize' | 'fullscreen' | 'fullscreen-exit' | 'detach' | 'reload' | 'close' | 'menu'",
        description: "Which built-in inline SVG to paint. Omit to supply your own via the slot."
      },
      {
        name: "active",
        type: "boolean attribute",
        description: "Applies the pressed-down look (used e.g. while a menu it triggers is open)."
      },
      {
        name: "danger",
        type: "boolean attribute",
        description: "Swaps the hover wash to red — used by the close button."
      }
    ],
    slots: [
      { name: "(default)", description: "Optional custom icon markup (inline SVG) when `icon` is omitted." }
    ],
    cssProps: [
      { name: "--wpd-btn-color", description: "Resting foreground." },
      { name: "--wpd-btn-color-hover", description: "Hover foreground." },
      { name: "--wpd-btn-bg-hover", description: "Hover background wash." },
      { name: "--wpd-btn-bg-active", description: "Pressed background." },
      { name: "--wpd-btn-danger-hover", description: "Hover background for danger variant." },
      { name: "--wpd-btn-outline", description: "Focus outline colour." }
    ],
    example: html`
			<wpd-cluster gap="2">
				<wpd-window-button icon="minimize"></wpd-window-button>
				<wpd-window-button icon="maximize"></wpd-window-button>
				<wpd-window-button icon="menu"></wpd-window-button>
				<wpd-window-button icon="close" danger></wpd-window-button>
			</wpd-cluster>
		`
  };
  let WpdWindowButton = _WpdWindowButton;
  defineComponent("wpd-window-button", WpdWindowButton);
  const styles$3 = css`:host{display:inline-flex}button{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;border-radius:4px;background:transparent;color:rgba( 0,0,0,0.45 );cursor:pointer;transition:background-color 0.15s ease,color 0.15s ease,transform 0.12s ease}:host( [ variant='detach' ] ) button:hover{color:var( --wp-admin-theme-color,#2271b1 );background:rgba( 34,113,177,0.12 );transform:translateY( -1px )}:host( [ variant='detach' ] ) button:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:1px}:host( [ variant='close' ] ) button:hover{color:#fff;background:#d63638}:host( [ variant='close' ] ) button:focus-visible{color:#fff;background:#d63638;outline:2px solid rgba( 214,54,56,0.6 );outline-offset:1px}svg{display:block;pointer-events:none;width:12px;height:12px}@media ( prefers-reduced-motion:reduce ){button{transition-duration:0.01ms}:host( [ variant='detach' ] ) button:hover{transform:none}}`;
  const ICONS = {
    detach: '<path d="M5 2H2.5v7.5H10V7M6.5 2H10v3.5M10 2L5.5 6.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    close: '<path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
  };
  const _WpdTabChip = class _WpdTabChip extends Component {
    render() {
      const variant = this.variant || "";
      const svgInner = ICONS[variant] || "";
      return html`
			<button type="button">
				<svg
					viewBox="0 0 12 12"
					aria-hidden="true"
					focusable="false"
				></svg>
				<slot></slot>
			</button>
			<span data-svg-buffer style="display:none">${svgInner}</span>
		`;
    }
    connectedCallback() {
      super.connectedCallback();
      queueMicrotask(() => this._paintSvg());
    }
    attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback(name, oldValue, newValue);
      queueMicrotask(() => this._paintSvg());
    }
    _paintSvg() {
      const root = this.shadowRoot;
      if (!root) {
        return;
      }
      const svg = root.querySelector("svg");
      const buffer = root.querySelector("[data-svg-buffer]");
      if (svg && buffer) {
        const markup = buffer.textContent || "";
        if (svg.innerHTML !== markup) {
          svg.innerHTML = markup;
        }
      }
    }
  };
  _WpdTabChip.props = ["variant"];
  _WpdTabChip.styles = [styles$3];
  _WpdTabChip.help = {
    title: "Tab chip",
    summary: "Small action button dropped inside an external sub-tab. `detach` lifts with an accent wash on hover; `close` uses a red destructive wash. Click bubbles as a native click — consumers read `variant` if they need to distinguish.",
    status: "stable",
    since: "0.9.0",
    props: [
      {
        name: "variant",
        type: "'detach' | 'close'",
        description: "Selects the built-in SVG icon and the hover wash colour."
      }
    ],
    slots: [
      { name: "(default)", description: "Optional custom icon markup when `variant` is omitted." }
    ],
    example: html`
			<wpd-cluster gap="4">
				<wpd-tab-chip variant="detach"></wpd-tab-chip>
				<wpd-tab-chip variant="close"></wpd-tab-chip>
			</wpd-cluster>
		`
  };
  let WpdTabChip = _WpdTabChip;
  defineComponent("wpd-tab-chip", WpdTabChip);
  const styles$2 = css`:host{display:inline-flex;align-items:center;gap:6px;font-size:var( --wpd-save-status-font-size,11px );line-height:1;color:var( --wpd-save-status-fg,currentColor );vertical-align:middle;min-width:0;opacity:1;pointer-events:auto}.wpd-save-status__indicator{display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:50%;flex-shrink:0;box-sizing:border-box;background:var( --wpd-save-status-bg,transparent );border:2px solid var( --wpd-save-status-idle-color,color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 55%,transparent ) );color:var( --wp-admin-theme-color,#2271b1 );transition:background-color 0.2s ease,border-color 0.2s ease,box-shadow 0.2s ease}:host( [ phase='pending' ] ) .wpd-save-status__indicator,:host( [ phase='saving' ] ) .wpd-save-status__indicator{background:var( --wpd-save-status-bg,var( --wp-admin-theme-color,#2271b1 ) );border-color:transparent;color:var( --wp-admin-theme-color,#2271b1 );animation:wpd-save-status-pulse 1.2s ease-in-out infinite}:host( [ animation='modem' ][ phase='pending' ] ) .wpd-save-status__indicator,:host( [ animation='modem' ][ phase='saving' ] ) .wpd-save-status__indicator{background:var( --wpd-save-status-bg,var( --wp-admin-theme-color,#2271b1 ) );border-color:transparent;color:var( --wp-admin-theme-color,#2271b1 );animation:wpd-save-status-modem-stutter 1.8s ease-in-out infinite,wpd-save-status-modem-glow 2.4s ease-in-out infinite}@keyframes wpd-save-status-modem-stutter{0%,4%{opacity:1}5%,30%{opacity:0.22}31%,36%{opacity:1}37%,39%{opacity:0.22}40%,44%{opacity:1}45%,67%{opacity:0.22}68%,76%{opacity:1}77%,100%{opacity:0.22}}@keyframes wpd-save-status-modem-glow{0%,12%{box-shadow:0 0 0 0 transparent}13%,22%{box-shadow:0 0 4px 0 currentColor}23%,50%{box-shadow:0 0 0 0 transparent}51%,58%{box-shadow:0 0 4px 0 currentColor}59%,84%{box-shadow:0 0 0 0 transparent}85%,94%{box-shadow:0 0 5px 0 currentColor}95%,100%{box-shadow:0 0 0 0 transparent}}@media ( prefers-reduced-motion:reduce ){:host( [ phase='pending' ] ) .wpd-save-status__indicator,:host( [ phase='saving' ] ) .wpd-save-status__indicator,:host( [ animation='modem' ][ phase='pending' ] ) .wpd-save-status__indicator,:host( [ animation='modem' ][ phase='saving' ] ) .wpd-save-status__indicator{animation:none;opacity:0.85}}:host( [ phase='saved' ] ) .wpd-save-status__indicator{background:var( --wpd-save-status-saved-bg,#1d6f42 );border-color:transparent;color:var( --wpd-save-status-saved-bg,#1d6f42 )}:host( [ phase='failed' ] ) .wpd-save-status__indicator{background:var( --wpd-save-status-failed-bg,#d63638 );border-color:transparent;color:var( --wpd-save-status-failed-bg,#d63638 );animation:wpd-save-status-pulse 0.8s ease-in-out 2}@keyframes wpd-save-status-pulse{0%,100%{opacity:0.55;transform:scale( 0.9 )}50%{opacity:1;transform:scale( 1 )}}:host( [ mode='pill' ] ) .wpd-save-status{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;background:var( --wpd-save-status-pill-bg,transparent );font-weight:500;white-space:nowrap}:host( [ mode='pill' ][ phase='saving' ] ) .wpd-save-status,:host( [ mode='pill' ][ phase='pending' ] ) .wpd-save-status{background:var( --wpd-save-status-pill-bg,rgba( 0,0,0,0.04 ) );color:var( --wpd-save-status-pill-fg,#50575e )}:host( [ mode='pill' ][ phase='saved' ] ) .wpd-save-status{background:var( --wpd-save-status-pill-bg,rgba( 30,132,73,0.12 ) );color:var( --wpd-save-status-pill-fg,#1d6f42 )}:host( [ mode='pill' ][ phase='failed' ] ) .wpd-save-status{background:var( --wpd-save-status-pill-bg,rgba( 214,54,56,0.12 ) );color:var( --wpd-save-status-pill-fg,#a02622 )}.wpd-save-status__label{min-width:0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}:host( [ phase='saved' ] ) .wpd-save-status__glyph,:host( [ phase='failed' ] ) .wpd-save-status__glyph{display:inline-block;color:#fff;width:8px;height:8px}.wpd-save-status__glyph{display:none}.wpd-save-status__glyph svg{display:block;width:100%;height:100%}`;
  const DEFAULT_EVENT = "desktop-mode-os-settings-save-lifecycle";
  const DEFAULT_AUTO_CLEAR_SAVED_MS = 2200;
  const DEFAULT_AUTO_CLEAR_FAILED_MS = 6e3;
  const _WpdSaveStatus = class _WpdSaveStatus extends Component {
    constructor() {
      super(...arguments);
      this._autoTimer = null;
      this._docListener = null;
    }
    connectedCallback() {
      super.connectedCallback();
      if (this.auto !== null) {
        this._installAutoListener();
      }
    }
    disconnectedCallback() {
      this._removeAutoListener();
      if (this._autoTimer !== null) {
        window.clearTimeout(this._autoTimer);
        this._autoTimer = null;
      }
    }
    attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback(name, oldValue, newValue);
      if (name === "auto" || name === "event") {
        this._removeAutoListener();
        if (this.auto !== null) {
          this._installAutoListener();
        }
      }
      if (name === "phase") {
        this._scheduleAutoClear();
        const detail = {
          phase: this.phase ?? "idle",
          error: this.error ?? void 0
        };
        this.emit("wpd-save-status-change", detail);
      }
    }
    render() {
      const phase = this.phase ?? "idle";
      const mode = this.mode ?? "dot";
      const error = this.error ?? "";
      const title = error || this._labelForPhase(phase);
      if (title) {
        this.setAttribute("title", title);
      } else {
        this.removeAttribute("title");
      }
      this.setAttribute("aria-live", phase === "failed" ? "assertive" : "polite");
      this.setAttribute("role", phase === "failed" ? "alert" : "status");
      return html`
			<span class="wpd-save-status">
				<span class="wpd-save-status__indicator" aria-hidden="true">
					<span class="wpd-save-status__glyph">${this._renderGlyph(phase)}</span>
				</span>
				${mode === "pill" ? html`<span class="wpd-save-status__label"
							>${this._labelForPhase(phase)}</span
					  >` : html``}
			</span>
		`;
    }
    _renderGlyph(phase) {
      if (phase === "saved") {
        return _iconCheck();
      }
      if (phase === "failed") {
        return _iconBang();
      }
      return "";
    }
    _labelForPhase(phase) {
      switch (phase) {
        case "pending":
        case "saving":
          return this["saving-label"] ?? "Saving…";
        case "saved":
          return this["saved-label"] ?? "Saved";
        case "failed": {
          const err = this.error ?? "";
          return err || "Couldn’t save";
        }
        default:
          return this["idle-label"] ?? "";
      }
    }
    _installAutoListener() {
      const eventName = this.event || DEFAULT_EVENT;
      this._docListener = (e) => {
        const detail = e.detail;
        if (!detail || typeof detail.phase !== "string") {
          return;
        }
        this.phase = detail.phase;
        if (detail.error) {
          this.error = detail.error;
        } else if (detail.phase !== "failed" && this.error) {
          this.removeAttribute("error");
        }
      };
      document.addEventListener(eventName, this._docListener);
    }
    _removeAutoListener() {
      if (!this._docListener) {
        return;
      }
      const eventName = this.event || DEFAULT_EVENT;
      document.removeEventListener(eventName, this._docListener);
      this._docListener = null;
    }
    _scheduleAutoClear() {
      if (this._autoTimer !== null) {
        window.clearTimeout(this._autoTimer);
        this._autoTimer = null;
      }
      const phase = this.phase ?? "idle";
      const ms = this._autoClearMsFor(phase);
      if (ms <= 0) {
        return;
      }
      this._autoTimer = window.setTimeout(() => {
        this._autoTimer = null;
        this.phase = "idle";
      }, ms);
    }
    _autoClearMsFor(phase) {
      if (phase === "saved") {
        const raw = this["auto-clear-saved-ms"];
        return parseInt(raw || "", 10) || DEFAULT_AUTO_CLEAR_SAVED_MS;
      }
      if (phase === "failed") {
        const raw = this["auto-clear-failed-ms"];
        return parseInt(raw || "", 10) || DEFAULT_AUTO_CLEAR_FAILED_MS;
      }
      return 0;
    }
  };
  _WpdSaveStatus.props = [
    "phase",
    "mode",
    "animation",
    "auto",
    "event",
    "error",
    "saving-label",
    "saved-label",
    "idle-label",
    "auto-clear-saved-ms",
    "auto-clear-failed-ms"
  ];
  _WpdSaveStatus.styles = [styles$2];
  _WpdSaveStatus.help = {
    title: "Save status",
    summary: 'Tiny status indicator for "is this change saved yet?" affordances. Three layouts (dot / icon / pill), five phases, optional auto-listen to a save-lifecycle CustomEvent so every input in the panel inherits feedback for free.',
    status: "experimental",
    since: "0.8.0",
    props: [
      {
        name: "phase",
        type: "'idle' | 'pending' | 'saving' | 'saved' | 'failed'",
        default: "idle",
        description: "Current lifecycle phase. Set manually for one-off integrations, or rely on `auto` to populate it from a CustomEvent."
      },
      {
        name: "mode",
        type: "'dot' | 'icon' | 'pill'",
        default: "dot",
        description: "Layout. `dot` is the smallest (10×10 colored dot); `icon` adds a glyph inside on saved/failed; `pill` adds an inline label."
      },
      {
        name: "animation",
        type: "'pulse' | 'modem'",
        default: "pulse",
        description: "Animation cadence during the saving phase. `pulse` (default) is a smooth ease-in-out; `modem` is an irregular activity-LED blink with a soft glow — suits a 'data-flowing' affordance in window title bars."
      },
      {
        name: "auto",
        type: "boolean attribute",
        description: 'Subscribe to a CustomEvent on `document` and populate phase + error from its detail. Default event name is `desktop-mode-os-settings-save-lifecycle`; override with `event="…"`.'
      },
      {
        name: "event",
        type: "string",
        default: "desktop-mode-os-settings-save-lifecycle",
        description: "CustomEvent name to listen on when `auto` is set."
      },
      {
        name: "error",
        type: "string",
        description: "Error message shown in `pill` mode and exposed as the host title attribute (so dot/icon modes still surface the message via tooltip)."
      },
      {
        name: "saving-label",
        type: "string",
        default: "Saving…",
        description: "Pill-mode label shown during `pending` / `saving`."
      },
      {
        name: "saved-label",
        type: "string",
        default: "Saved",
        description: "Pill-mode label shown during `saved`."
      },
      {
        name: "idle-label",
        type: "string",
        description: 'Optional pill-mode label shown during `idle` (e.g. "All changes saved"). When unset, the pill collapses to invisible while idle.'
      },
      {
        name: "auto-clear-saved-ms",
        type: "integer",
        default: "2200",
        description: "How long the `saved` phase stays visible before auto-fading back to `idle`."
      },
      {
        name: "auto-clear-failed-ms",
        type: "integer",
        default: "6000",
        description: "How long the `failed` phase stays visible before auto-fading back to `idle`."
      }
    ],
    events: [
      {
        name: "wpd-save-status-change",
        description: "Fires when the phase changes (manually or via auto-listen).",
        detail: "{ phase, error }"
      }
    ],
    cssProps: [
      {
        name: "--wpd-save-status-bg",
        description: "Indicator background color (saving/pending phase)."
      },
      {
        name: "--wpd-save-status-saved-bg",
        description: "Indicator background on saved."
      },
      {
        name: "--wpd-save-status-failed-bg",
        description: "Indicator background on failed."
      },
      {
        name: "--wpd-save-status-pill-bg",
        description: "Pill background (mode=pill)."
      },
      {
        name: "--wpd-save-status-pill-fg",
        description: "Pill foreground (mode=pill)."
      }
    ],
    example: html`
			<wpd-cluster gap="12">
				<wpd-save-status phase="pending"></wpd-save-status>
				<wpd-save-status phase="saving"></wpd-save-status>
				<wpd-save-status phase="saved"></wpd-save-status>
				<wpd-save-status phase="failed"></wpd-save-status>
				<wpd-save-status mode="pill" phase="saving"></wpd-save-status>
				<wpd-save-status mode="pill" phase="saved"></wpd-save-status>
				<wpd-save-status mode="pill" phase="failed" error="Network error."></wpd-save-status>
			</wpd-cluster>
		`
  };
  let WpdSaveStatus = _WpdSaveStatus;
  defineComponent("wpd-save-status", WpdSaveStatus);
  function _iconCheck() {
    return html`
		<svg
			viewBox="0 0 12 12"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M2.5 6 L5 8.5 L9.5 4" />
		</svg>
	`;
  }
  function _iconBang() {
    return html`
		<svg
			viewBox="0 0 12 12"
			aria-hidden="true"
			focusable="false"
			fill="currentColor"
		>
			<path
				d="M5 2 H7 V7 H5 z M5 8.5 H7 V10.5 H5 z"
			/>
		</svg>
	`;
  }
  const styles$1 = css`:host{display:inline-block;--wpd-spinner-color:var( --wp-admin-theme-color,#21759b );--wpd-spinner-accent:#fff;--wpd-spinner-size:48px;width:var( --wpd-spinner-size );height:var( --wpd-spinner-size );color:var( --wpd-spinner-color );vertical-align:middle;line-height:0}:host( [ hidden ] ){display:none}.root,.root svg{display:block;width:100%;height:100%}.root svg .mark{fill:var( --wpd-spinner-accent,#fff )}@keyframes wpd-spinner-spin{to{transform:rotate( 360deg )}}@keyframes wpd-spinner-scale{0%,100%{transform:scale( 1 )}50%{transform:scale( 1.045 )}}@keyframes wpd-spinner-opacity{0%,100%{opacity:1}50%{opacity:0.7}}@media ( prefers-reduced-motion:reduce ){.root svg [ style*='animation' ]{animation:none !important}}`;
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
  _WpdSpinner.styles = [styles$1];
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
  const styles = css`:host{display:inline-flex}:host( [ fill-cell ] ){display:flex;width:100%}button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:var( --wpd-button-padding,6px 12px );border-radius:var( --wpd-button-border-radius,6px );font:inherit;font-weight:500;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease;background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid var( --desktop-mode-border,#c3c4c7 ) )}:host( [ fill-cell ] ) button{width:100%;min-height:var( --wpd-button-min-height,44px )}button:disabled{opacity:0.5;cursor:not-allowed}button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.04 ) )}:host( [ variant='primary' ] ) button{background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) );color:var( --wpd-button-fg,#fff );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='primary' ] ) button:hover:not(:disabled ){filter:brightness( 1.06 );background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ variant='secondary' ] ) button{background:var( --wpd-button-bg,rgba( 0,0,0,0.06 ) );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='secondary' ] ) button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.1 ) )}:host( [ variant='danger' ] ) button{background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,#d63638 );border:var( --wpd-button-border,1px solid currentColor )}:host( [ variant='danger' ] ) button:hover:not(:disabled ){background:#d63638;color:#fff}:host( [ variant='link' ] ) button{background:transparent;color:var( --wpd-button-fg,var( --wp-admin-theme-color,#2271b1 ) );border:0;padding:0;text-decoration:underline}:host( [ busy ] ) button{pointer-events:none;opacity:0.75}.wpd-button__spinner{box-sizing:border-box;display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:wpd-button-spin 0.6s linear infinite;flex-shrink:0}@keyframes wpd-button-spin{to{transform:rotate( 360deg )}}`;
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
    set items(list) {
      const existing = this.querySelectorAll(":scope > wpd-option");
      for (const el of Array.from(existing)) {
        el.remove();
      }
      for (const item of list) {
        const opt = document.createElement("wpd-option");
        opt.setAttribute("value", item.value);
        opt.textContent = item.label;
        this.appendChild(opt);
      }
      const current = this.value;
      const stillValid = current !== null && list.some((i) => i.value === current);
      if (!stillValid && list.length > 0) {
        this.value = list[0].value;
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
})();
