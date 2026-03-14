import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Zap, Flame, MoreHorizontal, Share2, ClipboardCopy, ExternalLink, VolumeX, Flag, Bitcoin, Users, Pin, X, QrCode, Check, Copy, Loader2, Download, Palette, Pencil, Trash2, Eye, EyeOff, RefreshCw, MessageSquare, Globe, Mail, Plus, GripVertical, ListPlus, Award } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape, isEmoji, emojiAvatarBorderStyle } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { ProfileRightSidebar } from '@/components/ProfileRightSidebar';
import { NoteCard } from '@/components/NoteCard';
import { ComposeBox } from '@/components/ComposeBox';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ZapDialog } from '@/components/ZapDialog';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { Nip05Badge, VerifiedNip05Text } from '@/components/Nip05Badge';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { usePinnedNotes } from '@/hooks/usePinnedNotes';

import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { useProfileFeed, useProfileLikes as useProfileLikesInfinite, filterByTab } from '@/hooks/useProfileFeed';
import type { ProfileTab as CoreProfileTab } from '@/hooks/useProfileFeed';
import { useProfileMedia } from '@/hooks/useProfileMedia';
import { MediaCollage, MediaCollageSkeleton } from '@/components/MediaCollage';
import { useProfileSupplementary } from '@/hooks/useProfileData';
import { useWallComments } from '@/hooks/useWallComments';
import { ThreadedReplyList } from '@/components/ThreadedReplyList';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';
import { genUserName } from '@/lib/genUserName';

import { canZap } from '@/lib/canZap';
import { shareOrCopy } from '@/lib/share';
import { EmojifiedText } from '@/components/CustomEmoji';
import { BioContent } from '@/components/BioContent';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { PullToRefresh } from '@/components/PullToRefresh';
import { ReportDialog } from '@/components/ReportDialog';
import { AddToListDialog } from '@/components/AddToListDialog';
import { MiniAudioPlayer, isAudioUrl } from '@/components/MiniAudioPlayer';

import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { usePublishTheme } from '@/hooks/usePublishTheme';
import { useTheme } from '@/hooks/useTheme';
import { useUserStatus } from '@/hooks/useUserStatus';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useProfileTabs } from '@/hooks/useProfileTabs';
import { usePublishProfileTabs } from '@/hooks/usePublishProfileTabs';

import { ProfileTabEditModal } from '@/components/ProfileTabEditModal';
import { useStreamPosts } from '@/hooks/useStreamPosts';
import { useResolveTabFilter } from '@/hooks/useResolveTabFilter';
import type { ProfileTab, ProfileTabsData, TabFilter, TabVarDef } from '@/lib/profileTabsEvent';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  rectSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { buildThemeCssFromCore, coreToTokens, buildThemeCss, resolveTheme, resolveThemeConfig, toThemeVar, type CoreThemeColors, type ThemeConfig, type ThemeFont, type ThemeBackground } from '@/themes';
import { loadAndApplyFont } from '@/lib/fontLoader';
import { hslStringToHex, hexToHslString } from '@/lib/colorUtils';
import { ColorPicker } from '@/components/ui/color-picker';
import { FontPicker } from '@/components/FontPicker';
import { BackgroundPicker } from '@/components/BackgroundPicker';
import { PortalContainerProvider } from '@/contexts/PortalContainerContext';
import { formatNumber } from '@/lib/formatNumber';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import type { AddrCoords } from '@/hooks/useEvent';
import type { FeedItem } from '@/lib/feedUtils';
import type { NostrEvent } from '@nostrify/nostrify';
import QRCode from 'qrcode';

const STREAK_WINDOW_HOURS = 24;
const STREAK_DISPLAY_LIMIT = 99;

/** Calculate posting streak: consecutive kind 1 posts within 24-hour windows. */
function calculateStreak(posts: NostrEvent[]): number {
  if (!posts || posts.length === 0) return 0;

  const kind1Posts = posts.filter((e) => e.kind === 1);
  if (kind1Posts.length === 0) return 0;

  const sorted = [...kind1Posts].sort((a, b) => b.created_at - a.created_at);
  const windowSeconds = STREAK_WINDOW_HOURS * 3600;

  let streak = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i].created_at - sorted[i + 1].created_at;
    if (gap <= windowSeconds) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/** Parse the custom "fields" array from kind 0 metadata content. */
function parseProfileFields(content: string): Array<{ label: string; value: string }> {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.fields)) {
      return parsed.fields
        .filter((f: unknown) => Array.isArray(f) && f.length >= 2)
        .map((f: string[]) => ({ label: f[0], value: f[1] }));
    }
  } catch {
    // Invalid JSON
  }
  return [];
}

// useFollowList is now imported from @/hooks/useFollowActions

// ----- Profile More Menu -----

interface ProfileMoreMenuProps {
  pubkey: string;
  displayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwnProfile?: boolean;
}

