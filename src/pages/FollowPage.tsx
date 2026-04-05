import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { nip19 } from 'nostr-tools';
import { UserPlus, Loader2, CheckCircle2 } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoteCard } from '@/components/NoteCard';
import { getAvatarShape, isEmoji, emojiAvatarBorderStyle } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useToast } from '@/hooks/useToast';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useProfileFeed, filterByTab } from '@/hooks/useProfileFeed';
import { genUserName } from '@/lib/genUserName';
import { ArcBackground, ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { DittoLogo } from '@/components/DittoLogo';
import { Nip05Badge } from '@/components/Nip05Badge';
import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { useOnboarding } from '@/hooks/useOnboarding';
import { buildThemeCssFromCore } from '@/themes';
import { loadAndApplyFont, loadAndApplyTitleFont } from '@/lib/fontLoader';
import LoginDialog from '@/components/auth/LoginDialog';
import type { FeedItem } from '@/lib/feedUtils';
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
              <div className="text-center space-y-2">
                <p className="text-muted-foreground text-sm">
                  This is your follow link. Share it with others.
                </p>
                <Link to={profileUrl}>
                  <Button variant="outline" className="rounded-full">View your profile</Button>
                </Link>
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
// Route component
// ---------------------------------------------------------------------------

export function FollowPage() {
  const { npub } = useParams<{ npub: string }>();

  if (!npub) return <NotFound />;

  let pubkey: string;
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type === 'npub') {
      pubkey = decoded.data;
    } else if (decoded.type === 'nprofile') {
      pubkey = decoded.data.pubkey;
    } else {
      return <NotFound />;
    }
  } catch {
    return <NotFound />;
  }

  return <FollowView pubkey={pubkey} />;
}
