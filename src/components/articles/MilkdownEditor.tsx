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
  onUploadImage?: (file: File) => Promise<string | null>;
  onImageButtonClick?: () => void;
  placeholder?: string;
  showToolbar?: boolean;
}

function MilkdownEditorInner({ value, onChange, onUploadImage, onImageButtonClick, placeholder, showToolbar = true }: MilkdownEditorInnerProps) {
  const initialValueRef = useRef(value);
  const editorRef = useRef<Editor | null>(null);
  const lastExternalValue = useRef(value);
  const onUploadImageRef = useRef(onUploadImage);

  // Link dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedTextForLink, setSelectedTextForLink] = useState<string>('');
  const selectionRef = useRef<{ from: number; to: number } | null>(null);

  // Keep ref updated
  useEffect(() => {
    onUploadImageRef.current = onUploadImage;
  }, [onUploadImage]);

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

  // Handle external value changes (e.g., loading a draft)
  useEffect(() => {
    const editor = get();
    if (editor && value !== lastExternalValue.current) {
      // Only update if the value changed externally (not from user typing)
      editor.action(replaceAll(value));
      lastExternalValue.current = value;
    }
  }, [value, get]);

  // Add placeholder support
  useEffect(() => {
    const editor = get();
    if (editor && placeholder) {
      try {
        const view = editor.ctx.get(editorViewCtx);
        const editorDom = view.dom;
        editorDom.setAttribute('data-placeholder', placeholder);
      } catch {
        // Editor not ready yet
      }
    }
  }, [get, placeholder]);

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
          onImageUpload={onImageButtonClick}
        />
      )}
      <div className="milkdown-content">
        <Milkdown />
      </div>
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
  onUploadImage?: (file: File) => Promise<string | null>;
  onImageButtonClick?: () => void;
  placeholder?: string;
  className?: string;
  showToolbar?: boolean;
}

export function MilkdownEditor({ value, onChange, onUploadImage, onImageButtonClick, placeholder, className, showToolbar = true }: MilkdownEditorProps) {
  return (
    <div className={`milkdown-editor ${className || ''}`}>
      <MilkdownProvider>
        <MilkdownEditorInner
          value={value}
          onChange={onChange}
          onUploadImage={onUploadImage}
          onImageButtonClick={onImageButtonClick}
          placeholder={placeholder}
          showToolbar={showToolbar}
        />
      </MilkdownProvider>
    </div>
  );
}
