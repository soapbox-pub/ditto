import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLocalEventCount } from '@/hooks/useLocalEventCount';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { getEffectiveRelays } from '@/lib/appRelays';
import {
  clearPullState,
  exportFilename,
  getRelaySyncState,
  toJsonl,
  updateRelaySyncState,
  type RelayProgress,
} from '@/lib/dataTransfer';
import { downloadTextFile } from '@/lib/downloadFile';
import { readLocalEvents } from '@/lib/localEvents';
import { countRelayEvents, describeError, pullRelayEvents } from '@/lib/relayTransfer';

export type ExportStatus = 'idle' | 'running' | 'done' | 'error';

export interface ExportState {
  status: ExportStatus;
  /** One entry per relay, in effective-relay order. */
  relays: RelayProgress[];
  /** Events written to the local store across all relays this run. */
  fetched: number;
  /** Fatal error, when `status` is `'error'`. */
  error?: string;
}

const INITIAL: ExportState = { status: 'idle', relays: [], fetched: 0 };

/**
 * Pull the logged-in user's events off every relay into the local store, then
 * offer the store's contents as a JSONL download.
 *
 * Incremental by default: each relay remembers the newest `created_at` it has
 * already handed over, and subsequent runs ask only for events `since` that
 * point. `start({ full: true })` discards those watermarks and re-walks all
 * history, which is what you want after adding a relay that holds older events.
 */
export function useAccountExport() {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  const { count: localCount, refresh: refreshLocalCount } = useLocalEventCount();

  const [state, setState] = useState<ExportState>(INITIAL);
  const [isDownloading, setIsDownloading] = useState(false);

  const abortRef = useRef<AbortController | undefined>(undefined);

  // Every relay is worth pulling from, including write-only ones: those are
  // precisely where the user's own events were published.
  const relayUrls = useMemo(
    () => getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays).relays.map((r) => r.url),
    [config.relayMetadata, config.useAppRelays, config.useUserRelays],
  );

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const patch = useCallback((url: string, update: (prev: RelayProgress) => RelayProgress) => {
    setState((prev) => ({
      ...prev,
      relays: prev.relays.map((relay) => (relay.url === url ? update(relay) : relay)),
    }));
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(
    async ({ full = false }: { full?: boolean } = {}) => {
      if (!user) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      if (full) clearPullState(user.pubkey);

      const pubkey = user.pubkey;

      setState({
        status: 'running',
        fetched: 0,
        relays: relayUrls.map((url) => ({ url, phase: 'pending', processed: 0, skipped: 0 })),
      });

      const pullOne = async (url: string) => {
        const saved = getRelaySyncState(pubkey, url);
        const since = full ? undefined : saved.pulledUntil;
        const filter = since === undefined ? { authors: [pubkey] } : { authors: [pubkey], since };

        try {
          const relay = nostr.relay(url);

          patch(url, (prev) => ({ ...prev, phase: 'counting' }));
          const total = await countRelayEvents(relay, filter, signal);
          patch(url, (prev) => ({ ...prev, phase: 'active', total }));

          let newest = saved.pulledUntil ?? 0;

          for await (const page of pullRelayEvents(relay, filter, signal)) {
            await Promise.all(page.map((event) => store.event(event, { signal })));

            for (const event of page) {
              if (event.created_at > newest) newest = event.created_at;
            }

            patch(url, (prev) => ({ ...prev, processed: prev.processed + page.length }));
            setState((prev) => ({ ...prev, fetched: prev.fetched + page.length }));
          }

          // Only advance the watermark on a complete walk. Pages arrive newest
          // first, so a cancelled pull has the *newest* events and is missing
          // older ones — saving `newest` here would make every future
          // incremental pull skip straight past the gap.
          if (signal.aborted) {
            patch(url, (prev) => ({ ...prev, phase: 'error', error: 'Cancelled' }));
            return;
          }

          updateRelaySyncState(pubkey, url, (prev) => ({
            ...prev,
            pulledUntil: newest || prev.pulledUntil,
            lastPullAt: Math.floor(Date.now() / 1000),
          }));

          patch(url, (prev) => ({ ...prev, phase: 'done' }));
        } catch (error) {
          if (signal.aborted) {
            patch(url, (prev) => ({ ...prev, phase: 'error', error: 'Cancelled' }));
            return;
          }
          patch(url, (prev) => ({ ...prev, phase: 'error', error: describeError(error) }));
        }
      };

      await Promise.all(relayUrls.map(pullOne));

      setState((prev) => ({ ...prev, status: signal.aborted ? 'idle' : 'done' }));
      await refreshLocalCount();
    },
    [nostr, patch, refreshLocalCount, relayUrls, store, user],
  );

  const download = useCallback(async () => {
    if (!user) return;

    setIsDownloading(true);
    try {
      const events = await readLocalEvents(store, user.pubkey);
      await downloadTextFile(exportFilename(nip19.npubEncode(user.pubkey)), toJsonl(events));
      return events.length;
    } finally {
      setIsDownloading(false);
    }
  }, [store, user]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL);
  }, []);

  return { state, localCount, refreshLocalCount, start, cancel, reset, download, isDownloading };
}
