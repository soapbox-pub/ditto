import type { NostrEvent } from '@nostrify/nostrify';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { describe, expect, it } from 'vitest';

import { blobbiPicture } from './blobbi';
import { eventPreview, type Page, type Preview, profilePreview, readProfile } from './card';
import { bolt11Sats, read, reference, shortNpub, SUPPORTED } from './kinds';

const SECRET = new Uint8Array(32).fill(3);
const OTHER = new Uint8Array(32).fill(4);
const PUBKEY = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const PAGE: Page = { url: 'https://ditto.example/nevent1abc', origin: 'https://ditto.example', appName: 'Ditto' };

function signed(secret: Uint8Array, kind: number, tags: string[][], content: string): NostrEvent {
  return finalizeEvent({ kind, tags, content, created_at: 1_700_000_000 }, secret);
}

function sign(kind: number, tags: string[][], content: string): NostrEvent {
  return signed(SECRET, kind, tags, content);
}

/** An event's preview, as the script makes it, with no author's profile found. */
function card(kind: number, tags: string[][], content: string): Preview {
  return preview(sign(kind, tags, content));
}

function preview(event: NostrEvent): Preview {
  const parts = read(event);
  if (!parts) throw new Error(`kind ${event.kind} has no preview`);
  return eventPreview(event.kind, parts, readProfile(undefined, parts.author), PAGE);
}

function zapReceipt(): NostrEvent {
  const request = signed(OTHER, 9734, [['p', PUBKEY], ['amount', '21000']], 'Great post!');
  return sign(9735, [['p', PUBKEY], ['bolt11', 'lnbc210n1pjexample'], ['description', JSON.stringify(request)]], '');
}

