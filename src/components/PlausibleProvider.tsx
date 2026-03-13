import { ReactNode, useEffect, useRef } from 'react';
import { useAppContext } from '@/hooks/useAppContext';

interface PlausibleProviderProps {
  children: ReactNode;
}

/**
 * Reactively initializes Plausible Analytics from AppConfig.
 * Plausible's `init()` can only be called once, so we guard with a ref.
 */
export function PlausibleProvider({ children }: PlausibleProviderProps) {
  const { config } = useAppContext();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || !config.plausibleDomain) return;
    initializedRef.current = true;

    import('@plausible-analytics/tracker').then(({ init }) => {
      init({
        domain: config.plausibleDomain,
        ...(config.plausibleEndpoint && { endpoint: config.plausibleEndpoint }),
      });
    }).catch(console.error);
  }, [config.plausibleDomain, config.plausibleEndpoint]);

  return <>{children}</>;
}
