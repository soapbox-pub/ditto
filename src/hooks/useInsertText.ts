import { useCallback } from 'react';

interface InsertAtCursorParams {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Shared hook for inserting text at the cursor position within a textarea.
 *
 * Returns two helpers:
 * - `insertAtCursor` – splice a replacement string between explicit start/end
 *   offsets (used by autocomplete components like EmojiShortcodeAutocomplete).
 * - `insertEmoji` – insert text at the textarea's *current* selection
 *   (used by the EmojiPicker GUI button).
 *
 * Both restore focus and cursor position after the insertion.
 *
 * The current text is read live from `textareaRef.current.value` (not React
 * state) so the returned callbacks are STABLE across keystrokes. This matters:
 * these callbacks are passed as props to the autocomplete children, and a
 * fresh identity every keystroke would churn their event listeners and re-run
 * their effects, causing typing jank. `setContent` keeps React state
 * authoritative after the splice.
 */
export function useInsertText(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  setContent: React.Dispatch<React.SetStateAction<string>>,
) {
  /** Insert a replacement between explicit `start` and `end` offsets. */
  const insertAtCursor = useCallback(
    ({ start, end, replacement }: InsertAtCursorParams) => {
      const current = textareaRef.current?.value ?? '';
      const newContent = current.slice(0, start) + replacement + current.slice(end);
      setContent(newContent);
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.focus();
          const pos = start + replacement.length;
          textarea.setSelectionRange(pos, pos);
        }
      });
    },
    [setContent, textareaRef],
  );

  /** Insert text at the textarea's current selection (or append if no ref). */
  const insertEmoji = useCallback(
    (emoji: string) => {
      const textarea = textareaRef.current;
      if (textarea) {
        const current = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newContent = current.slice(0, start) + emoji + current.slice(end);
        setContent(newContent);
        requestAnimationFrame(() => {
          textarea.focus();
          const pos = start + emoji.length;
          textarea.setSelectionRange(pos, pos);
        });
      } else {
        setContent((prev) => prev + emoji);
      }
    },
    [setContent, textareaRef],
  );

  return { insertAtCursor, insertEmoji };
}
