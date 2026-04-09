// ghost.js — ghost text overlay UI
//
// Creates a fixed-position overlay div that shows the computed result
// as "ghost text" immediately after the cursor.

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

  // For CodeMirror 6: locate .cm-cursor element position
  function getCM6CursorRect() {
    const cursor = document.querySelector('.cm-cursor');
    if (!cursor) return null;
    return cursor.getBoundingClientRect();
  }

  // For contenteditable: use the Selection API
  function getContenteditableCursorRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rects = range.getClientRects();
    if (rects.length === 0) {
      // Fallback: use the bounding rect of the range container
      const container = range.startContainer;
      if (container.nodeType === Node.ELEMENT_NODE) {
        return container.getBoundingClientRect();
      }
      return null;
    }
    return rects[rects.length - 1];
  }

  // For textarea elements: mirror-div technique
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
    markerSpan.textContent = '\u200B'; // zero-width space as cursor marker
    mirror.appendChild(markerSpan);

    document.body.appendChild(mirror);

    const textareaRect = textarea.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const spanRect = markerSpan.getBoundingClientRect();

    // Offset from mirror's top-left to the span
    const relLeft = spanRect.left - mirrorRect.left;
    const relTop  = spanRect.top  - mirrorRect.top;

    document.body.removeChild(mirror);

    return {
      left: textareaRect.left + relLeft - textarea.scrollLeft + textarea.clientLeft,
      top:  textareaRect.top  + relTop  - textarea.scrollTop  + textarea.clientTop,
      right: textareaRect.left + relLeft - textarea.scrollLeft + textarea.clientLeft,
      bottom: textareaRect.top + relTop - textarea.scrollTop + textarea.clientTop + parseInt(computed.lineHeight || '16'),
      height: parseInt(computed.lineHeight || '16'),
    };
  }

  function getCursorRect(editorEl) {
    if (!editorEl) return null;

    // Textarea — must check before contenteditable (textarea is not contenteditable)
    if (editorEl.tagName === 'TEXTAREA') {
      return getTextareaCursorRect(editorEl);
    }
    // CodeMirror 6 — .cm-content element passed directly
    if (editorEl.classList && editorEl.classList.contains('cm-content')) {
      return getCM6CursorRect();
    }
    // Contenteditable (Google Docs, HackMD, etc.)
    if (editorEl.isContentEditable) {
      return getContenteditableCursorRect();
    }

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

  // forms: string[]  — array of representations, most-exact first
  function show(forms, editorEl, onAccept, onDismiss) {
    dismiss(); // clear any existing ghost

    if (!forms || forms.length === 0) return;
    const rect = getCursorRect(editorEl);
    if (!rect) return;

    activeEditor    = editorEl;
    acceptCallback  = onAccept;
    dismissCallback = onDismiss;
    allForms        = forms;
    formIndex       = 0;

    const el = getOrCreateOverlay();
    // 6px gap so ghost doesn't sit flush against the cursor / = sign
    el.style.left       = ((rect.right ?? (rect.left + (rect.width || 0))) + 6) + 'px';
    el.style.top        = (rect.top ?? rect.y) + 'px';
    el.style.lineHeight = (rect.height || 20) + 'px';
    // Match the editor font so ghost text is the same size
    if (editorEl) {
      const cs = window.getComputedStyle(editorEl);
      el.style.fontSize   = cs.fontSize;
      el.style.fontFamily = cs.fontFamily;
    }
    el.classList.add('visible');
    updateOverlayText();

    // Key handler — capture phase so we intercept before the editor
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

      } else if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        // Any other printable key → dismiss, let it through
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
