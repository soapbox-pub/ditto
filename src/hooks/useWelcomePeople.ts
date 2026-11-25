import { useNostr } from '@nostrify/react';
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { defineMessage, type MessageDescriptor } from 'react-intl';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useDiscoverAuthors } from '@/hooks/useDiscoverAuthors';
import { DITTO_RELAY, NGIT_RELAY } from '@/lib/appRelays';
import { parseImetaEntries, type ImetaEntry } from '@/lib/imeta';
import { parseMusicTrack, type ParsedMusicTrack } from '@/lib/musicHelpers';
import { isNostrId } from '@/lib/nostrId';
import { isHashtagStuffed, isOffTopicEvent, isSparseCollection, OFF_TOPIC, OFF_TOPIC_BUILD, SAFE_SEARCH } from '@/lib/newcomerFilter';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { parseThemeDefinition, THEME_DEFINITION_KIND, type ThemeDefinition } from '@/lib/themeEvent';

const DAY = 24 * 60 * 60;
const WEBXDC_MIME = 'application/x-webxdc';
const FOLLOW_PACK_KIND = 39089;
const ARTICLE_KIND = 30023;
const PODCAST_EPISODE_KIND = 30054;
const TRACK_KIND = 36787;
const REPO_KIND = 30617;
/** NIP-34 repo announcements and repo state: someone keeping a repo on Nostr. */
const GIT_KINDS = [REPO_KIND, 30618];
/** Ditto's NIP-89 client address, as tagged on everything posted from Ditto. */
const DITTO_CLIENT = '31990:781a1527055f74c1f70230f10384609b34548f8ab6a0a6caa74025827f9fdae5:ditto';

/**
 * Ditto's own kinds that someone makes on purpose: tarot pulls, color moments,
 * themes, Love Lists, letters, treasures (hidden and found), magic decks,
 * Blobbi, bird detections, emoji packs. Passive ones (an active profile theme,
 * a badge shelf) are left out; nearly everyone has them.
 */
const DITTO_KINDS = [2256, 3367, THEME_DEFINITION_KIND, 15683, 8211, 37516, 7516, 37381, 31124, 2473, 30030];

/** Kinds that make a good showcase on a card, most visual first. */
const SHOWCASE_KINDS = [31124, 2256, 2473, 3367, 30030, 37516, 7516, THEME_DEFINITION_KIND];

/** Whether a Ditto thing has something to show on its own, not just an icon standing in for it. */
function showcaseable(thing: WelcomeDittoThing): boolean {
  const { kind } = thing.event;
  if (!SHOWCASE_KINDS.includes(kind)) return false;
  if (kind === 30030) return !isSparseCollection(thing.event);
  if (kind === 37516 || kind === 7516 || kind === THEME_DEFINITION_KIND) return !!thing.image;
  return true;
}

/** Regulars use at least this many of Ditto's kinds, or one of them plus a few posts from Ditto. */
const REGULAR_KINDS = 2;
const REGULAR_POSTS = 3;


/**
 * Soapbox's Artists follow pack. Its members who have recent art to show are
 * placed first in the Artists section, ahead of what discovery turns up.
 */
const ARTISTS_PACK = { author: '781a1527055f74c1f70230f10384609b34548f8ab6a0a6caa74025827f9fdae5', title: 'artists' };

/** Most photos shown per person. */
const PHOTOS = 3;
/** Most people per section, as shown. */
export const PEOPLE = 10;
/** People gathered per section before profiles are screened. */
const GATHER = 16;
/** Fewest people a section needs to be shown at all. */
export const MIN_PEOPLE = 4;
/** Most pack members looked up. */
const MEMBERS = 40;

const HOT = `sort:hot distinct:author ${SAFE_SEARCH}`;

/** Webxdc uploads that are tools or tests, not things to play. */
const NOT_A_GAME = /tester|counter|\bapi\b|\btest\b|demo|openttd/i;

