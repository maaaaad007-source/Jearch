/**
 * ISO 3166-1 alpha-2 country list used by the search form.
 *
 * `code` is what goes upstream — JSearch and TheirStack both take an alpha-2
 * code — and `name` is only ever shown to the user. The list is sorted by name
 * at module load, so the dropdown is always alphabetical no matter how entries
 * are added below.
 */
export interface Country {
  code: string;
  name: string;
  flag: string;
}

const RAW_COUNTRIES: Country[] = [
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "BG", name: "Bulgaria", flag: "🇧🇬" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "CR", name: "Costa Rica", flag: "🇨🇷" },
  { code: "HR", name: "Croatia", flag: "🇭🇷" },
  { code: "CY", name: "Cyprus", flag: "🇨🇾" },
  { code: "CZ", name: "Czechia", flag: "🇨🇿" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "EE", name: "Estonia", flag: "🇪🇪" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "GR", name: "Greece", flag: "🇬🇷" },
  { code: "HK", name: "Hong Kong", flag: "🇭🇰" },
  { code: "HU", name: "Hungary", flag: "🇭🇺" },
  { code: "IS", name: "Iceland", flag: "🇮🇸" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "IL", name: "Israel", flag: "🇮🇱" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "LV", name: "Latvia", flag: "🇱🇻" },
  { code: "LT", name: "Lithuania", flag: "🇱🇹" },
  { code: "LU", name: "Luxembourg", flag: "🇱🇺" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "MT", name: "Malta", flag: "🇲🇹" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "PA", name: "Panama", flag: "🇵🇦" },
  { code: "PE", name: "Peru", flag: "🇵🇪" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "RO", name: "Romania", flag: "🇷🇴" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "RS", name: "Serbia", flag: "🇷🇸" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "SK", name: "Slovakia", flag: "🇸🇰" },
  { code: "SI", name: "Slovenia", flag: "🇸🇮" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "TW", name: "Taiwan", flag: "🇹🇼" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "TR", name: "Türkiye", flag: "🇹🇷" },
  { code: "UA", name: "Ukraine", flag: "🇺🇦" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
];

export const COUNTRIES: Country[] = [...RAW_COUNTRIES].sort((a, b) =>
  a.name.localeCompare(b.name, "en"),
);

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string): Country | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function countryName(code: string): string {
  return BY_CODE.get(code.toUpperCase())?.name ?? code;
}

export function isValidCountryCode(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}

/**
 * Strip diacritics so typing "turkiye" finds "Türkiye" — the search box should
 * not require the user to produce characters their keyboard may not have.
 */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Filter for the country combobox: matches on country name or ISO code. */
export function searchCountries(query: string): Country[] {
  const q = normalize(query);
  if (!q) return COUNTRIES;

  // Someone who types an exact ISO code means that country — "de" is Germany,
  // even though Denmark also starts with those letters.
  const exactCode: Country[] = [];
  const startsWith: Country[] = [];
  const contains: Country[] = [];

  for (const country of COUNTRIES) {
    const name = normalize(country.name);
    const code = country.code.toLowerCase();

    if (code === q) exactCode.push(country);
    else if (name.startsWith(q)) startsWith.push(country);
    else if (name.includes(q) || code.startsWith(q)) contains.push(country);
  }

  return [...exactCode, ...startsWith, ...contains];
}

/**
 * Where the jobs actually are.
 *
 * A country-level query ("UX Designer jobs Sweden") matches Google's
 * country-level directory pages — "5000+ Design jobs in Sweden" — because that
 * is what those pages are optimised for. City-level queries hit individual
 * postings far more often, since a posting names its city and a national
 * directory does not. Only the largest employment centres are listed; anything
 * absent falls back to the country name.
 */
const MAJOR_CITIES: Record<string, string[]> = {
  US: ["New York", "San Francisco", "Austin"],
  GB: ["London", "Manchester", "Edinburgh"],
  CA: ["Toronto", "Vancouver", "Montreal"],
  AU: ["Sydney", "Melbourne", "Brisbane"],
  DE: ["Berlin", "Munich", "Hamburg"],
  FR: ["Paris", "Lyon", "Toulouse"],
  NL: ["Amsterdam", "Rotterdam", "Utrecht"],
  SE: ["Stockholm", "Gothenburg", "Malmö"],
  NO: ["Oslo", "Bergen"],
  DK: ["Copenhagen", "Aarhus"],
  FI: ["Helsinki", "Tampere"],
  IE: ["Dublin", "Cork"],
  ES: ["Madrid", "Barcelona", "Valencia"],
  IT: ["Milan", "Rome", "Turin"],
  PT: ["Lisbon", "Porto"],
  PL: ["Warsaw", "Kraków", "Wrocław"],
  CZ: ["Prague", "Brno"],
  AT: ["Vienna", "Graz"],
  BE: ["Brussels", "Antwerp", "Ghent"],
  CH: ["Zurich", "Geneva", "Basel"],
  IN: ["Bengaluru", "Hyderabad", "Mumbai", "Pune"],
  SG: ["Singapore"],
  AE: ["Dubai", "Abu Dhabi"],
  SA: ["Riyadh", "Jeddah"],
  IL: ["Tel Aviv", "Herzliya"],
  JP: ["Tokyo", "Osaka"],
  KR: ["Seoul"],
  CN: ["Shanghai", "Beijing", "Shenzhen"],
  HK: ["Hong Kong"],
  MY: ["Kuala Lumpur"],
  ID: ["Jakarta"],
  PH: ["Manila", "Cebu"],
  VN: ["Ho Chi Minh City", "Hanoi"],
  TH: ["Bangkok"],
  NZ: ["Auckland", "Wellington"],
  ZA: ["Cape Town", "Johannesburg"],
  NG: ["Lagos", "Abuja"],
  KE: ["Nairobi"],
  EG: ["Cairo"],
  BR: ["São Paulo", "Rio de Janeiro"],
  MX: ["Mexico City", "Guadalajara"],
  AR: ["Buenos Aires"],
  CL: ["Santiago"],
  CO: ["Bogotá", "Medellín"],
  PK: ["Karachi", "Lahore"],
  BD: ["Dhaka"],
  TR: ["Istanbul", "Ankara"],
  UA: ["Kyiv", "Lviv"],
  RO: ["Bucharest", "Cluj-Napoca"],
  HU: ["Budapest"],
  GR: ["Athens"],
  EE: ["Tallinn"],
  LT: ["Vilnius"],
  LV: ["Riga"],
  BG: ["Sofia"],
  RS: ["Belgrade"],
  HR: ["Zagreb"],
};

/** Largest employment centres for a country, best first. */
export function majorCities(code: string): string[] {
  return MAJOR_CITIES[code.toUpperCase()] ?? [];
}

export const DEFAULT_COUNTRY = "US";
