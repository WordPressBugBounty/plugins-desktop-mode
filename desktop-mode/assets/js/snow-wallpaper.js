(function() {
  "use strict";
  const TEXT_DOMAIN = "desktop-mode";
  function i18n() {
    return window.wp?.i18n;
  }
  function __(text, domain = TEXT_DOMAIN) {
    return i18n()?.__(text, domain) ?? text;
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
  function addAction(hookName, namespace, callback, priority) {
    getWpHooks().addAction(
      hookName,
      namespace,
      callback,
      priority
    );
  }
  function removeAction(hookName, namespace) {
    return getWpHooks().removeAction(hookName, namespace);
  }
  const HOOKS = {
    /** Action mirroring document.visibilitychange for active canvas wallpapers. */
    WALLPAPER_VISIBILITY: "desktop-mode.wallpaper.visibility",
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
     * Action, fires BEFORE the window's element is detached from the
     * DOM but AFTER the manager has already removed it from the stack.
     * Payload: `{ windowId: string, element: HTMLElement }`.
     *
     * Use this for cleanup that needs a reference to the live
     * element (removing anchored snow, wallpaper particles pinned to
     * window tops, measurement caches keyed by element). `WINDOW_CLOSED`
     * fires immediately after and only carries the id, which means
     * subscribers would otherwise have to re-query the DOM — by then
     * the element is gone, so they can't match at all.
     */
    WINDOW_CLOSING: "desktop-mode.window.closing",
    /**
     * Action, fires when a window is minimized. Payload:
     * `{ windowId: string, element: HTMLElement }`.
     *
     * The element ride-along matches {@link WINDOW_CLOSING}'s shape so
     * wallpaper plugins anchored to window tops (snow, leaves, rain
     * splash) can match stuck particles by element identity and run
     * their teardown — minimized windows render at `opacity: 0` so
     * `offsetParent === null` checks miss them.
     */
    WINDOW_MINIMIZED: "desktop-mode.window.minimized",
    /**
     * Action, fires when a window is restored from minimized. Payload:
     * `{ windowId: string, element: HTMLElement }`.
     */
    WINDOW_RESTORED: "desktop-mode.window.restored",
    /**
     * Action, fires when a window is maximized (fills desktop area).
     * Payload: `{ windowId: string, element: HTMLElement }`.
     */
    WINDOW_MAXIMIZED: "desktop-mode.window.maximized",
    /**
     * Action, fires when a window exits maximized state. Payload:
     * `{ windowId: string, element: HTMLElement }`.
     */
    WINDOW_UNMAXIMIZED: "desktop-mode.window.unmaximized",
    /**
     * Action, fires when a window enters fullscreen / focus mode.
     * Payload: `{ windowId: string, element: HTMLElement }`.
     */
    WINDOW_FULLSCREEN_ENTERED: "desktop-mode.window.fullscreen-entered",
    /**
     * Action, fires when a window exits fullscreen / focus mode.
     * Payload: `{ windowId: string, element: HTMLElement }`.
     */
    WINDOW_FULLSCREEN_EXITED: "desktop-mode.window.fullscreen-exited",
    /**
     * Action, fires at most once per animation frame during an
     * active drag or resize with the live geometry. Payload: `{
     * windowId: string, x: number, y: number, width: number,
     * height: number, state: WindowState, phase: 'drag' | 'resize' }`.
     *
     * Intended for per-frame collision-aware wallpapers (snow piling
     * on window tops, rain splash on edges) that would otherwise
     * poll `getBoundingClientRect` every rAF. Coalesced via
     * `requestAnimationFrame` so a pointermove storm collapses to
     * one fire per paint — matches the cadence a wallpaper's own
     * ticker runs at.
     *
     * NOT fired at drag/resize end — `WINDOW_DRAG_END` /
     * `WINDOW_RESIZE_END` handle the settled geometry. Subscribers
     * that only want the final position should listen to those
     * instead.
     */
    WINDOW_BOUNDS_CHANGED: "desktop-mode.window.bounds-changed",
    /** Action before a widget tears down. Payload `{ id }`. */
    WIDGET_UNMOUNTING: "desktop-mode.widget.unmounting"
  };
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
  const styles$2 = css`:host{display:flex;align-items:center;gap:10px;font-size:12px;color:var( --desktop-mode-muted,#646970 )}input[ type='range' ]{flex:1;accent-color:var( --wp-admin-theme-color,#2271b1 )}.wpd-range-field__value{min-width:3ch;text-align:end;font-variant-numeric:tabular-nums;color:var( --desktop-mode-text,#1d2327 )}`;
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
  _WpdRangeField.styles = [styles$2];
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
  const styles$1 = css`:host{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var( --desktop-mode-muted,#646970 )}label{display:inline-flex;align-items:center;gap:8px}input[ type='color' ]{width:28px;height:28px;padding:0;border:1px solid var( --desktop-mode-border,#c3c4c7 );border-radius:6px;background:transparent;cursor:pointer}:host( [ variant='block' ] ){display:flex;width:100%}:host( [ variant='block' ] ) label{display:flex;flex:1;align-items:center}:host( [ variant='block' ] ) input[ type='color' ]{flex:1;width:auto;height:32px}input[ type='color' ]::-webkit-color-swatch-wrapper{padding:2px}input[ type='color' ]::-webkit-color-swatch{border:none;border-radius:2px}`;
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
  _WpdColorField.styles = [styles$1];
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
  function getPixi() {
    const pixi = window.PIXI;
    return pixi ?? null;
  }
  const SNOW_DEFAULTS = {
    wind: 22,
    particleCount: 660,
    flakeSize: 16,
    background: "#0c1a36"
  };
  const SNOW_LIMITS = {
    wind: { min: 0, max: 80 },
    particleCount: { min: 100, max: 2e3 },
    flakeSize: { min: 6, max: 40 }
  };
  function clampNumber(value, limits, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(limits.max, Math.max(limits.min, value));
  }
  function sanitizeSnowSettings(raw) {
    const bag = raw ?? {};
    return {
      wind: clampNumber(bag.wind, SNOW_LIMITS.wind, SNOW_DEFAULTS.wind),
      particleCount: Math.round(
        clampNumber(
          bag.particleCount,
          SNOW_LIMITS.particleCount,
          SNOW_DEFAULTS.particleCount
        )
      ),
      flakeSize: clampNumber(
        bag.flakeSize,
        SNOW_LIMITS.flakeSize,
        SNOW_DEFAULTS.flakeSize
      ),
      background: typeof bag.background === "string" && /^#[0-9a-f]{6}$/i.test(bag.background) ? bag.background.toLowerCase() : SNOW_DEFAULTS.background
    };
  }
  const STOP_55_DELTA = { h: -2.1538461538461604, s: -0.10790835181079084, l: 0.11176470588235296 };
  const STOP_100_DELTA = { h: -2.5, s: -0.2834224598930483, l: 0.2705882352941177 };
  function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) {
      return { h: 0, s: 0, l };
    }
    const s = l < 0.5 ? d / (max + min) : d / (2 - max - min);
    let h;
    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    return { h: h * 60, s, l };
  }
  function hslToHex(h, s, l) {
    h = (h % 360 + 360) % 360;
    s = Math.min(1, Math.max(0, s));
    l = Math.min(1, Math.max(0, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(h / 60 % 2 - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    const channel = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${channel(r)}${channel(g)}${channel(b)}`;
  }
  function backdropCss(background) {
    const base = hexToHsl(background);
    const mid = hslToHex(
      base.h + STOP_55_DELTA.h,
      base.s + STOP_55_DELTA.s,
      base.l + STOP_55_DELTA.l
    );
    const bottom = hslToHex(
      base.h + STOP_100_DELTA.h,
      base.s + STOP_100_DELTA.s,
      base.l + STOP_100_DELTA.l
    );
    return `linear-gradient(180deg, ${background} 0%, ${mid} 55%, ${bottom} 100%)`;
  }
  const TEXTURE_SIZE = 64;
  const TUNING = {
    /**
     * Spawn rate (flakes/s) while the field is unsaturated, at the
     * default particle count. Scaled linearly with the user's
     * particle count so the pool fills in the same wall-clock time at
     * every density. The pool cap is the real ceiling — once hit,
     * spawn pauses until something melts or recycles.
     */
    spawnPerSecondAtDefault: 90,
    /** The particle count `spawnPerSecondAtDefault` is calibrated for. */
    spawnCalibrationCount: 660,
    /**
     * Min / max vertical drift (px/s). Real snow falls slowly and
     * reaches terminal velocity fast — air resistance dominates over
     * gravity at flake mass — so velocity is modeled as a constant
     * per particle rather than accelerating. Range chosen for an
     * atmospheric feel rather than a hailstorm.
     */
    gravityMin: 28,
    gravityMax: 72,
    /** Period of the global wind sweep (seconds). */
    windPeriodSec: 11,
    /** Per-particle sway amplitude (px/s target). */
    driftAmplitude: 32,
    driftPeriodMin: 2.5,
    driftPeriodMax: 5.5,
    /**
     * Max rotation speed (rad/s). Spheres are rotation-invariant by
     * construction — kept tiny only so any minor bilinear-filter
     * asymmetries don't lock to a fixed orientation across the field.
     */
    rotationMax: 0.2,
    alphaMin: 0.7,
    alphaMax: 1,
    /** Melt duration once a stuck flake starts melting. */
    meltDurationSec: 1.8,
    /**
     * How long a flake stays stuck before it starts melting. Visible
     * piles take time to build — a short lifetime barely lets a
     * column reach 2–3 flakes before the bottom one melts. A small
     * jitter is applied per flake so an entire windowful doesn't melt
     * in lockstep.
     */
    stuckLifeSec: 9,
    stuckLifeJitter: 2.5,
    /**
     * A small inset on the window top so flakes don't visibly overlap
     * the title-bar drop shadow.
     */
    collisionMarginY: 2,
    /**
     * Width of one pile-height bucket in CSS px (surface-local X).
     * Each surface keeps a Float32Array of bucket heights; a falling
     * flake's bucket index is `floor((vpX - r.x) / bucket)`. 8 px is
     * roughly half a flake wide — narrow enough that two flakes
     * landing in the same column visibly stack rather than overlap,
     * wide enough that buckets feel continuous rather than discrete
     * bins.
     */
    pileBucketPx: 8,
    /**
     * Cap on per-column pile height in CSS px. Beyond this, further
     * flakes still stick but don't push the pile higher — surfaces
     * visually "saturate" with snow rather than growing unbounded
     * towers. ~3 flakes deep at the largest default flake size reads
     * as a small drift edge.
     */
    pileMaxPx: 48,
    /**
     * Fraction of a flake's size added to its bucket's pile height on
     * landing. Successive flakes' centres sit only
     * `pileContribution * size` apart, so 0.1 puts new flake centres
     * just 10% of a diameter above the previous one. The bright cores
     * (~30% of the size) heavily overlap, reading as a continuous
     * mass of snow rather than a stack of discrete dots with visible
     * interstitial halo. Lower = denser pile, slower vertical growth.
     */
    pileContribution: 0.1,
    /**
     * Fraction of `pileContribution` that bleeds into the two
     * neighbor buckets — gives piles a natural slope instead of
     * letting one column tower over its neighbors.
     */
    pileSpread: 0.4
  };
  const POOL_SIZE = SNOW_LIMITS.particleCount.max;
  function buildSnowflakeTexture(pixi) {
    const size = TEXTURE_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return pixi.Texture.from(canvas);
    }
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 1;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, "rgba(255, 255, 255, 1)");
    grad.addColorStop(0.3, "rgba(250, 252, 255, 0.9)");
    grad.addColorStop(0.6, "rgba(235, 245, 255, 0.32)");
    grad.addColorStop(0.88, "rgba(220, 232, 255, 0.07)");
    grad.addColorStop(1, "rgba(210, 228, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return pixi.Texture.from(canvas);
  }
  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  async function mountSnowScene(opts) {
    const { container, pixi, getSurfaces } = opts;
    const priorBackground = container.style.background;
    container.style.background = backdropCss(opts.settings.background);
    const tunables = { ...opts.settings };
    const app = new pixi.Application();
    try {
      await app.init({
        resizeTo: container,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2)
      });
    } catch (err) {
      container.style.background = priorBackground;
      throw err;
    }
    container.appendChild(app.canvas);
    app.canvas.style.position = "absolute";
    app.canvas.style.inset = "0";
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
    app.canvas.style.pointerEvents = "none";
    const texture = buildSnowflakeTexture(pixi);
    const stage = new pixi.ParticleContainer({
      dynamicProperties: {
        position: true,
        vertex: true,
        rotation: true,
        color: true
      }
    });
    app.stage.addChild(stage);
    const MAX = POOL_SIZE;
    const pX = new Float32Array(MAX);
    const pY = new Float32Array(MAX);
    const pVX = new Float32Array(MAX);
    const pVY = new Float32Array(MAX);
    const pSize = new Float32Array(MAX);
    const pRot = new Float32Array(MAX);
    const pRotVel = new Float32Array(MAX);
    const pDriftPhase = new Float32Array(MAX);
    const pDriftFreq = new Float32Array(MAX);
    const pDriftAmp = new Float32Array(MAX);
    const pBaseAlpha = new Float32Array(MAX);
    const pState = new Uint8Array(MAX);
    const pAnchor = new Array(MAX);
    const pAnchorDX = new Float32Array(MAX);
    const pAnchorDY = new Float32Array(MAX);
    const pStuckLife = new Float32Array(MAX);
    const pMelt = new Float32Array(MAX);
    const pSurfaceId = new Array(MAX);
    const pBucket = new Int32Array(MAX);
    const pPileAdd = new Float32Array(MAX);
    const pPileRemaining = new Float32Array(MAX);
    const particles = new Array(MAX);
    const freeList = new Array(MAX);
    for (let i = 0; i < MAX; i++) {
      const particle = new pixi.Particle({
        texture,
        anchorX: 0.5,
        anchorY: 0.5,
        // Free particles are hidden via alpha rather than removed
        // from the container — the mutation is already on the
        // GPU's dynamic-color path, so this is cheaper than
        // churning the particle list.
        alpha: 0,
        tint: 16777215
      });
      stage.addParticle(particle);
      particles[i] = particle;
      pState[i] = 0;
      pAnchor[i] = null;
      pSurfaceId[i] = null;
      pBucket[i] = -1;
      pPileAdd[i] = 0;
      pPileRemaining[i] = 0;
      freeList[i] = MAX - 1 - i;
    }
    let freeCount = MAX;
    const pileHeights = /* @__PURE__ */ new Map();
    const surfaces = [];
    let surfacesDirty = true;
    let canvasRect = app.canvas.getBoundingClientRect();
    function refreshCanvasRect() {
      canvasRect = app.canvas.getBoundingClientRect();
    }
    function refreshSurfacesIfDirty() {
      if (!surfacesDirty) {
        return;
      }
      surfaces.length = 0;
      if (!getSurfaces) {
        surfacesDirty = false;
        return;
      }
      const all = getSurfaces();
      let liveIds = null;
      for (let k = 0; k < all.length; k++) {
        const s = all[k];
        if (s.face !== "top") {
          continue;
        }
        if (s.rect.width <= 0 || s.rect.height <= 0) {
          continue;
        }
        surfaces.push(s);
        if (pileHeights.size > 0) {
          if (liveIds === null) {
            liveIds = /* @__PURE__ */ new Set();
          }
          liveIds.add(s.id);
        }
      }
      if (pileHeights.size > 0) {
        pileHeights.forEach((_arr, id) => {
          if (!liveIds || !liveIds.has(id)) {
            pileHeights.delete(id);
          }
        });
      }
      surfacesDirty = false;
    }
    function getPileForSurface(surface) {
      const bucketCount = Math.max(
        1,
        Math.ceil(surface.rect.width / TUNING.pileBucketPx)
      );
      const existing = pileHeights.get(surface.id);
      if (existing && existing.length === bucketCount) {
        return existing;
      }
      const fresh = new Float32Array(bucketCount);
      if (existing) {
        const copyLen = Math.min(existing.length, bucketCount);
        for (let i = 0; i < copyLen; i++) {
          fresh[i] = existing[i];
        }
      }
      pileHeights.set(surface.id, fresh);
      return fresh;
    }
    function spawn() {
      if (freeCount === 0) {
        return;
      }
      const idx = freeList[--freeCount];
      const w = app.canvas.clientWidth;
      const sizeMax = tunables.flakeSize;
      const sizeMin = sizeMax / 2;
      pX[idx] = Math.random() * w;
      pY[idx] = -rand(50, 180);
      pVX[idx] = rand(-8, 8);
      pVY[idx] = rand(TUNING.gravityMin, TUNING.gravityMax);
      pSize[idx] = rand(sizeMin, sizeMax);
      pRot[idx] = Math.random() * Math.PI * 2;
      pRotVel[idx] = rand(-0.2, TUNING.rotationMax);
      pDriftPhase[idx] = Math.random() * Math.PI * 2;
      pDriftFreq[idx] = 2 * Math.PI / rand(TUNING.driftPeriodMin, TUNING.driftPeriodMax);
      pDriftAmp[idx] = rand(6, TUNING.driftAmplitude);
      pBaseAlpha[idx] = rand(TUNING.alphaMin, TUNING.alphaMax);
      pMelt[idx] = 0;
      pStuckLife[idx] = 0;
      pAnchor[idx] = null;
      pSurfaceId[idx] = null;
      pBucket[idx] = -1;
      pPileAdd[idx] = 0;
      pState[idx] = 1;
      pPileRemaining[idx] = 0;
      const particle = particles[idx];
      if (!particle) {
        return;
      }
      const scale = pSize[idx] / TEXTURE_SIZE;
      particle.scaleX = scale;
      particle.scaleY = scale;
      particle.alpha = pBaseAlpha[idx];
      particle.rotation = pRot[idx];
      particle.x = pX[idx];
      particle.y = pY[idx];
    }
    function decrementPileFor(idx) {
      const sid = pSurfaceId[idx];
      if (sid === null) {
        return;
      }
      const pile = pileHeights.get(sid);
      if (!pile) {
        return;
      }
      const b = pBucket[idx];
      if (b < 0 || b >= pile.length) {
        return;
      }
      const add = pPileRemaining[idx];
      if (add <= 0) {
        return;
      }
      const spread = add * TUNING.pileSpread;
      pile[b] = Math.max(0, pile[b] - add);
      if (b > 0) {
        pile[b - 1] = Math.max(0, pile[b - 1] - spread);
      }
      if (b + 1 < pile.length) {
        pile[b + 1] = Math.max(0, pile[b + 1] - spread);
      }
      pPileRemaining[idx] = 0;
    }
    function release(idx) {
      decrementPileFor(idx);
      pState[idx] = 0;
      pAnchor[idx] = null;
      pSurfaceId[idx] = null;
      pBucket[idx] = -1;
      pPileAdd[idx] = 0;
      pPileRemaining[idx] = 0;
      const particle = particles[idx];
      if (particle) {
        particle.alpha = 0;
      }
      freeList[freeCount++] = idx;
    }
    function stick(idx, anchorEl, dx, pileHeight, surfaceId, bucket, pileAdd) {
      pState[idx] = 2;
      pAnchor[idx] = anchorEl;
      pAnchorDX[idx] = dx;
      pAnchorDY[idx] = TUNING.collisionMarginY - pileHeight;
      pSurfaceId[idx] = surfaceId;
      pBucket[idx] = bucket;
      pPileAdd[idx] = pileAdd;
      pPileRemaining[idx] = pileAdd;
      pVX[idx] = 0;
      pVY[idx] = 0;
      pRotVel[idx] = 0;
      pStuckLife[idx] = rand(
        TUNING.stuckLifeSec - TUNING.stuckLifeJitter,
        TUNING.stuckLifeSec + TUNING.stuckLifeJitter
      );
    }
    function startMelt(idx) {
      pState[idx] = 3;
      pMelt[idx] = 0;
    }
    function detachToFalling(idx) {
      decrementPileFor(idx);
      pState[idx] = 1;
      pAnchor[idx] = null;
      pSurfaceId[idx] = null;
      pBucket[idx] = -1;
      pPileAdd[idx] = 0;
      pPileRemaining[idx] = 0;
      pVX[idx] = rand(-6, 6);
      pVY[idx] = rand(TUNING.gravityMin, TUNING.gravityMax);
      pRotVel[idx] = rand(-0.2, TUNING.rotationMax);
    }
    function collideWithSurfaces(idx, prevY) {
      const vpX = pX[idx] + canvasRect.left;
      const vpY = pY[idx] + canvasRect.top;
      const prevVpY = prevY + canvasRect.top;
      for (let k = 0; k < surfaces.length; k++) {
        const s = surfaces[k];
        const r = s.rect;
        if (vpX < r.x || vpX > r.x + r.width) {
          continue;
        }
        const pile = getPileForSurface(s);
        let bucket = Math.floor((vpX - r.x) / TUNING.pileBucketPx);
        if (bucket < 0) {
          bucket = 0;
        } else if (bucket >= pile.length) {
          bucket = pile.length - 1;
        }
        const pileHeight = pile[bucket];
        const top = r.y + TUNING.collisionMarginY - pileHeight;
        if (prevVpY <= top && vpY >= top) {
          const add = pSize[idx] * TUNING.pileContribution;
          const spread = add * TUNING.pileSpread;
          stick(idx, s.element, vpX - r.x, pileHeight, s.id, bucket, add);
          pile[bucket] = Math.min(TUNING.pileMaxPx, pile[bucket] + add);
          if (bucket > 0) {
            pile[bucket - 1] = Math.min(
              TUNING.pileMaxPx,
              pile[bucket - 1] + spread
            );
          }
          if (bucket + 1 < pile.length) {
            pile[bucket + 1] = Math.min(
              TUNING.pileMaxPx,
              pile[bucket + 1] + spread
            );
          }
          return true;
        }
      }
      return false;
    }
    let elapsed = 0;
    let lastRectRefresh = -1;
    let spawnAccum = 0;
    let animating = !opts.prefersReducedMotion;
    function spawnPerSecond() {
      return TUNING.spawnPerSecondAtDefault * tunables.particleCount / TUNING.spawnCalibrationCount;
    }
    if (!animating) {
      const staticCount = tunables.particleCount * 0.35;
      for (let s = 0; s < staticCount; s++) {
        spawn();
      }
    }
    function tick(ticker) {
      let dt = ticker.deltaMS / 1e3;
      if (dt > 0.1) {
        dt = 0.1;
      }
      elapsed += dt;
      if (elapsed - lastRectRefresh > 0.05) {
        surfacesDirty = true;
        lastRectRefresh = elapsed;
      }
      refreshCanvasRect();
      refreshSurfacesIfDirty();
      const wind = Math.sin(elapsed / TUNING.windPeriodSec * Math.PI * 2) * tunables.wind;
      if (animating) {
        spawnAccum += dt * spawnPerSecond();
        while (spawnAccum >= 1) {
          if (MAX - freeCount >= tunables.particleCount) {
            spawnAccum = 0;
            break;
          }
          spawn();
          spawnAccum -= 1;
        }
      }
      const w = app.canvas.clientWidth;
      const h = app.canvas.clientHeight;
      for (let idx = 0; idx < MAX; idx++) {
        const st = pState[idx];
        if (st === 0) {
          continue;
        }
        const particle = particles[idx];
        if (!particle) {
          continue;
        }
        if (st === 1) {
          const prevY = pY[idx];
          const sway = Math.sin(elapsed * pDriftFreq[idx] + pDriftPhase[idx]) * pDriftAmp[idx];
          pVX[idx] += (wind + sway - pVX[idx]) * Math.min(1, dt * 1.5);
          pX[idx] += pVX[idx] * dt;
          pY[idx] += pVY[idx] * dt;
          pRot[idx] += pRotVel[idx] * dt;
          if (pX[idx] < -16) {
            pX[idx] += w + 32;
          } else if (pX[idx] > w + 16) {
            pX[idx] -= w + 32;
          }
          if (collideWithSurfaces(idx, prevY)) ;
          else if (pY[idx] > h + 24) {
            release(idx);
            continue;
          }
          if (pState[idx] === 1) {
            particle.x = pX[idx];
            particle.y = pY[idx];
            particle.rotation = pRot[idx];
          }
        }
        if (pState[idx] === 2) {
          const anchorEl = pAnchor[idx];
          if (anchorEl) {
            if (!anchorEl.isConnected) {
              detachToFalling(idx);
            } else if (anchorEl.offsetParent === null) {
              startMelt(idx);
            } else {
              const arect = anchorEl.getBoundingClientRect();
              if (pAnchorDX[idx] < 0 || pAnchorDX[idx] > arect.width) {
                detachToFalling(idx);
                continue;
              }
              const ax = arect.left - canvasRect.left + pAnchorDX[idx];
              const ay = arect.top - canvasRect.top + pAnchorDY[idx];
              pX[idx] = ax;
              pY[idx] = ay;
              particle.x = ax;
              particle.y = ay;
            }
          } else {
            particle.x = pX[idx];
            particle.y = pY[idx];
          }
          if (pState[idx] === 2) {
            pStuckLife[idx] -= dt;
            if (pStuckLife[idx] <= 0) {
              startMelt(idx);
            }
          }
        }
        if (pState[idx] === 3) {
          pMelt[idx] += dt / TUNING.meltDurationSec;
          const t = pMelt[idx] > 1 ? 1 : pMelt[idx];
          particle.alpha = pBaseAlpha[idx] * (1 - t);
          const meltScale = pSize[idx] / TEXTURE_SIZE * (1 - t * 0.6);
          particle.scaleX = meltScale;
          particle.scaleY = meltScale;
          if (pPileRemaining[idx] > 0 && pSurfaceId[idx] !== null) {
            const meltStep = dt / TUNING.meltDurationSec;
            const rawDelta = pPileAdd[idx] * meltStep;
            const delta = rawDelta < pPileRemaining[idx] ? rawDelta : pPileRemaining[idx];
            pPileRemaining[idx] -= delta;
            const pile = pileHeights.get(pSurfaceId[idx]);
            if (pile && pBucket[idx] >= 0 && pBucket[idx] < pile.length) {
              const bk = pBucket[idx];
              const spread = delta * TUNING.pileSpread;
              pile[bk] = Math.max(0, pile[bk] - delta);
              if (bk > 0) {
                pile[bk - 1] = Math.max(
                  0,
                  pile[bk - 1] - spread
                );
              }
              if (bk + 1 < pile.length) {
                pile[bk + 1] = Math.max(
                  0,
                  pile[bk + 1] - spread
                );
              }
            }
            const mySid = pSurfaceId[idx];
            const myBucket = pBucket[idx];
            const myDY = pAnchorDY[idx];
            for (let j = 0; j < MAX; j++) {
              if (pState[j] === 2 && pSurfaceId[j] === mySid && pBucket[j] === myBucket && pAnchorDY[j] < myDY) {
                pAnchorDY[j] += delta;
              }
            }
          }
          if (t >= 1) {
            release(idx);
          }
        }
      }
    }
    app.ticker.add(tick);
    if (!animating) {
      app.ticker.update();
      app.ticker.stop();
    }
    let destroyed = false;
    return {
      setAnimating(next) {
        if (destroyed) {
          return;
        }
        animating = next && !opts.prefersReducedMotion;
        if (animating) {
          app.ticker.start();
        } else {
          app.ticker.stop();
        }
      },
      applySettings(next) {
        if (destroyed) {
          return;
        }
        tunables.wind = next.wind;
        tunables.particleCount = next.particleCount;
        tunables.flakeSize = next.flakeSize;
        if (next.background !== tunables.background) {
          tunables.background = next.background;
          container.style.background = backdropCss(next.background);
        }
      },
      markSurfacesDirty() {
        surfacesDirty = true;
      },
      detachFlakesAnchoredTo(element) {
        if (destroyed) {
          return;
        }
        surfacesDirty = true;
        for (let i = 0; i < MAX; i++) {
          if (pState[i] === 2 && pAnchor[i] === element) {
            detachToFalling(i);
          }
        }
      },
      destroy() {
        if (destroyed) {
          return;
        }
        destroyed = true;
        app.ticker.stop();
        app.ticker.remove(tick);
        app.destroy(
          { removeView: true },
          { children: true, texture: true, textureSource: true }
        );
        for (let i = 0; i < MAX; i++) {
          particles[i] = null;
          pAnchor[i] = null;
        }
        container.style.background = priorBackground;
      }
    };
  }
  const WALLPAPER_ID = "wp-snow";
  const NAMESPACE = "desktop-mode/snow";
  const PREVIEW = backdropCss(SNOW_DEFAULTS.background);
  const PREVIEW_PARTICLES = 140;
  function surfacesSupplier() {
    const api = window.wp?.desktop;
    if (!api || typeof api.getWallpaperSurfaces !== "function") {
      return null;
    }
    return () => api.getWallpaperSurfaces();
  }
  function wireSceneHooks(scene) {
    const visibilityHandler = (...args) => {
      const detail = args[0];
      if (!detail || detail.id !== WALLPAPER_ID) {
        return;
      }
      scene.setAnimating(detail.state === "visible");
    };
    addAction(
      HOOKS.WALLPAPER_VISIBILITY,
      `${NAMESPACE}/visibility`,
      visibilityHandler
    );
    const detachHandler = (...args) => {
      const detail = args[0];
      if (!detail || !detail.element) {
        return;
      }
      scene.detachFlakesAnchoredTo(detail.element);
    };
    addAction(
      HOOKS.WINDOW_CLOSING,
      `${NAMESPACE}/window-closing`,
      detachHandler
    );
    addAction(
      HOOKS.WINDOW_MINIMIZED,
      `${NAMESPACE}/window-minimized`,
      detachHandler
    );
    const dirtyHandler = () => {
      scene.markSurfacesDirty();
    };
    addAction(
      HOOKS.WINDOW_BOUNDS_CHANGED,
      `${NAMESPACE}/bounds-changed`,
      dirtyHandler
    );
    addAction(
      HOOKS.WINDOW_RESTORED,
      `${NAMESPACE}/window-restored`,
      dirtyHandler
    );
    addAction(
      HOOKS.WINDOW_MAXIMIZED,
      `${NAMESPACE}/window-maximized`,
      dirtyHandler
    );
    addAction(
      HOOKS.WINDOW_UNMAXIMIZED,
      `${NAMESPACE}/window-unmaximized`,
      dirtyHandler
    );
    addAction(
      HOOKS.WINDOW_FULLSCREEN_ENTERED,
      `${NAMESPACE}/window-fullscreen-entered`,
      dirtyHandler
    );
    addAction(
      HOOKS.WINDOW_FULLSCREEN_EXITED,
      `${NAMESPACE}/window-fullscreen-exited`,
      dirtyHandler
    );
    const widgetUnmountingHandler = (...args) => {
      const detail = args[0];
      if (!detail || !detail.id) {
        return;
      }
      const safeId = window.CSS && typeof CSS.escape === "function" ? CSS.escape(detail.id) : String(detail.id).replace(/"/g, '\\"');
      const card = document.querySelector(
        `[data-widget-id="${safeId}"]`
      );
      if (!card) {
        return;
      }
      scene.detachFlakesAnchoredTo(card);
    };
    addAction(
      HOOKS.WIDGET_UNMOUNTING,
      `${NAMESPACE}/widget-unmounting`,
      widgetUnmountingHandler
    );
    const settingsHandler = (...args) => {
      const detail = args[0];
      if (!detail || detail.id !== WALLPAPER_ID) {
        return;
      }
      scene.applySettings(sanitizeSnowSettings(detail.settings));
    };
    addAction(
      HOOKS.WALLPAPER_SETTINGS_CHANGED,
      `${NAMESPACE}/settings-changed`,
      settingsHandler
    );
    return () => {
      removeAction(HOOKS.WALLPAPER_VISIBILITY, `${NAMESPACE}/visibility`);
      removeAction(HOOKS.WINDOW_CLOSING, `${NAMESPACE}/window-closing`);
      removeAction(HOOKS.WINDOW_MINIMIZED, `${NAMESPACE}/window-minimized`);
      removeAction(HOOKS.WINDOW_RESTORED, `${NAMESPACE}/window-restored`);
      removeAction(HOOKS.WINDOW_MAXIMIZED, `${NAMESPACE}/window-maximized`);
      removeAction(
        HOOKS.WINDOW_UNMAXIMIZED,
        `${NAMESPACE}/window-unmaximized`
      );
      removeAction(
        HOOKS.WINDOW_FULLSCREEN_ENTERED,
        `${NAMESPACE}/window-fullscreen-entered`
      );
      removeAction(
        HOOKS.WINDOW_FULLSCREEN_EXITED,
        `${NAMESPACE}/window-fullscreen-exited`
      );
      removeAction(
        HOOKS.WINDOW_BOUNDS_CHANGED,
        `${NAMESPACE}/bounds-changed`
      );
      removeAction(
        HOOKS.WIDGET_UNMOUNTING,
        `${NAMESPACE}/widget-unmounting`
      );
      removeAction(
        HOOKS.WALLPAPER_SETTINGS_CHANGED,
        `${NAMESPACE}/settings-changed`
      );
    };
  }
  function rangeField(label, limits, step, value, onChange) {
    const field = document.createElement("wpd-range-field");
    field.setAttribute("label", label);
    field.setAttribute("min", String(limits.min));
    field.setAttribute("max", String(limits.max));
    field.setAttribute("step", String(step));
    field.setAttribute("value", String(value));
    field.addEventListener("wpd-range-change", (e) => {
      onChange(e.detail.value);
    });
    return field;
  }
  function renderSnowConfig(container, ctx) {
    let current = sanitizeSnowSettings(ctx.settings);
    const set = (partial) => {
      current = { ...current, ...partial };
      ctx.setSettings(partial);
    };
    const windField = rangeField(
      __("Wind"),
      SNOW_LIMITS.wind,
      1,
      current.wind,
      (value) => set({ wind: value })
    );
    const particlesField = rangeField(
      __("Snowflakes"),
      SNOW_LIMITS.particleCount,
      10,
      current.particleCount,
      (value) => set({ particleCount: Math.round(value) })
    );
    const sizeField = rangeField(
      __("Flake size"),
      SNOW_LIMITS.flakeSize,
      1,
      current.flakeSize,
      (value) => set({ flakeSize: value })
    );
    const colorField = document.createElement("wpd-color-field");
    colorField.setAttribute("label", __("Background color"));
    colorField.setAttribute("value", current.background);
    colorField.addEventListener("wpd-color-change", (e) => {
      const value = e.detail.value;
      set({ background: sanitizeSnowSettings({ background: value }).background });
    });
    const reset = document.createElement("wpd-button");
    reset.setAttribute("variant", "ghost");
    reset.style.alignSelf = "flex-start";
    reset.style.marginTop = "4px";
    reset.textContent = __("Reset to defaults");
    reset.addEventListener("click", () => {
      set({ ...SNOW_DEFAULTS });
      windField.setAttribute("value", String(SNOW_DEFAULTS.wind));
      particlesField.setAttribute(
        "value",
        String(SNOW_DEFAULTS.particleCount)
      );
      sizeField.setAttribute("value", String(SNOW_DEFAULTS.flakeSize));
      colorField.setAttribute("value", SNOW_DEFAULTS.background);
    });
    container.appendChild(windField);
    container.appendChild(particlesField);
    container.appendChild(sizeField);
    container.appendChild(colorField);
    container.appendChild(reset);
    return () => {
    };
  }
  const def = {
    id: WALLPAPER_ID,
    label: __("Snow"),
    type: "canvas",
    preview: PREVIEW,
    previewParams: { particleCount: PREVIEW_PARTICLES },
    /**
     * Live tile preview for the OS Settings picker — the real
     * simulation at tile scale, minus surface collision (surface
     * rects are viewport-space and meaningless inside a tile) and at
     * a fraction of the field density.
     */
    renderPreview: async (container, ctx) => {
      const pixi = getPixi();
      if (!pixi) {
        return () => {
        };
      }
      const settings = sanitizeSnowSettings(ctx.settings);
      const rawCount = ctx.params.particleCount;
      const previewCount = typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : PREVIEW_PARTICLES;
      const scene = await mountSnowScene({
        container,
        pixi,
        settings: sanitizeSnowSettings({
          ...settings,
          particleCount: previewCount
        }),
        prefersReducedMotion: ctx.prefersReducedMotion,
        getSurfaces: null
      });
      return () => scene.destroy();
    },
    needs: ["pixijs"],
    mount: async (container, ctx) => {
      const pixi = getPixi();
      if (!pixi) {
        return () => {
        };
      }
      const scene = await mountSnowScene({
        container,
        pixi,
        settings: sanitizeSnowSettings(ctx.settings),
        prefersReducedMotion: ctx.prefersReducedMotion,
        getSurfaces: surfacesSupplier()
      });
      const unwireHooks = wireSceneHooks(scene);
      return () => {
        unwireHooks();
        scene.destroy();
      };
    },
    renderConfig: renderSnowConfig
  };
  window.desktopModeWallpapers = window.desktopModeWallpapers || {};
  window.desktopModeWallpapers[WALLPAPER_ID] = def;
})();