export interface WelcomePhoto { event: NostrEvent; image: ImetaEntry }
export interface WelcomeGame { event: NostrEvent; url: string; uuid?: string; name: string; icon: string }
export interface WelcomeTheme { event: NostrEvent; theme: ThemeDefinition }
export interface WelcomeTrack { event: NostrEvent; track: ParsedMusicTrack }
export interface WelcomeCover { event: NostrEvent; title: string; summary?: string; image?: string }
export interface WelcomeDittoThing {
  event: NostrEvent;
  /** A picture to show for it: a theme background or a treasure photo. */
  image?: string;
  /** Color moment swatches. */
  colors?: string[];
}
export interface WelcomeTalk { event: NostrEvent; text: string }

/** How a person's work is previewed on their card. */
export type WelcomePreview =
  | { type: 'themes'; works: WelcomeTheme[] }
  | { type: 'photos'; works: WelcomePhoto[] }
  | { type: 'game'; works: WelcomeGame[] }
  | { type: 'track'; works: WelcomeTrack[] }
  | { type: 'cover'; works: WelcomeCover[] }
  | { type: 'talk'; works: WelcomeTalk[] }
  | { type: 'ditto'; works: WelcomeDittoThing[] };

type PreviewType = WelcomePreview['type'];

export interface WelcomePerson {
  pubkey: string;
  preview: WelcomePreview;
}

export interface WelcomeSection {
  id: string;
  label: MessageDescriptor;
  people: WelcomePerson[];
  /** Only people from the Discover network, who are vouched for, so their bios aren't screened. */
  vetted?: boolean;
}

/**
 * The sections, in display order. Each finds people through hot discovery
 * (one item per author) on its kinds and hashtags, then previews them with
 * more of their own work from the same kinds and hashtags.
 */

const REGULARS_LABEL = defineMessage({ id: 'onboarding.people.regulars', defaultMessage: 'Ditto regulars' });

interface Archetype {
  id: string;
  label: MessageDescriptor;
  preview: PreviewType;
  kinds: number[];
  tags?: string[];
  /** Window for what's hot, in days. */
  days?: number;
  /**
   * Window for recent work, in days. Hot needs reactions, which most themes,
   * tracks and games never get, so recent work fills the section out.
   */
  recentDays?: number;
  /**
   * Found by their NIP-34 git activity (repos, pushes, patches, issues) rather
   * than hot discovery: people who build rarely hashtag it.
   */
  fromGit?: boolean;
  /** Only people in the Discover network, as with Ditto regulars. */
  vetted?: boolean;
}

