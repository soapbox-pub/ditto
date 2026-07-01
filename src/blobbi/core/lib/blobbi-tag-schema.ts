/**
 * Compatibility shim.
 *
 * The canonical implementation moved to `@blobbi/core/blobbi-tag-schema` as part
 * of the @blobbi/core extraction. This module re-exports it so existing import
 * paths (`@/blobbi/core/lib/blobbi-tag-schema` and sibling relative
 * `./blobbi-tag-schema`) keep working during the migration.
 *
 * TODO(blobbi-core): migrate importers to `@blobbi/core` and remove this shim in
 * a later validation cycle.
 */

export * from '@blobbi/core/blobbi-tag-schema';
