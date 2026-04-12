import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pub.ditto.app',
  appName: 'Ditto',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  },
  android: {
    // Enable safe area handling for notches and navigation bars
    allowMixedContent: false,
    backgroundColor: '#14161f'
  },
  ios: {
    backgroundColor: '#14161f',
    contentInset: 'never',
    scheme: 'Ditto'
  },
  plugins: {
    SystemBars: {
      // Inject --safe-area-inset-* CSS variables on Android to work around
      // a Chromium bug (<140) where env(safe-area-inset-*) reports 0.
      insetsHandling: 'css',
    },
  },
};

export default config;
