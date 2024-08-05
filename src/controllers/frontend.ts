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
      const key = /^[a-f0-9]{64}$/.test(params.acct) ? 'pubkey' : 'handle';
      console.log(key);
      let handle = '';
      try {
        const profile = await fetchProfile({ [key]: params.acct });
        handle = await getHandle(params.acct, profile);
        res.description = profile.meta.about || `@${handle}'s Nostr profile`;
        if (profile.meta.picture) {
          res.image = { url: profile.meta.picture, h: 150, w: 150 };
        }
      } catch (e) {
        console.debug(e);
        // @ts-ignore we don't want getHandle trying to do a lookup here
        // but we do want it to give us a nice pretty npub
        handle = await getHandle(params.acct, {});
        res.description = `@${handle}'s Nostr profile`;
      }

      Object.assign(res, {
        type: 'profile',
        title: `View @${handle}'s profile on Ditto`,
      });
    } else if (params.statusId) {
      const { description, image, title } = await getStatusInfo(params.statusId);
      Object.assign(res, { description, title });
      if (image) Object.assign(res, { image });
    }
  } catch (e) {
    console.debug('Error getting OpenGraph metadata information:');
    console.debug(e);
    console.trace();
  }

  return res;
}

const SHOULD_INJECT_RE = new RegExp(Conf.opengraphRouteRegex, 'i');

export const frontendController: AppMiddleware = async (c, next) => {
  try {
    const content = await Deno.readTextFile(new URL('../../public/index.html', import.meta.url));
    const ua = c.req.header('User-Agent');
    console.debug('got ua', ua);
    if (!SHOULD_INJECT_RE.test(ua || '')) {
      return c.html(content);
    }
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
