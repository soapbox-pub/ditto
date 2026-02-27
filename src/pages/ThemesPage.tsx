import { Sparkles } from 'lucide-react';
import { getExtraKindDef } from '@/lib/extraKinds';
import { THEME_DEFINITION_KIND, ACTIVE_THEME_KIND } from '@/lib/themeEvent';
import { KindFeedPage } from './KindFeedPage';

/** Find the Themes definition from EXTRA_KINDS. */
const themesDef = getExtraKindDef('themes')!;

export function ThemesPage() {
  return (
    <KindFeedPage
      kind={[THEME_DEFINITION_KIND, ACTIVE_THEME_KIND]}
      title="Themes"
      icon={<Sparkles className="size-5" />}
      kindDef={themesDef}
      fabHref="/settings/theme/edit?new"
      emptyMessage="No themes yet. Be the first to share yours!"
    />
  );
}
