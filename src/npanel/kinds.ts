/**
 * Which events get a preview, and what each kind's is made of.
 *
 * Only the kinds named here are previewed: the kinds Ditto renders. Any
 * other gets none, so its page is served exactly as published — a guess at
 * what an unknown event means is worse than the app's own preview.
 *
 * Each kind is read the way its NIP, or the app that made it, puts things:
 * which tag is its title, which its image, and whether its content is for
 * reading at all. Content that isn't — JSON, ciphertext, a memory card's hex
 * — never reaches a description or the page.
 */

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import * as nip19 from 'nostr-tools/nip19';
import { verifyEvent } from 'nostr-tools/pure';

import { audioType, escape, markdownText, mediaKind, mimeKind, safeUrl, urls, videoType } from './html';

/** The most of an event's content that is read. A long article is cut here rather than left out. */
export const MAX_CONTENT = 128 * 1024;
/** The most entries a list on the page shows: people, files, emoji. */
const MAX_LIST = 50;

/** Every kind with a preview. {@link read} answers for each but 0, which is a profile, and for nothing else. */
export const SUPPORTED: readonly number[] = [
  0, 1, 3, 4, 6, 7, 8, 11, 16, 20, 21, 22, 62, 1018, 1063, 1068, 1111, 1222, 1244, 1311, 1617, 1618, 1619, 1621, 1630, 1631, 1632,
  1633, 1984, 2003, 2004, 2256, 2473, 3063, 3367, 5128, 7516, 7849, 8211, 8333, 9735, 9802, 10002, 10008, 10011, 12473, 15128,
  15683, 16767, 18678, 30000, 30008, 30009, 30023, 30024, 30030, 30054, 30055, 30063, 30311, 30312, 30313, 30315, 30402, 30617,
  30618, 30621, 30817, 31124, 31871, 31922, 31923, 31985, 31990, 32267, 33301, 33331, 33863, 33953, 34139, 34235, 34236, 34550,
  34609, 35128, 36767, 36787, 37381, 37516, 37849, 38192, 39089, 39701, 39731,
];

export interface Video {
  url: string;
  type: string;
  width?: number;
  height?: number;
}

export interface Audio {
  url: string;
  type: string;
}

/** How an event's content is shown. */
export type Content =
  | { kind: 'text' | 'markdown' | 'quote' | 'code'; source: string }
  /** Nothing to read: JSON, ciphertext, hex, or empty. */
  | { kind: 'hidden' };

const text = (source: string): Content => ({ kind: 'text', source });
const markdown = (source: string): Content => ({ kind: 'markdown', source });
const HIDDEN: Content = { kind: 'hidden' };

/** What content was made from, to tell whether media is already shown in it. */
export function contentSource(content: Content): string {
  return content.kind === 'hidden' ? '' : content.source;
}

/**
 * Text without the custom emoji (NIP-30) an event's or a profile's `emoji`
 * tags define: drawn as images in the app, they're only `:shortcodes:` in a
 * title or a description.
 */
