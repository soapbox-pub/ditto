/** Category types from Keep a Changelog format. */
type ChangelogCategory = 'Added' | 'Changed' | 'Deprecated' | 'Removed' | 'Fixed' | 'Security';

/** A single version entry in the changelog. */
interface ChangelogEntry {
  version: string;
  date: string;
  /**
   * Optional plaintext summary paragraph that appears before any `### Category`
   * heading. Used as the release blurb on the App Store, Play Store, and the
   * in-app version-update toast. Convention is a single paragraph of at most
   * 500 characters.
   */
  summary?: string;
  sections: {
    category: ChangelogCategory;
    items: string[];
  }[];
}

/** Apply basic typographic transformations to a changelog item string. */
function prettify(text: string): string {
  return text
    .replace(/ -- /g, ' \u2014 ')  // space-dash-dash-space → em dash
    .replace(/(\w)--(\w)/g, '$1\u2013$2') // word--word → en dash
    .replace(/ (\S+)$/, '\u00A0$1'); // prevent orphaned last word
}

/**
 * Parse a Keep a Changelog formatted markdown string into structured data.
 * @see https://keepachangelog.com/
 */
function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let currentCategory: ChangelogCategory | null = null;
  /** Buffer for lines that are part of the summary paragraph (pre-section text). */
  let summaryLines: string[] = [];

  const flushSummary = () => {
    if (current && summaryLines.length) {
      current.summary = summaryLines.join(' ');
    }
    summaryLines = [];
  };

  for (const line of markdown.split('\n')) {
    // Match version heading: ## [X.Y.Z] - YYYY-MM-DD
    const versionMatch = line.match(/^## \[([^\]]+)\]\s*-\s*(.+)$/);
    if (versionMatch) {
      flushSummary();
      current = { version: versionMatch[1], date: versionMatch[2].trim(), sections: [] };
      entries.push(current);
      currentCategory = null;
      continue;
    }

    // Match category heading: ### Added, ### Changed, etc.
    const categoryMatch = line.match(/^### (.+)$/);
    if (categoryMatch && current) {
      flushSummary();
      currentCategory = categoryMatch[1].trim() as ChangelogCategory;
      current.sections.push({ category: currentCategory, items: [] });
      continue;
    }

    // Match list item: - Description
    const itemMatch = line.match(/^- (.+)$/);
    if (itemMatch && current) {
      const section = current.sections[current.sections.length - 1];
      if (section) {
        section.items.push(prettify(itemMatch[1]));
      } else {
        // Bullet appearing before any category heading — flush any summary
        // buffer and treat the bullet as a "Changed" entry. (Backward compat
        // for legacy entries that opened straight into bullets.)
        flushSummary();
        current.sections.push({ category: 'Changed', items: [prettify(itemMatch[1])] });
      }
      continue;
    }

    // Non-blank, non-bullet, non-heading lines.
    const trimmed = line.trim();
    if (trimmed && current && !trimmed.startsWith('#')) {
      const section = current.sections[current.sections.length - 1];
      if (section) {
        // Continuation of the current bullet section.
        section.items.push(prettify(trimmed));
      } else {
        // Pre-section freeform text — accumulate as the summary paragraph.
        summaryLines.push(trimmed);
      }
    }
  }

  flushSummary();
  return entries;
}

export { parseChangelog };
export type { ChangelogEntry, ChangelogCategory };
