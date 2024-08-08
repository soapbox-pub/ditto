import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Stickynotes } from '@soapbox/stickynotes';
import { Storages } from '@/storages.ts';
import { getPathParams, MetadataEntities } from '@/utils/og-metadata.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { lookupPubkey } from '@/utils/lookup.ts';
import { renderMetadata } from '@/views/meta.ts';
import { getAuthor, getEvent } from '@/queries.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';

const console = new Stickynotes('ditto:frontend');

/** Placeholder to find & replace with metadata. */
const META_PLACEHOLDER = '<!--server-generated-meta-->' as const;

export const frontendController: AppMiddleware = async (c, next) => {
  try {
    const content = await Deno.readTextFile(new URL('../../public/index.html', import.meta.url));

    const ua = c.req.header('User-Agent');
    console.debug('ua', ua);

    if (!Conf.crawlerRegex.test(ua ?? '')) {
      return c.html(content);
    }

    if (content.includes(META_PLACEHOLDER)) {
      const params = getPathParams(c.req.path);
      try {
        const entities = await getEntities(params ?? {});
        const meta = renderMetadata(c.req.url, entities);
        return c.html(content.replace(META_PLACEHOLDER, meta));
      } catch (e) {
        console.log(`Error building meta tags: ${e}`);
        return c.html(content);
      }
    }
    return c.html(content);
  } catch (e) {
    console.log(e);
    await next();
  }
};

async function getEntities(params: { acct?: string; statusId?: string }): Promise<MetadataEntities> {
  const store = await Storages.db();

  const entities: MetadataEntities = {
    instance: await getInstanceMetadata(store),
  };

  if (params.statusId) {
    const event = await getEvent(params.statusId, { kind: 1 });
    if (event) {
      entities.status = await renderStatus(event, {});
      entities.account = entities.status?.account;
    }
    return entities;
  }

  if (params.acct) {
    const pubkey = await lookupPubkey(params.acct);
    const event = pubkey ? await getAuthor(pubkey) : undefined;
    if (event) {
      entities.account = await renderAccount(event);
    }
  }

  return entities;
}
