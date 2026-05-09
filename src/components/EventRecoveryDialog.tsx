import { useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { Check, Loader2, RotateCcw } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmbeddedPost } from '@/components/EmbeddedPost';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { isAddressableKind } from '@/lib/eventKinds';
import { cn } from '@/lib/utils';

/**
 * Query all events matching a filter using `req()` instead of `query()`.
 * This bypasses NSet deduplication in NPool.query(), which discards older
 * versions of replaceable events. We need every historical version for recovery.
 */
async function queryAllEvents(
  nostr: {
    req(
      filters: NostrFilter[],
      opts?: { signal?: AbortSignal },
    ): AsyncIterable<
      ['EVENT', string, NostrEvent] | ['EOSE', string] | ['CLOSED', string, string]
    >;
  },
  filters: NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = [];
  const seen = new Set<string>();

  for await (const msg of nostr.req(filters, { signal })) {
    if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
    if (msg[0] === 'EVENT') {
      const event = msg[2];
      if (!seen.has(event.id)) {
        seen.add(event.id);
        events.push(event);
      }
    }
  }

  return events;
}

/** Format a unix timestamp into a human-readable date string. */
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-bold">Restore previous version</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and restore older versions of this event.
          </p>
        </DialogHeader>

        <ScrollArea className="h-[420px]">
          <div className="p-4 space-y-3">
            {/* Mounting key forces a fresh refetch each time the dialog reopens
                so a user who rapidly edits, then reopens, sees the latest history. */}
            {open && <RecoveryContent key={event.id} event={event} onClose={close} />}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
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
      const events = await queryAllEvents(
        nostr,
        [filter],
        AbortSignal.timeout(10_000),
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    staleTime: 30_000,
  });

  if (history.isLoading) {
    return <SnapshotSkeleton />;
  }

  const events = history.data ?? [];

  if (events.length === 0) {
    return <EmptyState />;
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
        title: 'Event restored',
        description: `Successfully restored from ${formatDate(snapshot.created_at)}.`,
      });

      queryClient.invalidateQueries({ queryKey });
      onClose();
    } catch (error) {
      console.error('Failed to restore event:', error);
      toast({
        title: 'Restore failed',
        description: 'Could not republish the event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <>
      {events.map((snapshot) => {
        const isCurrent = snapshot.id === currentId;
        const isRestoring = restoringId === snapshot.id;

        return (
          <div
            key={snapshot.id}
            className={cn(
              'rounded-xl border p-3 space-y-3 transition-colors',
              isCurrent && 'border-primary/40 bg-primary/[0.03]',
            )}
          >
            <EmbeddedPost event={snapshot} disableHoverCards />

            <div className="flex items-center justify-between gap-3 px-1">
              <span className="text-xs text-muted-foreground">
                {formatDate(snapshot.created_at)}
              </span>

              {isCurrent ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Check className="size-3.5" />
                  Current
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRestore(snapshot)}
                  disabled={restoringId !== null}
                  className="gap-1.5"
                >
                  {isRestoring ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Restore
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-muted-foreground">
        No previous versions found. Your relays may not store historical events.
      </p>
    </div>
  );
}

function SnapshotSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}
