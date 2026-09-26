import { useState, useEffect } from 'react';
import TutorialOverlay from '@/components/tutorial/TutorialOverlay';
import { jarvis } from '@/api/jarvisClient';
import { Home, Plus, X, Loader2, Wifi, WifiOff, Trash2 } from 'lucide-react';
import MobileSelect from '@/components/common/MobileSelect';
import { motion, AnimatePresence } from 'framer-motion';
import { ENV_TOOLS } from '@/lib/environmentTools';
import { useLang } from '@/lib/i18n';

const DEVICE_ICONS = { light: '💡', plug: '🔌', camera: '📷', thermostat: '🌡️', lock: '🔒', sensor: '📡', other: '⚙️' };
const maskNetworkValue = (value) => value ? String(value).replace(/\d+$/g, '***').replace(/\/\/([^/:]+)(:\d+)?/g, '//***$2') : '';
const SCENE_ICONS = [
  { name: 'Esti mód', icon: '🌙', actions: [{ type: 'device', device: 'összes lámpa', command: 'off' }] },
  { name: 'Reggeli mód', icon: '☀️', actions: [{ type: 'device', device: 'nappali lámpa', command: 'on' }] },
  { name: 'Hazaérkezés', icon: '🏠', actions: [] },
  { name: 'Elhagyás', icon: '🚪', actions: [] },
];

