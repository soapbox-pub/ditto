import { LOCAL_DOMAIN } from './config.ts';

import type { Event } from './event.ts';

function toStatus(event: Event<1>) {
  return {
    id: event.id,
    account: {
      id: event.pubkey,
    },
    content: event.content,
    created_at: new Date(event.created_at * 1000).toISOString(),
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    sensitive: false,
    spoiler_text: '',
    visibility: 'public',
    language: 'en',
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    muted: false,
    bookmarked: false,
    reblog: null,
    application: null,
    media_attachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    card: null,
    poll: null,
    uri: `${LOCAL_DOMAIN}/posts/${event.id}`,
    url: `${LOCAL_DOMAIN}/posts/${event.id}`,
  };
}

export { toStatus };
