import { FormattedMessage } from 'react-intl';
import { Capacitor } from '@capacitor/core';
import { ExternalLink, ShieldCheck } from 'lucide-react';

import { useAppContext } from '@/hooks/useAppContext';
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

/** Nudges someone about to paste a secret key toward a signer that keeps it out of Ditto. */
export function SignerSuggestion() {
  const { config } = useAppContext();
  const signer = signerForPlatform();
  if (!signer) return null;

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
