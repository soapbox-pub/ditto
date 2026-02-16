import { ReactNode } from 'react';
import { useNWCInternal as useNWCHook } from '@/hooks/useNWC';
import { NWCContext } from '@/hooks/useNWCContext';

export function NWCProvider({ children }: { children: ReactNode }) {
  const nwc = useNWCHook();
  return <NWCContext.Provider value={nwc}>{children}</NWCContext.Provider>;
}