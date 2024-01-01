import { type AppContext } from '@/app.ts';
import { Conf } from '@/config.ts';
import {
  type Context,
  type Event,
  EventTemplate,
  Filter,
  HTTPException,
  parseFormData,
  type TypeFest,
  z,
} from '@/deps.ts';
import * as pipeline from '@/pipeline.ts';
import { signAdminEvent, signEvent } from '@/sign.ts';
import { nostrNow } from '@/utils.ts';
import { eventsDB } from '@/db/events.ts';

/** EventTemplate with defaults. */
type EventStub<K extends number = number> = TypeFest.SetOptional<EventTemplate<K>, 'content' | 'created_at' | 'tags'>;

/** Publish an event through the pipeline. */
async function createEvent<K extends number>(t: EventStub<K>, c: AppContext): Promise<Event<K>> {
  const pubkey = c.get('pubkey');

  if (!pubkey) {
    throw new HTTPException(401);
  }

  const event = await signEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t,
  }, c);

  return publishEvent(event, c);
}

/** Filter for fetching an existing event to update. */
interface UpdateEventFilter<K extends number> extends Filter<K> {
  kinds: [K];
  limit?: 1;
}

/** Fetch existing event, update it, then publish the new event. */
async function updateEvent<K extends number, E extends EventStub<K>>(
  filter: UpdateEventFilter<K>,
  fn: (prev: Event<K> | undefined) => E,
  c: AppContext,
): Promise<Event<K>> {
  const [prev] = await eventsDB.getEvents([filter], { limit: 1 });
  return createEvent(fn(prev), c);
}

/** Fetch existing event, update its tags, then publish the new event. */
function updateListEvent<K extends number>(
  filter: UpdateEventFilter<K>,
  fn: (tags: string[][]) => string[][],
  c: AppContext,
): Promise<Event<K>> {
  return updateEvent(filter, (prev) => ({
    kind: filter.kinds[0],
    content: prev?.content,
    tags: fn(prev?.tags ?? []),
  }), c);
}
/** Publish an admin event through the pipeline. */
async function createAdminEvent<K extends number>(t: EventStub<K>, c: AppContext): Promise<Event<K>> {
  const event = await signAdminEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t,
  });

  return publishEvent(event, c);
}

/** Push the event through the pipeline, rethrowing any RelayError. */
async function publishEvent<K extends number>(event: Event<K>, c: AppContext): Promise<Event<K>> {
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
  if (events.length <= 1) return;
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  const { pathname, search } = new URL(url);
  const next = new URL(pathname + search, Conf.localDomain);
  const prev = new URL(pathname + search, Conf.localDomain);

  next.searchParams.set('until', String(lastEvent.created_at));
  prev.searchParams.set('since', String(firstEvent.created_at));

  return `<${next}>; rel="next", <${prev}>; rel="prev"`;
}

type Entity = { id: string };
type HeaderRecord = Record<string, string | string[]>;

/** Return results with pagination headers. */
function paginated(c: AppContext, events: Event[], entities: (Entity | undefined)[], headers: HeaderRecord = {}) {
  const link = buildLinkHeader(c.req.url, events);

  if (link) {
    headers.link = link;
  }

  // Filter out undefined entities.
  const results = entities.filter((entity): entity is Entity => Boolean(entity));
  return c.json(results, 200, headers);
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

/** Rewrite the URL of the request object to use the local domain. */
function localRequest(c: Context): Request {
  return Object.create(c.req.raw, {
    url: { value: Conf.local(c.req.url) },
  });
}

export {
  activityJson,
  createAdminEvent,
  createEvent,
  localRequest,
  paginated,
  type PaginationParams,
  paginationSchema,
  parseBody,
  updateEvent,
  updateListEvent,
};
