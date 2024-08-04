import { Storages } from '@/storages.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { nip19 } from 'nostr-tools';
import { match } from 'path-to-regexp';
import { nip05Cache } from '@/utils/nip05.ts';
import { NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { getAuthor, getEvent } from '@/queries.ts';

export interface OpenGraphTemplateOpts {
  title: string;
  type: 'article' | 'profile' | 'website';
  url: string;
  image?: StatusInfo['image'];
  description: string;
}

export type PathParams = Partial<Record<'statusId' | 'acct' | 'note' | 'nevent' | 'nprofile' | 'npub', string>>;

interface StatusInfo {
  description: string;
  image?: {
    url: string;
    w: number;
    h: number;
    alt?: string;
  };
}

const store = await Storages.db();
export const getInstanceName = async () => {
  const meta = await getInstanceMetadata(store, AbortSignal.timeout(1000));
  return meta?.name || 'Ditto';
};

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
    console.log(params);
    return params;
  }
}

async function urlParamToPubkey(handle: string) {
  const id = `${handle}`;
  const parts = id.match(/(?:(.+))?@(.+)/);
  if (parts) {
    const key = `${parts[1] || ''}@${parts[2]}`;
    return await nip05Cache.fetch(key, { signal: AbortSignal.timeout(1000) }).then((res) => res.pubkey);
  } else if (id.startsWith('npub1')) {
    return nip19.decode(id as `npub1${string}`).data;
  } else if (/(?:[0-9]|[a-f]){64}/.test(id)) {
    return id;
  }

  // shouldn't ever happen for a well-formed link
  return '';
}

export async function getProfileInfo(handle: string | undefined): Promise<NostrMetadata> {
  const id = await urlParamToPubkey(handle || '');
  const kind0 = await getAuthor(id);

  const short = nip19.npubEncode(id).substring(0, 8);
  const blank = { name: short, about: `@${short}'s ditto profile` };
  if (!kind0) return blank;

  return Object.assign(
    blank,
    n.json().pipe(n.metadata()).parse(kind0.content),
  );
}

const truncate = (s: string, len: number, ellipsis = '...') => {
  if (s.length <= len) return s;
  return s.slice(0, len) + ellipsis;
};

export async function getStatusInfo(id: string | undefined, handle?: string): Promise<StatusInfo> {
  const event = await getEvent(id || '');
  if (!event || !id) {
    return { description: `A post on Ditto by @${handle}` };
  }

  const res: StatusInfo = {
    description: event.content
      .replace(/nostr:(npub1(?:[0-9]|[a-z]){58})/g, (_, key: string) => `@${key.slice(0, 8)}`),
  };

  let url: string;
  let w: number;
  let h: number;

  for (const [tag, ...values] of event.tags) {
    if (tag !== 'imeta') continue;
    for (const value of values) {
      const [item, datum] = value.split(' ');
      if (!['dim', 'url'].includes(item)) continue;
      if (item === 'dim') {
        [w, h] = datum.split('x').map(Number);
      } else if (item === 'url') {
        url = datum;
      }
    }
  }

  // @ts-ignore conditional assign
  if (url && w && h) {
    res.image = { url, w, h };
    res.description = res.description.replace(url.trim(), '');
  }

  // needs to be done last incase the image url was surrounded by newlines
  res.description = truncate(res.description.trim(), 140);
  return res;
}
