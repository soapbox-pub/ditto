import { useCallback, useEffect, useRef, useState } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { useRelayPush } from '@/hooks/useRelayPush';
import { clearPushState, parseJsonl, type ParsedImport } from '@/lib/dataTransfer';
import { describeError } from '@/lib/relayTransfer';

import type { NostrEvent } from '@nostrify/nostrify';

/** Events written to the local store per batch. */
const STORE_CHUNK = 200;

export type ImportStatus =
  | 'idle'
  /** Reading and validating the chosen file. */
  | 'parsing'
  /** File understood, waiting for the user to confirm. */
  | 'ready'
  /** Asking the signer to sign unsigned records. */
  | 'signing'
  /** Writing to the local store. */
  | 'storing'
  /** Publishing to relays. */
  | 'pushing'
  | 'done'
  | 'error';

export interface ImportState {
  status: ImportStatus;
  /** Name of the chosen file, for display. */
  filename?: string;
  /** Result of parsing the file, available from `'ready'` onwards. */
  parsed?: ParsedImport;
  /** Unsigned records signed so far. */
  signed: number;
  /** Events written to the local store so far. */
  stored: number;
  /** Total events that will be published (already-signed plus newly signed). */
  publishable: number;
  /** Fatal error, when `status` is `'error'`. */
  error?: string;
}

const INITIAL: ImportState = { status: 'idle', signed: 0, stored: 0, publishable: 0 };

/**
 * Import a JSONL event dump into the local store and publish it to relays.
 *
 * Lines without a `sig` are treated as templates and signed with the logged-in
 * account, which makes hand-authored JSONL a usable input format. Lines already
 * signed by somebody else are never published — they surface as `'foreign'`
 * issues on {@link ImportState.parsed} instead, because republishing them would
 * either be rejected or misattribute authorship.
 *
 * Pushing is delegated to {@link useRelayPush}, so it is incremental in the same
 * way and shares the per-relay record of accepted ids.
 */
export function useAccountImport() {
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();
  const { relays, push, reset: resetRelays } = useRelayPush();

  const [state, setState] = useState<ImportState>(INITIAL);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    resetRelays();
    setState(INITIAL);
  }, [resetRelays]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const selectFile = useCallback(
    async (file: File) => {
      if (!user) return;

      resetRelays();
      setState({ ...INITIAL, status: 'parsing', filename: file.name });

      try {
        const text = await file.text();
        const parsed = parseJsonl(text, user.pubkey);
        setState({
          ...INITIAL,
          status: 'ready',
          filename: file.name,
          parsed,
          publishable: parsed.signed.length + parsed.unsigned.length,
        });
      } catch (error) {
        setState({ ...INITIAL, status: 'error', filename: file.name, error: describeError(error) });
      }
    },
    [resetRelays, user],
  );

  const start = useCallback(
    async ({ full = false }: { full?: boolean } = {}) => {
      const parsed = state.parsed;
      if (!user || !parsed) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      const pubkey = user.pubkey;
      if (full) clearPushState(pubkey);

      // --- Sign ----------------------------------------------------------
      // Sequential on purpose: NIP-07 extensions and NIP-46 bunkers serialize
      // requests anyway, and firing them in parallel produces a pile of
      // simultaneous approval prompts.
      const events: NostrEvent[] = [...parsed.signed];

      if (parsed.unsigned.length) {
        setState((prev) => ({ ...prev, status: 'signing', signed: 0 }));

        for (const record of parsed.unsigned) {
          if (signal.aborted) {
            setState((prev) => ({ ...prev, status: 'idle' }));
            return;
          }

          try {
            const event = await user.signer.signEvent({
              kind: record.kind,
              content: record.content,
              tags: record.tags,
              created_at: record.created_at,
            });

            if (event.pubkey !== pubkey) {
              throw new Error('Signer returned a different account than the one selected.');
            }

            events.push(event);
            setState((prev) => ({ ...prev, signed: prev.signed + 1 }));
          } catch (error) {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: `Signing failed on line ${record.line}: ${describeError(error)}`,
            }));
            return;
          }
        }
      }

      if (!events.length) {
        setState((prev) => ({ ...prev, status: 'done', publishable: 0 }));
        return;
      }

      // --- Store ---------------------------------------------------------
      setState((prev) => ({ ...prev, status: 'storing', stored: 0, publishable: events.length }));

      try {
        for (let i = 0; i < events.length; i += STORE_CHUNK) {
          signal.throwIfAborted();
          const chunk = events.slice(i, i + STORE_CHUNK);
          await Promise.all(chunk.map((event) => store.event(event, { signal })));
          setState((prev) => ({ ...prev, stored: prev.stored + chunk.length }));
        }
      } catch (error) {
        if (signal.aborted) {
          setState((prev) => ({ ...prev, status: 'idle' }));
          return;
        }
        setState((prev) => ({ ...prev, status: 'error', error: describeError(error) }));
        return;
      }

      // --- Push ----------------------------------------------------------
      setState((prev) => ({ ...prev, status: 'pushing' }));
      await push(pubkey, events, { full, signal });
      setState((prev) => ({ ...prev, status: signal.aborted ? 'idle' : 'done' }));
    },
    [push, state.parsed, store, user],
  );

  return { state, relays, selectFile, start, cancel, reset };
}
