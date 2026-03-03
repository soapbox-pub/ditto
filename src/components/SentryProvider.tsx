import { ReactNode, useEffect } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { initializeSentry, disableSentry, isSentryInitialized } from '@/lib/sentry';

interface SentryProviderProps {
  children: ReactNode;
}

export function SentryProvider({ children }: SentryProviderProps) {
  const { config } = useAppContext();

  useEffect(() => {
    const shouldEnableSentry = config.sentryDsn && config.sentryEnabled;

    if (shouldEnableSentry && !isSentryInitialized()) {
      initializeSentry(config.sentryDsn).catch(console.error);
    } else if (!shouldEnableSentry && isSentryInitialized()) {
      disableSentry().catch(console.error);
    }
  }, [config.sentryDsn, config.sentryEnabled]);

  return <>{children}</>;
}
