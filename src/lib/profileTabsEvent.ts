/**
 * Kind 16769 — Profile Tabs
 *
 * Replaceable event. One per user.
 *
 * Each tab stores a kind:777 spell event (JSON-encoded):
 *   ["tab", "<label>", "<spellJSON>"]
 *
 * Variables ($me, $contacts) live inside the spell event's tags and are
 * resolved at runtime by the spell engine — no more `var` tags needed.
 */
import type { NostrEvent } from '@nostrify/nostrify';

export const PROFILE_TABS_KIND = 16769;

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single profile tab backed by a spell event. */
export interface ProfileTab {
  label: string;
  spell: NostrEvent;
}

/** The full parsed result of a kind 16769 event. */
export interface ProfileTabsData {
  tabs: ProfileTab[];
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse a kind 16769 event into ProfileTabsData. Discards malformed entries.
 *
 * Returns `null` when the event contains legacy (pre-spell) tab tags that
 * can't be parsed into the current format. This signals callers to fall back
 * to default tabs rather than showing an empty tab bar.
 */
export function parseProfileTabs(event: NostrEvent): ProfileTabsData | null {
  if (event.kind !== PROFILE_TABS_KIND) return { tabs: [] };

  const tabs: ProfileTab[] = [];
  let tabTagCount = 0;

  for (const tag of event.tags) {
    if (tag[0] === 'tab' && tag.length >= 3) {
      tabTagCount++;
      const label = tag[1];
      if (!label) continue;
      try {
        const raw = JSON.parse(tag[2]);
        // Validate it looks like a NostrEvent with kind 777
        if (raw && typeof raw === 'object' && raw.kind === 777 && Array.isArray(raw.tags)) {
          tabs.push({ label, spell: raw as NostrEvent });
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  // If the event had tab tags but none parsed as valid spells, this is a
  // legacy event from before the spell migration. Return null so callers
  // fall back to default tabs instead of showing an empty tab bar.
  if (tabTagCount > 0 && tabs.length === 0) return null;

  return { tabs };
}

// ─── Building ────────────────────────────────────────────────────────────────

/** Build event tags for a kind 16769 event from ProfileTabsData. */
export function buildProfileTabsTags(data: ProfileTabsData): string[][] {
  const tags: string[][] = [
    ['alt', 'Custom profile tabs'],
  ];

  for (const tab of data.tabs) {
    tags.push(['tab', tab.label, JSON.stringify(tab.spell)]);
  }

  return tags;
}
