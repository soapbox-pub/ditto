import { isCWTag } from 'https://gitlab.com/soapbox-pub/mostr/-/raw/c67064aee5ade5e01597c6d23e22e53c628ef0e2/src/nostr/tags.ts';

import { Conf } from '@/config.ts';
import { nip19 } from '@/deps.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getMediaLinks, parseNoteContent } from '@/note.ts';
import { getAuthor, getEvent } from '@/queries.ts';
import { jsonMediaDataSchema } from '@/schemas/nostr.ts';
import { eventsDB } from '@/storages.ts';
import { findReplyTag } from '@/tags.ts';
import { nostrDate } from '@/utils.ts';
import { unfurlCardCached } from '@/utils/unfurl.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { DittoAttachment, renderAttachment } from '@/views/mastodon/attachments.ts';
import { renderEmojis } from '@/views/mastodon/emojis.ts';

async function renderStatus(event: DittoEvent, viewerPubkey?: string) {
  const account = event.author
    ? await renderAccount({ ...event.author, author_stats: event.author_stats })
    : await accountFromPubkey(event.pubkey);

  const replyTag = findReplyTag(event.tags);

  const mentionedPubkeys = [
    ...new Set(
      event.tags
        .filter((tag) => tag[0] === 'p')
        .map((tag) => tag[1]),
    ),
  ];

  const { html, links, firstUrl } = parseNoteContent(event.content);

  const [mentions, card, relatedEvents] = await Promise
    .all([
      Promise.all(mentionedPubkeys.map(toMention)),
      firstUrl ? unfurlCardCached(firstUrl) : null,
      viewerPubkey
        ? await eventsDB.query([
          { kinds: [6], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
          { kinds: [7], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
          { kinds: [9734], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
          { kinds: [10001], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
          { kinds: [10003], '#e': [event.id], authors: [viewerPubkey], limit: 1 },
        ])
        : [],
    ]);

  const reactionEvent = relatedEvents.find((event) => event.kind === 7);
  const repostEvent = relatedEvents.find((event) => event.kind === 6);
  const pinEvent = relatedEvents.find((event) => event.kind === 10001);
  const bookmarkEvent = relatedEvents.find((event) => event.kind === 10003);
  const zapEvent = relatedEvents.find((event) => event.kind === 9734);

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
    replies_count: event.event_stats?.replies_count ?? 0,
    reblogs_count: event.event_stats?.reposts_count ?? 0,
    favourites_count: event.event_stats?.reactions_count ?? 0,
    favourited: reactionEvent?.content === '+',
    reblogged: Boolean(repostEvent),
    muted: false,
    bookmarked: Boolean(bookmarkEvent),
    pinned: Boolean(pinEvent),
    reblog: null,
    application: null,
    media_attachments: media.map(renderAttachment),
    mentions,
    tags: [],
    emojis: renderEmojis(event),
    poll: null,
    uri: Conf.local(`/posts/${event.id}`),
    url: Conf.local(`/posts/${event.id}`),
    zapped: Boolean(zapEvent),
  };
}

async function renderReblog(event: DittoEvent) {
  if (!event.author) return;

  const repostId = event.tags.find(([name]) => name === 'p')?.[1];
  event.repost = await getEvent(repostId, { kind: 1 });

  if (!event.repost) return;

  const reblog = await renderStatus(event.repost);
  reblog.reblogged = true;
  return {
    id: event.id,
    account: await renderAccount(event.author),
    reblogged: true,
    reblog,
  };
}

async function toMention(pubkey: string) {
  const author = await getAuthor(pubkey);
  const account = author ? await renderAccount(author) : undefined;

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

export { renderReblog, renderStatus };
