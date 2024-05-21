import 'deno-safe-fetch/load';
import { NostrEvent, NostrRelayOK, NPolicy } from '@nostrify/nostrify';
import { ReadOnlyPolicy } from '@nostrify/nostrify/policies';
import * as Comlink from 'comlink';

export class CustomPolicy implements NPolicy {
  private policy: NPolicy = new ReadOnlyPolicy();

  // deno-lint-ignore require-await
  async call(event: NostrEvent): Promise<NostrRelayOK> {
    return this.policy.call(event);
  }

  async import(path: string): Promise<void> {
    const Policy = (await import(path)).default;
    this.policy = new Policy();
  }
}

Comlink.expose(new CustomPolicy());
