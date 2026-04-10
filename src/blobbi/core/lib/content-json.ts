// src/blobbi/core/lib/content-json.ts

/**
 * Low-level JSON parsing utilities for Kind 11125 content.
 *
 * This module provides the shared parsing foundation that both
 * `blobbonaut-content.ts` and `progression.ts` build on.
 *
 * It is intentionally dependency-free (no imports from other blobbi modules)
 * to prevent circular imports. Higher-level modules import from here;
 * this module never imports from them.
 */

// ─── Content Parsing Result ───────────────────────────────────────────────────

/**
 * Result of parsing kind 11125 content JSON.
 *
 * Includes a `parseOk` flag so callers can distinguish between:
 *   - Empty/blank content (parseOk: true, data is {})
 *   - Valid JSON (parseOk: true, data is the parsed object)
 *   - Invalid JSON / non-object (parseOk: false, data is {})
 *
 * When `parseOk` is false, the content was corrupt. The data field is empty
 * so callers can still merge their update, but they should be aware that
 * any data from the corrupt content is unrecoverable.
 */
export interface ParsedContentResult {
  /** Whether the content was successfully parsed (or was empty/blank). */
  parseOk: boolean;
  /** The parsed data. Empty object when content is blank or unparseable. */
  data: Record<string, unknown>;
}

// ─── Safe Content Parsing ─────────────────────────────────────────────────────

/**
 * Safely parse kind 11125 content JSON into a plain object.
 *
 * Returns `{ parseOk, data }`:
 *   - Empty/blank content → `{ parseOk: true, data: {} }`
 *   - Valid JSON object   → `{ parseOk: true, data: <parsed> }`
 *   - Invalid JSON        → `{ parseOk: false, data: {} }` + DEV warning
 *   - Non-object JSON     → `{ parseOk: false, data: {} }` + DEV warning
 *
 * All keys — known and unknown — are preserved in the returned data.
 *
 * This function never throws. It is the single entry point for all content
 * parsing in the kind 11125 system. Both `parseProfileContent` (typed
 * validation) and the section-update helpers use this under the hood.
 *
 * ── Invalid JSON behavior ─────────────────────────────────────────────────
 *
 * When content is invalid JSON:
 *   - In development: a warning is logged with the first 200 chars of the
 *     content and the parse error, so developers notice the issue.
 *   - In production: fails silently (no console noise for end users).
 *   - In both environments: returns `{ parseOk: false, data: {} }`.
 *
 * The caller can check `parseOk` to decide whether to proceed. All current
 * callers proceed regardless (merge their update into a fresh object) because
 * blocking all writes on corrupt content would leave the user stuck with no
 * recovery path. The corrupt data is lost, but the system stays functional.
 */
export function safeParseContent(content: string): ParsedContentResult {
  if (!content || content.trim() === '') {
    return { parseOk: true, data: {} };
  }

  try {
    const raw = JSON.parse(content);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      if (import.meta.env.DEV) {
        console.warn(
          '[content-json] Content JSON parsed but is not a plain object. ' +
          'Falling back to empty object. Type:',
          Array.isArray(raw) ? 'array' : typeof raw,
        );
      }
      return { parseOk: false, data: {} };
    }
    return { parseOk: true, data: raw as Record<string, unknown> };
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn(
        '[content-json] Failed to parse content JSON. Falling back to empty object.',
        'Content (first 200 chars):',
        content.slice(0, 200),
        'Error:',
        e instanceof Error ? e.message : String(e),
      );
    }
    return { parseOk: false, data: {} };
  }
}

// ─── Generic Section Update ───────────────────────────────────────────────────

/**
 * Update a single top-level section in the kind 11125 content JSON.
 *
 * This is the low-level building block for all section-specific helpers.
 * It guarantees:
 *   1. The existing content is safely parsed (invalid JSON → {} + warning)
 *   2. Only the specified `key` is written/overwritten
 *   3. All sibling sections and unknown keys are preserved
 *   4. The result is serialized to a valid JSON string
 *
 * Prefer the typed helpers (`updateDailyMissionsContent`,
 * `updateProgressionContent`) over calling this directly. Use this only
 * for truly generic/dynamic section updates, or when building a new
 * section-specific helper.
 *
 * @param existingContent - The current `event.content` string (may be empty)
 * @param key             - The top-level key to update (e.g. 'dailyMissions')
 * @param value           - The new value for that key
 * @returns The serialized content string with the section updated
 */
export function updateContentSection(
  existingContent: string,
  key: string,
  value: unknown,
): string {
  const { data } = safeParseContent(existingContent);

  const updated = {
    ...data,
    [key]: value,
  };

  return JSON.stringify(updated);
}
