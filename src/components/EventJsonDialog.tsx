import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Ban, Check, CircleAlert, Copy, Loader2, Radio, WifiOff } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { encodeEventAddress } from '@/lib/encodeEvent';
import { toast } from '@/hooks/useToast';
import { useEventRelayPresence, type EventRelayRow } from '@/hooks/useEventRelayPresence';
import { cn } from '@/lib/utils';

interface EventJsonDialogProps {
  event: NostrEvent;
  /** Precomputed NIP-19 identifier. Falls back to `encodeEventAddress(event)`. */
  nip19Id?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Small copy-to-clipboard icon button with a transient checkmark. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: `${label} copied to clipboard` });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

/** A relay URL without the scheme, and without a bare trailing slash. */
function relayLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/' ? parsed.host : parsed.host + parsed.pathname;
  } catch {
    return url;
  }
}

/** One relay's row: whether it has the event, and whose relay it is. */
function RelayPresenceRow({ row }: { row: EventRelayRow }) {
  const { status } = row;
  const icon = {
    checking: <Loader2 className="size-3.5 animate-spin text-muted-foreground" />,
    sending: <Loader2 className="size-3.5 animate-spin text-muted-foreground" />,
    found: <Check className="size-3.5 text-green-600 dark:text-green-400" />,
    sent: <Check className="size-3.5 text-green-600 dark:text-green-400" />,
    missing: <CircleAlert className="size-3.5 text-amber-600 dark:text-amber-400" />,
    unreachable: <WifiOff className="size-3.5 text-muted-foreground" />,
    rejected: <Ban className="size-3.5 text-destructive" />,
  }[status];
  const label = {
    checking: <FormattedMessage id="eventJson.relay.checking" defaultMessage="Checking" />,
    sending: <FormattedMessage id="eventJson.relay.sending" defaultMessage="Sending" />,
    found: <FormattedMessage id="eventJson.relay.found" defaultMessage="Has it" />,
    sent: <FormattedMessage id="eventJson.relay.sent" defaultMessage="Sent" />,
    missing: <FormattedMessage id="eventJson.relay.missing" defaultMessage="Missing" />,
    unreachable: <FormattedMessage id="eventJson.relay.unreachable" defaultMessage="No answer" />,
    rejected: <FormattedMessage id="eventJson.relay.rejected" defaultMessage="Rejected" />,
  }[status];

  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <span aria-hidden="true" className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-foreground/80" title={row.url}>
        {relayLabel(row.url)}
      </span>
      {row.yours && (
        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-normal">
          <FormattedMessage id="eventJson.relay.yours" defaultMessage="Yours" />
        </Badge>
      )}
      {row.author && (
        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-normal">
          <FormattedMessage id="eventJson.relay.author" defaultMessage="Author's" />
        </Badge>
      )}
      <span
        className={cn('w-16 shrink-0 text-right text-muted-foreground', status === 'missing' && 'text-amber-700 dark:text-amber-400')}
        title={row.message}
      >
        {label}
      </span>
    </li>
  );
}

/**
 * Dialog showing an event's NIP-19 identifier and raw JSON, with copy buttons,
 * which of the viewer's and the author's write relays hold the event, and a
 * "Broadcast" action that sends it to the ones that don't. Shared by the note overflow menu and the
 * unknown-kind fallback card so users can always inspect and export an event
 * even when Ditto can't render it.
 */