const ARCHETYPES: Archetype[] = [
  {
    id: 'themes', preview: 'themes', kinds: [THEME_DEFINITION_KIND], days: 365, recentDays: 60,
    label: defineMessage({ id: 'onboarding.people.themes', defaultMessage: 'Theme makers' }),
  },
  {
    id: 'nature', preview: 'photos', kinds: [1, 20],
    tags: ['nature', 'naturestr', 'naturephotography', 'wildlife', 'birds', 'birdstr', 'treestr', 'flowers', 'wildflowers', 'landscape', 'hiking', 'forest', 'mountains', 'ocean', 'macro', 'insects', 'butterflies'],
    label: defineMessage({ id: 'onboarding.people.photos', defaultMessage: 'Out in nature' }),
  },
  {
    id: 'artists', preview: 'photos', kinds: [1, 20],
    tags: ['artstr', 'art', 'paintstr', 'painting', 'dailydrawing', 'drawing', 'illustration', 'sketch', 'watercolor', 'digitalart', 'artist'],
    label: defineMessage({ id: 'onboarding.people.artists', defaultMessage: 'Artists' }),
  },
  {
    id: 'photography', preview: 'photos', kinds: [1, 20],
    tags: ['photography', 'photostr', 'photo', 'filmphotography', 'streetphotography', 'blackandwhite', 'landscapephotography', 'analog', '35mm', 'shotoniphone'],
    label: defineMessage({ id: 'onboarding.people.photography', defaultMessage: 'Photographers' }),
  },
  {
    id: 'cooks', preview: 'photos', kinds: [1, 20],
    tags: ['foodstr', 'food', 'sourdough', 'baking', 'cooking', 'foodphotography', 'homecooking', 'recipe', 'bread'],
    label: defineMessage({ id: 'onboarding.people.cooks', defaultMessage: 'Cooks & bakers' }),
  },
  {
    id: 'music', preview: 'track', kinds: [TRACK_KIND], days: 60, recentDays: 90,
    label: defineMessage({ id: 'onboarding.people.music', defaultMessage: 'Musicians' }),
  },
  {
    id: 'pets', preview: 'photos', kinds: [1, 20],
    tags: ['dogstr', 'catstr', 'dogs', 'cats', 'dog', 'cat', 'pets', 'dogsofnostr', 'catsofnostr', 'catsofmastodon', 'dogsofmastodon'],
    label: defineMessage({ id: 'onboarding.people.pets', defaultMessage: 'Pets' }),
  },
  {
    id: 'games', preview: 'game', kinds: [1063], days: 3650, recentDays: 3650,
    label: defineMessage({ id: 'onboarding.people.games', defaultMessage: 'Game makers' }),
  },
  {
    id: 'builders', preview: 'talk', kinds: [1, REPO_KIND], fromGit: true, vetted: true,
    label: defineMessage({ id: 'onboarding.people.builders', defaultMessage: 'Builders' }),
  },
  {
    id: 'gardeners', preview: 'photos', kinds: [1, 20],
    tags: ['gardening', 'gardenstr', 'plantstr', 'garden', 'houseplants', 'plants', 'growyourown', 'homestead'],
    label: defineMessage({ id: 'onboarding.people.gardeners', defaultMessage: 'Gardeners' }),
  },
  {
    id: 'makers', preview: 'photos', kinds: [1, 20],
    tags: ['knitstr', 'knitting', 'crochet', 'embroidery', 'craftstr', 'crafts', 'sewing', 'woodworking', 'pottery', 'ceramics', 'quilting'],
    label: defineMessage({ id: 'onboarding.people.makers', defaultMessage: 'Makers' }),
  },
  {
    id: 'writers', preview: 'cover', kinds: [ARTICLE_KIND], days: 30, recentDays: 60, vetted: true,
    label: defineMessage({ id: 'onboarding.people.writers', defaultMessage: 'Writers' }),
  },
  {
    id: 'podcasts', preview: 'cover', kinds: [PODCAST_EPISODE_KIND], days: 90, recentDays: 180, vetted: true,
    label: defineMessage({ id: 'onboarding.people.podcasts', defaultMessage: 'Podcasters' }),
  },
];

function tagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

function photoOf(event: NostrEvent): WelcomePhoto | undefined {
  if ((event.kind !== 1 && event.kind !== 20) || isOffTopicEvent(event) || isHashtagStuffed(event)) return;
  const entry = parseImetaEntries(event.tags).find((e) => !e.encryption && (!e.mime || e.mime.startsWith('image/')));
  if (entry) return { event, image: entry };
  const url = sanitizeUrl(event.content.match(/https:\/\/\S+\.(?:jpe?g|png|webp)(?:\?\S*)?/i)?.[0]);
  return url ? { event, image: { url } } : undefined;
}

function gameOf(event: NostrEvent): WelcomeGame | undefined {
  if (event.kind !== 1063 || tagValue(event, 'm') !== WEBXDC_MIME || isOffTopicEvent(event)) return;
  const name = tagValue(event, 'alt')?.replace(/^Webxdc app:\s*/i, '').trim();
  const url = sanitizeUrl(tagValue(event, 'url'));
  const icon = sanitizeUrl(tagValue(event, 'image'));
  if (!name || !url || !icon || NOT_A_GAME.test(name) || OFF_TOPIC.test(name)) return;
  return { event, url, icon, name, uuid: tagValue(event, 'webxdc') };
}

function themeOf(event: NostrEvent): WelcomeTheme | undefined {
  if (event.kind !== THEME_DEFINITION_KIND) return;
  const theme = parseThemeDefinition(event);
  return theme?.background?.url && !OFF_TOPIC.test(theme.title) ? { event, theme } : undefined;
}

