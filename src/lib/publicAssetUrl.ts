/**
 * Prefixes a root-relative public asset path (e.g. "/logo.svg") with the
 * build's base URL, so it resolves under non-root deployments like GitHub
 * Pages (`/ditto/`) instead of resolving against the domain root.
 */
export function publicAssetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
