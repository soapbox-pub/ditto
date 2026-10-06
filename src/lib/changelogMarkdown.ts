import { defaultSchema } from 'rehype-sanitize';

/** Sanitize schema allowing only the subset of Markdown needed for a CHANGELOG. */
export const CHANGELOG_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: ['h1', 'h2', 'h3', 'ul', 'ol', 'li', 'p', 'strong', 'em', 'code', 'br'] as string[],
  attributes: {},
};