export default function SmartHome() {
  const { t } = useLang();
  const [devices, setDevices] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionResult, setActionResult] = useState('');
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ name: '', type: 'light', location: '', ip_address: '', api_url: '' });
  const [controlling, setControlling] = useState(null);

  useEffect(() => {
    jarvis.auth.me()
      .then((user) => {
        if (!user?.email) throw new Error('auth_required');
        return Promise.all([
          jarvis.entities.SmartDevice.filter({ created_by: user.email }),
          jarvis.entities.Scene.filter({ created_by: user.email }),
        ]);
      })
      .then(([deviceList, sceneList]) => {
        setDevices(deviceList);
        setScenes(sceneList);
      })
      .catch(() => {
        setActionResult(t('generic_load_error'));
      });
  }, [t]);

  const addDevice = async () => {
    if (!deviceForm.name.trim()) return;
    const currentUser = await jarvis.auth.me();
    if (!currentUser?.email) return;
    const created = await jarvis.entities.SmartDevice.create({ ...deviceForm, status: 'unknown', created_by: currentUser.email });
    setDevices(prev => [created, ...prev]);
    setDeviceForm({ name: '', type: 'light', location: '', ip_address: '', api_url: '' });
    setShowAddDevice(false);
  };

  const deleteDevice = async (id) => {
    await jarvis.entities.SmartDevice.delete(id);
    setDevices(prev => prev.filter(d => d.id !== id));
  };

  const controlDevice = async (device, command) => {
    setControlling(device.id + command);
    const result = await ENV_TOOLS.control_device({ device_name: device.name, command });
    setDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: command } : d));
    setActionResult(result.message);
    setTimeout(() => setActionResult(''), 3000);
    setControlling(null);
  };

  const triggerScene = async (scene) => {
    setLoading(true);
    const result = await ENV_TOOLS.trigger_scene({ scene_name: scene.name });
    setActionResult(result.message);
    await jarvis.entities.Scene.update(scene.id, { last_triggered: new Date().toISOString() });
    setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, last_triggered: new Date().toISOString() } : s));
    setTimeout(() => setActionResult(''), 4000);
    setLoading(false);
  };

  const createDefaultScenes = async () => {
    const currentUser = await jarvis.auth.me();
    if (!currentUser?.email) return;
    for (const s of SCENE_ICONS) {
      const exists = scenes.find(sc => sc.name === s.name);
      if (!exists) {
        const created = await jarvis.entities.Scene.create({ name: s.name, icon: s.icon, actions: s.actions, created_by: currentUser.email });
        setScenes(prev => [...prev, created]);
      }
    }
  };

  const smartHomeTutorial = [
    {
      icon: '🏠',
      title: 'Smart Home vezérlés',
      description: 'Eszközöket és szobákat kezelhetsz egy intuitív interfészen.',
      hint: 'Minden szoba követ és bekapcsolt eszközöket mutat',
    },
    {
      icon: '🎨',
      title: 'Jelenetek és rutinok',
      description: 'Hozz létre szcenatókat többeszközös automatizáláshoz.',
      hint: 'Pl. "Jó éjszakát" - összes lámpa ki, zár be, szellőző off',
    },
    {
      icon: '⚡',
      title: 'Kezdj el!',
      description: 'Add hozzá az első eszközödet vagy szobádat.',
      hint: 'Hozz létre egy szobát, majd eszközöket benne',
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <TutorialOverlay tutorialId="smarthome-intro" steps={smartHomeTutorial} />
      <div className="px-4 pt-5 pb-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center">
            <Home size={20} className="text-blue-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{t('smart_home')}</h1>
            <p className="text-xs text-muted-foreground">{devices.length} {t('smarthome_sub')} · {scenes.length} {t('smarthome_scenes')}</p>
          </div>
        </div>

        {/* Action result */}
        <AnimatePresence>
          {actionResult && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-primary/10 border border-primary/30 rounded-2xl px-4 py-3 text-sm text-primary whitespace-pre-line">
              {actionResult}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scenes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t('scenes')}</h2>
            {scenes.length === 0 && (
              <button onClick={createDefaultScenes} className="text-xs text-primary">{t('add_defaults')}</button>
            )}
          </div>
          {scenes.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-4 text-center text-xs text-muted-foreground">
              {t('no_scenes')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {scenes.map(scene => (
                <button key={scene.id} onClick={() => triggerScene(scene)}
                  disabled={loading}
                  className="bg-card border border-border rounded-2xl p-4 text-left hover:bg-secondary transition-all active:scale-95">
                  <p className="text-2xl mb-2">{scene.icon || '🏠'}</p>
                  <p className="text-sm font-semibold text-foreground">{scene.name}</p>
                  {scene.last_triggered && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(scene.last_triggered).toLocaleDateString('hu-HU')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Devices */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t('devices')}</h2>
            <button onClick={() => setShowAddDevice(true)} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
              <Plus size={14} className="text-primary-foreground" />
            </button>
          </div>

          {devices.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center">
              <Home size={32} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">{t('no_devices_desc')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('no_devices_sub')}</p>
              <button onClick={() => setShowAddDevice(true)} className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                {t('add_device')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map(device => (
                <div key={device.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                  <span className="text-2xl">{DEVICE_ICONS[device.type] || '⚙️'}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{device.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {device.location && <span className="text-xs text-muted-foreground">{device.location}</span>}
                      <div className={`flex items-center gap-1 text-xs ${device.ip_address ? 'text-green-400' : 'text-muted-foreground'}`}>
                        {device.ip_address ? <Wifi size={10} /> : <WifiOff size={10} />}
                        {device.ip_address ? maskNetworkValue(device.ip_address) : t('no_ip')}
                      </div>
                    </div>
                  </div>
                  {/* Toggle */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => controlDevice(device, 'on')}
                      disabled={!!controlling}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${device.status === 'on' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                      {controlling === device.id + 'on' ? <Loader2 size={12} className="animate-spin" /> : t('turn_on')}
                    </button>
                    <button
                      onClick={() => controlDevice(device, 'off')}
                      disabled={!!controlling}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${device.status === 'off' ? 'bg-secondary border border-primary text-foreground' : 'bg-secondary text-muted-foreground'}`}>
                      {controlling === device.id + 'off' ? <Loader2 size={12} className="animate-spin" /> : t('turn_off')}
                    </button>
                    <button onClick={() => deleteDevice(device.id)} className="text-muted-foreground/40 hover:text-red-400 px-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info banner */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-foreground mb-1">ℹ️ {t('local_network')}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{t('local_network_desc')}</p>
        </div>
      </div>

      {/* Add Device Modal */}
      <AnimatePresence>
        {showAddDevice && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md mx-auto bg-card rounded-t-3xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-foreground">{t('add_device_title')}</h2>
                <button onClick={() => setShowAddDevice(false)}><X size={18} className="text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder={t('device_name_placeholder')} value={deviceForm.name} onChange={e => setDeviceForm(f => ({ ...f, name: e.target.value }))} />
                <MobileSelect
                  value={deviceForm.type}
                  onChange={v => setDeviceForm(f => ({ ...f, type: v }))}
                  options={['light','plug','camera','thermostat','lock','sensor','other'].map(t => ({ value: t, label: `${DEVICE_ICONS[t]} ${t}` }))}
                  placeholder={t('device_type_placeholder')}
                />
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground"
                  placeholder={t('device_location_placeholder')} value={deviceForm.location} onChange={e => setDeviceForm(f => ({ ...f, location: e.target.value }))} />
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground font-mono"
                  placeholder={t('device_ip_placeholder')} value={deviceForm.ip_address} onChange={e => setDeviceForm(f => ({ ...f, ip_address: e.target.value }))} />
                <input className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none border border-border text-foreground font-mono"
                  placeholder={t('device_api_placeholder')} value={deviceForm.api_url} onChange={e => setDeviceForm(f => ({ ...f, api_url: e.target.value }))} />
                <button onClick={addDevice} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">{t('device_add_btn')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}