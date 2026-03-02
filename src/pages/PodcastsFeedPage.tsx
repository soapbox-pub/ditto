import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from './KindFeedPage';

const podcastsDef = getExtraKindDef('podcasts')!;

export function PodcastsFeedPage() {
  return (
    <KindFeedPage
      kind={[30054, 30055]}
      title="Podcasts"
      icon={sidebarItemIcon('podcasts', 'size-5')}
      kindDef={podcastsDef}
      emptyMessage="No podcasts yet. Check back soon!"
      showFAB={false}
    />
  );
}
