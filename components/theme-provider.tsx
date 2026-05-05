"use client";

import * as React from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = "padel-theme";
const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = React.useState<Theme>("light");

  React.useEffect(() => {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      setResolvedTheme(savedTheme);
      return;
    }
    setResolvedTheme("light");
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    window.localStorage.setItem(STORAGE_KEY, resolvedTheme);
  }, [resolvedTheme]);

  const contextValue = React.useMemo<ThemeContextValue>(
    () => ({
      resolvedTheme,
      setTheme: setResolvedTheme,
    }),
    [resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }
  return context;
}
