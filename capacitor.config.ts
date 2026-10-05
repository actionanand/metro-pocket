import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.actionanand.metropocket.app',
  appName: 'MetroPocket',
  webDir: 'www',
  server: { androidScheme: 'https' },
  android: { backgroundColor: '#f4faf7' },
};

export default config;
