interface RawHtml {
  raw: true;
  contents: string;
}

/**
 * Options for r()
 */
interface RawHtmlOptions {
  joiner?: string;
}

export function escape(str: string) {
  if (!str) return '';

  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Prevent values from being escaped by html``.
 * @param val Any value.
 * @returns An object that tells html`` to not escape `val` while building the HTML string.
 */
export function r(val: any, options?: RawHtmlOptions): RawHtml {
  return {
    raw: true,
    contents: Array.isArray(val) ? val.join(options?.joiner ?? ' ') : val.toString(),
  };
}

/**
 * @param strings The constant portions of the template string.
 * @param values The templated values.
 * @returns The built HTML.
 * @example
 * ```
 * const unsafe = `oops <script>alert(1)</script>`;
 * testing.innerHTML = html`foo bar baz ${unsafe}`;
 * console.assert(testing === "foo bar baz oops%20%3Cscript%3Ealert%281%29%3C/script%3E");
 * ```
 */
export function html(strings: TemplateStringsArray, ...values: (string | number | RawHtml)[]) {
  const built = [];
  for (let i = 0; i < strings.length; i++) {
    built.push(strings[i] || '');
    const val = values[i];
    if (typeof val !== 'undefined' && typeof val !== 'object') {
      built.push(escape((val || '').toString()));
    } else {
      built.push(val?.contents || '');
    }
  }
  return built.join('');
}
