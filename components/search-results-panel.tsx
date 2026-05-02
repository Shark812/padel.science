"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, List } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { RacketSearchResult } from "@/lib/db";

type SortOption = {
  value: string;
  label: string;
  field:
    | "overall_rating_avg"
    | "power_avg"
    | "control_avg"
    | "maneuverability_avg"
    | "sweet_spot_avg";
};

type SearchResultsPanelProps = {
  query: string;
  rackets: RacketSearchResult[];
  sortOptions: readonly SortOption[];
  initialSortValue: string;
};

type FilterKey = "power" | "control" | "maneuverability" | "sweet_spot";

const filterDefs: { key: FilterKey; label: string; field: SortOption["field"] }[] = [
  { key: "power", label: "Power", field: "power_avg" },
  { key: "control", label: "Control", field: "control_avg" },
  { key: "maneuverability", label: "Maneuverability", field: "maneuverability_avg" },
  { key: "sweet_spot", label: "Sweet spot", field: "sweet_spot_avg" },
];

function parseMetric(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatScore(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "n.d.";
  }

  const score = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(score) ? score.toFixed(1) : "n.d.";
}

export function SearchResultsPanel({
  query,
  rackets,
  sortOptions,
  initialSortValue,
}: SearchResultsPanelProps) {
  const [sortValue, setSortValue] = useState(initialSortValue);
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [mins, setMins] = useState<Record<FilterKey, number>>({
    power: 3,
    control: 3,
    maneuverability: 3,
    sweet_spot: 3,
  });

  const activeSort = useMemo(
    () => sortOptions.find((option) => option.value === sortValue) ?? sortOptions[0],
    [sortOptions, sortValue],
  );

  const filteredAndSorted = useMemo(() => {
    const filtered = rackets.filter((racket) =>
      filterDefs.every((def) => {
        const score = parseMetric(racket[def.field]);
        return score !== null && score >= mins[def.key];
      }),
    );

    return filtered.sort((a, b) => {
      const aYear = a.year ?? -1;
      const bYear = b.year ?? -1;
      if (bYear !== aYear) {
        return bYear - aYear;
      }

      const aMetric = parseMetric(a[activeSort.field]) ?? -1;
      const bMetric = parseMetric(b[activeSort.field]) ?? -1;
      if (bMetric !== aMetric) {
        return bMetric - aMetric;
      }

      return a.canonical_name.localeCompare(b.canonical_name);
    });
  }, [activeSort.field, mins, rackets]);

  return (
    <div className="mx-auto mt-12 grid w-full max-w-6xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="h-fit rounded-xl border border-border bg-card p-4 lg:sticky lg:top-20">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Filters</h2>
        <div className="mt-5 grid gap-5">
          {filterDefs.map((def) => (
            <div key={def.key} className="grid gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">{def.label}</label>
                <span className="font-mono text-sm text-foreground">{mins[def.key].toFixed(1)}</span>
              </div>
              <Slider
                min={3}
                max={9.5}
                step={0.5}
                value={[mins[def.key]]}
                onValueChange={(value) =>
                  setMins((prev) => ({
                    ...prev,
                    [def.key]: value[0] ?? prev[def.key],
                  }))
                }
              />
            </div>
          ))}
        </div>
      </aside>

      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Results</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredAndSorted.length} results for "{query}"
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort by</span>
            <Select value={sortValue} onValueChange={setSortValue}>
              <SelectTrigger className="w-[210px] rounded-md border-border bg-card">
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-1 flex items-center gap-1 rounded-md border border-border bg-card p-1">
              <Button
                type="button"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="size-8"
                title="List view"
                onClick={() => setViewMode("list")}
              >
                <List className="size-4" strokeWidth={1.8} />
              </Button>
              <Button
                type="button"
                variant={viewMode === "cards" ? "secondary" : "ghost"}
                size="icon"
                className="size-8"
                title="Cards view"
                onClick={() => setViewMode("cards")}
              >
                <LayoutGrid className="size-4" strokeWidth={1.8} />
              </Button>
            </div>
          </div>
        </div>

        {filteredAndSorted.length > 0 ? (
          viewMode === "list" ? (
            <div className="grid gap-3">
              {filteredAndSorted.map((racket) => (
                <Link
                  key={racket.unified_id}
                  href={`/rackets/${racket.unified_id}`}
                  className="group grid gap-4 rounded-xl border border-border bg-card p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 md:grid-cols-[72px_1fr_auto]"
                >
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-muted">
                    {racket.image_url ? (
                      <img
                        src={racket.image_url}
                        alt={racket.canonical_name}
                        className="max-h-16 max-w-16 object-contain"
                      />
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">IMG</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{racket.brand_name}</Badge>
                      {racket.year ? <span className="text-sm text-muted-foreground">{racket.year}</span> : null}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground group-hover:text-primary">
                      {racket.canonical_name}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {racket.source_count} sources - reliability {racket.reliability_score}/5
                    </p>
                  </div>
                  <div className="flex items-center md:justify-end">
                    <div className="rounded-lg border border-border px-4 py-3 text-right">
                      <p className="font-mono text-2xl font-semibold text-foreground">
                        {formatScore(racket.overall_rating_avg)}
                      </p>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Overall</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredAndSorted.map((racket) => (
                <Link
                  key={racket.unified_id}
                  href={`/rackets/${racket.unified_id}`}
                  className="group rounded-xl border border-border bg-card p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <div className="flex h-[160px] items-center justify-center rounded-lg bg-muted p-4">
                    {racket.image_url ? (
                      <img
                        src={racket.image_url}
                        alt={racket.canonical_name}
                        className="max-h-full w-full object-contain"
                      />
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">IMG</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{racket.brand_name}</Badge>
                    {racket.year ? <span className="text-sm text-muted-foreground">{racket.year}</span> : null}
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-base font-semibold tracking-tight text-foreground group-hover:text-primary">
                    {racket.canonical_name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {racket.source_count} sources - reliability {racket.reliability_score}/5
                  </p>
                  <div className="mt-3 rounded-lg border border-border px-3 py-2 text-right">
                    <p className="font-mono text-xl font-semibold text-foreground">
                      {formatScore(racket.overall_rating_avg)}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Overall</p>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card/70 p-8 text-center text-muted-foreground">
            No rackets match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
