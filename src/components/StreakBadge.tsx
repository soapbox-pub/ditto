import { Flame } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStreak } from '@/hooks/useStreak';
import { formatNumber } from '@/lib/formatNumber';
import { nowSeconds, streakDays, streakExpiresAt } from '@/lib/streak';
import { cn } from '@/lib/utils';

/** Show the "at risk" warning once a streak has less than this left, in seconds. */
const AT_RISK_SECONDS = 12 * 3600;

/** Current Unix time, re-rendering every minute so expiry stays accurate. */
function useNowSeconds(): number {
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => {
    const id = setInterval(() => setNow(nowSeconds()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

interface StreakBadgeProps {
  pubkey: string;
  /**
   * Fetch the streak if it isn't cached. Pass `false` where another query
   * already seeds it (the profile page's supplementary query).
   */
  fetch?: boolean;
  /** Show the start date on hover. */
  tooltip?: boolean;
  className?: string;
}

/** Flame and day count for a live posting streak. Renders nothing otherwise. */
export function StreakBadge({ pubkey, fetch = true, tooltip = true, className }: StreakBadgeProps) {
  const intl = useIntl();
  const now = useNowSeconds();
  const { data: streak } = useStreak(pubkey, { enabled: fetch });
  const days = streakDays(streak ?? undefined, now);

  if (!streak || days === 0) return null;

  const badge = (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      aria-label={intl.formatMessage(
        { id: 'streak.badge.label', defaultMessage: '{count, plural, one {# day streak} other {# day streak}}' },
        { count: days },
      )}
    >
      <Flame className="size-3.5 fill-orange-500 text-orange-500" aria-hidden />
      <span className="text-sm font-bold tabular-nums text-primary" aria-hidden>{formatNumber(days)}</span>
      <span className="text-sm text-muted-foreground" aria-hidden>
        <FormattedMessage
          id="streak.badge.unit"
          defaultMessage="{count, plural, one {day streak} other {day streak}}"
          values={{ count: days }}
        />
      </span>
    </span>
  );

  if (!tooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {badge}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <FormattedMessage
          id="streak.badge.since"
          defaultMessage="On a streak since {date}"
          values={{
            date: <FormattedDate value={streak.start * 1000} year="numeric" month="short" day="numeric" />,
          }}
        />
      </TooltipContent>
    </Tooltip>
  );
}

/** Nudge on the user's own profile when their streak is about to break. */
export function StreakAtRisk({ pubkey, className }: { pubkey: string; className?: string }) {
  const now = useNowSeconds();
  const { data: streak } = useStreak(pubkey, { enabled: false });
  if (!streak || streakDays(streak, now) === 0) return null;

  const remaining = streakExpiresAt(streak) - now;
  if (remaining > AT_RISK_SECONDS) return null;

  return (
    <p
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      <Flame className="size-3.5 shrink-0" aria-hidden />
      <FormattedMessage
        id="streak.atRisk"
        defaultMessage="{hours, plural, one {Your streak ends in # hour. Post something to keep it going.} other {Your streak ends in # hours. Post something to keep it going.}}"
        values={{ hours: Math.max(1, Math.ceil(remaining / 3600)) }}
      />
    </p>
  );
}
