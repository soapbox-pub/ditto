import { NSchema as n } from '@nostrify/nostrify';
import { nip19, UnsignedEvent } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { metadataSchema } from '@/schemas/nostr.ts';
import { getLnurl } from '@/utils/lnurl.ts';
import { contentToHtml } from '@/utils/note.ts';
import { getTagSet } from '@/utils/tags.ts';
import { nostrDate, nostrNow, parseNip05 } from '@/utils.ts';
import { renderEmojis } from '@/views/mastodon/emojis.ts';

import type { MastodonAccount } from '@ditto/mastoapi/types';

type ToAccountOpts = {
  withSource: true;
  settingsStore: Record<string, unknown> | undefined;
} | {
  withSource?: false;
};

function renderAccount(event: Omit<DittoEvent, 'id' | 'sig'>, opts: ToAccountOpts = {}): MastodonAccount {
  const { pubkey } = event;

  const stats = event.author_stats;
  const names = getTagSet(event.user?.tags ?? [], 'n');

  if (names.has('disabled')) {
    const account = accountFromPubkey(pubkey, opts);
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
    fields: _fields,
  } = n.json().pipe(metadataSchema).catch({}).parse(event.content);

  const npub = nip19.npubEncode(pubkey);
  const nprofile = nip19.nprofileEncode({ pubkey, relays: [Conf.relay] });
  const parsed05 = stats?.nip05 ? parseNip05(stats.nip05) : undefined;
  const acct = parsed05?.handle || npub;

  const html = contentToHtml(about || '', [], { conf: Conf });

  const fields = _fields
    ?.slice(0, Conf.profileFields.maxFields)
    .map(([name, value]) => ({
      name: name.slice(0, Conf.profileFields.nameLength),
      value: value.slice(0, Conf.profileFields.valueLength),
      verified_at: null,
    })) ?? [];

  let streakDays = 0;
  let streakStart = stats?.streak_start ?? null;
  let streakEnd = stats?.streak_end ?? null;
  const { streakWindow } = Conf;

  if (streakStart && streakEnd) {
    const broken = nostrNow() - streakEnd > streakWindow;
    if (broken) {
      streakStart = null;
      streakEnd = null;
    } else {
      const delta = streakEnd - streakStart;
      streakDays = Math.max(Math.ceil(delta / 86400), 1);
    }
  }

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
    fields: fields.map((field) => ({ ...field, value: contentToHtml(field.value, [], { conf: Conf }) })),
    follow_requests_count: 0,
    followers_count: stats?.followers_count ?? 0,
    following_count: stats?.following_count ?? 0,
    fqn: parsed05?.handle || npub,
    header: banner,
    header_static: banner,
    last_status_at: null,
    locked: false,
    note: html,
    roles: [],
    source: opts.withSource
      ? {
        fields,
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
    statuses_count: stats?.notes_count ?? 0,
    uri: Conf.local(`/users/${acct}`),
    url: Conf.local(`/@${acct}`),
    username: parsed05?.nickname || npub.substring(0, 8),
    ditto: {
      accepts_zaps: Boolean(getLnurl({ lud06, lud16 })),
      accepts_zaps_cashu: Boolean(event?.accepts_zaps_cashu),
      external_url: Conf.external(nprofile),
      streak: {
        days: streakDays,
        start: streakStart ? nostrDate(streakStart).toISOString() : null,
        end: streakEnd ? nostrDate(streakEnd).toISOString() : null,
        expires: streakEnd ? nostrDate(streakEnd + streakWindow).toISOString() : null,
      },
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
      favicon: stats?.favicon,
    },
    nostr: {
      pubkey,
      lud16,
    },
    website: website && /^https?:\/\//.test(website) ? website : undefined,
  };
}

function accountFromPubkey(pubkey: string, opts: ToAccountOpts = {}): MastodonAccount {
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
