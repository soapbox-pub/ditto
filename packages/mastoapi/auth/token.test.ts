import { assertEquals } from '@std/assert';
import { decodeHex, encodeHex } from '@std/encoding/hex';

import { generateToken, getTokenHash } from './token.ts';

Deno.test('generateToken', async () => {
  const sk = decodeHex('a0968751df8fd42f362213f08751911672f2a037113b392403bbb7dd31b71c95');

  const { token, hash } = await generateToken(sk);

  assertEquals(token, 'token15ztgw5wl3l2z7d3zz0cgw5v3zee09gphzyanjfqrhwma6vdhrj2sauwknd');
  assertEquals(encodeHex(hash), 'ab4c4ead4d1c72a38fffd45b999937b7e3f25f867b19aaf252df858e77b66a8a');
});

Deno.test('getTokenHash', async () => {
  const hash = await getTokenHash('token15ztgw5wl3l2z7d3zz0cgw5v3zee09gphzyanjfqrhwma6vdhrj2sauwknd');
  assertEquals(encodeHex(hash), 'ab4c4ead4d1c72a38fffd45b999937b7e3f25f867b19aaf252df858e77b66a8a');
});
