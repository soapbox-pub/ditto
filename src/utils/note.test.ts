import { assertEquals } from '@std/assert';

import { getMediaLinks, parseNoteContent } from '@/utils/note.ts';

Deno.test('parseNoteContent', () => {
  const { html, links, firstUrl } = parseNoteContent('Hello, world!');
  assertEquals(html, 'Hello, world!');
  assertEquals(links, []);
  assertEquals(firstUrl, undefined);
});

Deno.test('getMediaLinks', () => {
  const links = [
    { href: 'https://example.com/image.png' },
    { href: 'https://example.com/index.html' },
    { href: 'https://example.com/yolo' },
    { href: 'https://example.com/' },
  ];
  const mediaLinks = getMediaLinks(links);
  assertEquals(mediaLinks, [
    {
      url: 'https://example.com/image.png',
      data: {
        mime: 'image/png',
      },
    },
  ]);
});
