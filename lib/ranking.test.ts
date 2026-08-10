import assert from "node:assert/strict";
import { test } from "node:test";

import { companyTokens, dedupe, matchesCompany, rankJobs, sameCompany, scoreTitle } from "./ranking.ts";
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

test("close matches are kept rather than discarded", () => {
  const jobs = [job({ id: "a" }), job({ id: "b", title: "Product Designer" })];
  const { exact, close } = rankJobs(jobs, { designation: "UX Designer", country: "NL" });

  assert.equal(exact.length, 1);
  assert.equal(close.length, 1, "a related role should still be shown, under its own heading");
});

test("stale postings are dropped", () => {
  const old = new Date(Date.now() - 200 * 864e5).toISOString();
  const { exact, close } = rankJobs([job({ postedAt: old })], { designation: "UX Designer", country: "NL" });

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
