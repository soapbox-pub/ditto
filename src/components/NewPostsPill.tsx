import { useContext, useEffect, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavHidden } from '@/contexts/LayoutContext';
import { PageUnderlayContext } from '@/contexts/PageUnderlayContext';
import { useAuthors } from '@/hooks/useAuthors';
import { getAvatarShape } from '@/lib/avatarShape';
import { profileName } from '@/lib/getDisplayName';

interface NewPostsPillProps {
  /** Number of new posts waiting. The pill is hidden when this is 0. */
  count: number;
  /**
   * Most recent distinct authors of the waiting posts, newest first. Up to
   * three are shown. Omit to show the count instead (e.g. search results,
   * where the count is the more useful signal).
   */
  authors?: string[];
  /** Called when the user taps the pill (typically flush/refresh + scroll to top). */
  onClick: () => void;
}

/**
 * Sticky new posts pill shown at the top of a live-updating feed.
 *
 * Shows the avatars of who posted (falling back to "N new posts" without
 * them), drops in from under the header, and bumps as more posts arrive.
 * Sticks below the SubHeaderBar arc and fades out with the nav on scroll.
 * Used by the main feed ({@link Feed}) and the Search page to surface new
 * posts without re-sorting the list under the user's scroll position.
 */
export function NewPostsPill({ count, authors = [], onClick }: NewPostsPillProps) {
  const intl = useIntl();
  const navHidden = useNavHidden();
  // The copy of a page under a pushed one (BackSwipe) counts arrivals of its
  // own, which the page a swipe back lands on starts without.
  const inUnderlay = useContext(PageUnderlayContext);

  const shown = authors.slice(0, 3);
  const { data: authorsMap } = useAuthors(shown);

  // Bump the pill each time another post lands on top of the ones waiting.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const prevCountRef = useRef(count);
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = count;
    if (prev <= 0 || count <= prev) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    buttonRef.current?.animate?.(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
      { duration: 350, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
  }, [count]);

  if (count <= 0 || inUnderlay) return null;

  return (
    <div
      className={cn(
        'sticky new-posts-pill z-10 flex justify-center pointer-events-none',
        'max-sidebar:transition-opacity max-sidebar:duration-300 max-sidebar:ease-in-out',
        navHidden && 'max-sidebar:opacity-0 max-sidebar:pointer-events-none',
      )}
      style={{ marginBottom: '-3rem' }}
    >
      <button
        ref={buttonRef}
        onClick={onClick}
        aria-label={intl.formatMessage(
          { id: 'newPostsPill.label', defaultMessage: '{count, plural, one {# new post} other {# new posts}}' },
          { count },
        )}
        className={cn(
          'pointer-events-auto flex items-center gap-2 h-10 pl-3 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-lg',
          'hover:bg-primary/90 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'motion-safe:animate-new-posts-pill-in motion-reduce:animate-in motion-reduce:fade-in',
          shown.length > 0 ? 'pr-1.5' : 'pr-4',
        )}
      >
        <ArrowUp className="size-4 shrink-0 motion-safe:animate-new-posts-arrow" aria-hidden />
        {shown.length > 0 ? (
          <>
            <span className="flex -space-x-2" aria-hidden>
              {shown.map((pk, i) => {
                const author = authorsMap?.get(pk);
                const name = profileName(author?.metadata) ?? '';
                return (
                  <Avatar
                    key={pk}
                    shape={getAvatarShape(author?.metadata)}
                    className="size-7 ring-2 ring-primary motion-safe:animate-new-posts-avatar-in"
                    style={{ zIndex: shown.length - i }}
                  >
                    <AvatarImage src={author?.metadata?.picture} imeta={author?.imeta?.picture} alt="" />
                    <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-[10px]">
                      {name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                );
              })}
            </span>
            <span className="pr-2.5" aria-hidden>
              <FormattedMessage
                id="newPostsPill.posted"
                defaultMessage="{authors, plural, one {posted} other {posted}}"
                values={{ authors: authors.length }}
              />
            </span>
          </>
        ) : (
          <FormattedMessage
            id="newPostsPill.label"
            defaultMessage="{count, plural, one {# new post} other {# new posts}}"
            values={{ count }}
          />
        )}
      </button>
    </div>
  );
}