function memoryBlock(header: number[]): string {
  const block = new Array(8192).fill(0);
  header.forEach((b, i) => (block[i] = b));
  return block.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** An event of each kind, as the app that makes it would. */
function example(kind: number): NostrEvent {
  const id = 'b'.repeat(64);
  const a = `30009:${PUBKEY}:bravery`;
  const e = ['e', id];
  const p = ['p', PUBKEY];
  const image = ['image', 'https://cdn.example/i.jpg'];
  switch (kind) {
    case 1: case 11: case 1111: case 1311: case 2004: return sign(kind, [], 'Hello');
    case 3: case 15683: case 18678: return sign(kind, [p], '');
    case 4: case 8211: return sign(kind, [p], 'c2VjcmV0?iv=YWJj');
    case 6: case 16: return sign(kind, [e], JSON.stringify(sign(1, [], 'Reposted words')));
    case 7: return sign(kind, [e, p], '+');
    case 8: return sign(kind, [['a', a], p], '');
    case 20: return sign(kind, [['imeta', 'url https://cdn.example/p', 'm image/jpeg']], 'A photo');
    case 21: case 22: case 34235: case 34236: return sign(kind, [['d', 'v'], ['title', 'Clip'], ['imeta', 'url https://cdn.example/v.mp4']], '');
    case 62: return sign(kind, [['relay', 'ALL_RELAYS']], 'Goodbye');
    case 1018: return sign(kind, [e, ['response', 'a']], '');
    case 1063: return sign(kind, [['url', 'https://cdn.example/f.png'], ['m', 'image/png']], '');
    case 1068: return sign(kind, [['option', 'a', 'Yes'], ['option', 'b', 'No']], 'Well?');
    case 1222: case 1244: return sign(kind, [], 'https://cdn.example/voice.m4a');
    case 1617: return sign(kind, [], 'From abc\nSubject: [PATCH] Fix things\n\n---\n a | 1 +');
    case 1618: case 1619: case 1621: return sign(kind, [['subject', 'Do the thing']], 'Because.');
    case 1630: case 1631: case 1632: case 1633: return sign(kind, [e], '');
    case 1984: return sign(kind, [['p', PUBKEY, 'spam']], 'Lots of it');
    case 2003: return sign(kind, [['x', 'a'.repeat(40)], ['file', 'movie/clip.mkv', '1048576']], 'A clip');
    case 2256: return sign(kind, [['c', 'the-fool'], ['c', 'two-of-cups', 'reversed']], '');
    case 2473: return sign(kind, [['alt', 'Bird detection: Northern Cardinal (Cardinalis cardinalis)'], ['n', 'Cardinalis cardinalis']], '');
    case 3063: return sign(kind, [['url', 'https://cdn.example/app.apk'], ['version', '1.2']], '');
    case 3367: return sign(kind, [['c', '#ff0000'], ['c', '#00ff00'], ['name', 'Spring']], '🌸');
    case 5128: case 15128: case 35128: return sign(kind, [['d', 'blog'], ['path', '/index.html', id]], '');
    case 7516: return sign(kind, [['a', `37516:${PUBKEY}:cache`]], 'Found it!');
    case 7849: return sign(kind, [['alt', 'Quiz result: Wizard on "Which are you?"']], '');
    case 8333: return sign(kind, [p, ['amount', '5000']], 'Thanks');
    case 9735: return zapReceipt();
    case 9802: return sign(kind, [['r', 'https://example.com/post', 'source']], 'Quoted words');
    case 10002: return sign(kind, [['r', 'wss://relay.example.com']], '');
    case 10008: case 30008: return sign(kind, [['d', 'profile_badges'], ['a', a]], '');
    case 10011: return sign(kind, [['i', 'github:alex', 'proof']], '');
    case 12473: return sign(kind, [['i', 'https://www.wikidata.org/entity/Q1'], ['n', 'Cardinalis cardinalis']], '');
    case 16767: return sign(kind, [['bg', 'url https://cdn.example/bg.jpg']], '');
    case 30000: case 39089: return sign(kind, [['d', 'friends'], ['title', 'Friends'], p], '');
    case 30009: return sign(kind, [['d', 'bravery'], ['name', 'Bravery'], image], '');
    case 30023: case 30024: return sign(kind, [['d', 'post'], ['title', 'Post']], 'Some *words*.');
    case 30030: return sign(kind, [['d', 'pack'], ['emoji', 'wave', 'https://cdn.example/wave.png']], '');
    case 30054: case 30055: return sign(kind, [['d', 'ep'], ['title', 'Episode'], ['audio', 'https://cdn.example/ep.mp3']], 'Show notes');
    case 30063: return sign(kind, [['d', 'app@1.2'], ['i', 'app'], ['version', '1.2']], 'Fixed *bugs*.');
    case 30311: return sign(kind, [['d', 's'], ['title', 'Stream'], ['status', 'live']], '');
    case 30312: case 30313: return sign(kind, [['d', 'r'], ['room', 'Room']], '');
    case 30315: return sign(kind, [['d', 'general']], 'Working');
    case 30402: return sign(kind, [['d', 'l'], ['title', 'Bike'], ['price', '100', 'usd']], 'A bike.');
    case 30617: return sign(kind, [['d', 'npanel'], ['description', 'A gateway']], '');
    case 30618: return sign(kind, [['d', 'npanel'], ['refs/heads/main', 'c'.repeat(40)]], '');
    case 30621: return sign(kind, [['d', 'orion'], ['title', 'Orion']], 'My Orion');
    case 30817: return sign(kind, [['d', 'xx'], ['title', 'A NIP']], '# A NIP\n\nIt does things.');
    case 31124: return sign(kind, [['d', 'b'], ['name', 'Blob'], ['stage', 'baby']], '');
    case 31871: return sign(kind, [['d', 'x'], ['s', 'valid'], e], 'Checked');
    case 31922: return sign(kind, [['d', 'c'], ['title', 'Party'], ['start', '2025-06-01']], '');
    case 31923: return sign(kind, [['d', 'c'], ['title', 'Party'], ['start', '1748790000']], '');
    case 31985: return sign(kind, [['d', 'isbn:9780000000000'], ['rating', '0.8']], 'Good book');
    case 31990: return sign(kind, [['d', 'h']], '{"name":"App","about":"Does things"}');
    case 32267: return sign(kind, [['d', 'app'], ['name', 'App'], ['icon', 'https://cdn.example/icon.png']], 'An app');
    case 33301: return sign(kind, [['d', 'invite']], 'ciphertext');
    case 33331: return sign(kind, [['d', 'cube']], '{"v":1,"name":"Cube","vertices":[]}');
    case 33863: return sign(kind, [['d', 'f'], ['title', 'Fund'], ['w', 'bc1qexample'], ['goal', '1000']], 'Help *us*.');
    case 33953: case 34609: case 39731: return sign(kind, [['d', 'b'], ['title', 'Book'], ['author', 'Ann']], '');
    case 34139: return sign(kind, [['d', 'mix'], ['title', 'Mix'], ['a', `36787:${PUBKEY}:song`]], '');
    case 34550: return sign(kind, [['d', 'c'], ['name', 'Community'], ['description', 'A place']], '');
    case 36767: return sign(kind, [['d', 't'], ['title', 'Dark']], '');
    case 36787: return sign(kind, [['d', 'song'], ['title', 'Song'], ['artist', 'Band'], ['url', 'https://cdn.example/s.mp3']], '');
    case 37381: return sign(kind, [['d', 'deck'], ['title', 'Deck'], ['c', 'Lightning Bolt', '4']], '');
    case 37516: return sign(kind, [['d', 'cache'], ['name', 'Cache'], ['D', '2'], ['T', '3']], 'Under a rock');
    case 37849: return sign(kind, [['d', 'q'], ['title', 'Which are you?'], ['question', '1', 'Pick one']], '');
    case 38192: return sign(kind, [['d', 'save-0'], ['title', 'Save']], memoryBlock([...ascii('SC'), 0x11, 0x01, ...ascii('MY GAME')]));
    case 39701: return sign(kind, [['d', 'example.com/page'], ['title', 'A page']], 'Worth reading');
    default: throw new Error(`no example of kind ${kind}`);
  }
}

/** Text that is markup, JSON, or a long run of hex has no place in a description. */
function readable(text: string): boolean {
  return !/^\s*[{[<]/.test(text) && !/[0-9a-fA-F]{64}/.test(text) && !text.includes('"sig"');
}

describe('previews', () => {
  it('previews every kind Ditto renders', () => {
    for (const kind of SUPPORTED.filter((k) => k !== 0)) {
      const p = preview(example(kind));
      for (const text of [p.title, p.description].filter((t): t is string => !!t)) {
        expect(readable(text), `kind ${kind}: ${text}`).toBe(true);
      }
      expect(p.title ?? p.description, `kind ${kind} says nothing`).toBeTruthy();
      expect(p.body).not.toContain('"sig"');
      expect(p.body?.startsWith('<article>') && p.body.endsWith('</article>\n'), `kind ${kind}`).toBe(true);
    }
  });

  it('previews nothing else', () => {
    for (let kind = 1; kind <= 65_535; kind++) {
      if (SUPPORTED.includes(kind)) continue;
      const event = { id: 'a'.repeat(64), pubkey: PUBKEY, created_at: 1, kind, tags: [['alt', 'Something']], content: 'Hello', sig: '' };
      expect(read(event), `kind ${kind} has a reader but isn't listed`).toBeUndefined();
    }
  });

  it('describes profiles', () => {
    const event = sign(0, [], '{"name":"alex","display_name":"Alex <G>","about":"Hi\\n\\nthere","picture":"https://x.example/a.png","website":"javascript:alert(1)","nip05":"_@alex.example"}');
    const p = profilePreview(readProfile(event, event.pubkey), PAGE);
    expect(p.title).toBe('Alex <G> on Ditto');
    expect(p.description).toBe('Hi there');
    expect(p.image).toBe('https://x.example/a.png');
    expect(p.twitter).toBe('summary');
    expect(p.body).toContain('<h1>Alex &lt;G&gt;</h1>');
    expect(p.body).toContain('<p>alex.example</p>');
    expect(p.body).not.toContain('javascript');
    // Someone else's profile is not theirs.
    expect(readProfile(signed(OTHER, 0, [], '{"name":"mallory"}'), event.pubkey).name).toBeUndefined();
  });

  it('titles notes after their author', () => {
    const note = sign(1, [], 'Look at this https://cdn.example/cat.png and nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6');
    const parts = read(note)!;
    const p = eventPreview(1, parts, readProfile(sign(0, [], '{"name":"alex"}'), note.pubkey), PAGE);
    expect(p.title).toBe('alex on Ditto');
    expect(p.description).toBe('Look at this and');
    expect(p.image).toBe('https://cdn.example/cat.png');
    expect(p.twitter).toBe('summary_large_image');
    expect(p.body).toContain('<time datetime="2023-11-14T22:13:20Z">November 14, 2023</time>');
    expect(p.body!.match(/cat\.png/g)).toHaveLength(1);
  });

  it('reposts are the event they carry', () => {
    const original = signed(OTHER, 1, [], 'Original words');
    const repost = sign(6, [['e', original.id]], JSON.stringify(original));
    expect(read(repost)!.author).toBe(original.pubkey);
    const p = preview(repost);
    expect(p.description).toBe('Original words');
    expect(p.body).toContain('Reposted by <a href="/npub1');

    // One whose signature doesn't hold is not taken at its word.
    const forged = { ...original, content: 'Words they never wrote' };
    const forgery = preview(sign(6, [['e', original.id]], JSON.stringify(forged)));
    expect(forgery.description).toBe('Reposted a post');
    expect(forgery.body).not.toContain('never wrote');
    expect(read(sign(6, [['e', original.id]], JSON.stringify(forged)))!.author).toBe(getPublicKey(SECRET));

    // Nor is a repost of an event with no preview.
    expect(preview(sign(16, [], JSON.stringify(signed(OTHER, 31337, [], 'Mystery')))).description).toBe('Reposted a post');
  });

  it('zaps are their senders', () => {
    const receipt = zapReceipt();
    expect(read(receipt)!.author).toBe(getPublicKey(OTHER));
    const p = preview(receipt);
    expect(p.title).toBe(`${shortNpub(getPublicKey(OTHER))} zapped ${shortNpub(PUBKEY)} 21 sats`);
    expect(p.description).toBe('Great post!');
    expect(p.body).not.toContain('9734');

    // A request that isn't signed by its sender is no one's comment.
    const request = { ...signed(OTHER, 9734, [], 'Great post!'), content: 'Forged' };
    const forged = sign(9735, [['bolt11', 'lnbc1u1pexample'], ['description', JSON.stringify(request)]], '');
    expect(preview(forged).title).toBe('Zapped 100 sats');
    expect(preview(forged).description).toBeUndefined();
    expect(read(forged)!.author).toBe(getPublicKey(SECRET));
  });

  it('draws Blobbis at every stage', () => {
    const blobbi = (stage: string, extra: string[][] = []) => sign(31124, [
      ['d', `blobbi-${getPublicKey(SECRET).slice(0, 12)}-4ae8f49cc0`], ['b', 'blobbi:ecosystem:v1'], ['name', 'Arcanus'], ['stage', stage],
      ['seed', 'b0163840657e87636d5fcf19a95b8a640e4b95b1860a328022c3d672818775a1'], ['state', 'active'], ['last_interaction', '1700000000'],
      ['base_color', '#35F3CD'], ['secondary_color', '#A8FAD2'], ['eye_color', '#929825'], ...extra,
    ], '');
    for (const event of [blobbi('egg'), blobbi('baby'), blobbi('adult', [['adult_type', 'catti']])]) {
      const svg = blobbiPicture(event)!;
      expect(svg, event.tags.find(([n]) => n === 'stage')![1]).toMatch(/^<svg [^>]*width="1200" height="630"/);
      // The Blobbi's own art, nested, sized to the picture.
      expect(svg.match(/<svg\b/g)!.length).toBe(2);
      expect(svg).not.toContain('<?xml');
      expect(svg).not.toContain('width="100%"');
    }
    // The form named is the form drawn.
    const adult = blobbi('adult', [['adult_type', 'catti']]);
    const form = /'s adult (\w+)$/.exec(preview(adult).description ?? '')?.[1];
    expect(form).toBeTruthy();
    expect(blobbiPicture(adult)).toContain(`${form!.toLowerCase()}`);
    expect(preview(blobbi('egg')).description).toBe(`${shortNpub(getPublicKey(SECRET))}'s Blobbi egg`);
  });

  it('reads invoice amounts', () => {
    expect(bolt11Sats('lnbc2500u1pvjluez')).toBe(250_000);
    expect(bolt11Sats('LNBC210N1PJ')).toBe(21);
    expect(bolt11Sats('lnbc1m1p')).toBe(100_000);
    expect(bolt11Sats('lntb20m1p')).toBe(2_000_000);
    expect(bolt11Sats('lnbcrt5000p1p')).toBe(0);
    expect(bolt11Sats('lnbc1pvjluez')).toBeUndefined();
    expect(bolt11Sats('lnbc+5u1p')).toBeUndefined();
    expect(bolt11Sats('nonsense')).toBeUndefined();
  });

  it('keeps secrets', () => {
    for (const kind of [4, 8211, 33301]) {
      const p = card(kind, [['p', PUBKEY]], 'dGhlIHNlY3JldA==?iv=abc https://cdn.example/x.png');
      expect(p.body).not.toContain('dGhl');
      expect(p.description ?? '').not.toContain('dGhl');
      expect(read(sign(kind, [['p', PUBKEY]], 'https://cdn.example/x.png'))!.image).toBeUndefined();
    }
    expect(card(4, [['p', PUBKEY]], 'x').description).toBe('Sent a direct message');
  });

  it('hides what content warnings warn of', () => {
    const p = card(20, [['content-warning', 'Gore'], ['imeta', 'url https://cdn.example/p.jpg']], 'Look https://cdn.example/q.jpg');
    expect(p.description).toBe('Content warning: Gore');
    expect(p.twitter).toBe('summary');
    expect(p.body).not.toContain('cdn.example');
  });

  it('reads JSON content as fields', () => {
    const p = card(31990, [['d', 'h']], '{"name":"Handler","about":"Opens things","picture":"https://cdn.example/p.png","website":"https://handler.example"}');
    expect(p.title).toBe('Handler');
    expect(p.description).toBe('Opens things');
    expect(p.image).toBe('https://cdn.example/p.png');
    expect(p.body).not.toContain('"about"');
  });

  it('refuses what its app would', () => {
    expect(read(sign(30402, [['d', 'l']], 'No title'))).toBeUndefined();
    expect(read(sign(33863, [['d', 'f'], ['title', 'Fund']], 'Nowhere to send'))).toBeUndefined();
    expect(read(sign(36767, [['d', 't']], ''))).toBeUndefined();
    expect(read(sign(7, [], ':unknown:'))).toBeUndefined();
    expect(read(sign(7, [], 'not a reaction at all'))).toBeUndefined();
    expect(read(sign(31985, [['d', 'super-mario-galaxy']], '{"title":"Super Mario Galaxy"}'))).toBeUndefined();
  });

  it('reactions', () => {
    const p = card(7, [['e', 'b'.repeat(64)], ['emoji', 'wave', 'https://cdn.example/wave.png']], ':wave:');
    expect(p.description).toBe('Reacted :wave:');
    expect(p.image).toBe('https://cdn.example/wave.png');
    expect(p.body).toContain('to <a href="/note1');
    expect(card(7, [], '-').description).toBe('Reacted 👎');
  });

  it('says who did what, to what', () => {
    const alex = readProfile(sign(0, [], '{"name":"Alex"}'), getPublicKey(SECRET));
    const sam = readProfile(signed(OTHER, 0, [], '{"name":"Sam"}'), getPublicKey(OTHER));
    const named = (event: NostrEvent, ref?: NostrEvent) => {
      const parts = read(event, ref)!;
      return eventPreview(event.kind, parts, parts.author === sam.pubkey ? sam : alex, PAGE, [alex, sam]);
    };

    const post = signed(OTHER, 1, [['imeta', 'url https://cdn.example/cat.png', 'm image/png']], 'My cat');
    const reaction = sign(7, [['e', post.id], ['p', post.pubkey]], '+');
    expect(reference(reaction)).toEqual({ ids: [post.id] });
    const reacted = named(reaction, post);
    expect([reacted.title, reacted.description, reacted.image]).toEqual(["Alex reacted 👍 to Sam's post", 'My cat', 'https://cdn.example/cat.png']);

    // A repost that carries nothing is of the event it names.
    const repost = sign(16, [['e', post.id]], '');
    expect(reference(repost)).toEqual({ ids: [post.id] });
    expect(named(repost, post).description).toBe('My cat');
    expect(reference(sign(6, [['e', post.id]], JSON.stringify(post)))).toBeUndefined();

    const poll = signed(OTHER, 1068, [['option', 'y', 'Yes'], ['option', 'n', 'No']], 'Tabs?');
    const vote = named(sign(1018, [['e', poll.id], ['response', 'n']], ''), poll);
    expect([vote.title, vote.description]).toEqual(['Alex voted in “Tabs?”', 'Voted “No”']);

    const issue = signed(OTHER, 1621, [['subject', 'It breaks']], 'When I click');
    expect(named(sign(1632, [['e', issue.id, '', 'root']], ''), issue).title).toBe('Alex closed “It breaks”');
    expect(named(sign(1631, [['e', issue.id, '', 'root']], ''), issue).title).toBe('Alex resolved “It breaks”');

    const badge = signed(OTHER, 30009, [['d', 'brave'], ['name', 'Bravery'], ['description', 'For courage'], ['image', 'https://cdn.example/b.png']], '');
    const award = sign(8, [['a', `30009:${badge.pubkey}:brave`], ['p', badge.pubkey]], '');
    expect(reference(award)).toEqual({ kinds: [30009], authors: [badge.pubkey], '#d': ['brave'], limit: 1 });
    const awarded = named(award, badge);
    expect([awarded.title, awarded.description, awarded.image]).toEqual(['Alex awarded Sam the “Bravery” badge', 'For courage', 'https://cdn.example/b.png']);

    expect(named(sign(3, [['p', sam.pubkey], ['p', PUBKEY]], '')).description).toBe('Sam and 1 more');
    expect(named(sign(3, [['p', sam.pubkey]], '')).title).toBe('People Alex follows');
    expect(named(sign(10002, [['r', 'wss://relay.example/'], ['r', 'wss://other.example']], '')).description).toBe('relay.example and other.example');
    expect(named(sign(8211, [['p', sam.pubkey]], 'c2VjcmV0?iv=YWJj')).title).toBe('Alex sent Sam a letter');
  });

  it('audio', () => {
    const track = card(36787, [['d', 's'], ['title', 'Song'], ['artist', 'Band'], ['album', 'Record'], ['imeta', 'url https://cdn.example/s', 'm audio/flac', 'image https://cdn.example/c.jpg']], '');
    expect(track.type).toBe('music.song');
    expect(track.audio).toEqual({ url: 'https://cdn.example/s', type: 'audio/flac' });
    expect(track.image).toBe('https://cdn.example/c.jpg');
    expect(track.description).toBe('by Band on Record');

    const voice = card(1222, [['imeta', 'url https://cdn.example/v.webm', 'm audio/webm', 'duration 75']], 'https://cdn.example/v.webm');
    expect(voice.audio?.type).toBe('audio/webm');
    expect(voice.description).toBe('Voice message, 1:15');
    expect(voice.body!.match(/v\.webm/g)).toHaveLength(1);

    const podcast = card(30054, [['d', 'e'], ['title', 'Ep'], ['audio', 'https://cdn.example/e'], ['description', 'Notes']], '');
    expect(podcast.audio?.url).toBe('https://cdn.example/e');

    const file = card(1063, [['url', 'https://cdn.example/f.ogg'], ['m', 'audio/ogg'], ['alt', 'A recording']], '');
    expect(file.audio?.type).toBe('audio/ogg');
    expect(file.title).toBe('A recording');
  });

  it('videos', () => {
    const p = card(22, [['title', 'Clip'], ['imeta', 'url https://cdn.example/v', 'm video/mp4', 'dim 720x1280', 'image https://cdn.example/t.jpg']], '');
    expect(p.type).toBe('video.other');
    expect(p.video).toEqual({ url: 'https://cdn.example/v', type: 'video/mp4', width: 720, height: 1280 });
    expect(p.image).toBe('https://cdn.example/t.jpg');
    expect(p.body).toContain('<video src="https://cdn.example/v" poster="https://cdn.example/t.jpg"');
  });

  it('articles', () => {
    const p = card(30023, [['d', 'post'], ['title', 'My <Post>'], ['summary', 'About things.'], ['image', 'https://cdn.example/c.jpg'], ['published_at', '1600000000']], '# Heading\n\nBody text.');
    expect(p.title).toBe('My <Post>');
    expect(p.description).toBe('About things.');
    expect(p.published).toBe(1_600_000_000);
    expect(p.jsonLd?.['@type']).toBe('Article');
    expect(p.body).toContain('<h1>My &lt;Post&gt;</h1>');
    expect(p.body).toContain('<h1>Heading</h1>');
    expect(p.body).toContain('<img src="https://cdn.example/c.jpg"');
    expect(card(30023, [['d', 'x']], 'Just **words** here.').description).toBe('Just words here.');
  });

  it('lists', () => {
    const follows = card(3, [['p', PUBKEY], ['p', PUBKEY], ['p', 'nope']], '{"wss://r.example":{"read":true}}');
    expect(follows.description).toBe('1 person');
    expect(follows.body!.match(/<li>/g)).toHaveLength(1);
    expect(follows.body).not.toContain('wss://r.example');

    const many = Array.from({ length: 60 }, (_, i) => ['p', i.toString(16).padStart(64, '0')]);
    const pack = card(39089, many, '');
    expect(pack.description).toBe('60 people');
    expect(pack.body).toContain('<li>and 10 more</li>');
  });

  it('polls and highlights', () => {
    const poll = card(1068, [['option', 'a', 'Yes'], ['option', 'b', 'No <b>']], 'Should we?');
    expect([poll.title, poll.description]).toEqual(['Should we?', 'Yes · No <b>']);
    expect(poll.body).toContain('<li>No &lt;b&gt;</li>');

    const highlight = card(9802, [['r', 'https://example.com/a', 'source'], ['comment', 'So true']], 'The quoted part');
    expect(highlight.description).toBe('“The quoted part”');
    expect(highlight.body).toContain('<blockquote>\n<p>The quoted part</p>\n</blockquote>');
    expect(highlight.body).toContain('From <a href="https://example.com/a"');
  });

  it('particulars', () => {
    expect(card(1617, [], 'From abc\nSubject: [PATCH v2 1/3] Fix <things>\n\n---').title).toBe('Fix <things>');
    expect(card(1617, [], 'diff --git a/x b/x\n+<b>').body).toContain('<pre><code>diff --git a/x b/x\n+&lt;b&gt;</code></pre>');
    expect(card(2256, [['c', 'the-fool'], ['c', 'king-of-the-wands', 'reversed']], '').description).toBe('The Fool, King of the Wands (reversed)');
    expect(card(2473, [['alt', 'Bird detection: Blue Jay (Cyanocitta cristata)']], '').title).toBe('Blue Jay');
    const mario = memoryBlock([...ascii('SC'), 0x11, 0x01, 0x82, 0x6c, 0x82, 0x81, 0x82, 0x92, 0x82, 0x89, 0x82, 0x8f, 0x81, 0x40, 0x82, 0x50]);
    expect(card(38192, [], mario).title).toBe('Mario 1');
    expect(card(38192, [['title', 'Fallback']], 'zz').title).toBe('Fallback');
    expect(card(31985, [['d', 'isbn:123'], ['rating', '0.6']], 'Fine').description).toBe('★★★☆☆ — Fine');
    expect(card(39701, [['d', 'example.com/a']], '').description).toBe('https://example.com/a');
    expect(card(30402, [['d', 'l'], ['title', 'Bike'], ['price', '100', 'usd', 'month'], ['status', 'sold']], 'Fast').description).toBe('Sold · 100 USD per month — Fast');
    const party = card(31923, [['d', 'p'], ['title', 'Party'], ['start', '1748790000'], ['start_tzid', 'America/New_York'], ['location', 'Park']], '');
    expect(party.description).toBe('June 1, 2025, 15:00 UTC · Park');
    expect(card(1984, [['e', 'b'.repeat(64), 'nudity']], '').title).toBe('Reported for nudity');
    expect(card(30030, [['d', 'p'], ['emoji', 'a', 'https://cdn.example/a.png']], '').image).toBe('https://cdn.example/a.png');
    expect(card(30617, [['d', 'npanel'], ['clone', 'https://git.example/npanel.git']], '').title).toBe('npanel');
  });
});
