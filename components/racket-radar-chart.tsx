"use client";

import { RadarChart } from "@mui/x-charts/RadarChart";

type RacketRadarChartProps = {
  values?: {
    power: number | null;
    control: number | null;
    maneuverability: number | null;
    sweetSpot: number | null;
  };
  series?: Array<{
    id: string;
    label: string;
    color: string;
    values: {
      power: number | null;
      control: number | null;
      maneuverability: number | null;
      sweetSpot: number | null;
    };
  }>;
};

const metrics = [
  { name: "Power", min: 3.5, max: 10 },
  { name: "Control", min: 3.5, max: 10 },
  { name: "Maneuverability", min: 3.5, max: 10 },
  { name: "Sweet spot", min: 3.5, max: 10 },
];

export function RacketRadarChart({ values, series }: RacketRadarChartProps) {
  const chartSeries =
    series?.map((item) => ({
      id: item.id,
      label: item.label,
      data: [
        item.values.power ?? 0,
        item.values.control ?? 0,
        item.values.maneuverability ?? 0,
        item.values.sweetSpot ?? 0,
      ],
      fillArea: true,
      color: item.color,
    })) ??
    [
      {
        id: "stats",
        label: "Stats",
        data: [
          values?.power ?? 0,
          values?.control ?? 0,
          values?.maneuverability ?? 0,
          values?.sweetSpot ?? 0,
        ],
        fillArea: true,
        color: "var(--primary)",
      },
    ];

  return (
    <div className="h-[340px] w-full rounded-xl bg-muted/30 p-2 md:h-[400px]">
      <RadarChart
        radar={{
          metrics,
          labelGap: 18,
        }}
        series={chartSeries}
        hideLegend
        margin={{ top: 52, right: 80, bottom: 52, left: 80 }}
        sx={{
          "& .MuiChartsAxis-line, & .MuiChartsGrid-line, & line": {
            stroke: "var(--border) !important",
          },
          "& .MuiChartsText-root, & text, & tspan": {
            fill: "var(--muted-foreground) !important",
            fontFamily: "var(--font-dm-sans)",
            fontSize: 11,
          },
          "& .MuiRadarSeriesPlot-area, & path[fill]": { fillOpacity: 0.18 },
          "& .MuiRadarSeriesPlot-mark": {
            strokeWidth: 2,
            fill: "var(--card)",
            stroke: "var(--primary)",
          },
        }}
      />
    </div>
  );
}
