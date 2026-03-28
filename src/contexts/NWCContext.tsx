import { ReactNode } from 'react';
import { useNWCInternal as useNWCHook } from '@/hooks/useNWC';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { NWCContext } from '@/hooks/useNWCContext';

export function NWCProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const nwc = useNWCHook(user?.pubkey);
  return <NWCContext.Provider value={nwc}>{children}</NWCContext.Provider>;
}