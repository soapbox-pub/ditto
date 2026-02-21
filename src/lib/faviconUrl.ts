import UriTemplate from 'uri-templates';

export interface TemplateUrlOpts {
  template: string;
  url: string | URL;
}

/**
 * Fill a URI template with parts of the given URL.
 * Supports RFC 6570 variables: {url}, {href}, {origin}, {hostname}, etc.
 */
export function templateUrl(opts: TemplateUrlOpts): string {
  const u = new URL(opts.url);

  return UriTemplate(opts.template).fill({
    url: u.href,
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

/** @deprecated Use `templateUrl` instead. */
export type FaviconUrlOpts = TemplateUrlOpts;

/**
 * Generate a favicon URL from a template and input URL.
 * @deprecated Use `templateUrl` instead.
 */
export function faviconUrl(opts: FaviconUrlOpts): string {
  return templateUrl(opts);
}
