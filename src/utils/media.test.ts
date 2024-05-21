import { assertEquals } from '@std/assert';

import { getUrlMediaType, isPermittedMediaType } from '@/utils/media.ts';

Deno.test('getUrlMediaType', () => {
  assertEquals(getUrlMediaType('https://example.com/image.png'), 'image/png');
  assertEquals(getUrlMediaType('https://example.com/index.html'), 'text/html');
  assertEquals(getUrlMediaType('https://example.com/yolo'), undefined);
  assertEquals(getUrlMediaType('https://example.com/'), undefined);
});

Deno.test('isPermittedMediaType', () => {
  assertEquals(isPermittedMediaType('image/png', ['image', 'video']), true);
  assertEquals(isPermittedMediaType('video/webm', ['image', 'video']), true);
  assertEquals(isPermittedMediaType('audio/ogg', ['image', 'video']), false);
  assertEquals(isPermittedMediaType('application/json', ['image', 'video']), false);
});
