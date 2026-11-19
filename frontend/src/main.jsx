import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './i18n';

const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  const url = typeof resource === 'string' ? resource : (resource?.url || '');
  const isApiCall = url.startsWith('/api/');
  const isAuthEndpoint = url.startsWith('/api/v1/auth/');

  if (isApiCall && !isAuthEndpoint) {
    config = { ...(config || {}) };
    const headers = new Headers(
      config.headers || (resource instanceof Request ? resource.headers : undefined)
    );
    try {
      const stored = localStorage.getItem('erp_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.currentRole && !headers.has('X-User-Role')) {
          headers.set('X-User-Role', parsed.currentRole);
        }
      }
      const token = localStorage.getItem('wme_access_token');
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (e) {}
    config.headers = headers;
  }

  const response = await originalFetch(resource, config);

  if (isApiCall && !isAuthEndpoint && response.status === 401) {
    try {
      const hasSession = Boolean(localStorage.getItem('erp_auth') || localStorage.getItem('wme_access_token'));
      if (hasSession) {
        localStorage.removeItem('wme_access_token');
        localStorage.removeItem('erp_auth');
        window.dispatchEvent(new Event('wme-auth-expired'));
      }
    } catch (e) {}
  }

  return response;
};

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
