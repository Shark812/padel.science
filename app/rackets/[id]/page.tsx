import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  Heart,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Zap,
} from "lucide-react";

import { RacketRadarChart } from "@/components/racket-radar-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatScore, getRacketDetail, searchRackets, toScore } from "@/lib/db";

type RacketPageProps = {
  params: Promise<{ id: string }>;
};

const details = [
  ["Shape", "shape"],
  ["Balance", "balance"],
  ["Weight", "weight_raw"],
  ["Surface", "surface"],
  ["Core material", "core_material"],
  ["Face material", "face_material"],
  ["Frame material", "frame_material"],
  ["Player level", "level"],
  ["Feeling", "feel"],
] as const;

function normalized(value: number | null) {
  return value === null ? 0 : Math.max(0, Math.min(100, value * 10));
}

function metricText(value: number | null) {
  return value === null ? "N/A" : value.toFixed(1);
}

function reliabilityText(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return Math.round(value).toString();
}

export default async function RacketPage({ params }: RacketPageProps) {
  const { id } = await params;
  const racket = await getRacketDetail(id);

  if (!racket) notFound();

  const stats = [
    { label: "Power", value: toScore(racket.power_avg), icon: Zap },
    { label: "Control", value: toScore(racket.control_avg), icon: Target },
    { label: "Maneuverability", value: toScore(racket.maneuverability_avg), icon: ArrowRight },
    { label: "Sweet spot", value: toScore(racket.sweet_spot_avg), icon: Sparkles },
  ];
  const profileStats = [
    ...stats,
    { label: "Comfort", value: toScore(racket.comfort_avg), icon: CheckCircle2 },
  ];
  const overall = toScore(racket.overall_rating_avg);
  const moreFromBrand = (await searchRackets(racket.brand_name))
    .filter((item) => item.unified_id !== racket.unified_id && item.brand_name === racket.brand_name)
    .slice(0, 3);

  return (
    <main className="min-h-[100dvh] bg-background py-6">
      <div className="ps-container">
        <nav className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="font-semibold text-primary hover:underline">Home</Link>
          <span>/</span>
          <Link href="/" className="font-semibold text-primary hover:underline">Rackets</Link>
          <span>/</span>
          <span className="truncate">{racket.canonical_name}</span>
        </nav>

        <section className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="surface-card rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between">
              {racket.year ? <Badge className="rounded-lg bg-secondary text-primary">{racket.year}</Badge> : <span />}
              <button type="button" className="flex size-11 items-center justify-center rounded-full border border-border bg-card transition hover:border-primary/40" aria-label="Zoom image">
                <Search className="size-5" strokeWidth={1.9} />
              </button>
            </div>
            <div className="flex min-h-[430px] items-center justify-center rounded-xl bg-muted/60 p-8">
              {racket.image_url ? (
                <img src={racket.image_url} alt={racket.canonical_name} className="max-h-[420px] w-full object-contain drop-shadow-2xl" />
              ) : (
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Image not available</span>
              )}
            </div>
          </div>

          <div className="surface-card rounded-2xl p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-extrabold uppercase tracking-wide text-foreground">{racket.brand_name}</p>
                <h1 className="mt-1 max-w-2xl text-balance font-heading text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
                  {racket.canonical_name}
                </h1>
              </div>
              <button type="button" className="flex size-12 items-center justify-center rounded-full border border-border bg-card transition hover:border-primary/40" aria-label="Save racket">
                <Heart className="size-5" strokeWidth={1.9} />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {racket.year ? <Badge variant="secondary" className="rounded-md">{racket.year}</Badge> : null}
              {racket.shape ? <Badge variant="outline" className="rounded-md">{racket.shape}</Badge> : null}
              {racket.level ? <Badge className="rounded-md bg-secondary text-primary">{racket.level}</Badge> : null}
            </div>

            <div className="mt-7 grid gap-5 md:grid-cols-[220px_1fr] md:items-center">
              <div>
                <div className="flex items-end gap-2">
                  <span className="font-mono text-7xl font-bold leading-none text-primary">{metricText(overall)}</span>
                  <span className="pb-3 text-2xl text-muted-foreground">/10</span>
                </div>
                <p className="mt-1 text-lg text-foreground">Overall score</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-base font-bold">Reliability</p>
                <div className="mt-2 flex items-end gap-1">
                  <span className="font-mono text-4xl font-bold text-primary">{reliabilityText(racket.reliability_score)}</span>
                  <span className="pb-1 text-muted-foreground">/5</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">High confidence</p>
              </div>
            </div>

            <p className="mt-6 max-w-3xl text-base leading-7 text-foreground/82">
              The {racket.canonical_name} is profiled from unified public sources and normalized
              across the core padel metrics. It is best suited to players who want a clear view of
              performance tradeoffs before comparing other rackets.
            </p>

            <div className="mt-7 grid gap-3 md:grid-cols-2">
              <Button asChild className="h-14 gap-2 rounded-xl bg-primary text-base font-bold shadow-lg shadow-primary/20">
                <Link href={`/compare?ids=${racket.unified_id}`}>
                  <UserRound className="size-5" />
                  Add to Compare
                </Link>
              </Button>
              <Button variant="outline" className="h-14 gap-2 rounded-xl text-base font-bold">
                <Bookmark className="size-5" />
                Save
              </Button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
                  <stat.icon className="size-6 text-primary" strokeWidth={1.8} />
                  <p className="mt-2 text-xs font-bold">{stat.label}</p>
                  <p className="font-mono text-2xl font-bold text-primary">
                    {metricText(stat.value)}<span className="text-sm text-muted-foreground">/10</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.18fr_0.82fr]">
          <div className="surface-card rounded-2xl p-6">
            <h2 className="text-2xl font-extrabold tracking-tight">Performance profile</h2>
            <div className="mt-4 grid gap-6 md:grid-cols-[1fr_0.9fr]">
              <RacketRadarChart values={{
                power: stats[0].value,
                control: stats[1].value,
                maneuverability: stats[2].value,
                sweetSpot: stats[3].value,
              }} />
              <div className="grid content-center gap-5">
                {profileStats.map((stat) => (
                  <div key={`bar-${stat.label}`} className="grid gap-2">
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>{stat.label}</span>
                      <span className="font-mono">{metricText(stat.value)}</span>
                    </div>
                    <Progress value={normalized(stat.value)} className="h-2" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="surface-card rounded-2xl p-6">
            <h2 className="text-2xl font-extrabold tracking-tight">Technical specifications</h2>
            <dl className="mt-5 grid overflow-hidden rounded-xl border border-border bg-card">
              {details.map(([label, key]) => {
                const value = racket[key];
                if (!value) return null;
                return (
                  <div key={key} className="grid grid-cols-[140px_1fr] border-b border-border p-3 text-sm last:border-b-0">
                    <dt className="font-semibold text-muted-foreground">{label}</dt>
                    <dd className="font-medium text-foreground">{value}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <div className="surface-card rounded-2xl p-6">
            <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
              <Sparkles className="size-5 text-primary" />
              At a glance
            </h2>
            <div className="mt-5 grid gap-4">
              {[
                `${racket.shape ?? "Balanced"} shape with ${racket.balance ?? "documented"} balance characteristics.`,
                `${metricText(stats[0].value)} power score and ${metricText(stats[1].value)} control score for fast comparison.`,
                `${racket.source_count} source${racket.source_count === 1 ? "" : "s"} contribute to this unified profile.`,
                `${racket.level ?? "Competitive"} player level based on source metadata.`,
              ].map((item) => (
                <p key={item} className="flex gap-3 text-sm leading-6">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  {item}
                </p>
              ))}
            </div>
          </div>

          <div className="surface-card rounded-2xl p-6">
            <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
              <ShieldCheck className="size-5 text-primary" />
              Source confidence
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Unified from official brand data and independent catalog sources.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {racket.source_rows.map((source) => (
                <a key={source.source_portal} href={source.source_url} target="_blank" rel="noreferrer" className="rounded-xl border border-border bg-card p-3 transition hover:border-primary/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold">{source.source_portal}</p>
                    <ExternalLink className="size-4 text-muted-foreground" />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{source.source_name ?? racket.canonical_name}</p>
                </a>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-4">
              <Progress value={racket.reliability_score * 20} className="h-2" />
              <span className="font-mono font-bold text-primary">{reliabilityText(racket.reliability_score)}/5</span>
            </div>
          </div>
        </section>

        <section className="mt-5 surface-card rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-tight">More from {racket.brand_name}</h2>
            <Link href="/" className="text-sm font-bold text-primary">View all</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {moreFromBrand.map((item) => (
              <Link key={item.unified_id} href={`/rackets/${item.unified_id}`} className="grid grid-cols-[88px_1fr] gap-4 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40">
                <div className="flex h-28 items-center justify-center rounded-lg bg-muted">
                  {item.image_url ? <img src={item.image_url} alt={item.canonical_name} className="max-h-24 max-w-20 object-contain" /> : null}
                </div>
                <div>
                  <p className="font-bold">{item.canonical_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.shape ?? "Shape N/A"} - {item.level ?? "Level N/A"}</p>
                  <p className="mt-3 font-mono text-2xl font-bold text-primary">{formatScore(item.overall_rating_avg)}<span className="text-sm text-muted-foreground">/10</span></p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <Button asChild variant="ghost" className="mt-6 gap-2 px-0">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to rackets
          </Link>
        </Button>
      </div>
    </main>
  );
}


