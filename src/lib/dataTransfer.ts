import { getEventHash, verifyEvent } from 'nostr-tools';

import { normalizeRelayUrl } from '@/lib/relayList';

import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Account-level data transfer: moving the logged-in user's own events between
 * the Nostr network and the local IndexedDB event store.
 *
 * Two directions, both relay-by-relay:
 *
 * - **Pull** (export) — REQ every relay for `{ authors: [me] }`, write the
 *   results into the local store, then serialize the store to JSONL.
 * - **Push** (import) — read a JSONL file, sign anything unsigned, write to the
 *   local store, and EVENT it to every relay.
 *
 * Both remember what they already did (see {@link loadSyncState}) so reopening
 * the app doesn't redo the whole transfer.
 */

/** One JSON object per line, newline-terminated. */
export const JSONL_MIME = 'application/x-ndjson';

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Field order for exported events — canonical NIP-01 order, stable across runs. */
function toJsonlLine(event: NostrEvent): string {
  return JSON.stringify({
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  });
}

/** Serialize events to newline-delimited JSON, newest first. */
export function toJsonl(events: NostrEvent[]): string {
  return events.map(toJsonlLine).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Import parsing
// ---------------------------------------------------------------------------

/** An event template from the file that carries no signature and must be signed. */
export interface UnsignedRecord {
  /** 1-based line number in the source file. */
  line: number;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

/** Why a line from the import file can't be published as-is. */
export type ImportIssueKind =
  /** Not valid JSON, or not shaped like a Nostr event at all. */
  | 'malformed'
  /** Signed by a pubkey other than the logged-in account. */
  | 'foreign'
  /** Claims our pubkey (or any pubkey) but the signature doesn't verify. */
  | 'invalid-signature';

export interface ImportIssue {
  kind: ImportIssueKind;
  /** 1-based line number in the source file. */
  line: number;
  /** Event id, when the line had a usable one. */
  id?: string;
  /** Author pubkey, when the line had a usable one. */
  pubkey?: string;
  /** Event kind, when the line had a usable one. */
  eventKind?: number;
}

export interface ParsedImport {
  /** Valid, correctly-signed events authored by the logged-in user. */
  signed: NostrEvent[];
  /** Templates with no signature, to be signed by the logged-in user. */
  unsigned: UnsignedRecord[];
  /** Lines that can't be published, grouped by reason. */
  issues: ImportIssue[];
  /** Count of non-blank lines examined. */
  total: number;
}

function isHex64(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isTagArray(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every((tag) => Array.isArray(tag) && tag.every((v) => typeof v === 'string'));
}

/**
 * Parse a JSONL export into publishable events, unsigned templates, and issues.
 *
 * A line counts as **unsigned** when it has no `sig` — its `id` and `pubkey`
 * are ignored, because signing recomputes both. This is what makes hand-written
 * or programmatically-generated JSONL importable: only `kind` is required, and
 * `content` / `tags` / `created_at` fall back to sensible defaults.
 *
 * A line that *does* carry a `sig` is verified. One signed by somebody else is
 * not silently dropped — it becomes a `'foreign'` issue so the UI can surface
 * it, since importing another person's events under your own key would either
 * fail at the relay or forge attribution.
 */
export function parseJsonl(text: string, pubkey: string): ParsedImport {
  const signed: NostrEvent[] = [];
  const unsigned: UnsignedRecord[] = [];
  const issues: ImportIssue[] = [];
  let total = 0;

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    const line = i + 1;
    total++;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      issues.push({ kind: 'malformed', line });
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      issues.push({ kind: 'malformed', line });
      continue;
    }

    const record = parsed as Record<string, unknown>;

    if (typeof record.kind !== 'number' || !Number.isInteger(record.kind) || record.kind < 0) {
      issues.push({ kind: 'malformed', line });
      continue;
    }

    const content = typeof record.content === 'string' ? record.content : '';
    const tags = isTagArray(record.tags) ? record.tags : [];

    // No signature: treat it as a template and sign it later.
    if (record.sig === undefined || record.sig === null || record.sig === '') {
      const created_at = typeof record.created_at === 'number' && Number.isFinite(record.created_at)
        ? Math.floor(record.created_at)
        : Math.floor(Date.now() / 1000);

      unsigned.push({ line, kind: record.kind, content, tags, created_at });
      continue;
    }

    // Has a signature — every other field must be well-formed for it to mean anything.
    if (
      !isHex64(record.id) ||
      !isHex64(record.pubkey) ||
      typeof record.sig !== 'string' ||
      typeof record.created_at !== 'number' ||
      !isTagArray(record.tags)
    ) {
      issues.push({
        kind: 'malformed',
        line,
        id: isHex64(record.id) ? record.id : undefined,
        eventKind: record.kind,
      });
      continue;
    }

    const event: NostrEvent = {
      id: record.id,
      pubkey: record.pubkey,
      created_at: Math.floor(record.created_at),
      kind: record.kind,
      tags: record.tags,
      content,
      sig: record.sig,
    };

    if (event.pubkey !== pubkey) {
      issues.push({ kind: 'foreign', line, id: event.id, pubkey: event.pubkey, eventKind: event.kind });
      continue;
    }

    if (getEventHash(event) !== event.id || !verifyEvent(event)) {
      issues.push({ kind: 'invalid-signature', line, id: event.id, pubkey: event.pubkey, eventKind: event.kind });
      continue;
    }

    signed.push(event);
  }

  return { signed, unsigned, issues, total };
}

// ---------------------------------------------------------------------------
// Sync state
// ---------------------------------------------------------------------------

/**
 * How many pushed event ids to remember per relay.
 *
 * Ids are truncated to {@link ID_PREFIX_LEN} characters, so this costs roughly
 * 65 KB of localStorage per relay. A truncation collision (~1 in 10^7 at this
 * size) only means one event is wrongly considered already-pushed; a full push
 * clears the record and fixes it.
 */
const MAX_PUSHED_IDS = 5_000;
const ID_PREFIX_LEN = 12;

const STORAGE_PREFIX = 'ditto:datasync:';

export interface RelaySyncState {
  /**
   * Highest `created_at` seen while pulling from this relay. The next
   * incremental pull asks for `{ since: pulledUntil }` instead of all history.
   */
  pulledUntil?: number;
  /** Truncated ids of events this relay has already accepted from us. */
  pushed?: string[];
  /** Wall-clock seconds of the last completed pull. */
  lastPullAt?: number;
  /** Wall-clock seconds of the last completed push. */
  lastPushAt?: number;
}

/** Per-account sync state, keyed by normalized relay URL. */
export type AccountSyncState = Record<string, RelaySyncState>;

function storageKey(pubkey: string): string {
  return `${STORAGE_PREFIX}${pubkey}`;
}

/**
 * Read the account's saved sync state.
 *
 * Never throws — a corrupt or unavailable store degrades to "nothing has been
 * synced yet", which costs a redundant full transfer but is always correct.
 */
export function loadSyncState(pubkey: string): AccountSyncState {
  try {
    const raw = localStorage.getItem(storageKey(pubkey));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as AccountSyncState;
  } catch {
    return {};
  }
}

/** Persist the account's sync state. Silently no-ops if storage is unavailable. */
export function saveSyncState(pubkey: string, state: AccountSyncState): void {
  try {
    localStorage.setItem(storageKey(pubkey), JSON.stringify(state));
  } catch {
    // Quota or privacy mode — the next run just repeats work.
  }
}

/** Read one relay's slice of the sync state. */
export function getRelaySyncState(pubkey: string, url: string): RelaySyncState {
  return loadSyncState(pubkey)[normalizeRelayUrl(url)] ?? {};
}

/** Merge an update into one relay's slice, leaving other relays untouched. */
export function updateRelaySyncState(
  pubkey: string,
  url: string,
  update: (prev: RelaySyncState) => RelaySyncState,
): void {
  const key = normalizeRelayUrl(url);
  const state = loadSyncState(pubkey);
  state[key] = update(state[key] ?? {});
  saveSyncState(pubkey, state);
}

/** Record that a relay accepted these events, so a later push can skip them. */
export function markPushed(pubkey: string, url: string, ids: string[]): void {
  if (!ids.length) return;

  updateRelaySyncState(pubkey, url, (prev) => {
    // Set preserves insertion order, so re-adding then trimming from the front
    // evicts the least recently pushed ids.
    const pushed = new Set(prev.pushed ?? []);
    for (const id of ids) {
      const short = id.slice(0, ID_PREFIX_LEN);
      pushed.delete(short);
      pushed.add(short);
    }

    const trimmed = [...pushed];
    return {
      ...prev,
      pushed: trimmed.length > MAX_PUSHED_IDS ? trimmed.slice(trimmed.length - MAX_PUSHED_IDS) : trimmed,
      lastPushAt: Math.floor(Date.now() / 1000),
    };
  });
}

/** Build a fast lookup for "did this relay already take this event?". */
export function pushedLookup(state: RelaySyncState): (id: string) => boolean {
  const pushed = new Set(state.pushed ?? []);
  return (id: string) => pushed.has(id.slice(0, ID_PREFIX_LEN));
}

/** Forget every relay's pull watermark, forcing the next pull to walk all history. */
export function clearPullState(pubkey: string): void {
  const state = loadSyncState(pubkey);
  for (const key of Object.keys(state)) {
    delete state[key].pulledUntil;
  }
  saveSyncState(pubkey, state);
}

/** Forget every relay's pushed-id record, forcing the next push to re-send everything. */
export function clearPushState(pubkey: string): void {
  const state = loadSyncState(pubkey);
  for (const key of Object.keys(state)) {
    delete state[key].pushed;
  }
  saveSyncState(pubkey, state);
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type RelayPhase =
  /** Queued, not started. */
  | 'pending'
  /** Asking the relay for a NIP-45 total, so the bar can be determinate. */
  | 'counting'
  /** Transferring. */
  | 'active'
  /** Finished successfully. */
  | 'done'
  /** Finished with an error; `error` holds a short message. */
  | 'error';

export interface RelayProgress {
  url: string;
  phase: RelayPhase;
  /** Events transferred so far. */
  processed: number;
  /** Expected total, when the relay answered a NIP-45 COUNT. */
  total?: number;
  /** Events skipped because a previous run already handled them. */
  skipped: number;
  /** Short failure message, set when `phase` is `'error'`. */
  error?: string;
}

/** Percentage for a determinate progress bar, or `undefined` when unknown. */
export function progressPercent(progress: RelayProgress): number | undefined {
  if (progress.phase === 'done') return 100;
  if (progress.total === undefined || progress.total <= 0) return undefined;
  return Math.min(100, Math.round((progress.processed / progress.total) * 100));
}

/** Build a filename like `nostr-export-npub1abcd-2026-08-23.jsonl`. */
export function exportFilename(npub: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `nostr-export-${npub.slice(0, 12)}-${date}.jsonl`;
}
