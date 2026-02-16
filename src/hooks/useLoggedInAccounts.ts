import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useQuery } from '@tanstack/react-query';
import { NSchema as n, NostrEvent, NostrMetadata } from '@nostrify/nostrify';

export interface Account {
  id: string;
  pubkey: string;
  event?: NostrEvent;
  metadata: NostrMetadata;
}

export function useLoggedInAccounts() {
  const { nostr } = useNostr();
  const { logins, setLogin, removeLogin } = useNostrLogin();

  const { data: authors = [] } = useQuery({
    queryKey: ['nostr', 'logins', logins.map((l) => l.id).join(';')],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [0], authors: logins.map((l) => l.pubkey) }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) },
      );

      return logins.map(({ id, pubkey }): Account => {
        const event = events.find((e) => e.pubkey === pubkey);
        try {
          const metadata = n.json().pipe(n.metadata()).parse(event?.content);
          return { id, pubkey, metadata, event };
        } catch {
          return { id, pubkey, metadata: {}, event };
        }
      });
    },
    retry: 3,
  });

  // Current user is the first login
  const currentUser: Account | undefined = (() => {
    const login = logins[0];
    if (!login) return undefined;
    const author = authors.find((a) => a.id === login.id);
    return { metadata: {}, ...author, id: login.id, pubkey: login.pubkey };
  })();

  // Other users are all logins except the current one
  const otherUsers = (authors || []).slice(1) as Account[];

  return {
    authors,
    currentUser,
    otherUsers,
    setLogin,
    removeLogin,
  };
}