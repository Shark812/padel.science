"use client";

import { useState } from "react";
import Link from "next/link";

type HeroRacket = {
  unified_id: string;
  canonical_name: string;
  image_url: string | null;
  overall_rating_avg: string | null;
};

type HeroRacketShowcaseProps = {
  racket: HeroRacket | null;
};

export function HeroRacketShowcase({ racket }: HeroRacketShowcaseProps) {
  const [heroRacket] = useState(racket);
  const heroScore = heroRacket?.overall_rating_avg
    ? Number.parseFloat(heroRacket.overall_rating_avg).toFixed(1)
    : "92";

  return (
    <>
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
            className="hero-racket-swing absolute left-1/2 top-0 h-60 w-44 -translate-x-1/2 rotate-[12deg] [--hero-racket-rotate:12deg]"
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
        <div className="absolute right-[22%] top-10 z-20 h-20 w-20 rounded-full border border-primary/20 bg-card/65 shadow-lg shadow-primary/10 backdrop-blur-md">
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
            className="hero-racket-swing absolute right-[18%] top-[-8px] h-[430px] w-[310px] rotate-[15deg] [--hero-racket-rotate:15deg]"
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
    </>
  );
}
