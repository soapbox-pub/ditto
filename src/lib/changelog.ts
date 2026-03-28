/** Category types from Keep a Changelog format. */
type ChangelogCategory = 'Added' | 'Changed' | 'Deprecated' | 'Removed' | 'Fixed' | 'Security';

/** A single version entry in the changelog. */
interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    category: ChangelogCategory;
    items: string[];
  }[];
}

/**
 * Parse a Keep a Changelog formatted markdown string into structured data.
 * @see https://keepachangelog.com/
 */
function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let currentCategory: ChangelogCategory | null = null;

  for (const line of markdown.split('\n')) {
    // Match version heading: ## [X.Y.Z] - YYYY-MM-DD
    const versionMatch = line.match(/^## \[([^\]]+)\]\s*-\s*(.+)$/);
    if (versionMatch) {
      current = { version: versionMatch[1], date: versionMatch[2].trim(), sections: [] };
      entries.push(current);
      currentCategory = null;
      continue;
    }

    // Match category heading: ### Added, ### Changed, etc.
    const categoryMatch = line.match(/^### (.+)$/);
    if (categoryMatch && current) {
      currentCategory = categoryMatch[1].trim() as ChangelogCategory;
      current.sections.push({ category: currentCategory, items: [] });
      continue;
    }

    // Match list item: - Description
    const itemMatch = line.match(/^- (.+)$/);
    if (itemMatch && current) {
      const section = current.sections[current.sections.length - 1];
      if (section) {
        section.items.push(itemMatch[1]);
      } else {
        // Item without a category heading — treat as "Changed"
        current.sections.push({ category: 'Changed', items: [itemMatch[1]] });
      }
      continue;
    }

    // Lines that don't start with "- " but aren't blank may be a continuation or
    // freeform text after the version heading (e.g. "Initial release of Ditto 2.0").
    const trimmed = line.trim();
    if (trimmed && current && !trimmed.startsWith('#')) {
      const section = current.sections[current.sections.length - 1];
      if (section) {
        // Append to last item or add new item
        section.items.push(trimmed);
      } else {
        // Freeform text under version with no category — store in a generic section
        current.sections.push({ category: 'Changed', items: [trimmed] });
      }
    }
  }

  return entries;
}

export { parseChangelog };
export type { ChangelogEntry, ChangelogCategory };
