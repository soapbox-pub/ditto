import { useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { FormattedMessage, useIntl } from 'react-intl';

import { EmbeddedPost } from '@/components/EmbeddedPost';
import {
  VersionAction,
  VersionDate,
  VersionHistoryBody,
  VersionHistoryDialog,
  VersionList,
  VersionListEmpty,
  VersionListSkeleton,
} from '@/components/VersionHistory';
import { formatVersionDate, queryAllVersions } from '@/lib/versionHistory';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { isAddressableKind } from '@/lib/eventKinds';

interface EventRecoveryDialogProps {
  /** The current event whose history should be browsed. */
  event: NostrEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Generic recovery dialog for replaceable and addressable events.
 *
 * Lists every historical version of the event matching `(kind, author[, d])`,
 * sorted newest first, and lets the user republish a chosen version with a
 * fresh `created_at`. `published_at` is preserved via the `prev` property on
 * `useNostrPublish`.
 *
 * The dialog only queries by `(kind, authors[, #d])` — the same filter shape
 * used by all other recovery dialogs. Without `authors` (and without `#d` for
 * addressable kinds), relays would either reject the request or return an
 * unbounded firehose.
 */
export function EventRecoveryDialog({ event, open, onOpenChange }: EventRecoveryDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <VersionHistoryDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<FormattedMessage id="eventRecovery.title" defaultMessage="Restore previous version" />}
      description={<FormattedMessage id="eventRecovery.description" defaultMessage="Browse and restore older versions of this event." />}
    >
      <VersionHistoryBody>
        {/* Mounting key forces a fresh refetch each time the dialog reopens
            so a user who rapidly edits, then reopens, sees the latest history. */}
        {open && <RecoveryContent key={event.id} event={event} onClose={close} />}
      </VersionHistoryBody>
    </VersionHistoryDialog>
  );
}

interface RecoveryContentProps {
  event: NostrEvent;
  onClose: () => void;
}

function RecoveryContent({ event, onClose }: RecoveryContentProps) {
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const dTag = isAddressableKind(event.kind)
    ? event.tags.find(([name]) => name === 'd')?.[1] ?? ''
    : undefined;

  const queryKey = ['event-recovery', event.kind, event.pubkey, dTag ?? null] as const;

  const history = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async () => {
      const filter: NostrFilter = {
        kinds: [event.kind],
        authors: [event.pubkey],
      };
      if (dTag !== undefined) {
        filter['#d'] = [dTag];
      }
      return queryAllVersions(nostr, [filter], AbortSignal.timeout(10_000));
    },
    staleTime: 30_000,
  });

  if (history.isLoading) {
    return <VersionListSkeleton />;
  }

  const events = history.data ?? [];

  if (events.length === 0) {
    return (
      <VersionListEmpty>
        <FormattedMessage id="eventRecovery.empty" defaultMessage="No previous versions found. Your relays may not store historical events." />
      </VersionListEmpty>
    );
  }

  // The newest event by created_at is treated as "current". This may differ
  // from the `event` we were called with (e.g. user edited from another device
  // since this menu was opened) — in that case we still mark the actual newest
  // as current to avoid letting the user "restore" what is already current.
  const currentId = events[0].id;

  const handleRestore = async (snapshot: NostrEvent) => {
    setRestoringId(snapshot.id);
    try {
      await publishEvent({
        kind: snapshot.kind,
        content: snapshot.content,
        tags: snapshot.tags,
        created_at: Math.floor(Date.now() / 1000),
        // Pass the snapshot as `prev` so useNostrPublish preserves the
        // original `published_at` tag (NIP-24) instead of resetting it.
        prev: snapshot,
      });

      toast({
        title: intl.formatMessage({ id: 'eventRecovery.restored', defaultMessage: 'Event restored' }),
        description: intl.formatMessage(
          { id: 'muteRecovery.restoredDescription', defaultMessage: 'Successfully restored from {date}.' },
          { date: formatVersionDate(snapshot.created_at, intl) },
        ),
      });

      queryClient.invalidateQueries({ queryKey });
      onClose();
    } catch (error) {
      console.error('Failed to restore event:', error);
      toast({
        title: intl.formatMessage({ id: 'muteRecovery.restoreFailed', defaultMessage: 'Restore failed' }),
        description: intl.formatMessage({ id: 'eventRecovery.restoreFailedDescription', defaultMessage: 'Could not republish the event. Please try again.' }),
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <VersionList>
      {events.map((snapshot) => (
        <li key={snapshot.id} className="space-y-2 px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <VersionDate event={snapshot} />
            <VersionAction
              isCurrent={snapshot.id === currentId}
              isRestoring={restoringId === snapshot.id}
              disabled={restoringId !== null}
              onRestore={() => handleRestore(snapshot)}
            />
          </div>
          <EmbeddedPost event={snapshot} disableHoverCards />
        </li>
      ))}
    </VersionList>
  );
}
