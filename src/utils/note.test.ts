import { assertEquals } from '@std/assert';

import { eventFixture } from '@/test.ts';
import { getMediaLinks, parseNoteContent, stripimeta } from '@/utils/note.ts';

Deno.test('parseNoteContent', () => {
  const { html, links, firstUrl } = parseNoteContent('Hello, world!', []);
  assertEquals(html, 'Hello, world!');
  assertEquals(links, []);
  assertEquals(firstUrl, undefined);
});

Deno.test('parseNoteContent handles apostrophes', () => {
  const { html } = parseNoteContent(
    `did you see nostr:nprofile1qqsqgc0uhmxycvm5gwvn944c7yfxnnxm0nyh8tt62zhrvtd3xkj8fhgprdmhxue69uhkwmr9v9ek7mnpw3hhytnyv4mz7un9d3shjqgcwaehxw309ahx7umywf5hvefwv9c8qtmjv4kxz7gpzemhxue69uhhyetvv9ujumt0wd68ytnsw43z7s3al0v's speech?`,
    [{
      id: '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd',
      username: 'alex',
      acct: 'alex@gleasonator.dev',
      url: 'https://gleasonator.dev/@alex',
    }],
  );
  assertEquals(
    html,
    `did you see <span class="h-card"><a class="u-url mention" href="https://gleasonator.dev/@alex" rel="ugc">@<span>alex@gleasonator.dev</span></a></span>&apos;s speech?`,
  );
});

Deno.test("parseNoteContent doesn't parse invalid nostr URIs", () => {
  const { html } = parseNoteContent(`nip19 has URIs like nostr:npub and nostr:nevent, etc.`, []);
  assertEquals(html, 'nip19 has URIs like nostr:npub and nostr:nevent, etc.');
});

Deno.test('getMediaLinks', () => {
  const links = [
    { href: 'https://example.com/image.png' },
    { href: 'https://example.com/index.html' },
    { href: 'https://example.com/yolo' },
    { href: 'https://example.com/' },
  ];
  const mediaLinks = getMediaLinks(links);
  assertEquals(mediaLinks, [[
    ['url', 'https://example.com/image.png'],
    ['m', 'image/png'],
  ]]);
});

Deno.test('stripimeta', async () => {
  const { content, tags } = await eventFixture('event-imeta');

  const stripped = stripimeta(content, tags);
  const expected =
    `Today we were made aware of multiple Fediverse blog posts incorrectly attributing “vote Trump” spam on Bluesky to the Mostr.pub Bridge. \n\nThis spam is NOT coming from Mostr. From the screenshots used in these blogs, it's clear the spam is coming from an entirely different bridge called momostr.pink. This bridge is not affiliated with Mostr, and is not even a fork of Mostr. We appreciate that the authors of these posts responded quickly to us and have since corrected the blogs. \n\nMostr.pub uses stirfry policies for anti-spam filtering. This includes an anti-duplication policy that prevents spam like the recent “vote Trump” posts we’ve seen repeated over and over. \n\nIt is important to note WHY there are multiple bridges, though. \n\nWhen Mostr.pub launched, multiple major servers immediately blocked Mostr, including Mastodon.social. The moderators of Mastodon.social claimed that this was because Nostr was unregulated, and suggested to one user that if they want to bridge their account they should host their own bridge.\n\nThat is exactly what momostr.pink, the source of this spam, has done. \n\nThe obvious response to the censorship of the Mostr Bridge is to build more bridges. \n\nWhile we have opted for pro-social policies that aim to reduce spam and build better connections between decentralized platforms, other bridges built to get around censorship of the Mostr Bridge may not — as we’re already seeing.\n\nThere will inevitably be multiple bridges, and we’re working on creating solutions to the problems that arise from that. In the meantime, if the Fediverse could do itself a favor and chill with the censorship for two seconds, we might not have so many problems. `;

  assertEquals(stripped, expected);
});
