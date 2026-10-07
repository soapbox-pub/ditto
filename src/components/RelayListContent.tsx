import { useMemo, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { Server } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';

import { RelayAvatarStack } from '@/components/RelayAvatarStack';
import { RelayListRow } from '@/components/RelayListRow';
import { Button } from '@/components/ui/button';
import type { RelayListEntry } from '@/lib/relayList';
import { parseRelayList, renderRelayUrl } from '@/lib/relayList';

/**
 * Relays given a full row (icon, NIP-11 name, capability badges) on the detail
 * page. The remainder collapses behind a "+N more" button and renders as bare
 * chips, because each full row costs one NIP-11 request to a host the event
 * author chose — and relay lists in the wild run to thousands of entries.
 */
const DETAIL_ROW_LIMIT = 5;

/** Relays previewed in the feed's icon stack. */
const FEED_STACK_LIMIT = 5;

interface RelayListContentProps {
  event: NostrEvent;
  /** Detail-page rendering: full rows plus an expandable overflow list. */
  expanded?: boolean;
}

/**
 * Card for kind 10002 (NIP-65 relay list metadata).
 *
 * A relay list has no title, description, or content of its own — everything
 * meaningful lives in `r` tags — so the card leads with a relay count. The feed
 * shows an icon stack like a follow list; the detail page shows full rows.
 */
export function RelayListContent({ event, expanded }: RelayListContentProps) {
  const relays = useMemo(() => parseRelayList(event), [event]);

  if (relays.length === 0) {
    return (
      <div className="mt-2 rounded-xl border border-dashed border-border px-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          <FormattedMessage id="relayList.empty" defaultMessage="This relay list is empty." />
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <RelayListSummary count={relays.length} />

      {expanded ? (
        <RelayListDetail relays={relays} />
      ) : (
        <RelayAvatarStack relays={relays} maxVisible={FEED_STACK_LIMIT} />
      )}
    </div>
  );
}

/** "N relays" header line. */
function RelayListSummary({ count }: { count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <Server className="size-4 shrink-0 text-primary" />
      <span className="text-[15px] font-semibold leading-snug">
        <FormattedMessage
          id="relayList.count"
          defaultMessage="{count, plural, one {# relay} other {# relays}}"
          values={{ count }}
        />
      </span>
    </div>
  );
}

/** Detail view: full rows for the first few, the rest behind a disclosure. */
function RelayListDetail({ relays }: { relays: RelayListEntry[] }) {
  const [showAll, setShowAll] = useState(false);

  const rows = relays.slice(0, DETAIL_ROW_LIMIT);
  const overflow = relays.slice(DETAIL_ROW_LIMIT);

  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
      {rows.map((entry) => (
        <RelayListRow key={entry.url} entry={entry} fetchInfo />
      ))}

      {/* Disclosure and the revealed chips are rows of the same container, so
          the list reads as one surface rather than a card plus a stray button. */}
      {overflow.length > 0 && !showAll && (
        <Button
          variant="ghost"
          className="h-auto w-full justify-center rounded-none py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={() => setShowAll(true)}
        >
          <FormattedMessage
            id="relayList.showMore"
            defaultMessage="{count, plural, one {# more relay} other {# more relays}}"
            values={{ count: overflow.length }}
          />
        </Button>
      )}

      {overflow.length > 0 && showAll && (
        <div className="p-3">
          <RelayChipList relays={overflow} />
        </div>
      )}
    </div>
  );
}

/**
 * The overflow relays as wrapped chips of the short URL.
 *
 * Deliberately does not load NIP-11 data — a list can hold thousands of
 * relays, and one request per relay to author-chosen hosts is not something
 * a disclosure toggle should trigger.
 */
function RelayChipList({ relays }: { relays: RelayListEntry[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {relays.map((entry) => (
        <Link
          key={entry.url}
          to={`/r/${encodeURIComponent(entry.url)}`}
          onClick={(e) => e.stopPropagation()}
          title={entry.url}
          className="max-w-full truncate rounded-full border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {renderRelayUrl(entry.url)}
        </Link>
      ))}
    </div>
  );
}
