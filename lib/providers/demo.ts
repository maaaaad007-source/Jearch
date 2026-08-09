import type { ContactPerson, JobPost, SearchParams, WorkType } from "@/types";
import { countryName } from "@/lib/countries";
import { summarizeResponsibilities } from "@/lib/text";

/**
 * Deterministic sample data used when no provider API keys are configured.
 *
 * Everything here is synthetic — fake companies on `.example` domains, fake
 * people, fake numbers — so demo mode can never be mistaken for real contact
 * data or used to mail an actual person. The UI banners it as demo data.
 *
 * Results are seeded off the query so the same search always returns the same
 * cards, which keeps bookmarking and refreshes coherent.
 */

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMPANIES = [
  { name: "Northwind Labs", domain: "northwind-labs.example" },
  { name: "Lumen Systems", domain: "lumensystems.example" },
  { name: "Kestrel Analytics", domain: "kestrelanalytics.example" },
  { name: "Vantage Cloud", domain: "vantagecloud.example" },
  { name: "Harborline", domain: "harborline.example" },
  { name: "Orchid Health", domain: "orchidhealth.example" },
  { name: "Sable & Co", domain: "sableandco.example" },
  { name: "Ironpeak Digital", domain: "ironpeak.example" },
  { name: "Blue Meridian", domain: "bluemeridian.example" },
  { name: "Cobalt Grid", domain: "cobaltgrid.example" },
  { name: "Fernway Robotics", domain: "fernway.example" },
  { name: "Atlas Provisions", domain: "atlasprovisions.example" },
];

const CITIES: Record<string, string[]> = {
  US: ["San Francisco", "New York", "Austin", "Seattle", "Boston", "Denver"],
  GB: ["London", "Manchester", "Bristol", "Edinburgh", "Leeds"],
  CA: ["Toronto", "Vancouver", "Montreal", "Ottawa"],
  AU: ["Sydney", "Melbourne", "Brisbane", "Perth"],
  DE: ["Berlin", "Munich", "Hamburg", "Cologne"],
  IN: ["Bengaluru", "Hyderabad", "Pune", "Mumbai", "Gurugram"],
  AE: ["Dubai", "Abu Dhabi", "Sharjah"],
  SG: ["Singapore"],
  NL: ["Amsterdam", "Rotterdam", "Utrecht"],
  FR: ["Paris", "Lyon", "Toulouse"],
};

const FALLBACK_CITIES = ["Capital District", "Central Business District", "Tech Park"];

const WORK_TYPES: WorkType[] = ["Remote", "Hybrid", "On-site"];

const CURRENCIES: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  IN: "INR",
  AE: "AED",
  SA: "SAR",
  SG: "SGD",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  CZ: "CZK",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  HK: "HKD",
  BR: "BRL",
  MX: "MXN",
  ZA: "ZAR",
  IL: "ILS",
  TR: "TRY",
};

/** Countries on the euro; everything unlisted falls back to USD. */
const EUROZONE = new Set(["DE", "FR", "NL", "IE", "ES", "IT", "PT", "FI", "AT", "BE"]);

/** Rough magnitude adjustment so demo salaries are not nonsense in ¥ or ₹. */
const CURRENCY_SCALE: Record<string, number> = {
  INR: 20,
  JPY: 150,
  KRW: 1300,
  CNY: 5,
  TRY: 20,
  ZAR: 12,
  MXN: 12,
  BRL: 4,
  SEK: 8,
  NOK: 8,
  CZK: 15,
  PLN: 3,
  AED: 3,
  SAR: 3,
};

const FIRST_NAMES = [
  "Priya", "Marcus", "Elena", "Tobias", "Amara", "Jonas", "Rachel", "Diego",
  "Nadia", "Samuel", "Yuki", "Farah", "Oliver", "Ingrid", "Kwame", "Lena",
];

const LAST_NAMES = [
  "Raghavan", "Bennett", "Kowalski", "Ferreira", "Okonkwo", "Lindqvist",
  "Moreau", "Castellanos", "Haddad", "Whitfield", "Tanaka", "Nakamura",
  "Sorensen", "Delgado", "Ibrahim", "Novak",
];

