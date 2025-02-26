import { nip19 } from 'nostr-tools';
import { match } from 'path-to-regexp';

import { InstanceMetadata } from '@/utils/instance.ts';

import type { MastodonAccount, MastodonStatus } from '@ditto/mastoapi/types';

export interface MetadataEntities {
  status?: MastodonStatus;
  account?: MastodonAccount;
  instance: InstanceMetadata;
}

export interface MetadataPathParams {
  statusId?: string;
  acct?: string;
  bech32?: string;
}

/** URL routes to serve metadata on. */
const SSR_ROUTES = [
  '/\\@:acct/posts/:statusId',
  '/\\@:acct/:statusId',
  '/\\@:acct',
  '/users/:acct/statuses/:statusId',
  '/users/:acct',
  '/statuses/:statusId',
  '/notice/:statusId',
  '/posts/:statusId',
  '/:bech32',
] as const;

const SSR_ROUTE_MATCHERS = SSR_ROUTES.map((route) => match(route));

export function getPathParams(path: string): MetadataPathParams | undefined {
  for (const matcher of SSR_ROUTE_MATCHERS) {
    const result = matcher(path);
    if (!result) continue;

    const params: MetadataPathParams = result.params;

    if (params.bech32) {
      try {
        const decoded = nip19.decode(params.bech32);
        switch (decoded.type) {
          case 'nevent':
            params.statusId = decoded.data.id;
            break;
          case 'note':
            params.statusId = decoded.data;
            break;
          case 'nprofile':
            params.acct = decoded.data.pubkey;
            break;
          case 'npub':
            params.acct = decoded.data;
            break;
        }
      } catch {
        // fall through
      }
    }

    return params;
  }
}
