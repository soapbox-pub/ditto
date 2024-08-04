import { Context, Env, MiddlewareHandler, Next } from '@hono/hono';
import { serveStatic as baseServeStatic, ServeStaticOptions } from '@hono/hono/serve-static';
import { match } from 'path-to-regexp';
import { html, r } from 'campfire.js';
import { nip05Cache } from '@/utils/nip05.ts';
import { getAuthor, getEvent } from '@/queries.ts';
import { nip19 } from 'nostr-tools';
import { NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { Storages } from '@/storages.ts';
import { Conf } from '@/config.ts';

/*
 * TODO: implement caching for posts (LRUCache)
 */

interface OpenGraphTemplateOpts {
  title: string;
  type: 'article' | 'profile' | 'website';
  url: string;
  image?: StatusInfo['image'];
  description: string;
}

type PathParams = Partial<Record<'statusId' | 'acct' | 'note' | 'nevent' | 'nprofile' | 'npub', string>>;

interface StatusInfo {
  description: string;
  image?: {
    url: string;
    w: number;
    h: number;
    alt?: string;
  };
}

const store = await Storages.db();

const instanceName = async () => {
  const meta = await getInstanceMetadata(store, AbortSignal.timeout(1000));
  return meta?.name || 'Ditto';
};

const tpl = async ({ title, type, url, image, description }: OpenGraphTemplateOpts): Promise<string> =>
  html`\
<meta content="${title}" property="og:title">
<meta content="${type}" property="og:type">
<meta content="${url}" property="og:url">
<meta content="${description}" property="og:description">
<meta content="${await instanceName()}" property="og:site_name">

${
    image
      ? r(html`
<meta content="${image.url}" property="og:image">
<meta content="${image.w}" property="og:image:width">
<meta content="${image.h}" property="og:image:height">
${image.alt ? r(html`<meta content="${image.alt}" property="og:image:alt">`) : ''}
`)
      : ''
  }

<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
${
    image
      ? r(html`
<meta name="twitter:image" content="${image.url}">
${image.alt ? r(html`<meta content="${image.alt}" property="twitter:image:alt">`) : ''}
`)
      : ''
  }
`.replace(/\n+/g, '\n');

const BLANK_META = (url: string) =>
  tpl({
    title: 'Ditto',
    type: 'website',
    url,
    description: 'Ditto, a decentralized, self-hosted social media server',
  });

/** Placeholder to find & replace with metadata. */
const OG_META_PLACEHOLDER = '<!--server-generated-meta-->' as const;

/** URL routes to serve metadata on. */
const SSR_ROUTES = [
  '/@:acct/posts/:statusId',
  '/@:acct/:statusId',
  '/@:acct',
  '/users/:acct/statuses/:statusId',
  '/users/:acct',
  '/statuses/:statusId',
  '/notice/:statusId',
  '/posts/:statusId',
  '/note:note',
  '/nevent:nevent',
  '/nprofile:nprofile',
  '/npub:npub',
] as const;

const SSR_ROUTE_MATCHERS = SSR_ROUTES.map((route) => match(route, { decode: decodeURIComponent }));

const getPathParams = (path: string) => {
  for (const matcher of SSR_ROUTE_MATCHERS) {
    const result = matcher(path);
    if (!result) continue;
    const params = result.params as PathParams;
    if (params.nevent) {
      const decoded = nip19.decode(`nevent${params.nevent}`).data as nip19.EventPointer;
      params.statusId = decoded.id;
    } else if (params.note) {
      params.statusId = nip19.decode(`note${params.note}`).data as string;
    }

    if (params.nprofile) {
      const decoded = nip19.decode(`nprofile${params.nprofile}`).data as nip19.ProfilePointer;
      params.acct = decoded.pubkey;
    } else if (params.npub) {
      params.acct = nip19.decode(`npub${params.npub}`).data as string;
    }
    console.log(params);
    return params;
  }
};

const normalizeHandle = async (handle: string) => {
  const id = `${handle}`;
  const parts = id.match(/(?:(.+))?@(.+)/);
  if (parts) {
    const key = `${parts[1] || ''}@${parts[2]}`;
    return await nip05Cache.fetch(key, { signal: AbortSignal.timeout(1000) }).then((res) => res.pubkey);
  } else if (id.startsWith('npub1')) {
    return nip19.decode(id as `npub1${string}`).data;
  } else if (/(?:[0-9]|[a-f]){64}/.test(id)) {
    return id;
  }

  // shouldn't ever happen for a well-formed link
  return '';
};

const getKind0 = async (handle: string | undefined): Promise<NostrMetadata> => {
  const id = await normalizeHandle(handle || '');
  const kind0 = await getAuthor(id);

  const short = nip19.npubEncode(id).substring(0, 8);
  const blank = { name: short, about: `@${short}'s ditto profile` };
  if (!kind0) return blank;

  return Object.assign(
    blank,
    n.json().pipe(n.metadata()).parse(kind0.content),
  );
};

const truncate = (s: string, len: number, ellipsis = '...') => {
  if (s.length <= len) return s;
  return s.slice(0, len) + ellipsis;
};

const getStatus = async (id: string | undefined, handle?: string): Promise<StatusInfo> => {
  const event = await getEvent(id || '');
  if (!event || !id) {
    return { description: `A post on Ditto by @${handle}` };
  }

  const res: StatusInfo = {
    description: event.content
      .replace(/nostr:(npub1(?:[0-9]|[a-z]){58})/g, (_, key: string) => `@${key.slice(0, 8)}`),
  };

  let url: string;
  let w: number;
  let h: number;

  for (const [tag, ...values] of event.tags) {
    if (tag !== 'imeta') continue;
    for (const value of values) {
      const [item, datum] = value.split(' ');
      if (!['dim', 'url'].includes(item)) continue;
      if (item === 'dim') {
        [w, h] = datum.split('x').map(Number);
      } else if (item === 'url') {
        url = datum;
      }
    }
  }

  // @ts-ignore conditional assign
  if (url && w && h) {
    res.image = { url, w, h };
    res.description = res.description.replace(url.trim(), '');
  }

  // needs to be done last incase the image url was surrounded by newlines
  res.description = truncate(res.description.trim(), 140);
  return res;
};

const buildMetaTags = async (params: PathParams, url: string): Promise<string> => {
  if (!params.acct && !params.statusId) return await BLANK_META(url);

  const kind0 = await getKind0(params.acct);
  const { description, image } = await getStatus(params.statusId || '');
  const handle = kind0.nip05 || kind0.name || 'npub1xxx';

  if (params.acct && params.statusId) {
    return tpl({
      title: `View @${handle}'s post on Ditto`,
      type: 'article',
      image,
      description,
      url,
    });
  } else if (params.acct) {
    return tpl({
      title: `View @${handle}'s profile on Ditto`,
      type: 'profile',
      description: kind0.about || '',
      url,
      image: kind0.picture
        ? {
          url: kind0.picture,
          // Time will tell if this is fine.
          h: 150,
          w: 150,
        }
        : undefined,
    });
  } else if (params.statusId) {
    return tpl({
      title: `View post on Ditto`,
      type: 'profile',
      description,
      image,
      url,
    });
  }

  return await BLANK_META(url);
};

export const serveStaticWithOG = <E extends Env>(
  options: ServeStaticOptions<E>,
): MiddlewareHandler => {
  // deno-lint-ignore require-await
  return async function serveStatic(c: Context, next: Next) {
    let file = '';
    const getContent = async (path: string) => {
      try {
        if (!file) file = await Deno.readTextFile(path);
        if (!file) throw new Error(`File at ${path} was empty!`);
        if (file.includes(OG_META_PLACEHOLDER)) {
          const params = getPathParams(c.req.path);
          if (params) {
            const meta = await buildMetaTags(params, Conf.local(c.req.path));
            return file.replace(OG_META_PLACEHOLDER, meta);
          }
        }
        return file;
      } catch (e) {
        console.warn(`${e}`);
      }

      return '';
    };
    const pathResolve = (path: string) => {
      return `./${path}`;
    };
    return baseServeStatic({
      ...options,
      getContent,
      pathResolve,
    })(c, next);
  };
};
