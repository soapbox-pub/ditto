import DOMPurify from 'isomorphic-dompurify';

import { Conf } from '@/config.ts';
import { html } from '@/utils/html.ts';
import { MetadataEntities } from '@/utils/og-metadata.ts';

/**
 * Builds a series of meta tags from supplied metadata for injection into the served HTML page.
 * @param opts the metadata to use to fill the template.
 * @returns the built OpenGraph metadata.
 */
export function renderMetadata(url: string, { account, status, instance }: MetadataEntities): string {
  const tags: string[] = [];

  const title = account ? `${account.display_name} (@${account.acct})` : instance.name;
  const attachment = status?.media_attachments?.find((a) => a.type === 'image');
  const description = DOMPurify.sanitize(status?.content || account?.note || instance.tagline, { ALLOWED_TAGS: [] });
  const image = attachment?.preview_url || account?.avatar_static || instance.picture || Conf.local('/favicon.ico');
  const siteName = instance?.name;
  const width = attachment?.meta?.original?.width;
  const height = attachment?.meta?.original?.height;

  if (title) {
    tags.push(html`<title>${title}</title>`);
    tags.push(html`<meta property="og:title" content="${title}">`);
    tags.push(html`<meta name="twitter:title" content="${title}">`);
  }

  if (description) {
    tags.push(html`<meta name="description" content="${description}">`);
    tags.push(html`<meta property="og:description" content="${description}">`);
    tags.push(html`<meta name="twitter:description" content="${description}">`);
  }

  if (image) {
    tags.push(html`<meta property="og:image" content="${image}">`);
    tags.push(html`<meta name="twitter:image" content="${image}">`);
  }

  if (typeof width === 'number' && typeof height === 'number') {
    tags.push(html`<meta property="og:image:width" content="${width}">`);
    tags.push(html`<meta property="og:image:height" content="${height}">`);
  }

  if (siteName) {
    tags.push(html`<meta property="og:site_name" content="${siteName}">`);
  }

  // Extra tags (always present if other tags exist).
  if (tags.length > 0) {
    tags.push(html`<meta property="og:url" content="${url}">`);
    tags.push('<meta property="og:type" content="website">');
    tags.push('<meta name="twitter:card" content="summary">');
  }

  return tags.join('');
}
