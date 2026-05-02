"use client";

import { RadarChart } from "@mui/x-charts/RadarChart";

type RacketRadarChartProps = {
  values: {
    power: number | null;
    control: number | null;
    maneuverability: number | null;
    sweetSpot: number | null;
  };
};

const metrics = [
  { name: "Power", min: 3.5, max: 10 },
  { name: "Control", min: 3.5, max: 10 },
  { name: "Maneuverability", min: 3.5, max: 10 },
  { name: "Sweet spot", min: 3.5, max: 10 },
];

export function RacketRadarChart({ values }: RacketRadarChartProps) {
  const data = [
    values.power ?? 0,
    values.control ?? 0,
    values.maneuverability ?? 0,
    values.sweetSpot ?? 0,
  ];

  return (
    <div className="h-[340px] w-full rounded-xl bg-muted/30 p-2 md:h-[400px]">
      <RadarChart
        radar={{
          metrics,
          labelGap: 18,
        }}
        series={[
          {
            id: "stats",
            label: "Stats",
            data,
            fillArea: true,
            color: "var(--primary)",
          },
        ]}
        hideLegend
        margin={{ top: 52, right: 80, bottom: 52, left: 80 }}
        sx={{
          "& .MuiChartsAxis-line, & .MuiChartsGrid-line, & line": {
            stroke: "var(--border) !important",
          },
          "& .MuiChartsText-root, & text, & tspan": {
            fill: "var(--muted-foreground) !important",
            fontFamily: "var(--font-geist-sans)",
            fontSize: 11,
          },
          "& .MuiRadarSeriesPlot-area, & path[fill]": { fillOpacity: 0.24 },
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
