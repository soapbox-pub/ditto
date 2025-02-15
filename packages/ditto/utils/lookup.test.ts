import { assertEquals } from '@std/assert';

import { extractIdentifier } from './lookup.ts';

Deno.test('extractIdentifier', () => {
  assertEquals(
    extractIdentifier('https://njump.me/npub1q3sle0kvfsehgsuexttt3ugjd8xdklxfwwkh559wxckmzddywnws6cd26p'),
    'npub1q3sle0kvfsehgsuexttt3ugjd8xdklxfwwkh559wxckmzddywnws6cd26p',
  );
  assertEquals(
    extractIdentifier('npub1q3sle0kvfsehgsuexttt3ugjd8xdklxfwwkh559wxckmzddywnws6cd26p'),
    'npub1q3sle0kvfsehgsuexttt3ugjd8xdklxfwwkh559wxckmzddywnws6cd26p',
  );
  assertEquals(
    extractIdentifier('alex'),
    undefined,
  );
});
