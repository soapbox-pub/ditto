import { safeFetch } from '@soapbox/safe-fetch';

import { AppMiddleware } from '@/app.ts';
import { DeepLTranslator } from '@/translators/DeepLTranslator.ts';
import { LibreTranslateTranslator } from '@/translators/LibreTranslateTranslator.ts';

/** Set the translator used for translating posts. */
export const translatorMiddleware: AppMiddleware = async (c, next) => {
  const { conf } = c.var;

  switch (conf.translationProvider) {
    case 'deepl': {
      const { deeplApiKey: apiKey, deeplBaseUrl: baseUrl } = conf;
      if (apiKey) {
        c.set('translator', new DeepLTranslator({ baseUrl, apiKey, fetch: safeFetch }));
      }
      break;
    }

    case 'libretranslate': {
      const { libretranslateApiKey: apiKey, libretranslateBaseUrl: baseUrl } = conf;
      if (apiKey) {
        c.set('translator', new LibreTranslateTranslator({ baseUrl, apiKey, fetch: safeFetch }));
      }
      break;
    }
  }

  await next();
};
