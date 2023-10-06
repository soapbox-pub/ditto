import { Conf } from '@/config.ts';
import { jsonMetaContentSchema } from '@/schemas/nostr.ts';
import { getPublicKeyPem } from '@/utils/rsa.ts';

import type { Event } from '@/deps.ts';
import type { Actor } from '@/schemas/activitypub.ts';

/** Nostr metadata event to ActivityPub actor. */
async function renderActor(event: Event<0>, username: string): Promise<Actor | undefined> {
  const content = jsonMetaContentSchema.parse(event.content);

  return {
    type: 'Person',
    id: Conf.local(`/users/${username}`),
    name: content?.name || '',
    preferredUsername: username,
    inbox: Conf.local(`/users/${username}/inbox`),
    followers: Conf.local(`/users/${username}/followers`),
    following: Conf.local(`/users/${username}/following`),
    outbox: Conf.local(`/users/${username}/outbox`),
    icon: content.picture
      ? {
        type: 'Image',
        url: content.picture,
      }
      : undefined,
    image: content.banner
      ? {
        type: 'Image',
        url: content.banner,
      }
      : undefined,
    summary: content.about ?? '',
    attachment: [],
    tag: [],
    publicKey: {
      id: Conf.local(`/users/${username}#main-key`),
      owner: Conf.local(`/users/${username}`),
      publicKeyPem: await getPublicKeyPem(event.pubkey),
    },
    endpoints: {
      sharedInbox: Conf.local('/inbox'),
    },
  };
}

export { renderActor };
