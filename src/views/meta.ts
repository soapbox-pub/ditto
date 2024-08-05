import { html } from '@/utils/html.ts';
import { OpenGraphTemplateOpts } from '@/utils/og-metadata.ts';

/**
 * Builds a series of meta tags from supplied metadata for injection into the served HTML page.
 * @param opts the metadata to use to fill the template.
 * @returns the built OpenGraph metadata.
 */
export const metadataView = ({ title, type, url, image, description, site }: OpenGraphTemplateOpts): string => {
  const res = [];
  res.push(html`\
  <meta content="${title}" property="og:title">
  <meta content="${type}" property="og:type">
  <meta content="${url}" property="og:url">
  <meta content="${description}" property="og:description">
  <meta content="${site}" property="og:site_name">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  `);

  if (image) {
    res.push(html`\
    <meta content="${image.url}" property="og:image">
    <meta content="${image.w}" property="og:image:width">
    <meta content="${image.h}" property="og:image:height">
    <meta name="twitter:image" content="${image.url}">
    `);
    if (image.alt) {
      res.push(html`<meta content="${image.alt}" property="og:image:alt">`);
      res.push(html`<meta content="${image.alt}" property="twitter:image:alt">`);
    }
  }

  return res.join('\n').replace(/\n+/g, '\n').replace(/^[ ]+/gm, '');
};
