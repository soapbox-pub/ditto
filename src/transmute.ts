import { findReplyTag, lodash, nip19, TTLCache, unfurl, z } from '@/deps.ts';
import { type Event } from '@/event.ts';
import { type MetaContent, parseMetaContent } from '@/schema.ts';

import { LOCAL_DOMAIN } from './config.ts';
import { getAuthor } from './client.ts';
import { verifyNip05Cached } from './nip05.ts';
import { getMediaLinks, type MediaLink, parseNoteContent } from './note.ts';
import { type Nip05, parseNip05 } from './utils.ts';

const DEFAULT_AVATAR = 'https://gleasonator.com/images/avi.png';
const DEFAULT_BANNER = 'https://gleasonator.com/images/banner.png';

interface ToAccountOpts {
  withSource?: boolean;
}

async function toAccount(event: Event<0>, opts: ToAccountOpts = {}) {
  const { withSource = false } = opts;

  const { pubkey } = event;
  const { name, nip05, picture, banner, about }: MetaContent = parseMetaContent(event);
  const { origin } = new URL(LOCAL_DOMAIN);
  const npub = nip19.npubEncode(pubkey);

  let parsed05: Nip05 | undefined;
  try {
    if (nip05 && await verifyNip05Cached(nip05, pubkey)) {
      parsed05 = parseNip05(nip05);
    }
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
  const account = profile ? await toAccount(profile) : undefined;

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
  const account = profile ? await toAccount(profile) : undefined;
  if (!account) return;

  const replyTag = findReplyTag(event);

  const mentionedPubkeys = [
    ...new Set(
      event.tags
        .filter((tag) => tag[0] === 'p')
        .map((tag) => tag[1]),
    ),
  ];

  const { html, links, firstUrl } = parseNoteContent(event.content);
  const mediaLinks = getMediaLinks(links);

  return {
    id: event.id,
    account,
    card: firstUrl ? await unfurlCardCached(firstUrl) : null,
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

interface PreviewCard {
  url: string;
  title: string;
  description: string;
  type: 'link' | 'photo' | 'video' | 'rich';
  author_name: string;
  author_url: string;
  provider_name: string;
  provider_url: string;
  html: string;
  width: number;
  height: number;
  image: string | null;
  embed_url: string;
  blurhash: string | null;
}

async function unfurlCard(url: string): Promise<PreviewCard | null> {
  console.log(`Unfurling ${url}...`);
  try {
    const result = await unfurl(url, { fetch, follow: 2, timeout: 1000, size: 1024 * 1024 });
    return {
      type: result.oEmbed?.type || 'link',
      url: result.canonical_url || url,
      title: result.oEmbed?.title || result.title || '',
      description: result.open_graph.description || result.description || '',
      author_name: result.oEmbed?.author_name || '',
      author_url: result.oEmbed?.author_url || '',
      provider_name: result.oEmbed?.provider_name || '',
      provider_url: result.oEmbed?.provider_url || '',
      // @ts-expect-error `html` does in fact exist on oEmbed.
      html: result.oEmbed?.html || '',
      width: result.oEmbed?.width || 0,
      height: result.oEmbed?.height || 0,
      image: result.oEmbed?.thumbnails?.[0].url || result.open_graph.images?.[0].url || null,
      embed_url: '',
      blurhash: null,
    };
  } catch (_e) {
    return null;
  }
}

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

const previewCardCache = new TTLCache<string, Promise<PreviewCard | null>>({ ttl: TWELVE_HOURS, max: 500 });

/** Unfurl card from cache if available, otherwise fetch it. */
function unfurlCardCached(url: string): Promise<PreviewCard | null> {
  const cached = previewCardCache.get(url);
  if (cached !== undefined) return cached;

  const card = unfurlCard(url);
  previewCardCache.set(url, card);

  return card;
}

export { toAccount, toStatus };
