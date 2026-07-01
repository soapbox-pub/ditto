/**
 * Compatibility shim.
 *
 * The canonical definitions moved to `@blobbi/core/types/shop` as part of the
 * @blobbi/core extraction. This module re-exports them so existing import paths
 * (`@/blobbi/shop/types/shop.types`) keep working during the migration.
 *
 * Note: only the pure shop *type* definitions moved. Runtime shop catalog data
 * remains in `@/blobbi/shop/lib/blobbi-shop-items`.
 *
 * TODO(blobbi-core): migrate importers to `@blobbi/core` and remove this shim in
 * a later validation cycle.
 */

export * from '@blobbi/core/types/shop';
