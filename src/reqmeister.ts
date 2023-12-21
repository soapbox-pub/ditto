import * as client from '@/client.ts';
import { Event, Filter } from '@/deps.ts';

interface ReqmeisterOpts {
  delay?: number;
  timeout?: number;
}

class Reqmeister {
  #opts: ReqmeisterOpts;

  #wantedEvents = new Map<Event['id'], Set<WebSocket['url']>>();
  #wantedAuthors = new Map<Event['pubkey'], Set<WebSocket['url']>>();

  constructor(opts: ReqmeisterOpts = {}) {
    this.#opts = opts;
    this.#perform();
  }

  async #perform() {
    const { delay, timeout } = this.#opts;
    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const relaysWantedEvents = new Map<WebSocket['url'], Set<Event['id']>>();
    const relaysWantedAuthors = new Map<WebSocket['url'], Set<Event['pubkey']>>();

    const allRelays = new Set<WebSocket['url']>(
      ...relaysWantedEvents.keys(),
      ...relaysWantedAuthors.keys(),
    );

    for (const [eventId, relays] of this.#wantedEvents) {
      for (const relay of relays) {
        const relaysSet = relaysWantedEvents.get(relay);
        if (relaysSet) {
          relaysSet.add(eventId);
        } else {
          relaysWantedEvents.set(relay, new Set([eventId]));
        }
      }
    }

    for (const [author, relays] of this.#wantedAuthors) {
      for (const relay of relays) {
        const relaysSet = relaysWantedAuthors.get(relay);
        if (relaysSet) {
          relaysSet.add(author);
        } else {
          relaysWantedAuthors.set(relay, new Set([author]));
        }
      }
    }

    const promises: ReturnType<typeof client.getFilters>[] = [];

    for (const relay of allRelays) {
      const wantedEvents = relaysWantedEvents.get(relay);
      const wantedAuthors = relaysWantedAuthors.get(relay);

      const filters: Filter[] = [];

      if (wantedEvents) filters.push({ ids: [...wantedEvents] });
      if (wantedAuthors) filters.push({ authors: [...wantedAuthors] });

      console.log('reqmeister:', [relay, filters]);
      promises.push(
        client.getFilters(filters, { relays: [relay], timeout }),
      );
    }

    await Promise.all(promises);
    this.#perform();
  }

  wantEvent(eventId: Event['id'], relays: WebSocket['url'][] = []) {
    const relaysSet = this.#wantedEvents.get(eventId);
    if (relaysSet) {
      for (const relay of relays) {
        relaysSet.add(relay);
      }
    } else {
      this.#wantedEvents.set(eventId, new Set(relays));
    }
  }

  wantAuthor(author: Event['pubkey'], relays: WebSocket['url'][] = []) {
    const relaysSet = this.#wantedAuthors.get(author);
    if (relaysSet) {
      for (const relay of relays) {
        relaysSet.add(relay);
      }
    } else {
      this.#wantedAuthors.set(author, new Set(relays));
    }
  }

  encounter(event: Event): void {
    this.#wantedEvents.delete(event.id);
    if (event.kind === 0) {
      this.#wantedAuthors.delete(event.pubkey);
    }
  }

  isWanted(event: Event): boolean {
    if (this.#wantedEvents.has(event.id)) return true;
    if (event.kind === 0 && this.#wantedAuthors.has(event.pubkey)) return true;
    return false;
  }
}

export { Reqmeister };
