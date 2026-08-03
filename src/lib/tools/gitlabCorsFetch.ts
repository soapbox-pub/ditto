/**
 * Wrap fetch so raw-file URLs for the nostr-canvas repo hit GitLab's API v4
 * endpoint instead of the `/-/raw/` endpoint. The raw endpoint sends no CORS
 * headers, so browser fetches fail; the API endpoint sends
 * `Access-Control-Allow-Origin: *`.
 */

const RAW_FILE_URL_PATTERN =
  /^https:\/\/gitlab\.com\/soapbox-pub\/nostr-canvas\/-\/raw\/([^/]+)\/(.+)$/;

function rewriteGitLabRawUrl(url: string): string {
  const match = RAW_FILE_URL_PATTERN.exec(url);
  if (!match) return url;
  const [, ref, path] = match;
  // GitLab's API takes the whole file path as one URL-encoded segment.
  return `https://gitlab.com/api/v4/projects/soapbox-pub%2Fnostr-canvas/repository/files/${encodeURIComponent(path)}/raw?ref=${ref}`;
}

export function createCorsFriendlyGitLabFetch(delegate: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? rewriteGitLabRawUrl(input) : input;
    return init === undefined ? delegate(url) : delegate(url, init);
  };
}
