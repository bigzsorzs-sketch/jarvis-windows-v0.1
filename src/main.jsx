import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { APP_LOADING_MESSAGE, APP_OFFLINE_MESSAGE } from '@/lib/appVersion'

const rootEl = document.getElementById('root')

const isDev = import.meta.env?.DEV === true;
const runtimeMessage = (kind) => {
  const lang = navigator.language?.toLowerCase().startsWith('hu') ? 'hu' : 'en';
  const messages = {
    hu: kind === 'network' ? APP_OFFLINE_MESSAGE : 'Az alkalmazás hibába ütközött. Frissítsd az oldalt.',
    en: kind === 'network' ? 'You are offline. Please check your connection.' : 'The app encountered an error. Please refresh the page.',
  };
  return messages[lang];
};

function showBootError(message) {
  if (rootEl && !rootEl.innerHTML.trim()) {
    rootEl.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#111827;color:#f9fafb;font-family:Open Sans,sans-serif;padding:24px;text-align:center;">${message}</div>`;
  }
}

window.addEventListener('error', (event) => {
  const detail = event.error?.stack || event.message || event.error || event;
  console.error('[runtime:error]', detail);
  showBootError(runtimeMessage('runtime'));
});

window.addEventListener('unhandledrejection', (event) => {
  if (!isDev) event.preventDefault();
  const detail = event.reason?.stack || event.reason || event;
  console.error('[runtime:unhandledrejection]', detail);
  showBootError(runtimeMessage('runtime'));
});

window.addEventListener('offline', () => {
  const bootStatus = document.getElementById('boot-status')
  if (bootStatus) bootStatus.textContent = runtimeMessage('network')
})

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <App />
  )
}