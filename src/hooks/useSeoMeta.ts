import { useLayoutEffect, useRef } from 'react';

/** The subset of SEO metadata Ditto sets per-page. */
export interface SeoMeta {
  title?: string;
  description?: string;
}

interface Entry {
  meta: SeoMeta;
}

/**
 * Stack of currently-mounted `useSeoMeta` entries. The most recently mounted
 * component wins (matching unhead's behavior where deeper/later components
 * override earlier ones). When an entry unmounts, the next one down is
 * re-applied; when the stack empties, the defaults from index.html return.
 */
const stack: Entry[] = [];

/** Original head values from index.html, captured before the first override. */
let defaults: { title: string; tags: Map<string, string | null> } | undefined;

/**
 * Selectors for the head tags we manage. `title`/`description` fan out to the
 * OpenGraph and Twitter equivalents, mirroring unhead's InferSeoMetaPlugin.
 */
const TITLE_TAGS = ['meta[property="og:title"]', 'meta[name="twitter:title"]'];
const DESCRIPTION_TAGS = [
  'meta[name="description"]',
  'meta[property="og:description"]',
  'meta[name="twitter:description"]',
];

function captureDefaults(): NonNullable<typeof defaults> {
  if (!defaults) {
    const tags = new Map<string, string | null>();
    for (const selector of [...TITLE_TAGS, ...DESCRIPTION_TAGS]) {
      tags.set(selector, document.head.querySelector(selector)?.getAttribute('content') ?? null);
    }
    defaults = { title: document.title, tags };
  }
  return defaults;
}

function setContent(selector: string, content: string | null): void {
  const el = document.head.querySelector(selector);
  if (el) {
    if (content === null) {
      el.removeAttribute('content');
    } else {
      el.setAttribute('content', content);
    }
  }
}

/** Apply the top-of-stack entry to the document head, or restore defaults. */
function apply(): void {
  const base = captureDefaults();
  const meta = stack[stack.length - 1]?.meta;

  document.title = meta?.title ?? base.title;

  for (const selector of TITLE_TAGS) {
    setContent(selector, meta?.title ?? base.tags.get(selector) ?? null);
  }
  for (const selector of DESCRIPTION_TAGS) {
    setContent(selector, meta?.description ?? base.tags.get(selector) ?? null);
  }
}

/**
 * Set the page title and description (plus their OpenGraph/Twitter mirrors)
 * for as long as the calling component stays mounted. Drop-in replacement for
 * unhead's `useSeoMeta` for the fields Ditto uses.
 */
export function useSeoMeta(meta: SeoMeta): void {
  const { title, description } = meta;
  const entryRef = useRef<Entry | undefined>(undefined);

  // Register this entry on mount, remove it on unmount.
  useLayoutEffect(() => {
    const entry = entryRef.current ?? { meta: {} };
    entryRef.current = entry;
    stack.push(entry);

    return () => {
      const index = stack.indexOf(entry);
      if (index !== -1) stack.splice(index, 1);
      apply();
    };
  }, []);

  // Sync the current values into the entry and re-apply when they change.
  // Runs after the registration effect on mount (same-component layout
  // effects execute in declaration order).
  useLayoutEffect(() => {
    const entry = entryRef.current;
    if (!entry) return;
    entry.meta = { title, description };
    if (stack[stack.length - 1] === entry) apply();
  }, [title, description]);
}
