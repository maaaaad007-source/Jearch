/**
 * Titles we consider "decision makers" for an outbound application: the people
 * who own the req or the team the req reports into. Used as the title filter
 * for Apollo and as the ranking signal for Hunter results.
 */
export const DECISION_MAKER_TITLES: string[] = [
  "Talent Acquisition",
  "Talent Acquisition Manager",
  "Head of Talent",
  "Recruiter",
  "Technical Recruiter",
  "Senior Recruiter",
  "Recruiting Manager",
  "Head of Recruiting",
  "Hiring Manager",
  "HR Manager",
  "Human Resources Manager",
  "People Operations Manager",
  "Head of People",
  "Chief People Officer",
  "Engineering Manager",
  "Director of Engineering",
  "VP of Engineering",
  "Head of Engineering",
  "CTO",
  "Founder",
  "Co-Founder",
];

/**
 * Weighted match list — higher score wins when picking the single contact to
 * surface on a card. Recruiters beat generalist HR, which beats execs, because
 * a recruiter is the one who actually reads inbound mail about an open req.
 */
const TITLE_WEIGHTS: Array<[RegExp, number]> = [
  [/talent acquisition|technical recruiter/i, 100],
  [/head of talent|recruiting manager|head of recruiting/i, 95],
  [/recruiter|recruitment/i, 90],
  [/hiring manager/i, 85],
  [/head of people|chief people officer|people operations/i, 70],
  [/hr manager|human resources/i, 65],
  [/engineering manager|director of engineering/i, 60],
  [/vp of engineering|head of engineering/i, 55],
  [/cto|chief technology/i, 45],
  [/founder|ceo|chief executive/i, 40],
];

export function scoreTitle(title: string | null): number {
  if (!title) return 0;
  for (const [pattern, weight] of TITLE_WEIGHTS) {
    if (pattern.test(title)) return weight;
  }
  return 10;
}

/** Hunter exposes departments rather than titles; these are the relevant ones. */
export const HUNTER_DEPARTMENTS = "hr,executive,management";
