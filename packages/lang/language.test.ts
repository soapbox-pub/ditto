import { assertEquals } from '@std/assert';

import { detectLanguage } from './language.ts';

Deno.test('Detect English language', () => {
  assertEquals(detectLanguage(``, 0.90), undefined);
  assertEquals(detectLanguage(`Good morning my fellow friends`, 0.90), 'en');
  assertEquals(
    detectLanguage(
      `Would you listen to Michael Jackson's songs?\n\nnostr:nevent1qvzqqqqqqypzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqyvhwumn8ghj7cm0vfexzen4d4sjucm0d5hhyetvv9usqg8htx8xcjq7ffrzxu7nrhlr8vljcv6gpmet0auy87mpj6djxk4myqha02kp`,
      0.90,
    ),
    'en',
  );
  assertEquals(
    detectLanguage(
      `https://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uWould you listen to Michael Jackson's songs?\n\nnostr:nevent1qvzqqqqqqypzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqyvhwumn8ghj7cm0vfexzen4d4sjucm0d5hhyetvv9usqg8htx8xcjq7ffrzxu7nrhlr8vljcv6gpmet0auy87mpj6djxk4myqha02kp`,
      0.90,
    ),
    'en',
  );
  assertEquals(
    detectLanguage(
      `https://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_u 😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎😂💯♡⌨︎    https://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_uhttps://youtu.be/FxppefYTA2I?si=grgEpbEhFu_-3V_u Would you listen to Michael Jackson's songs?\n\nnostr:nevent1qvzqqqqqqypzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqyvhwumn8ghj7cm0vfexzen4d4sjucm0d5hhyetvv9usqg8htx8xcjq7ffrzxu7nrhlr8vljcv6gpmet0auy87mpj6djxk4myqha02kp`,
      0.90,
    ),
    'en',
  );
});

Deno.test('Detects definitive texts', () => {
  // NOTE: pass `1` as min confidence to test only the definitive patterns

  // unambiguous
  assertEquals(detectLanguage('안녕하세요.', 1), 'ko');
  assertEquals(detectLanguage('Γειά σου!', 1), 'el');
  assertEquals(detectLanguage('שלום!', 1), 'he');
  assertEquals(detectLanguage('こんにちは。', 1), 'ja');
  assertEquals(
    detectLanguage(
      '最近、長女から「中学生男子全員クソ」という話を良く聞き中学生女子側の視点が分かってよかった。父からは「中学生男子は自分がクソだということを3年間かかって学習するんだよ」と言っておいた',
      1,
    ),
    'ja',
  );

  // ambiguous
  assertEquals(detectLanguage('你好', 1), undefined);
  assertEquals(detectLanguage('東京', 1), undefined);
  assertEquals(detectLanguage('Привет', 1), undefined);
  assertEquals(detectLanguage('Hello', 1), undefined);
});
