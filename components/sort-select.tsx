"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortOption = {
  value: string;
  label: string;
};

type SortSelectProps = {
  query: string;
  value: string;
  options: readonly SortOption[];
};

export function SortSelect({ query, value, options }: SortSelectProps) {
  const router = useRouter();

  const onValueChange = (nextValue: string) => {
    const params = new URLSearchParams();
    if (query) {
      params.set("q", query);
    }
    params.set("sort", nextValue);
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-zinc-600">Sort by</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-[200px] rounded-md border-zinc-200 bg-white">
          <SelectValue placeholder="Select metric" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
