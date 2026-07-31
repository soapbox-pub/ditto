/**
 * Kind 16769 — Profile Tabs
 *
 * Replaceable event. One per user.
 *
 * Each tab is a `tab` tag whose third element is a JSON-encoded NIP-01 filter:
 *   ["tab", "<label>", "<filterJSON>"]
 *
 * Variables (`$name`) may appear in filter string values. They are defined by
 * `var` tags that extract values from referenced Nostr events:
 *   ["var", "$name", "<tag-to-extract>", "<event-pointer>"]
 *
 * The only runtime variable is `$me` — the profile owner's pubkey.
 */
import { z } from 'zod';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

export const PROFILE_TABS_KIND = 16769;

// ─── Types ───────────────────────────────────────────────────────────────────

/** A variable definition parsed from a `var` tag. */
export interface TabVarDef {
  /** Variable name including the `$` prefix, e.g. `"$follows"`. */
  name: string;
  /** Tag name to extract from the referenced event, e.g. `"p"`. */
  tagName: string;
  /** Event pointer: `e:<id>` or `a:<kind>:<pubkey>:<d-tag>`. May contain variables. */
  pointer: string;
}

/**
 * A tab filter is a standard NIP-01 filter object that may contain
 * variable placeholders (`$name`) in string positions.
 * After variable resolution, it becomes a plain `NostrFilter`.
 */
export type TabFilter = Record<string, unknown>;

/** A single profile tab. */
export interface ProfileTab {
  label: string;
  filter: TabFilter;
}

/** The full parsed result of a kind 16769 event. */
export interface ProfileTabsData {
  tabs: ProfileTab[];
  vars: TabVarDef[];
}

// ─── Zod schemas for strict validation ───────────────────────────────────────

/** Schema for a NIP-01 filter object (lenient — allows variable strings). */
const TabFilterSchema = z.record(z.string(), z.unknown());

// ─── Parsing ─────────────────────────────────────────────────────────────────

/** Parse a kind 16769 event into ProfileTabsData. Discards malformed entries. */
export function parseProfileTabs(event: NostrEvent): ProfileTabsData {
  if (event.kind !== PROFILE_TABS_KIND) return { tabs: [], vars: [] };

  const tabs: ProfileTab[] = [];
  const vars: TabVarDef[] = [];

  for (const tag of event.tags) {
    if (tag[0] === 'tab' && tag.length >= 3) {
      const label = tag[1];
      if (!label) continue;
      try {
        const raw = JSON.parse(tag[2]);
        const parsed = TabFilterSchema.safeParse(raw);
        if (!parsed.success) continue;
        tabs.push({ label, filter: parsed.data });
      } catch {
        // skip malformed filter JSON
      }
    } else if (tag[0] === 'var' && tag.length >= 4) {
      const name = tag[1];
      const tagName = tag[2];
      const pointer = tag[3];
      if (!name?.startsWith('$') || !tagName || !pointer) continue;
      vars.push({ name, tagName, pointer });
    }
  }

  return { tabs, vars };
}

// ─── Core "Feed" tab interop ─────────────────────────────────────────────────
//
// Ditto's built-in feed tab (a user's posts + reposts) is serialized with the
// label "Posts" for cross-client interop — other clients read the kind 16769
// event and show a "Posts" tab. Internally Ditto uses "Feed" as the canonical
// label so users are free to create their OWN custom tab named "Posts" without
// colliding with the built-in one. The two are told apart by their filter: the
// built-in tab always carries the canonical feed filter below.

/** Internal canonical label for the built-in feed tab. */
export const CORE_FEED_LABEL = 'Feed';
/** Wire label the built-in feed tab is serialized as (legacy, for interop). */
export const CORE_FEED_WIRE_LABEL = 'Posts';

/** The canonical NIP-01 filter for the built-in feed tab, for a given owner. */
function coreFeedFilter(ownerPubkey: string): TabFilter {
  return { kinds: [1, 6], authors: [ownerPubkey] };
}

/** Order-independent structural equality for two plain filter objects. */
function filtersEqual(a: TabFilter, b: TabFilter): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!(key in b)) return false;
    const av = a[key];
    const bv = b[key];
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      const as = av.map((x) => JSON.stringify(x)).sort();
      const bs = bv.map((x) => JSON.stringify(x)).sort();
      if (as.some((x, i) => x !== bs[i])) return false;
    } else if (JSON.stringify(av) !== JSON.stringify(bv)) {
      return false;
    }
  }
  return true;
}

