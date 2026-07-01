/**
 * Compatibility shim.
 *
 * The canonical implementation moved to `@blobbi/core/blobbi-decay` as part of
 * the @blobbi/core extraction. This module re-exports it so existing import
 * paths (`@/blobbi/core/lib/blobbi-decay` and sibling relative `./blobbi-decay`)
 * keep working during the migration.
 *
 * TODO(blobbi-core): migrate importers to `@blobbi/core` and remove this shim in
 * a later validation cycle.
 */

export * from '@blobbi/core/blobbi-decay';
