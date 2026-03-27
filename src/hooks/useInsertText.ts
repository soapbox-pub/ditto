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
 */
export function useInsertText(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  content: string,
  setContent: (value: string) => void,
) {
  /** Insert a replacement between explicit `start` and `end` offsets. */
  const insertAtCursor = useCallback(
    ({ start, end, replacement }: InsertAtCursorParams) => {
      const newContent = content.slice(0, start) + replacement + content.slice(end);
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
    [content, setContent, textareaRef],
  );

  /** Insert text at the textarea's current selection (or append if no ref). */
  const insertEmoji = useCallback(
    (emoji: string) => {
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newContent = content.slice(0, start) + emoji + content.slice(end);
        setContent(newContent);
        requestAnimationFrame(() => {
          textarea.focus();
          const pos = start + emoji.length;
          textarea.setSelectionRange(pos, pos);
        });
      } else {
        setContent(content + emoji);
      }
    },
    [content, setContent, textareaRef],
  );

  return { insertAtCursor, insertEmoji };
}
