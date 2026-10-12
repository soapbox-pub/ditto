import { useIntl } from 'react-intl';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from './KindFeedPage';

const podcastsDef = getExtraKindDef('podcasts')!;

export function PodcastsFeedPage() {
  const intl = useIntl();

  return (
    <KindFeedPage
      kind={[30054, 30055]}
      title={intl.formatMessage({ id: 'podcastsFeed.title', defaultMessage: 'Podcasts' })}
      feedId="podcasts"
      icon={sidebarItemIcon('podcasts', 'size-5')}
      kindDef={podcastsDef}
      emptyMessage={intl.formatMessage({ id: 'podcastsFeed.empty', defaultMessage: 'No podcasts yet. Check back soon!' })}
      showFAB={false}
    />
  );
}
