/**
 * Compatibility shim.
 *
 * The canonical definitions moved to `@blobbi/core/types/blobbi` as part of the
 * @blobbi/core extraction. This module re-exports them so existing import paths
 * (`@/blobbi/core/types/blobbi`) keep working during the migration.
 *
 * TODO(blobbi-core): migrate importers to `@blobbi/core` and remove this shim in
 * a later validation cycle.
 */

export * from '@blobbi/core/types/blobbi.ts';
