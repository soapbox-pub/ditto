import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getPublishRelays } from '@/lib/appRelays';
import { isNostrId } from '@/lib/nostrId';
import { fetchAuthorWriteRelays } from '@/lib/outbox';
import { isRelayBlocked, relayMatchKey } from '@/lib/relayPolicy';

/** Where an event stands on one relay. */
export type RelayPresence = 'checking' | 'found' | 'missing' | 'unreachable' | 'sending' | 'sent' | 'rejected';

export interface EventRelayRow {
  url: string;
  /** One of the viewer's write relays. */
  yours: boolean;
  /** One of the event author's write relays. */
  author: boolean;
  status: RelayPresence;
  /** The relay's reason, when it rejected the event. */
  message?: string;
}

/** What happened when an event was broadcast. */
export interface BroadcastResult {
  /** Relays that accepted the event. */
  sent: string[];
  /** Relays that rejected it (with the relay's reason) or didn't answer (no reason). */
  failed: { url: string; reason?: string }[];
  /** Published through the pool's usual relays, which don't report one by one. */
  pool: boolean;
}

/** The reasons relays gave when a publish through the pool failed everywhere. */
function poolFailureReason(error: unknown): string | undefined {
  const errors = error instanceof AggregateError ? error.errors : [error];
  const reasons = errors
    .map((e) => (e instanceof Error && e.name !== 'TimeoutError' && e.name !== 'AbortError' ? e.message : ''))
    .filter(Boolean);
  return reasons.length ? [...new Set(reasons)].join('; ') : undefined;
}

/** How long to wait for a relay to answer a lookup or a publish. */
const RELAY_TIMEOUT_MS = 6000;

/**
 * Check which of the viewer's and the event author's write relays hold an
 * event, and broadcast it to the ones that don't. Runs only while `enabled`,
 * and only for signed events.
 */
export function useEventRelayPresence(event: NostrEvent, enabled: boolean) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const [rows, setRows] = useState<EventRelayRow[]>();
  const [broadcasting, setBroadcasting] = useState(false);

  const yourRelays = useMemo(
    () => (user ? getPublishRelays(config.relayMetadata, config.useAppRelays) : []),
    [user, config.relayMetadata, config.useAppRelays],
  );

  const signed = Boolean(event.id && event.sig);

  const setStatus = useCallback((url: string, status: RelayPresence, message?: string) => {
    setRows((prev) => prev?.map((row) => (row.url === url ? { ...row, status, message } : row)));
  }, []);

  useEffect(() => {
    if (!enabled || !signed) return;
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      const authorRelays = isNostrId(event.pubkey) ? await fetchAuthorWriteRelays(nostr, event.pubkey, signal) : [];
      if (signal.aborted) return;

      const byKey = new Map<string, EventRelayRow>();
      const add = (url: string, role: 'yours' | 'author') => {
        const key = relayMatchKey(url);
        if (!key || isRelayBlocked(url)) return;
        const row = byKey.get(key) ?? { url, yours: false, author: false, status: 'checking' as const };
        row[role] = true;
        byKey.set(key, row);
      };
      for (const url of yourRelays) add(url, 'yours');
      for (const url of authorRelays) add(url, 'author');

      const list = [...byKey.values()];
      setRows(list);

      await Promise.all(list.map(async ({ url }) => {
        try {
          const found = await nostr.relay(url).query(
            [{ ids: [event.id], limit: 1 }],
            { signal: AbortSignal.any([signal, AbortSignal.timeout(RELAY_TIMEOUT_MS)]) },
          );
          if (!signal.aborted) setStatus(url, found.length ? 'found' : 'missing');
        } catch {
          if (!signal.aborted) setStatus(url, 'unreachable');
        }
      }));
    })();

    return () => controller.abort();
  }, [enabled, signed, event.id, event.pubkey, yourRelays, nostr, setStatus]);

  /**
   * Publish the event to every listed relay that doesn't have it, or to every
   * listed relay when none is known to be missing it. With no relays listed
   * (logged out, author without a relay list), publish through the pool as
   * usual. Reports each relay's outcome.
   */
  const broadcast = useCallback(async (): Promise<BroadcastResult> => {
    const all = rows ?? [];
    const missingRows = all.filter((row) => row.status === 'missing' || row.status === 'unreachable' || row.status === 'rejected');
    const targets = missingRows.length ? missingRows : all;
    setBroadcasting(true);
    try {
      if (targets.length === 0) {
        try {
          await nostr.event(event, { signal: AbortSignal.timeout(RELAY_TIMEOUT_MS) });
          return { sent: [], failed: [], pool: true };
        } catch (error) {
          return { sent: [], failed: [{ url: '', reason: poolFailureReason(error) }], pool: true };
        }
      }

      const sent: string[] = [];
      const failed: BroadcastResult['failed'] = [];
      await Promise.all(targets.map(async ({ url }) => {
        setStatus(url, 'sending');
        try {
          await nostr.relay(url).event(event, { signal: AbortSignal.timeout(RELAY_TIMEOUT_MS) });
          setStatus(url, 'sent');
          sent.push(url);
        } catch (error) {
          if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
            setStatus(url, 'unreachable');
            failed.push({ url });
          } else {
            const reason = error instanceof Error && error.message ? error.message : undefined;
            setStatus(url, 'rejected', reason);
            failed.push({ url, reason });
          }
        }
      }));
      return { sent, failed, pool: false };
    } finally {
      setBroadcasting(false);
    }
  }, [rows, nostr, event, setStatus]);

  const missing = rows?.filter((row) => row.status === 'missing' || row.status === 'unreachable' || row.status === 'rejected').length ?? 0;
  const checking = rows === undefined || rows.some((row) => row.status === 'checking');

  return { rows, missing, checking, broadcasting, broadcast };
}
