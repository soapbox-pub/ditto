import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
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

/** Placeholder to find & replace with metadata. */
const META_PLACEHOLDER = '<!--server-generated-meta-->' as const;

/*
 * TODO: implement caching for posts (LRUCache)
 */

const store = await Storages.db();

async function buildTemplateOpts(params: PathParams, url: string): Promise<OpenGraphTemplateOpts> {
  const meta = await getInstanceMetadata(store);
  const res: OpenGraphTemplateOpts = {
    title: `View this page on ${meta.name}`,
    type: 'article',
    description: meta.about,
    url,
    site: meta.name,
  };

  if (params.acct && !params.statusId) {
    const profile = await getProfileInfo(params.acct);
    res.type = 'profile';
    res.title = `View @${await getHandle(params.acct)}'s profile on Ditto`;
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

  return res;
}

export const frontendController: AppMiddleware = async (c, next) => {
  try {
    const content = await Deno.readTextFile(new URL('../../public/index.html', import.meta.url));
    if (content.includes(META_PLACEHOLDER)) {
      const params = getPathParams(c.req.path);

      if (params) {
        const meta = metadataView(await buildTemplateOpts(params, Conf.local(c.req.path)));
        return c.html(content.replace(META_PLACEHOLDER, meta));
      }
    }
    return c.html(content);
  } catch (e) {
    console.log(e);
    await next();
  }
};
