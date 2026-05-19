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
    return format.replace(/%[sd]/g, () => String(args[i++] ?? ""));
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
  const WINDOW_ID$1 = "desktop-mode-content-graph";
  const SOURCE = "desktop-mode/content-graph";
  function getConfig() {
    const map = window.desktopModeWindowConfig ?? {};
    const cfg = map[WINDOW_ID$1];
    if (!cfg) {
      throw new Error(
        "Content Graph config missing — desktop_mode_register_window args lost in transit."
      );
    }
    return cfg;
  }
  function authHeaders(cfg) {
    return {
      Accept: "application/json",
      "X-WP-Nonce": cfg.restNonce
    };
  }
  async function fetchPostTypes(cfg) {
    const res = await trackedFetch(
      `${cfg.apiBase}/post-types`,
      { headers: authHeaders(cfg) },
      { source: SOURCE, windowId: WINDOW_ID$1 }
    );
    if (!res.ok) {
      throw new Error(`post-types: ${res.status}`);
    }
    return await res.json();
  }
  async function fetchGraph(cfg, types) {
    const url = new URL(`${cfg.apiBase}/nodes`);
    if (types.length > 0) {
      url.searchParams.set("types", types.join(","));
    }
    const res = await trackedFetch(
      url.toString(),
      { headers: authHeaders(cfg) },
      { source: SOURCE, windowId: WINDOW_ID$1 }
    );
    if (!res.ok) {
      throw new Error(`nodes: ${res.status}`);
    }
    return await res.json();
  }
  async function fetchPostDetail(cfg, id) {
    const res = await trackedFetch(
      `${cfg.apiBase}/post/${id}`,
      { headers: authHeaders(cfg) },
      { source: SOURCE, windowId: WINDOW_ID$1 }
    );
    if (!res.ok) {
      throw new Error(`post/${id}: ${res.status}`);
    }
    return await res.json();
  }
  async function fetchUserStats(cfg, userId) {
    const res = await trackedFetch(
      joinRestUrl(cfg.restRoot, `desktop-mode/v1/user-stats/${userId}`),
      { headers: authHeaders(cfg) },
      { source: SOURCE, windowId: WINDOW_ID$1 }
    );
    if (!res.ok) {
      throw new Error(`user-stats/${userId}: ${res.status}`);
    }
    return await res.json();
  }
  async function fetchTermStats(cfg, taxonomy, termId) {
    const res = await trackedFetch(
      joinRestUrl(
        cfg.restRoot,
        `desktop-mode/v1/term-stats/${encodeURIComponent(taxonomy)}/${termId}`
      ),
      { headers: authHeaders(cfg) },
      { source: SOURCE, windowId: WINDOW_ID$1 }
    );
    if (!res.ok) {
      throw new Error(
        `term-stats/${taxonomy}/${termId}: ${res.status}`
      );
    }
    return await res.json();
  }
  async function fetchCommentStats(cfg, commentId) {
    const res = await trackedFetch(
      joinRestUrl(cfg.restRoot, `desktop-mode/v1/comment-stats/${commentId}`),
      { headers: authHeaders(cfg) },
      { source: SOURCE, windowId: WINDOW_ID$1 }
    );
    if (!res.ok) {
      throw new Error(`comment-stats/${commentId}: ${res.status}`);
    }
    return await res.json();
  }
  const GROUP_NONE = "none";
  function renderToolbar(host, postTypes, callbacks) {
    host.replaceChildren();
    const active = new Set(postTypes.map((t) => t.slug));
    const chipsRow = document.createElement("div");
    chipsRow.className = "desktop-mode-content-graph__filters";
    host.appendChild(chipsRow);
    for (const type of postTypes) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "desktop-mode-content-graph__chip is-active";
      chip.dataset.slug = type.slug;
      chip.innerHTML = `<span class="dashicons ${escapeAttr$1(type.icon)}" aria-hidden="true"></span><span class="desktop-mode-content-graph__chip-label">${escapeHtml$2(type.label)}</span><span class="desktop-mode-content-graph__chip-count">${type.count}</span>`;
      chip.addEventListener("click", () => {
        if (active.has(type.slug)) {
          active.delete(type.slug);
          chip.classList.remove("is-active");
        } else {
          active.add(type.slug);
          chip.classList.add("is-active");
        }
        callbacks.onTypesChange(Array.from(active));
      });
      chipsRow.appendChild(chip);
    }
    const searchWrap = document.createElement("div");
    searchWrap.className = "desktop-mode-content-graph__search";
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "desktop-mode-content-graph__search-input";
    searchInput.placeholder = __("Search nodes…");
    searchInput.setAttribute(
      "aria-label",
      __("Search posts and pages in the graph")
    );
    searchWrap.appendChild(searchInput);
    const dropdown = document.createElement("ul");
    dropdown.className = "desktop-mode-content-graph__search-results";
    dropdown.hidden = true;
    searchWrap.appendChild(dropdown);
    host.appendChild(searchWrap);
    const handleSearchInput = () => {
      const q = searchInput.value.trim().toLowerCase();
      if (q.length === 0) {
        dropdown.hidden = true;
        dropdown.replaceChildren();
        return;
      }
      const matches = callbacks.getNodes().filter((n) => n.title.toLowerCase().includes(q)).slice(0, 10);
      dropdown.replaceChildren();
      for (const m of matches) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "desktop-mode-content-graph__search-result";
        btn.innerHTML = `<span class="desktop-mode-content-graph__search-title">${escapeHtml$2(m.title || "#" + m.id)}</span><span class="desktop-mode-content-graph__search-type">${escapeHtml$2(m.type)}</span>`;
        btn.addEventListener("click", () => {
          searchInput.value = "";
          dropdown.hidden = true;
          dropdown.replaceChildren();
          callbacks.onSearchSelect(m);
        });
        li.appendChild(btn);
        dropdown.appendChild(li);
      }
      dropdown.hidden = matches.length === 0;
    };
    searchInput.addEventListener("input", handleSearchInput);
    searchInput.addEventListener("focus", handleSearchInput);
    searchInput.addEventListener("blur", () => {
      setTimeout(() => {
        dropdown.hidden = true;
      }, 120);
    });
    const groupBy = document.createElement("wpd-select");
    groupBy.className = "desktop-mode-content-graph__group-by";
    groupBy.setAttribute("value", GROUP_NONE);
    groupBy.setAttribute("aria-label", __("Group by"));
    groupBy.title = __("Group posts by a shared facet");
    for (const [value, label] of [
      [GROUP_NONE, __("No grouping")],
      ["category", __("Group by category")],
      ["tag", __("Group by tag")],
      ["author", __("Group by author")],
      ["year", __("Group by year")],
      ["year_month", __("Group by year-month")]
    ]) {
      const opt = document.createElement("wpd-option");
      opt.setAttribute("value", value);
      opt.textContent = label;
      groupBy.appendChild(opt);
    }
    groupBy.addEventListener("wpd-pick", (ev) => {
      const detail = ev.detail;
      const raw = detail?.value ?? GROUP_NONE;
      const facet = raw === GROUP_NONE ? null : raw;
      callbacks.onGroupChange(facet);
    });
    host.insertBefore(groupBy, searchWrap);
    const actions = document.createElement("div");
    actions.className = "desktop-mode-content-graph__actions";
    const fit = document.createElement("button");
    fit.type = "button";
    fit.className = "desktop-mode-content-graph__btn";
    fit.innerHTML = `<span class="dashicons dashicons-editor-expand" aria-hidden="true"></span><span>${escapeHtml$2(__("Fit"))}</span>`;
    fit.title = __("Fit graph to view");
    fit.addEventListener("click", () => callbacks.onFitToView());
    actions.appendChild(fit);
    const status = document.createElement("span");
    status.className = "desktop-mode-content-graph__toolbar-status";
    actions.appendChild(status);
    host.appendChild(actions);
    const onDocClick = (ev) => {
      if (!searchWrap.contains(ev.target)) {
        dropdown.hidden = true;
      }
    };
    document.addEventListener("click", onDocClick);
    return {
      setStatus: (text) => {
        status.textContent = text;
      },
      destroy: () => {
        document.removeEventListener("click", onDocClick);
      }
    };
  }
  function escapeHtml$2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr$1(s) {
    return s.replace(/[^a-zA-Z0-9 _\-]/g, "");
  }
  function renderPanel(host, cfg, callbacks) {
    host.replaceChildren();
    host.hidden = false;
    host.classList.add("desktop-mode-content-graph__panel--closed");
    const setPanelOpen = (open) => {
      host.classList.toggle(
        "desktop-mode-content-graph__panel--closed",
        !open
      );
    };
    let currentPost = null;
    let currentView = { kind: "post" };
    let fetchSeq = 0;
    const frame = document.createElement("div");
    frame.className = "desktop-mode-content-graph__panel-frame";
    const breadcrumbHost = document.createElement("nav");
    breadcrumbHost.className = "desktop-mode-content-graph__panel-breadcrumb";
    breadcrumbHost.hidden = true;
    const head = document.createElement("header");
    head.className = "desktop-mode-content-graph__panel-head";
    const titleWrap = document.createElement("div");
    titleWrap.className = "desktop-mode-content-graph__panel-title-wrap";
    const title = document.createElement("h2");
    title.className = "desktop-mode-content-graph__panel-title";
    const meta = document.createElement("p");
    meta.className = "desktop-mode-content-graph__panel-meta";
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "desktop-mode-content-graph__panel-close";
    closeBtn.innerHTML = '<span class="dashicons dashicons-no-alt" aria-hidden="true"></span>';
    closeBtn.title = __("Close panel");
    closeBtn.addEventListener("click", () => callbacks.onClose());
    head.appendChild(titleWrap);
    head.appendChild(closeBtn);
    const body = document.createElement("div");
    body.className = "desktop-mode-content-graph__panel-body";
    frame.appendChild(breadcrumbHost);
    frame.appendChild(head);
    frame.appendChild(body);
    host.appendChild(frame);
    let currentPage = createPage();
    body.append(currentPage);
    let prevViewKind = null;
    let pageSeq = 0;
    function createPage() {
      const p = document.createElement("div");
      p.className = "desktop-mode-content-graph__panel-page";
      return p;
    }
    const swapPage = (prev, next, direction) => {
      body.append(next);
      if (prev === next || direction === "none") {
        if (prev !== next) {
          prev.remove();
        }
        return;
      }
      const enter = direction === "forward" ? "page-from-right" : "page-from-left";
      const exit = direction === "forward" ? "page-to-left" : "page-to-right";
      next.classList.add(`desktop-mode-content-graph__${enter}`);
      void next.offsetWidth;
      const mySeq = ++pageSeq;
      requestAnimationFrame(() => {
        if (mySeq !== pageSeq) {
          return;
        }
        next.classList.remove(
          `desktop-mode-content-graph__${enter}`
        );
        prev.classList.add(
          `desktop-mode-content-graph__${exit}`
        );
      });
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        prev.removeEventListener("transitionend", cleanup);
        prev.remove();
      };
      prev.addEventListener("transitionend", cleanup);
      setTimeout(cleanup, 360);
    };
    const keyForView = (v) => {
      switch (v.kind) {
        case "post":
          return null;
        case "user":
          return `user:${v.user.id}`;
        case "term":
          return `term:${v.term.taxonomy}:${v.term.id}`;
        case "comment":
          return `comment:${v.comment.id}`;
        case "media":
          return `media:${v.media.id}`;
        case "revision":
          return `revision:${v.revision.id}`;
      }
    };
    const desktopApi = () => {
      const wp = window.wp ?? {};
      return wp.desktop ?? {};
    };
    const openAdminUrl = (href, labelText, icon, windowKey) => {
      const api = desktopApi();
      if (!api.windowManager || !api.deriveWindowId || !href) {
        if (href) {
          window.location.href = href;
        }
        return;
      }
      const focused = api.windowManager.getFocused?.();
      if (focused?.isFullscreen?.()) {
        focused.toggleFullscreen?.();
      }
      let id = api.deriveWindowId(href);
      if (windowKey) {
        id = `${id}-${windowKey}`;
      }
      api.windowManager.open({
        id,
        baseId: id,
        url: href,
        title: labelText,
        icon
      });
    };
    const renderBreadcrumb = () => {
      breadcrumbHost.replaceChildren();
      if (currentView.kind === "post" || !currentPost) {
        breadcrumbHost.hidden = true;
        return;
      }
      breadcrumbHost.hidden = false;
      const back = document.createElement("button");
      back.type = "button";
      back.className = "desktop-mode-content-graph__panel-breadcrumb-back";
      const arrow = document.createElement("span");
      arrow.className = "dashicons dashicons-arrow-left-alt2 desktop-mode-content-graph__panel-breadcrumb-arrow";
      arrow.setAttribute("aria-hidden", "true");
      const backLabel = document.createElement("span");
      backLabel.className = "desktop-mode-content-graph__panel-breadcrumb-label";
      backLabel.textContent = currentPost.post.title || `#${currentPost.post.id}`;
      back.appendChild(arrow);
      back.appendChild(backLabel);
      back.title = __("Back to post");
      back.addEventListener("click", () => {
        currentView = { kind: "post" };
        renderCurrent();
      });
      breadcrumbHost.appendChild(back);
    };
    const renderCurrent = () => {
      setPanelOpen(true);
      renderBreadcrumb();
      const next = createPage();
      const prev = currentPage;
      currentPage = next;
      switch (currentView.kind) {
        case "post":
          renderPostView(currentPost);
          break;
        case "user":
          renderUserView(currentView);
          break;
        case "term":
          renderTermView(currentView);
          break;
        case "comment":
          renderCommentView(currentView);
          break;
        case "media":
          renderMediaView(currentView.media);
          break;
        case "revision":
          renderRevisionView(currentView.revision);
          break;
      }
      let direction = "none";
      if (prevViewKind !== null && prevViewKind !== currentView.kind) {
        if (currentView.kind === "post") {
          direction = "back";
        } else {
          direction = "forward";
        }
      }
      swapPage(prev, next, direction);
      callbacks.onViewChange?.(keyForView(currentView));
      prevViewKind = currentView.kind;
    };
    const renderPostView = (detail) => {
      if (!detail) {
        title.textContent = "";
        meta.textContent = "";
        return;
      }
      title.textContent = detail.post.title || `#${detail.post.id}`;
      meta.textContent = `${detail.post.type} · ${detail.post.status}`;
      currentPage.appendChild(renderAuthorBlock(detail));
      currentPage.appendChild(renderDatesBlock(detail));
      currentPage.appendChild(renderStatsGrid([
        { label: __("Contributors"), value: detail.contributors.length },
        { label: __("Comments"), value: detail.comments.length },
        { label: __("Taxonomies"), value: detail.categories.length },
        { label: __("Media"), value: detail.attached_media.length },
        { label: __("Revisions"), value: detail.revisions.length }
      ]));
      currentPage.appendChild(renderPostActionsBlock(detail));
    };
    const renderAuthorBlock = (detail) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-author";
      if (!detail.author) {
        wrap.hidden = true;
        return wrap;
      }
      const label = document.createElement("span");
      label.className = "desktop-mode-content-graph__panel-section-label";
      label.textContent = __("Author");
      wrap.appendChild(label);
      const row = document.createElement("div");
      row.className = "desktop-mode-content-graph__panel-author-row";
      if (detail.author.avatar) {
        const img = document.createElement("img");
        img.className = "desktop-mode-content-graph__panel-avatar";
        img.src = detail.author.avatar;
        img.alt = "";
        row.appendChild(img);
      }
      const name = document.createElement("span");
      name.className = "desktop-mode-content-graph__panel-author-name";
      name.textContent = detail.author.name;
      row.appendChild(name);
      wrap.appendChild(row);
      return wrap;
    };
    const renderDatesBlock = (detail) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-dates";
      const items = [];
      if (detail.post.date) {
        items.push({ label: __("Published"), iso: detail.post.date });
      }
      if (detail.post.modified && detail.post.modified !== detail.post.date) {
        items.push({
          label: __("Modified"),
          iso: detail.post.modified
        });
      }
      if (items.length === 0) {
        wrap.hidden = true;
        return wrap;
      }
      for (const it of items) {
        const row = document.createElement("div");
        row.className = "desktop-mode-content-graph__panel-date-row";
        const labelEl = document.createElement("span");
        labelEl.className = "desktop-mode-content-graph__panel-section-label";
        labelEl.textContent = it.label;
        const valueEl = document.createElement("span");
        valueEl.className = "desktop-mode-content-graph__panel-date-value";
        valueEl.textContent = formatDate$1(it.iso);
        row.appendChild(labelEl);
        row.appendChild(valueEl);
        wrap.appendChild(row);
      }
      return wrap;
    };
    const renderStatsGrid = (entries) => {
      const ul = document.createElement("ul");
      ul.className = "desktop-mode-content-graph__panel-stats";
      for (const e of entries) {
        const li = document.createElement("li");
        li.className = "desktop-mode-content-graph__panel-stat";
        const num = document.createElement("span");
        num.className = "desktop-mode-content-graph__panel-stat-num";
        num.textContent = typeof e.value === "number" ? formatNumber(e.value) : e.value;
        const labelEl = document.createElement("span");
        labelEl.className = "desktop-mode-content-graph__panel-stat-label";
        labelEl.textContent = e.label;
        li.appendChild(num);
        li.appendChild(labelEl);
        ul.appendChild(li);
      }
      return ul;
    };
    const renderPostActionsBlock = (detail) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-actions";
      const api = desktopApi();
      if (api.myWordpress) {
        const myWp = button({
          label: __("Open in My WordPress"),
          icon: "dashicons-wordpress",
          primary: true
        });
        myWp.addEventListener("click", () => {
          const entityId = detail.post.type === "page" ? "pages" : "posts";
          api.myWordpress.openDetail({
            entityId,
            postId: detail.post.id,
            postTitle: detail.post.title || `#${detail.post.id}`
          });
        });
        wrap.appendChild(myWp);
      }
      if (detail.post.edit_url) {
        const edit = button({
          label: __("Edit"),
          icon: "dashicons-edit"
        });
        edit.addEventListener(
          "click",
          () => openAdminUrl(
            detail.post.edit_url,
            detail.post.title,
            "dashicons-admin-post",
            `post-${detail.post.id}`
          )
        );
        wrap.appendChild(edit);
      }
      if (detail.post.view_url) {
        const view = button({
          label: __("View"),
          icon: "dashicons-external"
        });
        view.addEventListener(
          "click",
          () => openAdminUrl(
            detail.post.view_url,
            detail.post.title,
            "dashicons-admin-post",
            `post-${detail.post.id}`
          )
        );
        wrap.appendChild(view);
      }
      return wrap;
    };
    const renderUserView = (view) => {
      const { user, role, stats, loading } = view;
      title.textContent = stats?.profile.name ?? user.name;
      meta.textContent = role === "author" ? __("Author") : __("Contributor");
      const head2 = document.createElement("div");
      head2.className = "desktop-mode-content-graph__panel-detail-head";
      const avatar = stats?.profile.avatarUrl || user.avatar;
      if (avatar) {
        const img = document.createElement("img");
        img.className = "desktop-mode-content-graph__panel-detail-avatar desktop-mode-content-graph__panel-detail-avatar--lg";
        img.src = avatar;
        img.alt = "";
        head2.appendChild(img);
      }
      const handleEl = document.createElement("div");
      handleEl.className = "desktop-mode-content-graph__panel-detail-handle";
      handleEl.innerHTML = `<strong>${escapeHtml$1(stats?.profile.name ?? user.name)}</strong><span>@${escapeHtml$1(user.slug)}</span>`;
      head2.appendChild(handleEl);
      currentPage.appendChild(head2);
      if (stats?.profile.roleLabels?.length) {
        currentPage.appendChild(
          renderBadges(
            __("Roles"),
            stats.profile.roleLabels
          )
        );
      }
      if (stats?.profile.description) {
        currentPage.appendChild(
          renderProse(__("About"), stats.profile.description)
        );
      }
      if (stats?.profile.website) {
        currentPage.appendChild(
          renderLinkRow(
            __("Website"),
            stats.profile.website,
            stats.profile.website
          )
        );
      }
      if (stats) {
        const cs = stats.counts;
        currentPage.appendChild(
          renderStatsGrid([
            { label: __("Posts"), value: cs.posts.total },
            { label: __("Pages"), value: cs.pages.total },
            { label: __("CPT"), value: cs.cpt },
            {
              label: __("Comments received"),
              value: cs.commentsReceived
            },
            {
              label: __("Comments left"),
              value: cs.commentsLeft
            }
          ])
        );
      }
      if (stats?.topTerms?.length) {
        currentPage.appendChild(
          renderTopTerms(__("Top topics"), stats.topTerms)
        );
      }
      if (stats) {
        currentPage.appendChild(
          renderMilestones([
            {
              label: __("First published"),
              iso: stats.milestones.firstPublished
            },
            {
              label: __("Last published"),
              iso: stats.milestones.lastPublished
            }
          ])
        );
      }
      if (loading) {
        currentPage.appendChild(renderLoadingRow());
      }
      currentPage.appendChild(
        renderActionRow({
          label: __("Open in WordPress"),
          icon: "dashicons-admin-users",
          href: user.edit_url,
          title: user.name,
          primary: true,
          windowKey: `user-${user.id}`
        })
      );
    };
    const renderTermView = (view) => {
      const { term, stats, loading } = view;
      title.textContent = stats?.profile.name ?? term.name;
      meta.textContent = `${stats?.profile.taxonomyLabel ?? term.tax_label} · ${stats?.profile.taxonomy ?? term.taxonomy}`;
      if (stats?.profile.parentName) {
        currentPage.appendChild(
          renderInlineMeta([
            {
              label: __("Parent"),
              value: stats.profile.parentName
            }
          ])
        );
      }
      if (stats?.profile.description) {
        currentPage.appendChild(
          renderProse(__("Description"), stats.profile.description)
        );
      }
      if (stats) {
        currentPage.appendChild(
          renderStatsGrid([
            { label: __("Posts"), value: stats.counts.posts.total },
            {
              label: __("Comments"),
              value: stats.counts.commentsReceived
            },
            {
              label: __("Authors"),
              value: stats.counts.distinctAuthors
            }
          ])
        );
      } else {
        currentPage.appendChild(
          renderStatsGrid([
            { label: __("Posts"), value: term.count }
          ])
        );
      }
      if (stats?.topAuthors?.length) {
        currentPage.appendChild(
          renderTopAuthors(__("Top authors"), stats.topAuthors)
        );
      }
      if (stats?.coTerms?.length) {
        currentPage.appendChild(
          renderTopTerms(
            __("Co-occurring"),
            stats.coTerms.map((c) => ({
              ...c,
              taxonomy: term.taxonomy
            }))
          )
        );
      }
      if (stats) {
        currentPage.appendChild(
          renderMilestones([
            {
              label: __("First post"),
              iso: stats.milestones.firstPosted
            },
            {
              label: __("Latest post"),
              iso: stats.milestones.lastPosted
            }
          ])
        );
      }
      if (loading) {
        currentPage.appendChild(renderLoadingRow());
      }
      currentPage.appendChild(
        renderActionRow({
          label: __("Open in WordPress"),
          icon: "dashicons-tag",
          href: term.edit_url,
          title: term.name,
          primary: true,
          windowKey: `term-${term.taxonomy}-${term.id}`
        })
      );
    };
    const renderCommentView = (view) => {
      const { comment, stats, loading } = view;
      const authorName = stats?.author.name ?? comment.author;
      title.textContent = authorName || `#${comment.id}`;
      meta.textContent = formatDate$1(stats?.comment.date ?? comment.date);
      const avatar = stats?.author.avatarUrl;
      if (avatar) {
        const head2 = document.createElement("div");
        head2.className = "desktop-mode-content-graph__panel-detail-head";
        const img = document.createElement("img");
        img.className = "desktop-mode-content-graph__panel-detail-avatar desktop-mode-content-graph__panel-detail-avatar--lg";
        img.src = avatar;
        img.alt = "";
        head2.appendChild(img);
        const handleEl = document.createElement("div");
        handleEl.className = "desktop-mode-content-graph__panel-detail-handle";
        handleEl.innerHTML = `<strong>${escapeHtml$1(authorName)}</strong>` + (stats?.author.totalApprovedComments ? `<span>${formatNumber(
          stats.author.totalApprovedComments
        )} ${escapeHtml$1(__("comments"))}</span>` : "");
        head2.appendChild(handleEl);
        currentPage.appendChild(head2);
      }
      const status = stats?.comment.status ?? __("—");
      currentPage.appendChild(
        renderBadges(__("Status"), [status], {
          accent: status === "1" || status === "approved" ? "green" : "amber"
        })
      );
      const content = stats?.comment.rendered;
      if (content) {
        const wrap = document.createElement("div");
        wrap.className = "desktop-mode-content-graph__panel-detail-section";
        const label = document.createElement("span");
        label.className = "desktop-mode-content-graph__panel-section-label";
        label.textContent = __("Comment");
        wrap.appendChild(label);
        const html = document.createElement("div");
        html.className = "desktop-mode-content-graph__panel-detail-html";
        html.innerHTML = content;
        wrap.appendChild(html);
        currentPage.appendChild(wrap);
      } else if (comment.excerpt) {
        currentPage.appendChild(
          renderProse(__("Comment"), comment.excerpt)
        );
      }
      if (stats?.parent) {
        const wrap = document.createElement("blockquote");
        wrap.className = "desktop-mode-content-graph__panel-detail-quote";
        wrap.innerHTML = `<strong>${escapeHtml$1(stats.parent.authorName)}</strong><span>${escapeHtml$1(stats.parent.excerpt)}</span>`;
        currentPage.appendChild(wrap);
      }
      if (stats?.replies?.length) {
        currentPage.appendChild(renderReplies(stats.replies));
      }
      if (loading) {
        currentPage.appendChild(renderLoadingRow());
      }
      currentPage.appendChild(
        renderActionRow({
          label: __("Open in WordPress"),
          icon: "dashicons-admin-comments",
          href: comment.edit_url,
          title: authorName || __("Comment"),
          primary: true,
          windowKey: `comment-${comment.id}`
        })
      );
    };
    const renderMediaView = (media) => {
      title.textContent = media.title || `#${media.id}`;
      meta.textContent = media.mime || __("Media");
      if (media.thumb) {
        const wrap = document.createElement("div");
        wrap.className = "desktop-mode-content-graph__panel-detail-thumb";
        const img = document.createElement("img");
        img.src = media.thumb;
        img.alt = media.title || "";
        wrap.appendChild(img);
        currentPage.appendChild(wrap);
      }
      currentPage.appendChild(
        renderInlineMeta([
          { label: __("Type"), value: media.mime }
        ])
      );
      currentPage.appendChild(
        renderActionRow({
          label: __("Open in WordPress"),
          icon: "dashicons-admin-media",
          href: media.edit_url,
          title: media.title,
          primary: true,
          windowKey: `media-${media.id}`
        })
      );
    };
    const renderRevisionView = (revision) => {
      title.textContent = revision.author?.name ?? __("Revision");
      meta.textContent = formatDate$1(revision.date);
      if (revision.author) {
        const head2 = document.createElement("div");
        head2.className = "desktop-mode-content-graph__panel-detail-head";
        if (revision.author.avatar) {
          const img = document.createElement("img");
          img.className = "desktop-mode-content-graph__panel-detail-avatar desktop-mode-content-graph__panel-detail-avatar--lg";
          img.src = revision.author.avatar;
          img.alt = "";
          head2.appendChild(img);
        }
        const handleEl = document.createElement("div");
        handleEl.className = "desktop-mode-content-graph__panel-detail-handle";
        handleEl.innerHTML = `<strong>${escapeHtml$1(revision.author.name)}</strong><span>@${escapeHtml$1(revision.author.slug)}</span>`;
        head2.appendChild(handleEl);
        currentPage.appendChild(head2);
      }
      currentPage.appendChild(
        renderInlineMeta([
          { label: __("Saved"), value: formatDate$1(revision.date) }
        ])
      );
      currentPage.appendChild(
        renderActionRow({
          label: __("Open revision in WordPress"),
          icon: "dashicons-backup",
          href: revision.edit_url,
          title: __("Revision"),
          primary: true,
          windowKey: `revision-${revision.id}`
        })
      );
    };
    const renderProse = (label, text) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-detail-section";
      const labelEl = document.createElement("span");
      labelEl.className = "desktop-mode-content-graph__panel-section-label";
      labelEl.textContent = label;
      const p = document.createElement("p");
      p.className = "desktop-mode-content-graph__panel-detail-prose";
      p.textContent = text;
      wrap.appendChild(labelEl);
      wrap.appendChild(p);
      return wrap;
    };
    const renderBadges = (label, items, opts = {}) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-detail-section";
      const labelEl = document.createElement("span");
      labelEl.className = "desktop-mode-content-graph__panel-section-label";
      labelEl.textContent = label;
      wrap.appendChild(labelEl);
      const list = document.createElement("div");
      list.className = "desktop-mode-content-graph__panel-badges";
      for (const it of items) {
        const badge = document.createElement("span");
        badge.className = "desktop-mode-content-graph__panel-badge" + (opts.accent ? ` desktop-mode-content-graph__panel-badge--${opts.accent}` : "");
        badge.textContent = it;
        list.appendChild(badge);
      }
      wrap.appendChild(list);
      return wrap;
    };
    const renderInlineMeta = (items) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-inline-meta";
      for (const it of items) {
        if (!it.value) {
          continue;
        }
        const row = document.createElement("div");
        row.className = "desktop-mode-content-graph__panel-inline-meta-row";
        const labelEl = document.createElement("span");
        labelEl.className = "desktop-mode-content-graph__panel-section-label";
        labelEl.textContent = it.label;
        const valueEl = document.createElement("span");
        valueEl.className = "desktop-mode-content-graph__panel-date-value";
        valueEl.textContent = it.value;
        row.appendChild(labelEl);
        row.appendChild(valueEl);
        wrap.appendChild(row);
      }
      return wrap;
    };
    const renderLinkRow = (label, text, href) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-detail-section";
      const labelEl = document.createElement("span");
      labelEl.className = "desktop-mode-content-graph__panel-section-label";
      labelEl.textContent = label;
      const link = document.createElement("a");
      link.className = "desktop-mode-content-graph__panel-detail-link";
      link.href = href;
      link.textContent = text;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      wrap.appendChild(labelEl);
      wrap.appendChild(link);
      return wrap;
    };
    const renderTopTerms = (label, terms) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-detail-section";
      const labelEl = document.createElement("span");
      labelEl.className = "desktop-mode-content-graph__panel-section-label";
      labelEl.textContent = label;
      wrap.appendChild(labelEl);
      const list = document.createElement("ul");
      list.className = "desktop-mode-content-graph__panel-chips";
      for (const t of terms.slice(0, 8)) {
        const li = document.createElement("li");
        li.className = "desktop-mode-content-graph__panel-chip";
        li.innerHTML = `<span>${escapeHtml$1(t.name)}</span><span class="desktop-mode-content-graph__panel-chip-count">${formatNumber(
          t.count
        )}</span>`;
        list.appendChild(li);
      }
      wrap.appendChild(list);
      return wrap;
    };
    const renderTopAuthors = (label, authors) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-detail-section";
      const labelEl = document.createElement("span");
      labelEl.className = "desktop-mode-content-graph__panel-section-label";
      labelEl.textContent = label;
      wrap.appendChild(labelEl);
      const list = document.createElement("ul");
      list.className = "desktop-mode-content-graph__panel-author-list";
      for (const a of authors.slice(0, 6)) {
        const li = document.createElement("li");
        li.className = "desktop-mode-content-graph__panel-author-list-row";
        li.innerHTML = (a.userAvatarUrl ? `<img class="desktop-mode-content-graph__panel-avatar" src="${escapeAttr(
          a.userAvatarUrl
        )}" alt="" />` : "") + `<span class="desktop-mode-content-graph__panel-author-name">${escapeHtml$1(
          a.userName
        )}</span><span class="desktop-mode-content-graph__panel-chip-count">${formatNumber(
          a.count
        )}</span>`;
        list.appendChild(li);
      }
      wrap.appendChild(list);
      return wrap;
    };
    const renderMilestones = (entries) => {
      const filtered = entries.filter((e) => e.iso);
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-detail-section";
      if (filtered.length === 0) {
        wrap.hidden = true;
        return wrap;
      }
      const labelEl = document.createElement("span");
      labelEl.className = "desktop-mode-content-graph__panel-section-label";
      labelEl.textContent = __("Milestones");
      wrap.appendChild(labelEl);
      const list = document.createElement("div");
      list.className = "desktop-mode-content-graph__panel-milestones";
      for (const e of filtered) {
        const row = document.createElement("div");
        row.className = "desktop-mode-content-graph__panel-milestone-row";
        const k = document.createElement("span");
        k.className = "desktop-mode-content-graph__panel-milestone-key";
        k.textContent = e.label;
        const v = document.createElement("span");
        v.className = "desktop-mode-content-graph__panel-date-value";
        v.textContent = formatDate$1(e.iso);
        row.appendChild(k);
        row.appendChild(v);
        list.appendChild(row);
      }
      wrap.appendChild(list);
      return wrap;
    };
    const renderReplies = (replies) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-detail-section";
      const labelEl = document.createElement("span");
      labelEl.className = "desktop-mode-content-graph__panel-section-label";
      labelEl.textContent = sprintf(
        /* translators: %d: number of comment replies. */
        __("Replies (%d)"),
        replies.length
      );
      wrap.appendChild(labelEl);
      const list = document.createElement("ul");
      list.className = "desktop-mode-content-graph__panel-replies";
      for (const r of replies.slice(0, 5)) {
        const li = document.createElement("li");
        li.className = "desktop-mode-content-graph__panel-reply";
        li.innerHTML = `<header><strong>${escapeHtml$1(r.authorName)}</strong><span>${formatDate$1(r.date)}</span></header><p>${escapeHtml$1(r.excerpt)}</p>`;
        list.appendChild(li);
      }
      wrap.appendChild(list);
      return wrap;
    };
    const renderLoadingRow = () => {
      const div = document.createElement("div");
      div.className = "desktop-mode-content-graph__panel-detail-loading";
      div.innerHTML = `<wpd-spinner></wpd-spinner><span>${escapeHtml$1(
        __("Loading details…")
      )}</span>`;
      return div;
    };
    const renderActionRow = (opts) => {
      const wrap = document.createElement("div");
      wrap.className = "desktop-mode-content-graph__panel-actions";
      if (!opts.href) {
        wrap.hidden = true;
        return wrap;
      }
      const btn = button({
        label: opts.label,
        icon: opts.icon,
        primary: opts.primary
      });
      btn.addEventListener(
        "click",
        () => openAdminUrl(opts.href, opts.title, opts.icon, opts.windowKey)
      );
      wrap.appendChild(btn);
      return wrap;
    };
    const button = (opts) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "desktop-mode-content-graph__btn" + (opts.primary ? " desktop-mode-content-graph__btn--primary" : "");
      btn.innerHTML = `<span class="dashicons ${escapeAttr(opts.icon)}" aria-hidden="true"></span><span>${escapeHtml$1(opts.label)}</span>`;
      return btn;
    };
    return {
      setLoading: (id, fallbackTitle) => {
        setPanelOpen(true);
        breadcrumbHost.hidden = true;
        currentView = { kind: "post" };
        prevViewKind = null;
        title.textContent = fallbackTitle ?? `#${id}`;
        meta.textContent = __("Loading…");
        body.replaceChildren();
        currentPage = createPage();
        body.append(currentPage);
        const loading = document.createElement("div");
        loading.className = "desktop-mode-content-graph__panel-loading";
        loading.innerHTML = "<wpd-spinner></wpd-spinner>";
        currentPage.appendChild(loading);
        callbacks.onViewChange?.(null);
      },
      setError: (message) => {
        setPanelOpen(true);
        breadcrumbHost.hidden = true;
        currentView = { kind: "post" };
        prevViewKind = null;
        body.replaceChildren();
        currentPage = createPage();
        body.append(currentPage);
        const empty = document.createElement("p");
        empty.className = "desktop-mode-content-graph__panel-empty";
        empty.textContent = message;
        currentPage.appendChild(empty);
        callbacks.onViewChange?.(null);
      },
      setDetail: (detail) => {
        currentPost = detail;
        currentView = { kind: "post" };
        renderCurrent();
      },
      showUser: (userId) => {
        if (!currentPost) {
          return;
        }
        const isAuthor = currentPost.author?.id === userId;
        const user = isAuthor ? currentPost.author : currentPost.contributors.find((c) => c.id === userId);
        if (!user) {
          return;
        }
        currentView = {
          kind: "user",
          user,
          role: isAuthor ? "author" : "contributor",
          stats: null,
          loading: true
        };
        renderCurrent();
        const seq = ++fetchSeq;
        void fetchUserStats(cfg, userId).then((stats) => {
          if (seq !== fetchSeq || currentView.kind !== "user" || currentView.user.id !== userId) {
            return;
          }
          currentView = { ...currentView, stats, loading: false };
          renderCurrent();
        }).catch((err) => {
          if (seq !== fetchSeq || currentView.kind !== "user" || currentView.user.id !== userId) {
            return;
          }
          currentView = { ...currentView, loading: false };
          renderCurrent();
          console.warn("[content-graph] user-stats failed", err);
        });
      },
      showTerm: (termId, taxonomy) => {
        if (!currentPost) {
          return;
        }
        const term = currentPost.categories.find(
          (t) => t.id === termId && t.taxonomy === taxonomy
        );
        if (!term) {
          return;
        }
        currentView = {
          kind: "term",
          term,
          stats: null,
          loading: true
        };
        renderCurrent();
        const seq = ++fetchSeq;
        void fetchTermStats(cfg, taxonomy, termId).then((stats) => {
          if (seq !== fetchSeq || currentView.kind !== "term" || currentView.term.id !== termId) {
            return;
          }
          currentView = { ...currentView, stats, loading: false };
          renderCurrent();
        }).catch((err) => {
          if (seq !== fetchSeq || currentView.kind !== "term" || currentView.term.id !== termId) {
            return;
          }
          currentView = { ...currentView, loading: false };
          renderCurrent();
          console.warn("[content-graph] term-stats failed", err);
        });
      },
      showComment: (commentId) => {
        if (!currentPost) {
          return;
        }
        const comment = currentPost.comments.find(
          (c) => c.id === commentId
        );
        if (!comment) {
          return;
        }
        currentView = {
          kind: "comment",
          comment,
          stats: null,
          loading: true
        };
        renderCurrent();
        const seq = ++fetchSeq;
        void fetchCommentStats(cfg, commentId).then((stats) => {
          if (seq !== fetchSeq || currentView.kind !== "comment" || currentView.comment.id !== commentId) {
            return;
          }
          currentView = { ...currentView, stats, loading: false };
          renderCurrent();
        }).catch((err) => {
          if (seq !== fetchSeq || currentView.kind !== "comment" || currentView.comment.id !== commentId) {
            return;
          }
          currentView = { ...currentView, loading: false };
          renderCurrent();
          console.warn(
            "[content-graph] comment-stats failed",
            err
          );
        });
      },
      showMedia: (mediaId) => {
        if (!currentPost) {
          return;
        }
        const media = currentPost.attached_media.find(
          (m) => m.id === mediaId
        );
        if (!media) {
          return;
        }
        currentView = { kind: "media", media };
        renderCurrent();
      },
      showRevision: (revisionId) => {
        if (!currentPost) {
          return;
        }
        const revision = currentPost.revisions.find(
          (r) => r.id === revisionId
        );
        if (!revision) {
          return;
        }
        currentView = { kind: "revision", revision };
        renderCurrent();
      },
      hide: () => {
        setPanelOpen(false);
      },
      destroy: () => {
        host.replaceChildren();
      }
    };
  }
  function formatDate$1(iso) {
    if (!iso) {
      return "";
    }
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }
  function formatNumber(n) {
    try {
      return new Intl.NumberFormat().format(n);
    } catch {
      return String(n);
    }
  }
  function escapeHtml$1(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
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
  function getPixi() {
    const pixi = window.PIXI;
    return pixi ?? null;
  }
  const DEFAULT_SIM_OPTIONS = {
    // Tuned to mirror Obsidian's airy graph: longer springs, weaker
    // gravity, stronger repulsion, so disconnected components drift
    // to the periphery instead of pancaking onto the connected core.
    // Repulsion is intentionally generous, on a real-world dataset
    // like Obsidian's vault you'd see most nodes isolated from the
    // connected core, and we want them spread out enough that the
    // initial fit doesn't crush every label on top of every other.
    repulsion: 26e3,
    springK: 0.04,
    springLen: 200,
    gravity: 35e-4,
    damping: 0.86
  };
  const ALPHA_DECAY = 0.992;
  const ALPHA_MIN = 0.01;
  const ALPHA_REHEAT = 1;
  const MAX_VELOCITY = 12;
  class ForceSim {
    constructor(nodes, edges, opts = DEFAULT_SIM_OPTIONS) {
      this.dragOrigin = null;
      this.dragInfluenceRadius = 500;
      this.groupAssignment = null;
      this.groupOrder = null;
      this.groupAttractorStrength = 0.12;
      this.groupOrderSpacing = 320;
      this.groupOrderStaggerY = 0;
      this.alpha = ALPHA_REHEAT;
      this.nodes = nodes;
      this.edges = edges;
      this.opts = opts;
    }
    reheat(value = ALPHA_REHEAT, kick = true) {
      this.alpha = Math.max(this.alpha, value);
      if (!kick) {
        return;
      }
      const kickStrength = value * 3;
      for (const n of this.nodes) {
        if (n.pinned) {
          continue;
        }
        n.vx += (Math.random() - 0.5) * kickStrength;
        n.vy += (Math.random() - 0.5) * kickStrength;
      }
    }
    get isSettled() {
      return this.alpha < ALPHA_MIN;
    }
    /**
     * One simulation step. `dt` defaults to 1 (one frame at the
     * `Pixi.Ticker`'s native pace); pass a tick's `deltaTime` to
     * compensate for frame skips.
     */
    step(dt = 1) {
      if (this.isSettled) {
        return;
      }
      const { repulsion, springK, springLen, gravity, damping } = this.opts;
      const nodes = this.nodes;
      const len = nodes.length;
      for (let i = 0; i < len; i++) {
        const a2 = nodes[i];
        for (let j = i + 1; j < len; j++) {
          const b = nodes[j];
          let dx = a2.x - b.x;
          let dy = a2.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = (i - j) * 0.5;
            dy = (i + j) * 0.5;
            d2 = dx * dx + dy * dy;
          }
          const f = repulsion / d2;
          const d = Math.sqrt(d2);
          const fx = dx / d * f;
          const fy = dy / d * f;
          const wa = a2.pinned ? 0 : 1;
          const wb = b.pinned ? 0 : 1;
          a2.vx += fx * wa;
          a2.vy += fy * wa;
          b.vx -= fx * wb;
          b.vy -= fy * wb;
        }
      }
      for (const e of this.edges) {
        const dx = e.to.x - e.from.x;
        const dy = e.to.y - e.from.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
        const f = (d - springLen) * springK;
        const fx = dx / d * f;
        const fy = dy / d * f;
        if (!e.from.pinned) {
          e.from.vx += fx;
          e.from.vy += fy;
        }
        if (!e.to.pinned) {
          e.to.vx -= fx;
          e.to.vy -= fy;
        }
      }
      this.applyClusterAttractor();
      const a = this.alpha;
      const drag = this.dragOrigin;
      const dragR = this.dragInfluenceRadius;
      const dragR2 = dragR * dragR;
      for (const n of nodes) {
        if (!n.pinned) {
          n.vx -= n.x * gravity;
          n.vy -= n.y * gravity;
          n.vx *= damping;
          n.vy *= damping;
          if (n.vx > MAX_VELOCITY) {
            n.vx = MAX_VELOCITY;
          } else if (n.vx < -MAX_VELOCITY) {
            n.vx = -MAX_VELOCITY;
          }
          if (n.vy > MAX_VELOCITY) {
            n.vy = MAX_VELOCITY;
          } else if (n.vy < -MAX_VELOCITY) {
            n.vy = -MAX_VELOCITY;
          }
          let nodeAlpha = a;
          if (drag) {
            const ddx = n.x - drag.x;
            const ddy = n.y - drag.y;
            const dd2 = ddx * ddx + ddy * ddy;
            if (dd2 >= dragR2) {
              nodeAlpha = 0;
            } else {
              const t = 1 - Math.sqrt(dd2) / dragR;
              nodeAlpha *= t * t * (3 - 2 * t);
            }
          }
          n.x += n.vx * nodeAlpha * dt;
          n.y += n.vy * nodeAlpha * dt;
        }
      }
      this.alpha *= ALPHA_DECAY;
    }
    /**
     * Hand each non-pinned node a pull toward its group centroid(s).
     * Centroids are emergent — recomputed from current member positions
     * each tick — so they drift with their cluster, rather than being
     * pinned to a fixed lattice. Multi-membership posts (a post in two
     * categories) receive `attractorStrength / membershipCount` of force
     * per group, summed across their groups, so the post settles at
     * the balance between centroids.
     *
     * No-op when `groupAssignment` is null.
     */
    applyClusterAttractor() {
      const assignment = this.groupAssignment;
      if (!assignment) {
        return;
      }
      const k = this.groupAttractorStrength;
      if (k <= 0) {
        return;
      }
      const orderedX = /* @__PURE__ */ new Map();
      const orderedY = /* @__PURE__ */ new Map();
      if (this.groupOrder && this.groupOrder.length > 0) {
        const n = this.groupOrder.length;
        const spacing = this.groupOrderSpacing;
        const stagger = this.groupOrderStaggerY;
        for (let i = 0; i < n; i++) {
          const key = this.groupOrder[i];
          orderedX.set(key, (i - (n - 1) / 2) * spacing);
          if (stagger > 0) {
            orderedY.set(key, i % 2 === 0 ? -stagger : stagger);
          }
        }
      }
      const centroids = /* @__PURE__ */ new Map();
      for (const n of this.nodes) {
        const keys = assignment.get(n.id);
        if (!keys || keys.length === 0) {
          continue;
        }
        for (const key of keys) {
          const c = centroids.get(key);
          if (c) {
            c.sx += n.x;
            c.sy += n.y;
            c.count++;
          } else {
            centroids.set(key, { sx: n.x, sy: n.y, count: 1 });
          }
        }
      }
      for (const n of this.nodes) {
        if (n.pinned) {
          continue;
        }
        const keys = assignment.get(n.id);
        if (!keys || keys.length === 0) {
          continue;
        }
        const perKey = k / keys.length;
        for (const key of keys) {
          const c = centroids.get(key);
          if (!c || c.count === 0) {
            continue;
          }
          const cx = orderedX.has(key) ? orderedX.get(key) : c.sx / c.count;
          const cy = orderedY.has(key) ? orderedY.get(key) : c.sy / c.count;
          n.vx += (cx - n.x) * perKey;
          n.vy += (cy - n.y) * perKey;
        }
      }
    }
    /**
     * Public hand-off used by the scene when the toolbar's group-by
     * selector changes. Pass `null` for the map to disable clustering
     * and fall back to the existing gravity-toward-origin layout.
     * The optional `order` argument pins listed group keys to a
     * left-to-right horizontal lattice (chronological for date
     * facets); keys not in `order` keep emergent centroids.
     *
     * The sim is reheated so the new force visibly settles instead
     * of waiting for the next external nudge.
     */
    setGroupAssignment(map, order = null) {
      this.groupAssignment = map;
      this.groupOrder = map ? order : null;
      this.reheat(0.3, false);
    }
  }
  const KIND_COLOR = {
    user: 3829232,
    term: 2926970,
    comment: 15239482,
    media: 10510036,
    revision: 7042949
  };
  const KIND_DASHICON = {
    user: "admin-users",
    // Fallback for term kinds we don't have a specific icon for.
    // Per-taxonomy lookup (see `iconForTermRef`) overrides this for
    // the WordPress built-ins so categories don't share the tag's
    // visual identity.
    term: "tag",
    comment: "admin-comments",
    media: "admin-media",
    revision: "backup"
  };
  function iconForTermRef(ref) {
    switch (ref.taxonomy) {
      case "category":
        return "category";
      case "post_tag":
        return "tag";
      default:
        return KIND_DASHICON.term;
    }
  }
  const KIND_ICON_NUDGE = {
    user: { x: 0, y: 3 },
    term: { x: 0, y: 3 },
    // The speech-bubble dashicon is intrinsically off-balance — even
    // after the bbox is centred, the visible bubble drifts toward the
    // upper-right because the tail-less side carries more glyph mass.
    // Tuned by eye against the rendered output: pull a bit left, push
    // a bit down. Don't pile on more correction without re-checking;
    // what looks centred at one zoom can over-shoot at another.
    comment: { x: 1, y: 4 },
    media: { x: -1, y: 1 },
    revision: { x: 0, y: 3 }
  };
  const DISC_RADIUS = 14;
  class SatelliteLayer {
    constructor(pixi, satelliteParent, spokeParent, onClick, hostEl, claimPointer) {
      this.pixi = pixi;
      this.satelliteParent = satelliteParent;
      this.spokeParent = spokeParent;
      this.onClick = onClick;
      this.hostEl = hostEl;
      this.claimPointer = claimPointer;
      this.views = [];
      this.focused = null;
      this.rafId = null;
      this.selectedKey = null;
      this.linkGfx = new pixi.Graphics();
      this.spokeParent.addChild(this.linkGfx);
      this.layer = new pixi.Container();
      this.satelliteParent.addChild(this.layer);
      this.hoverEl = document.createElement("div");
      this.hoverEl.className = "desktop-mode-content-graph__tooltip";
      this.hoverEl.hidden = true;
      this.hostEl.appendChild(this.hoverEl);
    }
    clear() {
      this.linkGfx.clear();
      this.layer.removeChildren();
      this.views = [];
      this.focused = null;
      this.selectedKey = null;
      this.hideTooltip();
    }
    drawLinks() {
      this.linkGfx.clear();
      if (!this.focused || this.views.length === 0) {
        return;
      }
      const halo = this.focused.radius + 8;
      const fx = this.focused.x;
      const fy = this.focused.y;
      for (const v of this.views) {
        const dx = v.container.x - fx;
        const dy = v.container.y - fy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= halo) {
          continue;
        }
        const t = halo / d;
        const sx = fx + dx * t;
        const sy = fy + dy * t;
        const color = KIND_COLOR[v.ref.kind];
        this.linkGfx.moveTo(sx, sy).lineTo(v.container.x, v.container.y).stroke({
          color,
          width: v.selected ? 1.8 : 1.4,
          alpha: v.selected ? 0.85 : 0.5
        });
      }
    }
    setFocused(focused, detail) {
      this.clear();
      this.focused = focused;
      const refs = this.flattenDetail(detail);
      if (refs.length === 0) {
        return;
      }
      const baseR = focused.radius;
      const minSpacing = 36;
      const ringR = Math.max(
        baseR + 86,
        baseR + 70 + refs.length * minSpacing / (2 * Math.PI)
      );
      const startAngle = -Math.PI / 2;
      const slice = 2 * Math.PI / refs.length;
      refs.forEach((ref, i) => {
        const angle = startAngle + i * slice;
        const tx = focused.x + Math.cos(angle) * ringR;
        const ty = focused.y + Math.sin(angle) * ringR;
        const view = this.buildSatellite(ref, focused.x, focused.y);
        view.targetX = tx;
        view.targetY = ty;
        this.views.push(view);
      });
      this.animateIn();
    }
    /**
     * Mark a satellite by its synthetic key (e.g. `user:123`,
     * `term:category:42`). Pass `null` to clear. The selected satellite
     * gets a thicker stroke + soft halo so the user can see which one
     * matches the panel content. Auto-cleared by `clear()` and on a
     * fresh `setFocused()`.
     */
    setSelectedKey(key) {
      if (this.selectedKey === key) {
        return;
      }
      this.selectedKey = key;
      for (const v of this.views) {
        const next = v.key === key;
        if (next === v.selected) {
          continue;
        }
        v.selected = next;
        this.repaintDisc(v);
      }
      this.drawLinks();
    }
    destroy() {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.clear();
      this.layer.destroy({ children: true });
      this.linkGfx.destroy();
      this.hoverEl.remove();
    }
    flattenDetail(detail) {
      const out = [];
      if (detail.author) {
        out.push({
          kind: "user",
          userId: detail.author.id,
          label: detail.author.name,
          meta: __("Author"),
          avatar: detail.author.avatar
        });
      }
      for (const u of detail.contributors.slice(0, 8)) {
        out.push({
          kind: "user",
          userId: u.id,
          label: u.name,
          meta: __("Contributor"),
          avatar: u.avatar
        });
      }
      for (const t of detail.categories.slice(0, 12)) {
        out.push({
          kind: "term",
          termId: t.id,
          taxonomy: t.taxonomy,
          label: t.name,
          meta: sprintf(
            /* translators: 1: taxonomy label (e.g. Category, Tag). 2: post count for the term. */
            __("%1$s · %2$d posts"),
            t.tax_label,
            t.count
          )
        });
      }
      for (const c of detail.comments.slice(0, 8)) {
        out.push({
          kind: "comment",
          commentId: c.id,
          label: c.author,
          meta: c.excerpt || formatDate(c.date)
        });
      }
      for (const m of detail.attached_media.slice(0, 12)) {
        out.push({
          kind: "media",
          mediaId: m.id,
          label: m.title,
          meta: m.mime,
          thumb: m.thumb
        });
      }
      for (const r of detail.revisions.slice(0, 8)) {
        out.push({
          kind: "revision",
          revisionId: r.id,
          parentId: detail.post.id,
          label: r.author?.name ?? __("Revision"),
          meta: formatDate(r.date)
        });
      }
      return out;
    }
    buildSatellite(ref, startX, startY) {
      const container = new this.pixi.Container();
      container.x = startX;
      container.y = startY;
      container.alpha = 0;
      container.eventMode = "static";
      container.cursor = "pointer";
      const hitR = DISC_RADIUS + 4;
      container.hitArea = {
        contains: (x, y) => {
          return x >= -hitR && x <= hitR && y >= -hitR && y <= hitR + 18;
        }
      };
      const disc = new this.pixi.Graphics();
      container.addChild(disc);
      const dashName = ref.kind === "term" ? iconForTermRef(ref) : KIND_DASHICON[ref.kind];
      const iconChar = resolveDashicon(dashName);
      const icon = new this.pixi.Text({
        text: iconChar ?? "?",
        style: {
          fontFamily: iconChar ? "dashicons" : "sans-serif",
          fontSize: iconChar ? 20 : 13,
          fill: 16777215
        },
        resolution: 2,
        anchor: { x: 0.5, y: 0.5 }
      });
      const nudge = KIND_ICON_NUDGE[ref.kind];
      icon.x = nudge?.x ?? 0;
      icon.y = nudge?.y ?? 0;
      container.addChild(icon);
      const labelText = truncate(ref.label || "—", 28);
      const labelBg = new this.pixi.Graphics();
      container.addChild(labelBg);
      const label = new this.pixi.Text({
        text: labelText,
        style: {
          fill: 1711915,
          fontSize: 11,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontWeight: "500"
        },
        resolution: 2,
        anchor: { x: 0.5, y: 0 }
      });
      label.x = 0;
      label.y = DISC_RADIUS + 2;
      container.addChild(label);
      const padX = 6;
      const padY = 1;
      const lw = label.width + padX * 2;
      const lh = label.height + padY * 2;
      labelBg.roundRect(-lw / 2, label.y - padY, lw, lh, 4).fill({ color: 16777215, alpha: 0.92 }).stroke({ color: 0, alpha: 0.08, width: 1 });
      container.on("pointerdown", (evt) => {
        const e = evt;
        e.stopPropagation?.();
        this.claimPointer();
      });
      container.on("pointerover", (evt) => {
        disc.alpha = 1;
        const e = evt;
        this.showTooltip(ref, e.global);
      });
      container.on("pointermove", (evt) => {
        const e = evt;
        this.showTooltip(ref, e.global);
      });
      container.on("pointerout", () => {
        disc.alpha = 0.95;
        this.hideTooltip();
      });
      container.on("pointertap", (evt) => {
        const e = evt;
        e.stopPropagation?.();
        this.hideTooltip();
        this.setSelectedKey(keyForRef(ref));
        this.onClick(ref);
      });
      this.layer.addChild(container);
      const view = {
        ref,
        key: keyForRef(ref),
        container,
        disc,
        icon,
        label,
        targetX: startX,
        targetY: startY,
        selected: false
      };
      this.repaintDisc(view);
      return view;
    }
    repaintDisc(v) {
      const fill = KIND_COLOR[v.ref.kind];
      v.disc.clear();
      if (v.selected) {
        v.disc.circle(0, 0, DISC_RADIUS + 6).fill({ color: fill, alpha: 0.18 });
      }
      v.disc.circle(0, 0, DISC_RADIUS).fill({ color: fill, alpha: 0.95 }).stroke({
        color: 16777215,
        width: v.selected ? 2.5 : 1.5,
        alpha: 1
      });
    }
    animateIn() {
      const t0 = performance.now();
      const duration = 240;
      const starts = this.views.map((v) => ({
        x: v.container.x,
        y: v.container.y
      }));
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const k = 1 - Math.pow(1 - t, 3);
        for (let i = 0; i < this.views.length; i++) {
          const v = this.views[i];
          const s = starts[i];
          v.container.x = s.x + (v.targetX - s.x) * k;
          v.container.y = s.y + (v.targetY - s.y) * k;
          v.container.alpha = k;
        }
        this.drawLinks();
        if (t < 1) {
          this.rafId = requestAnimationFrame(frame);
        } else {
          this.rafId = null;
        }
      };
      this.rafId = requestAnimationFrame(frame);
    }
    showTooltip(ref, global) {
      this.hoverEl.hidden = false;
      this.hoverEl.innerHTML = `<strong>${escapeHtml(ref.label || "—")}</strong>` + (ref.meta ? `<span>${escapeHtml(ref.meta)}</span>` : "");
      if (global) {
        this.hoverEl.style.left = `${global.x + 14}px`;
        this.hoverEl.style.top = `${global.y + 14}px`;
      }
    }
    hideTooltip() {
      this.hoverEl.hidden = true;
    }
  }
  function keyForRef(ref) {
    switch (ref.kind) {
      case "user":
        return `user:${ref.userId}`;
      case "term":
        return `term:${ref.taxonomy}:${ref.termId}`;
      case "comment":
        return `comment:${ref.commentId}`;
      case "media":
        return `media:${ref.mediaId}`;
      case "revision":
        return `revision:${ref.revisionId}`;
    }
  }
  function truncate(text, max) {
    if (text.length <= max) {
      return text;
    }
    return text.slice(0, max - 1).trimEnd() + "…";
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
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  const NODE_FILL = 4937059;
  const NODE_FILL_FOCUS = 2911205;
  const NODE_FILL_NEIGHBOUR = 5213171;
  const EDGE_BASE = 10135222;
  const EDGE_HOT = 2911205;
  const ICON_NUDGE_Y_ASCENT = 0;
  const ICON_NUDGE = {
    "admin-post": { x: 0.06, y: 0.06 }
  };
  const GROUP_LABEL_COLOR = {
    category: "#2c6be5",
    tag: "#2ca97a",
    author: "#7c3aed",
    year: "#ea580c",
    year_month: "#ea580c"
  };
  const ZOOM_MIN = 0.15;
  const ZOOM_MAX = 4;
  const ZOOM_SENSITIVITY = 8e-4;
  const CAMERA_EASE = 0.18;
  const CAMERA_EPSILON = 1e-3;
  const RESIZE_RECENTER_THRESHOLD = 24;
  class GraphScene {
    constructor(host, callbacks, onSatelliteClick, postTypes) {
      this.groupLabelOverlay = null;
      this.satellites = null;
      this.nodeViews = /* @__PURE__ */ new Map();
      this.edgeViews = [];
      this.groupViews = /* @__PURE__ */ new Map();
      this.currentGrouping = null;
      this.groupCatalogs = {
        authors: {},
        categories: {},
        tags: {}
      };
      this.groupingTween = null;
      this.fitFollowActive = false;
      this.fitFollowStartedAt = 0;
      this.fitFollowSawMotion = false;
      this.fitFollowMaxDurationMs = 3e3;
      this.fitFollowVelocityThreshold = 1;
      this.nodes = [];
      this.edges = [];
      this.sim = null;
      this.focusedId = null;
      this.hoveredId = null;
      this.pressedNode = null;
      this.dragOffset = { x: 0, y: 0 };
      this.isPanning = false;
      this.panStart = { x: 0, y: 0, wx: 0, wy: 0 };
      this.nodeClickActive = false;
      this.destroyed = false;
      this.tickerCb = null;
      this.resizeObserver = null;
      this.lastResizeWidth = 0;
      this.lastResizeHeight = 0;
      this.targetScale = 1;
      this.targetX = 0;
      this.targetY = 0;
      this.host = host;
      this.callbacks = callbacks;
      this.onSatelliteClick = onSatelliteClick;
      const map = /* @__PURE__ */ new Map();
      for (const t of postTypes) {
        map.set(t.slug, normalizeDashiconName(t.icon));
      }
      this.postTypeIcon = (slug) => map.get(slug) ?? defaultIconForPostType(slug);
    }
    async mount(api) {
      if (typeof api.loadModules === "function") {
        await api.loadModules(["pixijs"]);
      }
      const pixi = getPixi();
      if (!pixi) {
        throw new Error("PIXI namespace missing after loadModules.");
      }
      this.pixi = pixi;
      if (typeof document !== "undefined" && document.fonts) {
        try {
          await document.fonts.load("16px dashicons");
        } catch {
        }
      }
      const app = new pixi.Application();
      await app.init({
        resizeTo: this.host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        // Dedicated ticker, NOT the shared one. Other desktop-mode
        // bundles (posts-window, recycle-bin, …) also load Pixi via
        // `loadModules('pixijs')` — sharing `Ticker.shared` across
        // independent Application instances has bitten us: a render
        // triggered by another bundle's app would also drive our
        // renderer, sometimes while the browser had perturbed our
        // canvas (iframe mount, layout shift) and our pipes weren't
        // ready, producing the "Cannot read properties of null
        // (reading 'clear')" crash inside `Batcher.break()`.
        sharedTicker: false
      });
      this.app = app;
      this.host.appendChild(app.canvas);
      app.canvas.classList.add("desktop-mode-content-graph__canvas");
      this.world = new pixi.Container();
      this.world.x = this.host.clientWidth / 2;
      this.world.y = this.host.clientHeight / 2;
      this.world.scale.set(1);
      this.targetX = this.world.x;
      this.targetY = this.world.y;
      this.targetScale = 1;
      app.stage.addChild(this.world);
      this.edgeLayer = new pixi.Container();
      this.spokeLayer = new pixi.Container();
      this.nodeLayer = new pixi.Container();
      this.labelLayer = new pixi.Container();
      this.world.addChild(
        this.edgeLayer,
        this.spokeLayer,
        this.nodeLayer,
        this.labelLayer
      );
      this.groupLabelOverlay = document.createElement("div");
      this.groupLabelOverlay.className = "desktop-mode-content-graph__group-labels";
      this.host.appendChild(this.groupLabelOverlay);
      app.canvas.addEventListener(
        "webglcontextlost",
        (ev) => {
          ev.preventDefault();
          try {
            this.app?.ticker?.stop();
          } catch {
          }
        },
        false
      );
      const renderer = app.renderer;
      const origRender = renderer.render.bind(renderer);
      renderer.render = (...a) => {
        try {
          return origRender(...a);
        } catch (err) {
          try {
            this.app?.ticker?.stop();
          } catch {
          }
          console.warn(
            "[content-graph] Pixi render threw, stopping ticker:",
            err
          );
          return void 0;
        }
      };
      this.satellites = new SatelliteLayer(
        pixi,
        this.world,
        this.spokeLayer,
        this.onSatelliteClick,
        this.host,
        () => {
          this.nodeClickActive = true;
        }
      );
      this.bindStageInput(app.canvas);
      this.bindResize();
      this.tickerCb = (ticker) => this.tick(ticker.deltaTime);
      app.ticker.add(this.tickerCb);
    }
    setData(payload) {
      const prev = /* @__PURE__ */ new Map();
      for (const n of this.nodes) {
        prev.set(n.id, n);
      }
      this.groupCatalogs = payload.groups ?? {
        authors: {},
        categories: {},
        tags: {}
      };
      const nodes = payload.nodes.map((p) => {
        const old = prev.get(p.id);
        const angle = Math.random() * Math.PI * 2;
        const r = 150 + Math.random() * 250;
        return {
          ...p,
          x: old?.x ?? Math.cos(angle) * r,
          y: old?.y ?? Math.sin(angle) * r,
          vx: 0,
          vy: 0,
          pinned: false,
          radius: 4,
          color: NODE_FILL,
          degree: 0
        };
      });
      const byId = /* @__PURE__ */ new Map();
      for (const n of nodes) {
        byId.set(n.id, n);
      }
      const edges = [];
      for (const e of payload.edges) {
        const f = byId.get(e.from);
        const t = byId.get(e.to);
        if (!f || !t) {
          continue;
        }
        f.degree++;
        t.degree++;
        edges.push({ from: f, to: t });
      }
      for (const n of nodes) {
        n.radius = 8 + Math.min(8, Math.sqrt(n.degree) * 2.4);
      }
      this.nodes = nodes;
      this.edges = edges;
      this.rebuildSprites();
      this.sim = new ForceSim(nodes, edges);
      this.sim.reheat(0.12, false);
      const warmupSteps = Math.min(90, 30 + nodes.length);
      for (let i = 0; i < warmupSteps; i++) {
        this.sim.step(1);
      }
      if (this.currentGrouping) {
        this.setGrouping(this.currentGrouping);
      }
    }
    rebuildSprites() {
      this.edgeLayer.removeChildren();
      this.nodeLayer.removeChildren();
      this.labelLayer.removeChildren();
      this.nodeViews.clear();
      this.edgeViews = [];
      for (const e of this.edges) {
        const gfx = new this.pixi.Graphics();
        this.edgeLayer.addChild(gfx);
        this.edgeViews.push({ edge: e, gfx });
      }
      for (const n of this.nodes) {
        const container = new this.pixi.Container();
        container.eventMode = "static";
        container.cursor = "pointer";
        container.hitArea = new this.pixi.Circle(
          0,
          0,
          Math.max(18, n.radius + 8)
        );
        this.bindNodeInput(container, n);
        this.nodeLayer.addChild(container);
        const halo = new this.pixi.Graphics();
        container.addChild(halo);
        const iconName = this.postTypeIcon(n.type);
        const iconChar = resolveDashicon(iconName);
        const icon = new this.pixi.Text({
          text: iconChar ?? "●",
          // black circle fallback
          style: {
            fontFamily: iconChar ? "dashicons" : "sans-serif",
            fontSize: 2 * n.radius,
            fill: NODE_FILL
          },
          resolution: 2,
          anchor: { x: 0.5, y: 0.5 }
        });
        container.addChild(icon);
        const labelBox = new this.pixi.Container();
        this.labelLayer.addChild(labelBox);
        const labelBg = new this.pixi.Graphics();
        labelBox.addChild(labelBg);
        const label = new this.pixi.Text({
          text: this.truncate(n.title || `#${n.id}`, 32),
          style: {
            fill: 2042167,
            fontSize: 11,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            fontWeight: "500"
          },
          resolution: 2,
          anchor: { x: 0.5, y: 0 }
        });
        labelBox.addChild(label);
        const padX = 5;
        const padY = 1;
        const lw = label.width + padX * 2;
        const lh = label.height + padY * 2;
        labelBg.roundRect(-lw / 2, -padY, lw, lh, 4).fill({ color: 16777215, alpha: 0.78 }).stroke({
          color: 0,
          alpha: 0.06,
          width: 1
        });
        this.nodeViews.set(n.id, {
          node: n,
          container,
          halo,
          icon,
          labelBox,
          labelBg,
          label,
          iconCharCode: iconChar,
          iconName
        });
      }
    }
    truncate(text, max) {
      if (text.length <= max) {
        return text;
      }
      return text.slice(0, max - 1).trimEnd() + "…";
    }
    bindNodeInput(gfx, node) {
      let downAt = { x: 0, y: 0 };
      let isDragging = false;
      const DRAG_THRESHOLD_SQ = 36;
      gfx.on("pointerdown", (evt) => {
        const e = evt;
        e.stopPropagation?.();
        downAt = { x: e.global.x, y: e.global.y };
        this.nodeClickActive = true;
        this.pressedNode = node;
        isDragging = false;
        node.pinned = true;
        node.vx = 0;
        node.vy = 0;
      });
      gfx.on("pointerover", () => {
        this.hoveredId = node.id;
        this.draw();
      });
      gfx.on("pointerout", () => {
        if (this.hoveredId === node.id) {
          this.hoveredId = null;
          this.draw();
        }
      });
      gfx.on("pointerup", (evt) => {
        const e = evt;
        const dx = e.global.x - downAt.x;
        const dy = e.global.y - downAt.y;
        if (!isDragging && dx * dx + dy * dy <= 256) {
          this.callbacks.onNodeClick?.(node);
        }
        node.pinned = this.focusedId === node.id;
        this.pressedNode = null;
        if (this.sim) {
          this.sim.dragOrigin = null;
          if (isDragging) {
            this.sim.reheat(0.35, false);
          }
        }
        isDragging = false;
      });
      gfx.on("pointerupoutside", () => {
        node.pinned = this.focusedId === node.id;
        this.pressedNode = null;
        if (this.sim) {
          this.sim.dragOrigin = null;
        }
        isDragging = false;
      });
      gfx.on("globalpointermove", (evt) => {
        if (this.pressedNode !== node) {
          return;
        }
        const e = evt;
        const dx = e.global.x - downAt.x;
        const dy = e.global.y - downAt.y;
        const d2 = dx * dx + dy * dy;
        if (!isDragging) {
          if (d2 < DRAG_THRESHOLD_SQ) {
            return;
          }
          isDragging = true;
          const w2 = this.toWorld(e.global.x, e.global.y);
          this.dragOffset = { x: node.x - w2.x, y: node.y - w2.y };
          if (this.sim) {
            this.sim.dragOrigin = { x: node.x, y: node.y };
            this.sim.reheat(0.3, false);
          }
        }
        const w = this.toWorld(e.global.x, e.global.y);
        node.x = w.x + this.dragOffset.x;
        node.y = w.y + this.dragOffset.y;
        node.vx = 0;
        node.vy = 0;
        if (this.sim) {
          this.sim.dragOrigin = { x: node.x, y: node.y };
        }
      });
    }
    bindStageInput(canvas) {
      canvas.addEventListener(
        "wheel",
        (ev) => {
          ev.preventDefault();
          const factor = Math.exp(-ev.deltaY * ZOOM_SENSITIVITY);
          const nextScale = Math.max(
            ZOOM_MIN,
            Math.min(ZOOM_MAX, this.targetScale * factor)
          );
          const rect = canvas.getBoundingClientRect();
          const lx = ev.clientX - rect.left;
          const ly = ev.clientY - rect.top;
          const beforeWorldX = (lx - this.targetX) / this.targetScale;
          const beforeWorldY = (ly - this.targetY) / this.targetScale;
          this.targetScale = nextScale;
          this.targetX = lx - beforeWorldX * nextScale;
          this.targetY = ly - beforeWorldY * nextScale;
        },
        { passive: false }
      );
      canvas.addEventListener("pointerdown", (ev) => {
        if (ev.target !== canvas) {
          return;
        }
        if (this.nodeClickActive) {
          return;
        }
        this.isPanning = true;
        this.panStart = {
          x: ev.clientX,
          y: ev.clientY,
          wx: this.world.x,
          wy: this.world.y
        };
      });
      window.addEventListener("pointermove", (ev) => {
        if (!this.isPanning || this.nodeClickActive) {
          return;
        }
        const newX = this.panStart.wx + (ev.clientX - this.panStart.x);
        const newY = this.panStart.wy + (ev.clientY - this.panStart.y);
        this.world.x = newX;
        this.world.y = newY;
        this.targetX = newX;
        this.targetY = newY;
      });
      window.addEventListener("pointerup", (ev) => {
        const nodeWasTarget = this.nodeClickActive;
        this.nodeClickActive = false;
        if (!this.isPanning) {
          return;
        }
        const dx = ev.clientX - this.panStart.x;
        const dy = ev.clientY - this.panStart.y;
        this.isPanning = false;
        if (!nodeWasTarget && dx * dx + dy * dy < 9) {
          this.callbacks.onBackgroundClick?.();
        }
      });
    }
    bindResize() {
      this.lastResizeWidth = this.host.clientWidth;
      this.lastResizeHeight = this.host.clientHeight;
      this.resizeObserver = new ResizeObserver(() => {
        if (this.destroyed) {
          return;
        }
        const w = this.host.clientWidth;
        const h = this.host.clientHeight;
        if (w <= 0 || h <= 0) {
          return;
        }
        try {
          this.app.renderer.resize(w, h);
        } catch {
          return;
        }
        try {
          this.app.render();
        } catch {
        }
        const dw = Math.abs(w - this.lastResizeWidth);
        const dh = Math.abs(h - this.lastResizeHeight);
        if (dw >= RESIZE_RECENTER_THRESHOLD || dh >= RESIZE_RECENTER_THRESHOLD) {
          this.lastResizeWidth = w;
          this.lastResizeHeight = h;
        }
      });
      this.resizeObserver.observe(this.host);
    }
    toWorld(clientX, clientY) {
      const rect = this.app.canvas.getBoundingClientRect();
      const lx = clientX - rect.left;
      const ly = clientY - rect.top;
      return {
        x: (lx - this.world.x) / this.world.scale.x,
        y: (ly - this.world.y) / this.world.scale.y
      };
    }
    tick(delta) {
      if (this.destroyed) {
        return;
      }
      if (!this.app || !this.world) {
        return;
      }
      if (this.groupingTween) {
        this.advanceGroupingTween();
      } else {
        this.sim?.step(delta);
      }
      const k = 1 - Math.pow(1 - CAMERA_EASE, delta);
      const ds = this.targetScale - this.world.scale.x;
      if (Math.abs(ds) < CAMERA_EPSILON) {
        this.world.scale.set(this.targetScale);
      } else {
        this.world.scale.set(this.world.scale.x + ds * k);
      }
      const dxc = this.targetX - this.world.x;
      const dyc = this.targetY - this.world.y;
      if (Math.abs(dxc) < CAMERA_EPSILON) {
        this.world.x = this.targetX;
      } else {
        this.world.x += dxc * k;
      }
      if (Math.abs(dyc) < CAMERA_EPSILON) {
        this.world.y = this.targetY;
      } else {
        this.world.y += dyc * k;
      }
      this.draw();
      this.drawGroupLabels();
      this.satellites?.drawLinks();
      this.advanceFitFollow();
    }
    /**
     * Per-tick auto-fit while the layout is still moving after a
     * grouping change. Re-frames the camera at the current node
     * bounds whenever peak velocity is above the threshold; once
     * the layout has settled (or the hard cap has elapsed) the
     * loop disarms and the camera stays put. Skips while the
     * grouping tween is mid-lerp — velocities are zeroed there by
     * design, and the initial `fitToViewOfTargets` already framed
     * the target bounds.
     */
    advanceFitFollow() {
      if (!this.fitFollowActive) {
        return;
      }
      if (performance.now() - this.fitFollowStartedAt > this.fitFollowMaxDurationMs) {
        this.fitFollowActive = false;
        return;
      }
      if (this.groupingTween) {
        return;
      }
      let peakVelocity = 0;
      for (const n of this.nodes) {
        if (n.pinned) {
          continue;
        }
        const v = Math.hypot(n.vx, n.vy);
        if (v > peakVelocity) {
          peakVelocity = v;
        }
      }
      if (peakVelocity >= this.fitFollowVelocityThreshold) {
        this.fitFollowSawMotion = true;
        this.fitToView();
      } else if (this.fitFollowSawMotion) {
        this.fitFollowActive = false;
      }
    }
    deriveGroupKeys(n, facet) {
      switch (facet) {
        case "category":
          if (n.category_ids.length === 0) {
            return ["cat:uncat"];
          }
          return n.category_ids.map((id) => `cat:${id}`);
        case "tag":
          if (n.tag_ids.length === 0) {
            return ["tag:untagged"];
          }
          return n.tag_ids.map((id) => `tag:${id}`);
        case "author": {
          const primaryId = n.author_id || 0;
          const primaryKey = `author:${primaryId}`;
          const keys = [primaryKey, primaryKey];
          const contribs = Array.isArray(n.contributor_ids) ? n.contributor_ids : [];
          for (const cid of contribs) {
            if (cid > 0 && cid !== primaryId) {
              keys.push(`author:${cid}`);
            }
          }
          return keys;
        }
        case "year":
          return [`year:${n.year || 0}`];
        case "year_month":
          return [`ym:${n.year_month || "unknown"}`];
      }
    }
    labelForGroupKey(key) {
      const idx = key.indexOf(":");
      const facet = key.slice(0, idx);
      const rest = key.slice(idx + 1);
      switch (facet) {
        case "cat": {
          if (rest === "uncat") {
            return __("Uncategorized");
          }
          const id = Number(rest);
          return this.groupCatalogs.categories[id]?.name ?? `#${id}`;
        }
        case "tag": {
          if (rest === "untagged") {
            return __("Untagged");
          }
          const id = Number(rest);
          return this.groupCatalogs.tags[id]?.name ?? `#${id}`;
        }
        case "author": {
          const id = Number(rest);
          if (id <= 0) {
            return __("Unknown author");
          }
          return this.groupCatalogs.authors[id]?.name ?? `#${id}`;
        }
        case "year": {
          const y = Number(rest);
          if (y <= 0) {
            return __("Undated");
          }
          return String(y);
        }
        case "ym": {
          if (rest === "unknown" || rest === "") {
            return __("Undated");
          }
          return formatYearMonth(rest);
        }
      }
      return key;
    }
    buildGroupViews(members, facet) {
      if (!this.groupLabelOverlay) {
        return;
      }
      const tint = GROUP_LABEL_COLOR[facet];
      for (const [key, ids] of members) {
        if (ids.length === 0) {
          continue;
        }
        const label = `${this.labelForGroupKey(key)} (${ids.length})`;
        const el = document.createElement("div");
        el.className = "desktop-mode-content-graph__group-label";
        el.textContent = label;
        el.style.setProperty("--wpd-cg-cluster-color", tint);
        this.groupLabelOverlay.appendChild(el);
        this.groupViews.set(key, { key, label, el, members: ids });
      }
    }
    clearGroupViews() {
      for (const v of this.groupViews.values()) {
        v.el.remove();
      }
      this.groupViews.clear();
    }
    /**
     * Per-frame paint of the cluster label markers. Centroid is the
     * running average of member positions, scale is inverse of world
     * scale (so labels stay legible across zoom), alpha fades the
     * labels OUT as you zoom past the focused-node range so they
     * don't clutter the close-up view.
     */
    drawGroupLabels() {
      if (this.destroyed || this.groupViews.size === 0) {
        return;
      }
      const fade = 1 - smoothstep(1.2, 2.4, this.world.scale.x);
      const scale = this.world.scale.x;
      const ox = this.world.x;
      const oy = this.world.y;
      for (const v of this.groupViews.values()) {
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (const id of v.members) {
          const node = this.nodeViews.get(id)?.node;
          if (!node) {
            continue;
          }
          sumX += node.x;
          sumY += node.y;
          count++;
        }
        if (count === 0 || fade <= 0.02) {
          v.el.style.display = "none";
          continue;
        }
        const screenX = ox + sumX / count * scale;
        const screenY = oy + sumY / count * scale;
        v.el.style.display = "";
        v.el.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%)`;
        v.el.style.opacity = String(fade);
      }
    }
    draw() {
      if (this.destroyed) {
        return;
      }
      const focusId = this.focusedId;
      const hoverId = this.hoveredId;
      const focusNeighbours = /* @__PURE__ */ new Set();
      if (focusId !== null) {
        for (const e of this.edges) {
          if (e.from.id === focusId) {
            focusNeighbours.add(e.to.id);
          }
          if (e.to.id === focusId) {
            focusNeighbours.add(e.from.id);
          }
        }
        focusNeighbours.add(focusId);
      }
      const dimmed = focusId !== null;
      const edgeZoomFade = smoothstep(0.45, 1.1, this.world.scale.x);
      const edgeBaseAlpha = 0.2 + edgeZoomFade * 0.35;
      for (const v of this.edgeViews) {
        const { edge, gfx } = v;
        gfx.clear();
        const isFocusEdge = focusId !== null && (edge.from.id === focusId || edge.to.id === focusId);
        const isHoverEdge = hoverId !== null && (edge.from.id === hoverId || edge.to.id === hoverId);
        let alpha;
        if (dimmed) {
          alpha = isFocusEdge ? 0.85 : 0;
        } else if (isHoverEdge) {
          alpha = 0.7;
        } else {
          alpha = edgeBaseAlpha;
        }
        const color = isFocusEdge || isHoverEdge ? EDGE_HOT : EDGE_BASE;
        const width = isFocusEdge || isHoverEdge ? 1.2 : 0.7;
        let sx = edge.from.x;
        let sy = edge.from.y;
        let ex = edge.to.x;
        let ey = edge.to.y;
        if (focusId !== null) {
          if (edge.from.id === focusId) {
            const p = pointOnSegment(
              edge.from.x,
              edge.from.y,
              edge.to.x,
              edge.to.y,
              edge.from.radius + 8
            );
            sx = p.x;
            sy = p.y;
          }
          if (edge.to.id === focusId) {
            const p = pointOnSegment(
              edge.to.x,
              edge.to.y,
              edge.from.x,
              edge.from.y,
              edge.to.radius + 8
            );
            ex = p.x;
            ey = p.y;
          }
        }
        gfx.moveTo(sx, sy).lineTo(ex, ey).stroke({ color, width, alpha });
      }
      const inverseScale = 1 / this.world.scale.x;
      const zoomFade = smoothstep(0.55, 0.95, this.world.scale.x);
      for (const v of this.nodeViews.values()) {
        const { node, container, halo, icon, labelBox } = v;
        const isFocus = node.id === focusId;
        const isHover = node.id === hoverId;
        const isNeighbour = focusId !== null && focusNeighbours.has(node.id);
        const inFocus = focusId === null || isNeighbour;
        const baseAlpha = inFocus ? 1 : 0.25;
        container.x = node.x;
        container.y = node.y;
        container.alpha = baseAlpha;
        let fill = NODE_FILL;
        if (isFocus) {
          fill = NODE_FILL_FOCUS;
        } else if (isNeighbour) {
          fill = NODE_FILL_NEIGHBOUR;
        }
        halo.clear();
        if (isFocus || isHover) {
          halo.circle(0, 0, node.radius + 8).fill({
            color: fill,
            alpha: 0.18
          });
        }
        icon.style.fill = fill;
        const fontSize = 2 * node.radius;
        icon.style.fontSize = fontSize;
        const nudge = ICON_NUDGE[v.iconName];
        icon.x = (nudge?.x ?? 0) * fontSize;
        icon.y = (nudge?.y ?? ICON_NUDGE_Y_ASCENT) * fontSize;
        labelBox.x = node.x;
        labelBox.y = node.y + node.radius + 4;
        labelBox.scale.set(inverseScale);
        let baseLabelAlpha;
        if (isFocus) {
          baseLabelAlpha = 1;
        } else if (inFocus) {
          baseLabelAlpha = 0.92;
        } else {
          baseLabelAlpha = 0.32;
        }
        labelBox.alpha = baseLabelAlpha * zoomFade;
        labelBox.visible = labelBox.alpha > 0.01;
      }
    }
    focusNode(id) {
      if (this.focusedId !== null) {
        const prev = this.nodeViews.get(this.focusedId);
        if (prev) {
          prev.node.pinned = false;
        }
      }
      this.focusedId = id;
      const view = this.nodeViews.get(id);
      if (view) {
        view.node.pinned = true;
        view.node.vx = 0;
        view.node.vy = 0;
        const target = view.node;
        const newScale = Math.max(this.targetScale, 1.6);
        this.targetScale = newScale;
        this.targetX = this.host.clientWidth / 2 - target.x * newScale;
        this.targetY = this.host.clientHeight / 2 - target.y * newScale;
      }
      this.draw();
    }
    setFocusedDetail(detail) {
      if (!this.satellites) {
        return;
      }
      if (!detail || this.focusedId === null) {
        this.satellites.clear();
        return;
      }
      const node = this.nodeViews.get(this.focusedId)?.node;
      if (!node) {
        this.satellites.clear();
        return;
      }
      this.satellites.setFocused(node, detail);
    }
    /**
     * Swap the active clustering facet. Pass `null` to disable
     * clustering entirely. Computes the per-node group assignment from
     * the current node set, hands it to the sim (which reheats), and
     * rebuilds the per-cluster label markers in `groupLabelLayer`.
     *
     * Cheap to call repeatedly — there's no Pixi teardown beyond
     * destroying / recreating the small `GroupView` containers.
     */
    setGrouping(facet) {
      this.currentGrouping = facet;
      this.clearGroupViews();
      if (!facet || !this.sim) {
        this.sim?.setGroupAssignment(null);
        return;
      }
      const assignment = /* @__PURE__ */ new Map();
      const members = /* @__PURE__ */ new Map();
      for (const n of this.nodes) {
        const keys = this.deriveGroupKeys(n, facet);
        assignment.set(n.id, keys);
        const seen = /* @__PURE__ */ new Set();
        for (const key of keys) {
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          const list = members.get(key);
          if (list) {
            list.push(n.id);
          } else {
            members.set(key, [n.id]);
          }
        }
      }
      const order = this.chronologicalOrder(facet, members);
      this.sim.groupOrderStaggerY = facet === "year_month" ? 160 : 0;
      this.sim.setGroupAssignment(assignment, order);
      const targets = this.buildGroupSeedTargets(assignment, members, order);
      this.startGroupingTween(targets);
      this.fitToViewOfTargets(targets);
      this.buildGroupViews(members, facet);
      this.fitFollowActive = true;
      this.fitFollowStartedAt = performance.now();
      this.fitFollowSawMotion = false;
    }
    /**
     * Drive one frame of the active grouping tween. Lerps each
     * non-pinned node from its captured start position to its target
     * with an ease-out cubic. Cleans up + resumes the sim when done.
     */
    advanceGroupingTween() {
      if (this.destroyed) {
        return;
      }
      const tween = this.groupingTween;
      if (!tween) {
        return;
      }
      const t = Math.min(1, (performance.now() - tween.startTime) / tween.duration);
      const k = 1 - Math.pow(1 - t, 3);
      for (const [nodeId, start] of tween.starts) {
        const target = tween.targets.get(nodeId);
        if (!target) {
          continue;
        }
        const node = this.nodeViews.get(nodeId)?.node;
        if (!node || node.pinned) {
          continue;
        }
        node.x = start.x + (target.x - start.x) * k;
        node.y = start.y + (target.y - start.y) * k;
        node.vx = 0;
        node.vy = 0;
      }
      if (t >= 1) {
        this.groupingTween = null;
        this.sim?.reheat(0.18, false);
      }
    }
    /**
     * Compute a per-cluster seed position + per-node target on that
     * seed. The tween animates each node from its current position
     * to its target so the user sees a smooth flow into clusters
     * instead of an instant snap.
     *
     * Seeds:
     *   - **Ordered facets** (year, year-month): a horizontal lattice
     *     matching the order array, so chronological clusters land
     *     in the same left-to-right slots the cluster force pins
     *     them to. Unordered keys (e.g. `'ym:unknown'`) sit to the
     *     right of the chronological range.
     *   - **Unordered facets** (category, tag, author): polar
     *     distribution around the origin, radius scaling with the
     *     number of groups. Floor keeps small group counts (2–3)
     *     visually distinct.
     *
     * Multi-membership posts (a post in two categories) target the
     * average of their group seeds so they start at the force-balance
     * midpoint instead of being arbitrarily assigned to one cluster.
     */
    buildGroupSeedTargets(assignment, members, order) {
      const targets = /* @__PURE__ */ new Map();
      if (!this.sim) {
        return targets;
      }
      const groupKeys = Array.from(members.keys());
      const seeds = /* @__PURE__ */ new Map();
      const spacing = this.sim.groupOrderSpacing;
      if (order && order.length > 0) {
        const n = order.length;
        const stagger = this.sim.groupOrderStaggerY;
        const staggerY = (idx) => {
          if (stagger <= 0) {
            return 0;
          }
          return idx % 2 === 0 ? -stagger : stagger;
        };
        for (let i = 0; i < n; i++) {
          seeds.set(order[i], {
            x: (i - (n - 1) / 2) * spacing,
            y: staggerY(i)
          });
        }
        let extra = n;
        for (const k of groupKeys) {
          if (seeds.has(k)) {
            continue;
          }
          seeds.set(k, {
            x: (extra - (n - 1) / 2) * spacing,
            y: staggerY(extra)
          });
          extra++;
        }
      } else {
        const n = groupKeys.length;
        const radius = Math.max(220, 120 + n * 40);
        for (let i = 0; i < n; i++) {
          const angle = i / Math.max(1, n) * Math.PI * 2 - Math.PI / 2;
          seeds.set(groupKeys[i], {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius
          });
        }
      }
      const jitter = 40;
      for (const node of this.nodes) {
        if (node.pinned) {
          continue;
        }
        const keys = assignment.get(node.id);
        if (!keys || keys.length === 0) {
          continue;
        }
        let sx = 0;
        let sy = 0;
        let count = 0;
        for (const k of keys) {
          const s = seeds.get(k);
          if (!s) {
            continue;
          }
          sx += s.x;
          sy += s.y;
          count++;
        }
        if (count === 0) {
          continue;
        }
        targets.set(node.id, {
          x: sx / count + (Math.random() - 0.5) * jitter,
          y: sy / count + (Math.random() - 0.5) * jitter
        });
      }
      return targets;
    }
    /**
     * Capture the current positions as the tween starts, set the
     * tween clock, and let `tick()` drive each frame from there.
     * Replaces any in-flight tween — picking a new facet mid-tween
     * just retargets from wherever the nodes currently sit.
     */
    startGroupingTween(targets) {
      if (targets.size === 0) {
        this.groupingTween = null;
        return;
      }
      const starts = /* @__PURE__ */ new Map();
      for (const nodeId of targets.keys()) {
        const node = this.nodeViews.get(nodeId)?.node;
        if (!node) {
          continue;
        }
        starts.set(nodeId, { x: node.x, y: node.y });
      }
      this.groupingTween = {
        startTime: performance.now(),
        // Fast enough to feel responsive, long enough to read as
        // a real transition (not a snap). Tuned by feel; if it
        // looks sluggish on slow machines, drop to 350.
        duration: 450,
        starts,
        targets
      };
    }
    /**
     * Frame the camera against the target bounds (not the current
     * node positions) so the zoom-out animates IN PARALLEL with the
     * layout tween instead of waiting for it to settle.
     */
    fitToViewOfTargets(targets) {
      if (targets.size === 0) {
        return;
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const t of targets.values()) {
        if (t.x < minX) {
          minX = t.x;
        }
        if (t.y < minY) {
          minY = t.y;
        }
        if (t.x > maxX) {
          maxX = t.x;
        }
        if (t.y > maxY) {
          maxY = t.y;
        }
      }
      const padding = 100;
      const w = maxX - minX + padding * 2;
      const h = maxY - minY + padding * 2;
      const sx = this.host.clientWidth / w;
      const sy = this.host.clientHeight / h;
      const s = Math.max(ZOOM_MIN, Math.min(1.5, Math.min(sx, sy)));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      this.targetScale = s;
      this.targetX = this.host.clientWidth / 2 - cx * s;
      this.targetY = this.host.clientHeight / 2 - cy * s;
    }
    /**
     * For date facets, sort the keys oldest-to-newest so the cluster
     * attractor can lay them out left-to-right. For other facets,
     * returns `null` — those clusters stay fully emergent.
     *
     * `'year:<unknown>'` and `'ym:unknown'` are skipped from the
     * order: an undated post shouldn't bias one end of the timeline.
     */
    chronologicalOrder(facet, members) {
      if (facet !== "year" && facet !== "year_month") {
        return null;
      }
      const ordered = [];
      for (const key of members.keys()) {
        const idx = key.indexOf(":");
        const rest = key.slice(idx + 1);
        if (facet === "year") {
          const y = Number(rest);
          if (!Number.isFinite(y) || y <= 0) {
            continue;
          }
          ordered.push({ key, sort: String(y).padStart(6, "0") });
        } else {
          if (rest === "unknown" || rest === "") {
            continue;
          }
          ordered.push({ key, sort: rest });
        }
      }
      ordered.sort((a, b) => {
        if (a.sort < b.sort) {
          return -1;
        }
        if (a.sort > b.sort) {
          return 1;
        }
        return 0;
      });
      return ordered.map((e) => e.key);
    }
    clearFocus() {
      if (this.focusedId !== null) {
        const view = this.nodeViews.get(this.focusedId);
        if (view) {
          view.node.pinned = false;
        }
      }
      this.focusedId = null;
      this.satellites?.clear();
      this.sim?.reheat(0.25, false);
      this.draw();
    }
    /**
     * Mark a satellite by its synthetic key as selected (e.g. when
     * the side panel switches to that satellite's dossier). Pass
     * `null` to clear the selection — done when the panel navigates
     * back to the post view or closes entirely.
     */
    setSatelliteSelectedKey(key) {
      this.satellites?.setSelectedKey(key);
    }
    getNode(id) {
      return this.nodes.find((n) => n.id === id);
    }
    getNodes() {
      return this.nodes;
    }
    /**
     * Currently focused node id, or `null` when nothing is focused.
     * Used by the host orchestrator to implement click-to-deselect:
     * if the user clicks the already-focused node, the host calls
     * `clearFocus()` instead of re-focusing.
     */
    getFocusedId() {
      return this.focusedId;
    }
    fitToView() {
      if (this.nodes.length === 0) {
        return;
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of this.nodes) {
        if (n.x < minX) {
          minX = n.x;
        }
        if (n.y < minY) {
          minY = n.y;
        }
        if (n.x > maxX) {
          maxX = n.x;
        }
        if (n.y > maxY) {
          maxY = n.y;
        }
      }
      const padding = 100;
      const w = maxX - minX + padding * 2;
      const h = maxY - minY + padding * 2;
      const sx = this.host.clientWidth / w;
      const sy = this.host.clientHeight / h;
      const s = Math.max(ZOOM_MIN, Math.min(1.5, Math.min(sx, sy)));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      this.targetScale = s;
      this.targetX = this.host.clientWidth / 2 - cx * s;
      this.targetY = this.host.clientHeight / 2 - cy * s;
    }
    destroy() {
      this.destroyed = true;
      try {
        this.app?.ticker?.stop();
      } catch {
      }
      if (this.tickerCb) {
        try {
          this.app?.ticker?.remove(this.tickerCb);
        } catch {
        }
        this.tickerCb = null;
      }
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.satellites?.destroy();
      this.satellites = null;
      this.clearGroupViews();
      this.groupLabelOverlay?.remove();
      this.groupLabelOverlay = null;
      try {
        this.app.destroy(true, { children: true });
      } catch {
      }
    }
  }
  function normalizeDashiconName(raw) {
    if (typeof raw !== "string" || raw === "") {
      return "admin-generic";
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return "admin-generic";
    }
    return raw.replace(/^dashicons-/, "");
  }
  function pointOnSegment(fromX, fromY, toX, toY, distance) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) {
      return { x: fromX, y: fromY };
    }
    const t = Math.min(distance / d, 1);
    return { x: fromX + dx * t, y: fromY + dy * t };
  }
  function smoothstep(a, b, x) {
    if (x <= a) {
      return 0;
    }
    if (x >= b) {
      return 1;
    }
    const t = (x - a) / (b - a);
    return t * t * (3 - 2 * t);
  }
  function formatYearMonth(token) {
    const m = /^(\d{4})-(\d{2})$/.exec(token);
    if (!m) {
      return token;
    }
    const monthIdx = Number(m[2]) - 1;
    if (monthIdx < 0 || monthIdx > 11) {
      return token;
    }
    const year = Number(m[1]);
    try {
      const d = new Date(Date.UTC(year, monthIdx, 1));
      return new Intl.DateTimeFormat(void 0, {
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(d);
    } catch {
      return token;
    }
  }
  function defaultIconForPostType(slug) {
    switch (slug) {
      case "post":
        return "admin-post";
      case "page":
        return "admin-page";
      case "attachment":
        return "admin-media";
      default:
        return "admin-generic";
    }
  }
  const WINDOW_ID = "desktop-mode-content-graph";
  async function renderContentGraph(body) {
    const root = body.querySelector(
      "[data-desktop-mode-content-graph-root]"
    );
    if (!root) {
      body.textContent = __("Content Graph container missing.");
      return { abort: () => {
      } };
    }
    const cfg = getConfig();
    const toolbarHost = root.querySelector(
      "[data-desktop-mode-content-graph-toolbar]"
    );
    const stageHost = root.querySelector(
      "[data-desktop-mode-content-graph-stage]"
    );
    const panelHost = root.querySelector(
      "[data-desktop-mode-content-graph-panel]"
    );
    const loading = root.querySelector(
      "[data-desktop-mode-content-graph-loading]"
    );
    const desktopApi = window.wp?.desktop ?? {};
    let activeTypes = cfg.postTypes.map((t) => t.slug);
    let scene = null;
    let detailRequestId = 0;
    let aborted = false;
    const showLoading = (show) => {
      if (!loading) {
        return;
      }
      loading.hidden = !show;
    };
    const panel = renderPanel(panelHost, cfg, {
      onClose: () => {
        panel.hide();
        scene?.clearFocus();
      },
      // Mirror the panel's visible view onto the satellite layer so
      // the bubble matching the dossier picks up its selected state
      // (and clears when the user navigates back to the post view).
      onViewChange: (key) => {
        scene?.setSatelliteSelectedKey(key);
      }
    });
    const handleSatelliteClick = (ref) => {
      switch (ref.kind) {
        case "user":
          panel.showUser(ref.userId);
          break;
        case "term":
          panel.showTerm(ref.termId, ref.taxonomy);
          break;
        case "comment":
          panel.showComment(ref.commentId);
          break;
        case "media":
          panel.showMedia(ref.mediaId);
          break;
        case "revision":
          panel.showRevision(ref.revisionId);
          break;
      }
    };
    const focusNode = (node) => {
      scene?.focusNode(node.id);
      panel.setLoading(node.id, node.title);
      const myId = ++detailRequestId;
      void (async () => {
        try {
          const detail = await fetchPostDetail(cfg, node.id);
          if (aborted || myId !== detailRequestId) {
            return;
          }
          panel.setDetail(detail);
          scene?.setFocusedDetail(detail);
        } catch (err) {
          if (aborted || myId !== detailRequestId) {
            return;
          }
          panel.setError(
            sprintf(
              /* translators: %d: numeric post id that failed to load. */
              __("Could not load post #%d."),
              node.id
            )
          );
          console.warn("[content-graph] detail fetch failed", err);
        }
      })();
    };
    const buildToolbarCallbacks = () => ({
      onTypesChange: (types) => {
        activeTypes = types;
        void loadGraph();
      },
      onFitToView: () => scene?.fitToView(),
      onSearchSelect: (node) => focusNode(node),
      onGroupChange: (facet) => {
        scene?.setGrouping(facet);
      },
      getNodes: () => scene?.getNodes() ?? []
    });
    let toolbar = renderToolbar(
      toolbarHost,
      cfg.postTypes,
      buildToolbarCallbacks()
    );
    const loadGraph = async () => {
      if (aborted) {
        return;
      }
      showLoading(true);
      toolbar.setStatus(__("Loading graph…"));
      try {
        const payload = await fetchGraph(cfg, activeTypes);
        if (aborted) {
          return;
        }
        scene?.setData(payload);
        toolbar.setStatus(
          sprintf(
            /* translators: 1: number of nodes (posts/pages) in the graph. 2: number of links between them. */
            __("%1$d nodes · %2$d links"),
            payload.stats.nodes,
            payload.stats.edges
          )
        );
        scene?.fitToView();
        scene?.clearFocus();
        panel.hide();
      } catch (err) {
        if (aborted) {
          return;
        }
        toolbar.setStatus(__("Failed to load graph."));
        console.warn("[content-graph] graph fetch failed", err);
      } finally {
        showLoading(false);
      }
    };
    const closeFocus = () => {
      detailRequestId++;
      panel.hide();
      scene?.clearFocus();
    };
    scene = new GraphScene(
      stageHost,
      {
        onNodeClick: (node) => {
          if (scene?.getFocusedId() === node.id) {
            closeFocus();
            return;
          }
          focusNode(node);
        },
        onBackgroundClick: closeFocus
      },
      handleSatelliteClick,
      cfg.postTypes
    );
    try {
      await scene.mount(desktopApi);
    } catch (err) {
      stageHost.textContent = __("Could not initialise the graph renderer.");
      console.warn("[content-graph] scene mount failed", err);
      return { abort: () => {
      } };
    }
    try {
      const refreshed = await fetchPostTypes(cfg);
      toolbar.destroy();
      toolbar = renderToolbar(toolbarHost, refreshed, buildToolbarCallbacks());
    } catch {
    }
    await loadGraph();
    return {
      abort: () => {
        aborted = true;
        toolbar.destroy();
        panel.destroy();
        scene?.destroy();
        scene = null;
      }
    };
  }
  const registry = window.desktopModeNativeWindows ?? (window.desktopModeNativeWindows = {});
  registry[WINDOW_ID] = async (body) => {
    const state = await renderContentGraph(body);
    return state.abort;
  };
})();
