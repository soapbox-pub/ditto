import { NSchema as n } from '@nostrify/nostrify';
import { nip19, UnsignedEvent } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { MastodonAccount } from '@/entities/MastodonAccount.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getLnurl } from '@/utils/lnurl.ts';
import { parseAndVerifyNip05 } from '@/utils/nip05.ts';
import { parseNoteContent, stripimeta } from '@/utils/note.ts';
import { getTagSet } from '@/utils/tags.ts';
import { faviconCache } from '@/utils/favicon.ts';
import { nostrDate, nostrNow } from '@/utils.ts';
import { renderEmojis } from '@/views/mastodon/emojis.ts';

type ToAccountOpts = {
  withSource: true;
  settingsStore: Record<string, unknown> | undefined;
} | {
  withSource?: false;
};

async function renderAccount(
  event: Omit<DittoEvent, 'id' | 'sig'>,
  opts: ToAccountOpts = {},
  signal = AbortSignal.timeout(3000),
): Promise<MastodonAccount> {
  const { pubkey } = event;

  const names = getTagSet(event.user?.tags ?? [], 'n');
  if (names.has('disabled')) {
    const account = await accountFromPubkey(pubkey, opts);
    account.pleroma.deactivated = true;
    return account;
  }

  const {
    name,
    nip05,
    picture = Conf.local('/images/avi.png'),
    banner = Conf.local('/images/banner.png'),
    about,
    lud06,
    lud16,
    website,
  } = n.json().pipe(n.metadata()).catch({}).parse(event.content);

  const npub = nip19.npubEncode(pubkey);
  const nprofile = nip19.nprofileEncode({ pubkey, relays: [Conf.relay] });
  const parsed05 = await parseAndVerifyNip05(nip05, pubkey, signal);
  const acct = parsed05?.handle || npub;

  let favicon: URL | undefined;
  if (parsed05?.domain) {
    try {
      favicon = await faviconCache.fetch(parsed05.domain, { signal });
    } catch {
      favicon = new URL('/favicon.ico', `https://${parsed05.domain}/`);
    }
  }
  const { html } = parseNoteContent(stripimeta(about || '', event.tags), []);

  return {
    id: pubkey,
    acct,
    avatar: picture,
    avatar_static: picture,
    bot: false,
    created_at: nostrDate(event.user?.created_at ?? event.created_at).toISOString(),
    discoverable: true,
    display_name: name ?? '',
    emojis: renderEmojis(event),
    fields: [],
    follow_requests_count: 0,
    followers_count: event.author_stats?.followers_count ?? 0,
    following_count: event.author_stats?.following_count ?? 0,
    fqn: parsed05?.handle || npub,
    header: banner,
    header_static: banner,
    last_status_at: null,
    locked: false,
    note: html,
    roles: [],
    source: opts.withSource
      ? {
        fields: [],
        language: '',
        note: about || '',
        privacy: 'public',
        sensitive: false,
        follow_requests_count: 0,
        nostr: {
          nip05,
        },
        ditto: {
          captcha_solved: names.has('captcha_solved'),
        },
      }
      : undefined,
    statuses_count: event.author_stats?.notes_count ?? 0,
    uri: Conf.local(`/users/${acct}`),
    url: Conf.local(`/@${acct}`),
    username: parsed05?.nickname || npub.substring(0, 8),
    ditto: {
      accepts_zaps: Boolean(getLnurl({ lud06, lud16 })),
      external_url: Conf.external(nprofile),
    },
    domain: parsed05?.domain,
    pleroma: {
      deactivated: names.has('disabled'),
      is_admin: names.has('admin'),
      is_moderator: names.has('admin') || names.has('moderator'),
      is_suggested: names.has('suggested'),
      is_local: parsed05?.domain === Conf.url.host,
      settings_store: opts.withSource ? opts.settingsStore : undefined,
      tags: [...getTagSet(event.user?.tags ?? [], 't')],
      favicon: favicon?.toString(),
    },
    nostr: {
      pubkey,
      lud16,
    },
    website: website && /^https?:\/\//.test(website) ? website : undefined,
  };
}

function accountFromPubkey(pubkey: string, opts: ToAccountOpts = {}): Promise<MastodonAccount> {
  const event: UnsignedEvent = {
    kind: 0,
    pubkey,
    content: '',
    tags: [],
    created_at: nostrNow(),
  };

  return renderAccount(event, opts);
}

export { accountFromPubkey, renderAccount };
