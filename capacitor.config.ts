import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.pratotreino.app',
  appName: 'PRATO & TREINO',
  webDir: 'dist',
  backgroundColor: '#061314',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#061314',
  },
};

export default config;
