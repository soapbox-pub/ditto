import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Stickynotes } from '@soapbox/stickynotes';
import { Storages } from '@/storages.ts';
import {
  fetchProfile,
  getHandle,
  getPathParams,
  getStatusInfo,
  OpenGraphTemplateOpts,
  PathParams,
} from '@/utils/og-metadata.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { metadataView } from '@/views/meta.ts';

const console = new Stickynotes('ditto:frontend');

/** Placeholder to find & replace with metadata. */
const META_PLACEHOLDER = '<!--server-generated-meta-->' as const;

async function buildTemplateOpts(params: PathParams, url: string): Promise<OpenGraphTemplateOpts> {
  const store = await Storages.db();
  const meta = await getInstanceMetadata(store);

  const res: OpenGraphTemplateOpts = {
    title: meta.name,
    type: 'article',
    description: meta.about,
    url,
    site: meta.name,
    image: {
      url: Conf.local('/favicon.ico'),
    },
  };

  try {
    if (params.statusId) {
      const { description, image, title } = await getStatusInfo(params.statusId);

      res.description = description;
      res.title = title;

      if (res.image) {
        res.image = image;
      }
    } else if (params.acct) {
      const key = /^[a-f0-9]{64}$/.test(params.acct) ? 'pubkey' : 'handle';
      let handle = '';
      try {
        const profile = await fetchProfile({ [key]: params.acct });
        handle = await getHandle(params.acct, profile);

        res.description = profile.meta.about;

        if (profile.meta.picture) {
          res.image = {
            url: profile.meta.picture,
          };
        }
      } catch {
        console.debug(`couldn't find kind 0 for ${params.acct}`);
        // @ts-ignore we don't want getHandle trying to do a lookup here
        // but we do want it to give us a nice pretty npub
        handle = await getHandle(params.acct, {});
        res.description = `@${handle}'s Nostr profile`;
      }

      res.type = 'profile';
      res.title = `View @${handle}'s profile on Ditto`;
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

    const ua = c.req.header('User-Agent');
    console.debug('ua', ua);

    if (!new RegExp(Conf.crawlerRegex, 'i').test(ua ?? '')) {
      return c.html(content);
    }

    if (content.includes(META_PLACEHOLDER)) {
      const params = getPathParams(c.req.path);
      if (params) {
        try {
          const meta = metadataView(await buildTemplateOpts(params, Conf.local(c.req.path)));
          return c.html(content.replace(META_PLACEHOLDER, meta));
        } catch (e) {
          console.log(`Error building meta tags: ${e}`);
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
