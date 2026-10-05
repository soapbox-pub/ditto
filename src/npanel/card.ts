/**
 * What a page about a Nostr event says about it, in the shape npanel takes:
 * the fields a link preview shows, the article a search engine reads, and
 * the page as schema.org describes it.
 */

import type { NostrEvent } from '@nostrify/nostrify';
import * as nip19 from 'nostr-tools/nip19';

import { escape, renderMarkdown, renderText, safeUrl } from './html';
import { clamp, contentSource, contentText, date, MAX_CONTENT, parseObject, type Audio, type Parts, shortNpub, truncate, type Video, withoutEmoji } from './kinds';

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 200;
const MAX_NAME = 100;

/** What `preview()` returns to npanel. */
export interface Preview {
  title?: string;
  description?: string;
  body?: string;
  image?: string | Promise<Blob | null>;
  type?: string;
  twitter?: 'summary' | 'summary_large_image';
  video?: { url: string; type: string; width?: number; height?: number };
  audio?: { url: string; type: string };
  published?: number;
  jsonLd?: Record<string, unknown>;
}

/** Where the page is, and what the app serving it is called. */
export interface Page {
  url: string;
  origin: string;
  appName: string;
}

/** A kind 0, as far as a preview reads it. */
export interface Profile {
  pubkey: string;
  name?: string;
  about?: string;
  picture?: string;
  website?: string;
  nip05?: string;
  /** Everything else it says, for a profile's own image. */
  fields: Record<string, unknown>;
}

export function readProfile(event: NostrEvent | undefined, pubkey: string): Profile {
  const fields = event && event.pubkey === pubkey && event.kind === 0 ? parseObject(event.content) : {};
  const field = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string).trim() || undefined : undefined);
  // A name that's all custom emoji keeps its shortcodes: they're all it has.
  const named = field('display_name') ?? field('displayName') ?? field('name');
  const name = named && event ? withoutEmoji(named, event.tags) || named : named;
  const about = field('about');
  const nip05 = field('nip05');
  return {
    pubkey,
    name: name && clamp(name, MAX_NAME),
    about: about && truncate(about, MAX_CONTENT),
    picture: safeUrl(field('picture')),
    website: safeUrl(field('website')),
    nip05: nip05 && clamp(nip05, MAX_NAME),
    fields,
  };
}

/** Their name, or a shortened npub for someone without one. */
export function displayName(profile: Profile): string {
  return profile.name ?? shortNpub(profile.pubkey);
}

function person(profile: Profile, page: Page): Record<string, unknown> {
  const npub = nip19.npubEncode(profile.pubkey);
  return withoutNulls({ '@type': 'Person', name: displayName(profile), identifier: npub, url: `${page.origin}/${npub}`, image: profile.picture });
}

/** A profile's preview, from its kind 0. Its image is the avatar, small, unless the caller draws one. */
export function profilePreview(profile: Profile, page: Page): Preview {
  const name = displayName(profile);
  let body = `<article>\n<header>\n<h1>${escape(name)}</h1>\n`;
  if (profile.nip05) body += `<p>${escape(profile.nip05.replace(/^_@/, ''))}</p>\n`;
  body += '</header>\n';
  if (profile.picture) body += `<p><img src="${escape(profile.picture)}" alt="${escape(name)}"></p>\n`;
  if (profile.about) body += renderText(profile.about);
  if (profile.website) body += `<p><a href="${escape(profile.website)}" rel="me nofollow ugc">${escape(profile.website)}</a></p>\n`;
  body += '</article>\n';

  const description = profile.about ? describe(profile.about) : undefined;
  return {
    title: `${name} on ${page.appName}`,
    description,
    body,
    image: profile.picture,
    twitter: 'summary',
    type: 'profile',
    jsonLd: withoutNulls({ '@context': 'https://schema.org', '@type': 'ProfilePage', url: page.url, mainEntity: withoutNulls({ ...person(profile, page), description }) }),
  };
}

/**
 * A preview from what {@link read} made of an event, the profile of whoever
 * it's attributed to, and those of the others it names, where they were found.
 */
