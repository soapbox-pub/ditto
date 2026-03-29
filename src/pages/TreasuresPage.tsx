import { useFeedSettings } from '@/hooks/useFeedSettings';
import { getExtraKindDef, getPageKinds } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from './KindFeedPage';

/** Find the Treasures definition from EXTRA_KINDS. */
const treasuresDef = getExtraKindDef('treasures')!;

export function TreasuresPage() {
  const { feedSettings } = useFeedSettings();
  const kinds = getPageKinds(treasuresDef, feedSettings);

  return (
    <KindFeedPage
      kind={kinds}
      title={treasuresDef.label}
      icon={sidebarItemIcon('treasures', 'size-5')}
      kindDef={treasuresDef}
      emptyMessage={
        kinds.length === 0
          ? 'All treasure types are disabled. Enable treasures or found logs in Settings > Feed.'
          : undefined
      }
    />
  );
}
