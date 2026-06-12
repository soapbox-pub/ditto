import * as Moq from "@moq/lite";
import * as Publish from "@moq/publish";
import * as Watch from "@moq/watch";
import type {
  ConnectionState,
  NestTransport,
  RemoteParticipant,
  TransportConfig,
  Unsubscribe,
} from "./types";

/**
 * MoQ implementation of the NestTransport interface.
 *
 * Handles:
 * - Connecting to a MoQ relay via WebTransport
 * - Publishing local microphone audio via @moq/publish
 * - Discovering remote participants via MoQ announcements
 * - Subscribing to and rendering remote audio via @moq/watch
 */
export class MoQAudioTransport implements NestTransport {
  private config: TransportConfig | null = null;
  private connection: Moq.Connection.Reload | null = null;

  // Publishing
  private microphone: Publish.Source.Microphone | null = null;
  private micSourceDispose: (() => void) | null = null;
  private publishBroadcast: Publish.Broadcast | null = null;

  // Watching
  private watchBroadcasts = new Map<
    string,
    {
      broadcast: Watch.Broadcast;
      sync: Watch.Sync;
      audioSource: Watch.Audio.Source;
      decoder: Watch.Audio.Decoder;
      emitter: Watch.Audio.Emitter;
    }
  >();

  // State
  private _state: ConnectionState = "disconnected";
  private _isMicEnabled = false;
  private _isPublishing = false;
  private _declinedPublish = false;
  private _volume = 1.0;
  private _participants = new Map<string, RemoteParticipant>();

  // Listeners
  private stateListeners = new Set<(state: ConnectionState) => void>();
  private localStateListeners = new Set<() => void>();
  private participantListeners = new Set<(participants: ReadonlyMap<string, RemoteParticipant>) => void>();

  // Announcement subscription
  private announcementPollInterval: ReturnType<typeof setInterval> | null = null;
  private announcementDispose: (() => void) | null = null;
  private _lastAnnouncedStr = "";

  get state(): ConnectionState {
    return this._state;
  }

  get isMicEnabled(): boolean {
    return this._isMicEnabled;
  }

  get isPublishing(): boolean {
    return this._isPublishing;
  }

  get declinedPublish(): boolean {
    return this._declinedPublish;
  }

  resetDeclinedPublish(): void {
    this._declinedPublish = false;
  }

  get volume(): number {
    return this._volume;
  }

  get localAudioTrack(): MediaStreamTrack | undefined {
    const source = this.microphone?.source.peek();
    return source ? Publish.Audio.normalizeSource(source).track : undefined;
  }

  getRemoteAudioNode(pubkey: string): AudioNode | undefined {
    const entry = this.watchBroadcasts.get(pubkey);
    if (!entry) return undefined;
    return entry.decoder.root.peek() ?? undefined;
  }

  get participants(): ReadonlyMap<string, RemoteParticipant> {
    return this._participants;
  }

  // --- Lifecycle ---

  async connect(config: TransportConfig): Promise<void> {
    // Clean up any existing connection first (handles React StrictMode double-invoke)
    if (this.connection) {
      this.disconnect();
    }

    this.config = config;
    this.setState("connecting");

    try {
      // Build the relay URL
      const relayUrl = new URL(config.serverUrl);
      // Append the room namespace as path
      relayUrl.pathname = `/${config.roomNamespace}`;

      // Attach JWT token for moq-relay auth (relay expects ?jwt= parameter)
      if (config.token) {
        relayUrl.searchParams.set("jwt", config.token);
      }

      // Build WebTransport options (for self-signed certs in dev)
      const wtOptions: WebTransportOptions = {};
      if (config.certFingerprint) {
        // Fingerprint can be hex (from moq-relay /certificate.sha256) or base64
        const fp = config.certFingerprint;
        let fingerprintBytes: Uint8Array;
        if (/^[0-9a-f]+$/i.test(fp) && fp.length === 64) {
          // Hex-encoded SHA-256 (32 bytes = 64 hex chars)
          fingerprintBytes = new Uint8Array(32);
          for (let i = 0; i < 32; i++) {
            fingerprintBytes[i] = parseInt(fp.substring(i * 2, i * 2 + 2), 16);
          }
        } else {
          // Base64-encoded
          fingerprintBytes = Uint8Array.from(atob(fp), (c) => c.charCodeAt(0));
        }
        wtOptions.serverCertificateHashes = [
          {
            algorithm: "sha-256",
            value: fingerprintBytes.buffer as ArrayBuffer,
          },
        ];
      }

      console.log("[transport] connecting to", relayUrl.toString().split("?")[0]);

      this.connection = new Moq.Connection.Reload({
        url: relayUrl,
        enabled: true,
        delay: { initial: 1000, multiplier: 2, max: 30000 },
        webtransport: wtOptions,
        websocket: {}, // WebSocket fallback for browsers without WebTransport (Android WebView, older browsers)
      });

      // Watch connection status reactively.
      // Use .watch() instead of .subscribe() so we get the initial value too
      // (subscribe only fires on changes, watch fires immediately + on changes)
      const canPublish = config.canPublish;
      const statusDispose = this.connection.status.watch((status) => {
        console.log("[transport] connection status:", status);
        switch (status) {
          case "connected":
            this.setState("connected");
            this.startAnnouncementWatching();
            if (canPublish && !this._isPublishing && !this._declinedPublish) {
              console.log("[transport] auto-publishing: connected as speaker");
              this.publishMicrophone().catch((e) =>
                console.error("[transport] auto-publish failed:", e),
              );
            }
            break;
          case "connecting":
            this.setState(this._state === "disconnected" ? "connecting" : "reconnecting");
            break;
          case "disconnected":
            this.setState("disconnected");
            this.stopAnnouncementWatching();
            break;
        }
      });

      // Store dispose for cleanup
      this._statusDispose = statusDispose;
    } catch (err) {
      this.setState("disconnected");
      throw err;
    }
  }

