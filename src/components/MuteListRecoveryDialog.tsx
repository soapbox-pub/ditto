import { useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter, NostrSigner } from '@nostrify/nostrify';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { setCachedMuteItems, parseMuteTags, type MuteListItem } from '@/hooks/useMuteList';
import { cn } from '@/lib/utils';
import { Check, Loader2, RotateCcw, ShieldOff, UserX, Hash, MessageSquareOff, AlertTriangle } from 'lucide-react';

/**
 * Query all events matching a filter using `req()` instead of `query()`.
 * This bypasses NSet deduplication in NPool.query(), which discards older
 * versions of replaceable events. We need all historical versions for recovery.
 */
async function queryAllEvents(
  nostr: { req(filters: NostrFilter[], opts?: { signal?: AbortSignal }): AsyncIterable<['EVENT', string, NostrEvent] | ['EOSE', string] | ['CLOSED', string, string]> },
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

interface MuteListRecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

/**
 * Detect whether encrypted content uses NIP-04 (legacy) or NIP-44 encoding.
 */
function isNip04Encrypted(content: string): boolean {
  return content.includes('?iv=');
}

/**
 * Decrypt encrypted content from a kind 10000 event, handling both NIP-44 and
 * legacy NIP-04 formats for backward compatibility per NIP-51.
 */
async function decryptContent(
  content: string,
  signer: NostrSigner,
  pubkey: string,
): Promise<string | null> {
  if (!content) return null;

  try {
    if (isNip04Encrypted(content)) {
      if (signer.nip04) {
        return await signer.nip04.decrypt(pubkey, content);
      }
      return null;
    } else {
      if (signer.nip44) {
        return await signer.nip44.decrypt(pubkey, content);
      }
      return null;
    }
  } catch {
    return null;
  }
}

/** Summary of mute items parsed from a snapshot. */
interface MuteSummary {
  items: MuteListItem[];
  pubkeys: number;
  hashtags: number;
  words: number;
  threads: number;
  total: number;
  decryptionFailed: boolean;
}

/**
 * Parse all mute items from a kind 10000 event, combining public tags
 * and encrypted (private) content.
 */
async function parseMuteSnapshot(
  event: NostrEvent,
  signer: NostrSigner,
  pubkey: string,
): Promise<MuteSummary> {
  const publicItems = parseMuteTags(event.tags);

  let privateItems: MuteListItem[] = [];
  let decryptionFailed = false;

  if (event.content) {
    const decrypted = await decryptContent(event.content, signer, pubkey);
    if (decrypted) {
      try {
        const tags = JSON.parse(decrypted) as string[][];
        privateItems = parseMuteTags(tags);
      } catch {
        decryptionFailed = true;
      }
    } else {
      decryptionFailed = true;
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const combined: MuteListItem[] = [];
  for (const item of [...publicItems, ...privateItems]) {
    const key = `${item.type}:${item.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(item);
    }
  }

  return {
    items: combined,
    pubkeys: combined.filter((i) => i.type === 'pubkey').length,
    hashtags: combined.filter((i) => i.type === 'hashtag').length,
    words: combined.filter((i) => i.type === 'word').length,
    threads: combined.filter((i) => i.type === 'thread').length,
    total: combined.length,
    decryptionFailed,
  };
}

// ─── Mute Snapshot Card ───────────────────────────────────────────────

function MuteSnapshotCard({
  summary,
  event,
  isCurrent,
  onRestore,
  isRestoring,
}: {
  summary: MuteSummary;
  event: NostrEvent;
  isCurrent: boolean;
  onRestore: () => void;
  isRestoring: boolean;
}) {
  const parts: string[] = [];
  if (summary.pubkeys > 0) parts.push(`${summary.pubkeys} ${summary.pubkeys === 1 ? 'user' : 'users'}`);
  if (summary.hashtags > 0) parts.push(`${summary.hashtags} ${summary.hashtags === 1 ? 'hashtag' : 'hashtags'}`);
  if (summary.words > 0) parts.push(`${summary.words} ${summary.words === 1 ? 'word' : 'words'}`);
  if (summary.threads > 0) parts.push(`${summary.threads} ${summary.threads === 1 ? 'thread' : 'threads'}`);

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all',
        isCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:border-primary/20 hover:bg-secondary/30',
      )}
    >
      {isCurrent && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-xs font-medium text-primary">
          <Check className="size-3.5" />
          Current
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-11 shrink-0 rounded-full bg-primary/10">
          <ShieldOff className="size-5 text-primary" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-semibold text-sm">
            {summary.total.toLocaleString()} {summary.total === 1 ? 'muted item' : 'muted items'}
          </div>

          {parts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {summary.pubkeys > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <UserX className="size-3" />
                  {summary.pubkeys}
                </span>
              )}
              {summary.hashtags > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Hash className="size-3" />
                  {summary.hashtags}
                </span>
              )}
              {summary.words > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MessageSquareOff className="size-3" />
                  {summary.words}
                </span>
              )}
              {summary.threads > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MessageSquareOff className="size-3" />
                  {summary.threads} threads
                </span>
              )}
            </div>
          )}

          {summary.decryptionFailed && (
            <div className="flex items-center gap-1 text-[11px] text-amber-500">
              <AlertTriangle className="size-3" />
              Could not decrypt private items
            </div>
          )}

          <div className="text-[11px] text-muted-foreground/70 pt-0.5">
            {formatDate(event.created_at)}
          </div>
        </div>
      </div>

      {!isCurrent && (
        <div className="mt-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs rounded-lg gap-1.5"
            onClick={onRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Restore
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-muted-foreground">
        No mute list history found. Your relay may not store historical events.
      </p>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────

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
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mute History Content ─────────────────────────────────────────────

function MuteHistoryContent({ onClose }: { onClose: () => void }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const pubkey = user?.pubkey;

  // Fetch all historical kind 10000 events
  const muteHistory = useQuery<NostrEvent[]>({
    queryKey: ['mute-recovery', 'kind10000', pubkey],
    queryFn: async () => {
      if (!pubkey) return [];
      const events = await queryAllEvents(
        nostr,
        [{ kinds: [10000], authors: [pubkey] }],
        AbortSignal.timeout(10000),
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
  });

  // Decrypt and parse all snapshots
  const parsedSnapshots = useQuery<Map<string, MuteSummary>>({
    queryKey: ['mute-recovery', 'parsed', pubkey, muteHistory.data?.map((e) => e.id).join(',')],
    queryFn: async () => {
      if (!user || !muteHistory.data) return new Map();

      const results = new Map<string, MuteSummary>();

      // Parse all snapshots in parallel
      const entries = await Promise.all(
        muteHistory.data.map(async (event) => {
          const summary = await parseMuteSnapshot(event, user.signer, user.pubkey);
          return [event.id, summary] as const;
        }),
      );

      for (const [id, summary] of entries) {
        results.set(id, summary);
      }

      return results;
    },
    enabled: !!user && !!muteHistory.data && muteHistory.data.length > 0,
  });

  const muteEvents = muteHistory.data ?? [];
  const currentMuteId = muteEvents[0]?.id;
  const summaries = parsedSnapshots.data;

  const handleRestore = async (event: NostrEvent) => {
    setRestoringId(event.id);
    try {
      // Re-publish the old event's content and tags with the current timestamp.
      // The content is already encrypted, so we just re-publish as-is.
      await publishEvent({
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      // Update the local mute cache with the restored items
      const summary = summaries?.get(event.id);
      if (summary && user) {
        setCachedMuteItems(user.pubkey, summary.items);
      }

      toast({
        title: 'Mute list restored',
        description: `Successfully restored from ${formatDate(event.created_at)}.`,
      });

      queryClient.invalidateQueries({ queryKey: ['mute-recovery', 'kind10000', pubkey] });
      queryClient.invalidateQueries({ queryKey: ['muteList', pubkey] });
      queryClient.invalidateQueries({ queryKey: ['muteItems'] });

      onClose();
    } catch (error) {
      console.error('Failed to restore mute list:', error);
      toast({
        title: 'Restore failed',
        description: 'Could not republish the mute list. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  if (muteHistory.isLoading || (muteHistory.data && muteHistory.data.length > 0 && parsedSnapshots.isLoading)) {
    return <SnapshotSkeleton />;
  }

  if (muteEvents.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {muteEvents.map((event) => {
        const summary = summaries?.get(event.id);
        if (!summary) return null;

        return (
          <MuteSnapshotCard
            key={event.id}
            event={event}
            summary={summary}
            isCurrent={event.id === currentMuteId}
            onRestore={() => handleRestore(event)}
            isRestoring={restoringId === event.id}
          />
        );
      })}
    </>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────

export function MuteListRecoveryDialog({ open, onOpenChange }: MuteListRecoveryDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-bold">Mute List Recovery</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and restore previous versions of your mute list.
          </p>
        </DialogHeader>

        <ScrollArea className="h-[420px]">
          <div className="p-4 space-y-3">
            <MuteHistoryContent onClose={close} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
