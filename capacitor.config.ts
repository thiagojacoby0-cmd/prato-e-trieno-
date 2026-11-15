import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.pratotreino.app',
  appName: 'PRATO & TREINO',
  webDir: 'dist',
  backgroundColor: '#0A0D0B',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0A0D0B',
  },
};

export default config;
