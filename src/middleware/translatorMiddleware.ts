import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { fetchWorker } from '@/workers/fetch.ts';
import { DeepLTranslator } from '@/translators/DeepLTranslator.ts';
import { LibreTranslateTranslator } from '@/translators/LibreTranslateTranslator.ts';

/** Set the translator used for translating posts. */
export const translatorMiddleware: AppMiddleware = async (c, next) => {
  const endpoint = Conf.translationProviderEndpoint;
  const apiKey = Conf.translationProviderApiKey;
  const translationProvider = Conf.translationProvider;

  switch (translationProvider) {
    case 'DeepL'.toLowerCase():
      if (apiKey) {
        c.set(
          'translator',
          new DeepLTranslator({ endpoint, apiKey, fetch: fetchWorker }),
        );
      }
      break;
    case 'Libretranslate'.toLowerCase():
      if (apiKey) {
        c.set(
          'translator',
          new LibreTranslateTranslator({ endpoint, apiKey, fetch: fetchWorker }),
        );
      }
      break;
  }

  await next();
};
