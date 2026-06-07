"use client";

import * as React from "react";

type ResolvedTheme = "light" | "dark";
type Theme = ResolvedTheme | "system";

type ThemeProviderProps = {
  attribute?: "class" | `data-${string}`;
  children: React.ReactNode;
  defaultTheme?: Theme;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  storageKey?: string;
  themes?: readonly ResolvedTheme[];
  value?: Partial<Record<ResolvedTheme, string>>;
};

type ThemeContextValue = {
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  systemTheme: ResolvedTheme;
  theme: Theme;
  themes: Theme[];
};

const DEFAULT_THEMES = ["light", "dark"] as const;
const THEME_QUERY = "(prefers-color-scheme: dark)";

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function getSystemTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia(THEME_QUERY).matches ? "dark" : "light";
}

function resolveTheme(theme: Theme, enableSystem: boolean, systemTheme: ResolvedTheme) {
  if (theme === "system") {
    return enableSystem ? systemTheme : "light";
  }

  return theme;
}

function withTransitionsDisabled(disableTransitionOnChange: boolean) {
  if (!disableTransitionOnChange || typeof document === "undefined") {
    return () => {};
  }

  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}",
    ),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    window.setTimeout(() => {
      document.head.removeChild(style);
    }, 1);
  };
}

function applyTheme({
  attribute,
  disableTransitionOnChange,
  resolvedTheme,
  themes,
  value,
}: Pick<ThemeProviderProps, "attribute" | "disableTransitionOnChange" | "themes" | "value"> & {
  resolvedTheme: ResolvedTheme;
}) {
  if (typeof document === "undefined") {
    return;
  }

  const cleanup = withTransitionsDisabled(Boolean(disableTransitionOnChange));
  const root = document.documentElement;
  const themeClasses = themes ?? DEFAULT_THEMES;
  const themeValue = value?.[resolvedTheme] ?? resolvedTheme;

  if (attribute === "class") {
    root.classList.remove(...themeClasses);
    root.classList.add(themeValue);
  } else {
    root.setAttribute(attribute ?? "data-theme", themeValue);
  }

  root.style.colorScheme = resolvedTheme;
  cleanup();
}

function readStoredTheme(storageKey: string, defaultTheme: Theme) {
  if (typeof window === "undefined") {
    return defaultTheme;
  }

  const storedTheme = window.localStorage.getItem(storageKey);

  if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
    return storedTheme;
  }

  return defaultTheme;
}

export function ThemeProvider({
  attribute = "data-theme",
  children,
  defaultTheme = "system",
  disableTransitionOnChange = false,
  enableSystem = true,
  storageKey = "theme",
  themes = DEFAULT_THEMES,
  value,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() =>
    typeof window === "undefined" ? defaultTheme : readStoredTheme(storageKey, defaultTheme),
  );
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme>(() =>
    typeof window === "undefined" ? "light" : getSystemTheme(),
  );

  React.useEffect(() => {
    setThemeState(readStoredTheme(storageKey, defaultTheme));
    setSystemTheme(getSystemTheme());
  }, [defaultTheme, storageKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(THEME_QUERY);

    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const resolvedTheme = resolveTheme(theme, enableSystem, systemTheme);

  React.useEffect(() => {
    applyTheme({
      attribute,
      disableTransitionOnChange,
      resolvedTheme,
      themes,
      value,
    });
  }, [attribute, disableTransitionOnChange, resolvedTheme, themes, value]);

  const setTheme = React.useEffectEvent((nextTheme: Theme) => {
    setThemeState(nextTheme);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, nextTheme);
    }
  });

  return (
    <ThemeContext.Provider
      value={{
        resolvedTheme,
        setTheme,
        systemTheme,
        theme,
        themes: enableSystem ? [...themes, "system"] : [...themes],
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return (
    React.useContext(ThemeContext) ?? {
      resolvedTheme: "light",
      setTheme: () => {},
      systemTheme: "light",
      theme: "system",
      themes: [...DEFAULT_THEMES, "system"],
    }
  );
}
