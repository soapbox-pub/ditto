/**
 * Minimal RFC 6570 URI-template expansion covering the subset Ditto's URL
 * templates use: simple string expansion (`{var}`, percent-encodes reserved
 * characters) and reserved expansion (`{+var}`, keeps them).
 *
 * Unknown variables expand to an empty string, matching `uri-templates`'
 * `fill()` behavior for undefined values.
 */
export function fillUriTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{(\+?)([A-Za-z0-9_]+)\}/g, (_match, plus: string, name: string) => {
    const value = vars[name];
    if (value === undefined) return '';
    if (plus) {
      // Reserved expansion: keep reserved URI characters, encode the rest.
      return encodeURI(value);
    }
    return encodeURIComponent(value);
  });
}
