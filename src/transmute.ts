import { nip19 } from '@/deps.ts';
import { type Event } from '@/event.ts';
import { type MetaContent, parseContent } from '@/schema.ts';

import { LOCAL_DOMAIN } from './config.ts';
import { getAuthor } from './client.ts';

const DEFAULT_AVATAR = 'https://gleasonator.com/images/avi.png';

function toAccount(event: Event<0>) {
  const { pubkey } = event;
  const { name, nip05, picture, banner, about }: MetaContent = parseContent(event);
  const { origin } = new URL(LOCAL_DOMAIN);
  const npub = nip19.npubEncode(pubkey);

  return {
    id: pubkey,
    acct: nip05 || npub,
    avatar: picture || DEFAULT_AVATAR,
    avatar_static: picture || DEFAULT_AVATAR,
    bot: false,
    created_at: event ? new Date(event.created_at * 1000).toISOString() : new Date().toISOString(),
    display_name: name,
    emojis: [],
    fields: [],
    follow_requests_count: 0,
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    header: banner,
    header_static: banner,
    locked: false,
    note: about,
    fqn: nip05 || npub,
    url: `${origin}/users/${pubkey}`,
    username: nip05 ? nip05.split('@')[0] : npub,
  };
}

async function toMention(tag: string[]) {
  const profile = await getAuthor(tag[1]);
  const account = profile ? toAccount(profile) : undefined;

  return {
    id: account?.id || tag[1],
    acct: account?.acct || tag[1],
    username: account?.username || tag[1],
    url: account?.url,
  };
}

async function toStatus(event: Event<1>) {
  const profile = await getAuthor(event.pubkey);
  const account = profile ? toAccount(profile) : undefined;
  if (!account) return;

  const inReplyTo = event.tags.find((tag) => tag[0] === 'e' && (!tag[3] || tag[3] === 'reply'));

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
    mentions: await Promise.all(event.tags.filter((tag) => tag[0] === 'p').map(toMention)),
    tags: [],
    emojis: [],
    card: null,
    poll: null,
    uri: `${LOCAL_DOMAIN}/posts/${event.id}`,
    url: `${LOCAL_DOMAIN}/posts/${event.id}`,
  };
}

export { toAccount, toStatus };
