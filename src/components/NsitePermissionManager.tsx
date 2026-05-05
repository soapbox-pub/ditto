import { useCallback, useSyncExternalStore } from 'react';
import { Check, Shield, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  clearNsitePermissions,
  getNsiteAllowance,
  getPermissionLabel,
  removeNsitePermission,
  setNsitePermission,
  type NsiteAllowance,
  type NsitePermission,
} from '@/lib/nsitePermissions';

// ---------------------------------------------------------------------------
// Subscribe to localStorage changes so the component re-renders when
// permissions are modified (e.g. by the prompt granting a new permission).
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'nostr:nsite-permissions';

function subscribe(callback: () => void): () => void {
  // Listen for changes from other tabs/windows.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);

  // For same-tab mutations, we override the localStorage setter to also
  // dispatch a custom event. This is necessary because the `storage` event
  // only fires across tabs, not within the same tab.
  const onLocal = () => callback();
  window.addEventListener('nsite-permissions-changed', onLocal);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('nsite-permissions-changed', onLocal);
  };
}

let _snapshotCache: string | null = null;

function getSnapshot(): string | null {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current !== _snapshotCache) {
    _snapshotCache = current;
  }
  return _snapshotCache;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NsitePermissionManagerProps {
  /** Canonical nsite subdomain identifier. */
  siteId: string;
  /** Human-readable site name. */
  siteName: string;
}

/**
 * Popover triggered from the nsite preview nav bar that shows and manages
 * stored permissions for the current site.
 */
export function NsitePermissionManager({ siteId, siteName }: NsitePermissionManagerProps) {
  const { user } = useCurrentUser();

  // Subscribe to permission changes so the list stays in sync.
  useSyncExternalStore(subscribe, getSnapshot);
  const allowance: NsiteAllowance | undefined = user
    ? getNsiteAllowance(siteId, user.pubkey)
    : undefined;
  const permissions = allowance?.permissions ?? [];

  const handleToggle = useCallback(
    (perm: NsitePermission) => {
      if (!user) return;
      setNsitePermission(
        siteId,
        user.pubkey,
        siteName,
        perm.type,
        perm.kind,
        !perm.allowed,
      );
    },
    [siteId, siteName, user],
  );

  const handleRemove = useCallback(
    (perm: NsitePermission) => {
      if (!user) return;
      removeNsitePermission(siteId, user.pubkey, perm.type, perm.kind);
    },
    [siteId, user],
  );

  const handleClearAll = useCallback(() => {
    if (!user) return;
    clearNsitePermissions(siteId, user.pubkey);
  }, [siteId, user]);

  // Don't render the manager if no user is logged in.
  if (!user) return null;

  const hasPermissions = permissions.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          title="Site permissions"
        >
          <Shield className={`size-3.5 ${hasPermissions ? 'text-primary' : ''}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">Permissions</p>
            <p className="text-xs text-muted-foreground truncate">{siteName}</p>
          </div>
          {hasPermissions && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
              onClick={handleClearAll}
            >
              <Trash2 className="size-3" />
              Revoke all
            </Button>
          )}
        </div>

        {/* Permission list */}
        <div className="max-h-64 overflow-y-auto">
          {!hasPermissions ? (
            <div className="px-4 py-6 text-center">
              <Shield className="size-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No permissions granted
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Permissions will appear here when the app requests them.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {permissions.map((perm) => (
                <div
                  key={`${perm.type}-${perm.kind}`}
                  className="flex items-center gap-3 px-4 py-2.5 group"
                >
                  {/* Status icon */}
                  <div className="shrink-0">
                    {perm.allowed ? (
                      <Check className="size-3.5 text-green-500" />
                    ) : (
                      <X className="size-3.5 text-destructive" />
                    )}
                  </div>

                  {/* Label */}
                  <span className="text-sm flex-1 min-w-0 truncate">
                    {getPermissionLabel(perm.type, perm.kind)}
                  </span>

                  {/* Toggle */}
                  <Switch
                    checked={perm.allowed}
                    onCheckedChange={() => handleToggle(perm)}
                    className="shrink-0 scale-75 origin-right"
                  />

                  {/* Remove */}
                  <button
                    type="button"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(perm)}
                    title="Remove"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}


