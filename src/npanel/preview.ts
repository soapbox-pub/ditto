/**
 * Ditto's link previews, for npanel to show crawlers.
 *
 * npanel runs this for a crawler asking for one of the pages `routes` names —
 * `/npub1…`, `/nevent1…`, `/naddr1…` or `/name@domain` — in a QuickJS sandbox
 * with an `OffscreenCanvas` that draws text in the gateway's fonts. It's built
 * into `dist/.well-known/npanel/preview.js` by `vite.config.ts`. What it
 * returns is all a crawler gets: `null` leaves the page as published.
 *
 * Every kind Ditto renders has a preview (`kinds.ts`), with the event's own
 * title, description and image, and the event as an article a search engine
 * can read. Profiles with a theme or an avatar shape, themes and color
 * moments get images drawn the way ditto-server drew them (`draw.ts`). A
 * bird detection is titled for who heard what, with the bird's picture from
 * Wikipedia (`species.ts`).
 */

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { NRelay } from '@nostrify/types';
import * as nip19 from 'nostr-tools/nip19';

import { getAvatarShape } from '@/lib/avatarShape';
import { getColors } from '@/lib/colorMomentUtils';
import { ACTIVE_THEME_KIND, parseActiveProfileTheme, parseThemeDefinition, THEME_DEFINITION_KIND } from '@/lib/themeEvent';

import { displayName, eventPreview, type Page, type Preview, profilePreview, readProfile } from './card';
import { DEFAULT_COLORS, drawPalette, drawProfile, drawTheme, type Layout, LAYOUTS } from './draw';
import { birdNames, isHex64, read, SUPPORTED, tag } from './kinds';
import { heard, species, wikidataId } from './species';

interface Context {
  nostr: NRelay;
  signal: AbortSignal;
}

const COLOR_MOMENT_KIND = 3367;
const BIRD_DETECTION_KIND = 2473;

export default {
  /**
   * The pages previewed, as URLPattern pathnames: one segment that is a NIP-19
   * entity or a NIP-05 name, with or without an `@` in front, as `preview`
   * reads it. Everything else is never run for, and keeps one page for
   * everyone.
   */
  routes: [
    String.raw`/:id((?:@|%40)?n(?:pub|profile|ote|event|addr)1[02-9ac-hj-np-z]+){/}?`,
    String.raw`/:name((?:@|%40)?[\w.+-]+(?:@|%40)[\w-]+(?:\.[\w-]+)+){/}?`,
  ],

  async preview(request: Request, { nostr, signal }: Context): Promise<Preview | null> {
    const url = new URL(request.url);
    const page: Page = { url: url.href, origin: url.origin, appName: appName() };
    const segment = decodeURIComponent(url.pathname.slice(1)).replace(/^@/, '').replace(/\/$/, '');
    const first = async (filter: NostrFilter) => (await nostr.query([{ ...filter, limit: 1 }], { signal }))[0];

    const found = await subject(segment, first);
    if (!found) return null;
    const { event } = found;

    if (event.kind === 0) {
      const theme = await first({ kinds: [ACTIVE_THEME_KIND], authors: [event.pubkey] });
      return profile(event, theme, page);
    }

    const parts = read(event);
    if (!parts) return null;
    // The profile of whoever it's attributed to: the one fetched beside it
    // when that's theirs, or theirs fetched now — a repost's is its original
    // author's, a zap's its sender's. A bird detection's species is looked
    // up beside it.
    const wikidata = event.kind === BIRD_DETECTION_KIND ? wikidataId(event) : undefined;
    const [author, sighted] = await Promise.all([
      found.profile?.pubkey === parts.author ? found.profile : first({ kinds: [0], authors: [parts.author] }),
      wikidata ? species(wikidata, signal) : undefined,
    ]);
    const attributed = readProfile(author, parts.author);
    if (event.kind === BIRD_DETECTION_KIND) {
      // Who heard what, with the bird's picture.
      const names = birdNames(event);
      const name = sighted?.name ?? names.common ?? names.scientific;
      if (name) parts.title = heard(displayName(attributed), name);
      parts.image = sighted?.image ?? parts.image;
      parts.summary = sighted?.extract ?? parts.summary;
    }
    const preview = eventPreview(event.kind, parts, attributed, page);

    switch (event.kind) {
      case ACTIVE_THEME_KIND:
      case THEME_DEFINITION_KIND: {
        const theme = event.kind === THEME_DEFINITION_KIND ? parseThemeDefinition(event) : parseActiveProfileTheme(event);
        return { ...preview, image: drawTheme(theme?.colors ?? DEFAULT_COLORS, theme?.background?.url), twitter: 'summary_large_image' };
      }
      case COLOR_MOMENT_KIND: {
        const colors = getColors(event.tags);
        if (!colors.length) return preview;
        const layout = tag(event, 'layout');
        const content = event.content.trim();
        // One or two characters of content are an emoji drawn on top.
        const emoji = [...content].length <= 2 && /\p{Extended_Pictographic}/u.test(content) ? content : undefined;
        const image = drawPalette(colors, LAYOUTS.includes(layout as Layout) ? layout as Layout : 'horizontal', emoji);
        return { ...preview, image, twitter: 'summary_large_image' };
      }
      default:
        return preview;
    }
  },
};

