import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

import '@fontsource-variable/inter';

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Remove the HTML preloader after React has painted and clear the
// inline body background so CSS variables control the theme from here.
requestAnimationFrame(() => {
  document.getElementById('preloader')?.remove();
  document.body.removeAttribute('style');
});
