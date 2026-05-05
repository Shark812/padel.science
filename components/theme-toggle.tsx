"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        title="Toggle theme"
        aria-label="Toggle theme"
      >
        <Moon className="size-4" strokeWidth={1.8} />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-9"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="size-4" strokeWidth={1.8} /> : <Moon className="size-4" strokeWidth={1.8} />}
    </Button>
  );
}
