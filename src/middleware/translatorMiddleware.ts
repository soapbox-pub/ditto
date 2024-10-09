import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { fetchWorker } from '@/workers/fetch.ts';
import { DeepLTranslator } from '@/translators/DeepLTranslator.ts';
import { LibreTranslateTranslator } from '@/translators/LibreTranslateTranslator.ts';

/** Set the translator used for translating posts. */
export const translatorMiddleware: AppMiddleware = async (c, next) => {
  const deepLendpoint = Conf.deepLendpoint;
  const deepLapiKey = Conf.deepLapiKey;
  const libreTranslateEndpoint = Conf.libreTranslateEndpoint;
  const libreTranslateApiKey = Conf.libreTranslateApiKey;
  const translationProvider = Conf.translationProvider;

  switch (translationProvider) {
    case 'deepl':
      if (deepLapiKey) {
        c.set(
          'translator',
          new DeepLTranslator({ endpoint: deepLendpoint, apiKey: deepLapiKey, fetch: fetchWorker }),
        );
      }
      break;
    case 'libretranslate':
      if (libreTranslateApiKey) {
        c.set(
          'translator',
          new LibreTranslateTranslator({
            endpoint: libreTranslateEndpoint,
            apiKey: libreTranslateApiKey,
            fetch: fetchWorker,
          }),
        );
      }
      break;
  }

  await next();
};
