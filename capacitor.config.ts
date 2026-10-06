import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pub.ditto.app',
  appName: 'Ditto',
  webDir: 'dist',
  // Debug builds otherwise log every bridge call with its payload stringified
  // into logcat, which costs main-thread time on every plugin call and skews
  // on-device profiling. Web console output is still on chrome://inspect;
  // release builds never logged.
  loggingBehavior: 'none',
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
