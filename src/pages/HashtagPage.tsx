import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useParams } from 'react-router-dom';
import { BlockedSearchNotice } from '@/components/BlockedSearchNotice';
import { TagFeedPage } from '@/components/TagFeedPage';
import { useAppContext } from '@/hooks/useAppContext';
import { containsBlockedTerm } from '@/lib/blockedTerms';

export function HashtagPage() {
  const { config } = useAppContext();
  const { tag } = useParams<{ tag: string }>();
  const blocked = containsBlockedTerm(tag);

  useSeoMeta({
    title: blocked ? config.appName : `#${tag} | ${config.appName}`,
    description: blocked ? undefined : `Posts tagged with #${tag}`,
  });

  if (!tag) return null;

  if (blocked) {
    return (
      <main>
        <BlockedSearchNotice />
      </main>
    );
  }

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
