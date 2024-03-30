import { generateSecretKey, nip19 } from '@/deps.ts';

switch (Deno.args[0]) {
  default: {
    const encodedNsec = generateEncodedPrivateKey();
    console.log(encodedNsec);
    Deno.exit(0);
  }
}

function generateEncodedPrivateKey(): string {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);

  return nsec;
}
