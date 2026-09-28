import { useSyncExternalStore } from 'react';

import { isBackgroundQuiet, onBackgroundQuiet } from '@/lib/backgroundQuiet';

/** Whether the app is backgrounded and quiet (see `@/lib/backgroundQuiet`). */
export function useBackgroundQuiet(): boolean {
  return useSyncExternalStore(onBackgroundQuiet, isBackgroundQuiet, () => false);
}
