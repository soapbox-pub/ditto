import { isCWTag } from 'https://gitlab.com/soapbox-pub/mostr/-/raw/c67064aee5ade5e01597c6d23e22e53c628ef0e2/src/nostr/tags.ts';

import { Conf } from '@/config.ts';
import * as eventsDB from '@/db/events.ts';
import { findUser } from '@/db/users.ts';
import { type Event, findReplyTag, lodash, nip19, type UnsignedEvent } from '@/deps.ts';
import { getMediaLinks, parseNoteContent } from '@/note.ts';
import { getAuthor, getFollowedPubkeys, getFollows } from '@/queries.ts';
import { filteredArray } from '@/schema.ts';
import { emojiTagSchema, jsonMediaDataSchema, jsonMetaContentSchema } from '@/schemas/nostr.ts';
import { isFollowing, type Nip05, nostrDate, nostrNow, parseNip05 } from '@/utils.ts';
import { verifyNip05Cached } from '@/utils/nip05.ts';
import { unfurlCardCached } from '@/utils/unfurl.ts';
import { DittoAttachment, renderAttachment } from '@/views/mastodon/attachments.ts';

const defaultAvatar = () => Conf.local('/images/avi.png');
const defaultBanner = () => Conf.local('/images/banner.png');

interface ToAccountOpts {
  withSource?: boolean;
}

async function toAccount(event: UnsignedEvent<0>, opts: ToAccountOpts = {}) {
  const { withSource = false } = opts;
  const { pubkey } = event;

  const {
    name,
    nip05,
    picture = defaultAvatar(),
    banner = defaultBanner(),
    about,
  } = jsonMetaContentSchema.parse(event.content);

  const npub = nip19.npubEncode(pubkey);

  const [user, parsed05, followersCount, followingCount, statusesCount] = await Promise.all([
    findUser({ pubkey }),
    parseAndVerifyNip05(nip05, pubkey),
    eventsDB.countFilters([{ kinds: [3], '#p': [pubkey] }]),
    getFollowedPubkeys(pubkey).then((pubkeys) => pubkeys.length),
    eventsDB.countFilters([{ kinds: [1], authors: [pubkey] }]),
  ]);

  return {
    id: pubkey,
    acct: parsed05?.handle || npub,
    avatar: picture,
    avatar_static: picture,
    bot: false,
    created_at: event ? nostrDate(event.created_at).toISOString() : new Date().toISOString(),
    discoverable: true,
    display_name: name,
    emojis: toEmojis(event),
    fields: [],
    follow_requests_count: 0,
    followers_count: followersCount,
    following_count: followingCount,
    fqn: parsed05?.handle || npub,
    header: banner,
    header_static: banner,
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
    statuses_count: statusesCount,
    url: Conf.local(`/users/${pubkey}`),
    username: parsed05?.nickname || npub.substring(0, 8),
    pleroma: {
      is_admin: user?.admin || false,
      is_moderator: user?.admin || false,
    },
  };
}

function accountFromPubkey(pubkey: string, opts: ToAccountOpts = {}) {
  const event: UnsignedEvent<0> = {
    kind: 0,
    pubkey,
    content: '',
    tags: [],
    created_at: nostrNow(),
  };

  return toAccount(event, opts);
}

async function parseAndVerifyNip05(nip05: string | undefined, pubkey: string): Promise<Nip05 | undefined> {
  if (nip05 && await verifyNip05Cached(nip05, pubkey)) {
    return parseNip05(nip05);
  }
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

async function toStatus(event: Event<1>, viewerPubkey?: string) {
  const profile = await getAuthor(event.pubkey);
  const account = profile ? await toAccount(profile) : await accountFromPubkey(event.pubkey);

  const replyTag = findReplyTag(event);

  const mentionedPubkeys = [
    ...new Set(
      event.tags
        .filter((tag) => tag[0] === 'p')
        .map((tag) => tag[1]),
    ),
  ];

  const { html, links, firstUrl } = parseNoteContent(event.content);

  const [mentions, card, repliesCount, reblogsCount, favouritesCount, [repostEvent], [reactionEvent]] = await Promise
    .all([
      Promise.all(mentionedPubkeys.map(toMention)),
      firstUrl ? unfurlCardCached(firstUrl) : null,
      eventsDB.countFilters([{ kinds: [1], '#e': [event.id] }]),
      eventsDB.countFilters([{ kinds: [6], '#e': [event.id] }]),
      eventsDB.countFilters([{ kinds: [7], '#e': [event.id] }]),
      viewerPubkey
        ? eventsDB.getFilters([{ kinds: [6], '#e': [event.id], authors: [viewerPubkey] }], { limit: 1 })
        : [],
      viewerPubkey
        ? eventsDB.getFilters([{ kinds: [7], '#e': [event.id], authors: [viewerPubkey] }], { limit: 1 })
        : [],
    ]);

  const content = buildInlineRecipients(mentions) + html;

  const cw = event.tags.find(isCWTag);
  const subject = event.tags.find((tag) => tag[0] === 'subject');

  const mediaLinks = getMediaLinks(links);

  const mediaTags: DittoAttachment[] = event.tags
    .filter((tag) => tag[0] === 'media')
    .map(([_, url, json]) => ({ url, data: jsonMediaDataSchema.parse(json) }));

  const media = [...mediaLinks, ...mediaTags];

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
    favourited: reactionEvent?.content === '+',
    reblogged: Boolean(repostEvent),
    muted: false,
    bookmarked: false,
    reblog: null,
    application: null,
    media_attachments: media.map(renderAttachment),
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

function toEmojis(event: UnsignedEvent) {
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

function toNotification(event: Event, viewerPubkey?: string) {
  switch (event.kind) {
    case 1:
      return toNotificationMention(event as Event<1>, viewerPubkey);
  }
}

async function toNotificationMention(event: Event<1>, viewerPubkey?: string) {
  const status = await toStatus(event, viewerPubkey);
  if (!status) return;

  return {
    id: event.id,
    type: 'mention',
    created_at: nostrDate(event.created_at).toISOString(),
    account: status.account,
    status: status,
  };
}

export { accountFromPubkey, toAccount, toNotification, toRelationship, toStatus };
