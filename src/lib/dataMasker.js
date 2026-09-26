export function maskText(value, visible = false, fallback = '••••••') {
  if (visible) return value;
  return fallback;
}

export function maskCurrency(amount, currency = '£', visible = false) {
  const formatted = `${amount >= 0 ? '' : '-'}${currency}${Math.abs(amount || 0).toFixed(2)}`;
  return visible ? formatted : `${currency}••••`;
}

export function maskBloodSugar(value, visible = false) {
  return visible ? `${value} mmol/L` : '••• mmol/L';
}