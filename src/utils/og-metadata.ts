import { NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { getEvent } from '@/queries.ts';
import { nip19 } from 'nostr-tools';
import { match } from 'path-to-regexp';

import { lookupAccount, lookupPubkey } from '@/utils/lookup.ts';
import { parseAndVerifyNip05 } from '@/utils/nip05.ts';

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

type ProfileInfo = { name: string; about: string } & NostrMetadata;

/**
 * Look up the name and bio of a user for use in generating OpenGraph metadata.
 *
 * @param handle The bech32 / nip05 identifier for the user, obtained from the URL.
 * @returns An object containing the `name` and `about` fields of the user's kind 0,
 * or sensible defaults if the kind 0 has those values missing.
 */
export async function getProfileInfo(handle: string | undefined): Promise<ProfileInfo> {
  const acc = await lookupAccount(handle || '');
  if (!acc) throw new Error('Invalid handle specified, or account not found.');

  const short = nip19.npubEncode(acc.id).slice(0, 8);
  const { name = short, about = `@${short}'s Nostr profile` } = n.json().pipe(n.metadata()).parse(acc.content);

  return { name, about };
}

function truncate(s: string, len: number, ellipsis = '…') {
  if (s.length <= len) return s;
  return s.slice(0, len) + ellipsis;
}

export async function getHandle(id: string, name?: string | undefined) {
  const pubkey = /[a-z][0-9]{64}/.test(id) ? id : await lookupPubkey(id);
  if (!pubkey) throw new Error('Invalid user identifier');
  const parsed = await parseAndVerifyNip05(id, pubkey);
  return parsed?.handle || name || 'npub1xxx';
}

export async function getStatusInfo(id: string): Promise<StatusInfo> {
  const event = await getEvent(id);
  if (!id || !event) throw new Error('Invalid post id supplied');

  const handle = await getHandle(event.pubkey);
  const res: StatusInfo = {
    title: `View @${handle}'s post on Ditto`,
    description: event.content
      .replace(/nostr:(npub1(?:[0-9]|[a-z]){58})/g, (_, key: string) => `@${key.slice(0, 8)}`),
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
