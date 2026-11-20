import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { initAppTheme } from './utils/appSettings.ts';
import './index.css';

initAppTheme();
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);
