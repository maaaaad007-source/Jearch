import { ResultsGrid } from "@/components/results-grid";
import { SearchForm } from "@/components/search-form";

export default function HomePage() {
  return (
    <div className="grid gap-8">
      <section className="grid gap-4">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Skip the application portal. Reach the person hiring.
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Search active postings by job title and country, then get the decision maker behind each one —
            recruiter or hiring lead, with LinkedIn, work email and direct line where they exist.
          </p>
        </div>

        <SearchForm />
      </section>

      <section>
        <ResultsGrid />
      </section>
    </div>
  );
}