function trackOf(event: NostrEvent): WelcomeTrack | undefined {
  if (event.kind !== TRACK_KIND) return;
  const track = parseMusicTrack(event);
  if (!track?.artwork || track.encryption || OFF_TOPIC.test(`${track.title} ${track.artist}`)) return;
  return { event, track };
}

/** Some publishers HTML-escape their titles; show the text they meant. */
function unescapeHtml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|apos);?/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" })[e] ?? _);
}

function coverOf(event: NostrEvent): WelcomeCover | undefined {
  if (event.kind !== ARTICLE_KIND && event.kind !== PODCAST_EPISODE_KIND) return;
  if (event.tags.some(([n, v]) => ['t', 'title', 'summary'].includes(n) && OFF_TOPIC.test(v ?? ''))) return;
  const title = unescapeHtml(tagValue(event, 'title')?.trim() ?? '');
  if (!title) return;
  const summary = unescapeHtml(tagValue(event, 'summary')?.trim() ?? '');
  return { event, title, summary: summary || undefined, image: sanitizeUrl(tagValue(event, 'image')) };
}

function dittoThingOf(event: NostrEvent): WelcomeDittoThing | undefined {
  // Letters are encrypted: they count towards being a regular, but there's nothing to show.
  if (!DITTO_KINDS.includes(event.kind) || event.kind === 8211) return;
  if (OFF_TOPIC.test(`${tagValue(event, 'title') ?? ''} ${tagValue(event, 'name') ?? ''}`)) return;
  if (event.kind === THEME_DEFINITION_KIND) {
    const theme = parseThemeDefinition(event);
    return { event, image: sanitizeUrl(theme?.background?.url) };
  }
  if (event.kind === 3367) {
    const colors = event.tags.filter(([n, v]) => n === 'c' && /^#[0-9a-f]{3,8}$/i.test(v ?? '')).map(([, v]) => v);
    return colors.length ? { event, colors: colors.slice(0, 6) } : undefined;
  }
  if (event.kind === 37516) return { event, image: sanitizeUrl(tagValue(event, 'image')) };
  return { event };
}

/** Something they said: a short top-level note, links and hashtags stripped. */
function talkOf(event: NostrEvent): WelcomeTalk | undefined {
  if (event.kind === REPO_KIND) {
    const name = (tagValue(event, 'name') ?? tagValue(event, 'd'))?.trim();
    const description = tagValue(event, 'description')?.trim();
    if (!name || OFF_TOPIC_BUILD.test(`${name} ${description ?? ''}`)) return;
    return { event, text: description ? `${name} — ${description}` : name };
  }
  if (event.kind !== 1 || isHashtagStuffed(event) || event.tags.some(([n]) => n === 'e' || n === 'q')) return;
  if (OFF_TOPIC_BUILD.test(event.content)) return;
  const text = event.content
    .replace(/https?:\/\/\S+/g, '')
    .replace(/nostr:\S+/g, '')
    .replace(/(^|\s)#\S+/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return text.length >= 30 ? { event, text: text.slice(0, 280) } : undefined;
}

const PARSERS = { talk: talkOf, ditto: dittoThingOf, themes: themeOf, photos: photoOf, game: gameOf, track: trackOf, cover: coverOf } as const;

/**
 * Whether onboarding would show this to a newcomer, by the same rules as its
 * previews. Kinds it doesn't preview only need to be on topic, not stuffed
 * with hashtags, and not a near-empty collection.
 */
export function isWelcomeWork(event: NostrEvent): boolean {
  switch (event.kind) {
    case 1:
    case 20:
      return !!photoOf(event);
    case 1063:
      return !!gameOf(event);
    case THEME_DEFINITION_KIND:
      return !!themeOf(event);
    case TRACK_KIND:
      return !!trackOf(event);
  }
  if (DITTO_KINDS.includes(event.kind)) {
    const thing = dittoThingOf(event);
    return !!thing && (!SHOWCASE_KINDS.includes(event.kind) || showcaseable(thing));
  }
  return !isOffTopicEvent(event) && !isHashtagStuffed(event) && !isSparseCollection(event);
}

/** A person's newest works of one type, or nothing if they have none. */
function previewFor(events: NostrEvent[], type: PreviewType): WelcomePreview | undefined {
  // Builders lead with something they said; a repo only stands in when they've said nothing.
  const rank = (e: NostrEvent) => (type === 'talk' && e.kind !== 1 ? 1 : 0);
  const newest = [...events].sort((a, b) => rank(a) - rank(b) || b.created_at - a.created_at);
  const seen = new Set<string>();
  const works = newest
    .map((e) => PARSERS[type](e))
    .filter((w) => w !== undefined && !seen.has(w.event.id) && !!seen.add(w.event.id));
  if (!works.length) return;
  if (type === 'ditto') {
    // One of each kind they use, so the preview shows their range.
    const kinds = new Set<number>();
    const varied = (works as WelcomeDittoThing[]).filter((w) => !kinds.has(w.event.kind) && !!kinds.add(w.event.kind));
    return { type, works: varied.slice(0, 6) } as WelcomePreview;
  }
  return { type, works: works.slice(0, type === 'photos' ? PHOTOS : 3) } as WelcomePreview;
}

function byAuthor(events: NostrEvent[]): Map<string, NostrEvent[]> {
  const map = new Map<string, NostrEvent[]>();
  for (const e of events) map.set(e.pubkey, [...(map.get(e.pubkey) ?? []), e]);
  return map;
}

/** NIP-50 search for an archetype's kinds: notes must carry media and not be replies. */
function searchFor(a: Archetype, hot: boolean): string {
  const base = hot ? HOT : SAFE_SEARCH;
  if (a.preview === 'photos') return `${base} media:true -tag:e`;
  if (a.preview === 'talk') return `${base} -tag:e`;
  return base;
}

function filterFor(a: Archetype, extra: Partial<NostrFilter>): NostrFilter {
  return {
    kinds: a.kinds,
    ...(a.tags && { '#t': a.tags }),
    ...(a.id === 'games' && { '#m': [WEBXDC_MIME] }),
    ...extra,
  };
}

type Nostr = ReturnType<typeof useNostr>['nostr'];

interface Discovery {
  events: NostrEvent[];
  /** Pubkeys per archetype id, in the order they should be considered. */
  candidates: Record<string, string[]>;
}

/** One REQ: hot discovery for every archetype, plus Soapbox's Artists pack. */
async function discover(nostr: Nostr, signal: AbortSignal): Promise<Discovery> {
  const now = Math.floor(Date.now() / 1000);
  const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) };
  const ditto = nostr.relay(DITTO_RELAY).query([
    // Regulars: Ditto's own kinds, and posts made from Ditto, over the last month.
    { kinds: DITTO_KINDS, since: now - 30 * DAY, limit: 1000, search: SAFE_SEARCH },
    { kinds: [1, 20, 1111], since: now - 30 * DAY, limit: 1000, search: `client:${DITTO_CLIENT} ${SAFE_SEARCH}` },
    { kinds: [FOLLOW_PACK_KIND], authors: [ARTISTS_PACK.author], limit: 30 },
    ...ARCHETYPES.filter((a) => !a.vetted).flatMap((a) => [
      filterFor(a, { since: now - (a.days ?? 7) * DAY, limit: 16, search: searchFor(a, true) }),
      filterFor(a, { since: now - (a.recentDays ?? 14) * DAY, limit: 40, search: `distinct:author ${searchFor(a, false)}` }),
    ]),
  ], opts);
  const events = await ditto;

  const pack = events
    .filter((e) => e.kind === FOLLOW_PACK_KIND && tagValue(e, 'title')?.trim().toLowerCase() === ARTISTS_PACK.title)
    .sort((a, b) => b.created_at - a.created_at)[0];
  const packArtists = pack?.tags.filter(([n, pk]) => n === 'p' && isNostrId(pk)).map(([, pk]) => pk).slice(0, MEMBERS) ?? [];

  const candidates: Record<string, string[]> = { regulars: regularsOf(events, now) };
  for (const a of ARCHETYPES.filter((a) => !a.vetted)) {
    const found = events.filter((e) => matches(e, a) && PARSERS[a.preview](e)).map((e) => e.pubkey);
    // Discovered artists already have work to show; pack members join once their work is fetched.
    const pool = a.id === 'artists' ? [...found, ...packArtists] : found;
    candidates[a.id] = [...new Set(pool)].slice(0, a.id === 'artists' ? MEMBERS : PEOPLE * 3);
  }
  return { events, candidates };
}

