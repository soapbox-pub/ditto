import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { html, r } from '@/utils/html.ts';
import {
  getInstanceName,
  getPathParams,
  getProfileInfo,
  getStatusInfo,
  OpenGraphTemplateOpts,
  PathParams,
} from '@/utils/og-metadata.ts';

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
const tpl = async ({ title, type, url, image, description }: OpenGraphTemplateOpts): Promise<string> =>
  html`\
<meta content="${title}" property="og:title">
<meta content="${type}" property="og:type">
<meta content="${url}" property="og:url">
<meta content="${description}" property="og:description">
<meta content="${await getInstanceName()}" property="og:site_name">

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

const buildMetaTags = async (params: PathParams, url: string): Promise<string> => {
  if (!params.acct && !params.statusId) return await BLANK_META(url);

  const kind0 = await getProfileInfo(params.acct);
  console.log(params.acct);
  const { description, image } = await getStatusInfo(params.statusId || '');
  const handle = kind0.nip05?.replace(/^_@/, '') || kind0.name || 'npub1xxx';
  console.log({ n: kind0.nip05, handle });

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
