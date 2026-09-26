import { useState, useEffect } from 'react';
import TutorialOverlay from '@/components/tutorial/TutorialOverlay';
import { jarvis } from '@/api/jarvisClient';
import { MapPin, Plus, X, Loader2, Navigation, Home, Briefcase, ShoppingCart, Activity, Bell, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { requestNotificationPermission, getPermissionStatus } from '@/lib/pushNotifications';
import { useLang } from '@/lib/i18n';
import PullToRefresh from '@/components/common/PullToRefresh';
import MobileSelect from '@/components/common/MobileSelect';

const TYPE_CONFIG = {
  bolt: { label: 'Bolt', icon: ShoppingCart, color: 'text-green-400', bg: 'bg-green-400/10' },
  otthon: { label: 'Otthon', icon: Home, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  munka: { label: 'Munka', icon: Briefcase, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  orvos: { label: 'Orvos', icon: Activity, color: 'text-red-400', bg: 'bg-red-400/10' },
  edzes: { label: 'Edzés', icon: Activity, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  egyeb: { label: 'Egyéb', icon: MapPin, color: 'text-muted-foreground', bg: 'bg-secondary' },
};

export default function LocationsPage() {
  const { t, lang } = useLang();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [locating, setLocating] = useState(false);
  const [itemInput, setItemInput] = useState('');
  const [notifStatus, setNotifStatus] = useState(getPermissionStatus());
  const [geoError, setGeoError] = useState('');
  const [form, setForm] = useState({
    name: '', type: 'bolt', latitude: '', longitude: '',
    radius_meters: 200, reminder_message: '', shopping_items: []
  });

  const handleRequestNotif = async () => {
    const result = await requestNotificationPermission();
    setNotifStatus(getPermissionStatus());
  };

  useEffect(() => {
    jarvis.auth.me()
      .then((currentUser) => {
        if (!currentUser?.email) throw new Error('auth_required');
        return jarvis.entities.SavedLocation.filter({ created_by: currentUser.email });
      })
      .then(setLocations)
      .finally(() => setLoading(false));
  }, []);

  const getCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoError(t('geo_not_supported'));
      return;
    }
    setGeoError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      setForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
      setLocating(false);
    }, (error) => {
      console.error('Geolocation error:', error);
      setGeoError(t('geo_read_error'));
      setLocating(false);
    });
  };

  const addItem = () => {
    if (!itemInput.trim()) return;
    setForm(f => ({ ...f, shopping_items: [...f.shopping_items, itemInput.trim()] }));
    setItemInput('');
  };

  const addLocation = async () => {
    if (!form.name.trim() || !form.latitude || !form.longitude) return;
    const currentUser = await jarvis.auth.me().catch(() => null);
    if (!currentUser?.email) return;
    const created = await jarvis.entities.SavedLocation.create({
      ...form,
      created_by: currentUser.email,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      radius_meters: parseInt(form.radius_meters) || 200,
    });
    setLocations(prev => [created, ...prev]);
    setForm({ name: '', type: 'bolt', latitude: '', longitude: '', radius_meters: 200, reminder_message: '', shopping_items: [] });
    setShowAdd(false);
  };

  const deleteLocation = async (id) => {
    const currentUser = await jarvis.auth.me().catch(() => null);
    const location = locations.find((item) => item.id === id);
    if (!currentUser?.email || location?.created_by !== currentUser.email) return;
    const { deleteOwnedEntity } = await import('@/lib/ownedEntityHelpers');
    await deleteOwnedEntity(jarvis.entities.SavedLocation, id);
    setLocations(prev => prev.filter(l => l.id !== id));
  };

  const locationsTutorial = [
    {
      icon: '📍',
      title: lang === 'hu' ? 'GPS Helyek mentése' : 'Save GPS locations',
      description: lang === 'hu' ? 'Tárold el fontos helyeket és állíts be geofence triggereket.' : 'Store important places and set geofence triggers.',
      hint: lang === 'hu' ? 'Kategóriák: bolt, munka, otthon, orvos, edzés, egyéb' : 'Categories: shop, home, work, doctor, exercise, other',
    },
    {
      icon: '🚨',
      title: lang === 'hu' ? 'Geofence automatizálás' : 'Geofence automation',
      description: lang === 'hu' ? 'Automatikus emlékeztetők és műveletek, amikor belépsz vagy kilépsz egy helyről.' : 'Automatic reminders and actions when you enter or leave a place.',
      hint: lang === 'hu' ? 'Pl. "otthon" - villanyt bekapcsolni, "bolt" - bevásárlólista' : 'Example: "home" - turn lights on, "shop" - shopping list',
    },
    {
      icon: '🗺️',
      title: lang === 'hu' ? 'Kezdj el!' : 'Get started!',
      description: lang === 'hu' ? 'Adj hozzá az első helyedet és állíts be triggereket.' : 'Add your first place and configure triggers.',
      hint: lang === 'hu' ? 'Kattints a térképre vagy adj meg koordinátákat manuálisan' : 'Tap the map or enter coordinates manually',
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <TutorialOverlay tutorialId="locations-intro" steps={locationsTutorial} />
      <PullToRefresh onRefresh={async () => {
        const currentUser = await jarvis.auth.me().catch(() => null);
        if (!currentUser?.email) return;
        const refreshed = await jarvis.entities.SavedLocation.filter({ created_by: currentUser.email });
        setLocations(refreshed);
      }}>
      <div className="px-4 pt-5 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center">
            <MapPin size={20} className="text-blue-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{t('page_locations')}</h1>
            <p className="text-xs text-muted-foreground">{t('locations_subtitle')}</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
            <Plus size={16} className="text-primary-foreground" />
          </button>
        </div>

        {/* Notification permission banner */}
        <div className={`rounded-2xl p-4 mb-4 border space-y-2 ${
          notifStatus === 'granted'
            ? 'bg-primary/10 border-primary/20'
            : notifStatus === 'denied'
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-yellow-500/10 border-yellow-500/20'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {notifStatus === 'granted'
                ? <Bell size={14} className="text-primary" />
                : <BellOff size={14} className="text-yellow-400" />}
              <p className="text-xs font-semibold text-foreground">
                {notifStatus === 'granted' ? t('locations_notif_granted') : notifStatus === 'denied' ? t('locations_notif_denied') : t('locations_notif_needed')}
              </p>
            </div>
            {notifStatus !== 'granted' && notifStatus !== 'denied' && (
              <button
                onClick={handleRequestNotif}
                className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
              >
                {t('locations_enable')}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {notifStatus === 'granted'
              ? t('locations_notif_granted_desc')
              : notifStatus === 'denied'
              ? t('locations_notif_denied_desc')
              : t('locations_notif_needed_desc')}
          </p>
        </div>

        {geoError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 mb-4 text-sm text-red-400">
            {geoError}
          </div>
        )}

        {/* Location list */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="text-primary animate-spin" /></div>
        ) : locations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{lang === 'hu' ? 'Még nincsenek mentett helyek' : 'No saved locations yet'}</p>
            <button onClick={() => setShowAdd(true)} className="mt-3 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              {lang === 'hu' ? '+ Első hely hozzáadása' : '+ Add first location'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {locations.map(loc => {
              const cfg = TYPE_CONFIG[loc.type] || TYPE_CONFIG.egyeb;
              const Icon = cfg.icon;
              return (
                <div key={loc.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-2xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                      <Icon size={18} className={cfg.color} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">{cfg.label} · {loc.radius_meters}m sugarú zóna</p>
                      {loc.reminder_message && <p className="text-xs text-foreground mt-1">💬 {loc.reminder_message}</p>}
                      {loc.shopping_items?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {loc.shopping_items.map((item, i) => (
                            <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">🛒 {item}</span>
                          ))}
                        </div>
                      )}
                      {loc.last_triggered && (
                        <p className="text-xs text-muted-foreground/60 mt-1">Utoljára aktiválva: {new Date(loc.last_triggered).toLocaleDateString('hu-HU')}</p>
                      )}
                    </div>
                    <button onClick={() => deleteLocation(loc.id)} className="text-muted-foreground/40 hover:text-destructive">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </PullToRefresh>

      {/* Add Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">{lang === 'hu' ? 'Új hely hozzáadása' : 'Add new location'}</h2>
                <button onClick={() => setShowAdd(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>

              <div className="space-y-3">
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder={lang === 'hu' ? 'Hely neve (pl. ALDI, Edzőterem)' : 'Location name (e.g. Aldi, Gym)'} value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

                <MobileSelect
                  value={form.type}
                  onChange={value => setForm(f => ({ ...f, type: value }))}
                  options={Object.entries(TYPE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
                  placeholder={lang === 'hu' ? 'Típus kiválasztása' : 'Select type'}
                />

                {/* GPS */}
                <div className="flex gap-2">
                  <input className="flex-1 bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    placeholder={lang === 'hu' ? 'Szélesség' : 'Latitude'} value={form.latitude}
                    onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
                  <input className="flex-1 bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none border border-border text-foreground"
                    placeholder={lang === 'hu' ? 'Hosszúság' : 'Longitude'} value={form.longitude}
                    onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
                </div>

                <button onClick={getCurrentLocation} disabled={locating}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 text-sm font-medium">
                  {locating ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                  {locating ? (lang === 'hu' ? 'Helymeghatározás...' : 'Locating...') : (lang === 'hu' ? '📍 Jelenlegi helyzet használata' : '📍 Use current location')}
                </button>

                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{lang === 'hu' ? 'Zóna sugara:' : 'Zone radius:'}</span>
                  <input className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground"
                    type="number" value={form.radius_meters}
                    onChange={e => setForm(f => ({ ...f, radius_meters: e.target.value }))} />
                  <span className="text-xs text-muted-foreground">{lang === 'hu' ? 'méter' : 'meters'}</span>
                </div>

                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder={lang === 'hu' ? 'Emlékeztető üzenet (pl. Vegyél tejet!)' : 'Reminder message (e.g. Buy milk!)'} value={form.reminder_message}
                  onChange={e => setForm(f => ({ ...f, reminder_message: e.target.value }))} />

                {/* Shopping items */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">{lang === 'hu' ? 'Bevásárló lista ehhez a helyhez:' : 'Shopping list for this location:'}</p>
                  <div className="flex gap-2">
                    <input className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-border text-foreground"
                      placeholder={lang === 'hu' ? 'Pl. tej, kenyér...' : 'e.g. milk, bread...'} value={itemInput}
                      onChange={e => setItemInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addItem()} />
                    <button onClick={addItem} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm">+</button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {form.shopping_items.map((item, i) => (
                      <button key={i} onClick={() => setForm(f => ({ ...f, shopping_items: f.shopping_items.filter((_, j) => j !== i) }))}
                        className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                        {item} ×
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={addLocation} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm">
                  {lang === 'hu' ? '📍 Hely mentése' : '📍 Save location'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}