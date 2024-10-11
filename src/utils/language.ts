import ISO6391, { type LanguageCode } from 'iso-639-1';
import lande from 'lande';
import linkify from 'linkifyjs';

linkify.registerCustomProtocol('nostr', true);

/** Returns the detected language if the confidence is greater or equal than 'minConfidence'
 * 'minConfidence' must be a number between 0 and 1, such as 0.95
 */
export function detectLanguage(text: string, minConfidence: number): LanguageCode | undefined {
  // It's better to remove the emojis first
  const sanitizedText = (linkify.tokenize(
    text.replaceAll(/\p{Extended_Pictographic}/gu, '')
      .replaceAll(/[\s\uFEFF\u00A0\u200B-\u200D\u{0FE0E}]+/gu, ' '),
  )
    .reduce(
      (acc, { t, v }) => t === 'text' ? acc + v : acc,
      '',
    )).trim();
  if (sanitizedText.length < 10) return; // heuristics

  const [topResult] = lande(
    sanitizedText,
  );
  if (topResult) {
    const [iso6393, confidence] = topResult;
    const locale = new Intl.Locale(iso6393);

    if (confidence >= minConfidence && ISO6391.validate(locale.language)) {
      return locale.language as LanguageCode;
    }
  }
  return;
}
