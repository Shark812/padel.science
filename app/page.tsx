import Link from "next/link";
import { Search } from "lucide-react";

import { SearchResultsPanel } from "@/components/search-results-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchRackets } from "@/lib/db";

type HomeProps = {
  searchParams: Promise<{
    q?: string;
    sort?: string;
  }>;
};

const sortOptions = [
  { value: "overall", label: "Overall", field: "overall_rating_avg" },
  { value: "power", label: "Power", field: "power_avg" },
  { value: "control", label: "Control", field: "control_avg" },
  { value: "maneuverability", label: "Maneuverability", field: "maneuverability_avg" },
  { value: "sweet_spot", label: "Sweet spot", field: "sweet_spot_avg" },
] as const;

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const requestedSort = params.sort?.trim() ?? "overall";

  const rackets = query ? await searchRackets(query) : [];
  const activeSortValue =
    sortOptions.find((option) => option.value === requestedSort)?.value ?? sortOptions[0].value;

  return (
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_15%_10%,hsl(var(--primary)/0.18),transparent_32%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted))_100%)] px-5 py-8">
      <section className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col justify-center">
        <div className="mx-auto w-full max-w-3xl text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-primary">
            Padel Portal
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
            Find a racket.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Search the local database and browse unified models collected from
            the available padel sources.
          </p>

          <form
            action="/"
            className="mt-10 grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-border bg-card p-2 shadow-[0_24px_80px_-48px_hsl(var(--foreground)/0.45)]"
          >
            <input type="hidden" name="sort" value={activeSortValue} />
            <label className="sr-only" htmlFor="q">
              Search by name or brand
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.8}
              />
              <Input
                id="q"
                name="q"
                defaultValue={query}
                placeholder="Bullpadel Vertex, Adidas Metalbone..."
                className="h-13 border-0 pl-12 text-base shadow-none focus-visible:ring-0"
              />
            </div>
            <Button type="submit" className="h-13 px-6 active:translate-y-px">
              Search
            </Button>
          </form>
        </div>

        {query ? (
          <SearchResultsPanel
            query={query}
            rackets={rackets}
            sortOptions={sortOptions}
            initialSortValue={activeSortValue}
          />
        ) : null}
      </section>
    </main>
  );
}
