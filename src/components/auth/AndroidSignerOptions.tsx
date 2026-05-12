import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { AppInfo } from 'nostr-signer-capacitor-plugin';
import { Loader2 } from 'lucide-react';

import { AndroidNativeSigner } from '@/lib/androidNativeSigner';
import { useLoginActions } from '@/hooks/useLoginActions';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AndroidSignerOptionsProps {
  onLogin: () => void;
}

// Lists Android signer apps installed on the device (Amber, etc.) and lets
// the user pick one to log in with. Rendered only on Capacitor Android — on
// every other platform the component returns null and contributes nothing to
// the login dialog layout.
export function AndroidSignerOptions({ onLogin }: AndroidSignerOptionsProps) {
  const isAndroidNative =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [connectingPkg, setConnectingPkg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const login = useLoginActions();

  useEffect(() => {
    if (!isAndroidNative) return;
    let cancelled = false;

    AndroidNativeSigner.getSignerApps()
      .then((list) => { if (!cancelled) setApps(list); })
      .catch((e) => {
        if (cancelled) return;
        // The plugin throws if no signer is installed at all. Treat that as
        // "no apps" rather than as an error — the user just won't see this
        // section. Anything else gets surfaced.
        console.warn('Failed to enumerate Android signer apps:', e);
        setApps([]);
      });

    return () => { cancelled = true; };
  }, [isAndroidNative]);

  if (!isAndroidNative) return null;
  if (apps === null) return null; // initial probe — render nothing rather than flashing a spinner
  if (apps.length === 0) return null;

  const handleConnect = async (app: AppInfo) => {
    setError(null);
    setConnectingPkg(app.packageName);
    try {
      await login.androidSigner(app.packageName);
      onLogin();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setConnectingPkg(null);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        {apps.map((app) => {
          const connecting = connectingPkg === app.packageName;
          return (
            <button
              key={app.packageName}
              type="button"
              onClick={() => handleConnect(app)}
              disabled={connectingPkg !== null}
              className="w-full flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {app.iconUrl ? (
                <img
                  src={app.iconUrl}
                  alt=""
                  className="w-8 h-8 rounded-md flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-md bg-muted flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {connecting ? 'Connecting…' : `Log in with ${app.name}`}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  Use the {app.name} app on your device.
                </div>
              </div>
              {connecting && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