/** True if a tab is the built-in feed tab (matching label + canonical filter). */
function isCoreFeedTab(tab: ProfileTab, ownerPubkey: string, label: string): boolean {
  return tab.label === label && filtersEqual(tab.filter, coreFeedFilter(ownerPubkey));
}

/**
 * Translate a freshly-parsed kind 16769 event into Ditto's internal model: the
 * built-in feed tab's wire label ("Posts") becomes the canonical "Feed" so it
 * no longer collides with a user's own custom tab named "Posts".
 */
export function fromWireProfileTabs(data: ProfileTabsData, ownerPubkey: string): ProfileTabsData {
  return {
    ...data,
    tabs: data.tabs.map((tab) =>
      isCoreFeedTab(tab, ownerPubkey, CORE_FEED_WIRE_LABEL) ? { ...tab, label: CORE_FEED_LABEL } : tab,
    ),
  };
}

/**
 * Translate Ditto's internal tab model back to the wire format before
 * publishing: the built-in feed tab's canonical "Feed" label becomes "Posts".
 */
export function toWireProfileTabs(data: ProfileTabsData, ownerPubkey: string): ProfileTabsData {
  return {
    ...data,
    tabs: data.tabs.map((tab) =>
      isCoreFeedTab(tab, ownerPubkey, CORE_FEED_LABEL) ? { ...tab, label: CORE_FEED_WIRE_LABEL } : tab,
    ),
  };
}

// ─── Building ────────────────────────────────────────────────────────────────

/** Build event tags for a kind 16769 event from ProfileTabsData. */
export function buildProfileTabsTags(data: ProfileTabsData): string[][] {
  const tags: string[][] = [
    ['alt', 'Custom profile tabs'],
  ];

  for (const v of data.vars) {
    tags.push(['var', v.name, v.tagName, v.pointer]);
  }

  for (const tab of data.tabs) {
    tags.push(['tab', tab.label, JSON.stringify(tab.filter)]);
  }

  return tags;
}

// ─── Variable Resolution ─────────────────────────────────────────────────────

/**
 * Resolve a single event pointer string, substituting runtime variables.
 * Returns `{ type: 'e', id }` or `{ type: 'a', kind, pubkey, dTag }`.
 */
export function resolvePointer(
  pointer: string,
  runtimeVars: Record<string, string>,
): { type: 'e'; id: string } | { type: 'a'; kind: number; pubkey: string; dTag: string } | null {
  // Substitute runtime vars in the pointer string
  let resolved = pointer;
  for (const [name, value] of Object.entries(runtimeVars)) {
    resolved = resolved.replaceAll(name, value);
  }

  if (resolved.startsWith('e:')) {
    return { type: 'e', id: resolved.slice(2) };
  }

  if (resolved.startsWith('a:')) {
    const parts = resolved.slice(2).split(':');
    if (parts.length < 3) return null;
    const kind = parseInt(parts[0], 10);
    if (isNaN(kind)) return null;
    return { type: 'a', kind, pubkey: parts[1], dTag: parts[2] };
  }

  return null;
}

/**
 * Resolve all variables in a filter, producing a standard NostrFilter.
 *
 * @param filter - The tab filter with variable placeholders.
 * @param resolvedVars - Map from variable name (e.g. `"$follows"`) to resolved values.
 * @param runtimeVars - Map of runtime variables (e.g. `{ "$me": "pubkey" }`).
 */
export function resolveFilter(
  filter: TabFilter,
  resolvedVars: Record<string, string[]>,
  runtimeVars: Record<string, string>,
): NostrFilter {
  const allVars: Record<string, string[]> = { ...resolvedVars };
  // Runtime scalar vars are treated as single-element arrays for expansion
  for (const [name, value] of Object.entries(runtimeVars)) {
    if (!(name in allVars)) {
      allVars[name] = [value];
    }
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filter)) {
    if (Array.isArray(value)) {
      // Expand variables in arrays (splice in-place)
      const expanded: unknown[] = [];
      for (const item of value) {
        if (typeof item === 'string' && item.startsWith('$') && item in allVars) {
          expanded.push(...allVars[item]);
        } else {
          expanded.push(item);
        }
      }
      result[key] = expanded;
    } else if (typeof value === 'string' && value.startsWith('$') && value in allVars) {
      // Scalar string variable — expand to array if multiple values, otherwise keep as string
      const vals = allVars[value];
      result[key] = vals.length === 1 ? vals[0] : vals;
    } else {
      result[key] = value;
    }
  }

  return result as NostrFilter;
}
