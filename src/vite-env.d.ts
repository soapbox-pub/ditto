/// <reference types="vite/client" />

// Fontsource packages export CSS — they have no TS declarations
declare module '@fontsource-variable/*';
declare module '@fontsource/comic-relief/*';

/**
 * Build-time configuration injected by Vite from ditto.json.
 * `null` when no config file was provided at build time.
 */
declare const __DITTO_CONFIG__: Partial<import('@/contexts/AppContext').AppConfig> | null;
