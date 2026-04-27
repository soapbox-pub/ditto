/**
 * In-memory store for AI-generated tile drafts.
 *
 * When the Shakespeare `preview_tile` tool is called, the model emits a full
 * tile payload (Lua source + metadata). We stash it in this module-level
 * map keyed by the draft identifier. The chat's tool-call badge renders a
 * `TileGenerationCard` that reads the payload back synchronously — this
 * avoids making `executeToolCall` async and lets tool results survive
 * re-renders without being serialised into React state.
 *
 * Drafts are never persisted. A page reload clears them; if the user wants
 * to keep a draft around they must hit "Install", which signs a real
 * kind-30207 event and adds it to `AppConfig.installedTiles` via
 * `useInstalledTiles().installTile`.
 */
import type { SettingsField } from '@soapbox.pub/nostr-canvas';

export interface TileDraft {
  /** Stable runtime identifier (local draft or publishable form). */
  identifier: string;
  /** Human-friendly name (mapped to the kind-30207 `name` tag on install). */
  name: string;
  /** One-line summary (mapped to the `summary` tag). */
  summary: string;
  /** Optional markdown description (mapped to the `description` tag). */
  description?: string;
  /** Optional banner / icon URL (mapped to the `image` tag). */
  image?: string;
  /** Lua source — becomes the event `content`. */
  script: string;
  /** Declared settings fields — serialised to `setting` tags on install. */
  settings: SettingsField[];
}

const drafts = new Map<string, TileDraft>();

export function putTileDraft(draft: TileDraft): void {
  drafts.set(draft.identifier, draft);
}

export function getTileDraft(identifier: string): TileDraft | undefined {
  return drafts.get(identifier);
}
