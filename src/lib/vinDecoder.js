// Simple VIN decoder - manufacturer, year, body type parsing
export async function decodeVIN(vin) {
  if (!vin || vin.length !== 17) {
    throw new Error('Érvénytelen VIN (17 karakter kell)');
  }

  // Decade lookup (10. karakter)
  const decadeMap = {
    'V': 1997, 'W': 1998, 'X': 1999, 'Y': 2000, 'Z': 2001,
    'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
    'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
    'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
  };

  // Manufacturer mapping (WMI - first 3 chars)
  const manufacturerMap = {
    'WAU': { name: 'Audi', country: 'Germany' },
    'WBA': { name: 'BMW', country: 'Germany' },
    'WBS': { name: 'BMW', country: 'Germany' },
    'WBX': { name: 'BMW', country: 'Germany' },
    'JT2': { name: 'Toyota', country: 'Japan' },
    'JTG': { name: 'Toyota', country: 'Japan' },
    'JTH': { name: 'Toyota', country: 'Japan' },
    'JTW': { name: 'Toyota', country: 'Japan' },
    'HMC': { name: 'Hyundai', country: 'South Korea' },
    'KMH': { name: 'Hyundai', country: 'South Korea' },
    'VF7': { name: 'Peugeot', country: 'France' },
    'VF3': { name: 'Peugeot', country: 'France' },
    'WVW': { name: 'Volkswagen', country: 'Germany' },
    'ZFF': { name: 'Ferrari', country: 'Italy' },
    'JF2': { name: 'Subaru', country: 'Japan' },
    'SAJ': { name: 'Jaguar', country: 'UK' },
    'SCC': { name: 'Jaguar', country: 'UK' },
    'MA1': { name: 'Mazda', country: 'Japan' },
    'MAT': { name: 'Mazda', country: 'Japan' },
    'GY6': { name: 'Volvo', country: 'Sweden' },
    'LVV': { name: 'Volvo', country: 'Sweden' },
    'YV1': { name: 'Volvo', country: 'Sweden' },
  };

  const wmi = vin.substring(0, 3);
  const yearChar = vin.charAt(9);
  const checkDigit = vin.charAt(8);

  const manufacturer = manufacturerMap[wmi] || { name: 'Ismeretlen', country: 'Unknown' };
  const year = decadeMap[yearChar] || parseInt(yearChar) + 2000;

  return {
    vin,
    manufacturer: manufacturer.name,
    country: manufacturer.country,
    year,
    wmi,
    checkDigit,
    engineType: 'Benzin (felbecslés)', // Szükséges részletes VIN dekódolás a pontos típushoz
  };
}

// Validate VIN check digit (Luhn algorithm)
export function validateVIN(vin) {
  if (vin.length !== 17) return false;

  const transliteration = 'ABCDEFGH..JKLMN.P.R..TUVWXYZ';
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;

  for (let i = 0; i < 17; i++) {
    if (i === 8) continue; // Skip check digit
    const char = vin.charAt(i);
    const value = char.match(/^\d$/) ? parseInt(char) : transliteration.indexOf(char);
    if (value === -1) return false;
    sum += value * weights[i];
  }

  const checkDigit = sum % 11;
  const expected = checkDigit === 10 ? 'X' : checkDigit.toString();
  return vin.charAt(8) === expected;
}