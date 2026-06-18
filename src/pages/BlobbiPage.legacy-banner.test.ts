import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Old-format Blobbi events are ignored entirely: they are filtered before UI
// selection (see blobbi-legacy-filter.test.ts), so no pet ever renders with the
// legacy format. The "older format / automatically upgraded" warning banner must
// no longer exist in the page. A focused source assertion keeps this regression
// guard cheap and avoids rendering the full dashboard in jsdom.
const BLOBBI_PAGE_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/pages/BlobbiPage.tsx'),
  'utf8',
);

describe('BlobbiPage legacy banner', () => {
  it('does not render the old-format warning banner copy', () => {
    expect(BLOBBI_PAGE_SOURCE).not.toContain('This pet uses an older format');
    expect(BLOBBI_PAGE_SOURCE).not.toContain(
      'It will be automatically upgraded on your next interaction',
    );
  });
});
