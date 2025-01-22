import { type Context } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';
import { EventTemplate } from 'nostr-tools';
import * as TypeFest from 'type-fest';

import { type AppContext } from '@/app.ts';
import { Conf } from '@/config.ts';
import * as pipeline from '@/pipeline.ts';
import { RelayError } from '@/RelayError.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';
import { nostrNow } from '@/utils.ts';
import { parseFormData } from '@/utils/formdata.ts';
import { purifyEvent } from '@/utils/purify.ts';

const debug = Debug('ditto:api');

/** EventTemplate with defaults. */
type EventStub = TypeFest.SetOptional<EventTemplate, 'content' | 'created_at' | 'tags'>;

/** Publish an event through the pipeline. */
async function createEvent(t: EventStub, c: AppContext): Promise<NostrEvent> {
  const signer = c.get('signer');

  if (!signer) {
    throw new HTTPException(401, {
      res: c.json({ error: 'No way to sign Nostr event' }, 401),
    });
  }

  const event = await signer.signEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t,
  });

  return publishEvent(event, c);
}

/** Filter for fetching an existing event to update. */
interface UpdateEventFilter extends NostrFilter {
  kinds: [number];
  limit: 1;
}

/** Update a replaceable event, or throw if no event exists yet. */
async function updateEvent<E extends EventStub>(
  filter: UpdateEventFilter,
  fn: (prev: NostrEvent) => E | Promise<E>,
  c: AppContext,
): Promise<NostrEvent> {
  const store = await Storages.db();

  const [prev] = await store.query(
    [filter],
    { signal: c.req.raw.signal },
  );

  if (prev) {
    return createEvent(await fn(prev), c);
  } else {
    throw new HTTPException(422, {
      message: 'No event to update',
    });
  }
}

/** Update a replaceable list event, or throw if no event exists yet. */
function updateListEvent(
  filter: UpdateEventFilter,
  fn: (tags: string[][]) => string[][],
  c: AppContext,
): Promise<NostrEvent> {
  return updateEvent(filter, ({ content, tags }) => ({
    kind: filter.kinds[0],
    content,
    tags: fn(tags),
  }), c);
}

/** Publish an admin event through the pipeline. */
async function createAdminEvent(t: EventStub, c: AppContext): Promise<NostrEvent> {
  const signer = new AdminSigner();

  const event = await signer.signEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t,
  });

  return publishEvent(event, c);
}

/** Fetch existing event, update its tags, then publish the new admin event. */
function updateListAdminEvent(
  filter: UpdateEventFilter,
  fn: (tags: string[][]) => string[][],
  c: AppContext,
): Promise<NostrEvent> {
  return updateAdminEvent(filter, (prev) => ({
    kind: filter.kinds[0],
    content: prev?.content ?? '',
    tags: fn(prev?.tags ?? []),
  }), c);
}

/** Fetch existing event, update it, then publish the new admin event. */
async function updateAdminEvent<E extends EventStub>(
  filter: UpdateEventFilter,
  fn: (prev: NostrEvent | undefined) => E,
  c: AppContext,
): Promise<NostrEvent> {
  const store = await Storages.db();
  const [prev] = await store.query([filter], { limit: 1, signal: c.req.raw.signal });
  return createAdminEvent(fn(prev), c);
}

function updateUser(pubkey: string, n: Record<string, boolean>, c: AppContext): Promise<NostrEvent> {
  return updateNames(30382, pubkey, n, c);
}

function updateEventInfo(id: string, n: Record<string, boolean>, c: AppContext): Promise<NostrEvent> {
  return updateNames(30383, id, n, c);
}

async function updateNames(k: number, d: string, n: Record<string, boolean>, c: AppContext): Promise<NostrEvent> {
  const signer = new AdminSigner();
  const admin = await signer.getPublicKey();

  return updateAdminEvent(
    { kinds: [k], authors: [admin], '#d': [d], limit: 1 },
    (prev) => {
      const prevNames = prev?.tags.reduce((acc, [name, value]) => {
        if (name === 'n') acc[value] = true;
        return acc;
      }, {} as Record<string, boolean>);

      const names = { ...prevNames, ...n };
      const nTags = Object.entries(names).filter(([, value]) => value).map(([name]) => ['n', name]);
      const other = prev?.tags.filter(([name]) => !['d', 'n'].includes(name)) ?? [];

      return {
        kind: k,
        content: prev?.content ?? '',
        tags: [
          ['d', d],
          ...nTags,
          ...other,
        ],
      };
    },
    c,
  );
}

