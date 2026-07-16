import { useFeedSettings } from '@/hooks/useFeedSettings';
import { getExtraKindDef, getPageKinds } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from './KindFeedPage';

/** Find the Quizzes definition from EXTRA_KINDS. */
const quizzesDef = getExtraKindDef('quizzes')!;

/** Feed of kind 37849 quizzes and kind 7849 quiz results, with a FAB to create a new quiz. */
export function QuizzesPage() {
  const { feedSettings } = useFeedSettings();
  const kinds = getPageKinds(quizzesDef, feedSettings);

  return (
    <KindFeedPage
      kind={kinds}
      title={quizzesDef.label}
      icon={sidebarItemIcon('quizzes', 'size-5')}
      kindDef={quizzesDef}
      fabHref="/quizzes/new"
      emptyMessage={
        kinds.length === 0
          ? 'All quiz types are disabled. Enable quizzes or quiz results in Settings > Feed.'
          : undefined
      }
    />
  );
}
