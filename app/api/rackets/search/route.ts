import { NextResponse } from "next/server";

import { searchRackets } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 3) {
    return NextResponse.json({ rackets: [] });
  }

  const rackets = await searchRackets(query, 8);

  return NextResponse.json({
    rackets: rackets.map((racket) => ({
      unified_id: racket.unified_id,
      canonical_name: racket.canonical_name,
      brand_name: racket.brand_name,
      image_url: racket.image_url,
      year: racket.year,
      overall_rating_avg: racket.overall_rating_avg,
      shape: racket.shape,
      level: racket.level,
    })),
  });
}
