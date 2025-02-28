import { logi } from '@soapbox/logi';

import { AppContext, AppMiddleware } from '@/app.ts';
import { getPathParams, MetadataEntities } from '@/utils/og-metadata.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';
import { errorJson } from '@/utils/log.ts';
import { lookupPubkey } from '@/utils/lookup.ts';
import { renderMetadata } from '@/views/meta.ts';
import { getAuthor, getEvent } from '@/queries.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';

/** Placeholder to find & replace with metadata. */
const META_PLACEHOLDER = '<!--server-generated-meta-->' as const;

export const frontendController: AppMiddleware = async (c) => {
  const { requestId } = c.var;

  c.header('Cache-Control', 'max-age=86400, s-maxage=30, public, stale-if-error=604800');

  try {
    const content = await Deno.readTextFile(new URL('../../../public/index.html', import.meta.url));

    if (content.includes(META_PLACEHOLDER)) {
      const params = getPathParams(c.req.path);
      try {
        const entities = await getEntities(c, params ?? {});
        const meta = renderMetadata(c.req.url, entities);
        return c.html(content.replace(META_PLACEHOLDER, meta));
      } catch (e) {
        logi({ level: 'error', ns: 'ditto.frontend', msg: 'Error building meta tags', requestId, error: errorJson(e) });
        return c.html(content);
      }
    }
    return c.html(content);
  } catch {
    return c.notFound();
  }
};

async function getEntities(c: AppContext, params: { acct?: string; statusId?: string }): Promise<MetadataEntities> {
  const { relay } = c.var;

  const entities: MetadataEntities = {
    instance: await getInstanceMetadata(c.var),
  };

  if (params.statusId) {
    const event = await getEvent(params.statusId, c.var);
    if (event) {
      entities.status = await renderStatus(relay, event, {});
      entities.account = entities.status?.account;
    }
    return entities;
  }

  if (params.acct) {
    const pubkey = await lookupPubkey(params.acct.replace(/^@/, ''), c.var);
    const event = pubkey ? await getAuthor(pubkey, c.var) : undefined;
    if (event) {
      entities.account = renderAccount(event);
    }
  }

  return entities;
}
