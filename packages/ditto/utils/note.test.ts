import { DittoConf } from '@ditto/conf';
import { assertEquals } from '@std/assert';

import { eventFixture } from '@/test.ts';
import { contentToHtml, getCardUrl, getMediaLinks, stripMediaUrls } from '@/utils/note.ts';
import { genEvent } from '@nostrify/nostrify/test';

Deno.test('contentToHtml', () => {
  const conf = new DittoConf(new Map());
  const html = contentToHtml('Hello, world!', [], { conf });

  assertEquals(html, 'Hello, world!');
});

Deno.test('contentToHtml parses URLs', () => {
  const conf = new DittoConf(new Map());
  const html = contentToHtml('check out my website: https://alexgleason.me', [], { conf });

  assertEquals(html, 'check out my website: <a href="https://alexgleason.me">https://alexgleason.me</a>');
});

Deno.test('contentToHtml parses bare URLs', () => {
  const conf = new DittoConf(new Map());
  const html = contentToHtml('have you seen ditto.pub?', [], { conf });

  assertEquals(html, 'have you seen <a href="http://ditto.pub">ditto.pub</a>?');
});

Deno.test('contentToHtml parses mentions with apostrophes', () => {
  const conf = new DittoConf(new Map());

  const html = contentToHtml(
    `did you see nostr:nprofile1qqsqgc0uhmxycvm5gwvn944c7yfxnnxm0nyh8tt62zhrvtd3xkj8fhgprdmhxue69uhkwmr9v9ek7mnpw3hhytnyv4mz7un9d3shjqgcwaehxw309ahx7umywf5hvefwv9c8qtmjv4kxz7gpzemhxue69uhhyetvv9ujumt0wd68ytnsw43z7s3al0v's speech?`,
    [{
      id: '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd',
      username: 'alex',
      acct: 'alex@gleasonator.dev',
      url: 'https://gleasonator.dev/@alex',
    }],
    { conf },
  );

  assertEquals(
    html,
    'did you see <span class="h-card"><a class="u-url mention" href="https://gleasonator.dev/@alex" rel="ugc">@<span>alex@gleasonator.dev</span></a></span>&apos;s speech?',
  );
});

Deno.test('contentToHtml parses mentions with commas', () => {
  const conf = new DittoConf(new Map());

  const html = contentToHtml(
    `Sim. Hi nostr:npub1q3sle0kvfsehgsuexttt3ugjd8xdklxfwwkh559wxckmzddywnws6cd26p and nostr:npub1gujeqakgt7fyp6zjggxhyy7ft623qtcaay5lkc8n8gkry4cvnrzqd3f67z, any chance to have Cobrafuma as PWA?`,
    [{
      id: '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd',
      username: 'alex',
      acct: 'alex@gleasonator.dev',
      url: 'https://gleasonator.dev/@alex',
    }, {
      id: '47259076c85f9240e852420d7213c95e95102f1de929fb60f33a2c32570c98c4',
      username: 'patrick',
      acct: 'patrick@patrickdosreis.com',
      url: 'https://gleasonator.dev/@patrick@patrickdosreis.com',
    }],
    { conf },
  );

  assertEquals(
    html,
    'Sim. Hi <span class="h-card"><a class="u-url mention" href="https://gleasonator.dev/@alex" rel="ugc">@<span>alex@gleasonator.dev</span></a></span> and <span class="h-card"><a class="u-url mention" href="https://gleasonator.dev/@patrick@patrickdosreis.com" rel="ugc">@<span>patrick@patrickdosreis.com</span></a></span>, any chance to have Cobrafuma as PWA?',
  );
});

Deno.test("contentToHtml doesn't parse invalid nostr URIs", () => {
  const conf = new DittoConf(new Map());
  const html = contentToHtml('nip19 has URIs like nostr:npub and nostr:nevent, etc.', [], { conf });
  assertEquals(html, 'nip19 has URIs like nostr:npub and nostr:nevent, etc.');
});

Deno.test('contentToHtml renders empty for non-profile nostr URIs', () => {
  const conf = new DittoConf(new Map());

  const html = contentToHtml(
    'nostr:nevent1qgsr9cvzwc652r4m83d86ykplrnm9dg5gwdvzzn8ameanlvut35wy3gpz3mhxue69uhhztnnwashymtnw3ezucm0d5qzqru8mkz2q4gzsxg99q7pdneyx7n8p5u0afe3ntapj4sryxxmg4gpcdvgce',
    [],
    { conf },
  );

  assertEquals(html, '');
});

