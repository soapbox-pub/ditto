import { useMemo } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { useOptionalCanvasTileInstallations } from '@/components/CanvasTileInstallationsProvider';
import { parseTileDefinition, type TileDefinition } from '@/tiles/definition';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import type { TileKindConflictMode } from '@/contexts/AppContext';

/**
 * How tile-claimed kinds interact with kinds Ditto already renders natively.
 * See {@link TileKindConflictMode} in AppContext for the mode semantics.
 */

/**
 * Collect the set of event kinds claimed by installed tile definitions via
 * `render` entries with `inFeed: true`.
 *
 * Pure function — does not access localStorage, Nostr, or React.
 *
 * @param definitions  Parsed tile definitions from installed tiles.
 * @param nativeKinds  Set of kind numbers Ditto already renders natively.
 * @param mode         Conflict-resolution mode.
 * @returns            Deduplicated array of kind numbers.
 */
export function getTileFeedKinds(
  definitions: TileDefinition[],
  nativeKinds: ReadonlySet<number>,
  mode: TileKindConflictMode,
): number[] {
  const claimed = new Set<number>();

  for (const tile of definitions) {
    const render = tile.render;
    if (!render?.inFeed) continue;
    const kinds = render.filter.kinds;
    if (!kinds?.length) continue;
    for (const k of kinds) {
      claimed.add(k);
    }
  }

  if (mode === 'native-only') {
    for (const nat of nativeKinds) {
      claimed.delete(nat);
    }
  }

  return [...claimed];
}

/** Extract every kind number covered by EXTRA_KINDS (Ditto's native renderers). */
function getNativeKinds(): ReadonlySet<number> {
  const native = new Set<number>();
  for (const def of EXTRA_KINDS) {
    native.add(def.kind);
    for (const k of def.extraFeedKinds ?? []) native.add(k);
    for (const sub of def.subKinds ?? []) {
      native.add(sub.kind);
      for (const k of sub.extraFeedKinds ?? []) native.add(k);
    }
  }
  return native;
}

/** Cached so repeated hook calls share the same set instance. */
const _nativeKinds = getNativeKinds();

/**
 * React hook: tile-claimed feed kinds ready to merge into feed queries.
 *
 * Uses the installed-tile coordinates from AppConfig, fetches cached
 * definitions through the CanvasTileInstallations instance, and applies
 * the `tileKindConflictMode` setting. Returns `[]` when:
 * - `feedIncludeTiles` is off,
 * - Canvas runtime is not active (no provider), or
 * - no installed tiles declare `render` entries with `inFeed: true`.
 */
export function useTileFeedKinds(): number[] {
  const { config } = useAppContext();
  const installations = useOptionalCanvasTileInstallations();
  const mode = config.tileKindConflictMode ?? 'native-only';

  return useMemo(() => {
    if (!config.feedSettings.feedIncludeTiles) return [];
    if (!installations) return [];

    const definitions: TileDefinition[] = [];
    for (const coordinate of config.installedCanvasTiles) {
      const event = installations.getCachedDefinition(coordinate);
      if (!event) continue;
      const def = parseTileDefinition(event);
      if (def) definitions.push(def);
    }

    return getTileFeedKinds(definitions, _nativeKinds, mode);
  }, [config.feedSettings.feedIncludeTiles, config.installedCanvasTiles, config.tileKindConflictMode, installations]);
}
