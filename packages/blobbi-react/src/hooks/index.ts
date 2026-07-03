/**
 * @blobbi/react public hooks.
 *
 * App-agnostic React hooks built on @blobbi/core, React, TanStack Query, and
 * Nostrify. Many rely on a `window`-based `daily-missions-updated` event bus and
 * `document.visibilityState`; they are DOM-only and run in browser hosts.
 *
 * Collision handling (avoids TS2308 against sibling modules and the `lib`
 * barrel): `useHatchTasks` is treated as the canonical source of `TaskType` and
 * `filterPersistentTasks`; `useActiveTaskProcess` re-exports its own
 * `filterPersistentTasks` under the alias `filterPersistentTasksFromProcess`
 * (matching Ditto's existing convention); `useEvolveTasks` re-exports only its
 * unique members (the mission constants and `EvolveTask` alias live on their
 * canonical source, `@blobbi/react/lib`).
 */

export * from './useAwardDailyXp';
export * from './useBlobbiActivityHistory';
export * from './useBlobbiCareActivity';
export * from './useBlobbiEvolve';
export * from './useBlobbiIncubation';
export * from './useBlobbiInteractions';
export * from './useBlobbisCollection';
export * from './useCanonicalSync';
export * from './useDailyMissions';
export * from './useFreshBlobbiBeforeAction';
export * from './useItemCooldown';
export * from './usePersistDailyProgress';
export * from './usePersistEvolutionProgress';
export * from './useProjectedBlobbiState';
export * from './useRerollMission';

// Canonical source of `TaskType`, `HatchTask`, `filterPersistentTasks`, and the
// hatch KIND_* constants. `HATCH_REQUIRED_INTERACTIONS` is intentionally NOT
// re-exported here — its canonical home is `@blobbi/react/lib` (via
// `evolution-missions`), and re-exporting it from two `export *` barrels would
// make TypeScript silently drop the name from the merged root barrel.
export {
  useHatchTasks,
  filterPersistentTasks,
  REQUIRED_INTERACTIONS,
  KIND_THEME_DEFINITION,
  KIND_COLOR_MOMENT,
  KIND_PROFILE_METADATA,
  type TaskType,
  type HatchTask,
  type HatchTasksResult,
} from './useHatchTasks';

// `useActiveTaskProcess` also exports a `filterPersistentTasks`; alias it to
// avoid colliding with the canonical one from `useHatchTasks`.
export {
  useActiveTaskProcess,
  filterDynamicTasks,
  filterPersistentTasks as filterPersistentTasksFromProcess,
  type TaskProcessType,
  type TaskProcessConfig,
  type ActiveTaskProcessResult,
} from './useActiveTaskProcess';

// `useEvolveTasks` re-exports `TaskType` and the `EVOLVE_*` mission constants
// from their canonical sources; expose only its unique members here.
export {
  useEvolveTasks,
  KIND_PROFILE_TABS,
  type EvolveTasksResult,
} from './useEvolveTasks';
export type { EvolveTask } from './useEvolveTasks';
