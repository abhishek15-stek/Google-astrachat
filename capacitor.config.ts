import type { CapacitorConfig } from '@capacitor/cli';

/**
 * AstraChat - Capacitor config for native Android wrapper.
 *
 * To build:
 *   1) Export project to GitHub, git pull locally
 *   2) npm install
 *   3) npx cap add android
 *   4) npm run build && npx cap sync
 *   5) npx cap run android   (requires Android Studio)
 *
 * For real full-screen capture on Android (not just the current tab),
 * install a native screen-recording plugin AFTER `cap add android`, e.g.:
 *   npm i @capgo/capacitor-screen-recorder
 * and import + use it from src/lib/nativeShare.ts (already wired up).
 */
const config: CapacitorConfig = {
  appId: 'app.lovable.35acbe5ca6a64af2984f5c63e1fd0fe8',
  appName: 'astrachat',
  webDir: 'dist',
  server: {
    // Hot-reload from the Lovable preview while developing.
    // Remove `url` for a production APK so it loads the bundled webDir.
    url: 'https://35acbe5c-a6a6-4af2-984f-5c63e1fd0fe8.lovableproject.com?forceHideBadge=true',
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
