import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Zap, Flame, MoreHorizontal, ClipboardCopy, ExternalLink, VolumeX, Flag, Bitcoin, Users, Pin, X, QrCode, Check, Copy, Loader2, Download, Palette, Trash2, Eye, EyeOff, RefreshCw, MessageSquare } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
import type { ProfileTab } from '@/hooks/useProfileFeed';
import { useProfileMedia } from '@/hooks/useProfileMedia';
import { MediaGrid, MediaGridSkeleton } from '@/components/MediaGrid';
import { useProfileSupplementary } from '@/hooks/useProfileData';
import { useWallComments } from '@/hooks/useWallComments';
import { ThreadedReplyList } from '@/components/ThreadedReplyList';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';
import { genUserName } from '@/lib/genUserName';

import { canZap } from '@/lib/canZap';
import { EmojifiedText } from '@/components/CustomEmoji';
import { PullToRefresh } from '@/components/PullToRefresh';

import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { usePublishTheme } from '@/hooks/usePublishTheme';
import { useTheme } from '@/hooks/useTheme';
import { useUserStatus } from '@/hooks/useUserStatus';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { buildThemeCssFromCore, coreToTokens, buildThemeCss, resolveTheme, resolveThemeConfig, toThemeVar, type CoreThemeColors, type ThemeConfig } from '@/themes';
import { loadAndApplyFont } from '@/lib/fontLoader';
import { hslStringToHex } from '@/lib/colorUtils';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
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
  const navigate = useNavigate();
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const { addMute, removeMute, isMuted } = useMuteList();
  const userMuted = isMuted('pubkey', pubkey);

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
    toast({ title: 'Report is not yet implemented' });
    close();
  };

  return (
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
        </div>

        {isOwnProfile && (
          <>
            <Separator />

            <div className="py-1">
              <MenuRow
                icon={<Palette className="size-5" />}
                label="Edit theme"
                onClick={() => {
                  close();
                  navigate('/settings/theme');
                }}
              />
            </div>
          </>
        )}

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
          <Avatar className="size-10 shrink-0">
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
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
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

  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
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

  // Infinite-scroll profile feed (posts/replies/media).
  // The first page piggybacks kind 0, seeding the author cache so the
  // profile header renders from the same relay round-trip as the feed.
  const {
    data: feedData,
    isPending: feedPending,
    fetchNextPage: fetchNextFeedPage,
    hasNextPage: hasNextFeedPage,
    isFetchingNextPage: isFetchingNextFeedPage,
  } = useProfileFeed(pubkey);

  // Kind 0 — resolved from the author cache (seeded by the feed query above).
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
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

  // Parse profile fields from the raw kind 0 event content, prepending website if present
  const fields = useMemo(() => {
    const parsed = metadataEvent?.content ? parseProfileFields(metadataEvent.content) : [];
    if (metadata?.website) {
      return [{ label: 'Website', value: metadata.website }, ...parsed];
    }
    return parsed;
  }, [metadataEvent?.content, metadata?.website]);

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
  } = useProfileMedia(pubkey);

  // Infinite-scroll likes
  const {
    data: likesData,
    isPending: likesPending,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
  } = useProfileLikesInfinite(pubkey, activeTab === 'likes');

  // Wall comments (NIP-22 kind 1111 on user's kind 0, filtered by their follow list)
  const wallFollowList = useMemo(() => supplementary?.following, [supplementary?.following]);
  const {
    data: wallData,
    isPending: wallPending,
    fetchNextPage: fetchNextWallPage,
    hasNextPage: hasNextWallPage,
    isFetchingNextPage: isFetchingNextWallPage,
  } = useWallComments(pubkey, wallFollowList);

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
    const previousBgCss = previousBgEl?.textContent ?? null;

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
        // Restore own background
        if (!bgEl) {
          const newBgEl = document.createElement('style');
          newBgEl.id = bgStyleId;
          document.head.appendChild(newBgEl);
          const ownBgMode = ownActiveConfig?.background?.mode ?? 'cover';
          if (ownBgMode === 'tile') {
            newBgEl.textContent = `body { background-image: url("${ownBgUrl}"); background-repeat: repeat; background-size: auto; }`;
          } else {
            newBgEl.textContent = `body { background-image: url("${ownBgUrl}"); background-size: cover; background-repeat: no-repeat; background-position: center; background-attachment: fixed; }`;
          }
        } else if (previousBgCss) {
          bgEl.textContent = previousBgCss;
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

  const currentItems = activeTab === 'wall' ? [] : activeTab === 'likes' ? likedFeedItems : activeTab === 'media' ? mediaFeedItems : filterByTab(feedItems, activeTab);
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
                    <Avatar className={cn('size-24 md:size-32 border-4 border-background', metadata?.picture && 'cursor-pointer')}>
                      <AvatarImage src={metadata?.picture} alt={displayName} />
                      <AvatarFallback className="bg-primary/20 text-primary text-2xl md:text-3xl">
                        {displayName[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
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
                <Nip05Badge nip05={metadata.nip05} pubkey={pubkey ?? ''} className="text-sm text-muted-foreground" />
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
                    <span className="text-sm font-bold tabular-nums text-primary">{profileFollowing.count}</span>
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
                  {metadataEvent ? (
                    <EmojifiedText tags={metadataEvent.tags}>{metadata.about}</EmojifiedText>
                  ) : metadata.about}
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
        <div className={cn(STICKY_HEADER_CLASS, 'flex border-b border-border backdrop-blur-md z-10')}>
          <TabButton label="Posts" active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} />
          <TabButton label="Posts & replies" active={activeTab === 'replies'} onClick={() => setActiveTab('replies')} />
          <TabButton label="Media" active={activeTab === 'media'} onClick={() => { setActiveTab('media'); setSidebarMediaUrl(null); }} />
          <TabButton label="Likes" active={activeTab === 'likes'} onClick={() => setActiveTab('likes')} />
          <TabButton label="Wall" active={activeTab === 'wall'} onClick={() => setActiveTab('wall')} />
        </div>

        {/* Pinned posts (only on Posts tab) */}
        {activeTab === 'posts' && pinnedIds.length > 0 && (
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
        {activeTab === 'wall' && (
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
        {activeTab === 'media' && (
          <div>
            {mediaPending ? (
              <MediaGridSkeleton count={15} />
            ) : mediaEvents.length > 0 ? (
              <>
                <MediaGrid
                  events={mediaEvents}
                  initialOpenUrl={sidebarMediaUrl ?? undefined}
                  onInitialOpenConsumed={() => setSidebarMediaUrl(null)}
                  hasNextPage={hasNextMediaPage}
                  isFetchingNextPage={isFetchingNextMediaPage}
                  onNearEnd={() => { if (hasNextMediaPage && !isFetchingNextMediaPage) fetchNextMediaPage(); }}
                />
                {hasNextMediaPage && (
                  <div ref={scrollRef} className="flex justify-center py-6">
                    {isFetchingNextMediaPage && (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-muted-foreground">No media posts yet.</div>
            )}
          </div>
        )}

        {/* Tab content (posts / replies / likes) */}
        {activeTab !== 'wall' && activeTab !== 'media' && (
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
      </PullToRefresh>
      </main>
  );
}


