import { useCallback, useRef } from 'react';
import { useDeckNavigation } from '@/components/deck/DeckNavigationContext';

interface DeckLinkInterceptorProps {
  children: React.ReactNode;
}

/**
 * Wraps deck column content and intercepts clicks on internal links.
 * - `/t/:tag` links → open a hashtag deck column
 * - `/i/:uri` links → open a discuss deck column
 * - `/feed/:domain` links → open a domain community feed deck column
 *
 * Uses the **capture phase** so clicks are intercepted before child
 * `stopPropagation()` calls (e.g. NIP-05 badges, NoteCard links) can
 * swallow the event.
 */
export function DeckLinkInterceptor({ children }: DeckLinkInterceptorProps) {
  const deckNav = useDeckNavigation();
  const ref = useRef<HTMLDivElement>(null);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (!deckNav) return;

    // Walk up from the click target to find the nearest <a> element
    let target = e.target as HTMLElement | null;
    while (target && target !== ref.current) {
      if (target.tagName === 'A') {
        const href = (target as HTMLAnchorElement).getAttribute('href');
        if (!href) break;

        // Match hashtag links: /t/:tag
        const hashtagMatch = href.match(/^\/t\/(.+)$/);
        if (hashtagMatch) {
          e.preventDefault();
          e.stopPropagation();
          deckNav.openHashtag(decodeURIComponent(hashtagMatch[1]));
          return;
        }

        // Match discuss links: /i/:uri
        const discussMatch = href.match(/^\/i\/(.+)$/);
        if (discussMatch) {
          e.preventDefault();
          e.stopPropagation();
          deckNav.openDiscuss(decodeURIComponent(discussMatch[1]));
          return;
        }

        // Match domain feed links: /feed/:domain
        const domainMatch = href.match(/^\/feed\/([^/]+)$/);
        if (domainMatch) {
          e.preventDefault();
          e.stopPropagation();
          deckNav.openDomainFeed(decodeURIComponent(domainMatch[1]));
          return;
        }

        // Don't intercept other internal or external links
        break;
      }
      target = target.parentElement;
    }
  }, [deckNav]);

  return (
    <div ref={ref} onClickCapture={handleClickCapture}>
      {children}
    </div>
  );
}
