(function() {
  "use strict";
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
    /** Action, fires once after shell boot; plugins register here. */
    INIT: "desktop-mode.init",
    /** Filter, receives the wallpaper registry array. */
    WALLPAPERS: "desktop-mode.wallpapers",
    /**
     * Filter, receives the games registry array (`GameRegistryEntry[]`)
     * on every read. Mirrors the PHP-side `desktop_mode_games` filter.
     *
     * @since 0.9.6
     */
    GAMES: "desktop-mode.games",
    /** Filter, receives the unfocused-window effect registry array. */
    UNFOCUS_EFFECTS: "desktop-mode.unfocus-effects",
    /** Action before a canvas wallpaper mounts. */
    WALLPAPER_MOUNTING: "desktop-mode.wallpaper.mounting",
    /** Action after a canvas wallpaper mounts successfully. */
    WALLPAPER_MOUNTED: "desktop-mode.wallpaper.mounted",
    /** Action before a canvas wallpaper tears down. */
    WALLPAPER_UNMOUNTING: "desktop-mode.wallpaper.unmounting",
    /** Action when a canvas wallpaper's mount throws / rejects. */
    WALLPAPER_MOUNT_FAILED: "desktop-mode.wallpaper.mount-failed",
    /** Action mirroring document.visibilitychange for active canvas wallpapers. */
    WALLPAPER_VISIBILITY: "desktop-mode.wallpaper.visibility",
    /**
     * Action, fires when the wallpaper enters or leaves the suspended
     * state (`wp.desktop.wallpaper.suspend()/resume()` — e.g. while a
     * game is running). Payload: `{ id, suspended, reasons }` — the
     * active canvas wallpaper id (or null), whether the layer is now
     * suspended, and the currently-held reason strings. Suspension also
     * re-emits `WALLPAPER_VISIBILITY` with the effective state, so
     * wallpapers that only wire the visibility action pause for free.
     *
     * @since 0.9.6
     */
    WALLPAPER_SUSPEND: "desktop-mode.wallpaper.suspend",
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
    // ------------------------------------------------------------------
    // Observability — iframe errors, iframe network, shell-side errors,
    // monitor entry aggregation. Designed for dashboard / debug widget
    // plugins that want genuine admin observability (Gutenberg save
    // failures, admin-ajax 500s, plugin exceptions) rather than just the
    // shell's own console-error surface.
    // ------------------------------------------------------------------
    /**
     * Action, fires once per iframe when the chromeless bridge
     * script has finished wiring its message listeners. Payload:
     * `{ windowId: string }`. Subscribers get a reliable "safe to
     * talk to this iframe" signal — the browser's native `load`
     * event fires before our bridge attaches, so messages sent on
     * `load` can be dropped on the floor. Use this instead when
     * timing matters (first-focus dispatch, auto-fill handshakes).
     *
     * @since 0.5.0
     */
    IFRAME_READY: "desktop-mode.iframe.ready",
    /**
     * Action, fires when a chromeless iframe's `error` or
     * `unhandledrejection` handler catches an exception. Payload: `{
     * windowId: string, kind: 'error' | 'unhandledrejection', message:
     * string, filename: string | null, lineno: number | null, colno:
     * number | null, stack: string | null }`. Origin-filtered at the
     * parent shell; cross-origin iframe errors never reach here.
     */
    IFRAME_ERROR: "desktop-mode.iframe.error",
    /**
     * Action, fires when a `fetch` or `XMLHttpRequest` inside a
     * chromeless iframe completes (success OR failure). Payload: `{
     * windowId: string, method: string, url: string, status: number,
     * duration: number, failed: boolean }`. Subscribers get a faithful
     * view of admin-ajax + REST calls that previously never left the
     * iframe boundary. `status === 0` indicates a network failure with
     * no response received.
     */
    IFRAME_NETWORK_COMPLETED: "desktop-mode.iframe.network-completed",
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
    BROADCAST: "desktop-mode.broadcast",
    /**
     * Filter, applies to a `MonitorEntry` before a monitor widget
     * renders it. Plugins can mutate the entry (rewrite the message,
     * add `extra` fields) or return `null` to suppress it. Used by
     * monitor widgets to converge every plugin on the same shape —
     * see `MonitorEntry` in `src/types.ts`.
     */
    MONITOR_ENTRY: "desktop-mode.monitor.entry",
    /**
     * Filter, applies to the list of "solid" surfaces wallpapers
     * should consider for collision / accumulation effects (snow
     * piling, leaves settling, rain splash). Seeded by the shell
     * with: every visible (non-minimized) window's top edge; the
     * desktop-area floor; the dock's outward-facing edge; and every
     * mounted widget card's top edge.
     *
     * Plugins that own their own DOM (e.g. floating pickers,
     * custom overlays) can push additional surfaces so snow
     * accumulates on them too.
     *
     * Each entry is a `WallpaperSurface` — see
     * `src/wallpapers/surfaces.ts` for the shape. Rects are in
     * viewport coordinates (clientX / clientY), matching what a
     * canvas mounted inside `#desktop-mode-wallpaper` reads.
     */
    WALLPAPER_SURFACES: "desktop-mode.wallpaper.surfaces",
    // ------------------------------------------------------------------
    // Window lifecycle actions. All payloads share a `windowId: string`
    // field; additional fields are documented per-hook in the JS
    // reference. These mirror the existing `desktop-mode-window-*`
    // CustomEvents but ship under the hook bus so plugins can use one
    // idiomatic API for everything the shell emits.
    // ------------------------------------------------------------------
    /**
     * Filter, last call before a window's resolved geometry (x, y,
     * width, height, initialState) is baked into the `WindowConfig`
     * passed to the `Window` constructor. Lets a plugin override
     * default placement for windows it owns, snap restored bounds to
     * a different region, or force a particular initial state.
     *
     * Signature:
     *
     *     ( geometry: ResolvedWindowGeometry, ctx: WindowGeometryContext )
     *         => ResolvedWindowGeometry
     *
     * Where `ResolvedWindowGeometry = { x, y, width, height, state? }`
     * and `ctx = { windowId, baseId, hasSavedGeometry, callerPinned,
     * desktopRect }`.
     *
     * - `hasSavedGeometry` is `true` when the user previously
     *   dragged or resized this window and the resolved geometry
     *   includes those restored values. Plugins that want to
     *   "leave the user's saved layout alone" should bail when
     *   this is true.
     * - `callerPinned` is `true` when the caller of `manager.open()`
     *   passed at least one of `{ x, y, width, height, initialState }`
     *   explicitly. For NATIVE windows this is usually true (the
     *   framework's native-window opener passes the registry's
     *   declared dimensions); for admin-page iframe windows opened
     *   from the dock this is usually false. The filter is free to
     *   override registry defaults — `callerPinned: true` does NOT
     *   mean "leave it alone."
     *
     * The shell re-clamps `width`/`height` to the registered
     * `minWidth`/`minHeight` after the filter returns — a buggy
     * filter cannot ship a sub-minimum window. `x` and `y` are
     * NOT re-clamped to the desktop rect after the filter (plugins
     * sometimes want to place windows partially off-screen for
     * deliberate stylistic reasons); the filter is responsible for
     * its own viewport math when it cares.
     *
     * Companion of `desktop_mode_register_window` server-side
     * defaults — runs every time a window opens, not just at
     * registration.
     *
     * @since 0.8.6
     */
    WINDOW_GEOMETRY: "desktop-mode.window.geometry",
    /** Action, fires when a window is added to the stack. */
    WINDOW_OPENED: "desktop-mode.window.opened",
    /**
     * Action, fires when a window's body enters the loading state — at
     * construction (every window starts loading) and whenever a plugin
     * calls {@link NativeRenderContext.window.markLoading} or
     * `Window.markContentLoading()` mid-life. Payload: `{ windowId }`.
     *
     * The shell shows a `<wpd-spinner>` overlay while the window is in
     * the loading state and fades content in on the loaded transition.
     * Subscribe to this hook (or to {@link WINDOW_CONTENT_LOADED}) when
     * you need to react to either edge — analytics, instrumentation,
     * decorating the spinner with a per-window message.
     *
     * Edge-triggered: idempotent calls don't re-fire. The matching
     * `desktop-mode-window-content-loading` CustomEvent dispatches on
     * `document` with the same payload.
     *
     * @since 0.6.0
     */
    WINDOW_CONTENT_LOADING: "desktop-mode.window.content-loading",
    /**
     * Action, fires when a window's body content becomes ready — for
     * iframe windows the moment the chromeless bridge announces
     * `desktop-mode-ready`, for native windows after the user's
     * `render( body )` callback (or its returned promise) resolves, and
     * whenever a plugin calls {@link NativeRenderContext.window.markReady}
     * or `Window.markContentLoaded()` mid-life. Payload: `{ windowId }`.
     *
     * The unified "window content is ready" signal across both render
     * strategies — use this instead of branching on iframe vs. native.
     * Iframe-only consumers can still subscribe to {@link IFRAME_READY},
     * which fires alongside this hook for iframe windows. The shell
     * removes the loading overlay and fades the content in on this
     * transition.
     *
     * Edge-triggered: only fires on a loading → ready transition.
     * The matching `desktop-mode-window-content-loaded` CustomEvent
     * dispatches on `document` with the same payload.
     *
     * @since 0.6.0
     */
    WINDOW_CONTENT_LOADED: "desktop-mode.window.content-loaded",
    /**
     * Filter, applied to the loading-overlay HTMLElement just after
     * the shell paints its default `<wpd-spinner>` and after any
     * per-window inline customization (`config.loading.render`)
     * runs. Receives the overlay element; context: `{ windowId,
     * config }`. Plugins may mutate the element (e.g.
     * `host.replaceChildren( myBrandedLoader )` to swap out the
     * default entirely, or `host.querySelector('wpd-spinner')!.
     * setAttribute('preset', 'comet')` to retune the spinner) or
     * return a different element to replace the overlay wholesale.
     *
     * Use cases: a brand-skin plugin that overrides every window's
     * spinner with its own logo; a status-bar plugin that adds
     * "Loading… 47% — fetching posts" text; an A/B-test framework
     * that swaps the loader during an experiment.
     *
     * Resolution order for the loading overlay:
     *   1. Default content (`<wpd-spinner>`) is painted.
     *   2. Per-window `config.loading.render( host, ctx )` runs.
     *   3. This filter runs.
     *   4. The result is appended to the window body.
     *
     * @since 0.6.0
     */
    WINDOW_LOADING_OVERLAY: "desktop-mode.window.loading-overlay",
    /**
     * Action, fires when `manager.open(...)` is called for a baseId
     * whose window already exists on the active desktop. This is the
     * unambiguous "user requested to open this window again" signal
     * — distinct from focus changes (which double-fire on alt-tab and
     * skip when already focused) and from `WINDOW_OPENED` (which only
     * fires on first creation). Payload:
     * `{ windowId: string, baseId: string, wasMinimized: boolean }`.
     *
     * Plugins that hold per-window state (e.g. the code-editor's
     * active file) should listen here to re-orient the existing
     * window's content to whatever the caller wants to show — the
     * open-window call is synchronous, so any state the caller sets
     * BEFORE invoking `openWindow` is already in place when this
     * fires.
     */
    WINDOW_REOPENED: "desktop-mode.window.reopened",
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
    /** Action, fires when a window is removed from the stack. */
    WINDOW_CLOSED: "desktop-mode.window.closed",
    /** Action, fires when focus changes to a different window. */
    WINDOW_FOCUSED: "desktop-mode.window.focused",
    /**
     * Action, fires for the window that LOST focus when another
     * window takes over. Symmetric counterpart to
     * `WINDOW_FOCUSED`. Payload: `{ windowId: string, focusedTo:
     * string | null }` — `focusedTo` identifies the new top of
     * the stack so blur subscribers can ignore alt-tabs to a
     * sibling they own.
     *
     * No-op when there's no previously-focused window (initial
     * boot, all-windows-closed). Manager fires this BEFORE
     * `WINDOW_FOCUSED` so subscribers see "blur old, focus new"
     * in deterministic order.
     *
     * @since 0.5.5
     */
    WINDOW_BLURRED: "desktop-mode.window.blurred",
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
     * Filter, decides whether a fullscreen ("focus mode") window
     * should auto-exit when focus moves to a different window.
     *
     * Default is `true` so a newly-focused window is never silently
     * occluded by a fullscreen one (its `z-index` sits above all
     * other windows). Plugins whose fullscreen surface is meant to
     * persist across focus changes — slideshows, video players,
     * immersive games — can return `false` to keep their window
     * fullscreen.
     *
     * Signature:
     *
     *     ( shouldExit: boolean, ctx: {
     *         windowId: string,    // the fullscreen window
     *         focusedTo: string,   // the window gaining focus
     *     } ) => boolean
     *
     * @since 0.8.6
     */
    WINDOW_AUTO_EXIT_FULLSCREEN: "desktop-mode.window.auto-exit-fullscreen",
    /**
     * Filter, decides whether the window under the cursor is raised
     * (focused) after a short hover dwell during a drag — any drag,
     * whatever its source: a shell DragManager session, a
     * cross-iframe bridge drag, an OS file, or an arbitrary native
     * HTML5 drag.
     *
     * Default is `true`: dragging a payload over a background window
     * and resting there for ~250 ms brings it forward, so the user
     * can see the drop target they're aiming at (macOS spring-loading
     * style). Plugins whose windows must never steal z-order during a
     * drag — pinned reference panels, HUD/palette windows — can
     * return `false` for their window id.
     *
     * Signature:
     *
     *     ( shouldFocus: boolean, ctx: {
     *         windowId: string,     // the hovered window
     *         payloadType: string,  // DragManager payload `type`,
     *                               // bridge payload `kind`,
     *                               // 'os-file', or 'external'
     *     } ) => boolean
     *
     * @since 0.9.4
     */
    WINDOW_FOCUS_ON_DRAG_HOVER: "desktop-mode.window.focus-on-drag-hover",
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
    /** Action, fires at drag-end with the final `{ x, y }` position. */
    WINDOW_MOVED: "desktop-mode.window.moved",
    /** Action, fires at resize-end with the final `{ width, height }`. */
    WINDOW_RESIZED: "desktop-mode.window.resized",
    /** Action, fires when title-bar drag begins. */
    WINDOW_DRAG_START: "desktop-mode.window.drag-start",
    /** Action, fires when title-bar drag ends. Payload mirrors WINDOW_MOVED. */
    WINDOW_DRAG_END: "desktop-mode.window.drag-end",
    /** Action, fires when the resize handle is first pressed. */
    WINDOW_RESIZE_START: "desktop-mode.window.resize-start",
    /** Action, fires when resize completes. Payload mirrors WINDOW_RESIZED. */
    WINDOW_RESIZE_END: "desktop-mode.window.resize-end",
    /** Action, fires when the user "detaches" a window to a classic tab. */
    WINDOW_DETACHED: "desktop-mode.window.detached",
    /**
     * Action, fires when the user clicks the title-bar reload button
     * on an iframe-backed window. Payload: `{ windowId: string, url:
     * string }` where `url` is the URL being reloaded (the active
     * primary or external sub-tab). Subscribers can use this to
     * invalidate their own cache, force a save before navigation,
     * track usage as a UX signal, or sync state across companion
     * surfaces. Native windows do not fire this — they own their
     * DOM directly and the reload button doesn't apply.
     */
    WINDOW_RELOADED: "desktop-mode.window.reloaded",
    /** Action, fires when iframe title updates change the window title. */
    WINDOW_TITLE_CHANGED: "desktop-mode.window.title-changed",
    /**
     * Action, fires when a window's `setHighlight()` mode changes.
     * Payload: `{ windowId: string, mode: 'preview' | 'persistent' | null,
     * color?: string }`. Lets onboarding / guidance / drag-bridge
     * plugins react when another module flagged one of their
     * windows as the focus of a multi-step interaction without
     * having to observe DOM mutations.
     *
     * @since 0.6.0
     */
    WINDOW_HIGHLIGHT_CHANGED: "desktop-mode.window.highlight-changed",
    /**
     * Action, fires when a window's body element's dimensions
     * change — mount, user resize, viewport reflow. Payload: `{
     * windowId: string, width: number, height: number }`. Body
     * dimensions exclude the title bar + tab strip, matching what a
     * canvas or layout engine inside the body would measure.
     */
    WINDOW_BODY_RESIZED: "desktop-mode.window.body-resized",
    // ------------------------------------------------------------------
    // Native-window lifecycle. These fire ONLY for windows constructed
    // with `native: true` — iframe windows have no render phase to
    // intercept. Use them to wrap / instrument / cancel the paint of
    // plugin-contributed native windows (the Calculator, Jorvy, custom
    // native launchers).
    // ------------------------------------------------------------------
    /**
     * Filter, applied to the body element a native window will render
     * into, just BEFORE the user's `render( body )` callback runs.
     * Payload: the `HTMLElement`; context: `{ windowId, config }`.
     *
     * Return the same element (or a wrapper) to intercept. Subscribers
     * commonly use this to inject a consistent shell (padding,
     * background, decorative chrome) around every native window
     * without every plugin re-implementing the pattern.
     */
    NATIVE_WINDOW_BEFORE_RENDER: "desktop-mode.native-window.before-render",
    /**
     * Action, fires AFTER a native window's `render( body )` callback
     * returns. Payload: `{ windowId, body, config }`. Observability
     * hook — analytics / auto-focus / post-render measurement.
     */
    NATIVE_WINDOW_AFTER_RENDER: "desktop-mode.native-window.after-render",
    /**
     * Filter, applied when a native window is about to start its
     * close animation. Return `false` to CANCEL the close — the
     * window stays open. Payload: `true`; context: `{ windowId,
     * config }`. Any non-`false` return (including `undefined`) lets
     * the close proceed.
     *
     * Intended for "unsaved changes" guards: a calculator with a
     * pending operation can prompt the user and abort the close
     * mid-flight. Does NOT apply to iframe windows — their close is
     * driven by browser navigation patterns the shell doesn't own.
     */
    NATIVE_WINDOW_BEFORE_CLOSE: "desktop-mode.native-window.before-close",
    // ------------------------------------------------------------------
    // Window-chrome customization framework. Plugins drive per-window
    // appearance (theme, controls, slots, full chrome render) through
    // the `wp.desktop.registerWindow*` registries; these hooks expose
    // every resolution step so plugins can mutate or observe the
    // chrome pipeline without owning a registration.
    //
    // Layers 1-3 (theme, controls, slots) are Stable. Layer 4 (chrome
    // render) is Experimental — `WINDOW_CHROME_RENDER` may change.
    // ------------------------------------------------------------------
    /**
     * Filter, applied to the resolved CSS-variable map for a window.
     * Receives `Record< string, string >`; context: `{ windowId,
     * config }`. Plugins return a mutated map to override or augment
     * the per-window theme tokens — e.g. tint every Gutenberg
     * window's title bar to brand colour.
     *
     * Stable since 0.6.0.
     */
    WINDOW_CHROME_THEME: "desktop-mode.window.chrome.theme",
    /**
     * Filter, applied to the resolved control list for a window.
     * Receives `WindowControlDef[]`; context: `{ windowId, config,
     * placement: 'left' | 'right' | 'controls' }`. Plugins return a
     * mutated array to reorder, hide, or inject controls per-window.
     *
     * Stable since 0.6.0.
     */
    WINDOW_CHROME_CONTROLS: "desktop-mode.window.chrome.controls",
    /**
     * Filter, applied per slot when the chrome paints. Receives the
     * slot host element; context: `{ windowId, slot, config }`.
     * Plugins can mutate `host` (append decorative children, set
     * inline styles) without owning a `WindowSlotDef` registration.
     * The shell never reads the return value — this is an action-
     * shaped filter so existing `addFilter` plumbing applies.
     *
     * Stable since 0.6.0.
     */
    WINDOW_CHROME_SLOT: "desktop-mode.window.chrome.slot",
    /**
     * Filter, applied to the chrome id selected for a window.
     * Receives the resolved id (defaults to `'core/standard'`);
     * context: `{ windowId, config }`. Returning a different id
     * swaps the chrome registration. **Experimental** — chrome
     * render contract may change.
     *
     * @since 0.6.0
     */
    WINDOW_CHROME_RENDER: "desktop-mode.window.chrome.render",
    /**
     * Action, fires after a window chrome layer has been mounted /
     * remounted. Payload: `{ windowId, layer: 'chrome' | 'controls'
     * | 'slots', chromeId? }` — `chromeId` is present only when
     * `layer` is `'chrome'`. Subscribers can post-decorate the
     * chrome (attach observers, anchor pickers).
     *
     * @since 0.6.0
     */
    WINDOW_CHROME_APPLIED: "desktop-mode.window.chrome.applied",
    /**
     * Action, fires after a window's theme tokens are applied to its
     * outer element. Payload: `{ windowId, themeId, tokens }`. Lets
     * plugins react to theme changes without diffing CSS variables.
     *
     * @since 0.6.0
     */
    WINDOW_CHROME_THEME_CHANGED: "desktop-mode.window.chrome.theme-changed",
    /**
     * Action, fires when a user clicks a desktop icon (a shortcut
     * tile registered server-side via `desktop_mode_register_icon()`
     * and rendered on the wallpaper). Payload: `{ id: string,
     * target: 'window' | 'url' }`. Fires BEFORE the default open
     * action — plugins cannot cancel the open from this hook, but
     * can use it to track click-throughs or augment behaviour (e.g.
     * play a sound, surface a confirmation toast).
     *
     * @since 0.5.0
     */
    DESKTOP_ICON_CLICKED: "desktop-mode.desktop-icon.clicked",
    /**
     * Action, fires after the wallpaper icon grid is rendered or
     * re-rendered. Payload:
     *
     *     {
     *         ids: string[];                          // paint order
     *         container: HTMLElement;                  // <div class="desktop-mode-icons">
     *         tiles: ReadonlyMap<string, HTMLElement>; // id → tile <button>
     *     }
     *
     * Plugins that decorate icons with surfaces the framework doesn't
     * natively expose (drag handles, status dots, cursor adornments)
     * subscribe here so their decorations survive a live menu refresh
     * that legitimately rebuilds the grid. The `container` and
     * `tiles` map mirror the {@link DOCK_AFTER_RENDER}
     * `tileElements` contract — reach into them directly instead of
     * re-`querySelector`ing the rendered DOM.
     *
     * Notification badges have a first-class API since 0.6.0 —
     * use `wp.desktop.icons.setBadge( id, count )` (and subscribe
     * to {@link ICON_BADGE_CHANGED}) instead of decorating from
     * here. The framework persists badge state across rebuilds, so
     * a plugin that uses the API doesn't need to re-decorate on
     * every render.
     *
     * Suppressed entirely when the rendered DOM is unchanged from
     * the previous call (the fingerprint short-circuit upstream
     * skips both the rebuild and this signal). When the icon list
     * is empty the hook does not fire at all — the previous
     * container is removed and no new one is appended.
     *
     * @since 0.6.0
     * @since 0.8.6 — `container` + `tiles` added to the payload
     *                  (`ids` retained for back-compat).
     */
    DESKTOP_ICONS_RENDERED: "desktop-mode.desktop-icons.rendered",
    /**
     * Action, fires whenever the badge count on a desktop icon
     * changes. Payload: `{ iconId: string, count: number,
     * previousCount: number }`. Symmetric to {@link DOCK_ITEM_APPENDED}
     * and the dock/taskbar `wpd-dock-item-badge-changed` CustomEvent
     * — the icon rail's lifecycle hook for badge transitions.
     *
     * Mirrors `desktop-mode/badge-changed` on the activity bus with
     * `rail: 'icon'`. Subscribe to whichever surface fits — the
     * activity channel composes across rails for global widgets,
     * this hook fires only for icon-rail badges with the previous
     * count carried alongside for delta-aware consumers.
     *
     * @since 0.6.0
     */
    ICON_BADGE_CHANGED: "desktop-mode.icon.badge-changed",
    // ------------------------------------------------------------------
    // Cross-plugin composition.
    // ------------------------------------------------------------------
    /**
     * Action, fires ONCE after every shell-shipped `<wpd-*>` custom
     * element has registered with `customElements`. Payload: `{
     * tags: string[] }` — the list of registered tag names. Plugins
     * that need to defer work until the component registry is
     * complete (e.g. hydrate user content that uses these tags)
     * subscribe here instead of polling `customElements.get()`.
     */
    COMPONENTS_REGISTERED: "desktop-mode.components.registered",
    /**
     * Action, fires after `wp.desktop.registerSystemTile()` inserts
     * a tile into the unified dock. Payload: `{ id: string }`. Useful
     * for plugins that want to decorate tiles they didn't register
     * themselves — analytics, theming, per-tile badges.
     */
    DOCK_ITEM_APPENDED: "desktop-mode.dock.item-appended",
    /**
     * Action, fires after a system tile is removed from a rail
     * via `Dock.removeSystemItem()` (typically the server-driven
     * native-window-sync path on plugin deactivation). Payload:
     * `{ id: string, placement: 'dock' | 'taskbar' }`. Symmetric
     * to {@link DOCK_ITEM_APPENDED}; lets analytics / decorators /
     * cleanup hooks see the full lifecycle without polling the DOM.
     *
     * @since 0.6.0
     */
    DOCK_ITEM_REMOVED: "desktop-mode.dock.item-removed",
    // ------------------------------------------------------------------
    // Dock decoration hooks — render-pipeline filters and actions the
    // default `Dock` renderer fires while painting tiles. Plugins
    // compose decoration (animations, classNames, wrappers, tooltips)
    // without forking the renderer. Custom rail renderers SHOULD fire
    // the same hooks for ecosystem compatibility — see
    // `docs/examples/dock-decoration-hooks.md` for the contract.
    //
    // Every detail object carries `{ rail, orientation, dockId,
    // container }` so a single subscriber can disambiguate when two
    // rails coexist (Classic layout's left side bar + bottom dock).
    // `dockId` matches the host element's `id` (e.g. `'desktop-mode-dock'`
    // or `'desktop-mode-side-dock'`) and is the stable
    // disambiguator — `rail` and `orientation` are convenience
    // projections of where the renderer is painting.
    // ------------------------------------------------------------------
    /**
     * Action, fires at the start of every dock paint pass — both the
     * initial mount and every `replaceItems()` that follows on the
     * live menu-refresh path. Payload `DockRenderContext`. Use this
     * to invalidate cached per-render decoration state before the
     * tiles repopulate.
     *
     * @since 0.5.2
     */
    DOCK_BEFORE_RENDER: "desktop-mode.dock.before-render",
    /**
     * Action, fires once every menu and system tile has landed in
     * the DOM for a paint pass. Payload `DockRenderContext` plus a
     * frozen `tileElements: ReadonlyMap<string, HTMLElement>` so a
     * plugin can decorate every tile in one sweep. Symmetric to
     * {@link DOCK_BEFORE_RENDER}.
     *
     * @since 0.5.2
     */
    DOCK_AFTER_RENDER: "desktop-mode.dock.after-render",
    /**
     * Filter, runs once per tile while the renderer is composing the
     * className list. Plugins may add, remove, or reorder classes.
     * Signature: `( classes: string[], detail: DockTileContext ) =>
     * string[]`. Order is preserved.
     *
     * @since 0.5.2
     */
    DOCK_TILE_CLASS: "desktop-mode.dock.tile-class",
    /**
     * Filter, runs once per tile after the renderer finishes building
     * the element but before it lands in the DOM. Return the same
     * element with mutations, or replace with a wrapper — the shell
     * inserts whatever you return. Signature:
     * `( el: HTMLElement, detail: DockTileContext ) => HTMLElement`.
     *
     * Returning a different node still has to expose a stable
     * `[data-menu-slug="<id>"]` (or `[data-system-id="<id>"]`)
     * descendant for active-state / badge updates to find the tile;
     * wrap, don't replace.
     *
     * @since 0.5.2
     */
    DOCK_TILE_ELEMENT: "desktop-mode.dock.tile-element",
    /**
     * Action, fires once per tile after it has been inserted into
     * the DOM. Payload `DockTileContext` plus the resolved `el`. Use
     * for post-insertion decoration where computed layout matters
     * (measurements, IntersectionObserver bindings, etc.).
     *
     * @since 0.5.2
     */
    DOCK_TILE_RENDERED: "desktop-mode.dock.tile-rendered",
    /**
     * Filter, resolves the tooltip text for a tile. Runs once at
     * bind time so the dock doesn't re-filter on every pointerenter.
     * Signature: `( label: string, detail: DockTileContext ) =>
     * string`. Return an empty string to suppress the tooltip.
     *
     * @since 0.5.2
     */
    DOCK_TILE_TOOLTIP: "desktop-mode.dock.tile-tooltip",
    /**
     * Filter, resolves the body content of a single hover-peek card.
     * Runs once per card build (i.e., on every show of the peek for
     * a multi-instance dock tile that has ≥1 open window). Lets a
     * plugin render a custom thumbnail, status block, or any other
     * markup inside the card in place of (or alongside) the default
     * mini-window styling.
     *
     * Signature:
     *   ( body: HTMLElement, detail: DockPeekCardContext ) => HTMLElement
     *
     * Where `body` is the `<span class="desktop-mode-dock-peek__card-body">`
     * element that the peek would otherwise populate with ghosted
     * content lines. The filter may:
     *   - Mutate `body` in place (e.g., append a custom child) and
     *     return it.
     *   - Empty `body` and append plugin-owned children.
     *   - Return an entirely different element to replace `body`.
     *
     * `detail.window` is the live `Window` instance the card represents
     * — plugins can read `window.config`, call `window.getCurrentUrl()`,
     * subscribe to lifecycle events, etc. `detail.item` is the dock
     * item descriptor (id / title / icon / url).
     *
     * The filter is invoked under the `applyFilters` namespace
     * `desktop-mode.dock.peek-card-content`.
     *
     * @since 0.6.2
     */
    DOCK_PEEK_CARD_CONTENT: "desktop-mode.dock.peek-card-content",
    /**
     * Filter, runs once per peek card right before it's appended to
     * the popover. Receives the fully-built default card (with its
     * mini-window chrome already populated) and can return either
     * the same node, a mutated version, or an entirely different
     * element to replace the card outright. Use this when the
     * `peek-card-content` body filter isn't enough — e.g., when a
     * plugin wants to swap the whole card chrome (custom titlebar,
     * different shape) or wrap the card in a third-party component.
     *
     * Signature:
     *   ( card: HTMLElement, detail: DockPeekCardContext ) => HTMLElement
     *
     * If a plugin returns a brand-new node, it is responsible for
     * preserving anything the peek relies on:
     *   - The `desktop-mode-dock-peek__card` class (used by the
     *     fan-out animation timing + hover styles).
     *   - A `click` handler if the card should still focus the
     *     window. The default click handler lives on the original
     *     node — replacing the node loses it.
     *
     * @since 0.6.2
     */
    DOCK_PEEK_CARD_ELEMENT: "desktop-mode.dock.peek-card-element",
    // ------------------------------------------------------------------
    // Overview / Arrange lifecycle actions.
    //
    // The "Arrange" admin-bar menu drives two layout algorithms —
    // Cascade (instantly reposition every window in a staggered
    // stack) and Overview (zoom-out grid view with click-to-focus).
    // These hooks surface the state transitions so plugins can
    // instrument analytics, apply custom transitions, override
    // thumbnail decorations, etc. All actions; a filter for
    // mutating the overview layout may be added later if plugins
    // want to reorder or group thumbnails.
    // ------------------------------------------------------------------
    /** Action, fires before the overview enter animation starts. */
    OVERVIEW_ENTERING: "desktop-mode.overview.entering",
    /** Action, fires once the overview enter animation has completed. */
    OVERVIEW_ENTERED: "desktop-mode.overview.entered",
    /**
     * Action, fires at the start of the overview-exit animation.
     * Payload: `{ windowId?: string, reason: 'select' | 'cancel' }` —
     * `windowId` set when the user clicked a thumbnail (reason
     * 'select'); omitted when the user pressed Escape or clicked
     * the backdrop (reason 'cancel').
     */
    OVERVIEW_EXITING: "desktop-mode.overview.exiting",
    /** Action, fires once the overview-exit animation has settled. */
    OVERVIEW_EXITED: "desktop-mode.overview.exited",
    /** Action, fires when the cursor enters a thumbnail. Payload `{ windowId }`. */
    OVERVIEW_WINDOW_HOVER: "desktop-mode.overview.window-hover",
    /** Action, fires when the cursor leaves a thumbnail. Payload `{ windowId }`. */
    OVERVIEW_WINDOW_UNHOVER: "desktop-mode.overview.window-unhover",
    /** Action, fires the instant a thumbnail click is registered (before exit + maximize kick in). Payload `{ windowId }`. */
    OVERVIEW_WINDOW_CLICK: "desktop-mode.overview.window-click",
    /** Action, fires before cascade computes + applies new positions. Payload `{ windowCount }`. */
    ARRANGE_CASCADE_STARTING: "desktop-mode.arrange.cascade.starting",
    /** Action, fires after cascade has positioned every window. Payload `{ windowCount }`. */
    ARRANGE_CASCADE_APPLIED: "desktop-mode.arrange.cascade.applied",
    /** Action, fires before tile computes + applies new positions. Payload `{ windowCount, cols, rows }`. */
    ARRANGE_TILE_STARTING: "desktop-mode.arrange.tile.starting",
    /** Action, fires after tile has positioned every window. Payload `{ windowCount, cols, rows }`. */
    ARRANGE_TILE_APPLIED: "desktop-mode.arrange.tile.applied",
    /**
     * Filter on the tile-grid dimensions chosen by the built-in
     * algorithm. Receives `{ cols, rows }` plus a context arg
     * `{ windowCount, areaWidth, areaHeight }`. Plugins can return
     * a different `{ cols, rows }` to enforce a custom layout
     * (fixed-column newsroom, golden-ratio cells, etc.). Returned
     * values are validated — non-positive integers, or a product
     * smaller than `windowCount`, fall back to the original.
     */
    ARRANGE_TILE_DIMENSIONS: "desktop-mode.arrange.tile.dimensions",
    /** Action, fires when snap-to-grid is toggled. Payload `{ enabled }`. */
    ARRANGE_SNAP_CHANGED: "desktop-mode.arrange.snap.changed",
    /**
     * Filter on the snap-grid cell size. Receives
     * `{ cellWidth, cellHeight }` plus a context arg
     * `{ areaWidth, areaHeight }`. Plugins can return different
     * dimensions to enforce a Tetris-style fixed grid, a musical
     * staff aspect, etc. Non-positive returns fall back to the
     * original.
     */
    ARRANGE_SNAP_CELL_SIZE: "desktop-mode.arrange.snap.cell-size",
    /**
     * Action, fires when the user clicks a plugin-registered entry in
     * the Arrange admin-bar submenu (items added via the
     * `desktop_mode_arrange_menu_items` PHP filter). Payload `{ id }`
     * where `id` is the item's `id` field as registered. Plugins
     * subscribe here to run their custom arrangement logic.
     */
    ARRANGE_CUSTOM_ACTION: "desktop-mode.arrange.custom-action",
    // ------------------------------------------------------------------
    // Snap-zones — Windows-style edge snapping with a split-overview
    // picker to fill the opposite half after commit.
    // ------------------------------------------------------------------
    /**
     * Action, fires when the drag cursor enters a snap zone and the
     * shell shows the target-position preview. Payload
     * `{ windowId, zone: 'left' | 'right' }`.
     */
    SNAP_ZONE_PENDING: "desktop-mode.snap.zone-pending",
    /**
     * Action, fires when the drag cursor leaves the snap zone without
     * releasing — the preview disappears. Payload `{ windowId }`.
     */
    SNAP_ZONE_CANCELED: "desktop-mode.snap.zone-canceled",
    /**
     * Action, fires once the window has animated into its snapped
     * bounds. Payload `{ windowId, zone: 'left' | 'right' }`.
     */
    SNAP_ZONE_COMMITTED: "desktop-mode.snap.zone-committed",
    /**
     * Action, fires when a user picks a thumbnail from the split
     * overview to fill the opposite half. Payload
     * `{ windowId, zone: 'left' | 'right' }`.
     */
    SNAP_SPLIT_FILLED: "desktop-mode.snap.split-filled",
    // ------------------------------------------------------------------
    // Widgets — the right-side column. Widgets paint above the
    // wallpaper but beneath windows. Lifecycle mirrors canvas
    // wallpapers: register via filter, mount/unmount actions bracket
    // each paint, mount-failed fires on sync throws / async rejects.
    // ------------------------------------------------------------------
    /** Filter, receives the widget registry array. */
    WIDGETS: "desktop-mode.widgets",
    /** Action before a widget mounts. Payload `{ id, container, ctx }`. */
    WIDGET_MOUNTING: "desktop-mode.widget.mounting",
    /** Action after a widget mounts successfully. Payload `{ id, container, ctx }`. */
    WIDGET_MOUNTED: "desktop-mode.widget.mounted",
    /** Action before a widget tears down. Payload `{ id }`. */
    WIDGET_UNMOUNTING: "desktop-mode.widget.unmounting",
    /** Action when a widget's mount throws / rejects. Payload `{ id, error }`. */
    WIDGET_MOUNT_FAILED: "desktop-mode.widget.mount-failed",
    /** Action when the user adds a widget via the picker. Payload `{ id }`. */
    WIDGET_ADDED: "desktop-mode.widget.added",
    /** Action when the user removes a widget via the card's × button. Payload `{ id }`. */
    WIDGET_REMOVED: "desktop-mode.widget.removed",
    // ------------------------------------------------------------------
    // Virtual-desktop ("Spaces") lifecycle actions.
    //
    // Spaces let users group windows into separate workspaces and flip
    // between them from the overview top bar. These hooks expose every
    // state change so plugins can persist per-space state, sync custom
    // indicators, or react to the user's workspace context.
    // ------------------------------------------------------------------
    /** Action, fires when a new desktop is created. Payload `{ desktopId }`. */
    DESKTOP_CREATED: "desktop-mode.desktop.created",
    /** Action, fires when a desktop is closed. Payload `{ desktopId, migratedTo }`. */
    DESKTOP_CLOSED: "desktop-mode.desktop.closed",
    /** Action, fires when the active desktop changes. Payload `{ from, to }`. */
    DESKTOP_SWITCHED: "desktop-mode.desktop.switched",
    /**
     * Filter. Returns the id of the "primary" desktop — the one the
     * shell treats as canonical for batch operations. Receives the
     * default (first desktop's id) and the full `Desktop[]` list.
     * @since 0.5.0
     */
    PRIMARY_DESKTOP_ID: "desktop-mode.primary-desktop-id",
    // ------------------------------------------------------------------
    // Batch window operations.
    // ------------------------------------------------------------------
    /**
     * Action, fires before {@link WindowManager.closeAll} starts
     * iterating. Payload `{ candidates: Window[] }` — every window the
     * shell is about to close (after `exceptIds` was applied).
     * @since 0.5.0
     */
    WINDOWS_BEFORE_CLOSE_ALL: "desktop-mode.windows.before-close-all",
    /**
     * Filter, runs inside {@link WindowManager.closeAll}. Receives the
     * candidate `Window[]` list and returns the (possibly trimmed) list
     * that will actually be closed. Plugins use this to PROTECT specific
     * windows from a bulk close — e.g. keep the active draft open.
     * Returning an empty array cancels the close entirely.
     * @since 0.5.0
     */
    WINDOWS_CLOSE_ALL: "desktop-mode.windows.close-all",
    /**
     * Action, fires after {@link WindowManager.closeAll} has finished.
     * Payload `{ closed: number, skipped: Window[] }`.
     * @since 0.5.0
     */
    WINDOWS_AFTER_CLOSE_ALL: "desktop-mode.windows.after-close-all",
    // ------------------------------------------------------------------
    // Slash-command lifecycle.
    // ------------------------------------------------------------------
    /**
     * Filter. Runs immediately before a command's `run()` is invoked.
     * Receives `{ proceed: true, slug, args, command }` and may return
     * the same shape with `proceed: false` to cancel the run.
     * @since 0.5.0
     */
    COMMAND_BEFORE_RUN: "desktop-mode.command.before-run",
    /**
     * Action, fires after a command's `run()` resolves successfully.
     * Payload `{ slug, args, command, result }`.
     * @since 0.5.0
     */
    COMMAND_AFTER_RUN: "desktop-mode.command.after-run",
    /**
     * Action, fires when a command's `run()` throws. Payload
     * `{ slug, args, command, error }`.
     * @since 0.5.0
     */
    COMMAND_ERROR: "desktop-mode.command.error",
    // ------------------------------------------------------------------
    // Shell-level lifecycle actions.
    // ------------------------------------------------------------------
    /**
     * Action, fires (debounced) after the browser viewport stops
     * resizing. Payload `{ width, height }` describes the shell's
     * bounding rect — plugins that render canvas-driven UIs hook here
     * to adjust their render surface.
     */
    SHELL_RESIZED: "desktop-mode.shell.resized",
    /**
     * Action mirroring `document.visibilitychange` for the shell as a
     * whole. Payload `{ state: 'visible' | 'hidden' }`. Different from
     * the wallpaper-specific visibility action in that it fires
     * regardless of which wallpaper (if any) is active.
     */
    SHELL_VISIBILITY: "desktop-mode.shell.visibility",
    /**
     * Action — fires when a `wp.desktop.connect()` connection
     * completes its iframe handshake. Payload:
     * `{ connectionId, targetWindowId, topics }`.
     *
     * @since 0.5.2
     */
    CONNECTION_OPENED: "desktop-mode.connection.opened",
    /**
     * Action — fires when a connection tears down. Payload:
     * `{ connectionId, reason: 'disconnect' | 'window-closed' | 'navigated' }`.
     *
     * @since 0.5.2
     */
    CONNECTION_CLOSED: "desktop-mode.connection.closed",
    /**
     * Action — fires for every message routed through a connection.
     * Payload: `{ connectionId, topic, direction: 'in' | 'out' }`.
     * Used for debug consoles + traffic auditing; high-volume topics
     * fire this many times per second, so subscribers should be
     * cheap.
     *
     * @since 0.5.2
     */
    CONNECTION_MESSAGE: "desktop-mode.connection.message",
    /**
     * Filter — fires when an iframe calls
     * `wp.desktop.iframe.requestConnection()`. Default value is
     * `true` (accept). Return `false` to reject, or an object
     * `{ topics: string[] }` to accept while narrowing the topic
     * list. `$context` carries `{ windowId, requestId, topics }`.
     *
     * @since 0.5.2
     */
    IFRAME_CONNECTION_REQUEST: "desktop-mode.iframe.connection-request",
    // ------------------------------------------------------------------
    // Window content relations & link renderers (since 0.9.4). A window
    // may carry a content identity ("I am comment 45 of post 123");
    // windows resolving to the same root form a relation group, and a
    // pluggable renderer draws the ties on the desktop. Engine:
    // `src/window-links/engine.ts`; registry:
    // `src/window-links/renderer-registry.ts`. See
    // `docs/examples/window-links.md`.
    // ------------------------------------------------------------------
    /**
     * Action — fires when a window's content identity is set, replaced,
     * or cleared. Payload: `{ windowId: string, content:
     * WindowContentRef | null, previous: WindowContentRef | null,
     * source: 'config' | 'bridge' | 'api' }`. The matching
     * `desktop-mode-window-content-changed` CustomEvent dispatches on
     * `document` with the same payload.
     *
     * @since 0.9.4
     */
    WINDOW_CONTENT_CHANGED: "desktop-mode.window-links.content-changed",
    /**
     * Action — fires when relation-group MEMBERSHIP changes (a window
     * gained/lost an identity, or a member window opened/closed).
     * Payload: `{ groups: WindowLinkGroup[] }`. Deliberately NOT fired
     * on move/resize (renderers get live geometry through their frame
     * subscription) nor on focus-recency reordering. The matching
     * `desktop-mode-window-link-groups-changed` CustomEvent dispatches
     * on `document` with the same payload.
     *
     * @since 0.9.4
     */
    WINDOW_LINK_GROUPS_CHANGED: "desktop-mode.window-links.groups-changed",
    /**
     * Filter — applied to every content identity as it is set, before
     * storage. Signature: `( ref: WindowContentRef | null, ctx: {
     * windowId: string, source: 'config' | 'bridge' | 'api' } ) =>
     * WindowContentRef | null`. Return `null` to suppress the identity,
     * or a rewritten ref to remap it (e.g. point a custom object type
     * at your own root scheme).
     *
     * @since 0.9.4
     */
    WINDOW_LINKS_CONTENT: "desktop-mode.window-links.content",
    /**
     * Filter — applied to the computed relation-group list on every
     * read (`wp.desktop.relations.groups()`). Signature:
     * `( groups: WindowLinkGroup[] ) => WindowLinkGroup[]`. Merge,
     * split, or inject groups here.
     *
     * @since 0.9.4
     */
    WINDOW_LINK_GROUPS: "desktop-mode.window-links.groups",
    /**
     * Filter — applied to the derived directed-edge list on every read
     * (`wp.desktop.relations.edges()`). Signature: `( edges:
     * WindowLinkEdge[] ) => WindowLinkEdge[]` where each edge is
     * `{ fromWindowId, toWindowId, kind: 'child-root' | 'reference',
     * bidirectional }`. Add, drop, or redirect ties here — this is
     * what the render host feeds to the active renderer.
     *
     * @since 0.9.4
     */
    WINDOW_LINK_EDGES: "desktop-mode.window-links.edges",
    /**
     * Filter — applied to the related-entity navigation items resolved
     * for a window, every time the title bar's "Related" button decides
     * its visibility and every time its menu is built. Signature:
     * `( items: RelatedEntityItem[], ctx: { windowId: string, content:
     * WindowContentRef | null } ) => RelatedEntityItem[]` where each
     * item is `{ id, group, label, url, groupLabel?, icon?, count? }`.
     * The unfiltered list is whatever the window's content identity
     * carried in `related` (built server-side; see the
     * `desktop_mode_window_related_entities` PHP filter). Add, drop, or
     * relabel items here — return an empty array to hide the button.
     *
     * @since 0.9.6
     */
    RELATED_ENTITIES_ITEMS: "desktop-mode.related-entities.items",
    /**
     * Filter — applied to the registered window-link renderer list on
     * every read (`wp.desktop.listWindowLinkRenderers()`). Signature:
     * `( defs: WindowLinkRendererDef[] ) => WindowLinkRendererDef[]`.
     *
     * @since 0.9.4
     */
    WINDOW_LINK_RENDERERS: "desktop-mode.window-links.renderers",
    /**
     * Filter — applied to the resolved ACTIVE renderer id after the OS
     * Settings selection is read, before the registry lookup.
     * Signature: `( id: string ) => string`. Return a different
     * registered id (or `'none'`) to force-swap the renderer without
     * touching the user's setting.
     *
     * @since 0.9.4
     */
    WINDOW_LINK_RENDERER: "desktop-mode.window-links.renderer",
    // ------------------------------------------------------------------
    // OS-file drop manager (since 0.30.0). Catches files dragged from
    // the user's host OS (Finder / Explorer / Nautilus) onto any
    // desktop-mode surface and routes them through a confirmation
    // dialog before uploading to the Media Library. Authoritative
    // constants live in `src/os-file-drop/hooks.ts`; mirrored here so
    // every hook the shell fires is reachable from a single `HOOKS`
    // import. See `docs/examples/os-file-drop.md`.
    // ------------------------------------------------------------------
    /** Filter — `(files: File[], ctx) => File[]`, before mime/size check. */
    FILE_DROP_FILES_DETECTED: "desktop-mode.drop.files-detected",
    /** Action — `{ rejections, context }` for files that failed policy. */
    FILE_DROP_FILES_REJECTED: "desktop-mode.drop.files-rejected",
    /** Filter — `(entry, ctx) => entry`, per-file dialog defaults. */
    FILE_DROP_DIALOG_FIELDS: "desktop-mode.drop.dialog-fields",
    /** Filter — `(payload, ctx) => payload | null`, last call before POST. */
    FILE_DROP_BEFORE_UPLOAD: "desktop-mode.drop.before-upload",
    /** Action — `{ file, fields, context, abort }` once XHR is open and about to send. @since 0.31.0 */
    FILE_DROP_UPLOAD_STARTED: "desktop-mode.drop.upload-started",
    /** Action — `{ file, fields, context, loaded, total, indeterminate }` per progress tick. @since 0.31.0 */
    FILE_DROP_UPLOAD_PROGRESS: "desktop-mode.drop.upload-progress",
    /** Action — `{ file, result, fields, context }` after successful upload. `file` since 0.31.0. */
    FILE_DROP_AFTER_UPLOAD: "desktop-mode.drop.after-upload",
    /** Action — `{ file, error, context }` on upload failure. */
    FILE_DROP_UPLOAD_FAILED: "desktop-mode.drop.upload-failed",
    // ------------------------------------------------------------------
    // Session / authentication (since 0.9.8). Fired by
    // `src/auth-recovery/index.ts` when the WordPress login session
    // expires and when it comes back. Mirrored as document
    // CustomEvents (`desktop-mode-auth-lost` / `-restored`) for
    // listeners outside the hook bus.
    // ------------------------------------------------------------------
    /**
     * Action, no payload — the Heartbeat `wp-auth-check` flag
     * reported the session as expired. Fires once per outage.
     * Pause pollers / mutations here; requests made while the
     * session is down will 401.
     *
     * @since 0.9.8
     */
    AUTH_LOST: "desktop-mode.auth.lost",
    /**
     * Action, no payload — the session is authenticated again and
     * the shell's cached nonces have been (or are about to be, same
     * tick) refreshed in place. Resume pollers and re-fetch any
     * state that may have failed during the outage. May fire
     * without a preceding `AUTH_LOST` when re-auth was detected
     * from an iframe or another browser tab before the shell's own
     * heartbeat noticed the expiry.
     *
     * @since 0.9.8
     */
    AUTH_RESTORED: "desktop-mode.auth.restored"
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
  const _parentSubs = /* @__PURE__ */ new Map();
  const _nativeSubs = /* @__PURE__ */ new Map();
  function bucket(root, windowId, channel, create) {
    let perWindow = root.get(windowId);
    if (!perWindow) {
      if (!create) {
        return void 0;
      }
      perWindow = /* @__PURE__ */ new Map();
      root.set(windowId, perWindow);
    }
    let bucketSet = perWindow.get(channel);
    if (!bucketSet) {
      if (!create) {
        return void 0;
      }
      bucketSet = /* @__PURE__ */ new Set();
      perWindow.set(channel, bucketSet);
    }
    return bucketSet;
  }
  function dispatch(root, windowId, channel, payload) {
    const meta = { channel, windowId };
    const exact = bucket(root, windowId, channel, false);
    if (exact) {
      for (const cb of Array.from(exact)) {
        try {
          cb(payload, meta);
        } catch (err) {
          if (typeof console !== "undefined") {
            console.error(
              `[desktop-mode] window-channel subscriber for "${channel}" threw:`,
              err
            );
          }
        }
      }
    }
    const wildcard = bucket(root, windowId, "*", false);
    if (wildcard) {
      for (const cb of Array.from(wildcard)) {
        try {
          cb(payload, meta);
        } catch (err) {
          if (typeof console !== "undefined") {
            console.error(
              `[desktop-mode] window-channel wildcard subscriber for "${windowId}" threw:`,
              err
            );
          }
        }
      }
    }
  }
  function addParentSubscriber(windowId, channel, cb) {
    const set = bucket(_parentSubs, windowId, channel, true);
    set.add(cb);
    let removed = false;
    return () => {
      if (removed) {
        return;
      }
      removed = true;
      set.delete(cb);
    };
  }
  function dispatchFromWindow(windowId, channel, payload) {
    dispatch(_parentSubs, windowId, channel, payload);
  }
  function addNativeSubscriber(windowId, channel, cb) {
    const set = bucket(_nativeSubs, windowId, channel, true);
    set.add(cb);
    let removed = false;
    return () => {
      if (removed) {
        return;
      }
      removed = true;
      set.delete(cb);
    };
  }
  function dispatchToNative(windowId, channel, payload) {
    dispatch(_nativeSubs, windowId, channel, payload);
  }
  const _readyWindows = /* @__PURE__ */ new Set();
  const _loadingWindows = /* @__PURE__ */ new Set();
  const _pendingSends = /* @__PURE__ */ new Map();
  function isWindowContentReady(windowId) {
    return _readyWindows.has(windowId);
  }
  function markWindowContentLoading(windowId) {
    if (_loadingWindows.has(windowId)) {
      return;
    }
    _loadingWindows.add(windowId);
    doAction(HOOKS.WINDOW_CONTENT_LOADING, { windowId });
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("desktop-mode-window-content-loading", {
          detail: { windowId }
        })
      );
    }
  }
  function markWindowContentReady(windowId) {
    if (!_readyWindows.has(windowId)) {
      _readyWindows.add(windowId);
      const queued = _pendingSends.get(windowId);
      if (queued) {
        _pendingSends.delete(windowId);
        for (const m of queued) {
          try {
            m.flush();
          } catch (err) {
            if (typeof console !== "undefined") {
              console.error(
                `[desktop-mode] flushing queued window-send for "${m.channel}" threw:`,
                err
              );
            }
          }
        }
      }
    }
    if (_loadingWindows.delete(windowId)) {
      doAction(HOOKS.WINDOW_CONTENT_LOADED, { windowId });
      if (typeof document !== "undefined") {
        document.dispatchEvent(
          new CustomEvent("desktop-mode-window-content-loaded", {
            detail: { windowId }
          })
        );
      }
    }
  }
  function enqueueWindowSend(windowId, channel, payload, flush) {
    let q = _pendingSends.get(windowId);
    if (!q) {
      q = [];
      _pendingSends.set(windowId, q);
    }
    q.push({ channel, payload, flush });
  }
  function clearWindowChannels(windowId) {
    _parentSubs.delete(windowId);
    _nativeSubs.delete(windowId);
    _readyWindows.delete(windowId);
    _loadingWindows.delete(windowId);
    _pendingSends.delete(windowId);
  }
  const _syntheticIframes = /* @__PURE__ */ new Map();
  function getSyntheticIframe(windowId) {
    return _syntheticIframes.get(windowId) ?? null;
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
    return format.replace(/%(?:(\d+)\$)?[sd]/g, (_match, pos) => {
      const idx = pos ? Number.parseInt(pos, 10) - 1 : i++;
      return String(args[idx] ?? "");
    });
  }
  let _ctxInstance = 0;
  function buildNativeRenderContext(windowId) {
    const instance = ++_ctxInstance;
    const ns = (label) => `desktop-mode/native-render-ctx/${windowId}/${instance}/${label}`;
    const controller = new AbortController();
    const teardowns = [];
    const subscribeWindowed = (hookName2, label, match, invoke) => {
      const namespace = ns(label);
      addAction(hookName2, namespace, (payload) => {
        if (match(payload)) {
          invoke(payload);
        }
      });
      const off = () => {
        removeAction(hookName2, namespace);
      };
      teardowns.push(off);
      return off;
    };
    const matchByWindowId = (payload) => !!payload && typeof payload === "object" && payload.windowId === windowId;
    const ctx = {
      window: {
        send(channel, payload) {
          if (typeof channel !== "string" || channel === "") {
            return;
          }
          dispatchFromWindow(windowId, channel, payload);
        },
        on(channel, cb) {
          if (typeof channel !== "string" || channel === "" || typeof cb !== "function") {
            return () => void 0;
          }
          return addNativeSubscriber(
            windowId,
            channel,
            cb
          );
        },
        markLoading() {
          markWindowContentLoading(windowId);
        },
        markReady() {
          markWindowContentReady(windowId);
        }
      },
      markLoading() {
        markWindowContentLoading(windowId);
      },
      markReady() {
        markWindowContentReady(windowId);
      },
      signal: controller.signal,
      onResize(cb) {
        if (typeof cb !== "function") {
          return () => void 0;
        }
        return subscribeWindowed(
          HOOKS.WINDOW_BODY_RESIZED,
          "on-resize",
          matchByWindowId,
          (payload) => {
            const { width, height } = payload;
            try {
              cb(width, height);
            } catch (err) {
              doAction(HOOKS.SHELL_ERROR, {
                scope: "native-render-ctx/onResize",
                id: windowId,
                error: err
              });
            }
          }
        );
      },
      onHide(cb) {
        if (typeof cb !== "function") {
          return () => void 0;
        }
        return subscribeWindowed(
          HOOKS.WINDOW_MINIMIZED,
          "on-hide",
          matchByWindowId,
          () => {
            try {
              cb();
            } catch (err) {
              doAction(HOOKS.SHELL_ERROR, {
                scope: "native-render-ctx/onHide",
                id: windowId,
                error: err
              });
            }
          }
        );
      },
      onShow(cb) {
        if (typeof cb !== "function") {
          return () => void 0;
        }
        return subscribeWindowed(
          HOOKS.WINDOW_RESTORED,
          "on-show",
          matchByWindowId,
          () => {
            try {
              cb();
            } catch (err) {
              doAction(HOOKS.SHELL_ERROR, {
                scope: "native-render-ctx/onShow",
                id: windowId,
                error: err
              });
            }
          }
        );
      }
    };
    const dispose = () => {
      try {
        controller.abort();
      } catch {
      }
      while (teardowns.length) {
        const off = teardowns.pop();
        try {
          off?.();
        } catch {
        }
      }
    };
    return { ctx, dispose };
  }
  function urlMatchKey(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.delete("desktop_mode_chromeless");
      parsed.searchParams.delete("desktop_mode_portal");
      return parsed.pathname.replace(/\/+$/, "") + "?" + parsed.searchParams.toString();
    } catch {
      return url;
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
  const WINDOW_CONFIG_KEY = Symbol.for("desktop-mode/window-config");
  function setWindowConfigOnElement(el, config) {
    el[WINDOW_CONFIG_KEY] = config;
  }
  const INITIAL_ORIGIN$2 = window.location.origin;
  function withChromelessParam(url) {
    const parsed = new URL(url, INITIAL_ORIGIN$2);
    if (parsed.origin !== INITIAL_ORIGIN$2) {
      return null;
    }
    parsed.searchParams.set("desktop_mode_chromeless", "1");
    return parsed.toString();
  }
  function updateFullscreenBodyClass() {
    const hasFullscreen = document.querySelectorAll(".desktop-mode-window--fullscreen:not(.desktop-mode-window--minimized)").length > 0;
    document.body.classList.toggle("desktop-mode-has-fullscreen-window", hasFullscreen);
  }
  function buildDefaultLoadingOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "desktop-mode-window__loading";
    overlay.setAttribute("aria-hidden", "true");
    const spinner = document.createElement("wpd-spinner");
    spinner.setAttribute("preset", "classic");
    spinner.setAttribute("size", "clamp(96px, 14vw, 192px)");
    spinner.setAttribute("label", __("Loading window content"));
    overlay.appendChild(spinner);
    return overlay;
  }
  function createLoadingOverlay(config) {
    let overlay = buildDefaultLoadingOverlay();
    const ctx = { windowId: config.id, config };
    if (typeof config.loading?.render === "function") {
      try {
        config.loading.render(overlay, ctx);
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            `[desktop-mode] loading.render threw for "${config.id}":`,
            err
          );
        }
      }
    }
    try {
      const filtered = applyFilters(
        HOOKS.WINDOW_LOADING_OVERLAY,
        overlay,
        ctx
      );
      if (filtered instanceof HTMLElement) {
        overlay = filtered;
      }
    } catch (err) {
      if (typeof console !== "undefined") {
        console.error(
          `[desktop-mode] WINDOW_LOADING_OVERLAY filter threw for "${config.id}":`,
          err
        );
      }
    }
    if (overlay && !overlay.classList.contains("desktop-mode-window__loading")) {
      overlay.classList.add("desktop-mode-window__loading");
    }
    return overlay;
  }
  function createSlotHost(name) {
    const host = document.createElement("span");
    host.className = `desktop-mode-window__slot desktop-mode-window__slot--${name}`;
    host.dataset.slot = name;
    return host;
  }
  function createWindowElement(config) {
    const el = document.createElement("div");
    el.className = "desktop-mode-window";
    if (config.native) {
      el.classList.add("desktop-mode-window--native");
    }
    el.id = `wp-window-${config.id}`;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-labelledby", `wp-window-title-${config.id}`);
    el.style.left = `${config.x}px`;
    el.style.top = `${config.y}px`;
    el.style.width = `${config.width}px`;
    el.style.height = `${config.height}px`;
    const titleBar = document.createElement("div");
    titleBar.className = "desktop-mode-window__titlebar";
    const menuBtn = document.createElement("wpd-window-button");
    menuBtn.setAttribute("icon", "menu");
    menuBtn.setAttribute("aria-label", __("Window actions"));
    menuBtn.setAttribute("aria-haspopup", "menu");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.classList.add("desktop-mode-window__btn");
    menuBtn.classList.add("desktop-mode-window__menu-btn");
    const menuPanel = document.createElement("wpd-menu");
    menuPanel.classList.add("desktop-mode-window__menu-panel");
    menuPanel.hidden = true;
    const startup = document.createElement("wpd-menu-item");
    startup.setAttribute("role", "menuitemcheckbox");
    startup.setAttribute("value", "startup");
    startup.classList.add("desktop-mode-window__menu-item");
    startup.classList.add("desktop-mode-window__menu-item--startup");
    startup.textContent = __("Open on startup");
    menuPanel.appendChild(startup);
    if (config.multi) {
      const openAnother = document.createElement("wpd-menu-item");
      openAnother.setAttribute("role", "menuitem");
      openAnother.setAttribute("value", "open-another");
      openAnother.setAttribute("icon", "dashicons-plus-alt2");
      openAnother.classList.add("desktop-mode-window__menu-item");
      openAnother.classList.add(
        "desktop-mode-window__menu-item--open-another"
      );
      openAnother.textContent = sprintf(
        // translators: %s is the window's admin-page name (e.g., "Posts")
        __("Open another %s"),
        config.title
      );
      menuPanel.appendChild(openAnother);
    }
    if (!config.native) {
      const openInNew = document.createElement("wpd-menu-item");
      openInNew.setAttribute("role", "menuitem");
      openInNew.setAttribute("value", "open-in-new-window");
      openInNew.setAttribute("icon", "dashicons-plus-alt");
      openInNew.classList.add("desktop-mode-window__menu-item");
      openInNew.classList.add("desktop-mode-window__menu-item--open-in-new-window");
      openInNew.textContent = __("Open in new window");
      menuPanel.appendChild(openInNew);
    }
    if (!config.native) {
      const reload = document.createElement("wpd-menu-item");
      reload.setAttribute("role", "menuitem");
      reload.setAttribute("value", "reload");
      reload.setAttribute("icon", "dashicons-update");
      reload.classList.add("desktop-mode-window__menu-item");
      reload.classList.add("desktop-mode-window__menu-item--reload");
      reload.textContent = __("Reload");
      menuPanel.appendChild(reload);
      const openExternal = document.createElement("wpd-menu-item");
      openExternal.setAttribute("role", "menuitem");
      openExternal.setAttribute("value", "open-external");
      openExternal.setAttribute("icon", "dashicons-external");
      openExternal.classList.add("desktop-mode-window__menu-item");
      openExternal.classList.add("desktop-mode-window__menu-item--open-external");
      openExternal.textContent = __("Open in browser tab");
      menuPanel.appendChild(openExternal);
    }
    const slotIcon = createSlotHost("icon");
    const iconEl = renderIcon(config.icon, {
      title: config.title,
      className: "desktop-mode-window__icon"
    });
    slotIcon.appendChild(iconEl);
    const slotTitle = createSlotHost("title");
    const titleEl = document.createElement("span");
    titleEl.className = "desktop-mode-window__title";
    titleEl.id = `wp-window-title-${config.id}`;
    titleEl.textContent = config.title;
    slotTitle.appendChild(titleEl);
    const slotBeforeTitlebar = createSlotHost("before-titlebar");
    const slotBeforeIcon = createSlotHost("before-icon");
    const slotAfterTitle = createSlotHost("after-title");
    const slotBeforeControls = createSlotHost("before-controls");
    const slotAfterControls = createSlotHost("after-controls");
    const slotAfterTitlebar = createSlotHost("after-titlebar");
    const controls = document.createElement("div");
    controls.className = "desktop-mode-window__controls";
    const screenMeta = document.createElement("div");
    screenMeta.className = "desktop-mode-window__screen-meta";
    const customLeft = document.createElement("span");
    customLeft.className = "desktop-mode-window__custom-buttons desktop-mode-window__custom-buttons--left";
    const customRight = document.createElement("span");
    customRight.className = "desktop-mode-window__custom-buttons desktop-mode-window__custom-buttons--right";
    const activityHost = document.createElement("span");
    activityHost.className = "desktop-mode-window__activity";
    const activityStatus = document.createElement("wpd-save-status");
    activityStatus.setAttribute("mode", "dot");
    activityStatus.setAttribute("animation", "modem");
    activityStatus.setAttribute("phase", "idle");
    activityStatus.setAttribute("data-desktop-mode-activity-indicator", "");
    activityHost.appendChild(activityStatus);
    titleBar.appendChild(slotBeforeIcon);
    titleBar.appendChild(slotIcon);
    titleBar.appendChild(activityHost);
    titleBar.appendChild(slotTitle);
    titleBar.appendChild(slotAfterTitle);
    titleBar.appendChild(customLeft);
    titleBar.appendChild(screenMeta);
    if (menuBtn && menuPanel && menuPanel.children.length > 0) {
      titleBar.appendChild(menuBtn);
      titleBar.appendChild(menuPanel);
    }
    titleBar.appendChild(customRight);
    titleBar.appendChild(slotBeforeControls);
    titleBar.appendChild(controls);
    titleBar.appendChild(slotAfterControls);
    for (const child of Array.from(titleBar.children)) {
      child.setAttribute(
        "data-desktop-mode-default-chrome",
        ""
      );
    }
    const body = document.createElement("div");
    body.className = "desktop-mode-window__body desktop-mode-window__body--loading";
    if (!config.native) {
      const iframe = document.createElement("iframe");
      iframe.className = "desktop-mode-window__iframe";
      iframe.setAttribute("name", `desktop-mode-frame-${config.id}`);
      const chromelessSrc = config.url ? withChromelessParam(config.url) : null;
      iframe.src = chromelessSrc ?? "about:blank";
      body.appendChild(iframe);
      const onIframeLoad = () => {
        markWindowContentReady(config.id);
      };
      iframe.addEventListener("load", onIframeLoad);
    } else {
      body.classList.add("desktop-mode-window__body--native");
    }
    body.appendChild(createLoadingOverlay(config));
    markWindowContentLoading(config.id);
    const resizeHandles = [];
    for (const dir of ["ne", "nw", "se", "sw"]) {
      const h = document.createElement("div");
      h.className = `desktop-mode-window__resize-handle desktop-mode-window__resize-handle--${dir}`;
      h.dataset.dir = dir;
      h.setAttribute("aria-hidden", "true");
      resizeHandles.push(h);
    }
    el.appendChild(slotBeforeTitlebar);
    el.appendChild(titleBar);
    el.appendChild(slotAfterTitlebar);
    if (!config.native) {
      const tabs = document.createElement("nav");
      tabs.className = "desktop-mode-window__tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", sprintf(__("%s sub-pages"), config.title));
      if (config.submenu && config.submenu.length > 0 && config.url) {
        const initialKey = urlMatchKey(config.url);
        const synthUrl = config.parentUrl ?? config.url;
        const synthKey = urlMatchKey(synthUrl);
        const parentAlreadyInSubmenu = config.submenu.some(
          (s) => urlMatchKey(s.url) === synthKey
        );
        const seedSubmenu = parentAlreadyInSubmenu ? [...config.submenu] : [{ title: config.title, url: synthUrl }, ...config.submenu];
        for (const sub of seedSubmenu) {
          const tab = document.createElement("button");
          tab.className = "desktop-mode-window__tab";
          tab.dataset.kind = "submenu";
          tab.setAttribute("type", "button");
          tab.setAttribute("role", "tab");
          tab.dataset.url = sub.url;
          tab.textContent = sub.title;
          if (urlMatchKey(sub.url) === initialKey) {
            tab.classList.add("desktop-mode-window__tab--active");
            tab.setAttribute("aria-selected", "true");
          } else {
            tab.setAttribute("aria-selected", "false");
          }
          tabs.appendChild(tab);
        }
      }
      el.appendChild(tabs);
    }
    el.appendChild(body);
    for (const h of resizeHandles) {
      el.appendChild(h);
    }
    setWindowConfigOnElement(el, config);
    return el;
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
  const EDGE_MARGIN = 0;
  const DRAG_THRESHOLD_PX = 5;
  const DRAG_THRESHOLD_SQUARED = DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
  const EXTERNAL_IFRAME_READY_TIMEOUT_MS = 3e3;
  function syncActiveTab(win, currentUrl) {
    const submenuTabs = win.element.querySelectorAll(
      '.desktop-mode-window__tab[data-kind="submenu"]'
    );
    if (!submenuTabs.length) {
      return;
    }
    if (win._activeTabId !== "primary") {
      for (const tab of submenuTabs) {
        tab.classList.remove("desktop-mode-window__tab--active");
        tab.setAttribute("aria-selected", "false");
      }
      return;
    }
    const activeKey = urlMatchKey(currentUrl);
    for (const tab of submenuTabs) {
      const tabUrl = tab.dataset.url;
      const isActive = !!tabUrl && urlMatchKey(tabUrl) === activeKey;
      tab.classList.toggle("desktop-mode-window__tab--active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    }
  }
  function addExternalTab(win, url, label) {
    if (!win.iframe) {
      return;
    }
    const tabStrip = win.element.querySelector(
      ".desktop-mode-window__tabs"
    );
    const body = win.element.querySelector(
      ".desktop-mode-window__body"
    );
    if (!tabStrip || !body) {
      return;
    }
    ensureMainTab(win, tabStrip);
    const tabId = `ext-${++win._externalTabSeq}`;
    const tabEl = document.createElement("button");
    tabEl.className = "desktop-mode-window__tab desktop-mode-window__tab--external";
    tabEl.dataset.kind = "external";
    tabEl.dataset.tabId = tabId;
    tabEl.setAttribute("type", "button");
    tabEl.setAttribute("role", "tab");
    tabEl.setAttribute("aria-selected", "false");
    tabEl.title = url;
    const labelEl = document.createElement("span");
    labelEl.className = "desktop-mode-window__tab-label";
    labelEl.textContent = label;
    tabEl.appendChild(labelEl);
    const detachBtn = document.createElement("wpd-tab-chip");
    detachBtn.setAttribute("variant", "detach");
    detachBtn.dataset.tabAction = "detach";
    detachBtn.dataset.tabId = tabId;
    detachBtn.setAttribute("aria-label", __("Open in a new browser tab"));
    detachBtn.title = __("Open in a new browser tab");
    tabEl.appendChild(detachBtn);
    const closeBtn = document.createElement("wpd-tab-chip");
    closeBtn.setAttribute("variant", "close");
    closeBtn.dataset.tabAction = "close";
    closeBtn.dataset.tabId = tabId;
    closeBtn.setAttribute("aria-label", __("Close tab"));
    closeBtn.title = __("Close tab");
    tabEl.appendChild(closeBtn);
    tabStrip.appendChild(tabEl);
    const iframe = document.createElement("iframe");
    iframe.className = "desktop-mode-window__iframe desktop-mode-window__iframe--external";
    iframe.dataset.tabId = tabId;
    iframe.style.display = "none";
    iframe.src = url;
    body.appendChild(iframe);
    let loaded = false;
    const onLoad = () => {
      loaded = true;
    };
    iframe.addEventListener("load", onLoad, { once: true });
    const probeTimer = window.setTimeout(() => {
      if (loaded) {
        return;
      }
      iframe.removeEventListener("load", onLoad);
      fallbackToBrowserTab(win, tabId);
    }, EXTERNAL_IFRAME_READY_TIMEOUT_MS);
    const cancelProbe = () => {
      iframe.removeEventListener("load", onLoad);
      window.clearTimeout(probeTimer);
    };
    win._externalTabs.set(tabId, {
      tabEl,
      iframe,
      url,
      label,
      cancelProbe
    });
    switchToTab(win, tabId);
    tabEl.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
    win._emitChange("state");
  }
  function ensureMainTab(win, tabStrip) {
    if (tabStrip.querySelector('[data-kind="main"]')) {
      return;
    }
    if (tabStrip.querySelector('[data-kind="submenu"]')) {
      return;
    }
    const main = document.createElement("button");
    main.className = "desktop-mode-window__tab desktop-mode-window__tab--main desktop-mode-window__tab--active";
    main.dataset.kind = "main";
    main.setAttribute("type", "button");
    main.setAttribute("role", "tab");
    main.setAttribute("aria-selected", "true");
    main.textContent = win.config.title || "Main";
    tabStrip.prepend(main);
  }
  function switchToTab(win, tabId) {
    if (win._activeTabId === tabId) {
      return;
    }
    win._activeTabId = tabId;
    if (win.iframe) {
      win.iframe.style.display = tabId === "primary" ? "" : "none";
    }
    for (const [id, entry] of win._externalTabs) {
      entry.iframe.style.display = tabId === id ? "" : "none";
    }
    const tabEls = win.element.querySelectorAll(
      ".desktop-mode-window__tab"
    );
    tabEls.forEach((t) => {
      let isActive;
      if (t.dataset.kind === "main") {
        isActive = tabId === "primary";
      } else if (t.dataset.kind === "external") {
        isActive = t.dataset.tabId === tabId;
      } else {
        isActive = tabId === "primary" && t.classList.contains("desktop-mode-window__tab--active");
      }
      t.classList.toggle("desktop-mode-window__tab--active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }
  function closeExternalTab(win, tabId) {
    const entry = win._externalTabs.get(tabId);
    if (!entry) {
      return;
    }
    entry.cancelProbe();
    entry.tabEl.remove();
    entry.iframe.remove();
    win._externalTabs.delete(tabId);
    if (win._activeTabId === tabId) {
      switchToTab(win, "primary");
    }
    if (win._externalTabs.size === 0) {
      const main = win.element.querySelector(
        ".desktop-mode-window__tab--main"
      );
      main?.remove();
    }
    win._emitChange("state");
  }
  function detachExternalTab(win, tabId) {
    const entry = win._externalTabs.get(tabId);
    if (!entry) {
      return;
    }
    let url = entry.url;
    try {
      const href = entry.iframe.contentWindow?.location.href;
      if (href && href !== "about:blank") {
        url = href;
      }
    } catch {
    }
    window.open(url, "_blank", "noopener");
    closeExternalTab(win, tabId);
  }
  function fallbackToBrowserTab(win, tabId) {
    const entry = win._externalTabs.get(tabId);
    if (!entry) {
      return;
    }
    const { url, label } = entry;
    closeExternalTab(win, tabId);
    showToast({
      message: sprintf(
        // translators: %s is the external site's title or URL.
        __(
          `Opened "%s" in a new browser tab — this site doesn't allow embedding.`
        ),
        label
      ),
      action: {
        label: __("Open"),
        onClick: () => {
          window.open(url, "_blank", "noopener");
        }
      }
    });
    window.open(url, "_blank", "noopener");
  }
  function externalTabCount(win) {
    return win._externalTabs.size;
  }
  function externalTabsSnapshot(win) {
    const out = [];
    for (const entry of win._externalTabs.values()) {
      let url = entry.url;
      try {
        const href = entry.iframe.contentWindow?.location.href;
        if (href && href !== "about:blank") {
          url = href;
        }
      } catch {
      }
      out.push({ url, label: entry.label });
    }
    return out;
  }
  function handleTabStripClick(win, e) {
    const target = e.target;
    const chip = target.closest("[data-tab-action]");
    if (chip) {
      e.stopPropagation();
      const action = chip.dataset.tabAction;
      const tabId2 = chip.dataset.tabId;
      if (!tabId2) {
        return;
      }
      if (action === "close") {
        closeExternalTab(win, tabId2);
      } else if (action === "detach") {
        detachExternalTab(win, tabId2);
      }
      return;
    }
    const tab = target.closest(".desktop-mode-window__tab");
    if (!tab) {
      return;
    }
    e.stopPropagation();
    const kind = tab.dataset.kind;
    const tabId = tab.dataset.tabId;
    if (kind === "external" && tabId) {
      switchToTab(win, tabId);
      return;
    }
    if (kind === "main") {
      switchToTab(win, "primary");
      return;
    }
    if (tab.dataset.url) {
      const next = withChromelessParam(tab.dataset.url);
      if (next && win.iframe) {
        win.markContentLoading();
        win.iframe.src = next;
      }
      switchToTab(win, "primary");
    }
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
  const remapStore = createSharedStore(
    "desktop-mode/native-url-remap",
    () => ({ remaps: [], deps: null })
  );
  function tryNativeUrlRemap(url) {
    const { deps, remaps } = remapStore.state;
    if (!deps || !url) {
      return false;
    }
    let parsed;
    try {
      parsed = new URL(url, deps.adminUrl);
    } catch {
      return false;
    }
    const snapshot = deps.getSnapshot();
    for (const entry of remaps) {
      if (!entry.matches(url, parsed)) {
        continue;
      }
      if (entry.enabled && !entry.enabled(snapshot)) {
        continue;
      }
      if (entry.onMatch) {
        try {
          entry.onMatch(url, parsed);
        } catch (err) {
          console.warn(
            `[desktop-mode] URL remap onMatch hook threw for "${entry.id}":`,
            err
          );
        }
      }
      if (deps.openById(entry.nativeWindowId)) {
        return true;
      }
    }
    return false;
  }
  const store$6 = createSharedStore(
    "desktop-mode/destructive-admin-actions",
    () => ({ entries: [] })
  );
  function matchDestructiveAdminAction(url, parsed) {
    for (const entry of store$6.state.entries) {
      try {
        if (entry.matches(url, parsed)) {
          return entry.id;
        }
      } catch (err) {
        console.warn(
          `[desktop-mode] destructive-action predicate threw for "${entry.id}":`,
          err
        );
      }
    }
    return null;
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
  function logRegistrationErrors(kind, errors, def) {
    if (typeof console === "undefined") {
      return;
    }
    console.warn(
      `[desktop-mode] ${kind} registration rejected — fields: ` + errors.join(", ") + ".",
      def
    );
  }
  const MAX_LINKS = 32;
  const MAX_RELATED = 64;
  const CONTENT_TYPE_ID = /^[a-z0-9_/-]+$/;
  const store$5 = createSharedStore(
    "desktop-mode/window-links",
    () => ({
      contentByWindow: /* @__PURE__ */ new Map(),
      focusSeq: /* @__PURE__ */ new Map(),
      seq: 0,
      listeners: /* @__PURE__ */ new Set(),
      lastGroupsSignature: "",
      manager: null,
      started: false
    })
  );
  function keyOf(ref) {
    return `${ref.type}:${ref.id}`;
  }
  function rootKeyOf(ref) {
    return ref.root ? keyOf(ref.root) : keyOf(ref);
  }
  function validateRef(ref) {
    const isValidId = (v) => typeof v === "number" && Number.isFinite(v) || typeof v === "string" && v.trim() !== "";
    const isValidType = (v) => typeof v === "string" && CONTENT_TYPE_ID.test(v.trim().toLowerCase());
    return collectRegistrationErrors(ref, [
      {
        field: "type",
        valid: (r) => isValidType(r.type),
        message: "must match /^[a-z0-9_/-]+$/ — lowercase alphanum, hyphens, underscores, slashes for vendor/sub-type"
      },
      {
        field: "id",
        valid: (r) => isValidId(r.id),
        message: "must be a finite number or non-empty string"
      },
      {
        field: "root",
        valid: (r) => r.root === void 0 || !!r.root && typeof r.root === "object" && isValidType(r.root.type) && isValidId(r.root.id),
        message: "when present, must be { type, id } with the same shapes as the ref itself"
      },
      {
        field: "related",
        valid: (r) => r.related === void 0 || Array.isArray(r.related) && r.related.every(
          (item) => !!item && typeof item === "object" && typeof item.id === "string" && item.id.trim() !== "" && typeof item.group === "string" && item.group.trim() !== "" && typeof item.label === "string" && item.label.trim() !== "" && typeof item.url === "string" && item.url.trim() !== "" && (item.groupLabel === void 0 || typeof item.groupLabel === "string") && (item.icon === void 0 || typeof item.icon === "string") && (item.count === void 0 || typeof item.count === "number" && Number.isFinite(item.count))
        ),
        message: "when present, must be an array of { id, group, label, url, groupLabel?, icon?, count? } entries with non-empty strings"
      },
      {
        field: "links",
        valid: (r) => r.links === void 0 || Array.isArray(r.links) && r.links.every(
          (l) => !!l && typeof l === "object" && isValidType(l.type) && isValidId(l.id) && (l.rel === void 0 || l.rel === "references" || l.rel === "child")
        ),
        message: "when present, must be an array of { type, id, rel?: 'references'|'child' } entries"
      }
    ]);
  }
  function normalizeRef(ref, source) {
    const next = {
      type: ref.type.trim().toLowerCase(),
      id: ref.id,
      source
    };
    if (ref.root) {
      next.root = {
        type: ref.root.type.trim().toLowerCase(),
        id: ref.root.id
      };
    }
    if (Array.isArray(ref.links) && ref.links.length > 0) {
      next.links = ref.links.slice(0, MAX_LINKS).map((l) => {
        const entry = {
          type: l.type.trim().toLowerCase(),
          id: l.id
        };
        if (l.rel === "child") {
          entry.rel = "child";
        }
        return entry;
      });
    }
    if (typeof ref.label === "string" && ref.label !== "") {
      next.label = ref.label;
    }
    if (Array.isArray(ref.related) && ref.related.length > 0) {
      next.related = ref.related.slice(0, MAX_RELATED).map((item) => {
        const entry = {
          id: item.id,
          group: item.group,
          label: item.label,
          url: item.url
        };
        if (typeof item.groupLabel === "string" && item.groupLabel !== "") {
          entry.groupLabel = item.groupLabel;
        }
        if (typeof item.icon === "string" && item.icon !== "") {
          entry.icon = item.icon;
        }
        if (typeof item.count === "number") {
          entry.count = item.count;
        }
        return entry;
      });
    }
    return next;
  }
  function relatedSignature(ref) {
    if (!ref || !ref.related) {
      return "";
    }
    return ref.related.map(
      (item) => `${item.id}\0${item.group}\0${item.label}\0${item.url}\0${item.groupLabel ?? ""}\0${item.icon ?? ""}\0${item.count ?? ""}`
    ).join("|");
  }
  function refSignature(ref) {
    if (!ref) {
      return "";
    }
    return [
      keyOf(ref),
      rootKeyOf(ref),
      ...(ref.links ?? []).map(
        (l) => keyOf(l) + (l.rel === "child" ? "!child" : "")
      )
    ].join("|");
  }
  function setWindowContent(windowId, ref, opts = {}) {
    const source = opts.source ?? "api";
    if (typeof windowId !== "string" || windowId === "") {
      throwOnRegistrationErrors(
        "WindowContentRef",
        ["windowId (must be a non-empty string)"],
        ref
      );
      return;
    }
    let next = null;
    if (ref !== null && ref !== void 0) {
      const errors = validateRef(ref);
      if (errors.length > 0) {
        if (source === "api") {
          throwOnRegistrationErrors("WindowContentRef", errors, ref);
        }
        logRegistrationErrors("WindowContentRef", errors, ref);
        return;
      }
      next = normalizeRef(ref, source);
    }
    next = applyFilters(
      HOOKS.WINDOW_LINKS_CONTENT,
      next,
      { windowId, source }
    );
    if (next !== null && (!next || validateRef(next).length > 0)) {
      logRegistrationErrors(
        "WindowContentRef",
        ["filter (desktop-mode.window-links.content returned an invalid ref)"],
        next
      );
      return;
    }
    const previous = store$5.state.contentByWindow.get(windowId) ?? null;
    if (next === null && previous === null) {
      return;
    }
    if (next !== null && previous !== null && refSignature(next) === refSignature(previous) && next.label === previous.label && relatedSignature(next) === relatedSignature(previous)) {
      return;
    }
    if (next === null) {
      store$5.state.contentByWindow.delete(windowId);
    } else {
      store$5.state.contentByWindow.set(windowId, next);
    }
    const changedDetail = { windowId, content: next, previous, source };
    document.dispatchEvent(
      new CustomEvent("desktop-mode-window-content-changed", {
        detail: changedDetail
      })
    );
    doAction(HOOKS.WINDOW_CONTENT_CHANGED, changedDetail);
    broadcastGroupsIfChanged();
    notify();
  }
  function listWindowLinkGroups() {
    const byKey = /* @__PURE__ */ new Map();
    for (const [windowId, ref] of store$5.state.contentByWindow) {
      const groupKey = rootKeyOf(ref);
      let group = byKey.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          root: ref.root ? { ...ref.root } : { type: ref.type, id: ref.id },
          rootWindowIds: [],
          children: []
        };
        byKey.set(groupKey, group);
      }
      if (ref.root) {
        group.children.push({ windowId, content: ref });
      } else {
        group.rootWindowIds.push(windowId);
      }
    }
    const seq = store$5.state.focusSeq;
    for (const group of byKey.values()) {
      group.rootWindowIds.sort(
        (a, b) => (seq.get(b) ?? 0) - (seq.get(a) ?? 0)
      );
    }
    const copy = Array.from(byKey.values());
    const filtered = applyFilters(
      HOOKS.WINDOW_LINK_GROUPS,
      copy
    );
    if (!Array.isArray(filtered)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[desktop-mode] `desktop-mode.window-links.groups` filter returned a non-array; falling back to computed groups."
        );
      }
      return copy;
    }
    return filtered;
  }
  function notify() {
    for (const cb of Array.from(store$5.state.listeners)) {
      try {
        cb();
      } catch (err) {
        if (typeof console !== "undefined") {
          console.error(
            "[desktop-mode] window-links listener threw:",
            err
          );
        }
      }
    }
  }
  function relationsSignature() {
    return Array.from(store$5.state.contentByWindow).map(([id, ref]) => `${id}=${refSignature(ref)}`).sort().join(";");
  }
  function broadcastGroupsIfChanged() {
    const signature = relationsSignature();
    if (signature === store$5.state.lastGroupsSignature) {
      return;
    }
    store$5.state.lastGroupsSignature = signature;
    const groups = listWindowLinkGroups();
    const detail = { groups };
    document.dispatchEvent(
      new CustomEvent("desktop-mode-window-link-groups-changed", {
        detail
      })
    );
    doAction(HOOKS.WINDOW_LINK_GROUPS_CHANGED, detail);
  }
  const WINDOW_ID = "desktop-mode-my-wordpress";
  const _initial = Object.freeze({
    userId: null,
    userName: "",
    requestedAt: 0
  });
  function getDesktop() {
    return window.wp?.desktop;
  }
  let _store = null;
  function getStore() {
    if (_store) {
      return _store;
    }
    const factory2 = getDesktop()?.createSharedStore;
    if (typeof factory2 !== "function") {
      return null;
    }
    _store = factory2(
      "desktop-mode/my-wordpress/footprint-target",
      () => ({ ..._initial })
    );
    return _store;
  }
  function setFootprintTarget(userId, userName = "") {
    const store2 = getStore();
    if (store2) {
      store2.state.userId = userId;
      store2.state.userName = userName;
      store2.state.requestedAt = Date.now();
      store2.notify();
      return;
    }
    window._wpdFootprintTarget = {
      userId,
      userName,
      requestedAt: Date.now()
    };
  }
  function openUserFootprintWindow(args) {
    const userId = Number(args.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return;
    }
    setFootprintTarget(userId, args.userName ?? "");
    getDesktop()?.openWindow?.(WINDOW_ID, {
      source: "my-wordpress/open-user-footprint"
    });
  }
  const INITIAL_ORIGIN$1 = window.location.origin;
  const adminLinkDepsStore = createSharedStore(
    "desktop-mode/admin-link-deps",
    () => ({ deps: null })
  );
  function handleWindowMessage(win, event) {
    if (event.origin !== INITIAL_ORIGIN$1) {
      return;
    }
    if (!win.iframe || event.source !== win.iframe.contentWindow) {
      return;
    }
    const data = event.data;
    if (!data || typeof data.type !== "string") {
      return;
    }
    if (data.type === "desktop-mode-title-change" && typeof data.title === "string") {
      win.setTitle(data.title);
    }
    if (data.type === "desktop-mode-content-identity") {
      setWindowContent(win.id, data.identity ?? null, {
        source: "bridge"
      });
    }
    if (data.type === "desktop-mode-window-publish" && typeof data.channel === "string" && data.channel !== "") {
      dispatchFromWindow(win.id, data.channel, data.payload);
    }
    if (typeof data.type === "string" && data.type.startsWith("desktop-mode-bridge-")) {
      const bridge = window.__desktopModeConnectionBridge;
      bridge?.routeIncomingFromIframe(data, win.id);
    }
    if (data.type === "desktop-mode-ready") {
      win._iframeBridgeReady = true;
      markWindowContentReady(win.id);
      doAction(HOOKS.IFRAME_READY, { windowId: win.id });
    }
    if (data.type === "desktop-mode-bridge-beforeunload-response") {
      if (win._isDestroyed) {
        return;
      }
      win._closePending = false;
      if (win._iframeCloseTimeout) {
        clearTimeout(win._iframeCloseTimeout);
        win._iframeCloseTimeout = null;
      }
      if (data.prevent) {
        Promise.resolve().then(() => wpdConfirmDialog).then(
          ({ wpdConfirm: wpdConfirm2 }) => wpdConfirm2({
            title: typeof data.message === "string" && data.message ? data.message : __("Unsaved changes"),
            message: __("You have unsaved changes. Are you sure you want to close this window?"),
            confirmLabel: __("Close window"),
            danger: true
          })
        ).then((confirmed) => {
          if (confirmed) {
            win.destroy();
          }
        }).catch(() => {
          win.destroy();
        });
      } else {
        win.destroy();
      }
    }
    if (data.type === "desktop-mode-navigate" && typeof data.url === "string" && data.url !== "") {
      handleDesktopNavigate(
        win,
        data.url,
        data.target === "new" ? "new" : "self"
      );
    }
    if (data.type === "desktop-mode-iframe-admin-link" && typeof data.url === "string" && data.url !== "") {
      const deps = adminLinkDepsStore.state.deps;
      if (tryNativeUrlRemap(data.url)) {
        win.close();
      } else if (deps) {
        const linkLabel = typeof data.label === "string" ? data.label : "";
        handleCrossPageAdminLink(win, data.url, linkLabel, deps);
      }
    }
    if (data.type === "desktop-mode-open-user-footprint" && typeof data.userId === "number" && data.userId > 0) {
      openUserFootprintWindow({
        userId: data.userId,
        userName: typeof data.userName === "string" ? data.userName : ""
      });
    }
    if (data.type === "desktop-mode-notification" && typeof data.title === "string" && data.title !== "") {
      handleDesktopNotification(
        data.title,
        typeof data.body === "string" ? data.body : ""
      );
    }
    if (data.type === "desktop-mode-focus-request") {
      if (!win.element.classList.contains("desktop-mode-window--overview")) {
        win.onFocusRequest?.(win);
      }
    }
    if (data.type === "desktop-mode-screen-meta" && Array.isArray(data.panels)) {
      addScreenMetaButtons(win, data.panels);
    }
    if (data.type === "desktop-mode-screen-meta-state") {
      setActiveScreenMetaPanel(
        win,
        typeof data.open === "string" ? data.open : null
      );
    }
    if (data.type === "desktop-mode-external-link" && typeof data.url === "string" && data.url !== "") {
      const label = typeof data.label === "string" && data.label !== "" ? data.label : data.url;
      addExternalTab(win, data.url, label);
    }
    if (data.type === "desktop-mode-iframe-error") {
      doAction(HOOKS.IFRAME_ERROR, {
        windowId: win.id,
        kind: data.kind === "unhandledrejection" ? "unhandledrejection" : "error",
        message: typeof data.message === "string" ? data.message : "",
        filename: typeof data.filename === "string" ? data.filename : null,
        lineno: typeof data.lineno === "number" ? data.lineno : null,
        colno: typeof data.colno === "number" ? data.colno : null,
        stack: typeof data.stack === "string" ? data.stack : null
      });
    }
    if (data.type === "desktop-mode-chrome-theme" && data.tokens && typeof data.tokens === "object") {
      try {
        win.setAppearanceTheme(
          data.tokens
        );
      } catch (err) {
        doAction(HOOKS.SHELL_ERROR, {
          scope: "window-bridge-chrome-theme",
          windowId: win.id,
          error: err
        });
      }
    }
    if (data.type === "desktop-mode-chrome-controls" && data.config && typeof data.config === "object") {
      try {
        win.setAppearanceControls(
          data.config
        );
      } catch (err) {
        doAction(HOOKS.SHELL_ERROR, {
          scope: "window-bridge-chrome-controls",
          windowId: win.id,
          error: err
        });
      }
    }
    if (data.type === "desktop-mode-chrome-slot" && typeof data.slot === "string" && typeof data.html === "string") {
      try {
        win.setAppearanceSlot(
          data.slot,
          { html: data.html }
        );
      } catch (err) {
        doAction(HOOKS.SHELL_ERROR, {
          scope: "window-bridge-chrome-slot",
          windowId: win.id,
          error: err
        });
      }
    }
    if (data.type === "desktop-mode-iframe-network") {
      const networkPayload = {
        windowId: win.id,
        method: typeof data.method === "string" ? data.method : "GET",
        url: typeof data.url === "string" ? data.url : "",
        status: typeof data.status === "number" ? data.status : 0,
        duration: typeof data.duration === "number" ? data.duration : 0,
        failed: !!data.failed
      };
      if (data.requestHeaders && typeof data.requestHeaders === "object") {
        networkPayload.requestHeaders = data.requestHeaders;
      }
      if (data.responseHeaders && typeof data.responseHeaders === "object") {
        networkPayload.responseHeaders = data.responseHeaders;
      }
      doAction(HOOKS.IFRAME_NETWORK_COMPLETED, networkPayload);
    }
  }
  function handleDesktopNavigate(win, rawUrl, target) {
    let url;
    try {
      url = new URL(rawUrl, INITIAL_ORIGIN$1);
    } catch {
      return;
    }
    if (url.origin !== INITIAL_ORIGIN$1) {
      return;
    }
    if (target === "new") {
      window.open(url.toString(), "_blank", "noopener,noreferrer");
      return;
    }
    if (win.iframe) {
      win.iframe.src = url.toString();
    }
  }
  const DESTRUCTIVE_ADMIN_ACTIONS = /* @__PURE__ */ new Set([
    // wp-admin/post.php
    "trash",
    "untrash",
    "delete",
    // wp-admin/comment.php
    "spam",
    "unspam",
    "spamcomment",
    "unspamcomment",
    "trashcomment",
    "untrashcomment",
    "deletecomment",
    "approvecomment",
    "unapprovecomment"
  ]);
  function isDestructiveActionUrl(url) {
    const action = url.searchParams.get("action");
    if (action && DESTRUCTIVE_ADMIN_ACTIONS.has(action)) {
      if (url.searchParams.has("_wpnonce") || url.searchParams.has("_wp_nonce")) {
        return true;
      }
    }
    return matchDestructiveAdminAction(url.toString(), url) !== null;
  }
  function stampSourceReferer(url, win) {
    if (url.searchParams.has("_wp_http_referer")) {
      return url;
    }
    let sourceHref = "";
    try {
      sourceHref = win.iframe?.contentWindow?.location.href ?? "";
    } catch {
    }
    if (!sourceHref) {
      sourceHref = win.config.url || "";
    }
    if (!sourceHref) {
      return url;
    }
    try {
      const sourceUrl = new URL(sourceHref, INITIAL_ORIGIN$1);
      if (sourceUrl.origin !== INITIAL_ORIGIN$1) {
        return url;
      }
      const out = new URL(url.href);
      const cleaned = new URL(sourceUrl.href);
      cleaned.searchParams.delete("desktop_mode_chromeless");
      out.searchParams.set(
        "_wp_http_referer",
        cleaned.pathname + (cleaned.search ? cleaned.search : "")
      );
      return out;
    } catch {
      return url;
    }
  }
  function handleCrossPageAdminLink(win, rawUrl, linkLabel, deps) {
    let url;
    try {
      url = new URL(rawUrl, deps.adminUrl);
    } catch {
      return;
    }
    if (url.origin !== INITIAL_ORIGIN$1) {
      return;
    }
    const absolute = url.toString();
    const targetSlug = deps.deriveSlug(absolute);
    const sourceSlug = win.config.baseId || win.id;
    if (targetSlug !== sourceSlug && isDestructiveActionUrl(url)) {
      const trashUrl = stampSourceReferer(url, win);
      const inner = win.iframe?.contentWindow;
      if (inner) {
        try {
          inner.location.assign(trashUrl.href);
        } catch {
          if (win.iframe) {
            win.iframe.src = trashUrl.href;
          }
        }
      }
      return;
    }
    if (targetSlug === sourceSlug) {
      const inner = win.iframe?.contentWindow;
      if (inner) {
        try {
          inner.location.assign(absolute);
        } catch {
          if (win.iframe) {
            win.iframe.src = absolute;
          }
        }
      }
      return;
    }
    const entry = deps.findDockEntry(absolute);
    const trimmedLabel = linkLabel.trim();
    const title = entry?.title || (trimmedLabel !== "" ? trimmedLabel : targetSlug);
    const urlWithReferer = stampSourceReferer(url, win);
    deps.openWindow({
      id: targetSlug,
      baseId: targetSlug,
      url: urlWithReferer.toString(),
      parentUrl: entry?.url ?? absolute,
      title,
      icon: entry?.icon ?? "dashicons-admin-generic",
      submenu: entry?.submenu,
      multi: entry?.multi
    });
  }
  function handleDesktopNotification(title, body) {
    const message = body !== "" ? `${title} — ${body}` : title;
    showToast({ message });
  }
  function addScreenMetaButtons(win, panels) {
    const container = win.element.querySelector(".desktop-mode-window__screen-meta");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const panelConfig = {
      "screen-options": { icon: "dashicons-admin-generic", label: "Screen Options" },
      help: { icon: "dashicons-editor-help", label: "Help" }
    };
    for (const panel of panels) {
      const cfg = panelConfig[panel];
      if (!cfg) {
        continue;
      }
      const btn = document.createElement("button");
      btn.className = "desktop-mode-window__meta-btn";
      btn.setAttribute("type", "button");
      btn.setAttribute("aria-label", cfg.label);
      btn.setAttribute("aria-pressed", "false");
      btn.dataset.panel = panel;
      btn.innerHTML = `<span class="dashicons ${cfg.icon}" aria-hidden="true"></span>`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        win.iframe?.contentWindow?.postMessage(
          { type: "desktop-mode-toggle-panel", panel },
          INITIAL_ORIGIN$1
        );
      });
      container.appendChild(btn);
    }
  }
  function setActiveScreenMetaPanel(win, panel) {
    const container = win.element.querySelector(".desktop-mode-window__screen-meta");
    if (!container) {
      return;
    }
    container.querySelectorAll(".desktop-mode-window__meta-btn").forEach((btn) => {
      const isActive = btn.dataset.panel === panel;
      btn.classList.toggle("desktop-mode-window__meta-btn--active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
  const store$4 = createSharedStore(
    "desktop-mode/title-bar-buttons-registry",
    () => ({ registry: /* @__PURE__ */ new Map(), listeners: /* @__PURE__ */ new Set() })
  );
  const registry$4 = store$4.state.registry;
  const listeners$4 = store$4.state.listeners;
  function listTitleBarButtons() {
    return Array.from(registry$4.values()).sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100)
    );
  }
  function buttonsForWindow(win) {
    const left = [];
    const right = [];
    for (const def of listTitleBarButtons()) {
      try {
        if (!def.match(win)) {
          continue;
        }
      } catch {
        continue;
      }
      if (def.placement === "right") {
        right.push(def);
      } else {
        left.push(def);
      }
    }
    return { left, right };
  }
  function subscribeTitleBarButtons(cb) {
    listeners$4.add(cb);
    return () => {
      listeners$4.delete(cb);
    };
  }
  const DASHICON_PATTERN = /^dashicons-[a-z0-9-]+$/i;
  const INLINE_SVG_PATTERN = /^\s*<svg[\s>]/i;
  function paintTitleBarButtonIcon(host, icon) {
    if (!icon) {
      return;
    }
    if (DASHICON_PATTERN.test(icon)) {
      const span = document.createElement("span");
      span.className = `dashicons ${icon}`;
      span.setAttribute("aria-hidden", "true");
      host.appendChild(span);
      return;
    }
    if (INLINE_SVG_PATTERN.test(icon)) {
      const wrapper = document.createElement("span");
      wrapper.setAttribute("aria-hidden", "true");
      wrapper.innerHTML = icon;
      host.appendChild(wrapper);
      return;
    }
    host.setAttribute("icon", icon);
  }
  const store$3 = createSharedStore(
    "desktop-mode/window-themes-registry",
    () => ({ registry: /* @__PURE__ */ new Map(), listeners: /* @__PURE__ */ new Set() })
  );
  const registry$3 = store$3.state.registry;
  const listeners$3 = store$3.state.listeners;
  function listWindowThemes() {
    return Array.from(registry$3.values()).sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
    );
  }
  function resolveWindowTheme(win) {
    let winner = null;
    for (const def of listWindowThemes()) {
      try {
        if (!def.match(win)) {
          continue;
        }
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn(
            `[desktop-mode] window-theme "${def.id}" match() threw — skipping`,
            err
          );
        }
        continue;
      }
      winner = def;
    }
    return winner;
  }
  function subscribeWindowThemes(cb) {
    listeners$3.add(cb);
    return () => {
      listeners$3.delete(cb);
    };
  }
  const applied = /* @__PURE__ */ new WeakMap();
  function resolveActiveTheme(win, override) {
    let themeId = null;
    let tokens = {};
    if (override && "tokens" in override && override.tokens) {
      themeId = null;
      tokens = { ...override.tokens };
    } else if (override && "themeId" in override && override.themeId) {
      const list = resolveByThemeId(override.themeId);
      if (list) {
        themeId = list.id;
        tokens = { ...list.tokens };
      }
    } else {
      const winner = resolveWindowTheme(win);
      if (winner) {
        themeId = winner.id;
        tokens = { ...winner.tokens };
      }
    }
    const filtered = applyFilters(
      HOOKS.WINDOW_CHROME_THEME,
      tokens,
      { windowId: win.id, themeId, config: win.config }
    );
    return { themeId, tokens: filtered };
  }
  function applyWindowTheme(win, override) {
    const element = win.element;
    if (!element) {
      return;
    }
    const previous = applied.get(element);
    const { themeId, tokens } = resolveActiveTheme(win, override);
    if (previous) {
      for (const key of previous.keys) {
        if (!(key in tokens)) {
          try {
            element.style.removeProperty(key);
          } catch {
          }
        }
      }
    }
    const keys = /* @__PURE__ */ new Set();
    for (const [key, value] of Object.entries(tokens)) {
      try {
        element.style.setProperty(key, value);
        keys.add(key);
      } catch (err) {
        doAction(HOOKS.SHELL_ERROR, {
          scope: "window-theme-apply",
          windowId: win.id,
          key,
          error: err
        });
      }
    }
    applied.set(element, { themeId, keys });
    doAction(HOOKS.WINDOW_CHROME_THEME_CHANGED, {
      windowId: win.id,
      themeId,
      tokens
    });
  }
  function clearWindowTheme(win) {
    const element = win.element;
    if (!element) {
      return;
    }
    const previous = applied.get(element);
    if (!previous) {
      return;
    }
    for (const key of previous.keys) {
      try {
        element.style.removeProperty(key);
      } catch {
      }
    }
    applied.delete(element);
  }
  function resolveByThemeId(id) {
    for (const def of listWindowThemes()) {
      if (def.id === id) {
        return { id: def.id, tokens: def.tokens };
      }
    }
    return null;
  }
  const store$2 = createSharedStore(
    "desktop-mode/window-controls-registry",
    () => ({ registry: /* @__PURE__ */ new Map(), listeners: /* @__PURE__ */ new Set() })
  );
  const registry$2 = store$2.state.registry;
  const listeners$2 = store$2.state.listeners;
  function listWindowControls() {
    return Array.from(registry$2.values()).sort((a, b) => {
      const oa = a.order ?? 100;
      const ob = b.order ?? 100;
      if (oa !== ob) {
        return oa - ob;
      }
      return a.id.localeCompare(b.id);
    });
  }
  function controlsForWindow(win) {
    const left = [];
    const right = [];
    const controls = [];
    for (const def of listWindowControls()) {
      try {
        if (!def.match(win)) {
          continue;
        }
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn(
            `[desktop-mode] window-control "${def.id}" match() threw — skipping`,
            err
          );
        }
        continue;
      }
      const placement = def.placement ?? "left";
      if (placement === "right") {
        right.push(def);
      } else if (placement === "controls") {
        controls.push(def);
      } else {
        left.push(def);
      }
    }
    return { left, right, controls };
  }
  function subscribeWindowControls(cb) {
    listeners$2.add(cb);
    return () => {
      listeners$2.delete(cb);
    };
  }
  function resolveWindowControls(win, override) {
    const buckets = controlsForWindow(win);
    const hide = new Set(override?.hide ?? []);
    let left = buckets.left.filter((c) => !hide.has(c.id));
    let right = buckets.right.filter((c) => !hide.has(c.id));
    let controls = buckets.controls.filter((c) => !hide.has(c.id));
    if (override?.custom) {
      for (const def of override.custom) {
        if (hide.has(def.id)) {
          continue;
        }
        const adapted = {
          id: def.id,
          label: def.label,
          icon: def.icon,
          placement: def.placement ?? "controls",
          order: def.order ?? 100,
          match: () => true,
          onClick: def.onClick ? (_, ev) => def.onClick(ev) : void 0,
          render: def.render ? (host) => def.render(host) : void 0
        };
        if (adapted.placement === "left") {
          left.push(adapted);
        } else if (adapted.placement === "right") {
          right.push(adapted);
        } else {
          controls.push(adapted);
        }
      }
      left = sortByOrder(left);
      right = sortByOrder(right);
      controls = sortByOrder(controls);
    }
    if (override?.order && override.order.length > 0) {
      controls = applyExplicitOrder(controls, override.order);
    }
    const placement = override?.placement ?? "right";
    const ctx = { windowId: win.id, config: win.config };
    left = applyFilters(
      HOOKS.WINDOW_CHROME_CONTROLS,
      left,
      { ...ctx, placement: "left" }
    );
    right = applyFilters(
      HOOKS.WINDOW_CHROME_CONTROLS,
      right,
      { ...ctx, placement: "right" }
    );
    controls = applyFilters(
      HOOKS.WINDOW_CHROME_CONTROLS,
      controls,
      { ...ctx, placement: "controls" }
    );
    return { left, right, controls, placement };
  }
  function sortByOrder(list) {
    return [...list].sort((a, b) => {
      const oa = a.order ?? 100;
      const ob = b.order ?? 100;
      if (oa !== ob) {
        return oa - ob;
      }
      return a.id.localeCompare(b.id);
    });
  }
  function applyExplicitOrder(list, order) {
    const byId = /* @__PURE__ */ new Map();
    for (const def of list) {
      byId.set(def.id, def);
    }
    const out = [];
    const used = /* @__PURE__ */ new Set();
    for (const id of order) {
      const def = byId.get(id);
      if (def && !used.has(id)) {
        out.push(def);
        used.add(id);
      }
    }
    for (const def of list) {
      if (!used.has(def.id)) {
        out.push(def);
      }
    }
    return out;
  }
  function buildControlElement(def, win) {
    const host = document.createElement("wpd-window-button");
    host.setAttribute("aria-label", def.label);
    host.classList.add("desktop-mode-window__btn");
    const variant = legacyVariantFor(def.id);
    host.classList.add(`desktop-mode-window__btn--${variant}`);
    if (def.id === "core/close") {
      host.setAttribute("danger", "");
    }
    if (typeof def.render === "function") {
      try {
        def.render(host, win);
      } catch (err) {
        doAction(HOOKS.SHELL_ERROR, {
          scope: "window-control-render",
          id: def.id,
          windowId: win.id,
          error: err
        });
        return { element: host };
      }
    } else {
      paintTitleBarButtonIcon(host, def.icon ?? "");
      if (typeof def.onClick === "function") {
        const handler = (ev) => {
          ev.stopPropagation();
          try {
            def.onClick(win, ev);
          } catch (err) {
            doAction(HOOKS.SHELL_ERROR, {
              scope: "window-control-onclick",
              id: def.id,
              windowId: win.id,
              error: err
            });
          }
        };
        host.addEventListener("wpd-button-activate", handler);
        return {
          element: host,
          teardown: () => {
            host.removeEventListener("wpd-button-activate", handler);
          }
        };
      }
    }
    return { element: host };
  }
  function legacyVariantFor(id) {
    if (id.startsWith("core/")) {
      return id.slice("core/".length);
    }
    return id.replace(/\//g, "-");
  }
  function paintWindowControls(win, controlsHost) {
    const teardowns = [];
    while (controlsHost.firstChild) {
      controlsHost.removeChild(controlsHost.firstChild);
    }
    const resolved = resolveWindowControls(
      win,
      win.config.appearance?.controls
    );
    controlsHost.classList.toggle(
      "desktop-mode-window__controls--left",
      resolved.placement === "left"
    );
    for (const def of resolved.controls) {
      const { element, teardown } = buildControlElement(def, win);
      controlsHost.appendChild(element);
      if (teardown) {
        teardowns.push(teardown);
      }
    }
    doAction(HOOKS.WINDOW_CHROME_APPLIED, {
      windowId: win.id,
      layer: "controls"
    });
    return () => {
      for (const fn of teardowns) {
        try {
          fn();
        } catch {
        }
      }
    };
  }
  const store$1 = createSharedStore(
    "desktop-mode/window-slots-registry",
    () => ({ registry: /* @__PURE__ */ new Map(), listeners: /* @__PURE__ */ new Set() })
  );
  const registry$1 = store$1.state.registry;
  const listeners$1 = store$1.state.listeners;
  function listWindowSlots() {
    return Array.from(registry$1.values()).sort((a, b) => {
      const oa = a.order ?? 100;
      const ob = b.order ?? 100;
      if (oa !== ob) {
        return oa - ob;
      }
      return a.id.localeCompare(b.id);
    });
  }
  function slotsForWindow(win, slot) {
    const out = [];
    for (const def of listWindowSlots()) {
      if (def.slot !== slot) {
        continue;
      }
      try {
        if (!def.match(win)) {
          continue;
        }
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn(
            `[desktop-mode] window-slot "${def.id}" match() threw — skipping`,
            err
          );
        }
        continue;
      }
      out.push(def);
    }
    return out;
  }
  function subscribeWindowSlots(cb) {
    listeners$1.add(cb);
    return () => {
      listeners$1.delete(cb);
    };
  }
  const SLOT_NAMES = [
    "before-titlebar",
    "before-icon",
    "icon",
    "title",
    "after-title",
    "before-controls",
    "after-controls",
    "after-titlebar"
  ];
  const defaultsCache = /* @__PURE__ */ new WeakMap();
  function getSlotHost(root, name) {
    return root.querySelector(
      `[data-slot="${name}"]`
    );
  }
  function captureDefaults(root) {
    const map = /* @__PURE__ */ new Map();
    for (const name of SLOT_NAMES) {
      const host = getSlotHost(root, name);
      if (!host) {
        continue;
      }
      map.set(name, Array.from(host.childNodes).map((n) => n.cloneNode(true)));
    }
    return map;
  }
  function clearHost(host) {
    while (host.firstChild) {
      host.removeChild(host.firstChild);
    }
  }
  function restoreDefault(host, defaults) {
    clearHost(host);
    for (const node of defaults) {
      host.appendChild(node.cloneNode(true));
    }
  }
  function paintWindowSlots(win) {
    const teardowns = [];
    const root = win.element;
    if (!root) {
      return () => {
      };
    }
    let defaults = defaultsCache.get(root);
    if (!defaults) {
      defaults = captureDefaults(root);
      defaultsCache.set(root, defaults);
    }
    const overrides = win.config.appearance?.slots ?? {};
    for (const name of SLOT_NAMES) {
      const host = getSlotHost(root, name);
      if (!host) {
        continue;
      }
      const slotDefaults = defaults.get(name) ?? [];
      const override = overrides[name];
      const matchingRegistry = slotsForWindow(win, name);
      if (override === null) {
        clearHost(host);
      } else if (override && "html" in override) {
        clearHost(host);
        host.textContent = override.html;
      } else if (override && "render" in override) {
        const replace = override.replace !== false;
        if (replace) {
          clearHost(host);
        }
        try {
          const teardown = override.render(host);
          if (typeof teardown === "function") {
            teardowns.push(teardown);
          }
        } catch (err) {
          doAction(HOOKS.SHELL_ERROR, {
            scope: "window-slot-inline-render",
            windowId: win.id,
            slot: name,
            error: err
          });
        }
      } else {
        restoreDefault(host, slotDefaults);
      }
      if (override !== null) {
        let firstReplaceFired = false;
        for (const def of matchingRegistry) {
          const replace = def.replace !== false;
          if (replace && !firstReplaceFired) {
            clearHost(host);
            firstReplaceFired = true;
          }
          try {
            const teardown = def.render(host, { window: win, slot: name });
            if (typeof teardown === "function") {
              teardowns.push(teardown);
            }
          } catch (err) {
            doAction(HOOKS.SHELL_ERROR, {
              scope: "window-slot-registry-render",
              windowId: win.id,
              slot: name,
              id: def.id,
              error: err
            });
          }
        }
      }
      applyFilters(
        HOOKS.WINDOW_CHROME_SLOT,
        host,
        { windowId: win.id, slot: name, config: win.config }
      );
    }
    doAction(HOOKS.WINDOW_CHROME_APPLIED, {
      windowId: win.id,
      layer: "slots"
    });
    return () => {
      for (const fn of teardowns) {
        try {
          fn();
        } catch {
        }
      }
    };
  }
  const store = createSharedStore(
    "desktop-mode/window-chrome-registry",
    () => ({ registry: /* @__PURE__ */ new Map(), listeners: /* @__PURE__ */ new Set() })
  );
  const registry = store.state.registry;
  const listeners = store.state.listeners;
  function getWindowChrome(id) {
    return registry.get(id.toLowerCase()) ?? null;
  }
  function subscribeWindowChromes(cb) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }
  const STANDARD_CHROME_ID = "core/standard";
  const CUSTOM_CHROME_CLASS = "desktop-mode-window--custom-chrome";
  function resolveChromeId(win) {
    const inline = win.config.appearance?.chrome ?? STANDARD_CHROME_ID;
    const id = applyFilters(
      HOOKS.WINDOW_CHROME_RENDER,
      inline,
      { windowId: win.id, config: win.config }
    );
    return id;
  }
  function captureChromeState(win) {
    return {
      title: win.config.title,
      icon: win.config.icon,
      focused: win.element.classList.contains("desktop-mode-window--focused"),
      state: win.state
    };
  }
  function mountWindowChrome(win) {
    const id = resolveChromeId(win);
    if (id === STANDARD_CHROME_ID) {
      return null;
    }
    const def = getWindowChrome(id);
    if (!def) {
      return null;
    }
    try {
      if (def.match && !def.match(win)) {
        return null;
      }
    } catch {
      return null;
    }
    win.element.classList.add(CUSTOM_CHROME_CLASS);
    let handle;
    try {
      handle = def.render(win.element, {
        window: win,
        state: captureChromeState(win)
      });
    } catch (err) {
      win.element.classList.remove(CUSTOM_CHROME_CLASS);
      doAction(HOOKS.SHELL_ERROR, {
        scope: "window-chrome-render",
        windowId: win.id,
        chromeId: id,
        error: err
      });
      return null;
    }
    doAction(HOOKS.WINDOW_CHROME_APPLIED, {
      windowId: win.id,
      layer: "chrome",
      chromeId: id
    });
    return { id, handle };
  }
  function toggleActionsMenu(win) {
    const panel = win.element.querySelector(
      ".desktop-mode-window__menu-panel"
    );
    if (!panel) {
      return;
    }
    if (panel.hidden) {
      openActionsMenu(win);
    } else {
      closeActionsMenu(win);
    }
  }
  function openActionsMenu(win) {
    const panel = win.element.querySelector(
      ".desktop-mode-window__menu-panel"
    );
    const btn = win.element.querySelector(
      ".desktop-mode-window__menu-btn"
    );
    if (!panel || !btn) {
      return;
    }
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    const startup = panel.querySelector(
      ".desktop-mode-window__menu-item--startup"
    );
    if (startup) {
      refreshStartupCheckState(win, startup);
    }
    if (!win._boundOnDocumentPointerDown) {
      win._boundOnDocumentPointerDown = (e) => {
        const target = e.target;
        if (!target) {
          return;
        }
        if (panel.contains(target) || btn.contains(target)) {
          return;
        }
        closeActionsMenu(win);
      };
    }
    setTimeout(() => {
      if (win._boundOnDocumentPointerDown) {
        document.addEventListener(
          "pointerdown",
          win._boundOnDocumentPointerDown,
          true
        );
      }
    }, 0);
    const firstItem = panel.querySelector('[role="menuitem"]');
    firstItem?.focus();
  }
  function closeActionsMenu(win) {
    const panel = win.element.querySelector(
      ".desktop-mode-window__menu-panel"
    );
    const btn = win.element.querySelector(
      ".desktop-mode-window__menu-btn"
    );
    if (panel) {
      panel.hidden = true;
    }
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
    }
    if (win._boundOnDocumentPointerDown) {
      document.removeEventListener(
        "pointerdown",
        win._boundOnDocumentPointerDown,
        true
      );
    }
  }
  function flipStartupCheckOptimistically(item) {
    const isChecked = item.hasAttribute("checked");
    if (isChecked) {
      item.removeAttribute("checked");
    } else {
      item.setAttribute("checked", "");
    }
  }
  function refreshStartupCheckState(win, item) {
    const pref = window.wp?.desktop?.config?.defaultWindow;
    let isDefault = false;
    if (pref && pref.enabled && typeof pref.url === "string") {
      if (win.config.native) {
        isDefault = pref.url === `native:${win.id}`;
      } else {
        try {
          const currentKey = urlMatchKey(win.getCurrentUrl());
          const prefKey = urlMatchKey(pref.url);
          isDefault = currentKey === prefKey;
        } catch {
          isDefault = false;
        }
      }
    }
    if (isDefault) {
      item.setAttribute("checked", "");
    } else {
      item.removeAttribute("checked");
    }
  }
  function makeBoundsEmitter(win, phase) {
    let pending = false;
    return () => {
      if (pending) {
        return;
      }
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (phase === "drag" && !win._isDragging) {
          return;
        }
        if (phase === "resize" && !win._isResizing) {
          return;
        }
        if (win._isDestroyed || !win.element.isConnected) {
          return;
        }
        try {
          doAction(HOOKS.WINDOW_BOUNDS_CHANGED, {
            windowId: win.id,
            x: win.element.offsetLeft,
            y: win.element.offsetTop,
            width: win.element.offsetWidth,
            height: win.element.offsetHeight,
            state: win.state,
            phase
          });
        } catch {
        }
      });
    };
  }
  function handleDragStart(win, e) {
    const target = e.target;
    if (target.closest(".desktop-mode-window__btn") || target.closest(".desktop-mode-window__custom-buttons") || target.closest(".desktop-mode-window__controls") || target.closest(".desktop-mode-window__screen-meta") || target.closest(".desktop-mode-window__menu-btn") || target.closest(".desktop-mode-window__menu-panel")) {
      return;
    }
    const isMaximized = win.state === "maximized";
    const isSnapped = win.state === "snapped-left" || win.state === "snapped-right";
    const needsUnstate = isMaximized || isSnapped;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const pointerId = e.pointerId;
    const unstateParams = needsUnstate ? captureUnstateParams(win, e) : null;
    win._titleBar.setPointerCapture(pointerId);
    const snap = win.snapConfigProvider?.() ?? { enabled: false, cellWidth: 0, cellHeight: 0 };
    const emitBoundsChanged = makeBoundsEmitter(win, "drag");
    let started = false;
    const beginDrag = (cursorX, cursorY) => {
      if (started) {
        return;
      }
      started = true;
      let newLeft;
      let newTop;
      if (unstateParams) {
        const placed = commitUnstate(win, unstateParams, cursorX, cursorY);
        newLeft = placed.left;
        newTop = placed.top;
      } else {
        newLeft = win.element.offsetLeft;
        newTop = win.element.offsetTop;
      }
      win.element.classList.add("desktop-mode-window--dragging");
      if (snap.enabled) {
        win.element.classList.add("desktop-mode-window--snap-drag");
      }
      win._isDragging = true;
      win._dragOffsetX = cursorX - newLeft;
      win._dragOffsetY = cursorY - newTop;
      doAction(HOOKS.WINDOW_DRAG_START, { windowId: win.id });
    };
    if (!needsUnstate) {
      beginDrag(startClientX, startClientY);
    }
    const onDragMove = (ev) => {
      if (!started) {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_SQUARED) {
          return;
        }
        beginDrag(ev.clientX, ev.clientY);
      }
      if (!win._isDragging) {
        return;
      }
      let x = ev.clientX - win._dragOffsetX;
      let y = ev.clientY - win._dragOffsetY;
      const desktop = win.element.parentElement;
      if (desktop) {
        x = Math.max(EDGE_MARGIN, Math.min(x, desktop.clientWidth - EDGE_MARGIN));
        y = Math.max(EDGE_MARGIN, Math.min(y, desktop.clientHeight - EDGE_MARGIN));
      }
      if (snap.enabled) {
        x = Math.round(x / snap.cellWidth) * snap.cellWidth;
        y = Math.round(y / snap.cellHeight) * snap.cellHeight;
      }
      win.element.style.left = `${x}px`;
      win.element.style.top = `${y}px`;
      win.onDragMove?.(win, ev.clientX, ev.clientY);
      emitBoundsChanged();
    };
    const releaseCapture = () => {
      try {
        win._titleBar.releasePointerCapture(pointerId);
      } catch {
      }
    };
    const detachListeners = () => {
      win._titleBar.removeEventListener("pointermove", onDragMove);
      win._titleBar.removeEventListener("pointerup", onDragEnd);
      win._titleBar.removeEventListener("pointercancel", onDragEnd);
      win._titleBar.removeEventListener("lostpointercapture", onDragEnd);
    };
    const onDragEnd = () => {
      if (!started) {
        releaseCapture();
        detachListeners();
        return;
      }
      if (!win._isDragging) {
        return;
      }
      win._isDragging = false;
      win.element.classList.remove("desktop-mode-window--dragging");
      win.element.classList.remove("desktop-mode-window--snap-drag");
      releaseCapture();
      detachListeners();
      const consumed = win.onDragEnd?.(win) ?? false;
      if (consumed) {
        return;
      }
      win._emitChange("moved");
      const payload = {
        windowId: win.id,
        x: win.element.offsetLeft,
        y: win.element.offsetTop
      };
      doAction(HOOKS.WINDOW_DRAG_END, payload);
      doAction(HOOKS.WINDOW_MOVED, payload);
    };
    win._titleBar.addEventListener("pointermove", onDragMove);
    win._titleBar.addEventListener("pointerup", onDragEnd);
    win._titleBar.addEventListener("pointercancel", onDragEnd);
    win._titleBar.addEventListener("lostpointercapture", onDragEnd);
  }
  function captureUnstateParams(win, e) {
    const titleRect = win._titleBar.getBoundingClientRect();
    const cursorRatioX = titleRect.width > 0 ? (e.clientX - titleRect.left) / titleRect.width : 0.5;
    const parent = win.element.parentElement;
    const fallbackW = parent ? Math.min(960, Math.round(parent.clientWidth * 0.6)) : 640;
    const fallbackH = parent ? Math.min(640, Math.round(parent.clientHeight * 0.7)) : 480;
    const w = win._savedGeometry?.width ?? fallbackW;
    const h = win._savedGeometry?.height ?? fallbackH;
    const parentRect = parent?.getBoundingClientRect();
    return {
      isMaximized: win.state === "maximized",
      cursorRatioX,
      titleBarHeight: titleRect.height,
      // `clientX` / `clientY` are viewport-relative but
      // `style.left` / `.top` resolve against the window's
      // offsetParent (the desktop area). Subtract the area's own
      // viewport origin so the re-anchor math lands in the right
      // space — otherwise an admin bar above + a dock on the left
      // would shift the window below + right of the cursor.
      areaLeft: parentRect?.left ?? 0,
      areaTop: parentRect?.top ?? 0,
      targetW: w,
      targetH: h
    };
  }
  function commitUnstate(win, params, cursorX, cursorY) {
    win.element.classList.remove(
      "desktop-mode-window--maximized",
      "desktop-mode-window--snapped-left",
      "desktop-mode-window--snapped-right"
    );
    win.element.style.width = `${params.targetW}px`;
    win.element.style.height = `${params.targetH}px`;
    const left = Math.max(
      EDGE_MARGIN,
      Math.round(
        cursorX - params.areaLeft - params.targetW * params.cursorRatioX
      )
    );
    const top = Math.max(
      EDGE_MARGIN,
      Math.round(cursorY - params.areaTop - params.titleBarHeight / 2)
    );
    win.element.style.left = `${left}px`;
    win.element.style.top = `${top}px`;
    win.state = "normal";
    win._emitChange("state");
    if (params.isMaximized) {
      doAction(HOOKS.WINDOW_UNMAXIMIZED, { windowId: win.id });
    }
    return { left, top };
  }
  function handleResizeStart(win, e) {
    if (win.state === "maximized" || win.state === "fullscreen") {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const handle = e.target;
    const dir = handle.dataset.dir ?? "se";
    win._isResizing = true;
    win._resizeStartX = e.clientX;
    win._resizeStartY = e.clientY;
    win._resizeStartW = win.element.offsetWidth;
    win._resizeStartH = win.element.offsetHeight;
    const startLeft = win.element.offsetLeft;
    const startTop = win.element.offsetTop;
    handle.setPointerCapture(e.pointerId);
    win.element.classList.add("desktop-mode-window--resizing");
    doAction(HOOKS.WINDOW_RESIZE_START, { windowId: win.id });
    const emitBoundsChanged = makeBoundsEmitter(win, "resize");
    const snap = win.snapConfigProvider?.() ?? { enabled: false, cellWidth: 0, cellHeight: 0 };
    if (snap.enabled) {
      win.element.classList.add("desktop-mode-window--snap-drag");
    }
    if (win.state === "snapped-left" || win.state === "snapped-right") {
      win.element.classList.remove(
        "desktop-mode-window--snapped-left",
        "desktop-mode-window--snapped-right"
      );
      win.state = "normal";
    }
    const onResizeMove = (ev) => {
      if (!win._isResizing) {
        return;
      }
      const dx = ev.clientX - win._resizeStartX;
      const dy = ev.clientY - win._resizeStartY;
      const geom = computeResize(
        dir,
        dx,
        dy,
        startLeft,
        startTop,
        win._resizeStartW,
        win._resizeStartH,
        win.config.minWidth,
        win.config.minHeight,
        snap
      );
      win.element.style.left = `${geom.x}px`;
      win.element.style.top = `${geom.y}px`;
      win.element.style.width = `${geom.width}px`;
      win.element.style.height = `${geom.height}px`;
      emitBoundsChanged();
    };
    const onResizeEnd = () => {
      if (!win._isResizing) {
        return;
      }
      win._isResizing = false;
      win.element.classList.remove("desktop-mode-window--resizing");
      win.element.classList.remove("desktop-mode-window--snap-drag");
      handle.removeEventListener("pointermove", onResizeMove);
      handle.removeEventListener("pointerup", onResizeEnd);
      handle.removeEventListener("pointercancel", onResizeEnd);
      handle.removeEventListener("lostpointercapture", onResizeEnd);
      win._emitChange("resized");
      const payload = {
        windowId: win.id,
        width: win.element.offsetWidth,
        height: win.element.offsetHeight
      };
      doAction(HOOKS.WINDOW_RESIZE_END, payload);
      doAction(HOOKS.WINDOW_RESIZED, payload);
    };
    handle.addEventListener("pointermove", onResizeMove);
    handle.addEventListener("pointerup", onResizeEnd);
    handle.addEventListener("pointercancel", onResizeEnd);
    handle.addEventListener("lostpointercapture", onResizeEnd);
  }
  function computeResize(dir, dx, dy, startLeft, startTop, startW, startH, minWidth, minHeight, snap) {
    let width = startW;
    let height = startH;
    let x = startLeft;
    let y = startTop;
    if (dir === "ne" || dir === "se") {
      width = Math.max(minWidth, startW + dx);
    }
    if (dir === "nw" || dir === "sw") {
      const nextWidth = Math.max(minWidth, startW - dx);
      x = startLeft + (startW - nextWidth);
      width = nextWidth;
    }
    if (dir === "se" || dir === "sw") {
      height = Math.max(minHeight, startH + dy);
    }
    if (dir === "ne" || dir === "nw") {
      const nextHeight = Math.max(minHeight, startH - dy);
      y = startTop + (startH - nextHeight);
      height = nextHeight;
    }
    if (snap.enabled) {
      const nextWidth = Math.max(
        minWidth,
        Math.round(width / snap.cellWidth) * snap.cellWidth
      );
      const nextHeight = Math.max(
        minHeight,
        Math.round(height / snap.cellHeight) * snap.cellHeight
      );
      if (dir === "nw" || dir === "sw") {
        x = startLeft + (width - nextWidth);
      }
      if (dir === "nw" || dir === "ne") {
        y = startTop + (height - nextHeight);
      }
      width = nextWidth;
      height = nextHeight;
    }
    return { x, y, width, height };
  }
  const INITIAL_ORIGIN = window.location.origin;
  const _Window = class _Window {
    constructor(config) {
      this.state = "normal";
      this._activityCount = 0;
      this._activityPhase = "idle";
      this._activityError = null;
      this._activityClearTimer = null;
      this._activitySavingStartedAt = 0;
      this._activitySettleTimer = null;
      this._isDragging = false;
      this._isResizing = false;
      this._isDestroyed = false;
      this._dragOffsetX = 0;
      this._dragOffsetY = 0;
      this._resizeStartX = 0;
      this._resizeStartY = 0;
      this._resizeStartW = 0;
      this._resizeStartH = 0;
      this._savedGeometry = null;
      this._savedFullscreenState = null;
      this._stateBeforeMinimize = null;
      this._externalTabs = /* @__PURE__ */ new Map();
      this._externalTabSeq = 0;
      this._titleBarButtonsUnsubscribe = null;
      this._windowThemesUnsubscribe = null;
      this._windowControlsUnsubscribe = null;
      this._windowControlsTeardown = null;
      this._windowSlotsUnsubscribe = null;
      this._windowSlotsTeardown = null;
      this._chromeHandle = null;
      this._chromeId = STANDARD_CHROME_ID;
      this._windowChromesUnsubscribe = null;
      this._nativeRenderTeardown = null;
      this._nativeRenderCtxDispose = null;
      this._closeSafetyNetTimer = null;
      this._onCloseTransitionEnd = null;
      this._isFinalized = false;
      this._iframeBridgeReady = false;
      this._iframeCloseTimeout = null;
      this._closePending = false;
      this._activeTabId = "primary";
      this.onFocusRequest = null;
      this.onClose = null;
      this.onMinimize = null;
      this.onOpenAnother = null;
      this.onOpenInNewWindow = null;
      this.onToggleStartup = null;
      this.snapConfigProvider = null;
      this.onDragMove = null;
      this.onDragEnd = null;
      this._boundOnDocumentPointerDown = null;
      this._bodyResizeObserver = null;
      this._suppressCloseFilter = false;
      this.id = config.id;
      this.config = config;
      this.element = createWindowElement(config);
      this.iframe = config.native ? null : this.element.querySelector(".desktop-mode-window__iframe");
      this._titleBar = this.element.querySelector(".desktop-mode-window__titlebar");
      this._titleEl = this.element.querySelector(".desktop-mode-window__title");
      this._boundOnMessage = (e) => handleWindowMessage(this, e);
      this.bindEvents();
      this.renderCustomTitleBarButtons();
      this._titleBarButtonsUnsubscribe = subscribeTitleBarButtons(() => {
        this.renderCustomTitleBarButtons();
      });
      applyWindowTheme(this, this.config.appearance?.theme);
      this._windowThemesUnsubscribe = subscribeWindowThemes(() => {
        if (this._isDestroyed) {
          return;
        }
        applyWindowTheme(this, this.config.appearance?.theme);
      });
      this.repaintWindowControls();
      this._windowControlsUnsubscribe = subscribeWindowControls(() => {
        if (this._isDestroyed) {
          return;
        }
        this.repaintWindowControls();
      });
      this.repaintWindowSlots();
      this._windowSlotsUnsubscribe = subscribeWindowSlots(() => {
        if (this._isDestroyed) {
          return;
        }
        this.repaintWindowSlots();
      });
      this.remountWindowChrome();
      this._windowChromesUnsubscribe = subscribeWindowChromes(() => {
        if (this._isDestroyed) {
          return;
        }
        const next = resolveChromeId(this);
        if (next !== this._chromeId) {
          this.remountWindowChrome();
        }
      });
      this._bodyResizeObserver = this.installBodyResizeObserver();
      if (config.initialState === "minimized") {
        this.state = "minimized";
        this.element.classList.add("desktop-mode-window--minimized");
        if (this.iframe) {
          this.iframe.style.visibility = "hidden";
        }
        return;
      }
      if (config.initialState === "snapped-left" || config.initialState === "snapped-right") {
        this.element.classList.add(
          `desktop-mode-window--${config.initialState}`
        );
      }
      this.element.classList.add("desktop-mode-window--opening");
      this.element.addEventListener("animationend", () => {
        this.element.classList.remove("desktop-mode-window--opening");
      }, { once: true });
      if (config.initialState && config.initialState !== "normal") {
        requestAnimationFrame(() => this.applyInitialState(config.initialState));
      }
    }
    /**
     * Run the plugin's render callback for a native window.
     *
     * Called by the window manager immediately after appending the
     * window element to the desktop. At that point the element (and
     * everything reachable inside it) is connected to the document,
     * so custom elements upgrade synchronously — a prerequisite for
     * the declarative component-kit API (`element.items = […]`) to
     * reach the class setter instead of creating a shadowing own
     * data property on the pre-upgrade instance.
     *
     * No-op for iframe windows.
     *
     * Per-event contract preserved from 0.5.0:
     *   - `NATIVE_WINDOW_BEFORE_RENDER` filter fires, same args.
     *   - `NATIVE_WINDOW_AFTER_RENDER` action fires, same args.
     *   - `config.autofocus` is honoured with a `requestAnimationFrame`
     *     defer so layout side-effects of `render()` settle before
     *     `.focus()` resolves.
     *
     * @since 0.5.0
     * @internal
     */
    hydrateNative() {
      if (!this.config.native || !this.config.render) {
        return;
      }
      const rawBody = this.element.querySelector(
        ".desktop-mode-window__body"
      );
      if (!rawBody) {
        return;
      }
      const filtered = applyFilters(
        HOOKS.NATIVE_WINDOW_BEFORE_RENDER,
        rawBody,
        { windowId: this.id, config: this.config }
      );
      const body = filtered instanceof HTMLElement ? filtered : rawBody;
      const { ctx, dispose } = buildNativeRenderContext(this.id);
      this._nativeRenderCtxDispose = dispose;
      const maybeTeardown = this.config.render(body, ctx);
      const captureTeardown = (v) => {
        if (typeof v === "function") {
          this._nativeRenderTeardown = v;
        }
      };
      if (maybeTeardown instanceof Promise) {
        maybeTeardown.then(
          (resolved) => {
            if (this._isDestroyed) {
              return;
            }
            captureTeardown(resolved);
            markWindowContentReady(this.id);
          },
          (err) => {
            if (typeof console !== "undefined") {
              console.error(
                `[desktop-mode] native render rejected for "${this.id}":`,
                err
              );
            }
            doAction(HOOKS.SHELL_ERROR, {
              scope: "window-open",
              id: this.id,
              error: err
            });
            if (this._isDestroyed) {
              return;
            }
            markWindowContentReady(this.id);
          }
        );
      } else {
        captureTeardown(maybeTeardown);
        requestAnimationFrame(() => {
          if (this._isDestroyed) {
            return;
          }
          markWindowContentReady(this.id);
        });
      }
      doAction(HOOKS.NATIVE_WINDOW_AFTER_RENDER, {
        windowId: this.id,
        body,
        config: this.config
      });
      const autofocus = this.config.autofocus;
      if (autofocus) {
        requestAnimationFrame(() => {
          if (this._isDestroyed) {
            return;
          }
          if (typeof autofocus === "string") {
            const target = body.querySelector(
              autofocus
            );
            target?.focus();
            return;
          }
          const hadTabIndex = body.hasAttribute("tabindex");
          if (!hadTabIndex) {
            body.tabIndex = -1;
          }
          body.focus();
        });
      }
    }
    /**
     * Apply a state restored from the session. Called once, after
     * construction.
     */
    applyInitialState(state) {
      if (state === "minimized") {
        this.minimize();
      } else if (state === "maximized") {
        this.toggleMaximize();
      } else if (state === "fullscreen") {
        this.toggleFullscreen();
      } else if (state === "snapped-left") {
        this.applySnap("left");
      } else if (state === "snapped-right") {
        this.applySnap("right");
      }
    }
    /**
     * Dispatch a `desktop-mode-window-changed` event so the session-save
     * path can schedule a debounced write.
     *
     * Called after any state change that should end up persisted: drag
     * end, resize end, minimize, restore, maximize toggle, fullscreen
     * toggle. Exposed as `_emitChange` so sibling modules (tabs,
     * pointer) can fire the same event.
     *
     * @internal
     */
    _emitChange(reason) {
      document.dispatchEvent(
        new CustomEvent("desktop-mode-window-changed", {
          detail: { windowId: this.id, reason, state: this.state }
        })
      );
    }
    /**
     * Round an `{ x, y, width, height }` rect onto the live snap grid
     * when snap-to-grid is enabled, otherwise return it unchanged.
     *
     * Used by both the un-maximize restore (so geometry saved while
     * snap was off doesn't leave the window off-grid when snap is on)
     * and any other code path that wants "the current geometry, but
     * grid-aligned." Width/height are floored to whole cells to avoid
     * crossing the EDGE_MARGIN constraint after rounding up.
     */
    snapGeometry(g) {
      const snap = this.snapConfigProvider?.();
      if (!snap || !snap.enabled) {
        return g;
      }
      const width = Math.max(
        this.config.minWidth,
        Math.round(g.width / snap.cellWidth) * snap.cellWidth
      );
      const height = Math.max(
        this.config.minHeight,
        Math.round(g.height / snap.cellHeight) * snap.cellHeight
      );
      return {
        x: Math.round(g.x / snap.cellWidth) * snap.cellWidth,
        y: Math.round(g.y / snap.cellHeight) * snap.cellHeight,
        width,
        height
      };
    }
    /**
     * Returns the current resolved URL of the iframe — preferring the
     * content window's location (reflects in-window navigation) and
     * falling back to the iframe's src attribute for cases where the
     * content document isn't yet reachable (cross-origin edge, early
     * load).
     */
    getCurrentUrl() {
      if (!this.iframe) {
        return this.config.url || `#${this.id}`;
      }
      try {
        const href = this.iframe.contentWindow?.location.href;
        if (href && href !== "about:blank") {
          return href;
        }
      } catch {
      }
      return this.iframe.src;
    }
    /** Bind all DOM event handlers. */
    bindEvents() {
      this.element.addEventListener("pointerdown", () => {
        if (this.element.classList.contains("desktop-mode-window--overview")) {
          return;
        }
        this.onFocusRequest?.(this);
      });
      this.element.addEventListener("focusin", () => {
        if (this.element.classList.contains("desktop-mode-window--overview")) {
          return;
        }
        this.onFocusRequest?.(this);
      });
      this._titleBar.addEventListener(
        "pointerdown",
        (e) => handleDragStart(this, e)
      );
      const resizeHandles = this.element.querySelectorAll(
        ".desktop-mode-window__resize-handle"
      );
      resizeHandles.forEach((handle) => {
        handle.addEventListener(
          "pointerdown",
          (e) => handleResizeStart(this, e)
        );
      });
      const menuBtn = this.element.querySelector(
        ".desktop-mode-window__menu-btn"
      );
      const menuPanel = this.element.querySelector(
        ".desktop-mode-window__menu-panel"
      );
      if (menuBtn && menuPanel) {
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleActionsMenu(this);
        });
        const openAnother = menuPanel.querySelector(
          ".desktop-mode-window__menu-item--open-another"
        );
        if (openAnother) {
          openAnother.addEventListener("wpd-menu-item-click", (e) => {
            e.stopPropagation();
            closeActionsMenu(this);
            this.onOpenAnother?.(this);
          });
        }
        const openInNew = menuPanel.querySelector(
          ".desktop-mode-window__menu-item--open-in-new-window"
        );
        if (openInNew) {
          openInNew.addEventListener("wpd-menu-item-click", (e) => {
            e.stopPropagation();
            closeActionsMenu(this);
            this.onOpenInNewWindow?.(this);
          });
        }
        const reload = menuPanel.querySelector(
          ".desktop-mode-window__menu-item--reload"
        );
        if (reload) {
          reload.addEventListener("wpd-menu-item-click", (e) => {
            e.stopPropagation();
            closeActionsMenu(this);
            this.reload();
          });
        }
        const openExternal = menuPanel.querySelector(
          ".desktop-mode-window__menu-item--open-external"
        );
        if (openExternal) {
          openExternal.addEventListener("wpd-menu-item-click", (e) => {
            e.stopPropagation();
            closeActionsMenu(this);
            this.detach();
          });
        }
        const startup = menuPanel.querySelector(
          ".desktop-mode-window__menu-item--startup"
        );
        if (startup) {
          refreshStartupCheckState(this, startup);
          startup.addEventListener("wpd-menu-item-click", (e) => {
            e.stopPropagation();
            flipStartupCheckOptimistically(startup);
            this.onToggleStartup?.(this);
          });
          document.addEventListener(
            "desktop-mode-default-window-changed",
            () => {
              refreshStartupCheckState(this, startup);
            }
          );
        }
        menuPanel.addEventListener("keydown", (e) => {
          const kev = e;
          if (kev.key === "Escape") {
            e.stopPropagation();
            closeActionsMenu(this);
            menuBtn.focus();
          }
        });
      }
      this._titleBar.addEventListener("dblclick", (e) => {
        const target = e.target;
        if (target?.closest(
          'button, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], wpd-window-button, wpd-menu, wpd-menu-item, .desktop-mode-window__menu-panel, .desktop-mode-window__custom-buttons, input, select, textarea, a'
        )) {
          return;
        }
        this.toggleMaximize();
      });
      if (this.iframe) {
        const iframe = this.iframe;
        const tabs = this.element.querySelector(".desktop-mode-window__tabs");
        if (tabs) {
          tabs.addEventListener(
            "click",
            (e) => handleTabStripClick(this, e)
          );
        }
        iframe.addEventListener("load", () => {
          try {
            const href = iframe.contentWindow?.location.href;
            if (href) {
              syncActiveTab(this, href);
            }
          } catch {
          }
        });
        window.addEventListener("message", this._boundOnMessage);
      }
    }
    /** Add a closeable+detachable sub-tab hosting an external URL. */
    addExternalTab(url, label) {
      addExternalTab(this, url, label);
    }
    /** Set the z-index of this window. */
    setZIndex(z) {
      this.element.style.zIndex = String(z);
    }
    /** Mark this window as focused or unfocused. */
    setFocused(focused) {
      this.element.classList.toggle("desktop-mode-window--focused", focused);
      this._notifyChromeStateChanged();
    }
    /** Update the window title. */
    setTitle(title) {
      this._titleEl.textContent = title;
      this.config.title = title;
      doAction(HOOKS.WINDOW_TITLE_CHANGED, { windowId: this.id, title });
      this._notifyChromeStateChanged();
    }
    /**
     * Re-render the controls cluster from the Layer-2 registry +
     * the per-window `appearance.controls` block. Idempotent. The
     * old buttons (and any plugin-supplied render() teardowns) are
     * cleaned up before the new ones mount.
     *
     * @internal
     * @since 0.6.0
     */
    repaintWindowControls() {
      const controlsHost = this.element.querySelector(
        ".desktop-mode-window__controls"
      );
      if (!controlsHost) {
        return;
      }
      if (this._windowControlsTeardown) {
        try {
          this._windowControlsTeardown();
        } catch {
        }
        this._windowControlsTeardown = null;
      }
      this._windowControlsTeardown = paintWindowControls(this, controlsHost);
    }
    /**
     * Apply (or clear) a per-window controls config at runtime.
     * Mutates `this.config.appearance.controls` and re-paints. Pass
     * `null` or `undefined` to clear the override and fall back to
     * the registry-only resolution.
     *
     * @since 0.6.0
     */
    setAppearanceControls(override) {
      this.config.appearance = {
        ...this.config.appearance ?? {},
        controls: override ?? void 0
      };
      this.repaintWindowControls();
    }
    /**
     * Re-render every Layer-3 title-bar slot from the registry +
     * the per-window `appearance.slots` block. Idempotent. Plugin-
     * supplied teardowns from the previous paint run before the new
     * paint.
     *
     * @internal
     * @since 0.6.0
     */
    repaintWindowSlots() {
      if (this._windowSlotsTeardown) {
        try {
          this._windowSlotsTeardown();
        } catch {
        }
        this._windowSlotsTeardown = null;
      }
      this._windowSlotsTeardown = paintWindowSlots(this);
    }
    /**
     * Tear down the active custom chrome (if any) and mount the
     * resolved one. No-op when both old and new resolve to
     * `'core/standard'`. Idempotent.
     *
     * @internal
     * @since 0.6.0
     */
    remountWindowChrome() {
      if (this._chromeHandle) {
        try {
          this._chromeHandle.destroy();
        } catch {
        }
        this._chromeHandle = null;
      }
      this.element.classList.remove(CUSTOM_CHROME_CLASS);
      const mounted = mountWindowChrome(this);
      if (mounted) {
        this._chromeHandle = mounted.handle;
        this._chromeId = mounted.id;
      } else {
        this._chromeId = STANDARD_CHROME_ID;
      }
    }
    /**
     * Set the chrome id at runtime. Pass `null` / `undefined` to
     * fall back to the standard chrome.
     *
     * **Experimental** since 0.6.0 — the chrome render contract may
     * change in future minor versions.
     */
    setAppearanceChrome(chromeId) {
      this.config.appearance = {
        ...this.config.appearance ?? {},
        chrome: chromeId ?? void 0
      };
      this.remountWindowChrome();
    }
    /**
     * Push the current window state into the active custom chrome
     * (if any). Called from {@link setTitle}, {@link setFocused}, and
     * the maximize / minimize / fullscreen transitions so chrome
     * implementations don't have to subscribe to lifecycle events to
     * keep their visual in sync.
     *
     * @internal
     * @since 0.6.0
     */
    _notifyChromeStateChanged() {
      if (this._isDestroyed) {
        return;
      }
      if (!this._chromeHandle?.update) {
        return;
      }
      try {
        this._chromeHandle.update(captureChromeState(this));
      } catch {
      }
    }
    /**
     * Apply (or clear) per-window slot overrides at runtime.
     * `slot === null` removes the named override; `slots === null`
     * clears all per-window slot overrides at once.
     *
     * @since 0.6.0
     */
    setAppearanceSlot(slot, config) {
      const existing = this.config.appearance?.slots ?? {};
      const next = { ...existing };
      if (config === void 0) {
        delete next[slot];
      } else {
        next[slot] = config;
      }
      this.config.appearance = {
        ...this.config.appearance ?? {},
        slots: next
      };
      this.repaintWindowSlots();
    }
    /**
     * Apply (or clear) a per-window theme override at runtime. Accepts
     * three shapes for ergonomics:
     *
     *   - `string` — interpreted as a registered theme id.
     *   - `Record< string, string >` — interpreted as inline tokens.
     *   - `WindowThemeRef` — explicit `{ themeId }` or `{ tokens }`.
     *   - `null` / `undefined` — clear the override; the window falls
     *     back to whatever the registry's match resolves to.
     *
     * Calls through to {@link applyWindowTheme}. The override is
     * also written to `this.config.appearance.theme` so the next
     * registry-driven re-apply preserves the runtime choice.
     *
     * @since 0.6.0
     */
    setAppearanceTheme(override) {
      let resolved;
      if (override === null || override === void 0) {
        resolved = void 0;
      } else if (typeof override === "string") {
        resolved = { themeId: override };
      } else if (typeof override === "object" && ("themeId" in override || "tokens" in override)) {
        resolved = override;
      } else if (typeof override === "object") {
        resolved = { tokens: override };
      }
      this.config.appearance = {
        ...this.config.appearance ?? {},
        theme: resolved
      };
      applyWindowTheme(this, resolved);
    }
    /** Minimize the window. */
    /**
     * Write the half-screen snap geometry for `zone` and apply the
     * corresponding state class. Shared by session-restore (which
     * calls it from `applyInitialState`) and the manager's live-snap
     * commit path so both enter the "snapped" state via identical
     * geometry math — and the ResizeObserver that reflows stateful
     * windows on desktop-area size changes.
     */
    applySnap(zone) {
      if (!this._applySnapVisuals(zone)) {
        return;
      }
      this.state = zone === "left" ? "snapped-left" : "snapped-right";
      this._emitChange("state");
    }
    /**
     * Apply the snap-zone visuals (state class + inline geometry). Does
     * NOT mutate `state`, save geometry, emit a change event, or fire
     * any action — callers own all of those side-effects so the same
     * helper can power both the public {@link applySnap} (which emits +
     * sets state) and the fullscreen-exit-to-snapped path in
     * {@link toggleFullscreen} (which emits + fires hooks exactly once
     * across the transition).
     *
     * @return `true` when geometry was applied; `false` when the
     *         element has no parent and we can't size against it.
     * @internal
     */
    _applySnapVisuals(zone) {
      const parent = this.element.parentElement;
      if (!parent) {
        return false;
      }
      const halfW = Math.floor(parent.clientWidth / 2);
      const height = parent.clientHeight;
      this.element.classList.remove(
        "desktop-mode-window--maximized",
        "desktop-mode-window--fullscreen",
        "desktop-mode-window--snapped-left",
        "desktop-mode-window--snapped-right"
      );
      this.element.classList.add(`desktop-mode-window--snapped-${zone}`);
      this.element.style.left = zone === "left" ? "0px" : `${halfW}px`;
      this.element.style.top = "0px";
      this.element.style.width = `${halfW}px`;
      this.element.style.height = `${height}px`;
      return true;
    }
    /**
     * Predicate: is this window currently minimized?
     *
     * Equivalent to `state === 'minimized'`, but expressed as a
     * method so callers don't have to grep for the canonical
     * state-string values. The state machine is:
     * `'normal' | 'minimized' | 'maximized' | 'fullscreen' |
     * 'snapped-left' | 'snapped-right'`.
     *
     * @public
     * @since 0.5.2
     */
    isMinimized() {
      return this.state === "minimized";
    }
    /** Predicate: is this window currently maximized? @since 0.5.2 */
    isMaximized() {
      return this.state === "maximized";
    }
    /** Predicate: is this window in fullscreen mode? @since 0.5.2 */
    isFullscreen() {
      return this.state === "fullscreen";
    }
    /**
     * Predicate: is this window currently snapped to a screen edge?
     * Returns `true` for both half-screen positions; pass an explicit
     * side string if you need to distinguish.
     *
     * @since 0.5.2
     */
    isSnapped(side) {
      if (side === "left") {
        return this.state === "snapped-left";
      }
      if (side === "right") {
        return this.state === "snapped-right";
      }
      return this.state === "snapped-left" || this.state === "snapped-right";
    }
    /**
     * Predicate: is this window currently the focused (top of stack)
     * window? Reads the `desktop-mode-window--focused` class the manager
     * toggles in `focus()` so the result matches what's visible.
     *
     * @since 0.5.2
     */
    isFocused() {
      return this.element.classList.contains("desktop-mode-window--focused");
    }
    minimize() {
      if (this.state === "minimized") {
        return;
      }
      this._stateBeforeMinimize = this.state;
      this.state = "minimized";
      this.element.classList.add("desktop-mode-window--minimized");
      if (this.iframe) {
        const iframe = this.iframe;
        this.element.addEventListener("transitionend", (e) => {
          if (e.propertyName === "opacity" && this.state === "minimized") {
            iframe.style.visibility = "hidden";
          }
        }, { once: true });
      }
      this.onMinimize?.(this);
      this._emitChange("state");
      doAction(HOOKS.WINDOW_MINIMIZED, {
        windowId: this.id,
        element: this.element
      });
      if (this._stateBeforeMinimize === "fullscreen") {
        updateFullscreenBodyClass();
      }
    }
    /**
     * Restore the window from minimized state. Returns the window to
     * whichever underlying state it occupied before {@link minimize} —
     * so a previously-maximized window comes back maximized rather than
     * silently dropping into 'normal' while the `--maximized` class
     * (still on the element from before minimize) leaves the visual
     * out of sync with `this.state`.
     */
    restore() {
      if (this.iframe) {
        this.iframe.style.visibility = "";
      }
      const wasMinimized = this.state === "minimized";
      this.element.classList.remove("desktop-mode-window--minimized");
      if (wasMinimized) {
        this.state = this._stateBeforeMinimize ?? "normal";
        this._stateBeforeMinimize = null;
        if (this.state === "fullscreen") {
          updateFullscreenBodyClass();
          this.updateFocusButtonState();
        }
      }
      this.onFocusRequest?.(this);
      this._emitChange("state");
      if (wasMinimized) {
        doAction(HOOKS.WINDOW_RESTORED, {
          windowId: this.id,
          element: this.element
        });
      }
    }
    /**
     * Enter maximized state idempotently.
     *
     * Different from `toggleMaximize` in that it's a one-way: a caller
     * that wants the window maximized can call this without worrying
     * about the current state. No-op if already maximized.
     *
     * Used by the Overview-exit path so clicking a thumbnail can
     * animate directly from the grid position to maximized in one
     * co-animation, rather than the two chained animations a
     * `toggleMaximize` call would produce (first back-to-normal, then
     * normal-to-maximized).
     */
    maximize() {
      if (this.state === "maximized") {
        return;
      }
      if (this.state === "normal") {
        this._savedGeometry = {
          x: this.element.offsetLeft,
          y: this.element.offsetTop,
          width: this.element.offsetWidth,
          height: this.element.offsetHeight
        };
      }
      if (!this._applyMaximizeVisuals()) {
        return;
      }
      this.state = "maximized";
      this._emitChange("state");
      doAction(HOOKS.WINDOW_MAXIMIZED, {
        windowId: this.id,
        element: this.element
      });
    }
    /**
     * Apply the maximize visuals (state class + inline geometry against
     * the live parent bounds). Mirror of {@link _applySnapVisuals} —
     * does NOT mutate `state`, save geometry, emit a change event, or
     * fire any action. Callers control all of that so the same helper
     * powers {@link maximize}, {@link toggleMaximize}'s fullscreen
     * branch, and {@link toggleFullscreen}'s exit-to-maximized branch
     * without duplicating the class+geometry math AND without the
     * idempotency-guard / save-geometry interlock that bit the
     * exit-to-maximized path before this refactor.
     *
     * @return `true` when geometry was applied; `false` when the
     *         element has no parent and we can't size against it.
     * @internal
     */
    _applyMaximizeVisuals() {
      const parent = this.element.parentElement;
      if (!parent) {
        return false;
      }
      this.element.classList.remove(
        "desktop-mode-window--fullscreen",
        "desktop-mode-window--snapped-left",
        "desktop-mode-window--snapped-right"
      );
      this.element.classList.add("desktop-mode-window--maximized");
      this.element.style.left = "0px";
      this.element.style.top = "0px";
      this.element.style.width = `${parent.clientWidth}px`;
      this.element.style.height = `${parent.clientHeight}px`;
      return true;
    }
    /** Toggle between maximized and normal states. */
    toggleMaximize() {
      const parent = this.element.parentElement;
      if (!parent) {
        return;
      }
      if (this.state === "maximized") {
        this.element.classList.remove("desktop-mode-window--maximized");
        if (this._savedGeometry) {
          const restored = this.snapGeometry(this._savedGeometry);
          this.element.style.left = `${restored.x}px`;
          this.element.style.top = `${restored.y}px`;
          this.element.style.width = `${restored.width}px`;
          this.element.style.height = `${restored.height}px`;
          this._savedGeometry = restored;
        }
        this.state = "normal";
        this._emitChange("state");
        doAction(HOOKS.WINDOW_UNMAXIMIZED, {
          windowId: this.id,
          element: this.element
        });
        return;
      }
      if (this.state === "fullscreen") {
        this._savedFullscreenState = null;
        this._applyMaximizeVisuals();
        this.state = "maximized";
        updateFullscreenBodyClass();
        this.updateFocusButtonState();
        this._emitChange("state");
        doAction(HOOKS.WINDOW_FULLSCREEN_EXITED, {
          windowId: this.id,
          element: this.element
        });
        doAction(HOOKS.WINDOW_MAXIMIZED, {
          windowId: this.id,
          element: this.element
        });
        return;
      }
      this.maximize();
    }
    /**
     * Toggle fullscreen ("focus") mode — the window covers the entire
     * viewport, hiding the admin bar and dock behind it.
     *
     * This is the equivalent of macOS's green zoom-to-fullscreen: an
     * immersive mode distinct from maximize (which only fills the
     * desktop area, respecting the dock inset).
     */
    toggleFullscreen() {
      if (this.state === "fullscreen") {
        this.element.classList.remove("desktop-mode-window--fullscreen");
        const s = this._savedFullscreenState;
        this._savedFullscreenState = null;
        let landedOnMaximize = false;
        if (s && s.state === "maximized") {
          this._applyMaximizeVisuals();
          this.state = "maximized";
          landedOnMaximize = true;
        } else if (s && (s.state === "snapped-left" || s.state === "snapped-right")) {
          const zone = s.state === "snapped-left" ? "left" : "right";
          this._applySnapVisuals(zone);
          this.state = s.state;
        } else if (s) {
          this.element.style.left = `${s.x}px`;
          this.element.style.top = `${s.y}px`;
          this.element.style.width = `${s.width}px`;
          this.element.style.height = `${s.height}px`;
          this.state = "normal";
        } else {
          this.state = "normal";
        }
        updateFullscreenBodyClass();
        this.updateFocusButtonState();
        this._emitChange("state");
        doAction(HOOKS.WINDOW_FULLSCREEN_EXITED, {
          windowId: this.id,
          element: this.element
        });
        if (landedOnMaximize) {
          doAction(HOOKS.WINDOW_MAXIMIZED, {
            windowId: this.id,
            element: this.element
          });
        }
        return;
      }
      if (this.state === "normal") {
        this._savedGeometry = {
          x: this.element.offsetLeft,
          y: this.element.offsetTop,
          width: this.element.offsetWidth,
          height: this.element.offsetHeight
        };
      }
      this._savedFullscreenState = {
        state: this.state,
        x: this.element.offsetLeft,
        y: this.element.offsetTop,
        width: this.element.offsetWidth,
        height: this.element.offsetHeight
      };
      this.element.classList.remove(
        "desktop-mode-window--maximized",
        "desktop-mode-window--snapped-left",
        "desktop-mode-window--snapped-right"
      );
      this.element.classList.add("desktop-mode-window--fullscreen");
      this.state = "fullscreen";
      updateFullscreenBodyClass();
      this.updateFocusButtonState();
      this._emitChange("state");
      doAction(HOOKS.WINDOW_FULLSCREEN_ENTERED, {
        windowId: this.id,
        element: this.element
      });
    }
    /**
     * Reflect fullscreen state on the focus-mode button (active class,
     * aria-pressed, and label).
     */
    updateFocusButtonState() {
      const btn = this.element.querySelector(
        ".desktop-mode-window__btn--focus"
      );
      if (!btn) {
        return;
      }
      const isFullscreen = this.state === "fullscreen";
      btn.classList.toggle("desktop-mode-window__btn--active", isFullscreen);
      btn.setAttribute("aria-pressed", isFullscreen ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        isFullscreen ? __("Exit fullscreen") : __("Enter fullscreen")
      );
    }
    /**
     * Open the window's current URL in a new browser tab as classic
     * wp-admin.
     *
     * Strips the chromeless `desktop_mode_chromeless` flag and the transient
     * `desktop_mode_portal` flag, and tags the URL with
     * `desktop_mode_classic=1` so the server-side admin_init redirect
     * (which otherwise forwards plain admin URLs to `/desktop-mode/`)
     * lets the request through. The tag only has to survive the first
     * request; once the browser renders the page, the user's in-tab
     * navigation returns to normal admin flow.
     *
     * The desktop window itself stays open — detach is a branch, not
     * a move. If the user wants to close it afterwards, they can.
     */
    detach() {
      const current = this.getCurrentUrl();
      let url;
      try {
        url = new URL(current, INITIAL_ORIGIN);
      } catch {
        return;
      }
      if (url.origin !== INITIAL_ORIGIN) {
        return;
      }
      url.searchParams.delete("desktop_mode_chromeless");
      url.searchParams.delete("desktop_mode_portal");
      url.searchParams.set("desktop_mode_classic", "1");
      window.open(url.toString(), "_blank", "noopener");
      doAction(HOOKS.WINDOW_DETACHED, { windowId: this.id, url: url.toString() });
    }
    /**
     * Reload the active iframe of this window. If an external sub-tab
     * is foregrounded, that iframe is reloaded instead of the primary
     * one. Same-origin iframes use `location.reload()` for a clean
     * reload that preserves scroll position semantics; cross-origin
     * external tabs fall back to re-assigning `iframe.src`.
     *
     * No-op for native windows — they own their DOM directly and the
     * title-bar menu's Reload item is only built for iframe windows
     * (`dom.ts` skips it when `config.native`), but this guard keeps
     * the contract honest if the method is called by other code paths
     * in the future.
     */
    reload() {
      if (this.config.native) {
        return;
      }
      const body = this.element.querySelector(".desktop-mode-window__body");
      if (body?.classList.contains("desktop-mode-window__body--loading")) {
        return;
      }
      let reloadedUrl;
      let triggerReload;
      if (this._activeTabId === "primary") {
        if (!this.iframe) {
          return;
        }
        const iframe = this.iframe;
        reloadedUrl = this.getCurrentUrl();
        triggerReload = () => {
          try {
            iframe.contentWindow?.location.reload();
          } catch {
            iframe.src = iframe.src;
          }
        };
      } else {
        const entry = this._externalTabs.get(this._activeTabId);
        if (!entry) {
          return;
        }
        reloadedUrl = entry.url;
        triggerReload = () => {
          try {
            entry.iframe.contentWindow?.location.reload();
          } catch {
            entry.iframe.src = entry.url;
          }
        };
      }
      this._spinReloadButton();
      this.markContentLoading();
      triggerReload();
      doAction(HOOKS.WINDOW_RELOADED, {
        windowId: this.id,
        url: reloadedUrl
      });
    }
    /**
     * Navigate the window's primary iframe to a new admin URL.
     *
     * Used by `WindowManager.open()` when a caller re-opens an
     * existing window with a URL it isn't already showing — e.g. the
     * post-install "Activate" link
     * (`plugins.php?action=activate&plugin=…&_wpnonce=…`) clicked
     * while a Plugins window is already open. The URL gets the
     * chromeless flag appended via `withChromelessParam()`, which
     * doubles as the same-origin gate. Navigation prefers
     * `location.assign()` so the iframe keeps a real session-history
     * entry (Back still works), falling back to `iframe.src` when the
     * content window is torn down or inaccessible.
     *
     * Returns `true` when a navigation was started, `false` for
     * native windows, missing iframes, or cross-origin URLs.
     *
     * @since 0.9.4
     */
    navigateTo(url) {
      if (this.config.native || !this.iframe) {
        return false;
      }
      const target = withChromelessParam(url);
      if (!target) {
        return false;
      }
      this.markContentLoading();
      const inner = this.iframe.contentWindow;
      if (inner) {
        try {
          inner.location.assign(target);
          return true;
        } catch {
        }
      }
      this.iframe.src = target;
      return true;
    }
    /**
     * Trigger the one-shot 360° rotation on the title-bar reload
     * button. Force-restart the animation by removing the class,
     * flushing a reflow, then re-adding it; otherwise a click during
     * an in-flight animation would be a no-op (CSS ignores re-applying
     * the same animation to an unchanged class). Pattern mirrors
     * {@link shake} for the same restart-on-repeat reason.
     *
     * Silent no-op when the title bar has been replaced by a custom
     * chrome layer that doesn't render the standard reload button.
     *
     * @internal
     */
    _spinReloadButton() {
      const btn = this.element.querySelector(
        ".desktop-mode-window__btn--reload"
      );
      if (!(btn instanceof HTMLElement)) {
        return;
      }
      btn.classList.remove("desktop-mode-window__btn--spinning");
      void btn.offsetWidth;
      btn.classList.add("desktop-mode-window__btn--spinning");
      btn.addEventListener(
        "animationend",
        () => {
          btn.classList.remove("desktop-mode-window__btn--spinning");
        },
        { once: true }
      );
    }
    /**
     * (Re)render plugin-registered title-bar buttons that match this
     * window. Called once from the constructor and again whenever
     * the registry changes. Cheap — clears each slot then walks the
     * filtered list; matching N predicates against this single
     * window is O(N).
     *
     * @internal
     */
    renderCustomTitleBarButtons() {
      const leftSlot = this.element.querySelector(
        ".desktop-mode-window__custom-buttons--left"
      );
      const rightSlot = this.element.querySelector(
        ".desktop-mode-window__custom-buttons--right"
      );
      if (!leftSlot || !rightSlot) {
        return;
      }
      leftSlot.innerHTML = "";
      rightSlot.innerHTML = "";
      const { left, right } = buttonsForWindow(this);
      const fill = (slot, defs) => {
        for (const def of defs) {
          const host = document.createElement("wpd-window-button");
          paintTitleBarButtonIcon(host, def.icon);
          host.setAttribute("aria-label", def.label);
          host.setAttribute("title", def.label);
          host.classList.add("desktop-mode-window__btn");
          host.classList.add("desktop-mode-window__btn--custom");
          host.dataset.buttonId = def.id;
          slot.appendChild(host);
          if (typeof def.render === "function") {
            try {
              def.render(host, this);
            } catch (err) {
              if (typeof console !== "undefined") {
                console.error(
                  "[desktop-mode] title-bar-button render threw:",
                  def.id,
                  err
                );
              }
            }
          } else if (typeof def.onClick === "function") {
            host.addEventListener("wpd-button-activate", (ev) => {
              try {
                def.onClick(this, ev);
              } catch (err) {
                if (typeof console !== "undefined") {
                  console.error(
                    "[desktop-mode] title-bar-button onClick threw:",
                    def.id,
                    err
                  );
                }
              }
            });
          }
        }
      };
      fill(leftSlot, left);
      fill(rightSlot, right);
    }
    /**
     * Publish a payload on a named channel into this window's
     * content. The unified abstraction over iframe `postMessage` and
     * native render-callback dispatch — plugin authors write the
     * same call regardless of how the window is rendered.
     *
     * **Iframe windows** (real iframes OR `iframeContent` natives):
     * the payload is delivered as `desktop-mode-window-send` via
     * `postMessage` and surfaces inside the iframe via
     * `wp.desktop.on( channel, cb )` (the iframe-bridge installs
     * the API on `wp.desktop`). Calls made before the iframe has
     * announced itself ready are queued in FIFO order and flushed
     * once the bridge connects — `Window.send` is safe the moment
     * the window object exists.
     *
     * **Pure native windows**: the payload is delivered in-process
     * to subscribers the render callback registered through its
     * `windowApi.on( channel, cb )` (the second argument the render
     * receives). Always considered ready — no async boundary.
     *
     * Plugin authors never branch on window type — same call, same
     * channel, same payload.
     *
     * @since 0.5.5
     *
     * @param channel Slash- or dot-separated identifier (e.g.
     *                `'reload'`, `'editor/insert-block'`).
     * @param payload Anything `postMessage` can serialise.
     */
    send(channel, payload) {
      if (typeof channel !== "string" || channel === "") {
        return;
      }
      const target = this.iframe ?? getSyntheticIframe(this.id);
      if (!target) {
        dispatchToNative(this.id, channel, payload);
        return;
      }
      const sendNow = () => {
        try {
          target.contentWindow?.postMessage(
            {
              type: "desktop-mode-window-send",
              channel,
              payload
            },
            INITIAL_ORIGIN
          );
        } catch (err) {
          if (typeof console !== "undefined") {
            console.error(
              "[desktop-mode] Window.send: postMessage failed",
              err
            );
          }
        }
      };
      if (isWindowContentReady(this.id)) {
        sendNow();
        return;
      }
      enqueueWindowSend(this.id, channel, payload, sendNow);
    }
    /**
     * Subscribe to a named channel published BY this window's
     * content. Mirror of {@link send} for the inbound direction.
     *
     * Iframe content publishes via `wp.desktop.send( channel,
     * payload )` (installed by the iframe bridge); native render
     * code publishes via `windowApi.send( channel, payload )`. Both
     * land here.
     *
     * Use the literal `'*'` to wildcard-subscribe to every channel
     * this window publishes.
     *
     * @since 0.5.5
     *
     * @return Unsubscribe handle. Idempotent.
     */
    on(channel, cb) {
      if (typeof channel !== "string" || channel === "" || typeof cb !== "function") {
        return () => void 0;
      }
      return addParentSubscriber(
        this.id,
        channel,
        cb
      );
    }
    /**
     * Re-show the loading-spinner overlay over this window's body
     * and fade the content out. Mirror of {@link markContentLoaded}
     * for the entry edge — plugins call this before kicking off an
     * async refetch so the user sees the same affordance they saw
     * at first paint, and call `markContentLoaded()` once the work
     * resolves.
     *
     * The shell:
     *   - Adds the `desktop-mode-window__body--loading` modifier to
     *     the body (CSS fades the content out, fades the overlay
     *     in).
     *   - Re-attaches the overlay element if it was already torn
     *     down by a prior `markContentLoaded` call.
     *   - Fires the {@link HOOKS.WINDOW_CONTENT_LOADING} action +
     *     dispatches `desktop-mode-window-content-loading` on
     *     `document` (idempotent — no re-fire when already
     *     loading).
     *
     * Idempotent. Cheap to call repeatedly.
     *
     * @since 0.6.0
     */
    markContentLoading() {
      markWindowContentLoading(this.id);
    }
    /**
     * Tell the shell this window's body content is ready — fades
     * the spinner overlay out, fades the content in, removes the
     * overlay element after the transition lands.
     *
     * Iframe windows mark themselves ready automatically on the
     * `desktop-mode-ready` postMessage from the chromeless bridge.
     * Native windows mark themselves ready automatically after
     * their `render( body )` callback (or its returned `Promise`)
     * resolves. Plugins only call this directly when:
     *
     *   - They're doing event-listener-based async loading the
     *     framework can't observe.
     *   - They re-armed loading via {@link markContentLoading}
     *     and need to clear it again.
     *
     * Idempotent. Fires the {@link HOOKS.WINDOW_CONTENT_LOADED}
     * action only on a loading → ready transition.
     *
     * @since 0.6.0
     */
    markContentLoaded() {
      markWindowContentReady(this.id);
    }
    /**
     * Resolve when this window's content is ready to receive sends.
     * Returns a Promise that resolves immediately for windows that
     * are already ready, and otherwise waits for the next
     * {@link HOOKS.WINDOW_CONTENT_LOADED} matching this window's id.
     *
     * Backstop for the iframe bridge handshake race: plugin authors
     * coordinating with an `iframeContent: { bridge: true }` native
     * window can `await win.whenContentReady()` before issuing the
     * first send/connect, instead of wiring iframe.load themselves
     * or hoping that {@link HOOKS.IFRAME_READY} has fired by their
     * boot.
     *
     * Resolves regardless of whether the content path was an iframe
     * `load`, the chromeless `desktop-mode-ready` postMessage, or a
     * native render's synchronous `markContentLoaded()` — all three
     * end up calling {@link markWindowContentReady}.
     *
     * @public
     * @since 0.6.0
     */
    whenContentReady() {
      if (isWindowContentReady(this.id)) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const expectedId = this.id;
        const onLoaded = (e) => {
          const detail = e.detail;
          if (!detail || detail.windowId !== expectedId) {
            return;
          }
          document.removeEventListener(
            "desktop-mode-window-content-loaded",
            onLoaded
          );
          resolve();
        };
        document.addEventListener(
          "desktop-mode-window-content-loaded",
          onLoaded
        );
      });
    }
    /**
     * Set the activity indicator's phase explicitly. Most callers
     * should prefer {@link trackActivity} (or `wp.desktop.fetch()`
     * which calls it internally) — this is the escape hatch for code
     * paths that aren't a single Promise (event-listener-driven
     * loaders, Heartbeat polls, manual save buttons that want to
     * pulse "Saved" without a wrapped fetch).
     *
     * Phases:
     *
     *   - `idle`    — clear. Indicator fades out.
     *   - `pending` / `saving` — modem-blink while a request is in flight.
     *   - `saved`   — green flash; auto-clears to `idle` after ~2.2s.
     *   - `failed`  — red dot with `opts.error` as tooltip text;
     *                 auto-clears after ~6s.
     *
     * Idempotent: setting the same phase twice is a no-op except for
     * resetting the auto-clear timer.
     *
     * @since 0.8.0
     */
    markActivity(phase, opts = {}) {
      this._activityPhase = phase;
      this._activityError = opts.error ?? null;
      this._paintActivityIndicator();
    }
    /**
     * Track a Promise's lifecycle on this window's activity indicator.
     * The dot pulses while the Promise is in flight; on resolve it
     * settles to `saved` (green flash); on reject it shows `failed`
     * (red, error message tooltip). Returns the Promise unchanged so
     * callers can chain.
     *
     * Multiple concurrent calls are reference-counted: the dot stays
     * lit until the LAST tracked Promise settles. The terminal phase
     * (`saved` vs `failed`) reflects the LAST settled outcome, so a
     * burst of 5 successful fetches followed by 1 error reads
     * "failed", which is the right signal — surface the bad news.
     *
     * Use `wp.desktop.fetch()` for HTTP requests; reach for this
     * directly when you have a Promise from a different source
     * (postMessage handshake, IndexedDB transaction, …).
     *
     * @since 0.8.0
     */
    trackActivity(promise) {
      this._markActivityStart();
      return promise.then(
        (value) => {
          this._markActivitySettled(true);
          return value;
        },
        (err) => {
          const message = err instanceof Error ? err.message : String(err);
          this._markActivitySettled(false, message);
          throw err;
        }
      );
    }
    /**
     * Increment the in-flight counter and paint.
     *
     * @internal
     */
    _markActivityStart() {
      this._activityCount++;
      if (this._activitySettleTimer !== null) {
        window.clearTimeout(this._activitySettleTimer);
        this._activitySettleTimer = null;
      }
      if (this._activityCount === 1) {
        this._activityPhase = "saving";
        this._activityError = null;
        this._activitySavingStartedAt = Date.now();
        this._paintActivityIndicator();
      }
    }
    /**
     * Decrement the in-flight counter and, when it hits zero,
     * transition to `saved` or `failed`. Schedules an auto-clear
     * back to `idle`.
     *
     * Honours `MIN_SAVING_DISPLAY_MS` — when a fetch settles before
     * the minimum has elapsed, the transition is deferred so the
     * modem-blink animation has time to register visually. Concurrent
     * activity that re-starts during the deferral cancels it.
     *
     * @internal
     */
    _markActivitySettled(ok, error) {
      if (this._activityCount > 0) {
        this._activityCount--;
      }
      if (this._activityCount > 0) {
        if (!ok && error) {
          this._activityError = error;
        }
        return;
      }
      const elapsed = Date.now() - this._activitySavingStartedAt;
      const remaining = _Window.MIN_SAVING_DISPLAY_MS - elapsed;
      if (remaining > 0) {
        if (this._activitySettleTimer !== null) {
          window.clearTimeout(this._activitySettleTimer);
        }
        this._activitySettleTimer = window.setTimeout(() => {
          this._activitySettleTimer = null;
          this._finalizeActivitySettle(ok, error);
        }, remaining);
        return;
      }
      this._finalizeActivitySettle(ok, error);
    }
    /**
     * Apply the terminal `saved` / `failed` phase and schedule the
     * fade back to `idle`. Split out of `_markActivitySettled` so
     * the deferred-settle path and the immediate path share one
     * implementation.
     *
     * @internal
     */
    _finalizeActivitySettle(ok, error) {
      this._activityPhase = ok && !this._activityError ? "saved" : "failed";
      if (!ok && error) {
        this._activityError = error;
      }
      this._paintActivityIndicator();
      if (this._activityClearTimer !== null) {
        window.clearTimeout(this._activityClearTimer);
        this._activityClearTimer = null;
      }
      if (this._activityPhase === "saved") {
        this._activityClearTimer = window.setTimeout(() => {
          this._activityClearTimer = null;
          this._activityPhase = "idle";
          this._activityError = null;
          this._paintActivityIndicator();
        }, 2200);
      }
    }
    /**
     * Push the current activity state onto the title-bar dot.
     *
     * @internal
     */
    _paintActivityIndicator() {
      if (this._isDestroyed) {
        return;
      }
      const indicator = this._titleBar.querySelector(
        "[data-desktop-mode-activity-indicator]"
      );
      if (!indicator) {
        return;
      }
      indicator.setAttribute("phase", this._activityPhase);
      if (this._activityError) {
        indicator.setAttribute("error", this._activityError);
      } else {
        indicator.removeAttribute("error");
      }
    }
    /**
     * Request a visual "attention" signal on this window's tile in
     * the dock or taskbar — pulse, shake, or bounce. Used by plugins
     * that need to grab the user's eye when the window is closed or
     * unfocused (incoming chat message, long task finished, etc.).
     *
     * Resolution order:
     *   1. If a tile exists for this window's id on either rail
     *      (`wp.desktop.dock` or `wp.desktop.taskbar`), call
     *      `Dock.setAttention( id, mode, opts )`.
     *   2. Otherwise (e.g. `placement: 'none'`) fall back to
     *      `setHighlight('persistent')` on the window itself, auto-
     *      cleared after `opts.durationMs`. No-op if the window has
     *      no rendered chrome.
     *
     * The mode + opts pass through the `desktop-mode.window.attention`
     * filter first so plugins (or a Do-Not-Disturb preference) can
     * mute (`return null`) or modify the request.
     *
     * Animations are gated on `prefers-reduced-motion`; reduced-motion
     * users see a static accent ring for the same duration so the
     * affordance still works.
     *
     * @since 0.6.0
     */
    requestAttention(mode, opts = {}) {
      const intent = activity.filter(
        "desktop-mode/window-attention-requested",
        {
          windowId: this.id,
          mode,
          durationMs: opts.durationMs,
          intensity: opts.intensity
        },
        opts
      );
      if (!intent || intent.cancel === true) {
        return;
      }
      const intentMode = intent.mode ?? mode;
      const intentOpts = {
        ...opts,
        durationMs: typeof intent.durationMs === "number" ? intent.durationMs : opts.durationMs,
        intensity: typeof intent.intensity === "string" ? intent.intensity : opts.intensity
      };
      const filtered = applyFilters(
        "desktop-mode.window.attention",
        intentMode,
        { windowId: this.id, opts: intentOpts }
      );
      const wp = window.wp;
      const dockApi = wp?.desktop?.dock;
      const taskbarApi = wp?.desktop?.taskbar;
      let routed = false;
      if (typeof dockApi?.setAttention === "function") {
        dockApi.setAttention(this.id, filtered, intentOpts);
        routed = true;
      }
      if (typeof taskbarApi?.setAttention === "function") {
        taskbarApi.setAttention(this.id, filtered, intentOpts);
        routed = true;
      }
      if (!routed && filtered !== null) {
        this.setHighlight("persistent");
        const duration = intentOpts.durationMs ?? 4e3;
        if (duration > 0) {
          window.setTimeout(() => {
            this.setHighlight(null);
          }, duration);
        }
      } else if (!routed && filtered === null) {
        this.setHighlight(null);
      }
    }
    /**
     * Briefly jiggle the window element horizontally — the classic
     * MSN-Messenger nudge affordance. Plugins can request "look at
     * me" attention on their own window programmatically (e.g. a
     * chat plugin on inbound nudge, a CI plugin on a broken build).
     *
     * Composes with the inline `left`/`top` the window manager
     * writes (the shake is a CSS `transform`, not a position
     * change). Auto-clears the class on `animationend`. If a second
     * shake is requested while one is mid-flight, the class is
     * removed and re-added so the animation restarts.
     *
     * Reduced-motion fallback: a static accent ring for the same
     * duration. Authors who want a different visual can listen on
     * the JS filter `desktop-mode.window.shake` and return falsy to mute.
     *
     * @since 0.6.0
     */
    shake() {
      const filtered = applyFilters(
        "desktop-mode.window.shake",
        true,
        { windowId: this.id }
      );
      if (filtered === false) {
        return;
      }
      const el = this.element;
      el.classList.remove("desktop-mode-window--shaking");
      void el.offsetWidth;
      el.classList.add("desktop-mode-window--shaking");
      const onEnd = () => {
        el.classList.remove("desktop-mode-window--shaking");
        el.removeEventListener("animationend", onEnd);
      };
      el.addEventListener("animationend", onEnd);
    }
    /**
     * Toggle a visual highlight on the window. Used by plugins that
     * need to point at a window from outside it — e.g. a "connect to"
     * dropdown that highlights candidate windows on hover.
     *
     *   - `'preview'`     — temporary ring; caller is expected to
     *                       clear on `mouseleave`. Multiple plugins
     *                       can hover-preview without stomping each
     *                       other (last write wins).
     *   - `'persistent'`  — sticky ring; caller is responsible for
     *                       clearing it.
     *   - `null` / unset  — clear all highlight state.
     *
     * Override the colour per-call via `opts.color`, or globally
     * via the `--wp-window-highlight-color` custom property.
     *
     * @since 0.5.2
     */
    setHighlight(mode, opts) {
      const el = this.element;
      if (!el) {
        return;
      }
      el.classList.remove(
        "wp-window--highlight-preview",
        "wp-window--highlight-persistent"
      );
      if (mode === "preview") {
        el.classList.add("wp-window--highlight-preview");
      } else if (mode === "persistent") {
        el.classList.add("wp-window--highlight-persistent");
      }
      if (opts?.color) {
        el.style.setProperty("--wp-window-highlight-color", opts.color);
      } else if (mode === null) {
        el.style.removeProperty("--wp-window-highlight-color");
      }
      doAction(HOOKS.WINDOW_HIGHLIGHT_CHANGED, {
        windowId: this.id,
        mode,
        color: opts?.color
      });
    }
    /**
     * Close and destroy the window.
     *
     * Plays a subtle closing animation before removing the element.
     */
    close() {
      if (this._isDestroyed) {
        return;
      }
      if (this.config.native && !this._suppressCloseFilter) {
        const proceed = applyFilters(
          HOOKS.NATIVE_WINDOW_BEFORE_CLOSE,
          true,
          { windowId: this.id, config: this.config }
        );
        if (proceed === false) {
          return;
        }
      } else if (!this.config.native && !this._suppressCloseFilter && this._iframeBridgeReady && this.iframe) {
        if (this._closePending) {
          return;
        }
        this._closePending = true;
        try {
          this.iframe.contentWindow?.postMessage(
            { type: "desktop-mode-bridge-beforeunload-query" },
            location.origin
          );
          this._iframeCloseTimeout = setTimeout(() => {
            if (this._isDestroyed) {
              return;
            }
            this._suppressCloseFilter = true;
            this._closePending = false;
            this.close();
          }, 500);
          return;
        } catch {
          this._closePending = false;
        }
      }
      this._isDestroyed = true;
      if (this._activityClearTimer !== null) {
        window.clearTimeout(this._activityClearTimer);
        this._activityClearTimer = null;
      }
      if (this._activitySettleTimer !== null) {
        window.clearTimeout(this._activitySettleTimer);
        this._activitySettleTimer = null;
      }
      if (this._titleBarButtonsUnsubscribe) {
        this._titleBarButtonsUnsubscribe();
        this._titleBarButtonsUnsubscribe = null;
      }
      if (this._windowThemesUnsubscribe) {
        this._windowThemesUnsubscribe();
        this._windowThemesUnsubscribe = null;
      }
      if (this._windowControlsUnsubscribe) {
        this._windowControlsUnsubscribe();
        this._windowControlsUnsubscribe = null;
      }
      if (this._windowSlotsUnsubscribe) {
        this._windowSlotsUnsubscribe();
        this._windowSlotsUnsubscribe = null;
      }
      if (this._windowChromesUnsubscribe) {
        this._windowChromesUnsubscribe();
        this._windowChromesUnsubscribe = null;
      }
      if (this._nativeRenderCtxDispose) {
        try {
          this._nativeRenderCtxDispose();
        } catch (err) {
          doAction(HOOKS.SHELL_ERROR, {
            scope: "native-window-ctx-dispose",
            id: this.id,
            error: err
          });
        }
        this._nativeRenderCtxDispose = null;
      }
      this._bodyResizeObserver?.disconnect();
      this._bodyResizeObserver = null;
      clearWindowChannels(this.id);
      try {
        this.config.onClose?.();
      } catch (err) {
        doAction(HOOKS.SHELL_ERROR, {
          scope: "native-window-close",
          id: this.id,
          error: err
        });
      }
      this.onClose?.(this);
      this.element.classList.add("desktop-mode-window--closing");
      this._onCloseTransitionEnd = (e) => {
        if (e.propertyName === "opacity") {
          this._finalizeClose();
        }
      };
      this.element.addEventListener("transitionend", this._onCloseTransitionEnd);
      this._closeSafetyNetTimer = setTimeout(() => this._finalizeClose(), 300);
    }
    /**
     * Synchronously tear down a window with no animation. Use in:
     *
     *  - Test `afterEach` hooks where the suite needs deterministic
     *    cleanup before the environment unwinds.
     *  - Plugin deactivation flows where the tile is going away
     *    immediately and a fade-out would feel wrong.
     *  - Forced shutdowns that must bypass the
     *    `NATIVE_WINDOW_BEFORE_CLOSE` veto filter (e.g. the user
     *    closed a parent that owns this window).
     *
     * Idempotent: a second `destroy()` call is a no-op once the
     * window has finalised. If `close()` had already started the
     * animation, `destroy()` cancels the pending timer and runs
     * finalise immediately.
     *
     * @public
     * @since 0.8.2
     */
    destroy() {
      if (this._isFinalized) {
        return;
      }
      if (!this._isDestroyed) {
        this._suppressCloseFilter = true;
        try {
          this.close();
        } finally {
          this._suppressCloseFilter = false;
        }
      }
      this._finalizeClose();
    }
    /**
     * Run the post-animation teardown — the work that used to live
     * in `close()`'s inner `onDone` closure. Idempotent via
     * `_isFinalized`. Cancels the safety-net timer + the
     * `transitionend` listener it might have been racing.
     *
     * @internal
     * @since 0.8.2
     */
    _finalizeClose() {
      if (this._isFinalized) {
        return;
      }
      this._isFinalized = true;
      if (this._closeSafetyNetTimer !== null) {
        clearTimeout(this._closeSafetyNetTimer);
        this._closeSafetyNetTimer = null;
      }
      if (this._onCloseTransitionEnd) {
        this.element.removeEventListener(
          "transitionend",
          this._onCloseTransitionEnd
        );
        this._onCloseTransitionEnd = null;
      }
      if (this._windowControlsTeardown) {
        try {
          this._windowControlsTeardown();
        } catch {
        }
        this._windowControlsTeardown = null;
      }
      if (this._windowSlotsTeardown) {
        try {
          this._windowSlotsTeardown();
        } catch {
        }
        this._windowSlotsTeardown = null;
      }
      if (this._chromeHandle) {
        try {
          this._chromeHandle.destroy();
        } catch {
        }
        this._chromeHandle = null;
      }
      clearWindowTheme(this);
      if (this._nativeRenderTeardown) {
        try {
          this._nativeRenderTeardown();
        } catch (err) {
          doAction(HOOKS.SHELL_ERROR, {
            scope: "native-window-teardown",
            id: this.id,
            error: err
          });
        }
        this._nativeRenderTeardown = null;
      }
      window.removeEventListener("message", this._boundOnMessage);
      if (this._boundOnDocumentPointerDown) {
        document.removeEventListener(
          "pointerdown",
          this._boundOnDocumentPointerDown,
          true
        );
      }
      this.element.remove();
      updateFullscreenBodyClass();
    }
    /**
     * Wire up a ResizeObserver on the body element. Fires the
     * inline `config.onResize` callback AND the
     * `WINDOW_BODY_RESIZED` hook on every size change. Returns the
     * observer so `close()` can disconnect it; returns null when
     * the body element is missing or the environment has no
     * ResizeObserver (jsdom without a shim, older browsers).
     */
    installBodyResizeObserver() {
      const body = this.element.querySelector(
        ".desktop-mode-window__body"
      );
      if (!body) {
        return null;
      }
      if (typeof ResizeObserver === "undefined") {
        return null;
      }
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        const cr = entry.contentRect;
        const width = Math.round(cr.width);
        const height = Math.round(cr.height);
        try {
          this.config.onResize?.(width, height);
        } catch (err) {
          doAction(HOOKS.SHELL_ERROR, {
            scope: "native-window-resize",
            id: this.id,
            error: err
          });
        }
        doAction(HOOKS.WINDOW_BODY_RESIZED, {
          windowId: this.id,
          width,
          height
        });
      });
      observer.observe(body);
      return observer;
    }
    /** Get a snapshot of the window state for persistence. */
    getSnapshot() {
      const isHidden = this.element.offsetParent === null;
      if (isHidden) {
        const parse = (raw) => {
          const n = parseFloat(raw);
          return Number.isFinite(n) ? Math.round(n) : 0;
        };
        return {
          id: this.id,
          x: parse(this.element.style.left),
          y: parse(this.element.style.top),
          width: parse(this.element.style.width),
          height: parse(this.element.style.height),
          state: this.state
        };
      }
      return {
        id: this.id,
        x: this.element.offsetLeft,
        y: this.element.offsetTop,
        width: this.element.offsetWidth,
        height: this.element.offsetHeight,
        state: this.state
      };
    }
    /** Number of external sub-tabs currently open on this window. */
    getExternalTabCount() {
      return externalTabCount(this);
    }
    /** Serializable snapshot of this window's external sub-tabs. */
    getExternalTabsSnapshot() {
      return externalTabsSnapshot(this);
    }
    /**
     * Toggle the actions menu from an external caller (e.g., keyboard
     * shortcut). Kept here so the panel-focus + outside-click wiring
     * lives in a single place.
     */
    toggleActionsMenu() {
      toggleActionsMenu(this);
    }
    /** Close the actions menu from an external caller. */
    closeActionsMenu() {
      closeActionsMenu(this);
    }
    /** Open the actions menu from an external caller. */
    openActionsMenu() {
      openActionsMenu(this);
    }
  };
  _Window.MIN_SAVING_DISPLAY_MS = 1200;
  let Window = _Window;
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
  const styles$3 = css`:host{display:inline-flex}button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:none;border-radius:5px;background:transparent;color:var( --wpd-btn-color,currentColor );cursor:pointer;transition:background-color 0.15s ease,color 0.15s ease}button:hover{color:var( --wpd-btn-color-hover,currentColor );background:var( --wpd-btn-bg-hover,rgba( 0,0,0,0.06 ) )}button:focus-visible{color:var( --wpd-btn-color-hover,currentColor );background:var( --wpd-btn-bg-hover,rgba( 0,0,0,0.06 ) );outline:2px solid var( --wpd-btn-outline,currentColor );outline-offset:1px}:host( [ active ] ) button{color:var( --wpd-btn-color-hover,currentColor );background:var( --wpd-btn-bg-active,rgba( 0,0,0,0.08 ) )}:host( [ danger ] ) button:hover{color:#fff;background:var( --wpd-btn-danger-hover,#d63638 )}svg{display:block;pointer-events:none;flex-shrink:0}svg:empty{display:none}::slotted( span ){line-height:1}::slotted( svg ){display:block}`;
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
  _WpdWindowButton.styles = [styles$3];
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
  const styles = css`:host{display:inline-flex}button{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;border-radius:4px;background:transparent;color:rgba( 0,0,0,0.45 );cursor:pointer;transition:background-color 0.15s ease,color 0.15s ease,transform 0.12s ease}:host( [ variant='detach' ] ) button:hover{color:var( --wp-admin-theme-color,#2271b1 );background:rgba( 34,113,177,0.12 );transform:translateY( -1px )}:host( [ variant='detach' ] ) button:focus-visible{outline:2px solid var( --wp-admin-theme-color,#2271b1 );outline-offset:1px}:host( [ variant='close' ] ) button:hover{color:#fff;background:#d63638}:host( [ variant='close' ] ) button:focus-visible{color:#fff;background:#d63638;outline:2px solid rgba( 214,54,56,0.6 );outline-offset:1px}svg{display:block;pointer-events:none;width:12px;height:12px}@media ( prefers-reduced-motion:reduce ){button{transition-duration:0.01ms}:host( [ variant='detach' ] ) button:hover{transform:none}}`;
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
  _WpdTabChip.styles = [styles];
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
  const factory = {
    createWindow(cfg) {
      return new Window(cfg);
    }
  };
  window.desktopModeWindowSystem = factory;
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
      if (options.danger) {
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
  const wpdConfirmDialog = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    WpdConfirmDialog,
    wpdConfirm
  }, Symbol.toStringTag, { value: "Module" }));
})();
