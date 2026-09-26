import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * A Back action that stays inside the app: pops one entry when there is
 * in-app history, and goes home otherwise.
 *
 * `window.history.length` can't tell those apart — it counts the tab's earlier
 * sites too, so on a cold load of a shared link (arriving from a search result
 * or another site) Back left the app. React Router stamps each entry it pushes
 * with an `idx`, which is 0 on the entry the app was loaded on.
 */
export function useGoBack(): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/');
  }, [navigate]);
}
