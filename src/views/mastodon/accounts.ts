import { NSchema as n } from '@nostrify/nostrify';
import { escape } from 'entities';
import { nip19, UnsignedEvent } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { MastodonAccount } from '@/entities/MastodonAccount.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getLnurl } from '@/utils/lnurl.ts';
import { parseAndVerifyNip05 } from '@/utils/nip05.ts';
import { getTagSet } from '@/utils/tags.ts';
import { nostrDate, nostrNow } from '@/utils.ts';
import { renderEmojis } from '@/views/mastodon/emojis.ts';

interface ToAccountOpts {
  withSource?: boolean;
}

async function renderAccount(
  event: Omit<DittoEvent, 'id' | 'sig'>,
  opts: ToAccountOpts = {},
): Promise<MastodonAccount> {
  const { withSource = false } = opts;
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
  const parsed05 = await parseAndVerifyNip05(nip05, pubkey);

  return {
    id: pubkey,
    acct: parsed05?.handle || npub,
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
    note: about ? escape(about) : '',
    roles: [],
    source: withSource
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
      }
      : undefined,
    statuses_count: event.author_stats?.notes_count ?? 0,
    url: Conf.local(`/users/${pubkey}`),
    username: parsed05?.nickname || npub.substring(0, 8),
    ditto: {
      accepts_zaps: Boolean(getLnurl({ lud06, lud16 })),
      external_url: Conf.external(npub),
    },
    pleroma: {
      deactivated: names.has('disabled'),
      is_admin: names.has('admin'),
      is_moderator: names.has('admin') || names.has('moderator'),
      is_suggested: names.has('suggested'),
      is_local: parsed05?.domain === Conf.url.host,
      settings_store: undefined as unknown,
      tags: [...getTagSet(event.user?.tags ?? [], 't')],
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
