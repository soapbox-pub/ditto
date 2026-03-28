import { useState } from 'react';
import { nip19 } from 'nostr-tools';
import { useNavigate } from 'react-router-dom';

import {
  Bookmark,
  ClipboardCopy,
  AtSign,
  BellOff,
  VolumeX,
  Flag,
  Pin,
  FileJson,
  Trash2,
  StickyNote,
  ListPlus,
  PanelLeft,
  Copy,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
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
import { getAvatarShape } from '@/lib/avatarShape';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { NoteContent } from '@/components/NoteContent';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ReportDialog } from '@/components/ReportDialog';
import { AddToListDialog } from '@/components/AddToListDialog';
import { useBookmarks } from '@/hooks/useBookmarks';
import { usePinnedNotes } from '@/hooks/usePinnedNotes';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useMuteList } from '@/hooks/useMuteList';
import { useDeleteEvent } from '@/hooks/useDeleteEvent';
import { useFeedSettings } from '@/hooks/useFeedSettings';
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

/** Encode the NIP-19 identifier for an event — naddr for addressable events, nevent otherwise. */
function encodeEventNip19(event: NostrEvent): string {
  if (event.kind >= 30000 && event.kind < 40000) {
    const dTag = event.tags.find(([n]) => n === 'd')?.[1];
    if (dTag) {
      return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    }
  }
  return nip19.neventEncode({ id: event.id, author: event.pubkey });
}

interface EventJsonDialogProps {
  event: NostrEvent;
  nip19Id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: `${label} copied to clipboard` });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function EventJsonDialog({ event, nip19Id, open, onOpenChange }: EventJsonDialogProps) {
  const jsonText = JSON.stringify(event, null, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col gap-0 p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-base font-semibold">Event Details</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3 shrink-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">Event ID</p>
          <div className="relative flex items-center bg-muted rounded-lg px-3 py-2">
            <p className="font-mono text-xs break-all text-foreground/80 flex-1 pr-2 select-all">
              {nip19Id}
            </p>
            <CopyButton text={nip19Id} label="Event ID" />
          </div>
        </div>

        <div className="px-5 pb-5 flex flex-col flex-1 min-h-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">Raw JSON</p>
          <div className="relative flex-1 min-h-0 overflow-auto rounded-lg bg-muted border border-border">
            <div className="sticky top-2 right-2 float-right mr-2">
              <CopyButton text={jsonText} label="Event JSON" />
            </div>
            <pre className="p-4 text-xs font-mono text-foreground/80 whitespace-pre leading-relaxed">
              {jsonText}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function NoteMoreMenu({ event, open, onOpenChange }: NoteMoreMenuProps) {
  // These states live here (not in NoteMoreMenuContent) so they persist after the menu closes
  const [reportOpen, setReportOpen] = useState(false);
  const [mentionComposeOpen, setMentionComposeOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [eventJsonOpen, setEventJsonOpen] = useState(false);

  const nip19Id = encodeEventNip19(event);
  const mentionContent = `nostr:${nip19.npubEncode(event.pubkey)} `;

  return (
    <>
      {open && (
        <NoteMoreMenuContent
          event={event}
          open={open}
          onOpenChange={onOpenChange}
          onReport={() => {
            onOpenChange(false);
            setTimeout(() => setReportOpen(true), 150);
          }}
          onMention={() => {
            onOpenChange(false);
            setTimeout(() => setMentionComposeOpen(true), 150);
          }}
          onAddToList={() => {
            onOpenChange(false);
            setTimeout(() => setAddToListOpen(true), 150);
          }}
          onViewEventJson={() => {
            onOpenChange(false);
            setTimeout(() => setEventJsonOpen(true), 150);
          }}
        />
      )}

      <ReportDialog event={event} open={reportOpen} onOpenChange={setReportOpen} />

      <ReplyComposeModal
        open={mentionComposeOpen}
        onOpenChange={setMentionComposeOpen}
        initialContent={mentionContent}
        title="New post"
      />

      <AddToListDialog
        pubkey={event.pubkey}
        open={addToListOpen}
        onOpenChange={setAddToListOpen}
      />

      <EventJsonDialog
        event={event}
        nip19Id={nip19Id}
        open={eventJsonOpen}
        onOpenChange={setEventJsonOpen}
      />
    </>
  );
}

interface NoteMoreMenuContentProps extends NoteMoreMenuProps {
  onReport: () => void;
  onMention: () => void;
  onAddToList: () => void;
  onViewEventJson: () => void;
}

function NoteMoreMenuContent({ event, open, onOpenChange, onReport, onMention, onAddToList, onViewEventJson }: NoteMoreMenuContentProps) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const bookmarked = isBookmarked(event.id);
  const { isPinned, togglePin } = usePinnedNotes(user?.pubkey);
  const pinned = isPinned(event.id);
  const isOwnPost = user?.pubkey === event.pubkey;
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const { addMute, removeMute, isMuted } = useMuteList();
  const userMuted = isMuted('pubkey', event.pubkey);
  const { mutate: deleteEvent, isPending: isDeleting } = useDeleteEvent();
  const { addToSidebar, removeFromSidebar, orderedItems } = useFeedSettings();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const nip19Id = encodeEventNip19(event);
  const nostrUri = `nostr:${nip19Id}`;
  const isInSidebar = orderedItems.includes(nostrUri);

  const close = () => onOpenChange(false);

  const handleViewPostDetails = () => {
    navigate(`/${nip19Id}`);
    close();
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/${nip19Id}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied to clipboard' });
    close();
  };

  const handleBookmark = () => {
    toggleBookmark.mutate(event.id);
    close();
  };

  const handleToggleSidebar = () => {
    if (isInSidebar) {
      removeFromSidebar(nostrUri);
      toast({ title: 'Removed from sidebar' });
    } else {
      addToSidebar(nostrUri);
      toast({ title: 'Added to sidebar' });
    }
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

  const handleMuteConversation = () => {
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
            <Avatar shape={avatarShape} className="size-10 shrink-0">
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
            icon={<FileJson className="size-5" />}
            label="View Event JSON"
            onClick={onViewEventJson}
          />
          <MenuItem
            icon={<Bookmark className={cn("size-5", bookmarked && "fill-current")} />}
            label={bookmarked ? 'Remove Bookmark' : 'Bookmark'}
            onClick={handleBookmark}
          />
          {user && (
            <MenuItem
              icon={<ListPlus className="size-5" />}
              label="Add to list"
              onClick={() => { onAddToList(); }}
            />
          )}
          <MenuItem
            icon={isInSidebar ? <Trash2 className="size-5" /> : <PanelLeft className="size-5" />}
            label={isInSidebar ? 'Remove from sidebar' : 'Add to sidebar'}
            onClick={handleToggleSidebar}
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
              onClick={onMention}
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
                onClick={onReport}
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
