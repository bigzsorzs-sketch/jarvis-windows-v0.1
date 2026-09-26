import { useEffect, useRef } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { CONFIG } from '@/lib/appConfig';
import { logger } from '@/lib/logger';

const MODULE = 'PushNotificationManager';

/**
 * Push Notification Manager — NO polling.
 *
 * Strategy:
 *  - Check once on mount (if permission already granted).
 *  - Re-check when the tab becomes visible again (visibilitychange).
 *  - Exponential backoff on repeated checks within a session to reduce traffic.
 *  - auth.me() is called ONCE at mount and cached — never called per-check.
 *  - All deduplication is scoped to the user's ID.
 */
export default function PushNotificationManager() {
  const userRef        = useRef(null);   // cached user object — avoid repeated auth calls
  const nextAllowedRef = useRef(0);      // timestamp: earliest time the next check is allowed
  const intervalRef    = useRef(CONFIG.NOTIF_MIN_INTERVAL); // current backoff interval

  // ── Helper: show notifications via Service Worker ──────────────────────────
  async function showNotifications(notifications) {
    if (!notifications?.length) return;

    const userId    = userRef.current?.id;
    const storageKey = userId ? `shownNotifications_${userId}` : 'shownNotifications';
    const now       = Date.now();

    const stored   = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; } })();
    const shownMap = stored.filter(e => (now - e.ts) < CONFIG.NOTIF_TTL).slice(-CONFIG.NOTIF_MAX_STORED);
    const shownTags = new Set(shownMap.map(e => e.tag));

    const fresh = notifications.filter(n => n?.tag && !shownTags.has(n.tag));
    if (!fresh.length) return;

    const reg = await navigator.serviceWorker.ready.catch(err => {
      logger.warn(MODULE, 'SW not ready', { err: err?.message });
      return null;
    });
    if (!reg) return;

    for (const notif of fresh) {
      try {
        await reg.showNotification(notif.title, {
          body: notif.body,
          tag:  notif.tag,
          icon: '/icon-192x192.svg',
          badge: '/icon-192x192.svg',
          requireInteraction: notif.requireInteraction ?? false,
          data: notif.data,
        });
        shownMap.push({ tag: notif.tag, ts: now });
      } catch (err) {
        logger.warn(MODULE, 'showNotification failed', { tag: notif.tag, err: err?.message });
      }
    }

    localStorage.setItem(storageKey, JSON.stringify(shownMap.slice(-CONFIG.NOTIF_MAX_STORED)));
    logger.info(MODULE, `Showed ${fresh.length} new notification(s)`);
  }

  // ── Core check function (runs at most once per backoff interval) ───────────
  async function checkNotifications() {
    const now = Date.now();
    if (now < nextAllowedRef.current) return; // backoff guard

    const permission = 'Notification' in window ? Notification.permission : 'default';
    if (permission !== 'granted' || !('serviceWorker' in navigator)) return;

    // Mark next allowed time BEFORE the async call (prevents concurrent runs)
    nextAllowedRef.current = now + intervalRef.current;

    try {
      const response = await jarvis.functions.invoke('sendPushNotifications', {});
      const { notifications } = response?.data ?? {};
      await showNotifications(notifications);

      // Success: reset to minimum interval
      intervalRef.current = CONFIG.NOTIF_MIN_INTERVAL;

    } catch (err) {
      // Failure: back off exponentially up to max
      intervalRef.current = Math.min(
        intervalRef.current * CONFIG.NOTIF_BACKOFF_FACTOR,
        CONFIG.NOTIF_MAX_INTERVAL
      );
      logger.warn(MODULE, 'Notification check failed, backing off', {
        nextInterval: intervalRef.current,
        err: err?.message,
      });
    }
  }

  useEffect(() => {
    // ── One-time auth: cache the user so we never call auth.me() repeatedly ──
    jarvis.auth.me().then(u => {
      userRef.current = u ?? null;
      // Initial check on mount
      checkNotifications();
    }).catch(err => {
      logger.warn(MODULE, 'Could not resolve user', { err: err?.message });
    });

    // ── Visibility-based trigger: re-check when user returns to the tab ───────
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkNotifications();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []); // mount-only — all live state is in refs

  return null;
}