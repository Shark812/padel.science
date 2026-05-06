"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Plus,
  Scale,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { RacketSearchResult } from "@/lib/db";
import { cn } from "@/lib/utils";

const MAX_COMPARE = 2;
const INITIAL_VISIBLE_RESULTS = 9;
const LOAD_MORE_BATCH_SIZE = 9;
const COMPARE_STORAGE_KEY = "padel-compare-selection-v1";

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

type FilterKey = "overall" | "power" | "control" | "maneuverability" | "sweet_spot";
type CompareSelection = {
  id: string;
  canonical_name: string;
  brand_name: string;
  image_url: string | null;
};

const filterDefs: {
  key: FilterKey;
  label: string;
  field?: SortOption["field"];
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "overall", label: "Overall score", field: "overall_rating_avg", min: 0, max: 10, step: 0.5 },
  { key: "power", label: "Power", field: "power_avg", min: 0, max: 10, step: 0.5 },
  { key: "control", label: "Control", field: "control_avg", min: 0, max: 10, step: 0.5 },
  { key: "maneuverability", label: "Maneuverability", field: "maneuverability_avg", min: 0, max: 10, step: 0.5 },
  { key: "sweet_spot", label: "Sweet spot", field: "sweet_spot_avg", min: 0, max: 10, step: 0.5 },
];

