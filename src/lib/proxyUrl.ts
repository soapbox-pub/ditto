import { fillUriTemplate } from '@/lib/uriTemplate';

export interface ProxyUrlOpts {
  template: string;
  url: string | URL;
}

export function proxyUrl(opts: ProxyUrlOpts): string {
  const u = new URL(opts.url);
  return fillUriTemplate(opts.template, {
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