import { createContext, useContext } from 'react';

export interface DeckNavigationContextType {
  /** Open a hashtag as a new deck column. */
  openHashtag: (tag: string) => void;
  /** Open external content discussion as a new deck column. */
  openDiscuss: (uri: string) => void;
  /** Open a domain community feed as a new deck column. */
  openDomainFeed: (domain: string) => void;
}

export const DeckNavigationContext = createContext<DeckNavigationContextType | null>(null);

/** Returns deck navigation helpers, or null if not in a deck column. */
export function useDeckNavigation(): DeckNavigationContextType | null {
  return useContext(DeckNavigationContext);
}
