import { LOCAL_DOMAIN } from './config.ts';
import { MetaContent, metaContentSchema } from './schema.ts';

import type { Event } from './event.ts';

function toAccount(event: Event<0>) {
  const { pubkey } = event;
  const parsed = metaContentSchema.safeParse(JSON.parse(event?.content || ''));
  const content: MetaContent = parsed.success ? parsed.data : {};
  const { host, origin } = new URL(LOCAL_DOMAIN);

  return {
    id: pubkey,
    acct: pubkey,
    avatar: content.picture,
    avatar_static: content.picture,
    bot: false,
    created_at: event ? new Date(event.created_at * 1000).toISOString() : new Date().toISOString(),
    display_name: content.name,
    emojis: [],
    fields: [],
    follow_requests_count: 0,
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    header: content.banner,
    header_static: content.banner,
    locked: false,
    note: content.about,
    fqn: `${pubkey}@${host}`,
    url: `${origin}/users/${pubkey}`,
    username: pubkey,
  };
}

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

export { toAccount, toStatus };
