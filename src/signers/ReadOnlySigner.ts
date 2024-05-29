// deno-lint-ignore-file require-await
import { NostrEvent, NostrSigner } from '@nostrify/nostrify';
import { HTTPException } from 'hono';

export class ReadOnlySigner implements NostrSigner {
  constructor(private pubkey: string) {}

  async signEvent(): Promise<NostrEvent> {
    throw new HTTPException(401, {
      message: 'Log out and back in',
    });
  }

  async getPublicKey(): Promise<string> {
    return this.pubkey;
  }
}