const CONTACT_TITLES = [
  "Technical Recruiter",
  "Talent Acquisition Manager",
  "Head of Talent",
  "Senior Recruiter",
  "Engineering Manager",
  "Head of People",
  "Director of Engineering",
  "People Operations Manager",
];

const RESPONSIBILITY_TEMPLATES = [
  "Own delivery of {title} work end to end, partnering with product and design to ship user-facing improvements every sprint. You will help shape the technical direction of a small, senior team and mentor engineers joining over the next year.",
  "Drive the day-to-day execution of our {title} function, from planning through measurement and iteration. Expect to work directly with the leadership team on priorities that move revenue within the first two quarters.",
  "Lead {title} initiatives across a fast-moving portfolio of projects with real ownership from week one. You will define the processes the rest of the team follows as we scale headcount through next year.",
  "Build and maintain the systems behind our {title} charter, balancing new feature work against reliability commitments. You will be the point person for cross-team reviews and for the quality bar we hold ourselves to.",
];

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)];
}

export function demoJobs(params: SearchParams): JobPost[] {
  const rand = mulberry32(hashSeed(`${params.designation.toLowerCase()}|${params.country}|${params.page ?? 1}`));
  const country = params.country.toUpperCase();
  const cities = CITIES[country] ?? FALLBACK_CITIES;
  const currency = CURRENCIES[country] ?? (EUROZONE.has(country) ? "EUR" : "USD");
  const count = 8 + Math.floor(rand() * 3);

  const companies = [...COMPANIES].sort(() => rand() - 0.5).slice(0, count);

  return companies.map((company, index) => {
    const workType = pick(rand, WORK_TYPES);
    const scale = CURRENCY_SCALE[currency] ?? 1;
    const base = (55_000 + Math.floor(rand() * 90_000)) * scale;
    const description = pick(rand, RESPONSIBILITY_TEMPLATES).replaceAll("{title}", params.designation);
    const seniority = rand() > 0.65 ? "Senior " : rand() > 0.85 ? "Lead " : "";

    return {
      id: `demo:${hashSeed(`${company.domain}${params.designation}${index}`)}`,
      title: `${seniority}${params.designation}`,
      companyName: company.name,
      companyDomain: company.domain,
      companyLogoUrl: null,
      city: workType === "Remote" ? null : pick(rand, cities),
      country: countryName(country),
      workType,
      salary: {
        min: base,
        max: base + (20_000 + Math.floor(rand() * 40_000)) * scale,
        currency,
        period: "YEAR",
      },
      postedAt: new Date(Date.now() - Math.floor(rand() * 21) * 86_400_000).toISOString(),
      applyUrl: null,
      summary: summarizeResponsibilities(description),
      description,
      source: "Demo data",
    } satisfies JobPost;
  });
}

export function demoContacts(domain: string, companyName?: string): ContactPerson[] {
  const rand = mulberry32(hashSeed(domain));
  const count = 1 + Math.floor(rand() * 3);

  return Array.from({ length: count }, (_, index) => {
    const first = pick(rand, FIRST_NAMES);
    const last = pick(rand, LAST_NAMES);
    const roll = rand();

    return {
      id: `demo-contact:${domain}:${index}`,
      name: `${first} ${last}`,
      title: pick(rand, CONTACT_TITLES),
      linkedinUrl: `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-demo`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
      emailStatus: roll > 0.55 ? "verified" : roll > 0.25 ? "guess" : "unverified",
      phone: rand() > 0.45 ? `+1 555 0${100 + Math.floor(rand() * 899)}` : null,
      phoneExtension: rand() > 0.8 ? String(100 + Math.floor(rand() * 899)) : null,
      companyName: companyName ?? null,
      companyDomain: domain,
      confidence: 50 + Math.floor(rand() * 50),
      source: "Demo data",
    } satisfies ContactPerson;
  });
}
