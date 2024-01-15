import { assertEquals } from '@/deps-test.ts';

import { lnurlDecode, lnurlEncode } from './lnurl.ts';

const lnurl = 'lnurl1dp68gurn8ghj7um5v93kketj9ehx2amn9uh8wetvdskkkmn0wahz7mrww4excup0dajx2mrv92x9xp';
const url = 'https://stacker.news/.well-known/lnurlp/odell';

Deno.test('lnurlEncode', () => {
  assertEquals(lnurlEncode(url), lnurl);
});

Deno.test('lnurlDecode', () => {
  assertEquals(lnurlDecode(lnurl), url);
});
