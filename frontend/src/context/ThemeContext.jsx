import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";

const ThemeContext = createContext({ theme: "light", toggle: () => {}, setTheme: () => {} });

const STORAGE_KEY = "hn-crm-theme";

function applyThemeClass(theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
  } else {
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "dark" || stored === "light") return stored;
    } catch (e) {
      // localStorage may be unavailable (private mode, sandboxed iframe)
      console.warn("ThemeContext: could not read stored theme", e);
    }
    return "light";
  });

  useEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.warn("ThemeContext: could not persist theme", e);
    }
  }, [theme]);

  const setTheme = useCallback((t) => setThemeState(t === "dark" ? "dark" : "light"), []);
  const toggle = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
