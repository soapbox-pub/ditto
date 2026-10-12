import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';

import { toast } from '@/hooks/useToast';
import { ToastAction } from '@/components/ui/toast';
import { useAppContext } from '@/hooks/useAppContext';
import { parseChangelog } from '@/lib/changelog';
import { getStorageKey } from '@/lib/storageKey';

/** Maximum length of the toast excerpt, in characters. Keeps the toast compact. */
const EXCERPT_MAX_LENGTH = 60;

/** Truncate `text` to at most `max` characters, ending on a word boundary when possible and appending an ellipsis. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max).trimEnd();
  const lastSpace = slice.lastIndexOf(' ');
  // Only break on a word boundary if it isn't comically early (avoids "A…" when the limit lands mid-first-word).
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace).trimEnd() : slice;
  return cut + '…';
}

/** Fetch the release blurb for the given version: prefer the section summary, fall back to the first bullet. */
async function fetchChangelogExcerpt(version: string): Promise<string | undefined> {
  try {
    const res = await fetch('/CHANGELOG.md');
    if (!res.ok) return undefined;
    const markdown = await res.text();
    const entries = parseChangelog(markdown);

    // Try to find the entry matching the current version, otherwise use the first entry.
    const entry = entries.find((e) => e.version === version) ?? entries[0];
    if (!entry) return undefined;

    // Prefer the explicit summary paragraph if the changelog entry has one.
    if (entry.summary) return truncate(entry.summary, EXCERPT_MAX_LENGTH);

    // Legacy fallback: a truncated first item from the first section.
    const item = entry.sections[0]?.items[0];
    if (!item) return undefined;
    return truncate(item, EXCERPT_MAX_LENGTH);
  } catch {
    return undefined;
  }
}

/** Compares the running app version against localStorage and shows a toast when the version changes. */
export function VersionCheck() {
  const { config } = useAppContext();
  const intl = useIntl();

  useEffect(() => {
    const currentVersion = import.meta.env.VERSION;
    if (!currentVersion) return;

    const storageKey = getStorageKey(config.appId, 'app-version');
    const storedVersion = localStorage.getItem(storageKey);
    localStorage.setItem(storageKey, currentVersion);

    if (storedVersion && storedVersion !== currentVersion) {
      const title = intl.formatMessage({ id: 'versionCheck.whatsNew', defaultMessage: "What's new in v{version}" }, { version: currentVersion });
      const action = (
        <ToastAction altText={intl.formatMessage({ id: 'versionCheck.viewChangelog', defaultMessage: 'View changelog' })} asChild>
          <Link to="/changelog"><FormattedMessage id="versionCheck.seeAll" defaultMessage="See all" /></Link>
        </ToastAction>
      );

      // Show the toast immediately, then enrich it with a changelog excerpt.
      const { update, id } = toast({
        title,
        action,
      });

      fetchChangelogExcerpt(currentVersion).then((excerpt) => {
        if (excerpt) {
          update({
            id,
            title,
            description: excerpt,
            action,
          });
        }
      });
    }
  }, [config.appId, intl]);

  return null;
}
