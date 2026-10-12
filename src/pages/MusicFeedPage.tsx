import { useIntl } from 'react-intl';

import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from './KindFeedPage';

const musicDef = getExtraKindDef('music')!;

export function MusicFeedPage() {
  const intl = useIntl();
  return (
    <KindFeedPage
      kind={[36787, 34139]}
      title={intl.formatMessage({ id: 'musicFeed.title', defaultMessage: 'Music' })}
      icon={sidebarItemIcon('music', 'size-5')}
      kindDef={musicDef}
      emptyMessage={intl.formatMessage({ id: 'musicFeed.empty', defaultMessage: 'No music yet. Check back soon!' })}
      showFAB={false}
    />
  );
}
