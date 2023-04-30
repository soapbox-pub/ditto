interface EventTemplate<K extends number = number> {
  kind: K;
  tags: string[][];
  content: string;
  created_at: number;
}

interface UnsignedEvent<K extends number = number> extends EventTemplate<K> {
  pubkey: string;
}

interface Event<K extends number = number> extends UnsignedEvent<K> {
  id?: string;
  sig?: string;
}

interface SignedEvent<K extends number = number> extends Event<K> {
  id: string;
  sig: string;
}

export type { Event, EventTemplate, SignedEvent, UnsignedEvent };
