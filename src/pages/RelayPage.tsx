import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Globe, Info, Mail, Shield, Zap, Server, Hash } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { NoteCard } from '@/components/NoteCard';
import { PageHeader } from '@/components/PageHeader';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useMuteList } from '@/hooks/useMuteList';
import { useRelayInfo, type RelayInfoDocument } from '@/hooks/useRelayInfo';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';
import { isEventMuted } from '@/lib/muteHelpers';
import type { NostrEvent } from '@nostrify/nostrify';
import NotFound from './NotFound';

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
  const [infoOpen, setInfoOpen] = useState(false);

  const kinds = getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k));

  // Support both encoded URLs (/r/wss%3A%2F%2F...) and bare URLs (/r/wss://...).
  const relayUrl = useMemo(() => {
    if (!rawParam) return undefined;
    // If the wildcard param has no "://", it's encoded — decode it.
    let decoded: string;
    try { decoded = decodeURIComponent(rawParam); } catch { decoded = rawParam; }
    const url = rawParam.includes('://') ? rawParam : decoded;
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

  useLayoutOptions({ hasSubHeader: true });

  if (!rawParam) {
    return <NotFound />;
  }

  return (
    <main>
      <PageHeader title={hostname} icon={<Server className="size-5" />} className="py-2 sidebar:py-4">
        <button
          onClick={() => setInfoOpen((o) => !o)}
          className={`p-2 rounded-full transition-colors ${infoOpen ? 'text-foreground bg-secondary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
          aria-label="Toggle relay info"
        >
          <Info className="size-4" />
        </button>
      </PageHeader>

      <RelayInfoPanel info={info} infoLoading={infoLoading} infoError={infoError} open={infoOpen} />
      <SubHeaderBar>{null}</SubHeaderBar>

      <div style={{ height: ARC_OVERHANG_PX }} />

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

/** Inline expandable panel that displays NIP-11 relay information. */
function RelayInfoPanel({ info, infoLoading, infoError, open }: {
  info: RelayInfoDocument | undefined;
  infoLoading: boolean;
  infoError: boolean;
  open: boolean;
}) {
  return (
    <div
      style={{
        overflow: 'hidden',
        maxHeight: open ? '800px' : '0',
        transition: 'max-height 0.3s ease-in-out',
      }}
      aria-hidden={!open}
    >
      <div>
        {infoLoading ? (
          <div className="p-4 space-y-4">
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
          <div className="p-4 space-y-4">
            {/* Banner */}
            {info.banner && (
              <div className="w-full h-40 overflow-hidden rounded-lg">
                <img src={info.banner} alt="" className="w-full h-full object-cover" />
              </div>
            )}

            {/* Icon + name (when different from hostname) */}
            {info.icon && (
              <div className="flex items-center gap-2.5">
                <img src={info.icon} alt="" className="size-8 rounded-full object-cover ring-1 ring-border" />
                {info.name && (
                  <span className="text-sm font-medium">{info.name}</span>
                )}
              </div>
            )}

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
        ) : infoError ? (
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="size-4" />
              <span>Could not load relay information.</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
