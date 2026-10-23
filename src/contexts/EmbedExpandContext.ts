import { createContext } from 'react';

/**
 * Lets an embedded quote tell the post around it that it was expanded with
 * "Read more", so the post doesn't treat the growth as its own overflow and
 * clip the quote it just opened.
 */
export const EmbedExpandContext = createContext<(() => void) | undefined>(undefined);
