import Link from "next/link";
import { BarChart3, Database, Search, ShieldCheck, Scale } from "lucide-react";

import { SearchResultsPanel } from "@/components/search-results-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StarsBackground } from "@/components/ui/stars-background";
import { getRandomHeroRacket, searchRackets } from "@/lib/db";

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

  const [rackets, randomHeroRacket] = await Promise.all([
    searchRackets(query || null, null),
    getRandomHeroRacket(),
  ]);

  const heroRacket = randomHeroRacket ?? rackets.find((racket) => racket.image_url) ?? rackets[0];
  const heroScore = heroRacket?.overall_rating_avg
    ? Number.parseFloat(heroRacket.overall_rating_avg).toFixed(1)
    : "92";
  const activeSortValue =
    sortOptions.find((option) => option.value === requestedSort)?.value ?? sortOptions[0].value;

  return (
    <main className="min-h-[100dvh] bg-background">
      <section className="hero-shell relative isolate overflow-hidden lg:overflow-visible">
        <div className="absolute inset-0 z-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_34%,transparent),color-mix(in_oklab,var(--background)_82%,transparent)_100%)] dark:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_8%,transparent),color-mix(in_oklab,var(--background)_72%,transparent)_100%)]" />
        <StarsBackground
          pointerEvents={false}
          factor={0.035}
          speed={44}
          className="z-[1] text-primary/60 opacity-90 dark:text-white/70 dark:opacity-80"
        />
        <div className="hero-grid absolute inset-0 z-[2]" />
        <div className="hero-wave hero-wave-primary absolute right-[-6%] top-20 z-[2] hidden h-56 w-[68%] lg:block" />
        <div className="hero-wave hero-wave-accent absolute right-4 top-44 z-[2] hidden h-32 w-[56%] lg:block" />
        <div className="absolute right-0 top-24 z-[2] hidden h-72 w-[48%] bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_68%)] blur-2xl lg:block" />

        <div className="ps-container relative z-10 grid min-h-[505px] items-center gap-10 pb-28 pt-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="z-10">
            <h1 className="max-w-2xl text-balance font-heading text-5xl font-bold leading-[1.02] tracking-tight text-foreground md:text-7xl">
              Find the right padel racket, with <span className="text-accent">clear data.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Discover, evaluate, and compare rackets using objective metrics
              and verified sources.
            </p>
            <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="size-5 text-primary" strokeWidth={1.9} />
              Unified data. Transparent methodology. Better decisions.
            </div>
          </div>

          {heroRacket?.image_url ? (
            <div className="order-3 relative z-0 mx-auto h-56 w-full max-w-sm lg:hidden">
              <div className="absolute inset-x-6 bottom-4 h-20 bg-primary/10 blur-2xl" />
              <div className="absolute right-7 top-20 size-16 rounded-full bg-accent shadow-lg shadow-accent/25 ring-8 ring-accent/15" />
              <div className="absolute bottom-6 left-8 right-20 flex h-20 items-end gap-2 opacity-60">
                {[34, 52, 72, 44, 84, 64, 94].map((height, index) => (
                  <span
                    key={`mobile-bar-${index}`}
                    className="w-4 rounded-t-md bg-primary/18"
                    style={{ height }}
                  />
                ))}
              </div>
              <Link
                href={`/rackets/${heroRacket.unified_id}`}
                aria-label={`Open details for ${heroRacket.canonical_name}`}
                className="absolute left-1/2 top-0 h-60 w-44 -translate-x-1/2 rotate-[12deg]"
              >
                <img
                  src={heroRacket.image_url}
                  alt={heroRacket.canonical_name}
                  className="h-full w-full object-contain"
                />
              </Link>
            </div>
          ) : null}

          <div className="hero-product relative hidden min-h-[360px] lg:block">
            <div className="absolute bottom-6 left-10 right-10 h-28 bg-primary/10 blur-2xl" />
            <div className="absolute bottom-16 left-4 right-24 flex h-32 items-end gap-3 opacity-60">
              {[38, 56, 74, 98, 64, 116, 84, 132, 68, 104, 92, 122].map((height, index) => (
                <span
                  key={`bar-${index}`}
                  className="w-5 rounded-t-md bg-primary/18"
                  style={{ height }}
                />
              ))}
            </div>
            <div className="absolute right-[29%] top-4 h-20 w-20 rounded-full border border-primary/20 bg-card/65 shadow-lg shadow-primary/10 backdrop-blur-md">
              <div className="flex h-full flex-col items-center justify-center">
                <span className="font-mono text-2xl font-bold text-primary">{heroScore}</span>
                <span className="text-[10px] font-semibold text-muted-foreground">score</span>
              </div>
            </div>
            <div className="absolute right-[10%] top-[205px] size-24 rounded-full bg-accent shadow-xl shadow-accent/25 ring-8 ring-accent/15" />
            {heroRacket?.image_url ? (
              <Link
                href={`/rackets/${heroRacket.unified_id}`}
                aria-label={`Open details for ${heroRacket.canonical_name}`}
                className="absolute right-[18%] top-[-8px] h-[430px] w-[310px] rotate-[15deg]"
              >
                <img
                  src={heroRacket.image_url}
                  alt={heroRacket.canonical_name}
                  className="h-full w-full object-contain"
                />
              </Link>
            ) : (
              <>
                <div className="absolute right-20 top-0 h-[340px] w-[190px] rotate-[16deg] rounded-[52%_48%_42%_58%/54%_55%_45%_46%] border-[18px] border-foreground/85 bg-[radial-gradient(circle,var(--foreground)_0_4px,transparent_5px)] bg-[size:26px_26px] opacity-90 shadow-2xl shadow-primary/20" />
                <div className="absolute right-32 top-[254px] h-36 w-9 rotate-[16deg] rounded-b-xl bg-foreground/85" />
              </>
            )}
          </div>

          <form
            action="/"
            className="surface-card order-2 col-span-full mx-auto grid w-full max-w-6xl grid-cols-1 gap-2 rounded-2xl p-2 md:grid-cols-[minmax(0,1fr)_190px] lg:order-none lg:-mb-44"
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
                placeholder="Search by brand, model, or family..."
                className="h-16 border-0 bg-transparent pl-14 text-lg shadow-none focus-visible:ring-0"
              />
            </div>
            <Button type="submit" className="h-16 gap-2 rounded-xl bg-accent px-10 text-base font-bold text-accent-foreground hover:bg-accent/85">
              <Search className="size-5" />
              Search
            </Button>
          </form>
        </div>
      </section>

      <section className="ps-container mt-24 grid gap-3 md:grid-cols-4">
        {[
          { icon: Database, title: "Unified catalog", copy: "Data gathered from official sources and independent tests." },
          { icon: ShieldCheck, title: "Reliable profiles", copy: "Transparent reliability ratings and methodology." },
          { icon: Scale, title: "Fast comparison", copy: "Add up to 2 rackets and compare them side by side." },
          { icon: BarChart3, title: "Clear metrics", copy: "Power, control, sweet spot, and more in one view." },
        ].map((item) => (
          <div key={item.title} className="surface-card grid grid-cols-[48px_1fr] items-center gap-4 rounded-xl p-5">
            <div className="flex size-12 items-center justify-center rounded-lg bg-secondary text-primary">
              <item.icon className="size-7" strokeWidth={1.7} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{item.title}</h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.copy}</p>
            </div>
          </div>
        ))}
      </section>

      <SearchResultsPanel
        query={query}
        rackets={rackets}
        sortOptions={sortOptions}
        initialSortValue={activeSortValue}
      />
    </main>
  );
}
