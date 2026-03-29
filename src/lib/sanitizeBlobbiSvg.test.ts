import { describe, it, expect } from 'vitest';
import { sanitizeBlobbiSvg } from './sanitizeBlobbiSvg';

describe('sanitizeBlobbiSvg', () => {
  it('preserves data-* attributes used by eye animation', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g class="blobbi-blink blobbi-blink-left" data-cx="35" data-cy="45" data-eye-top="18" data-eye-bottom="52" data-clip-height="25" data-clip-id="blobbi-blink-clip-abc123-left">
        <circle cx="35" cy="45" r="5" fill="#1f2937" />
      </g>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).toContain('data-cx="35"');
    expect(sanitized).toContain('data-cy="45"');
    expect(sanitized).toContain('data-eye-top="18"');
    expect(sanitized).toContain('data-eye-bottom="52"');
    expect(sanitized).toContain('data-clip-height="25"');
    expect(sanitized).toContain('data-clip-id="blobbi-blink-clip-abc123-left"');
  });

  it('preserves SMIL animation attributes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="10" y="20" width="30" height="25">
        <animate attributeName="y" values="20;40;20" keyTimes="0;0.5;1" dur="8s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
      </rect>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).toContain('attributeName="y"');
    expect(sanitized).toContain('keyTimes="0;0.5;1"');
    expect(sanitized).toContain('calcMode="spline"');
    expect(sanitized).toContain('keySplines="0.4 0 0.6 1;0.4 0 0.6 1"');
    expect(sanitized).toContain('repeatCount="indefinite"');
  });

  it('preserves animateTransform with type attribute', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M 35 45 L 40 50" stroke="#1f2937">
        <animateTransform attributeName="transform" type="rotate" from="360 35 45" to="0 35 45" dur="2s" repeatCount="indefinite" />
      </path>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).toContain('<animateTransform');
    expect(sanitized).toContain('type="rotate"');
    expect(sanitized).toContain('from="360 35 45"');
    expect(sanitized).toContain('to="0 35 45"');
  });

  it('preserves style tags with @keyframes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <style type="text/css">
          @keyframes sleepy-zzz { 0% { opacity: 0; } 100% { opacity: 1; } }
          .blobbi-zzz { animation: sleepy-zzz 8s ease-in-out infinite; }
        </style>
      </defs>
      <g class="blobbi-zzz" opacity="0">
        <text x="70" y="12" font-family="system-ui" font-size="8">z</text>
      </g>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).toContain('<style');
    expect(sanitized).toContain('@keyframes sleepy-zzz');
    expect(sanitized).toContain('animation: sleepy-zzz');
  });

  it('preserves clipPath with references', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <clipPath id="blobbi-blink-clip-abc123-left">
          <rect class="blobbi-blink-clip-rect" x="10" y="20" width="30" height="25" />
        </clipPath>
      </defs>
      <g clip-path="url(#blobbi-blink-clip-abc123-left)">
        <circle cx="35" cy="45" r="5" fill="white" />
      </g>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).toContain('<clipPath id="blobbi-blink-clip-abc123-left"');
    expect(sanitized).toContain('clip-path="url(#blobbi-blink-clip-abc123-left)"');
  });

  it('preserves gradient definitions', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <radialGradient id="tearGradient" cx="0.3" cy="0.3">
          <stop offset="0%" stop-color="#e0f2fe" />
          <stop offset="100%" stop-color="#7dd3fc" />
        </radialGradient>
      </defs>
      <ellipse fill="url(#tearGradient)" cx="50" cy="50" rx="10" ry="15" />
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).toContain('<radialGradient id="tearGradient"');
    expect(sanitized).toContain('stop-color="#e0f2fe"');
    expect(sanitized).toContain('fill="url(#tearGradient)"');
  });

  it('preserves transform-origin and transform-box in style', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g class="blobbi-eye" style="transform-box: fill-box; transform-origin: center;">
        <circle cx="35" cy="45" r="5" fill="#1f2937" />
      </g>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).toContain('transform-box: fill-box');
    expect(sanitized).toContain('transform-origin: center');
  });

  it('blocks event handlers', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert('xss')">
      <circle cx="50" cy="50" r="10" onclick="alert('xss')" />
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).not.toContain('onload');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('alert');
  });

  it('blocks script tags', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <script>alert('xss')</script>
      <circle cx="50" cy="50" r="10" />
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('alert');
  });

  it('blocks href attributes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <a href="javascript:alert('xss')">
        <circle cx="50" cy="50" r="10" />
      </a>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).not.toContain('href');
    expect(sanitized).not.toContain('javascript');
  });

  it('blocks foreignObject', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <foreignObject width="100" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml">XSS</div>
      </foreignObject>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).not.toContain('foreignObject');
    expect(sanitized).not.toContain('XSS');
  });

  it('preserves text and tspan elements', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <text x="50" y="50" font-family="system-ui" font-size="12" font-weight="bold" fill="#6b7280">
        <tspan x="50" y="50">Hello</tspan>
        <tspan x="50" y="65">World</tspan>
      </text>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).toContain('<text');
    expect(sanitized).toContain('<tspan');
    expect(sanitized).toContain('font-family="system-ui"');
    expect(sanitized).toContain('font-weight="bold"');
  });

  it('preserves mask element', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <mask id="test-mask">
          <rect x="0" y="0" width="100" height="100" fill="white" />
        </mask>
      </defs>
      <circle mask="url(#test-mask)" cx="50" cy="50" r="40" fill="blue" />
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(svg);

    expect(sanitized).toContain('<mask id="test-mask"');
    expect(sanitized).toContain('mask="url(#test-mask)"');
  });

  it('rejects SVGs exceeding max length', () => {
    const largeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <text>${'x'.repeat(600 * 1024)}</text>
    </svg>`;

    const sanitized = sanitizeBlobbiSvg(largeSvg);

    expect(sanitized).toBe('');
  });
});
