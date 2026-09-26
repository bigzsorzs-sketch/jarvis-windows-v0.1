import { useEffect, useState, useRef } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, X } from 'lucide-react';
import { requestNotificationPermission, sendNotification, getPermissionStatus } from '@/lib/pushNotifications';
import { evaluateGeofenceRules } from '@/lib/ruleEngine';

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const LOCATION_CACHE_TTL = 5 * 60 * 1000; // refresh locations every 5 min

export default function LocationSensor() {
  const [alert, setAlert] = useState(null);
  const lastTriggered = useRef({});
  const locationsCache = useRef({ data: [], fetchedAt: 0 });
  const insideZones = useRef(new Set()); // track which zones user is currently inside

  // Request notification permission on mount (silently, no UI blocker)
  useEffect(() => {
    if (getPermissionStatus() === 'default') {
      requestNotificationPermission();
    }
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;

      // Only re-fetch locations from DB every 5 minutes — not every GPS tick
      const now = Date.now();
      if (now - locationsCache.current.fetchedAt > LOCATION_CACHE_TTL) {
        const user = await jarvis.auth.me().catch(() => null);
        const fetched = user?.email ? await jarvis.entities.SavedLocation.filter({ created_by: user.email }).catch(() => []) : [];
        locationsCache.current = { data: fetched, fetchedAt: now };
      }
      const locations = locationsCache.current.data;

      for (const loc of locations) {
        const dist = getDistance(latitude, longitude, loc.latitude, loc.longitude);
        const radius = loc.radius_meters || 200;
        const wasInside = insideZones.current.has(loc.id);
        const isInside = dist <= radius;

        if (isInside && !wasInside) {
          // ENTER event
          insideZones.current.add(loc.id);
          const cooldown = 5 * 60 * 1000;
          if (!lastTriggered.current[`enter_${loc.id}`] || now - lastTriggered.current[`enter_${loc.id}`] > cooldown) {
            lastTriggered.current[`enter_${loc.id}`] = now;
            await jarvis.entities.SavedLocation.update(loc.id, { last_triggered: new Date().toISOString() });

            const body = [
              loc.reminder_message,
              loc.shopping_items?.length ? `🛒 ${loc.shopping_items.join(', ')}` : null,
            ].filter(Boolean).join('\n');
            sendNotification(`📍 Közel vagy: ${loc.name}`, body || 'Közel vagy egy mentett helyhez!', {
              tag: `geofence-${loc.id}`,
              requireInteraction: true,
            });

            setAlert(loc);
            setTimeout(() => setAlert(null), 15000);
            evaluateGeofenceRules('geofence_enter', loc.id).catch(() => {});
          }
        } else if (!isInside && wasInside) {
          // LEAVE event
          insideZones.current.delete(loc.id);
          const cooldown = 5 * 60 * 1000;
          if (!lastTriggered.current[`leave_${loc.id}`] || now - lastTriggered.current[`leave_${loc.id}`] > cooldown) {
            lastTriggered.current[`leave_${loc.id}`] = now;
            evaluateGeofenceRules('geofence_leave', loc.id).catch(() => {});
          }
        }
      }
    }, () => console.warn('GPS hiba történt.'), { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 });

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-4 right-4 max-w-md mx-auto z-[100] bg-card border border-primary/50 rounded-2xl p-4 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <MapPin size={16} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">📍 Közel vagy: {alert.name}</p>
              {alert.reminder_message && (
                <p className="text-xs text-muted-foreground mt-1">{alert.reminder_message}</p>
              )}
              {alert.shopping_items?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {alert.shopping_items.map((item, i) => (
                    <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                      🛒 {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setAlert(null)}>
              <X size={15} className="text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}