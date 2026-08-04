import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter'; // Inter Variable — o'z-o'zidan xosting (tokens.ts: FONT_FAMILY)
import './i18n';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { TickerProvider } from './components/ui';
import { AppSettingsProvider } from './context/AppSettingsContext';
import { AuthProvider } from './context/AuthContext';
import { ConnectionProvider } from './context/ConnectionContext';
import { registerServiceWorker } from './offline/register-sw';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppSettingsProvider>
          <AuthProvider>
            {/* Ulanish holati AuthProvider ICHIDA: navbat foydalanuvchi
                doirasi bilan chegaralanadi (boshqa hisobga yuborilmaydi) */}
            <ConnectionProvider>
              <TickerProvider>
                <App />
              </TickerProvider>
            </ConnectionProvider>
          </AuthProvider>
        </AppSettingsProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Oflayn qobiq — internet yo'q bo'lsa ham ilova ochilishi uchun.
// Dev rejimida va Electron (file://) da o'tkazib yuboriladi.
registerServiceWorker();
