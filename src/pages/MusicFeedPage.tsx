import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from './KindFeedPage';

const musicDef = getExtraKindDef('music')!;

export function MusicFeedPage() {
  return (
    <KindFeedPage
      kind={[36787, 34139]}
      title="Music"
      icon={sidebarItemIcon('music', 'size-5')}
      kindDef={musicDef}
      emptyMessage="No music yet. Check back soon!"
      showFAB={false}
    />
  );
}
