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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppSettingsProvider>
          <AuthProvider>
            <TickerProvider>
              <App />
            </TickerProvider>
          </AuthProvider>
        </AppSettingsProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
