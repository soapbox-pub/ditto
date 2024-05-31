import 'deno-safe-fetch/load';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { NoOpPolicy, ReadOnlyPolicy } from '@nostrify/nostrify/policies';
import * as Comlink from 'comlink';

export class CustomPolicy implements NPolicy {
  private policy: NPolicy = new ReadOnlyPolicy();

  // deno-lint-ignore require-await
  async call(event: NostrEvent): Promise<NostrRelayOK> {
    return this.policy.call(event);
  }

  async import(path: string): Promise<void> {
    try {
      const Policy = (await import(path)).default;
      this.policy = new Policy();
    } catch (e) {
      if (e.message.includes('Module not found')) {
        this.policy = new NoOpPolicy();
      }
      throw e;
    }
  }
}

Comlink.expose(new CustomPolicy());
