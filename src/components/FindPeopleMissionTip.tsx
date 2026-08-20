import { MissionHelperCard } from '@/components/MissionHelperCard';
import { useFindPeopleMissionFlow } from '@/hooks/useFindPeopleMissionFlow';
import {
  FIND_PEOPLE_TASK_ACCOUNTS_HINT,
  FIND_PEOPLE_TASK_GUIDANCE,
  POST_ONBOARDING_PATHS,
} from '@/lib/postOnboardingGuide';

/**
 * The Search-side guidance for the `find-people` ("Find your people") task.
 *
 * The first task was the one the mission explained least. Every other guided
 * task lands the user somewhere that then tells them what to do — the feed
 * names the four ways to engage, the settings pages name the two halves of
 * customize — while this one navigated to Search and said nothing, leaving the
 * user in front of an empty field to work out on their own that the task ends
 * with a Follow on somebody's profile.
 *
 * So it says that, in the same card the fourth task uses: what this is, where
 * it happens, and the one action that finishes it.
 *
 * Like the others it only explains. Completion is `useMissionEngine`'s, from
 * the follow list actually growing, so the user can ignore this entirely and
 * finish the task by following someone from a thread, a profile, or anywhere
 * else in Ditto.
 */
export function FindPeopleMissionTip({
  /** Whether the user is on a tab that searches posts rather than people. */
  onPostsTab = false,
  /** Switch the page to the Accounts tab. Offered only while `onPostsTab`. */
  onBrowsePeople,
}: {
  onPostsTab?: boolean;
  onBrowsePeople?: () => void;
}) {
  const { flowActive, completed } = useFindPeopleMissionFlow();

  if (!flowActive) return null;

  const meta = POST_ONBOARDING_PATHS['find-people'];

  if (completed) {
    return (
      <MissionHelperCard
        className="px-4 pt-3"
        stepLabel="Mission complete"
        title={meta.label}
        body="You followed someone. Your feed will start filling up."
        completed
      />
    );
  }

  const offerAccounts = onPostsTab && !!onBrowsePeople;

  return (
    <MissionHelperCard
      className="px-4 pt-3"
      stepLabel="Your mission"
      title={meta.label}
      body={FIND_PEOPLE_TASK_GUIDANCE}
      hint={offerAccounts ? FIND_PEOPLE_TASK_ACCOUNTS_HINT : meta.completionHint}
      ctaLabel={offerAccounts ? 'Search people' : undefined}
      onCta={offerAccounts ? onBrowsePeople : undefined}
    />
  );
}