export function withoutEmoji(text: string, tags: string[][]): string {
  const codes = new Set(tags.filter(([name, code]) => name === 'emoji' && code).map(([, code]) => code));
  if (!codes.size) return text;
  // Mastodon sets each apart with zero-width spaces, which go with it.
  return text
    .replace(/[\u200B\uFEFF]*:([\w-]+):[\u200B\uFEFF]*/g, (whole, code: string) => (codes.has(code) ? ' ' : whole))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Content's words, for a description, if it has any worth one. */
export function contentText(content: Content): string | undefined {
  let words: string;
  switch (content.kind) {
    case 'text':
    case 'quote':
      words = withoutReferences(content.source);
      break;
    case 'markdown':
      words = markdownText(content.source);
      break;
    default:
      return undefined;
  }
  return words.trim() ? words : undefined;
}

/** What an event's preview is made of, before its author's profile is known. */
export interface Parts {
  /** Who it's attributed to: the author, but for a repost the reposted event's, and for a zap whoever sent it. */
  author: string;
  published: number;
  title?: string;
  /** The description, where the event has one apart from its content. */
  summary?: string;
  /** The description when neither the summary nor the content gives one. */
  fallback?: string;
  image?: string;
  video?: Video;
  audio?: Audio;
  content: Content;
  /** Markup for the article's header, below the byline. Already escaped. */
  lead: string;
  /** Markup for after the content. Already escaped. */
  extra: string;
  /** Its `emoji` tags, whose `:shortcodes:` a description leaves out. */
  emoji?: string[][];
  /** Others it names, beside its author: their profiles are fetched for {@link named}. */
  people?: string[];
  /** Its title and fallback once people's names are known: "Alex reacted 👍 to Sam's post". */
  named?: (name: Name) => { title?: string; fallback?: string };
}

/** Someone's name, if their profile gives one. */
export type Name = (pubkey: string) => string | undefined;

/** Someone's name, or a shortened npub for someone without one. */
export function who(name: Name, pubkey: string): string {
  return name(pubkey) ?? shortNpub(pubkey);
}

/**
 * Where the event another is about is found, for the kinds whose preview is
 * made of it: what was reacted to, voted in, closed, awarded or found.
 */
export function reference(e: NostrEvent): NostrFilter | undefined {
  switch (e.kind) {
    case 6: case 16: {
      // A repost that carries its event needs nothing fetched. One of an
      // addressable event is of its newest version, by its address.
      if (parseEvent(e.content)) return undefined;
      const id = lastId(e);
      return address(e) ?? (id ? { ids: [id] } : undefined);
    }
    case 7: case 1018: case 9735: {
      const id = lastId(e);
      return id ? { ids: [id] } : undefined;
    }
    case 1630: case 1631: case 1632: case 1633: {
      const ids = all(e, 'e');
      const id = (ids.find((t) => t[2] === 'root') ?? ids[0])?.[0];
      return isHex64(id) ? { ids: [id] } : undefined;
    }
    case 1619: {
      const id = tag(e, 'E');
      return isHex64(id) ? { ids: [id] } : undefined;
    }
    case 8: return address(e, 30009);
    case 7516: return address(e, 37516);
    default: return undefined;
  }
}

/** The last `e` tag's id, as NIP-25 and NIP-18 name what an event is about. */
function lastId(e: NostrEvent): string | undefined {
  return all(e, 'e').map((t) => t[0]).filter(isHex64).pop();
}

/** A filter for the addressable event an `a` tag names: of the kind given, or any. */
function address(e: NostrEvent, kind?: number): NostrFilter | undefined {
  for (const [a] of all(e, 'a')) {
    const [kindText, pubkey, ...rest] = a?.split(':') ?? [];
    const k = Number(kindText);
    if (/^\d+$/.test(kindText ?? '') && (kind === undefined ? k >= 30000 && k < 40000 : k === kind) && isHex64(pubkey)) {
      return { kinds: [k], authors: [pubkey], '#d': [rest.join(':')], limit: 1 };
    }
  }
  return undefined;
}

/** What a preview says of the event another is about. */
interface About {
  author: string;
  title?: string;
  text?: string;
  image?: string;
}

function about(ref: NostrEvent | undefined, kinds?: number[]): About | undefined {
  if (!ref || ref.kind === 6 || ref.kind === 16 || (kinds && !kinds.includes(ref.kind))) return undefined;
  const parts = read(ref);
  if (!parts) return undefined;
  const text = mapOpt(parts.summary ?? contentText(parts.content) ?? parts.fallback, (t) => withoutEmoji(t, parts.emoji ?? []) || undefined);
  return { author: parts.author, title: parts.title, text, image: parts.image };
}

/** The event another is about, as a title names it: “Its title”, or whose post it is. */
function label(of: About, name: Name): string {
  return of.title ? `“${clamp(of.title, 80)}”` : `${who(name, of.author)}'s post`;
}

/** Adds to what {@link Parts.named} gives. */
function naming(p: Parts, fn: (name: Name) => { title?: string; fallback?: string }): void {
  const before = p.named;
  p.named = (n) => ({ ...before?.(n), ...fn(n) });
}

/** An event's parts, or undefined for a kind that isn't previewed — or one that is, but malformed in a way its app would refuse to show. `ref` is the event {@link reference} names, where it was found. */
export function read(e: NostrEvent, ref?: NostrEvent): Parts | undefined {
  const content = truncate(e.content, MAX_CONTENT);
  const media = mediaOf(e, content);
  const p: Parts = {
    author: e.pubkey,
    published: e.created_at,
    title: tag(e, 'title'),
    summary: tag(e, 'summary') ?? tag(e, 'description'),
    // NIP-31: an `alt` describes an event its content doesn't.
    fallback: tag(e, 'alt'),
    image: urlTag(e, 'image') ?? urlTag(e, 'thumb') ?? media.image,
    video: media.video,
    audio: media.audio,
    content: text(content),
    lead: '',
    extra: '',
    emoji: e.tags.filter(([name]) => name === 'emoji'),
  };

  switch (e.kind) {
    // Notes, threads, comments, live chat, torrent comments; and NIP-68
    // pictures and NIP-71 videos, whose media is in `imeta`.
    case 1: case 11: case 1111: case 1311: case 2004: case 20: case 21: case 22: case 34235: case 34236:
      break;
    case 1063: file(p, e); break;
    case 1222: case 1244: voice(p, e, content); break;
    case 36787: track(p, e, content); break;
    case 34139: playlist(p, e); break;
    case 30054: case 30055: podcast(p, e); break;
    case 30311: stream(p, e); break;
    case 30312: case 30313: p.title ??= tag(e, 'room'); break;
    case 2003: torrent(p, e); break;
    case 30023: case 30024:
      p.content = markdown(content);
      p.published = publishedAt(e) ?? p.published;
      break;
    case 30402: if (!classified(p, e, content)) return undefined; break;
    case 33953: case 34609: case 39731: publication(p, e); break;
    case 31922: case 31923: calendar(p, e); break;
    case 34550: community(p, e); break;
    case 31985: if (!bookReview(p, e)) return undefined; break;
    case 30030: emojiPack(p, e); break;
    case 30009:
      p.title = tag(e, 'name') ?? tag(e, 'd');
      p.fallback ??= 'A badge';
      break;
    case 8: badgeAward(p, e, ref); break;
    case 10008: case 30008: badges(p, e); break;
    case 33863: if (!fundraiser(p, e, content)) return undefined; break;
    case 30617: repository(p, e); break;
    case 30618: repositoryState(p, e); break;
    case 1617: patch(p, e, content); break;
    case 1618: case 1619: case 1621: gitText(p, e, content, ref); break;
    case 1630: case 1631: case 1632: case 1633: gitStatus(p, e, ref); break;
    case 30817:
      p.title ??= mapOpt(tag(e, 'd'), (d) => `NIP ${d}`);
      p.content = markdown(content);
      break;
    case 15128: case 35128: case 5128: nsite(p, e); break;
    case 32267: app(p, e); break;
    case 30063: release(p, e, content); break;
    case 3063: asset(p, e); break;
    case 31990: handler(p, e, content); break;
    case 31871: attestation(p, e); break;
    case 6: case 16: return repost(e, ref);
    case 7: if (!reaction(p, e, ref)) return undefined; break;
    case 9735: zap(p, e, ref); break;
    case 8333: onchainZap(p, e); break;
    case 9802: highlight(p, e, content); break;
    case 1068: poll(p, e); break;
    case 1018: pollVote(p, e, ref); break;
    case 1984: report(p, e); break;
    case 3: case 30000: case 39089: peopleList(p, e); break;
    case 10002: relayList(p, e); break;
    case 10011: identities(p, e); break;
    case 15683: case 18678: {
      const list = e.kind === 15683 ? 'love list' : 'Top 8';
      p.title = e.kind === 15683 ? 'Love list' : 'Top 8';
      // Its `alt` says what any love list is; the people on it say what this one is.
      p.fallback = undefined;
      people(p, e);
      naming(p, (name) => ({ title: `${who(name, e.pubkey)}'s ${list}` }));
      break;
    }
    case 30315: status(p, e); break;
    case 39701: bookmark(p, e); break;
    case 16767: case 36767: if (!theme(p, e)) return undefined; break;
    case 37849: if (!quiz(p, e)) return undefined; break;
    case 7849:
      p.title = p.fallback ?? 'Quiz result';
      p.fallback = undefined;
      break;
    case 38192: memoryCard(p, e, content); break;
    case 3367: colorMoment(p, e, content); break;
    case 37516: geocache(p, e); break;
    case 7516: geocacheFind(p, e, ref); break;
    case 37381: deck(p, e); break;
    case 2473: bird(p, e); break;
    case 12473: birdex(p, e); break;
    case 30621: p.title ??= tag(e, 'd'); break;
    case 33331: sno(p, e, content); break;
    case 31124: blobbi(p, e); break;
    case 2256: tarot(p, e); break;
    case 4: case 8211: case 33301: encrypted(p, e); break;
    case 62: vanish(p, e); break;
    default:
      return undefined;
  }

  // NIP-36: what its author put behind a warning stays behind one. A preview
  // has no way to ask first, so it shows none of it.
  if (e.tags.some(([name]) => name === 'content-warning')) {
    const reason = tag(e, 'content-warning');
    p.summary = reason ? `Content warning: ${reason}` : 'Content warning';
    p.image = undefined;
    p.video = undefined;
    p.audio = undefined;
    p.content = HIDDEN;
    p.extra = '';
  }
  return p;
}

function file(p: Parts, e: NostrEvent): void {
  const mime = tag(e, 'm') ?? '';
  const url = urlTag(e, 'url');
  if (!url) return;
  switch (mimeKind(mime) ?? mediaKind(url)) {
    case 'image':
      p.image = url;
      break;
    case 'video': {
      const [width, height] = dimensions(tag(e, 'dim'));
      p.video = { url, type: mimeKind(mime) === 'video' ? mime : videoType(url), width, height };
      break;
    }
    case 'audio':
      p.audio = { url, type: mimeKind(mime) === 'audio' ? mime : audioType(url) };
      break;
    default:
      p.extra = paragraph(webLink(url, fileName(url) ?? url));
  }
  p.title = p.title ?? p.fallback ?? fileName(url);
}

function voice(p: Parts, e: NostrEvent, content: string): void {
  const first = imetas(e)[0];
  const url = safeUrl(content.trim());
  if (url) {
    const mime = first && field(first, 'm');
    p.audio = { url, type: mime && mimeKind(mime) === 'audio' ? mime : audioType(url) };
  }
  const duration = Number(first && field(first, 'duration'));
  p.summary = Number.isFinite(duration) && duration > 0 ? `Voice message, ${clock(Math.floor(duration))}` : 'Voice message';
  p.content = HIDDEN;
  naming(p, (name) => ({ title: `${e.kind === 1244 ? 'Voice reply' : 'Voice message'} from ${who(name, e.pubkey)}` }));
}

function track(p: Parts, e: NostrEvent, content: string): void {
  const firstLine = mapOpt(content.split('\n').map((l) => l.trim()).find(Boolean), (l) => clamp(l, 80));
  p.title = p.title ?? tag(e, 'subject') ?? firstLine;
  const artist = tag(e, 'artist') ?? tag(e, 'creator');
  const album = tag(e, 'album');
  const byline = artist && album ? `by ${artist} on ${album}` : artist ? `by ${artist}` : album ? `on ${album}` : undefined;
  p.summary ??= byline;
  p.audio = imetaAudio(e) ?? taggedAudio(e, 'url') ?? taggedAudio(e, 'media') ?? p.audio;
  p.image = imetaThumbnail(e) ?? urlTag(e, 'image') ?? urlTag(e, 'thumb') ?? p.image;
}

function playlist(p: Parts, e: NostrEvent): void {
  p.title ??= tag(e, 'd');
  p.fallback ??= count(all(e, 'a').length, 'track', 'tracks');
}

function podcast(p: Parts, e: NostrEvent): void {
  p.title ??= tag(e, 'subject');
  p.summary = tag(e, 'description') ?? p.summary;
  p.audio = taggedAudio(e, 'audio') ?? imetaAudio(e) ?? taggedAudio(e, 'url') ?? taggedAudio(e, 'media') ?? p.audio;
  p.image = urlTag(e, 'image') ?? imetaThumbnail(e) ?? urlTag(e, 'thumb') ?? p.image;
}

function stream(p: Parts, e: NostrEvent): void {
  const state = tag(e, 'status');
  if (state === 'live') {
    p.title = mapOpt(p.title, (t) => `${t} (live)`);
  } else if (state === 'ended') {
    const url = urlTag(e, 'recording');
    if (url && mediaKind(url) === 'video') p.video = { url, type: videoType(url) };
  }
  p.fallback ??= 'A live stream';
}

function torrent(p: Parts, e: NostrEvent): void {
  const files = all(e, 'file')
    .map((t) => [t[0]?.trim() ?? '', t[1] !== undefined && /^\d+$/.test(t[1]) ? Number(t[1]) : undefined] as const)
    .filter(([path]) => path);
  p.title ??= files[0]?.[0].split('/').pop();
  p.fallback = files.length ? count(files.length, 'file', 'files') : 'A torrent';
  p.extra = list(files.map(([path, size]) => (size === undefined ? escape(path) : `${escape(path)} (${bytes(size)})`)), files.length);
}

function classified(p: Parts, e: NostrEvent, content: string): boolean {
  // NIP-99 makes the title required, and Ditto drops a listing without one.
  if (!p.title) return false;
  p.content = markdown(content);
  p.published = publishedAt(e) ?? p.published;
  const priceTag = all(e, 'price')[0];
  let price: string | undefined;
  if (priceTag) {
    const amount = priceTag[0]?.trim();
    const currency = priceTag[1]?.trim().toUpperCase();
    if (amount !== undefined && currency) {
      price = `${amount} ${currency}`;
      const frequency = priceTag[2]?.trim();
      if (frequency) price += ` per ${frequency}`;
    }
  }
  const facts = [tag(e, 'status') === 'sold' ? 'Sold' : undefined, price, tag(e, 'location')].filter((f): f is string => !!f);
  if (facts.length) {
    const joined = facts.join(' · ');
    p.lead = paragraph(escape(joined));
    const about = p.summary ?? contentText(p.content);
    p.summary = about ? `${joined} — ${about}` : joined;
  }
  return true;
}

function publication(p: Parts, e: NostrEvent): void {
  p.published = publishedAt(e) ?? p.published;
  const authors = values(e, 'author');
  const facts: string[] = [];
  if (authors.length) facts.push(`By ${authors.join(', ')}`);
  const issue = tag(e, 'issue');
  if (issue) facts.push(`Issue ${issue}`);
  const isbn = tag(e, 'isbn');
  if (isbn) facts.push(`ISBN ${isbn}`);
  if (facts.length) p.lead = paragraph(escape(facts.join(' · ')));
  if (authors.length) p.fallback = facts[0];
}

function calendar(p: Parts, e: NostrEvent): void {
  const start = tag(e, 'start');
  let when: string | undefined;
  if (e.kind === 31922) {
    // A date-based event's start is a day, `YYYY-MM-DD`.
    const match = start && /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    if (match) when = date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 1000);
  } else if (start && /^\d+$/.test(start)) {
    // A time-based one's is a Unix time. Without a time zone database to
    // read its `start_tzid` by, it's shown in UTC.
    const at = new Date(Number(start) * 1000);
    if (!Number.isNaN(at.getTime())) {
      when = `${date(Number(start))}, ${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')} UTC`;
    }
  }
  const facts = [when, tag(e, 'location')].filter((f): f is string => !!f);
  if (facts.length) {
    const joined = facts.join(' · ');
    p.lead = paragraph(escape(joined));
    const what = p.summary ?? contentText(p.content);
    p.summary = what ? `${what} — ${joined}` : joined;
  }
}