  private _statusDispose: (() => void) | null = null;

  disconnect(): void {
    // Stop publishing without setting declinedPublish (that's only for voluntary leave-stage)
    this.closePublishPipeline();
    this._isPublishing = false;
    this._isMicEnabled = false;

    this.stopAnnouncementWatching();
    this.cleanupWatchBroadcasts();

    if (this._statusDispose) {
      this._statusDispose();
      this._statusDispose = null;
    }

    if (this.connection) {
      try {
        this.connection.close();
      } catch {
        this.connection.enabled.set(false);
      }
      this.connection = null;
    }

    this._participants.clear();
    this.notifyParticipantsChange();
    this.setState("disconnected");
    // NOTE: do NOT reset _declinedPublish here. It persists across reconnects
    // so that a user who left the stage stays off stage after token refresh.
    // It is only reset via resetDeclinedPublish() when re-promoted by host.
    this.config = null;
  }

  // --- Publishing ---

  async publishMicrophone(deviceId?: string): Promise<void> {
    if (!this.connection || !this.config) {
      throw new Error("Not connected");
    }

    // Release any previous publish pipeline (e.g. when switching devices)
    // before creating a new one, so the old mic/broadcast don't leak.
    this.closePublishPipeline();

    console.log("[transport] starting microphone publish...");

    // Create microphone source
    this.microphone = new Publish.Source.Microphone({
      enabled: true,
      ...(deviceId ? { device: { preferred: deviceId } } : {}),
    });

    // Log when mic source becomes available
    this.micSourceDispose = this.microphone.source.subscribe((source) => {
      if (source) {
        const track = Publish.Audio.normalizeSource(source).track;
        console.log("[transport] microphone track acquired:", track.label);
      } else {
        console.log("[transport] microphone track: none");
      }
    });

    // Create the publishing broadcast under our pubkey name
    const broadcastName = Moq.Path.from(this.config.identity);
    console.log("[transport] publishing as:", broadcastName);

    this.publishBroadcast = new Publish.Broadcast({
      connection: this.connection.established,
      enabled: true,
      name: broadcastName,
      audio: {
        source: this.microphone.source,
        enabled: true,
      },
    });

    this._isPublishing = true;
    this._isMicEnabled = true;
    this.notifyLocalStateChange();
  }

  unpublishMicrophone(): void {
    console.log("[transport] stopping publish");
    this.closePublishPipeline();

    this._isPublishing = false;
    this._isMicEnabled = false;
    this._declinedPublish = true;
    this.notifyLocalStateChange();
  }

  /** Close the mic source subscription, broadcast, and microphone (if any). */
  private closePublishPipeline(): void {
    if (this.micSourceDispose) {
      this.micSourceDispose();
      this.micSourceDispose = null;
    }
    if (this.publishBroadcast) {
      this.publishBroadcast.close();
      this.publishBroadcast = null;
    }
    if (this.microphone) {
      this.microphone.close();
      this.microphone = null;
    }
  }

  setMicEnabled(enabled: boolean): void {
    if (this.publishBroadcast) {
      this.publishBroadcast.audio.muted.set(!enabled);
      this._isMicEnabled = enabled;
      this.notifyLocalStateChange();
    }
  }

  // --- Remote Participants ---

  onStateChange(cb: (state: ConnectionState) => void): Unsubscribe {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  onLocalStateChange(cb: () => void): Unsubscribe {
    this.localStateListeners.add(cb);
    return () => this.localStateListeners.delete(cb);
  }

  onParticipantsChange(cb: (participants: ReadonlyMap<string, RemoteParticipant>) => void): Unsubscribe {
    this.participantListeners.add(cb);
    return () => this.participantListeners.delete(cb);
  }

  // --- Audio ---

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    for (const entry of this.watchBroadcasts.values()) {
      entry.emitter.volume.set(this._volume);
    }
  }

