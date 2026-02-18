import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Zap, Flame, MoreHorizontal, ClipboardCopy, ExternalLink, VolumeX, Flag, Bitcoin, Users, Pin, X, QrCode, Check, Copy, Loader2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MainLayout } from '@/components/MainLayout';
import { ProfileRightSidebar } from '@/components/ProfileRightSidebar';
import { NoteCard } from '@/components/NoteCard';
import { ZapDialog } from '@/components/ZapDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { useProfileFollowing } from '@/hooks/useProfileFollowing';
import { usePinnedNotes } from '@/hooks/usePinnedNotes';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useProfileFeed, useProfileLikes as useProfileLikesInfinite } from '@/hooks/useProfileFeed';
import type { ProfileTab } from '@/hooks/useProfileFeed';
import { genUserName } from '@/lib/genUserName';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
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
}

function ProfileMoreMenu({ pubkey, displayName, open, onOpenChange }: ProfileMoreMenuProps) {
  const { toast } = useToast();
  const npubEncoded = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

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
    toast({ title: 'Mute user is not yet implemented' });
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

        <Separator />

        <div className="py-1">
          <MenuRow
            icon={<VolumeX className="size-5" />}
            label={`Mute @${displayName}`}
            onClick={handleMuteUser}
          />
          <MenuRow
            icon={<Flag className="size-5" />}
            label={`Report @${displayName}`}
            onClick={handleReport}
            destructive
          />
        </div>

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
            <div className="font-bold text-sm truncate">{displayName}</div>
            {metadata?.nip05 && (
              <div className="text-xs text-muted-foreground truncate">@{metadata.nip05}</div>
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

function Favicon({ url }: { url: string }) {
  const candidates = useMemo(() => {
    try {
      const origin = new URL(url).origin;
      return [`${origin}/favicon.ico`, `${origin}/favicon.svg`];
    } catch {
      return [];
    }
  }, [url]);

  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  if (candidates.length === 0 || failed) return null;

  const src = candidates[index];

  return (
    <img
      src={src}
      alt=""
      className="size-4 shrink-0"
      loading="lazy"
      onError={() => {
        if (index < candidates.length - 1) {
          setIndex(index + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

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
        <Favicon url={field.value} />
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

// ----- Main Component -----

export function ProfilePage() {
  const { npub } = useParams<{ npub: string }>();
  const { user } = useCurrentUser();
  const { toast } = useToast();


  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [followingModalOpen, setFollowingModalOpen] = useState(false);

  // Determine pubkey: from URL param or logged-in user
  const pubkey = useMemo(() => {
    if (npub) {
      try {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') return decoded.data;
        if (decoded.type === 'nprofile') return decoded.data.pubkey;
      } catch {
        return undefined;
      }
    }
    return user?.pubkey;
  }, [npub, user]);

  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || (pubkey ? genUserName(pubkey) : 'Anonymous');

  // Parse profile fields from the raw kind 0 event content, prepending website if present
  const fields = useMemo(() => {
    const parsed = author.data?.event?.content ? parseProfileFields(author.data.event.content) : [];
    // Prepend the website field from metadata if it exists
    if (metadata?.website) {
      return [{ label: 'Website', value: metadata.website }, ...parsed];
    }
    return parsed;
  }, [author.data?.event?.content, metadata?.website]);

  useSeoMeta({
    title: `${displayName} | Mew`,
    description: metadata?.about || 'Nostr profile',
  });

  // Infinite-scroll profile feed (posts/replies/media)
  const {
    data: feedData,
    isPending: feedPending,
    fetchNextPage: fetchNextFeedPage,
    hasNextPage: hasNextFeedPage,
    isFetchingNextPage: isFetchingNextFeedPage,
  } = useProfileFeed(pubkey, activeTab);

  // Infinite-scroll likes
  const {
    data: likesData,
    isPending: likesPending,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
  } = useProfileLikesInfinite(pubkey, activeTab === 'likes');

  // Follow list (cached, for display checks only)
  const { data: followData } = useFollowList();

  // Safe follow/unfollow actions (fetches fresh data from multiple relays before mutating)
  const { follow, unfollow, isPending: followPending } = useFollowActions();

  // Profile's following list (for the viewed profile)
  const { data: profileFollowing } = useProfileFollowing(pubkey);

  // Pinned notes for this profile
  const { events: pinnedEvents, togglePin } = usePinnedNotes(pubkey);
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

  // Flatten feed pages and deduplicate
  const feedItems = useMemo(() => {
    if (!feedData?.pages) return [];
    const seen = new Set<string>();
    const items: NostrEvent[] = [];
    for (const page of feedData.pages) {
      for (const event of page) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          items.push(event);
        }
      }
    }
    return items;
  }, [feedData?.pages]);

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

  const streak = useMemo(() => calculateStreak(feedItems), [feedItems]);

  // Keep refs fresh so the IntersectionObserver callback never has stale closures
  const hasNextFeedPageRef = useRef(hasNextFeedPage);
  const hasNextLikesPageRef = useRef(hasNextLikesPage);
  const isFetchingNextFeedPageRef = useRef(isFetchingNextFeedPage);
  const isFetchingNextLikesPageRef = useRef(isFetchingNextLikesPage);
  const fetchNextFeedPageRef = useRef(fetchNextFeedPage);
  const fetchNextLikesPageRef = useRef(fetchNextLikesPage);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { hasNextFeedPageRef.current = hasNextFeedPage; }, [hasNextFeedPage]);
  useEffect(() => { hasNextLikesPageRef.current = hasNextLikesPage; }, [hasNextLikesPage]);
  useEffect(() => { isFetchingNextFeedPageRef.current = isFetchingNextFeedPage; }, [isFetchingNextFeedPage]);
  useEffect(() => { isFetchingNextLikesPageRef.current = isFetchingNextLikesPage; }, [isFetchingNextLikesPage]);
  useEffect(() => { fetchNextFeedPageRef.current = fetchNextFeedPage; }, [fetchNextFeedPage]);
  useEffect(() => { fetchNextLikesPageRef.current = fetchNextLikesPage; }, [fetchNextLikesPage]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Raw IntersectionObserver sentinel — fires reliably regardless of scroll context
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (activeTabRef.current === 'likes') {
          if (hasNextLikesPageRef.current && !isFetchingNextLikesPageRef.current) {
            fetchNextLikesPageRef.current();
          }
        } else {
          if (hasNextFeedPageRef.current && !isFetchingNextFeedPageRef.current) {
            fetchNextFeedPageRef.current();
          }
        }
      },
      { rootMargin: '800px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []); // intentionally empty — refs stay fresh above

  // Also trigger when fetching completes while sentinel is near viewport
  const isFetchingMore = activeTab === 'likes' ? isFetchingNextLikesPage : isFetchingNextFeedPage;
  const hasMore = activeTab === 'likes' ? hasNextLikesPage : hasNextFeedPage;
  useEffect(() => {
    if (isFetchingMore) return;
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top <= window.innerHeight + 800 && hasMore) {
      if (activeTab === 'likes') {
        fetchNextLikesPage();
      } else {
        fetchNextFeedPage();
      }
    }
  }, [isFetchingMore, hasMore, activeTab, fetchNextFeedPage, fetchNextLikesPage]);

  if (!pubkey) {
    return (
      <MainLayout>
        <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
          <div className="p-8 text-center text-muted-foreground">
            <p>Please log in to view your profile.</p>
          </div>
        </main>
      </MainLayout>
    );
  }

  const isOwnProfile = user?.pubkey === pubkey;
  const authorEvent = author.data?.event;

  const currentEvents = activeTab === 'likes' ? likedItems : feedItems;
  const currentLoading = activeTab === 'likes' ? likesPending : feedPending;
  const isFetchingMoreDisplay = activeTab === 'likes' ? isFetchingNextLikesPage : isFetchingNextFeedPage;

  return (
    <MainLayout
      rightSidebar={<ProfileRightSidebar pubkey={pubkey} fields={fields} />}
    >
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        {/* Banner */}
        <div className="h-36 md:h-48 bg-secondary relative">
          {metadata?.banner && (
            <img src={metadata.banner} alt="" className="w-full h-full object-cover" />
          )}
        </div>

        {/* Profile info */}
        <div className="px-4 pb-4">
          <div className="flex justify-between items-start -mt-12 md:-mt-16 mb-3">
            <Avatar className="size-24 md:size-32 border-4 border-background">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl md:text-3xl">
                {displayName[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2 mt-14 md:mt-20">
              {/* More menu */}
              {!isOwnProfile && (
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full size-10"
                  onClick={() => setMoreMenuOpen(true)}
                  title="More options"
                >
                  <MoreHorizontal className="size-5" />
                </Button>
              )}
              {/* Zap button */}
              {!isOwnProfile && authorEvent && (metadata?.lud16 || metadata?.lud06) && (
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

          <h2 className="text-xl font-bold">{displayName}</h2>
          {metadata?.nip05 && (
            <p className="text-sm text-muted-foreground truncate">@{metadata.nip05}</p>
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
                className="flex items-center gap-1 text-primary"
                title={`${streak > STREAK_DISPLAY_LIMIT ? `${STREAK_DISPLAY_LIMIT}+` : streak} posts within ${STREAK_WINDOW_HOURS}h windows`}
              >
                <Flame className="size-4 fill-primary" />
                <span className="text-sm font-bold tabular-nums">
                  {streak > STREAK_DISPLAY_LIMIT ? `${STREAK_DISPLAY_LIMIT}+` : streak}
                </span>
              </div>
            )}
          </div>

          {metadata?.about && (
            <p className="mt-3 text-sm whitespace-pre-wrap">{metadata.about}</p>
          )}

          {/* Profile fields shown inline on mobile (sidebar is hidden below xl) */}
          {fields.length > 0 && (
            <div className="mt-4 space-y-3 xl:hidden">
              {fields.map((field, i) => (
                <ProfileFieldInline key={i} field={field} />
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className={cn(STICKY_HEADER_CLASS, 'flex border-b border-border bg-background/80 backdrop-blur-md z-10')}>
          <TabButton label="Posts" active={activeTab === 'posts'} onClick={() => setActiveTab('posts')} />
          <TabButton label="Posts & replies" active={activeTab === 'replies'} onClick={() => setActiveTab('replies')} />
          <TabButton label="Media" active={activeTab === 'media'} onClick={() => setActiveTab('media')} />
          <TabButton label="Likes" active={activeTab === 'likes'} onClick={() => setActiveTab('likes')} />
        </div>

        {/* Pinned posts (only on Posts tab) */}
        {activeTab === 'posts' && pinnedEvents.length > 0 && (
          <div>
            {pinnedEvents.map((event) => (
              <div key={`pinned-${event.id}`} className="relative">
                <PinnedLabel
                  isOwn={isOwnProfile}
                  onUnpin={() => togglePin.mutate(event.id)}
                />
                <NoteCard event={event} />
              </div>
            ))}
          </div>
        )}

        {/* Tab content */}
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
          ) : currentEvents.length > 0 ? (
            <div>
              {currentEvents.map((event) => <NoteCard key={event.id} event={event} />)}

              {/* Infinite scroll sentinel — always rendered so IntersectionObserver fires reliably */}
              <div ref={scrollRef} className="flex justify-center py-6">
                {isFetchingMoreDisplay && (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              {activeTab === 'posts' && 'No posts yet.'}
              {activeTab === 'replies' && 'No posts or replies yet.'}
              {activeTab === 'media' && 'No media posts yet.'}
              {activeTab === 'likes' && 'No likes yet.'}
            </div>
          )}
        </div>

        {/* Profile More Menu */}
        {pubkey && (
          <ProfileMoreMenu
            pubkey={pubkey}
            displayName={displayName}
            open={moreMenuOpen}
            onOpenChange={setMoreMenuOpen}
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
      </main>
    </MainLayout>
  );
}