/** The ISBN a book review (Bookstr) is of, by its `d`. Ditto shows no review without one. */
export function reviewedIsbn(e: NostrEvent): string | undefined {
  const d = tag(e, 'd');
  return d?.startsWith('isbn:') ? d.slice(5).trim() || undefined : undefined;
}

function bookReview(p: Parts, e: NostrEvent): boolean {
  const isbn = reviewedIsbn(e);
  if (!isbn) return false;
  p.title = `Book review (ISBN ${isbn})`;
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} reviewed a book (ISBN ${isbn})` }));
  // The rating is a fraction of five stars.
  const rating = Number(tag(e, 'rating'));
  if (tag(e, 'rating') !== undefined && rating >= 0 && rating <= 1) {
    const filled = Math.round(rating * 5);
    const stars = '★'.repeat(filled) + '☆'.repeat(5 - filled);
    p.lead = paragraph(stars);
    const review = contentText(p.content);
    p.summary = review ? `${stars} — ${review}` : stars;
  }
  return true;
}

function community(p: Parts, e: NostrEvent): void {
  p.title = tag(e, 'name') ?? tag(e, 'd');
  // NIP-72 puts nothing in its content; what some apps put there is their own JSON.
  p.summary = tag(e, 'description') ?? tag(e, 'about');
  p.image = urlTag(e, 'image') ?? urlTag(e, 'picture') ?? urlTag(e, 'banner');
  p.content = HIDDEN;
  p.fallback = 'A community';
}

function emojiPack(p: Parts, e: NostrEvent): void {
  const emoji = all(e, 'emoji')
    .map((t) => [t[0]?.trim() ?? '', safeUrl(t[1])] as const)
    .filter((pair): pair is readonly [string, string] => !!pair[0] && !!pair[1]);
  p.title = p.title ?? tag(e, 'name') ?? tag(e, 'd');
  p.summary = tag(e, 'about') ?? p.summary;
  p.fallback = count(emoji.length, 'custom emoji', 'custom emoji');
  p.image = urlTag(e, 'image') ?? urlTag(e, 'picture') ?? emoji[0]?.[1];
  p.content = HIDDEN;
  if (emoji.length) {
    const images = emoji
      .slice(0, MAX_LIST)
      .map(([code, url]) => `<img src="${escape(url)}" alt=":${escape(code)}:" title=":${escape(code)}:" width="32" height="32">`);
    p.extra = paragraph(images.join(' '));
  }
}

/** A badge's name, from its definition's address: `30009:<pubkey>:<d>`. */
function badgeName(address: string | undefined): string | undefined {
  if (!address?.startsWith('30009:')) return undefined;
  const rest = address.slice(6);
  const colon = rest.indexOf(':');
  return colon < 0 ? undefined : rest.slice(colon + 1);
}

function badgeAward(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): void {
  // Its definition, by the address the award names, is the badge's own word for itself.
  const definition = ref?.kind === 30009 ? ref : undefined;
  const badge = (definition && (tag(definition, 'name') ?? tag(definition, 'd'))) ?? all(e, 'a').map((t) => badgeName(t[0])).find((name) => name);
  p.title = badge ? `Awarded the ${badge} badge` : 'Badge award';
  p.content = HIDDEN;
  if (definition) {
    p.image = urlTag(definition, 'image') ?? urlTag(definition, 'thumb') ?? p.image;
    p.summary = tag(definition, 'description');
  }
  people(p, e);
  const recipients = [...new Set(values(e, 'p').filter(isHex64))];
  const what = badge ? `the “${clamp(badge, 80)}” badge` : 'a badge';
  naming(p, (name) => ({
    title: recipients.length === 1
      ? `${who(name, e.pubkey)} awarded ${who(name, recipients[0])} ${what}`
      : `${who(name, e.pubkey)} awarded ${what}${recipients.length ? ` to ${count(recipients.length, 'person', 'people')}` : ''}`,
  }));
}

function badges(p: Parts, e: NostrEvent): void {
  const names = all(e, 'a').map((t) => badgeName(t[0])).filter((name): name is string => name !== undefined);
  const set = e.kind === 30008 && tag(e, 'd') !== 'profile_badges';
  p.title = set ? p.title ?? tag(e, 'name') ?? tag(e, 'd') : 'Badges';
  p.fallback = names.length ? `${names.slice(0, 8).join(', ')}${names.length > 8 ? ` and ${thousands(names.length - 8)} more` : ''}` : 'No badges';
  p.content = HIDDEN;
  p.extra = list(names.map(escape), names.length);
  if (!set) naming(p, (name) => ({ title: `${who(name, e.pubkey)}'s badges` }));
}