/** Push the event through the pipeline, rethrowing any RelayError. */
async function publishEvent(event: NostrEvent, c: AppContext): Promise<NostrEvent> {
  debug('EVENT', event);
  try {
    await pipeline.handleEvent(event, { source: 'api', signal: c.req.raw.signal });
    const client = await Storages.client();
    await client.event(purifyEvent(event));
  } catch (e) {
    if (e instanceof RelayError) {
      throw new HTTPException(422, {
        res: c.json({ error: e.message }, 422),
      });
    } else {
      throw e;
    }
  }

  return event;
}

/** Parse request body to JSON, depending on the content-type of the request. */
async function parseBody(req: Request): Promise<unknown> {
  switch (req.headers.get('content-type')?.split(';')[0]) {
    case 'multipart/form-data':
    case 'application/x-www-form-urlencoded':
      try {
        return parseFormData(await req.formData());
      } catch {
        throw new HTTPException(400, { message: 'Invalid form data' });
      }
    case 'application/json':
      return req.json();
  }
}

/** Build HTTP Link header for Mastodon API pagination. */
function buildLinkHeader(url: string, events: NostrEvent[]): string | undefined {
  if (events.length <= 1) return;
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  const { origin } = Conf.url;
  const { pathname, search } = new URL(url);
  const next = new URL(pathname + search, origin);
  const prev = new URL(pathname + search, origin);

  next.searchParams.set('until', String(lastEvent.created_at));
  prev.searchParams.set('since', String(firstEvent.created_at));

  return `<${next}>; rel="next", <${prev}>; rel="prev"`;
}

type Entity = { id: string };
type HeaderRecord = Record<string, string | string[]>;

/** Return results with pagination headers. Assumes chronological sorting of events. */
function paginated(c: AppContext, events: NostrEvent[], entities: (Entity | undefined)[], headers: HeaderRecord = {}) {
  const link = buildLinkHeader(c.req.url, events);

  if (link) {
    headers.link = link;
  }

  // Filter out undefined entities.
  const results = entities.filter((entity): entity is Entity => Boolean(entity));
  return c.json(results, 200, headers);
}

/** Build HTTP Link header for paginating Nostr lists. */
function buildListLinkHeader(url: string, params: { offset: number; limit: number }): string | undefined {
  const { origin } = Conf.url;
  const { pathname, search } = new URL(url);
  const { offset, limit } = params;
  const next = new URL(pathname + search, origin);
  const prev = new URL(pathname + search, origin);

  next.searchParams.set('offset', String(offset + limit));
  prev.searchParams.set('offset', String(Math.max(offset - limit, 0)));

  next.searchParams.set('limit', String(limit));
  prev.searchParams.set('limit', String(limit));

  return `<${next}>; rel="next", <${prev}>; rel="prev"`;
}

/** paginate a list of tags. */
function paginatedList(
  c: AppContext,
  params: { offset: number; limit: number },
  entities: unknown[],
  headers: HeaderRecord = {},
) {
  const link = buildListLinkHeader(c.req.url, params);
  const hasMore = entities.length > 0;

  if (link) {
    headers.link = hasMore ? link : link.split(', ').find((link) => link.endsWith('; rel="prev"'))!;
  }

  // Filter out undefined entities.
  const results = entities.filter(Boolean);
  return c.json(results, 200, headers);
}

/** Rewrite the URL of the request object to use the local domain. */
function localRequest(c: Context): Request {
  return Object.create(c.req.raw, {
    url: { value: Conf.local(c.req.url) },
  });
}

/** Actors with Bluesky's `!no-unauthenticated` self-label should require authorization to view. */
function assertAuthenticated(c: AppContext, author: NostrEvent): void {
  if (
    !c.get('signer') && author.tags.some(([name, value, ns]) =>
      name === 'l' &&
      value === '!no-unauthenticated' &&
      ns === 'com.atproto.label.defs#selfLabel'
    )
  ) {
    throw new HTTPException(401, { message: 'Sign-in required.' });
  }
}

export {
  assertAuthenticated,
  createAdminEvent,
  createEvent,
  type EventStub,
  localRequest,
  paginated,
  paginatedList,
  parseBody,
  updateAdminEvent,
  updateEvent,
  updateEventInfo,
  updateListAdminEvent,
  updateListEvent,
  updateUser,
};
