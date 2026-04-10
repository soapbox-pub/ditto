import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { nip19 } from 'nostr-tools';
import { UserPlus, Loader2, CheckCircle2 } from 'lucide-react';
import { useNostr } from '@nostrify/react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { getAvatarShape, isEmoji, emojiAvatarBorderStyle } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useToast } from '@/hooks/useToast';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useProfileFeed, filterByTab } from '@/hooks/useProfileFeed';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAddrEvent, type AddrCoords } from '@/hooks/useEvent';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { parsePackEvent } from '@/lib/packUtils';
import { PackFeedTab, MemberCard, MemberCardSkeleton } from '@/components/FollowPackDetailContent';
import { genUserName } from '@/lib/genUserName';
import { ArcBackground, ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { DittoLogo } from '@/components/DittoLogo';
import { Nip05Badge } from '@/components/Nip05Badge';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { useOnboarding } from '@/hooks/useOnboarding';
import { buildThemeCssFromCore } from '@/themes';
import { loadAndApplyFont, loadAndApplyTitleFont } from '@/lib/fontLoader';
import LoginDialog from '@/components/auth/LoginDialog';
import type { FeedItem } from '@/lib/feedUtils';
import type { AddressPointer } from 'nostr-tools/nip19';
import NotFound from './NotFound';

// ---------------------------------------------------------------------------
// Theme application
// ---------------------------------------------------------------------------

function useApplyProfileTheme(pubkey: string | undefined) {
  const themeQuery = useActiveProfileTheme(pubkey);
  const theme = themeQuery.data;

  useLayoutEffect(() => {
    if (!theme?.colors) return;

    const css = buildThemeCssFromCore(theme.colors);
    let el = document.getElementById('theme-vars') as HTMLStyleElement | null;
    const previousCss = el?.textContent ?? null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'theme-vars';
      document.head.appendChild(el);
    }
    el.textContent = css;

    if (theme.font) loadAndApplyFont(theme.font);
    if (theme.titleFont) loadAndApplyTitleFont(theme.titleFont);

    const bgStyleId = 'theme-background';
    const prevBgEl = document.getElementById(bgStyleId) as HTMLStyleElement | null;
    if (theme.background?.url) {
      let bgEl = prevBgEl;
      if (!bgEl) {
        bgEl = document.createElement('style');
        bgEl.id = bgStyleId;
        document.head.appendChild(bgEl);
      }
      const mode = theme.background.mode ?? 'cover';
      bgEl.textContent = mode === 'tile'
        ? `body { background-image: url("${theme.background.url}"); background-repeat: repeat; background-size: auto; }`
        : `body { background-image: url("${theme.background.url}"); background-size: cover; background-repeat: no-repeat; background-position: center; background-attachment: fixed; }`;
    } else {
      prevBgEl?.remove();
    }

    return () => {
      const styleEl = document.getElementById('theme-vars') as HTMLStyleElement | null;
      if (styleEl && previousCss !== null) {
        styleEl.textContent = previousCss;
      } else if (styleEl) {
        styleEl.remove();
      }
      document.getElementById(bgStyleId)?.remove();
    };
  }, [theme]);
}

// ---------------------------------------------------------------------------
// Profile feed (reuses useProfileFeed + NoteCard)
// ---------------------------------------------------------------------------

