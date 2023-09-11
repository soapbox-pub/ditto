import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';

const csp = (): AppMiddleware => {
  return async (c, next) => {
    const { host, protocol } = Conf.url;
    const wsProtocol = protocol === 'http:' ? 'ws:' : 'wss:';

    const policies = [
      'upgrade-insecure-requests',
      `script-src 'self'`,
      `connect-src 'self' blob: ${Conf.localDomain} ${wsProtocol}//${host}`,
      `media-src 'self' ${Conf.mediaDomain}`,
      `img-src 'self' data: blob: ${Conf.mediaDomain}`,
      `default-src 'none'`,
      `base-uri 'self'`,
      `frame-ancestors 'none'`,
      `style-src 'self' 'unsafe-inline'`,
      `font-src 'self'`,
      `manifest-src 'self'`,
      `frame-src 'self' https:`,
    ];

    c.res.headers.set('content-security-policy', policies.join('; '));

    await next();
  };
};

export { csp };
