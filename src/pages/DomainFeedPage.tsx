import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NoteCard } from '@/components/NoteCard';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useMuteList } from '@/hooks/useMuteList';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Fetches a nostr.json URL. Tries direct first, falls back to CORS proxy.
 */
async function fetchNostrJson(url: URL, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { signal });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // fallthrough
  }
  return null;
}

/**
 * Fetches the NIP-05 JSON from a domain's .well-known/nostr.json endpoint
 * and returns the pubkeys of all users registered on that domain.
 */
function useDomainPubkeys(domain: string | undefined) {
  return useQuery<string[]>({
    queryKey: ['domain-pubkeys', domain],
    queryFn: async ({ signal }) => {
      if (!domain) return [];
      const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(800)]);
      const data = await fetchNostrJson(new URL('/.well-known/nostr.json', `https://${domain}`), fetchSignal);
      if (!data) throw new Error('Failed to fetch nostr.json');
      if (!data.names || typeof data.names !== 'object') return [];
      return Object.values(data.names).filter((pk): pk is string => typeof pk === 'string');
    },
    enabled: !!domain,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function DomainFeedPage() {
  const { config } = useAppContext();
  const { domain } = useParams<{ domain: string }>();
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { feedSettings } = useFeedSettings();

  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));
  const kindsKey = [...kinds].sort().join(',');

  useSeoMeta({
    title: domain ? `${domain} | ${config.appName}` : `Domain Feed | ${config.appName}`,
    description: domain ? `Posts from users on ${domain}` : 'Domain feed',
  });

  const { muteItems } = useMuteList();
  const { data: pubkeys, isLoading: pubkeysLoading, isError: pubkeysError } = useDomainPubkeys(domain);

  const { data: events, isLoading: eventsLoading } = useQuery<NostrEvent[]>({
    queryKey: ['domain-feed', domain, pubkeys?.length ?? 0, kindsKey],
    queryFn: async ({ signal }) => {
      if (!pubkeys || pubkeys.length === 0) return [];
      const results = await nostr.query(
        [{ kinds, authors: pubkeys, limit: 40 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return results.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkeys && pubkeys.length > 0,
  });

  const filteredEvents = useMemo(() => {
    if (!events || muteItems.length === 0) return events;
    return events.filter((e) => !isEventMuted(e, muteItems));
  }, [events, muteItems]);

  const isLoading = pubkeysLoading || eventsLoading;

  return (
      <main className="">
        <div className="flex items-center gap-3 px-4 mt-4 mb-1">
          <button
            onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors sidebar:hidden"
            aria-label="Go back"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <ExternalFavicon url={domain ? `https://${domain}` : undefined} size={20} />
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate leading-tight">{domain}</h1>
              {pubkeys && pubkeys.length > 0 && (
                <p className="text-xs text-muted-foreground leading-tight">
                  {pubkeys.length} user{pubkeys.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </div>

        {pubkeysError ? (
          <div className="py-16 text-center text-muted-foreground">
            <p>Could not fetch users from {domain}.</p>
            <p className="text-xs mt-2">Make sure the domain has a valid /.well-known/nostr.json</p>
          </div>
        ) : isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
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
        ) : filteredEvents && filteredEvents.length > 0 ? (
          filteredEvents.map((event) => <NoteCard key={event.id} event={event} />)
        ) : pubkeys && pubkeys.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            No users found on {domain}.
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            No posts found from users on {domain}.
          </div>
        )}
      </main>
  );
}
