import { WandSparkles } from 'lucide-react';
import { KindFeedPage } from './KindFeedPage';

export function SpellsFeedPage() {
  return (
    <KindFeedPage
      kind={777}
      title="Spells"
      icon={<WandSparkles className="size-5" />}
      emptyMessage="No spells found yet. Check back soon!"
      showFAB={false}
      feedId="spells"
    />
  );
}
