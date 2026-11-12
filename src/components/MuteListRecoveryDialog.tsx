import { useState } from 'react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';

import {
  VersionHistoryBody,
  VersionHistoryDialog,
  VersionList,
  VersionListEmpty,
  VersionListSkeleton,
  VersionRow,
} from '@/components/VersionHistory';
import { collapseVersions, formatVersionDate, queryAllVersions } from '@/lib/versionHistory';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { setCachedMuteItems, parseMuteTags, type MuteListItem } from '@/hooks/useMuteList';
import { ShieldOff, UserX, Hash, MessageSquareOff, AlertTriangle, Type } from 'lucide-react';

interface MuteListRecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

// ─── Mute Snapshot Summary ────────────────────────────────────────────

function MuteSummaryRow({ summary }: { summary: MuteSummary }) {
  const intl = useIntl();
  const counts = [
    { key: 'pubkeys', icon: UserX, count: summary.pubkeys },
    { key: 'hashtags', icon: Hash, count: summary.hashtags },
    { key: 'words', icon: Type, count: summary.words },
    { key: 'threads', icon: MessageSquareOff, count: summary.threads },
  ].filter(({ count }) => count > 0);

  return (
    <>
      <p className="text-sm font-semibold">
        <FormattedMessage id="muteRecovery.mutedItems" defaultMessage={"{count, plural, one {{formatted} muted item} other {{formatted} muted items}}"} values={{ count: summary.total, formatted: intl.formatNumber(summary.total) }} />
      </p>

      {counts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {counts.map(({ key, icon: Icon, count }) => (
            <span key={key} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              <Icon className="size-3" />
              <FormattedNumber value={count} />
            </span>
          ))}
        </div>
      )}

      {summary.decryptionFailed && (
        <p className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3" />
          <FormattedMessage id="muteRecovery.decryptionFailed" defaultMessage={"Could not decrypt private items"} />
        </p>
      )}
    </>
  );
}

// ─── Mute History Content ─────────────────────────────────────────────

function MuteHistoryContent({ onClose }: { onClose: () => void }) {
  const intl = useIntl();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
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
      return queryAllVersions(nostr, [{ kinds: [10000], authors: [pubkey] }], AbortSignal.timeout(10000));
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
  // Private items are re-encrypted on every publish, so compare what they decrypt to.
  // The public half is keyed too: moving a mute between public and private is a change.
  // A snapshot that didn't fully decrypt can't be compared and keeps its own row.
  const versions = collapseVersions(muteEvents, (event) => {
    const summary = summaries?.get(event.id);
    if (!summary || summary.decryptionFailed) return undefined;
    const itemKey = (items: MuteListItem[]) => items.map((item) => `${item.type}:${item.value}`).sort().join('\n');
    return `${itemKey(parseMuteTags(event.tags))}\0${itemKey(summary.items)}`;
  });

  const handleRestore = async (event: NostrEvent) => {
    setRestoringId(event.id);
    try {
      // Re-publish the old event's content and tags with the current timestamp.
      // The content is already encrypted, so we just re-publish as-is.
      const restored = await publishEvent({
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      // Update the local mute cache with the restored items, vouching for the
      // new event only if the snapshot's private half could be read.
      const summary = summaries?.get(event.id);
      if (summary && user) {
        setCachedMuteItems(config.appId, user.pubkey, summary.items, summary.decryptionFailed ? undefined : restored.id);
      }

      toast({
        title: intl.formatMessage({ id: 'muteRecovery.restored', defaultMessage: "Mute list restored" }),
        description: intl.formatMessage({ id: 'muteRecovery.restoredDescription', defaultMessage: "Successfully restored from {date}." }, { date: formatVersionDate(event.created_at, intl) }),
      });

      queryClient.invalidateQueries({ queryKey: ['mute-recovery', 'kind10000', pubkey] });
      queryClient.invalidateQueries({ queryKey: ['muteList', pubkey] });
      queryClient.invalidateQueries({ queryKey: ['muteItems'] });

      onClose();
    } catch (error) {
      console.error('Failed to restore mute list:', error);
      toast({
        title: intl.formatMessage({ id: 'muteRecovery.restoreFailed', defaultMessage: "Restore failed" }),
        description: intl.formatMessage({ id: 'muteRecovery.restoreFailedDescription', defaultMessage: "Could not republish the mute list. Please try again." }),
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  if (muteHistory.isLoading || (muteHistory.data && muteHistory.data.length > 0 && parsedSnapshots.isLoading)) {
    return <VersionListSkeleton />;
  }

  if (muteEvents.length === 0) {
    return (
      <VersionListEmpty>
        <FormattedMessage id="muteRecovery.empty" defaultMessage={"No mute list history found. Your relay may not store historical events."} />
      </VersionListEmpty>
    );
  }

  return (
    <VersionList>
      {versions.map(({ event, copies }) => {
        const summary = summaries?.get(event.id);
        if (!summary) return null;

        return (
          <VersionRow
            key={event.id}
            event={event}
            isCurrent={event.id === currentMuteId}
            copies={copies}
            isRestoring={restoringId === event.id}
            disabled={restoringId !== null}
            onRestore={() => handleRestore(event)}
            leading={
              <div className="flex size-11 shrink-0 items-center justify-center self-start rounded-full bg-primary/10">
                <ShieldOff className="size-5 text-primary" />
              </div>
            }
          >
            <MuteSummaryRow summary={summary} />
          </VersionRow>
        );
      })}
    </VersionList>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────

export function MuteListRecoveryDialog({ open, onOpenChange }: MuteListRecoveryDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <VersionHistoryDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<FormattedMessage id="muteRecovery.title" defaultMessage={"Mute List Recovery"} />}
      description={<FormattedMessage id="muteRecovery.description" defaultMessage={"Browse and restore previous versions of your mute list."} />}
    >
      <VersionHistoryBody>
        <MuteHistoryContent onClose={close} />
      </VersionHistoryBody>
    </VersionHistoryDialog>
  );
}
