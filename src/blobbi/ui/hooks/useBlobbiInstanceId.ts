import { useId } from 'react';

/**
 * Generate a unique ID per component instance so that clip-path and gradient
 * IDs don't collide when the same Blobbi is rendered in multiple places at
 * once (e.g. hero + drawer grid, hero + floating companion, feed card + companion).
 *
 * React's useId() returns strings like ":r0:" — strip non-alphanumeric chars
 * to produce valid SVG ID characters.
 */
export function useBlobbiInstanceId(blobbiId: string): string {
  const reactId = useId();
  return `${blobbiId}-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
}
