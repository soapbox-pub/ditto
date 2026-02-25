import { useMemo } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { NestsApi } from '@/lib/nestsApi';

/**
 * Returns a memoised NestsApi instance configured with the app's
 * API URL and the current user's signer (if logged in).
 *
 * When no user is logged in the API client can still be used for
 * guest operations (joinRoom as guest, getRoomInfo).
 */
export function useNestsApi(): NestsApi {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  return useMemo(
    () => new NestsApi(config.nestsApiUrl, user ?? undefined),
    [config.nestsApiUrl, user],
  );
}
