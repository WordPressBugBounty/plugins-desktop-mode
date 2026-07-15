var desktopModeRecycleBin = function(exports) {
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
  function disposeChildState(state2) {
    if (state2.shape === "text") {
      state2.node.remove();
      return;
    }
    if (state2.shape === "template") {
      for (const node of state2.nodes) {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
      return;
    }
    if (state2.shape === "node") {
      if (state2.node.parentNode) {
        state2.node.parentNode.removeChild(state2.node);
      }
      return;
    }
    for (const entry of state2.entries) {
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
  const styles$1 = css`:host{display:block;--wpd-table-bg:var( --wpd-surface,#fff );--wpd-table-border:var( --wpd-border,rgba( 0,0,0,0.08 ) );--wpd-table-column-border:var( --wpd-border-strong,rgba( 0,0,0,0.14 ) );--wpd-table-header-bg:var( --wpd-surface-elevated,#f6f7f7 );--wpd-table-row-hover:rgba( 0,0,0,0.04 );--wpd-table-stripe:rgba( 0,0,0,0.03 );--wpd-table-cell-padding:8px 12px;--wpd-table-font-size:13px;--wpd-table-max-height:none;font-size:var( --wpd-table-font-size );color:inherit}:host( [ hidden ] ){display:none}.scroll{position:relative;overflow:auto;max-height:var( --wpd-table-max-height );border:1px solid var( --wpd-table-border );border-radius:4px;background:var( --wpd-table-bg )}table{width:100%;border-collapse:separate;border-spacing:0;background:var( --wpd-table-bg )}thead th{text-align:start;font-weight:600;background-color:var( --wpd-table-header-bg );padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );white-space:nowrap}tbody td{padding:var( --wpd-table-cell-padding );border-bottom:1px solid var( --wpd-table-border );background-color:var( --wpd-table-bg );vertical-align:middle}tbody tr:last-child td{border-bottom:0}:host( [ striped ] ) tbody tr:nth-child( odd ) td{background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ hover ] ) tbody tr:hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}:host( [ hover ] [ striped ] ) tbody tr:nth-child( odd ):hover td{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) ),linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) )}:host( [ compact ] ){--wpd-table-cell-padding:4px 8px;--wpd-table-font-size:12px}:host( [ bordered ] ) thead th,:host( [ bordered ] ) tbody td{border-inline-end:1px solid var( --wpd-table-column-border )}:host( [ bordered ] ) thead th:last-child,:host( [ bordered ] ) tbody td:last-child{border-inline-end:0}th.is-sticky,td.is-sticky{position:sticky;z-index:10}tbody td.is-sticky{background-color:var( --wpd-table-bg )}thead th.is-sticky{background-color:var( --wpd-table-header-bg );z-index:30}:host( [ sticky-header ] ) thead th{position:sticky;top:0;z-index:20}:host( [ sticky-header ] ) thead tr.filter-row th{top:var( --wpd-table-header-height,33px );z-index:20}:host( [ sticky-header ] ) thead th.is-sticky{z-index:40}:host( [ sticky-header ] ) thead tr.filter-row th.is-sticky{z-index:40}th.is-sticky-edge,td.is-sticky-edge{border-inline-end:var( --wpd-table-sticky-edge,2px solid var( --wpd-table-border ) )}.align-center{text-align:center}.align-end{text-align:end}.filter-row th{padding:4px 8px;background-color:var( --wpd-table-header-bg );border-bottom:1px solid var( --wpd-table-border );font-weight:400}.filter-input,.filter-select{width:100%;min-width:60px;box-sizing:border-box;padding:4px 6px;font:inherit;color:inherit;background-color:var( --wpd-table-bg );border:1px solid var( --wpd-table-border );border-radius:3px}.filter-input:focus,.filter-select:focus{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-1px}.expander{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:3px;font-size:11px;line-height:1}.expander:hover{background:rgba( 0,0,0,0.06 )}td.col-expander,th.col-expander{width:36px;min-width:36px;padding-left:0;padding-right:0;text-align:center}tr.subtable td{padding:0;background-color:var( --wpd-table-bg );background-image:linear-gradient( var( --wpd-table-stripe ),var( --wpd-table-stripe ) );border-bottom:1px solid var( --wpd-table-border )}tr.subtable .subtable-inner{padding:8px 12px 8px 32px}tr.empty td{padding:24px;text-align:center;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );font-style:italic}thead th.is-sortable{cursor:pointer;user-select:none}thead th.is-sortable:hover{background-image:linear-gradient( var( --wpd-table-row-hover ),var( --wpd-table-row-hover ) )}thead th.is-sortable:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:-2px}.sort-indicator{font-size:10px;color:var( --wpd-text-muted,rgba( 0,0,0,0.55 ) );margin-inline-start:2px}thead th.sort-asc .sort-indicator,thead th.sort-desc .sort-indicator{color:var( --wp-admin-theme-color,#2271b1 )}td.col-select,th.col-select{width:40px;min-width:40px;padding-left:0;padding-right:0;text-align:center}.select-all-checkbox,.select-row-checkbox{cursor:pointer;margin:0}tbody tr.is-selected td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 10%,var( --wpd-table-bg ) );background-image:none}tbody tr.is-selected:hover td{background-color:color-mix( in srgb,var( --wp-admin-theme-color,#2271b1 ) 16%,var( --wpd-table-bg ) )}tbody tr.skeleton td{padding:var( --wpd-table-cell-padding )}.skeleton-bar{display:block;height:12px;border-radius:3px;background:linear-gradient( 90deg,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 0%,var( --wpd-table-skeleton-highlight,rgba( 0,0,0,0.14 ) ) 50%,var( --wpd-table-skeleton-color,rgba( 0,0,0,0.06 ) ) 100% );background-size:200% 100%;animation:wpd-table-skeleton-pulse 1.4s ease-in-out infinite}@keyframes wpd-table-skeleton-pulse{0%{background-position:200% 50%}100%{background-position:-200% 50%}}@media ( prefers-reduced-motion:reduce ){.skeleton-bar{animation:none}}`;
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
  _WpdTable.styles = [styles$1];
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
  const styles = css`:host{display:inline;color:inherit;font:inherit}`;
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
  _WpdRelativeTime.styles = [styles];
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
  const LOG_PREFIX = "[desktop-mode-bin badge]";
  function log(...args) {
    try {
      if (window.localStorage?.getItem("desktopModeBinDebug")) {
        console.info(LOG_PREFIX, ...args);
      }
    } catch {
    }
  }
  const TARGET_ID = "desktop-mode-recycle-bin";
  function getDesktopApi() {
    return window.wp?.desktop;
  }
  const store = createSharedStore(
    "desktop-mode/recycle-bin/badge",
    () => ({
      current: 0,
      seenTs: 0,
      started: false,
      countUrl: ""
    })
  );
  function setRecycleBinBadge(next) {
    const safe = Math.max(0, Math.floor(next));
    const prev = store.state.current;
    store.state.current = safe;
    log("setRecycleBinBadge", { prev, next: safe });
    paintBadge(safe);
  }
  function paintBadge(count) {
    const desktop = getDesktopApi();
    const active = isBinWindowActive();
    const visible = active ? 0 : count;
    log("paintBadge", { count, visible, active });
    desktop?.dock?.setBadge?.(TARGET_ID, visible);
    desktop?.taskbar?.setBadge?.(TARGET_ID, visible);
    desktop?.icons?.setBadge?.(TARGET_ID, visible);
  }
  function isBinWindowActive() {
    const mgr = getDesktopApi()?.windowManager;
    if (mgr?.isActiveByBaseId) {
      return mgr.isActiveByBaseId(TARGET_ID);
    }
    return !!mgr?.isActive?.(TARGET_ID);
  }
  const DEFAULT_MAX_ITERATIONS = 1e3;
  async function runEmptyLoop(options) {
    const { emptyBin: emptyBin2, onProgress, maxIterations = DEFAULT_MAX_ITERATIONS } = options;
    let purged = 0;
    let skipped = 0;
    let initialTotal = 0;
    let remaining = 0;
    let stoppedBecause = "iteration-cap";
    for (let i = 0; i < maxIterations; i++) {
      const result = await emptyBin2();
      purged += result.purged;
      skipped += result.skipped;
      remaining = result.remaining;
      if (i === 0) {
        initialTotal = purged + result.remaining;
      }
      onProgress?.({ purged, skipped, initialTotal });
      if (result.remaining === 0) {
        stoppedBecause = "empty";
        break;
      }
      if (result.purged === 0 && result.skipped > 0) {
        stoppedBecause = "no-progress";
        break;
      }
    }
    return { purged, skipped, initialTotal, remaining, stoppedBecause };
  }
  const EVENT_NAME = "desktop-mode-recycle-bin-changed";
  const HEARTBEAT_FIELD = "desktop_mode_recycle_bin_seen_ts";
  const POSTMESSAGE_TYPE = "desktop-mode-recycle-bin-changed";
  const state = {
    started: false,
    seenTs: 0,
    postMessageHandler: null,
    heartbeatSendHandler: null,
    heartbeatTickHandler: null
  };
  function dispatchChanged(source, ts) {
    const detail = {
      kind: "external",
      ok: 0,
      errors: [],
      source,
      ts
    };
    document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    const hooks = window.wp?.hooks;
    if (hooks && typeof hooks.doAction === "function") {
      hooks.doAction("desktop_mode.recycleBin.changed", detail);
    }
  }
  function start() {
    if (state.started) {
      return;
    }
    state.started = true;
    state.seenTs = Date.now();
    const expectedOrigin = window.location.origin;
    state.postMessageHandler = (e) => {
      if (e.origin !== expectedOrigin) {
        return;
      }
      const data = e.data;
      if (!data || data.type !== POSTMESSAGE_TYPE) {
        return;
      }
      const ts = typeof data.ts === "number" ? data.ts : Date.now();
      if (ts <= state.seenTs) {
        return;
      }
      state.seenTs = ts;
      dispatchChanged("chromeless", ts);
    };
    window.addEventListener("message", state.postMessageHandler);
    const $ = window.jQuery;
    if (!$) {
      return;
    }
    state.heartbeatSendHandler = (...args) => {
      const data = args[1];
      if (data) {
        data[HEARTBEAT_FIELD] = state.seenTs;
      }
    };
    $(document).on("heartbeat-send", state.heartbeatSendHandler);
    state.heartbeatTickHandler = (...args) => {
      const response = args[1];
      const block = response?.desktop_mode_recycle_bin;
      if (!block) {
        return;
      }
      const ts = typeof block.ts === "number" ? block.ts : 0;
      if (ts > state.seenTs) {
        state.seenTs = ts;
        if (block.changed) {
          dispatchChanged("heartbeat", ts);
        }
      }
    };
    $(document).on("heartbeat-tick", state.heartbeatTickHandler);
  }
  function stop() {
    if (!state.started) {
      return;
    }
    state.started = false;
    if (state.postMessageHandler) {
      window.removeEventListener("message", state.postMessageHandler);
      state.postMessageHandler = null;
    }
    const $ = window.jQuery;
    if ($) {
      if (state.heartbeatSendHandler) {
        $(document).off("heartbeat-send", state.heartbeatSendHandler);
      }
      if (state.heartbeatTickHandler) {
        $(document).off("heartbeat-tick", state.heartbeatTickHandler);
      }
    }
    state.heartbeatSendHandler = null;
    state.heartbeatTickHandler = null;
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
  function config() {
    const cfg = window.desktopModeRecycleBinConfig;
    if (!cfg) {
      throw new Error(
        "desktopModeRecycleBinConfig is missing — config blob did not reach the page. This typically means the recycle-bin script handle was lazy-loaded by desktop-mode without its `wp_localize_script` data being included in the payload. See docs/examples/window-with-config.md."
      );
    }
    return cfg;
  }
  async function request(url, init) {
    const cfg = config();
    const response = await trackedFetch(
      url,
      {
        ...init,
        credentials: "same-origin",
        headers: {
          "X-WP-Nonce": cfg.restNonce,
          Accept: "application/json",
          ...init.body ? { "Content-Type": "application/json" } : {},
          ...init.headers ?? {}
        }
      },
      { source: "desktop-mode/recycle-bin" }
    );
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const json = await response.json();
        if (json && typeof json.message === "string") {
          message = json.message;
        }
      } catch {
      }
      throw new Error(message);
    }
    return await response.json();
  }
  function fetchList(params = {}) {
    const url = new URL(config().listUrl);
    if (params.page) {
      url.searchParams.set("page", String(params.page));
    }
    if (params.perPage) {
      url.searchParams.set("per_page", String(params.perPage));
    }
    if (params.type) {
      url.searchParams.set("type", params.type);
    }
    if (params.search) {
      url.searchParams.set("search", params.search);
    }
    return request(url.toString(), { method: "GET" });
  }
  function restoreItems(items) {
    return request(config().restoreUrl, {
      method: "POST",
      body: JSON.stringify({ items })
    });
  }
  function purgeItems(items) {
    return request(config().purgeUrl, {
      method: "POST",
      body: JSON.stringify({ items })
    });
  }
  function emptyBin() {
    return request(config().emptyUrl, {
      method: "POST",
      body: JSON.stringify({})
    });
  }
  function wpdConfirmGlobal(options) {
    const fn = window.wp?.desktop?.confirm;
    if (typeof fn !== "function") {
      return Promise.reject(
        new Error(
          "[desktop-mode] wp.desktop.confirm is missing — the main desktop bundle must load before the recycle-bin script."
        )
      );
    }
    return fn(options);
  }
  function mapRecycleTypeToFileType(recycleType) {
    if (recycleType === "attachment") {
      return "attachment";
    }
    if (recycleType === "comment") {
      return "comment";
    }
    return "post";
  }
  const TYPE_BADGE_COLORS = {
    post: { bg: "#dbe9fe", fg: "#1d4ed8" },
    page: { bg: "#e0f2fe", fg: "#075985" },
    attachment: { bg: "#fef3c7", fg: "#92400e" },
    comment: { bg: "#dcfce7", fg: "#166534" },
    _default: { bg: "#e5e7eb", fg: "#374151" }
  };
  function humanizeType(slug) {
    if (!slug) {
      return "";
    }
    return slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function makeTypeBadge(row) {
    const label = row.type_label && row.type_label.length > 0 ? row.type_label : humanizeType(row.type);
    const colors = TYPE_BADGE_COLORS[row.type] ?? TYPE_BADGE_COLORS._default;
    const badge = document.createElement("span");
    badge.setAttribute("data-desktop-mode-recycle-bin-type-badge", row.type);
    badge.textContent = label;
    badge.style.cssText = [
      "display: inline-flex",
      "align-items: center",
      "flex-shrink: 0",
      "padding: 2px 8px",
      "border-radius: 999px",
      "font-size: 11px",
      "font-weight: 600",
      "line-height: 1.4",
      "letter-spacing: 0.2px",
      "text-transform: uppercase",
      "white-space: nowrap",
      "background: " + colors.bg,
      "color: " + colors.fg
    ].join(";");
    return badge;
  }
  const ROOT = "[data-desktop-mode-recycle-bin-root]";
  const FILTER = "[data-desktop-mode-recycle-bin-filter]";
  const SEARCH = "[data-desktop-mode-recycle-bin-search]";
  const REFRESH = "[data-desktop-mode-recycle-bin-refresh]";
  const TABLE = "[data-desktop-mode-recycle-bin-table]";
  const BULK = "[data-desktop-mode-recycle-bin-bulk]";
  const COUNT = "[data-desktop-mode-recycle-bin-count]";
  const RESTORE_SEL = "[data-desktop-mode-recycle-bin-restore-selected]";
  const PIN_TO_DESKTOP = "[data-desktop-mode-recycle-bin-pin-to-desktop]";
  const PURGE_SEL = "[data-desktop-mode-recycle-bin-purge-selected]";
  const EMPTY_BTN = "[data-desktop-mode-recycle-bin-empty]";
  let currentRowActionRestore = () => {
  };
  let currentRowActionPurge = () => {
  };
  const rowActionRestore = (ref) => currentRowActionRestore(ref);
  const rowActionPurge = (ref) => currentRowActionPurge(ref);
  let cachedItems = null;
  function itemsFingerprint(items) {
    if (items.length === 0) {
      return "";
    }
    const parts = items.map((i) => `${i.type}:${i.id}:${i.deleted_at}`).sort();
    return parts.join("|");
  }
  function buildColumns() {
    const cols = [
      {
        key: "title",
        label: __("Title"),
        sortable: true,
        filter: "text",
        render: (_v, row) => {
          const wrap = document.createElement("span");
          wrap.style.cssText = "display:flex;align-items:center;gap:10px;min-width:0;";
          const showsThumb = row.preview && row.type === "attachment" && row.mime.startsWith("image/");
          if (showsThumb) {
            const img = document.createElement("img");
            img.src = row.preview;
            img.alt = "";
            img.loading = "lazy";
            img.style.cssText = "width:36px;height:36px;border-radius:4px;object-fit:cover;display:block;flex-shrink:0;";
            wrap.appendChild(img);
          }
          const stack = document.createElement("span");
          stack.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;";
          const titleRow = document.createElement("span");
          titleRow.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;";
          titleRow.appendChild(makeTypeBadge(row));
          const title = document.createElement("span");
          title.style.cssText = "font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;";
          title.textContent = row.title;
          title.title = row.title;
          titleRow.appendChild(title);
          stack.appendChild(titleRow);
          if (row.subtitle) {
            const sub = document.createElement("span");
            sub.style.cssText = "font-size:12px;color:#50575e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;";
            sub.textContent = row.subtitle;
            sub.title = row.subtitle;
            stack.appendChild(sub);
          }
          wrap.appendChild(stack);
          return wrap;
        }
      },
      // No explicit Type column — the inline type badge in the
      // title cell and the toolbar's type filter tabs already
      // convey the entity kind, and an extra column inflates the
      // row visually for no signal gain.
      {
        key: "deleted_at",
        label: __("Deleted"),
        sortable: true,
        width: "180px",
        sortValue: (row) => Date.parse(row.deleted_at + "Z") || 0,
        render: (_v, row) => {
          const el = document.createElement("wpd-relative-time");
          el.setAttribute("datetime", row.deleted_at);
          return el;
        }
      },
      {
        key: "deleted_by",
        label: __("By"),
        sortable: true,
        filter: "text",
        width: "160px",
        render: (_v, row) => row.deleted_by || "—"
      },
      {
        key: "__actions",
        label: "",
        width: "96px",
        align: "end",
        render: (_v, row) => {
          const wrap = document.createElement("span");
          wrap.style.cssText = "display:inline-flex;gap:4px;justify-content:flex-end;align-items:center;flex-wrap:nowrap;white-space:nowrap;line-height:1;";
          if (row.can_restore) {
            wrap.appendChild(makeRowButton({
              label: __("Restore"),
              icon: "restore",
              onClick: () => rowActionRestore({ id: row.id, type: row.type })
            }));
          }
          if (row.can_purge) {
            wrap.appendChild(makeRowButton({
              label: __("Delete forever"),
              icon: "trash",
              variant: "danger",
              onClick: () => rowActionPurge({ id: row.id, type: row.type })
            }));
          }
          return wrap;
        }
      }
    ];
    const hooks = window.wp?.hooks;
    if (hooks && typeof hooks.applyFilters === "function") {
      return hooks.applyFilters(
        "desktop_mode.recycleBin.columns",
        cols
      );
    }
    return cols;
  }
  const ICON_SVG = {
    restore: '<path d="M12 5V2L7 6l5 4V7c2.76 0 5 2.24 5 5 0 .83-.21 1.61-.57 2.3l1.46 1.46A6.96 6.96 0 0 0 19 12c0-3.87-3.13-7-7-7zm0 12c-2.76 0-5-2.24-5-5 0-.83.21-1.61.57-2.3L6.11 8.24A6.96 6.96 0 0 0 5 12c0 3.87 3.13 7 7 7v3l5-4-5-4v3z" fill="currentColor"/>',
    trash: '<path d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z" fill="currentColor"/>'
  };
  function makeRowButton(opts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-noclick", "");
    btn.setAttribute("aria-label", opts.label);
    btn.title = opts.label;
    const isDanger = opts.variant === "danger";
    const restColor = isDanger ? "#d63638" : "#50575e";
    const restBorder = isDanger ? "#d63638" : "#c3c4c7";
    const applyRest = () => {
      btn.style.background = "#fff";
      btn.style.color = restColor;
      btn.style.borderColor = restBorder;
    };
    const applyHover = () => {
      if (isDanger) {
        btn.style.background = "#d63638";
        btn.style.color = "#fff";
        btn.style.borderColor = "#d63638";
      } else {
        btn.style.background = "#f0f0f1";
        btn.style.color = "#1d2327";
        btn.style.borderColor = "#8c8f94";
      }
    };
    btn.style.cssText = [
      "display: inline-flex",
      "align-items: center",
      "justify-content: center",
      "flex: 0 0 30px",
      "width: 30px",
      "height: 30px",
      "padding: 0",
      "margin: 0",
      "border: 1px solid " + restBorder,
      "border-radius: 6px",
      "background: #fff",
      "color: " + restColor,
      "cursor: pointer",
      "box-sizing: border-box",
      "line-height: 1",
      "font: inherit",
      "transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease"
    ].join(";");
    btn.addEventListener("mouseenter", applyHover);
    btn.addEventListener("mouseleave", applyRest);
    btn.addEventListener("focus", applyHover);
    btn.addEventListener("blur", applyRest);
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.style.display = "block";
    svg.innerHTML = ICON_SVG[opts.icon] ?? "";
    btn.appendChild(svg);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onClick();
    });
    return btn;
  }
  function renderRecycleBin(body) {
    const root = body.querySelector(ROOT);
    const table = body.querySelector(TABLE);
    if (!root || !table) {
      return;
    }
    const state2 = {
      filter: "",
      search: "",
      searchDebounce: null
    };
    currentRowActionRestore = (ref) => void handleRestore([ref]);
    currentRowActionPurge = (ref) => void handlePurge([ref]);
    table.columns = buildColumns();
    table.getRowId = (row) => `${row.type}:${row.id}`;
    let currentFingerprint = "";
    if (cachedItems) {
      table.data = cachedItems;
      currentFingerprint = itemsFingerprint(cachedItems);
      table.removeAttribute("loading");
    }
    let refreshSeq = 0;
    const refresh = async () => {
      const showSkeleton = !cachedItems;
      const mySeq = ++refreshSeq;
      if (showSkeleton) {
        table.toggleAttribute("loading", true);
      }
      try {
        const { items, total } = await fetchList({
          type: state2.filter,
          search: state2.search,
          perPage: 200
        });
        if (mySeq !== refreshSeq) {
          return;
        }
        const next = itemsFingerprint(items);
        if (next !== currentFingerprint) {
          table.data = items;
          currentFingerprint = next;
          cachedItems = items;
          const visible = new Set(
            (table.visibleRows ?? []).map(
              (row) => `${row.type}:${row.id}`
            )
          );
          const kept = Array.from(table.selection ?? [], String).filter((key) => visible.has(key));
          if (kept.length !== (table.selection?.size ?? 0)) {
            table.selection = kept;
          }
        } else {
          cachedItems = items;
        }
        setRecycleBinBadge(total);
      } catch (err) {
        if (mySeq !== refreshSeq) {
          return;
        }
        console.error("[recycle-bin] list failed", err);
        if (showSkeleton) {
          table.data = [];
          currentFingerprint = "";
        }
      } finally {
        if (mySeq === refreshSeq) {
          if (showSkeleton) {
            table.toggleAttribute("loading", false);
          }
          refreshBulkBar();
        }
      }
    };
    const bulk = root.querySelector(BULK);
    const countEl = root.querySelector(COUNT);
    const refreshBulkBar = () => {
      if (!bulk || !countEl) {
        return;
      }
      const selected = Array.from(table.selection ?? []);
      if (selected.length === 0) {
        bulk.hidden = true;
        return;
      }
      bulk.hidden = false;
      countEl.textContent = sprintf(
        /* translators: %d: selected row count. */
        __("%d selected"),
        selected.length
      );
    };
    const collectSelectedItems = () => {
      const sel = new Set(Array.from(table.selection ?? [], String));
      const out = [];
      for (const row of table.visibleRows ?? []) {
        if (sel.has(`${row.type}:${row.id}`)) {
          out.push({ id: row.id, type: row.type });
        }
      }
      return out;
    };
    const handleRestore = async (refs) => {
      if (refs.length === 0) {
        return;
      }
      const types = Array.from(new Set(refs.map((r) => r.type)));
      try {
        const result = await restoreItems(refs);
        emitDoneEvent("restore", result.ok, result.errors, types, result.ok);
      } catch (err) {
        console.error("[recycle-bin] restore failed", err);
      }
      table.clearSelection();
      await refresh();
    };
    const handlePinToDesktop = async (refs) => {
      if (refs.length === 0) {
        return;
      }
      const types = Array.from(new Set(refs.map((r) => r.type)));
      const okIds = [];
      const allErrors = [];
      const filesApi = window.wp?.desktop?.files?.rest;
      let placed = 0;
      for (const ref of refs) {
        let restored;
        try {
          restored = await restoreItems([ref]);
        } catch (err) {
          console.error("[recycle-bin] pin-to-desktop restore failed", err);
          continue;
        }
        allErrors.push(...restored.errors);
        if (!restored.ok.includes(ref.id)) {
          continue;
        }
        okIds.push(ref.id);
        const desktopType = mapRecycleTypeToFileType(ref.type);
        if (!filesApi || !desktopType) {
          continue;
        }
        try {
          await filesApi.createPlacement({
            type: desktopType,
            ref: String(ref.id),
            x: 16 + placed % 5 * 96,
            y: 16 + Math.floor(placed / 5) * 110
          });
        } catch (err) {
          console.error("[recycle-bin] pin-to-desktop placement failed", err);
        }
        placed += 1;
      }
      emitDoneEvent("restore", okIds, allErrors, types, okIds);
      table.clearSelection();
      await refresh();
    };
    const handlePurge = async (refs) => {
      if (refs.length === 0) {
        return;
      }
      const ok = await wpdConfirmGlobal({
        title: __("Delete forever?"),
        message: sprintf(
          /* translators: %d: row count. */
          __("Permanently delete %d item(s)? This cannot be undone."),
          refs.length
        ),
        confirmLabel: __("Delete forever"),
        danger: true
      });
      if (!ok) {
        return;
      }
      const types = Array.from(new Set(refs.map((r) => r.type)));
      try {
        const result = await purgeItems(refs);
        emitDoneEvent("purge", result.ok, result.errors, types, result.ok);
      } catch (err) {
        console.error("[recycle-bin] purge failed", err);
      }
      table.clearSelection();
      await refresh();
    };
    const emptyButton = root.querySelector(EMPTY_BTN);
    let emptyButtonLabelEl = null;
    let emptyButtonOriginalLabel = "";
    if (emptyButton) {
      const trailingText = Array.from(emptyButton.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""
      );
      emptyButtonOriginalLabel = (trailingText?.textContent ?? "").trim();
      emptyButtonLabelEl = document.createElement("span");
      emptyButtonLabelEl.setAttribute(
        "data-desktop-mode-recycle-bin-empty-label",
        ""
      );
      emptyButtonLabelEl.textContent = emptyButtonOriginalLabel;
      if (trailingText) {
        trailingText.replaceWith(emptyButtonLabelEl);
      } else {
        emptyButton.appendChild(emptyButtonLabelEl);
      }
    }
    const setEmptyButtonState = (mode, purged = 0, total = 0) => {
      if (!emptyButton || !emptyButtonLabelEl) {
        return;
      }
      if (mode === "idle") {
        emptyButton.removeAttribute("disabled");
        emptyButton.removeAttribute("aria-busy");
        emptyButtonLabelEl.textContent = emptyButtonOriginalLabel;
        return;
      }
      emptyButton.setAttribute("disabled", "");
      emptyButton.setAttribute("aria-busy", "true");
      emptyButtonLabelEl.textContent = mode === "starting" || total === 0 ? __("Emptying…") : sprintf(
        /* translators: 1: items purged so far, 2: items in bin when emptying began. */
        __("Emptying… %1$d of %2$d"),
        purged,
        total
      );
    };
    const handleEmpty = async () => {
      const ok = await wpdConfirmGlobal({
        title: __("Empty bin?"),
        message: __(
          "Permanently delete ALL items in the recycle bin? This includes every type and any items hidden by the current filter or search. This cannot be undone."
        ),
        confirmLabel: __("Empty bin"),
        danger: true
      });
      if (!ok) {
        return;
      }
      const allTypes = Array.from(
        new Set((table.data ?? []).map((r) => r.type))
      );
      setEmptyButtonState("starting");
      try {
        const loop = await runEmptyLoop({
          emptyBin,
          onProgress: ({ purged, initialTotal }) => setEmptyButtonState("progress", purged, initialTotal)
        });
        emitDoneEvent(
          "empty",
          new Array(loop.purged).fill(0),
          loop.skipped > 0 ? [{
            id: 0,
            code: "desktop_mode_recycle_bin_skipped",
            message: sprintf(
              /* translators: %d: skipped count. */
              __("%d item(s) skipped (insufficient permissions)."),
              loop.skipped
            )
          }] : [],
          allTypes,
          []
        );
        if (loop.stoppedBecause === "empty") {
          setRecycleBinBadge(0);
        }
      } catch (err) {
        console.error("[recycle-bin] empty failed", err);
      } finally {
        setEmptyButtonState("idle");
      }
      await refresh();
    };
    root.querySelector(FILTER)?.addEventListener("wpd-pick", (e) => {
      const detail = e.detail;
      state2.filter = detail?.value ?? "";
      table.clearSelection();
      void refresh();
    });
    const search = root.querySelector(SEARCH);
    search?.addEventListener("wpd-input-change", (e) => {
      const value = e.detail?.value ?? "";
      state2.search = value;
      if (state2.searchDebounce !== null) {
        window.clearTimeout(state2.searchDebounce);
      }
      state2.searchDebounce = window.setTimeout(() => {
        table.clearSelection();
        void refresh();
      }, 250);
    });
    body.addEventListener("click", (e) => {
      const target = e.target;
      if (!target) {
        return;
      }
      if (target.closest(REFRESH)) {
        void refresh();
        return;
      }
      if (target.closest(RESTORE_SEL)) {
        void handleRestore(collectSelectedItems());
        return;
      }
      if (target.closest(PIN_TO_DESKTOP)) {
        void handlePinToDesktop(collectSelectedItems());
        return;
      }
      if (target.closest(PURGE_SEL)) {
        void handlePurge(collectSelectedItems());
        return;
      }
      if (target.closest(EMPTY_BTN)) {
        void handleEmpty();
      }
    });
    table.addEventListener("wpd-table-selection-change", () => {
      refreshBulkBar();
    });
    table.addEventListener("wpd-table-filter-change", () => {
      table.clearSelection();
    });
    table.sort = { key: "deleted_at", direction: "desc" };
    start();
    let externalRefreshTimer = null;
    const onExternalChange = (e) => {
      const detail = e.detail;
      if (!detail?.source || detail.source === "local") {
        return;
      }
      if (externalRefreshTimer !== null) {
        window.clearTimeout(externalRefreshTimer);
      }
      externalRefreshTimer = window.setTimeout(() => {
        externalRefreshTimer = null;
        void refresh();
      }, 200);
    };
    document.addEventListener("desktop-mode-recycle-bin-changed", onExternalChange);
    const broadcastUnsubs = [];
    const api = window.wp?.desktop;
    if (api && typeof api.subscribe === "function") {
      const onDomainChanged = (payload) => {
        const detail = payload;
        if (detail?.source === "recycle-bin") {
          return;
        }
        if (externalRefreshTimer !== null) {
          window.clearTimeout(externalRefreshTimer);
        }
        externalRefreshTimer = window.setTimeout(() => {
          externalRefreshTimer = null;
          void refresh();
        }, 200);
      };
      broadcastUnsubs.push(
        api.subscribe("desktop-mode.post.changed", onDomainChanged),
        api.subscribe("desktop-mode.page.changed", onDomainChanged),
        api.subscribe("desktop-mode.attachment.changed", onDomainChanged),
        api.subscribe("desktop-mode.comment.changed", onDomainChanged),
        api.subscribe("desktop-mode.placement.changed", onDomainChanged),
        api.subscribe("desktop-mode.shortcut.changed", onDomainChanged),
        api.subscribe("desktop-mode.folder.changed", onDomainChanged)
      );
    }
    const onWindowClosed = (e) => {
      const detail = e.detail;
      if (detail?.windowId !== "desktop-mode-recycle-bin") {
        return;
      }
      stop();
      document.removeEventListener(
        "desktop-mode-recycle-bin-changed",
        onExternalChange
      );
      for (const unsub of broadcastUnsubs) {
        try {
          unsub();
        } catch (err) {
        }
      }
      broadcastUnsubs.length = 0;
      if (externalRefreshTimer !== null) {
        window.clearTimeout(externalRefreshTimer);
        externalRefreshTimer = null;
      }
      currentRowActionRestore = () => {
      };
      currentRowActionPurge = () => {
      };
      document.removeEventListener("desktop-mode-window-closed", onWindowClosed);
    };
    document.addEventListener("desktop-mode-window-closed", onWindowClosed);
    void refresh();
  }
  function emitDoneEvent(kind, ok, errors, affectedTypes = [], affectedIds = []) {
    const detail = { kind, ok: ok.length, errors, source: "local" };
    document.dispatchEvent(
      new CustomEvent("desktop-mode-recycle-bin-changed", { detail })
    );
    const hooks = window.wp?.hooks;
    if (hooks && typeof hooks.doAction === "function") {
      hooks.doAction("desktop_mode.recycleBin.changed", detail);
    }
    const api = window.wp?.desktop;
    if (api && typeof api.broadcast === "function" && affectedTypes.length > 0) {
      const action = kind === "restore" ? "untrashed" : "deleted";
      for (const type of affectedTypes) {
        api.broadcast(`desktop-mode.${type}.changed`, {
          source: "recycle-bin",
          action,
          ids: affectedIds
        });
      }
    }
  }
  const registry = window.desktopModeNativeWindows ?? (window.desktopModeNativeWindows = {});
  registry["desktop-mode-recycle-bin"] = (body) => {
    renderRecycleBin(body);
  };
  exports.mapRecycleTypeToFileType = mapRecycleTypeToFileType;
  exports.renderRecycleBin = renderRecycleBin;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({});
