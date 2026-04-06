import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

// ─── Constants ────────────────────────────────────────────────────────────────

/** localStorage key for the buddy agent's secret key (hex-encoded). */
const BUDDY_NSEC_STORAGE = 'ditto:buddy-nsec';

/** Suffix appended to `config.appId` for the NIP-78 d-tag. */
const BUDDY_DTAG_SUFFIX = '/buddy';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Encrypted content stored in the kind 30078 buddy event. */
export interface BuddySecrets {
  /** Buddy agent secret key as hex string. */
  nsec: string;
  /** The buddy's canonical name (source of truth — kind 0 may use nicknames). */
  name: string;
  /** The buddy's soul — personality / behavior description injected into the system prompt. */
  soul: string;
}

/** Public + decrypted buddy data returned by the hook. */
export interface BuddyIdentity {
  /** Buddy agent's public key (hex). */
  pubkey: string;
  /** The buddy's canonical name. */
  name: string;
  /** The buddy's soul text. */
  soul: string;
  /** The raw kind 30078 event (for reference). */
  event: NostrEvent;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

/** Read the buddy nsec from localStorage, or null if not present. */
function getStoredNsec(): Uint8Array | null {
  const hex = localStorage.getItem(BUDDY_NSEC_STORAGE);
  if (!hex) return null;
  try {
    return hexToBytes(hex);
  } catch {
    return null;
  }
}

/** Persist the buddy nsec to localStorage. */
function storeNsec(sk: Uint8Array): void {
  localStorage.setItem(BUDDY_NSEC_STORAGE, bytesToHex(sk));
}

/** Remove the buddy nsec from localStorage. */
function clearStoredNsec(): void {
  localStorage.removeItem(BUDDY_NSEC_STORAGE);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages the user's Buddy AI agent identity.
 *
 * - Reads buddy nsec from localStorage for fast access.
 * - Queries the kind 30078 buddy event from relays as backup.
 * - If localStorage is empty but a relay event exists, decrypts and restores the nsec.
 * - Provides `createBuddy` to generate a keypair + publish identity events.
 * - Provides `updateSoul` to change the buddy's soul text.
 * - Provides `resetBuddy` to wipe the buddy entirely.
 */
export function useBuddy() {
  const { config } = useAppContext();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const dTag = `${config.appId}${BUDDY_DTAG_SUFFIX}`;

  // ── Query the kind 30078 buddy event from relays ────────────────────────

  const buddyEventQuery = useQuery({
    queryKey: ['buddy-event', user?.pubkey],
    queryFn: async () => {
      if (!user) return null;

      const filter: NostrFilter = {
        kinds: [30078],
        authors: [user.pubkey],
        '#d': [dTag],
        limit: 1,
      };

      const events = await nostr.query([filter]);
      return events.length > 0 ? events[0] : null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // ── Decrypt buddy secrets from the relay event ──────────────────────────

  const buddyQuery = useQuery<BuddyIdentity | null>({
    queryKey: ['buddy-identity', buddyEventQuery.data?.id],
    queryFn: async () => {
      const event = buddyEventQuery.data;
      if (!event || !user) return null;

      // Always need to decrypt to get name + soul
      const secrets = await decryptSecrets(event, user);
      if (!secrets) return null;

      // Try localStorage nsec first
      const localSk = getStoredNsec();
      if (localSk) {
        const pubkey = getPublicKey(localSk);
        // Verify the localStorage key matches the event's p-tag
        const eventPubkey = event.tags.find(([t]) => t === 'p')?.[1];
        if (eventPubkey && eventPubkey !== pubkey) {
          // Mismatch — restore from decrypted secrets
          clearStoredNsec();
          const sk = hexToBytes(secrets.nsec);
          storeNsec(sk);
          return { pubkey: getPublicKey(sk), name: secrets.name, soul: secrets.soul, event };
        }
        return { pubkey, name: secrets.name, soul: secrets.soul, event };
      }

      // localStorage empty — restore nsec from decrypted secrets
      const sk = hexToBytes(secrets.nsec);
      storeNsec(sk);

      return { pubkey: getPublicKey(sk), name: secrets.name, soul: secrets.soul, event };
    },
    enabled: !!buddyEventQuery.data && !!user,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // ── Create a new buddy ──────────────────────────────────────────────────

  const createBuddy = useMutation({
    mutationFn: async ({ name, soul, picture }: { name: string; soul: string; picture?: string }) => {
      if (!user) throw new Error('User not logged in');
      if (!user.signer.nip44) throw new Error('NIP-44 encryption not supported by signer');

      // Generate buddy keypair
      const sk = generateSecretKey();
      const pubkey = getPublicKey(sk);

      // Persist nsec to localStorage
      storeNsec(sk);

      // Build kind 0 profile for the buddy agent
      const profileContent = JSON.stringify({
        name,
        ...(picture ? { picture } : {}),
        about: soul,
        bot: true,
      });

      const profileEvent = finalizeEvent({
        kind: 0,
        content: profileContent,
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      }, sk) as NostrEvent;

      // Build kind 30078 buddy identity event (signed by the user)
      const secrets: BuddySecrets = {
        nsec: bytesToHex(sk),
        name,
        soul,
      };
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, JSON.stringify(secrets));

      const buddyEvent = await user.signer.signEvent({
        kind: 30078,
        content: encrypted,
        tags: [
          ['d', dTag],
          ['p', pubkey],
          ['alt', 'Buddy AI agent identity'],
          ['client', config.clientName ?? config.appName, ...(config.client ? [config.client] : [])],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      // Publish both events
      await Promise.all([
        nostr.event(profileEvent, { signal: AbortSignal.timeout(5000) }),
        nostr.event(buddyEvent, { signal: AbortSignal.timeout(5000) }),
      ]);

      return { pubkey, name, soul, event: buddyEvent } satisfies BuddyIdentity;
    },
    onSuccess: (identity) => {
      // Update caches
      queryClient.setQueryData(['buddy-event', user?.pubkey], identity.event);
      queryClient.setQueryData(['buddy-identity', identity.event.id], identity);
    },
  });

  // ── Update the buddy's soul ─────────────────────────────────────────────

  const updateSoul = useMutation({
    mutationFn: async (newSoul: string) => {
      if (!user) throw new Error('User not logged in');
      if (!user.signer.nip44) throw new Error('NIP-44 encryption not supported by signer');

      // Get the current nsec (must exist if buddy exists)
      const localSk = getStoredNsec();
      if (!localSk) throw new Error('Buddy nsec not found in localStorage');
      if (!buddyQuery.data) throw new Error('No existing buddy identity to update');

      const pubkey = getPublicKey(localSk);
      const currentName = buddyQuery.data.name;

      // Encrypt updated secrets (preserve name)
      const secrets: BuddySecrets = {
        nsec: bytesToHex(localSk),
        name: currentName,
        soul: newSoul,
      };
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, JSON.stringify(secrets));

      // Publish updated kind 30078 event
      const buddyEvent = await user.signer.signEvent({
        kind: 30078,
        content: encrypted,
        tags: [
          ['d', dTag],
          ['p', pubkey],
          ['alt', 'Buddy AI agent identity'],
          ['client', config.clientName ?? config.appName, ...(config.client ? [config.client] : [])],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(buddyEvent, { signal: AbortSignal.timeout(5000) });

      // Also update the buddy's kind 0 about field
      const profileEvent = finalizeEvent({
        kind: 0,
        content: JSON.stringify({
          name: currentName,
          about: newSoul,
          bot: true,
        }),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      }, localSk) as NostrEvent;

      nostr.event(profileEvent, { signal: AbortSignal.timeout(5000) }).catch((err) => {
        console.error('Failed to update buddy profile:', err);
      });

      return { pubkey, name: currentName, soul: newSoul, event: buddyEvent } satisfies BuddyIdentity;
    },
    onSuccess: (identity) => {
      queryClient.setQueryData(['buddy-event', user?.pubkey], identity.event);
      queryClient.setQueryData(['buddy-identity', identity.event.id], identity);
    },
  });

  // ── Reset (wipe) the buddy ──────────────────────────────────────────────

  const resetBuddy = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not logged in');

      // Clear localStorage
      clearStoredNsec();

      // Publish an empty kind 30078 event to overwrite on relays
      const emptyEvent = await user.signer.signEvent({
        kind: 30078,
        content: '',
        tags: [
          ['d', dTag],
          ['alt', 'Buddy AI agent identity (cleared)'],
          ['client', config.clientName ?? config.appName, ...(config.client ? [config.client] : [])],
        ],
        created_at: Math.floor(Date.now() / 1000),
      });

      await nostr.event(emptyEvent, { signal: AbortSignal.timeout(5000) });

      return emptyEvent;
    },
    onSuccess: () => {
      queryClient.setQueryData(['buddy-event', user?.pubkey], null);
      queryClient.setQueryData(['buddy-identity', undefined], null);
      // Invalidate to force refetch
      queryClient.invalidateQueries({ queryKey: ['buddy-event', user?.pubkey] });
    },
  });

  // ── Derived state ───────────────────────────────────────────────────────

  const buddy = buddyQuery.data ?? null;
  const isLoading = buddyEventQuery.isLoading || buddyQuery.isLoading;
  const hasBuddy = buddy !== null;

  /** Get the buddy's secret key from localStorage. Only call when buddy exists. */
  const getBuddySecretKey = useCallback((): Uint8Array | null => {
    return getStoredNsec();
  }, []);

  return useMemo(() => ({
    /** The resolved buddy identity, or null if none configured. */
    buddy,
    /** True while loading from relays / decrypting. */
    isLoading,
    /** Whether a buddy has been configured. */
    hasBuddy,
    /** Create a new buddy agent. */
    createBuddy,
    /** Update the buddy's soul text. */
    updateSoul,
    /** Wipe the buddy identity entirely. */
    resetBuddy,
    /** Get the buddy's secret key from localStorage (for signing events). */
    getBuddySecretKey,
  }), [buddy, isLoading, hasBuddy, createBuddy, updateSoul, resetBuddy, getBuddySecretKey]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Decrypt the buddy secrets from a kind 30078 event's encrypted content. */
async function decryptSecrets(
  event: NostrEvent,
  user: { pubkey: string; signer: { nip44?: { decrypt: (pubkey: string, ciphertext: string) => Promise<string> } } },
): Promise<BuddySecrets | null> {
  if (!event.content || !user.signer.nip44) return null;
  try {
    const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
    const secrets = JSON.parse(decrypted) as BuddySecrets;
    if (!secrets.nsec || !secrets.name || !secrets.soul) return null;
    return secrets;
  } catch {
    return null;
  }
}
