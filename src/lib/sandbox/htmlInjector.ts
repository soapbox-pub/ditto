/**
 * Inject `<script>` tags into an HTML document string.
 *
 * Uses DOMParser to safely manipulate the DOM, then serialises back to a
 * string. Each script path is prepended inside `<head>` so the injected
 * scripts run before the app's own scripts.
 */
export function injectScriptTags(html: string, scriptPaths: string[]): string {
  if (scriptPaths.length === 0) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Insert in reverse order so the first path ends up first in <head>.
  for (let i = scriptPaths.length - 1; i >= 0; i--) {
    const script = doc.createElement('script');
    script.src = scriptPaths[i];
    doc.head.prepend(script);
  }

  // DOMParser strips the doctype; re-add it when the original had one.
  const hasDoctype = /^<!doctype\s/i.test(html.trimStart());
  const serialised = doc.documentElement.outerHTML;
  return hasDoctype ? '<!DOCTYPE html>\n' + serialised : serialised;
}
