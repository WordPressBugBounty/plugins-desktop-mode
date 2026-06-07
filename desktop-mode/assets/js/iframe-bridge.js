(function() {
  "use strict";
  (function() {
    if (!window.parent || window.parent === window) {
      return;
    }
    const w = window;
    if (w.wp?.desktop?.iframe) {
      return;
    }
    const parentOrigin = window.location.origin;
    const connections = {};
    const connectionListeners = [];
    const subs = {};
    let _windowId = null;
    const _windowIdWaiters = [];
    const _setWindowId = (id) => {
      if (!id || _windowId === id) {
        return;
      }
      _windowId = id;
      const waiters = _windowIdWaiters.splice(0);
      for (const waiter of waiters) {
        try {
          waiter(id);
        } catch {
        }
      }
    };
    const channelSubs = {};
    const emitToParent = (connectionId, topic, payload) => {
      try {
        window.parent.postMessage(
          {
            type: "desktop-mode-bridge-publish",
            connectionId,
            topic,
            payload
          },
          parentOrigin
        );
      } catch {
      }
    };
    window.addEventListener("message", (ev) => {
      if (ev.origin !== parentOrigin) {
        return;
      }
      const data = ev?.data;
      if (!data || typeof data !== "object" || typeof data.type !== "string") {
        return;
      }
      if (data.type === "desktop-mode-bridge-handshake" && typeof data.connectionId === "string") {
        const tw = data.targetWindowId;
        if (typeof tw === "string" && tw !== "") {
          _setWindowId(tw);
        }
        if (connections[data.connectionId]) {
          try {
            window.parent.postMessage(
              {
                type: "desktop-mode-bridge-handshake-ack",
                connectionId: data.connectionId
              },
              parentOrigin
            );
          } catch {
          }
          return;
        }
        const conn = {
          id: data.connectionId,
          topics: Array.isArray(data.topics) ? data.topics.slice() : []
        };
        connections[conn.id] = conn;
        try {
          window.parent.postMessage(
            {
              type: "desktop-mode-bridge-handshake-ack",
              connectionId: conn.id
            },
            parentOrigin
          );
        } catch {
        }
        for (const listener of connectionListeners) {
          try {
            listener({ id: conn.id, topics: conn.topics.slice() });
          } catch {
          }
        }
        return;
      }
      if (data.type === "desktop-mode-bridge-publish" && typeof data.topic === "string") {
        const meta = {
          topic: data.topic,
          connectionId: data.connectionId
        };
        const bucket = subs[data.topic];
        if (bucket) {
          for (const cb of bucket) {
            try {
              cb(data.payload, meta);
            } catch {
            }
          }
        }
        const wildcard = subs["*"];
        if (wildcard) {
          for (const cb of wildcard) {
            try {
              cb(data.payload, meta);
            } catch {
            }
          }
        }
        return;
      }
      if (data.type === "desktop-mode-bridge-disconnect" && typeof data.connectionId === "string") {
        delete connections[data.connectionId];
      }
      if (data.type === "desktop-mode-window-send" && typeof data.channel === "string") {
        const d = data;
        const meta = { channel: d.channel };
        const bucket = channelSubs[d.channel];
        if (bucket) {
          for (const cb of bucket.slice()) {
            try {
              cb(d.payload, meta);
            } catch {
            }
          }
        }
        const wildcard = channelSubs["*"];
        if (wildcard) {
          for (const cb of wildcard.slice()) {
            try {
              cb(d.payload, meta);
            } catch {
            }
          }
        }
      }
    });
    const iframeApi = {
      publish(topic, payload) {
        if (typeof topic !== "string" || topic === "") {
          return;
        }
        const ids = Object.keys(connections);
        if (ids.length === 0) {
          console.warn(
            '[desktop-mode] wp.desktop.iframe.publish dropped: no open connection for topic "%s". The parent shell must call `wp.desktop.connect(windowId)` first.',
            topic
          );
          return;
        }
        for (const id of ids) {
          emitToParent(id, topic, payload);
        }
      },
      subscribe(topic, cb) {
        if (typeof topic !== "string" || topic === "" || typeof cb !== "function") {
          return () => {
          };
        }
        let bucket = subs[topic];
        if (!bucket) {
          bucket = [];
          subs[topic] = bucket;
        }
        bucket.push(cb);
        return () => {
          const i = bucket.indexOf(cb);
          if (i >= 0) {
            bucket.splice(i, 1);
          }
        };
      },
      onConnection(cb) {
        if (typeof cb !== "function") {
          return () => {
          };
        }
        connectionListeners.push(cb);
        for (const id of Object.keys(connections)) {
          try {
            cb({
              id: connections[id].id,
              topics: connections[id].topics.slice()
            });
          } catch {
          }
        }
        return () => {
          const i = connectionListeners.indexOf(cb);
          if (i >= 0) {
            connectionListeners.splice(i, 1);
          }
        };
      },
      /**
       * Iframe-initiated connection request. Asks the parent to open
       * a connection back to this iframe. Returns a Promise that
       * resolves with the new `{ id, topics }` once the parent acks
       * (or rejects on timeout / refusal).
       *
       * Parent-side handler: see `src/connection/index.ts`
       * `handleConnectionRequest` + the
       * `desktop-mode.iframe.connection-request` filter.
       */
      chrome: {
        setTheme(tokens) {
          try {
            window.parent.postMessage(
              {
                type: "desktop-mode-chrome-theme",
                tokens: tokens ?? {}
              },
              parentOrigin
            );
          } catch {
          }
        },
        setControls(config) {
          try {
            window.parent.postMessage(
              {
                type: "desktop-mode-chrome-controls",
                config: config ?? null
              },
              parentOrigin
            );
          } catch {
          }
        },
        setSlot(name, html) {
          if (typeof name !== "string" || name === "") {
            return;
          }
          try {
            window.parent.postMessage(
              {
                type: "desktop-mode-chrome-slot",
                slot: name,
                html: typeof html === "string" ? html : ""
              },
              parentOrigin
            );
          } catch {
          }
        }
      },
      requestConnection(opts) {
        const o = opts ?? {};
        const topics = Array.isArray(o.topics) ? o.topics.slice() : [];
        const requestId = "wpdir-" + Math.random().toString(36).slice(2, 10);
        return new Promise((resolve, reject) => {
          let settled = false;
          const timeoutMs = typeof o.timeoutMs === "number" ? o.timeoutMs : 5e3;
          const settle = (ok, value) => {
            if (settled) {
              return;
            }
            settled = true;
            window.removeEventListener("message", onAck);
            clearTimeout(timer);
            if (ok) {
              resolve(value);
            } else {
              reject(value);
            }
          };
          const onAck = (ev) => {
            if (ev.origin !== parentOrigin) {
              return;
            }
            const d = ev?.data;
            if (!d || typeof d !== "object" || d.type !== "desktop-mode-bridge-connection-ack" || d.requestId !== requestId) {
              return;
            }
            if (d.accepted) {
              const summary = {
                id: typeof d.connectionId === "string" ? d.connectionId : "",
                topics: topics.slice()
              };
              if (typeof o.onOpen === "function") {
                try {
                  o.onOpen(summary);
                } catch {
                }
              }
              settle(true, summary);
            } else {
              settle(false, new Error(d.reason || "rejected"));
            }
          };
          window.addEventListener("message", onAck);
          const timer = setTimeout(() => {
            settle(false, new Error("timeout"));
          }, timeoutMs);
          try {
            window.parent.postMessage(
              {
                type: "desktop-mode-bridge-connection-request",
                requestId,
                topics
              },
              parentOrigin
            );
          } catch (err) {
            settle(false, err);
          }
        });
      },
      get windowId() {
        return _windowId;
      },
      whenWindowId() {
        if (_windowId !== null) {
          return Promise.resolve(_windowId);
        }
        return new Promise((resolve) => {
          _windowIdWaiters.push(resolve);
        });
      },
      isParentReachable() {
        if (!window.parent || window.parent === window) {
          return false;
        }
        try {
          const parentOrig = window.parent.location.origin;
          return parentOrig === parentOrigin;
        } catch {
          return false;
        }
      }
    };
    if (!w.wp) {
      w.wp = {};
    }
    if (!w.wp.desktop) {
      w.wp.desktop = {};
    }
    w.wp.desktop.iframe = iframeApi;
    if (typeof w.wp.desktop.send !== "function") {
      w.wp.desktop.send = (channel, payload) => {
        if (typeof channel !== "string" || channel === "") {
          return;
        }
        try {
          window.parent.postMessage(
            {
              type: "desktop-mode-window-publish",
              channel,
              payload
            },
            parentOrigin
          );
        } catch {
        }
      };
    }
    if (typeof w.wp.desktop.on !== "function") {
      w.wp.desktop.on = (channel, cb) => {
        if (typeof channel !== "string" || channel === "" || typeof cb !== "function") {
          return () => void 0;
        }
        let bucket = channelSubs[channel];
        if (!bucket) {
          bucket = [];
          channelSubs[channel] = bucket;
        }
        bucket.push(cb);
        return () => {
          const i = bucket.indexOf(cb);
          if (i >= 0) {
            bucket.splice(i, 1);
          }
        };
      };
    }
    const sentinelHost = window;
    if (!sentinelHost.__desktopModeScreenMetaInstalled) {
      sentinelHost.__desktopModeScreenMetaInstalled = true;
      installScreenMetaHoist(parentOrigin);
    }
    if (!sentinelHost.__desktopModeOsFileDropForwarderInstalled) {
      sentinelHost.__desktopModeOsFileDropForwarderInstalled = true;
      const hasFiles = (ev) => {
        const types = ev.dataTransfer?.types;
        if (!types) {
          return false;
        }
        const list = types;
        if (typeof list.includes === "function") {
          return list.includes("Files");
        }
        if (typeof list.contains === "function") {
          return list.contains("Files");
        }
        for (let i = 0; i < list.length; i++) {
          if (list[i] === "Files") {
            return true;
          }
        }
        return false;
      };
      const dropPassthroughSelectors = [
        ".components-drop-zone",
        "[data-drop-zone]",
        ".uploader-window",
        ".media-frame-content"
      ];
      const targetWantsFile = (target) => {
        const el = target;
        if (!el || !el.closest) {
          return false;
        }
        for (const sel of dropPassthroughSelectors) {
          if (el.closest(sel)) {
            return true;
          }
        }
        return false;
      };
      document.addEventListener(
        "dragover",
        (ev) => {
          if (!hasFiles(ev)) {
            return;
          }
          if (targetWantsFile(ev.target)) {
            return;
          }
          if (ev.defaultPrevented) {
            return;
          }
          ev.preventDefault();
          if (ev.dataTransfer) {
            ev.dataTransfer.dropEffect = "copy";
          }
        },
        false
      );
      document.addEventListener(
        "drop",
        (ev) => {
          if (!hasFiles(ev)) {
            return;
          }
          if (targetWantsFile(ev.target)) {
            return;
          }
          if (ev.defaultPrevented) {
            return;
          }
          ev.preventDefault();
          ev.stopPropagation();
          const files = [];
          if (ev.dataTransfer?.files) {
            for (let i = 0; i < ev.dataTransfer.files.length; i++) {
              files.push(ev.dataTransfer.files[i]);
            }
          }
          if (files.length === 0) {
            return;
          }
          try {
            window.parent.postMessage(
              {
                type: "desktop-mode-os-file-drop",
                files,
                x: ev.clientX,
                y: ev.clientY
              },
              parentOrigin
            );
          } catch {
          }
        },
        false
      );
    }
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: "desktop-mode-ready" },
          parentOrigin
        );
      }
    } catch {
    }
    function installScreenMetaHoist(origin) {
      const hasScreenOptionsContent = () => {
        const wrap = document.getElementById("screen-options-wrap");
        return !!wrap && !!wrap.querySelector(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
        );
      };
      const hasHelpContent = () => {
        const wrap = document.getElementById("contextual-help-wrap");
        if (!wrap) {
          return false;
        }
        const panelEls = wrap.querySelectorAll(
          ".help-tab-content, .contextual-help-sidebar"
        );
        for (let i = 0; i < panelEls.length; i++) {
          if ((panelEls[i].textContent || "").trim() !== "") {
            return true;
          }
        }
        return false;
      };
      const start = () => {
        const links = document.getElementById("screen-meta-links");
        const screenOptionsBtn = links ? document.getElementById("show-settings-link") : null;
        const helpBtn = links ? document.getElementById("contextual-help-link") : null;
        const panels = [];
        if (screenOptionsBtn && hasScreenOptionsContent()) {
          panels.push("screen-options");
        }
        if (helpBtn && hasHelpContent()) {
          panels.push("help");
        }
        try {
          window.parent.postMessage(
            { type: "desktop-mode-screen-meta", panels },
            origin
          );
        } catch {
        }
        if (panels.length === 0) {
          return;
        }
        const getOpenPanel = () => {
          if (screenOptionsBtn && screenOptionsBtn.getAttribute("aria-expanded") === "true") {
            return "screen-options";
          }
          if (helpBtn && helpBtn.getAttribute("aria-expanded") === "true") {
            return "help";
          }
          return null;
        };
        const reportState = () => {
          try {
            window.parent.postMessage(
              {
                type: "desktop-mode-screen-meta-state",
                open: getOpenPanel()
              },
              origin
            );
          } catch {
          }
        };
        reportState();
        const observer = new MutationObserver(reportState);
        if (screenOptionsBtn) {
          observer.observe(screenOptionsBtn, {
            attributes: true,
            attributeFilter: ["aria-expanded"]
          });
        }
        if (helpBtn) {
          observer.observe(helpBtn, {
            attributes: true,
            attributeFilter: ["aria-expanded"]
          });
        }
        const forceClose = (button) => {
          if (!button || button.getAttribute("aria-expanded") !== "true") {
            return;
          }
          const panelId = button.getAttribute("aria-controls");
          const panel = panelId ? document.getElementById(panelId) : null;
          if (!panel) {
            return;
          }
          const jq = window.jQuery;
          if (jq) {
            try {
              jq(panel).stop(true, false);
            } catch {
            }
          }
          panel.style.display = "none";
          panel.classList.add("hidden");
          if (panel.parentElement) {
            panel.parentElement.style.display = "none";
          }
          button.classList.remove("screen-meta-active");
          button.setAttribute("aria-expanded", "false");
          const toggles = document.querySelectorAll(
            ".screen-meta-toggle"
          );
          toggles.forEach((t) => {
            t.style.visibility = "";
          });
        };
        window.addEventListener("message", (e) => {
          if (e.origin !== origin) {
            return;
          }
          const d = e.data;
          if (!d || d.type !== "desktop-mode-toggle-panel") {
            return;
          }
          let target = null;
          if (d.panel === "screen-options" && screenOptionsBtn) {
            target = screenOptionsBtn;
          } else if (d.panel === "help" && helpBtn) {
            target = helpBtn;
          }
          if (!target) {
            return;
          }
          if (target.getAttribute("aria-expanded") !== "true") {
            forceClose(
              target === screenOptionsBtn ? helpBtn : screenOptionsBtn
            );
          }
          target.click();
        });
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
      } else {
        start();
      }
    }
  })();
})();
