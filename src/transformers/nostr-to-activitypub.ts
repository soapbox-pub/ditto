import { Conf } from '@/config.ts';
import { parseMetaContent } from '@/schema.ts';

import type { Event } from '@/event.ts';
import type { Actor } from '@/schemas/activitypub.ts';

/** Nostr metadata event to ActivityPub actor. */
async function toActor(event: Event<0>, username: string): Promise<Actor> {
  const content = parseMetaContent(event);

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
    endpoints: {
      sharedInbox: Conf.local('/inbox'),
    },
  };
}

export { toActor };
