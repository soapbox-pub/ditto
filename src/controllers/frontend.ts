import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { html } from '@/utils/html.ts';
import { Storages } from '@/storages.ts';
import {
  getPathParams,
  getProfileInfo,
  getStatusInfo,
  OpenGraphTemplateOpts,
  PathParams,
} from '@/utils/og-metadata.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

/** Placeholder to find & replace with metadata. */
const META_PLACEHOLDER = '<!--server-generated-meta-->' as const;

/*
 * TODO: implement caching for posts (LRUCache)
 */

/**
 * Builds a series of meta tags from supplied metadata for injection into the served HTML page.
 * @param opts the metadata to use to fill the template.
 * @returns the built OpenGraph metadata.
 */
const tpl = ({ title, type, url, image, description, site }: OpenGraphTemplateOpts): string => {
  const res = [];
  res.push(html`\
  <meta content="${title}" property="og:title">
  <meta content="${type}" property="og:type">
  <meta content="${url}" property="og:url">
  <meta content="${description}" property="og:description">
  <meta content="${site}" property="og:site_name">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  `);

  if (image) {
    res.push(html`\
    <meta content="${image.url}" property="og:image">
    <meta content="${image.w}" property="og:image:width">
    <meta content="${image.h}" property="og:image:height">
    <meta name="twitter:image" content="${image.url}">
    `);
    if (image.alt) {
      res.push(html`<meta content="${image.alt}" property="og:image:alt">`);
      res.push(html`<meta content="${image.alt}" property="twitter:image:alt">`);
    }
  }

  return res.join('\n').replace(/\n+/g, '\n').replace(/^[ ]+/gm, '');
};

const store = await Storages.db();

async function buildMetaTags(params: PathParams, url: string): Promise<string> {
  // should never happen
  if (!params.acct && !params.statusId) return '';

  const meta = await getInstanceMetadata(store);
  const kind0 = await getProfileInfo(params.acct);
  const { description, image } = await getStatusInfo(params.statusId || '');
  const handle = kind0.nip05?.replace(/^_@/, '') || kind0.name || 'npub1xxx';

  if (params.acct && params.statusId) {
    return tpl({
      title: `View @${handle}'s post on Ditto`,
      type: 'article',
      image,
      description,
      url,
      site: meta.name,
    });
  } else if (params.acct) {
    return tpl({
      title: `View @${handle}'s profile on Ditto`,
      type: 'profile',
      description: kind0.about || '',
      url,
      site: meta.name,
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
      site: meta.name,
    });
  }

  return '';
}

export const frontendController: AppMiddleware = async (c, next) => {
  try {
    const content = await Deno.readTextFile(new URL('../../public/index.html', import.meta.url));
    if (content.includes(META_PLACEHOLDER)) {
      const params = getPathParams(c.req.path);

      if (params) {
        const meta = await buildMetaTags(params, Conf.local(c.req.path));
        return c.html(content.replace(META_PLACEHOLDER, meta));
      }
    }
    return c.html(content);
  } catch (e) {
    console.log(e);
    await next();
  }
};
