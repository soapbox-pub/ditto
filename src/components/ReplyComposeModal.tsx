import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { NoteContent } from '@/components/NoteContent';
import { ComposeBox } from '@/components/ComposeBox';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';

interface ReplyComposeModalProps {
  event: NostrEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Extracts image URLs from note content. */
function extractImages(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  return content.match(urlRegex) || [];
}

export function ReplyComposeModal({ event, open, onOpenChange }: ReplyComposeModalProps) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-2xl p-0 gap-0 border-border overflow-hidden [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12">
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 -ml-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-5" />
          </button>
          <DialogTitle className="text-base font-semibold">Reply to post</DialogTitle>
          <div className="w-8" />
        </div>

        {/* Embedded original post */}
        <EmbeddedPost event={event} onDismiss={() => {}} />

        {/* Compose area */}
        <ComposeBox
          replyTo={event}
          onSuccess={() => onOpenChange(false)}
          placeholder="What's on your mind?"
          forceExpanded
          hideAvatar
        />
      </DialogContent>
    </Dialog>
  );
}

/** Compact embedded preview of the post being replied to. */
function EmbeddedPost({ event }: { event: NostrEvent; onDismiss?: () => void }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
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
            <Avatar className="size-8">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                {displayName[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>

          <div className="flex items-center gap-1 min-w-0 text-sm">
            <span className="font-bold truncate">{displayName}</span>
            {nip05 && (
              <span className="text-muted-foreground truncate">@{nip05}</span>
            )}
            {metadata?.bot && (
              <span className="text-xs text-primary" title="Bot account">🤖</span>
            )}
            <span className="text-muted-foreground shrink-0">·</span>
            <span className="text-muted-foreground shrink-0">{timeAgo(event.created_at)}</span>
          </div>
        </div>

        {/* Content preview – clamp to a few lines */}
        <div className="text-sm line-clamp-4">
          <NoteContent event={event} className="text-sm leading-relaxed" />
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
