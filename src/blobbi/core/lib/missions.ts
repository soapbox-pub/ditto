/**
 * Missions Content Model
 *
 * Defines the JSON shape stored in the kind 11125 content field.
 * Two mission categories:
 *   - daily: reset each day, tally-based or event-based
 *   - evolution: persist across sessions until stage transition completes
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

// ─── Content Shape ───────────────────────────────────────────────────────────

/** The full missions object stored in kind 11125 content JSON */
export interface MissionsContent {
  date: string;                  // YYYY-MM-DD for daily reset detection
  daily: Mission[];              // 3 daily missions, reset each day
  evolution: Mission[];          // active evolution missions, cleared on stage transition
  rerolls: number;               // daily rerolls remaining (resets with date)
}

/**
 * The top-level content JSON for kind 11125.
 * Currently only `missions`. Future keys can be added alongside.
 */
export interface ProfileContent {
  missions?: MissionsContent;
}

// ─── Parse / Serialize ───────────────────────────────────────────────────────

/**
 * Parse the kind 11125 content field into a typed ProfileContent.
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
  return JSON.stringify({ ...base, ...updates });
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function parseMissionsContent(raw: Record<string, unknown>): MissionsContent | undefined {
  if (typeof raw.date !== 'string') return undefined;
  return {
    date: raw.date,
    daily: parseMissionArray(raw.daily),
    evolution: parseMissionArray(raw.evolution),
    rerolls: typeof raw.rerolls === 'number' ? Math.max(0, Math.floor(raw.rerolls)) : 0,
  };
}

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