function fundraiser(p: Parts, e: NostrEvent, content: string): boolean {
  // Ditto shows a fundraiser only with somewhere to send to and a name.
  if (!tag(e, 'd') || !p.title) return false;
  if (!values(e, 'w').some((w) => ['bc1', 'sp1'].some((prefix) => w.toLowerCase().startsWith(prefix)))) return false;
  p.content = markdown(content);
  const banner = urlTag(e, 'banner');
  p.image = banner?.startsWith('https://') ? banner : p.image;
  const goalTag = tag(e, 'goal');
  const goal = goalTag && /^\d+$/.test(goalTag) && Number(goalTag) > 0 ? `Goal: $${thousands(Number(goalTag))}` : undefined;
  const deadlineTag = tag(e, 'deadline');
  const deadline = deadlineTag && /^-?\d+$/.test(deadlineTag) ? `Ends ${date(Number(deadlineTag))}` : undefined;
  const facts = [goal, deadline].filter((f): f is string => !!f);
  if (facts.length) p.lead = paragraph(escape(facts.join(' · ')));
  return true;
}

function repository(p: Parts, e: NostrEvent): void {
  p.title = tag(e, 'name') ?? tag(e, 'd');
  p.content = HIDDEN;
  const links = all(e, 'web').flat().map((u) => safeUrl(u)).filter((u): u is string => !!u).map((u) => webLink(u, u));
  const clones = all(e, 'clone').flat().map((u) => `<code>${escape(u.trim())}</code>`);
  p.extra = list([...links, ...clones], links.length + clones.length);
}

function repositoryState(p: Parts, e: NostrEvent): void {
  const branches = e.tags.filter(([name]) => name?.startsWith('refs/heads/')).length;
  p.title = mapOpt(tag(e, 'd'), (d) => `${d}: repository state`);
  p.fallback = count(branches, 'branch', 'branches');
  p.content = HIDDEN;
}

function patch(p: Parts, e: NostrEvent, content: string): void {
  // `git format-patch` writes the subject as a header.
  const lines = content.split('\n');
  const header = lines.find((line) => line.startsWith('Subject:'))?.slice('Subject:'.length);
  const subject = header ?? lines.map((l) => l.trim()).find(Boolean);
  const stripped = subject !== undefined ? stripPatchPrefix(subject.trim()) : undefined;
  p.title = tag(e, 'subject') ?? (stripped || undefined);
  p.fallback = 'A patch';
  p.content = { kind: 'code', source: content };
}

/** A subject without its `[PATCH v2 1/3]`. */
function stripPatchPrefix(subject: string): string {
  const match = /^\[([^\]]*)\](.*)$/s.exec(subject);
  return match && match[1].toUpperCase().includes('PATCH') ? match[2].trim() : subject;
}

function gitText(p: Parts, e: NostrEvent, content: string, ref: NostrEvent | undefined): void {
  const firstLine = content.split('\n').map((l) => l.trim().replace(/^#+/, '').trim()).find(Boolean);
  p.title = tag(e, 'subject') ?? mapOpt(firstLine, (l) => clamp(l, 120));
  p.content = markdown(content);
  p.fallback = e.kind === 1618 ? 'A pull request' : e.kind === 1619 ? 'A pull request update' : 'An issue';
  // An update is to the pull request it names, whose subject is its own.
  const pr = e.kind === 1619 && !p.title ? about(ref, [1618]) : undefined;
  if (pr?.title) {
    const subject = pr.title;
    naming(p, (name) => ({ title: `${who(name, e.pubkey)} updated “${clamp(subject, 120)}”` }));
  }
}

function gitStatus(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): void {
  p.title = ({ 1630: 'Marked open', 1631: 'Marked applied', 1632: 'Closed' } as Record<number, string>)[e.kind] ?? 'Marked as a draft';
  p.lead = mapOpt(target(e), (link) => paragraph(`On ${link}`)) ?? '';
  // What was closed or merged, by its subject.
  const of = about(ref, [1617, 1618, 1621]);
  if (!of?.title) return;
  const subject = `“${clamp(of.title, 120)}”`;
  const did = e.kind === 1630 ? `marked ${subject} open`
    : e.kind === 1631 ? `${ref?.kind === 1621 ? 'resolved' : 'merged'} ${subject}`
    : e.kind === 1632 ? `closed ${subject}`
    : `marked ${subject} as a draft`;
  p.fallback = of.text;
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} ${did}` }));
}

function nsite(p: Parts, e: NostrEvent): void {
  // A root site is its author's, and its page is titled after them.
  p.title ??= e.kind === 35128 ? tag(e, 'd') : e.kind === 5128 ? 'Site snapshot' : undefined;
  p.fallback = `A site of ${count(all(e, 'path').length, 'file', 'files')}`;
  p.content = HIDDEN;
}

function app(p: Parts, e: NostrEvent): void {
  p.title = tag(e, 'name') ?? tag(e, 'd');
  p.image = urlTag(e, 'icon') ?? urlTag(e, 'image');
  const links = ['url', 'repository'].map((name) => urlTag(e, name)).filter((u): u is string => !!u).map((u) => webLink(u, u));
  p.extra = list(links, links.length);
}

function release(p: Parts, e: NostrEvent, content: string): void {
  const app = tag(e, 'i') ?? tag(e, 'd');
  const version = tag(e, 'version');
  p.title = app && version ? `${app} ${version}` : app ?? version;
  p.content = markdown(content);
  p.fallback = 'A release';
}

function asset(p: Parts, e: NostrEvent): void {
  const url = urlTag(e, 'url');
  const app = tag(e, 'i');
  const version = tag(e, 'version');
  const size = tag(e, 'size');
  p.title = tag(e, 'filename') ?? (url && fileName(url)) ?? app ?? tag(e, 'm');
  const release = app && version ? `${app} ${version}` : app ?? mapOpt(version, (v) => `Version ${v}`);
  const facts = [release, tag(e, 'f'), size && /^\d+$/.test(size) ? bytes(Number(size)) : undefined].filter((f): f is string => !!f);
  p.summary = facts.length ? facts.join(' · ') : undefined;
  p.image = undefined;
  p.content = HIDDEN;
  if (url) p.extra = paragraph(webLink(url, url));
}

function handler(p: Parts, e: NostrEvent, content: string): void {
  // A NIP-89 handler's content is a kind 0's.
  const fields = parseObject(content);
  const field = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string).trim() || undefined : undefined);
  p.title = field('name') ?? tag(e, 'name') ?? tag(e, 'd');
  p.summary = field('about');
  p.image = safeUrl(field('banner')) ?? safeUrl(field('picture'));
  p.content = HIDDEN;
  const website = safeUrl(field('website'));
  if (website) p.extra = paragraph(webLink(website, website));
}

function attestation(p: Parts, e: NostrEvent): void {
  const state = tag(e, 's')?.toLowerCase();
  p.title = state && ['valid', 'invalid', 'verifying', 'revoked'].includes(state) ? `Attestation: ${state}` : 'Attestation';
  p.lead = mapOpt(coordinate(e) ?? target(e), (link) => paragraph(`Attesting to ${link}`)) ?? '';
}

/**
 * A repost (NIP-18) is the event it reposts, when it carries one that is
 * what it says it is: the reposter's word for what its author wrote is no
 * better than anyone's, but the author's signature is.
 */
function repost(e: NostrEvent, ref: NostrEvent | undefined): Parts {
  const inner = parseEvent(truncate(e.content, MAX_CONTENT));
  // One that carries no event is of the one it names, as its relays have it.
  const reposted = inner ? (inner.kind !== 6 && inner.kind !== 16 && verifyEvent(inner) ? inner : undefined)
    : ref && ref.kind !== 6 && ref.kind !== 16 ? ref : undefined;
  const parts = reposted && read(reposted);
  if (parts) {
    parts.lead = paragraph(`Reposted by ${personLink(e.pubkey)}`) + parts.lead;
    return parts;
  }
  return {
    author: e.pubkey,
    published: e.created_at,
    summary: 'Reposted a post',
    content: HIDDEN,
    lead: mapOpt(target(e), (link) => paragraph(`Reposted ${link}`)) ?? '',
    extra: '',
  };
}

function reaction(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): boolean {
  const content = e.content.trim();
  let shown: string;
  let image: string | undefined;
  if (content === '' || content === '+') {
    shown = '👍';
  } else if (content === '-') {
    shown = '👎';
  } else if (content.length > 2 && content.startsWith(':') && content.endsWith(':')) {
    // A custom emoji (NIP-30) is its image, or a reaction its app drops.
    const code = content.slice(1, -1);
    image = safeUrl(all(e, 'emoji').find((t) => t[0] === code)?.[1]);
    if (!image) return false;
    shown = content;
  } else if ([...content].length <= 8 && !/\s/.test(content) && !safeUrl(content)) {
    shown = content;
  } else {
    return false;
  }
  // What was reacted to says what the reaction is about: its words and its picture.
  const of = about(ref);
  p.summary = of?.text ?? `Reacted ${shown}`;
  p.image = of?.image ?? image;
  // A reaction's emoji is what it says.
  p.emoji = [];
  p.video = undefined;
  p.audio = undefined;
  p.content = HIDDEN;
  p.lead = mapOpt(target(e), (link) => paragraph(`Reacted ${escape(shown)} to ${link}`)) ?? '';
  if (of) p.people = [of.author];
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} reacted ${shown}${of ? ` to ${label(of, name)}` : ''}` }));
  return true;
}

