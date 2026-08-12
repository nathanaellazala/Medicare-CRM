import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Restore window scroll when returning to a list page (e.g. after opening a
 * lead detail and hitting Back). Stores position in sessionStorage keyed by
 * the current pathname+search, so different filter/sort combinations restore
 * independently.
 *
 * Usage:
 *   const { loading } = ...;
 *   useScrollRestore("leads", !loading);
 */
export function useScrollRestore(namespace, ready) {
  const location = useLocation();
  const key = `scroll:${namespace}:${location.pathname}${location.search}`;
  const restored = useRef(false);

  // Restore once data is ready
  useEffect(() => {
    if (!ready || restored.current) return;
    const saved = sessionStorage.getItem(key);
    if (saved != null) {
      // Wait a tick so the newly rendered rows have their real heights
      requestAnimationFrame(() => {
        window.scrollTo({ top: Number(saved), behavior: "instant" });
        restored.current = true;
      });
    } else {
      restored.current = true;
    }
    // Reset the guard when the key changes (different filters)
    return () => { restored.current = false; };
  }, [ready, key]);

  // Save on unmount + before unload
  useEffect(() => {
    const save = () => sessionStorage.setItem(key, String(window.scrollY));
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("beforeunload", save);
      save();
    };
  }, [key]);
}
