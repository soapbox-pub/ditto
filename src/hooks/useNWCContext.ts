import { useContext } from 'react';
import { createContext } from 'react';
import { useNWCInternal } from '@/hooks/useNWC';

type NWCContextType = ReturnType<typeof useNWCInternal>;

export const NWCContext = createContext<NWCContextType | null>(null);

export function useNWC(): NWCContextType {
  const context = useContext(NWCContext);
  if (!context) {
    throw new Error('useNWC must be used within a NWCProvider');
  }
  return context;
}