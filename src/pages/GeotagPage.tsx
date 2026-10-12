import { useSeoMeta } from '@/hooks/useSeoMeta';
import { MapPin } from 'lucide-react';
import { useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';
import { TagFeedPage } from '@/components/TagFeedPage';
import { useAppContext } from '@/hooks/useAppContext';

export function GeotagPage() {
  const intl = useIntl();
  const { config } = useAppContext();
  const { geohash } = useParams<{ geohash: string }>();

  useSeoMeta({
    title: `${geohash} | ${config.appName}`,
    description: intl.formatMessage({ id: 'geotag.seoDescription', defaultMessage: 'Posts near geohash {geohash}' }, { geohash }),
  });

  if (!geohash) return null;

  return (
    <TagFeedPage
      tag={geohash}
      filterKey="#g"
      icon={<MapPin className="size-5" />}
      title={geohash}
      followable
      emptyMessage={intl.formatMessage({ id: 'geotag.empty', defaultMessage: 'No posts found near {geohash}.' }, { geohash })}
    />
  );
}
