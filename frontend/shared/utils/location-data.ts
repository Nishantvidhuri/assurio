import { Country, State, City } from 'country-state-city';
import pincodeLookup from 'india-pincode-lookup';

export interface LocationOption {
  label: string;
  value: string;
}

export interface PincodeLookupResult {
  state: string;
  district: string;
  city: string;
}

// ── Countries ──────────────────────────────────────────────────────────────

const countryCache: LocationOption[] = [];

/**
 * Returns all countries sorted alphabetically.
 */
export function getAllCountries(): LocationOption[] {
  if (countryCache.length > 0) return countryCache;

  const countries = Country.getAllCountries()
    .map((c) => ({ label: c.name, value: c.name, isoCode: c.isoCode }))
    .sort((a, b) => a.label.localeCompare(b.label));

  countryCache.push(...countries.map(({ label, value }) => ({ label, value })));
  return countryCache;
}

// ── Internal: resolve country name → ISO code ──────────────────────────────

function getCountryIsoCode(countryName: string): string | null {
  const country = Country.getAllCountries().find(
    (c) => c.name.toLowerCase() === countryName.toLowerCase(),
  );
  return country?.isoCode ?? null;
}

// ── States ──────────────────────────────────────────────────────────────────

const stateCache = new Map<string, LocationOption[]>();

/**
 * Returns all states/provinces for a given country name.
 */
export function getStatesForCountry(countryName: string): LocationOption[] {
  if (!countryName) return [];

  const cached = stateCache.get(countryName);
  if (cached) return cached;

  const isoCode = getCountryIsoCode(countryName);
  if (!isoCode) return [];

  const states = State.getStatesOfCountry(isoCode)
    .map((s) => ({ label: s.name, value: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  stateCache.set(countryName, states);
  return states;
}

// ── Internal: resolve state name → ISO code ─────────────────────────────────

function getStateIsoCode(countryName: string, stateName: string): string | null {
  const countryIso = getCountryIsoCode(countryName);
  if (!countryIso) return null;

  const state = State.getStatesOfCountry(countryIso).find(
    (s) => s.name.toLowerCase() === stateName.toLowerCase(),
  );
  return state?.isoCode ?? null;
}

// ── Cities ──────────────────────────────────────────────────────────────────

const cityCache = new Map<string, LocationOption[]>();

/**
 * Returns all cities for a given country + state name.
 * These serve as both "district" and "city" options for non-India countries.
 */
export function getCitiesForState(
  countryName: string,
  stateName: string,
): LocationOption[] {
  if (!countryName || !stateName) return [];

  const cacheKey = `${countryName}::${stateName}`;
  const cached = cityCache.get(cacheKey);
  if (cached) return cached;

  const countryIso = getCountryIsoCode(countryName);
  const stateIso = getStateIsoCode(countryName, stateName);
  if (!countryIso || !stateIso) return [];

  const cities = City.getCitiesOfState(countryIso, stateIso)
    .map((c) => ({ label: c.name, value: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  cityCache.set(cacheKey, cities);
  return cities;
}

// ── India Pincode Lookup ────────────────────────────────────────────────────

/**
 * Looks up an Indian pincode and returns state, district, and city/taluk.
 * Returns null if the pincode is not found or invalid.
 */
export function lookupIndiaPincode(pincode: string): PincodeLookupResult | null {
  if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
    return null;
  }

  const results = pincodeLookup.lookup(pincode);
  if (!results || results.length === 0) return null;

  const first = results[0];

  // Normalize state name to title case (API returns UPPERCASE)
  const stateName = first.stateName
    .toLowerCase()
    .replace(/\b\w/g, (char: string) => char.toUpperCase());

  // Derive the city name from the district name by stripping common suffixes
  // e.g. "Kanpur Nagar" → "Kanpur", "Bangalore Urban" → "Bangalore"
  const cityName = first.districtName
    .replace(/\s*(Nagar|Urban|Rural|North|South|East|West|Central)\s*$/i, '')
    .trim() || first.districtName;

  return {
    state: stateName,
    district: first.districtName,
    city: cityName,
  };
}

/**
 * Returns true if the selected country is India.
 */
export function isIndiaCountry(countryName: string): boolean {
  return countryName.toLowerCase() === 'india';
}
