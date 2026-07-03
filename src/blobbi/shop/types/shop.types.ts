/**
 * Compatibility shim.
 *
 * The canonical definitions moved to `@blobbi-kit/core/types/shop` as part of the
 * @blobbi-kit/core extraction. This module re-exports them so existing import paths
 * (`@/blobbi/shop/types/shop.types`) keep working during the migration.
 *
 * Note: only the pure shop *type* definitions moved. Runtime shop catalog data
 * remains in `@/blobbi/shop/lib/blobbi-shop-items`.
 *
 * TODO(blobbi-core): migrate importers to `@blobbi-kit/core` and remove this shim in
 * a later validation cycle.
 */

export * from '@blobbi-kit/core/types/shop';
