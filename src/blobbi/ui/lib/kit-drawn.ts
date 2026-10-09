/**
 * Which Blobbis `@blobbi-kit/renderer` draws for Ditto (BlobbiV3Visual), and
 * which keep Ditto's own pipeline.
 *
 * - V3, at every stage: the whole drawing is procedural and the kit's.
 * - V2 adults: the V2 adult is the kit's one canonical body, and Ditto has no
 *   art for it. Ditto never created a V2 Blobbi; one that reaches it was born
 *   in Blobbi Island or Standalone, where the kit draws it, so this is the
 *   same Blobbi they show rather than Ditto's V1 form of the same adult type.
 * - V2 eggs and babies stay Ditto's: the kit has no V2 egg or baby art and
 *   draws both with the V1 art, which is the art Ditto already draws itself,
 *   with the hatching tour, blink and body effects on it.
 * - V1 keeps Ditto's own pipeline (body engine, recipes, eye animation).
 */
export function isKitDrawn(blobbi: { visualGeneration?: string; stage: string }): boolean {
  if (blobbi.visualGeneration === 'v3') return true;
  return blobbi.visualGeneration === 'v2' && blobbi.stage === 'adult';
}
