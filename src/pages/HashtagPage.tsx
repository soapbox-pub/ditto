import { useSeoMeta } from '@unhead/react';
import { useParams } from 'react-router-dom';
import { TagFeedPage } from '@/components/TagFeedPage';
import { useAppContext } from '@/hooks/useAppContext';

export function HashtagPage() {
  const { config } = useAppContext();
  const { tag } = useParams<{ tag: string }>();

  useSeoMeta({
    title: `#${tag} | ${config.appName}`,
    description: `Posts tagged with #${tag}`,
  });

  if (!tag) return null;

  return (
    <TagFeedPage
      tag={tag.toLowerCase()}
      filterKey="#t"
      title={`#${tag}`}
      followable
      search="sort:hot"
      emptyMessage={`No posts found with #${tag}.`}
    />
  );
}
