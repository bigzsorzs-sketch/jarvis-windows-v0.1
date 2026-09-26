import { jarvis } from '@/api/jarvisClient';

async function getCurrentUserOwnerFilter() {
  const currentUser = await jarvis.auth.me().catch(() => null);
  if (!currentUser?.email) throw new Error('auth_required');
  return { currentUser, ownerFilter: { created_by: currentUser.email } };
}

const DAY_NAMES = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];

export async function analyzeHabits() {
  const { currentUser, ownerFilter } = await getCurrentUserOwnerFilter();
  const [actions, todos, reminders, meals, bs] = await Promise.all([
    jarvis.entities.ActionLog.filter(ownerFilter, '-created_date', 100).catch(() => []),
    jarvis.entities.TodoItem.filter(ownerFilter, '-created_date', 50).catch(() => []),
    jarvis.entities.Reminder.filter(ownerFilter, '-created_date', 50).catch(() => []),
    jarvis.entities.MealLog.filter(ownerFilter, '-date', 30).catch(() => []),
    jarvis.entities.BloodSugar.filter(ownerFilter, '-date', 30).catch(() => []),
  ]);

  const patterns = [];
  const dayMap = {};

  // Analyze action patterns by day of week
  for (const action of actions) {
    if (!action.created_date) continue;
    const d = new Date(action.created_date);
    const day = d.getDay();
    const hour = d.getHours();
    const key = `${day}-${action.action_type}`;
    if (!dayMap[key]) dayMap[key] = { count: 0, day, hour, type: action.action_type, desc: action.description };
    dayMap[key].count++;
  }

  // Find recurring patterns (3+ times)
  for (const [key, val] of Object.entries(dayMap)) {
    if (val.count >= 3) {
      patterns.push({
        pattern_type: 'weekly',
        day_of_week: val.day,
        activity: val.desc || val.type,
        confidence: Math.min(10, val.count),
        occurrence_count: val.count,
        suggestion: `${DAY_NAMES[val.day]}onként szokásos: ${val.desc || val.type}`,
      });
    }
  }

  // Meal time patterns
  const mealTimes = {};
  for (const meal of meals) {
    if (!meal.created_date) continue;
    const hour = new Date(meal.created_date).getHours();
    const key = `${meal.meal_type}-${hour}`;
    if (!mealTimes[key]) mealTimes[key] = { count: 0, type: meal.meal_type, hour };
    mealTimes[key].count++;
  }
  for (const [, val] of Object.entries(mealTimes)) {
    if (val.count >= 5) {
      patterns.push({
        pattern_type: 'daily',
        time_of_day: `${val.hour}:00`,
        activity: `${val.type} - általában ${val.hour} órakor`,
        confidence: Math.min(10, val.count),
        occurrence_count: val.count,
        suggestion: `Minden nap kb. ${val.hour}:00-kor szoktál ${val.type}zni`,
      });
    }
  }

  return patterns;
}

export async function getProactiveHabitSuggestions() {
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();
  const { ownerFilter } = await getCurrentUserOwnerFilter();
  const patterns = await jarvis.entities.HabitPattern.filter(ownerFilter).catch(() => []);
  const suggestions = [];

  for (const p of patterns) {
    if (p.pattern_type === 'weekly' && p.day_of_week === currentDay) {
      suggestions.push(`🔁 ${DAY_NAMES[currentDay]}on szokásos: **${p.activity}** – be van ütemezve?`);
    }
    if (p.pattern_type === 'daily' && p.time_of_day) {
      const [h] = p.time_of_day.split(':').map(Number);
      if (Math.abs(h - currentHour) <= 1) {
        suggestions.push(`⏰ Szokásos időpont: **${p.activity}**`);
      }
    }
  }

  return suggestions.slice(0, 3);
}

export async function syncHabits() {
  const { currentUser, ownerFilter } = await getCurrentUserOwnerFilter();
  const newPatterns = await analyzeHabits();
  const existing = await jarvis.entities.HabitPattern.filter(ownerFilter).catch(() => []);

  for (const pattern of newPatterns) {
    const match = existing.find(e => e.activity === pattern.activity && e.pattern_type === pattern.pattern_type);
    if (match) {
      await jarvis.entities.HabitPattern.update(match.id, {
        confidence: pattern.confidence,
        occurrence_count: pattern.occurrence_count,
        last_seen: new Date().toISOString(),
      });
    } else {
      await jarvis.entities.HabitPattern.create({ ...pattern, last_seen: new Date().toISOString(), created_by: currentUser.email });
    }
  }
}