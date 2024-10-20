import { NostrEvent, NostrMetadata, NSchema as n, NStore } from '@nostrify/nostrify';

import { Conf } from '@/config.ts';
import { serverMetaSchema } from '@/schemas/nostr.ts';

/** Like NostrMetadata, but some fields are required and also contains some extra fields. */
export interface InstanceMetadata extends NostrMetadata {
  about: string;
  email: string;
  name: string;
  picture: string;
  tagline: string;
  event?: NostrEvent;
}

/** Get and parse instance metadata from the kind 0 of the admin user. */
export async function getInstanceMetadata(store: NStore, signal?: AbortSignal): Promise<InstanceMetadata> {
  const [event] = await store.query(
    [{ kinds: [0], authors: [Conf.pubkey], limit: 1 }],
    { signal },
  );

  const meta = n
    .json()
    .pipe(serverMetaSchema)
    .catch({})
    .parse(event?.content);

  return {
    ...meta,
    name: meta.name ?? 'Ditto',
    about: meta.about ?? 'Nostr community server',
    tagline: meta.tagline ?? meta.about ?? 'Nostr community server',
    email: meta.email ?? `postmaster@${Conf.url.host}`,
    picture: meta.picture ?? Conf.local('/images/thumbnail.png'),
    event,
  };
}
