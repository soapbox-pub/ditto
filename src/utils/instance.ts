import { NostrEvent, NostrMetadata, NSchema as n } from '@nostrify/nostrify';

import { Conf } from '@/config.ts';
import { serverMetaSchema } from '@/schemas/nostr.ts';
import { Storages } from '@/storages.ts';

/** Like NostrMetadata, but some fields are required and also contains some extra fields. */
export interface InstanceMetadata extends NostrMetadata {
  name: string;
  about: string;
  tagline: string;
  email: string;
  event?: NostrEvent;
}

/** Get and parse instance metadata from the kind 0 of the admin user. */
export async function getInstanceMetadata(signal?: AbortSignal): Promise<InstanceMetadata> {
  const [event] = await Storages.db.query(
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
    event,
  };
}
