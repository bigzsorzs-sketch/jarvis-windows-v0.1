import { useEffect, useRef } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { CONFIG } from '@/lib/appConfig';
import { logger } from '@/lib/logger';
import { localDateKey } from '@/lib/localDate';

const MODULE = 'PushNotificationManager';

export default function PushNotificationManager() {
  const userRef = useRef(null);
  const nextAllowedRef = useRef(0);
  const intervalRef = useRef(CONFIG.NOTIF_MIN_INTERVAL);

  function notificationStoreKey() {
    const userId = userRef.current?.id;
    return userId ? `shownNotifications_${userId}` : 'shownNotifications';
  }

  function loadShown() {
    try {
      const now = Date.now();
      const stored = JSON.parse(localStorage.getItem(notificationStoreKey()) || '[]');
      return Array.isArray(stored)
        ? stored.filter((entry) => now - Number(entry?.ts || 0) < CONFIG.NOTIF_TTL).slice(-CONFIG.NOTIF_MAX_STORED)
        : [];
    } catch {
      return [];
    }
  }

  async function showNotifications(notifications) {
    if (!notifications?.length || !('Notification' in window) || Notification.permission !== 'granted') return;

    const shown = loadShown();
    const shownTags = new Set(shown.map((entry) => entry.tag));
    const now = Date.now();

    for (const notif of notifications) {
      if (!notif?.tag || shownTags.has(notif.tag)) continue;
      try {
        new Notification(notif.title || 'Jarvis', {
          body: notif.body || '',
          tag: notif.tag,
          requireInteraction: notif.requireInteraction ?? false,
        });
        shown.push({ tag:notif.tag, ts:now });
        shownTags.add(notif.tag);
      } catch (error) {
        logger.warn(MODULE, 'Native notification failed', { tag:notif.tag, err:error?.message });
      }
    }

    localStorage.setItem(notificationStoreKey(), JSON.stringify(shown.slice(-CONFIG.NOTIF_MAX_STORED)));
  }

  async function buildLocalNotifications() {
    const user = userRef.current;
    if (!user?.email) return [];
    const owner = { created_by:user.email };
    const today = localDateKey();
    const shownTags = new Set(loadShown().map(entry => entry.tag));

    const [reminders, todos] = await Promise.all([
      jarvis.entities.Reminder.filter({ ...owner, is_done:false }, 'due_date', 5000).catch(() => []),
      jarvis.entities.TodoItem.filter({ ...owner, is_completed:false }, '-created_date', 30).catch(() => []),
    ]);

    const dueReminders = reminders
      .filter((item) => !shownTags.has(`reminder:${item.id}`) && item?.due_date && item.due_date <= today
        && (!item.due_time || new Date(`${item.due_date}T${item.due_time}`).getTime() <= Date.now()))
      .slice(0, 4)
      .map((item) => ({
        tag:`reminder:${item.id}`,
        title:item.due_date < today ? 'Lejárt emlékeztető' : 'Mai emlékeztető',
        body:item.title || item.description || 'Van egy esedékes emlékeztetőd.',
        requireInteraction:item.due_date < today,
      }));

    const importantTodos = todos
      .filter((item) => !shownTags.has(`todo:${item.id}`))
      .filter((item) => ['magas','surgos','high','urgent'].includes(String(item?.priority || '').toLowerCase()))
      .slice(0, 2)
      .map((item) => ({
        tag:`todo:${item.id}`,
        title:'Fontos teendő',
        body:item.title || item.description || 'Van egy fontos nyitott teendőd.',
        requireInteraction:false,
      }));

    return [...dueReminders, ...importantTodos];
  }

  async function checkNotifications() {
    const now = Date.now();
    if (now < nextAllowedRef.current) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    nextAllowedRef.current = now + intervalRef.current;

    try {
      const notifications = await buildLocalNotifications();
      await showNotifications(notifications);
      intervalRef.current = CONFIG.NOTIF_MIN_INTERVAL;
    } catch (error) {
      intervalRef.current = Math.min(
        intervalRef.current * CONFIG.NOTIF_BACKOFF_FACTOR,
        CONFIG.NOTIF_MAX_INTERVAL
      );
      logger.warn(MODULE, 'Notification check failed, backing off', {
        nextInterval:intervalRef.current,
        err:error?.message,
      });
    }
  }

  useEffect(() => {
    let cancelled = false;

    jarvis.auth.me().then((user) => {
      if (cancelled) return;
      userRef.current = user ?? null;
      void checkNotifications();
    }).catch((error) => {
      logger.warn(MODULE, 'Could not resolve user', { err:error?.message });
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkNotifications();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = setInterval(() => { if (!cancelled) void checkNotifications(); }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
