import { useState, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { parseBadgeDefinition, type BadgeData } from '@/lib/parseBadgeDefinition';
import { parseProfileBadges } from '@/lib/parseProfileBadges';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { BADGE_PROFILE_KIND, BADGE_PROFILE_KIND_LEGACY, BADGE_DEFINITION_KIND } from '@/lib/badgeUtils';
import { cn } from '@/lib/utils';
import { Award, Check, Loader2, RotateCcw } from 'lucide-react';

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

interface BadgeRecoveryDialogProps {
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

/** Summary of badges parsed from a snapshot. */
interface BadgeSummary {
  count: number;
  /** Parsed badge refs with their a-tag and identifier. */
  refs: { aTag: string; pubkey: string; identifier: string }[];
}

/** Parse all badge refs from a profile badges event. */
function parseBadgeSnapshot(event: NostrEvent): BadgeSummary {
  const refs = parseProfileBadges(event);
  return {
    count: refs.length,
    refs: refs.map((r) => ({ aTag: r.aTag, pubkey: r.pubkey, identifier: r.identifier })),
  };
}

// ─── Badge Snapshot Card ──────────────────────────────────────────────

function BadgeSnapshotCard({
  summary,
  event,
  isCurrent,
  onRestore,
  isRestoring,
  badgeMap,
}: {
  summary: BadgeSummary;
  event: NostrEvent;
  isCurrent: boolean;
  onRestore: () => void;
  isRestoring: boolean;
  badgeMap: Map<string, BadgeData>;
}) {
  /** Show up to 5 badge thumbnails in the preview. */
  const previewRefs = summary.refs.slice(0, 5);
  const remaining = Math.max(0, summary.count - previewRefs.length);

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
          <Award className="size-5 text-primary" />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="font-semibold text-sm">
            {summary.count.toLocaleString()} {summary.count === 1 ? 'badge' : 'badges'}
          </div>

          {/* Badge thumbnail previews */}
          {previewRefs.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {previewRefs.map((ref) => {
                const badge = badgeMap.get(ref.aTag);
                return badge ? (
                  <BadgeThumbnail key={ref.aTag} badge={badge} size={24} className="shrink-0" />
                ) : (
                  <div
                    key={ref.aTag}
                    className="size-6 rounded border border-border bg-secondary/30 flex items-center justify-center shrink-0"
                  >
                    <Award className="size-3 text-muted-foreground" />
                  </div>
                );
              })}
              {remaining > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  +{remaining}
                </span>
              )}
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
        No badge list history found. Your relay may not store historical events.
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

// ─── Badge History Content ────────────────────────────────────────────

function BadgeHistoryContent({ onClose }: { onClose: () => void }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const pubkey = user?.pubkey;

  // Fetch all historical kind 10008 and legacy 30008 events
  const badgeHistory = useQuery<NostrEvent[]>({
    queryKey: ['badge-recovery', 'history', pubkey],
    queryFn: async () => {
      if (!pubkey) return [];
      const events = await queryAllEvents(
        nostr,
        [
          { kinds: [BADGE_PROFILE_KIND], authors: [pubkey] },
          { kinds: [BADGE_PROFILE_KIND_LEGACY], authors: [pubkey], '#d': ['profile_badges'] },
        ],
        AbortSignal.timeout(10000),
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
  });

  // Parse all snapshots
  const parsedSnapshots = useMemo(() => {
    if (!badgeHistory.data) return new Map<string, BadgeSummary>();
    const results = new Map<string, BadgeSummary>();
    for (const event of badgeHistory.data) {
      results.set(event.id, parseBadgeSnapshot(event));
    }
    return results;
  }, [badgeHistory.data]);

  // Collect all unique badge definition refs across all snapshots for thumbnail fetching
  const allBadgeRefs = useMemo(() => {
    const seen = new Set<string>();
    const refs: { pubkey: string; identifier: string; aTag: string }[] = [];
    for (const summary of parsedSnapshots.values()) {
      for (const ref of summary.refs) {
        if (!seen.has(ref.aTag)) {
          seen.add(ref.aTag);
          refs.push(ref);
        }
      }
    }
    return refs;
  }, [parsedSnapshots]);

  // Fetch badge definitions for thumbnails
  const badgeDefsQuery = useQuery({
    queryKey: ['badge-recovery', 'definitions', allBadgeRefs.map((r) => r.aTag).join(',')],
    queryFn: async ({ signal }) => {
      if (allBadgeRefs.length === 0) return [];
      const filters = allBadgeRefs.map((ref) => ({
        kinds: [BADGE_DEFINITION_KIND as number],
        authors: [ref.pubkey],
        '#d': [ref.identifier],
        limit: 1,
      }));
      return nostr.query(filters, { signal });
    },
    enabled: allBadgeRefs.length > 0,
    staleTime: 5 * 60_000,
  });

  // Build badge data map for thumbnails
  const badgeMap = useMemo(() => {
    const map = new Map<string, BadgeData>();
    if (!badgeDefsQuery.data) return map;
    for (const event of badgeDefsQuery.data) {
      const parsed = parseBadgeDefinition(event);
      if (!parsed) continue;
      const aTag = `${BADGE_DEFINITION_KIND}:${event.pubkey}:${parsed.identifier}`;
      map.set(aTag, parsed);
    }
    return map;
  }, [badgeDefsQuery.data]);

  const badgeEvents = badgeHistory.data ?? [];
  const currentBadgeId = badgeEvents[0]?.id;

  const handleRestore = async (event: NostrEvent) => {
    setRestoringId(event.id);
    try {
      // Re-publish as kind 10008 (always write to the new kind),
      // stripping any legacy `d` tag from kind 30008 events.
      const tags = event.tags.filter(([n, v]) => !(n === 'd' && v === 'profile_badges'));

      await publishEvent({
        kind: BADGE_PROFILE_KIND,
        content: event.content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      toast({
        title: 'Badge list restored',
        description: `Successfully restored from ${formatDate(event.created_at)}.`,
      });

      queryClient.invalidateQueries({ queryKey: ['badge-recovery', 'history', pubkey] });
      queryClient.invalidateQueries({ queryKey: ['profile-badges', pubkey] });

      onClose();
    } catch (error) {
      console.error('Failed to restore badge list:', error);
      toast({
        title: 'Restore failed',
        description: 'Could not republish the badge list. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  if (badgeHistory.isLoading) {
    return <SnapshotSkeleton />;
  }

  if (badgeEvents.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {badgeEvents.map((event) => {
        const summary = parsedSnapshots.get(event.id);
        if (!summary) return null;

        return (
          <BadgeSnapshotCard
            key={event.id}
            event={event}
            summary={summary}
            isCurrent={event.id === currentBadgeId}
            onRestore={() => handleRestore(event)}
            isRestoring={restoringId === event.id}
            badgeMap={badgeMap}
          />
        );
      })}
    </>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────

export function BadgeRecoveryDialog({ open, onOpenChange }: BadgeRecoveryDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-bold">Badge List Recovery</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and restore previous versions of your accepted badges.
          </p>
        </DialogHeader>

        <ScrollArea className="h-[420px]">
          <div className="p-4 space-y-3">
            <BadgeHistoryContent onClose={close} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
