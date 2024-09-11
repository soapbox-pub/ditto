import { NSchema } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';
import { nostrNow } from '@/utils.ts';

const store = await Storages.db();

const [pubkeyOrNpub, role] = Deno.args;
const pubkey = pubkeyOrNpub.startsWith('npub1') ? nip19.decode(pubkeyOrNpub as `npub1${string}`).data : pubkeyOrNpub;

if (!NSchema.id().safeParse(pubkey).success) {
  console.error('Invalid pubkey');
  Deno.exit(1);
}

if (!['admin', 'user'].includes(role)) {
  console.error('Invalid role');
  Deno.exit(1);
}

const signer = new AdminSigner();
const admin = await signer.getPublicKey();

const [existing] = await store.query([{
  kinds: [30382],
  authors: [admin],
  '#d': [pubkey],
  limit: 1,
}]);

const prevTags = (existing?.tags ?? []).filter(([name, value]) => {
  if (name === 'd') {
    return false;
  }
  if (name === 'n' && value === 'admin') {
    return false;
  }
  return true;
});

const tags: string[][] = [
  ['d', pubkey],
];

if (role === 'admin') {
  tags.push(['n', 'admin']);
}

tags.push(...prevTags);

const event = await signer.signEvent({
  kind: 30382,
  tags,
  content: '',
  created_at: nostrNow(),
});

await store.event(event);

Deno.exit(0);
