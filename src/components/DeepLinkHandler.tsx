import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

/**
 * Handles deep links from ditto.pub on native platforms.
 * Listens for appUrlOpen events and navigates to the corresponding route.
 * Must be rendered inside a <BrowserRouter>.
 */
export function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    async function setup() {
      const { App } = await import('@capacitor/app');

      // Handle URLs opened while the app is already running
      const listener = await App.addListener('appUrlOpen', (event) => {
        try {
          const url = new URL(event.url);
          const path = url.pathname + url.search + url.hash;
          if (path) {
            navigate(path);
          }
        } catch {
          // Invalid URL, ignore
        }
      });

      cleanup = () => listener.remove();
    }

    setup();

    return () => {
      cleanup?.();
    };
  }, [navigate]);

  return null;
}
