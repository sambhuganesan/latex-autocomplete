// ghost.js — ghost text overlay UI

const LatexGhost = (() => {
  let overlayEl = null;
  let activeEditor = null;
  let acceptCallback = null;
  let dismissCallback = null;
  let keyHandler = null;
  let allForms = [];
  let formIndex = 0;

  function getOrCreateOverlay() {
    if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'latex-ghost-overlay';
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.setAttribute('data-latex-ghost', '1');
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  // ---------------------------------------------------------------------------
  // Cursor position detection
  // ---------------------------------------------------------------------------

  function getCM6CursorRect() {
    const cursor = document.querySelector('.cm-cursor');
    if (!cursor) return null;
    return cursor.getBoundingClientRect();
  }

  function getContenteditableCursorRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rects = range.getClientRects();
    if (rects.length === 0) {
      const container = range.startContainer;
      if (container.nodeType === Node.ELEMENT_NODE) {
        return container.getBoundingClientRect();
      }
      return null;
    }
    return rects[rects.length - 1];
  }

  function getTextareaCursorRect(textarea) {
    const pos = textarea.selectionEnd;
    const computed = window.getComputedStyle(textarea);

    const mirror = document.createElement('div');
    mirror.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      visibility: hidden;
      overflow: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      box-sizing: ${computed.boxSizing};
      width: ${textarea.clientWidth}px;
      padding: ${computed.padding};
      border: ${computed.border};
      font: ${computed.font};
      letter-spacing: ${computed.letterSpacing};
      line-height: ${computed.lineHeight};
      tab-size: ${computed.tabSize};
    `;

    const textBefore = textarea.value.slice(0, pos);
    mirror.textContent = textBefore;

    const markerSpan = document.createElement('span');
    markerSpan.textContent = '\u200B';
    mirror.appendChild(markerSpan);
    document.body.appendChild(mirror);

    const textareaRect = textarea.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const spanRect = markerSpan.getBoundingClientRect();

    const relLeft = spanRect.left - mirrorRect.left;
    const relTop  = spanRect.top  - mirrorRect.top;

    document.body.removeChild(mirror);

    return {
      left:   textareaRect.left + relLeft - textarea.scrollLeft + textarea.clientLeft,
      top:    textareaRect.top  + relTop  - textarea.scrollTop  + textarea.clientTop,
      right:  textareaRect.left + relLeft - textarea.scrollLeft + textarea.clientLeft,
      height: parseInt(computed.lineHeight || '16'),
    };
  }

  function getCursorRect(editorEl) {
    if (!editorEl) return null;
    if (editorEl.tagName === 'TEXTAREA') return getTextareaCursorRect(editorEl);
    if (editorEl.classList && editorEl.classList.contains('cm-content')) return getCM6CursorRect();
    if (editorEl.isContentEditable) return getContenteditableCursorRect();
    return null;
  }

  // ---------------------------------------------------------------------------
  // Show / hide / cycle
  // ---------------------------------------------------------------------------

  function updateOverlayText() {
    const el = getOrCreateOverlay();
    const text = allForms[formIndex];
    const hint = allForms.length > 1
      ? `  ↑↓ (${formIndex + 1}/${allForms.length})`
      : '';
    el.textContent = text + hint;
  }

  function show(forms, editorEl, onAccept, onDismiss) {
    dismiss();

    if (!forms || forms.length === 0) return;
    const rect = getCursorRect(editorEl);
    if (!rect) return;

    activeEditor    = editorEl;
    acceptCallback  = onAccept;
    dismissCallback = onDismiss;
    allForms        = forms;
    formIndex       = 0;

    const el = getOrCreateOverlay();
    el.style.left       = (rect.right ?? (rect.left + (rect.width || 0))) + 'px';
    el.style.top        = (rect.top  ?? rect.y) + 'px';
    el.style.lineHeight = (rect.height || 20) + 'px';
    el.classList.add('visible');
    updateOverlayText();

    keyHandler = (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const cb = acceptCallback;
        const accepted = allForms[formIndex];
        dismiss();
        if (cb) cb(accepted);

      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        formIndex = (formIndex - 1 + allForms.length) % allForms.length;
        updateOverlayText();

      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopImmediatePropagation();
        formIndex = (formIndex + 1) % allForms.length;
        updateOverlayText();

      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const cb = dismissCallback;
        dismiss();
        if (cb) cb();

      } else if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', ' '].includes(e.key)) {
        const cb = dismissCallback;
        dismiss();
        if (cb) cb();
      }
    };

    document.addEventListener('keydown', keyHandler, { capture: true });
  }

  function dismiss() {
    if (overlayEl) overlayEl.classList.remove('visible');
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, { capture: true });
      keyHandler = null;
    }
    activeEditor    = null;
    acceptCallback  = null;
    dismissCallback = null;
    allForms        = [];
    formIndex       = 0;
  }

  function isVisible() {
    return overlayEl && overlayEl.classList.contains('visible');
  }

  return { show, dismiss, isVisible };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LatexGhost;
}
