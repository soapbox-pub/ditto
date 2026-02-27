import { Sparkles } from 'lucide-react';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { getExtraKindDef, getPageKinds } from '@/lib/extraKinds';
import { KindFeedPage } from './KindFeedPage';

/** Find the Themes definition from EXTRA_KINDS. */
const themesDef = getExtraKindDef('themes')!;

export function ThemesPage() {
  const { feedSettings } = useFeedSettings();
  const kinds = getPageKinds(themesDef, feedSettings);

  return (
    <KindFeedPage
      kind={kinds}
      title="Themes"
      icon={<Sparkles className="size-5" />}
      kindDef={themesDef}
      fabHref="/settings/theme/edit?new"
      emptyMessage={
        kinds.length === 0
          ? 'All theme types are disabled. Enable theme definitions or theme updates in Settings > Feed.'
          : 'No themes yet. Be the first to share yours!'
      }
    />
  );
}
