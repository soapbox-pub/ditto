import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { resolveSchemeUri } from '@/lib/schemeUri';

/**
 * Landing route for the web manifest's `protocol_handlers` (see
 * `public/manifest.webmanifest`). The browser opens `/open?uri=<uri>`
 * with the full `bitcoin:`, `monero:`, or `nostr:` URI, which is resolved the
 * same way native deep links are (`resolveSchemeUri`) and replaced with its
 * target route. Unresolvable URIs fall back to the home feed.
 *
 * `monero` and `nostr` aren't on the HTML spec's scheme safelist, so
 * mainstream browsers ignore those handlers; they're registered for runtimes
 * that allow them (e.g. Tenna).
 */
export function ProtocolHandlerPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const uri = params.get('uri') ?? '';

  useEffect(() => {
    const target = resolveSchemeUri(uri);
    navigate(target?.path ?? '/', { replace: true, state: target?.state });
  }, [uri, navigate]);

  return null;
}

export default ProtocolHandlerPage;
