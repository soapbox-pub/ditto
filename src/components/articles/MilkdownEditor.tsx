import { useEffect, useRef, useCallback, useState } from 'react';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { commonmark, toggleStrongCommand, toggleEmphasisCommand, wrapInBlockquoteCommand, insertHrCommand, turnIntoTextCommand, wrapInHeadingCommand, toggleInlineCodeCommand, wrapInBulletListCommand, wrapInOrderedListCommand } from '@milkdown/preset-commonmark';
import { gfm, toggleStrikethroughCommand } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { upload, uploadConfig } from '@milkdown/plugin-upload';
import { Decoration } from '@milkdown/prose/view';
import { replaceAll, callCommand } from '@milkdown/utils';
import { MilkdownToolbar } from './MilkdownToolbar';
import { LinkDialog } from './LinkDialog';

interface MilkdownEditorInnerProps {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  onUploadImage?: (file: File) => Promise<string | null>;
  placeholder?: string;
  showToolbar?: boolean;
  sourceMode?: boolean;
  onToggleSource?: () => void;
}

function MilkdownEditorInner({ value, onChange, onBlur, onUploadImage, placeholder, showToolbar = true, sourceMode, onToggleSource }: MilkdownEditorInnerProps) {
  const initialValueRef = useRef(value);
  const editorRef = useRef<Editor | null>(null);
  const lastExternalValue = useRef(value);
  const onUploadImageRef = useRef(onUploadImage);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Link dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedTextForLink, setSelectedTextForLink] = useState<string>('');
  const selectionRef = useRef<{ from: number; to: number } | null>(null);

  // Keep refs in sync so Milkdown remounts (e.g. source mode toggle) use
  // the latest value rather than the stale value captured on first render.
  useEffect(() => {
    initialValueRef.current = value;
    onUploadImageRef.current = onUploadImage;
  }, [value, onUploadImage]);

  const { get } = useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialValueRef.current);
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          lastExternalValue.current = markdown;
          onChange(markdown);
        });

        // Configure upload plugin
        ctx.set(uploadConfig.key, {
          uploader: async (files, schema) => {
            const images: File[] = [];

            for (let i = 0; i < files.length; i++) {
              const file = files.item(i);
              if (!file) continue;

              // Only handle images
              if (!file.type.includes('image')) continue;

              images.push(file);
            }

            const nodes: ReturnType<typeof schema.nodes.image.createAndFill>[] = [];

            for (const image of images) {
              try {
                // Use the upload handler if provided
                if (onUploadImageRef.current) {
                  const url = await onUploadImageRef.current(image);
                  if (url) {
                    const node = schema.nodes.image.createAndFill({
                      src: url,
                      alt: image.name,
                    });
                    if (node) nodes.push(node);
                  }
                } else {
                  // Fallback to base64 if no upload handler
                  const reader = new FileReader();
                  const dataUrl = await new Promise<string>((resolve) => {
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(image);
                  });
                  const node = schema.nodes.image.createAndFill({
                    src: dataUrl,
                    alt: image.name,
                  });
                  if (node) nodes.push(node);
                }
              } catch (error) {
                console.error('Failed to upload image:', error);
              }
            }

            return nodes.filter((node): node is NonNullable<typeof node> => node !== null);
          },
          enableHtmlFileUploader: true,
          uploadWidgetFactory: (pos, spec) => {
            // Create a placeholder widget while uploading
            const widgetEl = document.createElement('span');
            widgetEl.className = 'milkdown-upload-placeholder';
            widgetEl.textContent = 'Uploading...';
            return Decoration.widget(pos, widgetEl, spec);
          },
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(listener)
      .use(upload);

    return editor;
  });

  // Store editor reference
  useEffect(() => {
    editorRef.current = get() ?? null;
  }, [get]);

  // Toggle `has-content` class on blur so CSS can hide the placeholder
  // when the editor has real content (including trailing whitespace that
  // ProseMirror collapses out of the DOM).
  useEffect(() => {
    const editor = get();
    if (!editor) return;
    let dom: HTMLElement;
    try {
      dom = editor.ctx.get(editorViewCtx).dom;
    } catch {
      return;
    }
    const check = () => {
      const hasContent = !!lastExternalValue.current.replace(/\n/g, '');
      dom.classList.toggle('has-content', hasContent);
    };
    // Set initial state
    check();
    dom.addEventListener('blur', check);
    return () => dom.removeEventListener('blur', check);
  }, [get]);

  // Handle external value changes (e.g., loading a draft).
  // In source mode, just keep lastExternalValue in sync so the guard works
  // correctly when switching back. When not in source mode, push the new
  // value into the Milkdown editor via replaceAll.
  useEffect(() => {
    if (sourceMode) {
      // Track textarea changes so we don't needlessly replaceAll on switch-back
      lastExternalValue.current = value;
      return;
    }
    const editor = get();
    if (editor && value !== lastExternalValue.current) {
      try {
        editor.action(replaceAll(value));
      } catch {
        // editorView may not be ready yet (e.g. first render); ignore
        return;
      }
      lastExternalValue.current = value;
    }
  }, [value, get, sourceMode]);

  // Handle link dialog open
  const handleLinkButtonClick = useCallback(() => {
    const editor = get();
    if (!editor) return;

    try {
      const view = editor.ctx.get(editorViewCtx);
      const { state } = view;
      const { from, to } = state.selection;
      const selectedText = state.doc.textBetween(from, to);

      // Store selection for later use
      selectionRef.current = { from, to };
      setSelectedTextForLink(selectedText);
      setLinkDialogOpen(true);
    } catch (error) {
      console.error('Failed to get selection:', error);
    }
  }, [get]);

  // Handle link insertion from dialog
  const handleLinkSubmit = useCallback((text: string, url: string) => {
    const editor = get();
    if (!editor) return;

    try {
      const view = editor.ctx.get(editorViewCtx);
      const { state, dispatch } = view;
      const { schema } = state;

      // Create a link mark
      const linkMark = schema.marks.link.create({ href: url });

      // Create text node with link mark
      const linkNode = schema.text(text, [linkMark]);

      const tr = state.tr;

      if (selectionRef.current) {
        const { from, to } = selectionRef.current;
        // Replace selection with linked text
        tr.replaceWith(from, to, linkNode);
      } else {
        // Insert at current position
        const { from } = state.selection;
        tr.insert(from, linkNode);
      }

      dispatch(tr);
      view.focus();
    } catch (error) {
      console.error('Failed to insert link:', error);
    }
  }, [get]);

  // Handle image upload via file picker + ProseMirror insertion
  const handleImageButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadImageRef.current) return;

    const url = await onUploadImageRef.current(file);
    if (!url) return;

    const editor = get();
    if (!editor) return;

    try {
      const view = editor.ctx.get(editorViewCtx);
      const { state, dispatch } = view;
      const { schema } = state;
      const node = schema.nodes.image.createAndFill({ src: url, alt: file.name });
      if (node) {
        const { from } = state.selection;
        dispatch(state.tr.insert(from, node));
        view.focus();
      }
    } catch (error) {
      console.error('Failed to insert image:', error);
    }

    // Reset so the same file can be re-selected
    e.target.value = '';
  }, [get]);

  // Handle toolbar commands
  const handleCommand = useCallback((command: string) => {
    const editor = get();
    if (!editor) return;

    try {
      const view = editor.ctx.get(editorViewCtx);

      switch (command) {
        case 'toggleBold':
          editor.action(callCommand(toggleStrongCommand.key));
          break;
        case 'toggleItalic':
          editor.action(callCommand(toggleEmphasisCommand.key));
          break;
        case 'toggleStrikethrough':
          editor.action(callCommand(toggleStrikethroughCommand.key));
          break;
        case 'toggleInlineCode':
          editor.action(callCommand(toggleInlineCodeCommand.key));
          break;
        case 'heading1':
          editor.action(callCommand(wrapInHeadingCommand.key, 1));
          break;
        case 'heading2':
          editor.action(callCommand(wrapInHeadingCommand.key, 2));
          break;
        case 'heading3':
          editor.action(callCommand(wrapInHeadingCommand.key, 3));
          break;
        case 'bulletList':
          editor.action(callCommand(wrapInBulletListCommand.key));
          break;
        case 'orderedList':
          editor.action(callCommand(wrapInOrderedListCommand.key));
          break;
        case 'blockquote':
          editor.action(callCommand(wrapInBlockquoteCommand.key));
          break;
        case 'link':
          handleLinkButtonClick();
          return; // Don't refocus, dialog will handle it
        case 'hr':
          editor.action(callCommand(insertHrCommand.key));
          break;
        case 'paragraph':
          editor.action(callCommand(turnIntoTextCommand.key));
          break;
      }

      // Refocus the editor
      view.focus();
    } catch (error) {
      console.error('Command failed:', error);
    }
  }, [get, handleLinkButtonClick]);

  return (
    <>
      {showToolbar && (
        <MilkdownToolbar
          onCommand={handleCommand}
          onImageUpload={onUploadImage ? handleImageButtonClick : undefined}
          sourceMode={sourceMode}
          onToggleSource={onToggleSource}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFileChange}
        className="hidden"
      />
      {sourceMode ? (
        <textarea
          dir="auto"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full min-h-[250px] sm:min-h-[350px] p-3 bg-transparent font-mono text-sm resize-y outline-none"
          placeholder={placeholder}
          spellCheck={false}
        />
      ) : (
        <div
          dir="auto"
          className="milkdown-content"
          onBlur={onBlur}
          style={placeholder ? { '--ph': `"${placeholder.replace(/"/g, '\\"')}"` } as React.CSSProperties : undefined}
        >
          <Milkdown />
        </div>
      )}
      <LinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        selectedText={selectedTextForLink}
        onSubmit={handleLinkSubmit}
      />
    </>
  );
}

interface MilkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: () => void;
  onUploadImage?: (file: File) => Promise<string | null>;
  placeholder?: string;
  className?: string;
  showToolbar?: boolean;
}

export function MilkdownEditor({ value, onChange, onBlur, onUploadImage, placeholder, className, showToolbar = true }: MilkdownEditorProps) {
  const [sourceMode, setSourceMode] = useState(false);

  return (
    <div className={`milkdown-editor ${className || ''}`}>
      <MilkdownProvider>
        <MilkdownEditorInner
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onUploadImage={onUploadImage}
          placeholder={placeholder}
          showToolbar={showToolbar}
          sourceMode={sourceMode}
          onToggleSource={() => setSourceMode((s) => !s)}
        />
      </MilkdownProvider>
    </div>
  );
}
