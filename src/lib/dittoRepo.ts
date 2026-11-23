import { nip19 } from 'nostr-tools';

import { DITTO_RELAY, NGIT_RELAY } from '@/lib/appRelays';

/** Team Soapbox's NIP-34 repository announcement for Ditto, where its issues are filed. */
export const DITTO_REPO_NADDR = nip19.naddrEncode({
  kind: 30617,
  pubkey: '781a1527055f74c1f70230f10384609b34548f8ab6a0a6caa74025827f9fdae5',
  identifier: 'ditto',
  relays: [NGIT_RELAY, 'wss://git.shakespeare.diy/', DITTO_RELAY],
});

/** In-app path to Ditto's repository, used for bug reports. */
export const DITTO_REPO_PATH = `/${DITTO_REPO_NADDR}`;
