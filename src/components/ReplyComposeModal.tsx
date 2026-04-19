import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { PortalContainerProvider } from '@/hooks/usePortalContainer';
import { EmbeddedPost } from '@/components/EmbeddedPost';
import { ComposeBox } from '@/components/ComposeBox';
import { LinkEmbed } from '@/components/LinkEmbed';
import { cn } from '@/lib/utils';

interface ReplyComposeModalProps {
  /** The event being replied to, or a URL for commenting on external content. When `null`, the modal acts as a "New post" composer. */
  event?: NostrEvent | URL | null;
  /** The event being quoted (for quote posts). */
  quotedEvent?: NostrEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a post is successfully published. */
  onSuccess?: () => void;
  /** Pre-filled content for the compose box. */
  initialContent?: string;
  /** Open directly in poll mode. */
  initialMode?: 'post' | 'poll';
  /** Override the modal title. */
  title?: string;
  /** Override the compose box placeholder text. */
  placeholder?: string;
}

export function ReplyComposeModal({ event, quotedEvent, open, onOpenChange, onSuccess, initialContent, initialMode, title: titleOverride, placeholder: placeholderOverride }: ReplyComposeModalProps) {
  const isUrl = event instanceof URL;
  const isReply = !!event;
  const isQuote = !!quotedEvent;
  const [previewMode, setPreviewMode] = useState(false);
  const [hasPreviewableContent, setHasPreviewableContent] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>(undefined);

  const isProfileRoot = !isUrl && event instanceof Object && 'kind' in event && event.kind === 0;
  const title = titleOverride ?? (initialMode === 'poll' ? 'New poll' : isUrl ? 'New comment' : isProfileRoot ? 'Comment on profile' : isReply ? 'Reply to post' : isQuote ? 'Quote post' : 'New post');
  const placeholder = placeholderOverride ?? (isUrl ? 'Write a comment...' : isReply ? "What's on your mind?" : isQuote ? 'Add a comment...' : "What's happening?");

  const dialogContentRef = useCallback((node: HTMLElement | null) => {
    setPortalContainer(node ?? undefined);
  }, []);

  // Always prevent closing the compose modal by clicking the backdrop overlay.
  // Users must explicitly close via the X button or Escape key.  This prevents
  // accidental content loss from stray taps on mobile or misclicks.
  const handleInteractOutside = useCallback((e: Event) => {
    e.preventDefault();
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="max-w-[520px] max-h-[95dvh] sm:max-h-[85dvh] rounded-2xl p-0 gap-0 border-border overflow-hidden [&>button]:hidden !flex !flex-col"
        onOpenAutoFocus={(e) => {
          // Prevent Radix from focusing its own first-focusable (the X button).
          e.preventDefault();
          // Immediately focus the textarea — this MUST happen synchronously
          // inside this handler so iOS treats it as part of the original user
          // gesture and raises the virtual keyboard.
          const textarea = (e.currentTarget as HTMLElement).querySelector('textarea');
          if (textarea) {
            textarea.focus();
          }
        }}
        onInteractOutside={handleInteractOutside}
      >
        <PortalContainerProvider value={portalContainer}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12 shrink-0">
            <DialogTitle className="text-base font-semibold">
              {title}
            </DialogTitle>

            <div className="flex items-center gap-2">
              {/* Preview toggle */}
              {hasPreviewableContent && (
                <div className="inline-flex items-center gap-0.5 p-1 bg-muted/50 rounded-lg">
                  <button
                    onClick={() => setPreviewMode(false)}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-medium rounded-md transition-all",
                      !previewMode 
                        ? "bg-background text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setPreviewMode(true)}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-medium rounded-md transition-all",
                      previewMode 
                        ? "bg-background text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Preview
                  </button>
                </div>
              )}

              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* Embedded original post (reply only, not for quotes)
              Capped at 20% of viewport so it never dominates the modal. */}
          {event && !isQuote && (
            <div className="overflow-y-auto max-h-[20dvh] shrink-0">
              {isUrl ? (
                <div className="mx-4 mb-2">
                  <LinkEmbed url={event.href} showActions={false} hideImage />
                </div>
              ) : (
                <EmbeddedPost event={event} className="mx-4 mb-2" disableHoverCards />
              )}
            </div>
          )}

          {/* Bluesky disclaimer */}
          {isUrl && /bsky\.(app|social)/.test(event.href) && (
            <div className="mx-4 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2 shrink-0">
              <span className="text-sm leading-relaxed shrink-0" aria-hidden>&#x26A0;&#xFE0F;</span>
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                People on Bluesky can&apos;t see you because they&apos;re not actually decentralized.
              </p>
            </div>
          )}

          {/* Compose area — takes remaining space; ComposeBox handles its own scroll */}
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
            <ComposeBox
              replyTo={isQuote ? undefined : (event ?? undefined)}
              quotedEvent={quotedEvent ?? undefined}
              onSuccess={() => { onOpenChange(false); onSuccess?.(); }}
              placeholder={placeholder}
              forceExpanded
              hideAvatar
              previewMode={previewMode}
              onHasPreviewableContentChange={setHasPreviewableContent}
              initialContent={initialContent}
              initialMode={initialMode}
            />
          </div>
        </PortalContainerProvider>
      </DialogContent>
    </Dialog>
  );
}
