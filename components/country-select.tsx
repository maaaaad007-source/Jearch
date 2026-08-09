"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCountry, searchCountries } from "@/lib/countries";
import { cn } from "@/lib/utils";

interface CountrySelectProps {
  id?: string;
  value: string;
  onChange: (code: string) => void;
}

/**
 * Type-to-filter country picker.
 *
 * Radix Select has no search affordance, and the country list is long enough
 * that scrolling it is the slow path — so this is a combobox: a popover with a
 * filter box over the alphabetical list, driven by keyboard or mouse.
 */
export function CountrySelect({ id, value, onChange }: CountrySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);

  const listRef = React.useRef<HTMLUListElement>(null);
  const selected = getCountry(value);
  const matches = React.useMemo(() => searchCountries(query), [query]);

  const activeIndex = Math.min(highlighted, Math.max(0, matches.length - 1));

  // Reopening always starts from a clean, unfiltered list.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setHighlighted(0);
    }
  }

  React.useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex];
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function commit(code: string) {
    onChange(code);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (matches.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(matches[activeIndex].code);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-label="Country"
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm",
          "outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[color-mix(in_oklch,var(--ring)_35%,transparent)]",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden>{selected?.flag ?? "🌐"}</span>
          <span className="truncate">{selected?.name ?? "Select a country"}</span>
          {selected && <span className="text-xs text-muted-foreground">{selected.code}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>

      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        onOpenAutoFocus={(event) => {
          // Focus the filter box rather than the first option, so the user can
          // just start typing.
          event.preventDefault();
          (event.currentTarget as HTMLElement).querySelector("input")?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlighted(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search countries…"
            aria-label="Search countries"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {matches.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No country matches “{query}”.
          </p>
        ) : (
          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {matches.map((country, index) => (
              <li key={country.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={country.code === value}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => commit(country.code)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm transition-colors",
                    index === activeIndex ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  <span aria-hidden>{country.flag}</span>
                  <span className="flex-1 truncate">{country.name}</span>
                  <span className="text-xs text-muted-foreground">{country.code}</span>
                  {country.code === value && <Check className="size-4 shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
