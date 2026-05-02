import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { RacketRadarChart } from "@/components/racket-radar-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatScore, getRacketDetail, toScore } from "@/lib/db";

type RacketPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const details = [
  ["Shape", "shape"],
  ["Balance", "balance"],
  ["Surface", "surface"],
  ["Level", "level"],
  ["Feeling", "feel"],
  ["Weight", "weight_raw"],
  ["Core", "core_material"],
  ["Face", "face_material"],
  ["Frame", "frame_material"],
] as const;

const RADAR_MIN = 3.5;
const RADAR_MAX = 10;

function toProgress(value: number | null, min = RADAR_MIN, max = RADAR_MAX) {
  if (value === null) {
    return 0;
  }

  const normalized = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, normalized));
}

export default async function RacketPage({ params }: RacketPageProps) {
  const { id } = await params;
  const racket = await getRacketDetail(id);

  if (!racket) {
    notFound();
  }

  const stats = [
    { label: "Power", value: toScore(racket.power_avg) },
    { label: "Control", value: toScore(racket.control_avg) },
    { label: "Maneuverability", value: toScore(racket.maneuverability_avg) },
    { label: "Sweet spot", value: toScore(racket.sweet_spot_avg) },
  ];
  const overall = toScore(racket.overall_rating_avg);

  return (
    <main className="min-h-[100dvh] bg-background px-5 py-6">
      <div className="mx-auto max-w-7xl">
        <Button asChild variant="ghost" className="mb-6 gap-2 px-0">
          <Link href="/">
            <ArrowLeft className="size-4" strokeWidth={1.8} />
            Back to search
          </Link>
        </Button>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-2xl border border-border bg-card p-5 md:p-8">
            <div className="grid gap-8 md:grid-cols-[260px_1fr]">
              <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-muted p-6">
                {racket.image_url ? (
                  <img
                    src={racket.image_url}
                    alt={racket.canonical_name}
                    className="max-h-[260px] w-full object-contain"
                  />
                ) : (
                  <span className="font-mono text-sm uppercase tracking-[0.18em] text-muted-foreground">
                    Image not available
                  </span>
                )}
              </div>

              <div className="flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{racket.brand_name}</Badge>
                    {racket.year ? (
                      <Badge variant="outline">{racket.year}</Badge>
                    ) : null}
                    <Badge variant="secondary">
                      {racket.source_count} sources
                    </Badge>
                  </div>
                  <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                    {racket.canonical_name}
                  </h1>
                </div>

                <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border p-4">
                    <p className="font-mono text-4xl font-semibold tracking-tight text-foreground">
                      {formatScore(racket.overall_rating_avg)}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Overall
                    </p>
                  </div>
                  <div className="rounded-xl border border-border p-4">
                    <p className="font-mono text-4xl font-semibold tracking-tight text-foreground">
                      {racket.reliability_score}/5
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Reliability
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-5 md:p-6">
            <div className="mb-2">
              <h2 className="text-xl font-semibold tracking-tight">
                Stats profile
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The four core metrics selected for every racket detail page.
              </p>
            </div>
            <RacketRadarChart
              values={{
                power: stats[0].value,
                control: stats[1].value,
                maneuverability: stats[2].value,
                sweetSpot: stats[3].value,
              }}
            />
            <div className="mt-2 grid gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="grid gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-muted-foreground">{stat.label}</span>
                    <span className="font-mono text-foreground">
                      {stat.value === null ? "n.d." : stat.value.toFixed(2)}
                    </span>
                  </div>
                  <Progress value={toProgress(stat.value)} />
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Overall
                </span>
                <span className="font-mono text-foreground">
                  {overall === null ? "n.d." : overall.toFixed(2)}
                </span>
              </div>
              <Progress value={overall === null ? 0 : Math.max(0, Math.min(100, overall * 10))} />
            </div>
          </aside>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-[1fr_420px]">
          <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
            <h2 className="text-xl font-semibold tracking-tight">
              Specifications
            </h2>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {details.map(([label, key]) => {
                const value = racket[key];

                return value ? (
                  <div
                    key={key}
                    className="rounded-xl border border-border px-4 py-3"
                  >
                    <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {value}
                    </dd>
                  </div>
                ) : null;
              })}
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
            <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
            <div className="mt-5 grid gap-3">
              {racket.source_rows.map((source) => (
                <a
                  key={source.source_portal}
                  href={source.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 transition hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {source.source_portal}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {source.source_name ?? racket.canonical_name}
                    </p>
                  </div>
                  <ExternalLink
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.8}
                  />
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
