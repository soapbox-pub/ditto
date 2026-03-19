import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Globe, Mail, Shield, Zap, Server, Hash } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { NoteCard } from '@/components/NoteCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useMuteList } from '@/hooks/useMuteList';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import { PageHeader } from '@/components/PageHeader';
import type { NostrEvent } from '@nostrify/nostrify';
import NotFound from './NotFound';

/** NIP-11 Relay Information Document. */
interface RelayInfo {
  name?: string;
  description?: string;
  banner?: string;
  icon?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  limitation?: {
    auth_required?: boolean;
    payment_required?: boolean;
    restricted_writes?: boolean;
    max_message_length?: number;
    max_subscriptions?: number;
    max_event_tags?: number;
    max_content_length?: number;
    max_limit?: number;
  };
  fees?: {
    admission?: { amount: number; unit: string }[];
    subscription?: { amount: number; unit: string; period?: number }[];
  };
}

/** Fetch NIP-11 relay info document over HTTP. */
function useRelayInfo(relayUrl: string | undefined) {
  return useQuery<RelayInfo>({
    queryKey: ['relay-info', relayUrl],
    queryFn: async ({ signal }) => {
      if (!relayUrl) throw new Error('No relay URL');
      const httpUrl = relayUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
      const response = await fetch(httpUrl, {
        headers: { Accept: 'application/nostr+json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    enabled: !!relayUrl,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Fetch the latest events from a specific relay, filtered to supported kinds. */
function useRelayFeed(relayUrl: string | undefined, kinds: number[]) {
  const { nostr } = useNostr();
  const kindsKey = [...kinds].sort().join(',');

  return useQuery<NostrEvent[]>({
    queryKey: ['relay-feed', relayUrl, kindsKey],
    queryFn: async ({ signal }) => {
      if (!relayUrl) return [];
      const relay = nostr.relay(relayUrl);
      return relay.query(
        [{ kinds, limit: 15 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );
    },
    enabled: !!relayUrl && kinds.length > 0,
  });
}

export function RelayPage() {
  const { config } = useAppContext();
  const { '*': rawParam } = useParams();
  const { feedSettings } = useFeedSettings();
  const { muteItems } = useMuteList();

  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));

  // Support both encoded URLs (/r/wss%3A%2F%2F...) and bare URLs (/r/wss://...).
  const relayUrl = useMemo(() => {
    if (!rawParam) return undefined;
    // If the wildcard param has no "://", it's encoded — decode it.
    const url = rawParam.includes('://') ? rawParam : decodeURIComponent(rawParam);
    if (url.startsWith('wss://') || url.startsWith('ws://')) {
      return url;
    }
    return `wss://${url}`;
  }, [rawParam]);

  // Derive a display hostname from the URL
  const hostname = useMemo(() => {
    if (!relayUrl) return '';
    try {
      return relayUrl.replace(/^wss?:\/\//, '').replace(/\/$/, '');
    } catch {
      return relayUrl;
    }
  }, [relayUrl]);

  const { data: info, isLoading: infoLoading, isError: infoError } = useRelayInfo(relayUrl);
  const { data: events, isLoading: eventsLoading } = useRelayFeed(relayUrl, kinds);

  const filteredEvents = useMemo(() => {
    if (!events || muteItems.length === 0) return events;
    return events.filter((e) => !isEventMuted(e, muteItems));
  }, [events, muteItems]);

  useSeoMeta({
    title: info?.name
      ? `${info.name} | ${config.appName}`
      : hostname
        ? `${hostname} | ${config.appName}`
        : `Relay | ${config.appName}`,
    description: info?.description ?? `Events from ${hostname}`,
  });

  if (!rawParam) {
    return <NotFound />;
  }

  return (
    <main>
      {/* Header */}
      <PageHeader
        onBack={() => window.history.length > 1 ? window.history.back() : undefined}
        titleContent={
          <div className="flex items-center gap-2.5 min-w-0">
            {info?.icon ? (
              <img
                src={info.icon}
                alt=""
                className="size-8 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="size-8 rounded-full bg-muted flex items-center justify-center ring-1 ring-border">
                <Server className="size-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate leading-tight">
                {info?.name ?? hostname}
              </h1>
              <p className="text-xs text-muted-foreground leading-tight truncate">
                {hostname}
              </p>
            </div>
          </div>
        }
      />

      {/* NIP-11 Info Section */}
      {infoLoading ? (
        <div className="p-4 space-y-4 border-b border-border">
          {/* Banner skeleton */}
          <Skeleton className="w-full h-32 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ) : info ? (
        <div className="border-b border-border">
          {/* Banner */}
          {info.banner && (
            <div className="w-full h-40 overflow-hidden">
              <img
                src={info.banner}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Description */}
            {info.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {info.description}
              </p>
            )}

            {/* Badges: payment, auth, writes */}
            <div className="flex flex-wrap gap-2">
              {info.limitation?.payment_required && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Zap className="size-3" />
                  Paid
                </Badge>
              )}
              {info.limitation?.auth_required && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Shield className="size-3" />
                  Auth required
                </Badge>
              )}
              {info.limitation?.restricted_writes && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Shield className="size-3" />
                  Restricted writes
                </Badge>
              )}
              {info.software && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Server className="size-3" />
                  {info.software.replace(/^https?:\/\//, '')}
                  {info.version ? ` ${info.version}` : ''}
                </Badge>
              )}
              {info.contact && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Mail className="size-3" />
                  {info.contact}
                </Badge>
              )}
            </div>

            {/* Supported NIPs */}
            {info.supported_nips && info.supported_nips.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Hash className="size-3" />
                  Supported NIPs
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {info.supported_nips.sort((a, b) => a - b).map((nip) => (
                    <a
                      key={nip}
                      href={`https://github.com/nostr-protocol/nips/blob/master/${String(nip).padStart(2, '0')}.md`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                    >
                      {nip}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Fees */}
            {info.fees && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Zap className="size-3" />
                  Fees
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {info.fees.admission?.map((fee, i) => (
                    <span key={`admission-${i}`} className="bg-muted rounded-md px-2 py-0.5">
                      Admission: {fee.amount / 1000} sats
                    </span>
                  ))}
                  {info.fees.subscription?.map((fee, i) => (
                    <span key={`sub-${i}`} className="bg-muted rounded-md px-2 py-0.5">
                      Subscription: {fee.amount / 1000} sats{fee.period ? ` / ${Math.round(fee.period / 86400)}d` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : infoError ? (
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="size-4" />
            <span>Could not load relay information.</span>
          </div>
        </div>
      ) : null}

      {/* Feed section */}
      <div>
        {eventsLoading ? (
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
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            No events found on this relay.
          </div>
        )}
      </div>
    </main>
  );
}