/** A profile's preview: its avatar, unless it has a theme or a shape, which are drawn. */
function profile(event: NostrEvent, theme: NostrEvent | undefined, page: Page): Preview {
  const profile = readProfile(event, event.pubkey);
  const preview = profilePreview(profile, page);
  const shape = getAvatarShape(profile.fields);
  if (!theme && !shape) return preview;
  const active = theme ? parseActiveProfileTheme(theme) : null;
  return {
    ...preview,
    image: drawProfile(active?.colors ?? DEFAULT_COLORS, active?.background?.url, profile.picture, shape),
    twitter: 'summary_large_image',
  };
}

/** The event a page's path names, if it's of a kind previewed here, and its author's profile, where that came along. */
async function subject(
  segment: string,
  first: (filter: NostrFilter) => Promise<NostrEvent | undefined>,
): Promise<{ event: NostrEvent; profile?: NostrEvent } | undefined> {
  const profileOf = async (pubkey: string) => mapEvent(await first({ kinds: [0], authors: [pubkey] }));

  if (segment.includes('@')) {
    const pubkey = await nip05(segment);
    return pubkey ? profileOf(pubkey) : undefined;
  }

  let decoded: nip19.DecodedResult;
  try {
    decoded = nip19.decode(segment);
  } catch {
    return undefined;
  }
  switch (decoded.type) {
    case 'npub':
      return profileOf(decoded.data);
    case 'nprofile':
      return profileOf(decoded.data.pubkey);
    case 'note':
      return mapEvent(await first({ ids: [decoded.data] }));
    case 'nevent': {
      const { id, author, kind } = decoded.data;
      // An nevent that says it's of a kind with no preview isn't worth a query.
      if (kind !== undefined && !SUPPORTED.includes(kind)) return undefined;
      if (!author || !isHex64(author)) return mapEvent(await first({ ids: [id] }));
      const [event, profile] = await Promise.all([first({ ids: [id] }), first({ kinds: [0], authors: [author] })]);
      // Asking again by its author looks on the relays they write to.
      const found = event ?? await first({ ids: [id], authors: [author] });
      return found && { event: found, profile };
    }
    case 'naddr': {
      const { kind, pubkey, identifier } = decoded.data;
      if (!SUPPORTED.includes(kind)) return undefined;
      const address: NostrFilter = kind >= 30000 && kind < 40000 ? { kinds: [kind], authors: [pubkey], '#d': [identifier] } : { kinds: [kind], authors: [pubkey] };
      const [event, profile] = await Promise.all([first(address), kind === 0 ? undefined : first({ kinds: [0], authors: [pubkey] })]);
      return event && { event, profile };
    }
    default:
      return undefined;
  }
}

function mapEvent(event: NostrEvent | undefined): { event: NostrEvent } | undefined {
  return event && { event };
}

/** The pubkey a NIP-05 name stands for. */
async function nip05(address: string): Promise<string | undefined> {
  const at = address.lastIndexOf('@');
  const name = address.slice(0, at).toLowerCase() || '_';
  const domain = address.slice(at + 1).toLowerCase();
  try {
    const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`);
    if (!response.ok) return undefined;
    const document = await response.json() as { names?: Record<string, unknown> };
    const pubkey = document.names?.[name];
    return typeof pubkey === 'string' && isHex64(pubkey.toLowerCase()) ? pubkey.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/** What the app serving the page is called, as its build was configured. */
function appName(): string {
  try {
    const config = JSON.parse(import.meta.env.DITTO_CONFIG) as { appName?: unknown } | null;
    return typeof config?.appName === 'string' && config.appName ? config.appName : 'Ditto';
  } catch {
    return 'Ditto';
  }
}
