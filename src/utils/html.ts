import { escape } from 'entities';

/**
 * @param strings The constant portions of the template string.
 * @param values The templated values.
 * @returns The built HTML.
 * @example
 * ```
 * const unsafe = `oops <script>alert(1)</script>`;
 * testing.innerHTML = html`foo bar baz ${unsafe}`;
 * console.assert(testing === "foo bar baz oops&lt;script&gt;alert(1)&lt;/script&gt;");
 * ```
 */
export function html(strings: TemplateStringsArray, ...values: (string | number)[]) {
  const built = [];
  for (let i = 0; i < strings.length; i++) {
    built.push(strings[i] || '');
    const val = values[i];
    built.push(escape((val || '').toString()));
  }
  return built.join('');
}
