/**
 * Compatibility shim.
 *
 * The canonical definitions moved to `@blobbi-kit/core/types/blobbi` as part of the
 * @blobbi-kit/core extraction. This module re-exports them so existing import paths
 * (`@/blobbi/core/types/blobbi`) keep working during the migration.
 *
 * TODO(blobbi-core): migrate importers to `@blobbi-kit/core` and remove this shim in
 * a later validation cycle.
 */

export * from '@blobbi-kit/core/types/blobbi';
