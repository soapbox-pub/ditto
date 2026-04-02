import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { toast } from '@/hooks/useToast';
import { ToastAction } from '@/components/ui/toast';

const STORAGE_KEY = 'ditto:app-version';

/** Compares the running app version against localStorage and shows a toast when the version changes. */
export function VersionCheck() {
  useEffect(() => {
    const currentVersion = import.meta.env.VERSION;
    if (!currentVersion) return;

    const storedVersion = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, currentVersion);

    if (storedVersion && storedVersion !== currentVersion) {
      toast({
        title: `Updated to v${currentVersion}!`,
        action: (
          <ToastAction altText="View changelog" asChild>
            <Link to="/changelog">Changelog</Link>
          </ToastAction>
        ),
      });
    }
  }, []);

  return null;
}
