import { getLatestCGMReading } from '@/lib/health/cgmProviderRegistry';

function formatAge(created) {
  const ts = new Date(created || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const minutes = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (minutes < 1) return 'most';
  if (minutes === 1) return '1 perce';
  return minutes + ' perce';
}

function trendText(trend) {
  const direction = trend?.direction;
  if (direction === 'rising') return 'emelkedő';
  if (direction === 'falling') return 'csökkenő';
  if (direction === 'stable') return 'nagyjából stabil';
  return 'trend nem állapítható meg';
}

export async function getLatestGlucoseSummary({ providerId = 'local-history' } = {}) {
  const reading = await getLatestCGMReading(providerId);
  if (!reading) {
    return {
      success: false,
      message: 'Nincs elérhető vércukoradat, amit fel tudnék olvasni.',
      data: null,
    };
  }

  const value = Number(reading.value ?? reading.glucose);
  if (!Number.isFinite(value)) {
    return { success: false, message: 'A legutóbbi vércukoradat nem értelmezhető.', data: reading };
  }

  const age = formatAge(reading.created_date || reading.timestamp);
  const simulated = Boolean(reading.simulated);
  const prefix = simulated ? 'Demó adat: ' : '';
  const ageText = age ? ', ' + age + ' rögzítve' : '';
  const trend = trendText(reading.trend);

  return {
    success: true,
    message: prefix + value.toFixed(1) + ' mmol/L, ' + trend + ageText + '.',
    data: {
      value,
      unit: 'mmol/L',
      trend: reading.trend || null,
      timestamp: reading.created_date || reading.timestamp || null,
      provider: reading.provider || providerId,
      simulated,
    },
  };
}
