import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { Server, Shield, Zap } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useRelayInfo } from '@/hooks/useRelayInfo';
import type { RelayListEntry } from '@/lib/relayList';
import { renderRelayUrl } from '@/lib/relayList';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface RelayListRowProps {
  entry: RelayListEntry;
  /**
   * Fetch and show the relay's NIP-11 document (name, icon, capability badges).
   *
   * Off by default, and deliberately so: a NIP-11 document is served by
   * whatever host the `r` tag names, so fetching one reveals the reader's IP
   * to a host the *event author* chose. Ditto otherwise never contacts
   * arbitrary hosts from a feed — link previews and favicons both go through
   * proxies. Enable this only for a bounded number of rows on a surface the
   * user navigated to deliberately; relay lists in the wild hold thousands of
   * entries, so "one request per relay" is never acceptable.
   */
  fetchInfo?: boolean;
  className?: string;
}

/**
 * One relay from a NIP-65 relay list.
 *
 * With `fetchInfo` it mirrors the relay rows in Settings → Network
 * (`RelayListManager`): icon, name, raw URL, and capability badges. Without
 * it the row degrades to the short URL plus read/write pills, which needs no
 * network access at all.
 */
export function RelayListRow({ entry, fetchInfo, className }: RelayListRowProps) {
  const intl = useIntl();
  // Passing `undefined` leaves the query disabled — no request is made.
  const { data: relayInfo } = useRelayInfo(fetchInfo ? entry.url : undefined);

  const prettyUrl = renderRelayUrl(entry.url);
  const relayName = relayInfo?.name?.trim() || prettyUrl;
  const safeIcon = useMemo(() => sanitizeUrl(relayInfo?.icon), [relayInfo?.icon]);

  const hasPaymentRequired = Boolean(relayInfo?.limitation?.payment_required ?? relayInfo?.payment_required);
  const hasAuthRequired = Boolean(relayInfo?.limitation?.auth_required ?? relayInfo?.auth_required);
  const notableNips = (relayInfo?.supported_nips ?? []).filter((nip) => nip === 42 || nip === 50);
  const hasBadges = hasPaymentRequired || hasAuthRequired || notableNips.length > 0;

  // Without a NIP-11 document the name *is* the URL, so a second line would
  // just repeat it.
  const showRawUrl = relayName !== prettyUrl;

  return (
    <div className={cn('flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40', className)}>
      <Link
        to={`/r/${encodeURIComponent(entry.url)}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar className="size-8 shrink-0 border border-border/70">
          <AvatarImage
            src={safeIcon}
            alt={intl.formatMessage(
              { id: 'relayList.relayIcon', defaultMessage: '{name} icon' },
              { name: relayName },
            )}
          />
          <AvatarFallback>
            <Server className="size-4 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight" title={relayName}>
            {relayName}
          </p>
          {showRawUrl && (
            <p className="truncate text-[11px] text-muted-foreground" title={prettyUrl}>
              {prettyUrl}
            </p>
          )}
          {hasBadges && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {notableNips.includes(50) && <Badge variant="outline" className="text-[10px]">NIP-50</Badge>}
              {notableNips.includes(42) && <Badge variant="outline" className="text-[10px]">NIP-42</Badge>}
              {hasAuthRequired && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Shield className="size-2.5" />
                  <FormattedMessage id="relayList.auth" defaultMessage="Auth" />
                </Badge>
              )}
              {hasPaymentRequired && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Zap className="size-2.5" />
                  <FormattedMessage id="relayList.paid" defaultMessage="Paid" />
                </Badge>
              )}
            </div>
          )}
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-1 text-[10px]">
        {entry.read && (
          <span className="rounded bg-green-500/10 px-1.5 py-0.5 font-medium text-green-600 dark:text-green-400">
            <FormattedMessage id="relayList.read" defaultMessage="Read" />
          </span>
        )}
        {entry.write && (
          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-medium text-blue-600 dark:text-blue-400">
            <FormattedMessage id="relayList.write" defaultMessage="Write" />
          </span>
        )}
      </div>
    </div>
  );
}