/**
 * People who use Ditto for what it is: several of its own kinds, or one of
 * them plus a few posts made from Ditto. Ranked by how many kinds they use,
 * then how much they post.
 */
function regularsOf(events: NostrEvent[], now: number): string[] {
  const since = now - 30 * DAY;
  const kinds = new Map<string, Set<number>>();
  const posts = new Map<string, number>();
  for (const e of events) {
    if (e.created_at < since) continue;
    if (DITTO_KINDS.includes(e.kind) && (e.kind === 8211 || dittoThingOf(e))) {
      kinds.set(e.pubkey, (kinds.get(e.pubkey) ?? new Set()).add(e.kind));
    } else if ([1, 20, 1111].includes(e.kind) && e.tags.some(([n, , addr]) => n === 'client' && addr === DITTO_CLIENT)) {
      posts.set(e.pubkey, (posts.get(e.pubkey) ?? 0) + 1);
    }
  }
  return [...kinds]
    .map(([pubkey, k]) => ({ pubkey, kinds: k.size, posts: posts.get(pubkey) ?? 0 }))
    .filter((r) => r.kinds >= REGULAR_KINDS || r.posts >= REGULAR_POSTS)
    .sort((a, b) => b.kinds - a.kinds || b.posts - a.posts)
    .map((r) => r.pubkey);
}

