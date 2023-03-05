import { getPublicKey } from '@/deps.ts';

import { LOCAL_DOMAIN } from '../config.ts';
import { fetchUser } from '../client.ts';
import { MetaContent, metaContentSchema } from '../schema.ts';

import type { Context } from '@/deps.ts';

async function credentialsController(c: Context) {
  const authHeader = c.req.headers.get('Authorization') || '';

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    const pubkey = getPublicKey(token);
    const event = await fetchUser(pubkey);
    const parsed = metaContentSchema.safeParse(JSON.parse(event?.content || ''));
    const content: MetaContent = parsed.success ? parsed.data : {};
    const { host, origin } = new URL(LOCAL_DOMAIN);

    return c.json({
      id: pubkey,
      acct: pubkey,
      avatar: content.picture,
      avatar_static: content.picture,
      bot: false,
      created_at: event ? new Date(event.created_at * 1000).toISOString() : new Date().toISOString(),
      display_name: content.name,
      emojis: [],
      fields: [],
      follow_requests_count: 0,
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      header: content.banner,
      header_static: content.banner,
      locked: false,
      note: content.about,
      fqn: `${pubkey}@${host}`,
      url: `${origin}/users/${pubkey}`,
      username: pubkey,
    });
  }

  return c.json({ error: 'Invalid token' }, 400);
}

export { credentialsController };
