/**
 * Persists the last visited path for each main tab.
 * Uses sessionStorage so tab positions survive page reloads (fixes
 * "Bottom Tabs & Stack Preservation" Google Play warning).
 */

const TAB_ROOTS = ['/', '/muszerfal', '/eszkozok', '/beallitasok'];
const STORAGE_KEY = 'nexus_tab_history';

const DEFAULTS = {
  '/':            '/',
  '/muszerfal':   '/muszerfal',
  '/eszkozok':    '/eszkozok',
  '/beallitasok': '/beallitasok',
};

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(map) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

// In-memory mirror (avoids repeated JSON.parse on every navigation)
let tabHistory = load();

/** Given a pathname, return which tab root it belongs to (or null). */
export function getTabRoot(pathname) {
  if (pathname === '/') return '/';
  for (const root of TAB_ROOTS) {
    if (root !== '/' && pathname.startsWith(root)) return root;
  }
  // Tools sub-paths belong to /eszkozok
  if (
    pathname.startsWith('/tools/') || [
      '/contacts', '/reminders', '/smarthome', '/routines', '/holding',
      '/legal', '/automotive', '/retail', '/diagnostics', '/gmail',
      '/locations', '/habits', '/obd2', '/jelentesek', '/memoria',
    ].includes(pathname)
  ) return '/eszkozok';
  return null;
}

/** Record that a tab was visited at this path. */
export function recordTabPath(pathname) {
  const root = getTabRoot(pathname);
  if (root) {
    tabHistory[root] = pathname;
    save(tabHistory);
  }
}

/** Get the last path for a tab root (falls back to root itself). */
export function getLastTabPath(root) {
  return tabHistory[root] || root;
}

/** Reset a tab back to its root (call when user taps the active tab again). */
export function resetTabPath(root) {
  tabHistory[root] = root;
  save(tabHistory);
}