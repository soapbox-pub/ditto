import { useCallback, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList, useFollowActions } from '@/hooks/useFollowActions';
import { useToast } from '@/hooks/useToast';
import { impactMedium } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface FollowButtonProps {
  /** The pubkey of the user to follow/unfollow. */
  pubkey: string;
  /** Optional class name overrides. */
  className?: string;
  /** Button size variant. Defaults to "sm". */
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Reusable follow / unfollow button.
 *
 * Hides itself when the target is the logged-in user or when no user is logged in.
 */
export function FollowButton({ pubkey, className, size = 'sm' }: FollowButtonProps) {
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const { isPending, follow, unfollow } = useFollowActions();
  const { toast } = useToast();

  const isFollowing = useMemo(() => {
    if (!followData?.pubkeys) return false;
    return followData.pubkeys.includes(pubkey);
  }, [pubkey, followData]);

  const handleToggleFollow = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    try {
      if (isFollowing) {
        await unfollow(pubkey);
        impactMedium();
        toast({ title: 'Unfollowed' });
      } else {
        await follow(pubkey);
        impactMedium();
        toast({ title: 'Followed' });
      }
    } catch (err) {
      console.error('Follow toggle failed:', err);
      toast({ title: 'Failed to update follow list', variant: 'destructive' });
    }
  }, [user, pubkey, isFollowing, follow, unfollow, toast]);

  // Don't render for own profile or when logged out
  if (!user || user.pubkey === pubkey) return null;

  return (
    <Button
      type="button"
      size={size}
      variant={isFollowing ? 'outline' : 'default'}
      className={cn(
        'rounded-full font-bold',
        isFollowing && 'bg-background border border-border text-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive',
        className,
      )}
      onClick={handleToggleFollow}
      disabled={isPending}
    >
      {isPending ? '...' : isFollowing ? 'Unfollow' : 'Follow'}
    </Button>
  );
}
