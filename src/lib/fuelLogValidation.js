export function validateFuelLog(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) throw new Error('INVALID_FUEL_FORM');
  const date = String(form.date || '');
  const parsed = new Date(date + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('INVALID_FUEL_DATE');
  const number = (value, minimum, field) => {
    if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw new Error('INVALID_FUEL_' + field);
    const result = Number(value);
    if (!Number.isFinite(result) || result < minimum) throw new Error('INVALID_FUEL_' + field);
    return result;
  };
  const liters = number(form.liters, 0.01, 'LITERS');
  const total_cost = number(form.total_cost, 0, 'COST');
  const distance_km = number(form.distance_km, 1, 'DISTANCE');
  const odometer = form.odometer == null || String(form.odometer).trim() === '' ? undefined : number(form.odometer, 0, 'ODOMETER');
  return { ...form, date, liters, total_cost, distance_km, odometer };
}
