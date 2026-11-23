import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

/**
 * Every px and rem `font-size` and `line-height` in the app's CSS — Tailwind
 * utilities, typography's `prose`, and plain stylesheets alike — times the Text
 * size setting (`--font-scale`, `src/lib/fontScale.ts`), so no size can opt
 * out by accident. em, %, and unitless values already follow their parent.
 * Spacing and icons keep their size.
 */
function fontScale() {
  const scale = (decl) => {
    if (/^-?[\d.]+(px|rem)$/.test(decl.value)) decl.value = `calc(${decl.value} * var(--font-scale, 1))`;
  };
  return { postcssPlugin: 'font-scale', Declaration: { 'font-size': scale, 'line-height': scale } };
}
fontScale.postcss = true;

export default {
  plugins: [tailwindcss, autoprefixer, fontScale],
};
