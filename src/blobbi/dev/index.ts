/**
 * Blobbi Dev Tools Module - DEV MODE ONLY
 * 
 * Development-only tools for testing Blobbi features.
 * These components and hooks should never be used in production.
 */

/**
 * Check if we're running in localhost development mode.
 * 
 * This is a stricter check than `import.meta.env.DEV` because:
 * - `import.meta.env.DEV` may still be true in some deployment scenarios
 * - We explicitly check for localhost hostnames to ensure dev tools
 *   never appear on deployed environments
 * 
 * Use this for any UI that should ONLY be visible during local development.
 */
export function isLocalhostDev(): boolean {
  // Must be in Vite's dev mode
  if (!import.meta.env.DEV) {
    return false;
  }
  
  // Must be running on localhost (browser environment check)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  }
  
  // SSR or non-browser: fall back to DEV only
  return false;
}

export { BlobbiDevEditor, type BlobbiDevUpdates } from './BlobbiDevEditor';
export { useBlobbiDevUpdate } from './useBlobbiDevUpdate';

// Emotion testing tools
export { EmotionDevProvider, useEmotionDev, useEffectiveEmotion } from './EmotionDevContext';
export { BlobbiEmotionPanel } from './BlobbiEmotionPanel';
