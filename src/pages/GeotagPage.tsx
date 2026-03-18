import { useSeoMeta } from '@unhead/react';
import { MapPin } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { TagFeedPage } from '@/components/TagFeedPage';
import { useAppContext } from '@/hooks/useAppContext';

export function GeotagPage() {
  const { config } = useAppContext();
  const { geohash } = useParams<{ geohash: string }>();

  useSeoMeta({
    title: `${geohash} | ${config.appName}`,
    description: `Posts near geohash ${geohash}`,
  });

  if (!geohash) return null;

  return (
    <TagFeedPage
      tag={geohash}
      filterKey="#g"
      icon={<MapPin className="size-5" />}
      title={geohash}
      followable
      emptyMessage={`No posts found near ${geohash}.`}
    />
  );
}
