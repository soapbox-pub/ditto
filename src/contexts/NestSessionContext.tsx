import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { nip19 } from 'nostr-tools';
import { Room, ConnectionState, RoomEvent } from 'livekit-client';
import { RoomContext, RoomAudioRenderer } from '@livekit/components-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNestsApi } from '@/hooks/useNestsApi';

/** Nest room kind. */
const NEST_KIND = 30312;

/** Token refresh interval (4 minutes — tokens typically last 10 min). */
const TOKEN_REFRESH_INTERVAL = 4 * 60 * 1000;

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Extract the LiveKit server URL from event streaming tags. */
function extractLivekitUrl(event: NostrEvent): string | undefined {
  const streamingTags = event.tags.filter(([n]) => n === 'streaming');
  for (const [, url] of streamingTags) {
    if (url?.startsWith('wss+livekit://') || url?.startsWith('ws+livekit://')) {
      return url.replace('+livekit', '');
    }
  }
  for (const [, url] of streamingTags) {
    if (url?.startsWith('wss://') || url?.startsWith('ws://')) {
      return url;
    }
  }
  return undefined;
}

// ── Public interface ──

export interface NestSessionState {
  /** The kind 30312 room event. */
  event: NostrEvent | null;
  /** The livekit-client Room instance. */
  room: Room | null;
  /** LiveKit connection status. */
  connectionState: ConnectionState;
  /** Whether the nest is minimized to the mini-bar. */
  minimized: boolean;
  /** Shorthand: a session is active. */
  isActive: boolean;
  /** Whether the current user is the room owner. */
  isOwner: boolean;
  /** Computed a-tag for the room. */
  aTag: string;
  /** Computed d-tag (room ID). */
  dTag: string;
  /** Computed naddr for navigation. */
  naddr: string;

  // Actions
  /** Join a nest. Optionally pass an initial token from room creation. */
  joinNest: (event: NostrEvent, initialToken?: string) => Promise<void>;
  /** Leave the nest and disconnect audio. */
  leaveNest: () => void;
  /** Minimize to mini-bar (audio continues). */
  minimize: () => void;
  /** Expand back to full room view (navigates to naddr). */
  expand: () => void;
}

const NestSessionContext = createContext<NestSessionState | null>(null);

/** Consume the nest session context. */
export function useNestSession(): NestSessionState {
  const ctx = useContext(NestSessionContext);
  if (!ctx) throw new Error('useNestSession must be used within a NestSessionProvider');
  return ctx;
}

/** Optional version that returns null when no provider is mounted. */
export function useNestSessionMaybe(): NestSessionState | null {
  return useContext(NestSessionContext);
}

// ── Provider ──

export function NestSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const api = useNestsApi();

  const [event, setEvent] = useState<NostrEvent | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [minimized, setMinimized] = useState(false);

  // Refs for cleanup
  const roomRef = useRef<Room | null>(null);
  const tokenRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joiningRef = useRef(false);

  // Derived state
  const dTag = event ? (getTag(event.tags, 'd') || '') : '';
  const aTag = event ? `${NEST_KIND}:${event.pubkey}:${dTag}` : '';
  const naddr = useMemo(() => {
    if (!event) return '';
    return nip19.naddrEncode({ kind: NEST_KIND, pubkey: event.pubkey, identifier: dTag });
  }, [event, dTag]);
  const isActive = room !== null && event !== null;
  const isOwner = !!(user && event && user.pubkey === event.pubkey);

  // ── joinNest ──
  const joinNest = useCallback(async (nestEvent: NostrEvent, initialToken?: string) => {
    // Prevent concurrent join attempts (e.g. React Strict Mode double-fires)
    if (joiningRef.current) return;
    joiningRef.current = true;

    try {
      // If already in a different room, leave first
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }

      const url = extractLivekitUrl(nestEvent);
      if (!url) {
        console.error('No LiveKit URL found in nest event');
        return;
      }

      const roomDTag = getTag(nestEvent.tags, 'd') || '';

      // Get token
      let tkn = initialToken;
      if (!tkn) {
        try {
          const result = await api.joinRoom(roomDTag);
          tkn = result.token;
        } catch (err) {
          console.error('Failed to get nest token:', err);
          return;
        }
      }

      // Create and connect Room
      const newRoom = new Room();
      roomRef.current = newRoom;

      // Track connection state
      const handleStateChange = (state: ConnectionState) => {
        setConnectionState(state);
      };
      newRoom.on(RoomEvent.ConnectionStateChanged, handleStateChange);

      // Track disconnection (e.g. host closed room, network error)
      newRoom.on(RoomEvent.Disconnected, () => {
        setRoom(null);
        setEvent(null);
        setToken(null);
        setLivekitUrl(null);
        setMinimized(false);
        setConnectionState(ConnectionState.Disconnected);
        roomRef.current = null;
        if (tokenRefreshRef.current) {
          clearInterval(tokenRefreshRef.current);
          tokenRefreshRef.current = null;
        }
      });

      try {
        await newRoom.connect(url, tkn);
      } catch (err) {
        console.error('Failed to connect to LiveKit:', err);
        roomRef.current = null;
        return;
      }

      setRoom(newRoom);
      setEvent(nestEvent);
      setToken(tkn);
      setLivekitUrl(url);
      setMinimized(false);
      setConnectionState(newRoom.state);

      // Background token refresh to prevent expiry
      tokenRefreshRef.current = setInterval(async () => {
        try {
          const result = await api.joinRoom(roomDTag);
          setToken(result.token);
        } catch {
          // Token refresh failed — not critical, current token may still be valid
        }
      }, TOKEN_REFRESH_INTERVAL);
    } finally {
      joiningRef.current = false;
    }
  }, [api]);

  // ── leaveNest ──
  const leaveNest = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect().catch(() => {});
      roomRef.current = null;
    }
    if (tokenRefreshRef.current) {
      clearInterval(tokenRefreshRef.current);
      tokenRefreshRef.current = null;
    }
    setRoom(null);
    setEvent(null);
    setToken(null);
    setLivekitUrl(null);
    setMinimized(false);
    setConnectionState(ConnectionState.Disconnected);
  }, []);

  // ── minimize ──
  const minimize = useCallback(() => {
    setMinimized(true);
  }, []);

  // ── expand ──
  // Note: expand just sets minimized=false. The actual navigation
  // is handled by the MinimizedNestBar since useNavigate requires
  // being inside a Router context.
  const expand = useCallback(() => {
    setMinimized(false);
  }, []);

  // Warn before closing tab/refreshing while in an active session
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (roomRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect().catch(() => {});
      }
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
      }
    };
  }, []);

  const value = useMemo<NestSessionState>(() => ({
    event,
    room,
    connectionState,
    minimized,
    isActive,
    isOwner,
    aTag,
    dTag,
    naddr,
    joinNest,
    leaveNest,
    minimize,
    expand,
  }), [event, room, connectionState, minimized, isActive, isOwner, aTag, dTag, naddr, joinNest, leaveNest, minimize, expand]);

  return (
    <NestSessionContext.Provider value={value}>
      {/* Persistent audio engine — stays mounted while session is active.
          Uses RoomContext.Provider directly (not LiveKitRoom) to avoid
          lifecycle management that could disconnect our manually-managed Room. */}
      {room && (
        <div className="hidden">
          <RoomContext.Provider value={room}>
            <RoomAudioRenderer />
          </RoomContext.Provider>
        </div>
      )}
      {children}
    </NestSessionContext.Provider>
  );
}
