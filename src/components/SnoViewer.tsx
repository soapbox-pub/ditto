import { useCallback } from 'react';

import { ModelScene, type ModelLoader } from '@/components/ModelViewer';
import type { SnoNode } from '@/hooks/useSnoTree';
import { buildSnoObject } from '@/lib/snoRenderer';

/** Interactive view of a Simple Nostr Object. Loaded on demand, with three.js. */
export default function SnoViewer({ root }: { root: SnoNode }) {
  const load = useCallback<ModelLoader>(async () => buildSnoObject(root), [root]);
  return <ModelScene load={load} />;
}
