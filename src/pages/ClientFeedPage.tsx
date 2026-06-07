import { useMemo } from 'react';
import { Monitor } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Feed } from '@/components/Feed';
import { PageHeader } from '@/components/PageHeader';
import { ClientMetrics } from '@/components/ClientMetrics';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isReactionKind, isRepostKind } from '@/lib/feedUtils';

/** Feed of posts published by a given client application (NIP-89 `client` tag). */
export function ClientFeedPage() {
  const { config } = useAppContext();
  const { name } = useParams<{ name: string }>();
  const [searchParams] = useSearchParams();
  const { feedSettings } = useFeedSettings();

  // The primary `#client` tag is the path segment; additional tags for the same
  // client (e.g. "Primal Web" + "Primal Android") arrive as `client` query
  // params so the feed and stats cover every tag the client publishes with.
  const clientTags = useMemo(() => {
    const tags = [name ?? '', ...searchParams.getAll('client')]
      .map((t) => t.trim())
      .filter(Boolean);
    return Array.from(new Set(tags));
  }, [name, searchParams]);

  // The URL tags are the source of truth — show them as-is rather than mapping
  // back to a known client's display label.
  const title = useMemo(() => clientTags.join(' + '), [clientTags]);

  // Reposts (kind 6/16) and reactions (kind 7) directly reference another
  // event, which may have been published with a different client, so they
  // don't belong on a client-specific feed.
  const kinds = useMemo(
    () => getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k) && !isReactionKind(k)),
    [feedSettings],
  );

  const tagFilters = useMemo(() => ({ '#client': clientTags }), [clientTags]);

  useSeoMeta({
    title: title ? `${title} | ${config.appName}` : `Client Feed | ${config.appName}`,
    description: title ? `Posts published with ${title}` : 'Client feed',
  });

  if (!clientTags.length) return null;

  return (
    <Feed
      kinds={kinds}
      tagFilters={tagFilters}
      hideCompose
      globalFirst
      feedId={`client:${clientTags.join(',')}`}
      emptyMessage={`No posts found published with ${title}.`}
      header={
        <>
          <PageHeader
            title={title}
            icon={<span className="text-muted-foreground shrink-0"><Monitor className="size-5" /></span>}
            backTo="/"
          />
          <ClientMetrics clientTags={clientTags} />
        </>
      }
    />
  );
}

export default ClientFeedPage;
