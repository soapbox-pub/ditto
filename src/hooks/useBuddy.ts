import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { z } from 'zod';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

// ─── Constants ────────────────────────────────────────────────────────────────

/** localStorage key prefix for the buddy agent's secret key (hex-encoded). */
const BUDDY_NSEC_STORAGE_PREFIX = 'ditto:buddy-nsec';

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

/** Zod schema for validating decrypted buddy secrets. */
const BuddySecretsSchema = z.object({
  nsec: z.string().regex(/^[0-9a-f]{64}$/),
  name: z.string().min(1),
  soul: z.string().min(1),
});

// ─── localStorage helpers ─────────────────────────────────────────────────────

/** Build the per-user localStorage key for the buddy nsec cache. */
function buddyNsecStorageKey(appId: string, pubkey: string): string {
  return `${BUDDY_NSEC_STORAGE_PREFIX}:${appId}:${pubkey}`;
}

/** Read the buddy nsec from localStorage, or null if not present. */
function getStoredNsec(storageKey: string): Uint8Array | null {
  const hex = localStorage.getItem(storageKey);
  if (!hex) return null;
  try {
    return hexToBytes(hex);
  } catch {
    return null;
  }
}

/** Persist the buddy nsec to localStorage. */
function storeNsec(storageKey: string, sk: Uint8Array): void {
  localStorage.setItem(storageKey, bytesToHex(sk));
}

