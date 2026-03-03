import { useState } from 'react';
import { nip19 } from 'nostr-tools';
import { useNavigate } from 'react-router-dom';

import {
  Bookmark,
  ClipboardCopy,
  ExternalLink,
  AtSign,
  BellOff,
  VolumeX,
  Flag,
  Pin,
  FileJson,
  FileDigit,
  Trash2,
  StickyNote,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { NoteContent } from '@/components/NoteContent';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useBookmarks } from '@/hooks/useBookmarks';
import { usePinnedNotes } from '@/hooks/usePinnedNotes';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useMuteList } from '@/hooks/useMuteList';
import { useDeleteEvent } from '@/hooks/useDeleteEvent';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

interface NoteMoreMenuProps {
  event: NostrEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

function MenuItem({ icon, label, onClick, destructive }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 w-full px-5 py-3 text-[15px] transition-colors hover:bg-secondary/60',
        destructive ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function NoteMoreMenu({ event, open, onOpenChange }: NoteMoreMenuProps) {
  if (!open) return null;
  return <NoteMoreMenuContent event={event} open={open} onOpenChange={onOpenChange} />;
}

function NoteMoreMenuContent({ event, open, onOpenChange }: NoteMoreMenuProps) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const bookmarked = isBookmarked(event.id);
  const { isPinned, togglePin } = usePinnedNotes(user?.pubkey);
  const pinned = isPinned(event.id);
  const isOwnPost = user?.pubkey === event.pubkey;
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const { addMute, removeMute, isMuted } = useMuteList();
  const userMuted = isMuted('pubkey', event.pubkey);
  const { mutate: deleteEvent, isPending: isDeleting } = useDeleteEvent();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const neventId = nip19.neventEncode({ id: event.id, author: event.pubkey });

  const close = () => onOpenChange(false);

  const handleViewPostDetails = () => {
    navigate(`/${neventId}`);
    close();
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/${neventId}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied to clipboard' });
    close();
  };

  const handleViewOnNjump = () => {
    window.open(`https://njump.me/${neventId}`, '_blank', 'noopener,noreferrer');
    close();
  };

  const handleBookmark = () => {
    toggleBookmark.mutate(event.id);
    close();
  };

  const handleTogglePin = () => {
    togglePin.mutate(event.id, {
      onSuccess: () => {
        toast({ title: pinned ? 'Unpinned from profile' : 'Pinned to profile' });
      },
      onError: () => {
        toast({ title: 'Failed to update pinned posts', variant: 'destructive' });
      },
    });
    close();
  };

  const handleCopyEventId = () => {
    navigator.clipboard.writeText(event.id);
    toast({ title: 'Event ID copied to clipboard' });
    close();
  };

  const handleCopyEventJson = () => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    toast({ title: 'Event JSON copied to clipboard' });
    close();
  };

  const handleMuteConversation = () => {
    // Mute the root event of the thread, or this event if it's the root
    const rootTag = event.tags.find(([name, , , marker]) => name === 'e' && marker === 'root');
    const threadId = rootTag?.[1] ?? event.id;
    addMute.mutate(
      { type: 'thread', value: threadId },
      {
        onSuccess: () => {
          toast({ title: 'Conversation muted' });
        },
        onError: () => {
          toast({ title: 'Failed to mute conversation', variant: 'destructive' });
        },
      },
    );
    close();
  };

  const handleMention = () => {
    toast({ title: 'Mention is not yet implemented' });
    close();
  };

  const handleMuteUser = () => {
    const muteItem = { type: 'pubkey' as const, value: event.pubkey };
    const mutation = userMuted ? removeMute : addMute;
    mutation.mutate(muteItem, {
      onSuccess: () => {
        toast({ title: userMuted ? `Unmuted @${displayName}` : `Muted @${displayName}` });
      },
      onError: () => {
        toast({ title: userMuted ? 'Failed to unmute user' : 'Failed to mute user', variant: 'destructive' });
      },
    });
    close();
  };

