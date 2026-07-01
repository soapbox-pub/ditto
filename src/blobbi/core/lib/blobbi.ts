/**
 * Compatibility shim.
 *
 * The canonical implementation moved to `@blobbi/core/blobbi` as part of the
 * @blobbi/core extraction. This module re-exports it so existing import paths
 * (`@/blobbi/core/lib/blobbi` and sibling relative `./blobbi`) keep working
 * during the migration.
 *
 * TODO(blobbi-core): migrate importers to `@blobbi/core` and remove this shim in
 * a later validation cycle.
 */

export * from '@blobbi/core/blobbi';
