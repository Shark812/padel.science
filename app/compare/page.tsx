import { CompareRacketsPanel } from "@/components/compare-rackets-panel";
import { getRacketDetail, type RacketDetail } from "@/lib/db";

type ComparePageProps = {
  searchParams: Promise<{ ids?: string }>;
};

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const requestedIds =
    params.ids
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 2) ?? [];

  const rackets = (await Promise.all(requestedIds.map((id) => getRacketDetail(id)))).filter(
    Boolean,
  ) as RacketDetail[];

  return <CompareRacketsPanel initialRackets={rackets} />;
}
