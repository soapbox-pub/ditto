/**
 * Default URI templates for ditto-server's API, and the migration off the
 * origin it used to share with the app.
 */

/** Default template for fetching a site's favicon. */
export const DEFAULT_FAVICON_URL = 'https://api.ditto.pub/favicon/{hostname}';

/** Default template for fetching a link preview. Returns OEmbed JSON. */
export const DEFAULT_LINK_PREVIEW_URL = 'https://api.ditto.pub/link-preview/{url}';

/**
 * Templates shipped by earlier releases, mapped to their replacements.
 *
 * ditto-server's API used to be served same-origin from `ditto.pub/api/*`.
 * Ditto is meant to be self-contained — no same-origin request except to its
 * own assets and its service worker — so the API moved to a host of its own.
 * The old paths still answer, but only for the cutover.
 *
 * Changing the defaults alone would move nobody. Both settings persist per
 * account in localStorage and sync through the user's encrypted settings
 * event, so any account that has ever run an older build carries the old value
 * and writes it back over the new default on every login. Rewriting a value
 * that is still exactly a superseded default is what finishes the move. A
 * value the user actually chose — or that a fork set in its `ditto.json` — is
 * not a key here and is left alone.
 */
const SUPERSEDED_URLS: Readonly<Record<string, string>> = {
  'https://ditto.pub/api/favicon/{hostname}': DEFAULT_FAVICON_URL,
  'https://ditto.pub/api/link-preview/{url}': DEFAULT_LINK_PREVIEW_URL,
};

/** Replace a superseded default API template, or return the URL unchanged. */
export function migrateApiUrl(url: string): string {
  return SUPERSEDED_URLS[url] ?? url;
}
