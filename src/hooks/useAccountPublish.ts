import { useCallback, useEffect, useRef, useState } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { useRelayPush } from '@/hooks/useRelayPush';
import { clearPushState } from '@/lib/dataTransfer';
import { readLocalEvents } from '@/lib/localEvents';
import { describeError } from '@/lib/relayTransfer';

export type PublishStatus =
  | 'idle'
  /** Reading the local store. */
  | 'reading'
  /** Publishing to relays. */
  | 'pushing'
  | 'done'
  | 'error';

export interface PublishState {
  status: PublishStatus;
  /** Events read out of the local store for this run. */
  total: number;
  /** Fatal error, when `status` is `'error'`. */
  error?: string;
}

const INITIAL: PublishState = { status: 'idle', total: 0 };

/**
 * Publish everything the local store holds for the logged-in user back to their
 * relays — the same push as an import, minus the file.
 *
 * The use for this is filling in a relay rather than moving data between
 * devices: add a relay, or find one that lost its database, and send it the
 * history the other relays already have. Pair it with an export run, which is
 * what puts that history in the local store in the first place.
 */
export function useAccountPublish() {
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const { relays, push, reset: resetRelays } = useRelayPush();

  const [state, setState] = useState<PublishState>(INITIAL);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    resetRelays();
    setState(INITIAL);
  }, [resetRelays]);

  const start = useCallback(
    async ({ full = false }: { full?: boolean } = {}) => {
      if (!user) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      const pubkey = user.pubkey;
      if (full) clearPushState(pubkey);

      resetRelays();
      setState({ status: 'reading', total: 0 });

      let events;
      try {
        events = await readLocalEvents(store, pubkey);
      } catch (error) {
        setState({ status: 'error', total: 0, error: describeError(error) });
        return;
      }

      if (signal.aborted) {
        setState(INITIAL);
        return;
      }

      if (!events.length) {
        setState({ status: 'done', total: 0 });
        return;
      }

      setState({ status: 'pushing', total: events.length });
      await push(pubkey, events, { full, signal });
      setState((prev) => ({ ...prev, status: signal.aborted ? 'idle' : 'done' }));
    },
    [push, resetRelays, store, user],
  );

  return { state, relays, start, cancel, reset };
}
