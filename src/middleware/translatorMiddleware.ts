import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { fetchWorker } from '@/workers/fetch.ts';
import { DeepLTranslator } from '@/translators/DeepLTranslator.ts';
import { LibreTranslateTranslator } from '@/translators/LibreTranslateTranslator.ts';

/** Set the translator used for translating posts. */
export const translatorMiddleware: AppMiddleware = async (c, next) => {
  switch (Conf.translationProvider) {
    case 'deepl': {
      const { deeplApiKey: apiKey, deeplBaseUrl: baseUrl } = Conf;
      if (apiKey) {
        c.set('translator', new DeepLTranslator({ baseUrl, apiKey, fetch: fetchWorker }));
      }
      break;
    }

    case 'libretranslate': {
      const { libretranslateApiKey: apiKey, libretranslateBaseUrl: baseUrl } = Conf;
      if (apiKey) {
        c.set('translator', new LibreTranslateTranslator({ baseUrl, apiKey, fetch: fetchWorker }));
      }
      break;
    }
  }

  await next();
};
