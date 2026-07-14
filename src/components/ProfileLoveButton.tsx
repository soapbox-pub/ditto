import { HeartMinus, HeartPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoveList } from '@/hooks/useLoveList';
import { useToast } from '@/hooks/useToast';
import { impactLight } from '@/lib/haptics';

interface ProfileLoveButtonProps {
  /** The profile being loved/unloved. */
  pubkey: string;
  /** Display name for toasts and tooltips. */
  displayName: string;
  /** Whether the logged-in user follows this profile. */
  isFollowing: boolean;
  /** Optional extra class names for the button. */
  className?: string;
  /** Called when the profile is newly added to the Love List (not on
   *  removal), so the caller can play a celebration. */
  onLoved?: () => void;
}

/**
 * Love List toggle button for user profiles. Sits next to the profile
 * emoji-reaction button and adds/removes the profile from the logged-in
 * user's kind 15683 Love List.
 *
 * Only shown for profiles the user already follows — love is a tier above
 * an ordinary follow, so you can't love someone you don't follow.
 */
export function ProfileLoveButton({ pubkey, displayName, isFollowing, className, onLoved }: ProfileLoveButtonProps) {
  const { user } = useCurrentUser();
  const { isLoved, addLove, removeLove } = useLoveList();
  const { toast } = useToast();

  const loved = isLoved(pubkey);
  const pending = addLove.isPending || removeLove.isPending;

  // Keep showing the button for an already-loved profile even if the follow
  // was removed, so the love can still be undone.
  if (!user || user.pubkey === pubkey || (!isFollowing && !loved)) return null;

  const handleToggle = () => {
    impactLight();
    const mutation = loved ? removeLove : addLove;
    mutation.mutate(pubkey, {
      onSuccess: () => {
        if (!loved) onLoved?.();
        toast({
          title: loved ? `Removed @${displayName} from your Love List` : `@${displayName} is on your Love List ❤️`,
          description: loved ? undefined : 'Find their posts in the Loved tab of your feed.',
        });
      },
      onError: () => {
        toast({ title: 'Failed to update Love List', variant: 'destructive' });
      },
    });
  };

  return (
    <Button
      variant="outline"
      size="icon"
      className={className ?? 'rounded-full size-10 [&_svg]:size-5'}
      title={loved ? `Remove @${displayName} from Love List` : `Add @${displayName} to Love List`}
      aria-pressed={loved}
      disabled={pending}
      onClick={handleToggle}
    >
      {loved ? <HeartMinus /> : <HeartPlus />}
    </Button>
  );
}
