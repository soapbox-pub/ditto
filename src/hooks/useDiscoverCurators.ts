import { useMemo } from 'react';

import { useAppContext } from './useAppContext';
import { parseCurators, type DiscoverCurator } from '@/lib/discoverCurators';

/** The curators in effect: the user's own, else this build's. */
export function useDiscoverCurators(): DiscoverCurator[] {
  const { config } = useAppContext();
  const entries = config.curators ?? config.defaultCurators;
  return useMemo(() => parseCurators(entries), [entries]);
}
