import type { NostrEvent, NostrSigner } from '@nostrify/types';
import { getEventHash, verifyEvent } from 'nostr-tools/pure';
import { decode, npubEncode } from 'nostr-tools/nip19';
import { NostrSignerPlugin, type Permission } from 'nostr-signer-capacitor-plugin';

// Modeled on noStrudel's AndroidNativeSigner, adapted to the @nostrify/types
// NostrSigner shape used by the rest of the ditto signer pipeline.
//
// The plugin speaks npub at the boundary while the rest of the app uses hex
// pubkeys, so this class encodes/decodes at every plugin call. Each crypto
// call also wants a request id (echoed back so multiple in-flight requests
// can be matched up); we generate a fresh UUID per call.
export class AndroidNativeSigner implements NostrSigner {
  readonly packageName: string;

  // Cached on first getPublicKey() call so we don't re-prompt Amber every
  // time the app boots. If the login was persisted with a known pubkey it
  // can be seeded via the constructor.
  private pubkey: string | null;
  private connected = false;

  // Permissions requested at connect time. We start with the minimum set;
  // Amber surfaces the same prompt for unrecognized methods on first use.
  private permissions: Permission[] = [];

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
      const result = await NostrSignerPlugin.getPublicKey(this.packageName, this.permissions);
      const decoded = decode(result.npub);
      if (decoded.type !== 'npub') {
        throw new Error(`Signer returned unexpected key type: ${decoded.type}`);
      }
      this.pubkey = decoded.data;
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
    // id and a (placeholder) sig field. We compute the id locally, send the
    // event, then drop in the returned signature.
    const withPubkey = { ...template, pubkey } as Omit<NostrEvent, 'id' | 'sig'>;
    const id = getEventHash(withPubkey);
    const eventJson = JSON.stringify({ ...withPubkey, id, sig: '' });

    const result = await NostrSignerPlugin.signEvent(
      this.packageName,
      eventJson,
      id,
      npubEncode(pubkey),
    );

    const signed: NostrEvent = { ...withPubkey, id: result.id, sig: result.signature };
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
      npubEncode(myPubkey),
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
      npubEncode(myPubkey),
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
      npubEncode(myPubkey),
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
      npubEncode(myPubkey),
    );
    return result;
  }
}
