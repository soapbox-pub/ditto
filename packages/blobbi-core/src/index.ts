/**
 * @blobbi/core — portable, framework-agnostic core domain logic for Blobbi.
 *
 * This is the public package barrel. Everything re-exported here is considered
 * stable public API. Deep imports (`@blobbi/core/*`) remain supported for now,
 * but new consumers should prefer the root barrel.
 *
 * DOM-free: this package makes no browser assumptions and can run in Node,
 * React Native, or tests without a DOM.
 *
 * Note on `./types/*`: the modules under `./types` define a parallel type
 * system (`Blobbi`, `BlobbiStats`, `BlobbiVisualTraits`, `AdultForm`, …) whose
 * names deliberately overlap with the runtime domain module (`./blobbi`). To
 * avoid TS2308 duplicate-export collisions, they are re-exported here under
 * namespaces (`BlobbiTypes`, `AdultTypes`, `ShopTypes`). Consumers that need the
 * flat names continue to deep-import `@blobbi/core/types/blobbi` etc.
 */

// Logger (package-safe, no-op by default; host apps can inject their own).
export { blobbiLogger, setBlobbiLogger, type BlobbiLogger } from './logger';

// Core domain: kinds, addressing, seed/identity, parsing, tag merging, caching.
export * from './blobbi';

// Behavioral / pure-logic modules (no name collisions with `./blobbi`).
export * from './blobbi-decay';
export * from './blobbi-segments';
export * from './blobbi-social-projection';
export * from './blobbi-interaction';
export * from './missions';
export * from './progression';
export * from './color-guardrails';

// Async Nostr helpers.
export * from './fetchFreshEvent';
export * from './fetchFreshBlobbonautProfile';

// Alternate type system, namespaced to avoid colliding with `./blobbi`.
export * as BlobbiTypes from './types/blobbi';
export * as AdultTypes from './types/adult';
export * as ShopTypes from './types/shop';
