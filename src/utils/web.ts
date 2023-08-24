import { Conf } from '@/config.ts';
import { type Context, type Event, EventTemplate, HTTPException, parseFormData, z } from '@/deps.ts';
import * as pipeline from '@/pipeline.ts';
import { signEvent } from '@/sign.ts';
import { nostrNow } from '@/utils.ts';

import type { AppContext } from '@/app.ts';

/** Publish an event through the API, throwing a Hono exception on failure. */
async function createEvent<K extends number>(
  t: Omit<EventTemplate<K>, 'created_at'>,
  c: AppContext,
): Promise<Event<K>> {
  const pubkey = c.get('pubkey');

  if (!pubkey) {
    throw new HTTPException(401);
  }

  const event = await signEvent({
    created_at: nostrNow(),
    ...t,
  }, c);

  try {
    await pipeline.handleEvent(event);
  } catch (e) {
    if (e instanceof pipeline.RelayError) {
      throw new HTTPException(422, {
        res: c.json({ error: e.message }, 422),
      });
    }
  }

  return event;
}

/** Parse request body to JSON, depending on the content-type of the request. */
async function parseBody(req: Request): Promise<unknown> {
  switch (req.headers.get('content-type')?.split(';')[0]) {
    case 'multipart/form-data':
    case 'application/x-www-form-urlencoded':
      return parseFormData(await req.formData());
    case 'application/json':
      return req.json();
  }
}

/** Schema to parse pagination query params. */
const paginationSchema = z.object({
  since: z.coerce.number().optional().catch(undefined),
  until: z.lazy(() => z.coerce.number().catch(nostrNow())),
  limit: z.coerce.number().catch(20).transform((value) => Math.min(Math.max(value, 0), 40)),
});

/** Mastodon API pagination query params. */
type PaginationParams = z.infer<typeof paginationSchema>;

/** Build HTTP Link header for Mastodon API pagination. */
function buildLinkHeader(url: string, events: Event[]): string | undefined {
  if (!events.length) return;
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  const { pathname, search } = new URL(url);
  const next = new URL(pathname + search, Conf.localDomain);
  const prev = new URL(pathname + search, Conf.localDomain);

  next.searchParams.set('until', String(lastEvent.created_at));
  prev.searchParams.set('since', String(firstEvent.created_at));

  return `<${next}>; rel="next", <${prev}>; rel="prev"`;
}

/** JSON-LD context. */
type LDContext = (string | Record<string, string | Record<string, string>>)[];

/** Add a basic JSON-LD context to ActivityStreams object, if it doesn't already exist. */
function maybeAddContext<T>(object: T): T & { '@context': LDContext } {
  return {
    '@context': ['https://www.w3.org/ns/activitystreams'],
    ...object,
  };
}

/** Like hono's `c.json()` except returns JSON-LD. */
function activityJson<T, P extends string>(c: Context<any, P>, object: T) {
  const response = c.json(maybeAddContext(object));
  response.headers.set('content-type', 'application/activity+json; charset=UTF-8');
  return response;
}

export { activityJson, buildLinkHeader, createEvent, type PaginationParams, paginationSchema, parseBody };