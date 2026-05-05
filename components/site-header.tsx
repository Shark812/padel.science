"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home", match: "exact" },
  { href: "/methodology", label: "Methodology" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/92 backdrop-blur-xl">
      <div className="ps-container flex h-20 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-3" aria-label="padel.science home">
          <span className="grid size-8 grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "rounded-full",
                  index % 2 === 0 ? "bg-primary" : "bg-accent",
                )}
              />
            ))}
          </span>
          <span className="text-3xl font-extrabold tracking-tight text-primary">
            padel<span className="text-accent">.</span><span className="font-medium text-primary/85">science</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-10 text-sm font-semibold md:flex">
          {navItems.map((item) => {
            const isActive =
              item.match === "exact"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className={cn(
                  "relative py-7 text-foreground/80 transition hover:text-primary",
                  isActive &&
                    "text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:rounded-t-full after:bg-primary",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden h-11 rounded-xl bg-accent px-5 text-sm font-bold text-accent-foreground transition hover:bg-accent/85 md:inline-flex md:items-center"
          >
            Find your racket
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
