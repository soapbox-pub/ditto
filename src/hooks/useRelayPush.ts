import { useNostr } from '@nostrify/react';
import { useCallback, useMemo, useState } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { getEffectiveRelays } from '@/lib/appRelays';
import { getRelaySyncState, markPushed, pushedLookup, type RelayProgress } from '@/lib/dataTransfer';
import { describeError, pushRelayEvents } from '@/lib/relayTransfer';

import type { NostrEvent } from '@nostrify/nostrify';

/** Accepted ids buffered before flushing the push record to localStorage. */
const MARK_FLUSH_EVERY = 200;

/**
 * Publish a batch of events to every write relay, with per-relay progress.
 *
 * Shared by the two things that send events outward: importing a `.jsonl` file
 * and republishing the local store. Each relay remembers which event ids it has
 * already accepted, so a repeated run only sends what is missing; `full` skips
 * that record and re-sends everything.
 *
 * Relays are pushed to in parallel and a failing relay is isolated — its row
 * shows the error while the others carry on.
 */
export function useRelayPush() {
  const { nostr } = useNostr();
  const { config } = useAppContext();

  const [relays, setRelays] = useState<RelayProgress[]>([]);

  const writeRelayUrls = useMemo(
    () =>
      getEffectiveRelays(config.relayMetadata, config.useAppRelays, config.useUserRelays)
        .relays.filter((relay) => relay.write)
        .map((relay) => relay.url),
    [config.relayMetadata, config.useAppRelays, config.useUserRelays],
  );

  const reset = useCallback(() => setRelays([]), []);

  const patch = useCallback((url: string, update: (prev: RelayProgress) => RelayProgress) => {
    setRelays((prev) => prev.map((relay) => (relay.url === url ? update(relay) : relay)));
  }, []);

  const push = useCallback(
    async (
      pubkey: string,
      events: NostrEvent[],
      { full = false, signal }: { full?: boolean; signal: AbortSignal },
    ) => {
      setRelays(writeRelayUrls.map((url) => ({ url, phase: 'pending', processed: 0, skipped: 0 })));

      const pushOne = async (url: string) => {
        const alreadyPushed = full ? () => false : pushedLookup(getRelaySyncState(pubkey, url));
        const pending = events.filter((event) => !alreadyPushed(event.id));
        const skipped = events.length - pending.length;

        patch(url, (prev) => ({ ...prev, phase: 'active', total: pending.length, skipped }));

        if (!pending.length) {
          patch(url, (prev) => ({ ...prev, phase: 'done' }));
          return;
        }

        const buffered: string[] = [];

        try {
          await pushRelayEvents(nostr.relay(url), pending, signal, (accepted, rejected) => {
            buffered.push(...accepted);
            if (buffered.length >= MARK_FLUSH_EVERY) {
              markPushed(pubkey, url, buffered.splice(0, buffered.length));
            }
            patch(url, (prev) => ({ ...prev, processed: prev.processed + accepted.length + rejected }));
          });

          if (buffered.length) markPushed(pubkey, url, buffered);
          patch(url, (prev) => ({ ...prev, phase: 'done' }));
        } catch (error) {
          // Whatever the relay did take is still worth recording, so a retry
          // doesn't re-send it.
          if (buffered.length) markPushed(pubkey, url, buffered);

          if (signal.aborted) {
            patch(url, (prev) => ({ ...prev, phase: 'error', error: 'Cancelled' }));
            return;
          }
          patch(url, (prev) => ({ ...prev, phase: 'error', error: describeError(error) }));
        }
      };

      await Promise.all(writeRelayUrls.map(pushOne));
    },
    [nostr, patch, writeRelayUrls],
  );

  return { relays, push, reset };
}