/** How many of the Discover network's top authors a vetted section asks about. */
const VETTED_AUTHORS = 2000;

/**
 * Vetted sections ask about the Discover network's authors directly rather
 * than filtering relay-wide results: articles and episodes from the network
 * on the Ditto relay, git activity from the network on the Ditto and ngit
 * relays, then a few notes from the most active builders to preview them by.
 */
async function discoverVetted(nostr: Nostr, network: string[], signal: AbortSignal): Promise<Discovery> {
  const now = Math.floor(Date.now() / 1000);
  const authors = network.slice(0, VETTED_AUTHORS);
  const opts = { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) };
  const vetted = ARCHETYPES.filter((a) => a.vetted);

  const [published, git] = await Promise.all([
    nostr.relay(DITTO_RELAY).query(
      vetted.filter((a) => !a.fromGit).map((a) => filterFor(a, {
        authors, since: now - (a.recentDays ?? 30) * DAY, limit: 60, search: `distinct:author ${searchFor(a, false)}`,
      })),
      opts,
    ),
    vetted.some((a) => a.fromGit)
      ? nostr.group([NGIT_RELAY, DITTO_RELAY]).query([{ kinds: GIT_KINDS, authors, since: now - 60 * DAY, limit: 500 }], opts).catch(() => [])
      : Promise.resolve([]),
  ]);

  // The network is ranked by how many people in it follow each author, so
  // earlier is better known; keep that order.
  const rank = new Map(authors.map((pk, i) => [pk, i]));
  const candidates: Record<string, string[]> = {};
  for (const a of vetted) {
    if (a.fromGit) {
      // Anyone with recent repo activity, best known first. The relays cap
      // each request, so counting activity would only measure who's busiest
      // in the sample; being in it at all is the signal.
      candidates[a.id] = [...new Set(git.map((e) => e.pubkey))]
        .sort((x, y) => (rank.get(x) ?? 1e9) - (rank.get(y) ?? 1e9))
        .slice(0, MEMBERS);
    } else {
      const found = [...new Set(published.filter((e) => matches(e, a) && PARSERS[a.preview](e)).map((e) => e.pubkey))];
      candidates[a.id] = found.sort((x, y) => (rank.get(x) ?? 1e9) - (rank.get(y) ?? 1e9)).slice(0, PEOPLE * 3);
    }
  }

  const builders = vetted.filter((a) => a.fromGit && candidates[a.id]?.length);
  const notes = builders.length
    ? await nostr.relay(DITTO_RELAY).query(
      // One newest note per builder, so prolific posters can't crowd the rest out.
      builders.map((a) => ({ kinds: [1], authors: candidates[a.id], limit: MEMBERS, search: `distinct:author ${searchFor(a, false)}` })),
      opts,
    ).catch(() => [])
    : [];

  return { events: [...published, ...git, ...notes], candidates };
}

