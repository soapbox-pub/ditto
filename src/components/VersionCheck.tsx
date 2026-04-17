import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { toast } from '@/hooks/useToast';
import { ToastAction } from '@/components/ui/toast';
import { useAppContext } from '@/hooks/useAppContext';
import { parseChangelog } from '@/lib/changelog';
import { getStorageKey } from '@/lib/storageKey';

/** Fetch the first changelog item for the given version (or the latest entry). */
async function fetchChangelogExcerpt(version: string): Promise<string | undefined> {
  try {
    const res = await fetch('/CHANGELOG.md');
    if (!res.ok) return undefined;
    const markdown = await res.text();
    const entries = parseChangelog(markdown);

    // Try to find the entry matching the current version, otherwise use the first entry.
    const entry = entries.find((e) => e.version === version) ?? entries[0];
    if (!entry) return undefined;

    // Return a truncated first item from the first section.
    const item = entry.sections[0]?.items[0];
    if (!item) return undefined;
    if (item.length <= 60) return item;
    return item.slice(0, 60).trimEnd() + '…';
  } catch {
    return undefined;
  }
}

/** Compares the running app version against localStorage and shows a toast when the version changes. */
export function VersionCheck() {
  const { config } = useAppContext();

  useEffect(() => {
    const currentVersion = import.meta.env.VERSION;
    if (!currentVersion) return;

    const storageKey = getStorageKey(config.appId, 'app-version');
    const storedVersion = localStorage.getItem(storageKey);
    localStorage.setItem(storageKey, currentVersion);

    if (storedVersion && storedVersion !== currentVersion) {
      // Show the toast immediately, then enrich it with a changelog excerpt.
      const { update, id } = toast({
        title: `What's new in v${currentVersion}`,
        action: (
          <ToastAction altText="View changelog" asChild>
            <Link to="/changelog">See all</Link>
          </ToastAction>
        ),
      });

      fetchChangelogExcerpt(currentVersion).then((excerpt) => {
        if (excerpt) {
          update({
            id,
            title: `What's new in v${currentVersion}`,
            description: excerpt,
            action: (
              <ToastAction altText="View changelog" asChild>
                <Link to="/changelog">See all</Link>
              </ToastAction>
            ),
          });
        }
      });
    }
  }, [config.appId]);

  return null;
}
