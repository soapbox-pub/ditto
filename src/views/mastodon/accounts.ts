import { NSchema as n } from '@nostrify/nostrify';
import { nip19, UnsignedEvent } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { lodash } from '@/deps.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getLnurl } from '@/utils/lnurl.ts';
import { nip05Cache } from '@/utils/nip05.ts';
import { Nip05, nostrDate, nostrNow, parseNip05 } from '@/utils.ts';
import { renderEmojis } from '@/views/mastodon/emojis.ts';

interface ToAccountOpts {
  withSource?: boolean;
}

async function renderAccount(
  event: Omit<DittoEvent, 'id' | 'sig'>,
  opts: ToAccountOpts = {},
) {
  const { withSource = false } = opts;
  const { pubkey } = event;

  const {
    name,
    nip05,
    picture = Conf.local('/images/avi.png'),
    banner = Conf.local('/images/banner.png'),
    about,
    lud06,
    lud16,
  } = n.json().pipe(n.metadata()).catch({}).parse(event.content);

  const npub = nip19.npubEncode(pubkey);
  const parsed05 = await parseAndVerifyNip05(nip05, pubkey);
  const role = event.user?.tags.find(([name]) => name === 'role')?.[1] ?? 'user';

  return {
    id: pubkey,
    acct: parsed05?.handle || npub,
    avatar: picture,
    avatar_static: picture,
    bot: false,
    created_at: nostrDate(event.user?.created_at ?? event.created_at).toISOString(),
    discoverable: true,
    display_name: name,
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
      is_registered: Boolean(event.user),
    },
    pleroma: {
      is_admin: role === 'admin',
      is_moderator: ['admin', 'moderator'].includes(role),
      is_local: parsed05?.domain === Conf.url.host,
    },
    nostr: {
      pubkey,
    },
  };
}

function accountFromPubkey(pubkey: string, opts: ToAccountOpts = {}) {
  const event: UnsignedEvent = {
    kind: 0,
    pubkey,
    content: '',
    tags: [],
    created_at: nostrNow(),
  };

  return renderAccount(event, opts);
}

async function parseAndVerifyNip05(
  nip05: string | undefined,
  pubkey: string,
  signal = AbortSignal.timeout(3000),
): Promise<Nip05 | undefined> {
  if (!nip05) return;
  try {
    const result = await nip05Cache.fetch(nip05, { signal });
    if (result.pubkey === pubkey) {
      return parseNip05(nip05);
    }
  } catch (_e) {
    // do nothing
  }
}

export { accountFromPubkey, renderAccount };