export function EventJsonDialog({ event, nip19Id, open, onOpenChange }: EventJsonDialogProps) {
  const intl = useIntl();
  const { rows, missing, checking, broadcasting, broadcast } = useEventRelayPresence(event, open);
  const signed = Boolean(event.id && event.sig);
  const found = rows?.filter((row) => row.status === 'found' || row.status === 'sent').length ?? 0;

  const id = nip19Id ?? encodeEventAddress(event);
  const jsonText = JSON.stringify(event, null, 2);

  const handleBroadcast = async () => {
    const { sent, failed, pool } = await broadcast();

    // One line per relay that didn't take it: the relay's reason, or that it didn't answer.
    const MAX_LINES = 4;
    const lines = failed.filter((f) => f.url).slice(0, MAX_LINES).map(({ url, reason }) => (
      <span key={url} className="block truncate">
        <span className="font-mono">{relayLabel(url)}</span>
        {': '}
        {reason ? reason.slice(0, 160) : intl.formatMessage({ id: 'eventJson.broadcastNoAnswer', defaultMessage: 'no answer' })}
      </span>
    ));
    const more = failed.length - lines.length;
    const details = (
      <span className="block space-y-0.5">
        {lines}
        {more > 0 && lines.length > 0 && (
          <span className="block">
            <FormattedMessage id="eventJson.broadcastMore" defaultMessage="and {count} more" values={{ count: more }} />
          </span>
        )}
      </span>
    );

    if (pool) {
      if (failed.length === 0) {
        toast({ title: intl.formatMessage({ id: 'eventJson.broadcastDone', defaultMessage: 'Event broadcast to relays' }) });
      } else {
        toast({
          title: intl.formatMessage({ id: 'eventJson.broadcastFailed', defaultMessage: 'Failed to broadcast event' }),
          description: failed[0].reason
            ?? intl.formatMessage({ id: 'eventJson.broadcastFailedNoAnswer', defaultMessage: 'No relay answered.' }),
          variant: 'destructive',
        });
      }
      return;
    }

    const total = sent.length + failed.length;
    if (failed.length === 0) {
      toast({
        title: intl.formatMessage(
          { id: 'eventJson.broadcastSent', defaultMessage: 'Sent to {count, plural, one {# relay} other {# relays}}' },
          { count: sent.length },
        ),
      });
    } else if (sent.length > 0) {
      toast({
        title: intl.formatMessage(
          { id: 'eventJson.broadcastPartial', defaultMessage: 'Sent to {sent} of {total} relays' },
          { sent: sent.length, total },
        ),
        description: details,
      });
    } else {
      toast({
        title: intl.formatMessage(
          { id: 'eventJson.broadcastNone', defaultMessage: "Couldn't broadcast to {total, plural, one {the relay} other {any of # relays}}" },
          { total },
        ),
        description: details,
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col gap-0 p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-base font-semibold">Event Details</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3 shrink-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">Event ID</p>
          <div className="relative flex items-center bg-muted rounded-lg px-3 py-2">
            <p className="font-mono text-xs break-all text-foreground/80 flex-1 pr-2 select-all">
              {id}
            </p>
            <CopyButton text={id} label="Event ID" />
          </div>
        </div>

        <div className="px-5 pb-5 flex flex-col flex-1 min-h-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">Raw JSON</p>
          <div className="relative flex-1 min-h-0 overflow-auto rounded-lg bg-muted border border-border">
            <div className="sticky top-2 right-2 float-right mr-2">
              <CopyButton text={jsonText} label="Event JSON" />
            </div>
            <pre className="p-4 text-xs font-mono text-foreground/80 whitespace-pre leading-relaxed">
              {jsonText}
            </pre>
          </div>
        </div>

        {signed && rows && rows.length > 0 && (
          <div className="px-5 pb-3 shrink-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                <FormattedMessage id="eventJson.relays" defaultMessage="Relays" />
              </p>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {checking
                  ? <FormattedMessage id="eventJson.relaysChecking" defaultMessage="Checking…" />
                  : <FormattedMessage id="eventJson.relaysFound" defaultMessage="On {found} of {total}" values={{ found, total: rows.length }} />}
              </p>
            </div>
            <ul className="max-h-40 overflow-auto rounded-lg border border-border divide-y divide-border">
              {rows.map((row) => <RelayPresenceRow key={row.url} row={row} />)}
            </ul>
          </div>
        )}

        <div className="px-5 pb-5 shrink-0">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleBroadcast}
            disabled={broadcasting}
          >
            <Radio className="size-4" />
            {broadcasting
              ? <FormattedMessage id="eventJson.broadcasting" defaultMessage="Broadcasting…" />
              : missing > 0 && !checking
                ? <FormattedMessage id="eventJson.broadcastMissing" defaultMessage="Broadcast to {count, plural, one {# missing relay} other {# missing relays}}" values={{ count: missing }} />
                : <FormattedMessage id="eventJson.broadcast" defaultMessage="Broadcast Event" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
