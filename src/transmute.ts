import { findReplyTag, lodash, nip19, z } from '@/deps.ts';
import { type Event } from '@/event.ts';
import { type MetaContent, parseMetaContent } from '@/schema.ts';

import { LOCAL_DOMAIN } from './config.ts';
import { getAuthor } from './client.ts';
import { getMediaLinks, type MediaLink, parseNoteContent } from './note.ts';
import { type Nip05, parseNip05 } from './utils.ts';

const DEFAULT_AVATAR = 'https://gleasonator.com/images/avi.png';
const DEFAULT_BANNER = 'https://gleasonator.com/images/banner.png';

interface ToAccountOpts {
  withSource?: boolean;
}

function toAccount(event: Event<0>, opts: ToAccountOpts = {}) {
  const { withSource = false } = opts;

  const { pubkey } = event;
  const { name, nip05, picture, banner, about }: MetaContent = parseMetaContent(event);
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
    source: withSource
      ? {
        fields: [],
        language: '',
        note: about || '',
        privacy: 'public',
        sensitive: false,
        follow_requests_count: 0,
      }
      : undefined,
    statuses_count: 0,
    header: banner || DEFAULT_BANNER,
    header_static: banner || DEFAULT_BANNER,
    locked: false,
    note: lodash.escape(about),
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

  const replyTag = findReplyTag(event);

  const mentionedPubkeys = [
    ...new Set(
      event.tags
        .filter((tag) => tag[0] === 'p')
        .map((tag) => tag[1]),
    ),
  ];

  const { html, links } = parseNoteContent(event.content);
  const mediaLinks = getMediaLinks(links);

  return {
    id: event.id,
    account,
    content: html,
    created_at: new Date(event.created_at * 1000).toISOString(),
    in_reply_to_id: replyTag ? replyTag[1] : null,
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
    media_attachments: mediaLinks.map(renderAttachment),
    mentions: await Promise.all(mentionedPubkeys.map(toMention)),
    tags: [],
    emojis: [],
    card: null,
    poll: null,
    uri: `${LOCAL_DOMAIN}/posts/${event.id}`,
    url: `${LOCAL_DOMAIN}/posts/${event.id}`,
  };
}

const attachmentTypeSchema = z.enum(['image', 'video', 'gifv', 'audio', 'unknown']).catch('unknown');

function renderAttachment({ url, mimeType }: MediaLink) {
  const [baseType, _subType] = mimeType.split('/');
  const type = attachmentTypeSchema.parse(baseType);

  return {
    id: url,
    type,
    url,
    preview_url: url,
    remote_url: null,
    meta: {},
    description: '',
    blurhash: null,
  };
}

export { toAccount, toStatus };
