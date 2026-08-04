import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { Feed } from '@/components/Feed';
import { NEW_POST_DRAFT_KEY } from '@/components/ComposeBox';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePostOnboardingGuide } from '@/hooks/usePostOnboardingGuide';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { isMissionComposeState, POST_SMALL_STARTER_TEXT } from '@/lib/missionTasks';
import { isQualifyingStarterPost } from '@/lib/postOnboardingGuide';

/**
 * Whether the new-post composer already has a saved, non-empty draft. The
 * mission must never overwrite something the user was already writing, so when
 * a draft exists we open without starter text and let `ComposeBox` restore it.
 */
function hasExistingNewPostDraft(): boolean {
  try {
    return !!localStorage.getItem(NEW_POST_DRAFT_KEY)?.trim();
  } catch {
    return false;
  }
}

const Index = () => {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, completePath } = usePostOnboardingGuide();

  useSeoMeta({
    title: config.appName,
    description: 'Your content. Your vibe. Your rules.',
  });

  useLayoutOptions({ showFAB: true, fabKind: 1, hasSubHeader: !!user });

  // Guided "Post something small" mission task. Starting it from any mission
  // surface navigates here with route state (see `useStartMissionTask`); we
  // open a fresh composer prefilled with an editable starter note.
  //
  // Opening the composer is not progress and neither is submitting it. This
  // completes the task only when the publish succeeds *and* the resulting event
  // is a qualifying starter post — a root kind-1 note. Switch to a poll or a
  // voice message and the mission correctly stays unfinished, because that
  // isn't the thing it asked for. The engine independently detects the same
  // post by query, so this is a fast path, not the only path.
  const [missionCompose, setMissionCompose] = useState<{
    open: boolean;
    initialContent?: string;
  } | null>(null);

  useEffect(() => {
    if (!isMissionComposeState(location.state)) return;

    const initialContent = hasExistingNewPostDraft() ? undefined : POST_SMALL_STARTER_TEXT;
    setMissionCompose({ open: true, initialContent });

    // Clear the route state so a refresh or back-navigation doesn't re-open the
    // composer, while keeping the user on the home feed.
    navigate('/', { replace: true, state: null });
  }, [location.state, navigate]);

  return (
    <>
      <Feed />

      {missionCompose && (
        <ReplyComposeModal
          open={missionCompose.open}
          onOpenChange={(open) => {
            // Closing (cancel, or after a successful post) just dismisses the
            // modal — completion is handled below, so cancelling never counts.
            if (!open) setMissionCompose(null);
          }}
          initialContent={missionCompose.initialContent}
          onSuccess={(published) => {
            if (!state) return;
            if (isQualifyingStarterPost(published, user?.pubkey, state.startedAt)) {
              void completePath('post-small');
            }
          }}
        />
      )}
    </>
  );
};

export default Index;