export function eventPreview(kind: number, parts: Parts, profile: Profile, page: Page, people: Profile[] = []): Preview {
  const author = displayName(profile);
  const name = (pubkey: string) => (pubkey === profile.pubkey ? profile : people.find((p) => p.pubkey === pubkey))?.name;
  const named = parts.named?.(name);
  const description = describe(mapText(parts.summary ?? contentText(parts.content) ?? named?.fallback ?? parts.fallback, (text) => withoutEmoji(text, parts.emoji ?? [])));
  const style = parts.content.kind === 'markdown' ? 'article' : parts.video ? 'video' : parts.audio ? 'audio' : 'post';
  const headline = named?.title ?? parts.title;
  const title = headline ? clamp(headline, MAX_TITLE) : undefined;

  let body = '<article>\n<header>\n';
  if (title) body += `<h1>${escape(title)}</h1>\n`;
  body += `<p><a href="/${nip19.npubEncode(profile.pubkey)}" rel="author">${escape(author)}</a> · ${time(parts.published)}</p>\n`;
  body += parts.lead + '</header>\n';

  // Media an event names only in its tags is shown too; what its text, or
  // what follows it, names is shown there.
  const source = contentSource(parts.content);
  const unshown = (url: string) => !source.includes(url) && !parts.extra.includes(escape(url));
  if (parts.video && unshown(parts.video.url)) {
    const poster = parts.image ? ` poster="${escape(parts.image)}"` : '';
    body += `<p><video src="${escape(parts.video.url)}"${poster} controls preload="none"></video></p>\n`;
  } else if (parts.image && unshown(parts.image)) {
    body += `<p><img src="${escape(parts.image)}" alt=""></p>\n`;
  }
  if (parts.audio && !parts.video && unshown(parts.audio.url)) {
    body += `<p><audio src="${escape(parts.audio.url)}" controls preload="none"></audio></p>\n`;
  }
  switch (parts.content.kind) {
    case 'text': body += renderText(parts.content.source); break;
    case 'markdown': body += renderMarkdown(parts.content.source); break;
    case 'quote': body += `<blockquote>\n${renderText(parts.content.source)}</blockquote>\n`; break;
    case 'code': body += `<pre><code>${escape(parts.content.source)}</code></pre>\n`; break;
  }
  body += parts.extra + '</article>\n';

  const shownTitle = title ?? `${author} on ${page.appName}`;
  // The event's own image is drawn large; an avatar standing in for one is a
  // square, and drawn small beside the text.
  const image = parts.image ?? profile.picture;
  const published = new Date(parts.published * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const media = (m: Video | Audio | undefined, type: string) =>
    m && withoutNulls({ '@type': type, name: shownTitle, contentUrl: m.url, encodingFormat: m.type, uploadDate: published, thumbnailUrl: type === 'VideoObject' ? parts.image : undefined });

  return {
    title: shownTitle,
    description,
    body,
    image,
    twitter: parts.image ? 'summary_large_image' : 'summary',
    // A music track is a song; other audio — a podcast, a voice message — has no type of its own.
    type: style === 'video' ? 'video.other' : style === 'audio' && kind === 36787 ? 'music.song' : 'article',
    video: parts.video,
    audio: parts.audio,
    published: parts.published,
    jsonLd: withoutNulls({
      '@context': 'https://schema.org',
      '@type': style === 'article' ? 'Article' : 'SocialMediaPosting',
      headline: [...(title ?? description ?? shownTitle)].slice(0, 110).join(''),
      description,
      url: page.url,
      mainEntityOfPage: page.url,
      datePublished: published,
      image,
      video: media(parts.video, 'VideoObject'),
      audio: media(parts.audio, 'AudioObject'),
      author: person(profile, page),
    }),
  };
}

function mapText(text: string | undefined, fn: (text: string) => string): string | undefined {
  return text === undefined ? undefined : fn(text);
}

/** Text cut to a description's length, on one line. */
function describe(text: string | undefined): string | undefined {
  return text ? clamp(text, MAX_DESCRIPTION) || undefined : undefined;
}

/** A `<time>`, for a person and for a machine. */
function time(at: number): string {
  const when = new Date(at * 1000);
  if (Number.isNaN(when.getTime())) return '';
  return `<time datetime="${when.toISOString().replace(/\.\d{3}Z$/, 'Z')}">${date(at)}</time>`;
}

function withoutNulls<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null));
}
