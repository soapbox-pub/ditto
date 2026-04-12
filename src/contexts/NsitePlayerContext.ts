import { createContext, useContext } from 'react';

/**
 * Tracks which nsite (by subdomain) currently has its player open.
 * Used by the sidebar to highlight the active nsite item, and by
 * NsiteCard to register/unregister the open player.
 */
export interface NsitePlayerState {
  /** The subdomain of the currently-open nsite player, or null. */
  activeSubdomain: string | null;
  /** Set the active nsite subdomain (call with null to clear). */
  setActiveSubdomain: (subdomain: string | null) => void;
}

export const NsitePlayerContext = createContext<NsitePlayerState>({
  activeSubdomain: null,
  setActiveSubdomain: () => {},
});

/** Hook to read/write the active nsite player subdomain. */
export function useNsitePlayer(): NsitePlayerState {
  return useContext(NsitePlayerContext);
}
