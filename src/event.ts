interface Event<K extends number = number> {
  id?: string;
  sig?: string;
  kind: K;
  tags: string[][];
  pubkey: string;
  content: string;
  created_at: number;
}

type SignedEvent<K extends number = number> = Event<K> & { id: string; sig: string };

export type { Event, SignedEvent };
