import ISO6391, { type LanguageCode } from 'iso-639-1';
import lande from 'lande';
import linkify from 'linkifyjs';

linkify.registerCustomProtocol('nostr', true);

/**
 * Returns the detected language if the confidence is greater or equal than 'minConfidence'.
 * 'minConfidence' must be a number between 0 and 1, such as 0.95.
 */
export function detectLanguage(text: string, minConfidence: number): LanguageCode | undefined {
  // It's better to remove the emojis first
  const sanitizedText = linkify.tokenize(
    text
      .replaceAll(/\p{Extended_Pictographic}/gu, '') // strip emojis
      .replaceAll(/[\s\uFEFF\u00A0\u200B-\u200D\u{0FE0E}]+/gu, ' '), // strip invisible characters
  )
    .reduce((acc, { t, v }) => t === 'text' ? acc + v : acc, '').trim();

  // Definite patterns for some languages.
  // Text which matches MUST unambiguously be in the given language.
  // This is only possible for some languages.
  // All patterns match the full text, so mixed scripts would fail these tests.
  const languagePatterns: Partial<Record<LanguageCode, RegExp>> = {
    ko: /^[\p{Script=Hangul}\s]+$/u, // Korean (Hangul only)
    el: /^[\p{Script=Greek}\s]+$/u, // Greek
    he: /^[\p{Script=Hebrew}\s]+$/u, // Hebrew
    ja: /^(?=.*[\p{Script=Hiragana}\p{Script=Katakana}])[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\s]+$/u, // Japanese (requires at least one Kana)
    // zh: not possible to detect unambiguously
  };

  // If any pattern matches, the language is known.
  for (const [lang, pattern] of Object.entries(languagePatterns) as [LanguageCode, RegExp][]) {
    const text = sanitizedText
      .replaceAll(/[\p{P}\p{S}]/gu, '') // strip punctuation and symbols
      .replaceAll(/\p{N}/gu, ''); // strip numbers

    if (pattern.test(text)) {
      return lang;
    }
  }

  if (sanitizedText.length < 10) { // heuristics
    return;
  }

  const [topResult] = lande(sanitizedText);

  if (topResult) {
    const [iso6393, confidence] = topResult;
    const locale = new Intl.Locale(iso6393);

    if (confidence >= minConfidence && ISO6391.validate(locale.language)) {
      return locale.language;
    }
  }
}
