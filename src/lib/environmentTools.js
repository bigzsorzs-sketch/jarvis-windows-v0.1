import { jarvis } from '@/api/jarvisClient';

async function getCurrentUserOwnerFilter() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('A saját adataid használatához be kell jelentkezned.');
  return { currentUser, ownerFilter: { created_by: currentUser.email } };
}

// ─── DEVICE CONTROL ──────────────────────────────────────────────────────────
// Physical local-network actions are executed only by Electron's main process.
// The renderer never sends direct device HTTP requests, so the Policy Engine
// remains the mandatory gate for Jarvis-initiated physical device actions.
async function callDeviceAPI(device, command, { readOnly = false } = {}) {
  if (!device.api_url && !device.ip_address) return null;
  const bridge = window.jarvisDesktop?.localDeviceRequest;
  if (!bridge) return null;
  const base = device.api_url || `http://${device.ip_address}`;
  try {
    const result = await bridge({ base, command, timeout:3000, readOnly });
    return result?.success ? result.data : null;
  } catch {
    return null;
  }
}

export const ENV_TOOLS = {
  control_device: async ({ device_name, command }) => {
    const { currentUser, ownerFilter } = await getCurrentUserOwnerFilter();
    const devices = await jarvis.entities.SmartDevice.filter(ownerFilter);
    const device = devices.find(d => d.name.toLowerCase().includes(device_name.toLowerCase()));
    if (!device) return { success: false, message: `❌ Nem találom: "${device_name}". Add hozzá az eszközöket a Smart Home oldalon.` };
    if (device.created_by !== currentUser.email) return { success: false, message: '❌ Ezt az eszközt nem vezérelheted.' };

    const newStatus = command === 'on' ? 'on' : command === 'off' ? 'off' : device.status;
    const apiResult = await callDeviceAPI(device, command === 'on' ? '/cm?cmnd=Power%20On' : '/cm?cmnd=Power%20Off');
    if (!apiResult) {
      await jarvis.entities.ActionLog.create({
        action_type: 'control_device',
        description: `${device.name} → ${command} (not verified)`,
        status: 'failed',
        created_by: currentUser.email
      });
      return {
        success: false,
        message: `⚠️ ${device.name}: a parancsot nem tudtam a fizikai eszközön igazolni, ezért az alkalmazásban sem módosítottam az állapotát.`,
        data: { device, command, real_control:false, verified:false }
      };
    }
    const updated = await jarvis.entities.SmartDevice.update(device.id, { status: newStatus, last_seen: new Date().toISOString() });
    await jarvis.entities.ActionLog.create({ action_type: 'control_device', description: `${device.name} → ${command}`, status: 'completed', created_by: currentUser.email });
    return {
      success: true,
      message: `${command === 'on' ? '💡' : '🔌'} ${device.name}: ${command.toUpperCase()} ✅ (fizikai eszköz válasza alapján)`,
      data: { device:updated, command, real_control:true, verified:true, apiResult }
    };
  },

  check_device_status: async ({ device_name }) => {
    const { ownerFilter } = await getCurrentUserOwnerFilter();
    const devices = await jarvis.entities.SmartDevice.filter(ownerFilter);
    if (device_name === 'all' || !device_name) {
      const summary = devices.map(d => `${d.name}: ${d.status}`).join(', ');
      return { success: true, message: `📊 Eszközök: ${summary || 'nincs eszköz'}`, data: devices };
    }
    const device = devices.find(d => d.name.toLowerCase().includes(device_name.toLowerCase()));
    if (!device) return { success: false, message: `❌ Nem találom: "${device_name}"` };
    const live = await callDeviceAPI(device, '/cm?cmnd=Power', { readOnly:true });
    if (!live) {
      return {
        success: true,
        message: `${device.type === 'light' ? '💡' : '🔌'} ${device.name} – Mentett állapot: ${device.status}. A fizikai eszköz aktuális állapota nem volt ellenőrizhető.`,
        data: { ...device, verified:false }
      };
    }
    return {
      success: true,
      message: `${device.type === 'light' ? '💡' : '🔌'} ${device.name} – Élő állapot lekérve.`,
      data: { ...device, verified:true, live }
    };
  },

  trigger_scene: async ({ scene_name }) => {
    const { currentUser, ownerFilter } = await getCurrentUserOwnerFilter();
    const scenes = await jarvis.entities.Scene.filter(ownerFilter);
    const scene = scenes.find(s => s.name.toLowerCase().includes(scene_name.toLowerCase()));
    if (!scene) return { success: false, message: `❌ Jelenet nem található: "${scene_name}"` };
    if (scene.created_by !== currentUser.email) return { success: false, message: '❌ Ezt a jelenetet nem futtathatod.' };

    const results = [];
    for (const action of (scene.actions || [])) {
      if (action.type === 'device') {
        const r = await ENV_TOOLS.control_device({ device_name: action.device, command: action.command });
        results.push(r.message);
      }
    }
    await jarvis.entities.Scene.update(scene.id, { last_triggered: new Date().toISOString() });
    await jarvis.entities.ActionLog.create({ action_type: 'trigger_scene', description: `Scene: ${scene.name}`, status: 'completed', created_by: currentUser.email });
    return { success: true, message: `🎬 "${scene.name}" jelenet elindítva!\n${results.join('\n')}`, data: { scene, results } };
  },

  run_routine: async ({ routine_name }) => {
    const { currentUser, ownerFilter } = await getCurrentUserOwnerFilter();
    const routines = await jarvis.entities.Routine.filter(ownerFilter);
    const routine = routines.find(r => r.name.toLowerCase().includes(routine_name.toLowerCase()));
    if (!routine) return { success: false, message: `❌ Rutin nem találva: "${routine_name}"` };
    if (routine.created_by !== currentUser.email) return { success: false, message: '❌ Ezt a rutint nem futtathatod.' };

    const results = [];
    for (const step of (routine.steps || [])) {
      if (step.tool === 'control_device') results.push((await ENV_TOOLS.control_device(step.params)).message);
      else if (step.tool === 'trigger_scene') results.push((await ENV_TOOLS.trigger_scene(step.params)).message);
      else results.push(`⚙️ ${step.tool}: ${JSON.stringify(step.params)}`);
    }
    await jarvis.entities.Routine.update(routine.id, {
      last_run: new Date().toISOString(),
      run_count: (routine.run_count || 0) + 1
    });
    await jarvis.entities.ActionLog.create({ action_type: 'run_routine', description: `Routine: ${routine.name}`, status: 'completed', created_by: currentUser.email });
    return { success: true, message: `🔄 "${routine.name}" rutin lefutott!\n${results.join('\n')}`, data: { routine, results } };
  },
};