// content.js — Main content script

(function () {
  'use strict';

  let _enabled = true, _format = 'auto';
  LatexSettings.load((s)    => { _enabled = s.enabled; _format = s.format; });
  LatexSettings.onChange((s) => { _enabled = s.enabled; _format = s.format; });
  const LOG = (...a) => console.log('[LaTeX]', ...a);

  // ---------------------------------------------------------------------------
  // Keystroke buffer
  //
  // We track every keydown from the moment an opening math delimiter is typed.
  // On '=' we compute directly from the buffered string — no DOM reading needed.
  // This works for CM6 (Overleaf), Google Docs iframe, and any other editor.
  // ---------------------------------------------------------------------------

  let _buf  = null; // null = outside math; string = content since delimiter
  let _prev = '';   // previous key, for two-char delimiters (\[  \(  $$)

  function bufReset() { _buf = null; _prev = ''; }

  function bufHandleKey(key) {
    // Cursor movement invalidates our tracked position
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
         'Home','End','PageUp','PageDown'].includes(key)) { bufReset(); return; }
    if (key === 'Escape') { bufReset(); return; }

    if (key === 'Backspace') {
      if (_buf !== null) { _buf.length > 0 ? (_buf = _buf.slice(0, -1)) : bufReset(); }
      else { _prev = ''; }
      return;
    }

    if (key.length !== 1) return; // Tab, Enter, F-keys — ignore

    // ── Inside a math environment ─────────────────────────────────────────────
    if (_buf !== null) {
      if (key === '$') { bufReset(); return; }                                              // closing $
      if (key === ']' && _prev === '\\') { _buf = _buf.slice(0, -1); bufReset(); return; } // \]
      if (key === ')' && _prev === '\\') { _buf = _buf.slice(0, -1); bufReset(); return; } // \)
      _buf += key;
      _prev = key;
      return;
    }

    // ── Outside math — watch for opening delimiters ───────────────────────────
    if (key === '$') {
      if (_prev === '$') { _buf = ''; _prev = ''; }  // $$ opener
      else               { _prev = '$'; }              // single $ or first of $$
      return;
    }
    if ((key === '[' || key === '(') && _prev === '\\') {
      _buf = ''; _prev = ''; return;                   // \[  or  \(
    }
    if (_prev === '$') {
      // Single $ was the opener; this key is the first char of math content
      _buf = key; _prev = key; return;
    }
    _prev = key;
  }

  // ---------------------------------------------------------------------------
  // Math scanner — used by textarea / contenteditable input-event path only
  // ---------------------------------------------------------------------------

  function extractMathBeforeEquals(text) {
    let inMath = false, mathStart = -1, i = 0;
    const len = text.length;
    while (i < len) {
      if (text[i] === '\\' && i + 1 < len) {
        const n = text[i + 1];
        if (n === '[' || n === '(') { if (!inMath) { inMath = true;  mathStart = i + 2; } i += 2; continue; }
        if (n === ']' || n === ')') { if  (inMath) { inMath = false; mathStart = -1;    } i += 2; continue; }
        i += 2; continue;
      }
      if (text[i] === '$') {
        if (i + 1 < len && text[i + 1] === '$') { inMath = !inMath; mathStart = inMath ? i + 2 : -1; i += 2; }
        else                                     { inMath = !inMath; mathStart = inMath ? i + 1 : -1; i++;   }
        continue;
      }
      i++;
    }
    if (!inMath || mathStart < 0) return null;
    const content = text.slice(mathStart).trimEnd();
    if (!content.endsWith('=')) return null;
    return content.slice(0, -1).trim() || null;
  }

  // ---------------------------------------------------------------------------
  // Text before cursor — textarea / contenteditable only
  // ---------------------------------------------------------------------------

  function getTextBeforeCursor(target) {
    if (target && target.tagName === 'TEXTAREA') {
      return target.value.slice(0, target.selectionEnd);
    }
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const cur = sel.getRangeAt(0);

    // CM6: measure from start of .cm-content
    const cmContent = document.querySelector('.cm-content');
    if (cmContent) {
      try {
        const r = document.createRange();
        r.setStart(cmContent, 0);
        r.setEnd(cur.startContainer, cur.startOffset);
        return r.toString();
      } catch { return null; }
    }

    // Generic contenteditable: walk up to the root editable element
    let root = cur.startContainer.nodeType === Node.ELEMENT_NODE
      ? cur.startContainer : cur.startContainer.parentElement;
    while (root && root.parentElement && root.parentElement.isContentEditable) {
      root = root.parentElement;
    }
    if (!root || !root.isContentEditable) return null;
    try {
      const r = document.createRange();
      r.setStart(root, 0);
      r.setEnd(cur.startContainer, cur.startOffset);
      return r.toString();
    } catch { return null; }
  }

  // ---------------------------------------------------------------------------
  // CM6 view — used only for inserting text (preserves undo history)
  // ---------------------------------------------------------------------------

  function getCM6View() {
    let el = document.querySelector('.cm-content');
    while (el && el !== document.body) {
      try {
        for (const sym of Object.getOwnPropertySymbols(el)) {
          const v = el[sym];
          if (v?.state && typeof v.dispatch === 'function') return v;
        }
      } catch { }
      for (const k of ['cmView', '__view', '_view', 'view', 'CodeMirror', 'editor', '_codemirror']) {
        const v = el[k];
        if (v?.state && typeof v.dispatch === 'function') return v;
      }
      el = el.parentElement;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Insert text at cursor
  // ---------------------------------------------------------------------------

  function insertAtCursor(target, text) {
    if (!target) return;

    if (target.tagName === 'TEXTAREA') {
      const end = target.selectionEnd;
      target.value = target.value.slice(0, end) + text + target.value.slice(end);
      target.selectionStart = target.selectionEnd = end + text.length;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // CM6: proper transaction keeps undo history
    const view = getCM6View();
    if (view) {
      try {
        const pos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: pos, to: pos, insert: text },
          selection: { anchor: pos + text.length },
        });
        return;
      } catch (e) { LOG('CM6 dispatch failed:', e.message); }
    }

    // Contenteditable / Google Docs iframe
    document.execCommand('insertText', false, text);
  }

  // ---------------------------------------------------------------------------
  // Determine the best "target" element for ghost positioning and insertion
  // ---------------------------------------------------------------------------

  function resolveTarget() {
    // CM6 (Overleaf)
    const cmContent = document.querySelector('.cm-content');
    if (cmContent) return cmContent;
    // Active editable element (covers Google Docs iframe contenteditable)
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.isContentEditable)) return active;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Compute and show ghost text
  // ---------------------------------------------------------------------------

  function showResult(mathExpr, target) {
    LOG('expr:', mathExpr);
    const result = computeLatex(mathExpr, _format);
    if (!result.success) { LOG('compute failed:', result.error); return false; }
    const forms = getAllFormats(result.value);
    if (!forms.length) return false;
    LOG('showing:', forms);
    LatexGhost.show(
      forms, target,
      (text) => { bufReset(); insertAtCursor(target, text); },
      ()     => { bufReset(); }
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Global keydown — buffer-based, works for ALL editor types
  // (CM6/Overleaf, Google Docs iframe, plain contenteditable, etc.)
  // ---------------------------------------------------------------------------

  document.addEventListener('keydown', (e) => {
    // When ghost is cycling (↑/↓), don't touch the buffer — ghost.js owns those keys
    if (!LatexGhost.isVisible()) {
      bufHandleKey(e.key);
    }

    if (!_enabled || e.key !== '=' || LatexGhost.isVisible()) return;

    const target = resolveTarget();
    const bufExpr = _buf !== null ? _buf.slice(0, -1).trim() : null;

    requestAnimationFrame(() => {
      // Try buffer first — fast, no DOM needed
      if (bufExpr) {
        LOG('buffer expr:', bufExpr);
        if (showResult(bufExpr, target)) return;
        LOG('buffer compute failed, trying DOM fallback');
      }
      // DOM fallback — handles mismatches from auto-paired braces/delimiters
      const text = getTextBeforeCursor(target);
      if (!text || !text.trimEnd().endsWith('=')) return;
      const expr = extractMathBeforeEquals(text);
      if (!expr) { LOG('no math found'); return; }
      LOG('DOM expr:', expr);
      showResult(expr, target);
    });

  }, { capture: true });

  // Cursor jumps invalidate the buffer
  document.addEventListener('mousedown', bufReset, true);
  document.addEventListener('paste',     bufReset, true);

  // ---------------------------------------------------------------------------
  // Textarea & plain contenteditable — input-event path (no buffer needed)
  // ---------------------------------------------------------------------------

  function handleInput(e) {
    const t = e.target;
    if (!_enabled) return;
    // Skip CM6 — handled by keydown above
    if (t.classList?.contains('cm-content') || t.closest?.('.cm-editor')) return;
    const text = getTextBeforeCursor(t);
    if (!text || !text.trimEnd().endsWith('=')) return;
    // Quick "already answered" check using only what comes after cursor in this element
    const after = t.tagName === 'TEXTAREA'
      ? t.value.slice(t.selectionEnd).split('\n')[0]
      : '';
    if (after && after.replace(/^(\$\$|\$|\\\]|\\\))\s*/, '').length > 0) return;
    const expr = extractMathBeforeEquals(text);
    if (!expr) return;
    showResult(expr, t);
  }

  function attachTo(el) {
    if (el.dataset.latexAutocompute) return;
    el.dataset.latexAutocompute = '1';
    el.addEventListener('input', handleInput);
  }

  function scanAndAttach() {
    document.querySelectorAll('textarea').forEach(attachTo);
    document.querySelectorAll('[contenteditable="true"]').forEach((el) => {
      if (el.classList.contains('cm-content')) return;
      if (el.closest('.cm-editor')) return;
      if (el.offsetHeight < 40 && el.offsetWidth < 40) return;
      attachTo(el);
    });
  }

  scanAndAttach();
  new MutationObserver(() => scanAndAttach()).observe(document.body, { childList: true, subtree: true });

})();
