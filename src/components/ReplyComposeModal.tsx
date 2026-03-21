import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { PortalContainerProvider } from '@/contexts/PortalContainerContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { NoteContent } from '@/components/NoteContent';
import { ComposeBox } from '@/components/ComposeBox';
import { ProfilePreview } from '@/components/ExternalContentHeader';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { timeAgo } from '@/lib/timeAgo';
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

/** Extracts image URLs from note content. */
function extractImages(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
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

          {/* Embedded original post (reply only, not for URL roots or quotes) */}
          {event && !isUrl && !isQuote && (
            <div className="overflow-y-auto min-h-0 shrink">
              <EmbeddedPost event={event} />
            </div>
          )}

          {/* Compose area */}
          <div className="shrink-0">
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

/** Compact embedded preview of the post being replied to. */
function EmbeddedPost({ event }: { event: NostrEvent }) {
  // Kind 0 (profile) — show a profile card instead of trying to render the raw JSON content
  if (event.kind === 0) {
    return (
      <div className="mx-4 mb-2 rounded-xl border border-border bg-secondary/30 overflow-hidden">
        <ProfilePreview pubkey={event.pubkey} />
      </div>
    );
  }

  // Kind 62 (Request to Vanish) — show a compact vanish preview
  if (event.kind === 62) {
    return <EmbeddedVanishPost event={event} />;
  }

  return <EmbeddedNote event={event} />;
}

/** Compact embedded preview for NIP-62 vanish events in the reply composer. */
function EmbeddedVanishPost({ event }: { event: NostrEvent }) {
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const isGlobal = event.tags.some(([n, v]) => n === 'relay' && v === 'ALL_RELAYS');
  const reason = event.content || undefined;

  return (
    <div className="mx-4 mb-2 rounded-xl border-2 border-red-500/30 overflow-hidden">
      {/* Top caution stripe */}
      <div className="vanish-stripes h-1.5" />

      <div className="px-3 py-2.5 bg-red-500/[0.04] dark:bg-red-500/[0.06] space-y-1.5">
        {/* Header row */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div className="size-8 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <span className="text-sm font-black vanish-glitch-text text-red-500 dark:text-red-400" data-text="///">///</span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-red-600 flex items-center justify-center">
              <span className="text-[7px] font-black text-white leading-none">!</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-500 dark:text-red-400 leading-tight">
              {isGlobal ? 'Global Request to Vanish' : 'Request to Vanish'}
            </p>
            <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
              {npub}
            </p>
          </div>

          <span className="text-[11px] text-muted-foreground shrink-0">
            {timeAgo(event.created_at)}
          </span>
        </div>

        {/* Reason if available */}
        {reason && (
          <p className="text-xs text-muted-foreground italic line-clamp-2 pl-[42px]">
            &ldquo;{reason}&rdquo;
          </p>
        )}
      </div>

      {/* Bottom caution stripe */}
      <div className="vanish-stripes h-1.5" />
    </div>
  );
}

/** Compact embedded preview for regular note events. */
function EmbeddedNote({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const nip05 = metadata?.nip05;
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);
  const images = useMemo(() => extractImages(event.content), [event.content]);

  return (
    <div className="mx-4 mb-2 rounded-xl border border-border bg-secondary/30 overflow-hidden">
      <div className="px-3 py-2.5">
        {/* Author row */}
        <div className="flex items-center gap-2 mb-1.5">
          <Link to={`/${npub}`} className="shrink-0">
            <Avatar shape={avatarShape} className="size-8">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                {displayName[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>

          <div className="flex items-center gap-1 min-w-0 text-sm">
            <span className="font-bold truncate">{displayName}</span>
            {nip05 && (
              <VerifiedNip05Text nip05={nip05} pubkey={event.pubkey} className="text-muted-foreground truncate" />
            )}
            {metadata?.bot && (
              <span className="text-xs text-primary" title="Bot account">🤖</span>
            )}
            <span className="text-muted-foreground shrink-0">·</span>
            <span className="text-muted-foreground shrink-0">{timeAgo(event.created_at)}</span>
          </div>
        </div>

        {/* Content preview – clamp to a few lines */}
        <div className="text-sm line-clamp-4 overflow-hidden">
          <NoteContent event={event} className="text-sm leading-relaxed" disableEmbeds />
        </div>

        {/* Show first image thumbnail if any */}
        {images.length > 0 && (
          <div className="mt-2 rounded-lg overflow-hidden border border-border max-w-[120px]">
            <img
              src={images[0]}
              alt=""
              className="w-full h-auto max-h-[80px] object-cover"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </div>
  );
}
