import { useState, useMemo } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  VersionHistoryBody,
  VersionHistoryDialog,
  VersionList,
  VersionListEmpty,
  VersionListSkeleton,
  VersionRow,
} from '@/components/VersionHistory';
import { collapseVersions, formatVersionDate, queryAllVersions, versionKey } from '@/lib/versionHistory';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { parseBadgeDefinition, type BadgeData } from '@/lib/parseBadgeDefinition';
import { parseProfileBadges } from '@/lib/parseProfileBadges';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { BADGE_PROFILE_KIND, BADGE_PROFILE_KIND_LEGACY, BADGE_DEFINITION_KIND } from '@/lib/badgeUtils';
import { Award } from 'lucide-react';

interface BadgeRecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

// ─── Badge Snapshot Summary ───────────────────────────────────────────

function BadgeSummaryRow({ summary, badgeMap }: { summary: BadgeSummary; badgeMap: Map<string, BadgeData> }) {
  /** Show up to 5 badge thumbnails in the preview. */
  const previewRefs = summary.refs.slice(0, 5);
  const remaining = Math.max(0, summary.count - previewRefs.length);

  return (
    <>
      <p className="text-sm font-semibold">
        <FormattedMessage
          id="badgeRecovery.badgeCount"
          defaultMessage="{count, plural, one {# badge} other {# badges}}"
          values={{ count: summary.count }}
        />
      </p>

      {previewRefs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {previewRefs.map((ref) => {
            const badge = badgeMap.get(ref.aTag);
            return badge ? (
              <BadgeThumbnail key={ref.aTag} badge={badge} size={24} className="shrink-0" />
            ) : (
              <div key={ref.aTag} className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Award className="size-3 text-muted-foreground" />
              </div>
            );
          })}
          {remaining > 0 && (
            <span className="text-[11px] text-muted-foreground">+{remaining}</span>
          )}
        </div>
      )}
    </>
  );
}

// ─── Badge History Content ────────────────────────────────────────────

function BadgeHistoryContent({ onClose }: { onClose: () => void }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const pubkey = user?.pubkey;

  // Fetch all historical kind 10008 and legacy 30008 events
  const badgeHistory = useQuery<NostrEvent[]>({
    queryKey: ['badge-recovery', 'history', pubkey],
    queryFn: async () => {
      if (!pubkey) return [];
      return queryAllVersions(
        nostr,
        [
          { kinds: [BADGE_PROFILE_KIND], authors: [pubkey] },
          { kinds: [BADGE_PROFILE_KIND_LEGACY], authors: [pubkey], '#d': ['profile_badges'] },
        ],
        AbortSignal.timeout(10000),
      );
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
  // Badge order is display order, so it counts. Legacy kind 30008 copies match
  // their kind 10008 restores once the `d` tag is set aside.
  const versions = collapseVersions(badgeEvents, (event) => versionKey(event, { ignoreTags: ['d'] }));

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
        title: intl.formatMessage({ id: 'badgeRecovery.restored', defaultMessage: 'Badge list restored' }),
        description: intl.formatMessage(
          { id: 'badgeRecovery.restoredDescription', defaultMessage: 'Successfully restored from {date}.' },
          { date: formatVersionDate(event.created_at, intl) },
        ),
      });

      queryClient.invalidateQueries({ queryKey: ['badge-recovery', 'history', pubkey] });
      queryClient.invalidateQueries({ queryKey: ['profile-badges', pubkey] });

      onClose();
    } catch (error) {
      console.error('Failed to restore badge list:', error);
      toast({
        title: intl.formatMessage({ id: 'badgeRecovery.restoreFailed', defaultMessage: 'Restore failed' }),
        description: intl.formatMessage({
          id: 'badgeRecovery.restoreFailedDescription',
          defaultMessage: 'Could not republish the badge list. Please try again.',
        }),
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  if (badgeHistory.isLoading) {
    return <VersionListSkeleton />;
  }

  if (badgeEvents.length === 0) {
    return (
      <VersionListEmpty>
        <FormattedMessage
          id="badgeRecovery.empty"
          defaultMessage="No badge list history found. Your relay may not store historical events."
        />
      </VersionListEmpty>
    );
  }

  return (
    <VersionList>
      {versions.map(({ event, copies }) => {
        const summary = parsedSnapshots.get(event.id);
        if (!summary) return null;

        return (
          <VersionRow
            key={event.id}
            event={event}
            isCurrent={event.id === currentBadgeId}
            copies={copies}
            isRestoring={restoringId === event.id}
            disabled={restoringId !== null}
            onRestore={() => handleRestore(event)}
            leading={
              <div className="flex size-11 shrink-0 items-center justify-center self-start rounded-full bg-primary/10">
                <Award className="size-5 text-primary" />
              </div>
            }
          >
            <BadgeSummaryRow summary={summary} badgeMap={badgeMap} />
          </VersionRow>
        );
      })}
    </VersionList>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────

export function BadgeRecoveryDialog({ open, onOpenChange }: BadgeRecoveryDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <VersionHistoryDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<FormattedMessage id="badgeRecovery.title" defaultMessage="Badge List Recovery" />}
      description={
        <FormattedMessage
          id="badgeRecovery.description"
          defaultMessage="Browse and restore previous versions of your accepted badges."
        />
      }
    >
      <VersionHistoryBody>
        <BadgeHistoryContent onClose={close} />
      </VersionHistoryBody>
    </VersionHistoryDialog>
  );
}
