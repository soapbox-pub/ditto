import { html } from '@/utils/html.ts';
import { OpenGraphTemplateOpts } from '@/utils/og-metadata.ts';

/**
 * Builds a series of meta tags from supplied metadata for injection into the served HTML page.
 * @param opts the metadata to use to fill the template.
 * @returns the built OpenGraph metadata.
 */
export function metadataView({ title, type, url, image, description, site }: OpenGraphTemplateOpts): string {
  const res: string[] = [
    html` <meta content="${title}" property="og:title">`,
    html` <meta content="${type}" property="og:type">`,
    html` <meta content="${url}" property="og:url">`,
    html` <meta content="${site}" property="og:site_name">`,
    html` <meta name="twitter:card" content="summary">`,
    html` <meta name="twitter:title" content="${title}">`,
  ];

  if (description) {
    res.push(html`<meta content="${description}" property="og:description">`);
    res.push(html`<meta content="${description}" property="twitter:description">`);
  }

  if (image) {
    res.push(html`<meta content="${image.url}" property="og:image">`);
    res.push(html`<meta name="twitter:image" content="${image.url}">`);

    if (image.w && image.h) {
      res.push(html`<meta content="${image.w}" property="og:image:width">`);
      res.push(html`<meta content="${image.h}" property="og:image:height">`);
    }

    if (image.alt) {
      res.push(html`<meta content="${image.alt}" property="og:image:alt">`);
      res.push(html`<meta content="${image.alt}" property="twitter:image:alt">`);
    }
  }

  return res.join('');
}
