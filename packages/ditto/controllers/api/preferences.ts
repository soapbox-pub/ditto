import { AppController } from '@/app.ts';

/**
 * Return a default set of preferences for compatibilty purposes.
 * Clients like Soapbox do not use this.
 *
 * https://docs.joinmastodon.org/methods/preferences/
 */
const preferencesController: AppController = (c) => {
  return c.json({
    'posting:default:visibility': 'public',
    'posting:default:sensitive': false,
    'posting:default:language': null,
    'reading:expand:media': 'default',
    'reading:expand:spoilers': false,
  });
};

export { preferencesController };
