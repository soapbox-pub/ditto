import { useGoogleFont } from '@/hooks/useGoogleFont';

/**
 * Headless component that applies the user's saved Google Font preference on app startup.
 * Mount this near the root of the app tree so the font is loaded before any content renders.
 */
export function GoogleFontLoader(): null {
  useGoogleFont();
  return null;
}
