/**
 * Autocomplete corpus for the designation input. Purely a client-side
 * convenience — any free-text title is still accepted and sent upstream.
 */
export const JOB_TITLE_SUGGESTIONS: string[] = [
  "Full Stack Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Software Engineer",
  "Senior Software Engineer",
  "Staff Software Engineer",
  "Mobile Engineer (iOS)",
  "Mobile Engineer (Android)",
  "React Native Developer",
  "DevOps Engineer",
  "Site Reliability Engineer",
  "Platform Engineer",
  "Cloud Architect",
  "Security Engineer",
  "QA Automation Engineer",
  "Data Engineer",
  "Data Analyst",
  "Data Scientist",
  "Machine Learning Engineer",
  "AI Research Engineer",
  "MLOps Engineer",
  "Analytics Engineer",
  "Product Manager",
  "Senior Product Manager",
  "Technical Program Manager",
  "Project Manager",
  "Scrum Master",
  "Business Analyst",
  "Product Designer",
  "UX Designer",
  "UI Designer",
  "UX Researcher",
  "Graphic Designer",
  "Growth Marketer",
  "Performance Marketing Manager",
  "Content Marketing Manager",
  "SEO Specialist",
  "Social Media Manager",
  "Brand Manager",
  "Demand Generation Manager",
  "Account Executive",
  "Enterprise Account Executive",
  "Sales Development Representative",
  "Solutions Engineer",
  "Customer Success Manager",
  "Partnerships Manager",
  "Financial Analyst",
  "Accountant",
  "Controller",
  "FP&A Manager",
  "HR Business Partner",
  "Technical Recruiter",
  "Talent Acquisition Specialist",
  "People Operations Manager",
  "Operations Manager",
  "Supply Chain Analyst",
  "Customer Support Specialist",
  "Technical Writer",
  "Legal Counsel",
  "Registered Nurse",
  "Pharmacist",
  "Civil Engineer",
  "Mechanical Engineer",
  "Electrical Engineer",
  // Internships of every kind. With "Internships only" selected, a field on
  // its own ("Marketing") is enough; these cover typing the full title.
  "Internship",
  "Software Engineering Intern",
  "Data Science Intern",
  "Data Analyst Intern",
  "Machine Learning Intern",
  "Product Management Intern",
  "UX Design Intern",
  "Graphic Design Intern",
  "Marketing Intern",
  "Communications Intern",
  "Finance Intern",
  "Accounting Intern",
  "HR Intern",
  "Sales Intern",
  "Business Analyst Intern",
  "Consulting Intern",
  "Legal Intern",
  "Research Intern",
  "Engineering Intern",
  "Summer Analyst",
  "Summer Internship",
  "Graduate Trainee",
  "Graduate Programme",
  "Management Trainee",
  "Working Student",
  "Apprenticeship",
  "Thesis Internship",
  "Co-op",
];

export function suggestTitles(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return JOB_TITLE_SUGGESTIONS.slice(0, limit);

  const startsWith: string[] = [];
  const contains: string[] = [];

  for (const title of JOB_TITLE_SUGGESTIONS) {
    const lower = title.toLowerCase();
    if (lower.startsWith(q)) startsWith.push(title);
    else if (lower.includes(q)) contains.push(title);
  }

  return [...startsWith, ...contains].slice(0, limit);
}
