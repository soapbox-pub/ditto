import { LOCAL_DOMAIN } from './config.ts';
import { fetchUser } from './client.ts';
import { jsonSchema, MetaContent, metaContentSchema } from './schema.ts';

import type { Event } from './event.ts';

const DEFAULT_AVATAR = 'https://gleasonator.com/images/avi.png';

function parseContent(event: Event<0>): MetaContent {
  const json = jsonSchema.parse(event.content);
  const result = metaContentSchema.safeParse(json);
  return result.success ? result.data : {};
}

function toAccount(event: Event<0>) {
  const { pubkey } = event;
  const content: MetaContent = parseContent(event);
  const { host, origin } = new URL(LOCAL_DOMAIN);

  return {
    id: pubkey,
    acct: content.nip05 || pubkey,
    avatar: content.picture || DEFAULT_AVATAR,
    avatar_static: content.picture || DEFAULT_AVATAR,
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
    fqn: content.nip05 || `${pubkey}@${host}`,
    url: `${origin}/users/${pubkey}`,
    username: content.nip05 || pubkey,
  };
}

async function toStatus(event: Event<1>) {
  const profile = await fetchUser(event.pubkey);
  const account = profile ? toAccount(profile) : undefined;
  if (!account) return;

  const inReplyTo = event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'reply');

  return {
    id: event.id,
    account,
    content: event.content,
    created_at: new Date(event.created_at * 1000).toISOString(),
    in_reply_to_id: inReplyTo ? inReplyTo[1] : null,
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
