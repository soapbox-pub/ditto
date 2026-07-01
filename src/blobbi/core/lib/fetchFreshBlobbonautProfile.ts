/**
 * Compatibility shim.
 *
 * The canonical implementation moved to
 * `@blobbi/core/fetchFreshBlobbonautProfile` as part of the @blobbi/core
 * extraction. This module re-exports it so existing import paths
 * (`@/blobbi/core/lib/fetchFreshBlobbonautProfile` and sibling relative
 * `./fetchFreshBlobbonautProfile`) keep working during the migration.
 *
 * TODO(blobbi-core): migrate importers to `@blobbi/core` and remove this shim in
 * a later validation cycle.
 */

export * from '@blobbi/core/fetchFreshBlobbonautProfile';
