import Link from "next/link";
import { ArrowLeft, Eye, Info, Scale, Sparkles, Target, Zap } from "lucide-react";

import { RacketRadarChart } from "@/components/racket-radar-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRacketDetail, searchRackets, toScore, type RacketDetail } from "@/lib/db";

type ComparePageProps = {
  searchParams: Promise<{ ids?: string }>;
};

const specRows = [
  ["Weight", "weight_raw"],
  ["Balance", "balance"],
  ["Shape", "shape"],
  ["Surface", "surface"],
  ["Core", "core_material"],
  ["Frame", "frame_material"],
  ["Sweet spot", "sweet_spot_avg"],
] as const;

function metric(value: string | number | null | undefined) {
  const parsed = toScore(value);
  return parsed === null ? "n.d." : parsed.toFixed(0);
}

function percent(value: string | number | null | undefined) {
  const parsed = toScore(value);
  return `${Math.max(0, Math.min(100, (parsed ?? 0) * 10))}%`;
}

function specValue(racket: RacketDetail, key: (typeof specRows)[number][1]) {
  if (key === "sweet_spot_avg") return metric(racket.sweet_spot_avg);
  return racket[key] ?? "n.d.";
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const requestedIds = params.ids?.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 2) ?? [];
  const comparisonIds = [...requestedIds];

  if (comparisonIds.length < 2) {
    const fallbackRackets = await searchRackets(null);
    for (const racket of fallbackRackets) {
      if (!comparisonIds.includes(racket.unified_id)) {
        comparisonIds.push(racket.unified_id);
      }
      if (comparisonIds.length === 2) break;
    }
  }

  const rackets = (await Promise.all(comparisonIds.map((id) => getRacketDetail(id)))).filter(Boolean) as RacketDetail[];
  const left = rackets[0];
  const right = rackets[1] ?? rackets[0];

  const comparisonMetrics = [
    ["Power", "power_avg"],
    ["Control", "control_avg"],
    ["Maneuverability", "maneuverability_avg"],
    ["Sweet spot", "sweet_spot_avg"],
  ] as const;

  return (
    <main className="min-h-[100dvh] bg-background py-8">
      <div className="ps-container">
        <Button asChild variant="ghost" className="mb-5 gap-2 px-0 text-primary">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to rackets
          </Link>
        </Button>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="surface-card h-fit rounded-2xl p-6 lg:sticky lg:top-24">
            <h1 className="text-3xl font-extrabold tracking-tight">Compare rackets</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Select two rackets to inspect specs, normalized scores, and
              source confidence side by side.
            </p>
            <div className="mt-7 grid gap-4">
              {rackets.map((racket, index) => (
                <Link
                  key={racket.unified_id}
                  href={`/rackets/${racket.unified_id}`}
                  className="grid grid-cols-[48px_1fr] gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
                >
                  <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
                    {racket.image_url ? <img src={racket.image_url} alt={racket.canonical_name} className="max-h-10 max-w-10 object-contain" /> : null}
                  </div>
                  <div>
                    <Badge className={`rounded-md ${index === 0 ? "bg-primary" : "bg-accent text-accent-foreground"}`}>Racket {index + 1}</Badge>
                    <p className="mt-1 text-sm font-bold">{racket.canonical_name}</p>
                  </div>
                </Link>
              ))}
            </div>
            <Button asChild className="mt-7 h-12 w-full gap-2 rounded-xl bg-accent text-accent-foreground hover:bg-accent/85">
              <Link href="/">
                <Scale className="size-5" />
                Add to compare
              </Link>
            </Button>
            <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              <Info className="mb-2 size-4 text-primary" />
              Compare up to 2 rackets at a time.
            </div>
          </aside>

          <section className="surface-card rounded-2xl p-6">
            {left ? (
              <>
                <div className="grid gap-8 lg:grid-cols-[1fr_420px_1fr]">
                  {[left, right].map((racket, index) => (
                    <article key={`${racket.unified_id}-${index}`} className={index === 1 ? "lg:order-3" : ""}>
                      <Badge className={`rounded-md ${index === 0 ? "bg-primary" : "bg-accent text-accent-foreground"}`}>Racket {index + 1}</Badge>
                      <div className="mt-5 flex min-h-[300px] items-center justify-center rounded-xl bg-muted/70 p-6">
                        {racket.image_url ? <img src={racket.image_url} alt={racket.canonical_name} className="max-h-[280px] w-full object-contain" /> : null}
                      </div>
                      <h2 className="mt-5 text-2xl font-extrabold leading-tight tracking-tight">{racket.canonical_name}</h2>
                      <p className="mt-1 text-lg font-bold text-primary">{metric(racket.overall_rating_avg)}/100</p>
                      <div className="mt-5 grid gap-3">
                        {comparisonMetrics.map(([label, key]) => (
                          <div key={`${racket.unified_id}-${key}`} className="grid gap-1 text-sm">
                            <div className="flex justify-between font-bold">
                              <span>{label}</span>
                              <span className="font-mono">{metric(racket[key])}</span>
                            </div>
                            <div className="metric-bar"><span style={{ width: percent(racket[key]) }} /></div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}

                  <div className="lg:order-2">
                    <div className="text-center">
                      <h2 className="text-sm font-extrabold uppercase tracking-wide">Performance comparison</h2>
                      <div className="mt-3 flex justify-center gap-4 text-sm">
                        <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-primary" />{left.canonical_name}</span>
                        <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-accent" />{right.canonical_name}</span>
                      </div>
                    </div>
                    <div className="mt-4">
                      <RacketRadarChart
                        series={[
                          {
                            id: left.unified_id,
                            label: left.canonical_name,
                            color: "var(--primary)",
                            values: {
                              power: toScore(left.power_avg),
                              control: toScore(left.control_avg),
                              maneuverability: toScore(left.maneuverability_avg),
                              sweetSpot: toScore(left.sweet_spot_avg),
                            },
                          },
                          {
                            id: right.unified_id,
                            label: right.canonical_name,
                            color: "var(--accent)",
                            values: {
                              power: toScore(right.power_avg),
                              control: toScore(right.control_avg),
                              maneuverability: toScore(right.maneuverability_avg),
                              sweetSpot: toScore(right.sweet_spot_avg),
                            },
                          },
                        ]}
                      />
                    </div>
                    <Button variant="outline" className="mx-auto mt-4 flex gap-2 rounded-lg">
                      <Eye className="size-4" />
                      Show values
                    </Button>
                  </div>
                </div>

                <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
                  {specRows.map(([label, key]) => (
                    <div key={label} className="grid grid-cols-[1fr_160px_1fr] border-b border-border text-center last:border-b-0">
                      <div className="p-3">{specValue(left, key)}</div>
                      <div className="border-x border-border bg-muted/55 p-3 font-extrabold uppercase tracking-wide text-primary">{label}</div>
                      <div className="p-3">{specValue(right, key)}</div>
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
                      { icon: Zap, title: "More power", copy: `${left.canonical_name} scores ${metric(left.power_avg)} for power.` },
                      { icon: Target, title: "More control", copy: `${right.canonical_name} scores ${metric(right.control_avg)} for control.` },
                      { icon: Scale, title: "Best fit", copy: "Use the score gaps to match the racket to your preferred playing style." },
                    ].map((item) => (
                      <div key={item.title} className="border-border md:border-r md:pr-5 md:last:border-r-0">
                        <item.icon className="size-8 text-primary" strokeWidth={1.8} />
                        <h3 className="mt-3 font-extrabold">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-24 text-center">
                <h1 className="text-2xl font-extrabold">No rackets to compare</h1>
                <Button asChild className="mt-5 rounded-xl">
                  <Link href="/">Browse rackets</Link>
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
