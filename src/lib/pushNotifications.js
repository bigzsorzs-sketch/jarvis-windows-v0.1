// Web Push Notification system
// Works when app is open in browser. For background notifications,
// a Service Worker + Push Server would be needed (not implemented here).

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return { granted: false, reason: 'not_supported' };
  }
  if (Notification.permission === 'granted') {
    return { granted: true };
  }
  if (Notification.permission === 'denied') {
    return { granted: false, reason: 'denied' };
  }
  const result = await Notification.requestPermission();
  return { granted: result === 'granted', reason: result };
}

export function sendNotification(title, body, options = {}) {
  if (Notification.permission !== 'granted') return false;
  const n = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: options.tag || 'jarvis',
    requireInteraction: options.requireInteraction || false,
    ...options,
  });
  n.onclick = () => {
    window.focus();
    n.close();
  };
  return true;
}

export function isNotificationSupported() {
  return 'Notification' in window;
}

export function getPermissionStatus() {
  if (!('Notification' in window)) return 'not_supported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}