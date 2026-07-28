import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setCanvasNavigateRef } from '@/lib/canvasNavigateRef';

/**
 * Captures `useNavigate()` from inside the BrowserRouter and stores it in a
 * module-level ref so the Canvas adapter (mounted outside the router) can
 * still push routes.
 */
export function CanvasNavigateBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    setCanvasNavigateRef(navigate);
    return () => setCanvasNavigateRef(null);
  }, [navigate]);
  return null;
}