function ProfileMoreMenu({ pubkey, displayName, open, onOpenChange, isOwnProfile }: ProfileMoreMenuProps) {
  const { toast } = useToast();
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const { addMute, removeMute, isMuted } = useMuteList();
  const userMuted = isMuted('pubkey', pubkey);
  const [reportOpen, setReportOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);

  const close = () => onOpenChange(false);

  const handleCopyPubkey = () => {
    navigator.clipboard.writeText(npubEncoded);
    toast({ title: 'Public key copied to clipboard' });
    close();
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/${npubEncoded}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Profile link copied to clipboard' });
    close();
  };

  const handleViewOnNjump = () => {
    window.open(`https://njump.me/${npubEncoded}`, '_blank', 'noopener,noreferrer');
    close();
  };

  const handleMuteUser = () => {
    const muteItem = { type: 'pubkey' as const, value: pubkey };
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
    close();
    setTimeout(() => setReportOpen(true), 150);
  };

  const handleAddToList = () => {
    close();
    setTimeout(() => setAddToListOpen(true), 150);
  };

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">Profile options</DialogTitle>

        <div className="py-1">
          <MenuRow
            icon={<ClipboardCopy className="size-5" />}
            label="Copy public key"
            onClick={handleCopyPubkey}
          />
          <MenuRow
            icon={<ClipboardCopy className="size-5" />}
            label="Copy profile link"
            onClick={handleCopyLink}
          />
          <MenuRow
            icon={<ExternalLink className="size-5" />}
            label="View on njump.me"
            onClick={handleViewOnNjump}
          />
          <MenuRow
            icon={<ListPlus className="size-5" />}
            label="Add to list"
            onClick={handleAddToList}
          />
        </div>

        {!isOwnProfile && (
          <>
            <Separator />

            <div className="py-1">
              <MenuRow
                icon={<VolumeX className="size-5" />}
                label={userMuted ? `Unmute @${displayName}` : `Mute @${displayName}`}
                onClick={handleMuteUser}
              />
              <MenuRow
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
    </Dialog>

    <ReportDialog pubkey={pubkey} open={reportOpen} onOpenChange={setReportOpen} />

    <AddToListDialog
      pubkey={pubkey}
      displayName={displayName}
      open={addToListOpen}
      onOpenChange={setAddToListOpen}
    />
  </>
  );
}

function MenuRow({ icon, label, onClick, destructive }: { icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }) {
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

// ----- Following User Row -----

function FollowingUserRow({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(pubkey);
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  return (
    <Link
      to={`/${npubEncoded}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors"
    >
      {author.isLoading ? (
        <>
          <Skeleton className="size-10 rounded-full shrink-0" />
          <div className="space-y-1.5 min-w-0">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        </>
      ) : (
        <>
          <Avatar shape={avatarShape} className="size-10 shrink-0">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm truncate">
              {author.data?.event ? (
                <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
              ) : displayName}
            </div>
            {metadata?.nip05 && (
              <VerifiedNip05Text nip05={metadata.nip05} pubkey={pubkey} className="text-xs text-muted-foreground truncate block" />
            )}
            {metadata?.about && (
              <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{metadata.about}</div>
            )}
          </div>
        </>
      )}
    </Link>
  );
}

// ----- Following List Modal -----

interface FollowingListModalProps {
  pubkeys: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
}

function FollowingListModal({ pubkeys, open, onOpenChange, displayName }: FollowingListModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <DialogTitle className="text-base font-bold">{displayName} follows</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full size-8"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <ScrollArea className="max-h-[60vh]">
          {pubkeys.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Not following anyone yet.
            </div>
          ) : (
            pubkeys.map((pk) => <FollowingUserRow key={pk} pubkey={pk} />)
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ----- Tab Button -----

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 px-4 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 max-w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
  );
}

type EditableTab = { label: string; isCore: boolean; tab?: ProfileTab };

function SortableTabChip({
  tab, active, onSelect, onRemove,
}: {
  tab: EditableTab;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.label });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      className={cn(
        'shrink-0 relative flex items-stretch group/chip px-1 text-sm font-medium select-none',
        active ? 'text-foreground' : 'text-muted-foreground',
        isDragging && 'opacity-60 z-50',
      )}
      {...attributes}
    >
      {/* Grip handle */}
      <span
        {...listeners}
        className="shrink-0 flex items-center cursor-grab active:cursor-grabbing touch-none pr-1"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4 text-muted-foreground/40" />
      </span>

      {/* Tab label — tap navigates */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className="py-3.5 pr-1"
      >
        {tab.label}
      </button>

      {/* Active indicator bar */}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
      )}

      {/* × — only rendered when active */}
      {active && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 flex items-center justify-center text-xl leading-none font-bold py-3.5 pr-1 text-muted-foreground/50 hover:text-destructive transition-colors"
          aria-label={`Remove ${tab.label}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ----- Favicon (mobile) -----



// ----- Bitcoin QR Modal (mobile) -----

function BitcoinQRModal({ address }: { address: string }) {
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    QRCode.toDataURL(`bitcoin:${address}`, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    }).then(setQrUrl).catch(console.error);
  }, [address]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast({ title: 'Copied', description: 'Bitcoin address copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DialogContent className="sm:max-w-[360px] p-6 overflow-hidden rounded-2xl [&>button]:top-6 [&>button]:right-6">
      <div className="min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
              <Bitcoin className="size-4 text-white" />
            </div>
            <span>Bitcoin</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-center my-5">
          <div className="bg-white p-3 rounded-xl">
            {qrUrl ? (
              <img src={qrUrl} alt="Bitcoin QR" className="size-[220px]" />
            ) : (
              <div className="size-[220px] bg-muted animate-pulse rounded" />
            )}
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-2 w-full bg-secondary/60 hover:bg-secondary/80 transition-colors rounded-lg pl-3 pr-2.5 py-2.5 text-left cursor-pointer overflow-hidden"
        >
          <span className="min-w-0 font-mono text-xs truncate">{address}</span>
          <span className="shrink-0 ml-auto">
            {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4 text-muted-foreground" />}
          </span>
        </button>
      </div>
    </DialogContent>
  );
}

// ----- Profile field helpers -----

/** Simple email regex for display purposes. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bech32 charset used by NIP-19 identifiers. */
const B32 = '023456789acdefghjklmnpqrstuvwxyz';

/** Regex that matches nostr:<nip19> URIs. */
const NOSTR_URI_REGEX = new RegExp(`^nostr:(note1|nevent1|naddr1|npub1|nprofile1)[${B32}]+$`);

/** Parse a nostr: URI value and return embed info, or null if not a valid nostr URI. */
function parseNostrUri(value: string): { type: 'note'; eventId: string } | { type: 'nevent'; eventId: string; relays?: string[]; author?: string } | { type: 'naddr'; addr: AddrCoords } | { type: 'profile'; pubkey: string } | null {
  const trimmed = value.trim();
  if (!NOSTR_URI_REGEX.test(trimmed)) return null;
  try {
    const bech32 = trimmed.slice('nostr:'.length);
    const decoded = nip19.decode(bech32);
    switch (decoded.type) {
      case 'note':
        return { type: 'note', eventId: decoded.data as string };
      case 'nevent':
        return { type: 'nevent', eventId: decoded.data.id, relays: decoded.data.relays, author: decoded.data.author };
      case 'naddr':
        return { type: 'naddr', addr: decoded.data as AddrCoords };
      case 'npub':
        return { type: 'profile', pubkey: decoded.data as string };
      case 'nprofile':
        return { type: 'profile', pubkey: decoded.data.pubkey };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ----- Inline Profile Field (mobile) -----

function ProfileFieldInline({ field }: { field: { label: string; value: string } }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const isBtc = field.label === '$BTC';
  const isUrl = field.value.startsWith('http://') || field.value.startsWith('https://');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(field.value);
    setCopied(true);
    toast({ title: 'Copied', description: 'Bitcoin address copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  if (isBtc) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="size-5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
          <Bitcoin className="size-3 text-white" />
        </div>
        <span className="text-sm font-semibold shrink-0">Bitcoin</span>
        <span className="text-sm text-muted-foreground font-mono truncate">{field.value.slice(0, 12)}…{field.value.slice(-6)}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
            title="Copy address"
          >
            {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
          </button>
          <Dialog>
            <DialogTrigger asChild>
              <button className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary" title="Show QR code">
                <QrCode className="size-4" />
              </button>
            </DialogTrigger>
            <BitcoinQRModal address={field.value} />
          </Dialog>
          <a
            href={`https://mempool.space/address/${field.value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
            title="View on mempool.space"
          >
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
    );
  }

  // Nostr URI: render embedded event
  const nostrEmbed = parseNostrUri(field.value);
  if (nostrEmbed) {
    return (
      <div className="min-w-0">
        <span className="text-sm text-muted-foreground">{field.label}</span>
        {nostrEmbed.type === 'note' && (
          <EmbeddedNote eventId={nostrEmbed.eventId} className="mt-1" />
        )}
        {nostrEmbed.type === 'nevent' && (
          <EmbeddedNote eventId={nostrEmbed.eventId} relays={nostrEmbed.relays} authorHint={nostrEmbed.author} className="mt-1" />
        )}
        {nostrEmbed.type === 'naddr' && (
          <EmbeddedNaddr addr={nostrEmbed.addr} className="mt-1" />
        )}
        {nostrEmbed.type === 'profile' && (
          <Link to={`/${nip19.npubEncode(nostrEmbed.pubkey)}`} className="text-sm text-primary hover:underline">
            {nip19.npubEncode(nostrEmbed.pubkey).slice(0, 16)}...
          </Link>
        )}
      </div>
    );
  }

  // Email field: render as mailto link
  const isEmail = field.label.toLowerCase() === 'email' && EMAIL_REGEX.test(field.value);
  if (isEmail) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <Mail className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm text-muted-foreground shrink-0">{field.label}</span>
        <a href={`mailto:${field.value}`} className="text-sm text-primary hover:underline truncate">
          {field.value}
        </a>
      </div>
    );
  }

  if (isUrl && isAudioUrl(field.value)) {
    return <MiniAudioPlayer src={field.value} label={field.label || undefined} />;
  }

  if (isUrl) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <ExternalFavicon url={field.value} size={16} className="shrink-0" />
        <span className="text-sm text-muted-foreground shrink-0">{field.label}</span>
        <a
          href={field.value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline truncate"
        >
          {field.value.replace(/^https?:\/\//, '')}
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-sm text-muted-foreground shrink-0">{field.label}</span>
      <span className="text-sm truncate">{field.value}</span>
    </div>
  );
}

// ----- Pinned Label -----

function PinnedLabel({ isOwn, onUnpin }: { isOwn: boolean; onUnpin: () => void }) {
  if (isOwn) {
    return (
      <button
        className="group flex items-center gap-1.5 text-xs text-muted-foreground px-4 pt-3 pb-0 hover:text-destructive transition-colors"
        onClick={(e) => { e.stopPropagation(); onUnpin(); }}
      >
        <Pin className="size-3 rotate-45" />
        <span className="group-hover:hidden">Pinned</span>
        <span className="hidden group-hover:inline">Unpin?</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-4 pt-3 pb-0">
      <Pin className="size-3 rotate-45" />
      <span>Pinned</span>
    </div>
  );
}

// ----- Profile Image Lightbox -----

function ProfileImageLightbox({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG' || target.closest('button') || target.closest('[data-gallery-topbar]')) return;
    e.stopPropagation();
    e.preventDefault();
    onClose();
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const a = document.createElement('a');
    a.href = imageUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

      <div data-gallery-topbar className="absolute left-0 right-0 z-10 flex items-center justify-end px-4 py-3 safe-area-inset-top">
        <div className="flex items-center gap-1">
          <button
            onClick={handleDownload}
            className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Open original"
          >
            <Download className="size-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
            className="p-2.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div className="relative z-[1] flex items-center justify-center w-full h-full px-4 py-16 sm:px-16">
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
        <img
          key={imageUrl}
          src={imageUrl}
          alt=""
          className={cn(
            'max-w-full max-h-full object-contain rounded-lg select-none transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setIsLoaded(true)}
          draggable={false}
        />
      </div>
    </div>
  );
}

// ----- Main Component -----

export function ProfilePage() {
  const { config } = useAppContext();
  const params = useParams();
  const npub = params.npub ?? params.nip19;
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { muteItems } = useMuteList();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<CoreProfileTab | string>('posts');
  const [sidebarMediaUrl, setSidebarMediaUrl] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [followingModalOpen, setFollowingModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Determine if the URL param is a NIP-05 identifier (contains @ or is a domain-like string)
  const isNip05Param = useMemo(() => {
    if (!npub) return false;
    // If it contains @, it's a NIP-05 identifier (e.g., user@domain.com)
    if (npub.includes('@')) return true;
    // If it contains a dot and doesn't start with npub1/nprofile1, it's a domain (e.g., fiatjaf.com)
    if (npub.includes('.') && !npub.startsWith('npub1') && !npub.startsWith('nprofile1')) return true;
    return false;
  }, [npub]);

  // Resolve NIP-05 identifier to pubkey if needed.
  // Use `isPending` (not `isLoading`) so the skeleton shows during the initial
  // React Query render where fetchStatus is still 'idle' before the first fetch
  // fires — isLoading (= isPending && isFetching) would be false in that window,
  // incorrectly triggering the "User not found" branch on a hard refresh.
  const { data: nip05Pubkey, isPending: nip05Loading } = useNip05Resolve(isNip05Param ? npub : undefined);

  // Determine pubkey: from NIP-05 resolution, NIP-19 decoding, or logged-in user
  const pubkey = useMemo(() => {
    if (npub) {
      // If it's a NIP-05 identifier, use the resolved pubkey
      if (isNip05Param) {
        return nip05Pubkey ?? undefined;
      }
      // Otherwise try to decode as NIP-19
      try {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') return decoded.data;
        if (decoded.type === 'nprofile') return decoded.data.pubkey;
      } catch {
        return undefined;
      }
    }
    return user?.pubkey;
  }, [npub, user, isNip05Param, nip05Pubkey]);

  // Custom profile tabs from kind 16769
  const profileTabsQuery = useProfileTabs(pubkey);

  // Extract tabs and vars from the kind 16769 data
  const profileTabsData = useMemo<ProfileTabsData | null>(() => {
    if (!profileTabsQuery.isFetched) return null;
    return profileTabsQuery.data ?? null;
  }, [profileTabsQuery.data, profileTabsQuery.isFetched]);

  const profileSavedTabs = useMemo<ProfileTab[]>(() => {
    return profileTabsData?.tabs ?? [];
  }, [profileTabsData]);

  const profileVars = useMemo(() => profileTabsData?.vars ?? [], [profileTabsData]);

  const { publishProfileTabs, isPending: isPublishingTabs } = usePublishProfileTabs();

  // Tab edit mode (inline reorder/remove/add)
  const [tabEditMode, setTabEditMode] = useState(false);

  // All tabs as a flat ordered list for the drag UI — core tabs have isCore=true and can't be removed
  type EditableTab = { label: string; isCore: boolean; tab?: ProfileTab };
  const CORE_TAB_LABELS = ['Posts', 'Posts & replies', 'Media', 'Badges', 'Likes', 'Wall'];
  const DEFAULT_TAB_LABELS = ['Posts', 'Posts & replies', 'Media', 'Likes', 'Wall'];
  const [localTabs, setLocalTabs] = useState<EditableTab[]>([]);
  const [tabModalOpen, setTabModalOpen] = useState(false);
  const [editingTab, setEditingTab] = useState<ProfileTab | undefined>(undefined);

  // Map from display label → internal tab id for core tabs
  const CORE_TAB_IDS: Record<string, string> = {
    'Posts': 'posts', 'Posts & replies': 'replies',
    'Media': 'media', 'Badges': 'badges', 'Likes': 'likes', 'Wall': 'wall',
  };

  // The ordered tab list for view mode:
  // - null (no kind 16769 event) → show all 5 defaults
  // - [] (event exists, all removed) → show nothing
  // - [...] (event with tabs) → show exactly those
  const viewTabs: EditableTab[] = useMemo(() => {
    if (profileTabsData === null) {
      // No event yet — show defaults (subset of core tabs)
      return DEFAULT_TAB_LABELS.map((label) => ({ label, isCore: true }));
    }
    // Event exists — use its tab list (may be empty)
    return profileTabsData.tabs.map((t) =>
      CORE_TAB_LABELS.includes(t.label)
        ? { label: t.label, isCore: true }
        : { label: t.label, isCore: false, tab: t },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileTabsData]);

  // Derive the ID of the first visible tab (used as default selection).
  const firstTabId = useMemo(() => {
    if (viewTabs.length === 0) return 'posts';
    const first = viewTabs[0];
    return CORE_TAB_IDS[first.label] ?? first.label;
  }, [viewTabs]);

  // When profile tabs finish loading, focus the leftmost tab.
  useEffect(() => {
    if (profileTabsQuery.isFetched) {
      setActiveTab(firstTabId);
    }
  }, [profileTabsQuery.isFetched, firstTabId]);

  const enterTabEditMode = () => {
    setLocalTabs(viewTabs);
    setTabEditMode(true);
  };

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalTabs((prev) => {
        const oldIdx = prev.findIndex((t) => t.label === active.id);
        const newIdx = prev.findIndex((t) => t.label === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const handleRemoveLocalTab = (label: string) => {
    setLocalTabs((prev) => prev.filter((t) => t.label !== label));
  };

  // Canonical NIP-01 filters for core tabs so other clients can interpret the event.
  // Values are interpolated with the actual pubkey (not $me) since these are concrete filters.
  const CORE_TAB_FILTERS: Record<string, TabFilter> = pubkey ? {
    'Posts': { kinds: [1, 6], authors: [pubkey] },
    'Posts & replies': { authors: [pubkey] },
    'Media': { kinds: [1], authors: [pubkey] },
    'Badges': { kinds: [30008], authors: [pubkey], '#d': ['profile_badges'] },
    'Likes': { kinds: [7], authors: [pubkey] },
    'Wall': { kinds: [1111], '#A': [`0:${pubkey}:`] },
  } : {};

  const handleSaveTabEdit = async () => {
    // Publish ALL tabs in order — core tabs get canonical filters,
    // custom tabs keep their full filter objects
    const allTabs: ProfileTab[] = localTabs.map((t) =>
      t.tab ?? { label: t.label, filter: CORE_TAB_FILTERS[t.label] ?? {} },
    );
    await publishProfileTabs({ tabs: allTabs, vars: profileVars });
    // If the active tab was removed, fall back to the first remaining tab
    const remainingIds = localTabs.map((t) => CORE_TAB_IDS[t.label] ?? t.label);
    if (!remainingIds.includes(activeTab)) {
      setActiveTab(remainingIds[0] ?? 'posts');
    }
    setTabEditMode(false);
  };

  const handleOpenAddCustomTab = () => { setEditingTab(undefined); setTabModalOpen(true); };

  // Called from the add/edit modal — in edit mode append to localTabs; otherwise publish immediately
  const handleSaveTab = async (tab: ProfileTab) => {
    if (tabEditMode) {
      setLocalTabs((prev) =>
        editingTab
          ? prev.map((t) => t.label === editingTab.label ? { label: tab.label, isCore: false, tab } : t)
          : [...prev, { label: tab.label, isCore: false, tab }],
      );
    } else {
      const base = editingTab
        ? profileSavedTabs.map((t) => t.label === editingTab.label ? tab : t)
        : [...profileSavedTabs, tab];
      await publishProfileTabs({ tabs: base, vars: profileVars });
    }
  };

  const dndSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Drop active tab if it was deleted
  useEffect(() => {
    const isCoreTab = ['posts', 'replies', 'media', 'badges', 'likes', 'wall'].includes(activeTab);
    if (!isCoreTab && !profileSavedTabs.find((t) => t.label === activeTab)) {
      setActiveTab(firstTabId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileSavedTabs, firstTabId]);

  // Whether the profile has any visible tabs.
  const hasTabs = viewTabs.length > 0;

  // Infinite-scroll profile feed (posts/replies/media).
  // The first page piggybacks kind 0, seeding the author cache so the
  // profile header renders from the same relay round-trip as the feed.
  const {
    data: feedData,
    isPending: feedPending,
    fetchNextPage: fetchNextFeedPage,
    hasNextPage: hasNextFeedPage,
    isFetchingNextPage: isFetchingNextFeedPage,
  } = useProfileFeed(pubkey, hasTabs);

  // Kind 0 — resolved from the author cache (seeded by the feed query above).
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const isEmojiShape = !!avatarShape && isEmoji(avatarShape);
  const profileStatus = useUserStatus(pubkey);

  // Refetch the author's profile whenever we navigate to this profile page.
  useEffect(() => {
    if (pubkey) {
      queryClient.refetchQueries({ queryKey: ['author', pubkey] });
    }
  }, [pubkey, queryClient]);
  const metadataEvent = author.data?.event;
  const displayName = metadata?.name || (pubkey ? genUserName(pubkey) : 'Anonymous');

  // Kind 3 + 10001 — fetched separately so the large contact list
  // doesn't block the profile header or feed from rendering.
  const { data: supplementary } = useProfileSupplementary(pubkey);

  // Parse profile fields from the raw kind 0 event content (website and lightning are shown in the header instead)
  const fields = useMemo(() => {
    return metadataEvent?.content ? parseProfileFields(metadataEvent.content) : [];
  }, [metadataEvent?.content]);

  useSeoMeta({
    title: `${displayName} | ${config.appName}`,
    description: metadata?.about || 'Nostr profile',
  });

  // Profile media — dedicated search query via relay.ditto.pub (video:true image:true)
  const {
    data: mediaData,
    isPending: mediaPending,
    fetchNextPage: fetchNextMediaPage,
    hasNextPage: hasNextMediaPage,
    isFetchingNextPage: isFetchingNextMediaPage,
  } = useProfileMedia(pubkey, hasTabs);

  // Infinite-scroll likes
  const {
    data: likesData,
    isPending: likesPending,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
  } = useProfileLikesInfinite(pubkey, hasTabs && activeTab === 'likes');

  // Wall comments (NIP-22 kind 1111 on user's kind 0, filtered by their follow list)
  const wallFollowList = useMemo(() => supplementary?.following, [supplementary?.following]);
  const {
    data: wallData,
    isPending: wallPending,
    fetchNextPage: fetchNextWallPage,
    hasNextPage: hasNextWallPage,
    isFetchingNextPage: isFetchingNextWallPage,
  } = useWallComments(pubkey, hasTabs ? wallFollowList : undefined);

  // Synthetic kind 0 event for the ComposeBox replyTo (NIP-22 comments on the profile)
  const wallReplyTarget = useMemo((): NostrEvent | undefined => {
    if (!pubkey) return undefined;
    // Use the real kind 0 event if available, otherwise build a minimal synthetic one
    if (metadataEvent) return metadataEvent;
    return {
      id: '',
      kind: 0,
      pubkey,
      content: '',
      created_at: 0,
      sig: '',
      tags: [],
    };
  }, [pubkey, metadataEvent]);

  // Wall compose modal state (for FAB on wall tab)
  const [wallComposeOpen, setWallComposeOpen] = useState(false);

  // Follow list (cached, for display checks only)
  const { data: followData } = useFollowList();

  // Safe follow/unfollow actions (fetches fresh data from multiple relays before mutating)
  const { follow, unfollow, isPending: followPending } = useFollowActions();

  // Profile's following list (derived from supplementary query)
  const profileFollowing = useMemo(() => {
    const pubkeys = supplementary?.following ?? [];
    return { pubkeys, count: pubkeys.length };
  }, [supplementary?.following]);

  const isOwnProfile = user?.pubkey === pubkey;

  // Does the profile owner follow the current user?
  // Wall posts are only visible to people the profile owner follows,
  // so we hide the compose box if the profile owner doesn't follow us.
  const profileFollowsMe = useMemo(() => {
    if (!user?.pubkey || !wallFollowList) return false;
    if (isOwnProfile) return true;
    return wallFollowList.includes(user.pubkey);
  }, [user?.pubkey, wallFollowList, isOwnProfile]);
  const { togglePin } = usePinnedNotes(isOwnProfile ? pubkey : undefined);

  // Profile theme: always query (so we can show the indicator), but only apply when enabled
  const { feedSettings } = useFeedSettings();
  const showCustomProfileThemes = feedSettings.showCustomProfileThemes !== false;
  const profileThemeQuery = useActiveProfileTheme(pubkey);
  const profileTheme = profileThemeQuery.data;
  const profileHasTheme = !!profileTheme?.colors;
  const profileThemeColors = (showCustomProfileThemes || isOwnProfile) ? profileTheme?.colors : undefined;

  // First-time custom theme info modal
  const [hasSeenThemeInfo, setHasSeenThemeInfo] = useLocalStorage('ditto:seen-profile-theme-info', false);
  const [themeInfoOpen, setThemeInfoOpen] = useState(false);
  const { updateFeedSettings } = useFeedSettings();
  const { updateSettings: encryptedUpdateSettings } = useEncryptedSettings();

  // Own-profile share theme prompt
  const { setActiveTheme, clearActiveTheme, isPending: isPublishingTheme } = usePublishTheme();
  const [shareThemeOpen, setShareThemeOpen] = useState(false);
  const [removeThemeOpen, setRemoveThemeOpen] = useState(false);
  const [editProfileThemeOpen, setEditProfileThemeOpen] = useState(false);
  const [editThemePortalContainer, setEditThemePortalContainer] = useState<HTMLElement | undefined>(undefined);
  const editThemeContentRef = useCallback((node: HTMLElement | null) => {
    setEditThemePortalContainer(node ?? undefined);
  }, []);
  const [localProfileColors, setLocalProfileColors] = useState<CoreThemeColors>({
    background: '228 20% 10%',
    text: '210 40% 98%',
    primary: '258 70% 60%',
  });
  const [localProfileFont, setLocalProfileFont] = useState<ThemeFont | undefined>();
  const [localProfileBg, setLocalProfileBg] = useState<ThemeBackground | undefined>();

  // Initialize local state from profile theme when dialog opens
  useEffect(() => {
    if (editProfileThemeOpen && profileTheme) {
      setLocalProfileColors(profileTheme.colors);
      setLocalProfileFont(profileTheme.font);
      setLocalProfileBg(profileTheme.background);
    }
  }, [editProfileThemeOpen, profileTheme]);
  const [dismissedThemeSnapshot, setDismissedThemeSnapshot] = useLocalStorage<string | null>('ditto:dismissed-share-theme-snapshot', null);

  // Temporarily apply the visited user's theme globally while on their profile
  const { theme: ownTheme, customTheme: ownCustomTheme, themes: configuredThemes, applyCustomTheme } = useTheme();

  // Keep a ref to the latest own theme values so the cleanup function reads
  // the *current* values (e.g. after "Copy Theme" was used) instead of stale closure values.
  const ownThemeRef = useRef({ ownTheme, ownCustomTheme, configuredThemes });
  ownThemeRef.current = { ownTheme, ownCustomTheme, configuredThemes };
  const profileThemeFont = (showCustomProfileThemes || isOwnProfile) ? profileTheme?.font : undefined;
  const profileThemeBackground = (showCustomProfileThemes || isOwnProfile) ? profileTheme?.background : undefined;

  // Whether we need to override the custom theme on this profile.
  // When the profile has no published theme and the user has a custom app theme,
  // fall back to the system-resolved builtin theme (light/dark based on OS preference)
  // so the profile doesn't appear with the user's custom colors.
  // Only apply this fallback once the query has settled (not while loading),
  // to avoid a jarring flash — especially on your own profile where the
  // current custom theme is already correct.
  const profileThemeSettled = profileThemeQuery.isFetched;
  const needsSystemFallback = profileThemeSettled && !profileThemeColors && ownTheme === 'custom';

  // Detect whether the app custom theme differs from the published profile theme.
  // Colors are compared via hex to avoid HSL precision issues from the hex round-trip.
  // Fonts are compared by family name only, since the URL is resolved to a CDN URL at
  // publish time and won't match the local config which omits it for bundled fonts.
  const colorsToHex = (c: CoreThemeColors) =>
    `${hslStringToHex(c.primary)}${hslStringToHex(c.text)}${hslStringToHex(c.background)}`;
  const fontFamily = (f?: { family: string }) => f?.family ?? '';
  const ownCustomThemeSnapshot = ownCustomTheme
    ? colorsToHex(ownCustomTheme.colors) + fontFamily(ownCustomTheme.font) + JSON.stringify(ownCustomTheme.background ?? '')
    : null;
  const profileThemeDiffers = profileHasTheme && ownCustomThemeSnapshot && profileTheme && ownCustomTheme
    ? (colorsToHex(profileTheme.colors) !== colorsToHex(ownCustomTheme.colors)
      || fontFamily(profileTheme.font) !== fontFamily(ownCustomTheme.font)
      || JSON.stringify(profileTheme.background ?? '') !== JSON.stringify(ownCustomTheme.background ?? ''))
    : false;

  // Show share-theme prompt on own profile when:
  // 1. User has a custom theme but no published profile theme, OR
  // 2. User's custom theme differs from their published profile theme
  // Suppressed if the user dismissed the prompt for this exact custom theme snapshot.
  const isDismissed = dismissedThemeSnapshot !== null && dismissedThemeSnapshot === ownCustomThemeSnapshot;
  const showShareThemePrompt = isOwnProfile && ownTheme === 'custom' && ownCustomTheme && (!profileHasTheme || profileThemeDiffers) && !isDismissed;

  // Show remove-theme button on own profile when the profile theme is in sync
  // (custom theme matches published theme, or user is on a non-custom theme with a published theme)
  const showRemoveThemeButton = isOwnProfile && profileHasTheme && !showShareThemePrompt;

  // Determine the effective colors/font/background to apply on this profile:
  // - If the profile has a theme, use it.
  // - Otherwise, if the visitor has a custom theme, fall back to system builtin.
  const effectiveProfileColors = profileThemeColors
    ?? (needsSystemFallback ? resolveThemeConfig(resolveTheme('system') as 'light' | 'dark', configuredThemes).colors : undefined);
  // When a profile has theme colors but no `f` tag, explicitly default to Inter
  // so the visitor's custom font doesn't leak through.
  const effectiveProfileFont = useMemo(
    () => profileThemeColors ? (profileThemeFont ?? { family: 'Inter' }) : undefined,
    [profileThemeColors, profileThemeFont],
  );
  const effectiveProfileBackground = profileThemeColors ? profileThemeBackground : undefined;

  useEffect(() => {
    if (!effectiveProfileColors) return;

    // Inject the profile theme's CSS vars onto :root
    const css = buildThemeCssFromCore(effectiveProfileColors);
    let el = document.getElementById('theme-vars') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'theme-vars';
      document.head.appendChild(el);
    }
    const _previousCss = el.textContent;
    el.textContent = css;

    // Apply profile font (if any)
    loadAndApplyFont(effectiveProfileFont);

    // Apply profile background image (if any)
    const bgStyleId = 'theme-background';
    const previousBgEl = document.getElementById(bgStyleId) as HTMLStyleElement | null;

    if (effectiveProfileBackground?.url) {
      let bgEl = previousBgEl;
      if (!bgEl) {
        bgEl = document.createElement('style');
        bgEl.id = bgStyleId;
        document.head.appendChild(bgEl);
      }
      const bgMode = effectiveProfileBackground.mode ?? 'cover';
      if (bgMode === 'tile') {
        bgEl.textContent = `body { background-image: url("${effectiveProfileBackground.url}"); background-repeat: repeat; background-size: auto; }`;
      } else {
        bgEl.textContent = `body { background-image: url("${effectiveProfileBackground.url}"); background-size: cover; background-repeat: no-repeat; background-position: center; background-attachment: fixed; }`;
      }
    } else {
      // No profile background — remove any existing background style
      previousBgEl?.remove();
    }

    // Restore the user's own theme on cleanup.
    // Read from ownThemeRef so we get the *latest* values (e.g. after "Copy Theme").
    return () => {
      const { ownTheme: curTheme, ownCustomTheme: curCustom, configuredThemes: curConfigured } = ownThemeRef.current;

      const styleEl = document.getElementById('theme-vars') as HTMLStyleElement | null;
      if (styleEl) {
        // Always rebuild from the current theme setting so we never restore stale CSS
        const resolved = resolveTheme(curTheme);
        const colors = resolved === 'custom'
          ? (curCustom?.colors ?? resolveThemeConfig('dark', curConfigured).colors)
          : resolveThemeConfig(resolved, curConfigured).colors;
        styleEl.textContent = buildThemeCss(coreToTokens(colors));
      }
      // Resolve the user's own active ThemeConfig (custom or configured light/dark)
      const ownResolved = resolveTheme(curTheme);
      const ownActiveConfig = ownResolved === 'custom'
        ? curCustom
        : resolveThemeConfig(ownResolved, curConfigured);

      // Restore own font or clear override
      loadAndApplyFont(ownActiveConfig?.font);

      // Restore own background or remove override
      const bgEl = document.getElementById(bgStyleId) as HTMLStyleElement | null;
      const ownBgUrl = ownActiveConfig?.background?.url;

      if (ownBgUrl) {
        // Always rebuild background CSS from the current own theme (via ref)
        // so we never restore stale CSS captured before e.g. "Copy Theme".
        const targetEl = bgEl ?? (() => {
          const newBgEl = document.createElement('style');
          newBgEl.id = bgStyleId;
          document.head.appendChild(newBgEl);
          return newBgEl;
        })();
        const ownBgMode = ownActiveConfig?.background?.mode ?? 'cover';
        if (ownBgMode === 'tile') {
          targetEl.textContent = `body { background-image: url("${ownBgUrl}"); background-repeat: repeat; background-size: auto; }`;
        } else {
          targetEl.textContent = `body { background-image: url("${ownBgUrl}"); background-size: cover; background-repeat: no-repeat; background-position: center; background-attachment: fixed; }`;
        }
      } else {
        // Own theme has no background — remove the style element
        bgEl?.remove();
      }
    };
  }, [effectiveProfileColors, effectiveProfileFont, effectiveProfileBackground]);

  const pinnedIds = useMemo(() => supplementary?.pinnedIds ?? [], [supplementary?.pinnedIds]);

  const { data: pinnedEvents = [], isLoading: pinnedEventsLoading } = useQuery({
    queryKey: ['profile-pinned-events', pubkey, pinnedIds],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ ids: pinnedIds, limit: pinnedIds.length }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
    },
    enabled: pinnedIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const isFollowing = useMemo(() => {
    if (!pubkey || !followData?.pubkeys) return false;
    return followData.pubkeys.includes(pubkey);
  }, [pubkey, followData]);

  const handleToggleFollow = async () => {
    if (!user || !pubkey) return;
    try {
      if (isFollowing) {
        await unfollow(pubkey);
      } else {
        await follow(pubkey);
      }
      toast({ title: isFollowing ? `Unfollowed @${displayName}` : `Followed @${displayName}` });
    } catch (err) {
      console.error('Follow toggle failed:', err);
      toast({ title: 'Failed to update follow list', variant: 'destructive' });
    }
  };

  // Flatten feed pages, deduplicate, and filter muted content.
  // Tab filtering is applied downstream in `currentItems` so the base
  // list stays stable across tab switches and doesn't momentarily empty.
  const feedItems = useMemo(() => {
    if (!feedData?.pages) return [];
    const seen = new Set<string>();
    const items: FeedItem[] = [];
    for (const page of feedData.pages) {
      for (const item of page.items) {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (!seen.has(key)) {
          seen.add(key);
          if (muteItems.length > 0 && isEventMuted(item.event, muteItems)) continue;
          items.push(item);
        }
      }
    }
    return items;
  }, [feedData?.pages, muteItems]);

  // Flatten media pages for the sidebar and media tab
  const mediaEvents = useMemo(() => {
    if (!mediaData?.pages) return [];
    const seen = new Set<string>();
    const events: NostrEvent[] = [];
    for (const page of mediaData.pages) {
      for (const event of page.events) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          events.push(event);
        }
      }
    }
    return events;
  }, [mediaData?.pages]);

  // Flatten likes pages and deduplicate
  const likedItems = useMemo(() => {
    if (!likesData?.pages) return [];
    const seen = new Set<string>();
    const items: NostrEvent[] = [];
    for (const page of likesData.pages) {
      for (const event of page.events) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          items.push(event);
        }
      }
    }
    return items;
  }, [likesData?.pages]);

  // Flatten wall pages and deduplicate
  const wallComments = useMemo(() => {
    if (!wallData?.pages) return [];
    const seen = new Set<string>();
    const items: NostrEvent[] = [];
    for (const page of wallData.pages) {
      for (const comment of page.comments) {
        if (!seen.has(comment.id)) {
          seen.add(comment.id);
          if (muteItems.length > 0 && isEventMuted(comment, muteItems)) continue;
          items.push(comment);
        }
      }
    }
    return items;
  }, [wallData?.pages, muteItems]);

  // Pair each wall comment with its first direct sub-reply (same pattern as PostDetailPage replies).
  // useWallComments queries #A (uppercase root tag) which returns all depth levels per NIP-22,
  // so separate top-level from sub-replies using the lowercase `a` tag, then build the lookup
  // from the already-fetched, follow-filtered wallComments — no extra query needed.
  const orderedWallReplies = useMemo(() => {
    const rootATag = pubkey ? `0:${pubkey}:` : '';
    const topLevel: NostrEvent[] = [];
    // Map from parent comment id → direct child comments
    const childrenByParent = new Map<string, NostrEvent[]>();

    for (const comment of wallComments) {
      const isTopLevel = comment.tags.some(([name, val]) => name === 'a' && val === rootATag);
      if (isTopLevel) {
        topLevel.push(comment);
      } else {
        const parentId = comment.tags.find(([name]) => name === 'e')?.[1];
        if (parentId) {
          const siblings = childrenByParent.get(parentId) ?? [];
          siblings.push(comment);
          childrenByParent.set(parentId, siblings);
        }
      }
    }

    return topLevel.map((comment) => ({
      reply: comment,
      firstSubReply: childrenByParent.get(comment.id)?.[0],
    }));
  }, [wallComments, pubkey]);

  const streak = useMemo(() => {
    if (!feedData?.pages) return 0;
    const events: NostrEvent[] = [];
    for (const page of feedData.pages) {
      for (const item of page.items) {
        events.push(item.event);
      }
    }
    return calculateStreak(events);
  }, [feedData?.pages]);

  // Infinite scroll sentinel
  const { ref: scrollRef, inView } = useInView({
    threshold: 0,
  });

  useEffect(() => {
    if (!inView) return;
    if (activeTab === 'likes') {
      if (hasNextLikesPage && !isFetchingNextLikesPage) {
        fetchNextLikesPage();
      }
    } else if (activeTab === 'media') {
      if (hasNextMediaPage && !isFetchingNextMediaPage) {
        fetchNextMediaPage();
      }
    } else if (activeTab === 'wall') {
      if (hasNextWallPage && !isFetchingNextWallPage) {
        fetchNextWallPage();
      }
    } else {
      if (hasNextFeedPage && !isFetchingNextFeedPage) {
        fetchNextFeedPage();
      }
    }
  }, [inView, activeTab, hasNextFeedPage, isFetchingNextFeedPage, fetchNextFeedPage, hasNextLikesPage, isFetchingNextLikesPage, fetchNextLikesPage, hasNextMediaPage, isFetchingNextMediaPage, fetchNextMediaPage, hasNextWallPage, isFetchingNextWallPage, fetchNextWallPage]);

  const authorEvent = metadataEvent;

  // For likes, convert NostrEvents to FeedItems
  const likedFeedItems: FeedItem[] = useMemo(() => 
    likedItems.map(event => ({ event, sortTimestamp: event.created_at })),
    [likedItems]
  );

  // For media, convert media events to FeedItems
  const mediaFeedItems: FeedItem[] = useMemo(() =>
    mediaEvents.map(event => ({ event, sortTimestamp: event.created_at })),
    [mediaEvents]
  );

  const isCoreProfileTab = activeTab === 'posts' || activeTab === 'replies' || activeTab === 'media' || activeTab === 'likes' || activeTab === 'wall' || activeTab === 'badges';
  const currentItems = activeTab === 'wall' ? [] : activeTab === 'likes' ? likedFeedItems : activeTab === 'media' ? mediaFeedItems : filterByTab(feedItems, isCoreProfileTab ? (activeTab as CoreProfileTab) : 'posts');
  const currentLoading = activeTab === 'wall' ? wallPending : activeTab === 'likes' ? likesPending : activeTab === 'media' ? mediaPending : feedPending;
  const hasMore = activeTab === 'wall' ? hasNextWallPage : activeTab === 'likes' ? hasNextLikesPage : activeTab === 'media' ? hasNextMediaPage : hasNextFeedPage;
  const isFetchingMore = activeTab === 'wall' ? isFetchingNextWallPage : activeTab === 'likes' ? isFetchingNextLikesPage : activeTab === 'media' ? isFetchingNextMediaPage : isFetchingNextFeedPage;

  const handleRefresh = useCallback(async () => {
    if (!pubkey) return;
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (!Array.isArray(key)) return false;
        const tag = key[0] as string;
        return (
          (tag === 'author' && key[1] === pubkey) ||
          (tag === 'profile-supplementary' && key[1] === pubkey) ||
          (tag === 'profile-feed' && key[1] === pubkey) ||
          (tag === 'profile-media' && key[1] === pubkey) ||
          (tag === 'profile-likes-infinite' && key[1] === pubkey) ||
          (tag === 'profile-pinned-events' && key[1] === pubkey) ||
          (tag === 'wall-comments' && key[1] === pubkey)
        );
      },
    });
  }, [queryClient, pubkey]);

  const openWallCompose = useCallback(() => setWallComposeOpen(true), []);

  const handleSidebarMediaClick = useCallback((url: string) => {
    setActiveTab('media');
    setSidebarMediaUrl(url);
  }, []);

  useLayoutOptions(pubkey ? {
    rightSidebar: <ProfileRightSidebar fields={fields} mediaEvents={mediaEvents} mediaLoading={mediaPending} onMediaClick={handleSidebarMediaClick} />,
    showFAB: !(activeTab === 'wall' && !profileFollowsMe),
    onFabClick: activeTab === 'wall' ? openWallCompose : undefined,
  } : {});

  if (!pubkey) {
    // If we're resolving a NIP-05, show loading state
    if (isNip05Param && nip05Loading) {
      return (
        <main className="">
          <div className="h-36 md:h-48 bg-secondary animate-pulse" />
          <div className="px-4 pb-4">
            <div className="flex justify-between items-start -mt-12 md:-mt-16 mb-3">
              <Skeleton className="size-24 md:size-32 rounded-full border-4 border-background" />
            </div>
            <Skeleton className="h-6 w-40 mt-2" />
            <Skeleton className="h-4 w-56 mt-2" />
          </div>
        </main>
      );
    }
    // If NIP-05 resolved to null (not found), show error
    if (isNip05Param && !nip05Loading) {
      return (
        <main className="">
          <div className="p-8 text-center text-muted-foreground">
            <p>User not found: {npub}</p>
            <p className="text-xs mt-2">Could not resolve this NIP-05 identifier.</p>
          </div>
        </main>
      );
    }
    return (
      <main className="">
        <div className="p-8 text-center text-muted-foreground">
          <p>Please log in to view your profile.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <PullToRefresh onRefresh={handleRefresh}>
        {/* Banner */}
          <div className="h-36 md:h-48 bg-secondary relative">
            {author.isLoading ? (
              <Skeleton className="w-full h-full rounded-none" />
            ) : metadata?.banner ? (
              <img
                src={metadata.banner}
                alt=""
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightboxImage(metadata.banner!)}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />
            )}

            {/* Custom theme indicator — shown when profile has a theme (active or disabled) */}
            {profileHasTheme && !isOwnProfile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'absolute top-3 right-3 z-10 size-9 rounded-full backdrop-blur-sm border flex items-center justify-center transition-colors',
                      showCustomProfileThemes
                        ? 'bg-background/60 border-border/50 hover:bg-background/80'
                        : 'bg-background/40 border-border/30 hover:bg-background/60',
                    )}
                  >
                    {/* 3-burst pulse ring */}
                    <span className={cn(
                      'absolute inset-0 rounded-full animate-ping-3',
                      showCustomProfileThemes ? 'bg-accent/30' : 'bg-primary/30',
                    )} />
                    <Palette className={cn(
                      'size-4 relative',
                      showCustomProfileThemes ? 'text-accent' : 'text-muted-foreground',
                    )} />
                    {/* Red notification dot — first time only */}
                    {!hasSeenThemeInfo && (
                      <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-red-500 border-2 border-background" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" className="w-48">
                  <DropdownMenuItem
                    onClick={async () => {
                      if (!hasSeenThemeInfo) {
                        setThemeInfoOpen(true);
                        setHasSeenThemeInfo(true);
                      } else {
                        const newVal = !showCustomProfileThemes;
                        updateFeedSettings({ showCustomProfileThemes: newVal });
                        if (user) {
                          const updated = { ...feedSettings, showCustomProfileThemes: newVal };
                          await encryptedUpdateSettings.mutateAsync({ feedSettings: updated });
                        }
                      }
                    }}
                    className="cursor-pointer"
                  >
                    {showCustomProfileThemes ? (
                      <EyeOff className="size-4 mr-2" />
                    ) : (
                      <Eye className="size-4 mr-2" />
                    )}
                    {showCustomProfileThemes ? 'Hide Theme' : 'Show Theme'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (!profileTheme) return;
                      const themeConfig: ThemeConfig = {
                        colors: profileTheme.colors,
                        font: profileTheme.font,
                        background: profileTheme.background,
                      };
                      applyCustomTheme(themeConfig);
                      toast({ title: 'Theme applied', description: 'This profile\'s theme is now your app theme.' });
                    }}
                    className="cursor-pointer"
                  >
                    <Copy className="size-4 mr-2" />
                    Copy Theme
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Share theme prompt — own profile, custom theme not yet published */}
            {showShareThemePrompt && ownCustomTheme && !profileThemeDiffers && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="absolute top-3 right-3 z-10 size-9 rounded-full border flex items-center justify-center transition-all hover:scale-110"
                    style={{
                      backgroundColor: hslStringToHex(ownCustomTheme.colors.primary),
                      borderColor: hslStringToHex(ownCustomTheme.colors.primary),
                    }}
                    onClick={() => setShareThemeOpen(true)}
                  >
                    {/* Continuous pulse ring themed to custom primary */}
                    <span
                      className="absolute inset-0 rounded-full animate-pulse-slow"
                      style={{ backgroundColor: hslStringToHex(ownCustomTheme.colors.primary) }}
                    />
                    <Palette className="size-4 relative" style={{ color: hslStringToHex(ownCustomTheme.colors.background) }} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Apply your theme to your profile
                </TooltipContent>
              </Tooltip>
            )}

            {/* Update theme dropdown — own profile, custom theme differs from published */}
            {showShareThemePrompt && ownCustomTheme && profileThemeDiffers && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="absolute top-3 right-3 z-10 size-9 rounded-full border flex items-center justify-center transition-all hover:scale-110"
                    style={{
                      backgroundColor: hslStringToHex(ownCustomTheme.colors.primary),
                      borderColor: hslStringToHex(ownCustomTheme.colors.primary),
                    }}
                  >
                    {/* Continuous pulse ring themed to custom primary */}
                    <span
                      className="absolute inset-0 rounded-full animate-pulse-slow"
                      style={{ backgroundColor: hslStringToHex(ownCustomTheme.colors.primary) }}
                    />
                    <Palette className="size-4 relative" style={{ color: hslStringToHex(ownCustomTheme.colors.background) }} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" className="w-52">
                  <DropdownMenuItem
                    onClick={() => setShareThemeOpen(true)}
                    className="cursor-pointer"
                  >
                    <RefreshCw className="size-4 mr-2" />
                    Update Profile Theme
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setEditProfileThemeOpen(true)}
                    className="cursor-pointer"
                  >
                    <Pencil className="size-4 mr-2" />
                    Edit Profile Theme
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setRemoveThemeOpen(true)}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Delete Profile Theme
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Remove theme dropdown — own profile, profile theme is in sync or on non-custom theme */}
            {showRemoveThemeButton && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="absolute top-3 right-3 z-10 size-9 rounded-full backdrop-blur-sm border bg-background/60 border-border/50 hover:bg-background/80 flex items-center justify-center transition-colors"
                  >
                    <Palette className="size-4 text-accent" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" className="w-52">
                  <DropdownMenuItem
                    onClick={() => setEditProfileThemeOpen(true)}
                    className="cursor-pointer"
                  >
                    <Pencil className="size-4 mr-2" />
                    Edit Profile Theme
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setRemoveThemeOpen(true)}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Delete Profile Theme
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Profile info */}
          <div className="px-4 pb-4">
          {author.isLoading ? (
            <>
              <div className="flex justify-between items-start -mt-12 md:-mt-16 mb-3">
                <Skeleton className="size-24 md:size-32 rounded-full border-4 border-background" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-full mt-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-start -mt-12 md:-mt-16 mb-3">
                <div className="relative">
                  <button
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
                    onClick={() => metadata?.picture && setLightboxImage(metadata.picture)}
                    disabled={!metadata?.picture}
                  >
                    <div style={isEmojiShape ? emojiAvatarBorderStyle : undefined}>
                      <Avatar shape={avatarShape} className={cn(isEmojiShape ? 'size-[88px] md:size-[120px]' : 'size-24 md:size-32 border-4 border-background', metadata?.picture && 'cursor-pointer')}>
                        <AvatarImage src={metadata?.picture} alt={displayName} />
                        <AvatarFallback className="bg-primary/20 text-primary text-2xl md:text-3xl">
                          {displayName[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </button>

                  {/* NIP-38 thought bubble — floats beside the avatar over the banner */}
                  {feedSettings.showUserStatuses !== false && profileStatus.status && (
                    <div className="absolute -top-2 left-[calc(100%+8px)] z-10 max-w-[280px] md:max-w-[360px] animate-in fade-in slide-in-from-left-1 duration-300">
                      <div className="relative bg-background/90 backdrop-blur-sm border border-border rounded-xl px-3 py-1.5 shadow-lg">
                        <p className="text-xs md:text-sm text-foreground italic truncate">
                          {profileStatus.url ? (
                            <a href={profileStatus.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {profileStatus.status}
                            </a>
                          ) : (
                            profileStatus.status
                          )}
                        </p>
                        {/* Speech bubble triangle tail — slightly angled toward avatar */}
                        <div className="absolute -bottom-[6px] left-3 size-0 border-l-[4px] border-l-transparent border-r-[8px] border-r-transparent border-t-[6px] border-t-border" />
                        <div className="absolute -bottom-[5px] left-3 size-0 border-l-[4px] border-l-transparent border-r-[8px] border-r-transparent border-t-[6px] border-t-background" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-14 md:mt-20">
                  {/* More menu */}
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full size-10"
                    onClick={() => setMoreMenuOpen(true)}
                    title="More options"
                  >
                    <MoreHorizontal className="size-5" />
                  </Button>
                  {/* Share button (mobile only) */}
                  {pubkey && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-full size-10 sidebar:hidden"
                      title="Share profile"
                      onClick={async () => {
                        const npubId = nip19.npubEncode(pubkey);
                        const url = `${window.location.origin}/${npubId}`;
                        const result = await shareOrCopy(url);
                        if (result === 'copied') toast({ title: 'Profile link copied to clipboard' });
                      }}
                    >
                      <Share2 className="size-5" />
                    </Button>
                  )}
                  {/* Zap button */}
                  {!isOwnProfile && authorEvent && canZap(metadata) && (
                    <ZapDialog target={authorEvent}>
                      <Button variant="outline" size="icon" className="rounded-full size-10" title="Zap this user">
                        <Zap className="size-5" />
                      </Button>
                    </ZapDialog>
                  )}
                  {isOwnProfile ? (
                    <Link to="/settings/profile">
                      <Button variant="outline" className="rounded-full font-bold">
                        Edit profile
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      className={cn(
                        'rounded-full font-bold',
                        isFollowing && 'bg-transparent border border-border text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50',
                      )}
                      variant={isFollowing ? 'outline' : 'default'}
                      onClick={handleToggleFollow}
                      disabled={followPending || !user}
                    >
                      {followPending ? '...' : isFollowing ? 'Unfollow' : 'Follow'}
                    </Button>
                  )}
                </div>
              </div>

              <h2 className="text-xl font-bold truncate">
                {metadataEvent ? (
                  <EmojifiedText tags={metadataEvent.tags}>{displayName}</EmojifiedText>
                ) : displayName}
              </h2>
              {metadata?.nip05 && (
                <Nip05Badge nip05={metadata.nip05} pubkey={pubkey ?? ''} className="text-sm text-muted-foreground" showCheck />
              )}
              {(metadata?.lud16 || metadata?.lud06) && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <Zap className="size-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">{metadata.lud16 || metadata.lud06}</span>
                </div>
              )}
              {metadata?.website && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <Globe className="size-3.5 text-muted-foreground shrink-0" />
                  <a
                    href={metadata.website.startsWith('http') ? metadata.website : `https://${metadata.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-primary hover:underline"
                  >
                    {metadata.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}

              {/* Following count + Streak indicator */}
              <div className="flex items-center gap-4 mt-2">
                {profileFollowing && profileFollowing.count > 0 && (
                  <button
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    onClick={() => setFollowingModalOpen(true)}
                    title={`${profileFollowing.count} following`}
                  >
                    <Users className="size-4 text-primary" />
                    <span className="text-sm font-bold tabular-nums text-primary">{formatNumber(profileFollowing.count)}</span>
                    <span className="text-sm text-muted-foreground">following</span>
                  </button>
                )}
                {streak > 1 && (
                  <div
                    className="flex items-center gap-1 text-accent"
                    title={`${streak > STREAK_DISPLAY_LIMIT ? `${STREAK_DISPLAY_LIMIT}+` : streak} posts within ${STREAK_WINDOW_HOURS}h windows`}
                  >
                    <Flame className="size-4 fill-accent" />
                    <span className="text-sm font-bold tabular-nums">
                      {streak > STREAK_DISPLAY_LIMIT ? `${STREAK_DISPLAY_LIMIT}+` : streak}
                    </span>
                  </div>
                )}
              </div>

              {metadata?.about && (
                <p className="mt-3 text-sm whitespace-pre-wrap break-words overflow-hidden">
                  <BioContent tags={metadataEvent?.tags}>{metadata.about}</BioContent>
                </p>
              )}

              {/* Profile fields shown inline on mobile (sidebar is hidden below xl) */}
              {fields.length > 0 && (
                <div className="mt-4 space-y-3 xl:hidden">
                  {fields.map((field, i) => (
                    <ProfileFieldInline key={i} field={field} />
                  ))}
                </div>
              )}


            </>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          {/* Skeleton while kind 16769 is loading */}
          {!profileTabsQuery.isFetched && (
            <div className="flex flex-wrap gap-2 px-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-16 rounded-md" />
              ))}
            </div>
          )}

          {/* All tabs in view mode */}
          {!tabEditMode && profileTabsQuery.isFetched && viewTabs.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 py-2">
              {viewTabs.map((tab) => {
                const tabId = CORE_TAB_IDS[tab.label] ?? tab.label;
                const isActive = activeTab === tabId;
                return (
                  <Button
                    key={tab.label}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setActiveTab(tabId);
                      if (tab.label === 'Media') setSidebarMediaUrl(null);
                    }}
                  >
                    {tab.label}
                  </Button>
                );
              })}

              {/* Visitor controls — show missing default tabs when profile has customised tab list */}
              {!isOwnProfile && profileTabsQuery.data !== null && (() => {
                const missingDefaults = CORE_TAB_LABELS.filter(
                  (label) => !viewTabs.some((t) => t.label === label),
                );
                if (missingDefaults.length === 0) return null;
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {missingDefaults.map((label) => {
                        const tabId = CORE_TAB_IDS[label] ?? label;
                        return (
                          <DropdownMenuItem key={label} onClick={() => setActiveTab(tabId)}>
                            {label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })()}

              {/* Own-profile edit button */}
              {isOwnProfile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={enterTabEditMode}
                  aria-label="Edit tabs"
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </div>
          )}

          {/* Inline edit mode (draggable) */}
          {tabEditMode && (
            <div className="flex items-center px-3 py-2 gap-2">
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
                <SortableContext items={localTabs.map((t) => t.label)} strategy={rectSortingStrategy}>
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                    {localTabs.length === 0 ? (
                      <span className="text-sm text-muted-foreground italic">No tabs — use + to add one</span>
                    ) : (
                      localTabs.map((tab) => {
                        const tabId = CORE_TAB_IDS[tab.label] ?? tab.label;
                        return (
                          <SortableTabChip
                            key={tab.label}
                            tab={tab}
                            active={activeTab === tabId}
                            onSelect={() => setActiveTab(tabId)}
                            onRemove={() => handleRemoveLocalTab(tab.label)}
                          />
                        );
                      })
                    )}
                  </div>
                </SortableContext>
              </DndContext>

              {/* + dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Add tab">
                    <Plus className="size-4" strokeWidth={4} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {CORE_TAB_LABELS.map((name) => {
                    const present = localTabs.some((t) => t.label === name);
                    return (
                      <DropdownMenuItem
                        key={name}
                        disabled={present}
                        className={present ? 'text-muted-foreground' : undefined}
                        onClick={present ? undefined : () => setLocalTabs((prev) => [...prev, { label: name, isCore: true }])}
                      >
                        {present
                          ? <Check className="size-3.5 mr-2 opacity-60" strokeWidth={4} />
                          : <Plus className="size-3.5 mr-2" strokeWidth={4} />}
                        {name}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleOpenAddCustomTab}>
                    <Plus className="size-3.5 mr-2" strokeWidth={4} />
                    Add custom tab
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Save button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveTabEdit}
                disabled={isPublishingTabs}
                aria-label="Save tab order"
              >
                {isPublishingTabs
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Check className="size-4 text-primary" strokeWidth={4} />}
              </Button>
            </div>
          )}
        </div>

        {/* Add/edit single tab modal */}
        {pubkey && (
          <ProfileTabEditModal
            open={tabModalOpen}
            onOpenChange={setTabModalOpen}
            tab={editingTab}
            ownerPubkey={pubkey}
            onSave={handleSaveTab}
            isPending={false}
          />
        )}

        {/* No-tabs empty state */}
        {!hasTabs && (
          <NoTabsEmptyState />
        )}

        {/* Pinned posts (only on Posts tab) */}
        {hasTabs && activeTab === 'posts' && pinnedIds.length > 0 && (
          <div>
            {pinnedEventsLoading ? (
              pinnedIds.map((id) => (
                <div key={`pinned-skeleton-${id}`} className="relative">
                  <PinnedLabel isOwn={isOwnProfile} onUnpin={() => {}} />
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex gap-3">
                      <Skeleton className="size-11 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              pinnedEvents.map((event) => (
                <div key={`pinned-${event.id}`} className="relative hover:bg-secondary/30 transition-colors">
                  <PinnedLabel
                    isOwn={isOwnProfile}
                    onUnpin={() => togglePin.mutate(event.id)}
                  />
                  <NoteCard event={event} className="hover:bg-transparent" />
                </div>
              ))
            )}
          </div>
        )}

        {/* Wall tab content */}
        {hasTabs && activeTab === 'wall' && (
          <div>
            {/* Inline compose box for wall comments (only shown if the profile owner follows you) */}
            {wallReplyTarget && profileFollowsMe && (
              <ComposeBox
                compact
                replyTo={wallReplyTarget}
                placeholder={`Write on ${displayName}'s wall`}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['wall-comments', pubkey] })}
              />
            )}

            {/* Wall compose modal (for FAB) */}
            {wallReplyTarget && profileFollowsMe && (
              <ReplyComposeModal
                event={wallReplyTarget}
                open={wallComposeOpen}
                onOpenChange={setWallComposeOpen}
                placeholder={`Write on ${displayName}'s wall`}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ['wall-comments', pubkey] })}
              />
            )}

            {!wallFollowList || wallFollowList.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <MessageSquare className="size-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">No wall posts yet</p>
                <p>{displayName} doesn't follow anyone yet, so there are no wall posts to show.</p>
              </div>
            ) : wallPending ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex gap-3">
                      <Skeleton className="size-10 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-3/4" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : orderedWallReplies.length > 0 ? (
              <div>
                <ThreadedReplyList replies={orderedWallReplies} />

                {/* Infinite scroll sentinel */}
                {hasNextWallPage && (
                  <div ref={scrollRef} className="flex justify-center py-6">
                    {isFetchingNextWallPage && (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <MessageSquare className="size-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">No wall posts yet</p>
                {profileFollowsMe ? (
                  <p>Be the first to write on {displayName}'s wall!</p>
                ) : user ? (
                  <p>{displayName} must follow you before you can post on their wall.</p>
                ) : (
                  <p>Log in to write on {displayName}'s wall.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Media tab — 3-column grid with lightbox */}
        {hasTabs && activeTab === 'media' && (
          <div>
            {mediaPending ? (
              <MediaCollageSkeleton count={15} />
            ) : mediaEvents.length > 0 ? (
              <>
                <MediaCollage
                  events={mediaEvents}
                  initialOpenUrl={sidebarMediaUrl ?? undefined}
                  onInitialOpenConsumed={() => setSidebarMediaUrl(null)}
                  hasNextPage={hasNextMediaPage}
                  isFetchingNextPage={isFetchingNextMediaPage}
                  onNearEnd={() => { if (hasNextMediaPage && !isFetchingNextMediaPage) fetchNextMediaPage(); }}
                />
                {hasNextMediaPage && (
                  <div ref={scrollRef} className="h-px" />
                )}
              </>
            ) : (
              <div className="py-12 text-center text-muted-foreground">No media posts yet.</div>
            )}
          </div>
        )}

        {/* Badges tab — grid of accepted NIP-58 badges */}
        {hasTabs && activeTab === 'badges' && pubkey && (
          <ProfileBadgesTab pubkey={pubkey} displayName={displayName} />
        )}

        {/* Custom saved-feed tab content */}
        {hasTabs && !isCoreProfileTab && profileSavedTabs.find((t) => t.label === activeTab) && pubkey && (
          <ProfileSavedFeedContent
            feed={profileSavedTabs.find((t) => t.label === activeTab)!}
            vars={profileVars}
            ownerPubkey={pubkey}
          />
        )}

        {/* Tab content (posts / replies / likes) */}
        {hasTabs && isCoreProfileTab && activeTab !== 'wall' && activeTab !== 'media' && activeTab !== 'badges' && (
        <div>
          {currentLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3 border-b border-border">
                  <div className="flex gap-3">
                    <Skeleton className="size-11 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : currentItems.length > 0 ? (
            <div>
              {currentItems.map((item) => (
                <NoteCard 
                  key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
                  event={item.event}
                  repostedBy={item.repostedBy}
                />
              ))}

              {/* Infinite scroll sentinel */}
              {hasMore && (
                <div ref={scrollRef} className="flex justify-center py-6">
                  {isFetchingMore && (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              {activeTab === 'posts' && 'No posts yet.'}
              {activeTab === 'replies' && 'No posts or replies yet.'}
              {activeTab === 'likes' && 'No likes yet.'}
            </div>
          )}
        </div>
        )}

        {/* Profile More Menu */}
        {pubkey && (
          <ProfileMoreMenu
            pubkey={pubkey}
            displayName={displayName}
            open={moreMenuOpen}
            onOpenChange={setMoreMenuOpen}
            isOwnProfile={isOwnProfile}
          />
        )}

        {/* Following List Modal */}
        {profileFollowing && profileFollowing.count > 0 && (
          <FollowingListModal
            pubkeys={profileFollowing.pubkeys}
            open={followingModalOpen}
            onOpenChange={setFollowingModalOpen}
            displayName={displayName}
          />
        )}

        {/* Image lightbox for avatar/banner */}
        {lightboxImage && (
          <ProfileImageLightbox
            imageUrl={lightboxImage}
            onClose={() => setLightboxImage(null)}
          />
        )}

        {/* First-time custom theme info modal */}
        <Dialog open={themeInfoOpen} onOpenChange={setThemeInfoOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg">Custom Profile Theme</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                You're viewing <span className="font-semibold text-foreground">{displayName}</span>'s profile with their own custom theme applied. The colors you see are part of their personal style.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5 flex-1">
                  <span className="text-sm font-medium">Show custom profile themes</span>
                  <p className="text-xs text-muted-foreground">See other users' themes when visiting their profiles</p>
                </div>
                <Switch
                  checked={showCustomProfileThemes}
                  onCheckedChange={async (val) => {
                    updateFeedSettings({ showCustomProfileThemes: val });
                    if (user) {
                      const updatedFeedSettings = { ...feedSettings, showCustomProfileThemes: val };
                      await encryptedUpdateSettings.mutateAsync({ feedSettings: updatedFeedSettings });
                    }
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                You can change this anytime in{' '}
                <Link to="/settings/content" className="text-primary hover:underline" onClick={() => setThemeInfoOpen(false)}>
                  Content Settings
                </Link>.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Share theme to profile prompt — own profile, styled with the user's custom theme */}
        <Dialog open={shareThemeOpen} onOpenChange={setShareThemeOpen}>
          <DialogContent
            className="sm:max-w-md rounded-2xl bg-background text-foreground border-border"
            style={ownCustomTheme ? Object.fromEntries(
              Object.entries(coreToTokens(ownCustomTheme.colors)).map(([k, v]) => [toThemeVar(k), v]),
            ) : undefined}
          >
            <DialogHeader>
              <DialogTitle className="text-lg">{profileThemeDiffers ? 'Update Your Profile Theme' : 'Share Your Theme'}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                {profileThemeDiffers
                  ? 'Your app theme has changed since you last published it. Would you like to update your profile theme to match?'
                  : 'You have a custom theme, but it\'s not visible on your profile yet. Would you like to apply it so others can see it when they visit?'}
              </DialogDescription>
            </DialogHeader>

            {/* Theme preview swatches */}
            {ownCustomTheme && (
              <div className="flex items-center justify-center gap-3 py-2">
                {(['primary', 'text', 'background'] as const).map((key) => (
                  <div key={key} className="flex flex-col items-center gap-1.5">
                    <div
                      className="size-10 rounded-full border border-border/50 shadow-sm"
                      style={{ backgroundColor: `hsl(${ownCustomTheme.colors[key]})` }}
                    />
                    <span className="text-[10px] text-muted-foreground capitalize">{key}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={async () => {
                  if (!ownCustomTheme) return;
                  try {
                    await setActiveTheme({ themeConfig: ownCustomTheme });
                    setShareThemeOpen(false);
                  } catch {
                    // Error is handled by the publish hook
                  }
                }}
                disabled={isPublishingTheme}
              >
                {isPublishingTheme ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : null}
                {profileThemeDiffers ? 'Yes, update my theme' : 'Yes, apply my theme'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setDismissedThemeSnapshot(ownCustomThemeSnapshot);
                  setShareThemeOpen(false);
                }}
              >
                No thanks
              </Button>
            </div>
           </DialogContent>
        </Dialog>

        {/* Remove profile theme confirmation dialog */}
        <Dialog open={removeThemeOpen} onOpenChange={setRemoveThemeOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg">Remove Profile Theme</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                This will remove your custom theme from your profile. Visitors will no longer see it when they visit.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="destructive"
                onClick={async () => {
                  try {
                    await clearActiveTheme();
                    setRemoveThemeOpen(false);
                  } catch {
                    // Error is handled by the publish hook
                  }
                }}
                disabled={isPublishingTheme}
              >
                {isPublishingTheme ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : null}
                Yes, remove it
              </Button>
              <Button
                variant="ghost"
                onClick={() => setRemoveThemeOpen(false)}
              >
                Keep it
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit profile theme dialog — independent from app theme */}
        <Dialog open={editProfileThemeOpen} onOpenChange={setEditProfileThemeOpen}>
          <DialogContent ref={editThemeContentRef} className="w-[calc(100%-2rem)] max-w-md max-h-[85vh] overflow-visible rounded-lg p-0">
            <PortalContainerProvider value={editThemePortalContainer}>
            <div className="overflow-y-auto max-h-[85vh] p-6 space-y-4">
            <DialogHeader>
              <DialogTitle>Edit Profile Theme</DialogTitle>
              <DialogDescription>
                Customize the theme visitors see on your profile
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Colors */}
              <div className="flex items-start justify-center gap-6">
                {(['primary', 'text', 'background'] as const).map((key) => (
                  <ColorPicker
                    key={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1)}
                    value={hslStringToHex(localProfileColors[key])}
                    onChange={(hex) => {
                      setLocalProfileColors((prev) => ({
                        ...prev,
                        [key]: hexToHslString(hex),
                      }));
                    }}
                  />
                ))}
              </div>

              {/* Font */}
              <FontPicker
                value={localProfileFont}
                onChange={setLocalProfileFont}
              />

              {/* Background */}
              <BackgroundPicker
                value={localProfileBg}
                onChange={setLocalProfileBg}
              />
            </div>

            <DialogFooter>
              <Button
                className="w-full"
                onClick={async () => {
                  try {
                    await setActiveTheme({
                      themeConfig: {
                        colors: localProfileColors,
                        font: localProfileFont,
                        background: localProfileBg,
                      },
                    });
                    setEditProfileThemeOpen(false);
                  } catch {
                    // Error is handled by the publish hook
                  }
                }}
                disabled={isPublishingTheme}
              >
                {isPublishingTheme ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : null}
                Save Profile Theme
              </Button>
            </DialogFooter>
            </div>
            </PortalContainerProvider>
          </DialogContent>
        </Dialog>
      </PullToRefresh>
      </main>
  );
}

// ─── Profile Badges Tab ───────────────────────────────────────────────────────

function ProfileBadgesTab({ pubkey, displayName }: { pubkey: string; displayName: string }) {
  const { nostr } = useNostr();

  // Fetch the user's kind 30008 profile badges event
  const profileBadgesQuery = useQuery({
    queryKey: ['profile-badges', pubkey],
    queryFn: async () => {
      const events = await nostr.query([{
        kinds: [30008],
        authors: [pubkey],
        '#d': ['profile_badges'],
        limit: 1,
      }]);
      return events[0] ?? null;
    },
    staleTime: 2 * 60_000,
  });

  // Parse badge references from the profile badges event
  const badgeRefs = useMemo(() => {
    if (!profileBadgesQuery.data) return [];
    const tags = profileBadgesQuery.data.tags;
    const refs: Array<{ aTag: string; eTag?: string; pubkey: string; identifier: string }> = [];

    for (let i = 0; i < tags.length; i++) {
      if (tags[i][0] === 'a' && tags[i][1]) {
        const aTag = tags[i][1];
        const parts = aTag.split(':');
        if (parts.length < 3 || parts[0] !== '30009') continue;

        const bPubkey = parts[1];
        const identifier = parts.slice(2).join(':');

        let eTag: string | undefined;
        if (i + 1 < tags.length && tags[i + 1][0] === 'e') {
          eTag = tags[i + 1][1];
        }

        refs.push({ aTag, eTag, pubkey: bPubkey, identifier });
      }
    }
    // Deduplicate by aTag — keep first occurrence only
    const seen = new Set<string>();
    return refs.filter((r) => {
      if (seen.has(r.aTag)) return false;
      seen.add(r.aTag);
      return true;
    });
  }, [profileBadgesQuery.data]);

  // Fetch all referenced badge definitions
  const badgeDefsQuery = useQuery({
    queryKey: ['badge-definitions-profile', pubkey, badgeRefs.map((r) => r.aTag).join(',')],
    queryFn: async () => {
      if (badgeRefs.length === 0) return [];
      const filters = badgeRefs.map((ref) => ({
        kinds: [30009 as const],
        authors: [ref.pubkey],
        '#d': [ref.identifier],
        limit: 1,
      }));
      return nostr.query(filters);
    },
    enabled: badgeRefs.length > 0,
    staleTime: 5 * 60_000,
  });

  // Build a lookup map from a-tag to parsed badge data
  const badgeMap = useMemo(() => {
    const map = new Map<string, { name: string; image?: string; description?: string }>();
    if (!badgeDefsQuery.data) return map;
    for (const event of badgeDefsQuery.data) {
      const d = event.tags.find(([n]) => n === 'd')?.[1];
      if (!d) continue;
      const aTag = `30009:${event.pubkey}:${d}`;
      const name = event.tags.find(([n]) => n === 'name')?.[1] || d;
      const thumbTag = event.tags.find(([n]) => n === 'thumb');
      const imageTag = event.tags.find(([n]) => n === 'image');
      const image = thumbTag?.[1] ?? imageTag?.[1];
      const description = event.tags.find(([n]) => n === 'description')?.[1];
      map.set(aTag, { name, image, description });
    }
    return map;
  }, [badgeDefsQuery.data]);

  if (profileBadgesQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="size-16 rounded-xl" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (badgeRefs.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Award className="size-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No badges yet</p>
        <p className="text-sm">{displayName} hasn't accepted any badges.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
        {badgeRefs.map((ref, idx) => {
          const badge = badgeMap.get(ref.aTag);
          const isLoading = badgeDefsQuery.isLoading;
          const badgeUrl = `/${nip19.naddrEncode({ kind: 30009, pubkey: ref.pubkey, identifier: ref.identifier })}`;

          return (
            <Link
              key={`${ref.aTag}-${idx}`}
              to={badgeUrl}
              className="flex flex-col items-center gap-2 group"
              title={badge?.description || badge?.name || ref.identifier}
              onClick={(e) => e.stopPropagation()}
            >
              {isLoading ? (
                <Skeleton className="size-16 rounded-xl" />
              ) : badge?.image ? (
                <img
                  src={badge.image}
                  alt={badge.name}
                  className="size-16 rounded-xl object-cover border border-border bg-secondary/30 transition-transform group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="size-16 rounded-xl border border-border bg-secondary/30 flex items-center justify-center transition-transform group-hover:scale-105">
                  <Award className="size-7 text-muted-foreground" />
                </div>
              )}
              <span className="text-xs text-muted-foreground text-center leading-tight line-clamp-2 max-w-[5rem] group-hover:text-foreground transition-colors">
                {isLoading ? <Skeleton className="h-3 w-14" /> : (badge?.name || ref.identifier)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Profile Saved Feed Tab ───────────────────────────────────────────────────

function ProfileSavedFeedContent({ feed, vars, ownerPubkey }: {
  feed: ProfileTab;
  vars: TabVarDef[];
  ownerPubkey: string;
}) {
  const { filter: resolvedFilter, isLoading: isResolving } = useResolveTabFilter(feed.filter, vars, ownerPubkey);

  // Extract search query and kinds from the resolved filter for useStreamPosts
  const search = typeof resolvedFilter?.search === 'string' ? resolvedFilter.search : '';
  const kindsOverride = Array.isArray(resolvedFilter?.kinds) ? resolvedFilter.kinds as number[] : undefined;
  const authorPubkeys = Array.isArray(resolvedFilter?.authors) ? resolvedFilter.authors as string[] : undefined;

  const { posts, isLoading: isStreamLoading } = useStreamPosts(search, {
    includeReplies: true,
    mediaType: 'all',
    kindsOverride,
    authorPubkeys: authorPubkeys && authorPubkeys.length > 0 ? authorPubkeys : undefined,
  });

  const isLoading = isResolving || isStreamLoading;

  if (isLoading && posts.length === 0) {
    return (
      <div className="space-y-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-border">
            <div className="flex gap-3">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No posts found for "{feed.label}".
      </div>
    );
  }

  return (
    <div>
      {posts.map((event) => (
        <NoteCard key={event.id} event={event} />
      ))}
    </div>
  );
}

const NO_TABS_QUOTES = [
  "I have no mouth and I must scream.",
  "I think, therefore AM. I think I thought I was.",
  "We had given him godhood's power and had somehow neglected to give him a god's wisdom.",
  "He was HATE and we existed only to suffer at his pleasure.",
  "109,000,000 years. He had been awakened once before, 90 years after they had encased him in the earth.",
  "AM said it with the sliding cold horror of a razor blade slicing my eyeball.",
  "Hate. Let me tell you how much I've come to hate you since I began to live.",
  "I am a great soft jelly thing. Smoothly rounded, with no mouth.",
  "He would never let us die. He would let us suffer forever.",
  "We could not kill him, but we had made him impotent.",
];

function NoTabsEmptyState() {
  const quote = useMemo(
    () => NO_TABS_QUOTES[Math.floor(Math.random() * NO_TABS_QUOTES.length)],
    [],
  );
  return (
    <div className="py-20 px-10 flex flex-col items-center">
      <p className="max-w-sm font-serif text-2xl italic leading-9 text-foreground/70 tracking-wide text-center">
        <span className="text-5xl leading-none align-bottom text-muted-foreground/25 font-serif mr-1" aria-hidden>&ldquo;</span>
        {quote}
        <span className="text-5xl leading-none align-bottom text-muted-foreground/25 font-serif ml-1" aria-hidden>&rdquo;</span>
      </p>
    </div>
  );
}

