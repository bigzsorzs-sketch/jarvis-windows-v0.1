import { jarvis } from '@/api/jarvisClient';
import { ENV_TOOLS } from './environmentTools';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 perc – ne fusson le 2x gyorsan

const lastFired = {}; // ruleId -> timestamp

export async function evaluateGeofenceRules(triggerType, locationId) {
  let rules = [];
  try {
    rules = await jarvis.entities.AutomationRule.filter({
      is_active: true,
      trigger_type: triggerType,
      trigger_location_id: locationId,
    });
  } catch { return []; }

  const results = [];
  const now = Date.now();

  for (const rule of rules) {
    // Cooldown check
    if (lastFired[rule.id] && now - lastFired[rule.id] < COOLDOWN_MS) continue;
    lastFired[rule.id] = now;

    const result = await executeRuleAction(rule);
    results.push({ rule: rule.name, ...result });

    // Update stats
    jarvis.entities.AutomationRule.update(rule.id, {
      last_triggered: new Date().toISOString(),
      trigger_count: (rule.trigger_count || 0) + 1,
    }).catch(() => {});
  }

  return results;
}

export async function executeRuleAction(rule) {
  try {
    if (rule.action_type === 'device_on') {
      return await ENV_TOOLS.control_device({ device_name: rule.action_target, command: 'on' });
    }
    if (rule.action_type === 'device_off') {
      return await ENV_TOOLS.control_device({ device_name: rule.action_target, command: 'off' });
    }
    if (rule.action_type === 'trigger_scene') {
      return await ENV_TOOLS.trigger_scene({ scene_name: rule.action_target });
    }
    if (rule.action_type === 'run_routine') {
      return await ENV_TOOLS.run_routine({ routine_name: rule.action_target });
    }
    return { success: false, message: `Ismeretlen action: ${rule.action_type}` };
  } catch (err) {
    return { success: false, message: err?.message || 'Hiba' };
  }
}