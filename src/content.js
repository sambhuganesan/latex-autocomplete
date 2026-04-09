// content.js — Main content script
//
// Handles three editor types:
//   1. <textarea>          — via input event
//   2. contenteditable     — via input event + Selection API
//   3. CodeMirror 6 (Overleaf) — via keydown + setTimeout + CM6 state API

(function () {
  'use strict';

  let _enabled = true;
  let _format  = 'auto';

  LatexSettings.load((s)  => { _enabled = s.enabled; _format = s.format; });
  LatexSettings.onChange((s) => { _enabled = s.enabled; _format = s.format; });

  // ---------------------------------------------------------------------------
  // Math delimiter detection
  // ---------------------------------------------------------------------------

  function extractMathBeforeEquals(textUpToCursor) {
    let inMath = false, mathStart = -1, i = 0;
    const t = textUpToCursor, len = t.length;

    while (i < len) {
      if (t[i] === '\\' && i + 1 < len) {
        const next = t[i + 1];
        if (next === '[' || next === '(') {
          if (!inMath) { inMath = true; mathStart = i + 2; }
          i += 2; continue;
        }
        if (next === ']' || next === ')') {
          if (inMath) { inMath = false; mathStart = -1; }
          i += 2; continue;
        }
        i += 2; continue;
      }
      if (t[i] === '$') {
        if (i + 1 < len && t[i + 1] === '$') {
          inMath = !inMath; mathStart = inMath ? i + 2 : -1; i += 2;
        } else {
          inMath = !inMath; mathStart = inMath ? i + 1 : -1; i++;
        }
        continue;
      }
      i++;
    }

    if (!inMath || mathStart < 0) return null;
    let content = t.slice(mathStart).trimEnd();
    if (!content.endsWith('=')) return null;
    return content.slice(0, -1).trim() || null;
  }

  // Returns true if there's real content after '=' (closing delimiters don't count)
  function alreadyHasAnswer(textBefore, fullText) {
    const rest = fullText.slice(textBefore.length);
    const line = rest.split('\n')[0].trim();
    if (!line) return false;
    return line.replace(/^(\$\$|\$|\\\]|\\\))\s*/, '').length > 0;
  }

  // ---------------------------------------------------------------------------
  // CodeMirror 6 support
  // ---------------------------------------------------------------------------

  // CM6 stores the EditorView on .cm-content as .cmView (set in @codemirror/view)
  function getCM6View() {
    const contentEl = document.querySelector('.cm-content');
    if (!contentEl) return null;

    // Primary: CM6 stores view on contentDOM under .cmView
    let view = contentEl.cmView || contentEl.__view;
    if (view?.state) return view;

    // Secondary: try the wrapper .cm-editor
    const editorEl = document.querySelector('.cm-editor');
    if (!editorEl) return null;
    view = editorEl.cmView || editorEl.__view || editorEl._codemirror;
    if (view?.state) return view;

    // Last resort: Symbol-keyed property
    try {
      const sym = Object.getOwnPropertySymbols(contentEl)
        .find(s => s.toString().toLowerCase().includes('view'));
      if (sym) { view = contentEl[sym]; if (view?.state) return view; }
    } catch { /* ignore */ }

    return null;
  }

  function handleCM6Equals() {
    if (!document.querySelector('.cm-editor')) return;

    const view = getCM6View();
    let textBefore = '';
    let fullText   = '';

    if (view) {
      // Full accuracy: use CM6 state (not limited to visible DOM lines)
      const pos = view.state.selection.main.head;
      textBefore = view.state.doc.sliceString(0, pos);
      fullText   = view.state.doc.toString();
    } else {
      // Fallback: read the current line from the DOM
      // Only works for single-line math, but better than nothing
      const activeLine = document.querySelector('.cm-activeLine');
      if (!activeLine) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0).cloneRange();
      try { range.setStart(activeLine, 0); } catch { return; }
      textBefore = range.toString();
      fullText   = textBefore;
    }

    if (!textBefore.trimEnd().endsWith('=')) return;
    if (alreadyHasAnswer(textBefore, fullText)) return;

    const mathExpr = extractMathBeforeEquals(textBefore);
    if (!mathExpr) return;

    const result = computeLatex(mathExpr, _format);
    if (!result.success) return;

    const forms = getAllFormats(result.value);
    if (!forms.length) return;

    const cmContent = document.querySelector('.cm-content');
    LatexGhost.show(
      forms,
      cmContent,
      (text) => insertAtCursor(cmContent, text),
      null
    );
  }

  // ---------------------------------------------------------------------------
  // Insert text at cursor
  // ---------------------------------------------------------------------------

  function insertAtCursor(editorEl, text) {
    if (!editorEl) return;

    if (editorEl.tagName === 'TEXTAREA') {
      const end = editorEl.selectionEnd;
      editorEl.value = editorEl.value.slice(0, end) + text + editorEl.value.slice(end);
      editorEl.selectionStart = editorEl.selectionEnd = end + text.length;
      editorEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // CM6: dispatch a transaction so undo history and state stay intact
    const view = getCM6View();
    if (view) {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes:   { from: pos, to: pos, insert: text },
        selection: { anchor: pos + text.length },
      });
      return;
    }

    // Contenteditable fallback
    document.execCommand('insertText', false, text);
  }

  // ---------------------------------------------------------------------------
  // Textarea / contenteditable handler (via input event)
  // ---------------------------------------------------------------------------

  function handleInput(event) {
    if (!_enabled) return;

    const target = event.target;

    // Skip if this is a CM6 editor — handled separately via keydown
    if (target.classList.contains('cm-content') || target.closest('.cm-editor')) return;

    let textBefore = '';
    let fullText   = '';

    if (target.tagName === 'TEXTAREA') {
      textBefore = target.value.slice(0, target.selectionEnd);
      fullText   = target.value;
    } else if (target.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0).cloneRange();
      range.setStart(target, 0);
      textBefore = range.toString();
      fullText   = target.textContent || '';
    } else {
      return;
    }

    if (!textBefore.trimEnd().endsWith('=')) return;
    if (alreadyHasAnswer(textBefore, fullText)) return;

    const mathExpr = extractMathBeforeEquals(textBefore);
    if (!mathExpr) return;

    const result = computeLatex(mathExpr, _format);
    if (!result.success) return;

    const forms = getAllFormats(result.value);
    if (!forms.length) return;

    LatexGhost.show(
      forms,
      target,
      (text) => insertAtCursor(target, text),
      null
    );
  }

  // ---------------------------------------------------------------------------
  // Attach listeners
  // ---------------------------------------------------------------------------

  function attachTo(el) {
    if (el.dataset.latexAutocompute) return;
    el.dataset.latexAutocompute = '1';
    el.addEventListener('input', handleInput);
  }

  function scanAndAttach() {
    document.querySelectorAll('textarea').forEach(attachTo);
    document.querySelectorAll('[contenteditable="true"]').forEach((el) => {
      if (el.classList.contains('cm-content')) return; // CM6 handled via keydown
      if (el.offsetHeight < 40 && el.offsetWidth < 40) return;
      attachTo(el);
    });
  }

  // Document-level keydown for CM6 (Overleaf).
  // Runs in capture phase, uses setTimeout(0) so CM6 inserts the '=' first.
  document.addEventListener('keydown', (e) => {
    if (!_enabled) return;
    if (e.key !== '=') return;
    if (LatexGhost.isVisible()) return;
    if (!document.querySelector('.cm-editor')) return;
    setTimeout(handleCM6Equals, 0);
  }, { capture: true });

  scanAndAttach();

  const observer = new MutationObserver(() => scanAndAttach());
  observer.observe(document.body, { childList: true, subtree: true });

})();