Deno.test("contentToHtml doesn't fuck up links to my own post", () => {
  const conf = new DittoConf(new Map());

  const html = contentToHtml(
    'Check this post: https://gleasonator.dev/@alex@gleasonator.dev/posts/a8badb480d88f9e7b6a090342279ef47ed0e0a3989ed85f898dfedc6be94225f',
    [{
      id: '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd',
      username: 'alex',
      acct: 'alex@gleasonator.dev',
      url: 'https://gleasonator.dev/@alex',
    }],
    { conf },
  );

  assertEquals(
    html,
    'Check this post: <a href="https://gleasonator.dev/@alex@gleasonator.dev/posts/a8badb480d88f9e7b6a090342279ef47ed0e0a3989ed85f898dfedc6be94225f">https://gleasonator.dev/@alex@gleasonator.dev/posts/a8badb480d88f9e7b6a090342279ef47ed0e0a3989ed85f898dfedc6be94225f</a>',
  );
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

Deno.test('stripMediaUrls', async () => {
  const { content, tags } = await eventFixture('event-imeta');

  const media: string[][][] = tags
    .filter(([name]) => name === 'imeta')
    .map(([_, ...entries]) =>
      entries.map((entry) => {
        const split = entry.split(' ');
        return [split[0], split.splice(1).join(' ')];
      })
    );

  const stripped = stripMediaUrls(content, media);

  const expected =
    `Today we were made aware of multiple Fediverse blog posts incorrectly attributing “vote Trump” spam on Bluesky to the Mostr.pub Bridge. \n\nThis spam is NOT coming from Mostr. From the screenshots used in these blogs, it's clear the spam is coming from an entirely different bridge called momostr.pink. This bridge is not affiliated with Mostr, and is not even a fork of Mostr. We appreciate that the authors of these posts responded quickly to us and have since corrected the blogs. \n\nMostr.pub uses stirfry policies for anti-spam filtering. This includes an anti-duplication policy that prevents spam like the recent “vote Trump” posts we’ve seen repeated over and over. \n\nIt is important to note WHY there are multiple bridges, though. \n\nWhen Mostr.pub launched, multiple major servers immediately blocked Mostr, including Mastodon.social. The moderators of Mastodon.social claimed that this was because Nostr was unregulated, and suggested to one user that if they want to bridge their account they should host their own bridge.\n\nThat is exactly what momostr.pink, the source of this spam, has done. \n\nThe obvious response to the censorship of the Mostr Bridge is to build more bridges. \n\nWhile we have opted for pro-social policies that aim to reduce spam and build better connections between decentralized platforms, other bridges built to get around censorship of the Mostr Bridge may not — as we’re already seeing.\n\nThere will inevitably be multiple bridges, and we’re working on creating solutions to the problems that arise from that. In the meantime, if the Fediverse could do itself a favor and chill with the censorship for two seconds, we might not have so many problems. `;

  assertEquals(stripped, expected);
});

Deno.test('getCardUrl', async (t) => {
  await t.step('returns undefined for an event with no URLs', () => {
    const result = getCardUrl(genEvent({ kind: 1, content: 'Hello, world!' }));
    assertEquals(result, undefined);
  });

  await t.step('returns the first URL for an event with a URL', () => {
    const result = getCardUrl(genEvent({ kind: 1, content: 'https://soapbox.pub' }));
    assertEquals(result, 'https://soapbox.pub');
  });

  await t.step('returns the first URL for an event with multiple URLs', () => {
    const result = getCardUrl(genEvent({ kind: 1, content: 'https://ditto.pub https://soapbox.pub' }));
    assertEquals(result, 'https://ditto.pub');
  });

  await t.step('returns the first non-media URL (by file extension) in an event without imeta tags', () => {
    const result = getCardUrl(genEvent({ kind: 1, content: 'https://i.nostr.build/video.mp4 https://ditto.pub' }));
    assertEquals(result, 'https://ditto.pub');
  });

  await t.step('returns the first non-media URL in an event with imeta tags', () => {
    const result = getCardUrl(genEvent({
      kind: 1,
      content: 'https://i.nostr.build/video https://ditto.pub',
      tags: [['imeta', 'url https://i.nostr.build/video']],
    }));

    assertEquals(result, 'https://ditto.pub');
  });

  await t.step('returns undefined in an event with multiple imeta tags and no other URLs', () => {
    const result = getCardUrl(genEvent({
      kind: 1,
      content: 'https://i.nostr.build/video https://ditto.pub',
      tags: [
        ['imeta', 'url https://i.nostr.build/video'],
        ['imeta', 'url https://ditto.pub'],
      ],
    }));

    assertEquals(result, undefined);
  });
});
