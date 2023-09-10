import { Conf } from '@/config.ts';

/** Ensure the media URL is not on the same host as the local domain. */
function checkMediaHost() {
  const { url, mediaDomain } = Conf;
  const mediaUrl = new URL(mediaDomain);

  if (url.host === mediaUrl.host) {
    throw new PrecheckError('For security reasons, MEDIA_DOMAIN cannot be on the same host as LOCAL_DOMAIN.');
  }
}

/** Error class for precheck errors. */
class PrecheckError extends Error {
  constructor(message: string) {
    super(`${message}\nTo disable this check, set DITTO_PRECHECK="false"`);
  }
}

if (Deno.env.get('DITTO_PRECHECK') !== 'false') {
  checkMediaHost();
}
