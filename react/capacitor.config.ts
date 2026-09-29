import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartgarden.app',
  appName: 'Smart Garden',
  webDir: 'dist',
  android: {
    // Allow ws:// connections to the local MQTT broker
    allowMixedContent: true,
    backgroundColor: '#0f172a',
  },
  server: {
    // Load dashboard from the Vite dev server on the local network
    url: 'http://192.168.1.192:5173',
    cleartext: true,
    androidScheme: 'https',
  },
};

export default config;
