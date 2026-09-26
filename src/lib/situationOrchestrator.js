import { invokeWithRetry } from '@/lib/llmGateway';
import {
  executeJarvisCapability,
  getCapabilityCatalog,
  getJarvisSituationContext,
} from '@/lib/capabilityBus';

function lower(text = '') {
  return text.toLowerCase().trim();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function deterministicCapability(text, context) {
  const t = lower(text);
  const moduleId = context?.activeModule?.id;

  if (moduleId === 'image-editor') {
    if (includesAny(t, ['vond vissza', 'undo', 'utolsó lépést vissza', 'utolso lepest vissza'])) {
      return { name: 'image.undo', params: {} };
    }

    if (includesAny(t, ['redo', 'csináld újra', 'csinald ujra', 'állítsd vissza', 'allitsd vissza'])) {
      return { name: 'image.redo', params: {} };
    }

    if (includesAny(t, ['nagyíts', 'nagyits', 'zoom in'])) {
      return { name: 'image.zoom_in', params: {} };
    }

    if (includesAny(t, ['kicsinyíts', 'kicsinyits', 'zoom out'])) {
      return { name: 'image.zoom_out', params: {} };
    }

    if (includesAny(t, ['töröld a vásznat', 'torold a vasznat', 'clear canvas'])) {
      return { name: 'image.clear', params: {} };
    }

    const imageMatch = t.match(/(?:készíts|keszits|generálj|generalj|csinálj|csinalj)\s+(?:egy\s+)?(?:képet|kepet)?\s*(.*)$/);
    if (imageMatch) {
      const prompt = imageMatch[1]?.trim() || text.trim();
      return { name: 'image.generate', params: { prompt } };
    }
  }

  if (moduleId === 'locations') {
    if (includesAny(t, ['mentett hely', 'helyeim', 'milyen hely', 'saved places', 'saved locations'])) {
      return { name: 'locations.list_saved', params: {} };
    }

    if (includesAny(t, ['aktív navigáció', 'aktiv navigacio', 'merre megyünk', 'merre megyunk', 'mi a célpont', 'mi a celpont'])) {
      return { name: 'navigation.current_status', params: {} };
    }

    const navigationMatch = t.match(/(?:navigálj|navigalj|vigyél|vigyel)\s+(.+)$/);
    if (navigationMatch?.[1]) {
      return { name: 'navigation.go_saved', params: { query: navigationMatch[1].trim() } };
    }
  }

  if (moduleId === 'automotive') {
    if (includesAny(t, ['hibakód', 'hibakod', 'dtc', 'error code', 'fault code'])) {
      return { name: 'obd.read_dtcs', params: {} };
    }

    if (includesAny(t, ['változott', 'valtozott', 'mi változott', 'mi valtozott', 'nézd meg van e változás', 'nezd meg van e valtozas', 'hasonlítsd össze', 'hasonlitsd ossze'])) {
      return { name: 'obd.compare_snapshot', params: {} };
    }

    if (includesAny(t, ['pillanatkép', 'pillanatkep', 'snapshot', 'nézz meg mindent', 'nezz meg mindent', 'olvasd ki az adatokat'])) {
      return { name: 'obd.snapshot', params: {} };
    }

    if (includesAny(t, ['fordulat', 'rpm'])) {
      return { name: 'obd.read_pid', params: { pid: 'ENGINE_RPM' } };
    }

    if (includesAny(t, ['hűtővíz', 'hutoviz', 'hőmérséklet', 'homerseklet', 'coolant'])) {
      return { name: 'obd.read_pid', params: { pid: 'COOLANT_TEMP' } };
    }

    if (includesAny(t, ['maf', 'légtömeg', 'legtomeg', 'air flow'])) {
      return { name: 'obd.read_pid', params: { pid: 'MAF_AIR_FLOW' } };
    }

    if (includesAny(t, ['sebesség', 'sebesseg', 'vehicle speed'])) {
      return { name: 'obd.read_pid', params: { pid: 'SPEED' } };
    }
  }

  return null;
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  const text = String(value).trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

async function chooseCapabilityWithAI(text, context, catalog) {
  if (!catalog.length) return null;

  const compactContext = JSON.stringify(context, (_key, value) => {
    if (typeof value === 'string' && value.length > 500) return value.slice(0, 500);
    return value;
  }).slice(0, 6000);

  const catalogText = catalog
    .map((item) => '- ' + item.name + ': ' + item.description + ' | risk=' + item.risk + ' | confirmation=' + item.confirmationRequired)
    .join('\n');

  try {
    const prompt = [
      'Te Jarvis helyzetfelismerő routere vagy.',
      '',
      'Feladatod NEM a felhasználónak válaszolni, hanem eldönteni, hogy az AKTUÁLIS MODUL egyik képességét végre kell-e hajtani.',
      '',
      'Aktuális helyzet:',
      compactContext,
      '',
      'Elérhető képességek:',
      catalogText,
      '',
      'Felhasználó:',
      '"' + text + '"',
      '',
      'Szabályok:',
      '- Csak a felsorolt capability nevek egyikét választhatod.',
      '- Ha a mondat csak beszélgetés és nem kell művelet, capability legyen null.',
      '- Ne találj ki hiányzó adatot.',
      '- A params csak a szükséges paramétereket tartalmazza.',
      '- Válasz kizárólag JSON objektum legyen.',
    ].join('\n');

    const response = await invokeWithRetry({
      queueKey: 'situation-orchestrator',
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          capability: { type: ['string', 'null'] },
          params: { type: 'object' },
          reason: { type: 'string' },
        },
        required: ['capability', 'params'],
      },
      prompt,
    }, 1);

    const parsed = parseJsonObject(response?.data?.result ?? response?.data ?? response);
    if (!parsed?.capability) return null;
    if (!catalog.some((item) => item.name === parsed.capability)) return null;

    return {
      name: parsed.capability,
      params: parsed.params || {},
      reason: parsed.reason || '',
    };
  } catch {
    // During the "body before brain" phase, missing provider/API key is expected.
    return null;
  }
}

export async function executeSituationAwareCommand(text) {
  const clean = text?.trim();
  if (!clean) return null;

  const context = getJarvisSituationContext();
  const catalog = getCapabilityCatalog();
  if (!context.activeModule || catalog.length === 0) return null;

  const deterministic = deterministicCapability(clean, context);
  if (deterministic && catalog.some((item) => item.name === deterministic.name)) {
    const result = await executeJarvisCapability(deterministic.name, deterministic.params);
    return result?.handled ? {
      ...result,
      intent: 'contextual-capability',
      routedBy: 'deterministic',
    } : null;
  }

  const selected = await chooseCapabilityWithAI(clean, context, catalog);
  if (!selected) return null;

  const result = await executeJarvisCapability(selected.name, selected.params);
  return result?.handled ? {
    ...result,
    intent: 'contextual-capability',
    routedBy: 'ai',
  } : null;
}
