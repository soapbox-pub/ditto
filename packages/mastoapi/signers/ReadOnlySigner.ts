// deno-lint-ignore-file require-await
import { HTTPException } from '@hono/hono/http-exception';

import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';

export class ReadOnlySigner implements NostrSigner {
  constructor(private pubkey: string) {}

  async signEvent(): Promise<NostrEvent> {
    throw new HTTPException(401, {
      message: 'Log in with Nostr Connect to sign events',
    });
  }

  async getPublicKey(): Promise<string> {
    return this.pubkey;
  }
}
