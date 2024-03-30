import { generateSecretKey, nip19 } from 'npm:nostr-tools';

const sk = generateSecretKey();
const nsec = nip19.nsecEncode(sk);

console.log(nsec);
