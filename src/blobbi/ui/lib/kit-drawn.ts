/**
 * Which Blobbis `@blobbi-kit/renderer` draws for Ditto (BlobbiV3Visual), and
 * which keep Ditto's own pipeline.
 *
 * - V3, at every stage: the whole drawing is procedural and the kit's.
 * - V2 babies and adults: the V2 artwork is the kit's, and Ditto has none of
 *   its own. Ditto never created a V2 Blobbi; one that reaches it was born in
 *   Blobbi Island or Standalone, where the kit draws it, so this is the same
 *   Blobbi they show rather than Ditto's V1 form of the same adult type.
 * - V2 eggs stay Ditto's: for V1 and V2 the kit's egg is the one egg art
 *   Ditto already draws itself, with the hatching tour on it.
 * - V1 keeps Ditto's own pipeline (body engine, recipes, eye animation).
 */
export function isKitDrawn(blobbi: { visualGeneration?: string; stage: string }): boolean {
  if (blobbi.visualGeneration === 'v3') return true;
  return blobbi.visualGeneration === 'v2' && blobbi.stage !== 'egg';
}
