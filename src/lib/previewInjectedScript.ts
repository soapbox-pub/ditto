/**
 * Script injected into preview iframe HTML responses.
 *
 * The sandbox frame loads the inner iframe at `/index.html`. This script
 * normalises the path to `/` before any SPA router initialises, so
 * React Router etc. see the correct path.
 */
export function getPreviewInjectedScript(): string {
  return `(function() {
  'use strict';
  if (window.location.pathname === '/index.html') {
    history.replaceState(null, '', '/');
  }
})();`;
}
