# Task Plan: Minimizable Nest (Persistent Audio Across Routes)

## Goal
Allow users to minimize an active nest to a persistent mini-bar, maintaining LiveKit audio while freely browsing the rest of the app, and expand back to the full room view at any time.

## Core Architectural Challenge

When a user navigates away from a nest's naddr URL, the `NestRoomPage` unmounts, destroying the `<LiveKitRoom>` context and killing all audio. We need to **lift the LiveKit connection above the router** so it persists across route changes.

## Architecture: Two-Layer LiveKit Approach

### Layer 1: Global `NestSessionContext` (persistent)
- Lives in `App.tsx`, above `AppRouter` (inside all providers)
- Owns the LiveKit `Room` instance directly via `livekit-client`
- Manages: room connection, token, event data, mic state, minimized/expanded state
- Renders a hidden `<LiveKitRoom room={roomInstance}>` + `<RoomAudioRenderer />` that **always stays mounted** — this is the persistent audio engine
- Also renders the `<MinimizedNestBar />` when minimized

### Layer 2: `NestRoomPage` (route-specific)
- When expanded, passes the existing `Room` instance to its own `<LiveKitRoom room={roomInstance}>` for the full UI (participants grid, controls, chat)
- All hooks (`useParticipants`, `useLocalParticipant`) work because they consume the LiveKit context from the `room` prop
- When the user hits "minimize", the context marks `minimized = true`, the page navigates away, but the Room stays connected in Layer 1

## Phases

- [ ] Phase 1: Create `NestSessionContext` — global context with Room lifecycle management
- [ ] Phase 2: Create `NestSessionProvider` — renders persistent `<LiveKitRoom>` + `<RoomAudioRenderer>` + mini-bar
- [ ] Phase 3: Create `MinimizedNestBar` — the sticky mini-bar UI (title, mic toggle, expand, leave)
- [ ] Phase 4: Refactor `NestRoomPage` — consume global session instead of creating its own LiveKit connection
- [ ] Phase 5: Update `CreateNestDialog` — join session via context instead of navigating with state
- [ ] Phase 6: Wire up minimize/expand flow — button in controls, navigation logic
- [ ] Phase 7: Polish — mobile positioning, animation, edge cases
- [ ] Phase 8: Build, test, commit

## Detailed Design

### NestSessionContext API

```typescript
interface NestSession {
  // State
  event: NostrEvent | null;          // the kind 30312 event
  room: Room | null;                 // livekit-client Room instance
  token: string | null;              // current LiveKit JWT
  livekitUrl: string | null;         // wss://... server URL  
  status: 'disconnected' | 'connecting' | 'connected';
  minimized: boolean;                // is the nest minimized to mini-bar?

  // Actions
  joinNest: (event: NostrEvent, token?: string) => Promise<void>;
  leaveNest: () => void;
  minimize: () => void;              // sets minimized=true, navigates can happen freely
  expand: () => void;                // navigates back to naddr, sets minimized=false
  
  // Convenience
  isActive: boolean;                 // shorthand for room !== null
  isOwner: boolean;                  // event.pubkey === user.pubkey
  aTag: string;                      // computed from event
  dTag: string;                      // computed from event
}
```

### NestSessionProvider (renders in App.tsx)

```tsx
<NestSessionProvider>
  {/* Persistent hidden audio engine — only mounts when session is active */}
  {session.room && (
    <LiveKitRoom room={session.room} serverUrl={...} token={...}>
      <RoomAudioRenderer />
    </LiveKitRoom>
  )}
  
  {/* Mini-bar — only shows when minimized */}
  {session.minimized && <MinimizedNestBar />}
  
  {/* App router — always renders */}
  <AppRouter />
</NestSessionProvider>
```

### MinimizedNestBar

Sticky bar at the bottom of the screen (above mobile nav), showing:
- Gradient accent strip (room color)
- Room title (truncated)
- Mic toggle button (if on stage)
- Expand button (navigates to naddr)
- Leave button (disconnects)

Position: `fixed bottom-0` on mobile (above MobileBottomNav), or `fixed bottom-0` on desktop.

### NestRoomPage Refactored Flow

```
if (nestSession.isActive && nestSession.event.id === currentEvent.id) {
  // We're viewing the active nest — use the global room instance
  <LiveKitRoom room={nestSession.room}>
    // Full room UI with all hooks working
  </LiveKitRoom>
} else {
  // Viewing a nest we haven't joined yet — show join/preview UI
  // "Join" button calls nestSession.joinNest(event)
}
```

### Minimize Flow
1. User taps "Minimize" in NestControlBar
2. `nestSession.minimize()` is called
3. Context sets `minimized = true`
4. `navigate(-1)` takes user back to previous page (or `/nests`)
5. `<MinimizedNestBar />` appears at bottom
6. Audio continues via the persistent `<LiveKitRoom>` in the provider
7. User taps "Expand" on mini-bar → `nestSession.expand()` → `navigate(`/${naddr}`)` → NestRoomPage mounts and reuses the global Room

### Edge Cases to Handle
- User navigates directly to a different nest while one is active → prompt to leave current?
- Token expiry while minimized → background refresh
- Room closed by host while minimized → detect via presence/event subscription, auto-leave
- Browser tab backgrounding → LiveKit handles keepalive internally
- Mobile nav bottom bar positioning with mini-bar

## Key Files to Create
| File | Purpose |
|------|---------|
| `src/contexts/NestSessionContext.tsx` | Context + Provider with Room lifecycle |
| `src/components/MinimizedNestBar.tsx` | The persistent mini-bar UI |

## Key Files to Modify
| File | Change |
|------|--------|
| `src/App.tsx` | Wrap AppRouter in NestSessionProvider |
| `src/components/NestRoomPage.tsx` | Consume NestSessionContext, add minimize button |
| `src/components/CreateNestDialog.tsx` | Use nestSession.joinNest() instead of direct navigation |
| `src/components/MainLayout.tsx` | Account for mini-bar height in layout calculations |

## Status
**Planning complete** — Ready for implementation
