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
    return format.replace(/%[sd]/g, () => String(args[i++] ?? ""));
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
  function addAction(hookName2, namespace, callback2, priority) {
    getWpHooks().addAction(
      hookName2,
      namespace,
      callback2,
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
  const MENU_CLASS = "desktop-mode-icon-canvas-menu";
  let activeMenu = null;
  let activeFlyout = null;
  let activeCanvas = null;
  let outsideHandler = null;
  let escHandler = null;
  function attachIconCanvasMenu(canvas, deps) {
    deps.openOnBackgroundClick !== false;
    const onContextMenu = (e) => {
      if (isInsideTile(e.target) || isInsideMenu(e.target)) {
        return;
      }
      e.preventDefault();
      toggle(e.clientX, e.clientY);
    };
    let toggleGen = 0;
    const toggle = (x, y) => {
      if (activeCanvas === canvas && activeMenu) {
        closeMenu();
        return;
      }
      const items = buildItems(deps);
      const filtered = applyFilters(
        "desktop-mode.icon-canvas.menu",
        items,
        deps.scope
      );
      const finalItems = Array.isArray(filtered) ? filtered : items;
      const myGen = ++toggleGen;
      openWithShellOverlays(
        () => myGen === toggleGen,
        () => openMenu(finalItems, { x, y }, canvas)
      );
    };
    canvas.addEventListener("contextmenu", onContextMenu);
    return {
      dispose: () => {
        canvas.removeEventListener("contextmenu", onContextMenu);
        closeMenu();
      }
    };
  }
  function isInsideTile(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return target.closest(".desktop-mode-file-tile") !== null;
  }
  function isInsideMenu(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return target.closest(`.${MENU_CLASS}`) !== null;
  }
  function buildItems(deps) {
    const sortItem = {
      id: "sort-by",
      label: __("Sort by", "desktop-mode"),
      icon: "dashicons-sort",
      sort: 10,
      children: [
        {
          id: "sort-name-asc",
          label: __("Name (A → Z)", "desktop-mode"),
          sort: 10,
          onClick: () => deps.onSort("name-asc")
        },
        {
          id: "sort-name-desc",
          label: __("Name (Z → A)", "desktop-mode"),
          sort: 20,
          onClick: () => deps.onSort("name-desc")
        },
        {
          id: "sort-date-desc",
          label: __("Newest first", "desktop-mode"),
          sort: 30,
          onClick: () => deps.onSort("date-desc")
        },
        {
          id: "sort-date-asc",
          label: __("Oldest first", "desktop-mode"),
          sort: 40,
          onClick: () => deps.onSort("date-asc")
        }
      ]
    };
    const items = [sortItem];
    if (Array.isArray(deps.extraItems)) {
      items.push(...deps.extraItems);
    }
    return items;
  }
  function sortItems(items) {
    return items.slice().sort((a, b) => {
      const sa = typeof a.sort === "number" ? a.sort : 100;
      const sb = typeof b.sort === "number" ? b.sort : 100;
      if (sa !== sb) {
        return sa - sb;
      }
      return a.label.localeCompare(b.label);
    });
  }
  function openMenu(items, pos, canvas) {
    closeMenu();
    if (items.length === 0) {
      return;
    }
    activeCanvas = canvas;
    const sorted = sortItems(items);
    const menu = document.createElement("wpd-context-menu");
    menu.setAttribute("open", "");
    menu.classList.add(MENU_CLASS);
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    const itemById = /* @__PURE__ */ new Map();
    for (const item of sorted) {
      itemById.set(item.id, item);
      const opt = appendOption(menu, item);
      if (hasChildren(item)) {
        opt.addEventListener("mouseenter", () => {
          openFlyout(item, opt);
        });
      }
    }
    menu.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      const item = itemById.get(detail.id);
      if (!item) {
        return;
      }
      if (hasChildren(item)) {
        e.stopPropagation();
        const anchor = menu.querySelector(
          `[data-menu-item-id="${item.id}"]`
        );
        if (anchor) {
          openFlyout(item, anchor);
        }
        return;
      }
      closeMenu();
      item.onClick?.();
    });
    document.body.appendChild(menu);
    activeMenu = menu;
    clampToViewport(menu);
    queueMicrotask(() => {
      outsideHandler = (e) => {
        if (isInsideMenu(e.target)) {
          return;
        }
        closeMenu();
      };
      escHandler = (e) => {
        if (e.key === "Escape") {
          closeMenu();
        }
      };
      document.addEventListener("mousedown", outsideHandler);
      document.addEventListener("keydown", escHandler);
    });
  }
  function appendOption(host, item) {
    const opt = document.createElement("wpd-context-menu-option");
    opt.dataset.menuItemId = item.id;
    opt.setAttribute("value", item.id);
    if (item.heading) {
      opt.setAttribute("heading", "");
    }
    if (item.disabled) {
      opt.setAttribute("disabled", "");
    }
    if (item.icon) {
      opt.setAttribute("icon", sanitizeClass$1(item.icon));
    }
    if (hasChildren(item)) {
      opt.setAttribute("has-children", "");
    }
    opt.textContent = item.label;
    host.appendChild(opt);
    return opt;
  }
  function openFlyout(parent, anchor) {
    closeFlyout();
    if (!hasChildren(parent)) {
      return;
    }
    const fly = document.createElement("wpd-context-menu");
    fly.setAttribute("open", "");
    fly.classList.add(MENU_CLASS, `${MENU_CLASS}--flyout`);
    const childById = /* @__PURE__ */ new Map();
    for (const child of sortItems(parent.children ?? [])) {
      childById.set(child.id, child);
      appendOption(fly, child);
    }
    fly.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      const child = childById.get(detail.id);
      if (!child) {
        return;
      }
      e.stopPropagation();
      closeMenu();
      child.onClick?.();
    });
    document.body.appendChild(fly);
    activeFlyout = fly;
    positionFlyout(fly, anchor);
  }
  function positionFlyout(fly, anchor) {
    const ar = anchor.getBoundingClientRect();
    fly.style.position = "fixed";
    fly.style.left = `${ar.right}px`;
    fly.style.top = `${ar.top}px`;
    const fr = fly.getBoundingClientRect();
    if (fr.right > window.innerWidth) {
      fly.style.left = `${Math.max(0, ar.left - fr.width)}px`;
    }
    if (fr.bottom > window.innerHeight) {
      fly.style.top = `${Math.max(0, window.innerHeight - fr.height - 8)}px`;
    }
  }
  function clampToViewport(menu) {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 8)}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 8)}px`;
    }
  }
  function hasChildren(item) {
    return Array.isArray(item.children) && item.children.length > 0;
  }
  function closeFlyout() {
    if (activeFlyout) {
      activeFlyout.remove();
      activeFlyout = null;
    }
  }
  function closeMenu() {
    closeFlyout();
    if (activeMenu) {
      activeMenu.remove();
      activeMenu = null;
    }
    activeCanvas = null;
    if (outsideHandler) {
      document.removeEventListener("mousedown", outsideHandler);
      outsideHandler = null;
    }
    if (escHandler) {
      document.removeEventListener("keydown", escHandler);
      escHandler = null;
    }
  }
  function sanitizeClass$1(raw) {
    return raw.replace(/[^a-zA-Z0-9_-]/g, "");
  }
  const STATUS_BAR_CLASS = "desktop-mode-folder-status-bar";
  const ROOT_CLASS$1 = STATUS_BAR_CLASS;
  function renderStatusBarSegments(bar, segments) {
    render$1(bar, segments);
  }
  function render$1(bar, segments) {
    const sort = (a, b) => {
      const sa = typeof a.sort === "number" ? a.sort : 100;
      const sb = typeof b.sort === "number" ? b.sort : 100;
      if (sa !== sb) {
        return sa - sb;
      }
      return a.label.localeCompare(b.label);
    };
    const start = segments.filter((s) => (s.align ?? "start") === "start").sort(sort);
    const end = segments.filter((s) => s.align === "end").sort(sort);
    bar.replaceChildren();
    bar.appendChild(buildCluster("start", start));
    bar.appendChild(buildCluster("end", end));
  }
  function buildCluster(align, segs) {
    const cluster = document.createElement("div");
    cluster.className = `${ROOT_CLASS$1}__cluster ${ROOT_CLASS$1}__cluster--${align}`;
    for (const seg of segs) {
      cluster.appendChild(buildSegment(seg));
    }
    return cluster;
  }
  function buildSegment(seg) {
    const interactive = typeof seg.onClick === "function";
    const el = document.createElement(interactive ? "button" : "span");
    el.className = `${ROOT_CLASS$1}__segment`;
    el.dataset.segmentId = seg.id;
    if (interactive) {
      el.type = "button";
      el.addEventListener("click", (e) => seg.onClick(e));
    }
    if (seg.icon) {
      const icon = document.createElement("span");
      icon.className = `${ROOT_CLASS$1}__icon dashicons ${seg.icon.replace(/[^a-zA-Z0-9_-]/g, "")}`;
      icon.setAttribute("aria-hidden", "true");
      el.appendChild(icon);
    }
    const label = document.createElement("span");
    label.className = `${ROOT_CLASS$1}__label`;
    label.textContent = seg.label;
    el.appendChild(label);
    return el;
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
     * @since 0.13.0
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
  function applyTileEntryStagger(tile) {
    tile.style.setProperty(
      "--desktop-mode-file-tile-enter-delay",
      `${(Math.random() * 0.25).toFixed(3)}s`
    );
    tile.style.setProperty(
      "--desktop-mode-file-tile-enter-duration",
      `${(0.3 + Math.random() * 0.25).toFixed(3)}s`
    );
  }
  const styles$3 = css`:host{display:inline-block}`;
  const styles$2 = css`:host{position:absolute;width:var( --wpd-ribbon-size,90px );height:var( --wpd-ribbon-size,90px );overflow:hidden;pointer-events:none;z-index:var( --wpd-ribbon-z,2 )}:host( [ hidden ] ){display:none}.banner{position:absolute;display:block;width:var( --wpd-ribbon-banner-width,140px );padding:var( --wpd-ribbon-padding,4px 0 );text-align:center;font:var( --wpd-ribbon-font,700 10px/1.4 var( --desktop-mode-font,system-ui ) );letter-spacing:var( --wpd-ribbon-tracking,0.06em );text-transform:uppercase;color:var( --wpd-ribbon-fg,#fff );background:var( --wpd-ribbon-bg,var( --wp-admin-theme-color,#2271b1 ) );box-shadow:var( --wpd-ribbon-shadow,0 2px 4px rgba( 0,0,0,0.2 ) )}:host(:not( [ placement ] ) ),:host( [ placement='top-end' ] ){inset-block-start:0;inset-inline-end:0}:host(:not( [ placement ] ) ) .banner,:host( [ placement='top-end' ] ) .banner{inset-block-start:var( --wpd-ribbon-banner-offset,20px );inset-inline-end:var( --wpd-ribbon-banner-pull,-36px );transform:rotate( 45deg )}:host( [ placement='top-start' ] ){inset-block-start:0;inset-inline-start:0}:host( [ placement='top-start' ] ) .banner{inset-block-start:var( --wpd-ribbon-banner-offset,20px );inset-inline-start:var( --wpd-ribbon-banner-pull,-36px );transform:rotate( -45deg )}:host( [ placement='bottom-end' ] ){inset-block-end:0;inset-inline-end:0}:host( [ placement='bottom-end' ] ) .banner{inset-block-end:var( --wpd-ribbon-banner-offset,20px );inset-inline-end:var( --wpd-ribbon-banner-pull,-36px );transform:rotate( -45deg )}:host( [ placement='bottom-start' ] ){inset-block-end:0;inset-inline-start:0}:host( [ placement='bottom-start' ] ) .banner{inset-block-end:var( --wpd-ribbon-banner-offset,20px );inset-inline-start:var( --wpd-ribbon-banner-pull,-36px );transform:rotate( 45deg )}:host-context( [ dir='rtl' ] ):host(:not( [ placement ] ) ) .banner,:host-context( [ dir='rtl' ] ):host( [ placement='top-end' ] ) .banner{transform:rotate( -45deg )}:host-context( [ dir='rtl' ] ):host( [ placement='top-start' ] ) .banner{transform:rotate( 45deg )}:host-context( [ dir='rtl' ] ):host( [ placement='bottom-end' ] ) .banner{transform:rotate( 45deg )}:host-context( [ dir='rtl' ] ):host( [ placement='bottom-start' ] ) .banner{transform:rotate( -45deg )}:host( [ tone='success' ] ) .banner{background:var( --wpd-ribbon-success,#1a7f37 )}:host( [ tone='warning' ] ) .banner{background:var( --wpd-ribbon-warning,#9a6700 )}:host( [ tone='danger' ] ) .banner{background:var( --wpd-ribbon-danger,#cf222e )}:host( [ tone='info' ] ) .banner{background:var( --wpd-ribbon-info,#0969da )}:host( [ tone='neutral' ] ) .banner{background:var( --wpd-ribbon-neutral,#57606a )}`;
  const _WpdRibbon = class _WpdRibbon extends Component {
    render() {
      return html`<span class="banner" part="banner"><slot></slot></span>`;
    }
  };
  _WpdRibbon.props = ["placement", "tone"];
  _WpdRibbon.styles = [styles$2];
  _WpdRibbon.help = {
    title: "Ribbon",
    summary: "45° corner ribbon. Wraps the top-end (default), top-start, bottom-end, or bottom-start corner of its positioned parent. The host owns clipping + rotation; consumers only set position-relative on the parent and drop a label inside.",
    status: "experimental",
    since: "0.20.0",
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
  const TILE_CLASS = "desktop-mode-file-tile";
  const STATUS_LABEL = {
    draft: "Draft",
    pending: "Pending",
    private: "Private",
    future: "Scheduled"
  };
  function statusRibbonsEnabled() {
    const get = window.wp?.desktop?.getOsSettings;
    if (typeof get !== "function") {
      return true;
    }
    try {
      return get()?.showPostStatusRibbons !== false;
    } catch {
      return true;
    }
  }
  function getDragManager$1() {
    const api = window.wp?.desktop?.dragManager;
    return api ?? null;
  }
  const REACTIVE_PROPS = [
    "type",
    "ref",
    "label",
    "icon",
    "thumbnail",
    "kind",
    "status",
    "selected",
    "missing",
    "access-gated",
    "drag-kind",
    "drag-title",
    "drag-icon"
  ];
  const _WpdTile = class _WpdTile extends Component {
    constructor() {
      super(...arguments);
      this._pointerdownHandler = null;
      this._keydownHandler = null;
    }
    connectedCallback() {
      super.connectedCallback();
      if (!this._keydownHandler) {
        this._keydownHandler = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.click();
          }
        };
        this.addEventListener("keydown", this._keydownHandler);
      }
      this._paint();
    }
    disconnectedCallback() {
      if (this._pointerdownHandler) {
        this.removeEventListener(
          "pointerdown",
          this._pointerdownHandler
        );
        this._pointerdownHandler = null;
      }
      if (this._keydownHandler) {
        this.removeEventListener(
          "keydown",
          this._keydownHandler
        );
        this._keydownHandler = null;
      }
    }
    /**
     * Bypass the templated render loop. Lit-html's `render(template,
     * root)` would wipe the host's light-DOM children every tick —
     * including the visual / label / ribbon `_paint()` just
     * inserted. We override `requestUpdate` directly so attribute
     * changes call `_paint` (idempotent) without lit-html getting
     * involved.
     */
    requestUpdate() {
      if (!this.isConnected) {
        return;
      }
      this._paint();
    }
    render() {
      return html``;
    }
    _paint() {
      const type = this.getAttribute("type") ?? "";
      const ref = this.getAttribute("ref") ?? "";
      const label = this.getAttribute("label") ?? "";
      const icon = this.getAttribute("icon") ?? "";
      const thumbnail = this.getAttribute("thumbnail") ?? "";
      const kind = this.getAttribute("kind") ?? "entry";
      const status = this.getAttribute("status") ?? "";
      const selected = this.hasAttribute("selected");
      const missing = this.hasAttribute("missing");
      const accessGated = this.hasAttribute("access-gated");
      const ownedClasses = [
        TILE_CLASS,
        `${TILE_CLASS}--folder`,
        `${TILE_CLASS}--missing`,
        `${TILE_CLASS}--access-gated`,
        `${TILE_CLASS}--selected`
      ];
      for (const c of ownedClasses) {
        this.classList.remove(c);
      }
      this.classList.add(TILE_CLASS);
      if (kind === "folder") {
        this.classList.add(`${TILE_CLASS}--folder`);
      }
      if (missing) {
        this.classList.add(`${TILE_CLASS}--missing`);
      }
      if (accessGated) {
        this.classList.add(`${TILE_CLASS}--access-gated`);
      }
      if (selected) {
        this.classList.add(`${TILE_CLASS}--selected`);
      }
      this.dataset.fileType = type;
      this.dataset.fileRef = ref;
      if (kind) {
        this.dataset.role = kind;
      }
      this.setAttribute("role", "listitem");
      this.setAttribute("aria-label", label);
      if (!this.hasAttribute("tabindex")) {
        this.setAttribute("tabindex", "0");
      }
      const accessGatedTitle = "You don’t have permission to open this — ask the folder owner for access.";
      if (accessGated) {
        this.title = accessGatedTitle;
        this.setAttribute("aria-disabled", "true");
      } else {
        this.removeAttribute("aria-disabled");
        if (this.title === accessGatedTitle) {
          this.removeAttribute("title");
        }
      }
      const SLOTS = [
        `${TILE_CLASS}__visual`,
        `${TILE_CLASS}__label`,
        `${TILE_CLASS}__lock`
      ];
      for (const cls of SLOTS) {
        this.querySelectorAll(`:scope > .${cls}`).forEach(
          (n) => n.remove()
        );
      }
      this.querySelectorAll(":scope > wpd-ribbon").forEach(
        (n) => n.remove()
      );
      const visual = document.createElement("span");
      visual.className = `${TILE_CLASS}__visual`;
      if (thumbnail) {
        const img = document.createElement("img");
        img.src = thumbnail;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.className = `${TILE_CLASS}__preview`;
        img.draggable = false;
        visual.appendChild(img);
      } else if (icon) {
        const iconNode = renderIcon(icon, {
          title: label,
          className: `${TILE_CLASS}__icon`
        });
        visual.appendChild(iconNode);
      }
      this.appendChild(visual);
      const labelNode = document.createElement("span");
      labelNode.className = `${TILE_CLASS}__label`;
      labelNode.textContent = label;
      this.appendChild(labelNode);
      if (accessGated) {
        const lock = document.createElement("span");
        lock.className = `${TILE_CLASS}__lock dashicons dashicons-lock`;
        lock.setAttribute("aria-hidden", "true");
        this.appendChild(lock);
      }
      if (status && status !== "publish" && STATUS_LABEL[status] && statusRibbonsEnabled()) {
        const ribbon = document.createElement("wpd-ribbon");
        ribbon.setAttribute("placement", "top-end");
        ribbon.setAttribute("tone", ribbonToneFor(status));
        ribbon.textContent = STATUS_LABEL[status];
        this.appendChild(ribbon);
      }
      applyTileEntryStagger(this);
      doAction("desktop-mode.tile.rendered", { tile: this });
      this._wireDragOut();
    }
    _wireDragOut() {
      if (this._pointerdownHandler) {
        this.removeEventListener(
          "pointerdown",
          this._pointerdownHandler
        );
        this._pointerdownHandler = null;
      }
      const dragKind = this.getAttribute("drag-kind");
      if (!dragKind) {
        return;
      }
      const handler = (e) => {
        if (e.button !== 0) {
          return;
        }
        const dragManager = getDragManager$1();
        if (!dragManager) {
          return;
        }
        const ref = this.getAttribute("ref") ?? "";
        const title = this.getAttribute("drag-title") ?? this.getAttribute("label") ?? void 0;
        const icon = this.getAttribute("drag-icon") ?? this.getAttribute("icon") ?? void 0;
        const rect = this.getBoundingClientRect();
        dragManager.start({
          payload: {
            type: "shortcut",
            source: this,
            data: {
              kind: dragKind,
              ref,
              title,
              icon
            },
            ghost: {
              offsetX: e.clientX - rect.left,
              offsetY: e.clientY - rect.top
            }
          },
          origin: e
        });
      };
      this._pointerdownHandler = handler;
      this.addEventListener("pointerdown", handler);
    }
  };
  _WpdTile.shadow = false;
  _WpdTile.props = REACTIVE_PROPS;
  _WpdTile.styles = [styles$3];
  _WpdTile.help = {
    title: "Tile",
    summary: "Canonical file/entity tile. Used across the wallpaper, folder windows, every My WordPress section, and plugin surfaces. Renders the standard `.desktop-mode-file-tile` chrome + optional status ribbon and wires the shared drag-out helper.",
    status: "experimental",
    since: "0.21.0",
    props: [
      { name: "type", type: "string" },
      { name: "ref", type: "string" },
      { name: "label", type: "string" },
      { name: "icon", type: "string", description: "Dashicon class / URL / data URI. Ignored when `thumbnail` is set." },
      { name: "thumbnail", type: "string", description: "Preview image URL. Renders as `<img>` and wins over `icon`." },
      { name: "kind", type: "`entry` | `folder`" },
      { name: "status", type: "`draft` | `pending` | `private` | `future` | `publish`" },
      { name: "selected", type: "boolean" },
      { name: "missing", type: "boolean" },
      { name: "access-gated", type: "boolean" },
      { name: "drag-kind", type: "string", description: "When set, the component wires pointerdown → DragManager." },
      { name: "drag-title", type: "string" },
      { name: "drag-icon", type: "string" }
    ]
  };
  let WpdTile = _WpdTile;
  function ribbonToneFor(status) {
    switch (status) {
      case "draft":
        return "warning";
      case "pending":
        return "info";
      case "private":
        return "danger";
      case "future":
        return "primary";
      default:
        return "primary";
    }
  }
  defineComponent("wpd-tile", WpdTile);
  function buildTileFromSpec(spec) {
    const tile = document.createElement("wpd-tile");
    tile.setAttribute("type", spec.type);
    tile.setAttribute("ref", spec.ref);
    tile.setAttribute("label", spec.label);
    if (spec.icon) {
      tile.setAttribute("icon", spec.icon);
    }
    if (spec.thumbnail) {
      tile.setAttribute("thumbnail", spec.thumbnail);
    }
    if (spec.role) {
      tile.setAttribute("kind", spec.role);
    }
    if (spec.status) {
      tile.setAttribute("status", spec.status);
    }
    if (spec.missing) {
      tile.setAttribute("missing", "");
    }
    if (spec.accessGated) {
      tile.setAttribute("access-gated", "");
    }
    if (spec.dataset) {
      for (const [key, raw] of Object.entries(spec.dataset)) {
        if (raw === void 0 || raw === null) {
          continue;
        }
        tile.dataset[key] = String(raw);
      }
    }
    if (Array.isArray(spec.extraClasses)) {
      for (const c of spec.extraClasses) {
        if (c) {
          tile.classList.add(c);
        }
      }
    }
    const classFiltered = applyFilters(
      "desktop-mode.tile.class",
      tile.className,
      spec
    );
    if (classFiltered && classFiltered !== tile.className) {
      tile.className = classFiltered;
    }
    if (typeof spec.x === "number" && typeof spec.y === "number") {
      tile.style.position = "absolute";
      tile.style.left = `${spec.x}px`;
      tile.style.top = `${spec.y}px`;
    }
    return tile;
  }
  function attachTileDragOut(tile, payload, onClick) {
    tile.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {
        return;
      }
      const dragManager = getDragManager$1();
      if (!dragManager) {
        return;
      }
      const rect = tile.getBoundingClientRect();
      dragManager.start({
        payload: {
          type: "shortcut",
          source: tile,
          data: {
            kind: payload.kind,
            ref: payload.ref,
            title: payload.title,
            icon: payload.icon,
            bridgePayload: payload.bridgePayload
          },
          ghost: {
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top
          }
        },
        origin: e,
        onClickOnly: onClick
      });
    });
  }
  function getDragManager() {
    const api = window.wp?.desktop?.dragManager;
    return api ?? null;
  }
  function stripTags(html2) {
    const div = document.createElement("div");
    div.innerHTML = html2;
    return (div.textContent ?? "").trim();
  }
  const renderers = /* @__PURE__ */ new Map();
  function registerEntityKind(kind, renderer) {
    if (typeof kind !== "string" || kind === "") {
      throw new TypeError(
        "[my-wordpress] registerEntityKind: kind must be a non-empty string."
      );
    }
    if (typeof renderer !== "function") {
      throw new TypeError(
        "[my-wordpress] registerEntityKind: renderer must be a function."
      );
    }
    renderers.set(kind, renderer);
    return () => {
      if (renderers.get(kind) === renderer) {
        renderers.delete(kind);
      }
    };
  }
  function getEntityRenderer(kind) {
    if (!kind) {
      return renderers.get("post");
    }
    return renderers.get(kind);
  }
  const DEBOUNCE_MS = 300;
  function renderListToolbar(options) {
    const host = document.createElement("div");
    host.className = "desktop-mode-my-wordpress__list-toolbar";
    const search = document.createElement("div");
    search.className = "desktop-mode-my-wordpress__list-toolbar-search";
    const input = document.createElement("input");
    input.type = "search";
    input.className = "desktop-mode-my-wordpress__list-toolbar-search-input";
    input.placeholder = options.placeholder ?? __("Search…", "desktop-mode");
    input.setAttribute(
      "aria-label",
      options.ariaLabel ?? options.placeholder ?? __("Search", "desktop-mode")
    );
    input.autocomplete = "off";
    input.spellcheck = false;
    if (options.initialValue) {
      input.value = options.initialValue;
    }
    search.appendChild(input);
    host.appendChild(search);
    let debounceId = null;
    let lastEmitted = options.initialValue ?? "";
    const emit = (raw) => {
      const normalized = raw.trim();
      if (normalized === lastEmitted) {
        return;
      }
      lastEmitted = normalized;
      options.onSearchChange(normalized);
    };
    const onInput = () => {
      if (debounceId !== null) {
        clearTimeout(debounceId);
      }
      debounceId = setTimeout(() => {
        debounceId = null;
        emit(input.value);
      }, DEBOUNCE_MS);
    };
    input.addEventListener("input", onInput);
    const onSearchEvent = () => {
      if (input.value === "") {
        if (debounceId !== null) {
          clearTimeout(debounceId);
          debounceId = null;
        }
        emit("");
      }
    };
    input.addEventListener("search", onSearchEvent);
    const onKeydown = (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        if (debounceId !== null) {
          clearTimeout(debounceId);
          debounceId = null;
        }
        emit(input.value);
      }
    };
    input.addEventListener("keydown", onKeydown);
    return {
      host,
      getQuery: () => lastEmitted,
      destroy: () => {
        if (debounceId !== null) {
          clearTimeout(debounceId);
          debounceId = null;
        }
        input.removeEventListener("input", onInput);
        input.removeEventListener("search", onSearchEvent);
        input.removeEventListener("keydown", onKeydown);
      }
    };
  }
  const FILE_DROP_HOOKS = {
    /**
     * Action — fires after a successful upload. Payload:
     * `{ file: File, result: DropUploadResult, fields:
     * DropDialogFields, context: DropContext }`.
     *
     * The `file` field carries the same `File` reference that
     * `UPLOAD_STARTED` / `UPLOAD_PROGRESS` exposed (i.e. the
     * payload returned by the `BEFORE_UPLOAD` filter, in case a
     * plugin swapped the file). Subscribers tracking per-file
     * state — progress HUDs, sequence counters — should match on
     * this identity rather than the filename: two drops of
     * `photo.jpg` from different folders would otherwise route
     * each other's success event to the wrong row.
     *
     * @since 0.31.0 the `file` field was added; pre-0.31.0 code
     * that destructured `{ result, fields, context }` keeps working.
     */
    AFTER_UPLOAD: "desktop-mode.drop.after-upload"
  };
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
  const DEFAULT_DURATION_MS = 4e3;
  const FADE_OUT_MS = 200;
  function showToast$1(options) {
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
  const WINDOW_ID$2 = "desktop-mode-my-wordpress";
  function getConfig() {
    const store = window.desktopModeWindowConfig;
    const cfg = store ? store[WINDOW_ID$2] : void 0;
    if (!cfg) {
      throw new Error(
        "[desktop-mode-my-wordpress] config blob missing — was the window opened without registration?"
      );
    }
    return cfg;
  }
  function getEntity(id) {
    return getConfig().entities.find((e) => e.id === id);
  }
  function buildUrl$1(path) {
    return joinRestUrl(getConfig().restRoot, path);
  }
  async function shellFetch$1(input, init) {
    return trackedFetch(input, init, {
      windowId: WINDOW_ID$2,
      source: "desktop-mode/my-wordpress"
    });
  }
  async function fetchEntityList(entity, params) {
    const cfg = getConfig();
    const url = new URL(buildUrl$1(entity.restPath));
    url.searchParams.set("page", String(params.page));
    url.searchParams.set("per_page", String(params.perPage));
    url.searchParams.set(
      "_fields",
      "id,title,excerpt,date,status,featured_media,link,desktop_mode_lock,_links,_embedded"
    );
    url.searchParams.set("_embed", "wp:featuredmedia");
    url.searchParams.set("status", "publish,future,draft,pending,private");
    if (params.search) {
      url.searchParams.set("search", params.search);
    }
    const response = await shellFetch$1(url.toString(), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      },
      signal: params.signal
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage$1(response, "Failed to load list")
      );
    }
    const items = await response.json();
    const total = Number(response.headers.get("X-WP-Total") ?? items.length);
    const totalPages = Number(
      response.headers.get("X-WP-TotalPages") ?? 1
    );
    return { items, total, totalPages };
  }
  async function fetchEntityDetail(entity, id) {
    const cfg = getConfig();
    const url = new URL(buildUrl$1(`${entity.restPath}/${id}`));
    url.searchParams.set(
      "_fields",
      "id,title,content,excerpt,date,modified,status,link,author,featured_media,categories,tags,comment_status,desktop_mode_contributors,desktop_mode_attached_media,_links,_embedded"
    );
    url.searchParams.set("_embed", "author,wp:term,wp:featuredmedia,replies");
    const response = await shellFetch$1(url.toString(), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage$1(response, "Failed to load entry")
      );
    }
    return await response.json();
  }
  async function trashEntity(entity, id) {
    const cfg = getConfig();
    const url = buildUrl$1(`${entity.restPath}/${id}`);
    const response = await shellFetch$1(url, {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage$1(response, "Failed to move to trash")
      );
    }
  }
  async function readErrorMessage$1(response, fallback) {
    let message = `${response.status} ${response.statusText || fallback}`;
    try {
      const json = await response.json();
      if (json && typeof json.message === "string") {
        message = json.message;
      }
    } catch {
    }
    return message;
  }
  async function fetchEntityTotal(entity) {
    const cfg = getConfig();
    const buildRequestUrl = (withWho) => {
      const url = new URL(buildUrl$1(entity.restPath));
      url.searchParams.set("page", "1");
      url.searchParams.set("per_page", "1");
      url.searchParams.set("_fields", "id");
      if (entity.kind === "user") {
        if (withWho) {
          url.searchParams.set("who", "authors");
        }
      } else if (entity.kind === "media") {
        url.searchParams.set("status", "inherit");
      } else {
        url.searchParams.set("status", "publish,future,draft,pending,private");
      }
      return url.toString();
    };
    const send = (target) => shellFetch$1(target, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    let response = await send(buildRequestUrl(false));
    if (response.status === 403 && entity.kind === "user") {
      response = await send(buildRequestUrl(true));
    }
    if (!response.ok) {
      throw new Error(await readErrorMessage$1(response, "Failed to count"));
    }
    await response.json().catch(() => null);
    const raw = response.headers.get("X-WP-Total");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : 0;
  }
  async function fetchUserList(entity, params) {
    const cfg = getConfig();
    const buildRequestUrl = (mode) => {
      const url = new URL(buildUrl$1(entity.restPath));
      url.searchParams.set("page", String(params.page));
      url.searchParams.set("per_page", String(params.perPage));
      url.searchParams.set(
        "_fields",
        "id,name,slug,description,link,avatar_urls,desktop_mode_summary"
      );
      url.searchParams.set("orderby", "name");
      url.searchParams.set("order", "asc");
      if (mode === "edit") {
        url.searchParams.set("context", "edit");
      } else {
        url.searchParams.set("who", "authors");
      }
      if (params.search) {
        url.searchParams.set("search", params.search);
      }
      return url.toString();
    };
    const send = (target) => shellFetch$1(target, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      },
      signal: params.signal
    });
    let response = await send(buildRequestUrl("edit"));
    if (response.status === 403) {
      response = await send(buildRequestUrl("authors"));
    }
    if (!response.ok) {
      throw new Error(await readErrorMessage$1(response, "Failed to load users"));
    }
    const items = await response.json();
    const total = Number(response.headers.get("X-WP-Total") ?? items.length);
    const totalPages = Number(
      response.headers.get("X-WP-TotalPages") ?? 1
    );
    return { items, total, totalPages };
  }
  function fetchUserFootprint(userId) {
    return getJson(
      buildUrl$1(`desktop-mode/v1/user-footprint/${userId}`)
    );
  }
  function buildEditUserUrl(id) {
    const cfg = getConfig();
    const base = cfg.editUserUrlBase || cfg.editPostUrlBase;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}user_id=${encodeURIComponent(String(id))}`;
  }
  function buildEditUrl(id) {
    const cfg = getConfig();
    const base = cfg.editPostUrlBase;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}post=${encodeURIComponent(String(id))}&action=edit`;
  }
  async function getJson(url) {
    const cfg = getConfig();
    const response = await shellFetch$1(url, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage$1(response, "Failed to load"));
    }
    return await response.json();
  }
  function fetchUserStats(id) {
    return getJson(buildUrl$1(`desktop-mode/v1/user-stats/${id}`));
  }
  function fetchTermStats(taxonomy, id) {
    const slug = taxonomy.replace(/[^a-zA-Z0-9_-]/g, "");
    return getJson(
      buildUrl$1(`desktop-mode/v1/term-stats/${slug}/${id}`)
    );
  }
  function fetchCommentStats(id) {
    return getJson(
      buildUrl$1(`desktop-mode/v1/comment-stats/${id}`)
    );
  }
  function fetchUser(id) {
    return getJson(
      buildUrl$1(`wp/v2/users/${id}?context=edit&_fields=id,name,slug,description,avatar_urls,link`)
    );
  }
  function fetchComments(postId) {
    return getJson(
      buildUrl$1(
        `wp/v2/comments?post=${postId}&per_page=100&_fields=id,post,author,author_name,author_avatar_urls,date,content,status,parent`
      )
    );
  }
  function fetchTerms(taxonomy, ids) {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return getJson(
      buildUrl$1(
        `wp/v2/${taxonomy}?include=${ids.join(",")}&per_page=100&_fields=id,name,slug,taxonomy,description,count,link`
      )
    );
  }
  function fetchAttachedMedia(postId) {
    return getJson(
      buildUrl$1(
        `wp/v2/media?parent=${postId}&per_page=100&_fields=id,title,source_url,mime_type,alt_text,date,media_details`
      )
    );
  }
  function fetchMediaByIds(ids) {
    const unique = Array.from(new Set(ids.filter((id) => id > 0)));
    if (unique.length === 0) {
      return Promise.resolve([]);
    }
    return getJson(
      buildUrl$1(
        `wp/v2/media?include=${unique.join(",")}&per_page=${unique.length}&_fields=id,title,source_url,mime_type,alt_text,date,media_details`
      )
    );
  }
  function fetchRevisions(entity, postId) {
    return getJson(
      buildUrl$1(
        `${entity.restPath}/${postId}/revisions?_fields=id,date,modified,author,title`
      )
    );
  }
  function fetchRevision(entity, postId, revisionId) {
    return getJson(
      buildUrl$1(
        `${entity.restPath}/${postId}/revisions/${revisionId}?_fields=id,date,modified,author,title,content,excerpt`
      )
    );
  }
  const WINDOW_ID$1 = "desktop-mode-my-wordpress";
  function shellFetch(input, init) {
    return trackedFetch(input, init, {
      windowId: WINDOW_ID$1,
      source: "desktop-mode/my-wordpress"
    });
  }
  function buildUrl(path) {
    return joinRestUrl(getConfig().restRoot, path);
  }
  async function readErrorMessage(response, fallback) {
    let message = `${response.status} ${response.statusText || fallback}`;
    try {
      const json = await response.json();
      if (json && typeof json.message === "string") {
        message = json.message;
      }
    } catch {
    }
    return message;
  }
  async function fetchMediaPage(entity, params) {
    const cfg = getConfig();
    const url = new URL(buildUrl(entity.restPath));
    url.searchParams.set("page", String(params.page));
    url.searchParams.set("per_page", String(params.perPage));
    url.searchParams.set(
      "_fields",
      "id,title,date,mime_type,source_url,alt_text,caption,description,author,media_details,_embedded"
    );
    url.searchParams.set("_embed", "author");
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "desc");
    url.searchParams.set("status", "inherit");
    if (params.search) {
      url.searchParams.set("search", params.search);
    }
    const response = await shellFetch(url.toString(), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      },
      signal: params.signal
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to load media")
      );
    }
    const items = await response.json();
    const total = Number(response.headers.get("X-WP-Total") ?? items.length);
    const totalPages = Number(
      response.headers.get("X-WP-TotalPages") ?? 1
    );
    return { items, total, totalPages };
  }
  async function fetchMediaItem(mediaId) {
    const cfg = getConfig();
    const url = new URL(buildUrl(`wp/v2/media/${mediaId}`));
    url.searchParams.set(
      "_fields",
      "id,title,date,mime_type,source_url,alt_text,caption,description,author,media_details,_embedded"
    );
    url.searchParams.set("_embed", "author");
    const response = await shellFetch(url.toString(), {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to load media item")
      );
    }
    return await response.json();
  }
  async function deleteMediaItem(mediaId) {
    const cfg = getConfig();
    const url = new URL(buildUrl(`wp/v2/media/${mediaId}`));
    url.searchParams.set("force", "true");
    const response = await shellFetch(url.toString(), {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": cfg.restNonce,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to delete media item")
      );
    }
  }
  async function fetchMediaUsage(mediaId) {
    const cfg = getConfig();
    const response = await shellFetch(
      buildUrl(`desktop-mode/v1/media-usage/${mediaId}`),
      {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-WP-Nonce": cfg.restNonce,
          Accept: "application/json"
        }
      }
    );
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to load media usage")
      );
    }
    return await response.json();
  }
  const MIME_DASHICON_FALLBACK = "dashicons-media-default";
  const MIME_DASHICON_MAP = [
    { test: /^image\//, icon: "dashicons-format-image" },
    { test: /^video\//, icon: "dashicons-format-video" },
    { test: /^audio\//, icon: "dashicons-format-audio" },
    { test: /pdf$/, icon: "dashicons-media-document" },
    { test: /^application\/(zip|x-tar|x-rar|x-7z)/, icon: "dashicons-media-archive" },
    { test: /spreadsheet|excel/, icon: "dashicons-media-spreadsheet" },
    { test: /word|document/, icon: "dashicons-media-document" },
    { test: /^text\//, icon: "dashicons-media-text" }
  ];
  function dashiconForMime(mime) {
    for (const entry of MIME_DASHICON_MAP) {
      if (entry.test.test(mime)) {
        return entry.icon;
      }
    }
    return MIME_DASHICON_FALLBACK;
  }
  function mimeGroup(mime) {
    if (mime.startsWith("image/")) {
      return "image";
    }
    if (mime.startsWith("video/")) {
      return "video";
    }
    if (mime.startsWith("audio/")) {
      return "audio";
    }
    return "doc";
  }
  function formatBytes(bytes) {
    if (!bytes || !Number.isFinite(bytes)) {
      return "";
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
  }
  function formatDate$1(iso) {
    if (!iso) {
      return "";
    }
    const d = new Date(iso);
    if (Number.isNaN(d.valueOf())) {
      return iso;
    }
    return d.toLocaleDateString(void 0, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  function buildMediaVisual(media) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-my-wordpress__media-visual";
    const group = mimeGroup(media.mime_type);
    if (group === "image") {
      const img = document.createElement("img");
      const sizes = media.media_details?.sizes;
      img.src = sizes?.large?.source_url ?? sizes?.medium_large?.source_url ?? sizes?.medium?.source_url ?? media.source_url;
      img.alt = media.alt_text ?? stripTags(media.title.rendered);
      img.loading = "lazy";
      img.decoding = "async";
      img.className = "desktop-mode-my-wordpress__media-image";
      wrap.appendChild(img);
      return wrap;
    }
    if (group === "video") {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.src = media.source_url;
      const sizes = media.media_details?.sizes;
      const poster = sizes?.large?.source_url ?? sizes?.medium?.source_url ?? "";
      if (poster) {
        video.poster = poster;
      }
      video.className = "desktop-mode-my-wordpress__media-video";
      wrap.appendChild(video);
      return wrap;
    }
    if (group === "audio") {
      const stack = document.createElement("div");
      stack.className = "desktop-mode-my-wordpress__media-audio-stack";
      const icon2 = document.createElement("span");
      icon2.className = "desktop-mode-my-wordpress__media-fallback-icon dashicons " + dashiconForMime(media.mime_type);
      icon2.setAttribute("aria-hidden", "true");
      stack.appendChild(icon2);
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = media.source_url;
      audio.className = "desktop-mode-my-wordpress__media-audio";
      stack.appendChild(audio);
      wrap.appendChild(stack);
      return wrap;
    }
    const icon = document.createElement("span");
    icon.className = "desktop-mode-my-wordpress__media-fallback-icon dashicons " + dashiconForMime(media.mime_type);
    icon.setAttribute("aria-hidden", "true");
    wrap.appendChild(icon);
    const link = document.createElement("a");
    link.href = media.source_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "desktop-mode-my-wordpress__media-doc-link";
    link.textContent = __("Open file", "desktop-mode");
    wrap.appendChild(link);
    return wrap;
  }
  function buildMetaRow(label, value) {
    if (typeof value === "string" && value.trim() === "") {
      return null;
    }
    const dt = document.createElement("dt");
    dt.className = "desktop-mode-my-wordpress__media-meta-term";
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.className = "desktop-mode-my-wordpress__media-meta-value";
    if (typeof value === "string") {
      dd.textContent = value;
    } else {
      dd.appendChild(value);
    }
    return [dt, dd];
  }
  function buildMetadataGrid(media) {
    const grid = document.createElement("dl");
    grid.className = "desktop-mode-my-wordpress__media-meta";
    const filename = media.media_details?.file ? media.media_details.file.split("/").pop() ?? "" : media.source_url.split("/").pop() ?? "";
    const dims = media.media_details?.width && media.media_details?.height ? `${media.media_details.width} × ${media.media_details.height}` : "";
    const filesize = formatBytes(media.media_details?.filesize);
    const uploaded = formatDate$1(media.date);
    const uploader = media._embedded?.author?.[0]?.name ?? "";
    const alt = (media.alt_text ?? "").trim();
    const caption = stripTags(media.caption?.rendered ?? "");
    const description = stripTags(media.description?.rendered ?? "");
    const rows = [
      buildMetaRow(__("Filename", "desktop-mode"), filename),
      buildMetaRow(__("Type", "desktop-mode"), media.mime_type),
      buildMetaRow(__("Dimensions", "desktop-mode"), dims),
      buildMetaRow(__("File size", "desktop-mode"), filesize),
      buildMetaRow(__("Uploaded", "desktop-mode"), uploaded),
      buildMetaRow(__("Uploader", "desktop-mode"), uploader),
      buildMetaRow(__("Alt text", "desktop-mode"), alt),
      buildMetaRow(__("Caption", "desktop-mode"), caption),
      buildMetaRow(__("Description", "desktop-mode"), description)
    ];
    for (const pair of rows) {
      if (pair) {
        grid.append(...pair);
      }
    }
    return grid;
  }
  function fireSlot(host, slot, entityId, kind, item) {
    doAction(
      "desktop-mode.my-wordpress.preview-extras",
      {
        slot,
        container: host,
        entityId,
        kind,
        item
      }
    );
  }
  function resolvePreviewActions(descriptors, ctx) {
    const scoped = descriptors.filter((a) => {
      if (a.sections && a.sections.length > 0) {
        if (!a.sections.includes(ctx.entityId) && !a.sections.includes("*")) {
          return false;
        }
      }
      if (a.mime) {
        if (!ctx.mime) {
          return false;
        }
        try {
          const re = new RegExp(a.mime);
          if (!re.test(ctx.mime)) {
            return false;
          }
        } catch {
          return false;
        }
      }
      return true;
    });
    const merged = applyFilters("desktop-mode.my-wordpress.preview-actions", scoped, ctx);
    return Array.isArray(merged) ? merged : scoped;
  }
  function buildActionRow(actions, ctx) {
    const visible = actions.filter(
      (a) => typeof a.isVisible === "function" ? a.isVisible(ctx) : true
    );
    if (visible.length === 0) {
      return null;
    }
    const row = document.createElement("div");
    row.className = "desktop-mode-my-wordpress__media-actions";
    row.setAttribute("role", "toolbar");
    for (const action of visible) {
      const btn = document.createElement("wpd-button");
      btn.setAttribute("variant", "secondary");
      btn.dataset.actionId = action.id;
      if (action.icon) {
        btn.setAttribute("icon", action.icon);
      }
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        if (typeof action.onSelect === "function") {
          try {
            void action.onSelect(ctx);
          } catch {
            console.error(
              `[my-wordpress] preview action ${action.id} threw.`
            );
          }
        }
      });
      row.appendChild(btn);
    }
    return row;
  }
  function renderMediaPreview(host, media, opts) {
    host.replaceChildren();
    const pane = document.createElement("div");
    pane.className = "desktop-mode-my-wordpress__media-pane";
    const header = document.createElement("header");
    header.className = "desktop-mode-my-wordpress__media-header";
    const heading = document.createElement("h2");
    heading.className = "desktop-mode-my-wordpress__media-title";
    heading.textContent = stripTags(media.title.rendered) || __("(no title)", "desktop-mode");
    header.appendChild(heading);
    pane.appendChild(header);
    const item = media;
    const ctx = {
      entityId: opts.entityId,
      kind: "media",
      mime: media.mime_type,
      item
    };
    fireSlot(header, "header", opts.entityId, "media", item);
    pane.appendChild(buildMediaVisual(media));
    const meta = buildMetadataGrid(media);
    pane.appendChild(meta);
    fireSlot(meta, "meta", opts.entityId, "media", item);
    const resolved = resolvePreviewActions(opts.previewActions, ctx);
    const actionRow = buildActionRow(resolved, ctx);
    if (actionRow) {
      pane.appendChild(actionRow);
    }
    if (opts.onOpenDetail) {
      const footer = document.createElement("footer");
      footer.className = "desktop-mode-my-wordpress__article-footer";
      const drillBtn = document.createElement("wpd-button");
      drillBtn.setAttribute("variant", "primary");
      drillBtn.textContent = __("See where this is used", "desktop-mode");
      drillBtn.title = __(
        "Show the posts, pages, and custom-post-type entries that reference this file.",
        "desktop-mode"
      );
      drillBtn.addEventListener("click", () => opts.onOpenDetail?.());
      footer.appendChild(drillBtn);
      pane.appendChild(footer);
      fireSlot(footer, "footer", opts.entityId, "media", item);
    } else {
      const footer = document.createElement("div");
      footer.className = "desktop-mode-my-wordpress__media-footer";
      pane.appendChild(footer);
      fireSlot(footer, "footer", opts.entityId, "media", item);
    }
    host.appendChild(pane);
  }
  const lastQueryByMediaEntity = /* @__PURE__ */ new Map();
  function describeCount(ctx) {
    if (ctx.total === 0 && ctx.loaded === 0) {
      return __("No media yet.", "desktop-mode");
    }
    if (ctx.total > ctx.loaded && ctx.loaded > 0) {
      return sprintf(
        // translators: 1: visible item count, 2: total item count.
        __("%1$d of %2$d items", "desktop-mode"),
        ctx.loaded,
        ctx.total
      );
    }
    const n = Math.max(ctx.total, ctx.loaded);
    return sprintf(
      // translators: %d is a count of media items.
      _n("%d item", "%d items", n),
      n
    );
  }
  function paintStatus$2(ctx) {
    const segments = [
      {
        id: "count",
        label: describeCount(ctx),
        align: "start",
        sort: 10
      }
    ];
    if (ctx.totalPages > 1) {
      segments.push({
        id: "page",
        label: sprintf(
          // translators: 1: current page, 2: total pages.
          __("Page %1$d of %2$d", "desktop-mode"),
          Math.max(ctx.page, 1),
          ctx.totalPages
        ),
        align: "end",
        sort: 10
      });
    }
    const filtered = applyFilters(
      "desktop-mode.my-wordpress.status-bar",
      segments,
      { view: "list", entityId: ctx.entity.id }
    );
    renderStatusBarSegments(
      ctx.statusBar,
      Array.isArray(filtered) ? filtered : segments
    );
  }
  function buildMediaTile(ctx, media) {
    const titleText = stripTags(media.title.rendered) || __("(no title)", "desktop-mode");
    const sizes = media.media_details?.sizes;
    const thumbUrl = media.mime_type.startsWith("image/") ? sizes?.thumbnail?.source_url ?? sizes?.medium?.source_url ?? media.source_url : "";
    const tile = buildTileFromSpec({
      type: "attachment",
      ref: String(media.id),
      label: titleText,
      thumbnail: thumbUrl || void 0,
      icon: thumbUrl ? void 0 : dashiconForMime(media.mime_type),
      role: "entry",
      dataset: { mediaId: media.id, mime: media.mime_type },
      extraClasses: [
        "desktop-mode-my-wordpress__media-tile",
        "desktop-mode-my-wordpress__tile",
        "desktop-mode-my-wordpress__tile--media"
      ]
    });
    attachTileDragOut(tile, {
      kind: "attachment",
      ref: String(media.id),
      title: titleText,
      icon: dashiconForMime(media.mime_type),
      // Cross-frame bridge payload — lets the Gutenberg drop-
      // receiver build a `core/image` / `core/video` / `core/audio`
      // / `core/file` block when this tile is dropped on an open
      // editor iframe. The full-size source URL is the right block
      // attribute regardless of mime; the receiver picks the
      // concrete block from the MIME prefix.
      bridgePayload: {
        kind: "attachment",
        id: media.id,
        url: media.source_url,
        title: titleText,
        alt: stripTags(media.alt_text ?? ""),
        mime: media.mime_type,
        thumbnailUrl: thumbUrl || void 0,
        sizes: media.media_details?.sizes
      }
    });
    tile.addEventListener("click", () => selectTile$1(ctx, tile, media));
    tile.addEventListener("dblclick", (e) => {
      e.preventDefault();
      ctx.host.navigate({
        kind: "media-detail",
        entityId: ctx.entity.id,
        mediaId: media.id,
        mediaTitle: titleText
      });
    });
    tile.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMediaTileMenu(ctx, tile, media, titleText, {
        x: e.clientX,
        y: e.clientY
      });
    });
    return tile;
  }
  function openMediaTileMenu(ctx, tile, media, titleText, pos) {
    closeAnyMediaTileMenu();
    selectTile$1(ctx, tile, media);
    const menu = document.createElement("wpd-context-menu");
    menu.setAttribute("open", "");
    menu.classList.add("desktop-mode-my-wordpress__menu");
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    const base = [
      {
        id: "navigate-into",
        label: __("Navigate into", "desktop-mode"),
        icon: "dashicons-category"
      },
      {
        id: "open-source",
        label: __("Open file in new tab", "desktop-mode"),
        icon: "dashicons-external"
      },
      {
        id: "delete",
        label: __("Delete permanently", "desktop-mode"),
        icon: "dashicons-trash",
        danger: true
      }
    ];
    const filterCtx = {
      entityId: ctx.entity.id,
      kind: "attachment",
      item: media
    };
    const options = applyFilters(
      "desktop-mode.my-wordpress.tile-context-menu",
      base,
      filterCtx
    );
    const finalOptions = Array.isArray(options) ? options : base;
    for (const o of finalOptions) {
      const opt = document.createElement("wpd-context-menu-option");
      opt.dataset.menuItemId = o.id;
      opt.setAttribute("value", o.id);
      opt.setAttribute("icon", o.icon);
      if (o.danger) {
        opt.setAttribute("danger", "");
      }
      opt.textContent = o.label;
      menu.appendChild(opt);
    }
    menu.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      closeAnyMediaTileMenu();
      if (detail.id === "navigate-into") {
        ctx.host.navigate({
          kind: "media-detail",
          entityId: ctx.entity.id,
          mediaId: media.id,
          mediaTitle: titleText
        });
        return;
      }
      if (detail.id === "open-source") {
        window.open(media.source_url, "_blank", "noopener,noreferrer");
        return;
      }
      if (detail.id === "delete") {
        void confirmDeleteMedia(ctx, tile, media, titleText);
        return;
      }
      const match = finalOptions.find((o) => o.id === detail.id);
      if (match && typeof match.onSelect === "function") {
        try {
          match.onSelect();
        } catch (err) {
          console.error(
            `[my-wordpress/media] tile-context-menu '${detail.id}' onSelect threw:`,
            err
          );
        }
      }
    });
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(
        0,
        window.innerWidth - rect.width - 8
      )}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(
        0,
        window.innerHeight - rect.height - 8
      )}px`;
    }
    queueMicrotask(() => {
      const onDocPointerDown = (ev) => {
        if (ev.target instanceof Node && menu.contains(ev.target)) {
          return;
        }
        closeAnyMediaTileMenu();
      };
      const onDocKey = (ev) => {
        if (ev.key === "Escape") {
          closeAnyMediaTileMenu();
        }
      };
      document.addEventListener("pointerdown", onDocPointerDown, true);
      document.addEventListener("keydown", onDocKey);
      menu.addEventListener("tile-menu-closed", () => {
        document.removeEventListener(
          "pointerdown",
          onDocPointerDown,
          true
        );
        document.removeEventListener("keydown", onDocKey);
      });
    });
  }
  function closeAnyMediaTileMenu() {
    document.querySelectorAll("wpd-context-menu.desktop-mode-my-wordpress__menu").forEach((n) => {
      n.dispatchEvent(new CustomEvent("tile-menu-closed"));
      n.remove();
    });
  }
  async function confirmDeleteMedia(ctx, tile, media, titleText) {
    const ok = await wpdConfirm({
      title: __("Delete media?", "desktop-mode"),
      message: sprintf(
        // translators: %s is a media item title.
        __("“%s” will be permanently deleted. This cannot be undone.", "desktop-mode"),
        titleText
      ),
      confirmLabel: __("Delete", "desktop-mode"),
      cancelLabel: __("Cancel", "desktop-mode")
    });
    if (!ok) {
      return;
    }
    try {
      await deleteMediaItem(media.id);
      removeMediaFromList(ctx, tile, media.id);
      showToast$1({ message: __("Media deleted.", "desktop-mode") });
    } catch (err) {
      const message = err instanceof Error ? err.message : __("Couldn’t delete that file.", "desktop-mode");
      showToast$1({ message });
    }
  }
  function removeMediaFromList(ctx, tile, mediaId) {
    tile.remove();
    if (ctx.selectedId === mediaId) {
      ctx.selectedId = null;
      ctx.selectedTile = null;
      ctx.preview.replaceChildren();
      const placeholder = document.createElement("div");
      placeholder.className = "desktop-mode-my-wordpress__preview-empty";
      placeholder.textContent = __(
        "Select a media item to preview it here.",
        "desktop-mode"
      );
      ctx.preview.appendChild(placeholder);
    }
    ctx.loaded = Math.max(0, ctx.loaded - 1);
    ctx.total = Math.max(0, ctx.total - 1);
    paintStatus$2(ctx);
  }
  function selectTile$1(ctx, tile, media) {
    if (ctx.selectedTile) {
      ctx.selectedTile.removeAttribute("selected");
    }
    tile.setAttribute("selected", "");
    ctx.selectedTile = tile;
    ctx.selectedId = media.id;
    const titleText = stripTags(media.title.rendered) || __("(no title)", "desktop-mode");
    renderMediaPreview(ctx.preview, media, {
      entityId: ctx.entity.id,
      previewActions: ctx.previewActions,
      onOpenDetail: () => {
        ctx.host.navigate({
          kind: "media-detail",
          entityId: ctx.entity.id,
          mediaId: media.id,
          mediaTitle: titleText
        });
      }
    });
  }
  function renderEmpty(host, message) {
    const empty = document.createElement("div");
    empty.className = "desktop-mode-my-wordpress__empty";
    empty.textContent = message;
    host.appendChild(empty);
  }
  function renderMediaList(host, entity) {
    const cfg = getConfig();
    const initialQuery = lastQueryByMediaEntity.get(entity.id) ?? "";
    const toolbar = renderListToolbar({
      placeholder: __("Search media…", "desktop-mode"),
      ariaLabel: __("Search media", "desktop-mode"),
      initialValue: initialQuery,
      onSearchChange: (q) => {
        lastQueryByMediaEntity.set(entity.id, q);
        void resetForSearch(q);
      }
    });
    host.body.appendChild(toolbar.host);
    host.addTeardown(() => toolbar.destroy());
    const split = document.createElement("div");
    split.className = "desktop-mode-my-wordpress__split desktop-mode-my-wordpress__split--media";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list";
    const tiles = document.createElement("div");
    tiles.className = "desktop-mode-my-wordpress__media-grid";
    tiles.setAttribute("role", "list");
    left.appendChild(tiles);
    const sentinel = document.createElement("div");
    sentinel.className = "desktop-mode-my-wordpress__sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    left.appendChild(sentinel);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    const previewEmpty = document.createElement("div");
    previewEmpty.className = "desktop-mode-my-wordpress__preview-empty";
    previewEmpty.textContent = __(
      "Select a media item to preview it here.",
      "desktop-mode"
    );
    right.appendChild(previewEmpty);
    split.append(left, right);
    host.body.appendChild(split);
    const statusBar = host.body.closest("[data-desktop-mode-my-wordpress-root]")?.querySelector(
      "[data-desktop-mode-my-wordpress-status]"
    ) ?? document.createElement("div");
    const ctx = {
      page: 0,
      totalPages: 1,
      total: 0,
      loaded: 0,
      loading: false,
      done: false,
      tiles,
      sentinel,
      preview: right,
      selectedId: null,
      selectedTile: null,
      statusBar,
      entity,
      host,
      previewActions: cfg.previewActions ?? [],
      query: initialQuery,
      abort: null
    };
    host.addTeardown(() => ctx.abort?.abort());
    const sentinelIsVisible = () => {
      const sr = sentinel.getBoundingClientRect();
      const rr = left.getBoundingClientRect();
      const slack = 200;
      return sr.top < rr.bottom + slack && sr.bottom > rr.top - slack;
    };
    const loadMore = async () => {
      if (ctx.loading || ctx.done) {
        return;
      }
      ctx.loading = true;
      const nextPage = ctx.page + 1;
      const perPage = cfg.mediaPerPage ?? 48;
      const queryAtFetchTime = ctx.query;
      const controller = new AbortController();
      ctx.abort = controller;
      try {
        const result = await fetchMediaPage(entity, {
          page: nextPage,
          perPage,
          search: queryAtFetchTime || void 0,
          signal: controller.signal
        });
        if (ctx.query !== queryAtFetchTime) {
          return;
        }
        ctx.page = nextPage;
        ctx.totalPages = result.totalPages;
        ctx.total = result.total;
        if (result.items.length === 0 && nextPage === 1) {
          renderEmpty(
            tiles,
            queryAtFetchTime ? sprintf(
              // translators: %s is the user-entered search query.
              __('No media match "%s".', "desktop-mode"),
              queryAtFetchTime
            ) : __("No media yet.", "desktop-mode")
          );
          ctx.done = true;
          paintStatus$2(ctx);
          return;
        }
        for (const item of result.items) {
          tiles.appendChild(buildMediaTile(ctx, item));
          ctx.loaded += 1;
        }
        if (ctx.page >= ctx.totalPages) {
          ctx.done = true;
        }
        paintStatus$2(ctx);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const message = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
        renderEmpty(tiles, message);
        ctx.done = true;
      } finally {
        ctx.loading = false;
        if (ctx.abort === controller) {
          ctx.abort = null;
        }
      }
      if (!ctx.done) {
        requestAnimationFrame(() => {
          if (sentinelIsVisible()) {
            void loadMore();
          }
        });
      }
    };
    const resetForSearch = async (q) => {
      ctx.abort?.abort();
      ctx.abort = null;
      ctx.query = q;
      tiles.classList.add(
        "desktop-mode-my-wordpress__media-grid--searching"
      );
      const controller = new AbortController();
      ctx.abort = controller;
      ctx.loading = true;
      const perPage = cfg.mediaPerPage ?? 48;
      try {
        const result = await fetchMediaPage(entity, {
          page: 1,
          perPage,
          search: q || void 0,
          signal: controller.signal
        });
        if (ctx.query !== q) {
          return;
        }
        tiles.replaceChildren();
        tiles.classList.remove(
          "desktop-mode-my-wordpress__media-grid--searching"
        );
        ctx.page = 1;
        ctx.totalPages = result.totalPages;
        ctx.total = result.total;
        ctx.loaded = 0;
        ctx.done = ctx.page >= ctx.totalPages;
        ctx.selectedId = null;
        ctx.selectedTile = null;
        ctx.preview.replaceChildren();
        const emptyPreview = document.createElement("div");
        emptyPreview.className = "desktop-mode-my-wordpress__preview-empty";
        emptyPreview.textContent = __(
          "Select a media item to preview it here.",
          "desktop-mode"
        );
        ctx.preview.appendChild(emptyPreview);
        if (result.items.length === 0) {
          renderEmpty(
            tiles,
            q ? sprintf(
              // translators: %s is the user-entered search query.
              __('No media match "%s".', "desktop-mode"),
              q
            ) : __("No media yet.", "desktop-mode")
          );
          ctx.done = true;
        } else {
          for (const item of result.items) {
            tiles.appendChild(buildMediaTile(ctx, item));
            ctx.loaded += 1;
          }
        }
        paintStatus$2(ctx);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        tiles.classList.remove(
          "desktop-mode-my-wordpress__media-grid--searching"
        );
        tiles.replaceChildren();
        const message = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
        renderEmpty(tiles, message);
        ctx.done = true;
      } finally {
        ctx.loading = false;
        if (ctx.abort === controller) {
          ctx.abort = null;
        }
      }
      if (!ctx.done) {
        requestAnimationFrame(() => {
          if (sentinelIsVisible()) {
            void loadMore();
          }
        });
      }
    };
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              void loadMore();
            }
          }
        },
        { root: left, rootMargin: "200px 0px" }
      );
      observer.observe(sentinel);
      host.addTeardown(() => observer.disconnect());
    } else {
      const onScroll = () => {
        if (sentinelIsVisible()) {
          void loadMore();
        }
      };
      left.addEventListener("scroll", onScroll, { passive: true });
      host.addTeardown(() => left.removeEventListener("scroll", onScroll));
    }
    const liveNs = `desktop-mode/my-wordpress-media-live-${Math.random().toString(36).slice(2, 8)}`;
    addAction(FILE_DROP_HOOKS.AFTER_UPLOAD, liveNs, (payload) => {
      void spliceNewMedia(ctx, payload.result.id);
    });
    host.addTeardown(
      () => removeAction(FILE_DROP_HOOKS.AFTER_UPLOAD, liveNs)
    );
    host.addTeardown(() => closeAnyMediaTileMenu());
    paintStatus$2(ctx);
    void loadMore();
  }
  async function spliceNewMedia(ctx, mediaId) {
    if (!ctx.tiles.isConnected) {
      return;
    }
    if (ctx.tiles.querySelector(
      `wpd-tile[data-media-id="${mediaId}"]`
    )) {
      return;
    }
    try {
      const item = await fetchMediaItem(mediaId);
      ctx.tiles.insertBefore(buildMediaTile(ctx, item), ctx.tiles.firstChild);
      ctx.loaded += 1;
      ctx.total += 1;
      paintStatus$2(ctx);
    } catch (err) {
      console.warn(
        "[my-wordpress/media] live-refresh fetch failed:",
        err
      );
    }
  }
  function entityForPostType(postType) {
    const suffix = "/" + postType;
    return getConfig().entities.find((e) => e.restPath.endsWith(suffix));
  }
  function entityIdForPostType(postType) {
    const match = entityForPostType(postType);
    if (match) {
      return match.id;
    }
    if (postType === "page") {
      return "pages";
    }
    return "posts";
  }
  function entityIconForPostType(postType) {
    const match = entityForPostType(postType);
    if (match) {
      return match.icon;
    }
    if (postType === "page") {
      return "dashicons-admin-page";
    }
    return "dashicons-admin-post";
  }
  function openDetailInWindow(payload) {
    const myWp = window.wp?.desktop?.myWordpress;
    myWp?.openDetail?.(payload);
  }
  function buildUsageTile(row) {
    const titleText = row.title || `#${row.postId}`;
    const tile = buildTileFromSpec({
      type: "post",
      ref: String(row.postId),
      label: titleText,
      icon: entityIconForPostType(row.postType),
      role: "entry",
      status: row.status,
      dataset: { postId: row.postId, postType: row.postType },
      extraClasses: [
        "desktop-mode-my-wordpress__tile",
        "desktop-mode-my-wordpress__tile--entry",
        "desktop-mode-my-wordpress__media-tile",
        "desktop-mode-my-wordpress__tile--usage"
      ]
    });
    attachTileDragOut(tile, {
      kind: "post",
      ref: String(row.postId),
      title: titleText,
      icon: entityIconForPostType(row.postType)
    });
    return tile;
  }
  let openContextMenu = null;
  function closeContextMenu() {
    if (openContextMenu && openContextMenu.isConnected) {
      openContextMenu.remove();
    }
    openContextMenu = null;
  }
  function openUsageTileMenu(row, pos) {
    closeContextMenu();
    const menu = document.createElement("wpd-context-menu");
    menu.setAttribute("open", "");
    menu.classList.add("desktop-mode-my-wordpress__menu");
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    const addOption = (id, label, icon) => {
      const opt = document.createElement("wpd-context-menu-option");
      opt.dataset.menuItemId = id;
      opt.setAttribute("value", id);
      opt.setAttribute("icon", icon);
      opt.textContent = label;
      menu.appendChild(opt);
    };
    addOption("navigate-into", __("Open in My WordPress", "desktop-mode"), "dashicons-category");
    if (row.editLink) {
      addOption("open-editor", __("Open in editor", "desktop-mode"), "dashicons-edit");
    }
    if (row.link) {
      addOption("open-front", __("View on site", "desktop-mode"), "dashicons-external");
    }
    menu.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      closeContextMenu();
      if (detail.id === "navigate-into") {
        openDetailInWindow({
          entityId: entityIdForPostType(row.postType),
          postId: row.postId,
          postTitle: row.title
        });
        return;
      }
      if (detail.id === "open-editor" && row.editLink) {
        window.open(row.editLink, "_blank", "noopener,noreferrer");
        return;
      }
      if (detail.id === "open-front" && row.link) {
        window.open(row.link, "_blank", "noopener,noreferrer");
      }
    });
    document.body.appendChild(menu);
    openContextMenu = menu;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(
        0,
        window.innerWidth - rect.width - 8
      )}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(
        0,
        window.innerHeight - rect.height - 8
      )}px`;
    }
    queueMicrotask(() => {
      const onDoc = (ev) => {
        const target = ev.target;
        if (target instanceof Node && menu.contains(target)) {
          return;
        }
        closeContextMenu();
        document.removeEventListener("pointerdown", onDoc, true);
        document.removeEventListener("keydown", onKey);
      };
      const onKey = (ev) => {
        if (ev.key === "Escape") {
          closeContextMenu();
          document.removeEventListener("pointerdown", onDoc, true);
          document.removeEventListener("keydown", onKey);
        }
      };
      document.addEventListener("pointerdown", onDoc, true);
      document.addEventListener("keydown", onKey);
    });
  }
  function paintStatus$1(statusBar, count, entityId) {
    const segments = [
      {
        id: "count",
        label: sprintf(
          // translators: %d is the count of posts that reference an attachment.
          _n("%d reference", "%d references", count),
          count
        ),
        align: "start",
        sort: 10
      }
    ];
    const filtered = applyFilters(
      "desktop-mode.my-wordpress.status-bar",
      segments,
      { view: "media-detail", entityId }
    );
    renderStatusBarSegments(
      statusBar,
      Array.isArray(filtered) ? filtered : segments
    );
  }
  async function renderMediaDetail(host, mediaId) {
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-my-wordpress__split desktop-mode-my-wordpress__split--media-detail";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list desktop-mode-my-wordpress__usage-list";
    const loading = document.createElement("div");
    loading.className = "desktop-mode-my-wordpress__preview-loading";
    const spinner = document.createElement("wpd-spinner");
    loading.appendChild(spinner);
    left.appendChild(loading);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    wrap.append(left, right);
    host.body.appendChild(wrap);
    const statusBar = host.body.closest("[data-desktop-mode-my-wordpress-root]")?.querySelector(
      "[data-desktop-mode-my-wordpress-status]"
    ) ?? document.createElement("div");
    let usage;
    try {
      usage = await fetchMediaUsage(mediaId);
    } catch (err) {
      if (!wrap.isConnected) {
        return;
      }
      left.replaceChildren();
      const errBox = document.createElement("div");
      errBox.className = "desktop-mode-my-wordpress__error";
      errBox.textContent = err instanceof Error ? err.message : __("Failed to load usage data.", "desktop-mode");
      left.appendChild(errBox);
      return;
    }
    if (!wrap.isConnected) {
      return;
    }
    if (host.route.kind !== "media-detail") {
      throw new Error(
        "[my-wordpress] renderMediaDetail invoked outside a media-detail route."
      );
    }
    const entityId = host.route.entityId;
    const summary = document.createElement("div");
    summary.className = "desktop-mode-my-wordpress__media-detail-summary-bar";
    const summaryText = document.createElement("p");
    summaryText.className = "desktop-mode-my-wordpress__media-detail-summary";
    summaryText.textContent = sprintf(
      // translators: %d is the count of posts/pages referencing this file.
      _n(
        "%d entry references this file.",
        "%d entries reference this file.",
        usage.usedIn.length
      ),
      usage.usedIn.length
    );
    summary.appendChild(summaryText);
    right.replaceChildren(summary);
    const mediaItem = {
      id: usage.media.id,
      title: { rendered: usage.media.title },
      date: usage.media.date,
      mime_type: usage.media.mime,
      source_url: usage.media.sourceUrl,
      media_details: {
        file: usage.media.filename
      },
      _embedded: usage.media.author.name ? { author: [{ id: usage.media.author.id, name: usage.media.author.name }] } : void 0
    };
    const previewHost = document.createElement("div");
    previewHost.className = "desktop-mode-my-wordpress__media-detail-preview";
    renderMediaPreview(previewHost, mediaItem, {
      entityId,
      previewActions: getConfig().previewActions ?? []
    });
    right.appendChild(previewHost);
    left.replaceChildren();
    if (usage.usedIn.length === 0) {
      const empty = document.createElement("div");
      empty.className = "desktop-mode-my-wordpress__empty";
      empty.textContent = __(
        "No posts or pages reference this file.",
        "desktop-mode"
      );
      left.appendChild(empty);
      paintStatus$1(statusBar, 0, entityId);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "desktop-mode-my-wordpress__media-grid desktop-mode-my-wordpress__usage-grid";
    grid.setAttribute("role", "list");
    for (const row of usage.usedIn) {
      const tile = buildUsageTile(row);
      tile.addEventListener("dblclick", (e) => {
        e.preventDefault();
        openDetailInWindow({
          entityId: entityIdForPostType(row.postType),
          postId: row.postId,
          postTitle: row.title
        });
      });
      tile.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openUsageTileMenu(row, { x: e.clientX, y: e.clientY });
      });
      grid.appendChild(tile);
    }
    left.appendChild(grid);
    host.addTeardown(closeContextMenu);
    paintStatus$1(statusBar, usage.usedIn.length, entityId);
  }
  const ROOT_CLASS = "desktop-mode-breadcrumbs";
  function renderBreadcrumbs(host, segments, opts = {}) {
    host.replaceChildren();
    host.classList.add(ROOT_CLASS);
    if (opts.onBack) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = `${ROOT_CLASS}__back`;
      back.setAttribute("aria-label", __("Back", "desktop-mode"));
      back.title = __("Back", "desktop-mode");
      const arrow = document.createElement("span");
      arrow.className = "dashicons dashicons-arrow-left-alt2";
      arrow.setAttribute("aria-hidden", "true");
      back.appendChild(arrow);
      if (opts.backDisabled) {
        back.disabled = true;
      }
      const onBack = opts.onBack;
      back.addEventListener("click", () => {
        if (back.disabled) {
          return;
        }
        onBack();
      });
      host.appendChild(back);
    }
    const nav = document.createElement("nav");
    nav.className = `${ROOT_CLASS}__crumbs`;
    nav.setAttribute("aria-label", __("Breadcrumb", "desktop-mode"));
    segments.forEach((seg, idx) => {
      if (idx > 0) {
        const sep = document.createElement("span");
        sep.className = `${ROOT_CLASS}__sep`;
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "›";
        nav.appendChild(sep);
      }
      if (!seg.onClick) {
        const here = document.createElement("span");
        here.className = `${ROOT_CLASS}__crumb ${ROOT_CLASS}__crumb--current`;
        here.setAttribute("aria-current", "page");
        here.textContent = seg.label;
        nav.appendChild(here);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${ROOT_CLASS}__crumb`;
      btn.textContent = seg.label;
      const onClick = seg.onClick;
      btn.addEventListener("click", () => {
        onClick();
      });
      nav.appendChild(btn);
    });
    host.appendChild(nav);
  }
  const styles$1 = css`:host{display:inline-flex}:host( [ fill-cell ] ){display:flex;width:100%}button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:var( --wpd-button-padding,6px 12px );border-radius:var( --wpd-button-border-radius,6px );font:inherit;font-weight:500;cursor:pointer;transition:background-color 0.12s ease,color 0.12s ease,border-color 0.12s ease;background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid var( --desktop-mode-border,#c3c4c7 ) )}:host( [ fill-cell ] ) button{width:100%;min-height:var( --wpd-button-min-height,44px )}button:disabled{opacity:0.5;cursor:not-allowed}button:hover:not(:disabled ){background:rgba( 0,0,0,0.04 )}:host( [ variant='primary' ] ) button{background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) );color:var( --wpd-button-fg,#fff );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='primary' ] ) button:hover:not(:disabled ){filter:brightness( 1.06 );background:var( --wpd-button-bg,var( --wp-admin-theme-color,#2271b1 ) )}:host( [ variant='secondary' ] ) button{background:var( --wpd-button-bg,rgba( 0,0,0,0.06 ) );color:var( --wpd-button-fg,var( --desktop-mode-text,#1d2327 ) );border:var( --wpd-button-border,1px solid transparent )}:host( [ variant='secondary' ] ) button:hover:not(:disabled ){background:var( --wpd-button-bg-hover,rgba( 0,0,0,0.1 ) )}:host( [ variant='danger' ] ) button{background:var( --wpd-button-bg,transparent );color:var( --wpd-button-fg,#d63638 );border:var( --wpd-button-border,1px solid currentColor )}:host( [ variant='danger' ] ) button:hover:not(:disabled ){background:#d63638;color:#fff}:host( [ variant='link' ] ) button{background:transparent;color:var( --wpd-button-fg,var( --wp-admin-theme-color,#2271b1 ) );border:0;padding:0;text-decoration:underline}:host( [ busy ] ) button{pointer-events:none;opacity:0.75}`;
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
  _WpdButton.styles = [styles$1];
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
  const menuStyles = css`:host{display:none;position:fixed;min-width:180px;background:var( --wpd-context-menu-bg,var( --desktop-mode-bg,#1d2327 ) );color:var( --wpd-context-menu-fg,var( --desktop-mode-fg,#fff ) );border:1px solid rgba( 255,255,255,0.08 );border-radius:8px;box-shadow:0 8px 24px rgba( 0,0,0,0.45 );padding:4px;font-size:13px;line-height:1.3;z-index:9999}:host( [ open ] ){display:block}`;
  const optionStyles = css`:host{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;background:transparent;color:inherit;text-align:start;cursor:pointer;border-radius:4px;box-sizing:border-box;user-select:none}:host(:hover ),:host( [ active ] ){background:rgba( 255,255,255,0.1 );outline:none}:host( [ disabled ] ){opacity:0.45;cursor:not-allowed}:host( [ danger ] ){color:#ff8a8a}:host( [ danger ]:hover ){background:rgba( 255,90,90,0.18 )}:host( [ heading ] ){padding:8px 10px 4px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var( --wpd-context-menu-fg-muted,rgba( 255,255,255,0.5 ) );pointer-events:none}.icon{display:inline-flex;align-items:center;justify-content:center;font-size:18px;width:20px;height:20px}.label{flex:1}.chevron{margin-inline-start:auto;padding-inline-start:8px;font-size:16px;line-height:1;opacity:0.7}.check{display:inline-flex;align-items:center;justify-content:center;width:14px;font-size:13px;line-height:1;opacity:0.95}`;
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
  _WpdContextMenu.styles = [menuStyles];
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
      const hasChildren2 = this.hasAttribute("has-children");
      const checked = this.hasAttribute("checked");
      return html`
			${checked ? html`<span class="check" aria-hidden="true">✓</span>` : html``}
			${icon ? html`<span class="icon dashicons ${icon}" aria-hidden="true"></span>` : html``}
			<span class="label"><slot></slot></span>
			${hasChildren2 ? html`<span class="chevron" aria-hidden="true">›</span>` : html``}
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
  _WpdContextMenuOption.styles = [optionStyles];
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
      { name: "(default)", description: "Visible label + optional nested <wpd-context-menu>." }
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
  const styles = css`:host{display:inline-block;--wpd-spinner-color:var( --wp-admin-theme-color,#21759b );--wpd-spinner-accent:#fff;--wpd-spinner-size:48px;width:var( --wpd-spinner-size );height:var( --wpd-spinner-size );color:var( --wpd-spinner-color );vertical-align:middle;line-height:0}:host( [ hidden ] ){display:none}.root,.root svg{display:block;width:100%;height:100%}.root svg .mark{fill:var( --wpd-spinner-accent,#fff )}@keyframes wpd-spinner-spin{to{transform:rotate( 360deg )}}@keyframes wpd-spinner-scale{0%,100%{transform:scale( 1 )}50%{transform:scale( 1.045 )}}@keyframes wpd-spinner-opacity{0%,100%{opacity:1}50%{opacity:0.7}}@media ( prefers-reduced-motion:reduce ){.root svg [ style*='animation' ]{animation:none !important}}`;
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
  _WpdSpinner.styles = [styles];
  _WpdSpinner.help = {
    title: "Spinner",
    summary: "Animated WordPress-mark loading indicator with four curated presets and full per-attribute overrides. CSS variables drive disc + accent colors and size; reduced-motion preferences are respected.",
    status: "experimental",
    since: "0.18.0",
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
  const WINDOW_ID = "desktop-mode-my-wordpress";
  const ROOT_SEL = "[data-desktop-mode-my-wordpress-root]";
  const BREADCRUMBS_SEL = "[data-desktop-mode-my-wordpress-breadcrumbs]";
  const BODY_SEL = "[data-desktop-mode-my-wordpress-body]";
  const STATUS_SEL = "[data-desktop-mode-my-wordpress-status]";
  function wpdConfirmGlobal(options) {
    const fn = window.wp?.desktop?.confirm;
    if (typeof fn !== "function") {
      return Promise.resolve(false);
    }
    return fn(options);
  }
  function openIframeWindow(opts) {
    const manager = window.wp?.desktop?.windowManager;
    if (!manager || typeof manager.open !== "function") {
      return;
    }
    manager.open({
      id: opts.id,
      url: opts.url,
      title: opts.title,
      icon: opts.icon
    });
  }
  function getThumbnail(item) {
    const media = item._embedded?.["wp:featuredmedia"]?.[0];
    if (!media) {
      return "";
    }
    const sizes = media.media_details?.sizes;
    const preferred = sizes?.medium?.source_url ?? sizes?.thumbnail?.source_url ?? sizes?.large?.source_url ?? media.source_url;
    return preferred ?? "";
  }
  function paintStatus(state, baseSegments, ctx) {
    const filtered = applyFilters(
      "desktop-mode.my-wordpress.status-bar",
      baseSegments,
      ctx
    );
    renderStatusBarSegments(
      state.statusBar,
      Array.isArray(filtered) ? filtered : baseSegments
    );
  }
  function pluralLabel(n, singular, plural) {
    return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
  }
  function navigate(state, route, opts = {}) {
    const sameRoute = routesEqual(state.route, route);
    if (!opts.fromBack && !sameRoute) {
      state.history.push(state.route);
    }
    clearTeardown(state);
    state.route = route;
    updateBreadcrumbs(state);
    state.body.replaceChildren();
    if (route.kind === "root") {
      renderRoot(state);
      return;
    }
    const entity = getEntity(route.entityId);
    if (!entity) {
      renderError(
        state,
        __("Unknown entity type.", "desktop-mode")
      );
      return;
    }
    if (route.kind === "list") {
      const renderer = getEntityRenderer(entity.kind);
      if (renderer) {
        const host = makeRenderHost(state);
        renderer(host, entity);
        return;
      }
      renderEntityList(state, entity);
      return;
    }
    if (route.kind === "detail") {
      renderDetail(state, entity, route.postId, route.postTitle);
      return;
    }
    if (route.kind === "sub-list") {
      renderSubList(
        state,
        entity,
        route.postId,
        route.postTitle,
        route.relation
      );
      return;
    }
    if (route.kind === "user-footprint") {
      renderUserFootprint(state, entity, route.userId, route.userName);
      return;
    }
    if (route.kind === "media-detail") {
      void renderMediaDetail(makeRenderHost(state), route.mediaId);
      return;
    }
  }
  function makeRenderHost(state) {
    return {
      body: state.body,
      route: state.route,
      navigate: (route) => navigate(state, route),
      addTeardown: (fn) => state.teardown.push(fn)
    };
  }
  function routesEqual(a, b) {
    if (a.kind !== b.kind) {
      return false;
    }
    switch (a.kind) {
      case "root":
        return true;
      case "list":
        return a.entityId === b.entityId;
      case "detail": {
        const o = b;
        return a.entityId === o.entityId && a.postId === o.postId;
      }
      case "sub-list": {
        const o = b;
        return a.entityId === o.entityId && a.postId === o.postId && a.relation === o.relation;
      }
      case "user-footprint": {
        const o = b;
        return a.entityId === o.entityId && a.userId === o.userId;
      }
      case "media-detail": {
        const o = b;
        return a.entityId === o.entityId && a.mediaId === o.mediaId;
      }
      default:
        return false;
    }
  }
  function parentRoute(route) {
    switch (route.kind) {
      case "root":
        return route;
      case "list":
        return { kind: "root" };
      case "detail":
        return { kind: "list", entityId: route.entityId };
      case "sub-list":
        return {
          kind: "detail",
          entityId: route.entityId,
          postId: route.postId,
          postTitle: route.postTitle
        };
      case "user-footprint":
        return { kind: "list", entityId: route.entityId };
      case "media-detail":
        return { kind: "list", entityId: route.entityId };
      default:
        return { kind: "root" };
    }
  }
  function clearTeardown(state) {
    for (const fn of state.teardown) {
      try {
        fn();
      } catch {
      }
    }
    state.teardown = [];
  }
  function updateBreadcrumbs(state) {
    const { route } = state;
    const segments = [];
    const isRoot = route.kind === "root";
    segments.push(
      isRoot ? { label: __("My WordPress", "desktop-mode") } : {
        label: __("My WordPress", "desktop-mode"),
        onClick: () => navigate(state, { kind: "root" })
      }
    );
    if (route.kind !== "root") {
      const entity = getEntity(route.entityId);
      const label = entity ? entity.label : route.entityId;
      segments.push(
        route.kind === "list" ? { label } : {
          label,
          onClick: () => navigate(state, {
            kind: "list",
            entityId: route.entityId
          })
        }
      );
    }
    if (route.kind === "detail" || route.kind === "sub-list") {
      const postTitle = route.postTitle;
      const entityId = route.entityId;
      const postId = route.postId;
      segments.push(
        route.kind === "detail" ? { label: postTitle } : {
          label: postTitle,
          onClick: () => navigate(state, {
            kind: "detail",
            entityId,
            postId,
            postTitle
          })
        }
      );
    }
    if (route.kind === "sub-list") {
      segments.push({ label: subRelationLabel(route.relation) });
    }
    if (route.kind === "user-footprint") {
      segments.push({
        label: sprintf(
          // translators: %s is a user display name.
          __("%s — activity footprint", "desktop-mode"),
          route.userName
        )
      });
    }
    if (route.kind === "media-detail") {
      segments.push({ label: route.mediaTitle });
    }
    renderBreadcrumbs(state.breadcrumbs, segments, {
      onBack: () => {
        const previous = state.history.pop();
        if (previous) {
          navigate(state, previous, { fromBack: true });
          return;
        }
        navigate(state, parentRoute(state.route), { fromBack: true });
      },
      backDisabled: isRoot && state.history.length === 0
    });
  }
  function subRelationLabel(relation) {
    switch (relation) {
      case "author":
        return __("Author", "desktop-mode");
      case "contributors":
        return __("Contributors", "desktop-mode");
      case "comments":
        return __("Comments", "desktop-mode");
      case "categories":
        return __("Categories", "desktop-mode");
      case "tags":
        return __("Tags", "desktop-mode");
      case "media":
        return __("Attached media", "desktop-mode");
      case "revisions":
        return __("Revisions", "desktop-mode");
      default:
        return relation;
    }
  }
  function renderRoot(state) {
    const cfg = getConfig();
    const grid = document.createElement("div");
    grid.className = "desktop-mode-my-wordpress__grid desktop-mode-my-wordpress__canvas";
    grid.setAttribute("role", "list");
    const layout = createTileLayout(grid, "root");
    const select = createTileSelector();
    const tilesByEntity = /* @__PURE__ */ new Map();
    cfg.entities.forEach((entity, idx) => {
      const tile = buildIconTile({
        role: "folder",
        icon: entity.icon,
        label: entity.label
      });
      tile.dataset.entityId = entity.id;
      tilesByEntity.set(entity.id, tile);
      const tileKey = `entity:${entity.id}`;
      const synthDate = new Date(2020, 0, 1 + idx).toISOString();
      layout.place(tile, tileKey, {
        name: entity.label,
        date: synthDate
      });
      tile.addEventListener("click", () => select(tile));
      tile.addEventListener("dblclick", (e) => {
        e.preventDefault();
        navigate(state, { kind: "list", entityId: entity.id });
      });
      grid.appendChild(tile);
    });
    cfg.entities.forEach((entity) => {
      void fetchEntityTotal(entity).then((total) => {
        if (state.route.kind !== "root") {
          return;
        }
        const tile = tilesByEntity.get(entity.id);
        if (!tile) {
          return;
        }
        const label = tile.querySelector(
          ".desktop-mode-file-tile__label"
        );
        if (label) {
          label.textContent = `${entity.label} · ${total.toLocaleString()}`;
        }
      }).catch(() => {
      });
    });
    state.body.appendChild(grid);
    const menu = attachIconCanvasMenu(grid, {
      scope: "my-wordpress:root",
      onSort: (mode) => layout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    state.teardown.push(() => layout.dispose());
    paintStatus(
      state,
      [
        {
          id: "count",
          label: pluralLabel(cfg.entities.length, "folder", "folders"),
          align: "start",
          sort: 10
        }
      ],
      { view: "root" }
    );
  }
  function buildIconTile(spec) {
    return buildTileFromSpec({
      type: spec.role === "folder" ? "folder" : "__my-wordpress-entry",
      ref: spec.label,
      label: spec.label,
      icon: sanitizeClass(spec.icon),
      role: spec.role,
      extraClasses: [
        "desktop-mode-my-wordpress__tile",
        spec.role === "folder" ? "desktop-mode-my-wordpress__tile--folder" : "desktop-mode-my-wordpress__tile--entry"
      ]
    });
  }
  function renderError(state, message) {
    const empty = document.createElement("div");
    empty.className = "desktop-mode-my-wordpress__empty";
    empty.textContent = message;
    state.body.appendChild(empty);
  }
  const lastQueryByEntity = /* @__PURE__ */ new Map();
  function renderEntityList(state, entity) {
    const cfg = getConfig();
    const initialQuery = lastQueryByEntity.get(entity.id) ?? "";
    const toolbar = renderListToolbar({
      placeholder: sprintf(
        // translators: %s is a lowercased entity-type label (e.g. "posts", "pages").
        __("Search %s…", "desktop-mode"),
        entity.label.toLowerCase()
      ),
      ariaLabel: sprintf(
        // translators: %s is an entity-type label (e.g. "Posts", "Pages").
        __("Search %s", "desktop-mode"),
        entity.label
      ),
      initialValue: initialQuery,
      onSearchChange: (q) => {
        lastQueryByEntity.set(entity.id, q);
        void resetForSearch(q);
      }
    });
    state.body.appendChild(toolbar.host);
    state.teardown.push(() => toolbar.destroy());
    const split = document.createElement("div");
    split.className = "desktop-mode-my-wordpress__split";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list";
    const tiles = document.createElement("div");
    tiles.className = "desktop-mode-my-wordpress__tiles desktop-mode-my-wordpress__canvas";
    tiles.setAttribute("role", "list");
    left.appendChild(tiles);
    const sentinel = document.createElement("div");
    sentinel.className = "desktop-mode-my-wordpress__sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    left.appendChild(sentinel);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    const previewEmpty = document.createElement("div");
    previewEmpty.className = "desktop-mode-my-wordpress__preview-empty";
    previewEmpty.textContent = __(
      "Select an entry to preview it here.",
      "desktop-mode"
    );
    right.appendChild(previewEmpty);
    split.appendChild(left);
    split.appendChild(right);
    state.body.appendChild(split);
    const tileLayout = createTileLayout(tiles, `entity:${entity.id}`);
    const menu = attachIconCanvasMenu(tiles, {
      scope: `my-wordpress:${entity.id}`,
      onSort: (mode) => tileLayout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    const ctx = {
      page: 0,
      totalPages: 1,
      total: 0,
      loaded: 0,
      loading: false,
      done: false,
      tiles,
      sentinel,
      preview: right,
      selectedId: null,
      selectedTile: null,
      observer: null,
      layout: tileLayout,
      query: initialQuery,
      abort: null
    };
    state.teardown.push(() => tileLayout.dispose());
    state.teardown.push(() => ctx.abort?.abort());
    const repaintListStatus = () => {
      let itemLabel;
      if (ctx.total === 0 && ctx.loaded === 0) {
        itemLabel = pluralLabel(0, "item", "items");
      } else if (ctx.total > ctx.loaded && ctx.loaded > 0) {
        itemLabel = sprintf(
          // translators: 1: visible item count, 2: total item count.
          __("%1$d of %2$d items", "desktop-mode"),
          ctx.loaded,
          ctx.total
        );
      } else {
        itemLabel = pluralLabel(
          Math.max(ctx.total, ctx.loaded),
          "item",
          "items"
        );
      }
      const segments = [
        { id: "count", label: itemLabel, align: "start", sort: 10 }
      ];
      if (ctx.totalPages > 1) {
        segments.push({
          id: "page",
          label: sprintf(
            // translators: 1: current page, 2: total pages.
            __("Page %1$d of %2$d", "desktop-mode"),
            Math.max(ctx.page, 1),
            ctx.totalPages
          ),
          align: "end",
          sort: 10
        });
      }
      paintStatus(state, segments, {
        view: "list",
        entityId: entity.id
      });
    };
    repaintListStatus();
    const sentinelIsVisible = () => {
      const sr = sentinel.getBoundingClientRect();
      const rr = left.getBoundingClientRect();
      const slack = 200;
      return sr.top < rr.bottom + slack && sr.bottom > rr.top - slack;
    };
    const loadMore = async () => {
      if (ctx.loading || ctx.done) {
        return;
      }
      ctx.loading = true;
      const nextPage = ctx.page + 1;
      const isFirst = nextPage === 1;
      const queryAtFetchTime = ctx.query;
      showLoadingSkeleton(tiles, ctx.layout, isFirst);
      const controller = new AbortController();
      ctx.abort = controller;
      try {
        const result = await fetchEntityList(entity, {
          page: nextPage,
          perPage: cfg.perPage,
          search: queryAtFetchTime || void 0,
          signal: controller.signal
        });
        if (ctx.query !== queryAtFetchTime) {
          return;
        }
        ctx.page = nextPage;
        ctx.totalPages = result.totalPages;
        ctx.total = result.total;
        hideLoadingSkeleton(tiles);
        if (result.items.length === 0 && isFirst) {
          renderListEmpty(tiles, entity, queryAtFetchTime);
          ctx.done = true;
          repaintListStatus();
          return;
        }
        for (const item of result.items) {
          tiles.appendChild(buildEntityTile(state, ctx, entity, item));
          ctx.loaded += 1;
        }
        if (ctx.page >= ctx.totalPages) {
          ctx.done = true;
        }
        repaintListStatus();
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        hideLoadingSkeleton(tiles);
        const msg = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
        renderListError(tiles, msg);
        ctx.done = true;
      } finally {
        ctx.loading = false;
        if (ctx.abort === controller) {
          ctx.abort = null;
        }
      }
      if (!ctx.done) {
        requestAnimationFrame(() => {
          if (sentinelIsVisible()) {
            void loadMore();
          }
        });
      }
    };
    const resetForSearch = async (q) => {
      ctx.abort?.abort();
      ctx.abort = null;
      ctx.query = q;
      tiles.classList.add(
        "desktop-mode-my-wordpress__tiles--searching"
      );
      hideLoadingSkeleton(tiles);
      const controller = new AbortController();
      ctx.abort = controller;
      ctx.loading = true;
      try {
        const result = await fetchEntityList(entity, {
          page: 1,
          perPage: cfg.perPage,
          search: q || void 0,
          signal: controller.signal
        });
        if (ctx.query !== q) {
          return;
        }
        tiles.replaceChildren();
        ctx.layout.clear();
        tiles.classList.remove(
          "desktop-mode-my-wordpress__tiles--searching"
        );
        ctx.page = 1;
        ctx.totalPages = result.totalPages;
        ctx.total = result.total;
        ctx.loaded = 0;
        ctx.done = ctx.page >= ctx.totalPages;
        ctx.selectedId = null;
        ctx.selectedTile = null;
        ctx.preview.replaceChildren();
        const emptyPreview = document.createElement("div");
        emptyPreview.className = "desktop-mode-my-wordpress__preview-empty";
        emptyPreview.textContent = __(
          "Select an entry to preview it here.",
          "desktop-mode"
        );
        ctx.preview.appendChild(emptyPreview);
        if (result.items.length === 0) {
          renderListEmpty(tiles, entity, q);
          ctx.done = true;
        } else {
          for (const item of result.items) {
            tiles.appendChild(
              buildEntityTile(state, ctx, entity, item)
            );
            ctx.loaded += 1;
          }
        }
        repaintListStatus();
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        tiles.classList.remove(
          "desktop-mode-my-wordpress__tiles--searching"
        );
        tiles.replaceChildren();
        ctx.layout.clear();
        const msg = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
        renderListError(tiles, msg);
        ctx.done = true;
      } finally {
        ctx.loading = false;
        if (ctx.abort === controller) {
          ctx.abort = null;
        }
      }
      if (!ctx.done) {
        requestAnimationFrame(() => {
          if (sentinelIsVisible()) {
            void loadMore();
          }
        });
      }
    };
    if (typeof IntersectionObserver !== "undefined") {
      ctx.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              void loadMore();
            }
          }
        },
        { root: left, rootMargin: "200px 0px" }
      );
      ctx.observer.observe(sentinel);
      state.teardown.push(() => ctx.observer?.disconnect());
    }
    void loadMore();
  }
  function isAbortError(err) {
    return err instanceof DOMException && err.name === "AbortError";
  }
  function renderListEmpty(host, entity, query) {
    const empty = document.createElement("div");
    empty.className = "desktop-mode-my-wordpress__empty";
    if (query) {
      empty.textContent = sprintf(
        // translators: 1: search query, 2: lowercased entity-type label.
        __('No %2$s match "%1$s".', "desktop-mode"),
        query,
        entity.label.toLowerCase()
      );
    } else {
      empty.textContent = sprintf(
        // translators: %s is an entity-type label (e.g. "Posts", "Pages").
        __("No %s yet.", "desktop-mode"),
        entity.label.toLowerCase()
      );
    }
    host.appendChild(empty);
  }
  function renderListError(host, message) {
    const err = document.createElement("div");
    err.className = "desktop-mode-my-wordpress__error";
    err.textContent = message;
    host.appendChild(err);
  }
  function buildSkeletonTile(variant) {
    const tile = document.createElement("div");
    tile.className = "desktop-mode-my-wordpress__skeleton-tile";
    tile.dataset.loadingSkeleton = variant;
    tile.setAttribute("aria-hidden", "true");
    const icon = document.createElement("div");
    icon.className = "desktop-mode-my-wordpress__skeleton-icon";
    tile.appendChild(icon);
    const label = document.createElement("div");
    label.className = "desktop-mode-my-wordpress__skeleton-label";
    tile.appendChild(label);
    return tile;
  }
  const SKELETON_LABEL_WIDTHS = [72, 60, 82, 48, 70];
  const SKELETON_DELAY_STEPS = [0, 0.18, 0.36, 0.54, 0.12];
  function showLoadingSkeleton(host, layout, isFirst) {
    const variant = isFirst ? "first" : "more";
    if (host.querySelector(`[data-loading-skeleton="${variant}"]`)) {
      return;
    }
    const count = isFirst ? 8 : 4;
    const cells = layout.peekNextCells(count);
    let maxBottom = parseFloat(host.style.minHeight || "0");
    cells.forEach((cell, i) => {
      const tile = buildSkeletonTile(variant);
      tile.style.left = `${cell.x}px`;
      tile.style.top = `${cell.y}px`;
      tile.style.setProperty(
        "--desktop-mode-skeleton-delay",
        `${SKELETON_DELAY_STEPS[i % SKELETON_DELAY_STEPS.length]}s`
      );
      const label = tile.querySelector(
        ".desktop-mode-my-wordpress__skeleton-label"
      );
      if (label) {
        label.style.width = `${SKELETON_LABEL_WIDTHS[i % SKELETON_LABEL_WIDTHS.length]}%`;
      }
      host.appendChild(tile);
      maxBottom = Math.max(maxBottom, cell.y + TILE_H);
    });
    host.style.minHeight = `${maxBottom + TILE_PAD}px`;
  }
  function hideLoadingSkeleton(host) {
    host.querySelectorAll("[data-loading-skeleton]").forEach(
      (n) => n.remove()
    );
  }
  function buildEntityTile(state, ctx, entity, item) {
    const titleText = stripTags(item.title.rendered) || __("(no title)", "desktop-mode");
    const tile = buildIconTile({
      role: "entry",
      icon: entity.icon,
      label: titleText
    });
    tile.dataset.entryId = String(item.id);
    if (item.status) {
      tile.setAttribute("status", item.status);
    }
    attachTileDragOut(
      tile,
      {
        kind: "post",
        ref: String(item.id),
        title: titleText,
        icon: entity.icon,
        // Cross-frame bridge payload — the Gutenberg drop-receiver
        // turns this into a `core/paragraph` with an `<a href>` to
        // the permalink. Tiles without a `link` (very old REST
        // shapes / private posts) still drag-out for placement
        // purposes; the receiver no-ops on an empty url.
        bridgePayload: {
          kind: "post",
          id: item.id,
          postType: entity.id,
          url: item.link ?? "",
          title: titleText
        }
      },
      () => hideTooltip()
    );
    const lock = item.desktop_mode_lock ?? null;
    if (lock) {
      tile.classList.add("desktop-mode-my-wordpress__tile--locked");
      const badge = document.createElement("span");
      badge.className = "desktop-mode-my-wordpress__tile-lock dashicons dashicons-lock";
      badge.setAttribute("aria-hidden", "true");
      tile.appendChild(badge);
      const lockedAriaLabel = __(
        "%1$s — currently being edited by %2$s",
        "desktop-mode"
      );
      tile.setAttribute(
        "aria-label",
        sprintf(lockedAriaLabel, titleText, lock.userName)
      );
    }
    let tooltip = null;
    const showTooltip = (ev) => {
      if (!tooltip) {
        tooltip = buildTooltip(titleText, item);
      }
      document.body.appendChild(tooltip);
      positionTooltip(tooltip, ev);
    };
    const moveTooltip = (ev) => {
      if (tooltip && tooltip.isConnected) {
        positionTooltip(tooltip, ev);
      }
    };
    const hideTooltip = () => {
      if (tooltip && tooltip.isConnected) {
        tooltip.remove();
      }
    };
    tile.addEventListener("mouseenter", showTooltip);
    tile.addEventListener("mousemove", moveTooltip);
    tile.addEventListener("mouseleave", hideTooltip);
    state.teardown.push(hideTooltip);
    const tileKey = `entry:${item.id}`;
    ctx.layout.place(tile, tileKey, {
      name: titleText,
      date: item.date || (/* @__PURE__ */ new Date(0)).toISOString()
    });
    tile.addEventListener("click", () => {
      selectTile(state, ctx, tile, entity, item.id);
    });
    tile.addEventListener("dblclick", (e) => {
      e.preventDefault();
      hideTooltip();
      openEditor(entity, item.id, titleText);
    });
    tile.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      hideTooltip();
      openTileMenu(state, ctx, entity, item, titleText, {
        x: e.clientX,
        y: e.clientY
      });
    });
    return tile;
  }
  function buildTooltip(title, item) {
    const tip = document.createElement("div");
    tip.className = "desktop-mode-my-wordpress__tooltip";
    tip.setAttribute("role", "tooltip");
    const heading = document.createElement("div");
    heading.className = "desktop-mode-my-wordpress__tooltip-title";
    heading.textContent = title;
    tip.appendChild(heading);
    const lock = item.desktop_mode_lock ?? null;
    if (lock) {
      const banner = document.createElement("div");
      banner.className = "desktop-mode-my-wordpress__tooltip-lock";
      const icon = document.createElement("span");
      icon.className = "dashicons dashicons-lock";
      icon.setAttribute("aria-hidden", "true");
      banner.appendChild(icon);
      const text = document.createElement("span");
      text.textContent = sprintf(
        // translators: %s is the user name currently editing the post.
        __("%s is currently editing", "desktop-mode"),
        lock.userName
      );
      banner.appendChild(text);
      tip.appendChild(banner);
    }
    const thumb = getThumbnail(item);
    if (thumb) {
      const img = document.createElement("img");
      img.className = "desktop-mode-my-wordpress__tooltip-thumb";
      img.src = thumb;
      img.alt = "";
      tip.appendChild(img);
    }
    const excerpt = stripTags(item.excerpt?.rendered ?? "");
    if (excerpt) {
      const p = document.createElement("p");
      p.className = "desktop-mode-my-wordpress__tooltip-excerpt";
      p.textContent = excerpt.length > 240 ? excerpt.slice(0, 237) + "…" : excerpt;
      tip.appendChild(p);
    }
    return tip;
  }
  function positionTooltip(tip, ev) {
    const offset = 16;
    let x = ev.clientX + offset;
    let y = ev.clientY + offset;
    const rect = tip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) {
      x = Math.max(8, ev.clientX - rect.width - offset);
    }
    if (y + rect.height > window.innerHeight - 8) {
      y = Math.max(8, ev.clientY - rect.height - offset);
    }
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  function selectTile(state, ctx, tile, entity, id) {
    if (ctx.selectedTile) {
      ctx.selectedTile.classList.remove(
        "desktop-mode-file-tile--selected"
      );
    }
    tile.classList.add("desktop-mode-file-tile--selected");
    ctx.selectedTile = tile;
    ctx.selectedId = id;
    void renderPreview(state, ctx, entity, id);
  }
  async function renderPreview(state, ctx, entity, id) {
    showPreviewLoading(ctx.preview);
    let detail;
    try {
      detail = await fetchEntityDetail(entity, id);
    } catch (err) {
      ctx.preview.replaceChildren();
      if (ctx.selectedId !== id) {
        return;
      }
      showPreviewError(ctx.preview, err);
      return;
    }
    if (ctx.selectedId !== id) {
      return;
    }
    appendPostArticle(ctx.preview, detail, entity, {
      onExplore: () => {
        navigate(state, {
          kind: "detail",
          entityId: entity.id,
          postId: detail.id,
          postTitle: stripTags(detail.title.rendered)
        });
      }
    });
  }
  function showPreviewLoading(host) {
    host.replaceChildren();
    const loading = document.createElement("div");
    loading.className = "desktop-mode-my-wordpress__preview-loading";
    const spinner = document.createElement("wpd-spinner");
    loading.appendChild(spinner);
    host.appendChild(loading);
  }
  function showPreviewError(host, err) {
    host.replaceChildren();
    const box = document.createElement("div");
    box.className = "desktop-mode-my-wordpress__error";
    box.textContent = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
    host.appendChild(box);
  }
  function appendPostArticle(host, detail, entity, opts = {}) {
    host.replaceChildren();
    const article = document.createElement("article");
    article.className = "desktop-mode-my-wordpress__article";
    const heading = document.createElement("h2");
    heading.className = "desktop-mode-my-wordpress__article-title";
    heading.textContent = stripTags(detail.title.rendered);
    article.appendChild(heading);
    const meta = buildPostMetaLine(detail);
    if (meta) {
      article.appendChild(meta);
    }
    const thumb = getThumbnail(detail);
    if (thumb) {
      const img = document.createElement("img");
      img.className = "desktop-mode-my-wordpress__article-hero";
      img.src = thumb;
      img.alt = "";
      article.appendChild(img);
    }
    const content = document.createElement("div");
    content.className = "desktop-mode-my-wordpress__article-content";
    content.innerHTML = detail.content.rendered;
    article.appendChild(content);
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-my-wordpress__article-footer";
    if (opts.onExplore) {
      const exploreBtn = document.createElement("wpd-button");
      exploreBtn.setAttribute("variant", "secondary");
      exploreBtn.textContent = __("Explore details", "desktop-mode");
      exploreBtn.title = __(
        "See author, comments, categories, tags, attached media, and revisions for this entry.",
        "desktop-mode"
      );
      exploreBtn.addEventListener("click", () => {
        opts.onExplore?.();
      });
      footer.appendChild(exploreBtn);
    }
    const editBtn = document.createElement("wpd-button");
    editBtn.setAttribute("variant", "primary");
    editBtn.textContent = __("Open in editor", "desktop-mode");
    editBtn.addEventListener("click", () => {
      openEditor(entity, detail.id, stripTags(detail.title.rendered));
    });
    footer.appendChild(editBtn);
    article.appendChild(footer);
    host.appendChild(article);
  }
  function buildPostMetaLine(detail) {
    const parts = [];
    const author = detail._embedded?.author?.[0];
    if (author?.name) {
      parts.push(author.name);
    }
    if (detail.date) {
      try {
        parts.push(
          new Date(detail.date).toLocaleDateString(void 0, {
            year: "numeric",
            month: "long",
            day: "numeric"
          })
        );
      } catch {
        parts.push(detail.date);
      }
    }
    if (detail.status && detail.status !== "publish") {
      parts.push(detail.status);
    }
    if (parts.length === 0) {
      return null;
    }
    const line = document.createElement("p");
    line.className = "desktop-mode-my-wordpress__article-meta";
    line.textContent = parts.join(" · ");
    return line;
  }
  function renderDetail(state, entity, postId, postTitle) {
    const split = document.createElement("div");
    split.className = "desktop-mode-my-wordpress__split";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list";
    const tiles = document.createElement("div");
    tiles.className = "desktop-mode-my-wordpress__tiles desktop-mode-my-wordpress__canvas";
    tiles.setAttribute("role", "list");
    left.appendChild(tiles);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    showPreviewLoading(right);
    split.appendChild(left);
    split.appendChild(right);
    state.body.appendChild(split);
    const layout = createTileLayout(
      tiles,
      `detail:${entity.id}:${postId}`
    );
    const menu = attachIconCanvasMenu(tiles, {
      scope: `my-wordpress:${entity.id}:detail:${postId}`,
      onSort: (mode) => layout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    state.teardown.push(() => layout.dispose());
    showLoadingSkeleton(tiles, layout, true);
    void (async () => {
      let detail;
      try {
        detail = await fetchEntityDetail(entity, postId);
      } catch (err) {
        hideLoadingSkeleton(tiles);
        renderListError(
          tiles,
          err instanceof Error ? err.message : __("Unknown error.", "desktop-mode")
        );
        showPreviewError(right, err);
        return;
      }
      if (state.route.kind !== "detail" || state.route.postId !== postId) {
        return;
      }
      hideLoadingSkeleton(tiles);
      const select = createTileSelector();
      const subFolders = [];
      let dateCounter = 0;
      const nextDate = () => new Date(2020, 0, 1 + dateCounter++).toISOString();
      const author = detail._embedded?.author?.[0];
      subFolders.push({
        relation: "author",
        label: author?.name ? sprintf(
          // translators: %s is an author display name.
          __("Author · %s", "desktop-mode"),
          author.name
        ) : __("Author", "desktop-mode"),
        icon: "dashicons-admin-users",
        count: 1,
        disabled: !detail.author,
        synthDate: nextDate()
      });
      const contributors = detail.desktop_mode_contributors ?? [];
      if (contributors.length > 0) {
        subFolders.push({
          relation: "contributors",
          label: sprintf(
            // translators: %d is a count of additional contributor users.
            _n(
              "Contributors · %d",
              "Contributors · %d",
              contributors.length
            ),
            contributors.length
          ),
          icon: "dashicons-groups",
          count: contributors.length,
          synthDate: nextDate()
        });
      }
      const commentsHref = (detail._links?.replies ?? [])[0];
      const commentCountFromLink = typeof commentsHref?.count === "number" ? commentsHref.count : null;
      const repliesEmbed = detail._embedded?.replies?.[0] ?? [];
      const commentCount = commentCountFromLink ?? repliesEmbed.length;
      subFolders.push({
        relation: "comments",
        label: sprintf(
          // translators: %d is a comment count.
          _n("Comments · %d", "Comments · %d", commentCount),
          commentCount
        ),
        icon: "dashicons-admin-comments",
        count: commentCount,
        disabled: detail.comment_status === "closed" && commentCount === 0,
        synthDate: nextDate()
      });
      const categoryIds = detail.categories ?? [];
      if (categoryIds.length > 0) {
        subFolders.push({
          relation: "categories",
          label: sprintf(
            // translators: %d is a category count.
            _n("Categories · %d", "Categories · %d", categoryIds.length),
            categoryIds.length
          ),
          icon: "dashicons-category",
          count: categoryIds.length,
          synthDate: nextDate()
        });
      }
      const tagIds = detail.tags ?? [];
      if (tagIds.length > 0) {
        subFolders.push({
          relation: "tags",
          label: sprintf(
            // translators: %d is a tag count.
            _n("Tags · %d", "Tags · %d", tagIds.length),
            tagIds.length
          ),
          icon: "dashicons-tag",
          count: tagIds.length,
          synthDate: nextDate()
        });
      }
      if (detail.featured_media && detail.featured_media > 0) {
        subFolders.push({
          relation: "media",
          label: __("Attached media", "desktop-mode"),
          icon: "dashicons-format-image",
          count: 1,
          synthDate: nextDate()
        });
      } else {
        subFolders.push({
          relation: "media",
          label: __("Attached media", "desktop-mode"),
          icon: "dashicons-admin-media",
          count: 0,
          synthDate: nextDate()
        });
      }
      subFolders.push({
        relation: "revisions",
        label: __("Revisions", "desktop-mode"),
        icon: "dashicons-backup",
        count: 0,
        synthDate: nextDate()
      });
      for (const sub of subFolders) {
        const tile = buildIconTile({
          role: "folder",
          icon: sub.icon,
          label: sub.label
        });
        tile.dataset.relation = sub.relation;
        if (sub.disabled) {
          tile.setAttribute("aria-disabled", "true");
        }
        const tileKey = `relation:${sub.relation}`;
        layout.place(tile, tileKey, {
          name: sub.label,
          date: sub.synthDate
        });
        tile.addEventListener("click", () => select(tile));
        if (!sub.disabled) {
          tile.addEventListener("dblclick", (e) => {
            e.preventDefault();
            navigate(state, {
              kind: "sub-list",
              entityId: entity.id,
              postId,
              postTitle,
              relation: sub.relation
            });
          });
        }
        tiles.appendChild(tile);
      }
      appendPostArticle(right, detail, entity);
      const segments = [
        {
          id: "count",
          label: pluralLabel(
            subFolders.length,
            "folder",
            "folders"
          ),
          align: "start",
          sort: 10
        }
      ];
      if (detail.status) {
        segments.push({
          id: "status",
          label: detail.status,
          align: "end",
          sort: 10
        });
      }
      paintStatus(state, segments, {
        view: "detail",
        entityId: entity.id,
        postId
      });
    })();
    paintStatus(
      state,
      [
        {
          id: "loading",
          label: __("Loading…", "desktop-mode"),
          align: "start",
          sort: 10
        }
      ],
      { view: "detail", entityId: entity.id, postId }
    );
  }
  function renderSubList(state, entity, postId, postTitle, relation) {
    const split = document.createElement("div");
    split.className = "desktop-mode-my-wordpress__split";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list";
    const tiles = document.createElement("div");
    tiles.className = "desktop-mode-my-wordpress__tiles desktop-mode-my-wordpress__canvas";
    tiles.setAttribute("role", "list");
    left.appendChild(tiles);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    const previewEmpty = document.createElement("div");
    previewEmpty.className = "desktop-mode-my-wordpress__preview-empty";
    previewEmpty.textContent = __(
      "Select an item to preview it here.",
      "desktop-mode"
    );
    right.appendChild(previewEmpty);
    split.appendChild(left);
    split.appendChild(right);
    state.body.appendChild(split);
    const layout = createTileLayout(
      tiles,
      `sub-list:${entity.id}:${postId}:${relation}`
    );
    const menu = attachIconCanvasMenu(tiles, {
      scope: `my-wordpress:${entity.id}:${relation}:${postId}`,
      onSort: (mode) => layout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    state.teardown.push(() => layout.dispose());
    showLoadingSkeleton(tiles, layout, true);
    paintStatus(
      state,
      [
        {
          id: "loading",
          label: __("Loading…", "desktop-mode"),
          align: "start",
          sort: 10
        }
      ],
      { view: "sub-list", entityId: entity.id, postId, relation }
    );
    void (async () => {
      let items;
      try {
        items = await loadSubItems(entity, postId, relation);
      } catch (err) {
        hideLoadingSkeleton(tiles);
        renderListError(
          tiles,
          err instanceof Error ? err.message : __("Unknown error.", "desktop-mode")
        );
        return;
      }
      if (state.route.kind !== "sub-list" || state.route.postId !== postId || state.route.relation !== relation) {
        return;
      }
      hideLoadingSkeleton(tiles);
      paintStatus(
        state,
        [
          {
            id: "count",
            label: pluralLabel(items.length, "item", "items"),
            align: "start",
            sort: 10
          }
        ],
        {
          view: "sub-list",
          entityId: entity.id,
          postId,
          relation
        }
      );
      if (items.length === 0) {
        renderListEmptyMessage(
          tiles,
          emptySubListMessage(relation)
        );
        return;
      }
      let selectedKey = null;
      let selectedTile = null;
      for (const item of items) {
        const tile = buildIconTile({
          role: "entry",
          icon: item.icon,
          label: item.label
        });
        tile.dataset.subItemId = item.id;
        const tileKey = `sub:${item.id}`;
        layout.place(tile, tileKey, {
          name: item.label,
          date: item.date
        });
        tile.addEventListener("click", () => {
          if (selectedTile) {
            selectedTile.classList.remove(
              "desktop-mode-file-tile--selected"
            );
          }
          tile.classList.add(
            "desktop-mode-file-tile--selected"
          );
          selectedTile = tile;
          selectedKey = tileKey;
          showPreviewLoading(right);
          Promise.resolve(item.preview()).then((node) => {
            if (selectedKey !== tileKey) {
              return;
            }
            right.replaceChildren(node);
          }).catch((err) => {
            if (selectedKey !== tileKey) {
              return;
            }
            showPreviewError(right, err);
          });
        });
        tiles.appendChild(tile);
      }
    })();
  }
  function renderListEmptyMessage(host, message) {
    const empty = document.createElement("div");
    empty.className = "desktop-mode-my-wordpress__empty";
    empty.textContent = message;
    host.appendChild(empty);
  }
  function emptySubListMessage(relation) {
    switch (relation) {
      case "comments":
        return __("No comments on this post yet.", "desktop-mode");
      case "categories":
        return __("No categories assigned.", "desktop-mode");
      case "tags":
        return __("No tags assigned.", "desktop-mode");
      case "media":
        return __("No media attached to this post.", "desktop-mode");
      case "revisions":
        return __("No revisions yet.", "desktop-mode");
      case "author":
        return __("No author available.", "desktop-mode");
      case "contributors":
        return __("No additional contributors.", "desktop-mode");
      default:
        return __("Nothing to show.", "desktop-mode");
    }
  }
  async function loadSubItems(entity, postId, relation) {
    if (relation === "comments") {
      const comments = await fetchComments(postId);
      return comments.map(commentToView);
    }
    if (relation === "media") {
      const detail = await fetchEntityDetail(entity, postId);
      const ids = /* @__PURE__ */ new Set();
      if (detail.featured_media && detail.featured_media > 0) {
        ids.add(detail.featured_media);
      }
      const serverList = detail.desktop_mode_attached_media;
      if (Array.isArray(serverList) && serverList.length > 0) {
        for (const id of serverList) {
          if (typeof id === "number" && id > 0) {
            ids.add(id);
          }
        }
      } else {
        extractContentMediaIds(detail.content?.rendered ?? "").forEach(
          (id) => ids.add(id)
        );
      }
      const [batched, parentAttached] = await Promise.all([
        fetchMediaByIds(Array.from(ids)).catch(() => []),
        fetchAttachedMedia(postId).catch(() => [])
      ]);
      const seen = /* @__PURE__ */ new Set();
      const merged = [];
      const featuredId = detail.featured_media ?? 0;
      const orderedFromBatch = batched.slice().sort((a, b) => {
        if (a.id === featuredId && b.id !== featuredId) {
          return -1;
        }
        if (b.id === featuredId && a.id !== featuredId) {
          return 1;
        }
        return 0;
      });
      for (const m of [...orderedFromBatch, ...parentAttached]) {
        if (seen.has(m.id)) {
          continue;
        }
        seen.add(m.id);
        merged.push(m);
      }
      return merged.map(mediaToView);
    }
    if (relation === "categories" || relation === "tags") {
      const detail = await fetchEntityDetail(entity, postId);
      const ids = relation === "categories" ? detail.categories ?? [] : detail.tags ?? [];
      const terms = await fetchTerms(
        relation === "categories" ? "categories" : "tags",
        ids
      );
      return terms.map(termToView);
    }
    if (relation === "author") {
      const detail = await fetchEntityDetail(entity, postId);
      if (!detail.author) {
        return [];
      }
      const user = await fetchUser(detail.author);
      return [userToView(user)];
    }
    if (relation === "contributors") {
      const detail = await fetchEntityDetail(entity, postId);
      const contribs = detail.desktop_mode_contributors ?? [];
      return contribs.map(contributorToView);
    }
    if (relation === "revisions") {
      const revs = await fetchRevisions(entity, postId);
      const ordered = revs.slice().sort((a, b) => {
        const ta = Date.parse(a.modified || a.date || "");
        const tb = Date.parse(b.modified || b.date || "");
        return tb - ta;
      });
      return ordered.map((r) => revisionToView(r, entity, postId));
    }
    return [];
  }
  function commentToView(c) {
    const author = c.author_name || __("Anonymous", "desktop-mode");
    return {
      id: `comment:${c.id}`,
      icon: "dashicons-admin-comments",
      label: author,
      date: c.date,
      preview: async () => renderCommentDossier(c)
    };
  }
  async function renderCommentDossier(c) {
    let stats = null;
    try {
      stats = await fetchCommentStats(c.id);
    } catch {
      stats = null;
    }
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-my-wordpress__article desktop-mode-my-wordpress__comment";
    if (!stats) {
      appendCommentHeader(wrap, {
        authorName: c.author_name || __("Anonymous", "desktop-mode"),
        avatarUrl: c.author_avatar_urls ? pickAvatar(c.author_avatar_urls) ?? "" : "",
        authorLink: "",
        authorWebsite: "",
        status: c.status || "approved",
        date: c.date,
        editLink: "",
        totalApproved: 0
      });
      const body2 = document.createElement("div");
      body2.className = "desktop-mode-my-wordpress__article-content desktop-mode-my-wordpress__comment-body";
      body2.innerHTML = c.content.rendered;
      wrap.appendChild(body2);
      return wrap;
    }
    const { author, comment, post, parent, replies } = stats;
    appendCommentHeader(wrap, {
      authorName: author.displayName || author.name || __("Anonymous", "desktop-mode"),
      avatarUrl: author.avatarUrl,
      authorLink: author.profileLink ?? "",
      authorWebsite: author.url ?? "",
      status: comment.status,
      date: comment.date,
      editLink: comment.editLink,
      totalApproved: author.totalApprovedComments
    });
    if (parent) {
      const quote = document.createElement("blockquote");
      quote.className = "desktop-mode-my-wordpress__comment-quote";
      const lead = document.createElement("div");
      lead.className = "desktop-mode-my-wordpress__comment-quote-lead";
      lead.textContent = sprintf(
        // translators: %s is the parent comment's author name.
        __("In reply to %s", "desktop-mode"),
        parent.authorName
      );
      quote.appendChild(lead);
      const excerpt = document.createElement("p");
      excerpt.textContent = parent.excerpt || "";
      quote.appendChild(excerpt);
      wrap.appendChild(quote);
    }
    const body = document.createElement("div");
    body.className = "desktop-mode-my-wordpress__article-content desktop-mode-my-wordpress__comment-body";
    body.innerHTML = comment.rendered;
    wrap.appendChild(body);
    if (post) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("On post", "desktop-mode");
      section.appendChild(h);
      const card = document.createElement("div");
      card.className = "desktop-mode-my-wordpress__comment-post";
      const titleEl = document.createElement("a");
      titleEl.className = "desktop-mode-my-wordpress__comment-post-title";
      titleEl.href = post.link;
      titleEl.target = "_blank";
      titleEl.rel = "noopener noreferrer";
      titleEl.textContent = post.title || `#${post.id}`;
      card.appendChild(titleEl);
      const meta = document.createElement("div");
      meta.className = "desktop-mode-my-wordpress__comment-post-meta";
      const parts = [];
      parts.push(formatDate(post.date));
      if (post.author?.name) {
        parts.push(post.author.name);
      }
      if (post.status && post.status !== "publish") {
        parts.push(post.status);
      }
      meta.textContent = parts.join(" · ");
      card.appendChild(meta);
      section.appendChild(card);
      wrap.appendChild(section);
    }
    if (replies.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = sprintf(
        // translators: %d is the number of direct replies to a comment.
        _n("Reply (%d)", "Replies (%d)", replies.length),
        replies.length
      );
      section.appendChild(h);
      const list = document.createElement("ul");
      list.className = "desktop-mode-my-wordpress__comment-replies";
      for (const r of replies) {
        const li = document.createElement("li");
        li.className = "desktop-mode-my-wordpress__comment-reply";
        if (r.avatarUrl) {
          const img = document.createElement("img");
          img.src = r.avatarUrl;
          img.alt = "";
          img.className = "desktop-mode-my-wordpress__comment-reply-avatar";
          li.appendChild(img);
        }
        const txt = document.createElement("div");
        txt.className = "desktop-mode-my-wordpress__comment-reply-text";
        const head = document.createElement("div");
        head.className = "desktop-mode-my-wordpress__comment-reply-head";
        const who = document.createElement("span");
        who.className = "desktop-mode-my-wordpress__comment-reply-name";
        who.textContent = r.authorName || __("Anonymous", "desktop-mode");
        head.appendChild(who);
        const when = document.createElement("span");
        when.className = "desktop-mode-my-wordpress__comment-reply-when";
        when.textContent = formatDate(r.date);
        head.appendChild(when);
        txt.appendChild(head);
        const ex = document.createElement("p");
        ex.className = "desktop-mode-my-wordpress__comment-reply-excerpt";
        ex.textContent = r.excerpt || "";
        txt.appendChild(ex);
        li.appendChild(txt);
        list.appendChild(li);
      }
      section.appendChild(list);
      wrap.appendChild(section);
    }
    if (comment.ip || comment.userAgent) {
      const dl = document.createElement("dl");
      dl.className = "desktop-mode-my-wordpress__user-milestones";
      if (comment.ip) {
        const dt = document.createElement("dt");
        dt.textContent = __("IP", "desktop-mode");
        dl.appendChild(dt);
        const dd = document.createElement("dd");
        dd.textContent = comment.ip;
        dl.appendChild(dd);
      }
      if (comment.userAgent) {
        const dt = document.createElement("dt");
        dt.textContent = __("User agent", "desktop-mode");
        dl.appendChild(dt);
        const dd = document.createElement("dd");
        dd.textContent = comment.userAgent;
        dl.appendChild(dd);
      }
      wrap.appendChild(dl);
    }
    return wrap;
  }
  function appendCommentHeader(host, header) {
    const wrap = document.createElement("header");
    wrap.className = "desktop-mode-my-wordpress__user-header";
    if (header.avatarUrl) {
      const img = document.createElement("img");
      img.src = header.avatarUrl;
      img.alt = "";
      img.className = "desktop-mode-my-wordpress__user-avatar";
      wrap.appendChild(img);
    }
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__user-headline";
    const h = document.createElement("h2");
    h.className = "desktop-mode-my-wordpress__article-title";
    h.textContent = header.authorName;
    right.appendChild(h);
    const badges = document.createElement("div");
    badges.className = "desktop-mode-my-wordpress__user-roles";
    const status = document.createElement("span");
    status.className = "desktop-mode-my-wordpress__user-role desktop-mode-my-wordpress__comment-status--" + (header.status || "approved");
    status.textContent = header.status || "approved";
    badges.appendChild(status);
    const dateBadge = document.createElement("span");
    dateBadge.className = "desktop-mode-my-wordpress__user-role desktop-mode-my-wordpress__comment-date-badge";
    dateBadge.textContent = formatDate(header.date);
    badges.appendChild(dateBadge);
    if (header.totalApproved > 1) {
      const totalBadge = document.createElement("span");
      totalBadge.className = "desktop-mode-my-wordpress__user-role";
      totalBadge.textContent = sprintf(
        // translators: %d is a comment count for a particular author.
        _n(
          "%d comment site-wide",
          "%d comments site-wide",
          header.totalApproved
        ),
        header.totalApproved
      );
      badges.appendChild(totalBadge);
    }
    right.appendChild(badges);
    const links = document.createElement("div");
    links.className = "desktop-mode-my-wordpress__user-links";
    if (header.authorLink) {
      const a = document.createElement("a");
      a.href = header.authorLink;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Author archive", "desktop-mode");
      links.appendChild(a);
    }
    if (header.authorWebsite) {
      const a = document.createElement("a");
      a.href = header.authorWebsite;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Website", "desktop-mode");
      links.appendChild(a);
    }
    if (header.editLink) {
      const a = document.createElement("a");
      a.href = header.editLink;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Moderate", "desktop-mode");
      links.appendChild(a);
    }
    if (links.childElementCount > 0) {
      right.appendChild(links);
    }
    wrap.appendChild(right);
    host.appendChild(wrap);
  }
  function userToView(u) {
    return {
      id: `user:${u.id}`,
      icon: "dashicons-admin-users",
      label: u.name || u.slug || `#${u.id}`,
      date: (/* @__PURE__ */ new Date(0)).toISOString(),
      preview: async () => {
        const fallbackName = u.name || u.slug || `#${u.id}`;
        const fallbackAvatar = pickAvatar(u.avatar_urls) ?? "";
        return renderUserDossier({
          userId: u.id,
          fallbackName,
          fallbackAvatar,
          fallbackDescription: u.description ?? ""
        });
      }
    };
  }
  function contributorToView(c) {
    return {
      id: `contributor:${c.userId}`,
      icon: "dashicons-admin-users",
      label: c.userName || `#${c.userId}`,
      date: (/* @__PURE__ */ new Date(0)).toISOString(),
      preview: async () => renderUserDossier({
        userId: c.userId,
        fallbackName: c.userName,
        fallbackAvatar: c.userAvatarUrl,
        fallbackDescription: ""
      })
    };
  }
  async function renderUserDossier(opts) {
    let stats = null;
    try {
      stats = await fetchUserStats(opts.userId);
    } catch {
      stats = null;
    }
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-my-wordpress__article desktop-mode-my-wordpress__user";
    if (!stats) {
      let basic = null;
      try {
        basic = await fetchUser(opts.userId);
      } catch {
        basic = null;
      }
      appendUserHeader(wrap, {
        name: basic?.name ?? opts.fallbackName,
        avatarUrl: basic && pickAvatar(basic.avatar_urls) || opts.fallbackAvatar,
        roles: [],
        website: "",
        link: basic?.link ?? ""
      });
      const desc = basic?.description ?? opts.fallbackDescription;
      if (desc) {
        const bio = document.createElement("div");
        bio.className = "desktop-mode-my-wordpress__user-bio";
        bio.textContent = desc;
        wrap.appendChild(bio);
      }
      return wrap;
    }
    const { profile, counts, recent, topTerms, milestones, activity: activity2 } = stats;
    appendUserHeader(wrap, {
      name: profile.name || opts.fallbackName,
      avatarUrl: profile.avatarUrl || opts.fallbackAvatar,
      roles: profile.roleLabels ?? [],
      website: profile.website,
      link: profile.link
    });
    if (profile.description) {
      const bio = document.createElement("div");
      bio.className = "desktop-mode-my-wordpress__user-bio";
      bio.textContent = profile.description;
      wrap.appendChild(bio);
    }
    const cards = document.createElement("div");
    cards.className = "desktop-mode-my-wordpress__user-stats";
    cards.appendChild(
      buildStatCard(
        counts.posts.total.toLocaleString(),
        __("Posts", "desktop-mode"),
        counts.posts.publish > 0 ? sprintf(
          // translators: %d is a published-post count.
          __("%d published", "desktop-mode"),
          counts.posts.publish
        ) : ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.pages.total.toLocaleString(),
        __("Pages", "desktop-mode"),
        counts.pages.publish > 0 ? sprintf(
          // translators: %d is a published-page count.
          __("%d published", "desktop-mode"),
          counts.pages.publish
        ) : ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.commentsReceived.toLocaleString(),
        __("Comments received", "desktop-mode"),
        ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.commentsLeft.toLocaleString(),
        __("Comments left", "desktop-mode"),
        ""
      )
    );
    wrap.appendChild(cards);
    const spark = buildActivitySparkline(activity2);
    if (spark) {
      wrap.appendChild(spark);
    }
    const milestoneRow = buildMilestonesRow(profile, milestones);
    if (milestoneRow) {
      wrap.appendChild(milestoneRow);
    }
    if (recent.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("Recent posts", "desktop-mode");
      section.appendChild(h);
      const ul = document.createElement("ul");
      ul.className = "desktop-mode-my-wordpress__user-recent";
      for (const r of recent) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = r.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = r.title || `#${r.id}`;
        li.appendChild(a);
        const meta = document.createElement("span");
        meta.className = "desktop-mode-my-wordpress__user-recent-meta";
        meta.textContent = `${formatDate(r.date)} · ${r.status}`;
        li.appendChild(meta);
        ul.appendChild(li);
      }
      section.appendChild(ul);
      wrap.appendChild(section);
    }
    if (topTerms.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("Top categories & tags", "desktop-mode");
      section.appendChild(h);
      const chips = document.createElement("div");
      chips.className = "desktop-mode-my-wordpress__user-chips";
      for (const t of topTerms) {
        const chip = document.createElement("span");
        chip.className = "desktop-mode-my-wordpress__user-chip " + (t.taxonomy === "post_tag" ? "desktop-mode-my-wordpress__user-chip--tag" : "desktop-mode-my-wordpress__user-chip--category");
        const name = document.createElement("span");
        name.textContent = t.name;
        chip.appendChild(name);
        const count = document.createElement("span");
        count.className = "desktop-mode-my-wordpress__user-chip-count";
        count.textContent = String(t.count);
        chip.appendChild(count);
        chips.appendChild(chip);
      }
      section.appendChild(chips);
      wrap.appendChild(section);
    }
    return wrap;
  }
  function appendUserHeader(host, header) {
    const wrap = document.createElement("header");
    wrap.className = "desktop-mode-my-wordpress__user-header";
    if (header.avatarUrl) {
      const img = document.createElement("img");
      img.src = header.avatarUrl;
      img.alt = "";
      img.className = "desktop-mode-my-wordpress__user-avatar";
      wrap.appendChild(img);
    }
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__user-headline";
    const h = document.createElement("h2");
    h.className = "desktop-mode-my-wordpress__article-title";
    h.textContent = header.name;
    right.appendChild(h);
    if (header.roles.length > 0) {
      const rolesRow = document.createElement("div");
      rolesRow.className = "desktop-mode-my-wordpress__user-roles";
      for (const r of header.roles) {
        const badge = document.createElement("span");
        badge.className = "desktop-mode-my-wordpress__user-role";
        badge.textContent = r;
        rolesRow.appendChild(badge);
      }
      right.appendChild(rolesRow);
    }
    const links = document.createElement("div");
    links.className = "desktop-mode-my-wordpress__user-links";
    if (header.link) {
      const a = document.createElement("a");
      a.href = header.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Author archive", "desktop-mode");
      links.appendChild(a);
    }
    if (header.website) {
      const a = document.createElement("a");
      a.href = header.website;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Website", "desktop-mode");
      links.appendChild(a);
    }
    if (links.childElementCount > 0) {
      right.appendChild(links);
    }
    wrap.appendChild(right);
    host.appendChild(wrap);
  }
  function buildStatCard(value, label, caption) {
    const card = document.createElement("div");
    card.className = "desktop-mode-my-wordpress__user-stat";
    const v = document.createElement("span");
    v.className = "desktop-mode-my-wordpress__user-stat-value";
    v.textContent = value;
    card.appendChild(v);
    const l = document.createElement("span");
    l.className = "desktop-mode-my-wordpress__user-stat-label";
    l.textContent = label;
    card.appendChild(l);
    if (caption) {
      const c = document.createElement("span");
      c.className = "desktop-mode-my-wordpress__user-stat-caption";
      c.textContent = caption;
      card.appendChild(c);
    }
    return card;
  }
  function buildActivitySparkline(activity2) {
    if (activity2.length === 0) {
      return null;
    }
    const now = /* @__PURE__ */ new Date();
    const months = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const found = activity2.find((a) => a.ym === ym);
      months.push({
        ym,
        count: found?.count ?? 0,
        label: d.toLocaleString(void 0, { month: "short" })
      });
    }
    const max = Math.max(1, ...months.map((m) => m.count));
    const wrap = document.createElement("section");
    wrap.className = "desktop-mode-my-wordpress__user-section desktop-mode-my-wordpress__user-spark";
    const h = document.createElement("h3");
    h.textContent = __("Activity (last 12 months)", "desktop-mode");
    wrap.appendChild(h);
    const chart = document.createElement("div");
    chart.className = "desktop-mode-my-wordpress__user-spark-chart";
    for (const m of months) {
      const col = document.createElement("div");
      col.className = "desktop-mode-my-wordpress__user-spark-col";
      const bar = document.createElement("div");
      bar.className = "desktop-mode-my-wordpress__user-spark-bar";
      bar.style.height = `${Math.round(m.count / max * 100)}%`;
      bar.title = sprintf(
        // translators: 1: month label, 2: post count.
        __("%1$s · %2$d posts", "desktop-mode"),
        m.label,
        m.count
      );
      if (m.count === 0) {
        bar.classList.add("desktop-mode-my-wordpress__user-spark-bar--empty");
      }
      col.appendChild(bar);
      const lbl = document.createElement("span");
      lbl.className = "desktop-mode-my-wordpress__user-spark-label";
      lbl.textContent = m.label;
      col.appendChild(lbl);
      chart.appendChild(col);
    }
    wrap.appendChild(chart);
    return wrap;
  }
  function buildMilestonesRow(profile, milestones) {
    const items = [];
    if (profile.registered) {
      items.push({
        label: __("Member since", "desktop-mode"),
        value: formatYearMonth(profile.registered)
      });
    }
    if (milestones.firstPublished) {
      items.push({
        label: __("First published", "desktop-mode"),
        value: formatYearMonth(milestones.firstPublished)
      });
    }
    if (milestones.lastPublished) {
      items.push({
        label: __("Last published", "desktop-mode"),
        value: formatYearMonth(milestones.lastPublished)
      });
    }
    if (items.length === 0) {
      return null;
    }
    const dl = document.createElement("dl");
    dl.className = "desktop-mode-my-wordpress__user-milestones";
    for (const item of items) {
      const dt = document.createElement("dt");
      dt.textContent = item.label;
      dl.appendChild(dt);
      const dd = document.createElement("dd");
      dd.textContent = item.value;
      dl.appendChild(dd);
    }
    return dl;
  }
  function formatYearMonth(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleString(void 0, {
        year: "numeric",
        month: "long"
      });
    } catch {
      return iso;
    }
  }
  function pickAvatar(avatars) {
    if (!avatars) {
      return null;
    }
    return avatars["96"] ?? avatars["48"] ?? avatars["24"] ?? Object.values(avatars)[0] ?? null;
  }
  function termToView(t) {
    return {
      id: `term:${t.id}`,
      icon: t.taxonomy === "post_tag" ? "dashicons-tag" : "dashicons-category",
      label: t.name,
      date: (/* @__PURE__ */ new Date(0)).toISOString(),
      preview: async () => renderTermDossier(t)
    };
  }
  async function renderTermDossier(t) {
    let stats = null;
    try {
      stats = await fetchTermStats(t.taxonomy, t.id);
    } catch {
      stats = null;
    }
    const wrap = document.createElement("div");
    wrap.className = "desktop-mode-my-wordpress__article desktop-mode-my-wordpress__term";
    if (!stats) {
      appendTermHeader(wrap, {
        name: t.name,
        taxonomyLabel: t.taxonomy,
        isTag: t.taxonomy === "post_tag",
        count: t.count ?? 0,
        link: t.link ?? "",
        parentName: ""
      });
      if (t.description) {
        const body = document.createElement("div");
        body.className = "desktop-mode-my-wordpress__user-bio";
        body.innerHTML = t.description;
        wrap.appendChild(body);
      }
      return wrap;
    }
    const { profile, counts, recent, topAuthors, coTerms, milestones, activity: activity2 } = stats;
    appendTermHeader(wrap, {
      name: profile.name,
      taxonomyLabel: profile.taxonomyLabel || profile.taxonomy,
      isTag: profile.taxonomy === "post_tag",
      count: profile.storedCount,
      link: profile.link,
      parentName: profile.parentName ?? ""
    });
    if (profile.description) {
      const bio = document.createElement("div");
      bio.className = "desktop-mode-my-wordpress__user-bio";
      bio.innerHTML = profile.description;
      wrap.appendChild(bio);
    }
    const cards = document.createElement("div");
    cards.className = "desktop-mode-my-wordpress__user-stats";
    cards.appendChild(
      buildStatCard(
        counts.posts.total.toLocaleString(),
        __("Posts", "desktop-mode"),
        counts.posts.publish > 0 ? sprintf(
          // translators: %d is a published-post count.
          __("%d published", "desktop-mode"),
          counts.posts.publish
        ) : ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.commentsReceived.toLocaleString(),
        __("Comments", "desktop-mode"),
        ""
      )
    );
    cards.appendChild(
      buildStatCard(
        counts.distinctAuthors.toLocaleString(),
        __("Authors", "desktop-mode"),
        counts.distinctAuthors === 1 ? __("one contributor", "desktop-mode") : ""
      )
    );
    wrap.appendChild(cards);
    const spark = buildActivitySparkline(activity2);
    if (spark) {
      wrap.appendChild(spark);
    }
    const milestoneRow = buildTermMilestonesRow(milestones);
    if (milestoneRow) {
      wrap.appendChild(milestoneRow);
    }
    if (topAuthors.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("Top contributors", "desktop-mode");
      section.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "desktop-mode-my-wordpress__term-authors";
      for (const a of topAuthors) {
        const card = document.createElement("div");
        card.className = "desktop-mode-my-wordpress__term-author";
        if (a.userAvatarUrl) {
          const img = document.createElement("img");
          img.src = a.userAvatarUrl;
          img.alt = "";
          img.className = "desktop-mode-my-wordpress__term-author-avatar";
          card.appendChild(img);
        }
        const text = document.createElement("div");
        text.className = "desktop-mode-my-wordpress__term-author-text";
        const name = document.createElement("span");
        name.className = "desktop-mode-my-wordpress__term-author-name";
        name.textContent = a.userName;
        text.appendChild(name);
        const count = document.createElement("span");
        count.className = "desktop-mode-my-wordpress__term-author-count";
        count.textContent = sprintf(
          // translators: %d is a post count.
          _n("%d post", "%d posts", a.count),
          a.count
        );
        text.appendChild(count);
        card.appendChild(text);
        grid.appendChild(card);
      }
      section.appendChild(grid);
      wrap.appendChild(section);
    }
    if (recent.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = __("Recent posts", "desktop-mode");
      section.appendChild(h);
      const ul = document.createElement("ul");
      ul.className = "desktop-mode-my-wordpress__user-recent";
      for (const r of recent) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = r.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = r.title || `#${r.id}`;
        li.appendChild(a);
        const meta = document.createElement("span");
        meta.className = "desktop-mode-my-wordpress__user-recent-meta";
        meta.textContent = `${formatDate(r.date)} · ${r.status}${r.author?.name ? " · " + r.author.name : ""}`;
        li.appendChild(meta);
        ul.appendChild(li);
      }
      section.appendChild(ul);
      wrap.appendChild(section);
    }
    if (coTerms.length > 0) {
      const section = document.createElement("section");
      section.className = "desktop-mode-my-wordpress__user-section";
      const h = document.createElement("h3");
      h.textContent = profile.taxonomy === "post_tag" ? __("Often paired tags", "desktop-mode") : __("Often paired categories", "desktop-mode");
      section.appendChild(h);
      const chips = document.createElement("div");
      chips.className = "desktop-mode-my-wordpress__user-chips";
      for (const co of coTerms) {
        const chip = document.createElement("span");
        chip.className = "desktop-mode-my-wordpress__user-chip " + (profile.taxonomy === "post_tag" ? "desktop-mode-my-wordpress__user-chip--tag" : "desktop-mode-my-wordpress__user-chip--category");
        const name = document.createElement("span");
        name.textContent = co.name;
        chip.appendChild(name);
        const count = document.createElement("span");
        count.className = "desktop-mode-my-wordpress__user-chip-count";
        count.textContent = String(co.count);
        chip.appendChild(count);
        chips.appendChild(chip);
      }
      section.appendChild(chips);
      wrap.appendChild(section);
    }
    return wrap;
  }
  function appendTermHeader(host, header) {
    const wrap = document.createElement("header");
    wrap.className = "desktop-mode-my-wordpress__term-header";
    const iconHost = document.createElement("span");
    iconHost.className = "desktop-mode-my-wordpress__term-icon " + (header.isTag ? "desktop-mode-my-wordpress__term-icon--tag" : "desktop-mode-my-wordpress__term-icon--category");
    const iconGlyph = document.createElement("span");
    iconGlyph.style.cssText = "font-family:dashicons;font-size:32px;line-height:1;display:inline-block;";
    iconGlyph.textContent = header.isTag ? "" : "";
    iconHost.appendChild(iconGlyph);
    wrap.appendChild(iconHost);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__user-headline";
    const h = document.createElement("h2");
    h.className = "desktop-mode-my-wordpress__article-title";
    h.textContent = header.name;
    right.appendChild(h);
    const meta = document.createElement("div");
    meta.className = "desktop-mode-my-wordpress__user-roles";
    const taxBadge = document.createElement("span");
    taxBadge.className = "desktop-mode-my-wordpress__user-role " + (header.isTag ? "desktop-mode-my-wordpress__user-role--tag" : "desktop-mode-my-wordpress__user-role--category");
    taxBadge.textContent = header.taxonomyLabel;
    meta.appendChild(taxBadge);
    if (header.parentName) {
      const parent = document.createElement("span");
      parent.className = "desktop-mode-my-wordpress__user-role";
      parent.textContent = sprintf(
        // translators: %s is the name of the parent category.
        __("in %s", "desktop-mode"),
        header.parentName
      );
      meta.appendChild(parent);
    }
    right.appendChild(meta);
    if (header.link) {
      const links = document.createElement("div");
      links.className = "desktop-mode-my-wordpress__user-links";
      const a = document.createElement("a");
      a.href = header.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("View archive", "desktop-mode");
      links.appendChild(a);
      right.appendChild(links);
    }
    wrap.appendChild(right);
    host.appendChild(wrap);
  }
  function buildTermMilestonesRow(milestones) {
    const items = [];
    if (milestones.firstPosted) {
      items.push({
        label: __("First post", "desktop-mode"),
        value: formatYearMonth(milestones.firstPosted)
      });
    }
    if (milestones.lastPosted) {
      items.push({
        label: __("Last post", "desktop-mode"),
        value: formatYearMonth(milestones.lastPosted)
      });
    }
    if (items.length === 0) {
      return null;
    }
    const dl = document.createElement("dl");
    dl.className = "desktop-mode-my-wordpress__user-milestones";
    for (const item of items) {
      const dt = document.createElement("dt");
      dt.textContent = item.label;
      dl.appendChild(dt);
      const dd = document.createElement("dd");
      dd.textContent = item.value;
      dl.appendChild(dd);
    }
    return dl;
  }
  function mediaToView(m) {
    const isImage = m.mime_type.startsWith("image/");
    return {
      id: `media:${m.id}`,
      icon: isImage ? "dashicons-format-image" : "dashicons-media-default",
      label: stripTags(m.title.rendered) || `#${m.id}`,
      date: m.date,
      preview: () => {
        const wrap = document.createElement("div");
        wrap.className = "desktop-mode-my-wordpress__article";
        const h = document.createElement("h2");
        h.className = "desktop-mode-my-wordpress__article-title";
        h.textContent = stripTags(m.title.rendered) || `#${m.id}`;
        wrap.appendChild(h);
        const meta = document.createElement("p");
        meta.className = "desktop-mode-my-wordpress__article-meta";
        meta.textContent = `${m.mime_type} · ${formatDate(m.date)}`;
        wrap.appendChild(meta);
        if (isImage) {
          const img = document.createElement("img");
          img.className = "desktop-mode-my-wordpress__article-hero";
          const sizes = m.media_details?.sizes;
          img.src = sizes?.large?.source_url ?? sizes?.medium?.source_url ?? m.source_url;
          img.alt = m.alt_text ?? "";
          wrap.appendChild(img);
        } else {
          const link = document.createElement("p");
          const a = document.createElement("a");
          a.href = m.source_url;
          a.textContent = m.source_url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          link.appendChild(a);
          wrap.appendChild(link);
        }
        return wrap;
      }
    };
  }
  function revisionToView(r, entity, postId) {
    const label = stripTags(r.title?.rendered ?? "") || formatDate(r.date);
    return {
      id: `revision:${r.id}`,
      icon: "dashicons-backup",
      label,
      date: r.modified || r.date,
      preview: async () => {
        let detail = null;
        try {
          detail = await fetchRevision(entity, postId, r.id);
        } catch {
          detail = null;
        }
        const wrap = document.createElement("article");
        wrap.className = "desktop-mode-my-wordpress__article";
        const h = document.createElement("h2");
        h.className = "desktop-mode-my-wordpress__article-title";
        h.textContent = stripTags(detail?.title?.rendered ?? r.title?.rendered ?? "") || label;
        wrap.appendChild(h);
        const meta = document.createElement("p");
        meta.className = "desktop-mode-my-wordpress__article-meta";
        meta.textContent = sprintf(
          // translators: %s is a formatted date.
          __("Saved %s", "desktop-mode"),
          formatDate(detail?.modified || detail?.date || r.modified || r.date)
        );
        wrap.appendChild(meta);
        const html2 = detail?.content?.rendered ?? "";
        if (html2) {
          const content = document.createElement("div");
          content.className = "desktop-mode-my-wordpress__article-content";
          content.innerHTML = html2;
          wrap.appendChild(content);
        } else {
          const empty = document.createElement("p");
          empty.className = "desktop-mode-my-wordpress__article-meta";
          empty.textContent = detail ? __("This revision has no rendered content.", "desktop-mode") : __(
            "Couldn’t load the revision content. You may not have permission to view it.",
            "desktop-mode"
          );
          wrap.appendChild(empty);
        }
        return wrap;
      }
    };
  }
  function formatDate(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }
  function openEditor(entity, id, title) {
    const url = buildEditUrl(id);
    openIframeWindow({
      id: `${entity.id}-edit-${id}`,
      url,
      title,
      icon: entity.icon
    });
  }
  function openTileMenu(state, ctx, entity, item, title, pos) {
    closeAnyTileMenu();
    const menu = document.createElement("wpd-context-menu");
    menu.setAttribute("open", "");
    menu.classList.add("desktop-mode-my-wordpress__menu");
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    const addOption = (id, label, icon, danger = false) => {
      const opt = document.createElement("wpd-context-menu-option");
      opt.dataset.menuItemId = id;
      opt.setAttribute("value", id);
      opt.setAttribute("icon", sanitizeClass(icon));
      if (danger) {
        opt.setAttribute("danger", "");
      }
      opt.textContent = label;
      menu.appendChild(opt);
    };
    const baseOptions = [
      {
        id: "open",
        label: __("Open in editor", "desktop-mode"),
        icon: "dashicons-edit"
      },
      {
        id: "navigate-into",
        label: __("Navigate into", "desktop-mode"),
        icon: "dashicons-category"
      },
      {
        id: "trash",
        label: __("Move to Trash", "desktop-mode"),
        icon: "dashicons-trash",
        danger: true
      }
    ];
    const ctxFilter = {
      entityId: entity.id,
      kind: entity.kind ?? "post",
      item
    };
    const options = applyFilters(
      "desktop-mode.my-wordpress.tile-context-menu",
      baseOptions,
      ctxFilter
    );
    const finalOptions = Array.isArray(options) ? options : baseOptions;
    for (const o of finalOptions) {
      addOption(o.id, o.label, o.icon, o.danger);
    }
    menu.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      closeAnyTileMenu();
      if (detail.id === "open") {
        openEditor(entity, item.id, title);
        return;
      }
      if (detail.id === "navigate-into") {
        navigate(state, {
          kind: "detail",
          entityId: entity.id,
          postId: item.id,
          postTitle: title
        });
        return;
      }
      if (detail.id === "trash") {
        void confirmTrash(state, ctx, entity, item.id, title);
        return;
      }
      const match = finalOptions.find((o) => o.id === detail.id);
      if (match && typeof match.onSelect === "function") {
        try {
          match.onSelect();
        } catch (err) {
          console.error(
            `[my-wordpress] tile-context-menu '${detail.id}' onSelect threw:`,
            err
          );
        }
      }
    });
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(
        0,
        window.innerWidth - rect.width - 8
      )}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(
        0,
        window.innerHeight - rect.height - 8
      )}px`;
    }
    queueMicrotask(() => {
      const onDocPointerDown = (ev) => {
        const target = ev.target;
        if (target instanceof Node && menu.contains(target)) {
          return;
        }
        closeAnyTileMenu();
      };
      const onDocKey = (ev) => {
        if (ev.key === "Escape") {
          closeAnyTileMenu();
        }
      };
      document.addEventListener("pointerdown", onDocPointerDown, true);
      document.addEventListener("keydown", onDocKey);
      menu.addEventListener("tile-menu-closed", () => {
        document.removeEventListener(
          "pointerdown",
          onDocPointerDown,
          true
        );
        document.removeEventListener("keydown", onDocKey);
      });
    });
  }
  function closeAnyTileMenu() {
    document.querySelectorAll("wpd-context-menu.desktop-mode-my-wordpress__menu").forEach((n) => {
      n.dispatchEvent(new CustomEvent("tile-menu-closed"));
      n.remove();
    });
  }
  async function confirmTrash(state, ctx, entity, id, title) {
    const ok = await wpdConfirmGlobal({
      title: __("Move to Trash", "desktop-mode"),
      message: sprintf(
        // translators: %s is the entry title.
        __('Move "%s" to Trash?', "desktop-mode"),
        title
      ),
      confirmLabel: __("Move to Trash", "desktop-mode"),
      cancelLabel: __("Cancel", "desktop-mode"),
      danger: true
    });
    if (!ok) {
      return;
    }
    try {
      await trashEntity(entity, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
      showToast(msg);
      return;
    }
    const tile = ctx.tiles.querySelector(
      `[data-entry-id="${id}"]`
    );
    tile?.remove();
    if (ctx.selectedId === id) {
      ctx.selectedId = null;
      ctx.selectedTile = null;
      ctx.preview.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "desktop-mode-my-wordpress__preview-empty";
      empty.textContent = __(
        "Select an entry to preview it here.",
        "desktop-mode"
      );
      ctx.preview.appendChild(empty);
    }
  }
  function showToast(message) {
    const toast = window.wp?.desktop?.toast;
    if (typeof toast === "function") {
      toast({ message });
      return;
    }
    console.info("[my-wordpress]", message);
  }
  function renderUserEntityList(state, entity) {
    const cfg = getConfig();
    const initialQuery = lastQueryByEntity.get(entity.id) ?? "";
    const toolbar = renderListToolbar({
      placeholder: __("Search users…", "desktop-mode"),
      ariaLabel: __("Search users", "desktop-mode"),
      initialValue: initialQuery,
      onSearchChange: (q) => {
        lastQueryByEntity.set(entity.id, q);
        void resetForSearch(q);
      }
    });
    state.body.appendChild(toolbar.host);
    state.teardown.push(() => toolbar.destroy());
    const split = document.createElement("div");
    split.className = "desktop-mode-my-wordpress__split";
    const left = document.createElement("div");
    left.className = "desktop-mode-my-wordpress__list";
    const tiles = document.createElement("div");
    tiles.className = "desktop-mode-my-wordpress__tiles desktop-mode-my-wordpress__canvas desktop-mode-my-wordpress__canvas--users";
    tiles.setAttribute("role", "list");
    left.appendChild(tiles);
    const sentinel = document.createElement("div");
    sentinel.className = "desktop-mode-my-wordpress__sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    left.appendChild(sentinel);
    const right = document.createElement("div");
    right.className = "desktop-mode-my-wordpress__preview";
    const previewEmpty = document.createElement("div");
    previewEmpty.className = "desktop-mode-my-wordpress__preview-empty";
    previewEmpty.textContent = __(
      "Select a user to see their profile here.",
      "desktop-mode"
    );
    right.appendChild(previewEmpty);
    split.appendChild(left);
    split.appendChild(right);
    state.body.appendChild(split);
    const tileLayout = createTileLayout(tiles, `entity:${entity.id}`);
    const menu = attachIconCanvasMenu(tiles, {
      scope: `my-wordpress:${entity.id}`,
      onSort: (mode) => tileLayout.sort(mode)
    });
    state.teardown.push(() => menu.dispose());
    const ctx = {
      page: 0,
      totalPages: 1,
      total: 0,
      loaded: 0,
      loading: false,
      done: false,
      tiles,
      sentinel,
      preview: right,
      selectedId: null,
      selectedTile: null,
      observer: null,
      layout: tileLayout,
      query: initialQuery,
      abort: null
    };
    state.teardown.push(() => tileLayout.dispose());
    state.teardown.push(() => ctx.abort?.abort());
    const repaintListStatus = () => {
      let itemLabel;
      if (ctx.total === 0 && ctx.loaded === 0) {
        itemLabel = pluralLabel(0, "user", "users");
      } else if (ctx.total > ctx.loaded && ctx.loaded > 0) {
        itemLabel = sprintf(
          // translators: 1: visible user count, 2: total user count.
          __("%1$d of %2$d users", "desktop-mode"),
          ctx.loaded,
          ctx.total
        );
      } else {
        itemLabel = pluralLabel(
          Math.max(ctx.total, ctx.loaded),
          "user",
          "users"
        );
      }
      const segments = [
        { id: "count", label: itemLabel, align: "start", sort: 10 }
      ];
      if (ctx.totalPages > 1) {
        segments.push({
          id: "page",
          label: sprintf(
            // translators: 1: current page, 2: total pages.
            __("Page %1$d of %2$d", "desktop-mode"),
            Math.max(ctx.page, 1),
            ctx.totalPages
          ),
          align: "end",
          sort: 10
        });
      }
      paintStatus(state, segments, {
        view: "list",
        entityId: entity.id
      });
    };
    repaintListStatus();
    const sentinelIsVisible = () => {
      const sr = sentinel.getBoundingClientRect();
      const rr = left.getBoundingClientRect();
      const slack = 200;
      return sr.top < rr.bottom + slack && sr.bottom > rr.top - slack;
    };
    const loadMore = async () => {
      if (ctx.loading || ctx.done) {
        return;
      }
      ctx.loading = true;
      const nextPage = ctx.page + 1;
      const isFirst = nextPage === 1;
      const queryAtFetchTime = ctx.query;
      showLoadingSkeleton(tiles, ctx.layout, isFirst);
      const controller = new AbortController();
      ctx.abort = controller;
      try {
        const result = await fetchUserList(entity, {
          page: nextPage,
          perPage: cfg.perPage,
          search: queryAtFetchTime || void 0,
          signal: controller.signal
        });
        if (ctx.query !== queryAtFetchTime) {
          return;
        }
        ctx.page = nextPage;
        ctx.totalPages = result.totalPages;
        ctx.total = result.total;
        hideLoadingSkeleton(tiles);
        if (result.items.length === 0 && isFirst) {
          renderListEmptyMessage(
            tiles,
            queryAtFetchTime ? sprintf(
              // translators: %s is the user-entered search query.
              __('No users match "%s".', "desktop-mode"),
              queryAtFetchTime
            ) : __("No users to show.", "desktop-mode")
          );
          ctx.done = true;
          repaintListStatus();
          return;
        }
        for (const item of result.items) {
          tiles.appendChild(
            buildUserTile(state, ctx, entity, item)
          );
          ctx.loaded += 1;
        }
        if (ctx.page >= ctx.totalPages) {
          ctx.done = true;
        }
        repaintListStatus();
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        hideLoadingSkeleton(tiles);
        const msg = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
        renderListError(tiles, msg);
        ctx.done = true;
      } finally {
        ctx.loading = false;
        if (ctx.abort === controller) {
          ctx.abort = null;
        }
      }
      if (!ctx.done) {
        requestAnimationFrame(() => {
          if (sentinelIsVisible()) {
            void loadMore();
          }
        });
      }
    };
    const resetForSearch = async (q) => {
      ctx.abort?.abort();
      ctx.abort = null;
      ctx.query = q;
      tiles.classList.add(
        "desktop-mode-my-wordpress__tiles--searching"
      );
      hideLoadingSkeleton(tiles);
      const controller = new AbortController();
      ctx.abort = controller;
      ctx.loading = true;
      try {
        const result = await fetchUserList(entity, {
          page: 1,
          perPage: cfg.perPage,
          search: q || void 0,
          signal: controller.signal
        });
        if (ctx.query !== q) {
          return;
        }
        tiles.replaceChildren();
        ctx.layout.clear();
        tiles.classList.remove(
          "desktop-mode-my-wordpress__tiles--searching"
        );
        ctx.page = 1;
        ctx.totalPages = result.totalPages;
        ctx.total = result.total;
        ctx.loaded = 0;
        ctx.done = ctx.page >= ctx.totalPages;
        ctx.selectedId = null;
        ctx.selectedTile = null;
        ctx.preview.replaceChildren();
        const emptyPreview = document.createElement("div");
        emptyPreview.className = "desktop-mode-my-wordpress__preview-empty";
        emptyPreview.textContent = __(
          "Select a user to see their profile here.",
          "desktop-mode"
        );
        ctx.preview.appendChild(emptyPreview);
        if (result.items.length === 0) {
          renderListEmptyMessage(
            tiles,
            q ? sprintf(
              // translators: %s is the user-entered search query.
              __('No users match "%s".', "desktop-mode"),
              q
            ) : __("No users to show.", "desktop-mode")
          );
          ctx.done = true;
        } else {
          for (const item of result.items) {
            tiles.appendChild(
              buildUserTile(state, ctx, entity, item)
            );
            ctx.loaded += 1;
          }
        }
        repaintListStatus();
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        tiles.classList.remove(
          "desktop-mode-my-wordpress__tiles--searching"
        );
        tiles.replaceChildren();
        ctx.layout.clear();
        const msg = err instanceof Error ? err.message : __("Unknown error.", "desktop-mode");
        renderListError(tiles, msg);
        ctx.done = true;
      } finally {
        ctx.loading = false;
        if (ctx.abort === controller) {
          ctx.abort = null;
        }
      }
      if (!ctx.done) {
        requestAnimationFrame(() => {
          if (sentinelIsVisible()) {
            void loadMore();
          }
        });
      }
    };
    if (typeof IntersectionObserver !== "undefined") {
      ctx.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              void loadMore();
            }
          }
        },
        { root: left, rootMargin: "200px 0px" }
      );
      ctx.observer.observe(sentinel);
      state.teardown.push(() => ctx.observer?.disconnect());
    }
    void loadMore();
  }
  function buildUserTile(state, ctx, entity, item) {
    const displayName = item.name || item.slug || `#${item.id}`;
    const avatarUrl = pickAvatar(item.avatar_urls) ?? "";
    const tile = buildTileFromSpec({
      type: "user",
      ref: String(item.id),
      label: displayName,
      thumbnail: avatarUrl || void 0,
      // No avatar: fall back to a generic users dashicon so the
      // tile still has a visual. The initials block below
      // replaces that icon as a richer fallback.
      icon: avatarUrl ? void 0 : "dashicons-admin-users",
      role: "entry",
      dataset: { userId: item.id, role: "user" },
      extraClasses: [
        "desktop-mode-my-wordpress__tile",
        "desktop-mode-my-wordpress__tile--user"
      ]
    });
    if (!avatarUrl) {
      const iconHost = tile.querySelector(
        ".desktop-mode-file-tile__visual"
      );
      if (iconHost) {
        iconHost.replaceChildren();
        const initials = document.createElement("span");
        initials.className = "desktop-mode-my-wordpress__user-tile-initials";
        initials.textContent = initialsOf(displayName);
        iconHost.appendChild(initials);
      }
    }
    const summary = item.desktop_mode_summary;
    const postCount = summary?.postCount ?? 0;
    const roleLabel = (summary?.roleLabels ?? [])[0] ?? "";
    if (roleLabel || postCount > 0) {
      const sub = document.createElement("span");
      sub.className = "desktop-mode-my-wordpress__user-tile-sub";
      const parts = [];
      if (roleLabel) {
        parts.push(roleLabel);
      }
      if (postCount > 0) {
        parts.push(
          sprintf(
            // translators: %d is a count of posts authored.
            _n("%d post", "%d posts", postCount),
            postCount
          )
        );
      }
      sub.textContent = parts.join(" · ");
      tile.appendChild(sub);
    }
    const tooltip = buildUserTooltip(displayName, item);
    let tooltipNode = null;
    const showTooltip = (ev) => {
      if (!tooltipNode) {
        tooltipNode = tooltip;
      }
      document.body.appendChild(tooltipNode);
      positionTooltip(tooltipNode, ev);
    };
    const moveTooltip = (ev) => {
      if (tooltipNode && tooltipNode.isConnected) {
        positionTooltip(tooltipNode, ev);
      }
    };
    const hideTooltip = () => {
      if (tooltipNode && tooltipNode.isConnected) {
        tooltipNode.remove();
      }
    };
    tile.addEventListener("mouseenter", showTooltip);
    tile.addEventListener("mousemove", moveTooltip);
    tile.addEventListener("mouseleave", hideTooltip);
    state.teardown.push(hideTooltip);
    attachTileDragOut(
      tile,
      {
        kind: "user",
        ref: String(item.id),
        title: displayName,
        icon: "dashicons-admin-users",
        // Cross-frame bridge payload — receiver inserts a
        // `core/paragraph` with `<a href>` pointing at the
        // author archive (`item.link`). Falls back to empty
        // string when the REST shape omitted the link; the
        // receiver gates on a truthy URL.
        bridgePayload: {
          kind: "user",
          id: item.id,
          url: item.link ?? "",
          title: displayName
        }
      },
      () => hideTooltip()
    );
    const tileKey = `entry:${item.id}`;
    ctx.layout.place(tile, tileKey, {
      name: displayName,
      // Order users by post count by default — the most active
      // surface first. Authoring date isn't available per-user,
      // so we synthesize a date that ranks more-prolific users
      // earlier when the canvas sort-by-date is selected.
      date: postCount > 0 ? new Date(2100, 0, 1 - postCount).toISOString() : (/* @__PURE__ */ new Date(0)).toISOString()
    });
    tile.addEventListener("click", () => {
      selectUserTile(state, ctx, tile, item);
    });
    tile.addEventListener("dblclick", (e) => {
      e.preventDefault();
      hideTooltip();
      navigate(state, {
        kind: "user-footprint",
        entityId: entity.id,
        userId: item.id,
        userName: displayName
      });
    });
    tile.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      hideTooltip();
      openUserTileMenu(state, entity, item, displayName, {
        x: e.clientX,
        y: e.clientY
      });
    });
    return tile;
  }
  function buildUserTooltip(name, item) {
    const tip = document.createElement("div");
    tip.className = "desktop-mode-my-wordpress__tooltip";
    tip.setAttribute("role", "tooltip");
    const heading = document.createElement("div");
    heading.className = "desktop-mode-my-wordpress__tooltip-title";
    heading.textContent = name;
    tip.appendChild(heading);
    const summary = item.desktop_mode_summary;
    const roleLabel = (summary?.roleLabels ?? [])[0];
    const postCount = summary?.postCount ?? 0;
    const lastActive = summary?.lastActive ?? "";
    const lines = [];
    if (roleLabel) {
      lines.push(roleLabel);
    }
    if (postCount > 0) {
      lines.push(
        sprintf(
          // translators: %d is a count of posts authored by a user.
          _n("%d post", "%d posts", postCount),
          postCount
        )
      );
    }
    if (lastActive) {
      lines.push(
        sprintf(
          // translators: %s is a relative or absolute date.
          __("Last published %s", "desktop-mode"),
          formatDate(lastActive)
        )
      );
    }
    for (const ln of lines) {
      const p = document.createElement("p");
      p.className = "desktop-mode-my-wordpress__tooltip-excerpt";
      p.textContent = ln;
      tip.appendChild(p);
    }
    const bio = (item.description ?? "").trim();
    if (bio) {
      const p = document.createElement("p");
      p.className = "desktop-mode-my-wordpress__tooltip-excerpt";
      p.textContent = bio.length > 200 ? bio.slice(0, 197) + "…" : bio;
      tip.appendChild(p);
    }
    return tip;
  }
  function selectUserTile(state, ctx, tile, item) {
    if (ctx.selectedTile) {
      ctx.selectedTile.classList.remove(
        "desktop-mode-file-tile--selected"
      );
    }
    tile.classList.add("desktop-mode-file-tile--selected");
    ctx.selectedTile = tile;
    ctx.selectedId = item.id;
    void renderUserPreviewPane(state, ctx, item);
  }
  async function renderUserPreviewPane(state, ctx, item) {
    const fallbackName = item.name || item.slug || `#${item.id}`;
    const fallbackAvatar = pickAvatar(item.avatar_urls) ?? "";
    const userId = item.id;
    showPreviewLoading(ctx.preview);
    let node;
    try {
      node = await renderUserDossier({
        userId,
        fallbackName,
        fallbackAvatar,
        fallbackDescription: item.description ?? ""
      });
    } catch (err) {
      if (ctx.selectedId !== userId) {
        return;
      }
      showPreviewError(ctx.preview, err);
      return;
    }
    if (ctx.selectedId !== userId) {
      return;
    }
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-my-wordpress__article-footer";
    const footprintBtn = document.createElement("wpd-button");
    footprintBtn.setAttribute("variant", "primary");
    footprintBtn.textContent = __("View activity footprint", "desktop-mode");
    footprintBtn.title = __(
      "Open the full activity footprint surface for this user.",
      "desktop-mode"
    );
    footprintBtn.addEventListener("click", () => {
      navigate(state, {
        kind: "user-footprint",
        entityId: "users",
        userId,
        userName: fallbackName
      });
    });
    footer.appendChild(footprintBtn);
    const editBtn = document.createElement("wpd-button");
    editBtn.setAttribute("variant", "secondary");
    editBtn.textContent = __("Show profile", "desktop-mode");
    editBtn.title = __(
      "Open this user’s profile editor in a new window.",
      "desktop-mode"
    );
    editBtn.addEventListener("click", () => {
      openUserEditWindow(userId);
    });
    footer.appendChild(editBtn);
    node.appendChild(footer);
    ctx.preview.replaceChildren(node);
  }
  function openUserTileMenu(state, entity, item, name, pos) {
    closeAnyTileMenu();
    const menu = document.createElement("wpd-context-menu");
    menu.setAttribute("open", "");
    menu.classList.add("desktop-mode-my-wordpress__menu");
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    const addOption = (id, label, icon) => {
      const opt = document.createElement("wpd-context-menu-option");
      opt.dataset.menuItemId = id;
      opt.setAttribute("value", id);
      opt.setAttribute("icon", sanitizeClass(icon));
      opt.textContent = label;
      menu.appendChild(opt);
    };
    addOption(
      "footprint",
      __("View activity footprint", "desktop-mode"),
      "dashicons-chart-area"
    );
    addOption(
      "open-profile",
      __("Show profile", "desktop-mode"),
      "dashicons-id-alt"
    );
    if (item.link) {
      addOption(
        "author-archive",
        __("View author archive", "desktop-mode"),
        "dashicons-external"
      );
    }
    menu.addEventListener("wpd-context-menu-pick", (e) => {
      const detail = e.detail;
      closeAnyTileMenu();
      if (detail.id === "footprint") {
        navigate(state, {
          kind: "user-footprint",
          entityId: entity.id,
          userId: item.id,
          userName: name
        });
        return;
      }
      if (detail.id === "open-profile") {
        openUserEditWindow(item.id);
        return;
      }
      if (detail.id === "author-archive" && item.link) {
        window.open(item.link, "_blank", "noopener,noreferrer");
      }
    });
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(
        0,
        window.innerWidth - rect.width - 8
      )}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(
        0,
        window.innerHeight - rect.height - 8
      )}px`;
    }
    queueMicrotask(() => {
      const onDocPointerDown = (ev) => {
        const target = ev.target;
        if (target instanceof Node && menu.contains(target)) {
          return;
        }
        closeAnyTileMenu();
      };
      const onDocKey = (ev) => {
        if (ev.key === "Escape") {
          closeAnyTileMenu();
        }
      };
      document.addEventListener("pointerdown", onDocPointerDown, true);
      document.addEventListener("keydown", onDocKey);
      menu.addEventListener("tile-menu-closed", () => {
        document.removeEventListener(
          "pointerdown",
          onDocPointerDown,
          true
        );
        document.removeEventListener("keydown", onDocKey);
      });
    });
  }
  function openUserEditWindow(userId) {
    if (!Number.isFinite(userId) || userId <= 0) {
      return;
    }
    const desktop = window.wp?.desktop;
    const createSharedStore = desktop?.createSharedStore;
    if (typeof createSharedStore === "function") {
      const store = createSharedStore(
        "desktop-mode/user-edit/target",
        () => ({ userId: null, requestedAt: 0, tabRequested: false })
      );
      store.state.userId = userId;
      store.state.requestedAt = Date.now();
      store.state.tabRequested = true;
      store.notify();
    }
    const opened = desktop?.openWindow?.("desktop-mode-user-edit", {
      source: "my-wordpress/user-tile"
    });
    if (!opened) {
      openIframeWindow({
        id: `user-edit-${userId}`,
        url: buildEditUserUrl(userId),
        title: __("Edit user", "desktop-mode"),
        icon: "dashicons-admin-users"
      });
    }
  }
  function initialsOf(name) {
    const parts = name.trim().split(/\s+/).filter((s) => s.length > 0);
    if (parts.length === 0) {
      return "?";
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function renderUserFootprint(state, entity, userId, userName) {
    const host = document.createElement("div");
    host.className = "desktop-mode-my-wordpress__footprint";
    state.body.appendChild(host);
    showPreviewLoading(host);
    paintStatus(
      state,
      [
        {
          id: "loading",
          label: __("Loading footprint…", "desktop-mode"),
          align: "start",
          sort: 10
        }
      ],
      { view: "detail", entityId: entity.id, postId: userId }
    );
    void (async () => {
      let payload;
      try {
        payload = await fetchUserFootprint(userId);
      } catch (err) {
        showPreviewError(host, err);
        paintStatus(
          state,
          [
            {
              id: "error",
              label: __("Could not load footprint.", "desktop-mode"),
              align: "start",
              sort: 10
            }
          ],
          { view: "detail", entityId: entity.id, postId: userId }
        );
        return;
      }
      if (state.route.kind !== "user-footprint" || state.route.userId !== userId) {
        return;
      }
      host.replaceChildren();
      host.appendChild(buildFootprintHero(payload));
      host.appendChild(buildFootprintHeadlineStats(payload));
      host.appendChild(buildFootprintCalendar(payload));
      host.appendChild(buildFootprintRhythm(payload));
      const monthCallout = buildFootprintMonthCallout(payload);
      if (monthCallout) {
        host.appendChild(monthCallout);
      }
      host.appendChild(buildFootprintTimeline(payload));
      host.appendChild(
        buildFootprintFooter(payload, userId)
      );
      paintStatus(
        state,
        [
          {
            id: "count",
            label: sprintf(
              // translators: 1: post total, 2: comment total.
              __(
                "%1$d posts · %2$d comments tracked",
                "desktop-mode"
              ),
              payload.totals.posts + payload.totals.pages,
              payload.totals.comments
            ),
            align: "start",
            sort: 10
          },
          {
            id: "range",
            label: sprintf(
              // translators: 1: window-start date, 2: window-end date.
              __(
                "Window %1$s → %2$s",
                "desktop-mode"
              ),
              formatShortDate(payload.range.from),
              formatShortDate(payload.range.to)
            ),
            align: "end",
            sort: 10
          }
        ],
        { view: "detail", entityId: entity.id, postId: userId }
      );
    })();
  }
  function buildFootprintHero(payload) {
    const hero = document.createElement("header");
    hero.className = "desktop-mode-my-wordpress__footprint-hero";
    const avatar = document.createElement("div");
    avatar.className = "desktop-mode-my-wordpress__footprint-avatar";
    if (payload.profile.avatarUrl) {
      const img = document.createElement("img");
      img.src = payload.profile.avatarUrl;
      img.alt = "";
      avatar.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.className = "desktop-mode-my-wordpress__user-tile-initials";
      span.textContent = initialsOf(payload.profile.name);
      avatar.appendChild(span);
    }
    hero.appendChild(avatar);
    const text = document.createElement("div");
    text.className = "desktop-mode-my-wordpress__footprint-headline";
    const h = document.createElement("h1");
    h.className = "desktop-mode-my-wordpress__footprint-title";
    h.textContent = payload.profile.name;
    text.appendChild(h);
    const meta = document.createElement("div");
    meta.className = "desktop-mode-my-wordpress__footprint-meta";
    const roles = payload.profile.roleLabels ?? [];
    for (const r of roles) {
      const chip = document.createElement("span");
      chip.className = "desktop-mode-my-wordpress__user-role";
      chip.textContent = r;
      meta.appendChild(chip);
    }
    if (payload.profile.registered) {
      const since = document.createElement("span");
      since.className = "desktop-mode-my-wordpress__user-role desktop-mode-my-wordpress__footprint-since";
      since.textContent = sprintf(
        // translators: %s is a year-month label like "January 2023".
        __("Member since %s", "desktop-mode"),
        formatYearMonth(payload.profile.registered)
      );
      meta.appendChild(since);
    }
    text.appendChild(meta);
    if (payload.profile.link) {
      const links = document.createElement("div");
      links.className = "desktop-mode-my-wordpress__user-links";
      const a = document.createElement("a");
      a.href = payload.profile.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = __("Author archive", "desktop-mode");
      links.appendChild(a);
      text.appendChild(links);
    }
    hero.appendChild(text);
    return hero;
  }
  function buildFootprintHeadlineStats(payload) {
    const wrap = document.createElement("section");
    wrap.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-stats-row";
    const totalContent = payload.totals.posts + payload.totals.pages;
    wrap.appendChild(
      buildStatCard(
        totalContent.toLocaleString(),
        __("Total content", "desktop-mode"),
        payload.totals.posts > 0 && payload.totals.pages > 0 ? sprintf(
          // translators: 1: post count, 2: page count.
          __(
            "%1$d posts · %2$d pages",
            "desktop-mode"
          ),
          payload.totals.posts,
          payload.totals.pages
        ) : ""
      )
    );
    wrap.appendChild(
      buildStatCard(
        payload.totals.comments.toLocaleString(),
        __("Comments left", "desktop-mode"),
        ""
      )
    );
    const updateCount = payload.totals.updates ?? 0;
    if (updateCount > 0) {
      wrap.appendChild(
        buildStatCard(
          updateCount.toLocaleString(),
          __("Updates", "desktop-mode"),
          __("Saves on existing posts", "desktop-mode")
        )
      );
    }
    const longestRange = payload.streak.longestRange;
    const longestCaption = longestRange.from && longestRange.to ? sprintf(
      // translators: 1: start date, 2: end date.
      __("%1$s → %2$s", "desktop-mode"),
      formatShortDate(longestRange.from),
      formatShortDate(longestRange.to)
    ) : "";
    wrap.appendChild(
      buildStatCard(
        sprintf(
          // translators: %d is the length in days of the user's longest publishing streak.
          _n(
            "%d day",
            "%d days",
            payload.streak.longest
          ),
          payload.streak.longest
        ),
        __("Longest streak", "desktop-mode"),
        longestCaption
      )
    );
    wrap.appendChild(
      buildStatCard(
        sprintf(
          // translators: %d is the length in days of the user's current active streak.
          _n("%d day", "%d days", payload.streak.current),
          payload.streak.current
        ),
        __("Current streak", "desktop-mode"),
        payload.streak.current === 0 ? __("No activity today", "desktop-mode") : __("Including today", "desktop-mode")
      )
    );
    return wrap;
  }
  function buildFootprintCalendar(payload) {
    const section = document.createElement("section");
    section.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-calendar-section";
    const h = document.createElement("h3");
    h.textContent = __("A year of activity", "desktop-mode");
    section.appendChild(h);
    const calendar = document.createElement("div");
    calendar.className = "desktop-mode-my-wordpress__footprint-calendar";
    const dayIntensity = (d) => d.posts + d.comments + (d.updates ?? 0);
    const maxIntensity = payload.daily.reduce((m, d) => {
      const v = dayIntensity(d);
      return v > m ? v : m;
    }, 0);
    const bucketize = (v) => {
      if (v <= 0) {
        return 0;
      }
      if (maxIntensity <= 0) {
        return 0;
      }
      const ratio = v / maxIntensity;
      if (ratio > 0.75) {
        return 4;
      }
      if (ratio > 0.5) {
        return 3;
      }
      if (ratio > 0.25) {
        return 2;
      }
      return 1;
    };
    const dates = payload.daily.map((d) => /* @__PURE__ */ new Date(d.date + "T00:00:00Z"));
    if (dates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-my-wordpress__article-meta";
      empty.textContent = __(
        "No activity recorded in the last year.",
        "desktop-mode"
      );
      section.appendChild(empty);
      return section;
    }
    const firstDow = dates[0].getUTCDay();
    const grid = document.createElement("div");
    grid.className = "desktop-mode-my-wordpress__footprint-grid";
    const placeCell = (el, linearDayOffset) => {
      const dow = linearDayOffset % 7;
      const week = Math.floor(linearDayOffset / 7);
      el.style.gridRow = String(dow + 2);
      el.style.gridColumn = String(week + 2);
    };
    const weekdaySource = [
      // 2024-12-02 was a Monday (UTC).
      new Date(Date.UTC(2024, 11, 2)),
      // Mon
      new Date(Date.UTC(2024, 11, 4)),
      // Wed
      new Date(Date.UTC(2024, 11, 6))
      // Fri
    ];
    const weekdayRows = [2, 4, 6];
    for (let i = 0; i < weekdaySource.length; i += 1) {
      const lbl = document.createElement("span");
      lbl.className = "desktop-mode-my-wordpress__footprint-weekday";
      lbl.textContent = weekdaySource[i].toLocaleDateString(void 0, {
        weekday: "short"
      });
      lbl.style.gridColumn = "1";
      lbl.style.gridRow = String(weekdayRows[i] + 1);
      grid.appendChild(lbl);
    }
    for (let i = 0; i < firstDow; i += 1) {
      const blank = document.createElement("span");
      blank.className = "desktop-mode-my-wordpress__footprint-cell desktop-mode-my-wordpress__footprint-cell--pad";
      blank.setAttribute("aria-hidden", "true");
      placeCell(blank, i);
      grid.appendChild(blank);
    }
    let lastMonth = -1;
    for (let i = 0; i < payload.daily.length; i += 1) {
      const d = dates[i];
      const m = d.getUTCMonth();
      if (m === lastMonth) {
        continue;
      }
      lastMonth = m;
      const linear = firstDow + i;
      const week = Math.floor(linear / 7);
      if (week === 0 && linear % 7 !== 0) {
        continue;
      }
      const lbl = document.createElement("span");
      lbl.className = "desktop-mode-my-wordpress__footprint-month";
      lbl.textContent = d.toLocaleDateString(void 0, { month: "short" });
      lbl.style.gridRow = "1";
      lbl.style.gridColumn = String(week + 2);
      grid.appendChild(lbl);
    }
    for (let i = 0; i < payload.daily.length; i += 1) {
      const d = payload.daily[i];
      const intensity = bucketize(dayIntensity(d));
      const cell = document.createElement("span");
      cell.className = `desktop-mode-my-wordpress__footprint-cell desktop-mode-my-wordpress__footprint-cell--l${intensity}`;
      cell.title = sprintf(
        // translators: 1: date, 2: post count, 3: comment count, 4: update (re-save) count.
        __(
          "%1$s — %2$d posts, %3$d comments, %4$d updates",
          "desktop-mode"
        ),
        formatLongDate(d.date),
        d.posts,
        d.comments,
        d.updates ?? 0
      );
      cell.dataset.date = d.date;
      placeCell(cell, firstDow + i);
      grid.appendChild(cell);
    }
    calendar.appendChild(grid);
    const legend = document.createElement("div");
    legend.className = "desktop-mode-my-wordpress__footprint-legend";
    const less = document.createElement("span");
    less.className = "desktop-mode-my-wordpress__footprint-legend-label";
    less.textContent = __("Less", "desktop-mode");
    legend.appendChild(less);
    for (let i = 0; i <= 4; i += 1) {
      const sw = document.createElement("span");
      sw.className = `desktop-mode-my-wordpress__footprint-cell desktop-mode-my-wordpress__footprint-cell--l${i}`;
      legend.appendChild(sw);
    }
    const more = document.createElement("span");
    more.className = "desktop-mode-my-wordpress__footprint-legend-label";
    more.textContent = __("More", "desktop-mode");
    legend.appendChild(more);
    calendar.appendChild(legend);
    section.appendChild(calendar);
    return section;
  }
  function buildFootprintRhythm(payload) {
    const section = document.createElement("section");
    section.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-rhythm";
    const h = document.createElement("h3");
    h.textContent = __("Publishing rhythm", "desktop-mode");
    section.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "desktop-mode-my-wordpress__footprint-rhythm-grid";
    const weekdayWrap = document.createElement("div");
    weekdayWrap.className = "desktop-mode-my-wordpress__footprint-chart";
    const weekdayCap = document.createElement("div");
    weekdayCap.className = "desktop-mode-my-wordpress__footprint-chart-caption";
    weekdayCap.textContent = __("By weekday", "desktop-mode");
    weekdayWrap.appendChild(weekdayCap);
    const weekdayLabels = [
      __("S", "desktop-mode"),
      __("M", "desktop-mode"),
      __("T", "desktop-mode"),
      __("W", "desktop-mode"),
      __("T", "desktop-mode"),
      __("F", "desktop-mode"),
      __("S", "desktop-mode")
    ];
    const weekdayFull = [
      __("Sunday", "desktop-mode"),
      __("Monday", "desktop-mode"),
      __("Tuesday", "desktop-mode"),
      __("Wednesday", "desktop-mode"),
      __("Thursday", "desktop-mode"),
      __("Friday", "desktop-mode"),
      __("Saturday", "desktop-mode")
    ];
    weekdayWrap.appendChild(
      buildBarChart(payload.weekday, weekdayLabels, weekdayFull)
    );
    grid.appendChild(weekdayWrap);
    const hourWrap = document.createElement("div");
    hourWrap.className = "desktop-mode-my-wordpress__footprint-chart";
    const hourCap = document.createElement("div");
    hourCap.className = "desktop-mode-my-wordpress__footprint-chart-caption";
    hourCap.textContent = __("By hour of day (site time)", "desktop-mode");
    hourWrap.appendChild(hourCap);
    const hourLabels = [
      "0",
      "",
      "",
      "3",
      "",
      "",
      "6",
      "",
      "",
      "9",
      "",
      "",
      "12",
      "",
      "",
      "15",
      "",
      "",
      "18",
      "",
      "",
      "21",
      "",
      ""
    ];
    const hourFull = Array.from(
      { length: 24 },
      (_, i) => sprintf(
        // translators: %d is an hour of the day (0-23).
        __("%d:00", "desktop-mode"),
        i
      )
    );
    hourWrap.appendChild(
      buildBarChart(payload.hour, hourLabels, hourFull)
    );
    grid.appendChild(hourWrap);
    section.appendChild(grid);
    return section;
  }
  function buildBarChart(values, labels, titles) {
    const chart = document.createElement("div");
    chart.className = "desktop-mode-my-wordpress__footprint-bars";
    const max = Math.max(1, ...values);
    values.forEach((v, i) => {
      const col = document.createElement("div");
      col.className = "desktop-mode-my-wordpress__footprint-bar-col";
      const bar = document.createElement("div");
      bar.className = "desktop-mode-my-wordpress__footprint-bar";
      bar.style.height = `${Math.round(v / max * 100)}%`;
      bar.title = sprintf(
        // translators: 1: bucket label, 2: count.
        __(
          "%1$s · %2$d",
          "desktop-mode"
        ),
        titles[i] ?? labels[i] ?? String(i),
        v
      );
      if (v === 0) {
        bar.classList.add(
          "desktop-mode-my-wordpress__footprint-bar--empty"
        );
      }
      col.appendChild(bar);
      const lbl = document.createElement("span");
      lbl.className = "desktop-mode-my-wordpress__footprint-bar-label";
      lbl.textContent = labels[i] ?? "";
      col.appendChild(lbl);
      chart.appendChild(col);
    });
    return chart;
  }
  function buildFootprintMonthCallout(payload) {
    const m = payload.totals.mostProlificMonth;
    if (!m) {
      return null;
    }
    const section = document.createElement("section");
    section.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-callout";
    const label = document.createElement("span");
    label.className = "desktop-mode-my-wordpress__footprint-callout-label";
    label.textContent = __("Most prolific month", "desktop-mode");
    section.appendChild(label);
    const value = document.createElement("h3");
    value.className = "desktop-mode-my-wordpress__footprint-callout-value";
    value.textContent = formatYearMonth(m.ym + "-01T00:00:00Z");
    section.appendChild(value);
    const detail = document.createElement("p");
    detail.className = "desktop-mode-my-wordpress__footprint-callout-detail";
    detail.textContent = sprintf(
      // translators: %d is a post count.
      _n(
        "%d post published — their personal record.",
        "%d posts published — their personal record.",
        m.n
      ),
      m.n
    );
    section.appendChild(detail);
    return section;
  }
  function buildFootprintTimeline(payload) {
    const section = document.createElement("section");
    section.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-timeline-section";
    const h = document.createElement("h3");
    h.textContent = __("Recent activity", "desktop-mode");
    section.appendChild(h);
    if (payload.timeline.length === 0) {
      const empty = document.createElement("p");
      empty.className = "desktop-mode-my-wordpress__article-meta";
      empty.textContent = __("Nothing to show yet.", "desktop-mode");
      section.appendChild(empty);
      return section;
    }
    const list = document.createElement("ul");
    list.className = "desktop-mode-my-wordpress__footprint-timeline";
    for (const ev of payload.timeline) {
      const li = document.createElement("li");
      li.className = `desktop-mode-my-wordpress__footprint-event desktop-mode-my-wordpress__footprint-event--${ev.kind}`;
      const dot = document.createElement("span");
      dot.className = "desktop-mode-my-wordpress__footprint-dot";
      const icon = document.createElement("span");
      let iconClass = "dashicons-admin-post";
      if (ev.kind === "comment") {
        iconClass = "dashicons-admin-comments";
      } else if (ev.kind === "post-update") {
        iconClass = "dashicons-edit";
      }
      icon.className = "dashicons " + iconClass;
      icon.setAttribute("aria-hidden", "true");
      dot.appendChild(icon);
      li.appendChild(dot);
      const body = document.createElement("div");
      body.className = "desktop-mode-my-wordpress__footprint-event-body";
      const title = ev.title || __("(no title)", "desktop-mode");
      const titleNode = ev.link ? document.createElement("a") : document.createElement("span");
      titleNode.className = "desktop-mode-my-wordpress__footprint-event-title";
      if (ev.kind === "comment") {
        titleNode.textContent = sprintf(
          // translators: %s is a post title the user commented on.
          __("Commented on “%s”", "desktop-mode"),
          title
        );
      } else if (ev.kind === "post-update") {
        titleNode.textContent = sprintf(
          // translators: %s is the post title the user re-saved.
          __("Updated “%s”", "desktop-mode"),
          title
        );
      } else {
        titleNode.textContent = title;
      }
      if (ev.link && titleNode instanceof HTMLAnchorElement) {
        titleNode.href = ev.link;
        titleNode.target = "_blank";
        titleNode.rel = "noopener noreferrer";
      }
      body.appendChild(titleNode);
      const meta = document.createElement("span");
      meta.className = "desktop-mode-my-wordpress__footprint-event-meta";
      const parts = [formatLongDate(ev.date)];
      if (ev.status && ev.status !== "publish" && ev.status !== "approved") {
        parts.push(ev.status);
      }
      meta.textContent = parts.join(" · ");
      body.appendChild(meta);
      li.appendChild(body);
      list.appendChild(li);
    }
    section.appendChild(list);
    return section;
  }
  function buildFootprintFooter(payload, userId, userName) {
    const footer = document.createElement("footer");
    footer.className = "desktop-mode-my-wordpress__footprint-section desktop-mode-my-wordpress__footprint-footer";
    const archiveBtn = document.createElement("wpd-button");
    archiveBtn.setAttribute("variant", "ghost");
    archiveBtn.textContent = __("View author archive", "desktop-mode");
    archiveBtn.addEventListener("click", () => {
      if (payload.profile.link) {
        window.open(payload.profile.link, "_blank", "noopener,noreferrer");
      }
    });
    if (!payload.profile.link) {
      archiveBtn.setAttribute("disabled", "");
    }
    footer.appendChild(archiveBtn);
    const editBtn = document.createElement("wpd-button");
    editBtn.setAttribute("variant", "primary");
    editBtn.textContent = __("Show profile", "desktop-mode");
    editBtn.addEventListener("click", () => {
      openUserEditWindow(userId);
    });
    footer.appendChild(editBtn);
    return footer;
  }
  function formatShortDate(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleDateString(void 0, {
        month: "short",
        day: "numeric"
      });
    } catch {
      return iso;
    }
  }
  function formatLongDate(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleDateString(void 0, {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch {
      return iso;
    }
  }
  function sanitizeClass(raw) {
    return (raw || "").replace(/[^a-zA-Z0-9_-]/g, "");
  }
  function extractContentMediaIds(html2) {
    if (!html2 || typeof html2 !== "string") {
      return [];
    }
    const ids = [];
    const seen = /* @__PURE__ */ new Set();
    const push = (raw) => {
      const id = parseInt(raw, 10);
      if (Number.isFinite(id) && id > 0 && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    };
    const wpImage = /\bwp-image-(\d+)\b/g;
    let m;
    while ((m = wpImage.exec(html2)) !== null) {
      push(m[1]);
    }
    const captionShort = /\[caption[^\]]*id="attachment_(\d+)"/g;
    while ((m = captionShort.exec(html2)) !== null) {
      push(m[1]);
    }
    return ids;
  }
  function createTileSelector() {
    let selected = null;
    return (tile) => {
      if (selected === tile) {
        return;
      }
      if (selected) {
        selected.classList.remove(
          "desktop-mode-file-tile--selected"
        );
      }
      tile.classList.add("desktop-mode-file-tile--selected");
      selected = tile;
    };
  }
  const TILE_W = 108;
  const TILE_H = 112;
  const TILE_PAD = 16;
  function createTileLayout(host, scope) {
    const positions = loadPositions(scope);
    const entries = [];
    const occupied = /* @__PURE__ */ new Set();
    host.classList.add("desktop-mode-my-wordpress__canvas--positioned");
    const cellOf = (x, y) => ({
      col: Math.max(0, Math.round((x - TILE_PAD) / TILE_W)),
      row: Math.max(0, Math.round((y - TILE_PAD) / TILE_H))
    });
    const occupyAt = (x, y) => {
      const { col, row } = cellOf(x, y);
      occupied.add(`${col},${row}`);
    };
    const releaseAt = (x, y) => {
      const { col, row } = cellOf(x, y);
      occupied.delete(`${col},${row}`);
    };
    const recomputeHostHeight = () => {
      let maxBottom = 0;
      for (const child of Array.from(host.children)) {
        if (!(child instanceof HTMLElement)) {
          continue;
        }
        if (!child.classList.contains("desktop-mode-file-tile")) {
          continue;
        }
        const top = parseFloat(child.style.top || "0");
        maxBottom = Math.max(maxBottom, top + TILE_H);
      }
      host.style.minHeight = `${Math.max(0, maxBottom + TILE_PAD)}px`;
    };
    const nextFreeCell = (cols) => {
      for (let n = 0; ; n += 1) {
        const col = n % cols;
        const row = Math.floor(n / cols);
        if (!occupied.has(`${col},${row}`)) {
          return { col, row };
        }
      }
    };
    const place = (tile, key, sortable) => {
      const saved = positions[key];
      const width = host.clientWidth > 0 ? host.clientWidth : TILE_PAD + 5 * TILE_W;
      const cols = Math.max(
        1,
        Math.floor((width - TILE_PAD) / TILE_W)
      );
      const fits = saved && saved.x + TILE_W <= width;
      const entry = {
        key,
        tile,
        sortable,
        userPlaced: !!fits
      };
      entries.push(entry);
      let x;
      let y;
      if (fits && saved) {
        x = saved.x;
        y = saved.y;
      } else {
        if (saved && !fits) {
          delete positions[key];
          savePositions(scope, positions);
        }
        const cell = nextFreeCell(cols);
        x = TILE_PAD + cell.col * TILE_W;
        y = TILE_PAD + cell.row * TILE_H;
      }
      occupyAt(x, y);
      applyTilePosition(tile, x, y);
      recomputeHostHeight();
    };
    const commit = (tile, key, x, y) => {
      const oldX = parseFloat(tile.style.left || "0");
      const oldY = parseFloat(tile.style.top || "0");
      releaseAt(oldX, oldY);
      applyTilePosition(tile, x, y);
      occupyAt(x, y);
      positions[key] = { x, y };
      savePositions(scope, positions);
      const entry = entries.find((e) => e.key === key);
      if (entry) {
        entry.userPlaced = true;
      }
      recomputeHostHeight();
    };
    const reflow = () => {
      const width = host.clientWidth > 0 ? host.clientWidth : TILE_PAD + 5 * TILE_W;
      const cols = Math.max(
        1,
        Math.floor((width - TILE_PAD) / TILE_W)
      );
      const overflowing = entries.some((entry) => {
        const left = parseFloat(entry.tile.style.left || "0");
        return left + TILE_W > width;
      });
      if (overflowing) {
        for (const k of Object.keys(positions)) {
          delete positions[k];
        }
        savePositions(scope, positions);
        for (const entry of entries) {
          entry.userPlaced = false;
        }
      }
      occupied.clear();
      for (const entry of entries) {
        if (!entry.userPlaced) {
          continue;
        }
        const left = parseFloat(entry.tile.style.left || "0");
        const top = parseFloat(entry.tile.style.top || "0");
        occupyAt(left, top);
      }
      let autoCount = 0;
      for (const entry of entries) {
        if (entry.userPlaced) {
          continue;
        }
        const cell = nextFreeCell(cols);
        const x = TILE_PAD + cell.col * TILE_W;
        const y = TILE_PAD + cell.row * TILE_H;
        applyTilePosition(entry.tile, x, y);
        occupyAt(x, y);
        autoCount += 1;
      }
      recomputeHostHeight();
      doAction("desktop-mode.icon-canvas.reflow", {
        scope,
        cols,
        autoCount,
        overflowing
      });
    };
    const sort = (mode) => {
      const sorted = entries.slice().sort((a, b) => {
        switch (mode) {
          case "name-asc":
            return a.sortable.name.localeCompare(b.sortable.name);
          case "name-desc":
            return b.sortable.name.localeCompare(a.sortable.name);
          case "date-asc":
            return Date.parse(a.sortable.date) - Date.parse(b.sortable.date);
          case "date-desc":
            return Date.parse(b.sortable.date) - Date.parse(a.sortable.date);
          default:
            return 0;
        }
      });
      const width = host.clientWidth > 0 ? host.clientWidth : TILE_PAD + 5 * TILE_W;
      const cols = Math.max(
        1,
        Math.floor((width - TILE_PAD) / TILE_W)
      );
      for (const k of Object.keys(positions)) {
        delete positions[k];
      }
      occupied.clear();
      sorted.forEach((entry, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = TILE_PAD + col * TILE_W;
        const y = TILE_PAD + row * TILE_H;
        applyTilePosition(entry.tile, x, y);
        occupyAt(x, y);
        positions[entry.key] = { x, y };
        entry.userPlaced = true;
      });
      savePositions(scope, positions);
      for (const entry of sorted) {
        host.appendChild(entry.tile);
      }
      recomputeHostHeight();
    };
    let lastWidth = host.clientWidth;
    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        const w = host.clientWidth;
        if (w === lastWidth) {
          return;
        }
        lastWidth = w;
        reflow();
      });
      resizeObserver.observe(host);
    }
    const peekNextCells = (count) => {
      const width = host.clientWidth > 0 ? host.clientWidth : TILE_PAD + 5 * TILE_W;
      const cols = Math.max(
        1,
        Math.floor((width - TILE_PAD) / TILE_W)
      );
      const taken = new Set(occupied);
      const out = [];
      for (let i = 0; i < count; i += 1) {
        for (let n = 0; ; n += 1) {
          const col = n % cols;
          const row = Math.floor(n / cols);
          const key = `${col},${row}`;
          if (taken.has(key)) {
            continue;
          }
          taken.add(key);
          out.push({
            x: TILE_PAD + col * TILE_W,
            y: TILE_PAD + row * TILE_H
          });
          break;
        }
      }
      return out;
    };
    const clear = () => {
      entries.length = 0;
      occupied.clear();
      host.style.minHeight = "";
    };
    return {
      host,
      scope,
      place,
      commit,
      sort,
      reflow,
      peekNextCells,
      clear,
      dispose: () => {
        resizeObserver?.disconnect();
        resizeObserver = null;
      }
    };
  }
  function applyTilePosition(tile, x, y) {
    tile.style.left = `${Math.round(x)}px`;
    tile.style.top = `${Math.round(y)}px`;
  }
  function loadPositions(scope) {
    try {
      const raw = window.localStorage.getItem(storageKey(scope));
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function savePositions(scope, positions) {
    try {
      window.localStorage.setItem(
        storageKey(scope),
        JSON.stringify(positions)
      );
    } catch {
    }
  }
  function storageKey(scope) {
    return `desktop-mode-my-wordpress:positions:${scope}`;
  }
  let activeState = null;
  const liveStates = /* @__PURE__ */ new Map();
  let pendingRoute = null;
  let rejectIdCounter = 0;
  function renderInto(body) {
    const root = body.querySelector(ROOT_SEL);
    if (!root) {
      return void 0;
    }
    const breadcrumbsHost = root.querySelector(BREADCRUMBS_SEL);
    const bodyHost = root.querySelector(BODY_SEL);
    const statusHost = root.querySelector(STATUS_SEL);
    if (!breadcrumbsHost || !bodyHost || !statusHost) {
      return void 0;
    }
    const state = {
      route: { kind: "root" },
      body: bodyHost,
      root,
      breadcrumbs: breadcrumbsHost,
      statusBar: statusHost,
      teardown: [],
      history: []
    };
    activeState = state;
    liveStates.set(bodyHost, state);
    const windowTeardowns = [];
    const dragManager = getDragManager();
    if (dragManager) {
      rejectIdCounter += 1;
      const deregister = dragManager.registerDropTarget({
        id: `${WINDOW_ID}-reject-${rejectIdCounter}`,
        element: body,
        accept: () => false,
        onDrop: () => {
        }
      });
      windowTeardowns.push(deregister);
    }
    windowTeardowns.push(() => closeAnyTileMenu());
    const initialRoute = pendingRoute ?? { kind: "root" };
    pendingRoute = null;
    navigate(state, initialRoute);
    return () => {
      clearTeardown(state);
      for (const fn of windowTeardowns) {
        try {
          fn();
        } catch {
        }
      }
      windowTeardowns.length = 0;
      liveStates.delete(bodyHost);
      if (activeState === state) {
        const next = liveStates.size > 0 ? Array.from(liveStates.values()).pop() : null;
        activeState = next;
      }
    };
  }
  const callback = (body) => {
    try {
      return renderInto(body);
    } catch (err) {
      console.error("[my-wordpress] render failed:", err);
      return void 0;
    }
  };
  window.desktopModeNativeWindows = window.desktopModeNativeWindows || {};
  window.desktopModeNativeWindows[WINDOW_ID] = callback;
  registerEntityKind("post", (host, entity) => {
    renderEntityList(asRenderState(host), entity);
  });
  registerEntityKind("user", (host, entity) => {
    renderUserEntityList(asRenderState(host), entity);
  });
  registerEntityKind("media", renderMediaList);
  function asRenderState(host) {
    const found = liveStates.get(host.body);
    if (found) {
      return found;
    }
    if (activeState && host.body === activeState.body) {
      return activeState;
    }
    throw new Error(
      "[my-wordpress] asRenderState: host body does not match any live render state."
    );
  }
  function openDetail(args) {
    const route = {
      kind: "detail",
      entityId: args.entityId,
      postId: args.postId,
      postTitle: args.postTitle
    };
    if (activeState) {
      navigate(activeState, route);
      return;
    }
    pendingRoute = route;
    const desktop = window.wp?.desktop;
    desktop?.openWindow?.(WINDOW_ID, { source: "my-wordpress/open-detail" });
  }
  function openMedia(args) {
    const route = {
      kind: "media-detail",
      entityId: "media",
      mediaId: args.mediaId,
      mediaTitle: args.mediaTitle ?? `#${args.mediaId}`
    };
    if (activeState) {
      navigate(activeState, route);
      return;
    }
    pendingRoute = route;
    const desktop = window.wp?.desktop;
    desktop?.openWindow?.(WINDOW_ID, { source: "my-wordpress/open-media" });
  }
  const desktopGlobal = window.wp?.desktop;
  if (desktopGlobal) {
    const pending = desktopGlobal.myWordpress?.__pendingKinds;
    if (Array.isArray(pending)) {
      for (const entry of pending) {
        try {
          entry.slot.unregister = registerEntityKind(
            entry.kind,
            entry.renderer
          );
        } catch (err) {
          console.error(
            `[my-wordpress] queued registerEntityKind('${entry.kind}') failed:`,
            err
          );
        }
      }
      pending.length = 0;
    }
    desktopGlobal.myWordpress = {
      openDetail,
      openMedia,
      registerEntityKind
    };
  }
})();
