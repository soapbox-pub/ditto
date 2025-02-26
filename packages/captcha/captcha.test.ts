import { getCaptchaImages } from './assets.ts';
import { generateCaptcha, verifyCaptchaSolution } from './captcha.ts';

Deno.test('generateCaptcha', async () => {
  const images = await getCaptchaImages();
  generateCaptcha(images, { w: 370, h: 400 }, { w: 65, h: 65 });
});

Deno.test('verifyCaptchaSolution', () => {
  verifyCaptchaSolution({ w: 65, h: 65 }, { x: 0, y: 0 }, { x: 0, y: 0 });
  verifyCaptchaSolution({ w: 65, h: 65 }, { x: 0, y: 0 }, { x: 10, y: 10 });
});
