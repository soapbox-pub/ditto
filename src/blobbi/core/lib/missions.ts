/**
 * Missions Content Model
 *
 * Two separate persistence locations:
 *   - Daily missions → kind 11125 content JSON (per-user)
 *   - Evolution missions → kind 31124 content JSON (per-Blobbi)
 *
 * Tally missions track a `count` (no event IDs).
 * Event missions track an `events` array of Nostr event IDs.
 * Completion is derived: count >= target or events.length >= target.
 */

// ─── Mission Entry Types ─────────────────────────────────────────────────────

/** A mission tracked by a simple counter (feed, clean, interact, etc.) */
export interface TallyMission {
  id: string;
  target: number;
  count: number;
}

/** A mission tracked by Nostr event IDs (post, photo, theme, etc.) */
export interface EventMission {
  id: string;
  target: number;
  events: string[];
}

/** Union of both mission shapes */
export type Mission = TallyMission | EventMission;

/** Type guard: mission tracks events */
export function isEventMission(m: Mission): m is EventMission {
  return 'events' in m;
}

/** Type guard: mission tracks a tally */
export function isTallyMission(m: Mission): m is TallyMission {
  return 'count' in m;
}

/** Check if a mission is complete */
export function isMissionComplete(m: Mission): boolean {
  if (isEventMission(m)) return m.events.length >= m.target;
  return m.count >= m.target;
}

/** Get current progress numerator */
export function missionProgress(m: Mission): number {
  if (isEventMission(m)) return m.events.length;
  return m.count;
}

// ─── Daily Missions (kind 11125) ─────────────────────────────────────────────

/** Daily missions object stored in kind 11125 content JSON */
export interface MissionsContent {
  date: string;                  // YYYY-MM-DD for daily reset detection
  daily: Mission[];              // 3 daily missions, reset each day
  rerolls: number;               // daily rerolls remaining (resets with date)
}

/**
 * The top-level content JSON for kind 11125.
 * Keys are added alongside each other; `serializeProfileContent` preserves unknown keys.
 */
export interface ProfileContent {
  missions?: MissionsContent;
  room_layouts?: import('@/blobbi/rooms/lib/room-layout-schema').RoomLayoutsContent;
  room_furniture?: import('@/blobbi/rooms/lib/room-furniture-schema').RoomFurnitureContent;
}

// ─── Evolution Missions (kind 31124) ─────────────────────────────────────────

/**
 * Evolution mission state stored in kind 31124 content JSON.
 * Per-Blobbi progression that survives reloads.
 */
export interface EvolutionContent {
  evolution: Mission[];
}

/**
 * Parse evolution missions from a kind 31124 content field.
 * Returns empty array for empty/invalid/non-JSON content. Never throws.
 */
export function parseEvolutionContent(content: string): Mission[] {
  if (!content || !content.trim()) return [];
  try {
    const raw = JSON.parse(content);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];
    return parseMissionArray(raw.evolution);
  } catch {
    // Old-format content is plain text (e.g. "Luna is an egg...") — not JSON
    return [];
  }
}

/**
 * Serialize evolution missions into kind 31124 content JSON.
 * Preserves any unknown top-level keys from the existing content.
 */
export function serializeEvolutionContent(
  existingContent: string,
  evolution: Mission[],
): string {
  let base: Record<string, unknown> = {};
  if (existingContent && existingContent.trim()) {
    try {
      const parsed = JSON.parse(existingContent);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        base = parsed;
      }
    } catch {
      // Old-format text content — start fresh
    }
  }
  return JSON.stringify({ ...base, evolution });
}

// ─── Profile Content (kind 11125) ────────────────────────────────────────────

/**
 * Parse the kind 11125 content field into a typed ProfileContent.
 * Only extracts `missions`; other keys (e.g. `room_layouts`) have dedicated parsers.
 * Returns an empty object for empty/invalid content. Never throws.
 */
export function parseProfileContent(content: string): ProfileContent {
  if (!content || !content.trim()) return {};
  try {
    const raw = JSON.parse(content);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const result: ProfileContent = {};
    if (raw.missions && typeof raw.missions === 'object') {
      result.missions = parseMissionsContent(raw.missions);
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Serialize ProfileContent back to a JSON string for publishing.
 * Preserves any unknown top-level keys from the existing content.
 *
 * NOTE: Strips any legacy `evolution` key from the missions object
 * so old 11125 events don't carry stale per-Blobbi data.
 */
export function serializeProfileContent(
  existingContent: string,
  updates: Partial<ProfileContent>,
): string {
  let base: Record<string, unknown> = {};
  if (existingContent && existingContent.trim()) {
    try {
      const parsed = JSON.parse(existingContent);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        base = parsed;
      }
    } catch {
      // corrupt content -- start fresh but don't lose updates
    }
  }
  const merged = { ...base, ...updates };

  // Strip legacy evolution from missions if present
  if (merged.missions && typeof merged.missions === 'object' && !Array.isArray(merged.missions)) {
    const m = merged.missions as unknown as Record<string, unknown>;
    if ('evolution' in m) {
      delete m.evolution;
    }
  }

  return JSON.stringify(merged);
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function parseMissionsContent(raw: Record<string, unknown>): MissionsContent | undefined {
  if (typeof raw.date !== 'string') return undefined;
  return {
    date: raw.date,
    daily: parseMissionArray(raw.daily),
    rerolls: typeof raw.rerolls === 'number' ? Math.max(0, Math.floor(raw.rerolls)) : 0,
  };
}

/** @internal Exported for use by parseEvolutionContent */
function parseMissionArray(raw: unknown): Mission[] {
  if (!Array.isArray(raw)) return [];
  const result: Mission[] = [];
  for (const entry of raw) {
    const m = parseSingleMission(entry);
    if (m) result.push(m);
  }
  return result;
}

function parseSingleMission(raw: unknown): Mission | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.target !== 'number') return undefined;

  // Event-based mission
  if (Array.isArray(obj.events)) {
    return {
      id: obj.id,
      target: Math.max(1, Math.floor(obj.target)),
      events: obj.events.filter((e): e is string => typeof e === 'string'),
    };
  }

  // Tally-based mission
  if (typeof obj.count === 'number') {
    return {
      id: obj.id,
      target: Math.max(1, Math.floor(obj.target)),
      count: Math.max(0, Math.floor(obj.count)),
    };
  }

  return undefined;
}
