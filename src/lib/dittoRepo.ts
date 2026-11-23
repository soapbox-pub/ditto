import { nip19 } from 'nostr-tools';

import { DITTO_RELAY, NGIT_RELAY } from '@/lib/appRelays';

/** Team Soapbox, owner of Ditto's NIP-34 repository announcement. */
export const DITTO_REPO_OWNER = '781a1527055f74c1f70230f10384609b34548f8ab6a0a6caa74025827f9fdae5';

/** Relays from the repository announcement, where its issues belong. */
export const DITTO_REPO_RELAYS = [NGIT_RELAY, 'wss://git.shakespeare.diy/', DITTO_RELAY];

/** `a` coordinate of the repository announcement (kind 30617). */
export const DITTO_REPO_COORD = `30617:${DITTO_REPO_OWNER}:ditto`;

export const DITTO_REPO_NADDR = nip19.naddrEncode({
  kind: 30617,
  pubkey: DITTO_REPO_OWNER,
  identifier: 'ditto',
  relays: DITTO_REPO_RELAYS,
});

/** In-app path to Ditto's repository, where filed bug reports show up. */
export const DITTO_REPO_PATH = `/${DITTO_REPO_NADDR}`;
