import { generateSecretKey, nip19 } from 'nostr-tools';

const sk = generateSecretKey();
const nsec = nip19.nsecEncode(sk);

console.log(nsec);
