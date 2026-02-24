import UriTemplate from 'uri-templates';

export interface ProxyUrlOpts {
  template: string;
  url: string | URL;
}

export function proxyUrl(opts: ProxyUrlOpts): string {
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