/**
 * A zap receipt (NIP-57) is signed by the recipient's wallet, but is the
 * sender's: the zap request it carries is theirs, and signed by them.
 */
function zap(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): void {
  const candidate = parseEvent(tag(e, 'description') ?? '');
  const request = candidate && candidate.kind === 9734 && verifyEvent(candidate) ? candidate : undefined;
  const sats = mapOpt(tag(e, 'bolt11'), bolt11Sats);
  const amount = sats !== undefined ? ` ${thousands(sats)} ${sats === 1 ? 'sat' : 'sats'}` : '';
  const zapped = `Zapped${amount}`;
  const recipient = tag(e, 'p');
  let lead = escape(zapped);
  if (recipient && isHex64(recipient)) lead += ` to ${personLink(recipient)}`;
  const link = target(e);
  if (link) lead += ` for ${link}`;
  // What was zapped, when the sender said nothing of it.
  const of = about(ref);

  p.title = zapped;
  p.summary = undefined;
  p.fallback = of?.text;
  p.lead = paragraph(lead);
  p.image = of?.image;
  p.video = undefined;
  p.audio = undefined;
  p.content = request ? text(truncate(request.content, MAX_CONTENT)) : HIDDEN;
  if (request) p.author = request.pubkey;
  const to = isHex64(recipient) ? recipient : undefined;
  if (to) p.people = [to];
  // Only a signed request says who sent it: a receipt is its recipient's wallet's.
  naming(p, (name) => ({
    title: request
      ? `${who(name, request.pubkey)} zapped${to ? ` ${who(name, to)}` : ''}${amount}`
      : to ? `${who(name, to)} was zapped${amount}` : zapped,
  }));
}

/** An on-chain zap names an amount only its transaction can vouch for, and a preview can't look, so it says none. */
function onchainZap(p: Parts, e: NostrEvent): void {
  p.title = 'Sent an on-chain zap';
  p.summary = undefined;
  const recipients = [...new Set(values(e, 'p').filter(isHex64))];
  let lead = 'Sent an on-chain zap';
  if (recipients.length) lead += ` to ${recipients.slice(0, MAX_LIST).map(personLink).join(', ')}`;
  const link = coordinate(e) ?? target(e);
  if (link) lead += ` for ${link}`;
  p.lead = paragraph(lead);
  if (recipients.length === 1) p.people = recipients;
  naming(p, (name) => ({
    title: `${who(name, e.pubkey)} sent ${recipients.length === 1 ? `${who(name, recipients[0])} ` : ''}an on-chain zap`,
  }));
}

function highlight(p: Parts, e: NostrEvent, content: string): void {
  p.content = { kind: 'quote', source: content };
  const comment = tag(e, 'comment');
  if (comment) p.extra = paragraph(escape(comment));
  // Where it is from: a URL, marked `source` by preference, then an event.
  const sources = all(e, 'r').filter((t) => t[1] !== 'mention');
  const url = safeUrl((sources.find((t) => t[1] === 'source') ?? sources[0])?.[0]);
  const from = (url && webLink(url, url)) ?? coordinate(e) ?? target(e);
  if (from) p.extra += paragraph(`From ${from}`);
  p.summary = mapOpt(contentText(p.content), (t) => `“${clamp(t, 180)}”`);
  p.fallback = comment;
}

function poll(p: Parts, e: NostrEvent): void {
  // Its question is its title, and its options what it says.
  const question = withoutReferences(e.content).trim();
  p.title = question ? clamp(question, 120) : 'Poll';
  const options = all(e, 'option').map((t) => t[1]?.trim() ?? '').filter(Boolean);
  if (options.length) {
    p.summary ??= options.join(' · ');
    // The title says it all, unless it was cut short.
    if (question && p.title === question) p.content = HIDDEN;
  }
  p.extra = list(options.map(escape), options.length);
  const ends = tag(e, 'endsAt');
  if (ends && /^-?\d+$/.test(ends)) p.extra += paragraph(`Ends ${date(Number(ends))}`);
}

function pollVote(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): void {
  // The poll says what was asked, and what the options a vote names are.
  const poll = ref?.kind === 1068 ? ref : undefined;
  const question = mapOpt(poll && withoutReferences(poll.content).trim(), (q) => (q ? clamp(q, 100) : undefined));
  const chosen = new Set(values(e, 'response'));
  const picked = poll ? all(poll, 'option').filter((t) => chosen.has(t[0]?.trim() ?? '')).map((t) => t[1]?.trim()).filter((o): o is string => !!o) : [];
  p.summary = picked.length ? `Voted ${picked.map((o) => `“${clamp(o, 60)}”`).join(', ')}` : 'Voted in a poll';
  p.content = HIDDEN;
  p.lead = mapOpt(target(e), (link) => paragraph(`Voted in ${link}`)) ?? '';
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} voted in ${question ? `“${question}”` : 'a poll'}` }));
}

function report(p: Parts, e: NostrEvent): void {
  // The reason is a target tag's third value: an event's, a blob's, or a person's.
  const reason = ['e', 'x', 'p']
    .map((name) => all(e, name).map((t) => t[1]?.trim().toLowerCase()).find((r) => r && !r.startsWith('ws')))
    .find((r) => r);
  const labels: Record<string, string> = {
    nudity: 'nudity', malware: 'malware', profanity: 'hateful speech', illegal: 'illegal content', spam: 'spam', impersonation: 'impersonation',
  };
  const why = reason ? labels[reason] : undefined;
  p.title = why ? `Reported for ${why}` : 'Report';
  const reported = tag(e, 'p');
  p.lead = reported && isHex64(reported) ? paragraph(`Reported ${personLink(reported)}`) : '';
  p.image = undefined;
  p.video = undefined;
  if (!isHex64(reported)) return;
  p.people = [reported];
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} reported ${who(name, reported)}${why ? ` for ${why}` : ''}` }));
}

function peopleList(p: Parts, e: NostrEvent): void {
  p.title = e.kind === 3 ? 'Follows' : p.title ?? tag(e, 'name') ?? tag(e, 'd');
  people(p, e);
  if (e.kind === 3) naming(p, (name) => ({ title: `People ${who(name, e.pubkey)} follows` }));
}

/** The most people a description names. */
const MAX_NAMED = 8;

