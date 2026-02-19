import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mew.app',
  appName: 'mew',
  webDir: 'dist',
  server: {
    // Handle deep links from your domain
    hostname: 'mew.app',
    androidScheme: 'https'
  },
  android: {
    // Enable safe area handling for notches and navigation bars
    allowMixedContent: false,
    backgroundColor: '#ffffff'
  }
};

export default config;