  // --- Private Methods ---

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    queueMicrotask(() => {
      for (const cb of this.stateListeners) {
        try { cb(state); } catch { /* ignore */ }
      }
    });
  }

  private notifyLocalStateChange(): void {
    queueMicrotask(() => {
      for (const cb of this.localStateListeners) {
        try { cb(); } catch { /* ignore */ }
      }
    });
  }

  private notifyParticipantsChange(): void {
    queueMicrotask(() => {
      for (const cb of this.participantListeners) {
        try { cb(this._participants); } catch { /* ignore */ }
      }
    });
  }

  /**
   * Watch MoQ announcements reactively to discover participants.
   * Uses both a reactive subscription and a poll interval as fallback.
   */
  private startAnnouncementWatching(): void {
    this.stopAnnouncementWatching();

    if (!this.connection) return;

    // Subscribe reactively to announcement changes
    this.announcementDispose = this.connection.announced.subscribe((announced) => {
      this.processAnnouncements(announced);
    });

    // Also poll as fallback (some changes might not trigger subscription)
    this.announcementPollInterval = setInterval(() => {
      if (!this.connection) return;
      const announced = this.connection.announced.peek();

      this.processAnnouncements(announced);
    }, 3000);
  }

  private stopAnnouncementWatching(): void {
    if (this.announcementDispose) {
      this.announcementDispose();
      this.announcementDispose = null;
    }
    if (this.announcementPollInterval) {
      clearInterval(this.announcementPollInterval);
      this.announcementPollInterval = null;
    }
  }

  private processAnnouncements(announced: Set<Moq.Path.Valid>): void {
    if (!this.config) return;

    // Only log when announcements change
    const announcedStr = [...announced].sort().join(",");
    if (announcedStr !== this._lastAnnouncedStr) {
      this._lastAnnouncedStr = announcedStr;
      if (announced.size > 0) {
        console.log("[transport] announcements:", [...announced]);
      }
    }

    const currentPubkeys = new Set<string>();

    for (const path of announced) {
      const pubkey = path as string;

      // Skip our own broadcast
      if (pubkey === this.config.identity) continue;

      // Validate it looks like a hex pubkey (64 chars)
      if (!/^[0-9a-f]{64}$/.test(pubkey)) {
        console.log("[transport] ignoring non-pubkey announcement:", pubkey);
        continue;
      }

      currentPubkeys.add(pubkey);

      if (!this._participants.has(pubkey)) {
        console.log("[transport] new participant discovered:", pubkey.slice(0, 8) + "...");
        this._participants.set(pubkey, {
          pubkey,
          isPublishing: true,
        });
        this.subscribeToParticipant(pubkey);
      }
    }

    // Check for participants that left
    let changed = currentPubkeys.size !== this._participants.size;
    for (const pubkey of this._participants.keys()) {
      if (!currentPubkeys.has(pubkey)) {
        console.log("[transport] participant left:", pubkey.slice(0, 8) + "...");
        this._participants.delete(pubkey);
        this.unsubscribeFromParticipant(pubkey);
        changed = true;
      }
    }

    if (changed) {
      this.notifyParticipantsChange();
    }
  }

  private subscribeToParticipant(pubkey: string): void {
    if (!this.connection) return;

    const broadcastPath = Moq.Path.from(pubkey);

    console.log("[transport] subscribing to participant:", pubkey.slice(0, 8) + "...");

    // Create a watch broadcast for this participant
    const broadcast = new Watch.Broadcast({
      connection: this.connection.established,
      enabled: true,
      name: broadcastPath,
      reload: true,
    });

    // Set up audio pipeline: source -> decoder -> emitter (speaker)
    // Use a generous fixed jitter buffer (150ms) to reduce audio underflow warnings
    const sync = new Watch.Sync({ latency: 150 as Moq.Time.Milli });
    const audioSource = new Watch.Audio.Source(sync, { broadcast });
    const decoder = new Watch.Audio.Decoder(audioSource, { enabled: true });
    const emitter = new Watch.Audio.Emitter(decoder, {
      volume: this._volume,
      muted: false,
    });

    this.watchBroadcasts.set(pubkey, { broadcast, sync, audioSource, decoder, emitter });
  }

  private unsubscribeFromParticipant(pubkey: string): void {
    const entry = this.watchBroadcasts.get(pubkey);
    if (entry) {
      console.log("[transport] unsubscribing from participant:", pubkey.slice(0, 8) + "...");
      entry.emitter.close();
      entry.decoder.close();
      entry.audioSource.close();
      entry.sync.close();
      entry.broadcast.close();
      this.watchBroadcasts.delete(pubkey);
    }
  }

  private cleanupWatchBroadcasts(): void {
    for (const [, entry] of this.watchBroadcasts) {
      entry.emitter.close();
      entry.decoder.close();
      entry.audioSource.close();
      entry.sync.close();
      entry.broadcast.close();
    }
    this.watchBroadcasts.clear();
  }
}
