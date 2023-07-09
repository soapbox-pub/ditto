import { Conf } from '@/config.ts';

import type { AppController } from '@/app.ts';

/** https://datatracker.ietf.org/doc/html/rfc6415 */
const hostMetaController: AppController = (c) => {
  const template = Conf.local('/.well-known/webfinger?resource={uri}');

  c.header('content-type', 'application/xrd+xml');

  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>
<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">
  <Link rel="lrdd" template="${template}" type="application/xrd+xml" />
</XRD>
`,
  );
};

export { hostMetaController };
