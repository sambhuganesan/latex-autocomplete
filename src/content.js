// content.js — Main content script
//
// Detects the = keystroke inside a LaTeX math context, extracts the math
// expression, computes it, and shows a ghost-text suggestion.

(function () {
  'use strict';

  // Guard: don't init if extension is disabled
  let _enabled = true;
  let _format  = 'auto';

  LatexSettings.load((s) => {
    _enabled = s.enabled;
    _format  = s.format;
  });
  LatexSettings.onChange((s) => {
    _enabled = s.enabled;
    _format  = s.format;
  });

  // ---------------------------------------------------------------------------
  // Math delimiter detection
  // ---------------------------------------------------------------------------

  // Given the full text BEFORE (and including) the '=' the user just typed,
  // determine if the cursor is inside a math region and return the expression
  // between the opening delimiter and '=' (trimmed). Returns null if not in math.
  function extractMathBeforeEquals(textUpToCursor) {
    // textUpToCursor ends with '=' (possibly with trailing spaces between expr and =)
    // Strategy: forward-scan, track math context by pairing delimiters.

    let inMath = false;
    let mathStart = -1; // index into textUpToCursor where math content begins
    let i = 0;
    const t = textUpToCursor;
    const len = t.length;

    while (i < len) {
      // \[ ... \]  and  \( ... \)
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
        // skip other backslash sequences
        i += 2; continue;
      }

      // $$ before $
      if (t[i] === '$') {
        if (i + 1 < len && t[i + 1] === '$') {
          inMath = !inMath;
          mathStart = inMath ? i + 2 : -1;
          i += 2; continue;
        }
        inMath = !inMath;
        mathStart = inMath ? i + 1 : -1;
        i += 1; continue;
      }

      i++;
    }

    if (!inMath || mathStart < 0) return null;

    // The content from mathStart to end-of-string is the math region.
    // The last character is '='. Strip it plus any surrounding whitespace.
    let content = t.slice(mathStart);
    // Remove trailing = (and any whitespace before it)
    if (!content.trimEnd().endsWith('=')) return null;
    content = content.trimEnd();
    content = content.slice(0, content.length - 1).trim();
    return content || null;
  }

  // ---------------------------------------------------------------------------
  // Insert text at cursor
  function insertAtCursor(editorEl, text) {
    if (!editorEl) return;

    // --- Textarea ---
    if (editorEl.tagName === 'TEXTAREA') {
      const end = editorEl.selectionEnd;
      const val   = editorEl.value;
      editorEl.value = val.slice(0, end) + text + val.slice(end);
      editorEl.selectionStart = editorEl.selectionEnd = end + text.length;
      editorEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // --- CodeMirror 6 ---
    // Try to dispatch a transaction via the CM6 view object
    const cmView = getCM6View(editorEl);
    if (cmView) {
      const pos = cmView.state.selection.main.head;
      cmView.dispatch({
        changes: { from: pos, to: pos, insert: text },
        selection: { anchor: pos + text.length },
      });
      return;
    }

    // --- Contenteditable fallback ---
    // execCommand is deprecated but still widely supported
    document.execCommand('insertText', false, text);
  }

  // Try to get a CM6 EditorView from a DOM element or its ancestors
  function getCM6View(el) {
    // CM6 stores the view on the root `.cm-editor` element under various keys
    const editorEl = el.closest?.('.cm-editor') || document.querySelector('.cm-editor');
    if (!editorEl) return null;
    // Try known property names used by different CM6 builds
    return editorEl.cmView
        || editorEl.__view
        || editorEl._codemirror
        || findCM6ViewBySymbol(editorEl)
        || null;
  }

  function findCM6ViewBySymbol(el) {
    try {
      const sym = Object.getOwnPropertySymbols(el).find(s => s.toString().includes('view') || s.toString().includes('View'));
      return sym ? el[sym] : null;
    } catch { return null; }
  }

  // ---------------------------------------------------------------------------
  // Already-has-answer guard
  // ---------------------------------------------------------------------------

  // Returns true if there's real content after '=' (not just a closing math delimiter)
  function alreadyHasAnswer(textUpToCursor, fullText) {
    const rest = fullText.slice(textUpToCursor.length);
    const firstLine = rest.split('\n')[0].trim();
    if (firstLine.length === 0) return false;
    // Closing delimiters ($, $$, \], \)) are not answers — Overleaf auto-inserts them
    const withoutClosingDelim = firstLine.replace(/^(\$\$|\$|\\\]|\\\))\s*/, '');
    return withoutClosingDelim.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------------

  function handleInput(event) {
    if (!_enabled) { console.log('[LaTeX] disabled'); return; }

    const target = event.target;
    let currentText = '';

    if (target.tagName === 'TEXTAREA') {
      currentText = target.value.slice(0, target.selectionEnd);
    } else if (target.isContentEditable || target.classList.contains('cm-content')) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) { console.log('[LaTeX] no selection'); return; }
      const range = sel.getRangeAt(0).cloneRange();
      range.setStart(target, 0);
      currentText = range.toString();
    } else {
      return; // not an editor we handle
    }

    if (!currentText.trimEnd().endsWith('=')) return;
    console.log('[LaTeX] = detected, text:', JSON.stringify(currentText.slice(-40)));

    // Don't re-trigger if there's already content after '='
    let fullText = '';
    if (target.tagName === 'TEXTAREA') {
      fullText = target.value;
    } else {
      fullText = target.textContent || target.innerText || '';
    }

    const textUpTo = currentText;
    if (alreadyHasAnswer(textUpTo, fullText)) { console.log('[LaTeX] already has answer'); return; }

    const mathExpr = extractMathBeforeEquals(textUpTo);
    if (!mathExpr) { console.log('[LaTeX] no math expr found in:', JSON.stringify(textUpTo.slice(-60))); return; }
    console.log('[LaTeX] math expr:', mathExpr);

    const result = computeLatex(mathExpr, _format);
    console.log('[LaTeX] compute result:', result);
    if (!result.success) return;

    const forms = getAllFormats(result.value);
    if (forms.length === 0) return;

    LatexGhost.show(
      forms,
      target,
      (displayText) => insertAtCursor(target, displayText),
      null
    );
  }

  // ---------------------------------------------------------------------------
  // Editor attachment
  // ---------------------------------------------------------------------------

  function attachTo(el) {
    if (el.dataset.latexAutocompute) return; // already attached
    el.dataset.latexAutocompute = '1';
    el.addEventListener('input', handleInput);
  }

  function scanAndAttach() {
    // Standard textareas
    document.querySelectorAll('textarea').forEach(attachTo);

    // Contenteditable elements (non-trivial ones — skip toolbar buttons etc.)
    document.querySelectorAll('[contenteditable="true"]').forEach((el) => {
      // Avoid tiny inline editors (e.g. single-line toolbar inputs)
      if (el.offsetHeight < 40 && el.offsetWidth < 40) return;
      attachTo(el);
    });

    // CodeMirror 6: attach to .cm-content
    document.querySelectorAll('.cm-content').forEach(attachTo);
  }

  // Initial scan
  scanAndAttach();

  // Watch for dynamically added editors (Overleaf loads async)
  const observer = new MutationObserver((mutations) => {
    let needScan = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (
          node.tagName === 'TEXTAREA' ||
          node.isContentEditable ||
          node.classList.contains('cm-content') ||
          node.querySelector?.('textarea, [contenteditable], .cm-content')
        ) {
          needScan = true;
          break;
        }
      }
      if (needScan) break;
    }
    if (needScan) scanAndAttach();
  });

  observer.observe(document.body, { childList: true, subtree: true });

})();
