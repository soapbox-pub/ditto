import { assertEquals } from '@std/assert';

import { getUrlMediaType, isPermittedMediaType } from '@/utils/media.ts';

Deno.test('getUrlMediaType', () => {
  assertEquals(getUrlMediaType('https://example.com/image.png'), 'image/png');
  assertEquals(getUrlMediaType('https://example.com/index.html'), 'text/html');
  assertEquals(getUrlMediaType('https://example.com/yolo'), undefined);
  assertEquals(getUrlMediaType('https://example.com/'), undefined);
  assertEquals(
    getUrlMediaType('https://gitlab.com/soapbox-pub/nostrify/-/blob/main/packages/policies/WoTPolicy.ts'),
    'application/typescript',
  );
});

Deno.test('isPermittedMediaType', () => {
  assertEquals(isPermittedMediaType('image/png', ['image', 'video']), true);
  assertEquals(isPermittedMediaType('video/webm', ['image', 'video']), true);
  assertEquals(isPermittedMediaType('audio/ogg', ['image', 'video']), false);
  assertEquals(isPermittedMediaType('application/json', ['image', 'video']), false);
});
