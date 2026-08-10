import assert from "node:assert/strict";
import { test } from "node:test";

import { companyTokens, dedupe, matchesCompany, parseRoles, rankJobs, sameCompany, scoreTitle } from "./ranking.ts";
import type { JobPost } from "../types/index.ts";

/**
 * Run with: node --test --experimental-strip-types lib/ranking.test.ts
 *
 * These lock in the behaviours that were reported as bugs, so a future
 * simplification cannot quietly reintroduce them.
 */

function job(overrides: Partial<JobPost> = {}): JobPost {
  return {
    id: "test:1",
    title: "UX Designer",
    companyName: "Booking.com B.V.",
    companyDomain: null,
    city: "Amsterdam",
    region: "Noord-Holland",
    workType: "Hybrid",
    salary: null,
    postedAt: new Date().toISOString(),
    applyUrl: null,
    summary: "",
    description: null,
    source: "Adzuna",
    directFromEmployer: false,
    ...overrides,
  };
}

test("company names ignore legal suffixes and punctuation", () => {
  assert.deepEqual(companyTokens("Booking.com B.V."), ["bookingcom"]);
  assert.ok(sameCompany("Booking.com", "Booking.com B.V."));
  assert.ok(sameCompany("Google", "Google Netherlands"));
});

test("a shorter name inside a longer word is not the same company", () => {
  // "ING" is a substring of "Booking" — this returned ING's jobs for a
  // Booking.com search until matching moved from substrings to tokens.
  assert.equal(sameCompany("ING", "Booking.com"), false);
  assert.equal(sameCompany("Meta", "Metabase"), false);
  assert.equal(matchesCompany(job({ companyName: "ING" }), "Booking.com"), false);
});

test("a different role sharing a word is not an exact match", () => {
  // "UX Writer" answering a "UX Designer" search was the original complaint.
  assert.ok(scoreTitle("UX Designer", "UX Designer") > scoreTitle("UX Writer", "UX Designer"));
  assert.ok(scoreTitle("UX Writer", "UX Designer") < 70);
});

test("synonyms and seniority do not break an exact match", () => {
  assert.ok(scoreTitle("User Experience Designer", "UX Designer") >= 70);
  assert.ok(scoreTitle("Senior UX Designer", "UX Designer") >= 70);
});

test("a company name written with different spacing still matches", () => {
  // Adzuna and the user rarely agree on where the spaces go.
  assert.ok(sameCompany("Booking com", "Booking.com"));
  assert.ok(sameCompany("BookingCom", "Booking.com"));
});

test("a company search that finds nothing still reports the role elsewhere", () => {
  const jobs = [
    job({ id: "a", companyName: "Adyen" }),
    job({ id: "b", companyName: "ING", title: "UX Designer" }),
  ];

  const { exact, close, elsewhere, excluded } = rankJobs(jobs, {
    designations: ["UX Designer"],
    country: "NL",
    company: "Booking.com",
  });

  assert.equal(exact.length, 0);
  assert.equal(close.length, 0);
  assert.equal(elsewhere.length, 2, "the role was found, just not at that employer");
  assert.equal(excluded.company, 2);
});

test("excluded postings are counted by reason", () => {
  const old = new Date(Date.now() - 200 * 864e5).toISOString();
  const { excluded } = rankJobs(
    [job({ id: "a", postedAt: old }), job({ id: "b", title: "Chef de Partie" })],
    { designations: ["UX Designer"], country: "NL" },
  );

  assert.equal(excluded.stale, 1);
  assert.equal(excluded.title, 1);
});

test("close matches are kept rather than discarded", () => {
  const jobs = [job({ id: "a" }), job({ id: "b", title: "Product Designer" })];
  const { exact, close } = rankJobs(jobs, { designations: ["UX Designer"], country: "NL" });

  assert.equal(exact.length, 1);
  assert.equal(close.length, 1, "a related role should still be shown, under its own heading");
});

test("stale postings are dropped", () => {
  const old = new Date(Date.now() - 200 * 864e5).toISOString();
  const { exact, close } = rankJobs([job({ postedAt: old })], { designations: ["UX Designer"], country: "NL" });

  assert.equal(exact.length + close.length, 0);
});

test("seniority makes a posting distinct, even at the same employer", () => {
  const unique = dedupe([job({ id: "a" }), job({ id: "b", title: "Senior UX Designer" })]);

  assert.equal(unique.length, 2, "a senior opening is not a duplicate of the non-senior one");
});

test("the same posting from two sources collapses to one", () => {
  const unique = dedupe([
    job({ id: "adzuna:1", description: "short" }),
    job({ id: "jobtech:1", description: "a much longer description wins" }),
  ]);

  assert.equal(unique.length, 1);
  assert.equal(unique[0].description, "a much longer description wins");
});

test("the employer's own listing beats an aggregator's copy", () => {
  const unique = dedupe([
    job({ id: "adzuna:1", description: "a long aggregated copy of the posting", source: "Adzuna" }),
    job({ id: "greenhouse:1", description: "shorter", source: "Greenhouse", directFromEmployer: true }),
  ]);

  assert.equal(unique.length, 1);
  assert.equal(unique[0].source, "Greenhouse", "the primary record wins even when its text is shorter");
});

test("several roles can be searched at once", () => {
  assert.deepEqual(parseRoles("UX Designer, Product Designer"), ["UX Designer", "Product Designer"]);
  assert.deepEqual(parseRoles("UX Designer / Product Designer"), ["UX Designer", "Product Designer"]);
  assert.deepEqual(parseRoles("UX Designer or Product Designer"), ["UX Designer", "Product Designer"]);
  assert.deepEqual(parseRoles("UX Designer"), ["UX Designer"]);
  // The same role twice is one role, however it was capitalised.
  assert.deepEqual(parseRoles("UX Designer, ux designer"), ["UX Designer"]);
});

test("a posting matching any searched role is kept, and says which", () => {
  const jobs = [
    job({ id: "a", title: "UX Designer" }),
    job({ id: "b", title: "Product Designer" }),
    job({ id: "c", title: "Chef de Partie" }),
  ];

  const { exact } = rankJobs(jobs, {
    designations: ["UX Designer", "Product Designer"],
    country: "NL",
  });

  assert.equal(exact.length, 2);
  assert.deepEqual(
    exact.map((entry) => entry.matchedRole).sort(),
    ["Product Designer", "UX Designer"],
  );
});

test("a single role search leaves the role badge off", () => {
  const { exact } = rankJobs([job()], { designations: ["UX Designer"], country: "NL" });

  assert.equal(exact[0].matchedRole, null, "labelling every card with the only role searched is noise");
});
