import { useCallback, useSyncExternalStore } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import type { AuthorResult } from '@/hooks/useAuthor';
import { createMuteMatcher } from '@/lib/muteHelpers';

/**
 * The pubkeys whose loaded profile contains a muted word, kept current as
 * profiles land in the `['author', pubkey]` cache. One store per word list is
 * shared by every subscriber, so each profile is checked once, not once per
 * `useMuteFilter` caller, and subscribers re-render only when the set changes.
 */
class ProfileWordMuteStore {
  private pubkeys = new Set<string>();
  private listeners = new Set<() => void>();
  private detach?: () => void;
  private notifyQueued = false;
  private readonly hasMutedWord: ReturnType<typeof createMuteMatcher>['hasMutedWord'];

  constructor(private readonly queryClient: QueryClient, words: string[]) {
    this.hasMutedWord = createMuteMatcher(words.map((value) => ({ type: 'word', value }))).hasMutedWord;
    this.scan();
  }

  get idle(): boolean {
    return this.listeners.size === 0;
  }

  getSnapshot = (): ReadonlySet<string> => this.pubkeys;

  subscribe = (listener: () => void): (() => void) => {
    if (!this.detach) {
      // Profiles that loaded while nobody was listening.
      if (this.listeners.size === 0) this.scan();
      this.detach = this.queryClient.getQueryCache().subscribe((e) => {
        if (e.type !== 'updated' || e.action.type !== 'success') return;
        const [scope, pubkey] = e.query.queryKey;
        if (scope !== 'author' || typeof pubkey !== 'string') return;
        const event = (e.query.state.data as AuthorResult | undefined)?.event;
        this.update(pubkey, !!event && this.hasMutedWord(event));
      });
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.detach?.();
        this.detach = undefined;
      }
    };
  };

  private scan() {
    const pubkeys = new Set<string>();
    for (const query of this.queryClient.getQueryCache().findAll({ queryKey: ['author'] })) {
      const pubkey = query.queryKey[1];
      const event = (query.state.data as AuthorResult | undefined)?.event;
      if (typeof pubkey === 'string' && event && this.hasMutedWord(event)) pubkeys.add(pubkey);
    }
    if (pubkeys.size !== this.pubkeys.size || [...pubkeys].some((pk) => !this.pubkeys.has(pk))) {
      this.pubkeys = pubkeys;
    }
  }

  private update(pubkey: string, muted: boolean) {
    if (this.pubkeys.has(pubkey) === muted) return;
    this.pubkeys = new Set(this.pubkeys);
    if (muted) this.pubkeys.add(pubkey);
    else this.pubkeys.delete(pubkey);
    // A feed page loads many profiles at once; re-render once for the batch.
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const listener of this.listeners) listener();
    });
  }
}

const stores = new WeakMap<QueryClient, Map<string, ProfileWordMuteStore>>();

function getStore(queryClient: QueryClient, wordsKey: string): ProfileWordMuteStore {
  let byWords = stores.get(queryClient);
  if (!byWords) {
    byWords = new Map();
    stores.set(queryClient, byWords);
  }
  let store = byWords.get(wordsKey);
  if (!store) {
    // The word list changed; stores for old lists nobody reads can go.
    for (const [key, other] of byWords) {
      if (other.idle) byWords.delete(key);
    }
    store = new ProfileWordMuteStore(queryClient, wordsKey.split('\n'));
    byWords.set(wordsKey, store);
  }
  return store;
}

const EMPTY: ReadonlySet<string> = new Set();
const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

/**
 * Pubkeys whose profile (name, bio, NIP-05, website) contains one of the
 * muted words in `wordsKey` (see `MuteMatcher.wordsKey`). Pass `''` to turn
 * it off. Only profiles already loaded are known; it fills in as they load.
 */
export function useProfileWordMutes(wordsKey: string): ReadonlySet<string> {
  const queryClient = useQueryClient();
  const store = wordsKey ? getStore(queryClient, wordsKey) : undefined;

  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? noopSubscribe(),
    [store],
  );

  return useSyncExternalStore(subscribe, store?.getSnapshot ?? emptySnapshot);
}
