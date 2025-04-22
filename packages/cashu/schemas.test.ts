import { NSchema as n } from '@nostrify/nostrify';
import { assertEquals } from '@std/assert';

import { proofSchema } from './schemas.ts';
import { tokenEventSchema } from './schemas.ts';

Deno.test('Parse proof', () => {
  const proof =
    '{"id":"004f7adf2a04356c","amount":1,"secret":"6780378b186cf7ada639ce4807803ad5e4a71217688430512f35074f9bca99c0","C":"03f0dd8df04427c8c53e4ae9ce8eb91c4880203d6236d1d745c788a5d7a47aaff3","dleq":{"e":"bd22fcdb7ede1edb52b9b8c6e1194939112928e7b4fc0176325e7671fb2bd351","s":"a9ad015571a0e538d62966a16d2facf806fb956c746a3dfa41fa689486431c67","r":"b283980e30bf5a31a45e5e296e93ae9f20bf3a140c884b3b4cd952dbecc521df"}}';

  assertEquals(n.json().pipe(proofSchema).safeParse(proof).success, true);
  assertEquals(n.json().pipe(proofSchema).safeParse(JSON.parse(proof)).success, false);
  assertEquals(proofSchema.safeParse(JSON.parse(proof)).success, true);
  assertEquals(proofSchema.safeParse(proof).success, false);
});

Deno.test('Parse token', () => {
  const proof = {
    'id': '004f7adf2a04356c',
    'amount': 1,
    'secret': '6780378b186cf7ada639ce4807803ad5e4a71217688430512f35074f9bca99c0',
    'C': '03f0dd8df04427c8c53e4ae9ce8eb91c4880203d6236d1d745c788a5d7a47aaff3',
    'dleq': {
      'e': 'bd22fcdb7ede1edb52b9b8c6e1194939112928e7b4fc0176325e7671fb2bd351',
      's': 'a9ad015571a0e538d62966a16d2facf806fb956c746a3dfa41fa689486431c67',
      'r': 'b283980e30bf5a31a45e5e296e93ae9f20bf3a140c884b3b4cd952dbecc521df',
    },
  };
  const token = JSON.stringify({
    mint: 'https://mint-fashion.com',
    proofs: [proof],
    del: [],
  });

  assertEquals(n.json().pipe(tokenEventSchema).safeParse(token).success, true);
  assertEquals(n.json().pipe(tokenEventSchema).safeParse(JSON.parse(token)).success, false);
  assertEquals(tokenEventSchema.safeParse(JSON.parse(token)).success, true);
  assertEquals(tokenEventSchema.safeParse(tokenEventSchema).success, false);
});
