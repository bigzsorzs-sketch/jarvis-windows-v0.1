function normalize(text = '') {
  return String(text).trim().toLowerCase();
}

export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function inferTimeOfDay(text = '', date = new Date()) {
  const t = normalize(text);
  if (/\b(reggel|hajnal|morning)\b/.test(t)) return 'reggel';
  if (/\b(delelott|délelőtt|late morning)\b/.test(t)) return 'délelőtt';
  if (/\b(delutan|délután|afternoon)\b/.test(t)) return 'délután';
  if (/\b(este|evening)\b/.test(t)) return 'este';
  if (/\b(ejjel|éjjel|night)\b/.test(t)) return 'éjjel';
  const hour = date.getHours();
  if (hour < 5) return 'éjjel';
  if (hour < 10) return 'reggel';
  if (hour < 12) return 'délelőtt';
  if (hour < 18) return 'délután';
  if (hour < 23) return 'este';
  return 'éjjel';
}

function numericValue(raw) {
  const value = Number(String(raw || '').replace(',', '.'));
  return Number.isFinite(value) ? value : NaN;
}

function titleCaseFirst(value = '') {
  const clean = String(value).trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : clean;
}

export function parseVoiceCommand(text, now = new Date()) {
  const t = normalize(text);
  const date = localDateString(now);

  const todoAdd = t.match(/^(?:add (?:todo|task)|teendő(?:t)?(?: hozzáadás)?|hozzáadom hogy|emlékeztess(?:,)? hogy|ne felejtsem|ne felejtsd el(?:,)? hogy)[:\s]+(.+)$/i)
    || t.match(/^(?:új teendő|new task)[:\s]+(.+)$/i);
  if (todoAdd) {
    const title = titleCaseFirst(todoAdd[1]);
    return { type:'create_todo', payload:{ title }, confirmText:`Teendő: ${todoAdd[1].trim()}` };
  }

  const bloodSugarPatterns = [
    /(?:vércukor(?:om)?|blood sugar)[,\s]+(?:(reggel|délelőtt|delelott|délután|delutan|este|éjjel|ejjel)[,\s]+)?(\d+(?:[.,]\d+)?)\s*(?:mmol(?:\/l)?)?/i,
    /(?:ma\s+)?(?:(reggel|délelőtt|delelott|délután|delutan|este|éjjel|ejjel)[,\s]+)?(\d+(?:[.,]\d+)?)\s*(?:mmol(?:\/l)?)?\s+(?:volt\s+)?(?:a\s+)?vércukor(?:om)?/i,
  ];
  for (const pattern of bloodSugarPatterns) {
    const match = t.match(pattern);
    if (!match) continue;
    const explicitPeriod = match[1] || '';
    const value = numericValue(match[2]);
    if (Number.isFinite(value) && value > 0 && value < 40) {
      return {
        type:'create_blood_sugar',
        payload:{ value, time_of_day:inferTimeOfDay(explicitPeriod || t, now), date },
        confirmText:`Vércukor: ${value} mmol/L`
      };
    }
  }

  const expenseMatch = t.match(/(?:ma\s+)?(?:költöttem|fizettem|kiadás(?:om)?\s+volt)\s+(\d+(?:[.,]\d+)?)\s*(?:ft|forint)\w*\s+(.+)/i);
  if (expenseMatch) {
    const amount = numericValue(expenseMatch[1]);
    const description = expenseMatch[2].trim();
    if (Number.isFinite(amount) && amount > 0) {
      return {
        type:'create_expense',
        payload:{ description:titleCaseFirst(description), amount, type:'expense', category:'magan', date },
        confirmText:`Kiadás: ${amount} Ft – ${description}`
      };
    }
  }

  const mealPatterns = [
    /^(?:ettem|reggeliztem|ebédeltem|vacsoráztam|étkezés)(?:re|hez|nél)?[,\s]+(.+)$/i,
    /^(reggelire|ebédre|ebedre|vacsorára|vacsorara|tízóraira|tizoraira|uzsonnára|uzsonnara)\s+ettem\s+(.+)$/i,
  ];
  let rest = '';
  let mealType = '';
  const directMeal = t.match(mealPatterns[0]);
  if (directMeal) {
    rest = directMeal[1].trim();
    mealType = t.includes('ebéd') ? 'ebéd' : t.includes('vacs') ? 'vacsora' : t.includes('tízórai') ? 'tízórai' : t.includes('uzsonna') ? 'uzsonna' : 'reggeli';
  } else {
    const prefixedMeal = t.match(mealPatterns[1]);
    if (prefixedMeal) {
      rest = prefixedMeal[2].trim();
      mealType = prefixedMeal[1].includes('ebéd') || prefixedMeal[1].includes('ebed') ? 'ebéd'
        : prefixedMeal[1].includes('vacs') ? 'vacsora'
        : prefixedMeal[1].includes('tíz') || prefixedMeal[1].includes('tiz') ? 'tízórai'
        : prefixedMeal[1].includes('uzson') ? 'uzsonna'
        : 'reggeli';
    }
  }
  if (rest) {
    const calMatch = rest.match(/(\d+)\s*(?:kcal|kalória|kaloria|cal)/i);
    return {
      type:'create_meal',
      payload:{
        meal_name:rest.replace(/\d+\s*(?:kcal|kalória|kaloria|cal)/i, '').trim(),
        meal_type:mealType || 'reggeli',
        calories:calMatch ? Number(calMatch[1]) : 0,
        date
      },
      confirmText:`Étkezés: ${rest}`
    };
  }

  const reminderMatch = t.match(/^(?:emlékeztess|set reminder)[,\s]+(.+)$/i);
  if (reminderMatch) return { type:'create_reminder', payload:{ title:reminderMatch[1].trim(), category:'other' }, confirmText:`Emlékeztető: ${reminderMatch[1].trim()}` };

  const navMatch = t.match(/^(?:navigálj|navigalj|navigate)[,\s]+(.+)$/i);
  if (navMatch) return { type:'navigate', payload:{ destination:navMatch[1].trim() }, confirmText:`Navigálás: ${navMatch[1].trim()}` };

  return null;
}
