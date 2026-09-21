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

import type { NostrEvent } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { hasWalletCache } from '@/lib/monero/cache';
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

/**
 * A create/restore was asked to publish, but a record already exists.
 *
 * Thrown *after* the found event has been handed to the query cache, so the
 * wallet converges on screen at the same moment. Typed rather than a bare
 * `Error` so the setup dialog can treat it as a recovery ("your wallet was
 * already here") instead of a red failure. The caller reached the setup
 * screen from an inconclusive read, and telling them the wallet both doesn't
 * exist and already exists is the worst possible pair of messages.
 */
export class MoneroWalletExistsError extends Error {
  constructor() {
    super('A Monero wallet already exists for this account');
    this.name = 'MoneroWalletExistsError';
  }
}

/**
 * What the caller believes it is replacing.
 *
 * A kind 30078 write is a replacement, and this one carries the only copy of
 * the seed, so "what was there before" has to be established before every
 * publish rather than assumed from the query cache.
 */
type PublishGuard =
  /** Nothing may exist yet — this is the first record for the account. */
  | { expect: 'absent' }
  /** The record must still be the event it was decrypted from. */
  | { expect: 'event'; event: NostrEvent | null };

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
  const { store } = useNostrStorage();
  const { config } = useAppContext();
  const queryClient = useQueryClient();

  const dTag = moneroRecordDTag(config.appId);
  const canEncrypt = !!user?.signer.nip44;

  /**
   * The raw kind-30078 event holding the record.
   *
   * Read through `fetchFreshEvent` with the local event store as a floor, not
   * a bare `nostr.query`. `NPool.query` resolves 300ms after the *first* EOSE
   * and swallows relay errors, so one fast relay that doesn't carry this event
   * is enough to make an existing wallet look like no wallet at all — which
   * renders the setup screen, and from there a second wallet can be created
   * over the first. The store holds what this device last saw, so a relay miss
   * degrades to "your last known record" instead of to nothing.
   *
   * A device that has genuinely never seen the wallet still can't tell the two
   * apart; `createRecord` below carries the guards for that case.
   */
  const eventQuery = useQuery({
    queryKey: ['monero-record-event', user?.pubkey, dTag],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      return fetchFreshEvent(
        nostr,
        { kinds: [30078], authors: [user.pubkey], '#d': [dTag] },
        { store, signal },
      );
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
   * Encrypt and publish a record, after checking what is actually out there.
   *
   * This event is the only copy of the seed, and it is replaceable: a publish
   * built on a stale read silently destroys whatever it replaces. So every
   * write re-reads first — relays plus the local store, which is the floor
   * that keeps a relay miss from reading as "no wallet" — and checks the
   * result against what the caller expected to be replacing.
   *
   * The comparison is by event id and `created_at`, not by decrypting and
   * diffing the seed: a different seed necessarily lives in a different event,
   * and decrypting would cost a signer round-trip on a bunker login for every
   * snapshot we write. An event *older* than ours is stale propagation from a
   * lagging relay, not another device, so it isn't treated as a conflict.
   */
  const publishRecord = useCallback(
    async (record: MoneroWalletRecord, guard: PublishGuard) => {
      if (!user) throw new Error('Not logged in');
      if (!user.signer.nip44) throw new Error('Your signer does not support NIP-44 encryption');

      const fresh = await fetchFreshEvent(
        nostr,
        { kinds: [30078], authors: [user.pubkey], '#d': [dTag] },
        { store },
      );

      if (guard.expect === 'absent') {
        if (fresh?.content) {
          // The read that produced the setup screen missed this event, but the
          // fresh re-read here found it, so the wallet is real and we're
          // holding it. Hand it to the query cache (the same convergence the
          // 'event' branch does below) so the panel loads the existing wallet
          // instead of dead-ending on "already exists" right after telling the
          // user they had none. Throwing only signals the caller to stop and
          // show the recovery; the wallet is already on its way in.
          queryClient.setQueryData(['monero-record-event', user.pubkey, dTag], fresh);
          throw new MoneroWalletExistsError();
        }
      } else if (
        fresh?.content &&
        (!guard.event || (fresh.id !== guard.event.id && fresh.created_at >= guard.event.created_at))
      ) {
        // Another device — or another tab — replaced the record since we read
        // it. Publishing our copy now would put its seed back over theirs.
        // Hand the newer event to the query cache so the app re-decrypts and
        // converges instead of retrying into the same conflict.
        queryClient.setQueryData(['monero-record-event', user.pubkey, dTag], fresh);
        throw new Error('Your Monero wallet was updated on another device.');
      }

      const plaintext = JSON.stringify(record);
      const content = await user.signer.nip44.encrypt(user.pubkey, plaintext);

      const signed = await user.signer.signEvent({
        kind: 30078,
        content,
        // No `title` tag. The `d` tag already identifies this event to anyone
        // who goes looking, and a plaintext "Ditto Monero Wallet" alongside it
        // turns a relay query into a list of who holds Monero. The content is
        // encrypted; the envelope shouldn't advertise what's inside it.
        tags: [
          ['d', dTag],
          ['client', config.appName, ...(config.client ? [config.client] : [])],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(signed, { signal: AbortSignal.timeout(10_000) });

      queryClient.setQueryData(['monero-record-event', user.pubkey, dTag], signed);
      queryClient.setQueryData(['monero-record', user.pubkey, signed.id], record);

      return { record, event: signed };
    },
    [user, nostr, store, dTag, config.appName, config.client, queryClient],
  );

  /** Create the initial record for a new or restored wallet. */
  const createRecord = useMutation({
    mutationFn: async (params: CreateMoneroRecordParams) => {
      if (!user) throw new Error('Not logged in');

      // Creating is the one write that can destroy a seed it never saw, so it
      // refuses to run on an inconclusive read. `NPool.query` swallows relay
      // errors and resolves 300ms after the first EOSE, so a fast relay that
      // simply doesn't carry the event looks exactly like "no wallet yet" —
      // and the setup screen the user is looking at is itself the product of
      // that same read.
      if (eventQuery.isError) {
        throw new Error("Couldn't check your relays for an existing wallet. Try again.");
      }

      // A local wallet cache proves this account already had a wallet on this
      // device, whatever the relays are saying right now.
      if (await hasWalletCache(user.pubkey)) {
        throw new Error(
          'This account already has a Monero wallet cached on this device. ' +
            'Reload to let it load from your relays before setting up a new one.',
        );
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

      return publishRecord(record, { expect: 'absent' });
    },
  });

  /**
   * Update the cached state snapshot after a sync.
   *
   * Only the `state` field is touched — the seed and restore height are
   * carried over from the record we already hold, so a sync can never rewrite
   * key material *of its own accord*. It can still carry a stale copy of it:
   * the record it spreads came from whichever event this hook last decrypted,
   * so a device that has been open since before another device restored a
   * wallet would republish the old seed over the new one. Passing the source
   * event makes `publishRecord` refuse that.
   */
  const updateState = useMutation({
    mutationFn: async (state: MoneroWalletState) => {
      const current = recordQuery.data;
      if (!current) throw new Error('No Monero wallet record to update');
      return publishRecord({ ...current, state }, { expect: 'event', event: eventQuery.data ?? null });
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