/** Second REQ: more of each candidate's own work, for fuller previews. */
async function enrich({ candidates }: Discovery, nostr: Nostr, signal: AbortSignal): Promise<NostrEvent[]> {
  return nostr.relay(DITTO_RELAY).query(
    ARCHETYPES
      .filter((a) => !a.vetted && candidates[a.id]?.length)
      .map((a) => filterFor(a, { authors: candidates[a.id], limit: 80, search: searchFor(a, false) })),
    { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
  );
}

/** Place people into sections. Pure, so it runs on discovery alone and again once enriched. */
function buildSections(events: NostrEvent[], candidates: Record<string, string[]>, network: Set<string>): WelcomeSection[] {
  // Each person lands in the first section that can preview them.
  const placed = new Set<string>();
  // Themes get copied and republished under new titles; show each background once.
  const backgrounds = new Set<string>();
  const uniqueThemes = (preview: WelcomePreview): WelcomePreview | undefined => {
    if (preview.type !== 'themes') return preview;
    const works = preview.works.filter((w) => {
      const bg = w.theme.background?.url;
      if (!bg || backgrounds.has(bg)) return false;
      backgrounds.add(bg);
      return true;
    });
    return works.length ? { type: 'themes', works } : undefined;
  };

  const sections: WelcomeSection[] = [];

  // Regulars come only from the Discover network, the same authors the
  // Discover tabs show, which also keeps out accounts nobody vouches for.
  {
    const work = byAuthor(events.filter((e) => DITTO_KINDS.includes(e.kind)));
    const people: WelcomePerson[] = [];
    for (const pubkey of candidates.regulars ?? []) {
      if (people.length >= GATHER || !network.has(pubkey)) continue;
      const preview = previewFor(work.get(pubkey) ?? [], 'ditto');
      if (!preview) continue;
      placed.add(pubkey);
      people.push({ pubkey, preview });
    }
    // Lead each card with a kind the row hasn't shown yet, so the row is a
    // sampler: a tarot pull, a Blobbi, a bird, a palette, an emoji pack…
    const shown = new Set<number>();
    for (const person of people) {
      if (person.preview.type !== 'ditto') continue;
      const works = person.preview.works;
      let i = works.findIndex((w) => showcaseable(w) && !shown.has(w.event.kind));
      if (i < 0) i = works.findIndex(showcaseable);
      if (i < 0) continue;
      shown.add(works[i].event.kind);
      person.preview = { type: 'ditto', works: [works[i], ...works.filter((_, j) => j !== i)] };
    }
    // Regulars with nothing to show (only letters, say) sit this row out.
    people.splice(0, people.length, ...people.filter((p) => p.preview.type === 'ditto' && showcaseable(p.preview.works[0])));
    if (people.length >= MIN_PEOPLE) sections.push({ id: 'regulars', label: REGULARS_LABEL, people, vetted: true });
  }

  for (const a of ARCHETYPES) {
    const work = byAuthor(events.filter((e) => matches(e, a)));
    const people: WelcomePerson[] = [];
    for (const pubkey of candidates[a.id] ?? []) {
      if (people.length >= GATHER || placed.has(pubkey)) continue;
      if (a.vetted && !network.has(pubkey)) continue;
      const found = previewFor(work.get(pubkey) ?? [], a.preview);
      const preview = found && uniqueThemes(found);
      if (!preview) continue;
      placed.add(pubkey);
      people.push({ pubkey, preview });
    }
    if (people.length >= MIN_PEOPLE) sections.push({ id: a.id, label: a.label, people, vetted: a.vetted });
  }
  return sections;
}

const DISCOVERY_KEY = ['welcome-people', 'discovery'] as const;
const STALE = 10 * 60 * 1000;

/**
 * Start fetching the people step's discovery early (say, when onboarding
 * opens), so it's ready by the time the step is reached.
 */
export function usePrefetchWelcomePeople(enabled = true) {
  const { nostr } = useNostr();
  const queryClient = useQueryClient();
  // The step only shows people from the Discover network; start building it too.
  const { authors: network, key: networkKey } = useDiscoverAuthors(enabled);
  useEffect(() => {
    if (!enabled) return;
    queryClient.prefetchQuery({ queryKey: DISCOVERY_KEY, queryFn: ({ signal }) => discover(nostr, signal), staleTime: STALE });
  }, [enabled, nostr, queryClient]);
  useEffect(() => {
    if (!enabled || !network?.length) return;
    queryClient.prefetchQuery({
      queryKey: ['welcome-people', 'vetted', networkKey],
      queryFn: ({ signal }) => discoverVetted(nostr, network, signal),
      staleTime: STALE,
    });
  }, [enabled, nostr, queryClient, network, networkKey]);
}

/**
 * People to meet during onboarding, in sections by what they make: themes,
 * nature, art, photos, food, music, pets, games, gardens, crafts, articles and
 * podcasts. Found live on the Ditto relay (hot, one per author), each person
 * previewed with their own recent work from that section. A person appears
 * once, and a section with fewer than {@link MIN_PEOPLE} people isn't shown.
 *
 * Renders from discovery alone (one REQ), then fills previews out with a
 * second REQ for more of each person's work.
 */
export function useWelcomePeople() {
  const { nostr } = useNostr();
  const { authors: network, key: networkKey } = useDiscoverAuthors();
  const networkSet = useMemo(() => (network ? new Set(network) : undefined), [network]);

  const discovery = useQuery({
    queryKey: DISCOVERY_KEY,
    queryFn: ({ signal }) => discover(nostr, signal),
    staleTime: STALE,
    gcTime: 60 * 60 * 1000,
  });

  const more = useQuery({
    queryKey: ['welcome-people', 'more', discovery.dataUpdatedAt],
    queryFn: ({ signal }) => enrich(discovery.data!, nostr, signal),
    enabled: !!discovery.data,
    staleTime: STALE,
    gcTime: 60 * 60 * 1000,
  });

  const vetted = useQuery({
    queryKey: ['welcome-people', 'vetted', networkKey],
    queryFn: ({ signal }) => discoverVetted(nostr, network!, signal),
    enabled: !!network?.length,
    staleTime: STALE,
    gcTime: 60 * 60 * 1000,
  });

  const data = useMemo(() => {
    // Wait for the network-only sections too, so nothing reshuffles when they land.
    if (!discovery.data || !networkSet || (network?.length && !vetted.data && !vetted.isError)) return undefined;
    const events = [...discovery.data.events, ...(more.data ?? []), ...(vetted.data?.events ?? [])];
    return buildSections(events, { ...discovery.data.candidates, ...vetted.data?.candidates }, networkSet);
  }, [discovery.data, more.data, vetted.data, vetted.isError, network, networkSet]);

  // Without discovery there's nothing to show; say so rather than load forever.
  return { data, isPending: !data && !discovery.isError, isError: !data && discovery.isError };
}

/** Whether an event belongs to an archetype: right kind, and one of its hashtags when it has any. */
function matches(event: NostrEvent, a: Archetype): boolean {
  if (!a.kinds.includes(event.kind)) return false;
  if (!a.tags) return true;
  return event.tags.some(([n, v]) => n === 't' && !!v && a.tags!.includes(v.toLowerCase()));
}
