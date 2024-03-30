import { generateSecretKey, nip19 } from 'npm:nostr-tools';

const encodedNsec = generateEncodedPrivateKey();
console.log(encodedNsec);

function generateEncodedPrivateKey(): string {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);

  return nsec;
}
