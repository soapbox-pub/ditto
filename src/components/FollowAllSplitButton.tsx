import { useCallback, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Check, ChevronDown, Loader2, UserPlus, VolumeX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowActions } from '@/hooks/useFollowActions';
import { useMuteList } from '@/hooks/useMuteList';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

export interface FollowAllSplitButtonProps {
  /** Pubkeys (hex) to follow / mute in bulk. */
  pubkeys: string[];
  /**
   * Pubkeys the current user is already following, used to compute the
   * "Already following all" state and the "N new for you" counts. Optional —
   * if omitted, the button always shows "Follow All (N)" until pressed.
   */
  followedPubkeys?: Set<string>;
  /**
   * Human-readable noun for the list (e.g. "this list", "this pack",
   * "the team", "this badge"). Used in the Mute All confirmation copy.
   * Defaults to "this list".
   */
  listNoun?: string;
  /**
   * If true, also add the pack/list author to the follow list. Used by kind 3
   * follow-list views where the viewed event IS the author's own follow list.
   * Pass the author pubkey to include; ignored if omitted.
   */
  includeAuthorPubkey?: string;
  /**
   * Optional className applied to the outer wrapper (controls layout, e.g.
   * "flex-1"). The split button itself is always an inline-flex group.
   */
  className?: string;
  /**
   * Optional size to apply to the buttons. Defaults to "default". Use "sm"
   * for compact cards.
   */
  size?: 'default' | 'sm' | 'lg';
  /**
   * Optional variant for the main button when the user is already following
   * everyone in the list. Defaults to keeping the same "default" variant with
   * a check icon. Set to "outline" for a more subdued completed state.
   */
  followedVariant?: 'default' | 'outline';
  /** Optional toast title to show on successful Follow All. */
  followSuccessTitle?: string;
}

/**
 * Split button that combines "Follow All" with a dropdown caret offering
 * "Mute all" — letting a viewer treat any list (NIP-02 follow list, NIP-51
 * follow set, follow pack, badge awardees, etc.) as either a follow source
 * or a mute source. Mute All shows a confirmation AlertDialog before merging
 * the pubkeys into the user's NIP-51 kind 10000 mute list.
 *
 * Follow and mute are independent — a viewer can follow AND mute the same
 * pubkeys. Mute filtering in feed queries is what makes the second case
 * meaningful (mute wins).
 */
