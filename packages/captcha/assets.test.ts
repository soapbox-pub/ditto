import { assert } from '@std/assert';

import { getCaptchaImages } from './assets.ts';

Deno.test('getCaptchaImages', async () => {
  // If this function runs at all, it most likely worked.
  const { bgImages } = await getCaptchaImages();
  assert(bgImages.length);
});
