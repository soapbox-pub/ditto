import { Conf } from '@/config.ts';

import type { AppController } from '@/app.ts';

/** Landing page controller. */
const indexController: AppController = (c) => {
  const { origin } = Conf.url;

  return c.text(`Please connect with a Mastodon client:

    ${origin}

Ditto <https://gitlab.com/soapbox-pub/ditto>
`);
};

export { indexController };
