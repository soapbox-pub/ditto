import { Conf } from '@/config.ts';
import { findUser } from '@/db/users.ts';
import { lodash, nip19, type UnsignedEvent } from '@/deps.ts';
import { jsonMetaContentSchema } from '@/schemas/nostr.ts';
import { type DittoEvent } from '@/storages/types.ts';
import { verifyNip05Cached } from '@/utils/nip05.ts';
import { Nip05, nostrDate, nostrNow, parseNip05 } from '@/utils.ts';
import { renderEmojis } from '@/views/mastodon/emojis.ts';

interface ToAccountOpts {
  withSource?: boolean;
}

async function renderAccount(
  event: Omit<DittoEvent<0>, 'id' | 'sig'>,
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
  } = jsonMetaContentSchema.parse(event.content);

  const npub = nip19.npubEncode(pubkey);

  const [user, parsed05] = await Promise.all([
    findUser({ pubkey }),
    parseAndVerifyNip05(nip05, pubkey),
  ]);

  return {
    id: pubkey,
    acct: parsed05?.handle || npub,
    avatar: picture,
    avatar_static: picture,
    bot: false,
    created_at: user ? user.inserted_at.toISOString() : nostrDate(event.created_at).toISOString(),
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
      }
      : undefined,
    statuses_count: event.author_stats?.notes_count ?? 0,
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

  return renderAccount(event, opts);
}

async function parseAndVerifyNip05(nip05: string | undefined, pubkey: string): Promise<Nip05 | undefined> {
  if (nip05 && await verifyNip05Cached(nip05, pubkey)) {
    return parseNip05(nip05);
  }
}

export { accountFromPubkey, renderAccount };
