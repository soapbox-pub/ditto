import { useCallback, useEffect, useRef, useState } from 'react';

import { findHighlightSource, type HighlightSource } from '@/lib/highlightSource';

/** A live text selection that resolves to a highlightable source event. */
export interface HighlightSelection {
  /** The selected text, trimmed. */
  text: string;
  /** The surrounding paragraph that contains the selection verbatim, when available. */
  context?: string;
  /** The resolved source event. */
  source: HighlightSource;
  /** Viewport-relative bounding rect of the selection, for positioning UI. */
  rect: DOMRect;
}

/** Maximum length of selected text we treat as a highlight (guards against "Select All" of huge articles). */
const MAX_HIGHLIGHT_LENGTH = 5000;
/** Maximum length of surrounding context we attach. */
const MAX_CONTEXT_LENGTH = 8000;
/** How long the selection must stay stable before the highlight button appears. */
const SELECTION_DEBOUNCE_MS = 350;

/**
 * Tracks the document text selection and, when it falls entirely inside a
 * single highlightable source container (an element carrying
 * `data-highlight-*` attributes), exposes a {@link HighlightSelection}.
 *
 * Returns `null` when there is no selection, the selection is collapsed, it
 * spans multiple sources, or it isn't inside any highlightable content. This is
 * the web/native-agnostic foundation of the floating "Highlight" button — it
 * relies only on the DOM Selection API, which works identically in the browser
 * and inside Capacitor's WebView.
 */
export function useTextHighlight(): {
  selection: HighlightSelection | null;
  clear: () => void;
} {
  const [selection, setSelection] = useState<HighlightSelection | null>(null);
  const frame = useRef<number | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const compute = useCallback(() => {
    const sel = window.getSelection();

    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }

    // Normalize line endings but preserve internal linebreaks so multi-line
    // highlights keep their structure. Keeping `text` and `context` normalized
    // the same way is what lets HighlightContent find the highlight verbatim
    // inside the context and mark it in situ.
    const text = normalizeText(sel.toString());
    if (!text || text.length > MAX_HIGHLIGHT_LENGTH) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);

    // Both ends of the selection must resolve to the *same* source event.
    const startSource = findHighlightSource(range.startContainer);
    const endSource = findHighlightSource(range.endContainer);

    if (!startSource || !endSource || startSource.id !== endSource.id) {
      setSelection(null);
      return;
    }

    // Skip selections inside editable fields (composer, inputs) — highlighting
    // your own draft makes no sense and the source attrs won't be present there
    // anyway, but guard defensively.
    const anchorEl = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
    if (anchorEl?.closest('input, textarea, [contenteditable="true"]')) {
      setSelection(null);
      return;
    }

    // Context: the surrounding paragraph (not the whole event), with the
    // highlight present verbatim so HighlightContent can mark it.
    const containerEl = findSourceElement(range.startContainer);
    const context = extractContext(range, containerEl, text);

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setSelection(null);
      return;
    }

    setSelection({ text, context, source: startSource, rect });
  }, []);

  const schedule = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      compute();
    });
  }, [compute]);

  // `selectionchange` handler: hide immediately when the selection collapses
  // (so the button doesn't linger after a click-away), but debounce showing
  // until the user pauses dragging — avoids the button flickering around while
  // a selection is still being extended.
  const onSelectionChange = useCallback(() => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim()) {
      // Empty/collapsed: clear right away.
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      setSelection(null);
      return;
    }

    debounceTimer.current = setTimeout(schedule, SELECTION_DEBOUNCE_MS);
  }, [schedule]);

  useEffect(() => {
    document.addEventListener('selectionchange', onSelectionChange);
    // Recompute position on scroll/resize so a shown button stays anchored.
    // These reposition immediately (no debounce) to track the selection.
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    };
  }, [schedule, onSelectionChange]);

  const clear = useCallback(() => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  return { selection, clear };
}

/** Walk up to the nearest element carrying highlight source attributes. */
function findSourceElement(node: Node | null): Element | null {
  let el: Element | null = node instanceof Element ? node : node?.parentElement ?? null;
  while (el) {
    if (el.hasAttribute('data-highlight-id')) return el;
    el = el.parentElement;
  }
  return null;
}

/** Normalize line endings and trim, but preserve internal linebreaks. */
function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

/** Block-level tags that delimit a "paragraph" for context extraction. */
const BLOCK_TAGS = new Set(['P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'TD', 'FIGCAPTION']);

/**
 * Extract the paragraph surrounding the selection — not the whole event — to
 * use as the NIP-84 `context`.
 *
 * Two source shapes are handled:
 * - **Block-structured content** (articles, markdown): use the nearest
 *   block-level ancestor (`<p>`, `<li>`, heading, …) that sits below the source
 *   root.
 * - **Flat text notes** (a single run of spans with embedded `\n`): split the
 *   container text on blank lines and pick the block containing the highlight.
 *
 * Returns `undefined` when no suitable surrounding paragraph is found, the
 * paragraph equals the highlight itself, or it exceeds the size cap.
 */
function extractContext(range: Range, root: Element | null, text: string): string | undefined {
  if (!root) return undefined;

  // 1. Nearest block-level ancestor below the root (article/markdown case).
  let block: Element | null =
    range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  while (block && block !== root) {
    if (BLOCK_TAGS.has(block.tagName)) break;
    block = block.parentElement;
  }

  if (block && block !== root && BLOCK_TAGS.has(block.tagName)) {
    const para = normalizeText(block.textContent ?? '');
    if (isUsableContext(para, text)) return para;
  }

  // 2. Flat note: split the container text into paragraphs on blank lines and
  //    return the one containing the highlight.
  const full = normalizeText(root.textContent ?? '');
  if (full.includes(text)) {
    const paragraphs = full.split(/\n{2,}/);
    const para = paragraphs.find((p) => p.includes(text))?.trim();
    if (para && isUsableContext(para, text)) return para;
    // Fall back to the full text if no single paragraph contains the highlight
    // (e.g. the selection spans paragraph breaks).
    if (isUsableContext(full, text)) return full;
  }

  return undefined;
}

/** A context string is usable if it contains the highlight verbatim, differs from it, and is within the size cap. */
function isUsableContext(context: string, text: string): boolean {
  return !!context && context.length <= MAX_CONTEXT_LENGTH && context !== text && context.includes(text);
}
