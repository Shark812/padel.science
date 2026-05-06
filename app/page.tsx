import { BarChart3, Database, ShieldCheck, Scale } from "lucide-react";

import { HeroRacketShowcase } from "@/components/hero-racket-showcase";
import { HomeSearchForm } from "@/components/home-search-form";
import { SearchResultsPanel } from "@/components/search-results-panel";
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

          <HeroRacketShowcase racket={heroRacket ?? null} />

          <HomeSearchForm query={query} sortValue={activeSortValue} />
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
