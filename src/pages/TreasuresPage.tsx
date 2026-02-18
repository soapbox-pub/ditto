import { MapPin } from 'lucide-react';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { EXTRA_KINDS, getPageKinds } from '@/lib/extraKinds';
import { KindFeedPage } from './KindFeedPage';

/** Find the Treasures definition from EXTRA_KINDS. */
const treasuresDef = EXTRA_KINDS.find((def) => def.route === 'treasures')!;

export function TreasuresPage() {
  const { feedSettings } = useFeedSettings();
  const kinds = getPageKinds(treasuresDef, feedSettings);

  return (
    <KindFeedPage
      kind={kinds}
      title="Treasures"
      icon={<MapPin className="size-5" />}
      emptyMessage={
        kinds.length === 0
          ? 'All treasure types are disabled. Enable geocaches or found logs in Settings > Feed.'
          : undefined
      }
    />
  );
}
