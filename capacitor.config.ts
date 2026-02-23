import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pub.ditto.app',
  appName: 'ditto',
  webDir: 'dist',
  server: {
    // Handle deep links from your domain
    hostname: 'ditto.pub',
    androidScheme: 'https'
  },
  android: {
    // Enable safe area handling for notches and navigation bars
    allowMixedContent: false,
    backgroundColor: '#14161f'
  }
};

export default config;
