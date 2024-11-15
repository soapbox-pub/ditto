import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { PleromaConfigDB } from '@/utils/PleromaConfigDB.ts';
import { Storages } from '@/storages.ts';
import { getPleromaConfigs } from '@/utils/pleroma.ts';

let configDBCache: Promise<PleromaConfigDB> | undefined;

export const cspMiddleware = (): AppMiddleware => {
  return async (c, next) => {
    const store = await Storages.db();

    if (!configDBCache) {
      configDBCache = getPleromaConfigs(store);
    }

    const { host, protocol, origin } = Conf.url;
    const wsProtocol = protocol === 'http:' ? 'ws:' : 'wss:';
    const configDB = await configDBCache;
    const sentryDsn = configDB.getIn(':pleroma', ':frontend_configurations', ':soapbox_fe', 'sentryDsn');

    const policies = [
      'upgrade-insecure-requests',
      `script-src 'self'`,
      `connect-src 'self' blob: ${origin} ${wsProtocol}//${host}` + typeof sentryDsn === 'string'
        ? ` ${sentryDsn}`
        : '',
      `media-src 'self' https:`,
      `img-src 'self' data: blob: https:`,
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
