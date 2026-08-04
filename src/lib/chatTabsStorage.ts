import type { Ability } from '@/lib/abilities';
import type { SerializedSession } from '@soapbox.pub/nostr-canvas/devkit';

/**
 * localStorage prefix for per-tab AI chat persistence. One entry per tab,
 * keyed as `${TAB_STORAGE_PREFIX}${pubkey ?? 'anon'}.${tabId}` so tabs never
 * leak between simultaneously logged-in accounts on the same device.
 */
export const TAB_STORAGE_PREFIX = 'ditto.ai-chat.tab.v1.';

/** Hard cap on simultaneously open chat tabs. */
export const MAX_OPEN_TABS = 20;

/** Tabs untouched longer than this are silently pruned on the next app load. */
export const TAB_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Everything a tab needs to come back after a page reload: session metadata
 * plus the AgentSession's serialized blob (messages + pendingInput +
 * pendingToolCalls), so a mid-flight ask_questions pause survives reload.
 */
export interface PersistedTab {
  id: string;
  title: string;
  abilities: Ability[];
  providerId: string;
  modelId: string;
  /** Unix-ms creation time; drives tab ordering. */
  createdAt: number;
  /** Unix-ms of the last write; drives 30-day pruning. */
  updatedAt: number;
  agent: SerializedSession;
}

/** Metadata fields a session write may patch without touching the agent blob. */
export type TabMetadataPatch = Partial<
  Pick<PersistedTab, 'title' | 'abilities' | 'providerId' | 'modelId' | 'createdAt'>
>;

function keyFor(pubkey: string | undefined, id: string): string {
  return `${TAB_STORAGE_PREFIX}${pubkey ?? 'anon'}.${id}`;
}

/** All stored tabs for a pubkey scope, oldest first. Malformed entries are skipped. */
export function getStoredTabs(pubkey?: string, storage: Storage = localStorage): PersistedTab[] {
  // Only enumerate this pubkey's segment so other accounts' tabs stay hidden.
  const segment = `${TAB_STORAGE_PREFIX}${pubkey ?? 'anon'}.`;
  const tabs: PersistedTab[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key?.startsWith(segment)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const tab = JSON.parse(raw) as PersistedTab;
      if (tab && typeof tab.id === 'string') tabs.push(tab);
    } catch {
      // Skip malformed entries rather than crashing the whole tab restore.
    }
  }
  tabs.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return tabs;
}

/** A single stored tab, or null when none exists under this id. */
export function getStoredTab(id: string, pubkey?: string, storage: Storage = localStorage): PersistedTab | null {
  const raw = storage.getItem(keyFor(pubkey, id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedTab;
  } catch {
    return null;
  }
}

/** Write (or overwrite) a tab's full record. */
export function saveTab(tab: PersistedTab, pubkey?: string, storage: Storage = localStorage): void {
  try {
    storage.setItem(keyFor(pubkey, tab.id), JSON.stringify(tab));
  } catch {
    // localStorage may be unavailable (private mode etc.)
  }
}

/** Hard-delete a tab's record. */
export function removeTab(id: string, pubkey?: string, storage: Storage = localStorage): void {
  try {
    storage.removeItem(keyFor(pubkey, id));
  } catch {
    // localStorage may be unavailable (private mode etc.)
  }
}

/**
 * Merge a metadata patch into a stored tab, preserving its agent blob.
 * Returns the updated record, or null when no record exists for this id.
 */
export function patchTabMetadata(
  id: string,
  patch: TabMetadataPatch,
  pubkey?: string,
  now = Date.now(),
  storage: Storage = localStorage,
): PersistedTab | null {
  const tab = getStoredTab(id, pubkey, storage);
  if (!tab) return null;
  const next = { ...tab, ...patch, updatedAt: now };
  saveTab(next, pubkey, storage);
  return next;
}

/**
 * Merge a fresh agent blob into a stored tab, preserving its metadata.
 * Returns the updated record, or null when no record exists for this id.
 */
export function saveTabAgent(
  id: string,
  agent: SerializedSession,
  pubkey?: string,
  now = Date.now(),
  storage: Storage = localStorage,
): PersistedTab | null {
  const tab = getStoredTab(id, pubkey, storage);
  if (!tab) return null;
  const next = { ...tab, agent, updatedAt: now };
  saveTab(next, pubkey, storage);
  return next;
}

/** Delete tabs untouched for TAB_MAX_AGE_MS. Returns the ids removed. */
export function pruneStaleTabs(pubkey?: string, now = Date.now(), storage: Storage = localStorage): string[] {
  const cutoff = now - TAB_MAX_AGE_MS;
  const removed: string[] = [];
  for (const tab of getStoredTabs(pubkey, storage)) {
    // A tab untouched for the full TAB_MAX_AGE_MS is stale.
    if (tab.updatedAt <= cutoff) {
      removeTab(tab.id, pubkey, storage);
      removed.push(tab.id);
    }
  }
  return removed;
}

/** True once the number of open tabs is at the cap, so creating another needs a prompt. */
export function isAtTabCap(count: number): boolean {
  return count >= MAX_OPEN_TABS;
}
