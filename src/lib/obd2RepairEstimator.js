const CODE_ESTIMATES = {
  P0300: { issue: 'Gyújtáskimaradás', parts: ['Gyújtógyertya', 'Gyújtótrafó'], partsLow: 45, partsHigh: 220, laborHours: 1.2 },
  P0301: { issue: '1. henger gyújtáskimaradás', parts: ['Gyújtógyertya', 'Gyújtótrafó'], partsLow: 45, partsHigh: 180, laborHours: 1.0 },
  P0302: { issue: '2. henger gyújtáskimaradás', parts: ['Gyújtógyertya', 'Gyújtótrafó'], partsLow: 45, partsHigh: 180, laborHours: 1.0 },
  P0303: { issue: '3. henger gyújtáskimaradás', parts: ['Gyújtógyertya', 'Gyújtótrafó'], partsLow: 45, partsHigh: 180, laborHours: 1.0 },
  P0304: { issue: '4. henger gyújtáskimaradás', parts: ['Gyújtógyertya', 'Gyújtótrafó'], partsLow: 45, partsHigh: 180, laborHours: 1.0 },
  P0420: { issue: 'Katalizátor hatásfok alacsony', parts: ['Lambda szonda', 'Katalizátor'], partsLow: 120, partsHigh: 850, laborHours: 2.2 },
  P0171: { issue: 'Szegény keverék', parts: ['MAF szenzor', 'Vákuumcső', 'Lambda szonda'], partsLow: 55, partsHigh: 360, laborHours: 1.6 },
  P0172: { issue: 'Dús keverék', parts: ['MAF szenzor', 'Injektor tisztítás', 'Lambda szonda'], partsLow: 70, partsHigh: 420, laborHours: 1.8 },
  P0115: { issue: 'Hűtőfolyadék hőmérséklet jeladó', parts: ['Hőmérséklet jeladó', 'Hűtőfolyadék'], partsLow: 25, partsHigh: 120, laborHours: 0.8 },
  P0101: { issue: 'MAF szenzor tartományhiba', parts: ['MAF szenzor', 'Levegőszűrő'], partsLow: 65, partsHigh: 280, laborHours: 0.9 },
  P0130: { issue: 'Lambda szonda áramkör', parts: ['Lambda szonda'], partsLow: 55, partsHigh: 220, laborHours: 1.1 },
};

const PREFIX_ESTIMATES = {
  P: { issue: 'Motor / hajtáslánc hiba', parts: ['Diagnosztika', 'Motorhoz kapcsolódó alkatrész'], partsLow: 60, partsHigh: 320, laborHours: 1.5 },
  C: { issue: 'Futómű / ABS rendszer hiba', parts: ['Szenzor', 'Futómű vagy ABS alkatrész'], partsLow: 70, partsHigh: 380, laborHours: 1.7 },
  B: { issue: 'Karosszéria elektronika hiba', parts: ['Kapcsoló', 'Modul vagy kábelköteg'], partsLow: 45, partsHigh: 260, laborHours: 1.4 },
  U: { issue: 'Kommunikációs hálózati hiba', parts: ['Diagnosztika', 'Vezérlő modul ellenőrzés'], partsLow: 80, partsHigh: 450, laborHours: 2.0 },
};

const PREMIUM_MAKES = ['bmw', 'mercedes', 'audi', 'lexus', 'jaguar', 'land rover', 'porsche', 'tesla'];

function vehicleMultiplier(vehicle) {
  const make = String(vehicle?.make || '').toLowerCase();
  const year = Number(vehicle?.year) || new Date().getFullYear();
  const age = new Date().getFullYear() - year;
  let multiplier = PREMIUM_MAKES.some((item) => make.includes(item)) ? 1.25 : 1;
  if (age > 12) multiplier += 0.12;
  if (age < 4) multiplier += 0.08;
  return multiplier;
}

function estimateForCode(code) {
  const normalized = String(code || '').toUpperCase().trim();
  return CODE_ESTIMATES[normalized] || PREFIX_ESTIMATES[normalized.charAt(0)] || PREFIX_ESTIMATES.P;
}

export function estimateObd2Repair(session, vehicle) {
  const codes = Array.isArray(session?.dtc_codes) ? session.dtc_codes.filter(Boolean) : [];
  const multiplier = vehicleMultiplier(vehicle);
  const laborRate = 75;
  const items = codes.map((code) => {
    const estimate = estimateForCode(code);
    const labor = estimate.laborHours * laborRate;
    const low = Math.round((estimate.partsLow + labor * 0.85) * multiplier);
    const high = Math.round((estimate.partsHigh + labor * 1.15) * multiplier);
    return { code: String(code).toUpperCase(), ...estimate, low, high };
  });

  const diagnosticFee = codes.length ? Math.round(45 * multiplier) : 0;
  const totalLow = items.reduce((sum, item) => sum + item.low, diagnosticFee);
  const totalHigh = items.reduce((sum, item) => sum + item.high, diagnosticFee);
  const parts = [...new Set(items.flatMap((item) => item.parts))];

  return {
    hasCodes: codes.length > 0,
    diagnosticFee,
    totalLow,
    totalHigh,
    parts,
    items,
    note: 'Tájékoztató piaci átlagbecslés, pontos árat szervizdiagnosztika után lehet adni.',
  };
}