/** Remove the buddy nsec from localStorage. */
function clearStoredNsec(storageKey: string): void {
  localStorage.removeItem(storageKey);
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
  const { mutateAsync: publishEvent } = useNostrPublish();

  const dTag = `${config.appId}${BUDDY_DTAG_SUFFIX}`;
  const buddyStorageKey = user ? buddyNsecStorageKey(config.appId, user.pubkey) : null;

  // ── Query the kind 30078 buddy event from relays ────────────────────────

  const buddyEventQuery = useQuery({
    queryKey: ['buddy-event', user?.pubkey, dTag],
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
    queryKey: ['buddy-identity', user?.pubkey, dTag, buddyEventQuery.data?.id],
    queryFn: async () => {
      const event = buddyEventQuery.data;
      if (!event || !user || !buddyStorageKey) return null;

      // Always need to decrypt to get name + soul
      const secrets = await decryptSecrets(event, user);
      if (!secrets) return null;

      const sk = hexToBytes(secrets.nsec);
      const pubkey = getPublicKey(sk);
      const eventPubkey = event.tags.find(([t]) => t === 'p')?.[1];

      // Try localStorage nsec first
      const localSk = getStoredNsec(buddyStorageKey);
      if (localSk) {
        const localPubkey = getPublicKey(localSk);
        // Verify the scoped cache matches the encrypted relay-backed secret.
        if (localPubkey === pubkey && (!eventPubkey || eventPubkey === pubkey)) {
          return { pubkey, name: secrets.name, soul: secrets.soul, event };
        }

        // Mismatch — restore from decrypted secrets.
        clearStoredNsec(buddyStorageKey);
      }

      // localStorage empty or stale — restore nsec from decrypted secrets.
      storeNsec(buddyStorageKey, sk);

      return { pubkey, name: secrets.name, soul: secrets.soul, event };
    },
    enabled: !!buddyEventQuery.data && !!user && !!buddyStorageKey,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // ── Create a new buddy ──────────────────────────────────────────────────

  const createBuddy = useMutation({
    mutationFn: async ({ name, soul, picture }: { name: string; soul: string; picture?: string }) => {
      if (!user) throw new Error('User not logged in');
      if (!user.signer.nip44) throw new Error('NIP-44 encryption not supported by signer');
      if (!buddyStorageKey) throw new Error('Buddy storage is unavailable');

      // Generate buddy keypair
      const sk = generateSecretKey();
      const pubkey = getPublicKey(sk);

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

      // Build kind 30078 buddy identity event (signed by the user via useNostrPublish)
      const secrets: BuddySecrets = {
        nsec: bytesToHex(sk),
        name,
        soul,
      };
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, JSON.stringify(secrets));

      // Publish buddy profile (signed by buddy key) in background
      nostr.event(profileEvent, { signal: AbortSignal.timeout(5000) }).catch(() => {
        toast({ title: 'Buddy profile publish failed', description: 'The buddy\'s profile could not be published to relays.', variant: 'destructive' });
      });

      // Publish kind 30078 via useNostrPublish (handles client tag + published_at)
      const buddyEvent = await publishEvent({
        kind: 30078,
        content: encrypted,
        tags: [
          ['d', dTag],
          ['p', pubkey],
          ['alt', 'Buddy AI agent identity'],
        ],
      });

      // Cache nsec locally only after the durable identity event succeeds.
      storeNsec(buddyStorageKey, sk);

      return { pubkey, name, soul, event: buddyEvent } satisfies BuddyIdentity;
    },
    onSuccess: (identity) => {
      // Update caches
      queryClient.setQueryData(['buddy-event', user?.pubkey, dTag], identity.event);
      queryClient.setQueryData(['buddy-identity', user?.pubkey, dTag, identity.event.id], identity);
    },
  });

  // ── Update the buddy's soul ─────────────────────────────────────────────

  const updateSoul = useMutation({
    mutationFn: async (newSoul: string) => {
      if (!user) throw new Error('User not logged in');
      if (!user.signer.nip44) throw new Error('NIP-44 encryption not supported by signer');
      if (!buddyStorageKey) throw new Error('Buddy storage is unavailable');

      // Fetch fresh from relay — never read from cache for read-modify-write
      const prev = await fetchFreshEvent(nostr, {
        kinds: [30078],
        authors: [user.pubkey],
        '#d': [dTag],
      });
      if (!prev) throw new Error('No existing buddy identity to update');

      const freshSecrets = await decryptSecrets(prev, user);
      if (!freshSecrets) throw new Error('Failed to decrypt buddy secrets');

      const sk = hexToBytes(freshSecrets.nsec);
      const pubkey = getPublicKey(sk);
      const currentName = freshSecrets.name;

      // Encrypt updated secrets (preserve name from fresh event)
      const secrets: BuddySecrets = {
        nsec: freshSecrets.nsec,
        name: currentName,
        soul: newSoul,
      };
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, JSON.stringify(secrets));

      // Publish updated kind 30078 via useNostrPublish (handles client tag + published_at)
      const buddyEvent = await publishEvent({
        kind: 30078,
        content: encrypted,
        tags: [
          ['d', dTag],
          ['p', pubkey],
          ['alt', 'Buddy AI agent identity'],
        ],
        prev,
      });

      // Also update the buddy's kind 0 about field (fire-and-forget)
      const profileEvent = finalizeEvent({
        kind: 0,
        content: JSON.stringify({
          name: currentName,
          about: newSoul,
          bot: true,
        }),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      }, sk) as NostrEvent;

      nostr.event(profileEvent, { signal: AbortSignal.timeout(5000) }).catch(() => {
        toast({ title: 'Buddy profile update failed', description: 'The buddy\'s updated profile could not be published to relays.', variant: 'destructive' });
      });

      storeNsec(buddyStorageKey, sk);

      return { pubkey, name: currentName, soul: newSoul, event: buddyEvent } satisfies BuddyIdentity;
    },
    onSuccess: (identity) => {
      queryClient.setQueryData(['buddy-event', user?.pubkey, dTag], identity.event);
      queryClient.setQueryData(['buddy-identity', user?.pubkey, dTag, identity.event.id], identity);
    },
  });

  // ── Reset (wipe) the buddy ──────────────────────────────────────────────

  const resetBuddy = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not logged in');

      // Clear localStorage
      if (buddyStorageKey) clearStoredNsec(buddyStorageKey);

      // Fetch the current event so useNostrPublish can preserve published_at
      const prev = await fetchFreshEvent(nostr, {
        kinds: [30078],
        authors: [user.pubkey],
        '#d': [dTag],
      });

      // Publish an empty kind 30078 event to overwrite on relays
      const emptyEvent = await publishEvent({
        kind: 30078,
        content: '',
        tags: [
          ['d', dTag],
          ['alt', 'Buddy AI agent identity (cleared)'],
        ],
        prev: prev ?? undefined,
      });

      return emptyEvent;
    },
    onSuccess: () => {
      queryClient.setQueryData(['buddy-event', user?.pubkey, dTag], null);
      // Clear all buddy-identity cache entries (the key includes a dynamic event ID)
      queryClient.removeQueries({ queryKey: ['buddy-identity'] });
    },
  });

  // ── Derived state ───────────────────────────────────────────────────────

  const buddy = buddyQuery.data ?? null;
  const isLoading = buddyEventQuery.isLoading || buddyQuery.isLoading;
  const hasBuddy = buddy !== null;

  /** Get the buddy's secret key from localStorage. Only call when buddy exists. */
  const getBuddySecretKey = useCallback((): Uint8Array | null => {
    return buddyStorageKey ? getStoredNsec(buddyStorageKey) : null;
  }, [buddyStorageKey]);

  return {
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
  };
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
    const parsed = BuddySecretsSchema.safeParse(JSON.parse(decrypted));
    if (!parsed.success) {
      console.warn('Buddy secrets failed validation:', parsed.error.message);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
