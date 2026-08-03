/**
 * Prefixes a root-relative public asset path (e.g. "/logo.svg") with the
 * build's base URL, so it resolves under non-root deployments like GitHub
 * Pages (`/ditto/`) instead of resolving against the domain root.
 *
 * `import.meta.env.BASE_URL` normally carries a trailing slash (Vite's own
 * default), but it is not guaranteed to: a deploy pipeline can override
 * `base` via the CLI (e.g. `--base="$COMPUTED_PATH"`) with a value that
 * omits it. Strip any trailing slash from the base and always join with
 * exactly one, so the result is correct either way.
 */
export function publicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}
