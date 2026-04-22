import { useAppContext } from '@/hooks/useAppContext';

/**
 * Returns the origin to use when building shareable URLs (QR codes,
 * copy-link, remote-login callbacks, etc). Prefers `config.shareOrigin`
 * when set, otherwise falls back to `window.location.origin`.
 *
 * The returned value never has a trailing slash.
 *
 * Why this exists: on Capacitor, `window.location.origin` resolves to
 * `capacitor://localhost` (iOS) or `https://localhost` (Android), which
 * produces broken shareable URLs. Native builds should configure
 * `shareOrigin` in `ditto.json` so that QR codes, copy-link actions, and
 * remote-login callbacks resolve to the canonical web origin instead.
 */
export function useShareOrigin(): string {
  const { config } = useAppContext();
  const configured = config.shareOrigin?.replace(/\/+$/, '');
  if (configured) return configured;
  return typeof window !== 'undefined' ? window.location.origin : '';
}
