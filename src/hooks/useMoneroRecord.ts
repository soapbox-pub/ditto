/**
 * Read/write the encrypted Monero wallet record (NIP-78, kind 30078).
 *
 * This is a **separate event** from `useEncryptedSettings`, not another field
 * inside it, for three reasons:
 *
 *  - Blast radius. Settings are written constantly (every theme toggle, every
 *    feed tweak) through a read-modify-write cycle. Putting irreplaceable key
 *    material in that same blob means every one of those writes is a chance to
 *    truncate or clobber a seed.
 *  - Size. The cached wallet state pushes the record toward several KB; the
 *    settings event is fetched and decrypted on every app boot and shouldn't
 *    carry that.
 *  - Auditability. A single `d` tag holds everything secret about the Monero
 *    wallet, so "where does the seed live" has exactly one answer.
 */
import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import {
  moneroRecordDTag,
  parseMoneroRecord,
  MONERO_RECORD_VERSION,
  type MoneroWalletRecord,
  type MoneroWalletState,
} from '@/lib/monero/record';

/**
 * Query-key prefixes holding Monero wallet material for one account.
 *
 * Both queries below are `gcTime: Infinity`, and the second one holds the
 * **decrypted seed**. Nothing evicts them on its own, so an account switch or
 * a logout has to remove them explicitly — see `useMoneroBackgroundSync`.
 * Prefixes, so they match partially the way `removeQueries` does.
 */
export function moneroRecordQueryKeys(pubkey: string): unknown[][] {
  return [
    ['monero-record-event', pubkey],
    ['monero-record', pubkey],
  ];
}

/** Parameters for creating the initial record. */
export interface CreateMoneroRecordParams {
  seed: string;
  address: string;
  restoreHeight: number;
  cachePassword: string;
  hasPassphrase: boolean;
}

export function useMoneroRecord() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();

  const dTag = moneroRecordDTag(config.appId);
  const canEncrypt = !!user?.signer.nip44;

  /** The raw kind-30078 event holding the record. */
  const eventQuery = useQuery({
    queryKey: ['monero-record-event', user?.pubkey, dTag],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const events = await nostr.query(
        [{ kinds: [30078], authors: [user.pubkey], '#d': [dTag], limit: 1 }],
        { signal },
      );
      return events[0] ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
    refetchOnWindowFocus: true,
  });

  /**
   * The decrypted, validated record.
   *
   * Keyed by pubkey as well as event id. The id alone is unique per author, so
   * entries can't collide — but it collapses to `undefined` for every account
   * that has no wallet yet, and it leaves a decrypted seed sitting in the cache
   * under the previous account's id after a switch. `moneroRecordQueryKeys()`
   * is what the teardown in `useMoneroBackgroundSync` matches against.
   */
  const recordQuery = useQuery({
    queryKey: ['monero-record', user?.pubkey, eventQuery.data?.id],
    queryFn: async (): Promise<MoneroWalletRecord | null> => {
      const event = eventQuery.data;
      if (!event?.content || !user?.signer.nip44) return null;

      try {
        const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
        return parseMoneroRecord(JSON.parse(decrypted));
      } catch (error) {
        console.error('Failed to decrypt Monero wallet record:', error);
        return null;
      }
    },
    // `enabled` stays true with no event so the query resolves to `null`
    // rather than sitting in `pending` forever — "no wallet yet" is a real,
    // common state the setup flow needs to observe.
    enabled: !!user,
    staleTime: 0,
    gcTime: Infinity,
  });

  /**
   * Encrypt and publish a record.
   *
   * Always re-fetches the current event first rather than trusting the query
   * cache: this event holds key material, and writing a stale copy could drop
   * a wallet created moments ago on another device.
   */
  const publishRecord = useCallback(
    async (record: MoneroWalletRecord) => {
      if (!user) throw new Error('Not logged in');
      if (!user.signer.nip44) throw new Error('Your signer does not support NIP-44 encryption');

      const plaintext = JSON.stringify(record);
      const content = await user.signer.nip44.encrypt(user.pubkey, plaintext);

      const signed = await user.signer.signEvent({
        kind: 30078,
        content,
        tags: [
          ['d', dTag],
          ['title', `${config.appName} Monero Wallet`],
          ['client', config.appName, ...(config.client ? [config.client] : [])],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(signed, { signal: AbortSignal.timeout(10_000) });

      queryClient.setQueryData(['monero-record-event', user.pubkey, dTag], signed);
      queryClient.setQueryData(['monero-record', user.pubkey, signed.id], record);

      return { record, event: signed };
    },
    [user, nostr, dTag, config.appName, config.client, queryClient],
  );

  /** Create the initial record for a new or restored wallet. */
  const createRecord = useMutation({
    mutationFn: async (params: CreateMoneroRecordParams) => {
      if (!user) throw new Error('Not logged in');

      // Refuse to overwrite an existing wallet. Without this, a second run of
      // the setup flow — a stale tab, a double submit — would replace a seed
      // that may already control funds.
      const existing = await fetchFreshEvent(nostr, {
        kinds: [30078],
        authors: [user.pubkey],
        '#d': [dTag],
      });
      if (existing?.content) {
        throw new Error('A Monero wallet already exists for this account');
      }

      const record: MoneroWalletRecord = {
        version: MONERO_RECORD_VERSION,
        seed: params.seed,
        hasPassphrase: params.hasPassphrase,
        cachePassword: params.cachePassword,
        restoreHeight: params.restoreHeight,
        address: params.address,
        createdAt: Date.now(),
      };

      return publishRecord(record);
    },
  });

  /**
   * Update the cached state snapshot after a sync.
   *
   * Only the `state` field is touched — the seed and restore height are
   * carried over from the record we already hold, so a sync can never rewrite
   * key material.
   */
  const updateState = useMutation({
    mutationFn: async (state: MoneroWalletState) => {
      const current = recordQuery.data;
      if (!current) throw new Error('No Monero wallet record to update');
      return publishRecord({ ...current, state });
    },
  });

  /**
   * Delete the wallet record.
   *
   * Publishes an empty replacement rather than a NIP-09 deletion request:
   * relays honour replacement reliably, deletion much less so, and an empty
   * record reads as "no wallet" everywhere in this hook.
   */
  const deleteRecord = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in');

      const signed = await user.signer.signEvent({
        kind: 30078,
        content: '',
        tags: [
          ['d', dTag],
          ['client', config.appName, ...(config.client ? [config.client] : [])],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(signed, { signal: AbortSignal.timeout(10_000) });
      queryClient.setQueryData(['monero-record-event', user.pubkey, dTag], signed);
      queryClient.setQueryData(['monero-record', user.pubkey, signed.id], null);
    },
  });

  return {
    /** The decrypted record, or `null` when no wallet exists. */
    record: recordQuery.data ?? null,
    /** True while the record is being fetched or decrypted. */
    isLoading: eventQuery.isLoading || recordQuery.isLoading,
    isError: eventQuery.isError || recordQuery.isError,
    error: eventQuery.error ?? recordQuery.error,
    /** Whether the signer can encrypt — without NIP-44 there's no wallet. */
    canEncrypt,
    createRecord,
    updateState,
    deleteRecord,
  };
}
