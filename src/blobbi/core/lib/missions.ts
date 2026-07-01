/**
 * Compatibility shim.
 *
 * The canonical implementation moved to `@blobbi/core/missions` as part of the
 * @blobbi/core extraction. This module re-exports it so existing import paths
 * (`@/blobbi/core/lib/missions` and sibling relative `./missions`) keep working
 * during the migration.
 *
 * TODO(blobbi-core): migrate importers to `@blobbi/core` and remove this shim in
 * a later validation cycle.
 */

export * from '@blobbi/core/missions';
