import type { NostrEvent, NostrSigner } from '@nostrify/types';
import { getEventHash, verifyEvent } from 'nostr-tools/pure';
import { NostrSignerPlugin } from 'capacitor-plugin-nostr-signer';

// Modeled on noStrudel's AndroidNativeSigner, adapted to the @nostrify/types
// NostrSigner shape used by the rest of the ditto signer pipeline.
//
// The plugin speaks lowercase hex pubkeys at the boundary, matching the rest
// of the app. Each crypto call also wants a request id (echoed back so multiple
// in-flight requests can be matched up); we generate a fresh UUID per call.
export class AndroidNativeSigner implements NostrSigner {
  readonly packageName: string;

  // Cached on first getPublicKey() call so we don't re-prompt Amber every
  // time the app boots. If the login was persisted with a known pubkey it
  // can be seeded via the constructor.
  private pubkey: string | null;
  private connected = false;

  readonly nip04: NonNullable<NostrSigner['nip04']>;
  readonly nip44: NonNullable<NostrSigner['nip44']>;

  constructor(packageName: string, pubkey?: string) {
    this.packageName = packageName;
    this.pubkey = pubkey ?? null;

    this.nip04 = {
      encrypt: this.nip04Encrypt.bind(this),
      decrypt: this.nip04Decrypt.bind(this),
    };
    this.nip44 = {
      encrypt: this.nip44Encrypt.bind(this),
      decrypt: this.nip44Decrypt.bind(this),
    };
  }

  static async getSignerApps() {
    const { apps } = await NostrSignerPlugin.getInstalledSignerApps();
    return apps;
  }

  // Bind the plugin to this signer's package and learn the user's pubkey if
  // we don't already have it. Safe to call repeatedly — only the first call
  // touches the plugin.
  private async setup(): Promise<string> {
    if (this.connected && this.pubkey) return this.pubkey;

    await NostrSignerPlugin.setPackageName(this.packageName);

    if (!this.pubkey) {
      const result = await NostrSignerPlugin.getPublicKey();
      this.pubkey = result.pubkey;
    }

    this.connected = true;
    return this.pubkey;
  }

  async getPublicKey(): Promise<string> {
    return await this.setup();
  }

  async signEvent(template: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const pubkey = await this.getPublicKey();

    // The plugin requires a fully-formed event payload including a precomputed
    // id and a placeholder sig field.
    const withPubkey = { ...template, pubkey } as Omit<NostrEvent, 'id' | 'sig'>;
    const id = getEventHash(withPubkey);
    const eventJson = JSON.stringify({ ...withPubkey, id, sig: '' });

    const result = await NostrSignerPlugin.signEvent(
      this.packageName,
      eventJson,
      id,
      pubkey,
    );

    const signed = JSON.parse(result.event) as NostrEvent;
    if (!verifyEvent(signed)) {
      throw new Error('Android signer returned an invalid signature');
    }
    return signed;
  }

  private async nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    const myPubkey = await this.getPublicKey();
    const { result } = await NostrSignerPlugin.nip04Encrypt(
      this.packageName,
      plaintext,
      crypto.randomUUID(),
      pubkey,
      myPubkey,
    );
    return result;
  }

  private async nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    const myPubkey = await this.getPublicKey();
    const { result } = await NostrSignerPlugin.nip04Decrypt(
      this.packageName,
      ciphertext,
      crypto.randomUUID(),
      pubkey,
      myPubkey,
    );
    return result;
  }

  private async nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    const myPubkey = await this.getPublicKey();
    const { result } = await NostrSignerPlugin.nip44Encrypt(
      this.packageName,
      plaintext,
      crypto.randomUUID(),
      pubkey,
      myPubkey,
    );
    return result;
  }

  private async nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    const myPubkey = await this.getPublicKey();
    const { result } = await NostrSignerPlugin.nip44Decrypt(
      this.packageName,
      ciphertext,
      crypto.randomUUID(),
      pubkey,
      myPubkey,
    );
    return result;
  }
}
