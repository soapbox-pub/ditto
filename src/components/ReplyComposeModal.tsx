import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { PortalContainerProvider } from '@/contexts/PortalContainerContext';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { ComposeBox } from '@/components/ComposeBox';
import { LinkEmbed } from '@/components/LinkEmbed';
import { ProfilePreview } from '@/components/ExternalContentHeader';
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

  // Prevent the compose modal from closing when the user interacts with a
  // nested dialog (e.g. the emoji/GIF picker).  On mobile it is very easy to
  // tap the emoji picker overlay and accidentally dismiss the compose modal,
  // losing the draft.  We detect nested-dialog interactions by checking
  // whether the click target lives inside another Radix Dialog portal that
  // sits above this modal.
  const isNestedDialogInteraction = useCallback((e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    // Radix Dialog overlays have data-state and sit inside [role="dialog"]
    // portals.  If the target is inside a dialog element that is NOT our own
    // DialogContent, a nested dialog is open.
    const closestDialog = target.closest('[role="dialog"]');
    if (closestDialog && portalContainer && closestDialog !== portalContainer) {
      return true;
    }
    // Also catch clicks on the overlay itself (data-radix-dialog-overlay or
    // the backdrop element) that belongs to a nested dialog.
    const closestOverlay = target.closest('[data-radix-dialog-overlay]');
    if (closestOverlay) {
      // Check if this overlay belongs to our dialog or a nested one.
      // Our overlay is a sibling of our DialogContent, not a descendant.
      // If the overlay is rendered inside our portal container's parent
      // (the same portal), it could be ours.  But if there are multiple
      // overlays, the topmost (last in DOM) belongs to the nested dialog.
      const allOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
      if (allOverlays.length > 1) {
        return true;
      }
    }
    return false;
  }, [portalContainer]);

  const handleInteractOutside = useCallback((e: Event) => {
    if (isNestedDialogInteraction(e)) {
      e.preventDefault();
    }
  }, [isNestedDialogInteraction]);

  const handleEscapeKeyDown = useCallback((e: KeyboardEvent) => {
    // When a nested dialog is open, Radix will close it first via its own
    // handler.  But the escape event can bubble and also close the parent
    // modal.  We prevent that by checking if any nested dialog is currently
    // open (any dialog with data-state="open" that is not ours).
    const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"]');
    const hasNestedDialog = Array.from(openDialogs).some(
      (el) => portalContainer && el !== portalContainer,
    );
    if (hasNestedDialog) {
      e.preventDefault();
    }
  }, [portalContainer]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="max-w-[520px] max-h-[85vh] rounded-2xl p-0 gap-0 border-border overflow-visible [&>button]:hidden flex flex-col"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const target = e.target as HTMLElement;
          const textarea = target.querySelector('textarea');
          textarea?.focus();
        }}
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
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

          {/* Embedded original post (reply only, not for quotes) */}
          {event && !isQuote && (
            <div className="overflow-y-auto min-h-0 shrink">
              {isUrl ? (
                <div className="mx-4 mb-2">
                  <LinkEmbed url={event.href} showActions={false} hideImage />
                </div>
              ) : (
                <EmbeddedPost event={event} />
              )}
            </div>
          )}

          {/* Bluesky disclaimer */}
          {isUrl && /bsky\.(app|social)/.test(event.href) && (
            <div className="mx-4 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
              <span className="text-sm leading-relaxed shrink-0" aria-hidden>&#x26A0;&#xFE0F;</span>
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                People on Bluesky can&apos;t see you because they&apos;re not actually decentralized.
              </p>
            </div>
          )}

          {/* Compose area */}
          <div className="min-h-0 overflow-y-auto">
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

/**
 * Compact embedded preview of the post being replied to.
 * Delegates to the shared EmbeddedNote / EmbeddedNaddr components used by
 * quote posts and hover cards, so every context renders events consistently.
 */
function EmbeddedPost({ event }: { event: NostrEvent }) {
  // Kind 0 (profile) — show a profile card instead of trying to render the raw JSON content
  if (event.kind === 0) {
    return (
      <div className="mx-4 mb-2 rounded-xl border border-border bg-secondary/30 overflow-hidden">
        <ProfilePreview pubkey={event.pubkey} />
      </div>
    );
  }

  // Addressable events (kind 30000-39999) — use EmbeddedNaddr
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
    return (
      <div className="mx-4 mb-2">
        <EmbeddedNaddr addr={{ kind: event.kind, pubkey: event.pubkey, identifier: dTag }} />
      </div>
    );
  }

  // Everything else — use EmbeddedNote (the event is already in the query cache)
  return (
    <div className="mx-4 mb-2">
      <EmbeddedNote eventId={event.id} authorHint={event.pubkey} disableHoverCards />
    </div>
  );
}
