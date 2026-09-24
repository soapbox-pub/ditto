import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { useNostrStorage } from './useNostrStorage';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import {
  editNip51List,
  listVisibility,
  makeListPrivate,
  readNip51List,
  type Nip51ListContents,
  type Nip51ListEdit,
} from '@/lib/nip51List';
import { normalizeRelayUrl, relayMatchKey } from '@/lib/relayPolicy';

/** NIP-51 blocked relays list. */
export const BLOCKED_RELAYS_KIND = 10006;

function isRelayTag(tag: string[]): boolean {
  return tag[0] === 'relay' && !!normalizeRelayUrl(tag[1] ?? '');
}

const sameRelay = (a: string[], b: string[]) =>
  a[0] === b[0] && relayMatchKey(a[1] ?? '') === relayMatchKey(b[1] ?? '');

function relayUrls(tags: string[][]): string[] {
  const byKey = new Map<string, string>();
  for (const tag of tags.filter(isRelayTag)) {
    const key = relayMatchKey(tag[1])!;
    if (!byKey.has(key)) byKey.set(key, normalizeRelayUrl(tag[1])!);
  }
  return [...byKey.values()];
}

interface BlockedRelaysData {
  event: NostrEvent | null;
  urls: string[];
  /** The decrypted private entries (empty when unreadable). */
  privateUrls: string[];
  /** Private entries couldn't be decrypted; `urls` has only the public ones. */
  unreadable: boolean;
}

/**
 * The user's NIP-51 blocked relays (kind 10006), with mutations to add and
 * remove relays. The list is edited in the mode it's in — see `nip51List`.
 */
export function useBlockedRelays() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { store } = useNostrStorage();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const queryKey = ['blocked-relays', user?.pubkey ?? ''];

  const query = useQuery<BlockedRelaysData>({
    queryKey,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      if (!user) return { event: null, urls: [], privateUrls: [], unreadable: false };
      // Like the mute list, use the local store as a floor: a relay miss must
      // not read as "nothing blocked" and reconnect to every blocked relay.
      const event = await fetchFreshEvent(
        nostr,
        { kinds: [BLOCKED_RELAYS_KIND], authors: [user.pubkey] },
        { store, signal },
      ) ?? undefined;
      const contents = await readNip51List(event, user.signer, user.pubkey);
      return {
        event: event ?? null,
        urls: relayUrls([...contents.publicTags, ...contents.privateTags]),
        privateUrls: relayUrls(contents.privateTags),
        unreadable: contents.unreadable,
      };
    },
  });

  const edit = useMutation({
    mutationFn: async (apply: (prev: NostrEvent | null, contents: Nip51ListContents) => Promise<Nip51ListEdit>) => {
      if (!user) throw new Error('User not logged in');
      const prev = await fetchFreshEvent(nostr, { kinds: [BLOCKED_RELAYS_KIND], authors: [user.pubkey] }, { store });
      const contents = await readNip51List(prev, user.signer, user.pubkey);
      const next = await apply(prev, contents);
      await publishEvent({ kind: BLOCKED_RELAYS_KIND, tags: next.tags, content: next.content, prev: prev ?? undefined });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const blockRelay = (url: string) => {
    const normalized = normalizeRelayUrl(url);
    if (!normalized) return Promise.reject(new Error('Invalid relay URL'));
    return edit.mutateAsync((prev, contents) => editNip51List({
      prev,
      contents,
      signer: user!.signer,
      pubkey: user!.pubkey,
      add: [['relay', normalized]],
      isEntry: isRelayTag,
      same: sameRelay,
    }));
  };

  const unblockRelay = (url: string) => {
    const key = relayMatchKey(url);
    return edit.mutateAsync((prev, contents) => editNip51List({
      prev,
      contents,
      signer: user!.signer,
      pubkey: user!.pubkey,
      remove: (tag) => tag[0] === 'relay' && relayMatchKey(tag[1] ?? '') === key,
      isEntry: isRelayTag,
      same: sameRelay,
    }));
  };

  const makePrivate = () => edit.mutateAsync((_prev, contents) => makeListPrivate({
    contents,
    signer: user!.signer,
    pubkey: user!.pubkey,
    isEntry: isRelayTag,
    same: sameRelay,
  }));

  return {
    /** The list event read, or null when none was found (or not yet loaded). */
    blockedRelaysEvent: query.data?.event ?? null,
    blockedRelays: query.data?.urls,
    /** The private entries among `blockedRelays`. */
    privateBlockedRelays: query.data?.privateUrls,
    /** Private entries couldn't be decrypted. */
    unreadable: query.data?.unreadable ?? false,
    /** The list stores entries publicly; offer to make it private. */
    isPublic: listVisibility(query.data?.event, isRelayTag) === 'public',
    isLoading: query.isLoading,
    blockRelay,
    unblockRelay,
    makePrivate,
    isUpdating: edit.isPending,
  };
}
