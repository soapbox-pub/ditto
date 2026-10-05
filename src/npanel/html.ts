/**
 * Event content as HTML, for the article a crawler finds in a page's body.
 *
 * Whatever is written here is served on Ditto's own origin to anyone who
 * sends a crawler's User-Agent, which anyone can. npanel sanitizes the
 * article too, but nothing an author wrote is meant to reach it as markup in
 * the first place: text is escaped, a URL is kept only when it is http(s),
 * and the HTML a Markdown article embeds is read as text.
 */

import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import * as nip19 from 'nostr-tools/nip19';

/** Text made safe for an element's content or a quoted attribute value. */
export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * A URL an author gave, if it is one a page may link to or load: absolute,
 * and http(s). `javascript:`, `data:` and the rest are dropped rather than
 * neutralized, since nothing a crawler needs is behind them.
 */
export function safeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export type MediaKind = 'image' | 'video' | 'audio';

function extension(url: string): string | undefined {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const dot = path.lastIndexOf('.');
    return dot < 0 ? undefined : path.slice(dot + 1);
  } catch {
    return undefined;
  }
}

/** What a URL's file is, by its extension. */
export function mediaKind(url: string): MediaKind | undefined {
  const ext = extension(url) ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac'].includes(ext)) return 'audio';
  return undefined;
}

/** What a MIME type says a file is, where it says. */
export function mimeKind(mime: string | undefined): MediaKind | undefined {
  const m = (mime ?? '').trim().toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return undefined;
}

/** The MIME type of a video URL, by its extension, for `og:video:type`. */
export function videoType(url: string): string {
  return ({ webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg' } as Record<string, string>)[extension(url) ?? ''] ?? 'video/mp4';
}

/** The MIME type of an audio URL, by its extension, for `og:audio:type`. */
export function audioType(url: string): string {
  const types: Record<string, string> = {
    mp3: 'audio/mpeg', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', webm: 'audio/webm',
  };
  return types[extension(url) ?? ''] ?? 'audio/mp4';
}

/** URLs and `nostr:` references in a note's text. */
const TOKENS = /\bhttps?:\/\/[^\s<>"']+|\bnostr:(?:npub|nprofile|note|nevent|naddr)1[02-9ac-hj-np-z]+/gi;

/**
 * A URL found in running text, without the punctuation that ends the
 * sentence around it. A closing parenthesis stays when the URL opened one.
 */
function trimTrailing(token: string): [string, string] {
  let end = token.length;
  while (end > 0) {
    const c = token[end - 1];
    const head = token.slice(0, end);
    const unbalanced = c === ')' && (head.match(/\(/g) ?? []).length < (head.match(/\)/g) ?? []).length;
    if ('.,;:!?'.includes(c) || unbalanced) end -= 1;
    else break;
  }
  return [token.slice(0, end), token.slice(end)];
}

/** Every URL and `nostr:` reference in a text, as written, without the punctuation around it. */
export function urls(text: string): string[] {
  return [...text.matchAll(TOKENS)].map((m) => trimTrailing(m[0])[0]);
}

/**
 * The site's own path for a `nostr:` reference, and how to show it — or
 * undefined for anything that isn't one, or names a secret.
 */
export function nostrPath(token: string): [string, string] | undefined {
  if (!/^nostr:/i.test(token)) return undefined;
  const bech32 = token.slice(6).toLowerCase();
  let type: string;
  try {
    type = nip19.decode(bech32).type;
  } catch {
    return undefined;
  }
  if (type === 'nsec') return undefined;
  const mention = type === 'npub' || type === 'nprofile';
  return [`/${bech32}`, `${mention ? '@' : ''}${bech32.slice(0, 12)}…${bech32.slice(-4)}`];
}

/** One URL or `nostr:` reference from a note, as markup. */
function reference(token: string): string {
  const path = nostrPath(token);
  if (path) return `<a href="${escape(path[0])}">${escape(path[1])}</a>`;
  const url = safeUrl(token);
  if (!url) return escape(token);
  switch (mediaKind(url)) {
    case 'image':
      return `<img src="${escape(url)}" alt="" loading="lazy">`;
    case 'video':
      return `<video src="${escape(url)}" controls preload="none"></video>`;
    case 'audio':
      return `<audio src="${escape(url)}" controls preload="none"></audio>`;
    default:
      return `<a href="${escape(url)}" rel="nofollow ugc">${escape(token)}</a>`;
  }
}

/** Text with its line breaks kept. */
function lines(text: string): string {
  return escape(text).replace(/\r\n/g, '\n').replace(/\n/g, '<br>\n');
}

/**
 * A plain-text note as paragraphs, its links made links, its images and
 * videos shown, and the profiles and events it mentions linked to the page
 * for each on the same site.
 */
export function renderText(content: string): string {
  let out = '';
  for (const paragraph of content.split(/\r?\n[ \t]*\r?\n/).map((p) => p.trim()).filter(Boolean)) {
    out += '<p>';
    let last = 0;
    for (const found of paragraph.matchAll(TOKENS)) {
      out += lines(paragraph.slice(last, found.index));
      const [token, trailing] = trimTrailing(found[0]);
      out += reference(token) + escape(trailing);
      last = found.index! + found[0].length;
    }
    out += lines(paragraph.slice(last)) + '</p>\n';
  }
  return out;
}

/**
 * A Markdown article (NIP-23) as HTML.
 *
 * HTML the article embeds is shown as text. Links and images keep only
 * http(s) URLs and `#` fragments, and `nostr:` references — linked or in
 * the text — become the site's own path for each.
 */
export function renderMarkdown(content: string): string {
  // Link targets that are `nostr:` references become paths before parsing,
  // since the parser keeps only safe protocols.
  const source = content.replace(/\]\(\s*(nostr:[a-z0-9]+)\s*\)/gi, (whole, token: string) => {
    const path = nostrPath(token);
    return path ? `](${path[0]})` : '](#)';
  });
  const html = micromark(source, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  return linkMentions(dropRelative(html));
}

/** Links and images whose URL isn't a web URL, a fragment or a site path for a reference, with it dropped. */
function dropRelative(html: string): string {
  return html.replace(/ (href|src)="([^"]*)"/g, (whole, name: string, url: string) => {
    const decoded = url.replace(/&amp;/g, '&');
    const kept = decoded.startsWith('#') || /^\/(npub|nprofile|note|nevent|naddr)1[a-z0-9]+$/.test(decoded) || safeUrl(decoded);
    return kept ? whole : ` ${name}=""`;
  });
}

/** `nostr:` references in an article's text, outside links and code, made links. */
function linkMentions(html: string): string {
  let depth = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<(a|code|pre)\b/i.test(part)) depth += 1;
        else if (/^<\/(a|code|pre)>/i.test(part)) depth = Math.max(0, depth - 1);
        return part;
      }
      if (depth) return part;
      return part.replace(TOKENS, (token) => {
        const path = nostrPath(token);
        return path ? `<a href="${escape(path[0])}">${escape(path[1])}</a>` : token;
      });
    })
    .join('');
}

/**
 * An article's words, without its markup, for a description. Blocks part
 * words; the end of an emphasis or a link doesn't.
 */
export function markdownText(content: string): string {
  const html = micromark(content, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  return decodeEntities(html.replace(/<\/(p|h[1-6]|li|blockquote|pre|td|th|tr)>|<br ?\/?>/g, ' ').replace(/<[^>]*>/g, ''));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
