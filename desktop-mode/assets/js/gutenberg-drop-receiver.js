var desktopModeGutenbergDropReceiver = function(exports) {
  "use strict";
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function isSafeUrl(raw) {
    const lower = raw.trimStart().toLowerCase();
    if (lower.startsWith("javascript:")) {
      return false;
    }
    if (lower.startsWith("data:")) {
      return false;
    }
    if (lower.startsWith("vbscript:")) {
      return false;
    }
    return true;
  }
  function buildBlockSpec(payload) {
    if (payload.kind === "attachment") {
      if (!payload.url || !isSafeUrl(payload.url)) {
        return null;
      }
      const mime = payload.mime || "";
      if (mime.startsWith("image/")) {
        return {
          name: "core/image",
          attributes: {
            id: payload.id,
            url: payload.url,
            alt: payload.alt || "",
            caption: ""
          }
        };
      }
      if (mime.startsWith("video/")) {
        return {
          name: "core/video",
          attributes: {
            id: payload.id,
            src: payload.url
          }
        };
      }
      if (mime.startsWith("audio/")) {
        return {
          name: "core/audio",
          attributes: {
            id: payload.id,
            src: payload.url
          }
        };
      }
      return {
        name: "core/file",
        attributes: {
          id: payload.id,
          href: payload.url,
          fileName: payload.title
        }
      };
    }
    if (!payload.url || !isSafeUrl(payload.url)) {
      return null;
    }
    const safeTitle = escapeHtml(payload.title || payload.url);
    const safeHref = escapeHtml(payload.url);
    return {
      name: "core/paragraph",
      attributes: {
        content: `<a href="${safeHref}">${safeTitle}</a>`
      }
    };
  }
  async function waitForEditor() {
    return new Promise((resolve, reject) => {
      let ticks = 0;
      const MAX_TICKS = 300;
      const tick = () => {
        const wp = window.wp;
        if (wp?.blocks && wp.data) {
          resolve({ blocks: wp.blocks, data: wp.data });
          return;
        }
        ticks++;
        if (ticks > MAX_TICKS) {
          reject(
            new Error(
              "desktop-mode/gutenberg-drop-receiver: timed out waiting for wp.blocks + wp.data"
            )
          );
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }
  async function performInsert(payload) {
    const spec = buildBlockSpec(payload);
    if (!spec) {
      return;
    }
    const { blocks, data } = await waitForEditor();
    const block = blocks.createBlock(spec.name, spec.attributes);
    data.dispatch("core/block-editor").insertBlocks([block]);
  }
  function notifyParentOfFailure(reason) {
    if (window.parent === window) {
      return;
    }
    try {
      window.parent.postMessage(
        { type: "desktop-mode-drop-failed", reason },
        window.location.origin
      );
    } catch {
    }
  }
  function isDropMsg(m) {
    if (!m || typeof m !== "object") {
      return false;
    }
    const obj = m;
    if (obj.type !== "desktop-mode-drop") {
      return false;
    }
    const p = obj.payload;
    if (!p || typeof p !== "object") {
      return false;
    }
    return p.kind === "attachment" || p.kind === "post" || p.kind === "user";
  }
  function isDragOverMsg(m) {
    if (!m || typeof m !== "object") {
      return false;
    }
    const obj = m;
    if (obj.type !== "desktop-mode-drag-over") {
      return false;
    }
    const p = obj.payload;
    if (!p || typeof p !== "object") {
      return false;
    }
    return p.kind === "attachment" || p.kind === "post" || p.kind === "user";
  }
  function isDragLeaveMsg(m) {
    if (!m || typeof m !== "object") {
      return false;
    }
    return m.type === "desktop-mode-drag-leave";
  }
  let stashedBridgePayload = null;
  const _debugCounters = {
    dragOverMsgs: 0,
    dragLeaveMsgs: 0,
    nativeDrops: 0,
    nativeDropsWithStash: 0,
    docsAttached: 0
  };
  function onNativeDrop(e) {
    _debugCounters.nativeDrops++;
    if (!stashedBridgePayload) {
      return;
    }
    _debugCounters.nativeDropsWithStash++;
    const payload = stashedBridgePayload;
    stashedBridgePayload = null;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }
    void performInsert(payload).catch((err) => {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        "[desktop-mode] Gutenberg drop receiver native-drop insert failed:",
        err
      );
      notifyParentOfFailure(reason);
    });
  }
  function onNativeDragOver(e) {
    if (!stashedBridgePayload) {
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }
  function attachToDocument(doc) {
    const sentinel = doc;
    if (sentinel.__desktopModeDropReceiverAttached) {
      return;
    }
    sentinel.__desktopModeDropReceiverAttached = true;
    doc.addEventListener("drop", onNativeDrop, true);
    doc.addEventListener("dragover", onNativeDragOver, true);
    _debugCounters.docsAttached++;
  }
  function attachToAllFrames() {
    attachToDocument(document);
    document.querySelectorAll("iframe").forEach((iframe) => {
      try {
        const innerDoc = iframe.contentDocument;
        if (innerDoc) {
          attachToDocument(innerDoc);
        }
      } catch {
      }
    });
  }
  function install() {
    const expectedOrigin = window.location.origin;
    window.addEventListener("message", (e) => {
      if (e.origin !== expectedOrigin) {
        return;
      }
      if (isDragOverMsg(e.data)) {
        stashedBridgePayload = e.data.payload;
        _debugCounters.dragOverMsgs++;
        return;
      }
      if (isDragLeaveMsg(e.data)) {
        stashedBridgePayload = null;
        _debugCounters.dragLeaveMsgs++;
        return;
      }
      if (!isDropMsg(e.data)) {
        return;
      }
      stashedBridgePayload = null;
      void performInsert(e.data.payload).catch((err) => {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(
          "[desktop-mode] Gutenberg drop receiver insert failed:",
          err
        );
        notifyParentOfFailure(reason);
      });
    });
    attachToAllFrames();
    if (typeof MutationObserver !== "undefined" && document.documentElement) {
      new MutationObserver(() => attachToAllFrames()).observe(
        document.documentElement,
        { childList: true, subtree: true }
      );
    }
    document.addEventListener(
      "load",
      (e) => {
        if (e.target instanceof HTMLIFrameElement) {
          attachToAllFrames();
        }
      },
      true
    );
    window.__desktopModeDropReceiverDebug = () => ({
      ..._debugCounters,
      hasStash: stashedBridgePayload !== null,
      stashKind: stashedBridgePayload?.kind ?? null,
      iframesNow: document.querySelectorAll("iframe").length
    });
  }
  install();
  exports.buildBlockSpec = buildBlockSpec;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
}({});
