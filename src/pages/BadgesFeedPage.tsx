import { useFeedSettings } from '@/hooks/useFeedSettings';
import { getExtraKindDef, getPageKinds } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from './KindFeedPage';

/** Find the Badges definition from EXTRA_KINDS. */
const badgesDef = getExtraKindDef('badges')!;

export function BadgesFeedPage() {
  const { feedSettings } = useFeedSettings();
  const kinds = getPageKinds(badgesDef, feedSettings);

  return (
    <KindFeedPage
      kind={kinds}
      title={badgesDef.label}
      icon={sidebarItemIcon('badges', 'size-5')}
      kindDef={badgesDef}
      emptyMessage={
        kinds.length === 0
          ? 'All badge types are disabled. Enable badge definitions or profile badges in Settings > Feed.'
          : undefined
      }
    />
  );
}
