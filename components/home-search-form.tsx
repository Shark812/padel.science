"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { RippleButton } from "@/components/ui/ripple-button";

type HomeSearchFormProps = {
  query: string;
  sortValue: string;
};

export function HomeSearchForm({ query, sortValue }: HomeSearchFormProps) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState(query);

  useEffect(() => {
    setInputValue(query);
  }, [query]);

  function scrollToResults() {
    window.setTimeout(() => {
      document.getElementById("racket-results-summary")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextQuery = inputValue.trim();
    const params = new URLSearchParams();

    if (nextQuery) params.set("q", nextQuery);
    if (sortValue) params.set("sort", sortValue);

    const search = params.toString();
    router.push(search ? `/?${search}` : "/", { scroll: false });

    if (nextQuery) {
      scrollToResults();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="surface-card order-2 col-span-full mx-auto grid w-full max-w-6xl grid-cols-1 gap-2 rounded-2xl p-2 md:grid-cols-[minmax(0,1fr)_190px] lg:order-none lg:-mb-44"
    >
      <label className="sr-only" htmlFor="q">
        Search by name or brand
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.8}
        />
        <Input
          id="q"
          name="q"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Search by brand, model, or family..."
          className="h-16 border-0 bg-transparent pl-14 text-lg shadow-none focus-visible:ring-0"
        />
      </div>
      <RippleButton type="submit" className="h-16 gap-2 rounded-xl bg-accent px-10 text-base font-bold text-accent-foreground hover:bg-accent/85">
        <Search className="size-5" />
        Search
      </RippleButton>
    </form>
  );
}
