import { NostrEvent, NostrMetadata, NSchema as n, NStore } from '@nostrify/nostrify';
import { z } from 'zod';

import { screenshotsSchema, serverMetaSchema } from '@/schemas/nostr.ts';

import type { DittoConf } from '@ditto/conf';

/** Like NostrMetadata, but some fields are required and also contains some extra fields. */
export interface InstanceMetadata extends NostrMetadata {
  about: string;
  email: string;
  name: string;
  picture: string;
  tagline: string;
  event?: NostrEvent;
  screenshots: z.infer<typeof screenshotsSchema>;
}

interface GetInstanceMetadataOpts {
  conf: DittoConf;
  relay: NStore;
  signal?: AbortSignal;
}

/** Get and parse instance metadata from the kind 0 of the admin user. */
export async function getInstanceMetadata(opts: GetInstanceMetadataOpts): Promise<InstanceMetadata> {
  const { conf, relay, signal } = opts;

  const [event] = await relay.query(
    [{ kinds: [0], authors: [await conf.signer.getPublicKey()], limit: 1 }],
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
    email: meta.email ?? `postmaster@${conf.url.host}`,
    picture: meta.picture ?? conf.local('/images/thumbnail.png'),
    website: meta.website ?? conf.localDomain,
    event,
    screenshots: meta.screenshots ?? [],
  };
}
