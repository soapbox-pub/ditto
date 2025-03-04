import { User } from '@ditto/mastoapi/middleware';
import { DittoEnv } from '@ditto/mastoapi/router';
import { HTTPException } from '@hono/hono/http-exception';
import { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { EventTemplate } from 'nostr-tools';
import * as TypeFest from 'type-fest';

import { type AppContext } from '@/app.ts';
import { nostrNow } from '@/utils.ts';
import { parseFormData } from '@/utils/formdata.ts';
import { Context } from '@hono/hono';

/** EventTemplate with defaults. */
type EventStub = TypeFest.SetOptional<EventTemplate, 'content' | 'created_at' | 'tags'>;

/** Publish an event through the pipeline. */
async function createEvent<E extends (DittoEnv & { Variables: { user?: User } })>(
  t: EventStub,
  c: Context<E>,
): Promise<NostrEvent> {
  const { user, relay, signal } = c.var;

  if (!user) {
    throw new HTTPException(401, {
      res: c.json({ error: 'No way to sign Nostr event' }, 401),
    });
  }

  const event = await user.signer.signEvent({
    ...t,
    content: t.content ?? '',
    created_at: t.created_at ?? nostrNow(),
    tags: t.tags ?? [],
  });

  await relay.event(event, { signal, publish: true });
  return event;
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
  const { relay } = c.var;

  const [prev] = await relay.query(
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
  const { conf, relay, signal } = c.var;

  const event = await conf.signer.signEvent({
    content: '',
    created_at: nostrNow(),
    tags: [],
    ...t,
  });

  // @ts-ignore `publish` is important for `DittoAPIStore`.
  await relay.event(event, { signal, publish: true });
  return event;
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
  const { relay, signal } = c.var;
  const [prev] = await relay.query([filter], { signal });
  return createAdminEvent(fn(prev), c);
}

function updateUser(pubkey: string, n: Record<string, boolean>, c: Context): Promise<NostrEvent> {
  return updateNames(30382, pubkey, n, c);
}

function updateEventInfo(id: string, n: Record<string, boolean>, c: AppContext): Promise<NostrEvent> {
  return updateNames(30383, id, n, c);
}

async function updateNames(k: number, d: string, n: Record<string, boolean>, c: AppContext): Promise<NostrEvent> {
  const { conf } = c.var;
  const admin = await conf.signer.getPublicKey();

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

type HeaderRecord = Record<string, string | string[]>;

/** Actors with Bluesky's `!no-unauthenticated` self-label should require authorization to view. */
function assertAuthenticated(c: AppContext, author: NostrEvent): void {
  if (
    !c.var.user && author.tags.some(([name, value, ns]) =>
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
  parseBody,
  updateAdminEvent,
  updateEvent,
  updateEventInfo,
  updateListAdminEvent,
  updateListEvent,
  updateUser,
};
