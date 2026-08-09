"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES } from "@/lib/countries";
import { suggestTitles } from "@/lib/job-titles";
import { cn } from "@/lib/utils";
import { useSearchStore } from "@/store/use-search-store";

export function SearchForm() {
  const designation = useSearchStore((s) => s.designation);
  const country = useSearchStore((s) => s.country);
  const status = useSearchStore((s) => s.status);
  const setDesignation = useSearchStore((s) => s.setDesignation);
  const setCountry = useSearchStore((s) => s.setCountry);
  const search = useSearchStore((s) => s.search);

  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const busy = status === "loading-jobs" || status === "enriching";
  const suggestions = React.useMemo(() => suggestTitles(designation), [designation]);

  React.useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function commit(value: string) {
    setDesignation(value);
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
      className="grid gap-4 rounded-lg border border-border bg-card/70 p-4 shadow-sm backdrop-blur sm:p-5 md:grid-cols-[minmax(0,1fr)_16rem_auto] md:items-end"
    >
      <div ref={containerRef} className="relative grid gap-2">
        <Label htmlFor="designation">Job title / designation</Label>
        <Input
          id="designation"
          value={designation}
          placeholder="e.g. Full Stack Engineer"
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

      <div className="grid gap-2">
        <Label htmlFor="country">Country</Label>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger id="country" aria-label="Country">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((item) => (
              <SelectItem key={item.code} value={item.code}>
                <span className="flex items-center gap-2">
                  <span aria-hidden>{item.flag}</span>
                  <span>{item.name}</span>
                  <span className="text-xs text-muted-foreground">{item.code}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" size="lg" disabled={busy} className="w-full md:w-auto">
        {busy ? <Loader2 className="animate-spin" /> : <Search />}
        {busy ? "Searching…" : "Find Jobs & Contacts"}
      </Button>
    </form>
  );
}
