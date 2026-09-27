const KEY = 'jarvisThemeMode';

function storageGet(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { window.localStorage.setItem(key, value); } catch {} }

export function getThemeMode() {
  const saved = storageGet(KEY) || storageGet('theme');
  return ['light','dark','system'].includes(saved) ? saved : 'system';
}

export function resolveTheme(mode = getThemeMode()) {
  if (mode === 'system') return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
}

export function applyThemeMode(mode = getThemeMode()) {
  const normalized = ['light','dark','system'].includes(mode) ? mode : 'system';
  const resolved = resolveTheme(normalized);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = normalized;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#1a2030' : '#ffffff');
  storageSet(KEY, normalized);
  storageSet('theme', normalized);
  window.dispatchEvent(new CustomEvent('jarvis:theme-change', { detail:{ mode:normalized, resolved } }));
  return { mode:normalized, resolved };
}

export function subscribeTheme(callback) {
  const onTheme = (e) => callback(e.detail || applyThemeMode());
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onSystem = () => { if (getThemeMode() === 'system') callback(applyThemeMode('system')); };
  window.addEventListener('jarvis:theme-change', onTheme);
  media?.addEventListener?.('change', onSystem);
  return () => { window.removeEventListener('jarvis:theme-change', onTheme); media?.removeEventListener?.('change', onSystem); };
}
