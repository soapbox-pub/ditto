import { describe, it, expect } from 'vitest';

import { buildBackgroundCss } from './themes';

describe('buildBackgroundCss', () => {
  it('paints a valid https background', () => {
    expect(buildBackgroundCss('https://example.com/bg.png', 'tile')).toContain('url("https://example.com/bg.png")');
  });

  it('cannot be broken out of with a quote in the URL', () => {
    const css = buildBackgroundCss('https://a.example/x.png?"); } body { display: none } x { y: url("');
    expect(css).not.toContain('display: none');
    expect(css.match(/"/g)?.length).toBe(4); // content: "" plus the url("…") pair
  });

  it('emits nothing for a non-https URL', () => {
    expect(buildBackgroundCss('javascript:alert(1)')).toBe('');
  });
});
