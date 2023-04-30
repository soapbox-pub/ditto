import { LOCAL_DOMAIN } from '@/config.ts';

import type { AppController } from '@/app.ts';

/** Landing page controller. */
const indexController: AppController = (c) => {
  return c.text(`Please connect with a Mastodon client:

    ${LOCAL_DOMAIN}

Ditto <https://gitlab.com/soapbox-pub/ditto>
`);
};

export { indexController };
