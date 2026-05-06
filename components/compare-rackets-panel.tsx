"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Info,
  Loader2,
  Search,
  Scale,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";

import { RacketRadarChart } from "@/components/racket-radar-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RacketDetail } from "@/lib/db";
import { cn } from "@/lib/utils";

type CompareRacketsPanelProps = {
  initialRackets: RacketDetail[];
};

type SearchSuggestion = {
  unified_id: string;
  canonical_name: string;
  brand_name: string;
  image_url: string | null;
  year: number | null;
  overall_rating_avg: string | null;
  shape: string | null;
  level: string | null;
};

const SLOT_COUNT = 2;

const comparisonMetrics = [
  ["Power", "power_avg"],
  ["Control", "control_avg"],
  ["Maneuverability", "maneuverability_avg"],
  ["Sweet spot", "sweet_spot_avg"],
] as const;

const specRows = [
  ["Weight", "weight_raw"],
  ["Balance", "balance"],
  ["Shape", "shape"],
  ["Surface", "surface"],
  ["Core", "core_material"],
  ["Frame", "frame_material"],
] as const;

function toScore(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metric(value: string | number | null | undefined) {
  const parsed = toScore(value);
  return parsed === null ? "N/A" : parsed.toFixed(1);
}

function percent(value: string | number | null | undefined) {
  const parsed = toScore(value);
  return `${Math.max(0, Math.min(100, (parsed ?? 0) * 10))}%`;
}

function specValue(racket: RacketDetail | null, key: (typeof specRows)[number][1]) {
  if (!racket) return "N/A";
  return racket[key] ?? "N/A";
}

function comparisonTextClass(current: string | number | null | undefined, other: string | number | null | undefined) {
  const currentScore = toScore(current);
  const otherScore = toScore(other);
  if (currentScore === null || otherScore === null || currentScore === otherScore) return "text-foreground";
  return currentScore > otherScore ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

export function CompareRacketsPanel({ initialRackets }: CompareRacketsPanelProps) {
  const router = useRouter();
  const selected = useMemo<Array<RacketDetail | null>>(
    () => Array.from({ length: SLOT_COUNT }, (_, index) => initialRackets[index] ?? null),
    [initialRackets],
  );
  const [queries, setQueries] = useState(["", ""]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[][]>([[], []]);
  const [loadingSlot, setLoadingSlot] = useState<number | null>(null);
  const selectedIds = selected.map((racket) => racket?.unified_id).filter(Boolean) as string[];
  const canCompare = selected.filter(Boolean).length === SLOT_COUNT;

  useEffect(() => {
    const controllers = queries.map((query, index) => {
      const trimmed = query.trim();
      if (trimmed.length < 3) {
        setSuggestions((current) => current.map((items, itemIndex) => (itemIndex === index ? [] : items)));
        return null;
      }

      const controller = new AbortController();
      setLoadingSlot(index);

      const timeout = window.setTimeout(async () => {
        try {
          const response = await fetch(`/api/rackets/search?q=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
          });
          if (!response.ok) return;
          const payload = (await response.json()) as { rackets?: SearchSuggestion[] };
          const usedIds = new Set(selectedIds);
          setSuggestions((current) =>
            current.map((items, itemIndex) =>
              itemIndex === index
                ? (payload.rackets ?? []).filter((racket) => !usedIds.has(racket.unified_id))
                : items,
            ),
          );
        } catch {
          if (!controller.signal.aborted) {
            setSuggestions((current) => current.map((items, itemIndex) => (itemIndex === index ? [] : items)));
          }
        } finally {
          if (!controller.signal.aborted) setLoadingSlot(null);
        }
      }, 180);

      return { controller, timeout };
    });

    return () => {
      controllers.forEach((item) => {
        if (!item) return;
        window.clearTimeout(item.timeout);
        if (!item.controller.signal.aborted) {
          item.controller.abort("compare-search-replaced");
        }
      });
    };
  }, [queries, selectedIds.join(",")]);

  function pushSelection(nextSelected: Array<RacketDetail | SearchSuggestion | null>) {
    const ids = nextSelected.map((racket) => racket?.unified_id).filter(Boolean);
    router.push(ids.length ? `/compare?ids=${ids.join(",")}` : "/compare", { scroll: false });
  }

  function selectRacket(slotIndex: number, racket: SearchSuggestion) {
    const nextSelected: Array<RacketDetail | SearchSuggestion | null> = [...selected];
    nextSelected[slotIndex] = racket as RacketDetail;
    setQueries((current) => current.map((query, index) => (index === slotIndex ? "" : query)));
    setSuggestions((current) => current.map((items, index) => (index === slotIndex ? [] : items)));
    pushSelection(nextSelected);
  }

  function clearSlot(slotIndex: number) {
    const nextSelected: Array<RacketDetail | null> = [...selected];
    nextSelected[slotIndex] = null;
    pushSelection(nextSelected);
  }

  return (
    <main className="min-h-[100dvh] bg-background py-8">
      <div className="ps-container">
        <Button asChild variant="ghost" className="mb-5 gap-2 px-0 text-primary">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to rackets
          </Link>
        </Button>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="surface-card h-fit rounded-2xl p-6 lg:sticky lg:top-24">
            <h1 className="text-3xl font-extrabold tracking-tight">Compare rackets</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Choose two rackets to inspect specs, normalized scores, and source confidence side by side.
            </p>
            <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              <Info className="mb-2 size-4 text-primary" />
              Clean compare URLs start empty. Selected rackets are encoded in the URL.
            </div>
          </aside>

          <section className="surface-card rounded-2xl p-6">
            <div className="grid gap-8 lg:grid-cols-[1fr_420px_1fr]">
              {selected.map((racket, index) => (
                <RacketCompareCard
                  key={`card-${index}-${racket?.unified_id ?? "empty"}`}
                  racket={racket}
                  index={index}
                  counterpart={selected[index === 0 ? 1 : 0]}
                  className={index === 1 ? "lg:order-3" : ""}
                  query={queries[index] ?? ""}
                  suggestions={suggestions[index] ?? []}
                  isLoading={loadingSlot === index}
                  onQueryChange={(value) =>
                    setQueries((current) => current.map((query, itemIndex) => (itemIndex === index ? value : query)))
                  }
                  onSelect={(suggestion) => selectRacket(index, suggestion)}
                  onClear={() => clearSlot(index)}
                />
              ))}

              <div className="lg:order-2">
                <div className="text-center">
                  <h2 className="text-sm font-extrabold uppercase tracking-wide">Performance comparison</h2>
                  <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm">
                    {selected.map((racket, index) => (
                      <span key={`legend-${index}`} className="flex items-center gap-2">
                        <span className={cn("size-3 rounded-full", index === 0 ? "bg-primary" : "bg-accent")} />
                        {racket?.canonical_name ?? `Racket ${index + 1}`}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  {canCompare ? (
                    <RacketRadarChart
                      series={selected.map((racket, index) => ({
                        id: racket?.unified_id ?? `slot-${index}`,
                        label: racket?.canonical_name ?? `Racket ${index + 1}`,
                        color: index === 0 ? "var(--compare-chart-1)" : "var(--compare-chart-2)",
                        values: {
                          power: toScore(racket?.power_avg),
                          control: toScore(racket?.control_avg),
                          maneuverability: toScore(racket?.maneuverability_avg),
                          sweetSpot: toScore(racket?.sweet_spot_avg),
                        },
                      }))}
                    />
                  ) : (
                    <div className="flex h-[340px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center md:h-[400px]">
                      <div>
                        <Scale className="mx-auto size-10 text-primary" strokeWidth={1.7} />
                        <p className="mt-3 font-extrabold">Pick two rackets to unlock the radar chart.</p>
                        <p className="mt-2 text-sm text-muted-foreground">Use the search slots on the left.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
              {specRows.map(([label, key]) => (
                <div key={label} className="grid grid-cols-[1fr_136px_1fr] border-b border-border text-center text-sm last:border-b-0 md:grid-cols-[1fr_160px_1fr]">
                  <div className="p-3">{specValue(selected[0], key)}</div>
                  <div className="border-x border-border bg-muted/55 p-3 font-extrabold uppercase tracking-wide text-primary">{label}</div>
                  <div className="p-3">{specValue(selected[1], key)}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl bg-secondary p-6">
              <h2 className="flex items-center gap-2 text-xl font-extrabold">
                Key insights
                <Sparkles className="size-5 text-accent" />
              </h2>
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                {[
                  { icon: Zap, title: "Power", copy: selected[0] ? `${selected[0].canonical_name} scores ${metric(selected[0].power_avg)} for power.` : "Select racket 1 to inspect power." },
                  { icon: Target, title: "Control", copy: selected[1] ? `${selected[1].canonical_name} scores ${metric(selected[1].control_avg)} for control.` : "Select racket 2 to inspect control." },
                  { icon: Scale, title: "Best fit", copy: canCompare ? "Use the score gaps to match the racket to your preferred playing style." : "Pick two rackets to compare fit and tradeoffs." },
                ].map((item) => (
                  <div key={item.title} className="border-border md:border-r md:pr-5 md:last:border-r-0">
                    <item.icon className="size-8 text-primary" strokeWidth={1.8} />
                    <h3 className="mt-3 font-extrabold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function RacketSearchBox({
  index,
  query,
  suggestions,
  isLoading,
  onQueryChange,
  onSelect,
}: {
  index: number;
  query: string;
  suggestions: SearchSuggestion[];
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (racket: SearchSuggestion) => void;
}) {
  return (
    <div className="relative mt-5 w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search racket name..."
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-3 focus:ring-ring/20"
        />
        {isLoading ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      </div>

      {query.trim().length > 0 && query.trim().length < 3 ? (
        <p className="mt-2 text-xs text-muted-foreground">Type at least 3 characters.</p>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-border bg-background shadow-2xl shadow-primary/10">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.unified_id}
              type="button"
              className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-2 border-b border-border p-2 text-left last:border-b-0 hover:bg-muted"
              onClick={() => onSelect(suggestion)}
            >
              <div className="flex size-10 items-center justify-center rounded-md bg-muted">
                {suggestion.image_url ? <img src={suggestion.image_url} alt={suggestion.canonical_name} className="max-h-8 max-w-8 object-contain" /> : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{suggestion.canonical_name}</p>
                <p className="text-[11px] text-muted-foreground">{suggestion.brand_name}</p>
              </div>
              <span className="font-mono text-sm font-bold text-primary">{metric(suggestion.overall_rating_avg)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RacketCompareCard({
  racket,
  index,
  counterpart,
  className,
  query,
  suggestions,
  isLoading,
  onQueryChange,
  onSelect,
  onClear,
}: {
  racket: RacketDetail | null;
  index: number;
  counterpart: RacketDetail | null;
  className?: string;
  query: string;
  suggestions: SearchSuggestion[];
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (racket: SearchSuggestion) => void;
  onClear: () => void;
}) {
  if (!racket) {
    return (
      <article className={cn("rounded-xl border border-dashed border-border bg-card/70 p-4", className)}>
        <Badge className={cn("rounded-md", index === 0 ? "bg-primary" : "bg-accent text-accent-foreground")}>
          Racket {index + 1}
        </Badge>
        <div className="mt-5 flex min-h-[300px] items-center justify-center rounded-xl bg-muted/50 p-6 text-center">
          <div>
            <Search className="mx-auto size-9 text-primary" strokeWidth={1.7} />
            <p className="mt-3 font-extrabold">Empty slot</p>
            <p className="mt-1 text-sm text-muted-foreground">Search by racket name to fill it.</p>
            <RacketSearchBox
              index={index}
              query={query}
              suggestions={suggestions}
              isLoading={isLoading}
              onQueryChange={onQueryChange}
              onSelect={onSelect}
            />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={className}>
      <div className="flex items-center justify-between gap-3">
        <Badge className={cn("rounded-md", index === 0 ? "bg-primary" : "bg-accent text-accent-foreground")}>
          Racket {index + 1}
        </Badge>
        <div className="flex items-center gap-2">
          <button type="button" className="flex size-7 items-center justify-center rounded-full hover:bg-muted" onClick={onClear} aria-label={`Clear racket ${index + 1}`}>
            <X className="size-4" />
          </button>
          <Link href={`/rackets/${racket.unified_id}`} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            Details
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>
      <div className="mt-5 flex min-h-[300px] items-center justify-center rounded-xl bg-muted/70 p-6">
        {racket.image_url ? <img src={racket.image_url} alt={racket.canonical_name} className="max-h-[280px] w-full object-contain" /> : null}
      </div>
      <h2 className="mt-5 text-2xl font-extrabold leading-tight tracking-tight">{racket.canonical_name}</h2>
      <p className="mt-1 text-lg font-bold text-primary">{metric(racket.overall_rating_avg)}/10</p>
      <div className="mt-5 grid gap-3">
        {comparisonMetrics.map(([label, key]) => (
          <div key={`${racket.unified_id}-${key}`} className="grid gap-1 text-sm">
            <div className="flex justify-between font-bold">
              <span>{label}</span>
              <span className={cn("font-mono", comparisonTextClass(racket[key], counterpart?.[key]))}>{metric(racket[key])}</span>
            </div>
            <div className="metric-bar"><span style={{ width: percent(racket[key]) }} /></div>
          </div>
        ))}
      </div>
    </article>
  );
}
