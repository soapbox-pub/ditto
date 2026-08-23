import { Check, Server, TriangleAlert } from 'lucide-react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRelayInfo } from '@/hooks/useRelayInfo';
import { progressPercent, type RelayProgress } from '@/lib/dataTransfer';
import { renderRelayUrl } from '@/lib/relayList';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * Per-relay transfer progress, decorated with NIP-11 metadata.
 *
 * Deliberately compact — name and icon only. These are the user's own
 * configured relays, so the usual privacy objection to fetching NIP-11 (it
 * leaks the reader's IP to a host chosen by someone else) doesn't apply;
 * `RelayListManager` fetches them on the Network settings page for the same
 * reason.
 */
function RelayProgressRow({ progress }: { progress: RelayProgress }) {
  const intl = useIntl();
  const { data: relayInfo } = useRelayInfo(progress.url);

  const fallbackName = renderRelayUrl(progress.url);
  const name = relayInfo?.name?.trim() || fallbackName;
  const icon = sanitizeUrl(relayInfo?.icon);

  const percent = progressPercent(progress);
  const isBusy = progress.phase === 'counting' || progress.phase === 'active';
  const indeterminate = isBusy && percent === undefined;

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2.5">
        <Avatar className="size-6 shrink-0 border border-border/70">
          <AvatarImage src={icon} alt="" />
          <AvatarFallback>
            <Server className="size-3 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>

        <span className="min-w-0 truncate text-xs font-medium" title={progress.url}>
          {name}
        </span>

        <span
          className={cn(
            'ml-auto flex shrink-0 items-center gap-1 text-[11px] tabular-nums',
            progress.phase === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {progress.phase === 'pending' && (
            <FormattedMessage id="settings.data.relay.waiting" defaultMessage={"Waiting"} />
          )}

          {progress.phase === 'counting' && (
            <FormattedMessage id="settings.data.relay.checking" defaultMessage={"Checking…"} />
          )}

          {progress.phase === 'active' && (
            progress.total === undefined
              ? <FormattedNumber value={progress.processed} />
              : <>
                  <FormattedNumber value={progress.processed} />
                  {' / '}
                  <FormattedNumber value={progress.total} />
                </>
          )}

          {progress.phase === 'done' && (
            <>
              <Check className="size-3 text-success" />
              <FormattedNumber value={progress.processed} />
            </>
          )}

          {progress.phase === 'error' && (
            <>
              <TriangleAlert className="size-3" />
              <span className="max-w-40 truncate" title={progress.error}>
                {progress.error}
              </span>
            </>
          )}
        </span>
      </div>

      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label={intl.formatMessage(
          { id: 'settings.data.relay.progressLabel', defaultMessage: 'Transfer progress for {name}' },
          { name },
        )}
        aria-valuemin={percent === undefined ? undefined : 0}
        aria-valuemax={percent === undefined ? undefined : 100}
        aria-valuenow={percent}
      >
        {indeterminate ? (
          // Reduced motion: a static quarter-width segment stands in for the
          // sweep, so the bar still reads as "in progress" without animating.
          <div className="h-full w-1/4 rounded-full bg-primary motion-safe:animate-progress-sweep" />
        ) : (
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              progress.phase === 'error' ? 'bg-destructive/60' : 'bg-primary',
            )}
            style={{ width: `${progress.phase === 'error' ? 100 : percent ?? 0}%` }}
          />
        )}
      </div>

      {progress.skipped > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          <FormattedMessage
            id="settings.data.relay.skipped"
            defaultMessage={"{count, plural, one {# already sent, skipped} other {# already sent, skipped}}"}
            values={{ count: progress.skipped }}
          />
        </p>
      )}
    </div>
  );
}

export function RelayProgressList({ relays, className }: { relays: RelayProgress[]; className?: string }) {
  if (!relays.length) return null;

  return (
    <div className={cn('divide-y divide-border/50', className)}>
      {relays.map((relay) => (
        <RelayProgressRow key={relay.url} progress={relay} />
      ))}
    </div>
  );
}
