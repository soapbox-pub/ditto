import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Stickynotes } from '@soapbox/stickynotes';
import { Storages } from '@/storages.ts';
import {
  getHandle,
  getPathParams,
  getProfileInfo,
  getStatusInfo,
  OpenGraphTemplateOpts,
  PathParams,
} from '@/utils/og-metadata.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { metadataView } from '@/views/meta.ts';

const console = new Stickynotes('ditto:frontend');

/** Placeholder to find & replace with metadata. */
const META_PLACEHOLDER = '<!--server-generated-meta-->' as const;

/*
 * TODO: implement caching for posts (LRUCache)
 */

async function buildTemplateOpts(params: PathParams, url: string): Promise<OpenGraphTemplateOpts> {
  const store = await Storages.db();
  const meta = await getInstanceMetadata(store);
  const res: OpenGraphTemplateOpts = {
    title: `View this page on ${meta.name}`,
    type: 'article',
    description: meta.about,
    url,
    site: meta.name,
    image: {
      url: Conf.local('/favicon.ico'),
      w: 48,
      h: 48,
    },
  };
  try {
    if (params.acct && !params.statusId) {
      const profile = await getProfileInfo(params.acct);
      res.type = 'profile';
      res.title = `View @${await getHandle(params.acct, profile.name)}'s profile on Ditto`;
      res.description = profile.about;
      if (profile.picture) {
        res.image = { url: profile.picture, h: 150, w: 150 };
      }
    } else if (params.statusId) {
      const { description, image, title } = await getStatusInfo(params.statusId);
      res.description = description;
      res.image = image;
      res.title = title;
    }
  } catch (e) {
    console.debug('Error getting OpenGraph metadata information:');
    console.debug(e);
    console.trace();
  }

  return res;
}

export const frontendController: AppMiddleware = async (c, next) => {
  try {
    const content = await Deno.readTextFile(new URL('../../public/index.html', import.meta.url));
    if (content.includes(META_PLACEHOLDER)) {
      const params = getPathParams(c.req.path);
      if (params) {
        try {
          const meta = metadataView(await buildTemplateOpts(params, Conf.local(c.req.path)));
          return c.html(content.replace(META_PLACEHOLDER, meta));
        } catch (e) {
          console.log(e);
          return c.html(content);
        }
      }
    }
    return c.html(content);
  } catch (e) {
    console.log(e);
    await next();
  }
};
