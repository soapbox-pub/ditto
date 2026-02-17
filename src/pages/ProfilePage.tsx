import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { LinkIcon, Zap, Flame } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MainLayout } from '@/components/MainLayout';
import { ProfileRightSidebar } from '@/components/ProfileRightSidebar';
import { NoteCard } from '@/components/NoteCard';
import { ZapDialog } from '@/components/ZapDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { genUserName } from '@/lib/genUserName';
import type { NostrEvent } from '@nostrify/nostrify';

const STREAK_WINDOW_HOURS = 36;
const STREAK_DISPLAY_LIMIT = 99;

/** Calculate posting streak: consecutive posts within a 36-hour window of each other. */
function calculateStreak(posts: NostrEvent[]): number {
  if (!posts || posts.length === 0) return 0;

  // Posts should already be sorted newest-first
  const sorted = [...posts].sort((a, b) => b.created_at - a.created_at);
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

export function ProfilePage() {
  const { npub } = useParams<{ npub: string }>();
  const { user } = useCurrentUser();

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

  // Parse profile fields from the raw kind 0 event content
  const fields = useMemo(() => {
    if (!author.data?.event?.content) return [];
    return parseProfileFields(author.data.event.content);
  }, [author.data?.event?.content]);

  useSeoMeta({
    title: `${displayName} | Mew`,
    description: metadata?.about || 'Nostr profile',
  });

  const { nostr } = useNostr();
  const { data: posts, isLoading: postsLoading } = useQuery<NostrEvent[]>({
    queryKey: ['profile-posts', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) return [];
      const events = await nostr.query(
        [{ kinds: [1], authors: [pubkey], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
  });

  const streak = useMemo(() => calculateStreak(posts ?? []), [posts]);

  if (!pubkey) {
    return (
      <MainLayout hideMobileTopBar>
        <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
          <div className="p-8 text-center text-muted-foreground">
            <p>Please log in to view your profile.</p>
          </div>
        </main>
      </MainLayout>
    );
  }

  const isOwnProfile = user?.pubkey === pubkey;

  // Use the kind 0 event as the zap target
  const authorEvent = author.data?.event;

  return (
    <MainLayout
      hideMobileTopBar
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
              {/* Zap button — only show for other users with a lightning address */}
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
                <Button className="rounded-full font-bold">Follow</Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold">{displayName}</h2>
              {metadata?.nip05 && (
                <p className="text-sm text-muted-foreground truncate">@{metadata.nip05}</p>
              )}
            </div>

            {/* Streak badge */}
            {streak > 1 && (
              <div className="flex items-center gap-1 bg-orange-500/15 text-orange-500 px-2.5 py-1 rounded-full shrink-0" title={`${streak > STREAK_DISPLAY_LIMIT ? `${STREAK_DISPLAY_LIMIT}+` : streak} posts within ${STREAK_WINDOW_HOURS}h windows`}>
                <Flame className="size-4" />
                <span className="text-sm font-bold tabular-nums">
                  {streak > STREAK_DISPLAY_LIMIT ? `${STREAK_DISPLAY_LIMIT}+` : streak}
                </span>
              </div>
            )}
          </div>

          {metadata?.about && (
            <p className="mt-3 text-sm whitespace-pre-wrap">{metadata.about}</p>
          )}

          {metadata?.website && (
            <div className="flex mt-3 text-sm text-muted-foreground min-w-0">
              <a href={metadata.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline min-w-0">
                <LinkIcon className="size-3.5 shrink-0" />
                <span className="truncate">{metadata.website.replace(/^https?:\/\//, '')}</span>
              </a>
            </div>
          )}
        </div>

        {/* Posts */}
        <div className="border-t border-border">
          {postsLoading ? (
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
          ) : posts && posts.length > 0 ? (
            posts.map((event) => <NoteCard key={event.id} event={event} />)
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              No posts yet.
            </div>
          )}
        </div>
      </main>
    </MainLayout>
  );
}
