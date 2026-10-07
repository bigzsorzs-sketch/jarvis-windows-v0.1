const GLUCOSE_TERM = /\b(vércukor|vercukor|blood\s*sugar|glucose)\b/i;
const GLUCOSE_LOG_VERB = /\b(rögzíts|rogzits|rögzíteni|rogziteni|naplózd|naplozd|logold|mentsd|menteni|írd\s+be|ird\s+be)\b/i;
const MAP_TERM = /\b(térkép|terkep|google\s*maps|maps)\b/i;
const OPEN_VERB = /\b(nyisd\s+meg|nyit(?:sd)?|mutasd|keresd|keress|open|show)\b/i;

function normalizeDecimal(value) {
  const n = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function extractGlucoseValue(text) {
  const decimal = String(text || '').match(/\b(\d{1,2}[.,]\d{1,2})\b/);
  const integer = String(text || '').match(/\b(\d{1,2})\b/);
  const value = normalizeDecimal(decimal?.[1] || integer?.[1]);
  return value != null && value >= 1 && value <= 40 ? value : null;
}

function extractMapTarget(text) {
  return String(text || '')
    .replace(/google\s*maps/ig, '')
    .replace(/\b(térkép(?:et|en)?|terkep(?:et|en)?|maps)\b/ig, '')
    .replace(/\b(nyisd\s+meg|nyit(?:sd)?|mutasd|keresd|keress|open|show)\b/ig, '')
    .replace(/\b(ide|erre|nekem|kérlek|kerlek)\b/ig, '')
    .replace(/^\s*(?:-+|:)+\s*/, '')
    .trim();
}

export function recognizeIntent(userMessage) {
  const text = String(userMessage || '').trim();
  if (!text) return { handled:false, confidence:0 };

  if (GLUCOSE_TERM.test(text) && GLUCOSE_LOG_VERB.test(text)) {
    const value = extractGlucoseValue(text);
    if (value == null) {
      return {
        handled:true,
        intent:'log_glucose_missing_value',
        tool:null,
        params:{},
        confidence:0.99,
        reply:'Milyen vércukorértéket rögzítsek mmol/L-ben?',
      };
    }
    return {
      handled:true,
      intent:'log_glucose',
      tool:'log_blood_sugar',
      params:{ value },
      confidence:0.99,
    };
  }

  if (GLUCOSE_TERM.test(text) && /\b(mi|mennyi|legutóbbi|legutobbi|utolsó|utolso|érték|ertek|mutasd|olvasd|read|latest)\b/i.test(text)) {
    return {
      handled:true,
      intent:'read_glucose',
      tool:'read_latest_blood_sugar',
      params:{},
      confidence:0.98,
    };
  }

  if (MAP_TERM.test(text) && OPEN_VERB.test(text)) {
    const target = extractMapTarget(text);
    if (!target) {
      return {
        handled:true,
        intent:'open_map_missing_target',
        tool:null,
        params:{},
        confidence:0.98,
        reply:'Melyik helyet nyissam meg a térképen?',
      };
    }
    return {
      handled:true,
      intent:'open_map',
      tool:'open_map',
      params:{ destination:target },
      confidence:0.98,
    };
  }

  return { handled:false, confidence:0 };
}
