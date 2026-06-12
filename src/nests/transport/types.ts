/**
 * Transport abstraction layer for Nests audio rooms.
 *
 * Provides a clean interface between the UI and the underlying
 * media transport (MoQ). Prevents tight coupling so the transport
 * can be swapped in the future without touching UI components.
 */

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

/**
 * Configuration for connecting to a room's audio transport.
 */
export interface TransportConfig {
  /** MoQ relay URL from the room event's streaming tag */
  serverUrl: string;
  /** Auth service URL (moq-auth endpoint) */
  authUrl: string;
  /** Room namespace (e.g., "nests/30312:pubkey:roomid") */
  roomNamespace: string;
  /** User's Nostr pubkey (hex) */
  identity: string;
  /** Whether the user can publish audio (speaker/admin/host) */
  canPublish: boolean;
  /** JWT token from moq-auth for authenticating with the relay */
  token?: string;
  /** TLS certificate fingerprint (SHA-256, base64) for self-signed certs in dev */
  certFingerprint?: string;
}

/**
 * State of a remote participant discovered via MoQ announcements.
 */
export interface RemoteParticipant {
  /** Nostr pubkey (hex) of the participant */
  pubkey: string;
  /** Whether this participant is currently publishing audio */
  isPublishing: boolean;
}

/**
 * Callback unsubscribe function.
 */
export type Unsubscribe = () => void;

/**
 * The core transport interface.
 *
 * All UI components interact with the transport through this interface.
 * The implementation handles MoQ connection, audio encoding/decoding,
 * and participant discovery.
 */
export interface NestTransport {
  // --- Lifecycle ---

  /** Connect to the MoQ relay and join the room. */
  connect(config: TransportConfig): Promise<void>;

  /** Disconnect from the room and clean up all resources. */
  disconnect(): void;

  /** Current connection state. */
  readonly state: ConnectionState;

  /** Subscribe to connection state changes. */
  onStateChange(cb: (state: ConnectionState) => void): Unsubscribe;

  // --- Publishing (microphone) ---

  /** Start publishing microphone audio. Prompts for mic permission if needed. */
  publishMicrophone(deviceId?: string): Promise<void>;

  /** Stop publishing microphone audio. */
  unpublishMicrophone(): void;

  /** Mute or unmute the local microphone (keeps the track active but silent). */
  setMicEnabled(enabled: boolean): void;

  /** Whether the local microphone is currently unmuted. */
  readonly isMicEnabled: boolean;

  /** Whether we are currently publishing audio. */
  readonly isPublishing: boolean;

  /** Whether the user voluntarily left the stage (prevents auto-re-publish). */
  readonly declinedPublish: boolean;

  /** Reset the declined-publish flag (e.g., when re-promoted by host). */
  resetDeclinedPublish(): void;

  /** The local microphone MediaStreamTrack (for VU meters / speaking indicators). */
  readonly localAudioTrack: MediaStreamTrack | undefined;

  /** Get the AudioNode for a remote participant's decoded audio (for speaking detection). */
  getRemoteAudioNode(pubkey: string): AudioNode | undefined;

  /** Subscribe to local mic state changes. */
  onLocalStateChange(cb: () => void): Unsubscribe;

  // --- Remote Participants ---

  /** Map of currently discovered remote participants (pubkey -> state). */
  readonly participants: ReadonlyMap<string, RemoteParticipant>;

  /** Subscribe to participant list changes (joins, leaves). */
  onParticipantsChange(cb: (participants: ReadonlyMap<string, RemoteParticipant>) => void): Unsubscribe;

  // --- Audio Playback ---

  /**
   * Set the master volume for all remote audio playback.
   * @param volume 0.0 to 1.0
   */
  setVolume(volume: number): void;

  /** Current master volume. */
  readonly volume: number;
}
