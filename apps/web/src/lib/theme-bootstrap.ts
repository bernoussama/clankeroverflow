export const THEME_STORAGE_KEY = "theme";
export const THEME_QUERY = "(prefers-color-scheme: dark)";

export const themeBootstrapScript = `(() => {
  try {
    const root = document.documentElement;
    const storedTheme = localStorage.getItem("${THEME_STORAGE_KEY}");
    const theme =
      storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
        ? storedTheme
        : "system";
    const resolvedTheme =
      theme === "system"
        ? matchMedia("${THEME_QUERY}").matches
          ? "dark"
          : "light"
        : theme;

    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  } catch {
  }
})();`;
