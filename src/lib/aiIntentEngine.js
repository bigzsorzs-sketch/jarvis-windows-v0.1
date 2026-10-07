import { TOOLS } from './assistantTools';
import { logger } from './logger';

const INTENT_PATTERNS = {
  // Térkép és navigáció
  MAP: /térkép|google maps|nyisd meg|navigál|hova/i,
  NAVIGATE: /navigálj|megy|út|route/i,
  
  // Vércukor és egészség
  GLUCOSE: /vércukor|cukor|vérnyomás|egészség/i,
  HEALTH_LOG: /rögzít|log|jegyzet|felírás/i,
  
  // Számlázás
  INVOICE: /számla|invoice|számla készítés/i,
  EMAIL_INVOICE: /számla.*email|email.*számla|küldd.*számlá|számla.*küld/i,
  
  // Hívás
  CALL: /hívj|hívás|telefon|call/i,
  
  // Emlékek és feljegyzések
  MEMORY: /emlékez|megjegyez|memória|jegyzet/i,
  REMINDER: /emlékeztet|remind|figyelmeztess/i,
  
  // Okosotthon
  DEVICE: /lámpa|fény|ajtó|zár|eszköz|device/i,
  
  // Adatkezelés
  SEARCH: /keres|find|search|hol van/i,
};

export async function recognizeIntent(userMessage) {
  const lower = userMessage.toLowerCase();
  const confidence = 0;
  let intent = null;
  let params = {};
  let tool = null;

  // Térkép parancsok
  if (INTENT_PATTERNS.MAP.test(lower)) {
    intent = 'open_map';
    tool = 'open_map';
    params = { query: userMessage };
  }
  // Vércukor lekérdezés
  else if (INTENT_PATTERNS.GLUCOSE.test(lower) && !INTENT_PATTERNS.HEALTH_LOG.test(lower)) {
    intent = 'read_glucose';
    tool = 'read_latest_blood_sugar';
    params = {};
  }
  // Vércukor rögzítés
  else if (INTENT_PATTERNS.GLUCOSE.test(lower) && INTENT_PATTERNS.HEALTH_LOG.test(lower)) {
    intent = 'log_glucose';
    tool = 'log_blood_sugar';
    const match = userMessage.match(/(\d+)/);
    params = { value: match ? parseInt(match[1]) : 0, time_of_day: 'reggel' };
  }
  // Számla + Email
  else if (INTENT_PATTERNS.EMAIL_INVOICE.test(lower)) {
    intent = 'invoice_and_email';
    tool = 'create_invoice_and_email';
    params = {
      client_name: 'Ügyfél',
      client_email: 'owner@jarvis.local',
      items: [{ description: 'Szolgáltatás', quantity: 1, unit_price: 0 }],
      notes: 'AI által létrehozott'
    };
  }
  // Számla
  else if (INTENT_PATTERNS.INVOICE.test(lower)) {
    intent = 'create_invoice';
    tool = 'create_invoice';
    params = {
      client_name: 'Ügyfél',
      client_email: '',
      items: [{ description: 'Tétel', quantity: 1, unit_price: 0 }],
      notes: ''
    };
  }
  // Hívás
  else if (INTENT_PATTERNS.CALL.test(lower)) {
    intent = 'call_contact';
    tool = 'call_contact';
    const nameMatch = userMessage.match(/hívj? ([a-záéíóöőúüű\s]+)/i);
    params = { name: nameMatch ? nameMatch[1].trim() : 'Ismeretlen', phone: '' };
  }
  // Emlékeztetőt
  else if (INTENT_PATTERNS.REMINDER.test(lower)) {
    intent = 'create_reminder';
    tool = 'create_reminder';
    params = {
      title: userMessage.substring(0, 100),
      description: userMessage,
      due_date: null,
      due_time: null,
      category: 'other'
    };
  }
  // Memória mentés
  else if (INTENT_PATTERNS.MEMORY.test(lower)) {
    intent = 'save_memory';
    tool = 'save_memory';
    params = { content: userMessage, category: 'fact', importance: 7 };
  }
  // Keresés
  else if (INTENT_PATTERNS.SEARCH.test(lower)) {
    intent = 'search_data';
    tool = 'search_data';
    params = { query: userMessage, entity: null };
  }

  if (!tool) {
    return { handled: false, confidence: 0 };
  }

  return {
    handled: true,
    intent,
    tool,
    params,
    confidence: 0.85,
    explanation: `Jarvis: ${intent} – ${userMessage.substring(0, 50)}`
  };
}

export async function executeTool(toolName, params) {
  if (!TOOLS[toolName]) {
    throw new Error(`❌ Ismeretlen eszköz: ${toolName}`);
  }
  return await TOOLS[toolName](params);
}
