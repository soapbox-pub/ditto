// deno-lint-ignore-file require-await
import { NostrEvent, NostrSigner } from '@nostrify/nostrify';
import { HTTPException } from 'hono';

export class ReadOnlySigner implements NostrSigner {
  constructor(private pubkey: string) {}

  async signEvent(): Promise<NostrEvent> {
    throw new HTTPException(401, {
      message: "Can't sign events with just an npub",
    });
  }

  async getPublicKey(): Promise<string> {
    return this.pubkey;
  }
}
