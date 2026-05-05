/**
 * TourLauncherRoute — synthetic route at `/tour` that fires the welcome tour
 * overlay and immediately navigates back to the home page.
 *
 * The actual tour modal is mounted globally (via `<WelcomeTourFlow />` in
 * AppRouter), so once `start()` is called the modal opens regardless of the
 * current route. We bounce the user to `/` underneath so closing the modal
 * lands them in the feed rather than a blank /tour page.
 *
 * Used by the "Tour" sidebar entry (default-hidden, surfaces in More menu).
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useWelcomeTour } from '@/hooks/useWelcomeTour';

export function TourLauncherRoute() {
  const { start } = useWelcomeTour();
  const navigate = useNavigate();

  useEffect(() => {
    start();
    navigate('/', { replace: true });
  }, [start, navigate]);

  return null;
}
