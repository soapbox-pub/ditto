import UriTemplate from 'uri-templates';

export interface FaviconUrlOpts {
  template: string;
  url: string | URL;
}

/**
 * Generate a favicon URL from a template and input URL
 * @param opts - Options object
 * @param opts.template - URL template with placeholders like {hostname}, {origin}, etc.
 * @param opts.url - The URL to extract parts from
 * @returns The hydrated favicon URL
 */
export function faviconUrl(opts: FaviconUrlOpts): string {
  const u = new URL(opts.url);

  return UriTemplate(opts.template).fill({
    href: u.href,
    origin: u.origin,
    protocol: u.protocol,
    username: u.username,
    password: u.password,
    host: u.host,
    hostname: u.hostname,
    port: u.port,
    pathname: u.pathname,
    hash: u.hash,
    search: u.search,
  });
}
