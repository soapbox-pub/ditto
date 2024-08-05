import { NostrEvent, NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { getAuthor, getEvent } from '@/queries.ts';
import { nip19, nip27 } from 'nostr-tools';
import { match } from 'path-to-regexp';

import { Stickynotes } from '@soapbox/stickynotes';
import { lookupPubkey } from '@/utils/lookup.ts';
import { parseAndVerifyNip05 } from '@/utils/nip05.ts';
import { parseNip05 } from '@/utils.ts';

const console = new Stickynotes('ditto:frontend');

export interface OpenGraphTemplateOpts {
  title: string;
  type: 'article' | 'profile' | 'website';
  url: string;
  image?: StatusInfo['image'];
  description: string;
  site: string;
}

export type PathParams = Partial<Record<'statusId' | 'acct' | 'note' | 'nevent' | 'nprofile' | 'npub', string>>;

interface StatusInfo {
  title: string;
  description: string;
  image?: {
    url: string;
    w: number;
    h: number;
    alt?: string;
  };
}

/** URL routes to serve metadata on. */
const SSR_ROUTES = [
  '/@:acct/posts/:statusId',
  '/@:acct/:statusId',
  '/@:acct',
  '/users/:acct/statuses/:statusId',
  '/users/:acct',
  '/statuses/:statusId',
  '/notice/:statusId',
  '/posts/:statusId',
  '/note:note',
  '/nevent:nevent',
  '/nprofile:nprofile',
  '/npub:npub',
] as const;

const SSR_ROUTE_MATCHERS = SSR_ROUTES.map((route) => match(route, { decode: decodeURIComponent }));

export function getPathParams(path: string) {
  for (const matcher of SSR_ROUTE_MATCHERS) {
    const result = matcher(path);
    if (!result) continue;
    const params = result.params as PathParams;
    if (params.nevent) {
      const decoded = nip19.decode(`nevent${params.nevent}`).data as nip19.EventPointer;
      params.statusId = decoded.id;
    } else if (params.note) {
      params.statusId = nip19.decode(`note${params.note}`).data as string;
    }

    if (params.nprofile) {
      const decoded = nip19.decode(`nprofile${params.nprofile}`).data as nip19.ProfilePointer;
      params.acct = decoded.pubkey;
    } else if (params.npub) {
      params.acct = nip19.decode(`npub${params.npub}`).data as string;
    }
    return params;
  }
}

export async function fetchProfile(
  { pubkey, handle }: Partial<Record<'pubkey' | 'handle', string>>,
): Promise<ProfileInfo> {
  if (!handle && !pubkey) {
    throw new Error('Tried to fetch kind 0 with no args');
  }

  if (handle) pubkey = await lookupPubkey(handle);
  if (!pubkey) throw new Error('NIP-05 or bech32 specified and no pubkey found');

  const author = await getAuthor(pubkey);
  if (!author) throw new Error(`Author not found for pubkey ${pubkey}`);

  return {
    meta: n.json()
      .pipe(n.metadata())
      .parse(author.content),
    event: author,
  };
}

type ProfileInfo = { meta: NostrMetadata; event: NostrEvent };

function truncate(s: string, len: number, ellipsis = '…') {
  if (s.length <= len) return s;
  return s.slice(0, len) + ellipsis;
}

/**
 * @param id A nip-05 identifier, bech32 encoded npub/nprofile, or a pubkey
 * @param acc A ProfileInfo object, if you've already fetched it then this is used to build a handle.
 * @returns The handle
 */
export async function getHandle(id: string, acc?: ProfileInfo) {
  let handle: string | undefined = '';

  const handlePubkey = async (pubkey: string) => {
    const fallback = nip19.npubEncode(pubkey).slice(0, 8);
    try {
      const author = acc || await fetchProfile({ pubkey });
      if (author.meta.nip05) return parseNip05(author.meta.nip05).handle;
      else if (author.meta.name) return author.meta.name;
    } catch (e) {
      console.debug('Error in getHandle: ', e);
    }
    return fallback;
  };

  if (/[a-z0-9]{64}/.test(id)) {
    handle = await handlePubkey(id);
  } else if (n.bech32().safeParse(id).success) {
    if (id.startsWith('npub')) {
      handle = await handlePubkey(nip19.decode(id as `npub1${string}`).data);
    } else if (id.startsWith('nprofile')) {
      const decoded = nip19.decode(id as `nprofile1${string}`).data.pubkey;
      handle = await handlePubkey(decoded);
    } else {
      throw new Error('non-nprofile or -npub bech32 passed to getHandle()');
    }
  } else {
    const pubkey = await lookupPubkey(id);
    if (!pubkey) throw new Error('Invalid user identifier');
    const parsed = await parseAndVerifyNip05(id, pubkey);
    handle = parsed?.handle;
  }

  return handle || name || 'npub1xxx';
}

export async function getStatusInfo(id: string): Promise<StatusInfo> {
  const event = await getEvent(id);
  if (!id || !event) throw new Error('Invalid post id supplied');
  let title = 'View post on Ditto';
  try {
    const handle = await getHandle(event.pubkey);
    title = `View @${handle}'s post on Ditto`;
  } catch (e) {
    console.log(e);
  }
  const res: StatusInfo = {
    title,
    description: nip27.replaceAll(
      event.content,
      ({ decoded, value }) => decoded.type === 'npub' ? value.slice(0, 8) : '',
    ),
  };

  const data: string[][] = event.tags
    .find(([name]) => name === 'imeta')?.slice(1)
    .map((entry: string) => entry.split(' ')) ?? [];

  const url = data.find(([name]) => name === 'url')?.[1];
  const dim = data.find(([name]) => name === 'dim')?.[1];

  const [w, h] = dim?.split('x').map(Number) ?? [null, null];

  if (url && w && h) {
    res.image = { url, w, h };
    res.description = res.description.replace(url.trim(), '');
  }

  // needs to be done last incase the image url was surrounded by newlines
  res.description = truncate(res.description.trim(), 140);
  return res;
}
