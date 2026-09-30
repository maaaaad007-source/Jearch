"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CountrySelect } from "@/components/country-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestTitles } from "@/lib/job-titles";
import { cn } from "@/lib/utils";
import { useSearchStore } from "@/store/use-search-store";
import type { JobType } from "@/types";

const JOB_TYPES: Array<{ value: JobType; label: string; hint: string }> = [
  { value: "all", label: "Jobs & internships", hint: "Everything, internships included" },
  { value: "jobs", label: "Jobs only", hint: "Leave internships out" },
  {
    value: "internships",
    label: "Internships only",
    hint: "Internships, traineeships, working-student, graduate, apprenticeship and thesis roles",
  },
];

/** "UX Designer, Prod" → head "UX Designer," and tail "Prod". */
function splitTrailingRole(value: string): { head: string; tail: string } {
  const separator = value.lastIndexOf(",");
  if (separator === -1) return { head: "", tail: value };

  return { head: value.slice(0, separator + 1), tail: value.slice(separator + 1).trim() };
}

export function SearchForm() {
  const designation = useSearchStore((s) => s.designation);
  const company = useSearchStore((s) => s.company);
  const country = useSearchStore((s) => s.country);
  const jobType = useSearchStore((s) => s.jobType);
  const status = useSearchStore((s) => s.status);
  const setDesignation = useSearchStore((s) => s.setDesignation);
  const setCompany = useSearchStore((s) => s.setCompany);
  const setCountry = useSearchStore((s) => s.setCountry);
  const setJobType = useSearchStore((s) => s.setJobType);
  const search = useSearchStore((s) => s.search);

  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const busy = status === "searching";

  // With several roles in the box, the suggestion list belongs to the one
  // being typed — completing the whole string would replace roles already
  // entered.
  const { head, tail } = React.useMemo(() => splitTrailingRole(designation), [designation]);
  const suggestions = React.useMemo(() => suggestTitles(tail), [tail]);

  React.useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function commit(value: string) {
    setDesignation(head ? `${head} ${value}` : value);
    setOpen(false);
    setHighlighted(0);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && suggestions[highlighted]) {
      event.preventDefault();
      commit(suggestions[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setOpen(false);
    void search();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-lg border border-border bg-card/70 p-4 shadow-sm backdrop-blur sm:p-5 md:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_15rem_auto] lg:items-end"
    >
      <div ref={containerRef} className="relative grid grid-cols-1 gap-2">
        <Label htmlFor="designation">
          Job title <span className="font-normal text-muted-foreground">(comma-separate for several)</span>
        </Label>
        <Input
          id="designation"
          value={designation}
          placeholder={jobType === "internships" ? "e.g. UX Design, Marketing — or leave blank" : "e.g. UX Designer, Product Designer"}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="designation-suggestions"
          aria-autocomplete="list"
          onChange={(event) => {
            setDesignation(event.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />

        {open && suggestions.length > 0 && (
          <ul
            id="designation-suggestions"
            role="listbox"
            className="absolute top-full z-40 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card p-1 shadow-lg"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => commit(suggestion)}
                  className={cn(
                    "w-full rounded-sm px-2 py-2 text-left text-sm transition-colors",
                    index === highlighted ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label htmlFor="company">
          Company <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="company"
          value={company}
          placeholder="e.g. Spotify"
          autoComplete="off"
          onChange={(event) => setCompany(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label htmlFor="country">Country</Label>
        <CountrySelect id="country" value={country} onChange={setCountry} />
      </div>

      <Button type="submit" size="lg" disabled={busy} className="w-full lg:w-auto">
        {busy ? <Loader2 className="animate-spin" /> : <Search />}
        {busy ? "Searching…" : "Find Jobs & Contacts"}
      </Button>

      <div className="flex flex-wrap items-center gap-2 md:col-span-2 lg:col-span-4">
        <span id="job-type-label" className="text-sm font-medium">
          Show
        </span>
        <div
          role="radiogroup"
          aria-labelledby="job-type-label"
          className="inline-flex flex-wrap rounded-md border border-border bg-background p-0.5"
        >
          {JOB_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={jobType === option.value}
              title={option.hint}
              onClick={() => setJobType(option.value)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm transition-colors",
                jobType === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {JOB_TYPES.find((option) => option.value === jobType)?.hint}
        </span>
      </div>
    </form>
  );
}
