import { isCWTag } from 'https://gitlab.com/soapbox-pub/mostr/-/raw/c67064aee5ade5e01597c6d23e22e53c628ef0e2/src/nostr/tags.ts';

import { Conf } from '@/config.ts';
import * as eventsDB from '@/db/events.ts';
import { type Event, findReplyTag, nip19 } from '@/deps.ts';
import { getMediaLinks, parseNoteContent } from '@/note.ts';
import { getAuthor, getFollows } from '@/queries.ts';
import { jsonMediaDataSchema } from '@/schemas/nostr.ts';
import { isFollowing, nostrDate } from '@/utils.ts';
import { unfurlCardCached } from '@/utils/unfurl.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { DittoAttachment, renderAttachment } from '@/views/mastodon/attachments.ts';
import { renderEmojis } from '@/views/mastodon/emojis.ts';

async function toMention(pubkey: string) {
  const profile = await getAuthor(pubkey);
  const account = profile ? await renderAccount(profile) : undefined;

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
  const account = profile ? await renderAccount(profile) : await accountFromPubkey(event.pubkey);

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
    emojis: renderEmojis(event),
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

export { accountFromPubkey, toNotification, toRelationship, toStatus };