/** The people an event names: listed, and named in its description, as many as have names. */
function people(p: Parts, e: NostrEvent): void {
  const pubkeys = [...new Set(values(e, 'p').filter(isHex64))];
  p.fallback ??= count(pubkeys.length, 'person', 'people');
  p.content = HIDDEN;
  p.extra = list(pubkeys.map(personLink), pubkeys.length);
  const first = pubkeys.slice(0, MAX_NAMED);
  p.people = [...(p.people ?? []), ...first];
  naming(p, (name) => {
    const names = first.map(name).filter((n): n is string => !!n);
    return names.length ? { fallback: andList(names, pubkeys.length - names.length) } : {};
  });
}

/** `A, B and C`, or `A, B, C and 5 more`. */
function andList(items: string[], more: number): string {
  if (more > 0) return `${items.join(', ')} and ${thousands(more)} more`;
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] ?? '';
}

function relayList(p: Parts, e: NostrEvent): void {
  const relays = all(e, 'r').map((t) => [t[0]?.trim() ?? '', t[1]] as const).filter(([r]) => r);
  p.title = 'Relays';
  p.fallback = count(relays.length, 'relay', 'relays');
  // A relay is known by its host.
  const hosts = relays.map(([relay]) => relay.replace(/^wss?:\/\//i, '').replace(/\/+$/, '')).filter(Boolean);
  if (hosts.length) p.fallback = andList(hosts.slice(0, MAX_NAMED), hosts.length - Math.min(hosts.length, MAX_NAMED));
  p.content = HIDDEN;
  p.extra = list(
    relays.map(([relay, marker]) => (marker === 'read' || marker === 'write' ? `<code>${escape(relay)}</code> (${marker} only)` : `<code>${escape(relay)}</code>`)),
    relays.length,
  );
  naming(p, (name) => ({ title: `${who(name, e.pubkey)}'s relays` }));
}

function identities(p: Parts, e: NostrEvent): void {
  const accounts = values(e, 'i');
  p.title = 'Linked accounts';
  p.fallback = accounts.length ? andList(accounts.slice(0, MAX_NAMED), accounts.length - Math.min(accounts.length, MAX_NAMED)) : 'No linked accounts';
  p.content = HIDDEN;
  p.extra = list(accounts.map(escape), accounts.length);
  naming(p, (name) => ({ title: `${who(name, e.pubkey)}'s linked accounts` }));
}

function status(p: Parts, e: NostrEvent): void {
  const d = tag(e, 'd') ?? 'general';
  p.title = d === 'general' ? 'Status' : d === 'music' ? 'Listening to' : `${clamp(d, 40)} status`;
  const url = urlTag(e, 'r');
  if (url) p.extra = paragraph(webLink(url, url));
  if (d === 'general' || d === 'music') {
    naming(p, (name) => ({ title: d === 'music' ? `${who(name, e.pubkey)} is listening to` : `${who(name, e.pubkey)}'s status` }));
  }
}

function bookmark(p: Parts, e: NostrEvent): void {
  // NIP-B0 names the page by its `d`, the URL without its scheme.
  const url = urlTag(e, 'r') ?? safeUrl(mapOpt(tag(e, 'd'), (d) => `https://${d.replace(/^\/+/, '')}`));
  if (url) p.lead = paragraph(webLink(url, url));
  p.fallback ??= url;
}

function theme(p: Parts, e: NostrEvent): boolean {
  if (e.kind === 36767) {
    if (!p.title) return false;
  } else {
    p.title ??= 'Profile theme';
  }
  const background = safeUrl(all(e, 'bg').map((t) => field(t, 'url')).find((u) => u));
  p.image = background ?? p.image;
  p.fallback = 'A theme';
  p.content = HIDDEN;
  return true;
}

function quiz(p: Parts, e: NostrEvent): boolean {
  if (!p.title) return false;
  p.fallback = count(all(e, 'question').length, 'question', 'questions');
  return true;
}

function memoryCard(p: Parts, e: NostrEvent, content: string): void {
  p.title = saveTitle(content) ?? tag(e, 'title') ?? tag(e, 'filename');
  p.summary = 'A PlayStation memory card save';
  p.image = undefined;
  p.content = HIDDEN;
}

function colorMoment(p: Parts, e: NostrEvent, content: string): void {
  const colors = values(e, 'c').filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
  const trimmed = content.trim();
  const emoji = trimmed && [...trimmed].length <= 2 ? trimmed : undefined;
  p.title = tag(e, 'name') ?? 'Color moment';
  p.summary = emoji && colors.length ? `${emoji} ${colors.join(' ')}` : emoji ?? (colors.length ? colors.join(' ') : undefined);
  p.content = HIDDEN;
}

function geocache(p: Parts, e: NostrEvent): void {
  p.title = tag(e, 'name');
  const rating = [['D', 'Difficulty'], ['T', 'Terrain']]
    .map(([name, label]) => mapOpt(tag(e, name), (v) => `${label} ${v}`))
    .filter((r): r is string => !!r);
  if (rating.length) {
    const joined = rating.join(' · ');
    p.lead = paragraph(escape(joined));
    const about = contentText(p.content);
    p.summary = about ? `${joined} — ${about}` : joined;
  }
}

function geocacheFind(p: Parts, e: NostrEvent, ref: NostrEvent | undefined): void {
  p.title = 'Found a geocache';
  p.lead = mapOpt(coordinate(e), (link) => paragraph(`Logged a find at ${link}`)) ?? '';
  // The cache found: its name, its picture, and what it says of itself.
  const cache = about(ref, [37516]);
  p.image ??= cache?.image;
  p.fallback = cache?.text;
  const found = cache?.title ? `“${clamp(cache.title, 80)}”` : 'a geocache';
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} found ${found}` }));
}

function deck(p: Parts, e: NostrEvent): void {
  p.image = urlTag(e, 'banner') ?? p.image;
  const commanders = values(e, 'C');
  if (commanders.length) p.summary = `Commander: ${commanders.join(', ')}`;
  const cards = all(e, 'c')
    .map((t) => {
      const name = t[0]?.trim();
      const quantity = t[1] !== undefined && /^\d+$/.test(t[1].trim()) ? Number(t[1].trim()) : 0;
      return name && quantity > 0 ? `${quantity} ${escape(name)}` : undefined;
    })
    .filter((c): c is string => !!c);
  p.fallback = count(cards.length, 'card', 'cards');
  p.content = HIDDEN;
  p.extra = list(cards, cards.length);
}

/** A bird detection's species, by its common and scientific names. */
export function birdNames(e: NostrEvent): { common?: string; scientific?: string } {
  // Its `alt` reads `Bird detection: Common Name (Scientific name)`.
  const alt = tag(e, 'alt');
  const named = alt && alt.lastIndexOf(': ') >= 0 ? alt.slice(alt.lastIndexOf(': ') + 2).trim() : undefined;
  const paren = named?.indexOf(' (') ?? -1;
  const common = (named && (paren >= 0 ? named.slice(0, paren) : named).trim()) || undefined;
  const scientific = tag(e, 'n') ?? (named && paren >= 0 ? named.slice(paren + 2).replace(/\)+$/, '').trim() : undefined);
  return { common, scientific };
}

function bird(p: Parts, e: NostrEvent): void {
  const { common, scientific } = birdNames(e);
  p.title = common ?? scientific ?? 'Bird sighting';
  p.fallback = undefined;
  if (common) {
    p.lead = scientific ? paragraph(`<i>${escape(scientific)}</i>`) : '';
    p.fallback = scientific;
  }
}

function birdex(p: Parts, e: NostrEvent): void {
  const species = new Set(all(e, 'i').map((t) => t[0]).filter((i) => i?.includes('wikidata.org/')));
  const names = values(e, 'n');
  p.title = 'Birdex';
  p.fallback = count(species.size, 'species', 'species');
  p.content = HIDDEN;
  p.extra = list(names.map((n) => `<i>${escape(n)}</i>`), names.length);
  naming(p, (name) => ({ title: `${who(name, e.pubkey)}'s Birdex` }));
}

function sno(p: Parts, e: NostrEvent, content: string): void {
  const value = parseObject(content).name;
  const name = typeof value === 'string' ? clamp(value.trim(), 64) : '';
  p.title = name || tag(e, 'name');
  p.fallback = 'A 3D object';
  p.content = HIDDEN;
}

function blobbi(p: Parts, e: NostrEvent): void {
  p.title = tag(e, 'name') ?? 'Blobbi';
  const stage = tag(e, 'stage');
  p.summary = stage === 'egg' ? 'A Blobbi egg' : stage === 'baby' || stage === 'adult' ? `A ${stage} Blobbi` : 'A Blobbi';
  p.content = HIDDEN;
}

function tarot(p: Parts, e: NostrEvent): void {
  const cards = all(e, 'c')
    .map((t) => {
      const name = cardName(t[0]?.trim() ?? '');
      return name ? (t[1] === 'reversed' ? `${name} (reversed)` : name) : undefined;
    })
    .filter((c): c is string => !!c);
  p.title = 'Tarot reading';
  if (cards.length) {
    p.lead = paragraph(escape(cards.join(' · ')));
    p.fallback = cards.join(', ');
  }
}

/** `two-of-cups` as a card is named: `Two of Cups`. */
function cardName(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word, i) => (i > 0 && (word === 'of' || word === 'the') ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** A message only its recipient can read: who sent it to whom, and nothing of what it says. */
function encrypted(p: Parts, e: NostrEvent): void {
  const recipient = tag(e, 'p');
  const what = e.kind === 4 ? 'Sent a direct message' : e.kind === 8211 ? 'Sent a letter' : 'An invite to an encrypted community';
  p.title = e.kind === 33301 ? 'Encrypted community invite' : undefined;
  p.summary = what;
  p.fallback = undefined;
  p.image = undefined;
  p.video = undefined;
  p.audio = undefined;
  p.content = HIDDEN;
  p.lead = recipient && isHex64(recipient) && e.kind !== 33301 ? paragraph(`${what} to ${personLink(recipient)}`) : paragraph(what);
  if (e.kind === 33301) return;
  // One to oneself names no one else.
  const to = isHex64(recipient) && recipient !== e.pubkey ? recipient : undefined;
  if (to) p.people = [to];
  const thing = e.kind === 4 ? 'a direct message' : 'a letter';
  naming(p, (name) => ({ title: `${who(name, e.pubkey)} sent ${to ? `${who(name, to)} ` : ''}${thing}` }));
}

function vanish(p: Parts, e: NostrEvent): void {
  const everywhere = values(e, 'relay').includes('ALL_RELAYS');
  p.title = everywhere ? 'Request to vanish from every relay' : 'Request to vanish';
  p.fallback = 'Asked relays to erase this identity';
  p.image = undefined;
  p.video = undefined;
  p.audio = undefined;
}

/** The first image, video and audio an event carries: from its NIP-92 `imeta` tags, then its `url` tags, then URLs in its text. */
function mediaOf(e: NostrEvent, content: string): { image?: string; video?: Video; audio?: Audio } {
  const media: { image?: string; video?: Video; audio?: Audio } = {};
  let thumbnail: string | undefined;

  for (const entries of imetas(e)) {
    const url = safeUrl(field(entries, 'url'));
    if (!url) continue;
    const mime = field(entries, 'm') ?? '';
    const kind = mimeKind(mime) ?? mediaKind(url);
    if (kind === 'image' && !media.image) {
      media.image = url;
    } else if (kind === 'video' && !media.video) {
      const [width, height] = dimensions(field(entries, 'dim'));
      thumbnail ??= safeUrl(field(entries, 'image') ?? field(entries, 'thumb'));
      media.video = { url, type: mimeKind(mime) === 'video' ? mime : videoType(url), width, height };
    } else if (kind === 'audio' && !media.audio) {
      thumbnail ??= safeUrl(field(entries, 'image') ?? field(entries, 'thumb'));
      media.audio = { url, type: mimeKind(mime) === 'audio' ? mime : audioType(url) };
    }
  }

  const tagged = all(e, 'url').map((t) => t[0]).filter((u): u is string => !!u);
  for (const raw of [...tagged, ...urls(content)]) {
    const url = safeUrl(raw);
    if (!url) continue;
    const kind = mediaKind(url);
    if (kind === 'image' && !media.image) media.image = url;
    else if (kind === 'video' && !media.video) media.video = { url, type: videoType(url) };
    else if (kind === 'audio' && !media.audio) media.audio = { url, type: audioType(url) };
  }

  media.image ??= thumbnail;
  return media;
}

/** The first `imeta` whose file is audio, by its type or its name. */
function imetaAudio(e: NostrEvent): Audio | undefined {
  for (const entries of imetas(e)) {
    const url = safeUrl(field(entries, 'url'));
    if (!url) continue;
    const mime = field(entries, 'm');
    const audio = mime && mimeKind(mime) === 'audio' ? mime : undefined;
    if (audio || mediaKind(url) === 'audio') return { url, type: audio ?? audioType(url) };
  }
  return undefined;
}

/** A tag's URL as audio, whatever its name says: a tag named for audio is. */
function taggedAudio(e: NostrEvent, name: string): Audio | undefined {
  return mapOpt(urlTag(e, name), (url) => ({ url, type: audioType(url) }));
}

function imetaThumbnail(e: NostrEvent): string | undefined {
  for (const entries of imetas(e)) {
    const url = safeUrl(field(entries, 'image') ?? field(entries, 'thumb'));
    if (url) return url;
  }
  return undefined;
}

/** `WxH`, as `imeta` and NIP-94 write a size. */
function dimensions(dim: string | undefined): [number | undefined, number | undefined] {
  const match = dim && /^\s*(\d+)\s*x\s*(\d+)\s*$/.exec(dim);
  if (!match) return [undefined, undefined];
  const [w, h] = [Number(match[1]), Number(match[2])];
  return [w > 0 ? w : undefined, h > 0 ? h : undefined];
}

/** A note's text as a description: without the media and `nostr:` references it carries, which say nothing in a preview. */
function withoutReferences(content: string): string {
  let out = content;
  for (const url of urls(content)) {
    if (/^nostr:/i.test(url) || mapOpt(safeUrl(url), mediaKind)) out = out.replace(url, ' ');
  }
  return out;
}

/**
 * What a lightning invoice is for, in sats, from its human-readable part
 * (BOLT 11): `lnbc2500u…` is 2,500 µBTC. Undefined for one with no amount.
 */
export function bolt11Sats(invoice: string): number | undefined {
  let lower = invoice.trim().toLowerCase();
  if (lower.startsWith('lightning:')) lower = lower.slice('lightning:'.length);
  const separator = lower.lastIndexOf('1');
  if (separator < 0 || !lower.startsWith('ln')) return undefined;
  // The currency, `bc`, `tb`, `bcrt`; then the amount and its multiplier.
  const amount = lower.slice(2, separator).replace(/^[a-z]+/, '');
  const match = /^(\d+)([munp]?)$/.exec(amount);
  if (!match) return undefined;
  const value = BigInt(match[1]);
  const multipliers: Record<string, bigint> = { '': 100_000_000_000n, m: 100_000_000n, u: 100_000n, n: 100n };
  const msat = match[2] === 'p' ? value / 10n : value * multipliers[match[2]];
  return Number(msat / 1000n);
}

/**
 * A PlayStation save's title, from the header of its first block: the bytes
 * after `SC`, in Shift-JIS. Full-width letters, digits and punctuation are
 * read as the ASCII they stand for; anything else (kana, kanji) is left out,
 * and a title that is all of it falls back to the tag.
 */
export function saveTitle(content: string): string | undefined {
  const hex = content.trim().slice(0, 0x44 * 2);
  if (hex.length < 0x44 * 2 || !/^[0-9a-fA-F]+$/.test(hex)) return undefined;
  const header = hex.match(/../g)!.map((b) => parseInt(b, 16));
  if (header[0] !== 0x53 || header[1] !== 0x43) return undefined;
  let raw = header.slice(4);
  const end = raw.indexOf(0);
  if (end >= 0) raw = raw.slice(0, end);
  let title = '';
  for (let i = 0; i < raw.length;) {
    const lead = raw[i];
    if (lead >= 0x20 && lead < 0x7f) {
      title += String.fromCharCode(lead);
      i += 1;
    } else if ((lead >= 0x81 && lead <= 0x9f) || (lead >= 0xe0 && lead <= 0xfc)) {
      const c = raw[i + 1] !== undefined ? fullWidth(lead, raw[i + 1]) : undefined;
      if (c) title += c;
      i += 2;
    } else {
      i += 1;
    }
  }
  const words = title.split(/\s+/).filter(Boolean).join(' ');
  return words || undefined;
}

function fullWidth(lead: number, trail: number): string | undefined {
  if (lead === 0x82 && trail >= 0x4f && trail <= 0x58) return String.fromCharCode(0x30 + trail - 0x4f);
  if (lead === 0x82 && trail >= 0x60 && trail <= 0x79) return String.fromCharCode(0x41 + trail - 0x60);
  if (lead === 0x82 && trail >= 0x81 && trail <= 0x9a) return String.fromCharCode(0x61 + trail - 0x81);
  if (lead !== 0x81) return undefined;
  if (trail >= 0x5b && trail <= 0x5d) return '-';
  const punctuation: Record<number, string> = {
    0x40: ' ', 0x43: ',', 0x44: '.', 0x46: ':', 0x47: ';', 0x48: '?', 0x49: '!', 0x7c: '-', 0x5e: '/', 0x60: '~', 0x62: '|', 0x65: "'", 0x66: "'",
    0x67: '"', 0x68: '"', 0x69: '(', 0x6a: ')', 0x6d: '[', 0x6e: ']', 0x7b: '+', 0x81: '=', 0x83: '<', 0x84: '>', 0x90: '$', 0x93: '%',
    0x94: '#', 0x95: '&', 0x96: '*', 0x97: '@',
  };
  return punctuation[trail];
}

// ─── Tags ─────────────────────────────────────────────────────────────

/** The first tag of a name's value, when it has a non-empty one. */
export function tag(e: NostrEvent, name: string): string | undefined {
  return e.tags.find(([n]) => n === name)?.[1]?.trim() || undefined;
}

/** A tag's URL, if it is one a page may load. */
function urlTag(e: NostrEvent, name: string): string | undefined {
  return safeUrl(tag(e, name));
}

/** Every tag of a name, each without it. */
function all(e: NostrEvent, name: string): string[][] {
  return e.tags.filter(([n]) => n === name).map((t) => t.slice(1));
}

/** Every non-empty value of a tag's name. */
function values(e: NostrEvent, name: string): string[] {
  return all(e, name).map((t) => t[0]?.trim() ?? '').filter(Boolean);
}

function imetas(e: NostrEvent): string[][] {
  return all(e, 'imeta');
}

/** An `imeta`-style entry, `key value`. */
function field(entries: string[], key: string): string | undefined {
  for (const entry of entries) {
    if (entry.startsWith(`${key} `)) {
      const value = entry.slice(key.length + 1).trim();
      if (value) return value;
    }
  }
  return undefined;
}

function publishedAt(e: NostrEvent): number | undefined {
  const at = tag(e, 'published_at');
  return at && /^\d+$/.test(at) && Number(at) > 0 ? Number(at) : undefined;
}

/** The event an event is about, by its last `e` tag, linked to its page on the same site. */
function target(e: NostrEvent): string | undefined {
  const id = all(e, 'e').map((t) => t[0]).filter(isHex64).pop();
  return id ? `<a href="/${nip19.noteEncode(id)}">a post</a>` : undefined;
}

/** The address an event is about, by its `a` tag, linked the same way. */
function coordinate(e: NostrEvent): string | undefined {
  const a = all(e, 'a').map((t) => t[0]).find((v) => v !== undefined);
  if (!a) return undefined;
  const [kindText, pubkey, ...rest] = a.split(':');
  const identifier = rest.join(':');
  if (!/^\d+$/.test(kindText) || !isHex64(pubkey)) return undefined;
  const naddr = nip19.naddrEncode({ kind: Number(kindText), pubkey, identifier });
  return `<a href="/${naddr}">${identifier ? escape(identifier) : 'this'}</a>`;
}

export function personLink(pubkey: string): string {
  return `<a href="/${nip19.npubEncode(pubkey)}">@${escape(shortNpub(pubkey))}</a>`;
}

/** An npub, shortened, for someone with no name. */
export function shortNpub(pubkey: string): string {
  const npub = nip19.npubEncode(pubkey);
  return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
}

function webLink(url: string, label: string): string {
  return `<a href="${escape(url)}" rel="nofollow ugc">${escape(label)}</a>`;
}

/** Markup in a paragraph. The caller has escaped it. */
export function paragraph(html: string): string {
  return `<p>${html}</p>\n`;
}

/** Items in a list, at most {@link MAX_LIST} of the `total`, each markup the caller has escaped. */
function list(items: string[], total: number): string {
  const shown = items.slice(0, MAX_LIST);
  if (!shown.length) return '';
  let out = '<ul>\n' + shown.map((item) => `<li>${item}</li>\n`).join('');
  if (total > shown.length) out += `<li>and ${thousands(total - shown.length)} more</li>\n`;
  return out + '</ul>\n';
}

function count(n: number, one: string, many: string): string {
  return `${thousands(n)} ${n === 1 ? one : many}`;
}

/** `1234567` as `1,234,567`. */
function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function bytes(n: number): string {
  if (n >= 2 ** 30) return `${(n / 2 ** 30).toFixed(1)} GB`;
  if (n >= 2 ** 20) return `${(n / 2 ** 20).toFixed(1)} MB`;
  if (n >= 2 ** 10) return `${(n / 2 ** 10).toFixed(1)} KB`;
  return `${n} bytes`;
}

/** `m:ss`, or `h:mm:ss`. */
function clock(seconds: number): string {
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A day, as `June 1, 2025`, in UTC. npanel's sandbox has no `Intl` to format one by. */
export function date(seconds: number): string {
  const at = new Date(seconds * 1000);
  return `${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}, ${at.getUTCFullYear()}`;
}

/** A file's name, from its URL, unless it is only a Blossom hash. */
function fileName(url: string): string | undefined {
  let name: string | undefined;
  try {
    name = new URL(url).pathname.split('/').filter(Boolean).pop();
  } catch {
    return undefined;
  }
  if (!name) return undefined;
  try {
    name = decodeURIComponent(name);
  } catch {
    // Kept as written.
  }
  return isHex64(name.split('.')[0]) ? undefined : name;
}

export function isHex64(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{64}$/.test(value);
}

/** At most `max` UTF-16 units of `text`, never splitting a surrogate pair. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const end = /[\uD800-\uDBFF]/.test(text[max - 1]) ? max - 1 : max;
  return text.slice(0, end);
}

/** Text on one line, cut to `max` characters at a word where it can be, with an ellipsis. */
export function clamp(value: string, max: number): string {
  const words = value.split(/\s+/).filter(Boolean).join(' ');
  const chars = [...words];
  if (chars.length <= max) return words;
  const cut = chars.slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  const kept = space >= 0 && [...cut.slice(0, space)].length > max * 0.6 ? cut.slice(0, space) : cut;
  return `${kept.trimEnd()}…`;
}

export function parseObject(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseEvent(json: string): NostrEvent | undefined {
  const value = parseObject(json);
  const ok = typeof value.id === 'string' && typeof value.pubkey === 'string' && typeof value.sig === 'string' && typeof value.kind === 'number'
    && typeof value.created_at === 'number' && typeof value.content === 'string' && Array.isArray(value.tags)
    && value.tags.every((t) => Array.isArray(t) && t.every((v) => typeof v === 'string'));
  return ok ? value as unknown as NostrEvent : undefined;
}

function mapOpt<T, U>(value: T | undefined, fn: (value: T) => U | undefined): U | undefined {
  return value === undefined ? undefined : fn(value);
}
