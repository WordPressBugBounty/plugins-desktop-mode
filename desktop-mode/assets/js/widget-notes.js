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
  const styles = css`:host{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var( --desktop-mode-text,#1d2327 );cursor:pointer}label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}input[ type='checkbox' ]{accent-color:var( --wp-admin-theme-color,#2271b1 );cursor:pointer}:host( [ disabled ] ){opacity:0.5;cursor:not-allowed}:host( [ disabled ] ) label,:host( [ disabled ] ) input[ type='checkbox' ]{cursor:not-allowed}`;
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
  _WpdCheckboxLabel.styles = [styles];
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
  const textareaStyles = css`:host{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var( --desktop-mode-text,#1d2327 );min-width:0}:host( [ hidden ] ){display:none}.wpd-textarea__label{font-size:12px;color:var( --desktop-mode-muted,#646970 )}textarea{appearance:none;-webkit-appearance:none;display:block;width:100%;min-width:0;box-sizing:border-box;padding:8px 10px;background:var( --desktop-mode-window-bg,#fff );border:1px solid var( --desktop-mode-border,#dcdcde );border-radius:6px;font:inherit;font-size:13px;line-height:1.45;color:var( --desktop-mode-text,#1d2327 );resize:vertical;transition:border-color 0.12s ease,box-shadow 0.12s ease}textarea:hover{border-color:var( --desktop-mode-muted,#8c8f94 )}textarea:focus-visible{outline:none;border-color:var( --wp-admin-theme-color,#2271b1 );box-shadow:0 0 0 1px var( --wp-admin-theme-color,#2271b1 )}textarea:disabled{opacity:0.55;cursor:not-allowed;background:rgba( 0,0,0,0.03 )}textarea[ aria-invalid='true' ]{border-color:#d63638}textarea[ aria-invalid='true' ]:focus-visible{box-shadow:0 0 0 1px #d63638}:host( [ auto-grow ] ) textarea{resize:none;overflow:hidden}`;
  const _WpdTextarea = class _WpdTextarea extends Component {
    constructor() {
      super(...arguments);
      this._textareaEl = null;
    }
    connectedCallback() {
      super.connectedCallback();
      ensureAutoId(this);
    }
    render() {
      const label = this._attr("label") || "";
      const value = this._attr("value") ?? "";
      const placeholder = this._attr("placeholder") || "";
      const disabled = this._boolAttr("disabled");
      const readonly = this._boolAttr("readonly");
      const ariaLabel = this._attr("aria-label") || label;
      const name = this._attr("name") || "";
      const rows = Number(this._attr("rows")) || 3;
      const maxLength = this._attr("maxlength");
      const minLength = this._attr("minlength");
      const invalid = this._boolAttr("invalid");
      const hostId = this.id || "wpd-unnamed";
      const fieldId = `${hostId}__field`;
      return html`
			${label ? html`<label class="wpd-textarea__label" for=${fieldId}>${label}</label>` : html``}
			<textarea
				id=${fieldId}
				part="textarea"
				.value=${value}
				placeholder=${placeholder}
				?disabled=${disabled}
				?readonly=${readonly}
				rows=${rows}
				maxlength=${maxLength ?? ""}
				minlength=${minLength ?? ""}
				name=${name}
				aria-invalid=${invalid ? "true" : "false"}
				aria-label=${ariaLabel || ""}
				@input=${(e) => this._onInput(e)}
				@change=${(e) => this._onChange(e)}
				@keydown=${(e) => this._onKeyDown(e)}
			></textarea>
		`;
    }
    _attr(name) {
      return this.getAttribute(name);
    }
    _boolAttr(name) {
      return this.getAttribute(name) !== null;
    }
    _onInput(e) {
      const ta = e.target;
      this._textareaEl = ta;
      this.setAttribute("value", ta.value);
      this.emit("wpd-input-change", { value: ta.value });
      if (this._boolAttr("auto-grow")) {
        this._autosize(ta);
      }
    }
    _onChange(e) {
      const ta = e.target;
      this.emit("wpd-input-commit", { value: ta.value });
    }
    _onKeyDown(e) {
      if (!this._boolAttr("submit-on-enter")) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const ta = e.target;
        this.emit("wpd-submit", { value: ta.value });
      }
    }
    /**
     * Grow the textarea height to fit content, capped at `max-rows`.
     * Resets to scroll-height each input then clamps; cheap because
     * the browser caches layout.
     */
    _autosize(ta) {
      const maxRows = Number(this._attr("max-rows")) || 8;
      const cs = window.getComputedStyle(ta);
      const fontSize = parseFloat(cs.fontSize) || 13;
      const lineHeightRaw = cs.lineHeight;
      const lineHeight = lineHeightRaw === "normal" ? fontSize * 1.45 : parseFloat(lineHeightRaw) || fontSize * 1.45;
      const paddingTop = parseFloat(cs.paddingTop) || 0;
      const paddingBottom = parseFloat(cs.paddingBottom) || 0;
      const max = lineHeight * maxRows + paddingTop + paddingBottom;
      ta.style.height = "auto";
      const next = Math.min(ta.scrollHeight, max);
      ta.style.height = `${next}px`;
    }
    /** Public helper for callers that programmatically set `.value` and want autosize to re-run. */
    refreshAutosize() {
      if (this._textareaEl && this._boolAttr("auto-grow")) {
        this._autosize(this._textareaEl);
      }
    }
    /** Imperatively focus the underlying textarea. */
    focusInput() {
      const root = this.shadowRoot ?? this;
      const ta = root.querySelector("textarea");
      ta?.focus();
    }
    /** Imperatively clear the value. */
    clear() {
      this.setAttribute("value", "");
      const root = this.shadowRoot ?? this;
      const ta = root.querySelector("textarea");
      if (ta) {
        ta.value = "";
        if (this._boolAttr("auto-grow")) {
          this._autosize(ta);
        }
      }
    }
  };
  _WpdTextarea.props = [
    "label",
    "value",
    "placeholder",
    "disabled",
    "readonly",
    "ariaLabel",
    "name",
    "rows",
    "maxlength",
    "minlength",
    "invalid",
    "autoGrow",
    "maxRows",
    "submitOnEnter"
  ];
  _WpdTextarea.styles = [textareaStyles];
  _WpdTextarea.help = {
    title: "Textarea",
    summary: "Multi-line text input. Same event shape as wpd-text-field. Optional auto-grow up to max-rows; optional submit-on-enter (Enter sends, Shift+Enter newlines).",
    status: "stable",
    since: "0.6.0",
    props: [
      { name: "label", type: "string", description: "Visible label above the textarea." },
      { name: "value", type: "string", description: "Current value; reflected two-way." },
      { name: "placeholder", type: "string", description: "Native placeholder." },
      { name: "disabled", type: "boolean attribute" },
      { name: "readonly", type: "boolean attribute" },
      { name: "aria-label", type: "string", description: "Accessible label when no visible label is rendered." },
      { name: "name", type: "string", description: "Forwarded to native textarea for form submission." },
      { name: "rows", type: "integer (string)", default: "3", description: "Initial visible row count." },
      { name: "maxlength", type: "integer (string)" },
      { name: "minlength", type: "integer (string)" },
      { name: "invalid", type: "boolean attribute", description: "Sets aria-invalid + error styling." },
      { name: "auto-grow", type: "boolean attribute", description: "Grows up to max-rows as the user types." },
      { name: "max-rows", type: "integer (string)", default: "8" },
      {
        name: "submit-on-enter",
        type: "boolean attribute",
        description: "Enter fires wpd-submit; Shift+Enter inserts a newline."
      }
    ],
    events: [
      { name: "wpd-input-change", description: "Fires on every keystroke.", detail: "{ value: string }" },
      { name: "wpd-input-commit", description: "Fires on blur / native change.", detail: "{ value: string }" },
      {
        name: "wpd-submit",
        description: "Fires on Enter (without Shift) when submit-on-enter is set.",
        detail: "{ value: string }"
      }
    ],
    example: html`
			<wpd-textarea label="Message" rows="3" auto-grow max-rows="8" submit-on-enter></wpd-textarea>
		`
  };
  let WpdTextarea = _WpdTextarea;
  defineComponent("wpd-textarea", WpdTextarea);
  const TEXT_DOMAIN = "desktop-mode";
  function i18n() {
    return window.wp?.i18n;
  }
  function __(text, domain = TEXT_DOMAIN) {
    return i18n()?.__(text, domain) ?? text;
  }
  const NOTE_COLORS = [
    "butter",
    "blush",
    "sky",
    "mint",
    "lilac",
    "peach"
  ];
  function normalizeNoteColor(color) {
    return NOTE_COLORS.includes(color) ? color : NOTE_COLORS[0];
  }
  function nextNoteColor(color) {
    const index = NOTE_COLORS.indexOf(
      normalizeNoteColor(color)
    );
    return NOTE_COLORS[(index + 1) % NOTE_COLORS.length];
  }
  function hashNoteSeed(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    const seed = hash >>> 1 || 1;
    return seed;
  }
  const PIN_WIDTH = 56;
  const PIN_HEIGHT = 52;
  function pushpinUrl(pluginUrl) {
    return `${pluginUrl.replace(/\/$/, "")}/assets/images/pushpin.svg`;
  }
  function buildPinImage(pluginUrl) {
    const img = document.createElement("img");
    img.src = pushpinUrl(pluginUrl);
    img.alt = "";
    img.width = PIN_WIDTH;
    img.height = PIN_HEIGHT;
    img.draggable = false;
    img.className = "desktop-mode-pinned-note__pin-img";
    return img;
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
  let deps = null;
  function installNotesRestDeps(next) {
    deps = next;
  }
  function ensureDeps() {
    if (!deps) {
      throw new Error(
        "[desktop-mode] notes REST client called before installNotesRestDeps()."
      );
    }
    return deps;
  }
  function liveNonce(installed) {
    const cfg = window.desktopModeConfig;
    return typeof cfg?.restNonce === "string" && cfg.restNonce ? cfg.restNonce : installed;
  }
  class NotesConflictError extends Error {
    constructor(current) {
      super("Note was changed by another session.");
      this.status = 409;
      this.name = "NotesConflictError";
      this.current = current;
    }
  }
  async function call(path, init) {
    const { baseUrl, nonce } = ensureDeps();
    const url = baseUrl;
    const headers = new Headers(init.headers ?? {});
    headers.set("X-WP-Nonce", liveNonce(nonce));
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await trackedFetch(
      url,
      { ...init, headers, credentials: "same-origin" },
      { source: "desktop-mode/notes" }
    );
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (!res.ok) {
      if (res.status === 409) {
        const current = body?.data?.current;
        throw new NotesConflictError(current ?? null);
      }
      const err = body;
      throw new Error(
        `[desktop-mode] notes REST ${res.status}: ${err?.code ?? ""} ${err?.message ?? ""}`.trim()
      );
    }
    if (null === body) {
      throw new Error(
        `[desktop-mode] notes REST ${res.status}: empty or unparseable body.`
      );
    }
    return body;
  }
  function createNote(body) {
    return call("", {
      method: "POST",
      body: JSON.stringify(body)
    });
  }
  const NOTE_DRAFT_PAYLOAD_TYPE = "note-draft";
  const NOTE_CREATED_EVENT = "desktop-mode-note-created";
  const WIDGET_ID = "desktop-mode/notes";
  function readShellConfig() {
    return window.desktopModeConfig ?? {};
  }
  function getDragManager() {
    return window.wp?.desktop?.dragManager ?? null;
  }
  const mount = (container, ctx) => {
    let destroyed = false;
    const config = readShellConfig();
    const canCreate = Boolean(config.notesUrl);
    if (canCreate) {
      installNotesRestDeps({
        baseUrl: config.notesUrl,
        nonce: config.restNonce ?? ""
      });
    }
    let color = normalizeNoteColor(
      ctx.storage.get("color") ?? NOTE_COLORS[0]
    );
    let isPublic = ctx.storage.get("public") ?? false;
    let text = "";
    const root = document.createElement("div");
    root.className = "dm-notes-pad";
    const stack = document.createElement("div");
    stack.className = "dm-notes-pad__stack";
    const under2 = document.createElement("div");
    under2.className = "dm-notes-pad__under dm-notes-pad__under--2";
    const under1 = document.createElement("div");
    under1.className = "dm-notes-pad__under dm-notes-pad__under--1";
    const sheet = document.createElement("div");
    sheet.className = "dm-notes-pad__sheet";
    const peel = document.createElement("div");
    peel.className = "dm-notes-pad__peel";
    peel.setAttribute("aria-hidden", "true");
    const peelHint = document.createElement("span");
    peelHint.className = "dm-notes-pad__peel-hint";
    peelHint.textContent = __("Drag to pin", "desktop-mode");
    peel.appendChild(peelHint);
    const editor = document.createElement("wpd-textarea");
    editor.className = "dm-notes-pad__editor";
    editor.setAttribute("aria-label", __("New note", "desktop-mode"));
    editor.setAttribute("placeholder", __("Write a note…", "desktop-mode"));
    editor.setAttribute("rows", "5");
    editor.setAttribute("auto-grow", "");
    editor.setAttribute("max-rows", "8");
    const corner = document.createElement("button");
    corner.type = "button";
    corner.className = "dm-notes-pad__corner";
    sheet.append(peel, editor, corner);
    stack.append(under2, under1, sheet);
    const footer = document.createElement("div");
    footer.className = "dm-notes-pad__footer";
    const swatches = document.createElement("div");
    swatches.className = "dm-notes-pad__swatches";
    swatches.setAttribute("role", "radiogroup");
    swatches.setAttribute("aria-label", __("Paper color", "desktop-mode"));
    const swatchButtons = /* @__PURE__ */ new Map();
    for (const slug of NOTE_COLORS) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "dm-notes-pad__swatch";
      dot.dataset.noteColor = slug;
      dot.setAttribute("role", "radio");
      dot.setAttribute("aria-label", slug);
      dot.addEventListener("click", () => setColor(slug));
      swatchButtons.set(slug, dot);
      swatches.appendChild(dot);
    }
    const publicToggle = document.createElement("wpd-checkbox-label");
    publicToggle.className = "dm-notes-pad__public";
    publicToggle.setAttribute(
      "label",
      __("Public — visible to other desktop users", "desktop-mode")
    );
    if (isPublic) {
      publicToggle.setAttribute("checked", "");
    }
    publicToggle.addEventListener("wpd-checkbox-change", (ev) => {
      isPublic = ev.detail.checked;
      ctx.storage.set("public", isPublic);
    });
    const pinButton = document.createElement("button");
    pinButton.type = "button";
    pinButton.className = "dm-notes-pad__pin-btn";
    pinButton.textContent = __("Pin to desktop", "desktop-mode");
    pinButton.title = __(
      "Pin the note without dragging (Ctrl+Enter)",
      "desktop-mode"
    );
    footer.append(swatches, publicToggle, pinButton);
    root.append(stack, footer);
    container.appendChild(root);
    function refreshColors() {
      const next1 = nextNoteColor(color);
      const next2 = nextNoteColor(next1);
      sheet.dataset.noteColor = color;
      stack.dataset.noteColor = color;
      under1.dataset.noteColor = next1;
      under2.dataset.noteColor = next2;
      corner.dataset.noteColor = next1;
      corner.setAttribute(
        "aria-label",
        `${__("Next paper color", "desktop-mode")}: ${next1}`
      );
      for (const [slug, dot] of swatchButtons) {
        dot.setAttribute(
          "aria-checked",
          slug === color ? "true" : "false"
        );
        dot.classList.toggle("is-selected", slug === color);
      }
    }
    function setColor(slug) {
      color = normalizeNoteColor(slug);
      ctx.storage.set("color", color);
      refreshColors();
    }
    const onCornerClick = () => setColor(nextNoteColor(color));
    corner.addEventListener("click", onCornerClick);
    refreshColors();
    const onInput = (ev) => {
      text = ev.detail.value;
    };
    editor.addEventListener("wpd-input-change", onInput);
    const onEditorKeydown = (ev) => {
      const kev = ev;
      if (kev.key === "Enter" && (kev.ctrlKey || kev.metaKey)) {
        kev.preventDefault();
        void pinWithoutDrag();
      }
      kev.stopPropagation();
    };
    ["keydown", "keypress", "keyup"].forEach(
      (name) => editor.addEventListener(name, (ev) => {
        if (name === "keydown") {
          onEditorKeydown(ev);
        } else {
          ev.stopPropagation();
        }
      })
    );
    const clearDraft = () => {
      text = "";
      editor.setAttribute("value", "");
    };
    const shakeSheet = () => {
      if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      sheet.animate?.(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(4px)" },
          { transform: "translateX(0)" }
        ],
        { duration: 200, easing: "ease-out" }
      );
    };
    const buildDraftGhost = () => {
      const width = 208;
      const ghostRoot = document.createElement("div");
      ghostRoot.className = "desktop-mode-pinned-note-ghost";
      ghostRoot.dataset.noteColor = color;
      ghostRoot.style.width = `${width}px`;
      const swing = document.createElement("div");
      swing.className = "desktop-mode-pinned-note-ghost__swing";
      swing.dataset.noteColor = color;
      const tipX = width / 2;
      const tipY = 10;
      swing.style.transformOrigin = `${tipX}px ${tipY}px`;
      const pin = document.createElement("span");
      pin.className = "desktop-mode-pinned-note__pin";
      pin.style.setProperty("--dm-pin-dx", "0px");
      pin.style.setProperty("--dm-pin-rot", "0deg");
      pin.appendChild(buildPinImage(ctx.pluginUrl));
      const paper = document.createElement("div");
      paper.className = "desktop-mode-pinned-note__paper desktop-mode-pinned-note-ghost__paper";
      const body = document.createElement("div");
      body.className = "desktop-mode-pinned-note__body";
      body.textContent = text;
      paper.appendChild(body);
      swing.append(pin, paper);
      ghostRoot.appendChild(swing);
      return { root: ghostRoot, tipX, tipY };
    };
    const onSheetPointerDown = (ev) => {
      if (destroyed || !canCreate) {
        return;
      }
      const target = ev.target;
      if (target?.closest("wpd-textarea, .dm-notes-pad__corner")) {
        return;
      }
      if (!text.trim()) {
        shakeSheet();
        return;
      }
      const dragManager = getDragManager();
      if (!dragManager) {
        return;
      }
      ev.preventDefault();
      sheet.ownerDocument.defaultView?.getSelection()?.removeAllRanges();
      const ghost = buildDraftGhost();
      const data = {
        text,
        color,
        isPublic
      };
      dragManager.start({
        payload: {
          type: NOTE_DRAFT_PAYLOAD_TYPE,
          source: sheet,
          data,
          ghost: {
            element: ghost.root,
            offsetX: ghost.tipX,
            offsetY: ghost.tipY,
            hint: {
              neutral: __("Drop on the desktop to pin", "desktop-mode"),
              accept: __("Pin here", "desktop-mode"),
              reject: __("Can’t pin here", "desktop-mode")
            }
          }
        },
        origin: ev,
        onClickOnly: () => editor.focusInput?.(),
        onCommit: () => {
          clearDraft();
          playTearOffPromotion();
        }
        // onCancel: the sheet reappears untouched (the manager
        // removes its source-dragging class) — the draft survives.
      });
    };
    sheet.addEventListener("pointerdown", onSheetPointerDown);
    const playTearOffPromotion = () => {
      if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      sheet.animate?.(
        [
          {
            transform: "translate(3px, 4px) rotate(1.1deg)",
            opacity: 0.9
          },
          {
            transform: "translate(-1px, -2px) rotate(-0.4deg)",
            offset: 0.7
          },
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 }
        ],
        { duration: 260, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
      );
    };
    async function pinWithoutDrag() {
      if (destroyed || !canCreate) {
        return;
      }
      if (!text.trim()) {
        shakeSheet();
        editor.focusInput?.();
        return;
      }
      pinButton.disabled = true;
      try {
        const slot = Math.floor(Date.now() / 1e3) % 5;
        const note = await createNote({
          text,
          color,
          x: 0.55 + slot * 0.04,
          y: 0.12 + slot * 0.05,
          public: isPublic,
          seed: hashNoteSeed(text)
        });
        if (destroyed) {
          return;
        }
        clearDraft();
        playTearOffPromotion();
        document.dispatchEvent(
          new CustomEvent(NOTE_CREATED_EVENT, { detail: { note } })
        );
      } catch (err) {
        console.error("[desktop-mode] note pad: create failed:", err);
        shakeSheet();
        const toast = window.wp?.desktop?.showToast;
        toast?.({
          message: __(
            "Could not pin the note. Please try again.",
            "desktop-mode"
          ),
          duration: 5e3
        });
      } finally {
        pinButton.disabled = false;
      }
    }
    const onPinButton = () => {
      void pinWithoutDrag();
    };
    pinButton.addEventListener("click", onPinButton);
    if (!canCreate) {
      root.classList.add("dm-notes-pad--unavailable");
      editor.setAttribute("disabled", "");
      pinButton.disabled = true;
    }
    return () => {
      destroyed = true;
      sheet.removeEventListener("pointerdown", onSheetPointerDown);
      corner.removeEventListener("click", onCornerClick);
      pinButton.removeEventListener("click", onPinButton);
    };
  };
  const w = window;
  w.desktopModeWidgets = w.desktopModeWidgets ?? {};
  w.desktopModeWidgets[WIDGET_ID] = mount;
})();