export function FollowAllSplitButton({
  pubkeys,
  followedPubkeys,
  listNoun: listNounProp,
  includeAuthorPubkey,
  className,
  size = 'default',
  followedVariant = 'default',
  followSuccessTitle,
}: FollowAllSplitButtonProps) {
  const intl = useIntl();
  const listNoun = listNounProp ?? intl.formatMessage({ id: 'followAll.defaultListNoun', defaultMessage: 'this list' });
  const { user } = useCurrentUser();
  const { followMany, isPending: isFollowing } = useFollowActions();
  const { muteManyPubkeys } = useMuteList();
  const { toast } = useToast();
  const [muteDialogOpen, setMuteDialogOpen] = useState(false);

  // "Already following all" is only meaningful if the caller provided a
  // followedPubkeys set; otherwise we always show the active CTA.
  const allFollowed = !!followedPubkeys
    && pubkeys.length > 0
    && pubkeys.every((pk) => followedPubkeys.has(pk));

  const muteCount = pubkeys.filter((pk) => pk !== user?.pubkey).length;
  const isMuting = muteManyPubkeys.isPending;
  const isBusy = isFollowing || isMuting;

  const handleFollowAll = useCallback(async () => {
    if (!user) {
      toast({
        title: intl.formatMessage({ id: 'followAll.notLoggedIn', defaultMessage: 'Not logged in' }),
        description: intl.formatMessage({ id: 'followAll.loginToFollow', defaultMessage: 'Please log in to follow users.' }),
        variant: 'destructive',
      });
      return;
    }

    try {
      const candidates = includeAuthorPubkey
        ? [...pubkeys, includeAuthorPubkey]
        : pubkeys;
      const added = await followMany(candidates);
      toast({
        title: followSuccessTitle ?? intl.formatMessage({ id: 'followAll.followingAll', defaultMessage: 'Following all!' }),
        description: added > 0
          ? intl.formatMessage(
            { id: 'followAll.addedToFollowList', defaultMessage: 'Added {count, plural, one {# new account} other {# new accounts}} to your follow list.' },
            { count: added },
          )
          : intl.formatMessage(
            { id: 'followAll.alreadyFollowingEveryone', defaultMessage: 'You were already following everyone in {listNoun}.' },
            { listNoun },
          ),
      });
    } catch (error) {
      console.error('Failed to follow all:', error);
      toast({
        title: intl.formatMessage({ id: 'followAll.followFailed', defaultMessage: 'Failed to follow' }),
        description: intl.formatMessage({ id: 'followAll.followFailedDescription', defaultMessage: 'There was an error updating your follow list.' }),
        variant: 'destructive',
      });
    }
  }, [user, pubkeys, includeAuthorPubkey, followMany, toast, listNoun, followSuccessTitle, intl]);

  const handleMuteAll = useCallback(async () => {
    if (!user) {
      toast({
        title: intl.formatMessage({ id: 'followAll.notLoggedIn', defaultMessage: 'Not logged in' }),
        description: intl.formatMessage({ id: 'followAll.loginToMute', defaultMessage: 'Please log in to mute users.' }),
        variant: 'destructive',
      });
      return;
    }

    try {
      // Don't mute yourself even if the list happens to include you.
      const candidates = pubkeys.filter((pk) => pk !== user.pubkey);
      const added = await muteManyPubkeys.mutateAsync(candidates);
      toast({
        title: intl.formatMessage({ id: 'followAll.muted', defaultMessage: 'Muted' }),
        description: added > 0
          ? intl.formatMessage(
            { id: 'followAll.addedToMuteList', defaultMessage: 'Added {count, plural, one {# account} other {# accounts}} to your mute list.' },
            { count: added },
          )
          : intl.formatMessage(
            { id: 'followAll.alreadyMutedEveryone', defaultMessage: 'Everyone in {listNoun} was already muted.' },
            { listNoun },
          ),
      });
    } catch (error) {
      console.error('Failed to mute all:', error);
      toast({
        title: intl.formatMessage({ id: 'followAll.muteFailed', defaultMessage: 'Failed to mute' }),
        description: intl.formatMessage({ id: 'followAll.muteFailedDescription', defaultMessage: 'There was an error updating your mute list.' }),
        variant: 'destructive',
      });
    } finally {
      setMuteDialogOpen(false);
    }
  }, [user, pubkeys, muteManyPubkeys, toast, listNoun, intl]);

  return (
    <div className={cn('inline-flex', className)}>
      {/* Main "Follow All" button — flush against the caret, with no rounded right corners */}
      <Button
        className="flex-1 rounded-r-none gap-2"
        size={size}
        variant={allFollowed ? followedVariant : 'default'}
        onClick={handleFollowAll}
        disabled={isBusy || !user || pubkeys.length === 0}
      >
        {isFollowing ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <FormattedMessage id="followAll.following" defaultMessage="Following…" />
          </>
        ) : allFollowed ? (
          <>
            <Check className="size-4" />
            <FormattedMessage id="followAll.alreadyFollowingAll" defaultMessage="Already following all" />
          </>
        ) : (
          <>
            <UserPlus className="size-4" />
            <FormattedMessage id="followAll.followAll" defaultMessage="Follow All ({count})" values={{ count: pubkeys.length }} />
          </>
        )}
      </Button>

      {/* Caret dropdown — visible divider line on the left, no rounded left corners */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className={cn(
              'rounded-l-none border-l border-l-primary-foreground/25 px-2',
              // When the main button is in "outline" (allFollowed + followedVariant=outline),
              // the divider should match the outline border instead.
              allFollowed && followedVariant === 'outline'
                && 'border-l-border',
            )}
            size={size}
            variant={allFollowed ? followedVariant : 'default'}
            disabled={isBusy || !user || pubkeys.length === 0}
            aria-label={intl.formatMessage({ id: 'followAll.moreOptions', defaultMessage: 'More follow options' })}
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/*
           * Use `onClick` (not `onSelect` + `e.preventDefault()`) so the menu
           * fully closes before the AlertDialog opens. Otherwise Radix's
           * DismissableLayer for the menu overlaps with the dialog's and can
           * leave `pointer-events: none` on the body, freezing the page until
           * a refresh. Defer the dialog open by a microtask so the menu's
           * unmount/cleanup runs first.
           */}
          <DropdownMenuItem
            onClick={() => {
              queueMicrotask(() => setMuteDialogOpen(true));
            }}
            className="gap-2"
          >
            <VolumeX className="size-4" />
            <FormattedMessage id="followAll.muteAll" defaultMessage="Mute all" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirmation dialog before bulk-muting */}
      <AlertDialog open={muteDialogOpen} onOpenChange={setMuteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage
                id="followAll.muteConfirmTitle"
                defaultMessage="Mute {count, plural, one {# account} other {# accounts}}?"
                values={{ count: muteCount }}
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage
                id="followAll.muteConfirmDescription"
                defaultMessage="This will add everyone in {listNoun} to your mute list. Their posts won't appear in your feeds, even if you also follow them. You can unmute individual accounts later from Settings."
                values={{ listNoun }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMuting}><FormattedMessage id="common.cancel" defaultMessage="Cancel" /></AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleMuteAll();
              }}
              disabled={isMuting}
            >
              {isMuting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <FormattedMessage id="followAll.muting" defaultMessage="Muting…" />
                </>
              ) : (
                <FormattedMessage id="followAll.muteAll" defaultMessage="Mute all" />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
