import { useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { Capacitor } from '@capacitor/core';
import { useNostrLogin } from '@nostrify/react/login';
import { ExternalLink, ShieldCheck } from 'lucide-react';

import { useAppContext } from '@/hooks/useAppContext';
import { AndroidNativeSigner } from '@/lib/androidNativeSigner';
import { openUrl } from '@/lib/downloadFile';

interface Signer {
  name: string;
  url: string;
  kind: 'extension' | 'app';
}

const AMBER: Signer = { name: 'Amber', url: 'https://zapstore.dev/apps/com.greenart7c3.nostrsigner', kind: 'app' };
const CLAVE: Signer = { name: 'Clave', url: 'https://apps.apple.com/app/id6762104155', kind: 'app' };
const EXTENSION_CHROME: Signer = {
  name: 'Ditto Extension',
  url: 'https://chromewebstore.google.com/detail/ditto-extension/fbiegkepanmjielbemkhieckmlckiagi',
  kind: 'extension',
};
const EXTENSION_FIREFOX: Signer = {
  name: 'Ditto Extension',
  url: 'https://addons.mozilla.org/en-US/firefox/addon/ditto-extension/',
  kind: 'extension',
};

/**
 * The signer to recommend on this device, or `null` where there's none to
 * offer (desktop Safari) or one is already loaded (a NIP-07 `window.nostr`).
 */
function signerForPlatform(): Signer | null {
  if ('nostr' in window && (window as { nostr?: unknown }).nostr) return null;
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return AMBER;
  if (platform === 'ios') return CLAVE;

  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return AMBER;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return CLAVE;
  if (/Firefox\//.test(ua)) return EXTENSION_FIREFOX;
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return EXTENSION_CHROME;
  return null;
}

/** iOS signer apps, by URL scheme (each listed under LSApplicationQueriesSchemes in Info.plist). */
const IOS_SIGNER_SCHEMES = ['clave://', 'aegis://'];

/**
 * Whether the native app can see a signer app installed: a NIP-55 signer on
 * Android, or Clave or Aegis on iOS. On the web installed apps can't be seen.
 */
async function nativeSignerInstalled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    if (Capacitor.getPlatform() === 'android') return (await AndroidNativeSigner.getSignerApps()).length > 0;
    if (Capacitor.getPlatform() === 'ios') {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      const results = await Promise.all(IOS_SIGNER_SCHEMES.map((url) => AppLauncher.canOpenUrl({ url })));
      return results.some((r) => r.value);
    }
  } catch {
    // The Android plugin throws when no signer is installed at all.
  }
  return false;
}

/**
 * Nudges someone about to paste a secret key toward a signer that keeps it out
 * of Ditto. Says nothing to someone who already has one: loaded in the browser,
 * installed on the device, or logged in with on another account.
 */
export function SignerSuggestion() {
  const { config } = useAppContext();
  const { logins } = useNostrLogin();
  const [installed, setInstalled] = useState<boolean | undefined>(() => (Capacitor.isNativePlatform() ? undefined : false));

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void nativeSignerInstalled().then((found) => { if (!cancelled) setInstalled(found); });
    return () => { cancelled = true; };
  }, []);

  const usesSigner = logins.some((login) => login.type !== 'nsec');
  const signer = signerForPlatform();
  // Nothing while the device is checked, rather than a suggestion that blinks out.
  if (!signer || usesSigner || installed !== false) return null;

  return (
    <button
      type="button"
      onClick={() => void openUrl(signer.url)}
      className="inset-well flex w-full items-center gap-3 p-3 text-left transition-colors can-hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="size-5" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-sm font-medium">
          {signer.kind === 'extension' ? (
            <FormattedMessage id="login.signerSuggestion.extensionTitle" defaultMessage="Get the {name}" values={{ name: signer.name }} />
          ) : (
            <FormattedMessage id="login.signerSuggestion.appTitle" defaultMessage="Get {name}" values={{ name: signer.name }} />
          )}
        </span>
        <span className="block text-xs text-muted-foreground">
          {signer.kind === 'extension' ? (
            <FormattedMessage
              id="login.signerSuggestion.extensionDetailWhy"
              defaultMessage="It holds your key and signs for {appName}, so nothing on this page can grab it."
              values={{ appName: config.appName }}
            />
          ) : (
            <FormattedMessage
              id="login.signerSuggestion.appDetailWhy"
              defaultMessage="It holds your key and approves what {appName} signs, so {appName} never sees it."
              values={{ appName: config.appName }}
            />
          )}
        </span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