  const handleReport = () => {
    toast({ title: 'Report is not yet implemented' });
    close();
  };

  const handleDelete = () => {
    deleteEvent(
      { eventId: event.id, eventKind: event.kind },
      {
        onSuccess: () => {
          toast({ title: 'Post deleted' });
          close();
        },
        onError: () => {
          toast({ title: 'Failed to delete post', variant: 'destructive' });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] p-0 gap-0 rounded-2xl overflow-y-auto [&>button]:hidden">
        <DialogTitle className="sr-only">Post options</DialogTitle>

        {/* Post preview */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex gap-3">
            <Avatar className="size-10 shrink-0">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm">
                {displayName[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="font-bold truncate">
                  {author.data?.event ? (
                    <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
                  ) : displayName}
                </span>
                <span className="text-muted-foreground shrink-0">·</span>
                <span className="text-muted-foreground shrink-0 text-xs">{timeAgo(event.created_at)}</span>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground line-clamp-3 max-h-[4.5em] overflow-hidden">
                <NoteContent event={event} className="text-sm leading-relaxed" disableEmbeds />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="py-1">
          <MenuItem
            icon={<StickyNote className="size-5" />}
            label="View post details"
            onClick={handleViewPostDetails}
          />
          <MenuItem
            icon={<ClipboardCopy className="size-5" />}
            label="Copy Link to Post"
            onClick={handleCopyLink}
          />
          <MenuItem
            icon={<FileDigit className="size-5" />}
            label="Copy Event ID"
            onClick={handleCopyEventId}
          />
          <MenuItem
            icon={<FileJson className="size-5" />}
            label="Copy Event JSON"
            onClick={handleCopyEventJson}
          />
          <MenuItem
            icon={<ExternalLink className="size-5" />}
            label="View post on njump.me"
            onClick={handleViewOnNjump}
          />
          <MenuItem
            icon={<Bookmark className={cn("size-5", bookmarked && "fill-current")} />}
            label={bookmarked ? 'Remove Bookmark' : 'Bookmark'}
            onClick={handleBookmark}
          />
        </div>

        <Separator />

        <div className="py-1">
          {!isOwnPost && (
            <MenuItem
              icon={<BellOff className="size-5" />}
              label="Mute Conversation"
              onClick={handleMuteConversation}
            />
          )}
          {isOwnPost && (
            <MenuItem
              icon={<Pin className={cn("size-5", pinned && "fill-current")} />}
              label={pinned ? 'Unpin from profile' : 'Pin on profile'}
              onClick={handleTogglePin}
            />
          )}
          {isOwnPost && (
            <MenuItem
              icon={<Trash2 className="size-5" />}
              label="Delete post"
              onClick={() => setDeleteConfirmOpen(true)}
              destructive
            />
          )}
          {!isOwnPost && (
            <MenuItem
              icon={<AtSign className="size-5" />}
              label={`Mention @${displayName}`}
              onClick={handleMention}
            />
          )}
        </div>

        {!isOwnPost && (
          <>
            <Separator />

            <div className="py-1">
              <MenuItem
                icon={<VolumeX className="size-5" />}
                label={userMuted ? `Unmute @${displayName}` : `Mute @${displayName}`}
                onClick={handleMuteUser}
              />
              <MenuItem
                icon={<Flag className="size-5" />}
                label={`Report @${displayName}`}
                onClick={handleReport}
                destructive
              />
            </div>
          </>
        )}

        <Separator />

        <div className="py-1">
          <Button
            variant="ghost"
            className="w-full h-auto py-3 text-[15px] font-medium text-muted-foreground hover:bg-secondary/60 rounded-none"
            onClick={close}
          >
            Close
          </Button>
        </div>
      </DialogContent>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will request deletion from relays. Some relays may still keep a copy of the original event. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
