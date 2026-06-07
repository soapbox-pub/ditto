import { useMemo } from 'react';
import { Monitor } from 'lucide-react';
import { useSeoMeta } from '@unhead/react';
import { useParams } from 'react-router-dom';
import { Feed } from '@/components/Feed';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { getEnabledFeedKinds } from '@/lib/extraKinds';
import { isRepostKind } from '@/lib/feedUtils';

/** Feed of posts published by a given client application (NIP-89 `client` tag). */
export function ClientFeedPage() {
  const { config } = useAppContext();
  const { name } = useParams<{ name: string }>();
  const { feedSettings } = useFeedSettings();

  const clientName = (name ?? '').trim();

  const kinds = useMemo(
    () => getEnabledFeedKinds(feedSettings).filter((k) => !isRepostKind(k)),
    [feedSettings],
  );

  const tagFilters = useMemo(() => ({ '#client': [clientName] }), [clientName]);

  useSeoMeta({
    title: clientName ? `${clientName} | ${config.appName}` : `Client Feed | ${config.appName}`,
    description: clientName ? `Posts published with ${clientName}` : 'Client feed',
  });

  if (!clientName) return null;

  return (
    <Feed
      kinds={kinds}
      tagFilters={tagFilters}
      hideCompose
      feedId={`client:${clientName}`}
      emptyMessage={`No posts found published with ${clientName}.`}
      header={
        <PageHeader
          title={clientName}
          icon={<span className="text-muted-foreground shrink-0"><Monitor className="size-5" /></span>}
          backTo="/"
        />
      }
    />
  );
}

export default ClientFeedPage;
