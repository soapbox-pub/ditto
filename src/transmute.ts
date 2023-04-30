import { nip19 } from '@/deps.ts';
import { type Event } from '@/event.ts';
import { type MetaContent, parseContent } from '@/schema.ts';

import { LOCAL_DOMAIN } from './config.ts';
import { getAuthor } from './client.ts';
import { type Nip05, parseNip05 } from './utils.ts';

const DEFAULT_AVATAR = 'https://gleasonator.com/images/avi.png';

function toAccount(event: Event<0>) {
  const { pubkey } = event;
  const { name, nip05, picture, banner, about }: MetaContent = parseContent(event);
  const { origin } = new URL(LOCAL_DOMAIN);
  const npub = nip19.npubEncode(pubkey);

  let parsed05: Nip05 | undefined;
  try {
    parsed05 = parseNip05(nip05!);
  } catch (_e) {
    //
  }

  return {
    id: pubkey,
    acct: parsed05?.handle || npub,
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
    fqn: parsed05?.handle || npub,
    url: `${origin}/users/${pubkey}`,
    username: parsed05?.nickname || npub,
  };
}

async function toMention(pubkey: string) {
  const profile = await getAuthor(pubkey);
  const account = profile ? toAccount(profile) : undefined;

  if (account) {
    return {
      id: account.id,
      acct: account.acct,
      username: account.username,
      url: account.url,
    };
  } else {
    const { origin } = new URL(LOCAL_DOMAIN);
    const npub = nip19.npubEncode(pubkey);
    return {
      id: pubkey,
      acct: npub,
      username: npub,
      url: `${origin}/users/${pubkey}`,
    };
  }
}

async function toStatus(event: Event<1>) {
  const profile = await getAuthor(event.pubkey);
  const account = profile ? toAccount(profile) : undefined;
  if (!account) return;

  const inReplyTo = event.tags
    .find((tag) => tag[0] === 'e' && (!tag[3] || tag[3] === 'reply' || tag[3] === 'root'));

  const mentionedPubkeys = [
    ...new Set(
      event.tags
        .filter((tag) => tag[0] === 'p')
        .map((tag) => tag[1]),
    ),
  ];

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
    mentions: await Promise.all(mentionedPubkeys.map(toMention)),
    tags: [],
    emojis: [],
    card: null,
    poll: null,
    uri: `${LOCAL_DOMAIN}/posts/${event.id}`,
    url: `${LOCAL_DOMAIN}/posts/${event.id}`,
  };
}

export { toAccount, toStatus };
