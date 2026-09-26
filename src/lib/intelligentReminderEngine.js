import { jarvis } from '@/api/jarvisClient';

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function normalize(value = '') {
  return String(value).toLowerCase();
}

function getMemoryStop(content = '') {
  const text = normalize(content);
  if (text.includes('tankol') || text.includes('fuel')) return { label: 'Tankolás', query: 'petrol station near me' };
  if (text.includes('gyógyszer') || text.includes('patika') || text.includes('pharmacy')) return { label: 'Patika', query: 'pharmacy near me' };
  if (text.includes('bevásárl') || text.includes('bolt') || text.includes('shopping')) return { label: 'Bevásárlás', query: 'grocery store near me' };
  if (text.includes('posta') || text.includes('post office')) return { label: 'Posta', query: 'post office near me' };
  if (text.includes('bank') || text.includes('atm')) return { label: 'Bank / ATM', query: 'atm near me' };
  return null;
}

function buildRouteSuggestion(routes = []) {
  const counts = new Map();
  routes.forEach((route) => {
    const key = route.destination_address || route.contact_name;
    if (!key) return;
    const current = counts.get(key) || { count: 0, route };
    counts.set(key, { count: current.count + 1, route });
  });

  const frequent = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  if (!frequent || frequent.count < 2) return null;

  const destination = frequent.route.destination_address || frequent.route.contact_name;
  return {
    type: 'route',
    title: 'Szokásos útvonal',
    description: `Gyakran mész ide: ${destination}. Indítsam a navigációt?`,
    actionLabel: 'Navigálás',
    prompt: `Navigálj ide: ${destination}`,
    mapsQuery: destination,
    confidence: Math.min(95, 55 + frequent.count * 10),
  };
}

function buildStopSuggestion(memories = []) {
  const match = memories
    .map((memory) => getMemoryStop(memory.content))
    .find(Boolean);

  if (!match) return null;
  return {
    type: 'stop',
    title: `Javasolt megálló: ${match.label}`,
    description: `A mentett memóriáid alapján ez hasznos megálló lehet a mai úton.`,
    actionLabel: 'Keresés térképen',
    prompt: `Keress közeli megállót: ${match.label}`,
    mapsQuery: match.query,
    confidence: 72,
  };
}

function buildTaskSuggestion(memories = [], reminders = [], todos = []) {
  const today = getTodayKey();
  const urgentReminder = reminders.find((item) => !item.is_done && item.due_date && item.due_date <= today);
  if (urgentReminder) {
    return {
      type: 'task',
      title: 'Fontos emlékeztető',
      description: `${urgentReminder.title} ma esedékes vagy lejárt.`,
      actionLabel: 'Megnyitás',
      prompt: `Mutasd az emlékeztetőt: ${urgentReminder.title}`,
      path: '/reminders',
      confidence: 90,
    };
  }

  const openTodo = todos.find((item) => !item.is_completed && (item.priority === 'magas' || item.priority === 'surgos'));
  if (openTodo) {
    return {
      type: 'task',
      title: 'Fontos teendő',
      description: `${openTodo.title} kiemelt teendőként vár rád.`,
      actionLabel: 'Teendők',
      prompt: `Segíts befejezni ezt a teendőt: ${openTodo.title}`,
      path: '/eszkozok',
      confidence: 84,
    };
  }

  const memory = memories.find((item) => /ne felejts|fontos|emlékeztess|remember/i.test(item.content || ''));
  if (!memory) return null;
  return {
    type: 'task',
    title: 'Memóriából javasolt teendő',
    description: memory.content,
    actionLabel: 'Teendővé alakítás',
    prompt: `Készíts teendőt ebből: ${memory.content}`,
    confidence: 68,
  };
}

export async function getIntelligentReminderSuggestions() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) return [];

  const ownerFilter = { created_by: currentUser.email };
  const [routes, memories, reminders, todos] = await Promise.all([
    jarvis.entities.RouteHistory.filter(ownerFilter, '-created_date', 30).catch(() => []),
    jarvis.entities.Memory.filter(ownerFilter, '-importance', 30).catch(() => []),
    jarvis.entities.Reminder.filter(ownerFilter, '-due_date', 30).catch(() => []),
    jarvis.entities.TodoItem.filter(ownerFilter, '-created_date', 30).catch(() => []),
  ]);

  return [
    buildRouteSuggestion(routes),
    buildStopSuggestion(memories),
    buildTaskSuggestion(memories, reminders, todos),
  ].filter(Boolean).slice(0, 3);
}