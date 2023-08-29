import { isCWTag } from 'https://gitlab.com/soapbox-pub/mostr/-/raw/c67064aee5ade5e01597c6d23e22e53c628ef0e2/src/nostr/tags.ts';

import { Conf } from '@/config.ts';
import { countFilters } from '@/db/events.ts';
import { type Event, findReplyTag, lodash, nip19, sanitizeHtml, TTLCache, unfurl, z } from '@/deps.ts';
import { verifyNip05Cached } from '@/nip05.ts';
import { getMediaLinks, type MediaLink, parseNoteContent } from '@/note.ts';
import { getAuthor, getFollows } from '@/queries.ts';
import { emojiTagSchema, filteredArray } from '@/schema.ts';
import { jsonMetaContentSchema } from '@/schemas/nostr.ts';
import { isFollowing, type Nip05, nostrDate, parseNip05, Time } from '@/utils.ts';

const DEFAULT_AVATAR = 'https://gleasonator.com/images/avi.png';
const DEFAULT_BANNER = 'https://gleasonator.com/images/banner.png';

interface ToAccountOpts {
  withSource?: boolean;
}

async function toAccount(event: Event<0>, opts: ToAccountOpts = {}) {
  const { withSource = false } = opts;

  const { pubkey } = event;
  const { name, nip05, picture, banner, about } = jsonMetaContentSchema.parse(event.content);
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
    created_at: event ? nostrDate(event.created_at).toISOString() : new Date().toISOString(),
    discoverable: true,
    display_name: name,
    emojis: toEmojis(event),
    fields: [],
    follow_requests_count: 0,
    followers_count: 0,
    following_count: 0,
    fqn: parsed05?.handle || npub,
    header: banner || DEFAULT_BANNER,
    header_static: banner || DEFAULT_BANNER,
    last_status_at: null,
    locked: false,
    note: lodash.escape(about),
    roles: [],
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
    url: Conf.local(`/users/${pubkey}`),
    username: parsed05?.nickname || npub.substring(0, 8),
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
    const npub = nip19.npubEncode(pubkey);
    return {
      id: pubkey,
      acct: npub,
      username: npub.substring(0, 8),
      url: Conf.local(`/users/${pubkey}`),
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

  const [mentions, card, repliesCount, reblogsCount, favouritesCount] = await Promise.all([
    Promise.all(mentionedPubkeys.map(toMention)),
    firstUrl ? unfurlCardCached(firstUrl) : null,
    countFilters([{ kinds: [1], '#e': [event.id] }]),
    countFilters([{ kinds: [6], '#e': [event.id] }]),
    countFilters([{ kinds: [7], '#e': [event.id] }]),
  ]);

  const content = buildInlineRecipients(mentions) + html;

  const cw = event.tags.find(isCWTag);
  const subject = event.tags.find((tag) => tag[0] === 'subject');

  return {
    id: event.id,
    account,
    card,
    content,
    created_at: nostrDate(event.created_at).toISOString(),
    in_reply_to_id: replyTag ? replyTag[1] : null,
    in_reply_to_account_id: null,
    sensitive: !!cw,
    spoiler_text: (cw ? cw[1] : subject?.[1]) || '',
    visibility: 'public',
    language: event.tags.find((tag) => tag[0] === 'lang')?.[1] || null,
    replies_count: repliesCount,
    reblogs_count: reblogsCount,
    favourites_count: favouritesCount,
    favourited: false,
    reblogged: false,
    muted: false,
    bookmarked: false,
    reblog: null,
    application: null,
    media_attachments: mediaLinks.map(renderAttachment),
    mentions,
    tags: [],
    emojis: toEmojis(event),
    poll: null,
    uri: Conf.local(`/posts/${event.id}`),
    url: Conf.local(`/posts/${event.id}`),
  };
}

type Mention = Awaited<ReturnType<typeof toMention>>;

function buildInlineRecipients(mentions: Mention[]): string {
  if (!mentions.length) return '';

  const elements = mentions.reduce<string[]>((acc, { url, username }) => {
    const name = nip19.BECH32_REGEX.test(username) ? username.substring(0, 8) : username;
    acc.push(`<a href="${url}" class="u-url mention" rel="ugc">@<span>${name}</span></a>`);
    return acc;
  }, []);

  return `<span class="recipients-inline">${elements.join(' ')} </span>`;
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
    const result = await unfurl(url, { fetch, follow: 2, timeout: Time.seconds(1), size: 1024 * 1024 });
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
      html: sanitizeHtml(result.oEmbed?.html || '', {
        allowedTags: ['iframe'],
        allowedAttributes: {
          iframe: ['width', 'height', 'src', 'frameborder', 'allowfullscreen'],
        },
      }),
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

const previewCardCache = new TTLCache<string, Promise<PreviewCard | null>>({ ttl: Time.hours(12), max: 500 });

/** Unfurl card from cache if available, otherwise fetch it. */
function unfurlCardCached(url: string): Promise<PreviewCard | null> {
  const cached = previewCardCache.get(url);
  if (cached !== undefined) return cached;

  const card = unfurlCard(url);
  previewCardCache.set(url, card);

  return card;
}

function toEmojis(event: Event) {
  const emojiTags = event.tags.filter((tag) => tag[0] === 'emoji');

  return filteredArray(emojiTagSchema).parse(emojiTags)
    .map((tag) => ({
      shortcode: tag[1],
      static_url: tag[2],
      url: tag[2],
    }));
}

async function toRelationship(sourcePubkey: string, targetPubkey: string) {
  const [source, target] = await Promise.all([
    getFollows(sourcePubkey),
    getFollows(targetPubkey),
  ]);

  return {
    id: targetPubkey,
    following: source ? isFollowing(source, targetPubkey) : false,
    showing_reblogs: true,
    notifying: false,
    followed_by: target ? isFollowing(target, sourcePubkey) : false,
    blocking: false,
    blocked_by: false,
    muting: false,
    muting_notifications: false,
    requested: false,
    domain_blocking: false,
    endorsed: false,
  };
}

function toNotification(event: Event) {
  switch (event.kind) {
    case 1:
      return toNotificationMention(event as Event<1>);
  }
}

async function toNotificationMention(event: Event<1>) {
  const status = await toStatus(event);
  if (!status) return;

  return {
    id: event.id,
    type: 'mention',
    created_at: nostrDate(event.created_at).toISOString(),
    account: status.account,
    status: status,
  };
}

export { toAccount, toNotification, toRelationship, toStatus };
