import { type NostrEvent } from '@/deps.ts';

/** Return a normalized event without any non-standard keys. */
function cleanEvent(event: NostrEvent): NostrEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    content: event.content,
    tags: event.tags,
    sig: event.sig,
    created_at: event.created_at,
  };
}

export { cleanEvent };
