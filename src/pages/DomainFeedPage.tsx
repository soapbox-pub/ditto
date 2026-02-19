import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/MainLayout';
import { NoteCard } from '@/components/NoteCard';
import { DomainFavicon } from '@/components/DomainFavicon';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

/**
 * Fetches a nostr.json URL. Tries direct first, falls back to CORS proxy.
 */
async function fetchNostrJson(url: string, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { signal });
    if (response.ok) return await response.json();
  } catch {
    // CORS or network error — fall through to proxy
  }
  try {
    const response = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, { signal });
    if (response.ok) return await response.json();
  } catch {
    // Both failed
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
      const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const data = await fetchNostrJson(`https://${domain}/.well-known/nostr.json`, fetchSignal);
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
  const { domain } = useParams<{ domain: string }>();
  const { nostr } = useNostr();
  const { feedSettings } = useFeedSettings();

  const extraKinds = getEnabledFeedKinds(feedSettings);
  const kinds = [1, ...extraKinds];
  const kindsKey = kinds.sort().join(',');

  useSeoMeta({
    title: domain ? `${domain} | Mew` : 'Domain Feed | Mew',
    description: domain ? `Posts from users on ${domain}` : 'Domain feed',
  });

  const { data: pubkeys, isLoading: pubkeysLoading, isError: pubkeysError } = useDomainPubkeys(domain);

  // Fetch label from domain
  const domainLabel = useMemo(() => {
    if (!domain) return '';
    const parts = domain.split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }, [domain]);

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

  const isLoading = pubkeysLoading || eventsLoading;

  return (
    <MainLayout>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-4 px-4 mt-4 mb-5 bg-background/80 backdrop-blur-md z-10')}>
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <DomainFavicon domain={domain ?? ''} size={20} />
            <h1 className="text-xl font-bold truncate">{domain}</h1>
          </div>
        </div>

        {/* Domain info */}
        {pubkeys && pubkeys.length > 0 && (
          <div className="px-4 pb-4 text-sm text-muted-foreground">
            {pubkeys.length} user{pubkeys.length !== 1 ? 's' : ''} on {domainLabel}
          </div>
        )}

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
        ) : events && events.length > 0 ? (
          events.map((event) => <NoteCard key={event.id} event={event} />)
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
    </MainLayout>
  );
}