function ProfileFeed({ pubkey }: { pubkey: string }) {
  const {
    data: feedData,
    isPending,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useProfileFeed(pubkey, 'posts');

  const feedItems = useMemo(() => {
    if (!feedData?.pages) return [];
    const seen = new Set<string>();
    const items: FeedItem[] = [];
    for (const page of feedData.pages) {
      for (const item of page.items) {
        const key = item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id;
        if (!seen.has(key)) {
          seen.add(key);
          items.push(item);
        }
      }
    }
    return filterByTab(items, 'posts');
  }, [feedData?.pages]);

  const { ref: scrollRef, inView } = useInView({ threshold: 0 });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) {
    return (
      <div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-border">
            <div className="flex gap-3">
              <Skeleton className="size-11 rounded-full shrink-0" />
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

  if (feedItems.length === 0) return null;

  return (
    <div>
      {feedItems.map((item) => (
        <NoteCard
          key={item.repostedBy ? `repost-${item.repostedBy}-${item.event.id}` : item.event.id}
          event={item.event}
          repostedBy={item.repostedBy}
          compact
        />
      ))}
      {hasNextPage && (
        <div ref={scrollRef} className="flex justify-center py-6">
          {isFetchingNextPage && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main follow view
// ---------------------------------------------------------------------------

function FollowView({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { isPending, follow } = useFollowActions();
  const { toast } = useToast();
  const navigate = useNavigate();
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const bannerUrl = metadata?.banner;
  const { startSignup } = useOnboarding();

  const isOwnProfile = user && user.pubkey === pubkey;
  const isAlreadyFollowing = followData?.pubkeys.includes(pubkey) ?? false;
  const isLoggedOut = !user;

  const [loginOpen, setLoginOpen] = useState(false);

  useApplyProfileTheme(pubkey);

  const hasAutoFollowed = useRef(false);
  const [followDone, setFollowDone] = useState(false);

  useEffect(() => {
    if (!user || isOwnProfile || isAlreadyFollowing || hasAutoFollowed.current || isPending) return;
    if (!followData) return;

    hasAutoFollowed.current = true;

    follow(pubkey)
      .then(() => {
        setFollowDone(true);
        toast({ title: 'Followed!', description: `You are now following ${displayName}` });
      })
      .catch((err) => {
        console.error('Auto-follow failed:', err);
        hasAutoFollowed.current = false;
        toast({ title: 'Something went wrong', variant: 'destructive' });
      });
  }, [user, isOwnProfile, isAlreadyFollowing, followData, isPending, pubkey, follow, displayName, toast]);

  return (
    <div className="h-dvh flex flex-col bg-background/85">
      {/* Profile header (not scrollable) */}
      <div className="shrink-0">
        {/* Banner — matches ProfilePage: clean edge, no gradient */}
        <div className="h-36 md:h-48 bg-secondary relative">
          {author.isLoading ? (
            <Skeleton className="w-full h-full rounded-none" />
          ) : bannerUrl ? (
            <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />
          )}
          <Link to="/" className="absolute top-3 left-3">
            <div className="bg-background/85 rounded-full">
              <DittoLogo size={48} />
            </div>
          </Link>
        </div>

        {/* Profile card */}
        <div className="bg-background/85">
        <div className="flex flex-col items-center px-4 -mt-12 md:-mt-16 relative z-10 max-w-2xl mx-auto w-full" style={{ paddingBottom: ARC_OVERHANG_PX + 16 }}>
          {/* Avatar — matches ProfilePage border treatment */}
          {(() => {
            const avatarShape = getAvatarShape(metadata);
            const isEmojiShape = !!avatarShape && isEmoji(avatarShape);
            return (
              <div className="relative">
                <div style={isEmojiShape ? emojiAvatarBorderStyle : undefined}>
                  <Avatar
                    shape={avatarShape}
                    className={cn(
                      isEmojiShape ? 'size-[88px] md:size-[120px]' : 'size-24 md:size-32 border-4 border-background',
                      'shadow-lg',
                    )}
                  >
                    <AvatarImage src={metadata?.picture} alt={displayName} />
                    <AvatarFallback className="bg-primary/20 text-primary text-2xl md:text-3xl">
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                {(followDone || isAlreadyFollowing) && (
                  <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 shadow">
                    <CheckCircle2 className="size-6 text-primary fill-primary/20" />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Name + NIP-05 */}
          <div className="mt-3 text-center">
            <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
            {metadata?.nip05 && (
              <Nip05Badge nip05={metadata.nip05} pubkey={pubkey} className="justify-center mt-1" />
            )}
          </div>

          {/* CTA — right under the name */}
          <div className="mt-4 w-full max-w-xs">
            {isLoggedOut ? (
              <Button
                onClick={() => setLoginOpen(true)}
                className="w-full rounded-full py-3 text-base font-semibold"
                size="lg"
              >
                Follow {displayName} on Ditto
              </Button>
            ) : isOwnProfile ? (
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <UserPlus className="size-5" />
                  <p className="font-semibold">
                    This is your follow link
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Link to={profileUrl}>
                    <Button className="rounded-full w-full">View your profile</Button>
                  </Link>
                </div>
              </div>
            ) : isPending ? (
              <div className="flex flex-col items-center space-y-2">
                <Loader2 className="size-6 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Following...</p>
              </div>
            ) : followDone || isAlreadyFollowing ? (
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <UserPlus className="size-5" />
                  <p className="font-semibold">
                    {isAlreadyFollowing && !followDone ? 'Already following!' : 'Now following!'}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Link to={profileUrl}>
                    <Button className="rounded-full w-full">View profile</Button>
                  </Link>
                  <Button variant="secondary" className="rounded-full" onClick={() => navigate('/feed')}>
                    Go to feed
                  </Button>
                </div>
              </div>
            ) : null}
           </div>
        </div>
        </div>
      </div>

      {/* Feed scrollbox */}
      <div className="flex-1 min-h-0 overflow-y-auto relative" style={{ marginTop: -ARC_OVERHANG_PX }}>
        {/* Arc with bg — sits at the top of the scroll area, overlapping the gap */}
        <div className="sticky top-0 z-10 pointer-events-none" style={{ height: ARC_OVERHANG_PX }}>
          <ArcBackground variant="down" />
        </div>
        <div className="max-w-2xl mx-auto w-full bg-background/85" style={{ paddingTop: ARC_OVERHANG_PX }}>
          <ProfileFeed pubkey={pubkey} />
        </div>
      </div>

      <LoginDialog
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={() => setLoginOpen(false)}
        onSignupClick={startSignup}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Immersive follow pack/set view
// ---------------------------------------------------------------------------

type PackTab = 'feed' | 'members';

function FollowPackView({ addr, relays }: { addr: AddrCoords; relays?: string[] }) {
  const { data: event, isLoading: eventLoading } = useAddrEvent(addr, relays);
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { data: followList } = useFollowList();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { startSignup } = useOnboarding();
  const [loginOpen, setLoginOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PackTab>('feed');
  const [isFollowingAll, setIsFollowingAll] = useState(false);

  const author = useAuthor(addr.pubkey);
  const authorMeta = author.data?.metadata;
  const authorName = authorMeta?.name || genUserName(addr.pubkey);

  const { title, description, image, pubkeys } = useMemo(
    () => (event ? parsePackEvent(event) : { title: 'Loading...', description: '', image: undefined, pubkeys: [] }),
    [event],
  );

  const { data: membersMap, isLoading: membersLoading } = useAuthors(pubkeys);

  const followedPubkeys = useMemo(() => new Set(followList?.pubkeys ?? []), [followList]);
  const followingCount = useMemo(
    () => pubkeys.filter((pk) => followedPubkeys.has(pk)).length,
    [pubkeys, followedPubkeys],
  );
  const allFollowed = pubkeys.length > 0 && followingCount === pubkeys.length;
  const newCount = pubkeys.length - followingCount;

  const bannerUrl = image || authorMeta?.banner;

  /** Follow All using fetch-fresh -> modify -> publish pattern. */
  const handleFollowAll = useCallback(async () => {
    if (!user) return;
    setIsFollowingAll(true);
    try {
      // 1. Fetch freshest kind 3 from relays (not cache)
      const prev = await fetchFreshEvent(nostr, {
        kinds: [3],
        authors: [user.pubkey],
      });

      // 2. Separate p-tags from non-p-tags to preserve relay hints, petnames, etc.
      const existingPTags = prev?.tags.filter(([n]) => n === 'p') ?? [];
      const nonPTags = prev?.tags.filter(([n]) => n !== 'p') ?? [];
      const existingPubkeys = new Set(existingPTags.map(([, pk]) => pk));

      // 3. Merge: add new pubkeys that aren't already followed
      const newPTags = pubkeys
        .filter((pk) => !existingPubkeys.has(pk))
        .map((pk) => ['p', pk]);
      const added = newPTags.length;

      // 4. Publish with prev for published_at preservation
      await publishEvent({
        kind: 3,
        content: prev?.content ?? '',
        tags: [...nonPTags, ...existingPTags, ...newPTags],
        prev: prev ?? undefined,
      });

      toast({
        title: allFollowed ? 'Already following all!' : 'Following all!',
        description: added > 0
          ? `Added ${added} new account${added !== 1 ? 's' : ''} to your follow list.`
          : 'You were already following everyone in this pack.',
      });
    } catch (error) {
      console.error('Failed to follow all:', error);
      toast({
        title: 'Failed to follow',
        description: 'There was an error updating your follow list.',
        variant: 'destructive',
      });
    } finally {
      setIsFollowingAll(false);
    }
  }, [user, pubkeys, nostr, publishEvent, toast, allFollowed]);

  if (eventLoading) {
    return (
      <div className="h-dvh flex flex-col bg-background/85">
        <div className="shrink-0">
          <div className="h-36 md:h-48 bg-secondary relative">
            <Skeleton className="w-full h-full rounded-none" />
            <Link to="/" className="absolute top-3 left-3">
              <div className="bg-background/85 rounded-full">
                <DittoLogo size={48} />
              </div>
            </Link>
          </div>
          <div className="bg-background/85">
            <div className="flex flex-col items-center px-4 pt-6 pb-6 max-w-2xl mx-auto w-full space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-10 w-56 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!event) return <NotFound />;

  return (
    <div className="h-dvh flex flex-col bg-background/85">
      {/* Header (not scrollable) */}
      <div className="shrink-0">
        {/* Banner */}
        <div className="h-36 md:h-48 bg-secondary relative">
          {bannerUrl ? (
            <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />
          )}
          <Link to="/" className="absolute top-3 left-3">
            <div className="bg-background/85 rounded-full">
              <DittoLogo size={48} />
            </div>
          </Link>
        </div>

        {/* Pack info */}
        <div className="bg-background/85">
          <div className="flex flex-col items-center px-4 -mt-6 pb-4 relative z-10 max-w-2xl mx-auto w-full">
            {/* Avatar stack (first 5 members) */}
            <div className="flex -space-x-3 mb-3">
              {pubkeys.slice(0, 5).map((pk) => {
                const member = membersMap?.get(pk);
                const name = member?.metadata?.name || genUserName(pk);
                const shape = getAvatarShape(member?.metadata);
                return (
                  <Avatar key={pk} shape={shape} className="size-12 border-2 border-background shadow-md">
                    <AvatarImage src={member?.metadata?.picture} alt={name} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs">
                      {name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                );
              })}
              {pubkeys.length > 5 && (
                <div className="size-12 rounded-full border-2 border-background bg-secondary flex items-center justify-center shadow-md">
                  <span className="text-xs font-medium text-muted-foreground">+{pubkeys.length - 5}</span>
                </div>
              )}
            </div>

            {/* Title */}
            <h1 className="text-xl font-bold text-foreground text-center">{title}</h1>

            {/* Author attribution */}
            <Link to={`/${nip19.npubEncode(addr.pubkey)}`} className="flex items-center gap-1.5 mt-1.5 hover:underline">
              <Avatar shape={getAvatarShape(authorMeta)} className="size-5">
                <AvatarImage src={authorMeta?.picture} alt={authorName} />
                <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                  {authorName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">by {authorName}</span>
            </Link>

            {/* Description */}
            {description && (
              <p className="text-sm text-muted-foreground text-center mt-2 max-w-sm whitespace-pre-wrap">
                {description}
              </p>
            )}

            {/* Big CTA button */}
            <div className="mt-4 w-full max-w-xs">
              {!user ? (
                <Button
                  onClick={() => setLoginOpen(true)}
                  className="w-full rounded-full py-3 text-base font-semibold gap-2"
                  size="lg"
                >
                  <UserPlus className="size-5" />
                  Follow {pubkeys.length} people on Ditto
                </Button>
              ) : isFollowingAll ? (
                <Button disabled className="w-full rounded-full py-3 text-base font-semibold gap-2" size="lg">
                  <Loader2 className="size-5 animate-spin" />
                  Following...
                </Button>
              ) : allFollowed ? (
                <div className="text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <CheckCircle2 className="size-5" />
                    <p className="font-semibold">Following all {pubkeys.length} people</p>
                  </div>
                  <Button variant="secondary" className="rounded-full w-full" onClick={() => navigate('/feed')}>
                    Go to feed
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleFollowAll}
                    className="w-full rounded-full py-3 text-base font-semibold gap-2"
                    size="lg"
                  >
                    <UserPlus className="size-5" />
                    Follow All ({pubkeys.length})
                  </Button>
                  {followingCount > 0 && (
                    <p className="text-center text-sm text-muted-foreground">
                      Already following {followingCount} of {pubkeys.length}
                      {' '}&middot;{' '}
                      <span className="text-green-600 dark:text-green-400">{newCount} new</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <SubHeaderBar className="shrink-0" innerClassName="max-w-2xl mx-auto">
        <TabButton label="Feed" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
        <TabButton label={`Members (${pubkeys.length})`} active={activeTab === 'members'} onClick={() => setActiveTab('members')} />
      </SubHeaderBar>

      {/* Tab content (scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full bg-background/85" style={{ paddingTop: ARC_OVERHANG_PX }}>
          {activeTab === 'feed' ? (
            <PackFeedTab pubkeys={pubkeys} />
          ) : membersLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: Math.min(pubkeys.length, 8) }).map((_, i) => (
                <MemberCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pubkeys.map((pk) => {
                const member = membersMap?.get(pk);
                const isFollowed = followedPubkeys.has(pk);
                return (
                  <MemberCard
                    key={pk}
                    pubkey={pk}
                    metadata={member?.metadata}
                    isFollowed={isFollowed}
                    isSelf={pk === user?.pubkey}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <LoginDialog
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={() => setLoginOpen(false)}
        onSignupClick={startSignup}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

/** Kinds accepted as follow packs/sets at /follow URLs. */
const FOLLOW_PACK_SET_KINDS = new Set([30000, 39089]);

export function FollowPage() {
  const { npub } = useParams<{ npub: string }>();

  if (!npub) return <NotFound />;

  // Try decoding as a NIP-19 identifier
  let decoded;
  try {
    decoded = nip19.decode(npub);
  } catch {
    return <NotFound />;
  }

  // Handle npub / nprofile -> individual user follow view
  if (decoded.type === 'npub') {
    return <FollowView pubkey={decoded.data} />;
  }
  if (decoded.type === 'nprofile') {
    return <FollowView pubkey={decoded.data.pubkey} />;
  }

  // Handle naddr -> follow pack/set view
  if (decoded.type === 'naddr') {
    const addr = decoded.data as AddressPointer;
    if (!FOLLOW_PACK_SET_KINDS.has(addr.kind)) {
      return <NotFound />;
    }
    return (
      <FollowPackView
        addr={{ kind: addr.kind, pubkey: addr.pubkey, identifier: addr.identifier }}
        relays={addr.relays}
      />
    );
  }

  return <NotFound />;
}
