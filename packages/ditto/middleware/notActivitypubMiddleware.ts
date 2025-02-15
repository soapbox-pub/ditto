import { MiddlewareHandler } from '@hono/hono';

const ACTIVITYPUB_TYPES = [
  'application/activity+json',
  'application/ld+json',
  'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
];

/** Return 4xx errors on common (unsupported) ActivityPub routes to prevent AP traffic. */
export const notActivitypubMiddleware: MiddlewareHandler = async (c, next) => {
  const accept = c.req.header('accept');
  const types = accept?.split(',')?.map((type) => type.trim()) ?? [];

  if (types.every((type) => ACTIVITYPUB_TYPES.includes(type))) {
    return c.text('ActivityPub is not supported', 406);
  }

  await next();
};