function parseMetric(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function score(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreText(value: string | number | null | undefined) {
  const parsed = score(value);
  return parsed === null ? "N/A" : parsed.toFixed(1);
}

function overallScoreText(value: string | number | null | undefined) {
  const parsed = score(value);
  return parsed === null ? "N/A" : parsed.toFixed(1);
}

function reliabilityText(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return Math.round(value).toString();
}

function metricWidth(value: string | number | null | undefined) {
  const parsed = score(value);
  return `${Math.max(0, Math.min(100, (parsed ?? 0) * 10))}%`;
}

export function SearchResultsPanel({
  query,
  rackets,
  sortOptions,
  initialSortValue,
}: SearchResultsPanelProps) {
  const router = useRouter();
  const [sortValue, setSortValue] = useState(initialSortValue);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_RESULTS);
  const [selectedCompare, setSelectedCompare] = useState<CompareSelection[]>([]);
  const [shape, setShape] = useState("all");
  const [animateMetrics, setAnimateMetrics] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [showCompareBar, setShowCompareBar] = useState(false);
  const [isCompareBarClosing, setIsCompareBarClosing] = useState(false);
  const [showLowReliability, setShowLowReliability] = useState(false);
  const [mins, setMins] = useState<Record<FilterKey, number>>({
    overall: 0,
    power: 0,
    control: 0,
    maneuverability: 0,
    sweet_spot: 0,
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const recommendedRef = useRef<HTMLDivElement | null>(null);

  const selectedIds = useMemo(
    () => selectedCompare.map((item) => item.id),
    [selectedCompare],
  );

  useEffect(() => {
    if (selectedCompare.length > 0) {
      setIsCompareBarClosing(false);
      setShowCompareBar(true);
      return;
    }

    if (!showCompareBar) return;

    setIsCompareBarClosing(true);
    const timeout = window.setTimeout(() => {
      setShowCompareBar(false);
      setIsCompareBarClosing(false);
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [selectedCompare.length, showCompareBar]);

  useEffect(() => {
    setAnimateMetrics(false);

    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setAnimateMetrics(true));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(COMPARE_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as CompareSelection[];
      if (!Array.isArray(parsed)) return;

      const normalized = parsed
        .filter((item) => item && typeof item.id === "string")
        .slice(0, MAX_COMPARE)
        .map((item) => ({
          id: item.id,
          canonical_name: item.canonical_name ?? "Unknown racket",
          brand_name: item.brand_name ?? "Unknown brand",
          image_url: item.image_url ?? null,
        }));

      setSelectedCompare(normalized);
    } catch {
      window.sessionStorage.removeItem(COMPARE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    setSelectedCompare((current) =>
      current.map((item) => {
        const racket = rackets.find((candidate) => candidate.unified_id === item.id);
        if (!racket) return item;
        return {
          id: racket.unified_id,
          canonical_name: racket.canonical_name,
          brand_name: racket.brand_name,
          image_url: racket.image_url,
        };
      }),
    );
  }, [rackets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(selectedCompare));
  }, [selectedCompare]);

  const activeSort = useMemo(
    () => sortOptions.find((option) => option.value === sortValue) ?? sortOptions[0],
    [sortOptions, sortValue],
  );

  const shapeOptions = useMemo(() => {
    const values = new Set<string>();
    rackets.forEach((racket) => {
      if (racket.shape) values.add(racket.shape);
    });
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [rackets]);

  const filteredAndSorted = useMemo(() => {
    return rackets
      .filter((racket) => {
        const passesMetrics = filterDefs.every((def) => {
          if (!def.field) return true;
          const value = parseMetric(racket[def.field]);
          return value !== null && value >= mins[def.key];
        });

        const passesReliabilityRule = showLowReliability ? true : racket.source_count > 2;

        return passesMetrics && passesReliabilityRule && (shape === "all" || racket.shape === shape);
      })
      .sort((a, b) => {
        const aMetric = parseMetric(a[activeSort.field]) ?? -1;
        const bMetric = parseMetric(b[activeSort.field]) ?? -1;
        if (bMetric !== aMetric) return bMetric - aMetric;
        return (b.year ?? -1) - (a.year ?? -1) || a.canonical_name.localeCompare(b.canonical_name);
      });
  }, [activeSort.field, mins, rackets, shape, showLowReliability]);

  const visibleRackets = filteredAndSorted.slice(0, visibleCount);
  const hasMoreResults = filteredAndSorted.length > visibleCount;

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_RESULTS);
  }, [query, sortValue, shape, mins, showLowReliability]);

  useEffect(() => {
    if (!hasMoreResults || !loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) =>
          Math.min(current + LOAD_MORE_BATCH_SIZE, filteredAndSorted.length),
        );
      },
      { rootMargin: "220px 0px" },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMoreResults, filteredAndSorted.length]);

  function toggleCompare(racket: RacketSearchResult) {
    setSelectedCompare((current) => {
      if (current.some((item) => item.id === racket.unified_id)) {
        return current.filter((item) => item.id !== racket.unified_id);
      }
      if (current.length >= MAX_COMPARE) return current;
      return [
        ...current,
        {
          id: racket.unified_id,
          canonical_name: racket.canonical_name,
          brand_name: racket.brand_name,
          image_url: racket.image_url,
        },
      ];
    });
  }

  function resetFilters() {
    setShape("all");
    setMins({
      overall: 0,
      power: 0,
      control: 0,
      maneuverability: 0,
      sweet_spot: 0,
    });
    setShowLowReliability(false);
  }

  function scrollRecommended(direction: "previous" | "next") {
    recommendedRef.current?.scrollBy({
      left: direction === "next" ? 360 : -360,
      behavior: "smooth",
    });
  }

  function clearQuery() {
    const params = new URLSearchParams();
    if (sortValue) params.set("sort", sortValue);

    const search = params.toString();
    router.push(search ? `/?${search}` : "/", { scroll: false });

    window.setTimeout(() => {
      document.getElementById("racket-results-summary")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  const compareHref = selectedIds.length > 0 ? `/compare?ids=${selectedIds.join(",")}` : "/compare";
  const activeFiltersCount =
    (shape === "all" ? 0 : 1) +
    filterDefs.reduce((count, def) => {
      const defaultValue = 0;
      return count + (mins[def.key] !== defaultValue ? 1 : 0);
    }, 0) +
    (showLowReliability ? 1 : 0);

  function renderFilterControls() {
    return (
      <>
      <div className="grid gap-2">
        <label className="text-sm font-bold">Shape</label>
        <Select value={shape} onValueChange={setShape}>
          <SelectTrigger className="h-10 w-full rounded-lg bg-card">
            <SelectValue placeholder="Select shape" />
          </SelectTrigger>
          <SelectContent>
            {shapeOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option === "all" ? "All shapes" : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filterDefs.map((def) => (
        <div key={def.key} className="grid gap-2">
          <div className="flex items-center justify-between text-sm">
            <label className="font-bold">{def.label}</label>
            <span className="font-mono text-xs text-muted-foreground">{mins[def.key].toFixed(1)}</span>
          </div>
          <Slider
            min={def.min}
            max={def.max}
            step={def.step}
            value={[mins[def.key]]}
            onValueChange={(value) =>
              setMins((previous) => ({ ...previous, [def.key]: value[0] ?? previous[def.key] }))
            }
          />
        </div>
      ))}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
        <label htmlFor="low-reliability" className="text-sm font-bold">
          Low reliability
        </label>
        <Switch
          id="low-reliability"
          checked={showLowReliability}
          onCheckedChange={setShowLowReliability}
          aria-label="Toggle low reliability rackets"
        />
      </div>
      </>
    );
  }

  return (
    <section id="racket-results" className="ps-container pb-36 pt-7">
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="surface-card hidden h-fit rounded-xl p-5 lg:sticky lg:top-24 lg:block">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-primary" strokeWidth={1.9} />
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Filters</h2>
            </div>
            <button type="button" onClick={resetFilters} className="text-xs font-semibold text-primary">
              Clear all
            </button>
          </div>

          <div className="mt-5 grid gap-5">
            {renderFilterControls()}
          </div>

          <Button variant="outline" className="mt-6 h-11 w-full rounded-lg gap-2">
            Show more filters
            <ChevronDown className="size-4" />
          </Button>
        </aside>

        <div>
          <div id="racket-results-summary" className="mb-5 flex scroll-mt-28 flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-foreground">
                {filteredAndSorted.length} rackets loaded
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ranked by verified data and community comparison signals.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {query ? (
                <button
                  type="button"
                  onClick={clearQuery}
                  className="inline-flex h-10 max-w-[260px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary"
                  aria-label={`Clear search query ${query}`}
                >
                  <span className="truncate">{query}</span>
                  <X className="size-4 shrink-0" strokeWidth={2} />
                </button>
              ) : null}
              <div className="hidden rounded-lg border border-border bg-card p-1 md:flex">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSortValue(option.value)}
                    className={cn(
                      "h-8 rounded-md px-3 text-sm font-bold transition",
                      sortValue === option.value
                        ? "bg-secondary text-primary shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-pressed={sortValue === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="md:hidden">
                <Select value={sortValue} onValueChange={setSortValue}>
                  <SelectTrigger className="h-10 w-[210px] rounded-lg bg-card">
                    <SelectValue placeholder="Sort by score" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        Sort by {option.label.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 rounded-lg px-3 lg:hidden"
                onClick={() => setIsFilterSheetOpen(true)}
              >
                <SlidersHorizontal className="size-4" />
                Filters{activeFiltersCount ? ` (${activeFiltersCount})` : ""}
              </Button>
              <div className="flex rounded-lg border border-border bg-card p-1">
                <Button type="button" variant={viewMode === "cards" ? "secondary" : "ghost"} size="icon-sm" className="rounded-md" onClick={() => setViewMode("cards")}>
                  <LayoutGrid className="size-4" />
                </Button>
                <Button type="button" variant={viewMode === "list" ? "secondary" : "ghost"} size="icon-sm" className="rounded-md" onClick={() => setViewMode("list")}>
                  <List className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          {filteredAndSorted.length > 0 ? (
            <div className={cn(viewMode === "cards" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "grid gap-3")}>
              {visibleRackets.map((racket) => {
                const isSelected = selectedIds.includes(racket.unified_id);

                return (
                  <article
                    key={racket.unified_id}
                    className={cn(
                      "surface-card group relative cursor-pointer rounded-xl p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/50",
                      isSelected && "border-primary/60",
                      viewMode === "list" && "grid gap-4 md:grid-cols-[120px_1fr_auto]",
                    )}
                    onClick={() => toggleCompare(racket)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      toggleCompare(racket);
                    }}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleCompare(racket);
                      }}
                      className={cn(
                        "absolute left-4 top-4 z-10 flex size-6 items-center justify-center rounded-full border bg-card transition",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent hover:text-primary",
                      )}
                      aria-label={isSelected ? "Remove from comparison" : "Add to comparison"}
                    >
                      <Check className="size-4" strokeWidth={2.4} />
                    </button>

                    <div className={cn("block", viewMode === "list" && "self-center")}>
                      <div className={cn("flex h-44 items-center justify-center rounded-lg bg-muted/70 p-4", viewMode === "list" && "h-28")}>
                        {racket.image_url ? (
                          <img src={racket.image_url} alt={racket.canonical_name} className="max-h-full w-full object-contain transition duration-300 group-hover:scale-105" />
                        ) : (
                          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Image</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-extrabold uppercase tracking-wide text-foreground">{racket.brand_name}</p>
                          <p className="mt-1 block text-lg font-extrabold leading-5 tracking-tight group-hover:text-primary">
                            {racket.canonical_name}
                          </p>
                        </div>
                        {racket.year ? <Badge variant="outline" className="rounded-md">{racket.year}</Badge> : null}
                      </div>

                      <div className="mt-3 flex items-end justify-between gap-2">
                        <div>
                          <Badge className="rounded-md bg-secondary text-primary">Reliability</Badge>
                          <p className="mt-1 font-mono text-sm font-bold text-primary">{reliabilityText(racket.reliability_score)}/5</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-4xl font-bold leading-none text-primary">{overallScoreText(racket.overall_rating_avg)}</p>
                          <p className="text-[10px] font-semibold text-muted-foreground">Overall score</p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs">
                        {[
                          ["Power", racket.power_avg],
                          ["Control", racket.control_avg],
                          ["Maneuverability", racket.maneuverability_avg],
                          ["Sweet spot", racket.sweet_spot_avg],
                        ].map(([label, value]) => (
                          <div key={`${racket.unified_id}-${label}`} className="grid grid-cols-[92px_1fr_28px] items-center gap-2">
                            <span className="text-muted-foreground">{label}</span>
                            <div className="metric-bar">
                              <span style={{ width: animateMetrics ? metricWidth(value) : "0%" }} />
                            </div>
                            <span className="font-mono text-foreground">{scoreText(value)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button asChild variant="outline" className="h-9 rounded-lg">
                          <Link href={`/rackets/${racket.unified_id}`} onClick={(event) => event.stopPropagation()}>Details</Link>
                        </Button>
                        <Button
                          type="button"
                          className="h-9 gap-1 rounded-lg bg-accent text-xs font-bold text-accent-foreground hover:bg-accent/85"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleCompare(racket);
                          }}
                          disabled={!isSelected && selectedIds.length >= MAX_COMPARE}
                        >
                          <Scale className="size-4" />
                          {isSelected ? "Selected" : "Add"}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="surface-card rounded-xl p-10 text-center">
              <p className="font-bold">No rackets match the current filters.</p>
              <p className="mt-2 text-sm text-muted-foreground">Clear filters or search a broader model name.</p>
            </div>
          )}

          <div ref={loadMoreRef} className="mt-6 h-8" />

          <div className="surface-card mt-5 rounded-xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-extrabold">Recommended picks</h2>
                <p className="text-sm text-muted-foreground">The rackets most often compared from this filtered set.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon-sm" className="rounded-lg" onClick={() => scrollRecommended("previous")}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button type="button" variant="outline" size="icon-sm" className="rounded-lg" onClick={() => scrollRecommended("next")}>
                  <ChevronRight className="size-4" />
                </Button>
                <Link href="/" className="text-sm font-bold text-primary">View all</Link>
              </div>
            </div>
            <div
              ref={recommendedRef}
              className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {filteredAndSorted.slice(0, 5).map((racket) => (
                <Link key={`pick-${racket.unified_id}`} href={`/rackets/${racket.unified_id}`} className="grid min-w-[300px] snap-start grid-cols-[70px_1fr_auto] items-center gap-3 rounded-lg border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:border-primary/40 md:min-w-[360px]">
                  <div className="flex size-16 items-center justify-center rounded-md bg-muted">
                    {racket.image_url ? <img src={racket.image_url} alt={racket.canonical_name} className="max-h-14 max-w-14 object-contain" /> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{racket.canonical_name}</p>
                    <p className="text-xs text-muted-foreground">{racket.year ?? "Recent"} - {racket.shape ?? "Shape N/A"}</p>
                    <p className="mt-1 text-xs font-bold text-primary">Reliability {reliabilityText(racket.reliability_score)}/5</p>
                  </div>
                  <span className="font-mono text-lg font-bold text-primary">{overallScoreText(racket.overall_rating_avg)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isFilterSheetOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            aria-label="Close filters"
            onClick={() => setIsFilterSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-y-auto rounded-t-2xl border border-border bg-background p-5 shadow-2xl motion-safe:animate-sheet-up">
            <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-primary" strokeWidth={1.9} />
                <h2 className="text-sm font-extrabold uppercase tracking-wide">Filters</h2>
              </div>
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-lg border border-border bg-card"
                onClick={() => setIsFilterSheetOpen(false)}
                aria-label="Close filters"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-5">
              {renderFilterControls()}
            </div>
            <div className="sticky bottom-0 -mx-5 mt-6 grid grid-cols-2 gap-2 border-t border-border bg-background p-5">
              <Button type="button" variant="outline" className="h-11 rounded-lg" onClick={resetFilters}>
                Clear
              </Button>
              <Button type="button" className="h-11 rounded-lg bg-primary font-bold" onClick={() => setIsFilterSheetOpen(false)}>
                Show results
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showCompareBar ? (
      <div
        className={cn(
          "fixed inset-x-4 bottom-4 z-40 mx-auto hidden max-w-7xl rounded-2xl border border-border bg-card/95 p-3 shadow-2xl shadow-primary/15 backdrop-blur-xl md:block",
          isCompareBarClosing ? "motion-safe:animate-compare-bar-out" : "motion-safe:animate-compare-bar-in",
        )}
      >
        <div className="grid gap-3 lg:grid-cols-[180px_1fr_240px] lg:items-center">
          <div>
            <p className="text-sm font-extrabold">Compare ({selectedIds.length})</p>
            <p className="text-xs text-muted-foreground">Up to 2 selected rackets</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {Array.from({ length: MAX_COMPARE }).map((_, index) => {
              const racket = selectedCompare[index];
              return racket ? (
                <div key={racket.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-2 rounded-xl border border-border bg-background p-2">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
                    {racket.image_url ? <img src={racket.image_url} alt={racket.canonical_name} className="max-h-10 max-w-10 object-contain" /> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{racket.brand_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{racket.canonical_name}</p>
                  </div>
                  <button
                    type="button"
                    className="size-7 rounded-full hover:bg-muted"
                    onClick={() => setSelectedCompare((current) => current.filter((item) => item.id !== racket.id))}
                    aria-label="Remove from comparison"
                  >
                    <X className="mx-auto size-4" />
                  </button>
                </div>
              ) : (
                <div key={`empty-${index}`} className="flex h-16 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background text-sm font-semibold text-muted-foreground">
                  <Plus className="size-4" />
                  Add racket
                </div>
              );
            })}
          </div>
          <Button asChild className="h-14 rounded-xl bg-accent text-base font-bold text-accent-foreground shadow-lg shadow-accent/20 hover:bg-accent/85">
            <Link href={compareHref}>
              Compare
              <Scale className="size-5" />
            </Link>
          </Button>
        </div>
      </div>
      ) : null}
    </section>
  );
}
